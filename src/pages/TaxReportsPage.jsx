/**
 * TaxReportsPage.jsx - 세무/회계 서류 자동 생성
 */
import React, { useState } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcelSheets } from '../excel.js';

function calcTxAmount(tx) {
  return (parseFloat(tx.quantity) || 0) * (parseFloat(tx.unitPrice) || 0);
}

function generateMonthlyReport(transactions, items, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(prefix));
  const inTx = monthTx.filter(tx => tx.type === 'in');
  const outTx = monthTx.filter(tx => tx.type === 'out');
  const totalInQty = inTx.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  const totalOutQty = outTx.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  const totalInAmt = inTx.reduce((s, tx) => s + calcTxAmount(tx), 0);
  const totalOutAmt = outTx.reduce((s, tx) => s + calcTxAmount(tx), 0);

  const rows = [
    ['=== 월마감 보고서 ===', '', '', '', ''],
    [`기간: ${year}년 ${month}월`, '', '', '', ''],
    [`작성일: ${new Date().toLocaleDateString('ko-KR')}`, '', '', '', ''],
    [],
    ['구분', '건수', '수량', '공급가액', '부가세'],
    ['입고(매입)', inTx.length, totalInQty, totalInAmt, Math.round(totalInAmt * 0.1)],
    ['출고(매출)', outTx.length, totalOutQty, totalOutAmt, Math.round(totalOutAmt * 0.1)],
    [],
    ['--- 품목별 입출고 ---'],
    ['품목명', '품목코드', '입고수량', '출고수량', '순증감'],
  ];

  const itemMap = {};
  monthTx.forEach(tx => {
    const key = tx.itemName || '미분류';
    if (!itemMap[key]) itemMap[key] = { code: tx.itemCode || '', inQty: 0, outQty: 0 };
    if (tx.type === 'in') itemMap[key].inQty += parseFloat(tx.quantity) || 0;
    else itemMap[key].outQty += parseFloat(tx.quantity) || 0;
  });
  Object.entries(itemMap).forEach(([name, d]) => rows.push([name, d.code, d.inQty, d.outQty, d.inQty - d.outQty]));

  rows.push([], ['--- 거래처별 집계 ---'], ['거래처', '입고건수', '입고금액', '출고건수', '출고금액']);
  const vendorMap = {};
  monthTx.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!vendorMap[v]) vendorMap[v] = { inCnt: 0, inAmt: 0, outCnt: 0, outAmt: 0 };
    if (tx.type === 'in') { vendorMap[v].inCnt++; vendorMap[v].inAmt += calcTxAmount(tx); }
    else { vendorMap[v].outCnt++; vendorMap[v].outAmt += calcTxAmount(tx); }
  });
  Object.entries(vendorMap).forEach(([name, d]) => rows.push([name, d.inCnt, d.inAmt, d.outCnt, d.outAmt]));

  return rows;
}

function generatePurchaseSalesJournal(transactions, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(prefix)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const rows = [['=== 매입매출장 ==='], [`기간: ${year}년 ${month}월`], [`작성일: ${new Date().toLocaleDateString('ko-KR')}`], [], ['일자', '구분', '거래처', '품목명', '품목코드', '수량', '단가', '공급가액', '부가세', '합계']];
  let totalSupply = 0, totalVat = 0;
  monthTx.forEach(tx => {
    const qty = parseFloat(tx.quantity) || 0, price = parseFloat(tx.unitPrice) || 0;
    const supply = qty * price, vat = Math.round(supply * 0.1);
    totalSupply += supply; totalVat += vat;
    rows.push([tx.date, tx.type === 'in' ? '매입' : '매출', tx.vendor || '-', tx.itemName || '-', tx.itemCode || '-', qty, price, supply, vat, supply + vat]);
  });
  rows.push([], ['합계', '', '', '', '', '', '', totalSupply, totalVat, totalSupply + totalVat]);
  return rows;
}

function generateVATReport(transactions, year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1, endMonth = quarter * 3;
  const quarterTx = transactions.filter(tx => { if (!tx.date) return false; const m = parseInt(tx.date.split('-')[1]), y = parseInt(tx.date.split('-')[0]); return y === year && m >= startMonth && m <= endMonth; });
  const inTx = quarterTx.filter(tx => tx.type === 'in'), outTx = quarterTx.filter(tx => tx.type === 'out');

  const rows = [['=== 부가세 신고 기초자료 ==='], [`기간: ${year}년 ${quarter}분기 (${startMonth}~${endMonth}월)`], [`작성일: ${new Date().toLocaleDateString('ko-KR')}`], [], ['[ 매입처별 세금계산서 합계표 ]'], ['매입처명', '사업자번호', '건수', '공급가액', '부가세', '합계']];

  const supplierMap = {};
  inTx.forEach(tx => { const v = tx.vendor || '(미지정)'; if (!supplierMap[v]) supplierMap[v] = { cnt: 0, supply: 0 }; supplierMap[v].cnt++; supplierMap[v].supply += calcTxAmount(tx); });
  let totalInSupply = 0;
  Object.entries(supplierMap).forEach(([name, d]) => { const vat = Math.round(d.supply * 0.1); rows.push([name, '-', d.cnt, d.supply, vat, d.supply + vat]); totalInSupply += d.supply; });
  const totalInVat = Math.round(totalInSupply * 0.1);
  rows.push(['매입 합계', '', Object.values(supplierMap).reduce((s, d) => s + d.cnt, 0), totalInSupply, totalInVat, totalInSupply + totalInVat]);

  rows.push([], ['[ 매출처별 세금계산서 합계표 ]'], ['매출처명', '사업자번호', '건수', '공급가액', '부가세', '합계']);
  const customerMap = {};
  outTx.forEach(tx => { const v = tx.vendor || '(미지정)'; if (!customerMap[v]) customerMap[v] = { cnt: 0, supply: 0 }; customerMap[v].cnt++; customerMap[v].supply += calcTxAmount(tx); });
  let totalOutSupply = 0;
  Object.entries(customerMap).forEach(([name, d]) => { const vat = Math.round(d.supply * 0.1); rows.push([name, '-', d.cnt, d.supply, vat, d.supply + vat]); totalOutSupply += d.supply; });
  const totalOutVat = Math.round(totalOutSupply * 0.1);
  rows.push(['매출 합계', '', Object.values(customerMap).reduce((s, d) => s + d.cnt, 0), totalOutSupply, totalOutVat, totalOutSupply + totalOutVat]);
  rows.push([], ['[ 부가세 예상 납부세액 ]'], ['매출 부가세 (납부)', '', '', '', totalOutVat], ['매입 부가세 (공제)', '', '', '', totalInVat], ['예상 납부세액', '', '', '', totalOutVat - totalInVat], [], ['※ 실제 신고 시 세무사와 확인 필요']);
  return rows;
}

function generateInventoryValuation(items) {
  const rows = [['=== 재고자산 평가표 ==='], [`기준일: ${new Date().toLocaleDateString('ko-KR')}`], [], ['품목명', '품목코드', '분류', '수량', '단위', '단가', '재고금액']];
  let totalValue = 0; const catTotals = {};
  const sorted = [...items].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  sorted.forEach(item => {
    const qty = parseFloat(item.quantity) || 0, price = parseFloat(item.unitPrice) || 0, value = qty * price;
    totalValue += value;
    const cat = item.category || '미분류'; catTotals[cat] = (catTotals[cat] || 0) + value;
    rows.push([item.itemName || '-', item.itemCode || '-', cat, qty, item.unit || 'EA', price, value]);
  });
  rows.push([], ['--- 분류별 소계 ---'], ['분류', '', '', '', '', '', '금액']);
  Object.entries(catTotals).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => rows.push([cat, '', '', '', '', '', val]));
  rows.push([], ['총 재고자산 가치', '', '', '', '', '', totalValue]);
  return rows;
}

function generateVendorLedger(transactions, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(prefix)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const vendorGroups = {};
  monthTx.forEach(tx => { const v = tx.vendor || '(미지정)'; if (!vendorGroups[v]) vendorGroups[v] = []; vendorGroups[v].push(tx); });
  const rows = [['=== 거래처 원장 ==='], [`기간: ${year}년 ${month}월`], [`작성일: ${new Date().toLocaleDateString('ko-KR')}`], []];
  Object.entries(vendorGroups).forEach(([vendor, txList]) => {
    rows.push([`[ ${vendor} ]`], ['일자', '구분', '품목명', '수량', '단가', '금액', '누적금액']);
    let cumulative = 0;
    txList.forEach(tx => { const amt = calcTxAmount(tx); cumulative += (tx.type === 'in' ? amt : -amt); rows.push([tx.date, tx.type === 'in' ? '매입' : '매출', tx.itemName || '-', parseFloat(tx.quantity) || 0, parseFloat(tx.unitPrice) || 0, amt, cumulative]); });
    const totalIn = txList.filter(t => t.type === 'in').reduce((s, t) => s + calcTxAmount(t), 0);
    const totalOut = txList.filter(t => t.type === 'out').reduce((s, t) => s + calcTxAmount(t), 0);
    rows.push([`소계: 매입 ₩${totalIn.toLocaleString()} / 매출 ₩${totalOut.toLocaleString()}`], []);
  });
  return rows;
}

function downloadReport(filename, rows) {
  if (rows.length <= 5) { showToast('해당 기간에 데이터가 없습니다.', 'warning'); return; }
  downloadExcelSheets([{ name: '시트1', rows }], filename);
  showToast(`${filename} 다운로드 완료!`, 'success');
}

const DOC_CARDS = [
  { id: 'monthly', icon: '', title: '월마감 보고서', desc: '월별 입출고 요약 · 재고 현황 · 매입매출 집계', color: 'var(--accent)', btnCls: 'btn-primary', btnText: ' 월마감 보고서 다운로드', items: ['입고/출고 수량 및 금액 합계', '품목별 기초재고 → 기말재고 변동', '거래처별 매입/매출 집계'] },
  { id: 'journal', icon: '', title: '매입매출장', desc: '일자별 매입·매출 내역 (세무사 제출용)', color: 'var(--success)', btnCls: 'btn-success', btnText: ' 매입매출장 다운로드', items: ['날짜 · 거래처 · 품목 · 수량 · 단가 · 공급가액 · 부가세', '매입/매출 구분 자동 분류', '월합계 자동 계산'] },
  { id: 'vat', icon: '', title: '부가세 신고 기초자료', desc: '매입처별·매출처별 세금계산서 합계표', color: '#8b5cf6', btnCls: '', btnText: ' 부가세 기초자료 다운로드', btnStyle: { background: '#8b5cf6', color: '#fff' }, items: ['분기별 매입처 합계 (공급가액 + 부가세)', '분기별 매출처 합계 (공급가액 + 부가세)', '부가세 예상 납부세액 자동 계산'] },
  { id: 'valuation', icon: '', title: '재고자산 평가표', desc: '기말 재고 가치 평가 (원가법 기준)', color: '#d29922', btnCls: '', btnText: ' 재고자산 평가표 다운로드', btnStyle: { background: '#d29922', color: '#fff' }, items: ['품목별 수량 · 단가 · 재고 금액', '분류별 소계', '총 재고자산 가치 합계'] },
  { id: 'ledger', icon: '', title: '거래처 원장', desc: '거래처별 거래 내역 · 잔액 조회', color: '#58a6ff', btnCls: '', btnText: ' 거래처 원장 다운로드', btnStyle: { background: '#58a6ff', color: '#fff' }, items: ['거래처별 입고/출고 이력', '거래 금액 누적 합계', '미결제·미수금 파악용'] },
  { id: 'all', icon: '', title: '전체 서류 일괄 다운로드', desc: '위 서류를 모두 포함한 통합 엑셀 파일', color: 'var(--danger)', btnCls: 'btn-danger btn-lg', btnText: ' 전체 서류 통합 다운로드', items: ['세무사에게 한 번에 전달', '모든 서류를 시트별로 나눈 엑셀 파일'] },
];

export default function TaxReportsPage() {
  const [state] = useStore();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];

  const now = new Date();
  const [taxYear, setTaxYear] = useState(now.getFullYear());
  const [taxMonth, setTaxMonth] = useState(now.getMonth() + 1);
  const [taxQuarter, setTaxQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));

  const handleDownload = (id) => {
    const fn = { yearly: (y, m, q) => { downloadReport(`월마감보고서_${y}년${m}월`, generateMonthlyReport(transactions, items, y, m)); } };
    if (id === 'monthly') downloadReport(`월마감보고서_${taxYear}년${taxMonth}월`, generateMonthlyReport(transactions, items, taxYear, taxMonth));
    else if (id === 'journal') downloadReport(`매입매출장_${taxYear}년${taxMonth}월`, generatePurchaseSalesJournal(transactions, taxYear, taxMonth));
    else if (id === 'vat') downloadReport(`부가세기초자료_${taxYear}년${taxQuarter}분기`, generateVATReport(transactions, taxYear, taxQuarter));
    else if (id === 'valuation') downloadReport(`재고자산평가표_${taxYear}년${taxMonth}월`, generateInventoryValuation(items));
    else if (id === 'ledger') downloadReport(`거래처원장_${taxYear}년${taxMonth}월`, generateVendorLedger(transactions, taxYear, taxMonth));
    else if (id === 'all') {
      const sheets = {
        '월마감보고서': generateMonthlyReport(transactions, items, taxYear, taxMonth),
        '매입매출장': generatePurchaseSalesJournal(transactions, taxYear, taxMonth),
        '부가세기초자료': generateVATReport(transactions, taxYear, taxQuarter),
        '재고자산평가표': generateInventoryValuation(items),
        '거래처원장': generateVendorLedger(transactions, taxYear, taxMonth),
      };
      downloadExcelSheets(Object.entries(sheets).map(([name, rows]) => ({ name, rows })), `세무서류_전체_${taxYear}년${taxMonth}월`);
      showToast('전체 자료 다운로드 완료!', 'success');
    }
  };

  const currentYear = now.getFullYear();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 세무/회계 서류</h1>
          <div className="page-desc">월마감, 부가세 신고, 재고 평가 등 세무 서류를 자동으로 생성합니다.</div>
        </div>
      </div>

      {/* 기간 설정 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title"> 기간 설정</div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">연도</label>
            <select className="form-select" value={taxYear} onChange={e => setTaxYear(Number(e.target.value))} style={{ width: '120px' }}>
              {[currentYear, currentYear - 1, currentYear - 2].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">월</label>
            <select className="form-select" value={taxMonth} onChange={e => setTaxMonth(Number(e.target.value))} style={{ width: '100px' }}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">분기 (부가세용)</label>
            <select className="form-select" value={taxQuarter} onChange={e => setTaxQuarter(Number(e.target.value))} style={{ width: '140px' }}>
              <option value={1}>1분기 (1~3월)</option>
              <option value={2}>2분기 (4~6월)</option>
              <option value={3}>3분기 (7~9월)</option>
              <option value={4}>4분기 (10~12월)</option>
            </select>
          </div>
        </div>
      </div>

      {/* 서류 카드 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        {DOC_CARDS.map(card => (
          <div key={card.id} className="card" style={{ borderTop: `3px solid ${card.color}`, background: card.id === 'all' ? 'linear-gradient(135deg, rgba(248,81,73,0.05), rgba(139,92,246,0.05))' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '28px' }}>{card.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '15px' }}>{card.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{card.desc}</div>
              </div>
            </div>
            {card.id === 'all' ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.8 }}>
                세무사에게 한 번에 전달할 수 있도록<br/>모든 서류를 시트별로 나눈 엑셀 파일을 생성합니다.
              </div>
            ) : (
              <ul style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px 16px', lineHeight: 1.8 }}>
                {card.items.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            )}
            <button
              className={`btn ${card.btnCls}`}
              style={{ width: '100%', ...(card.btnStyle || {}) }}
              onClick={() => handleDownload(card.id)}
            >
              {card.btnText}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
