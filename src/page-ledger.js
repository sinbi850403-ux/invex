/**
 * page-ledger.js - 수불부 (재고 수불대장)
 * 역할: 기간별 품목의 입고/출고/잔량을 장부 형식으로 자동 생성
 * 왜 필요? → 한국 기업 세무/회계 보고의 필수 장부. 세무사에게 제출해야 함.
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

// jsPDF에 autoTable 플러그인 연결 (ESM 환경에서 필수)
applyPlugin(jsPDF);

export function renderLedgerPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  // 기본 기간: 이번 달
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = now.toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📒</span> 수불부 (재고수불대장)</h1>
        <div class="page-desc">기간별 품목의 입고·출고·잔량을 장부 형식으로 자동 생성합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-ledger-excel">📥 엑셀 다운로드</button>
        <button class="btn btn-primary" id="btn-ledger-pdf">📄 PDF 다운로드</button>
      </div>
    </div>

    <!-- 기간 선택 -->
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

    <!-- 수불부 테이블 -->
    <div class="card card-flush" id="ledger-table-area">
      <div style="padding:24px; text-align:center; color:var(--text-muted);">조회 버튼을 눌러주세요</div>
    </div>
  `;

  // 초기 렌더링
  renderLedgerTable();

  // 조회 버튼
  container.querySelector('#btn-ledger-render').addEventListener('click', renderLedgerTable);

  function renderLedgerTable() {
    const from = container.querySelector('#ledger-from').value;
    const to = container.querySelector('#ledger-to').value;
    const itemFilter = container.querySelector('#ledger-item-filter').value;

    const ledgerData = buildLedger(items, transactions, from, to, itemFilter);
    const tableArea = container.querySelector('#ledger-table-area');

    if (ledgerData.length === 0) {
      tableArea.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);">해당 기간에 데이터가 없습니다.</div>';
      return;
    }

    tableArea.innerHTML = `
      <div style="padding:16px 20px; border-bottom:1px solid var(--border); background:#f8f9fb;">
        <strong>📒 수불대장</strong>
        <span style="color:var(--text-muted); font-size:13px; margin-left:8px;">${from} ~ ${to} (${ledgerData.length}개 품목)</span>
      </div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table" id="ledger-data-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>품목명</th>
              <th>코드</th>
              <th>단위</th>
              <th class="text-right">기초재고</th>
              <th class="text-right" style="color:var(--success);">입고</th>
              <th class="text-right" style="color:var(--danger);">출고</th>
              <th class="text-right" style="font-weight:700;">기말재고</th>
              <th class="text-right">단가</th>
              <th class="text-right">재고금액</th>
            </tr>
          </thead>
          <tbody>
            ${ledgerData.map((row, i) => `
              <tr>
                <td class="col-num">${i + 1}</td>
                <td><strong>${row.itemName}</strong></td>
                <td style="color:var(--text-muted); font-size:12px;">${row.itemCode || '-'}</td>
                <td>${row.unit || '-'}</td>
                <td class="text-right">${row.openingQty.toLocaleString('ko-KR')}</td>
                <td class="text-right type-in">${row.inQty > 0 ? '+' + row.inQty.toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right type-out">${row.outQty > 0 ? '-' + row.outQty.toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right" style="font-weight:700;">${row.closingQty.toLocaleString('ko-KR')}</td>
                <td class="text-right">${row.unitPrice > 0 ? '₩' + row.unitPrice.toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right">${row.closingValue > 0 ? '₩' + row.closingValue.toLocaleString('ko-KR') : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:#f0f2f5;">
              <td colspan="4" class="text-right">합계</td>
              <td class="text-right">${ledgerData.reduce((s, r) => s + r.openingQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right type-in">+${ledgerData.reduce((s, r) => s + r.inQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right type-out">-${ledgerData.reduce((s, r) => s + r.outQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right">${ledgerData.reduce((s, r) => s + r.closingQty, 0).toLocaleString('ko-KR')}</td>
              <td class="text-right"></td>
              <td class="text-right">₩${ledgerData.reduce((s, r) => s + r.closingValue, 0).toLocaleString('ko-KR')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // 엑셀 다운로드
  container.querySelector('#btn-ledger-excel').addEventListener('click', () => {
    const from = container.querySelector('#ledger-from').value;
    const to = container.querySelector('#ledger-to').value;
    const itemFilter = container.querySelector('#ledger-item-filter').value;
    const data = buildLedger(items, transactions, from, to, itemFilter);
    if (data.length === 0) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }

    const exportData = data.map(r => ({
      '품목명': r.itemName,
      '품목코드': r.itemCode || '',
      '단위': r.unit || '',
      '기초재고': r.openingQty,
      '입고수량': r.inQty,
      '출고수량': r.outQty,
      '기말재고': r.closingQty,
      '단가': r.unitPrice,
      '재고금액': r.closingValue,
    }));
    downloadExcel(exportData, `수불부_${from}_${to}`);
    showToast('수불부를 엑셀로 다운로드했습니다.', 'success');
  });

  // PDF 다운로드
  container.querySelector('#btn-ledger-pdf').addEventListener('click', () => {
    const from = container.querySelector('#ledger-from').value;
    const to = container.querySelector('#ledger-to').value;
    const itemFilter = container.querySelector('#ledger-item-filter').value;
    const data = buildLedger(items, transactions, from, to, itemFilter);
    if (data.length === 0) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }

    try {
      const doc = new jsPDF('landscape');
      doc.setFontSize(16);
      doc.text('INVENTORY LEDGER', 148, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Period: ${from} ~ ${to}`, 14, 25);

      const tableData = data.map((r, i) => [
        i + 1, r.itemName, r.itemCode || '-', r.unit || '-',
        r.openingQty, r.inQty > 0 ? '+' + r.inQty : '-',
        r.outQty > 0 ? '-' + r.outQty : '-', r.closingQty,
        r.unitPrice > 0 ? r.unitPrice.toLocaleString() : '-',
        r.closingValue > 0 ? r.closingValue.toLocaleString() : '-',
      ]);

      doc.autoTable({
        startY: 32,
        head: [['No', 'Item', 'Code', 'Unit', 'Opening', 'In', 'Out', 'Closing', 'Price', 'Value']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 8 },
      });

      doc.save(`Ledger_${from}_${to}.pdf`);
      showToast('수불부 PDF를 다운로드했습니다.', 'success');
    } catch (err) {
      showToast('PDF 생성 실패: ' + err.message, 'error');
    }
  });
}

/**
 * 수불부 데이터 생성
 * 로직: 기초재고 = 현재재고 - 기간입고 + 기간출고
 * (거래 이력을 역산해서 기초재고를 추정)
 */
function buildLedger(items, transactions, from, to, itemFilter) {
  // 해당 기간 거래만 필터
  const periodTx = transactions.filter(tx => tx.date >= from && tx.date <= to);

  // 품목별 입출고 집계
  const txMap = {};
  periodTx.forEach(tx => {
    const key = tx.itemName;
    if (!txMap[key]) txMap[key] = { inQty: 0, outQty: 0 };
    const qty = parseFloat(tx.quantity) || 0;
    if (tx.type === 'in') txMap[key].inQty += qty;
    else txMap[key].outQty += qty;
  });

  // 수불부 행 생성
  let targetItems = items;
  if (itemFilter) {
    targetItems = items.filter(i => i.itemName === itemFilter);
  }

  return targetItems.map(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const tx = txMap[item.itemName] || { inQty: 0, outQty: 0 };

    // 기초재고 역산: 현재재고 - 기간입고 + 기간출고
    const openingQty = currentQty - tx.inQty + tx.outQty;
    const closingQty = currentQty;
    const closingValue = closingQty * unitPrice;

    return {
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      unit: item.unit || '',
      unitPrice,
      openingQty: Math.max(0, openingQty),
      inQty: tx.inQty,
      outQty: tx.outQty,
      closingQty,
      closingValue,
    };
  }).filter(r => r.openingQty > 0 || r.inQty > 0 || r.outQty > 0 || r.closingQty > 0);
}
