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

const WON = (n) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

/**
 * jsPDF 문서에 급여명세서 한 페이지 렌더링 (내부 헬퍼)
 * 모던 리디자인: 다크 네이비 헤더 + 미니멀 테이블 + 색상 계층
 */
async function _renderPayslipPage(doc, payroll, year, month, options = {}) {
  const { companyName = 'INVEX', payDate = '' } = options;
  const kf = getKoreanFontStyle();
  const W   = 210;
  const ML  = 15;
  const MR  = W - ML;
  const TW  = MR - ML;
  const MID = ML + TW / 2;

  // ── 컬러 팔레트 ──────────────────────────────────────────
  const NAVY    = [15,  23,  55];   // 헤더 배경
  const ACCENT  = [59, 130, 246];   // 강조 (파랑)
  const SLATE   = [71,  85, 105];   // 보조 텍스트
  const MUTED   = [148, 163, 184];  // 힌트/레이블
  const BORDER  = [226, 232, 240];  // 구분선
  const LIGHT   = [248, 250, 252];  // 행 배경 (홀수)
  const TEXT    = [15,  23,  42];   // 본문 텍스트
  const RED     = [220,  38,  38];  // 공제 금액

  // ── 헤더 (0 ~ 44mm) ──────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 44, 'F');

  // 하단 액센트 라인
  doc.setFillColor(...ACCENT);
  doc.rect(0, 42, W, 2, 'F');

  // 제목
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont(kf.font, 'bold');
  doc.text('급여명세서', ML + 1, 21);

  // 부제 (기간)
  doc.setFontSize(9);
  doc.setFont(kf.font, 'normal');
  doc.setTextColor(160, 185, 220);
  doc.text(`${year}년 ${month}월분`, ML + 1, 32);

  // 회사명 (우측 상단)
  doc.setFontSize(11);
  doc.setFont(kf.font, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, MR - 1, 19, { align: 'right' });

  doc.setFontSize(8);
  doc.setFont(kf.font, 'normal');
  doc.setTextColor(160, 185, 220);
  doc.text('invex.io.kr', MR - 1, 28, { align: 'right' });

  // ── 직원 정보 (48 ~ 70mm) ────────────────────────────
  const iY1 = 57;
  const iY2 = iY1 + 10;
  const C2  = MID + 4;

  // 레이블
  doc.setFontSize(7);
  doc.setFont(kf.font, 'normal');
  doc.setTextColor(...MUTED);
  doc.text('성명', ML + 1, iY1);
  doc.text('사번', ML + 1, iY2);
  doc.text('부서', C2, iY1);
  doc.text('지급일', C2, iY2);

  // 값
  doc.setFontSize(10);
  doc.setFont(kf.font, 'bold');
  doc.setTextColor(...TEXT);
  doc.text(payroll.name || '-', ML + 11, iY1);

  doc.setFontSize(9);
  doc.setFont(kf.font, 'normal');
  doc.text(payroll.empNo || '-', ML + 11, iY2);
  doc.text(payroll.dept  || '-', C2 + 14, iY1);
  doc.text(payDate || `${year}-${String(month).padStart(2, '0')}-25`, C2 + 14, iY2);

  // 중앙 수직 구분선
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MID - 1, iY1 - 5, MID - 1, iY2 + 4);

  // 하단 구분선
  doc.setLineWidth(0.5);
  doc.line(ML, iY2 + 7, MR, iY2 + 7);

  // ── 지급 / 공제 항목 수집 ──────────────────────────────
  const allowances = payroll.allowances || {};
  const payItems = [['기본급', payroll.base || 0]];
  Object.entries(allowances).forEach(([k, v]) => { if (v > 0) payItems.push([k, v]); });
  if ((payroll.overtime_pay || 0) > 0) payItems.push(['초과근무수당', payroll.overtime_pay]);
  if ((payroll.night_pay    || 0) > 0) payItems.push(['야간근무수당', payroll.night_pay]);
  if ((payroll.holiday_pay  || 0) > 0) payItems.push(['휴일근무수당', payroll.holiday_pay]);

  const deductItems = [];
  if ((payroll.np         || 0) > 0) deductItems.push(['국민연금 4.75%',          payroll.np]);
  if ((payroll.hi         || 0) > 0) deductItems.push(['건강보험 3.595%',         payroll.hi]);
  if ((payroll.ltc        || 0) > 0) deductItems.push(['장기요양 건보×13.14%',   payroll.ltc]);
  if ((payroll.ei         || 0) > 0) deductItems.push(['고용보험 0.9%',           payroll.ei]);
  if ((payroll.income_tax || 0) > 0) deductItems.push(['소득세',                  payroll.income_tax]);
  if ((payroll.local_tax  || 0) > 0) deductItems.push(['지방소득세',              payroll.local_tax]);

  // ── 테이블 시작 Y ──────────────────────────────────────
  const tblStart = iY2 + 12;
  const COL_W   = TW / 2;          // 각 섹션 너비 (91mm)
  const ROW_H   = 9;

  // 섹션 헤더 (지급 / 공제)
  doc.setFillColor(...LIGHT);
  doc.rect(ML, tblStart, COL_W, 8, 'F');
  doc.setFontSize(7.5);
  doc.setFont(kf.font, 'bold');
  doc.setTextColor(...ACCENT);
  doc.text('지  급  내  역', ML + 3, tblStart + 5.5);

  doc.setFillColor(...LIGHT);
  doc.rect(ML + COL_W, tblStart, COL_W, 8, 'F');
  doc.setTextColor(...RED);
  doc.text('공  제  내  역', ML + COL_W + 3, tblStart + 5.5);

  // 헤더 구분선
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.line(ML, tblStart + 8, MR, tblStart + 8);

  // 항목 행
  const maxRows = Math.max(payItems.length, deductItems.length);
  let rowY = tblStart + 8;

  for (let i = 0; i < maxRows; i++) {
    const isOdd = i % 2 === 0;

    // 행 배경 (홀수 행 약간 밝게)
    doc.setFillColor(isOdd ? 255 : 248, isOdd ? 255 : 250, isOdd ? 255 : 252);
    doc.rect(ML, rowY, TW, ROW_H, 'F');

    // 지급 항목
    if (payItems[i]) {
      doc.setFontSize(8.5);
      doc.setFont(kf.font, 'normal');
      doc.setTextColor(...SLATE);
      doc.text(payItems[i][0], ML + 3, rowY + 6.2);
      doc.setFont(kf.font, 'bold');
      doc.setTextColor(...TEXT);
      doc.text(WON(payItems[i][1]), ML + COL_W - 3, rowY + 6.2, { align: 'right' });
    }

    // 공제 항목
    if (deductItems[i]) {
      doc.setFontSize(8.5);
      doc.setFont(kf.font, 'normal');
      doc.setTextColor(...SLATE);
      doc.text(deductItems[i][0], ML + COL_W + 3, rowY + 6.2);
      doc.setFont(kf.font, 'bold');
      doc.setTextColor(...RED);
      doc.text(WON(deductItems[i][1]), MR - 3, rowY + 6.2, { align: 'right' });
    }

    // 행 하단 구분선
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.line(ML, rowY + ROW_H, MR, rowY + ROW_H);

    rowY += ROW_H;
  }

  // 중앙 수직 구분선 (테이블 전체)
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML + COL_W, tblStart, ML + COL_W, rowY);

  // 테이블 외곽선
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  doc.rect(ML, tblStart, TW, rowY - tblStart, 'S');

  // ── 합계 행 ────────────────────────────────────────────
  const sumY = rowY + 3;
  doc.setFillColor(235, 240, 255);
  doc.rect(ML, sumY, TW, 10, 'F');

  doc.setFontSize(8.5);
  doc.setFont(kf.font, 'bold');
  doc.setTextColor(...SLATE);
  doc.text('지급 합계', ML + 3, sumY + 7);
  doc.setTextColor(...NAVY);
  doc.text(WON(payroll.gross || 0), ML + COL_W - 3, sumY + 7, { align: 'right' });

  doc.setTextColor(...SLATE);
  doc.text('공제 합계', ML + COL_W + 3, sumY + 7);
  doc.setTextColor(...RED);
  doc.text(WON(payroll.total_deduct || 0), MR - 3, sumY + 7, { align: 'right' });

  // 합계행 중앙 수직선
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML + COL_W, sumY, ML + COL_W, sumY + 10);

  // ── 실지급액 ──────────────────────────────────────────
  const netY = sumY + 16;
  doc.setFillColor(...NAVY);
  doc.roundedRect(ML, netY, TW, 20, 3, 3, 'F');

  // 레이블
  doc.setFontSize(9);
  doc.setFont(kf.font, 'normal');
  doc.setTextColor(160, 185, 220);
  doc.text('실지급액', ML + 5, netY + 13);

  // 금액
  doc.setFontSize(20);
  doc.setFont(kf.font, 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(WON(payroll.net || 0), MR - 5, netY + 14.5, { align: 'right' });

  // ── 주석 ──────────────────────────────────────────────
  const noteY = netY + 27;
  doc.setFontSize(6.5);
  doc.setFont(kf.font, 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    '※ 4대보험 요율: 국민연금 4.75% | 건강보험 3.595% | 장기요양 건강보험료×13.14% | 고용보험 0.9%',
    ML, noteY
  );

  // ── 푸터 ──────────────────────────────────────────────
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML, 280, MR, 280);
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    `${companyName}  ·  invex.io.kr  ·  발행일 ${new Date().toLocaleDateString('ko-KR')}`,
    ML, 285
  );
  doc.text(`${payroll.name} · ${year}년 ${month}월 급여명세서`, MR, 285, { align: 'right' });
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
