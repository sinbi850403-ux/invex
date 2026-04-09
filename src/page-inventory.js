/**
 * page-inventory.js - 재고 현황 페이지
 * 실무 기능: 수동 품목 추가/편집, 안전재고 경고, 검색/필터, 페이지네이션, 엑셀 내보내기
 * **컬럼 표시 설정**: 사용자가 보고 싶은 컬럼만 선택해서 볼 수 있음
 */

import { getState, setState, addItem, updateItem, deleteItem, setSafetyStock } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { generateInventoryPDF } from './pdf-generator.js';

// 페이지당 행 수
const PAGE_SIZE = 20;

// 전체 필드 정의 (순서 유지)
const ALL_FIELDS = [
  { key: 'itemName',   label: '품목명',    numeric: false },
  { key: 'itemCode',   label: '품목코드',  numeric: false },
  { key: 'category',   label: '분류',      numeric: false },
  { key: 'vendor',     label: '거래처',    numeric: false },
  { key: 'quantity',   label: '수량',      numeric: true  },
  { key: 'unit',       label: '단위',      numeric: false },
  { key: 'unitPrice',  label: '매입가(원가)', numeric: true  },
  { key: 'salePrice',  label: '판매가(소가)',  numeric: true  },
  { key: 'supplyValue',label: '공급가액',  numeric: true  },
  { key: 'vat',        label: '부가세',    numeric: true  },
  { key: 'totalPrice', label: '합계금액',  numeric: true  },
  { key: 'warehouse',  label: '창고/위치', numeric: false },
  { key: 'expiryDate', label: '유통기한',  numeric: false },
  { key: 'lotNumber',  label: 'LOT번호',  numeric: false },
  { key: 'note',       label: '비고',      numeric: false },
];

// 간편 참조 맵
const FIELD_LABELS = {};
ALL_FIELDS.forEach(f => { FIELD_LABELS[f.key] = f.label; });

/**
 * 현재 표시할 컬럼 목록 결정
 * 왜 이 로직? → visibleColumns 설정이 있으면 그걸 따르고,
 * 없으면 데이터에 실제 값이 있는 필드만 자동 선택
 */
function getVisibleFields(data) {
  const state = getState();
  const visibleColumns = state.visibleColumns;

  // 데이터에 실제 값이 들어있는 필드 목록
  const hasData = new Set(
    ALL_FIELDS.map(f => f.key).filter(key =>
      data.some(row => row[key] !== '' && row[key] !== undefined && row[key] !== null)
    )
  );

  if (visibleColumns && Array.isArray(visibleColumns)) {
    // [VAT 패치] 기존 설정이 있더라도 새롭게 추가된 공급가액, 부가세는 우선 보이게 보정
    const updatedVisible = [...visibleColumns];
    if (!updatedVisible.includes('supplyValue')) updatedVisible.push('supplyValue');
    if (!updatedVisible.includes('vat')) updatedVisible.push('vat');
    
    // 사용자 설정이 있으면 → 설정에 포함된 것만 (순서는 ALL_FIELDS 순서 유지)
    return ALL_FIELDS.filter(f => updatedVisible.includes(f.key)).map(f => f.key);
  }

  // 설정 없으면 → 데이터가 있는 필드만 자동 선택
  // 여기도 신규 컬럼이 비어있더라도 일단 헤더에 보이도록 강제 포함 (유저 요청)
  return ALL_FIELDS.filter(f => hasData.has(f.key) || f.key === 'supplyValue' || f.key === 'vat').map(f => f.key);
}

/**
 * 재고 현황 페이지 렌더링
 */
export function renderInventoryPage(container, navigateTo) {
  const state = getState();
  const data = state.mappedData || [];
  const safetyStock = state.safetyStock || {};

  if (data.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><span class="title-icon">📦</span> 재고 현황</h1>
          <div class="page-desc">품목의 재고 수량과 금액을 관리합니다.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-item">+ 품목 추가</button>
        </div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📦</div>
          <div class="msg">아직 등록된 품목이 없습니다</div>
          <div class="sub">파일을 업로드하거나, 위의 "품목 추가" 버튼으로 직접 등록하세요.</div>
          <br/>
          <button class="btn btn-outline" id="btn-go-upload">파일 업로드하기</button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    container.querySelector('#btn-add-item')?.addEventListener('click', () => openItemModal(container, navigateTo));
    return;
  }

  // 현재 표시할 필드 목록
  let activeFields = getVisibleFields(data);

  // 데이터에 값이 있는 전체 필드 목록 (컬럼 설정 패널에서 사용)
  const allAvailableFields = ALL_FIELDS.filter(f =>
    data.some(row => row[f.key] !== '' && row[f.key] !== undefined && row[f.key] !== null)
  );

  // 안전재고 이하 항목 카운트
  const warningCount = data.filter(d => {
    const min = safetyStock[d.itemName];
    const qtyStr = typeof d.quantity === 'string' ? d.quantity.replace(/,/g, '') : d.quantity;
    return min !== undefined && (parseFloat(qtyStr) || 0) <= min;
  }).length;
  const beginnerMode = state.beginnerMode !== false;
  const hasTransactions = (state.transactions || []).length > 0;
  const sortOptions = [
    { value: 'default', label: '정렬 없음 (원본 순서)' },
    { value: 'itemName:asc', label: '품목명 오름차순' },
    { value: 'quantity:desc', label: '수량 많은 순' },
    { value: 'quantity:asc', label: '수량 적은 순' },
    { value: 'totalPrice:desc', label: '합계금액 높은 순' },
    { value: 'vendor:asc', label: '거래처 가나다순' },
    { value: '__lowStock:desc', label: '재고 부족 우선' },
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📦</span> 재고 현황</h1>
        <div class="page-desc">${state.fileName ? `📄 ${state.fileName}` : ''} 총 ${data.length}개 품목</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export">📥 엑셀</button>
        <button class="btn btn-outline" id="btn-export-pdf">📄 PDF</button>
        <button class="btn btn-primary" id="btn-add-item">+ 품목 추가</button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 품목</div>
        <div class="stat-value text-accent" id="stat-total">${data.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 수량</div>
        <div class="stat-value text-accent" id="stat-qty">${calcTotalQty(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">합계 공급가액</div>
        <div class="stat-value text-accent" id="stat-supply">${calcTotalSupply(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">합계 부가세</div>
        <div class="stat-value text-accent" id="stat-vat">${calcTotalVat(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 합계금액</div>
        <div class="stat-value text-success" id="stat-price">${calcTotalPrice(data)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">재고 부족 경고</div>
        <div class="stat-value ${warningCount > 0 ? 'text-danger' : ''}" id="stat-warn">
          ${warningCount > 0 ? warningCount + '건' : '없음'}
        </div>
      </div>
    </div>

    ${beginnerMode && !hasTransactions ? `
    <div class="card quick-start-card">
      <div class="quick-start-head">
        <div>
          <div class="quick-start-title">처음 사용자 추천 흐름</div>
          <div class="quick-start-desc">3단계만 따라하면 바로 실무 운영이 가능합니다.</div>
        </div>
        <span class="badge badge-info">초보 모드</span>
      </div>
      <div class="quick-start-steps">
        <div class="quick-start-step is-done">1) 재고 품목 확인 완료</div>
        <div class="quick-start-step">2) 첫 입출고 등록</div>
        <div class="quick-start-step">3) 대시보드에서 현황 확인</div>
      </div>
      <div class="quick-start-actions">
        <button class="btn btn-primary btn-sm" id="btn-quick-inout">첫 입출고 등록</button>
        <button class="btn btn-outline btn-sm" id="btn-quick-guide">사용 가이드</button>
        <button class="btn btn-ghost btn-sm" id="btn-quick-dashboard">대시보드 이동</button>
      </div>
    </div>
    ` : ''}

    <!-- 검색/필터 + 정렬 + 컬럼 설정 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="search-input"
        placeholder="품목명, 코드, 분류로 검색..." />
      <select class="filter-select" id="filter-item-code">
        <option value="">전체 품목코드</option>
        ${getItemCodes(data).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-vendor">
        <option value="">전체 거래처</option>
        ${getVendors(data).map(v => `<option value="${v}">${v}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-category">
        <option value="">전체 분류</option>
        ${getCategories(data).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-warehouse">
        <option value="">전체 창고</option>
        ${getWarehouses(data).map(w => `<option value="${w}">${w}</option>`).join('')}
      </select>
      <select class="filter-select" id="filter-stock">
        <option value="">전체 재고</option>
        <option value="low">⚠️ 부족 항목만</option>
      </select>
      <select class="filter-select" id="sort-preset" title="정렬">
        ${sortOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" id="btn-filter-reset" title="필터 초기화">🔄 초기화</button>
      <div class="col-settings-wrap" style="position:relative;">
        <button class="btn btn-outline btn-sm" id="btn-col-settings" title="표시할 컬럼 선택">
          ⚙️ 표시 항목
        </button>
        <div class="col-settings-panel" id="col-settings-panel">
          <div class="col-settings-header">
            <strong>📋 표시할 항목 선택</strong>
            <button class="col-settings-close" id="col-settings-close">✕</button>
          </div>
          <div class="col-settings-body">
            ${allAvailableFields.map(f => `
              <label class="col-settings-item">
                <input type="checkbox" class="col-check" data-key="${f.key}"
                  ${activeFields.includes(f.key) ? 'checked' : ''} />
                <span>${f.label}</span>
              </label>
            `).join('')}
          </div>
          <div class="col-settings-footer">
            <button class="btn btn-ghost btn-sm" id="col-select-all">전체 선택</button>
            <button class="btn btn-primary btn-sm" id="col-apply">적용</button>
          </div>
        </div>
      </div>
    </div>
    <div class="filter-summary" id="inventory-filter-summary"></div>

    <!-- 데이터 테이블 -->
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none;">
        <table class="data-table" id="inventory-table">
          <thead id="inventory-thead"></thead>
          <tbody id="inventory-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="pagination"></div>
    </div>

    <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
      💡 셀을 더블클릭하면 직접 수정할 수 있습니다. | ⚙️ 표시 항목 버튼으로 보고 싶은 컬럼을 선택하세요.
    </div>
  `;

  // === 상태 변수 ===
  const defaultFilter = { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '' };
  const defaultSort = { key: '', direction: '' };
  const savedViewPrefs = state.inventoryViewPrefs || {};
  let currentFilter = sanitizeInventoryFilter(savedViewPrefs.filter);
  let currentPageNum = 1;
  let currentSort = sanitizeInventorySort(savedViewPrefs.sort);
  let persistTimer = null;

  function sanitizeInventoryFilter(raw) {
    const candidate = raw || {};
    return {
      keyword: typeof candidate.keyword === 'string' ? candidate.keyword : '',
      category: typeof candidate.category === 'string' ? candidate.category : '',
      warehouse: typeof candidate.warehouse === 'string' ? candidate.warehouse : '',
      stock: candidate.stock === 'low' ? 'low' : '',
      itemCode: typeof candidate.itemCode === 'string' ? candidate.itemCode : '',
      vendor: typeof candidate.vendor === 'string' ? candidate.vendor : '',
    };
  }

  function sanitizeInventorySort(raw) {
    const candidate = raw || {};
    const allowedKeys = new Set(['__lowStock', ...ALL_FIELDS.map(field => field.key)]);
    const direction = candidate.direction === 'asc' || candidate.direction === 'desc' ? candidate.direction : '';
    if (!candidate.key || !direction || !allowedKeys.has(candidate.key)) {
      return { ...defaultSort };
    }
    return { key: candidate.key, direction };
  }

  function persistInventoryPrefs({ debounced = false } = {}) {
    const payload = {
      filter: { ...currentFilter },
      sort: { ...currentSort },
    };
    if (debounced) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        setState({ inventoryViewPrefs: payload });
      }, 250);
      return;
    }
    clearTimeout(persistTimer);
    setState({ inventoryViewPrefs: payload });
  }

  // === 정렬 유틸 ===
  function getSortOptionLabel(sort) {
    if (!sort.key || !sort.direction) return '정렬 없음';
    const option = sortOptions.find(opt => opt.value === `${sort.key}:${sort.direction}`);
    if (option) return option.label;
    if (sort.key === '__lowStock') return '재고 부족 우선';
    const label = FIELD_LABELS[sort.key] || sort.key;
    return `${label} ${sort.direction === 'asc' ? '오름차순' : '내림차순'}`;
  }

  function getSortIndicator(key) {
    if (currentSort.key !== key) return '↕';
    return currentSort.direction === 'asc' ? '↑' : '↓';
  }

  function getSortPresetValue(sort) {
    if (!sort.key || !sort.direction) return 'default';
    const value = `${sort.key}:${sort.direction}`;
    const hasPreset = sortOptions.some(option => option.value === value);
    return hasPreset ? value : 'default';
  }

  function parseSortPreset(value) {
    if (!value || value === 'default') return { key: '', direction: '' };
    const [key, direction] = value.split(':');
    if (!key || !direction) return { key: '', direction: '' };
    return { key, direction };
  }

  function getNumericValue(value) {
    if (value === '' || value === null || value === undefined) return null;
    const cleaned = typeof value === 'string' ? value.replace(/,/g, '') : value;
    const num = parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  function isLowStockRow(row) {
    const min = safetyStock[row.itemName];
    const qty = getNumericValue(row.quantity) || 0;
    return min !== undefined && qty <= min;
  }

  function getComparableValue(row, key) {
    if (key === '__lowStock') {
      return isLowStockRow(row) ? 1 : 0;
    }

    const field = ALL_FIELDS.find(f => f.key === key);
    const raw = row[key];
    if (field?.numeric) {
      return getNumericValue(raw);
    }

    if (key === 'expiryDate' && raw) {
      const ts = new Date(raw).getTime();
      return Number.isNaN(ts) ? String(raw).toLowerCase() : ts;
    }

    if (raw === '' || raw === null || raw === undefined) return '';
    return String(raw).toLowerCase();
  }

  function sortRows(rows) {
    if (!currentSort.key || !currentSort.direction) return rows;

    const multiplier = currentSort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getComparableValue(a, currentSort.key);
      const bv = getComparableValue(b, currentSort.key);

      if ((av === null || av === '') && (bv === null || bv === '')) return 0;
      if (av === null || av === '') return 1;
      if (bv === null || bv === '') return -1;

      let compareResult = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        compareResult = av - bv;
      } else {
        compareResult = String(av).localeCompare(String(bv), 'ko-KR', { numeric: true, sensitivity: 'base' });
      }
      return compareResult * multiplier;
    });
  }

  function renderFilterSummary(filteredCount, totalCount) {
    const summaryEl = container.querySelector('#inventory-filter-summary');
    if (!summaryEl) return;

    const chips = [];
    if (currentFilter.keyword) chips.push(`검색: ${currentFilter.keyword}`);
    if (currentFilter.itemCode) chips.push(`품목코드: ${currentFilter.itemCode}`);
    if (currentFilter.vendor) chips.push(`거래처: ${currentFilter.vendor}`);
    if (currentFilter.category) chips.push(`분류: ${currentFilter.category}`);
    if (currentFilter.warehouse) chips.push(`창고: ${currentFilter.warehouse}`);
    if (currentFilter.stock === 'low') chips.push('부족 항목만');
    if (currentSort.key && currentSort.direction) chips.push(`정렬: ${getSortOptionLabel(currentSort)}`);

    const chipsHtml = chips.length > 0
      ? chips.map(text => `<span class="filter-chip">${text}</span>`).join('')
      : '<span class="filter-chip filter-chip-muted">필터 없음</span>';

    summaryEl.innerHTML = `
      <div class="filter-summary-row">
        <div class="filter-summary-count">표시 ${filteredCount}건 / 전체 ${totalCount}건</div>
        <div class="filter-summary-chips">${chipsHtml}</div>
      </div>
    `;
  }

  function attachSortHeaderEvents() {
    container.querySelectorAll('.sortable-header[data-sort-key]').forEach(header => {
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        if (!key) return;

        if (currentSort.key !== key) {
          currentSort = { key, direction: 'asc' };
        } else if (currentSort.direction === 'asc') {
          currentSort = { key, direction: 'desc' };
        } else {
          currentSort = { key: '', direction: '' };
        }

        const sortSelect = container.querySelector('#sort-preset');
        if (sortSelect) sortSelect.value = getSortPresetValue(currentSort);

        persistInventoryPrefs();
        currentPageNum = 1;
        renderTableHeader();
        renderTable();
      });
    });
  }

  // === 테이블 헤더 렌더링 (컬럼 변경 시 재호출) ===
  function renderTableHeader() {
    const thead = container.querySelector('#inventory-thead');
    thead.innerHTML = `
      <tr>
        <th class="col-num">#</th>
        ${activeFields.map(key => `
          <th
            class="sortable-header ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''} ${currentSort.key === key ? 'is-active' : ''}"
            data-sort-key="${key}"
            title="클릭하여 정렬"
          >
            <span>${FIELD_LABELS[key]}</span>
            <span class="sort-indicator">${getSortIndicator(key)}</span>
          </th>
        `).join('')}
        <th class="text-center" style="width:70px;">안전재고</th>
        <th class="col-actions">관리</th>
      </tr>
    `;
    attachSortHeaderEvents();
  }

  // === 필터링 ===
  function getFilteredData() {
    return data.filter(row => {
      const kw = currentFilter.keyword.toLowerCase();
      if (kw && !(
        (row.itemName || '').toLowerCase().includes(kw) ||
        (row.itemCode || '').toLowerCase().includes(kw) ||
        (row.category || '').toLowerCase().includes(kw)
      )) return false;

      if (currentFilter.category && row.category !== currentFilter.category) return false;
      if (currentFilter.warehouse && row.warehouse !== currentFilter.warehouse) return false;
      if (currentFilter.itemCode && row.itemCode !== currentFilter.itemCode) return false;
      if (currentFilter.vendor && row.vendor !== currentFilter.vendor) return false;
      if (currentFilter.stock === 'low' && !isLowStockRow(row)) return false;
      return true;
    });
  }

  // === 테이블 바디 렌더링 ===
  function renderTable() {
    const filtered = getFilteredData();
    const sorted = sortRows(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;

    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = sorted.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#inventory-body');
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${activeFields.length + 3}" style="text-align:center; padding:32px; color:var(--text-muted);">
        검색 결과가 없습니다.
      </td></tr>`;
    } else {
      tbody.innerHTML = pageData.map((row, i) => {
        const realIdx = data.indexOf(row);
        const min = safetyStock[row.itemName];
        const qtyStr = typeof row.quantity === 'string' ? row.quantity.replace(/,/g, '') : row.quantity;
        const qty = parseFloat(qtyStr) || 0;
        const isLow = min !== undefined && qty <= min;
        const isDanger = min !== undefined && qty === 0;

        return `
          <tr class="${isDanger ? 'row-danger' : isLow ? 'row-warning' : ''}" data-idx="${realIdx}">
            <td class="col-num">${start + i + 1}</td>
            ${activeFields.map(key => `
              <td class="editable-cell ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''}"
                  data-field="${key}" data-idx="${realIdx}">
                ${formatCell(key, row[key])}
                ${key === 'quantity' && isLow ? ' <span class="badge badge-danger" style="font-size:10px;">부족</span>' : ''}
              </td>
            `).join('')}
            <td class="text-center">
              <button class="btn-icon btn-safety" data-name="${row.itemName}" data-min="${min ?? ''}"
                title="클릭하여 안전재고 수량 설정"
                style="font-size:11px; padding:2px 6px; border-radius:4px;
                  ${min !== undefined ? 'background:rgba(63,185,80,0.15); color:var(--success);' : 'color:var(--text-muted);'}">
                ${min !== undefined ? `🔔 ${min}` : '설정'}
              </button>
            </td>
            <td class="col-actions">
              <button class="btn-icon btn-edit" data-idx="${realIdx}" title="편집">✏️</button>
              <button class="btn-icon btn-icon-danger btn-del" data-idx="${realIdx}" title="삭제">🗑️</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    renderFilterSummary(sorted.length, data.length);

    // 페이지네이션
    const paginationEl = container.querySelector('#pagination');
    const pageStart = sorted.length === 0 ? 0 : start + 1;
    paginationEl.innerHTML = `
      <span>${sorted.length}건 중 ${pageStart}~${Math.min(start + PAGE_SIZE, sorted.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="page-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>← 이전</button>
        ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
          let p;
          if (totalPages <= 7) { p = i + 1; }
          else if (currentPageNum <= 4) { p = i + 1; }
          else if (currentPageNum >= totalPages - 3) { p = totalPages - 6 + i; }
          else { p = currentPageNum - 3 + i; }
          return `<button class="page-btn ${p === currentPageNum ? 'active' : ''}" data-p="${p}">${p}</button>`;
        }).join('')}
        <button class="page-btn" id="page-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음 →</button>
      </div>
    `;

    // 이벤트 재연결
    attachTableEvents();
    attachPaginationEvents();
  }

  // === 테이블 이벤트 (인라인 편집, 삭제 등) ===
  function attachTableEvents() {
    // 인라인 편집
    container.querySelectorAll('.editable-cell').forEach(cell => {
      cell.addEventListener('dblclick', () => {
        const idx = parseInt(cell.dataset.idx);
        const field = cell.dataset.field;
        const currentValue = data[idx]?.[field] ?? '';
        if (cell.querySelector('input')) return;

        const input = document.createElement('input');
        input.value = currentValue;
        input.className = 'form-input';
        input.style.cssText = 'padding:4px 6px; font-size:13px;';
        cell.textContent = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        const save = () => {
          const newVal = input.value;
          updateItem(idx, { [field]: newVal });
          // 합계 재계산 (매입단가 또는 판매단가 변경 시)
          if (field === 'quantity' || field === 'unitPrice' || field === 'salePrice') {
            const q = parseFloat(data[idx].quantity) || 0;
            const p = parseFloat(data[idx].unitPrice) || 0;
            const supply = q * p;
            const vat = Math.floor(supply * 0.1);
            updateItem(idx, { 
              supplyValue: supply,
              vat: vat,
              totalPrice: supply + vat 
            });
          }
          renderTable();
          updateStats();
        };
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') renderTable();
        });
      });
    });

    // 삭제
    container.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const name = data[idx]?.itemName || `${idx + 1}번 항목`;
        if (confirm(`"${name}"을(를) 삭제하시겠습니까?`)) {
          deleteItem(idx);
          renderTable();
          updateStats();
          showToast(`"${name}" 항목을 삭제했습니다.`, 'info');
        }
      });
    });

    // 편집 (모달)
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        openItemModal(container, navigateTo, idx);
      });
    });

    // 안전재고 설정
    container.querySelectorAll('.btn-safety').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const currentMin = btn.dataset.min;
        const input = prompt(
          `"${name}"의 안전재고(최소 수량)를 입력하세요.\n비워두면 해제됩니다.`,
          currentMin
        );
        if (input === null) return; // 취소
        if (input.trim() === '') {
          setSafetyStock(name, undefined);
          showToast(`"${name}" 안전재고 해제`, 'info');
        } else {
          const num = parseInt(input);
          if (isNaN(num) || num < 0) {
            showToast('숫자를 입력해 주세요.', 'warning');
            return;
          }
          setSafetyStock(name, num);
          showToast(`"${name}" 안전재고를 ${num}으로 설정했습니다.`, 'success');
        }
        renderTable();
        updateStats();
      });
    });
  }

  // 페이지네이션 이벤트
  function attachPaginationEvents() {
    container.querySelector('#page-prev')?.addEventListener('click', () => {
      if (currentPageNum > 1) { currentPageNum--; renderTable(); }
    });
    container.querySelector('#page-next')?.addEventListener('click', () => {
      currentPageNum++;
      renderTable();
    });
    container.querySelectorAll('.page-btn[data-p]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPageNum = parseInt(btn.dataset.p);
        renderTable();
      });
    });
  }

  // 통계 업데이트
  function updateStats() {
    const d = getState().mappedData || [];
    const ss = getState().safetyStock || {};
    container.querySelector('#stat-total').textContent = d.length;
    container.querySelector('#stat-qty').textContent = calcTotalQty(d);
    const supplyEl = container.querySelector('#stat-supply');
    if(supplyEl) supplyEl.textContent = calcTotalSupply(d);
    const vatEl = container.querySelector('#stat-vat');
    if(vatEl) vatEl.textContent = calcTotalVat(d);
    container.querySelector('#stat-price').textContent = calcTotalPrice(d);
    const wc = d.filter(r => {
      const min = ss[r.itemName];
      const qtyStr = typeof r.quantity === 'string' ? r.quantity.replace(/,/g, '') : r.quantity;
      return min !== undefined && (parseFloat(qtyStr) || 0) <= min;
    }).length;
    // warningCount 엘리먼트는 위에서 제가 display:none 하거나 아예 뺐는데... (어이쿠 뺐네요)
    // 다시 생각해 보니 재고 부족 경고 카드는 중요합니다.
    const warnEl = container.querySelector('#stat-warn');
    if (warnEl) {
      warnEl.textContent = wc > 0 ? wc + '건' : '없음';
      warnEl.className = `stat-value ${wc > 0 ? 'text-danger' : ''}`;
    }
  }

  // === 컬럼 설정 패널 이벤트 ===

  const colPanel = container.querySelector('#col-settings-panel');
  const colBtn = container.querySelector('#btn-col-settings');

  // 패널 열기/닫기
  colBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    colPanel.classList.toggle('open');
  });

  container.querySelector('#col-settings-close').addEventListener('click', () => {
    colPanel.classList.remove('open');
  });

  // 패널 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    if (!colPanel.contains(e.target) && e.target !== colBtn) {
      colPanel.classList.remove('open');
    }
  });

  // 전체 선택 버튼
  container.querySelector('#col-select-all').addEventListener('click', () => {
    container.querySelectorAll('.col-check').forEach(cb => { cb.checked = true; });
  });

  // 적용 버튼 — 선택한 컬럼을 저장하고 테이블 새로 그리기
  container.querySelector('#col-apply').addEventListener('click', () => {
    const checked = [];
    container.querySelectorAll('.col-check:checked').forEach(cb => {
      checked.push(cb.dataset.key);
    });

    if (checked.length === 0) {
      showToast('최소 1개 이상의 항목을 선택해 주세요.', 'warning');
      return;
    }

    // 전체 선택이면 null로 저장 (기본값 = 자동)
    const allKeys = allAvailableFields.map(f => f.key);
    const isAll = checked.length === allKeys.length && allKeys.every(k => checked.includes(k));

    setState({ visibleColumns: isAll ? null : checked });
    activeFields = checked;

    // 테이블 헤더+바디 다시 그리기
    renderTableHeader();
    renderTable();
    colPanel.classList.remove('open');
    showToast(`${checked.length}개 항목 표시`, 'success');
  });

  // 초심자 빠른 액션
  container.querySelector('#btn-quick-inout')?.addEventListener('click', () => navigateTo('inout'));
  container.querySelector('#btn-quick-guide')?.addEventListener('click', () => navigateTo('guide'));
  container.querySelector('#btn-quick-dashboard')?.addEventListener('click', () => navigateTo('home'));

  // === 검색/필터/정렬 이벤트 ===
  container.querySelector('#search-input').addEventListener('input', (e) => {
    currentFilter.keyword = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs({ debounced: true });
  });
  container.querySelector('#filter-item-code').addEventListener('change', (e) => {
    currentFilter.itemCode = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-vendor').addEventListener('change', (e) => {
    currentFilter.vendor = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-category').addEventListener('change', (e) => {
    currentFilter.category = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-warehouse').addEventListener('change', (e) => {
    currentFilter.warehouse = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#filter-stock').addEventListener('change', (e) => {
    currentFilter.stock = e.target.value;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
  });
  container.querySelector('#sort-preset').addEventListener('change', (e) => {
    currentSort = sanitizeInventorySort(parseSortPreset(e.target.value));
    currentPageNum = 1;
    renderTableHeader();
    renderTable();
    persistInventoryPrefs();
  });

  // 필터/정렬 초기화 버튼
  container.querySelector('#btn-filter-reset').addEventListener('click', () => {
    currentFilter = { ...defaultFilter };
    currentSort = { ...defaultSort };
    container.querySelector('#search-input').value = '';
    container.querySelector('#filter-item-code').value = '';
    container.querySelector('#filter-vendor').value = '';
    container.querySelector('#filter-category').value = '';
    container.querySelector('#filter-warehouse').value = '';
    container.querySelector('#filter-stock').value = '';
    container.querySelector('#sort-preset').value = 'default';
    currentPageNum = 1;
    renderTableHeader();
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs();
    showToast('필터와 정렬을 초기화했습니다.', 'info');
  });

  // 필터 활성 상태 시각적 표시
  function highlightActiveFilters() {
    const filterIds = ['filter-item-code', 'filter-vendor', 'filter-category', 'filter-warehouse', 'filter-stock', 'sort-preset'];
    filterIds.forEach(id => {
      const el = container.querySelector(`#${id}`);
      const isSort = id === 'sort-preset';
      const active = isSort ? (el && el.value && el.value !== 'default') : (el && el.value);
      if (active) {
        el.classList.add('filter-active');
      } else if (el) {
        el.classList.remove('filter-active');
      }
    });
    const searchEl = container.querySelector('#search-input');
    if (searchEl) searchEl.classList.toggle('filter-active', !!currentFilter.keyword);
  }

  // 엑셀 내보내기 — 현재 표시 중인 컬럼만 내보내기
  container.querySelector('#btn-export').addEventListener('click', () => {
    try {
      const exportData = data.map(row => {
        const obj = {};
        activeFields.forEach(key => { obj[FIELD_LABELS[key]] = row[key]; });
        return obj;
      });
      const baseName = (state.fileName || '재고현황').replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_재고현황`);
      showToast('엑셀 파일을 다운로드했습니다.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // PDF 내보내기
  container.querySelector('#btn-export-pdf')?.addEventListener('click', () => {
    generateInventoryPDF(data);
  });

  // 품목 추가 버튼
  container.querySelector('#btn-add-item').addEventListener('click', () => {
    openItemModal(container, navigateTo);
  });

  // === 초기 렌더링 ===
  container.querySelector('#search-input').value = currentFilter.keyword;
  container.querySelector('#filter-item-code').value = currentFilter.itemCode;
  container.querySelector('#filter-vendor').value = currentFilter.vendor;
  container.querySelector('#filter-category').value = currentFilter.category;
  container.querySelector('#filter-warehouse').value = currentFilter.warehouse;
  container.querySelector('#filter-stock').value = currentFilter.stock;
  container.querySelector('#sort-preset').value = getSortPresetValue(currentSort);
  renderTableHeader();
  renderTable();
  highlightActiveFilters();
}

// === 품목 추가/편집 모달 ===

function openItemModal(container, navigateTo, editIdx = null) {
  const state = getState();
  const isEdit = editIdx !== null;
  const item = isEdit ? (state.mappedData[editIdx] || {}) : {};

  // 모달 HTML
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? '품목 수정' : '새 품목 추가'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">품목명 <span class="required">*</span></label>
            <input class="form-input" id="f-itemName" value="${item.itemName || ''}" placeholder="예: A4용지" />
          </div>
          <div class="form-group">
            <label class="form-label">품목코드</label>
            <input class="form-input" id="f-itemCode" value="${item.itemCode || ''}" placeholder="예: P-001" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">분류</label>
            <input class="form-input" id="f-category" value="${item.category || ''}" placeholder="예: 사무용품" />
          </div>
          <div class="form-group">
            <label class="form-label">거래처</label>
            <input class="form-input" id="f-vendor" value="${item.vendor || ''}" placeholder="예: (\uc8fc)한국상사" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">수량 <span class="required">*</span></label>
            <input class="form-input" type="number" id="f-quantity" value="${item.quantity ?? ''}" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">단위</label>
            <input class="form-input" id="f-unit" value="${item.unit || ''}" placeholder="EA, KG, M ..." />
          </div>
          <div class="form-group">
            <label class="form-label">매입가(원가)</label>
            <input class="form-input" type="number" id="f-unitPrice" value="${item.unitPrice ?? ''}" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">판매단가 <span style="font-size:11px;color:var(--text-muted);">(소가)</span></label>
            <input class="form-input" type="number" id="f-salePrice" value="${item.salePrice ?? ''}" placeholder="판매 시 가격" />
          </div>
          <div class="form-group" style="display:flex;align-items:flex-end;">
            <div style="font-size:11px;color:var(--text-muted);padding-bottom:8px;">💡 판매단가를 입력하면 정확한 이익률을 계산할 수 있습니다.</div>
          </div>
        </div>
        <div class="form-row" style="background:var(--bg-hover); padding:10px; border-radius:6px; margin-bottom:12px;">
          <div class="form-group">
            <label class="form-label" style="font-size:12px;">공급가액</label>
            <input class="form-input" type="number" id="f-supplyValue" value="${item.supplyValue ?? ''}" disabled style="background:#eef1f5;" />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:12px;">부가세</label>
            <input class="form-input" type="number" id="f-vat" value="${item.vat ?? ''}" disabled style="background:#eef1f5;" />
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:12px;">합계금액</label>
            <input class="form-input" type="number" id="f-totalPrice" value="${item.totalPrice ?? ''}" disabled style="background:#eef1f5;" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">창고/위치</label>
            <input class="form-input" id="f-warehouse" value="${item.warehouse || ''}" placeholder="예: 본사 1층" />
          </div>
          <div class="form-group">
            <label class="form-label">비고</label>
            <input class="form-input" id="f-note" value="${item.note || ''}" placeholder="메모" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn btn-primary" id="modal-save">${isEdit ? '수정' : '추가'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 닫기
  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // 실시간 계산
  const qtyInput = overlay.querySelector('#f-quantity');
  const priceInput = overlay.querySelector('#f-unitPrice');
  const calcTotals = () => {
    const q = parseFloat(qtyInput.value) || 0;
    const p = parseFloat(priceInput.value) || 0;
    const supply = q * p;
    const vat = Math.floor(supply * 0.1);
    overlay.querySelector('#f-supplyValue').value = supply;
    overlay.querySelector('#f-vat').value = vat;
    overlay.querySelector('#f-totalPrice').value = supply + vat;
  };
  qtyInput.addEventListener('input', calcTotals);
  priceInput.addEventListener('input', calcTotals);

  // 저장
  overlay.querySelector('#modal-save').addEventListener('click', () => {
    const name = overlay.querySelector('#f-itemName').value.trim();
    const qty = overlay.querySelector('#f-quantity').value;

    if (!name) {
      showToast('품목명은 필수입니다.', 'warning');
      overlay.querySelector('#f-itemName').focus();
      return;
    }

    const newItem = {
      itemName: name,
      itemCode: overlay.querySelector('#f-itemCode').value.trim(),
      category: overlay.querySelector('#f-category').value.trim(),
      vendor: overlay.querySelector('#f-vendor').value.trim(),
      quantity: qty === '' ? 0 : parseFloat(qty),
      unit: overlay.querySelector('#f-unit').value.trim(),
      unitPrice: parseFloat(overlay.querySelector('#f-unitPrice').value) || 0,
      salePrice: parseFloat(overlay.querySelector('#f-salePrice').value) || 0,
      warehouse: overlay.querySelector('#f-warehouse').value.trim(),
      note: overlay.querySelector('#f-note').value.trim(),
    };
    // 합계 자동 계산 (매입가 기준)
    newItem.supplyValue = newItem.quantity * newItem.unitPrice;
    newItem.vat = Math.floor(newItem.supplyValue * 0.1);
    newItem.totalPrice = newItem.supplyValue + newItem.vat;

    if (isEdit) {
      updateItem(editIdx, newItem);
      showToast(`"${name}" 항목을 수정했습니다.`, 'success');
    } else {
      addItem(newItem);
      showToast(`"${name}" 항목을 추가했습니다.`, 'success');
    }

    close();
    // 페이지 새로 그리기
    renderInventoryPage(container, navigateTo);
  });

  // 첫 입력란에 포커스
  setTimeout(() => overlay.querySelector('#f-itemName').focus(), 100);
}

// === 유틸 ===

function formatCell(key, value) {
  if (value === '' || value === null || value === undefined) return '';
  if (['quantity', 'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice'].includes(key)) {
    const valStr = typeof value === 'string' ? value.replace(/,/g, '') : value;
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      // 왜 Math.round? → 원단위 반올림 (한국 원화는 소수점 없음)
      if (key === 'unitPrice' || key === 'salePrice' || key === 'supplyValue' || key === 'vat' || key === 'totalPrice') {
        return '₩' + Math.round(num).toLocaleString('ko-KR');
      }
      return Math.round(num).toLocaleString('ko-KR');
    }
  }
  return String(value);
}

function calcTotalQty(data) {
  return Math.round(data.reduce((s, r) => {
    const v = typeof r.quantity === 'string' ? r.quantity.replace(/,/g, '') : r.quantity;
    return s + (parseFloat(v) || 0);
  }, 0)).toLocaleString('ko-KR');
}

function calcTotalPrice(data) {
  const total = Math.round(data.reduce((s, r) => {
    const v = typeof r.totalPrice === 'string' ? r.totalPrice.replace(/,/g, '') : r.totalPrice;
    return s + (parseFloat(v) || 0);
  }, 0));
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function calcTotalSupply(data) {
  const total = Math.round(data.reduce((s, r) => {
    const v = typeof r.supplyValue === 'string' ? r.supplyValue.replace(/,/g, '') : r.supplyValue;
    return s + (parseFloat(v) || 0);
  }, 0));
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function calcTotalVat(data) {
  const total = Math.round(data.reduce((s, r) => {
    const v = typeof r.vat === 'string' ? r.vat.replace(/,/g, '') : r.vat;
    return s + (parseFloat(v) || 0);
  }, 0));
  return total > 0 ? '₩' + total.toLocaleString('ko-KR') : '-';
}

function getCategories(data) {
  return [...new Set(data.map(r => r.category).filter(Boolean))].sort();
}

function getWarehouses(data) {
  return [...new Set(data.map(r => r.warehouse).filter(Boolean))].sort();
}

/**
 * 품목코드 목록 추출
 * 왜 별도 함수? → 드롭다운 필터에서 특정 품목코드로 빠르게 조회하기 위함
 */
function getItemCodes(data) {
  return [...new Set(data.map(r => r.itemCode).filter(Boolean))].sort();
}

/**
 * 거래처 목록 추출
 * 왜 별도 함수? → 거래처별 필터로 특정 업체의 품목만 볼 수 있게 하기 위함
 */
function getVendors(data) {
  return [...new Set(data.map(r => r.vendor).filter(Boolean))].sort();
}
