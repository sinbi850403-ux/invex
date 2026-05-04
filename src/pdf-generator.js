/**
 * pdf-generator.js - PDF 문서 생성 모듈
 * 
 * 역할: 발주서, 거래명세서, 세금계산서 양식 등을 PDF로 생성
 * 왜 필요? → 카톡/이메일로 바로 전송 가능한 전문적인 서류 출력
 *
 * 한글 폰트 지원: jsPDF는 기본적으로 한글을 지원하지 않으므로
 *   Base64 내장 폰트 대신 HTML 렌더링 방식을 사용하여 한글 표시
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getState } from './store.js';
import { showToast } from './toast.js';
import { applyKoreanFont, getKoreanFontStyle } from './pdf-font.js';

/**
 * 발주서 PDF 생성
 * 왜 PDF? → 거래처에 카톡/이메일로 바로 보낼 수 있는 공식 서류
 */
export async function generatePurchaseOrderPDF(order) {
  const doc = await createPDFDoc();
  const kf = getKoreanFontStyle();
  const items = order.items || [];
  const totalAmount = items.reduce((s, it) => s + (it.qty * it.price), 0);
  const vat = Math.round(totalAmount * 0.1);

  addHeader(doc, '발 주 서', order.orderNo || '');

  let y = 55;
  doc.setFontSize(9);
  doc.setFont('NanumGothic', 'normal');
  doc.setTextColor(80);

  const infoData = [
    ['발주일', order.orderDate || '-'],
    ['거래처', order.vendor || '-'],
    ['비고', order.note || '-'],
  ];

  infoData.forEach(([label, value]) => {
    doc.setFont('NanumGothic', 'bold');
    doc.text(label, 14, y);
    doc.setFont('NanumGothic', 'normal');
    doc.text(': ' + value, 35, y);
    y += 6;
  });

  y += 4;
  autoTable(doc, {
    startY: y,
    head: [['No.', '품명', '수량', '단가', '금액']],
    body: items.map((it, i) => [
      i + 1,
      it.name || '-',
      (it.qty || 0).toLocaleString(),
      formatCurrency(it.price || 0),
      formatCurrency((it.qty || 0) * (it.price || 0)),
    ]),
    foot: [
      ['', '', '', '공급가액', formatCurrency(totalAmount)],
      ['', '', '', '부가세 (10%)', formatCurrency(vat)],
      ['', '', '', '합계', formatCurrency(totalAmount + vat)],
    ],
    styles: { fontSize: 8, cellPadding: 3, ...kf },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', ...kf },
    footStyles: { fillColor: [245, 245, 245], fontStyle: 'bold', ...kf },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
    },
    margin: { left: 14, right: 14 },
  });

  // 푸터
  addFooter(doc);

  // 다운로드
  doc.save(`발주서_${order.orderNo || 'PO'}.pdf`);
  showToast('발주서 PDF 다운로드 완료!', 'success');
}

/**
 * 거래명세서 PDF 생성
 */
export async function generateTransactionPDF(txList, title = '거래명세서', period = '') {
  const doc = await createPDFDoc();
  const kf = getKoreanFontStyle();

  addHeader(doc, title, period);

  let y = 55;
  doc.setFontSize(9);
  doc.setFont('NanumGothic', 'normal');
  doc.text(`기간: ${period}`, 14, y);
  doc.text(`발행일: ${new Date().toLocaleDateString('ko-KR')}`, 140, y);

  const totalAmount = txList.reduce((s, tx) => s + calcAmount(tx), 0);

  autoTable(doc, {
    startY: y + 6,
    head: [['날짜', '구분', '거래처', '품명', '수량', '단가', '금액']],
    body: txList.map(tx => [
      tx.date || '-',
      tx.type === 'in' ? '매입' : '매출',
      tx.vendor || '-',
      tx.itemName || '-',
      (parseFloat(tx.quantity) || 0).toLocaleString(),
      formatCurrency(parseFloat(tx.unitPrice) || 0),
      formatCurrency(calcAmount(tx)),
    ]),
    foot: [['', '', '', '', '', '합계', formatCurrency(totalAmount)]],
    styles: { fontSize: 7, cellPadding: 2, ...kf },
    headStyles: { fillColor: [63, 185, 80], textColor: 255, fontStyle: 'bold', ...kf },
    footStyles: { fillColor: [245, 245, 245], fontStyle: 'bold', ...kf },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 18 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 24 },
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`${title}_${period || 'report'}.pdf`);
  showToast(`${title} PDF 다운로드 완료!`, 'success');
}

/**
 * 재고 현황 PDF 생성
 */
export async function generateInventoryPDF(items) {
  const doc = await createPDFDoc();
  const kf = getKoreanFontStyle();

  addHeader(doc, '재고 현황', new Date().toLocaleDateString('ko-KR'));

  let y = 55;
  const totalValue = items.reduce((s, it) => {
    return s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
  }, 0);

  doc.setFontSize(9);
  doc.setFont('NanumGothic', 'normal');
  doc.text(`총 품목: ${items.length}건`, 14, y);
  doc.text(`총 재고액: ${formatCurrency(totalValue)}`, 120, y);

  autoTable(doc, {
    startY: y + 6,
    head: [['No.', '품명', '상품코드', '자산', '수량', '단위', '원가', '재고액']],
    body: items.map((it, i) => [
      i + 1,
      it.itemName || '-',
      it.itemCode || '-',
      it.category || '-',
      parseFloat(it.quantity) || 0,
      it.unit || 'EA',
      formatCurrency(parseFloat(it.unitPrice) || 0),
      formatCurrency((parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0)),
    ]),
    styles: { fontSize: 7, cellPadding: 2, ...kf },
    headStyles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold', ...kf },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', cellWidth: 24 },
      7: { halign: 'right', cellWidth: 24 },
    },
    margin: { left: 14, right: 14 },
  });

  addFooter(doc);
  doc.save(`재고현황_${new Date().toISOString().split('T')[0]}.pdf`);
  showToast('재고 현황 PDF 다운로드 완료!', 'success');
}

/**
 * 세무 서류 PDF 통합 생성
 */
export async function generateTaxReportPDF(reportType, rows, title, period) {
  const doc = await createPDFDoc();
  const kf = getKoreanFontStyle();

  addHeader(doc, title, period);

  let y = 55;
  doc.setFontSize(9);
  doc.setFont('NanumGothic', 'normal');
  doc.text(`발행일: ${new Date().toLocaleDateString('ko-KR')}`, 14, y);

  const headerIdx = rows.findIndex(row => Array.isArray(row) && row.length > 2 && typeof row[0] === 'string' && !row[0].startsWith('=') && !row[0].startsWith('-') && !row[0].startsWith('['));

  if (headerIdx >= 0) {
    const head = [rows[headerIdx]];
    const body = rows.slice(headerIdx + 1).filter(r => Array.isArray(r) && r.length > 1);

    autoTable(doc, {
      startY: y + 6,
      head,
      body,
      styles: { fontSize: 7, cellPadding: 2, ...kf },
      headStyles: { fillColor: [210, 153, 34], textColor: 255, fontStyle: 'bold', ...kf },
      margin: { left: 14, right: 14 },
    });
  }

  addFooter(doc);
  doc.save(`${title}_${period}.pdf`);
  showToast(`${title} PDF 다운로드 완료!`, 'success');
}


// ============================================================
// 내부 유틸리티
// ============================================================

/** PDF 문서 생성 + 한글 폰트 적용 (A4) */
async function createPDFDoc() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await applyKoreanFont(doc);
  return doc;
}

/** 문서 상단 헤더 */
function addHeader(doc, title, subtitle) {
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 38, 'F');

  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.setFont('NanumGothic', 'bold');
  doc.text(title, 14, 18);

  doc.setFontSize(10);
  doc.setFont('NanumGothic', 'normal');
  doc.text(subtitle || '', 14, 28);

  doc.setFontSize(10);
  doc.text('INVEX', 180, 18);
  doc.setFontSize(7);
  doc.text('invex.io.kr', 180, 24);

  doc.setTextColor(0);
  doc.setFont('NanumGothic', 'normal');
}

/** 문서 하단 푸터 */
function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont('NanumGothic', 'normal');
    doc.setTextColor(150);
    doc.text(`INVEX (invex.io.kr) | ${new Date().toLocaleString('ko-KR')}`, 14, 287);
    doc.text(`${i} / ${pageCount}`, 195, 287);
  }
}

/** 통화 포맷 */
function formatCurrency(amount) {
  return `₩${Math.round(amount).toLocaleString('ko-KR')}`;
}

/** 거래 금액 */
function calcAmount(tx) {
  return (parseFloat(tx.quantity) || 0) * (parseFloat(tx.unitPrice) || 0);
}


// ============================================================
// 급여명세서 PDF
// ============================================================

const WON = (n) => `W${Math.round(n).toLocaleString('ko-KR')}`;

/**
 * 4대보험 요율 레이블
 */
const DEDUCT_RATE_LABELS = {
  np:  ' (4.5%)',
  hi:  ' (3.545%)',
  ltc: ' (건보x12.95%)',
  ei:  ' (0.9%)',
};

/**
 * jsPDF 문서에 급여명세서 한 페이지 렌더링 (내부 헬퍼)
 * - 단일 PDF와 일괄 PDF가 동일 로직을 재사용하기 위해 분리
 */
async function _renderPayslipPage(doc, payroll, year, month, options = {}) {
  const { companyName = 'INVEX', payDate = '' } = options;
  const kf = getKoreanFontStyle();
  const W = 210;
  const ML = 14;            // 좌 마진
  const MR = W - ML;        // 우 마진 끝
  const TW = W - ML * 2;    // 테이블 너비 (182mm)
  const BLUE = [37, 99, 235];

  // ── 헤더 배경 ──────────────────────────────────────────
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(255);
  doc.setFontSize(17);
  doc.setFont(kf.font, 'bold');
  doc.text('급 여 명 세 서', ML, 16);
  doc.setFontSize(9);
  doc.setFont(kf.font, 'normal');
  doc.text(`${year}년 ${month}월분`, ML, 26);
  doc.text(companyName, MR, 16, { align: 'right' });
  doc.text('invex.io.kr', MR, 23, { align: 'right' });

  // ── 직원 정보 박스 ──────────────────────────────────────
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(237, 242, 255);
  doc.roundedRect(ML, 38, TW, 22, 2, 2, 'F');
  doc.setFontSize(9);
  const IY = 46;
  const C2 = 100;
  doc.setFont(kf.font, 'bold');
  doc.text('성  명', ML + 4, IY);
  doc.text('사  번', ML + 4, IY + 8);
  doc.setFont(kf.font, 'normal');
  doc.text(payroll.name || '-', ML + 20, IY);
  doc.text(payroll.empNo || '-', ML + 20, IY + 8);
  doc.setFont(kf.font, 'bold');
  doc.text('부  서', C2, IY);
  doc.text('지급일', C2, IY + 8);
  doc.setFont(kf.font, 'normal');
  doc.text(payroll.dept || '-', C2 + 16, IY);
  doc.text(payDate || `${year}-${String(month).padStart(2, '0')}-25`, C2 + 16, IY + 8);

  // ── 지급 / 공제 테이블 ──────────────────────────────────
  const allowances = payroll.allowances || {};
  const payItems = [['기 본 급', payroll.base || 0]];
  Object.entries(allowances).forEach(([k, v]) => { if (v > 0) payItems.push([k, v]); });
  if ((payroll.overtime_pay || 0) > 0) payItems.push(['초과근무수당', payroll.overtime_pay]);
  if ((payroll.night_pay    || 0) > 0) payItems.push(['야간근무수당', payroll.night_pay]);
  if ((payroll.holiday_pay  || 0) > 0) payItems.push(['휴일근무수당', payroll.holiday_pay]);

  const deductItems = [];
  if ((payroll.np         || 0) > 0) deductItems.push([`국민연금${DEDUCT_RATE_LABELS.np}`,  payroll.np]);
  if ((payroll.hi         || 0) > 0) deductItems.push([`건강보험${DEDUCT_RATE_LABELS.hi}`,  payroll.hi]);
  if ((payroll.ltc        || 0) > 0) deductItems.push([`장기요양${DEDUCT_RATE_LABELS.ltc}`, payroll.ltc]);
  if ((payroll.ei         || 0) > 0) deductItems.push([`고용보험${DEDUCT_RATE_LABELS.ei}`,  payroll.ei]);
  if ((payroll.income_tax || 0) > 0) deductItems.push(['소득세 (간이세액)',                  payroll.income_tax]);
  if ((payroll.local_tax  || 0) > 0) deductItems.push(['지방소득세 (소득세x10%)',             payroll.local_tax]);

  const maxRows = Math.max(payItems.length, deductItems.length);
  const tableBody = Array.from({ length: maxRows }, (_, i) => {
    const [pLabel = '', pVal] = payItems[i] || [];
    const [dLabel = '', dVal] = deductItems[i] || [];
    return [
      pLabel,
      pVal !== undefined ? WON(pVal) : '',
      dLabel,
      dVal !== undefined ? WON(dVal) : '',
    ];
  });

  // 열 너비: 48 + 43 + 52 + 39 = 182 = TW
  const tblResult = autoTable(doc, {
    startY: 65,
    head: [['지급 항목', '금액', '공제 항목 (요율)', '금액']],
    body: tableBody,
    styles: {
      font: kf.font,
      fontSize: 8.5,
      cellPadding: { top: 3.5, right: 3, bottom: 3.5, left: 3 },
      textColor: [30, 30, 30],
      lineColor: [210, 215, 230],
      lineWidth: 0.2,
    },
    headStyles: {
      font: kf.font,
      fillColor: BLUE,
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [250, 251, 255] },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: 43, halign: 'right' },
      2: { cellWidth: 52 },
      3: { cellWidth: 39, halign: 'right' },
    },
    margin: { left: ML, right: ML },
    tableWidth: TW,
  });

  // ── 합계 행 ────────────────────────────────────────────
  // jspdf-autotable v5: finalY는 반환값 또는 doc.lastAutoTable 에서 참조
  const finalY = (tblResult && tblResult.finalY) || (doc.lastAutoTable && doc.lastAutoTable.finalY) || 160;
  const afterY = finalY + 4;
  doc.setFillColor(230, 236, 255);
  doc.rect(ML, afterY, TW, 9, 'F');
  doc.setFontSize(8.5);
  doc.setFont(kf.font, 'normal');
  doc.setTextColor(40, 40, 40);
  doc.text('지급 합계', ML + 3, afterY + 6.2);
  doc.text(WON(payroll.gross || 0), ML + 91, afterY + 6.2, { align: 'right' });
  doc.text('공제 합계', ML + 95, afterY + 6.2);
  doc.text(WON(payroll.total_deduct || 0), MR, afterY + 6.2, { align: 'right' });

  // ── 실지급액 강조 박스 ──────────────────────────────────
  const netY = afterY + 13;
  doc.setFillColor(...BLUE);
  doc.roundedRect(ML, netY, TW, 15, 3, 3, 'F');
  doc.setTextColor(255);
  doc.setFontSize(10);
  doc.setFont(kf.font, 'bold');
  doc.text('실  지  급  액', ML + 4, netY + 10);
  doc.setFontSize(15);
  doc.text(WON(payroll.net || 0), MR, netY + 10, { align: 'right' });

  // ── 4대보험 요율 안내 ──────────────────────────────────
  const noteY = netY + 20;
  doc.setTextColor(120);
  doc.setFontSize(7);
  doc.setFont(kf.font, 'normal');
  doc.text(
    '※ 4대보험 요율: 국민연금 4.5% | 건강보험 3.545% | 장기요양 건강보험료×12.95% | 고용보험 0.9%',
    ML, noteY
  );

  // ── 푸터 선 ────────────────────────────────────────────
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(ML, 280, MR, 280);
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`INVEX (invex.io.kr)  |  발행일: ${new Date().toLocaleDateString('ko-KR')}`, ML, 285);
  doc.text(`${payroll.name} - ${year}년 ${month}월 급여명세서`, MR, 285, { align: 'right' });
}

/**
 * 개별 급여명세서 PDF 생성
 */
export async function generatePayslipPDF(payroll, year, month, options = {}) {
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await applyKoreanFont(doc);
    await _renderPayslipPage(doc, payroll, year, month, options);
    doc.save(`급여명세서_${payroll.name}_${year}${String(month).padStart(2, '0')}.pdf`);
    showToast(`${payroll.name} 급여명세서 다운로드 완료`, 'success');
  } catch (e) {
    console.error('[PDF] 급여명세서 생성 실패:', e);
    showToast('PDF 생성 실패: ' + e.message, 'error');
  }
}

/**
 * 일괄 급여명세서 PDF — 전 직원을 페이지별로 합쳐 파일 1개로 다운로드
 * (브라우저 팝업 차단 우회, 직원 N명 → 단일 PDF N페이지)
 */
export async function generatePayslipBulkPDF(payrolls, year, month, options = {}) {
  if (!payrolls || payrolls.length === 0) {
    showToast('다운로드할 급여 데이터가 없습니다', 'warning');
    return;
  }
  showToast(`${payrolls.length}명 명세서 생성 중…`, 'info');
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await applyKoreanFont(doc);
    for (let i = 0; i < payrolls.length; i++) {
      if (i > 0) doc.addPage();
      await _renderPayslipPage(doc, payrolls[i], year, month, options);
    }
    doc.save(`급여명세서_${year}${String(month).padStart(2, '0')}_일괄(${payrolls.length}명).pdf`);
    showToast(`${payrolls.length}명 명세서 다운로드 완료`, 'success');
  } catch (e) {
    console.error('[PDF] 일괄 명세서 생성 실패:', e);
    showToast('PDF 생성 실패: ' + e.message, 'error');
  }
}
