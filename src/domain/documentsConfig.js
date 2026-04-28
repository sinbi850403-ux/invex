import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import { showToast } from '../toast.js';
import { applyKoreanFont, getKoreanFontStyle } from '../pdf-font.js';

export const today    = () => new Date().toISOString().split('T')[0];
export const monthAgo = () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; };

export async function generatePurchaseOrderPDF(selectedItems, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);
    doc.setFontSize(20); doc.text('발주서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`발주일자: ${info.date}`, 15, 35);
    doc.text(`발주회사: ${info.company}`, 15, 42);
    doc.text(`담당자: ${info.manager}`, 15, 49);
    doc.text(`거래처: ${info.vendor}`, 15, 56);
    const tableData = selectedItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      return [i+1, item.itemName, item.itemCode||'-', item.orderQty, '₩'+price.toLocaleString(), '₩'+(price*item.orderQty).toLocaleString()];
    });
    const total = selectedItems.reduce((s,i) => s + (parseFloat(i.unitPrice)||0)*i.orderQty, 0);
    doc.autoTable({ startY:65, head:[['No','품목명','코드','수량','단가','금액']], body:tableData, foot:[['','','','','합계','₩'+total.toLocaleString()]], theme:'grid', headStyles:{fillColor:[37,99,235],...fontStyle}, bodyStyles:{...fontStyle}, footStyles:{fillColor:[240,242,245],textColor:[0,0,0],fontStyle:'bold',...fontStyle} });
    if (info.note) { const y = doc.lastAutoTable.finalY || 120; doc.setFontSize(9); doc.text(`비고: ${info.note}`, 15, y+15); }
    doc.save(`발주서_${info.date}.pdf`);
    showToast('발주서 PDF를 다운로드했습니다.', 'success');
  } catch (err) { showToast('PDF 생성 실패: ' + err.message, 'error'); }
}

export async function generateQuotePDF(quoteItems, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);
    doc.setFontSize(20); doc.text('견적서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`견적일자: ${info.date}`, 15, 35);
    doc.text(`수신: ${info.to}`, 15, 42);
    doc.text(`발신: ${info.from}`, 15, 49);
    doc.text(`유효기간: ${info.valid}`, 15, 56);
    const tableData = quoteItems.map((item, i) => {
      const price = parseFloat(item.unitPrice)||0;
      return [i+1, item.itemName, item.itemCode||'-', item.qty, '₩'+price.toLocaleString(), '₩'+(price*item.qty).toLocaleString()];
    });
    const total = quoteItems.reduce((s,i) => s+(parseFloat(i.unitPrice)||0)*i.qty, 0);
    doc.autoTable({ startY:65, head:[['No','품목명','코드','수량','단가','금액']], body:tableData, foot:[['','','','','합계','₩'+total.toLocaleString()]], theme:'grid', headStyles:{fillColor:[22,163,74],...fontStyle}, bodyStyles:{...fontStyle}, footStyles:{fillColor:[240,242,245],textColor:[0,0,0],fontStyle:'bold',...fontStyle} });
    doc.save(`견적서_${info.date}.pdf`);
    showToast('견적서 PDF를 다운로드했습니다.', 'success');
  } catch (err) { showToast('PDF 생성 실패: ' + err.message, 'error'); }
}

export async function generateStatementPDF(txList, info) {
  try {
    showToast('PDF 생성 중... (폰트 로딩)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);
    doc.setFontSize(20); doc.text('거래명세서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`기간: ${info.from} ~ ${info.to}`, 15, 35);
    doc.text(`공급자: ${info.supplier}`, 15, 42);
    doc.text(`공급받는자: ${info.receiver}`, 15, 49);
    const tableData = txList.map((tx, i) => [
      i+1, tx.date, tx.type==='in'?'입고':'출고', tx.itemName, tx.itemCode||'-', tx.quantity,
      '₩'+Math.round(parseFloat(tx.unitPrice)||0).toLocaleString(),
      '₩'+Math.round((parseFloat(tx.unitPrice)||0)*(parseFloat(tx.quantity)||0)).toLocaleString(),
    ]);
    doc.autoTable({ startY:58, head:[['No','일자','구분','품목명','코드','수량','단가','금액']], body:tableData, theme:'grid', headStyles:{fillColor:[100,100,100],...fontStyle}, bodyStyles:{...fontStyle}, columnStyles:{2:{cellWidth:15},5:{halign:'right'},6:{halign:'right'},7:{halign:'right'}} });
    doc.save(`거래명세서_${info.from}_${info.to}.pdf`);
    showToast('거래명세서 PDF를 다운로드했습니다.', 'success');
  } catch (err) { showToast('PDF 생성 실패: ' + err.message, 'error'); }
}
