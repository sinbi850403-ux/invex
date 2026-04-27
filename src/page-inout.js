/**
 * page-inout.js - 입출고 관리 페이지
 * 역할: 입고/출고 기록 등록, 이력 조회, 재고 자동 반영
 * 핵심: 입출고를 기록하면 재고 현황의 수량이 자동으로 증감됨
 */

import { getState, setState, addTransaction, addTransactionsBulk, deleteTransaction, restoreTransaction, updateTransactionPrices } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel, downloadExcelSheets, readExcelFile } from './excel.js';
import { escapeHtml, renderQuickFilterRow, enableColumnResize } from './ux-toolkit.js';
import { canAction } from './auth.js';
import { handlePageError } from './error-monitor.js';
import { showFieldError, clearAllFieldErrors, setSavingState } from './ux-toolkit.js';

const PAGE_SIZE = 15;
const BULK_INOUT_TEMPLATE_HEADERS = ['자산', '입고일자', '거래처', '상품코드', '품명', '규격', '단위', '입고수량', '단가'];

function safeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildOptionTags(values) {
  return values.map(value => `<option value="${safeAttr(value)}">${escapeHtml(String(value))}</option>`).join('');
}

/**
 * 날짜 문자열을 YYYY-MM-DD 형식으로 변환
 * "Tue Apr 14 2026 09:00:00 GMT+0900" 등 다양한 형식 처리
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  // 이미 YYYY-MM-DD 형식이면 그대로 반환
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 입출고 관리 페이지 렌더링
 */
/**
 * mode: 'all' | 'in' | 'out'
 *  - 'all' → 기존 입출고 통합 뷰
 *  - 'in'  → 입고관리 전용 (입고 기록만, 제목·기본필터 변경)
 *  - 'out' → 출고관리 전용 (출고 기록만, 제목·기본필터 변경)
 */
export function renderInoutPage(container, navigateTo, mode = 'all') {
  // ── 권한 플래그 ──────────────────────────────────────────
  const canCreate = canAction('inout:create');
  const canDelete = canAction('inout:delete');
  const canBulk   = canAction('inout:bulk');
  // ─────────────────────────────────────────────────────────

  // mode별 설정
  const isInMode  = mode === 'in';
  const isOutMode = mode === 'out';
  const pageTitle  = isInMode ? '입고 관리' : isOutMode ? '출고 관리' : '입출고 관리';
  const pageIcon   = isInMode ? '' : isOutMode ? '' : '';
  const initialQuick = isInMode ? 'in' : isOutMode ? 'out' : 'all';

  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const beginnerMode = state.beginnerMode !== false;
  const sortOptions = [
    { value: 'date:desc', label: '최신 날짜 순' },
    { value: 'date:asc', label: '오래된 날짜 순' },
    { value: 'quantity:desc', label: '수량 많은 순' },
    { value: 'quantity:asc', label: '수량 적은 순' },
    { value: 'itemName:asc', label: '품목명 가나다순' },
    { value: 'vendor:asc', label: '거래처 가나다순' },
  ];
  const todayTxIn = countToday(transactions, 'in');
  const todayTxOut = countToday(transactions, 'out');
  const inTxList  = transactions.filter(tx => tx.type === 'in');
  const outTxList = transactions.filter(tx => tx.type === 'out');
  const vendorMissingCount = transactions.filter(tx => !String(tx.vendor || '').trim()).length;

  // 모드별 통계
  const statTotalLabel = isInMode ? '전체 입고' : isOutMode ? '전체 출고' : '전체 기록';
  const statTotalValue = isInMode ? inTxList.length : isOutMode ? outTxList.length : transactions.length;
  const statTodayLabel = isInMode ? '오늘 입고' : isOutMode ? '오늘 출고' : '오늘 입고';
  const statTodayValue = isInMode ? todayTxIn : isOutMode ? todayTxOut : todayTxIn;
  const statTodayClass = isInMode ? 'text-success' : isOutMode ? 'text-danger' : 'text-success';
  const stat3Label    = isInMode ? '이번달 입고' : isOutMode ? '이번달 출고' : '오늘 출고';
  const now = new Date(); const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthInCount  = inTxList.filter(tx => String(tx.date||'').startsWith(monthKey)).length;
  const monthOutCount = outTxList.filter(tx => String(tx.date||'').startsWith(monthKey)).length;
  const stat3Value    = isInMode ? monthInCount : isOutMode ? monthOutCount : todayTxOut;
  const stat3Class    = isInMode ? 'text-success' : isOutMode ? 'text-danger' : 'text-danger';

  // 모드별 빠른 필터 칩
  const quickTxFilters = isInMode
    ? [
        { value: 'in',     label: '전체 보기' },
        { value: 'today',  label: '오늘 기록' },
        { value: 'recent3',label: '최근 3일' },
        { value: 'missingVendor', label: '거래처 미입력' },
      ]
    : isOutMode
      ? [
          { value: 'out',    label: '전체 보기' },
          { value: 'today',  label: '오늘 기록' },
          { value: 'recent3',label: '최근 3일' },
          { value: 'missingVendor', label: '거래처 미입력' },
        ]
      : [
          { value: 'all',   label: '전체 보기' },
          { value: 'today', label: '오늘 기록' },
          { value: 'in',    label: '입고만' },
          { value: 'out',   label: '출고만' },
          { value: 'missingVendor', label: '거래처 미입력' },
          { value: 'recent3', label: '최근 3일' },
        ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"> ${pageTitle}</h1>
        <div class="page-desc">${
          isInMode  ? '입고 기록을 등록하면 재고 수량이 자동으로 증가합니다.' :
          isOutMode ? '출고 기록을 등록하면 재고 수량이 자동으로 감소합니다.' :
                     '입고와 출고를 기록하면 재고 수량이 자동으로 반영됩니다.'
        }</div>
      </div>
      <div class="page-actions">
        ${!isOutMode ? '' : ''}
        <button class="btn btn-outline" id="btn-export-tx">이력 내보내기</button>
        <button class="btn btn-outline" id="btn-bulk-upload">엑셀 일괄 등록</button>
        ${!isOutMode ? `<button class="btn btn-success" id="btn-in">입고 등록</button>` : ''}
        ${!isInMode  ? `<button class="btn btn-danger"  id="btn-out">출고 등록</button>` : ''}
      </div>
    </div>

    <!-- 모드별 통계 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">${statTotalLabel}</div>
        <div class="stat-value text-accent">${statTotalValue}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${statTodayLabel}</div>
        <div class="stat-value ${statTodayClass}">${statTodayValue}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${stat3Label}</div>
        <div class="stat-value ${stat3Class}">${stat3Value}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">등록 품목 수</div>
        <div class="stat-value">${items.length}</div>
      </div>
    </div>

    ${renderQuickFilterRow({
      label: '빠른 조건',
      attr: 'data-tx-quick',
      chips: quickTxFilters.map((chip, i) => ({ ...chip, active: i === 0 })),
    })}

    <!-- 검색 툴바 -->
    <div class="toolbar">
      <input type="text" class="search-input" id="tx-search" placeholder="품목명 또는 코드로 검색..." />
      ${isInMode || isOutMode ? '' : `
      <select class="filter-select" id="tx-type-filter">
        <option value="">전체</option>
        <option value="in">입고만</option>
        <option value="out">출고만</option>
      </select>`}
      ${isInMode ? `<select class="filter-select" id="tx-type-filter" style="display:none;"><option value="in" selected>입고만</option></select>` : ''}
      ${isOutMode ? `<select class="filter-select" id="tx-type-filter" style="display:none;"><option value="out" selected>출고만</option></select>` : ''}
      <select class="filter-select" id="tx-vendor-filter">
        <option value="">전체 거래처</option>
        ${buildOptionTags(getVendorOptions(transactions, items))}
      </select>
      <select class="filter-select" id="tx-code-filter">
        <option value="">전체 품목코드</option>
        ${buildOptionTags(getCodeList(items))}
      </select>
      <input type="date" class="filter-select" id="tx-date-filter" style="padding:7px 10px;" />
      <select class="filter-select" id="tx-sort-filter">
        ${sortOptions.map(option => `<option value="${safeAttr(option.value)}">${escapeHtml(option.label)}</option>`).join('')}
      </select>
      <button class="btn btn-ghost btn-sm" id="tx-filter-reset" title="필터 초기화">초기화</button>
    </div>
    <div class="filter-summary" id="tx-filter-summary"></div>

    <!-- 테이블 영역 -->
    <div class="card card-flush">
      <div style="padding:12px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); background:var(--bg-lighter);">
        <div style="font-size:13px; font-weight:600;" id="tx-selection-info">선택 0건</div>
        <button class="btn btn-danger btn-sm" id="btn-tx-bulk-delete" disabled>선택 삭제</button>
      </div>
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
        등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
      </div>
    ` : ''}
  `;

  let currentPageNum = 1;
  let selectedTxIds = new Set();
  const expandedGroups = new Set(); // 펼쳐진 그룹 키
  const defaultFilter = { keyword: '', type: '', date: '', vendor: '', itemCode: '', quick: initialQuick };
  const defaultSort = { key: 'date', direction: 'desc' };
  // mode가 'in'/'out'이면 저장된 필터 무시하고 항상 해당 타입으로 고정
  const savedViewPrefs = (isInMode || isOutMode) ? {} : (state.inoutViewPrefs || {});
  let filter = sanitizeInoutFilter(savedViewPrefs.filter);
  // mode 고정: in/out 전용 페이지에서는 type·quick 필터를 mode로 강제 설정
  if (isInMode)  { filter.quick = 'in';  filter.type = 'in';  }
  if (isOutMode) { filter.quick = 'out'; filter.type = 'out'; }
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
      quick: ['all', 'today', 'in', 'out', 'missingVendor', 'recent3'].includes(candidate.quick) ? candidate.quick : 'all',
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
    const it = itemMap.get(tx.itemName) || {};
    const qty = parseFloat(tx.quantity) || 0;

    if (key === 'date') {
      const source = tx.date || tx.createdAt;
      if (!source) return 0;
      const ts = new Date(source).getTime();
      return Number.isNaN(ts) ? 0 : ts;
    }
    if (key === 'quantity')  return qty;
    if (key === 'unitPrice') return parseFloat(tx.unitPrice) || 0;
    if (key === 'itemCode')  return (tx.itemCode || it.itemCode || '').toLowerCase();
    if (key === 'spec')      return (tx.spec  || it.spec  || '').toLowerCase();
    if (key === 'unit')      return (tx.unit  || it.unit  || '').toLowerCase();

    // ── 입고 계산 필드 ──────────────────────────────
    const inCost   = parseFloat(tx.unitPrice) || 0;
    const inSupply = Math.round(inCost * qty);
    const inVat    = Math.floor(inSupply * 0.1);
    if (key === 'supplyValue')   return inSupply;
    if (key === 'vatValue')      return inVat;
    if (key === 'totalAmount')   return inSupply + inVat;

    // ── 출고 계산 필드 ──────────────────────────────
    const outCost     = parseFloat(it.unitPrice || tx.unitPrice) || 0;
    const purchaseAmt = Math.round(outCost * qty);
    const purchaseVat = Math.floor(purchaseAmt * 0.1);
    const saleUnit    = parseFloat(tx.actualSellingPrice || tx.sellingPrice || it.sellingPrice) || 0;
    const outAmt      = Math.round(saleUnit * qty);
    const outTotal    = Math.round(outAmt * 1.1);
    const profit      = outAmt - purchaseAmt;
    if (key === 'sellingPrice')   return saleUnit;
    if (key === 'outAmt')         return outAmt;
    if (key === 'outTotal')       return outTotal;
    if (key === 'purchaseAmt')    return purchaseAmt;
    if (key === 'purchaseVat')    return purchaseVat;
    if (key === 'purchaseTotal')  return purchaseAmt + purchaseVat;
    if (key === 'profitAmt')      return profit;
    if (key === 'profitRate')     return outAmt > 0 ? profit / outAmt * 100 : 0;
    if (key === 'costRate')       return outAmt > 0 ? purchaseAmt / outAmt * 100 : 0;

    // ── 전체 모드: 이익률 = (실판매가 - 원가) / 원가 ──
    if (key === 'marginRate') {
      const actualSell = parseFloat(tx.actualSellingPrice) || 0;
      const unitCost   = parseFloat(tx.unitPrice) || 0;
      return (unitCost > 0 && actualSell > 0) ? (actualSell - unitCost) / unitCost * 100 : 0;
    }
    if (key === 'actualSellingPrice') return parseFloat(tx.actualSellingPrice) || 0;

    const raw = tx[key];
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

  // 품목 맵 (규격·단위·카테고리 참조용)
  const itemMap = new Map(items.map(it => [it.itemName, it]));

  function sortableTh(key, label, extraClass = '') {
    const isActive = sort.key === key;
    const ariaSortVal = isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';
    return `<th class="sortable-header ${extraClass} ${isActive ? 'is-active' : ''}" data-sort-key="${key}" title="클릭하여 정렬" aria-sort="${ariaSortVal}">
      <button type="button" class="sort-hitbox" tabindex="-1" aria-hidden="true">
        <span class="sort-label">${label}</span><span class="sort-indicator">${getSortIndicator(key)}</span>
      </button>
    </th>`;
  }

  function renderTxHeader() {
    const thead = container.querySelector('#tx-head');
    if (!thead) return;

    let cols = '';
    if (isInMode) {
      // 입고관리: 자산|입고일자|거래처|상품코드|품명|규격|단위|입고수량|단가|공급가액|부가세|합계금액
      cols = `
        <th style="width:40px; text-align:center;"><input type="checkbox" id="tx-select-all" /></th>
        <th class="col-num">#</th>
        <th>자산</th>
        ${sortableTh('date',        '입고일자')}
        ${sortableTh('vendor',      '거래처')}
        ${sortableTh('itemCode',    '상품코드')}
        ${sortableTh('itemName',    '품명', 'col-fill')}
        ${sortableTh('spec',        '규격')}
        ${sortableTh('unit',        '단위')}
        ${sortableTh('quantity',    '입고수량',  'text-right')}
        ${sortableTh('unitPrice',   '단가',      'text-right')}
        ${sortableTh('supplyValue', '공급가액',  'text-right')}
        ${sortableTh('vatValue',    '부가세',    'text-right')}
        ${sortableTh('totalAmount', '합계금액',  'text-right')}`;
    } else if (isOutMode) {
      // 출고관리: 2행 헤더 (그룹: 판매/매입/이익 분석)
      thead.innerHTML = `
        <tr>
          <th rowspan="2" style="width:40px; text-align:center;"><input type="checkbox" id="tx-select-all" /></th>
          <th rowspan="2" class="col-num">#</th>
          <th rowspan="2">자산</th>
          ${sortableTh('date',     '출고일자'              ).replace('<th ', '<th rowspan="2" ')}
          ${sortableTh('vendor',   '거래처'                ).replace('<th ', '<th rowspan="2" ')}
          ${sortableTh('itemCode', '상품코드'              ).replace('<th ', '<th rowspan="2" ')}
          ${sortableTh('itemName', '품명', 'col-fill'      ).replace('<th ', '<th rowspan="2" ')}
          ${sortableTh('spec',     '규격'                  ).replace('<th ', '<th rowspan="2" ')}
          ${sortableTh('unit',     '단위'                  ).replace('<th ', '<th rowspan="2" ')}
          ${sortableTh('quantity', '출고수량', 'text-right').replace('<th ', '<th rowspan="2" ')}
          <th colspan="3" class="col-group-head col-group-sale">판매</th>
          <th colspan="3" class="col-group-head col-group-purchase">매입</th>
          <th colspan="3" class="col-group-head col-group-profit">이익 분석</th>
        </tr>
        <tr>
          ${sortableTh('sellingPrice',  '출고단가',   'text-right col-group-sale')}
          ${sortableTh('outAmt',        '판매가',     'text-right col-group-sale')}
          ${sortableTh('outTotal',      '출고합',     'text-right col-group-sale')}
          ${sortableTh('purchaseAmt',   '매입원가',   'text-right col-group-purchase')}
          ${sortableTh('purchaseVat',   '부가세',     'text-right col-group-purchase')}
          ${sortableTh('purchaseTotal', '공가합',     'text-right col-group-purchase')}
          ${sortableTh('profitAmt',     '이익액',     'text-right col-group-profit')}
          ${sortableTh('profitRate',    '이익률',     'text-right col-group-profit')}
          ${sortableTh('costRate',      '매출원가율', 'text-right col-group-profit')}
        </tr>`;
      // ★ return 제거 — 이벤트 바인딩 코드가 실행돼야 정렬이 동작함
    } else {
      // 전체(all) 모드
      cols = `
        <th style="width:40px; text-align:center;"><input type="checkbox" id="tx-select-all" /></th>
        <th class="col-num">#</th>
        ${sortableTh('type',               '구분')}
        ${sortableTh('vendor',             '거래처')}
        ${sortableTh('itemName',           '품목명',  'col-fill')}
        ${sortableTh('itemCode',           '품목코드')}
        ${sortableTh('quantity',           '수량',    'text-right')}
        ${sortableTh('unitPrice',          '원가',    'text-right')}
        ${sortableTh('sellingPrice',       '판매가',  'text-right')}
        ${sortableTh('actualSellingPrice', '실판매가','text-right')}
        ${sortableTh('marginRate',         '이익률',  'text-right')}
        ${sortableTh('date',               '날짜')}
        <th>비고</th>`;
    }

    // 출고 모드는 위에서 thead.innerHTML을 직접 설정했으므로 덮어쓰지 않음
    if (!isOutMode) {
      thead.innerHTML = `<tr>${cols}</tr>`;
    }

    const applySortByKey = (key) => {
      if (!key) return;
      if (sort.key !== key) {
        sort = { key, direction: 'asc' };
      } else if (sort.direction === 'asc') {
        sort = { key, direction: 'desc' };
      } else {
        sort = { ...defaultSort };
      }
      const sortFilterEl = container.querySelector('#tx-sort-filter');
      if (sortFilterEl) sortFilterEl.value = getSortPresetValue(sort);
      persistInoutPrefs();
      currentPageNum = 1;
      renderTxHeader();
      renderTxTable();
    };

    container.querySelectorAll('.sortable-header[data-sort-key]').forEach(header => {
      header.setAttribute('tabindex', '0');
      header.setAttribute('role', 'button');
      header.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        applySortByKey(header.dataset.sortKey);
      }, true);

      header.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        applySortByKey(header.dataset.sortKey);
      }, true);
    });

    enableColumnResize(container.querySelector('.data-table'));
  }

  function getFilteredTx() {
    const todayKey = new Date().toISOString().split('T')[0];
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 2);
    const recentCutoff = threeDaysAgo.toISOString().split('T')[0];
    return transactions.filter(tx => {
      const kw = filter.keyword.toLowerCase();
      if (kw && !(
        (tx.itemName || '').toLowerCase().includes(kw) ||
        (tx.itemCode || '').toLowerCase().includes(kw)
      )) return false;
      if (filter.type && tx.type !== filter.type) return false;
      if (filter.date && tx.date !== filter.date) return false;
      // 거래처 필터: 트랜잭션에 직접 기록된 거래처로 필터링
      //   같은 품목을 여러 거래처에서 입고할 수 있으므로 트랜잭션 기준이 정확
      //   같은 품목을 여러 거래처에서 입고할 수 있으므로 트랜잭션 기준이 정확
      if (filter.vendor && tx.vendor !== filter.vendor) return false;
      //   같은 품목을 여러 거래처에서 입고할 수 있으므로 트랜잭션 기준이 정확
      if (filter.itemCode && tx.itemCode !== filter.itemCode) return false;
      if (filter.quick === 'today' && tx.date !== todayKey) return false;
      if (filter.quick === 'in' && tx.type !== 'in') return false;
      if (filter.quick === 'out' && tx.type !== 'out') return false;
      if (filter.quick === 'missingVendor' && String(tx.vendor || '').trim()) return false;
      if (filter.quick === 'recent3' && String(tx.date || '') < recentCutoff) return false;
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
    if (filter.date) chips.push(`날짜: ${filter.date}`);
    chips.push(`정렬: ${getSortOptionLabel(sort)}`);

    summaryEl.innerHTML = `
      <div class="filter-summary-row">
        <div class="filter-summary-count">표시 ${filteredCount}건 / 전체 ${transactions.length}건</div>
        <div class="filter-summary-chips">
          ${chips.map(text => `<span class="filter-chip">${escapeHtml(text)}</span>`).join('')}
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
    if (!tbody) return;
    const totalColCount = isInMode ? 14 : isOutMode ? 21 : 13;
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${totalColCount}" style="text-align:center; padding:32px; color:var(--text-muted);">
        ${transactions.length === 0 ? '아직 입출고 기록이 없습니다. 위 버튼으로 먼저 등록해 주세요.' : '검색 결과가 없습니다.'}
      </td></tr>`;
    } else {
      // ── 현재 재고 현황 조회 (mappedData 기반 — 초기재고 포함) ──
      const currentStockByKey = new Map();
      (getState().mappedData || []).forEach(item => {
        const key = item.itemCode ? String(item.itemCode).trim() : String(item.itemName || '').trim();
        currentStockByKey.set(key, (currentStockByKey.get(key) || 0) + (parseFloat(item.quantity) || 0));
      });

      // ── 전체 필터 결과 기준 품목별 집계 (페이지 무관) ──────
      const allQtyByKey = new Map();
      sorted.forEach(tx => {
        const key = tx.itemCode ? tx.itemCode : (tx.itemName || '');
        if (!allQtyByKey.has(key)) allQtyByKey.set(key, { inQty: 0, outQty: 0, count: 0, inCostSum: 0, inSellSum: 0, inActualSum: 0 });
        const entry = allQtyByKey.get(key);
        const qty = parseFloat(tx.quantity) || 0;
        if (tx.type === 'in') {
          entry.inQty += qty;
          entry.inCostSum += qty * (parseFloat(tx.unitPrice) || 0);
          entry.inSellSum += qty * (parseFloat(tx.sellingPrice) || 0);
          entry.inActualSum += qty * (parseFloat(tx.actualSellingPrice) || 0);
        } else {
          entry.outQty += qty;
        }
        entry.count++;
      });

      // ── 현재 페이지 동일 품목별 그룹핑 ─────────────────────
      const groupOrder = [];
      const groupMap = new Map();
      pageData.forEach(tx => {
        const key = tx.itemCode ? tx.itemCode : (tx.itemName || '');
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
          groupOrder.push(key);
        }
        groupMap.get(key).push(tx);
      });

      const renderMargin = (tx) => {
        const cost = parseFloat(tx.unitPrice) || 0;
        const actual = parseFloat(tx.actualSellingPrice) || 0;
        if (cost > 0 && actual > 0) {
          const margin = ((actual - cost) / cost * 100).toFixed(1);
          const color = parseFloat(margin) > 0 ? 'var(--success)' : parseFloat(margin) < 0 ? 'var(--danger)' : 'var(--text-muted)';
          return `<span style="color:${color}; font-weight:600;">${parseFloat(margin) > 0 ? '+' : ''}${margin}%</span>`;
        }
        return '<span style="color:var(--text-muted)">-</span>';
      };

      const W = (v) => v ? '₩' + Math.round(parseFloat(v)).toLocaleString('ko-KR') : '-';
      const N = (v) => v ? parseFloat(v).toLocaleString('ko-KR') : '-';

      const renderTxRow = (tx, isChild = false) => {
        const childStyle = isChild ? 'background:var(--bg-lighter);' : '';
        const indent = isChild ? 'padding-left:24px;' : '';
        const it = itemMap.get(tx.itemName) || {};
        const chk = `<td style="text-align:center;"><input type="checkbox" class="tx-select-row" value="${safeAttr(tx.id)}" ${selectedTxIds.has(tx.id) ? 'checked' : ''} /></td>`;

        if (isInMode) {
          const qty = parseFloat(tx.quantity) || 0;
          const cost = parseFloat(tx.unitPrice) || 0;
          const supply = Math.round(cost * qty);
          const vat = Math.floor(supply * 0.1);
          return `<tr class="${selectedTxIds.has(tx.id) ? 'selected' : ''}" data-tx-id="${safeAttr(tx.id)}" style="${childStyle}">
            ${chk}
            <td class="col-num"></td>
            <td style="font-size:12px;">${escapeHtml(tx.category || it.category || '')}</td>
            <td>${formatDate(tx.date)}</td>
            <td style="font-size:12px;">${tx.vendor ? escapeHtml(tx.vendor) : '<span style="color:var(--text-muted)">-</span>'}</td>
            <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(tx.itemCode || it.itemCode || '-')}</td>
            <td class="col-fill" style="${indent}"><strong>${escapeHtml(tx.itemName || '-')}</strong></td>
            <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(tx.spec || it.spec || '')}</td>
            <td style="font-size:12px;">${escapeHtml(tx.unit || it.unit || '')}</td>
            <td class="text-right type-in">+${qty.toLocaleString('ko-KR')}</td>
            <td class="text-right">${cost ? W(cost) : '-'}</td>
            <td class="text-right">${supply ? W(supply) : '-'}</td>
            <td class="text-right">${vat ? W(vat) : '-'}</td>
            <td class="text-right">${supply ? W(supply + vat) : '-'}</td>
          </tr>`;
        }

        if (isOutMode) {
          const qty = parseFloat(tx.quantity) || 0;
          const cost = parseFloat(it.unitPrice || tx.unitPrice) || 0;
          const supply = Math.round(cost * qty);
          const vat = Math.floor(supply * 0.1);
          const salePrice = parseFloat(tx.actualSellingPrice || tx.sellingPrice || it.sellingPrice) || 0;
          const outAmt = Math.round(salePrice * qty);
          const outTotal = Math.round(outAmt * 1.1);
          const purchase = Math.round(cost * qty);
          const profit = outAmt - purchase;
          const profitRate = outAmt > 0 ? (profit / outAmt * 100).toFixed(1) + '%' : '-';
          const costRate  = outAmt > 0   ? (purchase / outAmt * 100).toFixed(1) + '%'  : '-';
          const profitColor = profit > 0 ? 'var(--success)' : profit < 0 ? 'var(--danger)' : 'var(--text-muted)';
          return `<tr class="${selectedTxIds.has(tx.id) ? 'selected' : ''}" data-tx-id="${safeAttr(tx.id)}" style="${childStyle}">
            ${chk}
            <td class="col-num"></td>
            <td style="font-size:12px;">${escapeHtml(tx.category || it.category || '')}</td>
            <td>${formatDate(tx.date)}</td>
            <td style="font-size:12px;">${tx.vendor ? escapeHtml(tx.vendor) : '<span style="color:var(--text-muted)">-</span>'}</td>
            <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(tx.itemCode || it.itemCode || '-')}</td>
            <td class="col-fill" style="${indent}"><strong>${escapeHtml(tx.itemName || '-')}</strong></td>
            <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(tx.spec || it.spec || '')}</td>
            <td style="font-size:12px;">${escapeHtml(tx.unit || it.unit || '')}</td>
            <td class="text-right type-out">${qty.toLocaleString('ko-KR')}</td>
            <td class="text-right col-group-sale">${salePrice ? W(salePrice) : '-'}</td>
            <td class="text-right col-group-sale">${outAmt ? W(outAmt) : '-'}</td>
            <td class="text-right col-group-sale">${outTotal ? W(outTotal) : '-'}</td>
            <td class="text-right col-group-purchase">${supply ? W(supply) : '-'}</td>
            <td class="text-right col-group-purchase">${vat ? W(vat) : '-'}</td>
            <td class="text-right col-group-purchase">${supply ? W(supply + vat) : '-'}</td>
            <td class="text-right col-group-profit" style="color:${profitColor}; font-weight:600;">${purchase > 0 ? W(profit) : '-'}</td>
            <td class="text-right col-group-profit" style="color:${profitColor};">${profitRate}</td>
            <td class="text-right col-group-profit">${costRate}</td>
          </tr>`;
        }

        // all 모드 (기존)
        return `
          <tr class="${selectedTxIds.has(tx.id) ? 'selected' : ''} ${isChild ? 'tx-child-row' : ''}" data-tx-id="${safeAttr(tx.id)}" style="${childStyle}">
            ${chk}
            <td class="col-num"></td>
            <td data-label="구분"><span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">${tx.type === 'in' ? '입고' : '출고'}</span></td>
            <td data-label="거래처" style="font-size:12px; ${indent}">${tx.vendor ? escapeHtml(tx.vendor) : '<span style="color:var(--text-muted)">-</span>'}</td>
            <td data-label="품목명" class="col-fill" style="${indent}">
              ${isChild ? `<span style="color:var(--text-muted); font-size:12px;">${escapeHtml(tx.itemName || '-')}</span>` : `<strong>${escapeHtml(tx.itemName || '-')}</strong>`}
            </td>
            <td data-label="품목코드" style="color:var(--text-muted); font-size:12px;">${escapeHtml(tx.itemCode || '-')}</td>
            <td data-label="수량" class="text-right">
              <span class="${tx.type === 'in' ? 'type-in' : 'type-out'}">${tx.type === 'in' ? '+' : '-'}${parseFloat(tx.quantity || 0).toLocaleString('ko-KR')}</span>
            </td>
            <td data-label="원가" class="text-right">${tx.unitPrice ? W(tx.unitPrice) : '-'}</td>
            <td data-label="판매가" class="text-right editable-price-cell" data-tx-id="${safeAttr(tx.id)}" data-field="sellingPrice" title="클릭하여 수정">
              <span class="price-display">${tx.sellingPrice ? W(tx.sellingPrice) : '<span style="color:var(--text-muted)">-</span>'}</span>
            </td>
            <td data-label="실판매가" class="text-right editable-price-cell" data-tx-id="${safeAttr(tx.id)}" data-field="actualSellingPrice" title="클릭하여 수정">
              <span class="price-display">${tx.actualSellingPrice ? W(tx.actualSellingPrice) : '<span style="color:var(--text-muted)">-</span>'}</span>
            </td>
            <td data-label="이익률" class="text-right">${renderMargin(tx)}</td>
            <td data-label="날짜">${formatDate(tx.date)}</td>
            <td data-label="비고" style="color:var(--text-muted); font-size:13px;">${escapeHtml(tx.note || '')}</td>
          </tr>`;
      };

      let rowNum = start + 1;
      let html = '';
      groupOrder.forEach(key => {
        const group = groupMap.get(key);
        if (group.length === 1) {
          // 단일 거래: 그냥 일반 행
          const tx = group[0];
          html += renderTxRow(tx, false).replace('<td class="col-num"></td>', `<td class="col-num">${rowNum++}</td>`);
        } else {
          // 복수 거래: 그룹 헤더 + 하위 행
          const isExpanded = expandedGroups.has(key);
          const firstName = group[0].itemName || '-';
          const firstCode = group[0].itemCode || '';
          const allEntry = allQtyByKey.get(key) || { inQty: 0, outQty: 0, count: group.length, inCostSum: 0, inSellSum: 0, inActualSum: 0 };
          const totalInQty = allEntry.inQty;
          const totalOutQty = allEntry.outQty;
          const totalCount = allEntry.count;
          const avgCost = totalInQty > 0 ? Math.round(allEntry.inCostSum / totalInQty) : 0;
          const avgSell = totalInQty > 0 ? Math.round(allEntry.inSellSum / totalInQty) : 0;
          const avgActual = totalInQty > 0 ? Math.round(allEntry.inActualSum / totalInQty) : 0;
          const avgMargin = avgCost > 0 && avgActual > 0
            ? ((avgActual - avgCost) / avgCost * 100).toFixed(1)
            : null;
          const currentStock = currentStockByKey.has(key) ? currentStockByKey.get(key) : null;
          const stockLabel = currentStock !== null
            ? `<span style="font-weight:700; color:var(--text-primary);">${currentStock.toLocaleString('ko-KR')}</span>`
            : '-';
          const txNote = [
            totalInQty > 0 ? `+${totalInQty.toLocaleString('ko-KR')}` : '',
            totalOutQty > 0 ? `-${totalOutQty.toLocaleString('ko-KR')}` : '',
          ].filter(Boolean).join('/');
          const pageCountNote = group.length < totalCount ? ` <span style="color:var(--text-muted); font-size:10px;">(이 페이지 ${group.length}건)</span>` : '';
          const marginColor = avgMargin !== null ? (parseFloat(avgMargin) > 0 ? 'var(--success)' : parseFloat(avgMargin) < 0 ? 'var(--danger)' : 'var(--text-muted)') : '';

          const groupRestCols = totalColCount - 4; // chk + num + name-cell(colspan3) = 4 accounted
          html += `
            <tr class="tx-group-header" data-group-key="${safeAttr(key)}" style="cursor:pointer; background:var(--bg-card); border-left:3px solid var(--accent);">
              <td style="text-align:center;">
                <span style="color:var(--text-muted); font-size:11px;">${totalCount}건</span>
              </td>
              <td class="col-num">${rowNum++}</td>
              <td colspan="3" style="padding-left:8px;">
                <span class="group-toggle-icon" style="margin-right:6px; font-size:12px;">${isExpanded ? '▼' : '▶'}</span>
                <strong>${escapeHtml(firstName)}</strong>
                ${firstCode ? `<span style="color:var(--text-muted); font-size:11px; margin-left:6px;">${escapeHtml(firstCode)}</span>` : ''}
                <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">총 ${totalCount}건${pageCountNote}</span>
              </td>
              ${isInMode || isOutMode
                ? `<td colspan="${groupRestCols}" style="color:var(--text-muted); font-size:12px; padding-left:8px;">
                    ${txNote}
                    ${stockLabel ? `&nbsp;·&nbsp;재고 ${stockLabel}` : ''}
                  </td>`
                : `<td class="col-num"></td>
                  <td class="text-right">
                    ${stockLabel}
                    ${txNote ? `<div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${txNote}</div>` : ''}
                  </td>
                  <td class="text-right" style="font-size:12px;">${avgCost > 0 ? '<span style="color:var(--text-muted); font-size:10px;">평균</span> ₩' + avgCost.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right" style="font-size:12px;">${avgSell > 0 ? '₩' + avgSell.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right" style="font-size:12px;">${avgActual > 0 ? '₩' + avgActual.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right" style="font-size:12px;">${avgMargin !== null ? `<span style="color:${marginColor}; font-weight:600;">${parseFloat(avgMargin) > 0 ? '+' : ''}${avgMargin}%</span>` : '-'}</td>
                  <td colspan="2"></td>
                  <td></td>`
              }
            </tr>
            ${isExpanded ? group.map(tx => renderTxRow(tx, true)).join('') : ''}`;
        }
      });
      tbody.innerHTML = html;
    }

    renderFilterSummary(sorted.length);

    //   같은 품목을 여러 거래처에서 입고할 수 있으므로 트랜잭션 기준이 정확
    const pagEl = container.querySelector('#tx-pagination');
    if (!pagEl) return;
    const pageStart = sorted.length === 0 ? 0 : start + 1;
    pagEl.innerHTML = `
      <span>${sorted.length}건 중 ${pageStart}~${Math.min(start + PAGE_SIZE, sorted.length)}</span>
      <div class="pagination-btns">
        <button class="page-btn" id="tx-prev" ${currentPageNum <= 1 ? 'disabled' : ''}>이전</button>
        <span style="padding:4px 8px; color:var(--text-muted); font-size:13px;">${currentPageNum} / ${totalPages}</span>
        <button class="page-btn" id="tx-next" ${currentPageNum >= totalPages ? 'disabled' : ''}>다음</button>
      </div>
    `;

    // 그룹 헤더 클릭 → 펼치기/접기
    container.querySelectorAll('.tx-group-header').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.dataset.groupKey;
        if (expandedGroups.has(key)) {
          expandedGroups.delete(key);
        } else {
          expandedGroups.add(key);
        }
        renderTxTable();
      });
    });

    // 판매가/실판매가 인라인 편집
    container.querySelectorAll('.editable-price-cell').forEach(cell => {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        if (cell.querySelector('input')) return; // 이미 편집 중
        const txId = cell.dataset.txId;
        const field = cell.dataset.field;
        const txData = (getState().transactions || []).find(t => t.id === txId);
        if (!txData) return;
        const currentVal = parseFloat(txData[field]) || 0;

        cell.innerHTML = `
          <input type="number" class="inline-price-input" value="${safeAttr(currentVal || '')}"
            placeholder="금액 입력" min="0"
            style="width:100px; text-align:right; padding:2px 4px; border:1px solid var(--accent); border-radius:4px; background:var(--bg-card); color:var(--text-primary); font-size:13px;" />
        `;
        const input = cell.querySelector('input');
        input.focus();
        input.select();

        const commit = () => {
          const newVal = parseFloat(input.value) || 0;
          updateTransactionPrices(txId, { [field]: newVal });
          renderTxTable();
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { renderTxTable(); }
        });
      });
    });


    // 선택 박스 이벤트
    const selectAllCheckbox = container.querySelector('#tx-select-all');
    if (selectAllCheckbox) {
      const isAllSelected = pageData.length > 0 && pageData.every(tx => selectedTxIds.has(tx.id));
      selectAllCheckbox.checked = isAllSelected;

      selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        pageData.forEach(tx => {
          if (checked) selectedTxIds.add(tx.id);
          else selectedTxIds.delete(tx.id);
        });
        renderTxTable();
      });
    }

    container.querySelectorAll('.tx-select-row').forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) selectedTxIds.add(e.target.value);
        else selectedTxIds.delete(e.target.value);
        renderTxTable();
      });
    });

    // 헤더 상태 업데이트
    const selInfo = container.querySelector('#tx-selection-info');
    const bulkDelBtn = container.querySelector('#btn-tx-bulk-delete');
    if (selInfo) selInfo.textContent = `선택 ${selectedTxIds.size}건`;
    if (bulkDelBtn) {
      bulkDelBtn.disabled = selectedTxIds.size === 0;
      bulkDelBtn.onclick = () => {
        if (!canAction('inout:bulk')) {
          showToast('일괄 삭제 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning');
          return;
        }
        if (selectedTxIds.size === 0) return;
        if (!confirm(`선택한 ${selectedTxIds.size}건의 기록을 삭제하시겠습니까?`)) return;
        try {
          const totalSelected = selectedTxIds.size;
          let failCount = 0;
          selectedTxIds.forEach(id => {
            const res = deleteTransaction(id);
            if (!res) failCount++;
          });
          selectedTxIds.clear();
          showToast(`일괄 삭제 완료! (${totalSelected}건 중 ${totalSelected - failCount}건 삭제)`, 'success');
          renderInoutPage(container, navigateTo, mode);
        } catch (err) {
          handlePageError(err, { page: 'inout', action: 'bulk-delete' });
        }
      };
    }

    enableColumnResize(container.querySelector('.data-table'));

    pagEl.querySelector('#tx-prev')?.addEventListener('click', () => { currentPageNum--; renderTxTable(); });
    pagEl.querySelector('#tx-next')?.addEventListener('click', () => { currentPageNum++; renderTxTable(); });
  }

  container.querySelector('#btn-quick-item')?.addEventListener('click', () => navigateTo('inventory'));
  container.querySelector('#btn-quick-first-tx')?.addEventListener('click', () => {
    if (!canCreate) { showToast('등록 권한이 없습니다. 직원 이상만 가능합니다.', 'warning'); return; }
    openTxModal(container, navigateTo, 'in', items);
  });
  container.querySelector('#btn-quick-guide')?.addEventListener('click', () => navigateTo('guide'));
  container.querySelector('#btn-quick-summary')?.addEventListener('click', () => navigateTo('summary'));
  container.querySelector('#btn-open-inbound-inline')?.addEventListener('click', () => {
    if (!canCreate) { showToast('입고 등록 권한이 없습니다. 직원 이상만 가능합니다.', 'warning'); return; }
    openTxModal(container, navigateTo, 'in', items);
  });
  container.querySelector('#btn-open-outbound-inline')?.addEventListener('click', () => {
    if (!canCreate) { showToast('출고 등록 권한이 없습니다. 직원 이상만 가능합니다.', 'warning'); return; }
    openTxModal(container, navigateTo, 'out', items);
  });
  container.querySelectorAll('.mission-actions [data-nav], .quick-start-actions [data-nav]').forEach(button => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      navigateTo(button.dataset.nav);
    });
  });

  function syncQuickFilterChips() {
    container.querySelectorAll('[data-tx-quick]').forEach(button => {
      button.classList.toggle('is-active', button.dataset.txQuick === filter.quick);
    });
  }

  container.querySelectorAll('[data-tx-quick]').forEach(button => {
    button.addEventListener('click', () => {
      filter.quick = button.dataset.txQuick || 'all';
      if (filter.quick === 'in' || filter.quick === 'out') {
        filter.type = filter.quick;
        container.querySelector('#tx-type-filter').value = filter.type;
      } else if (filter.type && (filter.quick === 'all' || filter.quick === 'today' || filter.quick === 'missingVendor' || filter.quick === 'recent3')) {
        filter.type = '';
        container.querySelector('#tx-type-filter').value = '';
      }
      if (filter.quick === 'today') {
        filter.date = new Date().toISOString().split('T')[0];
        container.querySelector('#tx-date-filter').value = filter.date;
      } else if (filter.quick !== 'recent3' && filter.quick !== 'missingVendor' && filter.quick !== 'all') {
        filter.date = '';
        container.querySelector('#tx-date-filter').value = '';
      } else if (filter.quick === 'all') {
        filter.date = '';
        container.querySelector('#tx-date-filter').value = '';
      }
      currentPageNum = 1;
      renderTxTable();
      highlightActiveFilters();
      syncQuickFilterChips();
      persistInoutPrefs();
    });
  });

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
    filter.quick = e.target.value || 'all';
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
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
    filter.quick = e.target.value ? 'today' : 'all';
    currentPageNum = 1;
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
    persistInoutPrefs();
  });
  container.querySelector('#tx-sort-filter').addEventListener('change', (e) => {
    sort = sanitizeInoutSort(parseSortPreset(e.target.value));
    currentPageNum = 1;
    renderTxHeader();
    renderTxTable();
    highlightActiveFilters();
    syncQuickFilterChips();
    persistInoutPrefs();
  });

  // 필터/정렬 이벤트
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
    syncQuickFilterChips();
    persistInoutPrefs();
    showToast('필터와 정렬을 초기화했습니다.', 'info');
  });

  // 필터/정렬 이벤트
  container.querySelector('#btn-in')?.addEventListener('click', () => {
    openTxModal(container, navigateTo, 'in', items);
  });
  container.querySelector('#btn-out')?.addEventListener('click', () => {
    openTxModal(container, navigateTo, 'out', items);
  });

  // 이력 내보내기 (모드별 양식)
  container.querySelector('#btn-export-tx').addEventListener('click', () => {
    if (transactions.length === 0) {
      showToast('내보낼 기록이 없습니다.', 'warning');
      return;
    }

    // 품목 맵: itemName → item 객체 (규격·단위·카테고리 참조용)
    const itemMap = new Map(items.map(it => [it.itemName, it]));

    if (isInMode) {
      // ── 입고관리 양식 ──────────────────────────────────────
      const inList = transactions.filter(tx => tx.type === 'in');
      if (inList.length === 0) { showToast('입고 기록이 없습니다.', 'warning'); return; }
      const exportData = inList.map(tx => {
        const it = itemMap.get(tx.itemName) || {};
        const qty = parseFloat(tx.quantity) || 0;
        const unitCost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(unitCost * qty);
        const vat = Math.floor(supply * 0.1);
        return {
          '자산':     it.category || '',
          '입고일자': tx.date || '',
          '거래처':   tx.vendor || '',
          '상품코드': tx.itemCode || it.itemCode || '',
          '품명':     tx.itemName || '',
          '규격':     it.spec || '',
          '단위':     it.unit || '',
          '입고수량': qty,
          '단가':     unitCost,
          '공급가액': supply,
          '부가세':   vat,
          '합계금액': supply + vat,
        };
      });
      downloadExcel(exportData, '입고관리');
      showToast('입고 이력을 엑셀로 내보냈습니다.', 'success');

    } else if (isOutMode) {
      // ── 출고관리 양식 ──────────────────────────────────────
      const outList = transactions.filter(tx => tx.type === 'out');
      if (outList.length === 0) { showToast('출고 기록이 없습니다.', 'warning'); return; }
      const exportData = outList.map(tx => {
        const it = itemMap.get(tx.itemName) || {};
        const qty = parseFloat(tx.quantity) || 0;
        const unitCost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(unitCost * qty);
        const vat = Math.floor(supply * 0.1);
        const salePrice = parseFloat(tx.actualSellingPrice || tx.sellingPrice || it.sellingPrice) || 0;
        const outAmt = Math.round(salePrice * qty);
        const purchase = Math.round(unitCost * qty);
        const profit = outAmt - purchase;
        const profitRate = outAmt > 0 ? (profit / outAmt * 100).toFixed(1) + '%' : '';
        const costRate  = outAmt > 0   ? (purchase / outAmt * 100).toFixed(1) + '%'  : '';
        return {
          '자산':       it.category || tx.category || '',
          '출고일자':   tx.date || '',
          '거래처':     tx.vendor || '',
          '상품코드':   tx.itemCode || it.itemCode || '',
          '품명':       tx.itemName || '',
          '규격':       tx.spec || it.spec || '',
          '단위':       tx.unit || it.unit || '',
          '출고수량':   qty,
          '출고단가':   salePrice,
          '판매가':     outAmt,
          '출고합':     Math.round(outAmt * 1.1),
          '매입원가':   supply,
          '부가세':     vat,
          '공가합':     supply + vat,
          '이익액':     profit,
          '이익률':     profitRate,
          '매출원가율': costRate,
        };
      });
      downloadExcel(exportData, '출고관리');
      showToast('출고 이력을 엑셀로 내보냈습니다.', 'success');

    } else {
      // ── 전체 (입출고 통합) ──────────────────────────────────
      const exportData = transactions.map(tx => {
        const it = itemMap.get(tx.itemName) || {};
        const qty = parseFloat(tx.quantity) || 0;
        const unitCost = parseFloat(tx.unitPrice) || 0;
        const supply = Math.round(unitCost * qty);
        const vat = Math.floor(supply * 0.1);
        return {
          '구분':     tx.type === 'in' ? '입고' : '출고',
          '날짜':     tx.date || '',
          '거래처':   tx.vendor || '',
          '품목명':   tx.itemName || '',
          '품목코드': tx.itemCode || it.itemCode || '',
          '규격':     it.spec || '',
          '단위':     it.unit || '',
          '수량':     qty,
          '단가':     unitCost,
          '공급가액': supply,
          '부가세':   vat,
          '합계금액': supply + vat,
        };
      });
      downloadExcel(exportData, '입출고이력');
      showToast('이력을 엑셀로 내보냈습니다.', 'success');
    }
  });

  // ?묒? ?쇨큵 ?깅줉
  container.querySelector('#btn-bulk-upload').addEventListener('click', () => {
    openBulkUploadModal(container, navigateTo, items, isInMode ? 'in' : isOutMode ? 'out' : null);
  });

  //   같은 품목을 여러 거래처에서 입고할 수 있으므로 트랜잭션 기준이 정확
  container.querySelector('#tx-search').value = filter.keyword;
  container.querySelector('#tx-type-filter').value = filter.type;
  container.querySelector('#tx-vendor-filter').value = filter.vendor;
  container.querySelector('#tx-code-filter').value = filter.itemCode;
  container.querySelector('#tx-date-filter').value = filter.date;
  container.querySelector('#tx-sort-filter').value = getSortPresetValue(sort);
  renderTxHeader();
  renderTxTable();
  highlightActiveFilters();
  syncQuickFilterChips();

  const quickOpenInbound = sessionStorage.getItem('invex:quick-open-inbound') === '1';
  const quickOpenOutbound = sessionStorage.getItem('invex:quick-open-outbound') === '1';
  if (quickOpenInbound || quickOpenOutbound) {
    sessionStorage.removeItem('invex:quick-open-inbound');
    sessionStorage.removeItem('invex:quick-open-outbound');
    setTimeout(() => {
      openTxModal(container, navigateTo, quickOpenInbound ? 'in' : 'out', items);
    }, 20);
  }
}

/**
 * 입출고 관리 페이지 렌더링
 * 왜 필요? → 건별 등록은 수십 건 이상일 때 비효율적.
 * 왜 필요? → 건별 등록은 수십 건 이상일 때 비효율적.
 */
function openBulkUploadModal(container, navigateTo, items, modeDefault = null) {
  const modalTitle = modeDefault === 'in' ? '엑셀 일괄 입고 등록'
    : modeDefault === 'out' ? '엑셀 일괄 출고 등록'
    : '엑셀 일괄 입출고 등록';
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-header">
        <h3 class="modal-title">${modalTitle}</h3>
        <button class="modal-close" id="bulk-close"></button>
      </div>
      <div class="modal-body" id="bulk-body">
        <div class="alert alert-info" style="margin-bottom:16px;">
          <strong>사용 방법</strong><br/>
          1. 아래에서 샘플 양식을 내려받습니다.<br/>
          2. 양식에 입고 또는 출고 데이터를 입력합니다.<br/>
          3. 저장한 엑셀 파일을 끌어놓거나 선택하면 미리보기 후 한 번에 등록할 수 있습니다.
        </div>

        <div style="display:flex; gap:8px; margin-bottom:16px;">
          <button class="btn btn-outline" id="bulk-download-template">엑셀 양식 다운로드</button>
        </div>

        <div style="border:2px dashed var(--border); border-radius:8px; padding:32px; text-align:center; cursor:pointer; transition:border-color 0.2s;" id="bulk-dropzone">
          <div style="font-size:28px; margin-bottom:8px;"></div>
          <div style="font-size:13px; color:var(--text-muted);">엑셀 파일을 여기로 끌어오거나 클릭해서 선택해 주세요.</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">지원 형식: .xlsx, .xls</div>
          <input type="file" id="bulk-file-input" accept=".xlsx,.xls" style="display:none;" />
        </div>

        <div id="bulk-preview" style="display:none; margin-top:16px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#bulk-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#bulk-download-template').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    let templateRows, sheetName, fileName;

    if (modeDefault === 'out') {
      // 출고 양식: 사용자 입력 필드만 (계산값은 시스템이 자동 산출)
      const outHeaders = ['자산', '출고일자', '거래처', '상품코드', '품명', '규격', '단위', '출고수량', '출고단가'];
      templateRows = [
        outHeaders,
        ['전자기기', today, '강남점', 'SM-S925', '갤럭시 S25', '256GB 블랙', 'EA', 10, 1500000],
        ['전자기기', today, '홍대점', 'AP-001',  '아이패드 Air', '256GB 스타라이트', 'EA', 5, 1100000],
      ];
      sheetName = '출고_양식';
      fileName = '출고_일괄등록_양식';
    } else {
      // 입고 양식: 사용자 입력 필드만 (공급가·부가세·합계는 시스템이 자동 산출)
      templateRows = [
        BULK_INOUT_TEMPLATE_HEADERS,
        ['전자기기', today, '(주)삼성전자', 'SM-S925', '갤럭시 S25', '256GB 블랙', 'EA', 100, 1200000],
        ['전자기기', today, '(주)애플코리아', 'AP-001', '아이패드 Air', '256GB 스타라이트', 'EA', 50, 850000],
      ];
      sheetName = '입고_양식';
      fileName = '입고_일괄등록_양식';
    }

    downloadExcelSheets([{ name: sheetName, rows: templateRows }], fileName);
    showToast(`${modeDefault === 'out' ? '출고' : '입고'} 일괄등록 양식을 내려받았습니다.`, 'success');
  });

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
    if (file) processUploadedFile(file, overlay, container, navigateTo, items, close, modeDefault);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processUploadedFile(file, overlay, container, navigateTo, items, close, modeDefault);
  });
}

/**
 * 업로드된 엑셀 파일을 파싱하여 미리보기 + 일괄 등록
 * 입출고 관리 페이지 렌더링
 */
async function processUploadedFile(file, overlay, container, navigateTo, items, closeModal, modeDefault = null) {
  const previewEl = overlay.querySelector('#bulk-preview');
  previewEl.style.display = 'block';
  previewEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">엑셀 파일을 분석하고 있습니다...</div>';

  try {
    const { sheets, sheetNames } = await readExcelFile(file);
    const sheetData = sheets[sheetNames[0]];

    if (!sheetData || sheetData.length < 2) {
      previewEl.innerHTML = '<div class="alert alert-warning">데이터 행이 없습니다. 양식의 첫 줄은 헤더, 둘째 줄부터 데이터가 있어야 합니다.</div>';
      return;
    }

    const detected = detectBulkInoutColumns(sheetData);
    const dataStartIndex = Math.max(1, detected.headerRowIndex + 1);
    const headerRow = sheetData[detected.headerRowIndex] || sheetData[0];
    const headers = headerRow.map((header) => String(header ?? '').trim());
    const findCol = (...names) => {
      for (const n of names) {
        const idx = headers.findIndex(h => h === n);
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const colMap = {
      type:               findCol('구분'),
      vendor:             findCol('거래처', '매장명'),
      itemName:           findCol('품명', '품목명'),
      itemCode:           findCol('상품코드', '품목코드'),
      // 출고 모드는 출고수량 우선, 입고 모드는 입고수량 우선
      quantity:           modeDefault === 'out'
        ? findCol('출고수량', '입고수량', '수량')
        : findCol('입고수량', '출고수량', '수량'),
      unitPrice:          findCol('단가', '원가'),
      sellingPrice:       findCol('판매가', '출고단가'),
      actualSellingPrice: findCol('실판매가'),
      date:               modeDefault === 'out'
        ? findCol('출고일자', '입고일자', '날짜')
        : findCol('입고일자', '출고일자', '날짜'),
      note:               findCol('비고'),
      spec:               findCol('규격'),
      unit:               findCol('단위'),
      category:           findCol('자산', '분류', '카테고리'),
    };
    Object.keys(colMap).forEach((key) => {
      if (colMap[key] === -1 && detected.colMap[key] >= 0) {
        colMap[key] = detected.colMap[key];
      }
    });

    if ((colMap.itemName === -1 && colMap.itemCode === -1) || colMap.quantity === -1) {
      const missing = [(colMap.itemName === -1 && colMap.itemCode === -1) && '품명/상품코드', colMap.quantity === -1 && '수량'].filter(Boolean).join(', ');
      previewEl.innerHTML = `<div class="alert alert-danger">필수 컬럼을 찾을 수 없습니다 (누락: ${missing}). 양식에 "품명"(또는 "상품코드"), "입고수량"(또는 "출고수량") 컬럼이 포함되어 있는지 확인해 주세요.</div>`;
      return;
    }
    // 구분 컬럼 없으면 현재 페이지 모드(입고/출고) 기본값 사용
    const defaultTxType = colMap.type === -1 ? (modeDefault ?? 'in') : null;

    const rows = [];
    for (let index = dataStartIndex; index < sheetData.length; index += 1) {
      const row = sheetData[index];
      if (!row || row.length === 0) continue;

      const typeCell = colMap.type >= 0 ? String(row[colMap.type] ?? '').trim() : '';
      const rawItemCode = colMap.itemCode >= 0 ? String(row[colMap.itemCode] ?? '').trim() : '';
      let itemName = colMap.itemName >= 0 ? String(row[colMap.itemName] ?? '').trim() : '';
      const quantity = parseBulkNumber(row[colMap.quantity]);

      // 품명 없을 때 상품코드로 품목 조회
      const matchedItem = items.find((item) =>
        (itemName && item.itemName === itemName) || (rawItemCode && item.itemCode && item.itemCode === rawItemCode)
      );
      if (!itemName && matchedItem) itemName = matchedItem.itemName;

      if (!itemName || quantity <= 0) continue;

      let dateStr = '';
      if (colMap.date >= 0) {
        const rawDate = row[colMap.date];
        if (typeof rawDate === 'number') {
          const excelDate = new Date((rawDate - 25569) * 86400 * 1000);
          dateStr = excelDate.toISOString().split('T')[0];
        } else {
          dateStr = formatDate(String(rawDate ?? '').trim());
        }
      }

      rows.push({
        type: defaultTxType ?? normalizeBulkTxType(typeCell),
        vendor: colMap.vendor >= 0 ? String(row[colMap.vendor] ?? '').trim() : '',
        itemName,
        itemCode: rawItemCode || matchedItem?.itemCode || '',
        quantity,
        unitPrice: colMap.unitPrice >= 0 ? parseBulkNumber(row[colMap.unitPrice]) : 0,
        sellingPrice: colMap.sellingPrice >= 0 ? parseBulkNumber(row[colMap.sellingPrice]) : 0,
        actualSellingPrice: colMap.actualSellingPrice >= 0 ? parseBulkNumber(row[colMap.actualSellingPrice]) : 0,
        date: dateStr || new Date().toISOString().split('T')[0],
        note: colMap.note >= 0 ? String(row[colMap.note] ?? '').trim() : '',
        spec: colMap.spec >= 0 ? String(row[colMap.spec] ?? '').trim() : (matchedItem?.spec || ''),
        unit: colMap.unit >= 0 ? String(row[colMap.unit] ?? '').trim() : (matchedItem?.unit || ''),
        category: colMap.category >= 0 ? String(row[colMap.category] ?? '').trim() : (matchedItem?.category || ''),
        matched: Boolean(matchedItem),
      });
    }

    if (rows.length === 0) {
      previewEl.innerHTML = '<div class="alert alert-warning">유효한 데이터가 없습니다. 구분, 품목명, 수량 값을 다시 확인해 주세요.</div>';
      return;
    }

    const inCount = rows.filter((row) => row.type === 'in').length;
    const outCount = rows.filter((row) => row.type === 'out').length;
    const unmatchedCount = rows.filter((row) => !row.matched).length;

    previewEl.innerHTML = `
      <div style="margin-bottom:12px;">
        <strong>분석 결과</strong>
        <span style="margin-left:8px; color:var(--success);">입고 ${inCount}건</span>
        <span style="margin-left:8px; color:var(--danger);">출고 ${outCount}건</span>
        ${unmatchedCount > 0 ? `<span style="margin-left:8px; color:var(--warning);">품목 미매칭 ${unmatchedCount}건</span>` : ''}
      </div>
      <div class="table-wrapper" style="max-height:250px; overflow-y:auto; margin-bottom:12px;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th>구분</th>
              <th>거래처</th>
              <th>품목명</th>
              <th>수량</th>
              <th>원가</th>
              <th>판매가</th>
              <th>실판매가</th>
              <th>날짜</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td><span class="${row.type === 'in' ? 'type-in' : 'type-out'}">${row.type === 'in' ? '입고' : '출고'}</span></td>
                <td>${escapeHtml(row.vendor || '-')}</td>
                <td>${escapeHtml(row.itemName)}</td>
                <td class="text-right">${row.quantity.toLocaleString('ko-KR')}</td>
                <td class="text-right">${row.unitPrice ? `₩${Math.round(row.unitPrice).toLocaleString('ko-KR')}` : '-'}</td>
                <td class="text-right">${row.sellingPrice ? `₩${Math.round(row.sellingPrice).toLocaleString('ko-KR')}` : '-'}</td>
                <td class="text-right">${row.actualSellingPrice ? `₩${Math.round(row.actualSellingPrice).toLocaleString('ko-KR')}` : '-'}</td>
                <td>${escapeHtml(row.date)}</td>
                <td>${row.matched
                  ? '<span style="color:var(--success); font-size:11px;">기존 품목 매칭</span>'
                  : '<span style="color:var(--warning); font-size:11px;">품목 미매칭</span>'
                }</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${unmatchedCount > 0 ? '<div class="alert alert-info" style="margin-bottom:12px; font-size:12px;">품목 미매칭 행은 재고 마스터에 \'신규 품목\'으로 자동 등록됩니다.</div>' : ''}
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-outline" id="bulk-cancel">취소</button>
        <button class="btn btn-primary" id="bulk-confirm">총 ${rows.length}건 등록</button>
      </div>
    `;

    previewEl.querySelector('#bulk-cancel').addEventListener('click', () => {
      previewEl.style.display = 'none';
    });

    previewEl.querySelector('#bulk-confirm').addEventListener('click', () => {
      // 아이템 마스터에 spec/unit/category 업데이트
      const currentState = getState();
      const updatedMappedData = [...(currentState.mappedData || [])];
      rows.forEach((row) => {
        const idx = updatedMappedData.findIndex(it =>
          it.itemName === row.itemName || (row.itemCode && it.itemCode && it.itemCode === row.itemCode)
        );
        if (idx >= 0) {
          if (row.spec && !updatedMappedData[idx].spec) updatedMappedData[idx] = { ...updatedMappedData[idx], spec: row.spec };
          if (row.unit && !updatedMappedData[idx].unit) updatedMappedData[idx] = { ...updatedMappedData[idx], unit: row.unit };
          if (row.category && !updatedMappedData[idx].category) updatedMappedData[idx] = { ...updatedMappedData[idx], category: row.category };
        }
      });
      setState({ mappedData: updatedMappedData });

      // ★ addTransactionsBulk 사용: saveToDB + sync를 건수만큼 반복하지 않고 1번으로 처리
      addTransactionsBulk(rows.map((row) => ({
        type: row.type,
        vendor: row.vendor,
        itemName: row.itemName,
        itemCode: row.itemCode,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        sellingPrice: row.sellingPrice,
        actualSellingPrice: row.actualSellingPrice,
        date: row.date,
        note: row.note,
        spec: row.spec,
        unit: row.unit,
        category: row.category,
      })));

      showToast(`일괄 등록 완료: 총 ${rows.length}건, 입고 ${inCount}건, 출고 ${outCount}건`, 'success');
      closeModal();
      renderInoutPage(container, navigateTo, modeDefault || 'all');
    });
  } catch (err) {
    previewEl.innerHTML = `<div class="alert alert-danger">파일 처리 중 오류가 발생했습니다: ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * 입고/출고 등록 모달
 */
function normalizeBulkHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()\-_/]/g, '');
}

function emptyBulkColMap() {
  return {
    type: -1,
    vendor: -1,
    itemName: -1,
    itemCode: -1,
    quantity: -1,
    unitPrice: -1,
    sellingPrice: -1,
    actualSellingPrice: -1,
    date: -1,
    note: -1,
  };
}

function detectBulkInoutColumns(sheetData) {
  const aliasMap = {
    type: ['구분', '입출고', '거래구분', '유형', 'type', 'inout'],
    vendor: ['거래처', '매장명', '공급처', '고객처', 'vendor', 'supplier', 'customer'],
    itemName: ['품명', '품목명', '상품명', '제품명', 'itemname', 'item', 'name'],
    itemCode: ['품목코드', '상품코드', '코드', 'sku', 'itemcode'],
    quantity: ['수량', 'qty', 'quantity', '입고수량', '출고수량'],
    unitPrice: ['단가', '원가', '매입단가', '공급단가', 'unitprice', 'price', 'cost'],
    sellingPrice: ['판매가', '출고단가', '판매단가', 'saleprice', 'sellingprice', 'sale', 'selling'],
    actualSellingPrice: ['실판매가', '실판매단가', 'actualsellingprice', 'actualsaleprice', 'actualprice'],
    date: ['날짜', '일자', '거래일자', '입출고일', '입고일자', '출고일자', 'date'],
    note: ['비고', '메모', 'note', 'memo', 'remarks'],
  };

  const normalizedAliases = {};
  Object.keys(aliasMap).forEach((key) => {
    normalizedAliases[key] = aliasMap[key].map(normalizeBulkHeader);
  });

  let best = { score: -1, headerRowIndex: 0, colMap: emptyBulkColMap() };
  const scanLimit = Math.min(Array.isArray(sheetData) ? sheetData.length : 0, 10);

  for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
    const row = Array.isArray(sheetData[rowIndex]) ? sheetData[rowIndex] : [];
    const normalizedHeaders = row.map((cell) => normalizeBulkHeader(cell));
    const colMap = emptyBulkColMap();

    Object.keys(colMap).forEach((key) => {
      colMap[key] = normalizedHeaders.findIndex((header) => {
        if (!header) return false;
        return normalizedAliases[key].some((alias) => header === alias || header.includes(alias) || alias.includes(header));
      });
    });

    let score = 0;
    if (colMap.type >= 0) score += 3;
    if (colMap.itemName >= 0) score += 3;
    if (colMap.quantity >= 0) score += 3;
    if (colMap.unitPrice >= 0) score += 1;
    if (colMap.sellingPrice >= 0) score += 1;
    if (colMap.actualSellingPrice >= 0) score += 1;
    if (colMap.date >= 0) score += 1;
    if (colMap.vendor >= 0) score += 1;
    if (colMap.note >= 0) score += 1;

    if (score > best.score) {
      best = { score, headerRowIndex: rowIndex, colMap };
    }
  }

  return { colMap: best.colMap, headerRowIndex: best.headerRowIndex };
}

function parseBulkNumber(value) {
  const normalized = String(value ?? '')
    .replace(/[₩,\s]/g, '')
    .trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBulkTxType(value) {
  const normalized = normalizeBulkHeader(value);
  if (['출고', '출', 'out', 'sale', 'sales', '판매', '매출'].includes(normalized)) return 'out';
  return 'in';
}

function openTxModal(container, navigateTo, type, items) {
  const today = new Date().toISOString().split('T')[0];
  const state = getState();
  const vendors = (state.vendorMaster || []).filter(v =>
    type === 'in' ? v.type === 'supplier' : v.type === 'customer'
  );
  const typeLabel = type === 'in' ? '입고' : '출고';
  const partnerLabel = type === 'in' ? '매입처' : '매출처';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:980px;">
      <div class="modal-header">
        <h3 class="modal-title">${type === 'in' ? '입고 등록' : '출고 등록'}</h3>
        <button class="modal-close" id="modal-close"></button>
      </div>
      <div class="modal-body">
        <div class="form-shell">
          <div class="form-shell-main">
            <div class="form-group">
              <label class="form-label">${partnerLabel}</label>
              <select class="form-select" id="tx-vendor">
                <option value="">-- 거래처 선택 (선택 사항) --</option>
                ${vendors.map(v => `<option value="${safeAttr(v.name)}">${escapeHtml(v.name)}${v.contactName ? ` (${escapeHtml(v.contactName)})` : ''}</option>`).join('')}
              </select>
              ${vendors.length === 0 ? `<div class="smart-inline-note">거래처 관리에 ${type === 'in' ? '공급처' : '고객'}를 먼저 등록하면 ${typeLabel} 기록이 더 편해집니다.</div>` : ''}
            </div>

            <div class="form-group">
              <label class="form-label">품목 선택 <span class="required">*</span></label>
              ${items.length > 0 ? `
                <input class="form-input" id="tx-item-search" placeholder="품목명/코드/거래처 검색" autocomplete="off" />
                <div class="smart-inline-note" id="tx-item-search-meta">표시 ${items.length}개 / 전체 ${items.length}개</div>
                <select class="form-select" id="tx-item">
                  <option value="">-- 품목 선택 --</option>
                  ${items.map((item, i) => `
                    <option value="${i}" data-code="${safeAttr(item.itemCode || '')}" data-price="${safeAttr(item.unitPrice || '')}" data-qty="${safeAttr(item.quantity || 0)}">
                      ${escapeHtml(item.itemName || '')}${item.itemCode ? ` (${escapeHtml(item.itemCode)})` : ''}${type === 'out' ? ` [현재 ${parseFloat(item.quantity || 0)}]` : ''}
                    </option>
                  `).join('')}
                </select>
              ` : `
                <input class="form-input" id="tx-item-name" placeholder="품목명을 직접 입력해 주세요" />
              `}
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">수량 <span class="required">*</span></label>
                <input class="form-input" type="number" id="tx-qty" placeholder="0" min="1" />
              </div>
              <div class="form-group">
                <label class="form-label">원가 (매입단가)</label>
                <input class="form-input" type="number" id="tx-price" placeholder="선택 사항" />
              </div>
            </div>

            ${type === 'in' ? `
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">판매가</label>
                <input class="form-input" type="number" id="tx-selling-price" placeholder="선택 사항" />
              </div>
              <div class="form-group">
                <label class="form-label">실판매가</label>
                <input class="form-input" type="number" id="tx-actual-price" placeholder="선택 사항" />
              </div>
            </div>
            <div class="form-group" id="tx-margin-display" style="display:none;">
              <label class="form-label">이익률</label>
              <div class="form-input" style="background:var(--bg-lighter); cursor:default; font-weight:600;" id="tx-margin-value">-</div>
              <div class="smart-inline-note">이익률 = (실판매가 - 원가) ÷ 원가 × 100</div>
            </div>
            ` : `
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">출고단가 <span style="font-size:11px; color:var(--text-muted);">(판매가)</span></label>
                <input class="form-input" type="number" id="tx-selling-price" placeholder="선택 사항" />
              </div>
              <div class="form-group">
                <label class="form-label" style="color:transparent;">-</label>
                <div id="tx-out-profit-display" style="padding:8px 12px; background:var(--bg-lighter); border-radius:var(--radius); font-size:13px; color:var(--text-muted);">출고단가 입력 시 이익 자동 계산</div>
              </div>
            </div>
            `}

            <details class="smart-details" open>
              <summary>날짜와 메모 더 보기</summary>
              <div class="smart-details-body">
                <div class="form-row">
                  <div class="form-group">
                    <label class="form-label">날짜 <span class="required">*</span></label>
                    <input class="form-input" type="date" id="tx-date" value="${today}" />
                  </div>
                  <div class="form-group">
                    <label class="form-label">메모</label>
                    <input class="form-input" id="tx-note" placeholder="메모 (선택 사항)" />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div class="form-shell-side">
            <div class="form-card">
              <div class="form-card-title">입력 체크</div>
              <div class="form-card-desc">품목, 수량, 날짜가 있으면 저장할 수 있습니다. 출고는 현재 재고를 넘지 않는지만 확인해 주세요.</div>
              <div class="form-status-list" id="tx-status-list"></div>
            </div>
            <div class="smart-summary-grid">
              <div class="smart-summary-item">
                <div class="smart-summary-label">선택 품목</div>
                <div class="smart-summary-value" id="tx-summary-item">미선택</div>
                <div class="smart-summary-note" id="tx-summary-code">품목을 선택하면 코드와 현재 재고가 표시됩니다.</div>
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">반영 후 재고</div>
                <div class="smart-summary-value" id="tx-summary-stock">-</div>
                <div class="smart-summary-note" id="tx-summary-stock-note">수량 입력 전입니다.</div>
              </div>
              <div class="smart-summary-item">
                <div class="smart-summary-label">예상 반영 금액</div>
                <div class="smart-summary-value" id="tx-summary-amount">₩0</div>
                <div class="smart-summary-note" id="tx-summary-amount-note">수량과 원가를 넣으면 금액을 즉시 계산합니다.</div>
              </div>
              <div class="smart-summary-item" id="tx-summary-margin-wrap" style="display:none;">
                <div class="smart-summary-label">이익률</div>
                <div class="smart-summary-value" id="tx-summary-margin" style="color:var(--success);">-</div>
                <div class="smart-summary-note" id="tx-summary-margin-note">원가와 실판매가를 입력하면 자동 계산됩니다.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" id="modal-cancel">취소</button>
        <button class="btn ${type === 'in' ? 'btn-success' : 'btn-danger'}" id="modal-save">${typeLabel} 저장</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const itemSelect = overlay.querySelector('#tx-item');
  const itemSearchInput = overlay.querySelector('#tx-item-search');
  const itemSearchMeta = overlay.querySelector('#tx-item-search-meta');
  const inputs = {
    vendor: overlay.querySelector('#tx-vendor'),
    itemName: overlay.querySelector('#tx-item-name'),
    qty: overlay.querySelector('#tx-qty'),
    price: overlay.querySelector('#tx-price'),
    sellingPrice: overlay.querySelector('#tx-selling-price'),
    actualPrice: overlay.querySelector('#tx-actual-price'),
    date: overlay.querySelector('#tx-date'),
    note: overlay.querySelector('#tx-note'),
  };
  const formatMoney = (value) => `₩${Math.round(value || 0).toLocaleString('ko-KR')}`;

  const getSelectedItem = () => {
    if (!itemSelect || itemSelect.value === '') return null;
    return items[parseInt(itemSelect.value, 10)] || null;
  };

  const getOptionLabel = (item) => {
    const qtyLabel = (parseFloat(item.quantity || 0) || 0).toLocaleString('ko-KR');
    return `${escapeHtml(item.itemName || '-')}${item.itemCode ? ` (${escapeHtml(item.itemCode)})` : ''}${type === 'out' ? ` [현재 ${qtyLabel}]` : ''}`;
  };

  const renderItemOptions = (keyword = '') => {
    if (!itemSelect) return;
    const previousValue = itemSelect.value;
    const query = String(keyword || '').trim().toLowerCase();
    const matched = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (!query) return true;
        const haystack = `${item.itemName || ''} ${item.itemCode || ''} ${item.vendor || ''}`.toLowerCase();
        return haystack.includes(query);
      });

    const visibleValues = new Set(['']);
    itemSelect.textContent = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = '-- 품목 선택 --';
    itemSelect.appendChild(placeholderOption);

    if (previousValue !== '' && !matched.some(({ index }) => String(index) === previousValue)) {
      const selectedItem = items[parseInt(previousValue, 10)];
      if (selectedItem) {
        visibleValues.add(String(previousValue));
        const option = document.createElement('option');
        option.value = previousValue;
        option.dataset.code = String(selectedItem.itemCode || '');
        option.dataset.price = String(selectedItem.unitPrice || '');
        option.dataset.qty = String(selectedItem.quantity || 0);
        option.textContent = `${selectedItem.itemName || '-'}${selectedItem.itemCode ? ` (${selectedItem.itemCode})` : ''}${type === 'out' ? ` [현재 ${(parseFloat(selectedItem.quantity || 0) || 0).toLocaleString('ko-KR')}]` : ''} (현재 선택)`;
        itemSelect.appendChild(option);
      }
    }

    matched.forEach(({ item, index }) => {
      visibleValues.add(String(index));
      const option = document.createElement('option');
      option.value = String(index);
      option.dataset.code = String(item.itemCode || '');
      option.dataset.price = String(item.unitPrice || '');
      option.dataset.qty = String(item.quantity || 0);
      option.textContent = `${item.itemName || '-'}${item.itemCode ? ` (${item.itemCode})` : ''}${type === 'out' ? ` [현재 ${(parseFloat(item.quantity || 0) || 0).toLocaleString('ko-KR')}]` : ''}`;
      itemSelect.appendChild(option);
    });

    itemSelect.value = visibleValues.has(previousValue) ? previousValue : '';

    if (itemSearchMeta) {
      itemSearchMeta.textContent = `표시 ${matched.length}개 / 전체 ${items.length}개`;
    }
  };

  const refreshTxSummary = () => {
    const selectedItem = getSelectedItem();
    const qty = parseFloat(inputs.qty.value) || 0;
    const price = parseFloat(inputs.price.value) || 0;
    const currentQty = selectedItem ? (parseFloat(selectedItem.quantity) || 0) : 0;
    const nextQty = type === 'in' ? currentQty + qty : currentQty - qty;

    overlay.querySelector('#tx-summary-item').textContent = selectedItem?.itemName || inputs.itemName?.value?.trim() || '미선택';
    overlay.querySelector('#tx-summary-code').textContent = selectedItem
      ? `코드 ${selectedItem.itemCode || '-'} / 현재 재고 ${currentQty.toLocaleString('ko-KR')}개`
      : '품목을 선택하면 코드와 현재 재고가 표시됩니다.';
    overlay.querySelector('#tx-summary-stock').textContent = selectedItem ? `${nextQty.toLocaleString('ko-KR')}개` : '-';
    overlay.querySelector('#tx-summary-stock-note').textContent = selectedItem
      ? `${typeLabel} 후 예상 재고는 ${nextQty.toLocaleString('ko-KR')}개입니다.`
      : '수량 입력 전입니다.';
    overlay.querySelector('#tx-summary-amount').textContent = qty > 0 && price > 0 ? formatMoney(qty * price) : '₩0';
    overlay.querySelector('#tx-summary-amount-note').textContent = qty > 0 && price > 0
      ? `${qty.toLocaleString('ko-KR')}개 × ${formatMoney(price)} 기준 금액입니다.`
      : '수량과 원가를 넣으면 금액을 즉시 계산합니다.';

    // 이익 계산 표시
    if (type === 'in') {
      const actualPrice = parseFloat(inputs.actualPrice?.value) || 0;
      const marginDisplayEl = overlay.querySelector('#tx-margin-display');
      const marginValueEl = overlay.querySelector('#tx-margin-value');
      const summaryMarginWrap = overlay.querySelector('#tx-summary-margin-wrap');
      const summaryMargin = overlay.querySelector('#tx-summary-margin');
      const summaryMarginNote = overlay.querySelector('#tx-summary-margin-note');

      if (price > 0 && actualPrice > 0) {
        const margin = ((actualPrice - price) / price * 100).toFixed(1);
        const marginNum = parseFloat(margin);
        const marginColor = marginNum > 0 ? 'var(--success)' : marginNum < 0 ? 'var(--danger)' : 'var(--text-muted)';
        const marginText = `${marginNum > 0 ? '+' : ''}${margin}%`;

        if (marginDisplayEl) marginDisplayEl.style.display = '';
        if (marginValueEl) { marginValueEl.textContent = marginText; marginValueEl.style.color = marginColor; }
        if (summaryMarginWrap) summaryMarginWrap.style.display = '';
        if (summaryMargin) { summaryMargin.textContent = marginText; summaryMargin.style.color = marginColor; }
        if (summaryMarginNote) summaryMarginNote.textContent = `원가 ${formatMoney(price)} → 실판매가 ${formatMoney(actualPrice)}`;
      } else {
        if (marginDisplayEl) marginDisplayEl.style.display = 'none';
        if (summaryMarginWrap) summaryMarginWrap.style.display = 'none';
      }
    } else if (type === 'out') {
      const salePrice = parseFloat(inputs.sellingPrice?.value) || 0;
      const profitEl = overlay.querySelector('#tx-out-profit-display');
      if (profitEl && salePrice > 0 && price > 0 && qty > 0) {
        const outAmt = Math.round(salePrice * qty);
        const costAmt = Math.round(price * qty);
        const profit = outAmt - costAmt;
        const profitRate = outAmt > 0 ? (profit / outAmt * 100).toFixed(1) : '0.0';
        const color = profit > 0 ? 'var(--success)' : profit < 0 ? 'var(--danger)' : 'var(--text-muted)';
        profitEl.innerHTML = `이익액 <strong style="color:${color};">₩${profit.toLocaleString('ko-KR')}</strong> &nbsp; 이익률 <strong style="color:${color};">${profit >= 0 ? '+' : ''}${profitRate}%</strong>`;
      } else if (profitEl) {
        profitEl.textContent = '출고단가 입력 시 이익 자동 계산';
      }
    }

    const statusItems = [
      { done: !!(selectedItem || inputs.itemName?.value?.trim()), text: '품목이 선택되었습니다.' },
      { done: qty > 0, text: '수량이 입력되었습니다.' },
      { done: !!inputs.date.value, text: '날짜가 입력되었습니다.' },
      { done: !!inputs.vendor.value, text: '거래처가 연결되었습니다.' },
      { done: type !== 'out' || !selectedItem || nextQty >= 0, text: type === 'out' ? '출고 후 재고가 음수가 아닙니다.' : '입고 반영 후 재고가 계산되었습니다.' },
    ];
    const statusListEl = overlay.querySelector('#tx-status-list');
    if (statusListEl) statusListEl.innerHTML = statusItems.map(entry => `
      <div class="form-status-item ${entry.done ? 'is-complete' : ''}">${entry.text}</div>
    `).join('');
  };

  if (itemSelect) {
    renderItemOptions('');
    itemSelect.addEventListener('change', () => {
      const selectedItem = getSelectedItem();
      if (selectedItem && !inputs.price.value) {
        inputs.price.value = selectedItem.unitPrice || '';
      }
      refreshTxSummary();
    });
  }
  if (itemSearchInput && itemSelect) {
    itemSearchInput.addEventListener('input', () => {
      renderItemOptions(itemSearchInput.value);
      refreshTxSummary();
    });
  }
  Object.values(inputs).forEach(input => {
    input?.addEventListener('input', refreshTxSummary);
    input?.addEventListener('change', refreshTxSummary);
  });
  refreshTxSummary();

  const close = () => overlay.remove();
  overlay.querySelector('#modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#modal-save').addEventListener('click', () => {
    // ── 모든 에러 초기화 ──────────────────────────────────
    clearAllFieldErrors(overlay);

    let hasError = false;
    let itemName = '';
    let itemCode = '';
    let currentQty = 0;

    // 1. 품목 선택 / 품목명 입력
    if (items.length > 0 && itemSelect) {
      const idx = itemSelect.value;
      if (idx === '') {
        showFieldError(itemSelect, '품목을 선택해 주세요.');
        hasError = true;
      } else {
        const selectedItem = items[parseInt(idx, 10)];
        itemName    = selectedItem.itemName;
        itemCode    = selectedItem.itemCode || '';
        currentQty  = parseFloat(selectedItem.quantity) || 0;
      }
    } else {
      itemName = inputs.itemName?.value.trim() || '';
      if (!itemName) {
        showFieldError(inputs.itemName, '품목명을 입력해 주세요.');
        hasError = true;
      }
    }

    // 2. 수량 — 필수, 양수, 정수
    const qtyRaw = inputs.qty.value.trim();
    let qty = 0;
    if (!qtyRaw) {
      showFieldError(inputs.qty, '수량을 입력해 주세요.');
      hasError = true;
    } else {
      qty = parseFloat(qtyRaw);
      if (isNaN(qty)) {
        showFieldError(inputs.qty, '수량에 숫자만 입력해 주세요.');
        hasError = true;
      } else if (qty <= 0) {
        showFieldError(inputs.qty, '수량은 1 이상이어야 합니다.');
        hasError = true;
      } else if (!Number.isInteger(qty)) {
        // 경고만 표시 (소수점 허용하되 알림)
        const warnEl = document.createElement('div');
        warnEl.className = 'form-warn-msg';
        warnEl.textContent = '소수점 수량입니다. 맞으면 그냥 저장하세요.';
        inputs.qty.parentNode?.appendChild(warnEl);
      }
    }

    // 3. 날짜 필수
    const date = inputs.date.value;
    if (!date) {
      showFieldError(inputs.date, '날짜를 선택해 주세요.');
      hasError = true;
    } else {
      // 미래 날짜 경고 (에러는 아님)
      const today = new Date().toISOString().split('T')[0];
      if (date > today) {
        const warnEl = document.createElement('div');
        warnEl.className = 'form-warn-msg';
        warnEl.textContent = '미래 날짜입니다. 의도한 날짜인지 확인해 주세요.';
        inputs.date.parentNode?.appendChild(warnEl);
      }
    }

    // 4. 단가 — 숫자, 음수 불가 (선택 사항)
    const priceRaw = inputs.price?.value?.trim();
    if (priceRaw) {
      const price = parseFloat(priceRaw);
      if (isNaN(price)) {
        showFieldError(inputs.price, '단가에 숫자만 입력해 주세요.');
        hasError = true;
      } else if (price < 0) {
        showFieldError(inputs.price, '단가는 0 이상이어야 합니다.');
        hasError = true;
      }
    }

    // 5. 출고 재고 초과 체크
    if (!hasError && type === 'out' && items.length > 0 && itemSelect && qty > 0) {
      if (qty > currentQty) {
        showFieldError(inputs.qty,
          `현재 재고(${currentQty.toLocaleString('ko-KR')}개)보다 많이 출고할 수 없습니다.`
        );
        hasError = true;
      }
    }

    if (hasError) return;

    // ── 저장 ─────────────────────────────────────────────
    const saveBtn  = overlay.querySelector('#modal-save');
    const restore  = setSavingState(saveBtn, '저장 중...');
    try {
      addTransaction({
        type,
        vendor:              inputs.vendor.value || '',
        itemName,
        itemCode,
        quantity:            qty,
        unitPrice:           parseFloat(inputs.price?.value) || 0,
        sellingPrice:        parseFloat(inputs.sellingPrice?.value) || 0,
        actualSellingPrice:  parseFloat(inputs.actualPrice?.value) || 0,
        date,
        note:                inputs.note.value.trim(),
      });
      showToast(`${typeLabel} 기록: ${itemName} ${qty}개`, type === 'in' ? 'success' : 'info');
      close();
      renderInoutPage(container, navigateTo);
    } catch (err) {
      restore();
      handlePageError(err, { page: 'inout', action: 'save-transaction' });
    }
  });

  setTimeout(() => {
    if (items.length > 0) {
      const searchInput = overlay.querySelector('#tx-item-search');
      if (searchInput) {
        searchInput.focus();
      } else {
        overlay.querySelector('#tx-item')?.focus();
      }
    } else {
      overlay.querySelector('#tx-item-name')?.focus();
    }
  }, 100);
}

// === ?좏떥 ===

function countToday(transactions, type) {
  const today = new Date().toISOString().split('T')[0];
  return transactions.filter(tx => tx.type === type && tx.date === today).length;
}

/**
 * 입출고 관리 페이지 렌더링
 * 왜 트랜잭션과 품목 모두에서? → 기존 트랜잭션에 vendor가 없을 수 있으므로
 * 왜 트랜잭션과 품목 모두에서? → 기존 트랜잭션에 vendor가 없을 수 있으므로
 */
function getVendorOptions(transactions, items) {
  const fromTx = transactions.map(tx => tx.vendor).filter(Boolean);
  const fromItems = items.map(i => i.vendor).filter(Boolean);
  return [...new Set([...fromTx, ...fromItems])].sort();
}

function getCodeList(items) {
  return [...new Set(items.map(i => i.itemCode).filter(Boolean))].sort();
}

/** 입고관리 전용 페이지 (입고 기록만 표시) */
export function renderInPage(container, navigateTo) {
  return renderInoutPage(container, navigateTo, 'in');
}

/** 출고관리 전용 페이지 (출고 기록만 표시) */
export function renderOutPage(container, navigateTo) {
  return renderInoutPage(container, navigateTo, 'out');
}

