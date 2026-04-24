/**
 * page-inventory.js - 재고 현황 페이지
 * ?ㅻТ 湲곕뒫: ?섎룞 ?덈ぉ 異붽?/?몄쭛, ?덉쟾?ш퀬 寃쎄퀬, 寃???꾪꽣, ?섏씠吏?ㅼ씠?? ?묒? ?대낫?닿린
 * **컬럼 표시 설정**: 사용자가 보고 싶은 컬럼만 선택해서 볼 수 있음
 */

import { getState, setState, addItem, updateItem, deleteItem, restoreItem, setSafetyStock, rebuildInventoryFromTransactions, recalcItemAmounts, setSyncCallback } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { generateInventoryPDF } from './pdf-generator.js';
import { renderItemTimelineChart } from './charts.js';
import { renderGuidedPanel, renderInsightHero, renderQuickFilterRow, escapeHtml } from './ux-toolkit.js';
import { canAction } from './auth.js';
import { handlePageError } from './error-monitor.js';
import { showFieldError, clearAllFieldErrors, setSavingState } from './ux-toolkit.js';

// 페이지당 행 수
const PAGE_SIZE = 20;

// ?꾩껜 ?꾨뱶 ?뺤쓽 (?쒖꽌 ?좎?)
const ALL_FIELDS = [
  { key: 'itemName', label: '품목명', numeric: false },
  { key: 'itemCode', label: '품목코드', numeric: false },
  { key: 'spec', label: '규격/스펙', numeric: false },
  { key: 'category', label: '분류', numeric: false },
  { key: 'vendor', label: '거래처', numeric: false },
  { key: 'quantity', label: '수량', numeric: true },
  { key: 'unit', label: '단위', numeric: false },
  { key: 'unitPrice', label: '매입가(원가)', numeric: true },
  { key: 'salePrice', label: '판매가(소가)', numeric: true },
  { key: 'supplyValue', label: '공급가액', numeric: true },
  { key: 'vat', label: '부가세', numeric: true },
  { key: 'totalPrice', label: '합계금액', numeric: true },
  { key: 'warehouse', label: '창고/위치', numeric: false },
  { key: 'expiryDate', label: '유통기한', numeric: false },
  { key: 'lotNumber', label: 'LOT번호', numeric: false },
  { key: 'note', label: '비고', numeric: false },
];

// 페이지당 행 수
const FIELD_LABELS = {};
ALL_FIELDS.forEach(f => { FIELD_LABELS[f.key] = f.label; });

/**
 * 현재 표시할 컬럼 목록 결정
 * ????濡쒖쭅? ??visibleColumns ?ㅼ젙???덉쑝硫?洹멸구 ?곕Ⅴ怨?
 * 현재 표시할 컬럼 목록 결정
 */
function getVisibleFields(data) {
  const state = getState();
  const visibleColumns = state.visibleColumns;

  // 페이지당 행 수
  const hasData = new Set(
    ALL_FIELDS.map(f => f.key).filter(key =>
      data.some(row => row[key] !== '' && row[key] !== undefined && row[key] !== null)
    )
  );

  if (visibleColumns && Array.isArray(visibleColumns)) {
    // [VAT ?⑥튂] 湲곗〈 ?ㅼ젙???덈뜑?쇰룄 ?덈∼寃?異붽???怨듦툒媛?? 遺媛?몃뒗 ?곗꽑 蹂댁씠寃?蹂댁젙
    const updatedVisible = [...visibleColumns];
    if (!updatedVisible.includes('supplyValue')) updatedVisible.push('supplyValue');
    if (!updatedVisible.includes('vat')) updatedVisible.push('vat');
    
    // 사용자 설정이 있으면 → 설정에 포함된 것만 (순서는 ALL_FIELDS 순서 유지)
    return ALL_FIELDS.filter(f => updatedVisible.includes(f.key)).map(f => f.key);
  }

  // 페이지당 행 수
  // 전체 필드 정의 (순서 유지)
  return ALL_FIELDS.filter(f => hasData.has(f.key) || f.key === 'supplyValue' || f.key === 'vat').map(f => f.key);
}

/**
 * 현재 표시할 컬럼 목록 결정
 */
export function renderInventoryPage(container, navigateTo) {
  // ── 권한 플래그 ──────────────────────────────────────────
  const canEdit   = canAction('item:edit');
  const canDelete = canAction('item:delete');
  const canCreate = canAction('item:create');
  const canBulk   = canAction('item:bulk');
  // ─────────────────────────────────────────────────────────

  // 트랜잭션 기반 재고 자동 동기화
  // mappedData에 없는 품목이 transactions에 있으면 재계산해서 동기화
  {
    const st = getState();
    const txs = st.transactions || [];
    const mapped = st.mappedData || [];
    const mappedKeys = new Set(mapped.map(d =>
      d.itemCode ? String(d.itemCode).trim() : String(d.itemName || '').trim()
    ));
    const hasOrphaned = txs.some(tx => {
      const key = tx.itemCode ? String(tx.itemCode).trim() : String(tx.itemName || '').trim();
      return key && !mappedKeys.has(key);
    });
    if (hasOrphaned) rebuildInventoryFromTransactions();
  }

  const state = getState();
  const data = state.mappedData || [];
  const safetyStock = state.safetyStock || {};

  if (data.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">재고 현황</h1>
          <div class="page-desc">품목별 재고 수량과 금액을 관리합니다.</div>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="btn-add-item">+ 품목 추가</button>
        </div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📦</div>
          <div class="msg">아직 등록된 품목이 없습니다</div>
          <div class="sub">엑셀 파일을 업로드하거나 품목을 직접 등록해 주세요.</div>
          <div class="empty-state-actions">
            <button class="btn btn-primary" id="btn-go-upload">📂 엑셀 업로드</button>
            <button class="btn btn-outline" id="btn-add-item-empty">✏️ 직접 입력</button>
          </div>
          <div class="empty-state-tip">💡 TIP: 기존 엑셀 파일(.xlsx)을 그대로 드래그하면 자동으로 인식합니다</div>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    container.querySelector('#btn-add-item')?.addEventListener('click', () => openItemModal(container, navigateTo));
    container.querySelector('#btn-add-item-empty')?.addEventListener('click', () => openItemModal(container, navigateTo));
    return;
  }

  // 페이지당 행 수
  let activeFields = getVisibleFields(data);

  // 전체 필드 정의 (순서 유지)
  const allAvailableFields = ALL_FIELDS.filter(f =>
    data.some(row => row[f.key] !== '' && row[f.key] !== undefined && row[f.key] !== null)
  );

  // 페이지당 행 수
  const warningCount = data.filter(d => {
    const min = safetyStock[d.itemName];
    const qtyStr = typeof d.quantity === 'string' ? d.quantity.replace(/,/g, '') : d.quantity;
    return min !== undefined && (parseFloat(qtyStr) || 0) <= min;
  }).length;
  const missingVendorCount = data.filter(row => !String(row.vendor || '').trim()).length;
  const missingWarehouseCount = data.filter(row => !String(row.warehouse || '').trim()).length;
  const missingSalePriceCount = data.filter(row => !(parseFloat(row.salePrice) > 0)).length;
  const beginnerMode = state.beginnerMode !== false;
  const hasTransactions = (state.transactions || []).length > 0;
  const inventoryHealthMetrics = [
    {
      label: '부족 품목',
      value: warningCount > 0 ? `${warningCount}건` : '안정',
      note: '안전재고 아래로 내려간 품목 수입니다.',
      stateClass: warningCount > 0 ? 'text-danger' : 'text-success',
    },
    {
      label: '거래처 미연결',
      value: missingVendorCount > 0 ? `${missingVendorCount}건` : '완료',
      note: '거래처를 연결하면 발주와 보고가 더 쉬워집니다.',
      stateClass: missingVendorCount > 0 ? 'text-warning' : 'text-success',
    },
    {
      label: '위치 미입력',
      value: missingWarehouseCount > 0 ? `${missingWarehouseCount}건` : '완료',
      note: '창고나 위치를 넣어두면 현장 찾기가 쉬워집니다.',
      stateClass: missingWarehouseCount > 0 ? 'text-warning' : 'text-success',
    },
    {
      label: '판매가 미입력',
      value: missingSalePriceCount > 0 ? `${missingSalePriceCount}건` : '완료',
      note: '판매가를 넣어두면 이익과 마진을 더 정확히 볼 수 있습니다.',
      stateClass: missingSalePriceCount > 0 ? 'text-warning' : 'text-success',
    },
  ];
  const inventoryFocusChips = [
    { value: 'all', label: '전체 보기' },
    { value: 'low', label: '부족 품목' },
    { value: 'zero', label: '수량 0' },
    { value: 'missingVendor', label: '거래처 미입력' },
    { value: 'missingWarehouse', label: '위치 미입력' },
  ];
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
        <h1 class="page-title">재고 현황</h1>
        <div class="page-desc">${state.fileName ? `📄 ${state.fileName}` : ''} 총 ${data.length}개 품목</div>
      </div>
      <div class="page-actions">
        ${canBulk ? `<button class="btn btn-outline" id="btn-rebuild-inventory" title="입출고 이력 기준으로 재고 수량 재계산">🔄 재고 재계산</button>` : ''}
        <button class="btn btn-outline" id="btn-export">📥 엑셀</button>
        <button class="btn btn-outline" id="btn-export-pdf">📄 PDF</button>
        ${canCreate ? `<button class="btn btn-primary" id="btn-add-item">+ 품목 추가</button>` : ''}
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="inventory-collapsible-section" data-collapsible-section="inventory-stats" data-collapsible-label="핵심 지표">
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
            ${warningCount > 0 ? `${warningCount}건` : '없음'}
          </div>
        </div>
      </div>
    </div>

    ${state.lastUploadDiff ? `
      <div class="card upload-diff-card" id="upload-diff-card">
        <div class="upload-diff-head">
          <div>
            <div class="card-title">업로드 변경 요약</div>
            <div class="upload-diff-meta">${state.lastUploadDiff.fileName || state.fileName || '최근 업로드'} · ${new Date(state.lastUploadDiff.at || Date.now()).toLocaleString('ko-KR')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-dismiss-upload-diff">닫기</button>
        </div>
        <div class="upload-diff-grid">
          <div class="upload-diff-item"><span>신규</span><strong>${state.lastUploadDiff.added || 0}건</strong></div>
          <div class="upload-diff-item"><span>수정</span><strong>${state.lastUploadDiff.updated || 0}건</strong></div>
          <div class="upload-diff-item"><span>유지</span><strong>${state.lastUploadDiff.unchanged || 0}건</strong></div>
          <div class="upload-diff-item"><span>미포함</span><strong>${state.lastUploadDiff.removed || 0}건</strong></div>
        </div>
      </div>
    ` : ''}

    <div class="inventory-collapsible-section" data-collapsible-section="inventory-health" data-collapsible-label="재고 운영 상태">
      ${renderInsightHero({
        eyebrow: '재고 운영 상태',
        title: '누가 봐도 바로 이해되는 재고 상태를 먼저 보여줍니다.',
        desc: '수량, 금액, 거래처 연결, 위치 입력 상태를 한 번에 묶어 초보자도 무엇부터 정리할지 바로 판단할 수 있게 구성했습니다.',
        tone: warningCount > 0 ? 'warning' : 'success',
        metrics: inventoryHealthMetrics,
        bullets: [
          warningCount > 0 ? `부족 품목 ${warningCount}건을 먼저 보충할지 여부를 판단해 보세요.` : '부족 품목이 없습니다. 현재 재고 흐름이 안정적입니다.',
          missingVendorCount > 0 ? `거래처가 비어 있는 품목 ${missingVendorCount}건은 발주와 문서 연결 전에 보완하는 것이 좋습니다.` : '거래처 정보가 충분히 연결되어 있습니다.',
          missingWarehouseCount > 0 ? '위치가 비어 있으면 현장 조회가 느려집니다. 위치 미입력 품목을 우선 정리해 주세요.' : '위치 정보도 잘 정리되어 있습니다.',
        ],
        actions: [
          { id: 'btn-add-item-inline', label: '품목 바로 추가', variant: 'btn-primary' },
          { nav: 'dashboard', label: '고급 분석 보기', variant: 'btn-outline' },
        ],
      })}
    </div>

    <div class="inventory-collapsible-section" data-collapsible-section="inventory-filters" data-collapsible-label="검색 · 필터 · 일괄 작업">
      ${renderQuickFilterRow({
        label: '빠른 보기',
        attr: 'data-inventory-focus',
        chips: inventoryFocusChips.map(chip => ({ ...chip, active: chip.value === 'all' })),
      })}

    <!-- 검색 + 필터 — 기본은 검색만, 상세 필터는 토글로 열림 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="search-input"
        placeholder="스마트 검색: 품목명, 분류:식품, 창고:본사, 재고>=10, 부족, 품절" />
      <button class="filter-toggle-btn" id="btn-filter-toggle">🔍 상세 필터</button>
      <button class="btn btn-ghost btn-sm" id="btn-filter-reset" title="필터 초기화">초기화</button>
      <div class="col-settings-wrap" style="position:relative;">
        <button class="btn btn-outline btn-sm" id="btn-col-settings" title="표시 열 선택">
          표시 항목 설정
        </button>
        <div class="col-settings-panel" id="col-settings-panel">
          <div class="col-settings-header">
            <strong>표시 항목 선택</strong>
            <button class="col-settings-close" id="col-settings-close">닫기</button>
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
    <!-- 상세 필터 패널 — 기본 숨김, 토글 버튼으로 열림 -->
    <div class="filter-detail-panel" id="filter-detail-panel">
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
        <option value="low">부족 항목만</option>
      </select>
      <select class="filter-select" id="sort-preset" title="정렬">
        ${sortOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}
      </select>
    </div>
    <div class="smart-search-row" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:8px 0 4px;">
      <span style="font-size:12px; color:var(--text-muted);">빠른 검색</span>
      <button class="btn btn-ghost btn-sm" type="button" data-smart-query="부족">부족</button>
      <button class="btn btn-ghost btn-sm" type="button" data-smart-query="품절">품절</button>
      <button class="btn btn-ghost btn-sm" type="button" data-smart-query="거래처없음">거래처없음</button>
      <button class="btn btn-ghost btn-sm" type="button" data-smart-query="위치없음">위치없음</button>
      <button class="btn btn-ghost btn-sm" type="button" data-smart-query="재고>=10">재고>=10</button>
    </div>
    <div class="filter-summary" id="inventory-filter-summary"></div>

      <div class="card inventory-bulk-bar" id="inventory-bulk-bar">
        <div class="inventory-bulk-count" id="inventory-selected-count">선택 0개</div>
        <div class="inventory-bulk-actions">
          ${canBulk ? `<button class="btn btn-outline btn-sm" id="btn-bulk-category" disabled>선택 분류 변경</button>` : ''}
          <button class="btn btn-outline btn-sm" id="btn-bulk-export" disabled>선택 엑셀 내보내기</button>
          ${canDelete ? `<button class="btn btn-danger btn-sm" id="btn-bulk-delete" disabled>선택 삭제</button>` : ''}
        </div>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="inventory-collapsible-section" data-collapsible-section="inventory-table" data-collapsible-label="재고 테이블">
      <div class="card card-flush">
        <div class="table-wrapper" style="border:none;">
          <table class="data-table" id="inventory-table">
            <thead id="inventory-thead"></thead>
            <tbody id="inventory-body"></tbody>
          </table>
        </div>
        <div class="pagination" id="pagination"></div>
      </div>
    </div>

    <div class="inventory-collapsible-section" data-collapsible-section="inventory-timeline" data-collapsible-label="품목 이력 타임라인">
      <div class="card inventory-timeline-card">
        <div class="inventory-timeline-head">
          <div>
            <div class="card-title" id="item-timeline-title">품목 이력 타임라인</div>
            <div class="chart-help-text" id="item-timeline-meta">테이블에서 품목을 선택하면 입출고 흐름과 최근 이력을 바로 확인할 수 있습니다.</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-item-history-inout">입출고 기록 열기</button>
        </div>
        <div class="inventory-timeline-grid">
          <div class="inventory-timeline-chart">
            <canvas id="chart-item-timeline"></canvas>
          </div>
          <div class="inventory-timeline-list" id="item-timeline-list"></div>
        </div>
      </div>
    </div>

    <div style="font-size:12px; color:var(--text-muted); margin-top:8px;">
      두 번 클릭하면 값을 바로 수정할 수 있습니다. 표시 항목 설정 버튼으로 보고 싶은 열만 선택해 주세요.
    </div>
  `;

  // === 상태 변수 ===
  const defaultFilter = { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' };
  const defaultSort = { key: '', direction: '' };
  const savedViewPrefs = state.inventoryViewPrefs || {};
  let currentFilter = sanitizeInventoryFilter(savedViewPrefs.filter);
  let currentPageNum = 1;
  let currentSort = sanitizeInventorySort(savedViewPrefs.sort);
  let persistTimer = null;
  let selectedIndexes = new Set();
  let focusedItemKey = data[0] ? getItemKey(data[0]) : '';
  const expandedInvGroups = new Set(); // 재고 테이블 펼쳐진 그룹 키
  const COLLAPSE_STORAGE_KEY = 'invex:inventory:collapsed-sections:v1';
  const collapsedSections = loadCollapsedSections();

  function loadCollapsedSections() {
    try {
      const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function persistCollapsedSections() {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapsedSections));
    } catch (error) {
      // Ignore storage errors and keep UI usable.
    }
  }

  function updateCollapsibleSection(sectionEl) {
    if (!sectionEl) return;
    const sectionId = sectionEl.dataset.collapsibleSection;
    if (!sectionId) return;

    const label = sectionEl.dataset.collapsibleLabel || '섹션';
    const collapsed = !!collapsedSections[sectionId];
    sectionEl.classList.toggle('is-collapsed', collapsed);

    const toggleBtn = sectionEl.querySelector('.inventory-collapse-toggle');
    if (!toggleBtn) return;
    toggleBtn.textContent = `${label} ${collapsed ? '펼치기' : '접기'}`;
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.setAttribute('aria-label', `${label} ${collapsed ? '펼치기' : '접기'}`);
  }

  function initCollapsibleSections() {
    container.querySelectorAll('[data-collapsible-section]').forEach((sectionEl, index) => {
      if (!sectionEl.dataset.collapsibleSection) {
        sectionEl.dataset.collapsibleSection = `inventory-section-${index + 1}`;
      }

      if (sectionEl.dataset.collapseReady !== '1') {
        const sectionId = sectionEl.dataset.collapsibleSection;

        const body = document.createElement('div');
        body.className = 'inventory-collapsible-body';
        while (sectionEl.firstChild) {
          body.appendChild(sectionEl.firstChild);
        }

        const header = document.createElement('div');
        header.className = 'inventory-collapse-header';

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-ghost btn-sm inventory-collapse-toggle';
        header.appendChild(toggleBtn);

        sectionEl.appendChild(header);
        sectionEl.appendChild(body);
        sectionEl.dataset.collapseReady = '1';

        toggleBtn.addEventListener('click', () => {
          const nextCollapsed = !collapsedSections[sectionId];
          if (nextCollapsed) {
            collapsedSections[sectionId] = true;
          } else {
            delete collapsedSections[sectionId];
          }
          persistCollapsedSections();
          updateCollapsibleSection(sectionEl);
        });
      }

      updateCollapsibleSection(sectionEl);
    });
  }

  function sanitizeInventoryFilter(raw) {
    const candidate = raw || {};
    return {
      keyword: typeof candidate.keyword === 'string' ? candidate.keyword : '',
      category: typeof candidate.category === 'string' ? candidate.category : '',
      warehouse: typeof candidate.warehouse === 'string' ? candidate.warehouse : '',
      stock: candidate.stock === 'low' ? 'low' : '',
      itemCode: typeof candidate.itemCode === 'string' ? candidate.itemCode : '',
      vendor: typeof candidate.vendor === 'string' ? candidate.vendor : '',
      focus: ['all', 'low', 'zero', 'missingVendor', 'missingWarehouse'].includes(candidate.focus) ? candidate.focus : 'all',
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

  // === ?뺣젹 ?좏떥 ===
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

  function getItemKey(row) {
    if (!row) return '';
    const code = String(row.itemCode || '').trim();
    const name = String(row.itemName || '').trim();
    return `${code}::${name}`;
  }

  function escapeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
  }

  function parseSmartKeyword(rawKeyword) {
    const source = String(rawKeyword || '').trim();
    const parsed = {
      textTerms: [],
      containsFilters: {},
      numericFilters: [],
      flags: {
        lowStock: false,
        zeroStock: false,
        missingVendor: false,
        missingWarehouse: false,
      },
      summaryChips: [],
    };
    if (!source) return parsed;

    const containsAliases = {
      분류: 'category',
      카테고리: 'category',
      category: 'category',
      창고: 'warehouse',
      위치: 'warehouse',
      warehouse: 'warehouse',
      거래처: 'vendor',
      벤더: 'vendor',
      vendor: 'vendor',
      코드: 'itemCode',
      품목코드: 'itemCode',
      itemcode: 'itemCode',
    };

    const numericAliases = {
      재고: 'quantity',
      수량: 'quantity',
      qty: 'quantity',
      원가: 'unitPrice',
      매입가: 'unitPrice',
      단가: 'unitPrice',
      unitprice: 'unitPrice',
      소가: 'salePrice',
      판매가: 'salePrice',
      saleprice: 'salePrice',
      공급가: 'supplyValue',
      공급가액: 'supplyValue',
      supplyvalue: 'supplyValue',
      합계: 'totalPrice',
      합계금액: 'totalPrice',
      totalprice: 'totalPrice',
    };

    const summarySet = new Set();
    const tokens = source.split(/\s+/).filter(Boolean);

    tokens.forEach(token => {
      const lowered = normalizeToken(token);

      if (['부족', '안전재고', 'low'].includes(lowered)) {
        parsed.flags.lowStock = true;
        summarySet.add('스마트: 부족');
        return;
      }
      if (['품절', '재고0', '수량0', 'zero'].includes(lowered)) {
        parsed.flags.zeroStock = true;
        summarySet.add('스마트: 품절');
        return;
      }
      if (['거래처없음', '거래처미입력', 'vendor:none'].includes(lowered)) {
        parsed.flags.missingVendor = true;
        summarySet.add('스마트: 거래처없음');
        return;
      }
      if (['위치없음', '창고없음', '위치미입력', 'warehouse:none'].includes(lowered)) {
        parsed.flags.missingWarehouse = true;
        summarySet.add('스마트: 위치없음');
        return;
      }

      const colonIndex = token.indexOf(':');
      if (colonIndex > 0) {
        const keyAlias = normalizeToken(token.slice(0, colonIndex));
        const rawValue = token.slice(colonIndex + 1).trim();
        const key = containsAliases[keyAlias];
        if (key) {
          if (rawValue) {
            parsed.containsFilters[key] = normalizeToken(rawValue);
            summarySet.add(`스마트: ${token.slice(0, colonIndex)}:${rawValue}`);
          }
          return;
        }
      }

      const numericMatch = token.match(/^([^:><=]+)(>=|<=|=|>|<)(-?\d+(?:\.\d+)?)$/);
      if (numericMatch) {
        const alias = normalizeToken(numericMatch[1]);
        const key = numericAliases[alias];
        if (key) {
          parsed.numericFilters.push({
            key,
            op: numericMatch[2],
            value: Number.parseFloat(numericMatch[3]),
            label: `스마트: ${token}`,
          });
          summarySet.add(`스마트: ${token}`);
          return;
        }
      }

      parsed.textTerms.push(lowered);
    });

    parsed.summaryChips = [...summarySet];
    return parsed;
  }

  function getNumericFieldValue(row, key) {
    if (key === 'supplyValue') {
      const supply = getNumericValue(row.supplyValue);
      if (supply !== null) return supply;
      return (getNumericValue(row.quantity) || 0) * (getNumericValue(row.unitPrice) || 0);
    }
    if (key === 'totalPrice') {
      const totalPrice = getNumericValue(row.totalPrice);
      if (totalPrice !== null) return totalPrice;
      const supply = getNumericFieldValue(row, 'supplyValue');
      const vat = getNumericValue(row.vat) || Math.floor((supply || 0) * 0.1);
      return (supply || 0) + vat;
    }
    return getNumericValue(row[key]);
  }

  function matchNumericRule(actualValue, op, expectedValue) {
    if (actualValue === null || Number.isNaN(actualValue)) return false;
    if (op === '>=') return actualValue >= expectedValue;
    if (op === '<=') return actualValue <= expectedValue;
    if (op === '>') return actualValue > expectedValue;
    if (op === '<') return actualValue < expectedValue;
    return actualValue === expectedValue;
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

    const smartQuery = parseSmartKeyword(currentFilter.keyword);
    const chips = [];
    if (smartQuery.textTerms.length > 0) chips.push(`텍스트 검색: ${smartQuery.textTerms.join(' ')}`);
    chips.push(...smartQuery.summaryChips);
    if (currentFilter.itemCode) chips.push(`품목코드: ${currentFilter.itemCode}`);
    if (currentFilter.vendor) chips.push(`거래처: ${currentFilter.vendor}`);
    if (currentFilter.category) chips.push(`분류: ${currentFilter.category}`);
    if (currentFilter.warehouse) chips.push(`창고: ${currentFilter.warehouse}`);
    if (currentFilter.stock === 'low') chips.push('부족 항목만');
    if (currentFilter.focus === 'zero') chips.push('수량 0');
    if (currentFilter.focus === 'missingVendor') chips.push('거래처 미입력');
    if (currentFilter.focus === 'missingWarehouse') chips.push('위치 미입력');
    if (currentFilter.focus === 'low') chips.push('빠른 보기: 부족 품목');
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
      header.setAttribute('tabindex', '0');
      header.setAttribute('role', 'button');
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

      header.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        header.click();
      });
    });
  }

  // === ?뚯씠釉??ㅻ뜑 ?뚮뜑留?(而щ읆 蹂寃????ы샇異? ===
  function renderTableHeader() {
    const thead = container.querySelector('#inventory-thead');
    thead.innerHTML = `
      <tr>
        <th class="col-check">
          <input type="checkbox" class="table-row-check" id="inv-select-all" aria-label="현재 페이지 전체 선택" />
        </th>
        <th class="col-num">#</th>
        ${activeFields.map(key => `
          <th
            class="sortable-header ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''} ${currentSort.key === key ? 'is-active' : ''}"
            data-sort-key="${key}"
            title="클릭하여 정렬"
            aria-sort="${currentSort.key === key ? (currentSort.direction === 'asc' ? 'ascending' : currentSort.direction === 'desc' ? 'descending' : 'none') : 'none'}"
          >
            <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
              <span class="sort-label">${FIELD_LABELS[key]}</span>
              <span class="sort-indicator">${getSortIndicator(key)}</span>
            </button>
          </th>
        `).join('')}
        <th class="text-center" style="width:70px;">안전재고</th>
        <th class="col-actions">관리</th>
      </tr>
    `;
    attachSortHeaderEvents();
  }

  // === 상태 변수 ===
  function getFilteredData() {
    const smartQuery = parseSmartKeyword(currentFilter.keyword);
    return data.filter(row => {
      if (smartQuery.textTerms.length > 0) {
        const haystack = [
          row.itemName,
          row.itemCode,
          row.category,
          row.vendor,
          row.warehouse,
          row.note,
          row.lotNumber,
        ].map(value => String(value || '').toLowerCase()).join(' ');
        if (!smartQuery.textTerms.every(term => haystack.includes(term))) return false;
      }

      if (currentFilter.category && row.category !== currentFilter.category) return false;
      if (currentFilter.warehouse && row.warehouse !== currentFilter.warehouse) return false;
      if (currentFilter.itemCode && row.itemCode !== currentFilter.itemCode) return false;
      if (currentFilter.vendor && row.vendor !== currentFilter.vendor) return false;
      if (smartQuery.containsFilters.category && !String(row.category || '').toLowerCase().includes(smartQuery.containsFilters.category)) return false;
      if (smartQuery.containsFilters.warehouse && !String(row.warehouse || '').toLowerCase().includes(smartQuery.containsFilters.warehouse)) return false;
      if (smartQuery.containsFilters.vendor && !String(row.vendor || '').toLowerCase().includes(smartQuery.containsFilters.vendor)) return false;
      if (smartQuery.containsFilters.itemCode && !String(row.itemCode || '').toLowerCase().includes(smartQuery.containsFilters.itemCode)) return false;
      if (currentFilter.stock === 'low' && !isLowStockRow(row)) return false;
      if (currentFilter.focus === 'low' && !isLowStockRow(row)) return false;
      if (currentFilter.focus === 'zero' && getNumericValue(row.quantity) !== 0) return false;
      if (currentFilter.focus === 'missingVendor' && String(row.vendor || '').trim()) return false;
      if (currentFilter.focus === 'missingWarehouse' && String(row.warehouse || '').trim()) return false;
      if (smartQuery.flags.lowStock && !isLowStockRow(row)) return false;
      if (smartQuery.flags.zeroStock && (getNumericValue(row.quantity) || 0) !== 0) return false;
      if (smartQuery.flags.missingVendor && String(row.vendor || '').trim()) return false;
      if (smartQuery.flags.missingWarehouse && String(row.warehouse || '').trim()) return false;
      if (smartQuery.numericFilters.some(rule => !matchNumericRule(getNumericFieldValue(row, rule.key), rule.op, rule.value))) return false;
      return true;
    });
  }

  // === 상태 변수 ===
  function renderTable() {
    const filtered = getFilteredData();
    const sorted = sortRows(filtered);
    const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (currentPageNum > totalPages) currentPageNum = totalPages;
    if (sorted.length > 0 && !sorted.some(row => getItemKey(row) === focusedItemKey)) {
      focusedItemKey = getItemKey(sorted[0]);
    }

    const start = (currentPageNum - 1) * PAGE_SIZE;
    const pageData = sorted.slice(start, start + PAGE_SIZE);

    const tbody = container.querySelector('#inventory-body');
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${activeFields.length + 4}" style="text-align:center; padding:32px; color:var(--text-muted);">
        검색 결과가 없습니다.
      </td></tr>`;
    } else {
      selectedIndexes = new Set([...selectedIndexes].filter(index => Number.isInteger(index) && index >= 0 && index < data.length));

      // ── 동일 품목명/코드 기준 그룹핑 ─────────────────────
      const invGroupOrder = [];
      const invGroupMap = new Map();
      pageData.forEach(row => {
        const grpKey = row.itemCode ? String(row.itemCode).trim() : String(row.itemName || '').trim();
        if (!invGroupMap.has(grpKey)) {
          invGroupMap.set(grpKey, []);
          invGroupOrder.push(grpKey);
        }
        invGroupMap.get(grpKey).push(row);
      });

      const _todayKey = new Date().toISOString().slice(0, 10);
      const renderInvRow = (row, isChild = false) => {
        const realIdx = data.indexOf(row);
        const min = safetyStock[row.itemName];
        const qtyStr = typeof row.quantity === 'string' ? row.quantity.replace(/,/g, '') : row.quantity;
        const qty = parseFloat(qtyStr) || 0;
        const isLow = min !== undefined && qty <= min;
        const isDanger = min !== undefined && qty === 0;
        const rowKey = getItemKey(row);
        const isFocused = focusedItemKey === rowKey;
        const childStyle = isChild ? 'background:var(--bg-lighter);' : '';
        const isLocked = row.lockedUntil && row.lockedUntil >= _todayKey;

        return `
          <tr class="${isDanger ? 'row-danger' : isLow ? 'row-warning' : ''} ${isFocused ? 'row-focused' : ''} ${isChild ? 'inv-child-row' : ''}"
              data-idx="${realIdx}" data-row-key="${rowKey}" style="${childStyle}">
            <td data-label="" class="col-check">
              <input type="checkbox" class="table-row-check inv-row-check" data-idx="${realIdx}" ${selectedIndexes.has(realIdx) ? 'checked' : ''} aria-label="행 선택" />
            </td>
            <td class="col-num"></td>
            ${activeFields.map(key => `
              <td class="editable-cell ${ALL_FIELDS.find(f => f.key === key)?.numeric ? 'text-right' : ''}"
                  data-label="${FIELD_LABELS[key] || key}"
                  data-field="${key}" data-idx="${realIdx}">
                ${key === 'itemName' && isLocked ? '<span title="잠금 품목 (수정 제한)" style="margin-right:4px;">🔒</span>' : ''}
                ${formatCell(key, row[key])}
                ${key === 'quantity' && isLow ? ' <span class="badge badge-danger" style="font-size:10px;">부족</span>' : ''}
              </td>
            `).join('')}
            <td data-label="안전재고" class="text-center">
              <button class="btn-icon btn-safety" data-name="${escapeHtml(row.itemName)}" data-min="${min ?? ''}"
                title="클릭하여 안전재고 수량 설정"
                style="font-size:11px; padding:2px 6px; border-radius:4px;
                  ${min !== undefined ? 'background:rgba(63,185,80,0.15); color:var(--success);' : 'color:var(--text-muted);'}">
                ${min !== undefined ? `기준 ${min}` : '설정'}
              </button>
            </td>
            <td data-label="" class="col-actions">
              ${canEdit   ? `<button class="btn-icon btn-edit" data-idx="${realIdx}" title="수정">수정</button>` : `<button class="btn-icon" title="권한 없음" disabled style="opacity:0.3;cursor:not-allowed;">수정</button>`}
              ${canDelete ? `<button class="btn-icon btn-icon-danger btn-del" data-idx="${realIdx}" title="삭제">삭제</button>` : ''}
            </td>
          </tr>
        `;
      };

      let invRowNum = start + 1;
      let invHtml = '';
      const totalCols = activeFields.length + 4;

      invGroupOrder.forEach(grpKey => {
        const group = invGroupMap.get(grpKey);
        if (group.length === 1) {
          invHtml += renderInvRow(group[0], false).replace('<td class="col-num"></td>', `<td class="col-num">${invRowNum++}</td>`);
        } else {
          const isExpanded = expandedInvGroups.has(grpKey);
          const firstName = group[0].itemName || '-';
          const firstCode = group[0].itemCode || '';
          const totalQty = group.reduce((s, r) => s + (parseFloat(String(r.quantity || '').replace(/,/g, '')) || 0), 0);
          invHtml += `
            <tr class="inv-group-header" data-inv-group-key="${escapeHtml(grpKey)}" style="cursor:pointer; background:var(--bg-card); border-left:3px solid var(--accent);">
              <td class="col-check"><span style="color:var(--text-muted); font-size:11px;">${group.length}건</span></td>
              <td class="col-num">${invRowNum++}</td>
              <td colspan="${totalCols - 2}" style="padding-left:8px;">
                <span class="inv-toggle-icon" style="margin-right:6px; font-size:12px;">${isExpanded ? '▼' : '▶'}</span>
                <strong>${escapeHtml(firstName)}</strong>
                ${firstCode ? `<span style="color:var(--text-muted); font-size:11px; margin-left:6px;">${escapeHtml(firstCode)}</span>` : ''}
                <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">총 ${totalQty.toLocaleString('ko-KR')}개 · ${group.length}항목</span>
              </td>
            </tr>
            ${isExpanded ? group.map(row => renderInvRow(row, true)).join('') : ''}
          `;
        }
      });
      tbody.innerHTML = invHtml;
    }

    renderFilterSummary(sorted.length, data.length);

    // 재고 그룹 헤더 클릭 → 펼치기/접기
    container.querySelectorAll('.inv-group-header').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.dataset.invGroupKey;
        if (expandedInvGroups.has(key)) {
          expandedInvGroups.delete(key);
        } else {
          expandedInvGroups.add(key);
        }
        renderTable();
      });
    });

    // 페이지당 행 수
    const paginationEl = container.querySelector('#pagination');
    const pageStart = sorted.length === 0 ? 0 : start + 1;
    paginationEl.innerHTML = `
      <span>${sorted.length}건 중 ${pageStart}~${Math.min(start + PAGE_SIZE, sorted.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="page-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>이전</button>
        ${Array.from({length: Math.min(totalPages, 7)}, (_, i) => {
          let p;
          if (totalPages <= 7) { p = i + 1; }
          else if (currentPageNum <= 4) { p = i + 1; }
          else if (currentPageNum >= totalPages - 3) { p = totalPages - 6 + i; }
          else { p = currentPageNum - 3 + i; }
          return `<button class="page-btn ${p === currentPageNum ? 'active' : ''}" data-p="${p}">${p}</button>`;
        }).join('')}
        <button class="page-btn" id="page-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음</button>
      </div>
    `;

    // 페이지당 행 수
    attachTableEvents();
    attachPaginationEvents();
    updateSelectAllState(pageData);
    refreshBulkActions();
    renderItemTimelinePanel(sorted);
  }

  function updateSelectAllState(pageRows) {
    const selectAll = container.querySelector('#inv-select-all');
    if (!selectAll) return;

    const pageIndexes = pageRows.map(row => data.indexOf(row)).filter(index => index >= 0);
    if (pageIndexes.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }

    const checkedCount = pageIndexes.filter(index => selectedIndexes.has(index)).length;
    selectAll.checked = checkedCount === pageIndexes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < pageIndexes.length;
  }

  function getCurrentPageRows() {
    const sorted = sortRows(getFilteredData());
    const start = (currentPageNum - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }

  function refreshBulkActions() {
    const selectedCount = selectedIndexes.size;
    const countEl = container.querySelector('#inventory-selected-count');
    const bulkCategoryBtn = container.querySelector('#btn-bulk-category');
    const bulkExportBtn = container.querySelector('#btn-bulk-export');
    const bulkDeleteBtn = container.querySelector('#btn-bulk-delete');

    if (countEl) countEl.textContent = `선택 ${selectedCount}개`;
    if (bulkCategoryBtn) bulkCategoryBtn.disabled = selectedCount === 0;
    if (bulkExportBtn) bulkExportBtn.disabled = selectedCount === 0;
    if (bulkDeleteBtn) bulkDeleteBtn.disabled = selectedCount === 0;
  }

  function shiftSelectionAfterDelete(index) {
    const next = new Set();
    selectedIndexes.forEach(selectedIndex => {
      if (selectedIndex === index) return;
      next.add(selectedIndex > index ? selectedIndex - 1 : selectedIndex);
    });
    selectedIndexes = next;
  }

  function applyBulkCategory() {
    if (selectedIndexes.size === 0) {
      showToast('선택된 품목이 없습니다.', 'warning');
      return;
    }

    const nextCategory = prompt(`선택한 ${selectedIndexes.size}개 품목에 적용할 분류를 입력해 주세요.`);
    if (nextCategory === null) return;
    const trimmed = nextCategory.trim();
    if (!trimmed) {
      showToast('분류 이름을 입력해 주세요.', 'warning');
      return;
    }

    [...selectedIndexes].forEach(index => updateItem(index, { category: trimmed }));
    showToast(`${selectedIndexes.size}개 품목의 분류를 "${trimmed}"로 변경했습니다.`, 'success');
    renderTable();
    updateStats();
  }

  function exportSelectedRows() {
    if (selectedIndexes.size === 0) {
      showToast('선택된 품목이 없습니다.', 'warning');
      return;
    }

    const selectedRows = [...selectedIndexes]
      .sort((a, b) => a - b)
      .map(index => data[index])
      .filter(Boolean);

    const exportData = selectedRows.map(row => {
      const obj = {};
      activeFields.forEach(key => { obj[FIELD_LABELS[key]] = row[key]; });
      return obj;
    });

    const baseName = (state.fileName || '재고현황').replace(/\.[^.]+$/, '');
    downloadExcel(exportData, `${baseName}_선택품목`);
    showToast(`선택한 ${selectedRows.length}개 품목을 내보냈습니다.`, 'success');
  }

  function deleteSelectedRows() {
    if (selectedIndexes.size === 0) {
      showToast('선택된 품목이 없습니다.', 'warning');
      return;
    }

    const sortedIndexes = [...selectedIndexes].sort((a, b) => b - a);
    const removedItems = [];
    sortedIndexes.forEach(index => {
      const removed = deleteItem(index);
      if (removed?.deleted) removedItems.push({ index: removed.index, item: removed.deleted });
    });

    selectedIndexes.clear();
    renderTable();
    updateStats();

    showToast(`${removedItems.length}개 품목을 삭제했습니다.`, 'info', 5000, {
      actionLabel: '실행 취소',
      onAction: () => {
        removedItems
          .sort((a, b) => a.index - b.index)
          .forEach(({ item, index }) => restoreItem(item, index));
        renderTable();
        updateStats();
        showToast(`${removedItems.length}개 품목을 복원했습니다.`, 'success');
      },
    });
  }

  function renderItemTimelinePanel(currentSortedRows) {
    const timelineList = container.querySelector('#item-timeline-list');
    const timelineTitle = container.querySelector('#item-timeline-title');
    const timelineMeta = container.querySelector('#item-timeline-meta');
    if (!timelineList || !timelineTitle || !timelineMeta) return;

    const rows = currentSortedRows || [];
    if (rows.length === 0) {
      timelineTitle.textContent = '품목 이력 타임라인';
      timelineMeta.textContent = '표시할 품목이 없습니다.';
      timelineList.innerHTML = '<div class="dashboard-empty-note">필터 결과가 없어 이력을 표시할 수 없습니다.</div>';
      renderItemTimelineChart('chart-item-timeline', []);
      return;
    }

    const focusedRow = rows.find(row => getItemKey(row) === focusedItemKey) || rows[0];
    focusedItemKey = getItemKey(focusedRow);

    const allTransactions = (getState().transactions || [])
      .filter((tx) => {
        const sameCode = focusedRow.itemCode && tx.itemCode && String(focusedRow.itemCode) === String(tx.itemCode);
        const sameName = String(focusedRow.itemName || '').trim() === String(tx.itemName || '').trim();
        return sameCode || sameName;
      })
      .sort((left, right) => String(left.date || left.createdAt || '').localeCompare(String(right.date || right.createdAt || '')));

    timelineTitle.textContent = `${focusedRow.itemName || '선택 품목'} 이력 타임라인`;
    timelineMeta.textContent = `현재 재고 ${Math.round(getNumericValue(focusedRow.quantity) || 0).toLocaleString('ko-KR')}개 · 총 이력 ${allTransactions.length}건`;

    if (allTransactions.length === 0) {
      timelineList.innerHTML = '<div class="dashboard-empty-note">선택 품목의 입출고 이력이 아직 없습니다.</div>';
      renderItemTimelineChart('chart-item-timeline', []);
      return;
    }

    let runningQty = 0;
    const chartSeries = allTransactions.map((tx, index) => {
      const quantity = Math.abs(getNumericValue(tx.quantity) || 0);
      const delta = tx.type === 'in' ? quantity : -quantity;
      runningQty += delta;
      return {
        label: `${String(tx.date || tx.createdAt || '').slice(0, 10)} ${index + 1}`,
        value: runningQty,
        delta,
      };
    });
    renderItemTimelineChart('chart-item-timeline', chartSeries);

    const recentList = [...allTransactions].reverse().slice(0, 8);
    timelineList.innerHTML = recentList.map((tx) => `
      <div class="inventory-timeline-item">
        <span class="badge ${tx.type === 'in' ? 'badge-success' : 'badge-danger'}">${tx.type === 'in' ? '입고' : '출고'}</span>
        <div class="inventory-timeline-main">
          <div class="inventory-timeline-line">${escapeText(tx.date || '-')} · ${Math.round(Math.abs(getNumericValue(tx.quantity) || 0)).toLocaleString('ko-KR')}개</div>
          <div class="inventory-timeline-sub">${escapeText(tx.vendor || '거래처 미입력')} · ${escapeText(tx.note || '메모 없음')}</div>
        </div>
      </div>
    `).join('');
  }

  // === ?뚯씠釉??대깽??(?몃씪???몄쭛, ??젣 ?? ===
  function attachTableEvents() {
    const selectAll = container.querySelector('#inv-select-all');
    selectAll?.addEventListener('change', () => {
      const rowChecks = container.querySelectorAll('.inv-row-check');
      rowChecks.forEach((check) => {
        const idx = parseInt(check.dataset.idx, 10);
        check.checked = selectAll.checked;
        if (selectAll.checked) selectedIndexes.add(idx);
        else selectedIndexes.delete(idx);
      });
      refreshBulkActions();
      updateSelectAllState(getCurrentPageRows());
    });

    container.querySelectorAll('.inv-row-check').forEach(check => {
      check.addEventListener('change', () => {
        const idx = parseInt(check.dataset.idx, 10);
        if (check.checked) selectedIndexes.add(idx);
        else selectedIndexes.delete(idx);
        refreshBulkActions();
        updateSelectAllState(getCurrentPageRows());
      });
      check.addEventListener('click', event => event.stopPropagation());
    });

    const bulkCategoryBtn = container.querySelector('#btn-bulk-category');
    const bulkExportBtn = container.querySelector('#btn-bulk-export');
    const bulkDeleteBtn = container.querySelector('#btn-bulk-delete');
    const timelineInoutBtn = container.querySelector('#btn-item-history-inout');
    if (bulkCategoryBtn) bulkCategoryBtn.onclick = applyBulkCategory;
    if (bulkExportBtn) bulkExportBtn.onclick = exportSelectedRows;
    if (bulkDeleteBtn) bulkDeleteBtn.onclick = deleteSelectedRows;
    if (timelineInoutBtn) timelineInoutBtn.onclick = () => navigateTo('inout');

    container.querySelectorAll('#inventory-body tr[data-row-key]').forEach(rowEl => {
      rowEl.addEventListener('click', (event) => {
        if (event.target.closest('button, input, select, a, label, .editable-cell')) return;
        focusedItemKey = rowEl.dataset.rowKey || focusedItemKey;
        renderTable();
      });
    });

    // ?몃씪???몄쭛
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
          // ?⑷퀎 ?ш퀎??(留ㅼ엯?④? ?먮뒗 ?먮ℓ?④? 蹂寃???
          // 수량·단가·판매가 변경 시 금액 재계산 (VAT 비율은 기존 품목 설정 유지)
          if (field === 'quantity' || field === 'unitPrice' || field === 'salePrice') {
            const current = { ...data[idx] };
            recalcItemAmounts(current); // supplyValue, vat, totalPrice 정확히 재계산
            updateItem(idx, {
              supplyValue: current.supplyValue,
              vat: current.vat,
              totalPrice: current.totalPrice,
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
        if (!canAction('item:delete')) {
          showToast('삭제 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning');
          return;
        }
        try {
          const idx = parseInt(btn.dataset.idx);
          const name = data[idx]?.itemName || `${idx + 1}번 품목`;
          const removed = deleteItem(idx);
          if (!removed?.deleted) {
            showToast('삭제할 품목을 찾지 못했습니다.', 'warning');
            return;
          }
          shiftSelectionAfterDelete(idx);
          renderTable();
          updateStats();
          showToast(`"${name}" 품목을 삭제했습니다.`, 'info', 5000, {
            actionLabel: '실행 취소',
            onAction: () => {
              try {
                restoreItem(removed.deleted, removed.index);
                renderTable();
                updateStats();
                showToast(`"${name}" 품목을 복원했습니다.`, 'success');
              } catch (err) {
                handlePageError(err, { page: 'inventory', action: 'restore-item' });
              }
            },
          });
        } catch (err) {
          handlePageError(err, { page: 'inventory', action: 'delete-item' });
        }
      });
    });

    // 수정
    container.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!canAction('item:edit')) {
          showToast('수정 권한이 없습니다. 직원 이상만 가능합니다.', 'warning');
          return;
        }
        try {
          const idx = parseInt(btn.dataset.idx);
          openItemModal(container, navigateTo, idx);
        } catch (err) {
          handlePageError(err, { page: 'inventory', action: 'open-edit-modal' });
        }
      });
    });

    // 페이지당 행 수
    container.querySelectorAll('.btn-safety').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        const currentMin = btn.dataset.min;
        const input = prompt(
          `"${name}" 품목의 안전재고(최소 수량)를 입력해 주세요.\n비워 두면 해제됩니다.`,
          currentMin
        );
        if (input === null) return; // 痍⑥냼
        if (input.trim() === '') {
          setSafetyStock(name, undefined);
          showToast(`"${name}" 안전재고를 해제했습니다.`, 'info');
        } else {
          const num = parseInt(input);
          if (isNaN(num) || num < 0) {
            showToast('숫자를 입력해 주세요.', 'warning');
            return;
          }
          setSafetyStock(name, num);
          showToast(`"${name}" 안전재고를 ${num}로 설정했습니다.`, 'success');
        }
        renderTable();
        updateStats();
      });
    });
  }

  // 페이지당 행 수
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

  // ?듦퀎 ?낅뜲?댄듃
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
    // warningCount ?섎━癒쇳듃???꾩뿉???쒓? display:none ?섍굅???꾩삁 類먮뒗??.. (?댁씠荑?類먮꽕??
    // 페이지당 행 수
    const warnEl = container.querySelector('#stat-warn');
    if (warnEl) {
      warnEl.textContent = wc > 0 ? `${wc}건` : '없음';
      warnEl.className = `stat-value ${wc > 0 ? 'text-danger' : ''}`;
    }
  }

  initCollapsibleSections();

  // === 상태 변수 ===

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

  const colPanelClickOutside = (e) => {
    if (!colPanel.contains(e.target) && e.target !== colBtn) {
      colPanel.classList.remove('open');
    }
  };
  document.addEventListener('click', colPanelClickOutside);
  container.addEventListener('invex:page-unload', () => {
    document.removeEventListener('click', colPanelClickOutside);
  }, { once: true });

  // 페이지당 행 수
  container.querySelector('#col-select-all').addEventListener('click', () => {
    container.querySelectorAll('.col-check').forEach(cb => { cb.checked = true; });
  });

  // 페이지당 행 수
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
    showToast(`${checked.length}개 항목을 표시하도록 적용했습니다.`, 'success');
  });

  // 페이지당 행 수
  container.querySelector('#btn-quick-inout')?.addEventListener('click', () => navigateTo('inout'));
  container.querySelector('#btn-quick-guide')?.addEventListener('click', () => navigateTo('guide'));
  container.querySelector('#btn-quick-dashboard')?.addEventListener('click', () => navigateTo('home'));
  container.querySelector('#btn-add-item-inline')?.addEventListener('click', () => openItemModal(container, navigateTo));
  container.querySelector('#btn-dismiss-upload-diff')?.addEventListener('click', () => {
    setState({ lastUploadDiff: null });
    container.querySelector('#upload-diff-card')?.remove();
  });
  container.querySelectorAll('[data-nav]').forEach(button => {
    button.addEventListener('click', () => navigateTo(button.dataset.nav));
  });

  function syncFocusChips() {
    container.querySelectorAll('[data-inventory-focus]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.inventoryFocus === currentFilter.focus);
    });
  }

  container.querySelectorAll('[data-inventory-focus]').forEach(button => {
    button.addEventListener('click', () => {
      currentFilter.focus = button.dataset.inventoryFocus || 'all';
      if (currentFilter.focus === 'low') {
        currentFilter.stock = 'low';
        const stockFilter = container.querySelector('#filter-stock');
        if (stockFilter) stockFilter.value = 'low';
      } else if (currentFilter.stock === 'low' && currentFilter.focus !== 'all') {
        currentFilter.stock = '';
        const stockFilter = container.querySelector('#filter-stock');
        if (stockFilter) stockFilter.value = '';
      }
      if (currentFilter.focus === 'all') {
        currentFilter.stock = '';
        const stockFilter = container.querySelector('#filter-stock');
        if (stockFilter) stockFilter.value = '';
      }
      currentPageNum = 1;
      renderTable();
      highlightActiveFilters();
      syncFocusChips();
      persistInventoryPrefs();
    });
  });

  // === 품목 추가/편집 모달 ===
  function applyKeywordFilter(nextKeyword, { debounced = true } = {}) {
    currentFilter.keyword = nextKeyword;
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    persistInventoryPrefs({ debounced });
  }

  container.querySelectorAll('[data-smart-query]').forEach(button => {
    button.addEventListener('click', () => {
      const keywordInput = container.querySelector('#search-input');
      const token = String(button.dataset.smartQuery || '').trim();
      if (!keywordInput || !token) return;
      const current = String(keywordInput.value || '').trim();
      const next = current ? `${current} ${token}` : token;
      keywordInput.value = next;
      applyKeywordFilter(next);
      keywordInput.focus();
    });
  });

  container.querySelector('#search-input').addEventListener('input', (e) => {
    applyKeywordFilter(e.target.value);
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
    if (e.target.value === 'low') currentFilter.focus = 'low';
    else if (currentFilter.focus === 'low') currentFilter.focus = 'all';
    currentPageNum = 1;
    renderTable();
    highlightActiveFilters();
    syncFocusChips();
    persistInventoryPrefs();
  });
  container.querySelector('#sort-preset').addEventListener('change', (e) => {
    currentSort = sanitizeInventorySort(parseSortPreset(e.target.value));
    currentPageNum = 1;
    renderTableHeader();
    renderTable();
    persistInventoryPrefs();
  });

  // 패널 열기/닫기
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
    syncFocusChips();
    persistInventoryPrefs();
    showToast('필터와 정렬을 초기화했습니다.', 'info');
  });

  // 상세 필터 토글 — 기본 숨김, 클릭 시 패널 열기/닫기
  container.querySelector('#btn-filter-toggle')?.addEventListener('click', () => {
    const panel = container.querySelector('#filter-detail-panel');
    if (panel) panel.classList.toggle('is-open');
  });

  // ?꾪꽣 ?쒖꽦 ?곹깭 ?쒓컖???쒖떆
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

  // 재고 재계산 (입출고 이력 기반)
  container.querySelector('#btn-rebuild-inventory')?.addEventListener('click', () => {
    const txCount = (getState().transactions || []).length;
    if (txCount === 0) {
      showToast('입출고 이력이 없어서 재계산할 수 없습니다.', 'warning');
      return;
    }
    rebuildInventoryFromTransactions();
    showToast(`입출고 ${txCount}건 기준으로 재고를 재계산했습니다.`, 'success');
    renderInventoryPage(container, navigateTo);
  });

  // 페이지당 행 수
  container.querySelector('#btn-export').addEventListener('click', () => {
    try {
      const exportData = data.map(row => {
        const obj = {};
        activeFields.forEach(key => { obj[FIELD_LABELS[key]] = row[key]; });
        return obj;
      });
      const baseName = (state.fileName || '재고현황').replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_재고현황`);
      showToast('엑셀 파일을 내려받았습니다.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // PDF ?대낫?닿린
  container.querySelector('#btn-export-pdf')?.addEventListener('click', () => {
    generateInventoryPDF(data);
  });

  // 페이지당 행 수
  container.querySelector('#btn-add-item').addEventListener('click', () => {
    openItemModal(container, navigateTo);
  });

  // === 상태 변수 ===
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
  syncFocusChips();

  // 입출고 변경 시 재고 현황 즉시 자동 반영
  // renderTable은 클로저 내 data를 쓰므로 전체 페이지를 재렌더링
  setSyncCallback(() => {
    renderInventoryPage(container, navigateTo);
  });

  if (sessionStorage.getItem('invex:quick-open-item') === '1') {
    sessionStorage.removeItem('invex:quick-open-item');
    setTimeout(() => openItemModal(container, navigateTo), 20);
  }
}

// === 품목 추가/편집 모달 ===

function openItemModal(container, navigateTo, editIdx = null) {
  const state = getState();
  const isEdit = editIdx !== null;
  const item = isEdit ? (state.mappedData[editIdx] || {}) : {};

  /* ── 마스터 데이터 조회 ── */
  const vendors   = (state.vendorMaster || []).filter(v => v.type === 'supplier' || v.type === 'both');
  const existingCats = [...new Set((state.mappedData || []).map(d => d.category).filter(Boolean))].sort();
  const existingUnits = [...new Set((state.mappedData || []).map(d => d.unit).filter(Boolean))].sort();

  /* ── 품목코드 자동생성 ── */
  function genItemCode() {
    const items = state.mappedData || [];
    const nums = items.map(d => parseInt((d.itemCode || '').replace(/\D/g, '')) || 0);
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return 'I' + String(next).padStart(5, '0');
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? '품목 수정' : '새 품목 추가'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-shell">
          <div class="form-shell-main">
            ${renderGuidedPanel({
              eyebrow: '품목 입력 순서',
              title: isEdit ? '필수값만 먼저 확인하고 빠르게 수정하세요.' : '필수값만 입력해도 바로 저장할 수 있습니다.',
              desc: '품목명, 수량, 원가만 입력하면 재고 금액 계산이 즉시 됩니다. 거래처, 위치, 판매가는 나중에 채워도 괜찮습니다.',
              badge: isEdit ? '수정 모드' : '초보자 추천',
              steps: [
                { kicker: 'STEP 1', title: '품목명과 수량 입력', desc: '현장에서 부르는 이름 그대로 적으면 검색이 빨라집니다.' },
                { kicker: 'STEP 2', title: '원가와 판매가 확인', desc: '판매가를 넣으면 손익 분석 정확도가 올라갑니다.' },
                { kicker: 'STEP 3', title: '거래처와 위치는 보강 추천', desc: '지금 급하면 비워두고 저장 후 다시 수정해도 됩니다.' },
              ],
            })}

            <!-- datalist 마스터 -->
            <datalist id="dl-category">${existingCats.map(c => `<option value="${c}">`).join('')}</datalist>
            <datalist id="dl-unit">${existingUnits.map(u => `<option value="${u}">`).join('')}<option value="EA"><option value="BOX"><option value="KG"><option value="L"><option value="M"><option value="SET"></datalist>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">품목명 <span class="required">*</span></label>
                <input class="form-input" id="f-itemName" value="${item.itemName || ''}" placeholder="예: A4용지, 복사용지 80g" />
              </div>
              <div class="form-group">
                <label class="form-label">품목코드</label>
                <div style="display:flex; gap:6px;">
                  <input class="form-input" id="f-itemCode" value="${item.itemCode || ''}" placeholder="예: I00001" style="flex:1;" />
                  ${!isEdit ? `<button type="button" class="btn btn-outline btn-sm" id="btn-auto-code" title="자동생성" style="white-space:nowrap; padding:0 10px;">자동</button>` : ''}
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">규격/스펙</label>
                <input class="form-input" id="f-spec" value="${item.spec || ''}" placeholder="예: 80g/m², A4, 500매" />
              </div>
              <div class="form-group">
                <label class="form-label">분류(카테고리)</label>
                <input class="form-input" id="f-category" list="dl-category" value="${item.category || ''}" placeholder="예: 사무용품" autocomplete="off" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">수량 <span class="required">*</span></label>
                <input class="form-input" type="number" id="f-quantity" value="${item.quantity ?? ''}" placeholder="0" />
              </div>
              <div class="form-group">
                <label class="form-label">단위</label>
                <input class="form-input" id="f-unit" list="dl-unit" value="${item.unit || ''}" placeholder="EA, BOX, KG ..." autocomplete="off" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">매입가(원가)</label>
                <input class="form-input" type="number" id="f-unitPrice" value="${item.unitPrice ?? ''}" placeholder="0" />
              </div>
              <div class="form-group">
                <label class="form-label">판매단가</label>
                <input class="form-input" type="number" id="f-salePrice" value="${item.salePrice ?? ''}" placeholder="미입력 시 손익 정확도가 내려갑니다." />
              </div>
            </div>

            <details class="smart-details" open>
              <summary>추가 정보 더 보기</summary>
              <div class="smart-details-body">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">주공급처</label>
                    <select class="form-select" id="f-vendor">
                      <option value="">-- 선택 또는 직접 입력 --</option>
                      ${vendors.map(v => `<option value="${v.name}" ${item.vendor === v.name ? 'selected' : ''}>${v.name}${v.code ? ` (${v.code})` : ''}</option>`).join('')}
                      ${item.vendor && !vendors.find(v => v.name === item.vendor) ? `<option value="${item.vendor}" selected>${item.vendor}</option>` : ''}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">창고/위치</label>
                    <input class="form-input" id="f-warehouse" value="${item.warehouse || ''}" placeholder="예: 본사 1층 A-03" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">비고</label>
                    <input class="form-input" id="f-note" value="${item.note || ''}" placeholder="메모" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">🔒 품목 잠금 해제일</label>
                    <input class="form-input" type="date" id="f-lockedUntil" value="${item.lockedUntil || ''}" />
                  </div>
                  <div class="form-group">
                    <div style="font-size:12px; color:var(--text-muted); margin-top:28px; line-height:1.6;">
                      잠금 해제일까지 🔒 표시됩니다.<br>해당 날짜가 지나면 자동으로 잠금이 해제됩니다.
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div class="form-shell-side">
            <div class="form-card">
              <div class="form-card-title">입력 진행 상태</div>
              <div class="form-card-desc">필수값만 채워도 저장됩니다. 판매가, 거래처, 위치는 보강 추천 항목입니다.</div>
              <div class="form-status-list" id="item-status-list"></div>
            </div>
            <div class="smart-summary-grid">
              <div class="smart-summary-item">
                <div class="smart-summary-label">현재 재고 가치</div>
                <div class="smart-summary-value" id="f-totalPriceLabel">₩0</div>
                <div class="smart-summary-note" id="item-price-note">수량과 원가를 입력하면 공급가액, 부가세, 합계가 자동 계산됩니다.</div>
                <input type="hidden" id="f-supplyValue" value="${item.supplyValue ?? ''}" />
                <input type="hidden" id="f-vat" value="${item.vat ?? ''}" />
                <input type="hidden" id="f-totalPrice" value="${item.totalPrice ?? ''}" />
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">예상 판매 기준 차익</div>
                <div class="smart-summary-value" id="f-marginLabel">미입력</div>
                <div class="smart-summary-note" id="item-margin-note">판매가를 넣으면 원가 대비 차익을 바로 볼 수 있습니다.</div>
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">데이터 품질</div>
                <div class="smart-summary-value" id="item-quality-label">기본 입력 전</div>
                <div class="smart-summary-note" id="item-quality-note">거래처와 위치 정보가 있으면 발주와 보고가 훨씬 쉬워집니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn btn-primary" id="modal-save">${isEdit ? '수정 저장' : '품목 저장'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const inputs = {
    name:      overlay.querySelector('#f-itemName'),
    code:      overlay.querySelector('#f-itemCode'),
    spec:      overlay.querySelector('#f-spec'),
    quantity:  overlay.querySelector('#f-quantity'),
    unit:      overlay.querySelector('#f-unit'),
    unitPrice: overlay.querySelector('#f-unitPrice'),
    salePrice: overlay.querySelector('#f-salePrice'),
    category:  overlay.querySelector('#f-category'),
    vendor:       overlay.querySelector('#f-vendor'),
    warehouse:    overlay.querySelector('#f-warehouse'),
    note:         overlay.querySelector('#f-note'),
    lockedUntil:  overlay.querySelector('#f-lockedUntil'),
  };

  /* ── 품목코드 자동생성 버튼 ── */
  overlay.querySelector('#btn-auto-code')?.addEventListener('click', () => {
    inputs.code.value = genItemCode();
  });

  const formatMoney = (value) => `₩${Math.round(value || 0).toLocaleString('ko-KR')}`;

  const refreshItemSummary = () => {
    const qty = parseFloat(inputs.quantity.value) || 0;
    const unitPrice = parseFloat(inputs.unitPrice.value) || 0;
    const salePrice = parseFloat(inputs.salePrice.value) || 0;
    const supply = qty * unitPrice;
    const vat = Math.floor(supply * 0.1);
    const total = supply + vat;

    overlay.querySelector('#f-supplyValue').value = supply;
    overlay.querySelector('#f-vat').value = vat;
    overlay.querySelector('#f-totalPrice').value = total;
    overlay.querySelector('#f-totalPriceLabel').textContent = total > 0 ? formatMoney(total) : '₩0';
    overlay.querySelector('#item-price-note').textContent =
      total > 0
        ? `공급가액 ${formatMoney(supply)} / 부가세 ${formatMoney(vat)} / 합계 ${formatMoney(total)}`
        : '수량과 원가를 입력하면 공급가액, 부가세, 합계가 자동 계산됩니다.';

    const marginPerUnit = salePrice > 0 ? salePrice - unitPrice : null;
    overlay.querySelector('#f-marginLabel').textContent =
      marginPerUnit === null ? '미입력' : `${marginPerUnit >= 0 ? '+' : '-'}${formatMoney(Math.abs(marginPerUnit))}`;
    overlay.querySelector('#item-margin-note').textContent =
      marginPerUnit === null
        ? '판매가를 넣으면 원가 대비 차익을 바로 볼 수 있습니다.'
        : `판매단가 기준 예상 차익은 개당 ${marginPerUnit >= 0 ? '+' : '-'}${formatMoney(Math.abs(marginPerUnit))}입니다.`;

    const statusItems = [
      { done: !!inputs.name.value.trim(), text: '품목명이 입력되었습니다.' },
      { done: inputs.quantity.value !== '', text: '수량이 입력되었습니다.' },
      { done: unitPrice > 0, text: '원가가 입력되었습니다.' },
      { done: salePrice > 0, text: '판매가가 입력되었습니다.' },
      { done: !!inputs.vendor.value.trim(), text: '거래처가 연결되었습니다.' },
      { done: !!inputs.warehouse.value.trim(), text: '창고/위치가 입력되었습니다.' },
    ];
    overlay.querySelector('#item-status-list').innerHTML = statusItems.map(entry => `
      <div class="form-status-item ${entry.done ? 'is-complete' : ''}">${entry.text}</div>
    `).join('');

    const completedQuality = statusItems.filter(entry => entry.done).length;
    overlay.querySelector('#item-quality-label').textContent = `${completedQuality}/6 단계 완료`;
    overlay.querySelector('#item-quality-note').textContent =
      completedQuality >= 5
        ? '보고와 발주에 필요한 정보가 대부분 잘 채워져 있습니다.'
        : '거래처, 위치, 판매가를 채우면 보고와 원가 분석 품질이 더 좋아집니다.';
  };

  Object.values(inputs).forEach(input => {
    input?.addEventListener('input', refreshItemSummary);
  });
  refreshItemSummary();

  overlay.querySelector('#modal-save').addEventListener('click', () => {
    // ── 모든 에러 초기화 ──────────────────────────────────
    clearAllFieldErrors(overlay);

    let hasError = false;
    const name    = inputs.name.value.trim();
    const qtyRaw  = inputs.quantity.value.trim();
    const upRaw   = inputs.unitPrice.value.trim();
    const spRaw   = inputs.salePrice.value.trim();

    // 1. 품목명 필수
    if (!name) {
      showFieldError(inputs.name, '품목명은 필수입니다.');
      hasError = true;
    } else {
      // 중복 품목명 체크 (수정 모드 제외)
      const state2 = getState();
      const existingNames = (state2.mappedData || []).map(d => d.itemName?.trim().toLowerCase());
      if (!isEdit && existingNames.includes(name.toLowerCase())) {
        showFieldError(inputs.name, `"${name}"은(는) 이미 등록된 품목명입니다.`);
        hasError = true;
      }
    }

    // 2. 수량 — 숫자, 0 이상
    let qty = 0;
    if (qtyRaw !== '') {
      qty = parseFloat(qtyRaw);
      if (isNaN(qty)) {
        showFieldError(inputs.quantity, '수량에 숫자만 입력해 주세요.');
        hasError = true;
      } else if (qty < 0) {
        showFieldError(inputs.quantity, '수량은 0 이상이어야 합니다.');
        hasError = true;
      }
    }

    // 3. 원가 — 숫자, 음수 불가
    let unitPrice = 0;
    if (upRaw !== '') {
      unitPrice = parseFloat(upRaw);
      if (isNaN(unitPrice)) {
        showFieldError(inputs.unitPrice, '원가에 숫자만 입력해 주세요.');
        hasError = true;
      } else if (unitPrice < 0) {
        showFieldError(inputs.unitPrice, '원가는 0 이상이어야 합니다.');
        hasError = true;
      }
    }

    // 4. 판매가 — 숫자, 음수 불가
    let salePrice = 0;
    if (spRaw !== '') {
      salePrice = parseFloat(spRaw);
      if (isNaN(salePrice)) {
        showFieldError(inputs.salePrice, '판매가에 숫자만 입력해 주세요.');
        hasError = true;
      } else if (salePrice < 0) {
        showFieldError(inputs.salePrice, '판매가는 0 이상이어야 합니다.');
        hasError = true;
      } else if (salePrice > 0 && unitPrice > 0 && salePrice < unitPrice) {
        // 경고 (에러는 아님 — 저장은 가능)
        const warnEl = document.createElement('div');
        warnEl.className = 'form-warn-msg';
        warnEl.textContent = '판매가가 원가보다 낮습니다. 손실이 발생할 수 있습니다.';
        inputs.salePrice.parentNode?.appendChild(warnEl);
      }
    }

    if (hasError) return;

    // ── 저장 ─────────────────────────────────────────────
    const restore = setSavingState(overlay.querySelector('#modal-save'));
    try {
      const newItem = {
        itemName:    name,
        itemCode:    inputs.code.value.trim(),
        spec:        inputs.spec.value.trim(),
        category:    inputs.category.value.trim(),
        vendor:      inputs.vendor.value,
        quantity:    qty,
        unit:        inputs.unit.value.trim(),
        unitPrice,
        salePrice,
        warehouse:   inputs.warehouse.value.trim(),
        note:        inputs.note.value.trim(),
        lockedUntil: inputs.lockedUntil.value || null,
      };
      // 수정 시 기존 VAT 비율 유지, 신규는 기본 10%
      if (isEdit) {
        // 기존 품목 VAT 비율 추론하여 유지
        const prevItem = getState().mappedData[editIdx] || {};
        const prevSv = parseFloat(prevItem.supplyValue) || 0;
        const prevVat = parseFloat(prevItem.vat) || 0;
        const vatRate = (prevSv > 0 && prevVat / prevSv < 0.05) ? 0 : 0.1;
        newItem.supplyValue = newItem.quantity * newItem.unitPrice;
        newItem.vat         = Math.floor(newItem.supplyValue * vatRate);
        newItem.totalPrice  = newItem.supplyValue + newItem.vat;
      } else {
        newItem.supplyValue = newItem.quantity * newItem.unitPrice;
        newItem.vat         = Math.floor(newItem.supplyValue * 0.1);
        newItem.totalPrice  = newItem.supplyValue + newItem.vat;
      }

      if (isEdit) {
        updateItem(editIdx, newItem);
        showToast(`"${name}" 품목을 수정했습니다.`, 'success');
      } else {
        addItem(newItem);
        showToast(`"${name}" 품목을 추가했습니다.`, 'success');
      }
      close();
      renderInventoryPage(container, navigateTo);
    } catch (err) {
      restore();
      handlePageError(err, { page: 'inventory', action: 'save-item' });
    }
  });

  setTimeout(() => overlay.querySelector('#f-itemName').focus(), 100);
}

// === ?좏떥 ===

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
  return escapeHtml(String(value));
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
 * 현재 표시할 컬럼 목록 결정
 * 현재 표시할 컬럼 목록 결정
 */
function getItemCodes(data) {
  return [...new Set(data.map(r => r.itemCode).filter(Boolean))].sort();
}

/**
 * 현재 표시할 컬럼 목록 결정
 * 현재 표시할 컬럼 목록 결정
 */
function getVendors(data) {
  return [...new Set(data.map(r => r.vendor).filter(Boolean))].sort();
}

