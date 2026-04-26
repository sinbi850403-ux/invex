/**
 * page-ledger.js - 수불부 (재고수불대장)
 * 역할: 기간별 품목 입고/출고/잔량을 장부 형식으로 자동 생성
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { enableColumnResize } from './ux-toolkit.js';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { applyKoreanFont, getKoreanFontStyle } from './pdf-font.js';

applyPlugin(jsPDF);

const LEDGER_TEXT_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const LEDGER_SORT_FIELDS = [
  { key: 'itemName', label: '품목명' },
  { key: 'itemCode', label: '코드' },
  { key: 'unit', label: '단위' },
  { key: 'openingQty', label: '기초재고', numeric: true, align: 'text-right' },
  { key: 'inQty', label: '입고', numeric: true, align: 'text-right', style: 'color:var(--success);' },
  { key: 'outQty', label: '출고', numeric: true, align: 'text-right', style: 'color:var(--danger);' },
  { key: 'closingQty', label: '기말재고', numeric: true, align: 'text-right', style: 'font-weight:700;' },
  { key: 'unitPrice', label: '단가', numeric: true, align: 'text-right' },
  { key: 'closingValue', label: '재고금액', numeric: true, align: 'text-right' },
];
const LEDGER_SORT_FIELD_MAP = Object.fromEntries(LEDGER_SORT_FIELDS.map(field => [field.key, field]));
let ledgerSortState = { key: 'closingValue', direction: 'desc' };

export function renderLedgerPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const openingOverrides = state.ledgerOpeningOverrides || {};

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = now.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">수불부 (재고수불대장)</h1>
        <div class="page-desc">기간별 품목의 입고, 출고, 잔량을 장부 형식으로 자동 생성합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-ledger-opening">기초재고 입력</button>
        <button class="btn btn-outline" id="btn-ledger-excel">📊 엑셀 다운로드</button>
        <button class="btn btn-primary" id="btn-ledger-pdf">📄 PDF 다운로드</button>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <div class="form-group" style="margin:0;">
          <label class="form-label">시작일</label>
          <input class="form-input" type="date" id="ledger-from" value="${firstDay}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">종료일</label>
          <input class="form-input" type="date" id="ledger-to" value="${lastDay}" />
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">품목 필터</label>
          <select class="form-select" id="ledger-item-filter">
            <option value="">전체 품목</option>
            ${items.map(item => `<option value="${item.itemName}">${item.itemName} (${item.itemCode || '-'})</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" id="btn-ledger-render" style="margin-top:18px;">조회</button>
      </div>
    </div>

    <div class="card card-flush" id="ledger-table-area">
      <div style="padding:24px; text-align:center; color:var(--text-muted);">조회 버튼을 눌러주세요.</div>
    </div>
  `;

  renderLedgerTable();
  container.querySelector('#btn-ledger-render')?.addEventListener('click', renderLedgerTable);
  container.querySelector('#btn-ledger-opening')?.addEventListener('click', () => {
    openOpeningModal(container, items, openingOverrides, () => renderLedgerTable());
  });

  container.querySelector('#btn-ledger-excel')?.addEventListener('click', () => {
    const { from, to, rows } = getLedgerRows(container, items, transactions, openingOverrides);
    if (rows.length === 0) {
      showToast('내보낼 데이터가 없습니다.', 'warning');
      return;
    }

    const exportRows = rows.map(row => {
      const unitCost = row.unitPrice || 0;
      const inQty   = row.inQty || 0;
      const outQty  = row.outQty || 0;
      const salePrice = row.sellingPrice || 0;

      const supply = Math.round(unitCost * inQty);
      const vat    = Math.floor(supply * 0.1);
      const outAmt = Math.round(salePrice * outQty);
      const purchase = Math.round(unitCost * outQty);
      const profit   = outAmt - purchase;
      const profitRate = purchase > 0 ? (profit / purchase * 100).toFixed(1) + '%' : '';
      const costRate   = outAmt > 0   ? (purchase / outAmt * 100).toFixed(1) + '%'  : '';

      return {
        '자산':       row.category || '',
        '입고일자':   from || '',
        '상품코드':   row.itemCode || '',
        '거래처':     row.vendor || '',
        '품명':       row.itemName,
        '규격':       row.spec || '',
        '단위':       row.unit || '',
        '입고수량':   inQty,
        '단가':       unitCost,
        '공급가액':   supply,
        '부가세':     vat,
        '합계금액':   supply + vat,
        '출고단가':   salePrice,
        '출고수량':   outQty,
        '출고금액':   outAmt,
        '매입원가':   purchase,
        '이익액':     profit,
        '이익율':     profitRate,
        '매출원가율': costRate,
        '기말재고수량': row.closingQty,
        '기말재고':   row.closingValue,
      };
    });

    downloadExcel(exportRows, `수불부_${from}_${to}`);
    showToast('수불부를 엑셀로 내보냈습니다.', 'success');
  });

  container.querySelector('#btn-ledger-pdf')?.addEventListener('click', async () => {
    const { from, to, rows } = getLedgerRows(container, items, transactions, openingOverrides);
    if (rows.length === 0) {
      showToast('내보낼 데이터가 없습니다.', 'warning');
      return;
    }

    try {
      showToast('PDF 생성 중입니다. (폰트 로딩)', 'info', 2000);

      const doc = new jsPDF('landscape');
      const fontStyle = getKoreanFontStyle();
      await applyKoreanFont(doc);

      doc.setFontSize(16);
      doc.text('재고 수불대장', 148, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`기간: ${from} ~ ${to}`, 14, 25);

      const tableRows = rows.map((row, index) => [
        index + 1,
        row.itemName,
        row.itemCode || '-',
        row.unit || '-',
        row.openingQty,
        row.inQty > 0 ? `+${row.inQty}` : '-',
        row.outQty > 0 ? `-${row.outQty}` : '-',
        row.closingQty,
        row.unitPrice > 0 ? formatLedgerMoney(row.unitPrice) : '-',
        row.closingValue > 0 ? formatLedgerMoney(row.closingValue) : '-',
      ]);

      doc.autoTable({
        startY: 32,
        head: [['No', '품목명', '코드', '단위', '기초재고', '입고', '출고', '기말재고', '단가', '재고금액']],
        body: tableRows,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235], ...fontStyle },
        bodyStyles: { ...fontStyle },
        styles: { fontSize: 8, ...fontStyle },
      });

      doc.save(`수불대장_${from}_${to}.pdf`);
      showToast('수불부 PDF를 다운로드했습니다.', 'success');
    } catch (error) {
      showToast(`PDF 생성 실패: ${error.message}`, 'error');
    }
  });

  function renderLedgerTable() {
    const tableArea = container.querySelector('#ledger-table-area');
    const { from, to, rows } = getLedgerRows(container, items, transactions, openingOverrides);

    if (!tableArea) return;

    if (rows.length === 0) {
      tableArea.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">해당 기간의 데이터가 없습니다.</div>';
      return;
    }

    tableArea.innerHTML = `
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); background:var(--bg-card);">
        <strong>📒 수불대장</strong>
        <span style="color:var(--text-muted); font-size:13px; margin-left:8px;">${from} ~ ${to} (${rows.length}개 품목)</span>
        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">정렬: ${getLedgerSortSummary(ledgerSortState)}</span>
      </div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table" id="ledger-data-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              ${LEDGER_SORT_FIELDS.map(field => renderLedgerHeader(field, ledgerSortState)).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, index) => renderLedgerRow(row, index)).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--bg-card);">
              <td colspan="4" class="text-right">합계</td>
              <td class="text-right">${rows.reduce((sum, row) => sum + row.openingQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right type-in">+${rows.reduce((sum, row) => sum + row.inQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right type-out">-${rows.reduce((sum, row) => sum + row.outQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right">${rows.reduce((sum, row) => sum + row.closingQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right"></td>
              <td class="text-right">${formatLedgerMoney(rows.reduce((sum, row) => sum + row.closingValue, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="chart-help-text" style="padding:0 20px 16px;">표 제목을 누르면 품목명, 수량, 금액 기준으로 바로 정렬됩니다.</div>
    `;

    tableArea.querySelectorAll('.table-sort-btn[data-sort-key]').forEach(button => {
      button.addEventListener('click', () => {
        const nextKey = button.dataset.sortKey;
        if (!nextKey) return;

        ledgerSortState = getNextLedgerSortState(ledgerSortState, nextKey);
        renderLedgerTable();
      });
    });

    enableColumnResize(tableArea.querySelector('#ledger-data-table'));
  }
}

function getLedgerRows(container, items, transactions, openingOverrides) {
  const from = container.querySelector('#ledger-from')?.value || '';
  const to = container.querySelector('#ledger-to')?.value || '';
  const itemFilter = container.querySelector('#ledger-item-filter')?.value || '';
  const ledgerRows = buildLedger(items, transactions, from, to, itemFilter, openingOverrides);
  const sortedRows = sortLedgerRows(ledgerRows, ledgerSortState);

  return {
    from,
    to,
    itemFilter,
    rows: sortedRows,
  };
}

function renderLedgerHeader(field, sortState) {
  const classes = ['sortable-col'];
  if (field.align) classes.push(field.align);
  if (field.key === 'itemName') classes.push('col-fill');

  return `
    <th class="${classes.join(' ')}">
      <button
        type="button"
        class="table-sort-btn ${sortState.key === field.key ? 'active' : ''}"
        data-sort-key="${field.key}"
        style="${field.style || ''}"
      >
        <span>${field.label}</span>
        <span class="table-sort-arrow">${getLedgerSortArrow(field.key, sortState)}</span>
      </button>
    </th>
  `;
}

function renderLedgerRow(row, index) {
  return `
    <tr>
      <td class="col-num">${index + 1}</td>
      <td class="col-fill"><strong>${row.itemName}</strong></td>
      <td style="color:var(--text-muted); font-size:12px;">${row.itemCode || '-'}</td>
      <td>${row.unit || '-'}</td>
      <td class="text-right">${row.openingQty.toLocaleString('ko-KR')}</td>
      <td class="text-right type-in">${row.inQty > 0 ? `+${row.inQty.toLocaleString('ko-KR')}` : '-'}</td>
      <td class="text-right type-out">${row.outQty > 0 ? `-${row.outQty.toLocaleString('ko-KR')}` : '-'}</td>
      <td class="text-right" style="font-weight:700;">${row.closingQty.toLocaleString('ko-KR')}</td>
      <td class="text-right">${row.unitPrice > 0 ? formatLedgerMoney(row.unitPrice) : '-'}</td>
      <td class="text-right">${row.closingValue > 0 ? formatLedgerMoney(row.closingValue) : '-'}</td>
    </tr>
  `;
}

function openOpeningModal(container, items, openingOverrides, onComplete) {
  const existing = document.getElementById('ledger-opening-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ledger-opening-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:760px;">
      <div class="modal-header">
        <h3 class="modal-title">기초재고 입력</h3>
        <button class="modal-close" data-ledger-close>✕</button>
      </div>
      <div class="modal-body">
        <div style="display:flex; gap:12px; align-items:center; margin-bottom:12px;">
          <input class="form-input" id="ledger-opening-search" placeholder="품목명을 검색하세요" />
          <button class="btn btn-outline btn-sm" id="ledger-opening-clear">초기화</button>
        </div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>품목명</th>
                <th class="text-right">현재 재고</th>
                <th class="text-right">기초재고</th>
              </tr>
            </thead>
            <tbody id="ledger-opening-rows"></tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" data-ledger-cancel>취소</button>
        <button class="btn btn-primary" data-ledger-save>저장</button>
      </div>
    </div>
  `;

  const renderRows = (keyword = '') => {
    const body = overlay.querySelector('#ledger-opening-rows');
    const filtered = keyword
      ? items.filter(item => (item.itemName || '').toLowerCase().includes(keyword.toLowerCase()))
      : items;
    body.innerHTML = filtered.map(item => `
      <tr>
        <td><strong>${item.itemName}</strong></td>
        <td class="text-right">${(parseFloat(item.quantity) || 0).toLocaleString('ko-KR')}</td>
        <td class="text-right">
          <input
            class="form-input"
            style="max-width:120px; text-align:right;"
            data-opening-item="${item.itemName}"
            value="${openingOverrides[item.itemName] ?? ''}"
            placeholder="입력"
          />
        </td>
      </tr>
    `).join('');
  };

  renderRows();

  overlay.querySelector('#ledger-opening-search')?.addEventListener('input', (e) => {
    renderRows(e.target.value);
  });

  overlay.querySelector('#ledger-opening-clear')?.addEventListener('click', () => {
    Object.keys(openingOverrides).forEach(key => delete openingOverrides[key]);
    renderRows(overlay.querySelector('#ledger-opening-search')?.value || '');
  });

  overlay.querySelector('[data-ledger-close]')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-ledger-cancel]')?.addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-ledger-save]')?.addEventListener('click', () => {
    const inputs = overlay.querySelectorAll('[data-opening-item]');
    inputs.forEach(input => {
      const name = input.dataset.openingItem;
      const value = input.value.trim();
      if (value === '') delete openingOverrides[name];
      else openingOverrides[name] = Number.parseFloat(value) || 0;
    });
    setState({ ledgerOpeningOverrides: { ...openingOverrides } });
    overlay.remove();
    onComplete?.();
    showToast('기초재고가 저장되었습니다.', 'success');
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

function getLedgerSortArrow(key, sortState) {
  if (sortState.key !== key) return '↕';
  return sortState.direction === 'asc' ? '↑' : '↓';
}

function getLedgerSortSummary(sortState) {
  const label = LEDGER_SORT_FIELD_MAP[sortState.key]?.label || '품목명';
  return `${label} ${sortState.direction === 'asc' ? '오름차순' : '내림차순'}`;
}

function getNextLedgerSortState(currentSort, nextKey) {
  if (currentSort.key === nextKey) {
    return {
      key: nextKey,
      direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    key: nextKey,
    direction: LEDGER_SORT_FIELD_MAP[nextKey]?.numeric ? 'desc' : 'asc',
  };
}

function sortLedgerRows(rows, sortState) {
  return [...rows].sort((left, right) => compareLedgerRows(left, right, sortState));
}

function compareLedgerRows(left, right, sortState) {
  const leftValue = getLedgerSortValue(left, sortState.key);
  const rightValue = getLedgerSortValue(right, sortState.key);

  const leftEmpty = leftValue === null || leftValue === '';
  const rightEmpty = rightValue === null || rightValue === '';
  if (leftEmpty && rightEmpty) return LEDGER_TEXT_COLLATOR.compare(left.itemName || '', right.itemName || '');
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  let result = 0;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue - rightValue;
  } else {
    result = LEDGER_TEXT_COLLATOR.compare(String(leftValue), String(rightValue));
  }

  if (result === 0) {
    result = LEDGER_TEXT_COLLATOR.compare(left.itemName || '', right.itemName || '');
  }

  return sortState.direction === 'desc' ? result * -1 : result;
}

function getLedgerSortValue(row, key) {
  const value = row[key];
  if (value === null || value === undefined || value === '') return null;
  return LEDGER_SORT_FIELD_MAP[key]?.numeric ? Number(value) : String(value).trim();
}

function formatLedgerMoney(value) {
  if (!value) return '-';
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

/**
 * 수불부 데이터 생성
 * 기초재고 = 현재재고 - 기간입고 + 기간출고
 */
function buildLedger(items, transactions, from, to, itemFilter, openingOverrides = {}) {
  const targetItems = itemFilter
    ? items.filter(item => item.itemName === itemFilter)
    : items;

  return targetItems.map(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;

    let periodInQty = 0;
    let periodOutQty = 0;
    let openingQty = currentQty;
    let primaryVendor = '';  // 해당 기간 가장 최근 거래처

    transactions.forEach(tx => {
      if (tx.itemName !== item.itemName) return;
      const qty = parseFloat(tx.quantity) || 0;

      // from 날짜 '이후'에 발생한 트랜잭션의 효과를 역산하여 from 직전의 재고(기초재고) 도출
      if (tx.date >= from) {
        if (tx.type === 'in') openingQty -= qty;
        else openingQty += qty;
      }

      // 지정된 [from, to] 기간 동안의 입출고 실적 합산
      if (tx.date >= from && tx.date <= to) {
        if (tx.type === 'in') {
          periodInQty += qty;
          if (tx.vendor) primaryVendor = tx.vendor; // 가장 마지막 입고 거래처
        } else {
          periodOutQty += qty;
        }
      }
    });

    const override = openingOverrides[item.itemName];
    const finalOpeningQty = override !== undefined && override !== null && override !== ''
      ? Math.max(0, parseFloat(override) || 0)
      : Math.max(0, openingQty);

    const closingQty = Math.max(0, finalOpeningQty + periodInQty - periodOutQty);
    const closingValue = closingQty * unitPrice;

    return {
      itemName:    item.itemName,
      itemCode:    item.itemCode || '',
      category:    item.category || '',
      spec:        item.spec || '',
      unit:        item.unit || '',
      vendor:      primaryVendor,
      unitPrice,
      sellingPrice: parseFloat(item.sellingPrice || item.salePrice) || 0,
      openingQty:  Math.max(0, openingQty),
      inQty:       periodInQty,
      outQty:      periodOutQty,
      closingQty,
      closingValue,
    };
  }).filter(row => row.openingQty > 0 || row.inQty > 0 || row.outQty > 0 || row.closingQty > 0);
}
