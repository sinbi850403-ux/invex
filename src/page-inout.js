/**
 * page-inout.js - 입출고 관리 페이지
 * 역할: 입고/출고 기록 등록, 이력 조회, 재고 자동 반영
 * 핵심: 입출고를 기록하면 재고 현황의 수량이 자동으로 증감됨
 */

import { getState, setState, addTransaction, deleteTransaction } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel, readExcelFile } from './excel.js';

const PAGE_SIZE = 15;

/**
 * 입출고 관리 페이지 렌더링
 */
export function renderInoutPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const beginnerMode = state.beginnerMode !== false;
  const sortOptions = [
    { value: 'date:desc', label: '최신 일자 순' },
    { value: 'date:asc', label: '오래된 일자 순' },
    { value: 'quantity:desc', label: '수량 많은 순' },
    { value: 'quantity:asc', label: '수량 적은 순' },
    { value: 'itemName:asc', label: '품목명 가나다순' },
    { value: 'vendor:asc', label: '거래처 가나다순' },
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🔄</span> 입출고 관리</h1>
        <div class="page-desc">입고·출고를 등록하면 재고 수량이 자동으로 변경됩니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-tx">📥 이력 내보내기</button>
        <button class="btn btn-outline" id="btn-bulk-upload">📄 엑셀 일괄 등록</button>
        <button class="btn btn-success" id="btn-in">📥 입고 등록</button>
        <button class="btn btn-danger" id="btn-out">📤 출고 등록</button>
      </div>
    </div>

    <!-- 오늘 통계 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 기록</div>
        <div class="stat-value text-accent">${transactions.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 입고</div>
        <div class="stat-value text-success">${countToday(transactions, 'in')}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">오늘 출고</div>
        <div class="stat-value text-danger">${countToday(transactions, 'out')}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">등록 품목 수</div>
        <div class="stat-value">${items.length}</div>
      </div>
    </div>

    ${beginnerMode && (items.length === 0 || transactions.length === 0) ? `
      <div class="card quick-start-card">
        <div class="quick-start-head">
          <div>
            <div class="quick-start-title">입출고 빠른 시작</div>
            <div class="quick-start-desc">처음이라면 아래 순서로 진행해 주세요.</div>
          </div>
          <span class="badge badge-warning">가이드</span>
        </div>
        <div class="quick-start-steps">
          <div class="quick-start-step ${items.length > 0 ? 'is-done' : ''}">
            1) 재고 품목 등록 (${items.length > 0 ? '완료' : '필요'})
          </div>
          <div class="quick-start-step ${transactions.length > 0 ? 'is-done' : ''}">
            2) 첫 입고/출고 기록 (${transactions.length > 0 ? '완료' : '필요'})
          </div>
          <div class="quick-start-step">3) 요약 보고에서 흐름 확인</div>
        </div>
        <div class="quick-start-actions">
          ${items.length === 0 ? '<button class="btn btn-primary btn-sm" id="btn-quick-item">품목 먼저 등록</button>' : ''}
          ${items.length > 0 ? '<button class="btn btn-primary btn-sm" id="btn-quick-first-tx">첫 입출고 등록</button>' : ''}
          <button class="btn btn-outline btn-sm" id="btn-quick-guide">사용 가이드</button>
          <button class="btn btn-ghost btn-sm" id="btn-quick-summary">요약 보고 이동</button>
        </div>
      </div>
    ` : ''}

    <!-- 필터 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="tx-search" placeholder="품목명, 코드로 검색..." />
      <select class="filter-select" id="tx-type-filter">
        <option value="">전체</option>
        <option value="in">📥 입고만</option>
        <option value="out">📤 출고만</option>
      </select>
      <select class="filter-select" id="tx-vendor-filter">
        <option value="">전체 거래처</option>
        ${getVendorOptions(transactions, items).map(v => `<option value="${v}">${v}</option>`).join('')}
      </select>
      <select class="filter-select" id="tx-code-filter">
        <option value="">전체 품목코드</option>
        ${getCodeList(items).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <input type="date" class="filter-select" id="tx-date-filter" style="padding:7px 10px;" />
      <select class="filter-select" id="tx-sort-filter">
        ${sortOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" id="tx-filter-reset" title="필터 초기화">🔄 초기화</button>
    </div>
    <div class="filter-summary" id="tx-filter-summary"></div>

    <!-- 이력 테이블 -->
    <div class="card card-flush">
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead id="tx-head"></thead>
          <tbody id="tx-body"></tbody>
        </table>
      </div>
      <div class="pagination" id="tx-pagination"></div>
    </div>

    ${items.length === 0 ? `
      <div class="alert alert-warning" style="margin-top:12px;">
        ⚠️ 등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
      </div>
    ` : ''}
  `;

  let currentPageNum = 1;
  const defaultFilter = { keyword: '', type: '', date: '', vendor: '', itemCode: '' };
  const defaultSort = { key: 'date', direction: 'desc' };
  const savedViewPrefs = state.inoutViewPrefs || {};
  let filter = sanitizeInoutFilter(savedViewPrefs.filter);
  let sort = sanitizeInoutSort(savedViewPrefs.sort);
  let persistTimer = null;

  function sanitizeInoutFilter(raw) {
    const candidate = raw || {};
    return {
      keyword: typeof candidate.keyword === 'string' ? candidate.keyword : '',
      type: candidate.type === 'in' || candidate.type === 'out' ? candidate.type : '',
      date: typeof candidate.date === 'string' ? candidate.date : '',
      vendor: typeof candidate.vendor === 'string' ? candidate.vendor : '',
      itemCode: typeof candidate.itemCode === 'string' ? candidate.itemCode : '',
    };
  }

  function sanitizeInoutSort(raw) {
    const candidate = raw || {};
    const allowedKeys = new Set(['date', 'quantity', 'itemName', 'vendor', 'type', 'unitPrice']);
    const direction = candidate.direction === 'asc' || candidate.direction === 'desc' ? candidate.direction : '';
    if (!candidate.key || !direction || !allowedKeys.has(candidate.key)) {
      return { ...defaultSort };
    }
    return { key: candidate.key, direction };
  }

  function persistInoutPrefs({ debounced = false } = {}) {
    const payload = {
      filter: { ...filter },
      sort: { ...sort },
    };
    if (debounced) {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        setState({ inoutViewPrefs: payload });
      }, 250);
      return;
    }
    clearTimeout(persistTimer);
    setState({ inoutViewPrefs: payload });
  }

  function parseSortPreset(value) {
    const [key, direction] = String(value || '').split(':');
    if (!key || !direction) return { ...defaultSort };
    return { key, direction };
  }

  function getSortPresetValue(currentSort) {
    const value = `${currentSort.key}:${currentSort.direction}`;
    const hasPreset = sortOptions.some(option => option.value === value);
    return hasPreset ? value : 'date:desc';
  }

  function getSortIndicator(key) {
    if (sort.key !== key) return '↕';
    return sort.direction === 'asc' ? '↑' : '↓';
  }

  function getSortOptionLabel(currentSort) {
    const value = `${currentSort.key}:${currentSort.direction}`;
    const matched = sortOptions.find(option => option.value === value);
    if (matched) return matched.label;
    return '정렬 없음';
  }

  function getComparableTxValue(tx, key) {
    const raw = tx[key];
    if (key === 'date') {
      const source = tx.date || tx.createdAt;
      if (!source) return 0;
      const ts = new Date(source).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    }
    if (key === 'quantity' || key === 'unitPrice') {
      const num = parseFloat(raw);
      return Number.isNaN(num) ? 0 : num;
    }
    if (!raw) return '';
    return String(raw).toLowerCase();
  }

  function sortTxRows(rows) {
    const multiplier = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getComparableTxValue(a, sort.key);
      const bv = getComparableTxValue(b, sort.key);

      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * multiplier;
      }
      return String(av).localeCompare(String(bv), 'ko-KR', { numeric: true, sensitivity: 'base' }) * multiplier;
    });
  }

  function renderTxHeader() {
    const thead = container.querySelector('#tx-head');
    thead.innerHTML = `
      <tr>
        <th class="col-num">#</th>
        <th class="sortable-header ${sort.key === 'type' ? 'is-active' : ''}" data-sort-key="type" title="클릭하여 정렬" aria-sort="${sort.key === 'type' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">구분</span><span class="sort-indicator">${getSortIndicator('type')}</span>
          </button>
        </th>
        <th class="sortable-header ${sort.key === 'vendor' ? 'is-active' : ''}" data-sort-key="vendor" title="클릭하여 정렬" aria-sort="${sort.key === 'vendor' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">거래처</span><span class="sort-indicator">${getSortIndicator('vendor')}</span>
          </button>
        </th>
        <th class="sortable-header ${sort.key === 'itemName' ? 'is-active' : ''}" data-sort-key="itemName" title="클릭하여 정렬" aria-sort="${sort.key === 'itemName' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">품목명</span><span class="sort-indicator">${getSortIndicator('itemName')}</span>
          </button>
        </th>
        <th>품목코드</th>
        <th class="sortable-header text-right ${sort.key === 'quantity' ? 'is-active' : ''}" data-sort-key="quantity" title="클릭하여 정렬" aria-sort="${sort.key === 'quantity' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">수량</span><span class="sort-indicator">${getSortIndicator('quantity')}</span>
          </button>
        </th>
        <th class="sortable-header text-right ${sort.key === 'unitPrice' ? 'is-active' : ''}" data-sort-key="unitPrice" title="클릭하여 정렬" aria-sort="${sort.key === 'unitPrice' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">단가</span><span class="sort-indicator">${getSortIndicator('unitPrice')}</span>
          </button>
        </th>
        <th class="sortable-header ${sort.key === 'date' ? 'is-active' : ''}" data-sort-key="date" title="클릭하여 정렬" aria-sort="${sort.key === 'date' ? (sort.direction === 'asc' ? 'ascending' : sort.direction === 'desc' ? 'descending' : 'none') : 'none'}">
          <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
            <span class="sort-label">일자</span><span class="sort-indicator">${getSortIndicator('date')}</span>
          </button>
        </th>
        <th>비고</th>
        <th style="width:50px;">삭제</th>
      </tr>
    `;

    container.querySelectorAll('.sortable-header[data-sort-key]').forEach(header => {
      header.setAttribute('tabindex', '0');
      header.setAttribute('role', 'button');
      header.addEventListener('click', () => {
        const key = header.dataset.sortKey;
        if (!key) return;
        if (sort.key !== key) {
          sort = { key, direction: 'asc' };
        } else if (sort.direction === 'asc') {
          sort = { key, direction: 'desc' };
        } else {
          sort = { ...defaultSort };
        }
        container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
        persistInoutPrefs();
        currentPageNum = 1;
        renderTxHeader();
        renderTxTable();
      });

      header.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        header.click();
      });
    });
  }

  function getFilteredTx() {
    return transactions.filter(tx => {
      const kw = filter.keyword.toLowerCase();
      if (kw && !(
        (tx.itemName || '').toLowerCase().includes(kw) ||
        (tx.itemCode || '').toLowerCase().includes(kw)
      )) return false;
      if (filter.type && tx.type !== filter.type) return false;
      if (filter.date && tx.date !== filter.date) return false;
      // 거래처 필터: 트랜잭션에 직접 기록된 거래처로 필터링
      // 왜 직접 필터? → 기존에는 품목 기준 간접 비교였지만,
      //   같은 품목을 여러 거래처에서 입고할 수 있으므로 트랜잭션 기준이 정확
      if (filter.vendor && tx.vendor !== filter.vendor) return false;
      // 품목코드 필터
      if (filter.itemCode && tx.itemCode !== filter.itemCode) return false;
      return true;
    });
  }

  function renderFilterSummary(filteredCount) {
    const summaryEl = container.querySelector('#tx-filter-summary');
    if (!summaryEl) return;

    const chips = [];
    if (filter.keyword) chips.push(`검색: ${filter.keyword}`);
    if (filter.type) chips.push(`구분: ${filter.type === 'in' ? '입고' : '출고'}`);
    if (filter.vendor) chips.push(`거래처: ${filter.vendor}`);
    if (filter.itemCode) chips.push(`품목코드: ${filter.itemCode}`);
    if (filter.date) chips.push(`일자: ${filter.date}`);
    chips.push(`정렬: ${getSortOptionLabel(sort)}`);

    summaryEl.innerHTML = `
      <div class="filter-summary-row">
        <div class="filter-summary-count">표시 ${filteredCount}건 / 전체 ${transactions.length}건</div>
        <div class="filter-summary-chips">
          ${chips.map(text => `<span class="filter-chip">${text}</span>`).join('')}
        </div>
      </div>
    `;
  }

  function highlightActiveFilters() {
    const selectIds = ['tx-type-filter', 'tx-vendor-filter', 'tx-code-filter', 'tx-date-filter', 'tx-sort-filter'];
    selectIds.forEach(id => {
      const el = container.querySelector(`#${id}`);
      if (!el) return;
      const active = id === 'tx-sort-filter' ? (el.value && el.value !== 'date:desc') : !!el.value;
      el.classList.toggle('filter-active', active);
    });
    const searchEl = container.querySelector('#tx-search');
    if (searchEl) searchEl.classList.toggle('filter-active', !!filter.keyword);
  }

  function renderTxTable() {
    const filtered = getFilteredTx();
    const sorted = sortTxRows(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;
    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = sorted.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#tx-body');
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:32px; color:var(--text-muted);">
        ${transactions.length === 0 ? '아직 입출고 기록이 없습니다. 위의 버튼으로 등록하세요.' : '검색 결과가 없습니다.'}
      </td></tr>`;
    } else {
      tbody.innerHTML = pageData.map((tx, i) => `
        <tr>
          <td class="col-num">${start + i + 1}</td>
          <td>
            <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">
              ${tx.type === 'in' ? '📥 입고' : '📤 출고'}
            </span>
          </td>
          <td style="font-size:12px;">${tx.vendor || '<span style="color:var(--text-muted)">-</span>'}</td>
          <td><strong>${tx.itemName || '-'}</strong></td>
          <td style="color:var(--text-muted);">${tx.itemCode || '-'}</td>
          <td class="text-right">
            <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">
              ${tx.type === 'in' ? '+' : '-'}${parseFloat(tx.quantity || 0).toLocaleString('ko-KR')}
            </span>
          </td>
          <td class="text-right">${tx.unitPrice ? '₩' + Math.round(parseFloat(tx.unitPrice)).toLocaleString('ko-KR') : '-'}</td>
          <td>${tx.date || '-'}</td>
          <td style="color:var(--text-muted); font-size:13px;">${tx.note || ''}</td>
          <td class="text-center">
            <button class="btn-icon btn-icon-danger btn-del-tx" data-id="${tx.id}" title="삭제">🗑️</button>
          </td>
        </tr>
      `).join('');
    }

    renderFilterSummary(sorted.length);

    // 페이지네이션
    const pagEl = container.querySelector('#tx-pagination');
    const pageStart = sorted.length === 0 ? 0 : start + 1;
    pagEl.innerHTML = `
      <span>${sorted.length}건 중 ${pageStart}~${Math.min(start + PAGE_SIZE, sorted.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="tx-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>← 이전</button>
        <span style="padding:4px 8px; color:var(--text-muted); font-size:13px;">${currentPageNum} / ${totalPages}</span>
        <button class="page-btn" id="tx-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음 →</button>
      </div>
    `;

    // 삭제 이벤트
    container.querySelectorAll('.btn-del-tx').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('이 기록을 삭제하시겠습니까?\n※ 재고 수량은 자동으로 되돌아가지 않습니다.')) {
          deleteTransaction(btn.dataset.id);
          showToast('기록을 삭제했습니다.', 'info');
          renderInoutPage(container, navigateTo);
        }
      });
    });

    // 페이지네이션 이벤트
    pagEl.querySelector('#tx-prev')?.addEventListener('click', () => { currentPageNum--; renderTxTable(); });
    pagEl.querySelector('#tx-next')?.addEventListener('click', () => { currentPageNum++; renderTxTable(); });
  }

  container.querySelector('#btn-quick-item')?.addEventListener('click', () => navigateTo('inventory'));
  container.querySelector('#btn-quick-first-tx')?.addEventListener('click', () => openTxModal(container, navigateTo, 'in', items));
  container.querySelector('#btn-quick-guide')?.addEventListener('click', () => navigateTo('guide'));
  container.querySelector('#btn-quick-summary')?.addEventListener('click', () => navigateTo('summary'));

  // 필터/정렬 이벤트
  container.querySelector('#tx-search').addEventListener('input', (e) => {
    filter.keyword = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs({ debounced: true });
  });
  container.querySelector('#tx-type-filter').addEventListener('change', (e) => {
    filter.type = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });
  container.querySelector('#tx-vendor-filter').addEventListener('change', (e) => {
    filter.vendor = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });
  container.querySelector('#tx-code-filter').addEventListener('change', (e) => {
    filter.itemCode = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });
  container.querySelector('#tx-date-filter').addEventListener('change', (e) => {
    filter.date = e.target.value;
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });
  container.querySelector('#tx-sort-filter').addEventListener('change', (e) => {
    sort = sanitizeInoutSort(parseSortPreset(e.target.value));
    currentPageNum = 1;
    renderTxHeader();
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
  });

  // 필터/정렬 초기화
  container.querySelector('#tx-filter-reset').addEventListener('click', () => {
    filter = { ...defaultFilter };
    sort = { ...defaultSort };
    container.querySelector('#tx-search').value = '';
    container.querySelector('#tx-type-filter').value = '';
    container.querySelector('#tx-vendor-filter').value = '';
    container.querySelector('#tx-code-filter').value = '';
    container.querySelector('#tx-date-filter').value = '';
    container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
    currentPageNum = 1;
    renderTxHeader();
    renderTxTable();
    highlightActiveFilters();
    persistInoutPrefs();
    showToast('필터와 정렬을 초기화했습니다.', 'info');
  });

  // 입고/출고 등록 버튼
  container.querySelector('#btn-in').addEventListener('click', () => {
    openTxModal(container, navigateTo, 'in', items);
  });
  container.querySelector('#btn-out').addEventListener('click', () => {
    openTxModal(container, navigateTo, 'out', items);
  });

  // 이력 내보내기
  container.querySelector('#btn-export-tx').addEventListener('click', () => {
    if (transactions.length === 0) {
      showToast('내보낼 기록이 없습니다.', 'warning');
      return;
    }
    const exportData = transactions.map(tx => ({
      '구분': tx.type === 'in' ? '입고' : '출고',
      '거래처': tx.vendor || '',
      '품목명': tx.itemName,
      '품목코드': tx.itemCode || '',
      '수량': tx.quantity,
      '단가': tx.unitPrice || '',
      '일자': tx.date,
      '비고': tx.note || '',
      '등록시간': tx.createdAt,
    }));
    downloadExcel(exportData, '입출고_이력');
    showToast('이력을 엑셀로 내보냈습니다.', 'success');
  });

  // 엑셀 일괄 등록
  container.querySelector('#btn-bulk-upload').addEventListener('click', () => {
    openBulkUploadModal(container, navigateTo, items);
  });

  // 초기 렌더링
  container.querySelector('#tx-search').value = filter.keyword;
  container.querySelector('#tx-type-filter').value = filter.type;
  container.querySelector('#tx-vendor-filter').value = filter.vendor;
  container.querySelector('#tx-code-filter').value = filter.itemCode;
  container.querySelector('#tx-date-filter').value = filter.date;
  container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
  renderTxHeader();
  renderTxTable();
  highlightActiveFilters();
}

/**
 * 엑셀 일괄 입출고 업로드 모달
 * 왜 필요? → 건별 등록은 수십 건 이상일 때 비효율적.
 *   엑셀로 한번에 올리면 시간을 크게 절약할 수 있음.
 */
function openBulkUploadModal(container, navigateTo, items) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h3 class="modal-title">📄 엑셀 일괄 입출고 등록</h3>
        <button class="modal-close" id="bulk-close">✕</button>
      </div>
      <div class="modal-body" id="bulk-body">
        <div class="alert alert-info" style="margin-bottom:16px;">
          <strong>사용 방법:</strong><br/>
          ① 아래 '양식 다운로드' 버튼으로 엑셀 양식을 받으세요<br/>
          ② 양식에 입출고 데이터를 작성하세요<br/>
          ③ 작성된 파일을 업로드하면 한번에 등록됩니다
        </div>

        <div style="display:flex; gap:8px; margin-bottom:16px;">
          <button class="btn btn-outline" id="bulk-download-template">📋 양식 다운로드</button>
        </div>

        <div style="border:2px dashed var(--border); border-radius:8px; padding:32px; text-align:center; cursor:pointer; transition:border-color 0.2s;" id="bulk-dropzone">
          <div style="font-size:28px; margin-bottom:8px;">📁</div>
          <div style="font-size:13px; color:var(--text-muted);">엑셀 파일을 여기에 드래그하거나 클릭하세요</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">.xlsx, .xls 파일 지원</div>
          <input type="file" id="bulk-file-input" accept=".xlsx,.xls" style="display:none;" />
        </div>

        <div id="bulk-preview" style="display:none; margin-top:16px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#bulk-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // 양식 다운로드 — 사용자가 작성할 템플릿
  overlay.querySelector('#bulk-download-template').addEventListener('click', () => {
    const template = [
      {
        '구분': '입고',
        '거래처': '(주)삼성전자',
        '품목명': '갤럭시S25',
        '품목코드': 'SM-S925',
        '수량': 100,
        '단가': 1200000,
        '일자': new Date().toISOString().split('T')[0],
        '비고': '1차 입고',
      },
      {
        '구분': '출고',
        '거래처': '쿠팡',
        '품목명': '갤럭시S25',
        '품목코드': 'SM-S925',
        '수량': 30,
        '단가': 1200000,
        '일자': new Date().toISOString().split('T')[0],
        '비고': '쿠팡 출고',
      },
    ];
    downloadExcel(template, '입출고_일괄등록_양식');
    showToast('양식을 다운로드했습니다. 형식에 맞게 작성 후 업로드하세요.', 'success');
  });

  // 파일 업로드 (클릭 + 드래그)
  const dropzone = overlay.querySelector('#bulk-dropzone');
  const fileInput = overlay.querySelector('#bulk-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) processUploadedFile(file, overlay, container, navigateTo, items, close);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processUploadedFile(file, overlay, container, navigateTo, items, close);
  });
}

/**
 * 업로드된 엑셀 파일을 파싱하여 미리보기 + 일괄 등록
 * 왜 미리보기? → 잘못된 데이터가 등록되는 것을 방지
 */
async function processUploadedFile(file, overlay, container, navigateTo, items, closeModal) {
  const previewEl = overlay.querySelector('#bulk-preview');
  previewEl.style.display = 'block';
  previewEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">파일 분석 중...</div>';

  try {
    const { sheets, sheetNames } = await readExcelFile(file);
    const sheetData = sheets[sheetNames[0]]; // 첫 번째 시트 사용

    if (!sheetData || sheetData.length < 2) {
      previewEl.innerHTML = '<div class="alert alert-warning">데이터가 없거나 헤더만 있습니다. 양식을 확인해 주세요.</div>';
      return;
    }

    // 헤더 파싱 — 컬럼 위치 자동 감지
    const headers = sheetData[0].map(h => String(h).trim());
    const colMap = {
      type: headers.findIndex(h => h === '구분'),
      vendor: headers.findIndex(h => h === '거래처'),
      itemName: headers.findIndex(h => h === '품목명'),
      itemCode: headers.findIndex(h => h === '품목코드'),
      quantity: headers.findIndex(h => h === '수량'),
      unitPrice: headers.findIndex(h => h === '단가'),
      date: headers.findIndex(h => h === '일자'),
      note: headers.findIndex(h => h === '비고'),
    };

    // 필수 컬럼 확인
    if (colMap.type === -1 || colMap.itemName === -1 || colMap.quantity === -1) {
      previewEl.innerHTML = '<div class="alert alert-danger">필수 컬럼을 찾을 수 없습니다. 양식에 "구분", "품목명", "수량" 컬럼이 있어야 합니다.</div>';
      return;
    }

    // 데이터 행 파싱
    const rows = [];
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (!row || row.length === 0) continue;

      const typeStr = String(row[colMap.type] || '').trim();
      const type = typeStr === '출고' ? 'out' : 'in';
      const itemName = String(row[colMap.itemName] || '').trim();
      const quantity = parseFloat(row[colMap.quantity]) || 0;

      if (!itemName || quantity <= 0) continue; // 빈 행 건너뜀

      // 기존 품목과 매칭 시도
      const matchedItem = items.find(item =>
        item.itemName === itemName ||
        (colMap.itemCode >= 0 && item.itemCode && item.itemCode === String(row[colMap.itemCode] || '').trim())
      );

      // 일자 처리 — 엑셀 날짜 포맷 호환
      let dateStr = '';
      if (colMap.date >= 0) {
        const rawDate = row[colMap.date];
        if (typeof rawDate === 'number') {
          // 엑셀 시리얼 날짜 → JS 날짜로 변환
          const d = new Date((rawDate - 25569) * 86400 * 1000);
          dateStr = d.toISOString().split('T')[0];
        } else {
          dateStr = String(rawDate || '').trim();
        }
      }
      if (!dateStr) dateStr = new Date().toISOString().split('T')[0];

      rows.push({
        type,
        vendor: colMap.vendor >= 0 ? String(row[colMap.vendor] || '').trim() : '',
        itemName,
        itemCode: colMap.itemCode >= 0 ? String(row[colMap.itemCode] || '').trim() : (matchedItem?.itemCode || ''),
        quantity,
        unitPrice: colMap.unitPrice >= 0 ? (parseFloat(row[colMap.unitPrice]) || 0) : 0,
        date: dateStr,
        note: colMap.note >= 0 ? String(row[colMap.note] || '').trim() : '',
        matched: !!matchedItem, // 기존 품목 매칭 여부
      });
    }

    if (rows.length === 0) {
      previewEl.innerHTML = '<div class="alert alert-warning">유효한 데이터가 없습니다. "구분"은 입고/출고, "수량"은 0 초과여야 합니다.</div>';
      return;
    }

    // 미리보기 테이블
    const inCount = rows.filter(r => r.type === 'in').length;
    const outCount = rows.filter(r => r.type === 'out').length;
    const unmatchedCount = rows.filter(r => !r.matched).length;

    previewEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <strong>📊 분석 결과:</strong>
        <span style="margin-left:8px; color:var(--success);">입고 ${inCount}건</span>
        <span style="margin-left:8px; color:var(--danger);">출고 ${outCount}건</span>
        ${unmatchedCount > 0 ? `<span style="margin-left:8px; color:var(--warning);">⚠️ 미매칭 ${unmatchedCount}건</span>` : ''}
      </div>
      <div class="table-wrapper" style="max-height:250px; overflow-y:auto; margin-bottom:12px;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>구분</th>
              <th>거래처</th>
              <th>품목명</th>
              <th>수량</th>
              <th>단가</th>
              <th>일자</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><span class="${r.type === 'in' ? 'type-in' : 'type-out'}">${r.type === 'in' ? '입고' : '출고'}</span></td>
                <td>${r.vendor || '-'}</td>
                <td>${r.itemName}</td>
                <td class="text-right">${r.quantity.toLocaleString('ko-KR')}</td>
                <td class="text-right">${r.unitPrice ? '₩' + Math.round(r.unitPrice).toLocaleString('ko-KR') : '-'}</td>
                <td>${r.date}</td>
                <td>${r.matched
                  ? '<span style="color:var(--success); font-size:11px;">✅ 매칭</span>'
                  : '<span style="color:var(--warning); font-size:11px;">⚠️ 미매칭</span>'
                }</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${unmatchedCount > 0 ? '<div class="alert alert-warning" style="margin-bottom:12px; font-size:12px;">⚠️ 미매칭 품목은 재고에 등록되어 있지 않아 수량이 반영되지 않습니다. 이력만 기록됩니다.</div>' : ''}
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-outline" id="bulk-cancel">취소</button>
        <button class="btn btn-primary" id="bulk-confirm">✅ ${rows.length}건 일괄 등록</button>
      </div>
    `;

    // 취소
    previewEl.querySelector('#bulk-cancel').addEventListener('click', () => {
      previewEl.style.display = 'none';
    });

    // 일괄 등록 확인
    previewEl.querySelector('#bulk-confirm').addEventListener('click', () => {
      let successCount = 0;
      rows.forEach(row => {
        addTransaction({
          type: row.type,
          vendor: row.vendor,
          itemName: row.itemName,
          itemCode: row.itemCode,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          date: row.date,
          note: row.note,
        });
        successCount++;
      });

      showToast(`✅ ${successCount}건 일괄 등록 완료! (입고 ${inCount}건, 출고 ${outCount}건)`, 'success');
      closeModal();
      renderInoutPage(container, navigateTo);
    });

  } catch (err) {
    previewEl.innerHTML = `<div class="alert alert-danger">파일 처리 중 오류: ${err.message}</div>`;
  }
}

/**
 * 입고/출고 등록 모달
 */
function openTxModal(container, navigateTo, type, items) {
  const today = new Date().toISOString().split('T')[0];
  // 거래처 목록: 입고→매입처, 출고→매출처
  // 왜 구분? → 물건을 사오는 곳(매입처)과 파는 곳(매출처)이 다르므로
  const state = getState();
  const vendors = (state.vendorMaster || []).filter(v => 
    type === 'in' ? v.type === 'supplier' : v.type === 'customer'
  );

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3 class="modal-title">${type === 'in' ? '📥 입고 등록' : '📤 출고 등록'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">${type === 'in' ? '매입처 (어디서 입고?)' : '매출처 (어디에 출고?)'}</label>
          <select class="form-select" id="tx-vendor">
            <option value="">-- 거래처 선택 (선택사항) --</option>
            ${vendors.map(v => `<option value="${v.name}">${v.name}${v.contactName ? ` (${v.contactName})` : ''}</option>`).join('')}
          </select>
          ${vendors.length === 0 ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">💡 거래처 관리에서 ${type === 'in' ? '매입처' : '매출처'}를 먼저 등록하세요.</div>` : ''}
        </div>
        <div class="form-group">
          <label class="form-label">품목 선택 <span class="required">*</span></label>
          ${items.length > 0 ? `
            <select class="form-select" id="tx-item">
              <option value="">-- 선택 --</option>
              ${items.map((item, i) => `
                <option value="${i}" data-code="${item.itemCode || ''}" data-price="${item.unitPrice || ''}">
                  ${item.itemName}${item.itemCode ? ` (${item.itemCode})` : ''}
                  ${type === 'out' ? ` [현재: ${parseFloat(item.quantity || 0)}]` : ''}
                </option>
              `).join('')}
            </select>
          ` : `
            <input class="form-input" id="tx-item-name" placeholder="품목명 직접 입력" />
          `}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">수량 <span class="required">*</span></label>
            <input class="form-input" type="number" id="tx-qty" placeholder="0" min="1" />
          </div>
          <div class="form-group">
            <label class="form-label">단가</label>
            <input class="form-input" type="number" id="tx-price" placeholder="선택사항" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">일자 <span class="required">*</span></label>
          <input class="form-input" type="date" id="tx-date" value="${today}" />
        </div>
        <div class="form-group">
          <label class="form-label">비고</label>
          <input class="form-input" id="tx-note" placeholder="메모 (선택사항)" />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn ${type === 'in' ? 'btn-success' : 'btn-danger'}" id="modal-save">
          ${type === 'in' ? '📥 입고 등록' : '📤 출고 등록'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 품목 선택 시 단가 자동 채움
  const itemSelect = overlay.querySelector('#tx-item');
  if (itemSelect) {
    itemSelect.addEventListener('change', () => {
      const opt = itemSelect.selectedOptions[0];
      const price = opt?.dataset.price;
      if (price) {
        overlay.querySelector('#tx-price').value = price;
      }
    });
  }

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // 저장
  overlay.querySelector('#modal-save').addEventListener('click', () => {
    let itemName = '';
    let itemCode = '';

    if (items.length > 0 && itemSelect) {
      const idx = itemSelect.value;
      if (idx === '') {
        showToast('품목을 선택해 주세요.', 'warning');
        return;
      }
      const selectedItem = items[parseInt(idx)];
      itemName = selectedItem.itemName;
      itemCode = selectedItem.itemCode || '';
    } else {
      itemName = overlay.querySelector('#tx-item-name')?.value.trim();
      if (!itemName) {
        showToast('품목명을 입력해 주세요.', 'warning');
        return;
      }
    }

    const qty = parseFloat(overlay.querySelector('#tx-qty').value);
    if (!qty || qty <= 0) {
      showToast('수량을 입력해 주세요.', 'warning');
      return;
    }

    const date = overlay.querySelector('#tx-date').value;
    if (!date) {
      showToast('일자를 선택해 주세요.', 'warning');
      return;
    }

    // 출고 시 재고 확인
    if (type === 'out' && items.length > 0 && itemSelect) {
      const idx = parseInt(itemSelect.value);
      const currentQty = parseFloat(items[idx]?.quantity) || 0;
      if (qty > currentQty) {
        showToast(`재고가 부족합니다. (현재 ${currentQty})`, 'error');
        return;
      }
    }

    // 선택된 거래처 포함하여 트랜잭션 저장
    const vendor = overlay.querySelector('#tx-vendor')?.value || '';
    addTransaction({
      type,
      vendor,
      itemName,
      itemCode,
      quantity: qty,
      unitPrice: parseFloat(overlay.querySelector('#tx-price').value) || 0,
      date,
      note: overlay.querySelector('#tx-note').value.trim(),
    });

    showToast(
      `${type === 'in' ? '입고' : '출고'} 등록: ${itemName} ${qty}개`,
      type === 'in' ? 'success' : 'info'
    );
    close();
    renderInoutPage(container, navigateTo);
  });

  // 수량 입력에 포커스
  setTimeout(() => {
    const qtyInput = overlay.querySelector('#tx-qty');
    if (items.length > 0) {
      overlay.querySelector('#tx-item')?.focus();
    } else {
      overlay.querySelector('#tx-item-name')?.focus();
    }
  }, 100);
}

// === 유틸 ===

function countToday(transactions, type) {
  const today = new Date().toISOString().split('T')[0];
  return transactions.filter(tx => tx.type === type && tx.date === today).length;
}

/**
 * 거래처 필터 옵션 추출
 * 왜 트랜잭션과 품목 모두에서? → 기존 트랜잭션에 vendor가 없을 수 있으므로
 *   품목의 vendor도 포함하여 빈틈없이 필터링
 */
function getVendorOptions(transactions, items) {
  const fromTx = transactions.map(tx => tx.vendor).filter(Boolean);
  const fromItems = items.map(i => i.vendor).filter(Boolean);
  return [...new Set([...fromTx, ...fromItems])].sort();
}

/**
 * 등록된 품목들의 품목코드 목록 추출
 */
function getCodeList(items) {
  return [...new Set(items.map(i => i.itemCode).filter(Boolean))].sort();
}
