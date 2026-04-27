/**
 * page-documents.js - 문서 자동생성 페이지
 * 왜: 발주서, 견적서, 거래명세서를 자동 생성하고 PDF로 다운로드
 * 소규모 업체에서 가장 시간이 많이 걸리는 서류를 자동화
 */

import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

// jsPDF에 autoTable 플러그인 연결 (ESM 환경에서 필수)
applyPlugin(jsPDF);
import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { applyKoreanFont, getKoreanFontStyle } from './pdf-font.js';

/**
 * 문서 자동생성 페이지 렌더링
 */
export function renderDocumentsPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const safetyStock = state.safetyStock || {};
  const documentDraft = state.documentDraft || null;

  // 안전재고 부족 품목 (발주 추천)
  const lowStockItems = items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity) || 0) <= min;
  });

  // 거래처 목록
  const vendors = [...new Set(items.map(i => i.vendor).filter(Boolean))].sort();
  const recentTransactionCount = (state.transactions || []).filter(tx => {
    const txDate = String(tx.date || '');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return txDate >= cutoff.toISOString().split('T')[0];
  }).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">문서 자동생성</h1>
        <div class="page-desc">발주서, 견적서, 거래명세서를 자동으로 생성하고 PDF로 다운로드합니다.</div>
      </div>
    </div>

    <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="card doc-type-card active" data-doc="purchase" style="cursor:pointer;">
        <div style="font-size:28px; margin-bottom:8px;"></div>
        <div style="font-weight:600; margin-bottom:4px;">발주서</div>
        <div style="font-size:12px; color:var(--text-muted);">부족 품목을 기준으로 자동 추천합니다.</div>
        ${lowStockItems.length > 0 ? `<span class="badge badge-danger" style="margin-top:6px;">${lowStockItems.length}건 부족</span>` : ''}
      </div>
      <div class="card doc-type-card" data-doc="quote" style="cursor:pointer;">
        <div style="font-size:28px; margin-bottom:8px;"></div>
        <div style="font-weight:600; margin-bottom:4px;">견적서</div>
        <div style="font-size:12px; color:var(--text-muted);">품목을 선택해 바로 금액을 계산합니다.</div>
      </div>
      <div class="card doc-type-card" data-doc="statement" style="cursor:pointer;">
        <div style="font-size:28px; margin-bottom:8px;"></div>
        <div style="font-weight:600; margin-bottom:4px;">거래명세서</div>
        <div style="font-size:12px; color:var(--text-muted);">입출고 기록을 기준으로 문서를 만듭니다.</div>
      </div>
    </div>

    <!-- 문서 작성 영역 -->
    <div class="card" id="doc-editor">
      <div id="doc-content"></div>
    </div>
  `;

  // 문서 유형 선택 이벤트
  let currentDocType = 'purchase';
  container.querySelectorAll('.doc-type-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.doc-type-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentDocType = card.dataset.doc;
      renderDocEditor(currentDocType);
    });
  });

  // 초기 렌더링
  renderDocEditor('purchase');
  if (documentDraft) {
    setState({ documentDraft: null });
  }

  /**
   * 문서 편집기 렌더링
   */
  function renderDocEditor(type) {
    const docContent = container.querySelector('#doc-content');

    if (type === 'purchase') {
      renderPurchaseOrder(docContent, items, lowStockItems, vendors, safetyStock, documentDraft);
    } else if (type === 'quote') {
      renderQuote(docContent, items);
    } else if (type === 'statement') {
      renderStatement(docContent, items, state.transactions || []);
    }
  }
}

/**
 * 발주서 작성 UI
 * 왜: 안전재고 부족 품목을 자동으로 추천 + 거래처별 그룹화
 */
function renderPurchaseOrder(el, items, lowStockItems, vendors, safetyStock, documentDraft) {
  const today = new Date().toISOString().split('T')[0];
  const draftItems = documentDraft?.type === 'purchase' ? (documentDraft.items || []) : [];
  const sourceItems = draftItems.length > 0 ? draftItems : (lowStockItems.length > 0 ? lowStockItems : items.slice(0, 10));
  const draftVendor = documentDraft?.type === 'purchase' ? (documentDraft.vendor || '') : '';
  const draftNote = documentDraft?.type === 'purchase' ? (documentDraft.note || '') : '';
  const purchaseVendors = [...new Set([...vendors, draftVendor].filter(Boolean))];

  el.innerHTML = `
    <div class="card-title"> 발주서 작성</div>

    ${draftItems.length > 0 ? `
      <div class="alert alert-info" style="margin-bottom:16px;">
        선택한 발주 추천 품목 <strong>${draftItems.length}건</strong>을 문서 작성 화면으로 가져왔습니다.
      </div>
    ` : lowStockItems.length > 0 ? `
      <div class="alert alert-warning" style="margin-bottom:16px;">
         안전재고 부족 품목이 <strong>${lowStockItems.length}건</strong> 있습니다. 자동으로 추천합니다.
      </div>
    ` : ''}

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">발주일자</label>
        <input class="form-input" type="date" id="po-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="form-label">거래처 선택</label>
        <select class="form-select" id="po-vendor">
          <option value="">전체 거래처</option>
          ${purchaseVendors.map(v => `<option value="${v}" ${draftVendor === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">발주 회사명</label>
        <input class="form-input" id="po-company" placeholder="우리 회사명" />
      </div>
      <div class="form-group">
        <label class="form-label">담당자</label>
        <input class="form-input" id="po-manager" placeholder="담당자명" />
      </div>
    </div>

    <!-- 발주 품목 테이블 -->
    <div class="table-wrapper" style="margin-bottom:16px;">
      <table class="data-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="po-check-all" checked /></th>
            <th>품목명</th>
            <th>품목코드</th>
            <th>거래처</th>
            <th class="text-right">현재 재고</th>
            <th class="text-right">안전재고</th>
            <th class="text-right">발주 수량</th>
            <th class="text-right">단가</th>
          </tr>
        </thead>
        <tbody id="po-items-body">
          ${sourceItems.map((item, i) => {
            const currentQty = parseFloat(item.quantity) || 0;
            const minQty = item.minQty ?? (safetyStock[item.itemName] || 0);
            // 부족분 + 여유분(안전재고의 50%)으로 발주 수량 추천
            const orderQty = item.orderQty || Math.max(1, Math.ceil((minQty - currentQty) + (minQty * 0.5)));
            return `
              <tr>
                <td><input type="checkbox" class="po-item-check" data-idx="${i}" checked /></td>
                <td><strong>${item.itemName}</strong></td>
                <td style="color:var(--text-muted);">${item.itemCode || '-'}</td>
                <td>${item.vendor || '-'}</td>
                <td class="text-right ${currentQty <= minQty ? 'type-out' : ''}">${currentQty.toLocaleString('ko-KR')}</td>
                <td class="text-right">${minQty || '-'}</td>
                <td class="text-right"><input type="number" class="form-input po-order-qty" data-idx="${i}" value="${orderQty}" min="1" style="width:80px; padding:4px 6px; text-align:right;" /></td>
                <td class="text-right">${item.unitPrice ? '₩' + Math.round(parseFloat(item.unitPrice)).toLocaleString('ko-KR') : '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">비고</label>
      <input class="form-input" id="po-note" placeholder="추가 메모 (선택)" value="${escapeAttribute(draftNote)}" />
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-primary btn-lg" id="btn-generate-po"> 발주서 PDF 생성</button>
    </div>
  `;

  // 전체 선택/해제
  el.querySelector('#po-check-all').addEventListener('change', (e) => {
    el.querySelectorAll('.po-item-check').forEach(cb => { cb.checked = e.target.checked; });
  });

  // PDF 생성
  el.querySelector('#btn-generate-po').addEventListener('click', () => {
    const selectedItems = [];
    el.querySelectorAll('.po-item-check:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const qtyInput = el.querySelector(`.po-order-qty[data-idx="${idx}"]`);
      const orderQty = parseFloat(qtyInput?.value) || 1;
      selectedItems.push({ ...sourceItems[idx], orderQty });
    });

    if (selectedItems.length === 0) {
      showToast('발주할 품목을 선택해 주세요.', 'warning');
      return;
    }

    const info = {
      date: el.querySelector('#po-date').value,
      vendor: el.querySelector('#po-vendor').value || '전체 거래처',
      company: el.querySelector('#po-company').value || 'INVEX 사용자',
      manager: el.querySelector('#po-manager').value || '',
      note: el.querySelector('#po-note').value || '',
    };

    generatePurchaseOrderPDF(selectedItems, info);
  });
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 견적서 작성 UI
 */
function renderQuote(el, items) {
  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = `
    <div class="card-title"> 견적서 작성</div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">견적일자</label>
        <input class="form-input" type="date" id="qt-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="form-label">거래처 (수신)</label>
        <input class="form-input" id="qt-to" placeholder="견적 받을 업체명" />
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">발신 회사명</label>
        <input class="form-input" id="qt-from" placeholder="우리 회사명" />
      </div>
      <div class="form-group">
        <label class="form-label">유효기간</label>
        <input class="form-input" id="qt-valid" placeholder="예: 견적일로부터 30일" value="견적일로부터 30일" />
      </div>
    </div>

    <!-- 품목 선택 -->
    <div class="form-group" style="margin-bottom:8px;">
      <label class="form-label">품목 추가</label>
      <div style="display:flex; gap:8px;">
        <select class="form-select" id="qt-item-select" style="flex:1;">
          <option value="">-- 품목 선택 --</option>
          ${items.map((item, i) => `<option value="${i}">${item.itemName} (${item.itemCode || '-'}) - ₩${Math.round(parseFloat(item.unitPrice || 0)).toLocaleString('ko-KR')}</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="btn-qt-add-item">+ 추가</button>
      </div>
    </div>

    <div class="table-wrapper" style="margin-bottom:16px;">
      <table class="data-table">
        <thead>
          <tr>
            <th>품목명</th>
            <th>코드</th>
            <th class="text-right">수량</th>
            <th class="text-right">단가</th>
            <th class="text-right">금액</th>
            <th style="width:40px;">삭제</th>
          </tr>
        </thead>
        <tbody id="qt-items-body">
          <tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">품목을 추가해 주세요.</td></tr>
        </tbody>
        <tfoot>
          <tr style="font-weight:700; background:var(--bg-card);">
            <td colspan="4" class="text-right">합계</td>
            <td class="text-right" id="qt-total">₩0</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-primary btn-lg" id="btn-generate-qt"> 견적서 PDF 생성</button>
    </div>
  `;

  const quoteItems = [];

  // 품목 추가
  el.querySelector('#btn-qt-add-item').addEventListener('click', () => {
    const select = el.querySelector('#qt-item-select');
    const idx = parseInt(select.value);
    if (isNaN(idx)) { showToast('품목을 선택해 주세요.', 'warning'); return; }

    const item = items[idx];
    quoteItems.push({ ...item, qty: 1 });
    select.value = '';
    renderQuoteTable();
  });

  function renderQuoteTable() {
    const tbody = el.querySelector('#qt-items-body');
    if (quoteItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">품목을 추가해 주세요.</td></tr>';
      el.querySelector('#qt-total').textContent = '₩0';
      return;
    }

    tbody.innerHTML = quoteItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      const subtotal = price * item.qty;
      return `
        <tr>
          <td><strong>${item.itemName}</strong></td>
          <td style="color:var(--text-muted);">${item.itemCode || '-'}</td>
          <td class="text-right"><input type="number" class="form-input qt-qty" data-idx="${i}" value="${item.qty}" min="1" style="width:60px; padding:3px 6px; text-align:right;" /></td>
          <td class="text-right">₩${price.toLocaleString('ko-KR')}</td>
          <td class="text-right">₩${subtotal.toLocaleString('ko-KR')}</td>
          <td class="text-center"><button class="btn-icon btn-icon-danger qt-del" data-idx="${i}"></button></td>
        </tr>
      `;
    }).join('');

    // 합계 계산
    const total = quoteItems.reduce((s, item) => s + ((parseFloat(item.unitPrice) || 0) * item.qty), 0);
    el.querySelector('#qt-total').textContent = '₩' + total.toLocaleString('ko-KR');

    // 수량 변경 이벤트
    el.querySelectorAll('.qt-qty').forEach(input => {
      input.addEventListener('change', () => {
        quoteItems[parseInt(input.dataset.idx)].qty = parseInt(input.value) || 1;
        renderQuoteTable();
      });
    });

    // 삭제 이벤트
    el.querySelectorAll('.qt-del').forEach(btn => {
      btn.addEventListener('click', () => {
        quoteItems.splice(parseInt(btn.dataset.idx), 1);
        renderQuoteTable();
      });
    });
  }

  // PDF 생성
  el.querySelector('#btn-generate-qt').addEventListener('click', () => {
    if (quoteItems.length === 0) {
      showToast('견적 품목을 추가해 주세요.', 'warning');
      return;
    }
    const info = {
      date: el.querySelector('#qt-date').value,
      to: el.querySelector('#qt-to').value || '거래처',
      from: el.querySelector('#qt-from').value || 'INVEX 사용자',
      valid: el.querySelector('#qt-valid').value || '',
    };
    generateQuotePDF(quoteItems, info);
  });
}

/**
 * 거래명세서 작성 UI
 */
function renderStatement(el, items, transactions) {
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const fromDate = monthAgo.toISOString().split('T')[0];

  el.innerHTML = `
    <div class="card-title"> 거래명세서 작성</div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">기간 (시작)</label>
        <input class="form-input" type="date" id="st-from" value="${fromDate}" />
      </div>
      <div class="form-group">
        <label class="form-label">기간 (종료)</label>
        <input class="form-input" type="date" id="st-to" value="${today}" />
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">공급자 (우리 회사)</label>
        <input class="form-input" id="st-supplier" placeholder="우리 회사명" />
      </div>
      <div class="form-group">
        <label class="form-label">공급받는자</label>
        <input class="form-input" id="st-receiver" placeholder="거래처명" />
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <strong>해당 기간 거래 건수: </strong>
      <span id="st-count" class="badge badge-info">${transactions.length}건</span>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-primary btn-lg" id="btn-generate-st"> 거래명세서 PDF 생성</button>
    </div>
  `;

  el.querySelector('#btn-generate-st').addEventListener('click', () => {
    const from = el.querySelector('#st-from').value;
    const to = el.querySelector('#st-to').value;
    const filteredTx = transactions.filter(tx => tx.date >= from && tx.date <= to);

    if (filteredTx.length === 0) {
      showToast('해당 기간에 거래 기록이 없습니다.', 'warning');
      return;
    }

    const info = {
      from,
      to,
      supplier: el.querySelector('#st-supplier').value || 'INVEX 사용자',
      receiver: el.querySelector('#st-receiver').value || '거래처',
    };
    generateStatementPDF(filteredTx, info);
  });

  // 날짜 변경 시 건수 업데이트
  ['#st-from', '#st-to'].forEach(sel => {
    el.querySelector(sel).addEventListener('change', () => {
      const from = el.querySelector('#st-from').value;
      const to = el.querySelector('#st-to').value;
      const count = transactions.filter(tx => tx.date >= from && tx.date <= to).length;
      el.querySelector('#st-count').textContent = `${count}건`;
    });
  });
}

// === PDF 생성 함수들 ===

/**
 * 발주서 PDF 생성
 * 왜: jsPDF와 한글 폰트 없이 브라우저에서 바로 PDF를 만들 수 있어야 보안성도 높음
 */
async function generatePurchaseOrderPDF(selectedItems, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);

    // 헤더
    doc.setFontSize(20);
    doc.text('발주서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`발주일자: ${info.date}`, 15, 35);
    doc.text(`발주회사: ${info.company}`, 15, 42);
    doc.text(`담당자: ${info.manager}`, 15, 49);
    doc.text(`거래처: ${info.vendor}`, 15, 56);

    // 테이블
    const tableData = selectedItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      const subtotal = price * item.orderQty;
      return [i + 1, item.itemName, item.itemCode || '-', item.orderQty, '₩' + price.toLocaleString(), '₩' + subtotal.toLocaleString()];
    });

    const total = selectedItems.reduce((s, item) => s + ((parseFloat(item.unitPrice) || 0) * item.orderQty), 0);

    doc.autoTable({
      startY: 65,
      head: [['No', '품목명', '코드', '수량', '단가', '금액']],
      body: tableData,
      foot: [['', '', '', '', '합계', '₩' + total.toLocaleString()]],
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], ...fontStyle },
      bodyStyles: { ...fontStyle },
      footStyles: { fillColor: [240, 242, 245], textColor: [0, 0, 0], fontStyle: 'bold', ...fontStyle },
      styles: { ...fontStyle },
    });

    if (info.note) {
      const finalY = doc.lastAutoTable.finalY || 120;
      doc.setFontSize(9);
      doc.text(`비고: ${info.note}`, 15, finalY + 15);
    }

    doc.save(`발주서_${info.date}.pdf`);
    showToast('발주서 PDF를 다운로드했습니다.', 'success');
  } catch (err) {
    showToast('PDF 생성 실패: ' + err.message, 'error');
  }
}

/**
 * 견적서 PDF 생성
 */
async function generateQuotePDF(quoteItems, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);

    doc.setFontSize(20);
    doc.text('견적서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`견적일자: ${info.date}`, 15, 35);
    doc.text(`수신: ${info.to}`, 15, 42);
    doc.text(`발신: ${info.from}`, 15, 49);
    doc.text(`유효기간: ${info.valid}`, 15, 56);

    const tableData = quoteItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      const subtotal = price * item.qty;
      return [i + 1, item.itemName, item.itemCode || '-', item.qty, '₩' + price.toLocaleString(), '₩' + subtotal.toLocaleString()];
    });

    const total = quoteItems.reduce((s, item) => s + ((parseFloat(item.unitPrice) || 0) * item.qty), 0);

    doc.autoTable({
      startY: 65,
      head: [['No', '품목명', '코드', '수량', '단가', '금액']],
      body: tableData,
      foot: [['', '', '', '', '합계', '₩' + total.toLocaleString()]],
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74], ...fontStyle },
      bodyStyles: { ...fontStyle },
      footStyles: { fillColor: [240, 242, 245], textColor: [0, 0, 0], fontStyle: 'bold', ...fontStyle },
      styles: { ...fontStyle },
    });

    doc.save(`견적서_${info.date}.pdf`);
    showToast('견적서 PDF를 다운로드했습니다.', 'success');
  } catch (err) {
    showToast('PDF 생성 실패: ' + err.message, 'error');
  }
}

/**
 * 거래명세서 PDF 생성
 */
async function generateStatementPDF(transactions, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);

    doc.setFontSize(20);
    doc.text('거래명세서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`기간: ${info.from} ~ ${info.to}`, 15, 35);
    doc.text(`공급자: ${info.supplier}`, 15, 42);
    doc.text(`공급받는자: ${info.receiver}`, 15, 49);

    const tableData = transactions.map((tx, i) => [
      i + 1,
      tx.date,
      tx.type === 'in' ? '입고' : '출고',
      tx.itemName,
      tx.itemCode || '-',
      tx.quantity,
      '₩' + Math.round(parseFloat(tx.unitPrice) || 0).toLocaleString(),
      '₩' + Math.round((parseFloat(tx.unitPrice) || 0) * (parseFloat(tx.quantity) || 0)).toLocaleString(),
    ]);

    doc.autoTable({
      startY: 58,
      head: [['No', '일자', '구분', '품목명', '코드', '수량', '단가', '금액']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100], ...fontStyle },
      bodyStyles: { ...fontStyle },
      styles: { ...fontStyle },
      columnStyles: {
        2: { cellWidth: 15 },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
    });

    doc.save(`거래명세서_${info.from}_${info.to}.pdf`);
    showToast('거래명세서 PDF를 다운로드했습니다.', 'success');
  } catch (err) {
    showToast('PDF 생성 실패: ' + err.message, 'error');
  }
}
