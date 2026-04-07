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
  doc.text('invex.co.kr', 180, 24);

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
    doc.text(`Generated by INVEX (invex.co.kr) | ${new Date().toLocaleString('ko-KR')}`, 14, 287);
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
