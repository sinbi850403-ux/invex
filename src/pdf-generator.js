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
import 'jspdf-autotable';
import { getState } from './store.js';
import { showToast } from './toast.js';
import { applyKoreanFont, getKoreanFontStyle } from './pdf-font.js';

/**
 * 발주서 PDF 생성
 * 왜 PDF? → 거래처에 카톡/이메일로 바로 보낼 수 있는 공식 서류
 */
export function generatePurchaseOrderPDF(order) {
  const doc = createPDFDoc();
  const items = order.items || [];
  const totalAmount = items.reduce((s, it) => s + (it.qty * it.price), 0);
  const vat = Math.round(totalAmount * 0.1);

  // 헤더
  addHeader(doc, '발 주 서', order.orderNo || '');

  // 거래 정보
  let y = 55;
  doc.setFontSize(9);
  doc.setTextColor(80);

  const infoData = [
    ['발주일', order.orderDate || '-'],
    ['거래처', order.vendor || '-'],
    ['비고', order.note || '-'],
  ];

  infoData.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, 14, y);
    doc.setFont(undefined, 'normal');
    doc.text(': ' + value, 35, y);
    y += 6;
  });

  // 품목 테이블
  y += 4;
  doc.autoTable({
    startY: y,
    head: [['No.', 'Item Name', 'Qty', 'Unit Price', 'Amount']],
    body: items.map((it, i) => [
      i + 1,
      it.name || '-',
      (it.qty || 0).toLocaleString(),
      formatCurrency(it.price || 0),
      formatCurrency((it.qty || 0) * (it.price || 0)),
    ]),
    foot: [
      ['', '', '', 'Supply', formatCurrency(totalAmount)],
      ['', '', '', 'VAT (10%)', formatCurrency(vat)],
      ['', '', '', 'Total', formatCurrency(totalAmount + vat)],
    ],
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 245, 245], fontStyle: 'bold' },
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
export function generateTransactionPDF(txList, title = '거래명세서', period = '') {
  const doc = createPDFDoc();

  addHeader(doc, title, period);

  let y = 55;
  doc.setFontSize(9);
  doc.text(`Period: ${period}`, 14, y);
  doc.text(`Issue Date: ${new Date().toLocaleDateString('ko-KR')}`, 140, y);

  const totalAmount = txList.reduce((s, tx) => s + calcAmount(tx), 0);

  doc.autoTable({
    startY: y + 6,
    head: [['Date', 'Type', 'Vendor', 'Item', 'Qty', 'Price', 'Amount']],
    body: txList.map(tx => [
      tx.date || '-',
      tx.type === 'in' ? 'Purchase' : 'Sales',
      tx.vendor || '-',
      tx.itemName || '-',
      (parseFloat(tx.quantity) || 0).toLocaleString(),
      formatCurrency(parseFloat(tx.unitPrice) || 0),
      formatCurrency(calcAmount(tx)),
    ]),
    foot: [['', '', '', '', '', 'Total', formatCurrency(totalAmount)]],
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [63, 185, 80], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 245, 245], fontStyle: 'bold' },
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
export function generateInventoryPDF(items) {
  const doc = createPDFDoc();

  addHeader(doc, 'Inventory Report', new Date().toLocaleDateString('ko-KR'));

  let y = 55;
  const totalValue = items.reduce((s, it) => {
    return s + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0);
  }, 0);

  doc.setFontSize(9);
  doc.text(`Total Items: ${items.length}`, 14, y);
  doc.text(`Total Value: ${formatCurrency(totalValue)}`, 140, y);

  doc.autoTable({
    startY: y + 6,
    head: [['No.', 'Item Name', 'Code', 'Category', 'Qty', 'Unit', 'Price', 'Value']],
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
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' },
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
export function generateTaxReportPDF(reportType, rows, title, period) {
  const doc = createPDFDoc();

  addHeader(doc, title, period);

  let y = 55;
  doc.setFontSize(9);
  doc.text(`Issue Date: ${new Date().toLocaleDateString('ko-KR')}`, 14, y);

  // rows는 2D 배열 — 헤더 행 찾기
  const headerIdx = rows.findIndex(row => Array.isArray(row) && row.length > 2 && typeof row[0] === 'string' && !row[0].startsWith('=') && !row[0].startsWith('-') && !row[0].startsWith('['));
  
  if (headerIdx >= 0) {
    const head = [rows[headerIdx]];
    const body = rows.slice(headerIdx + 1).filter(r => Array.isArray(r) && r.length > 1);

    doc.autoTable({
      startY: y + 6,
      head,
      body,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [210, 153, 34], textColor: 255, fontStyle: 'bold' },
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

/** PDF 문서 생성 (A4 사이즈) */
function createPDFDoc() {
  return new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });
}

/** 문서 상단 헤더 */
function addHeader(doc, title, subtitle) {
  // 배경 바
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 38, 'F');

  // 타이틀
  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text(title, 14, 18);

  // 부제 (문서번호/기간)
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(subtitle || '', 14, 28);

  // 회사명
  doc.setFontSize(10);
  doc.text('INVEX', 180, 18);
  doc.setFontSize(7);
  doc.text('invex.io.kr', 180, 24);

  // 리셋
  doc.setTextColor(0);
  doc.setFont(undefined, 'normal');
}

/** 문서 하단 푸터 */
function addFooter(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Generated by INVEX (invex.io.kr) | ${new Date().toLocaleString('ko-KR')}`, 14, 287);
    doc.text(`Page ${i} / ${pageCount}`, 185, 287);
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

/**
 * 개별 급여명세서 PDF 생성 (한글 폰트 지원)
 * @param {Object} payroll - calcPayroll() 결과 + {name, empNo, dept}
 * @param {number} year
 * @param {number} month
 * @param {Object} [options] - { companyName, payDate }
 */
export async function generatePayslipPDF(payroll, year, month, options = {}) {
  const { companyName = 'INVEX', payDate = '' } = options;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await applyKoreanFont(doc);
  const kf = getKoreanFontStyle();

  const W = 210;
  const BLUE = [37, 99, 235];
  const LIGHT = [245, 247, 255];

  // ── 헤더 배경 ──
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 32, 'F');

  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.setFont(kf.font, 'bold');
  doc.text('급 여 명 세 서', 14, 16);

  doc.setFontSize(9);
  doc.setFont(kf.font, 'normal');
  doc.text(`${year}년 ${month}월분`, 14, 25);
  doc.text(companyName, W - 14, 16, { align: 'right' });
  doc.text('invex.io.kr', W - 14, 22, { align: 'right' });

  // ── 직원 정보 박스 ──
  doc.setTextColor(0);
  doc.setFillColor(...LIGHT);
  doc.roundedRect(12, 36, W - 24, 22, 2, 2, 'F');

  doc.setFontSize(9);
  doc.setFont(kf.font, 'bold');
  const infoY = 44;
  const col2 = 80;
  const col3 = 150;

  doc.text('성   명', 18, infoY);
  doc.text('사   번', 18, infoY + 8);
  doc.setFont(kf.font, 'normal');
  doc.text(`: ${payroll.name || '-'}`, 38, infoY);
  doc.text(`: ${payroll.empNo || '-'}`, 38, infoY + 8);

  doc.setFont(kf.font, 'bold');
  doc.text('부   서', col2, infoY);
  doc.text('지급일', col2, infoY + 8);
  doc.setFont(kf.font, 'normal');
  doc.text(`: ${payroll.dept || '-'}`, col2 + 18, infoY);
  doc.text(`: ${payDate || `${year}-${String(month).padStart(2, '0')}-25`}`, col2 + 18, infoY + 8);

  // ── 지급항목 / 공제항목 테이블 ──
  const allowances = payroll.allowances || {};
  const payItems = [
    ['기 본 급', payroll.base || 0],
    ...Object.entries(allowances).map(([k, v]) => [k, v]),
  ];
  if ((payroll.overtime_pay || 0) > 0) payItems.push(['초과근무수당', payroll.overtime_pay]);
  if ((payroll.night_pay || 0)    > 0) payItems.push(['야간근무수당', payroll.night_pay]);
  if ((payroll.holiday_pay || 0)  > 0) payItems.push(['휴일근무수당', payroll.holiday_pay]);

  const deductItems = [];
  if ((payroll.np  || 0) > 0) deductItems.push(['국 민 연 금', payroll.np]);
  if ((payroll.hi  || 0) > 0) deductItems.push(['건 강 보 험', payroll.hi]);
  if ((payroll.ltc || 0) > 0) deductItems.push(['장기요양보험', payroll.ltc]);
  if ((payroll.ei  || 0) > 0) deductItems.push(['고 용 보 험', payroll.ei]);
  if ((payroll.income_tax || 0) > 0) deductItems.push(['소  득  세', payroll.income_tax]);
  if ((payroll.local_tax  || 0) > 0) deductItems.push(['지방소득세', payroll.local_tax]);

  const maxRows = Math.max(payItems.length, deductItems.length);
  const tableBody = Array.from({ length: maxRows }, (_, i) => {
    const [pLabel = '', pVal = ''] = payItems[i] || [];
    const [dLabel = '', dVal = ''] = deductItems[i] || [];
    return [
      pLabel,
      pVal !== '' ? `₩${Math.round(pVal).toLocaleString('ko-KR')}` : '',
      dLabel,
      dVal !== '' ? `₩${Math.round(dVal).toLocaleString('ko-KR')}` : '',
    ];
  });

  doc.autoTable({
    startY: 63,
    head: [['지급 항목', '금    액', '공제 항목', '금    액']],
    body: tableBody,
    styles: { ...kf, fontSize: 9, cellPadding: 4 },
    headStyles: { ...kf, fillColor: BLUE, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 45, font: kf.font },
      1: { cellWidth: 50, halign: 'right', font: kf.font },
      2: { cellWidth: 45, font: kf.font },
      3: { cellWidth: 50, halign: 'right', font: kf.font },
    },
    margin: { left: 12, right: 12 },
    tableWidth: W - 24,
  });

  // ── 합계 / 실지급액 박스 ──
  const afterY = doc.lastAutoTable.finalY + 6;

  doc.setFontSize(9);
  doc.setFont(kf.font, 'normal');

  // 합계 행
  doc.setFillColor(245, 245, 245);
  doc.rect(12, afterY, W - 24, 10, 'F');
  doc.setTextColor(80);
  doc.text('지급 합계', 16, afterY + 7);
  doc.text(`₩${Math.round(payroll.gross || 0).toLocaleString('ko-KR')}`, 66, afterY + 7, { align: 'right' });
  doc.text('공제 합계', 111, afterY + 7);
  doc.text(`₩${Math.round(payroll.total_deduct || 0).toLocaleString('ko-KR')}`, W - 14, afterY + 7, { align: 'right' });

  // 실지급액 강조 박스
  const netY = afterY + 14;
  doc.setFillColor(...BLUE);
  doc.roundedRect(12, netY, W - 24, 16, 3, 3, 'F');
  doc.setTextColor(255);
  doc.setFontSize(11);
  doc.setFont(kf.font, 'bold');
  doc.text('실  지  급  액', 20, netY + 11);
  doc.setFontSize(16);
  doc.text(`₩${Math.round(payroll.net || 0).toLocaleString('ko-KR')}`, W - 16, netY + 11, { align: 'right' });

  // ── 근태 요약 (있는 경우) ──
  if (payroll.workDays !== undefined || payroll.absenceDays !== undefined) {
    const attY = netY + 22;
    doc.setTextColor(100);
    doc.setFontSize(8);
    doc.setFont(kf.font, 'normal');
    doc.text(
      `근무일수: ${payroll.workDays ?? '-'}일  |  결근: ${payroll.absenceDays ?? 0}일  |  초과근무: ${payroll.overtimeHours ?? 0}시간`,
      14, attY
    );
  }

  // ── 푸터 ──
  addFooter(doc);

  doc.save(`급여명세서_${payroll.name}_${year}${String(month).padStart(2, '0')}.pdf`);
  showToast(`${payroll.name} 급여명세서 다운로드 완료`, 'success');
}

/**
 * 전체 급여명세서 일괄 다운로드 (직원별 개별 PDF)
 * @param {Array} payrolls - renderPayrollTable에서 만든 payroll 배열
 * @param {number} year
 * @param {number} month
 * @param {Object} [options]
 */
export async function generatePayslipBulkPDF(payrolls, year, month, options = {}) {
  if (!payrolls || payrolls.length === 0) {
    showToast('다운로드할 급여 데이터가 없습니다', 'warning');
    return;
  }
  showToast(`${payrolls.length}명 명세서 생성 중…`, 'info');
  for (const p of payrolls) {
    await generatePayslipPDF(p, year, month, options);
  }
  showToast('일괄 다운로드 완료', 'success');
}
