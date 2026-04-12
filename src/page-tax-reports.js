/**
 * page-tax-reports.js - 세무/회계 서류 자동 생성
 * 
 * 역할: 월마감, 부가세 신고, 재고자산 평가 등 세무·회계 서류를 자동 생성·다운로드
 * 왜 필요? → 매월/분기마다 반복되는 서류 작업을 1클릭으로 해결.
 *           세무사에게 바로 제출할 수 있는 형식으로 생성.
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcelSheets } from './excel.js';

export function renderTaxReportsPage(container, navigateTo) {
  const state = getState();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];
  const vendors = state.vendorMaster || [];

  // 현재 연/월
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 분기 계산 (부가세 신고는 분기별)
  const currentQuarter = Math.ceil(currentMonth / 3);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📑</span> 세무/회계 서류</h1>
        <div class="page-desc">월마감, 부가세 신고, 재고 평가 등 세무 서류를 자동으로 생성합니다.</div>
      </div>
    </div>

    <!-- 기간 선택 -->
    <div class="card">
      <div class="card-title">📅 기간 설정</div>
      <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:flex-end;">
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">연도</label>
          <select class="form-select" id="tax-year" style="width:120px;">
            ${[currentYear, currentYear - 1, currentYear - 2].map(y =>
              `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}년</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">월</label>
          <select class="form-select" id="tax-month" style="width:100px;">
            ${Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
              `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${m}월</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label class="form-label">분기 (부가세용)</label>
          <select class="form-select" id="tax-quarter" style="width:120px;">
            <option value="1" ${currentQuarter === 1 ? 'selected' : ''}>1분기 (1~3월)</option>
            <option value="2" ${currentQuarter === 2 ? 'selected' : ''}>2분기 (4~6월)</option>
            <option value="3" ${currentQuarter === 3 ? 'selected' : ''}>3분기 (7~9월)</option>
            <option value="4" ${currentQuarter === 4 ? 'selected' : ''}>4분기 (10~12월)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 서류 카드 그리드 -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">

      <!-- 1. 월마감 보고서 -->
      <div class="card" style="border-top:3px solid var(--accent);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">📊</span>
          <div>
            <div style="font-weight:700; font-size:15px;">월마감 보고서</div>
            <div style="font-size:12px; color:var(--text-muted);">월별 입출고 요약 · 재고 현황 · 매입매출 집계</div>
          </div>
        </div>
        <ul style="font-size:13px; color:var(--text-muted); margin:0 0 16px 16px; line-height:1.8;">
          <li>입고/출고 수량 및 금액 합계</li>
          <li>품목별 기초재고 → 기말재고 변동</li>
          <li>거래처별 매입/매출 집계</li>
        </ul>
        <button class="btn btn-primary" style="width:100%;" id="btn-monthly-report">
          📥 월마감 보고서 다운로드
        </button>
      </div>

      <!-- 2. 매입매출장 -->
      <div class="card" style="border-top:3px solid var(--success);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">📒</span>
          <div>
            <div style="font-weight:700; font-size:15px;">매입매출장</div>
            <div style="font-size:12px; color:var(--text-muted);">일자별 매입·매출 내역 (세무사 제출용)</div>
          </div>
        </div>
        <ul style="font-size:13px; color:var(--text-muted); margin:0 0 16px 16px; line-height:1.8;">
          <li>날짜 · 거래처 · 품목 · 수량 · 단가 · 공급가액 · 부가세</li>
          <li>매입/매출 구분 자동 분류</li>
          <li>월합계 자동 계산</li>
        </ul>
        <button class="btn btn-success" style="width:100%;" id="btn-purchase-sales">
          📥 매입매출장 다운로드
        </button>
      </div>

      <!-- 3. 부가세 기초자료 -->
      <div class="card" style="border-top:3px solid #8b5cf6;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">🧾</span>
          <div>
            <div style="font-weight:700; font-size:15px;">부가세 신고 기초자료</div>
            <div style="font-size:12px; color:var(--text-muted);">매입처별·매출처별 세금계산서 합계표</div>
          </div>
        </div>
        <ul style="font-size:13px; color:var(--text-muted); margin:0 0 16px 16px; line-height:1.8;">
          <li>분기별 매입처 합계 (공급가액 + 부가세)</li>
          <li>분기별 매출처 합계 (공급가액 + 부가세)</li>
          <li>부가세 예상 납부세액 자동 계산</li>
        </ul>
        <button class="btn" style="width:100%; background:#8b5cf6; color:#fff;" id="btn-vat-report">
          📥 부가세 기초자료 다운로드
        </button>
      </div>

      <!-- 4. 재고자산 평가표 -->
      <div class="card" style="border-top:3px solid var(--warning, #d29922);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">📦</span>
          <div>
            <div style="font-weight:700; font-size:15px;">재고자산 평가표</div>
            <div style="font-size:12px; color:var(--text-muted);">기말 재고 가치 평가 (원가법 기준)</div>
          </div>
        </div>
        <ul style="font-size:13px; color:var(--text-muted); margin:0 0 16px 16px; line-height:1.8;">
          <li>품목별 수량 · 단가 · 재고 금액</li>
          <li>분류별 소계</li>
          <li>총 재고자산 가치 합계</li>
        </ul>
        <button class="btn" style="width:100%; background:var(--warning, #d29922); color:#fff;" id="btn-inventory-valuation">
          📥 재고자산 평가표 다운로드
        </button>
      </div>

      <!-- 5. 거래처 원장 -->
      <div class="card" style="border-top:3px solid var(--info, #58a6ff);">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">🤝</span>
          <div>
            <div style="font-weight:700; font-size:15px;">거래처 원장</div>
            <div style="font-size:12px; color:var(--text-muted);">거래처별 거래 내역 · 잔액 조회</div>
          </div>
        </div>
        <ul style="font-size:13px; color:var(--text-muted); margin:0 0 16px 16px; line-height:1.8;">
          <li>거래처별 입고/출고 이력</li>
          <li>거래 금액 누적 합계</li>
          <li>미결제·미수금 파악용</li>
        </ul>
        <button class="btn" style="width:100%; background:var(--info, #58a6ff); color:#fff;" id="btn-vendor-ledger">
          📥 거래처 원장 다운로드
        </button>
      </div>

      <!-- 6. 전체 서류 일괄 다운로드 -->
      <div class="card" style="border-top:3px solid var(--danger); background:linear-gradient(135deg, rgba(248,81,73,0.05), rgba(139,92,246,0.05));">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">📁</span>
          <div>
            <div style="font-weight:700; font-size:15px;">전체 서류 일괄 다운로드</div>
            <div style="font-size:12px; color:var(--text-muted);">위 서류를 모두 포함한 통합 엑셀 파일</div>
          </div>
        </div>
        <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.8;">
          세무사에게 한 번에 전달할 수 있도록<br/>
          모든 서류를 시트별로 나눈 엑셀 파일을 생성합니다.
        </div>
        <button class="btn btn-danger btn-lg" style="width:100%;" id="btn-all-reports">
          📥 전체 서류 통합 다운로드
        </button>
      </div>
    </div>
  `;

  // === 이벤트 바인딩 ===
  const getYear = () => parseInt(container.querySelector('#tax-year').value);
  const getMonth = () => parseInt(container.querySelector('#tax-month').value);
  const getQuarter = () => parseInt(container.querySelector('#tax-quarter').value);

  // 1. 월마감 보고서
  container.querySelector('#btn-monthly-report').addEventListener('click', () => {
    const data = generateMonthlyReport(transactions, items, getYear(), getMonth());
    downloadReport(`월마감보고서_${getYear()}년${getMonth()}월`, data);
  });

  // 2. 매입매출장
  container.querySelector('#btn-purchase-sales').addEventListener('click', () => {
    const data = generatePurchaseSalesJournal(transactions, getYear(), getMonth());
    downloadReport(`매입매출장_${getYear()}년${getMonth()}월`, data);
  });

  // 3. 부가세 기초자료
  container.querySelector('#btn-vat-report').addEventListener('click', () => {
    const data = generateVATReport(transactions, getYear(), getQuarter());
    downloadReport(`부가세기초자료_${getYear()}년${getQuarter()}분기`, data);
  });

  // 4. 재고자산 평가표
  container.querySelector('#btn-inventory-valuation').addEventListener('click', () => {
    const data = generateInventoryValuation(items);
    downloadReport(`재고자산평가표_${getYear()}년${getMonth()}월`, data);
  });

  // 5. 거래처 원장
  container.querySelector('#btn-vendor-ledger').addEventListener('click', () => {
    const data = generateVendorLedger(transactions, getYear(), getMonth());
    downloadReport(`거래처원장_${getYear()}년${getMonth()}월`, data);
  });

  // 6. 전체 일괄
  container.querySelector('#btn-all-reports').addEventListener('click', () => {
    const year = getYear();
    const month = getMonth();
    const quarter = getQuarter();

    const sheets = {
      '월마감보고서': generateMonthlyReport(transactions, items, year, month),
      '매입매출장': generatePurchaseSalesJournal(transactions, year, month),
      '부가세기초자료': generateVATReport(transactions, year, quarter),
      '재고자산평가표': generateInventoryValuation(items),
      '거래처원장': generateVendorLedger(transactions, year, month),
    };
    downloadMultiSheetReport(`세무서류_전체_${year}년${month}월`, sheets);
  });
}


// ============================================================
// 서류 생성 함수들
// ============================================================

/**
 * 1. 월마감 보고서
 * 해당 월의 입출고 요약, 재고 변동, 거래처별 집계
 */
function generateMonthlyReport(transactions, items, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(prefix));

  // --- 요약 ---
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

  // 품목별 집계
  const itemMap = {};
  monthTx.forEach(tx => {
    const key = tx.itemName || '미분류';
    if (!itemMap[key]) itemMap[key] = { code: tx.itemCode || '', inQty: 0, outQty: 0 };
    if (tx.type === 'in') itemMap[key].inQty += parseFloat(tx.quantity) || 0;
    else itemMap[key].outQty += parseFloat(tx.quantity) || 0;
  });

  Object.entries(itemMap).forEach(([name, d]) => {
    rows.push([name, d.code, d.inQty, d.outQty, d.inQty - d.outQty]);
  });

  // 거래처별 집계
  rows.push([], ['--- 거래처별 집계 ---'], ['거래처', '입고건수', '입고금액', '출고건수', '출고금액']);

  const vendorMap = {};
  monthTx.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!vendorMap[v]) vendorMap[v] = { inCnt: 0, inAmt: 0, outCnt: 0, outAmt: 0 };
    if (tx.type === 'in') { vendorMap[v].inCnt++; vendorMap[v].inAmt += calcTxAmount(tx); }
    else { vendorMap[v].outCnt++; vendorMap[v].outAmt += calcTxAmount(tx); }
  });

  Object.entries(vendorMap).forEach(([name, d]) => {
    rows.push([name, d.inCnt, d.inAmt, d.outCnt, d.outAmt]);
  });

  return rows;
}

/**
 * 2. 매입매출장
 * 일자별 매입/매출 내역 (세무사 제출 표준 형식)
 */
function generatePurchaseSalesJournal(transactions, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTx = transactions
    .filter(tx => (tx.date || '').startsWith(prefix))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const rows = [
    ['=== 매입매출장 ==='],
    [`기간: ${year}년 ${month}월`],
    [`작성일: ${new Date().toLocaleDateString('ko-KR')}`],
    [],
    ['일자', '구분', '거래처', '품목명', '품목코드', '수량', '단가', '공급가액', '부가세', '합계'],
  ];

  let totalSupply = 0;
  let totalVat = 0;

  monthTx.forEach(tx => {
    const qty = parseFloat(tx.quantity) || 0;
    const price = parseFloat(tx.unitPrice) || 0;
    const supply = qty * price;
    const vat = Math.round(supply * 0.1);
    const total = supply + vat;
    totalSupply += supply;
    totalVat += vat;

    rows.push([
      tx.date,
      tx.type === 'in' ? '매입' : '매출',
      tx.vendor || '-',
      tx.itemName || '-',
      tx.itemCode || '-',
      qty,
      price,
      supply,
      vat,
      total,
    ]);
  });

  rows.push(
    [],
    ['합계', '', '', '', '', '', '', totalSupply, totalVat, totalSupply + totalVat],
  );

  return rows;
}

/**
 * 3. 부가세 신고 기초자료
 * 분기별 매입처/매출처 합계표 (부가가치세 신고용)
 */
function generateVATReport(transactions, year, quarter) {
  // 분기 시작~끝 월
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = quarter * 3;

  const quarterTx = transactions.filter(tx => {
    if (!tx.date) return false;
    const m = parseInt(tx.date.split('-')[1]);
    const y = parseInt(tx.date.split('-')[0]);
    return y === year && m >= startMonth && m <= endMonth;
  });

  const inTx = quarterTx.filter(tx => tx.type === 'in');
  const outTx = quarterTx.filter(tx => tx.type === 'out');

  const rows = [
    ['=== 부가세 신고 기초자료 ==='],
    [`기간: ${year}년 ${quarter}분기 (${startMonth}~${endMonth}월)`],
    [`작성일: ${new Date().toLocaleDateString('ko-KR')}`],
    [],
    ['[ 매입처별 세금계산서 합계표 ]'],
    ['매입처명', '사업자번호', '건수', '공급가액', '부가세', '합계'],
  ];

  // 매입처별 집계
  const supplierMap = {};
  inTx.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!supplierMap[v]) supplierMap[v] = { cnt: 0, supply: 0 };
    supplierMap[v].cnt++;
    supplierMap[v].supply += calcTxAmount(tx);
  });

  let totalInSupply = 0;
  Object.entries(supplierMap).forEach(([name, d]) => {
    const vat = Math.round(d.supply * 0.1);
    rows.push([name, '-', d.cnt, d.supply, vat, d.supply + vat]);
    totalInSupply += d.supply;
  });

  const totalInVat = Math.round(totalInSupply * 0.1);
  rows.push(['매입 합계', '', Object.values(supplierMap).reduce((s, d) => s + d.cnt, 0), totalInSupply, totalInVat, totalInSupply + totalInVat]);

  // 매출처별 집계
  rows.push([], ['[ 매출처별 세금계산서 합계표 ]'], ['매출처명', '사업자번호', '건수', '공급가액', '부가세', '합계']);

  const customerMap = {};
  outTx.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!customerMap[v]) customerMap[v] = { cnt: 0, supply: 0 };
    customerMap[v].cnt++;
    customerMap[v].supply += calcTxAmount(tx);
  });

  let totalOutSupply = 0;
  Object.entries(customerMap).forEach(([name, d]) => {
    const vat = Math.round(d.supply * 0.1);
    rows.push([name, '-', d.cnt, d.supply, vat, d.supply + vat]);
    totalOutSupply += d.supply;
  });

  const totalOutVat = Math.round(totalOutSupply * 0.1);
  rows.push(['매출 합계', '', Object.values(customerMap).reduce((s, d) => s + d.cnt, 0), totalOutSupply, totalOutVat, totalOutSupply + totalOutVat]);

  // 예상 납부세액
  rows.push(
    [],
    ['[ 부가세 예상 납부세액 ]'],
    ['매출 부가세 (납부)', '', '', '', totalOutVat],
    ['매입 부가세 (공제)', '', '', '', totalInVat],
    ['예상 납부세액', '', '', '', totalOutVat - totalInVat],
    [],
    ['※ 실제 신고 시 세무사와 확인 필요'],
  );

  return rows;
}

/**
 * 4. 재고자산 평가표
 * 기말 재고 가치 (품목별 수량×단가)
 */
function generateInventoryValuation(items) {
  const rows = [
    ['=== 재고자산 평가표 ==='],
    [`기준일: ${new Date().toLocaleDateString('ko-KR')}`],
    [],
    ['품목명', '품목코드', '분류', '수량', '단위', '단가', '재고금액'],
  ];

  let totalValue = 0;
  const catTotals = {};

  // 품목별
  const sorted = [...items].sort((a, b) => (a.category || '').localeCompare(b.category || ''));
  sorted.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    const value = qty * price;
    totalValue += value;

    const cat = item.category || '미분류';
    catTotals[cat] = (catTotals[cat] || 0) + value;

    rows.push([
      item.itemName || '-',
      item.itemCode || '-',
      cat,
      qty,
      item.unit || 'EA',
      price,
      value,
    ]);
  });

  // 분류별 소계
  rows.push([], ['--- 분류별 소계 ---'], ['분류', '', '', '', '', '', '금액']);
  Object.entries(catTotals).sort((a, b) => b[1] - a[1]).forEach(([cat, val]) => {
    rows.push([cat, '', '', '', '', '', val]);
  });

  rows.push([], ['총 재고자산 가치', '', '', '', '', '', totalValue]);

  return rows;
}

/**
 * 5. 거래처 원장
 * 거래처별 입출고 이력 + 누적 금액
 */
function generateVendorLedger(transactions, year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthTx = transactions
    .filter(tx => (tx.date || '').startsWith(prefix))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // 거래처별 그룹핑
  const vendorGroups = {};
  monthTx.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!vendorGroups[v]) vendorGroups[v] = [];
    vendorGroups[v].push(tx);
  });

  const rows = [
    ['=== 거래처 원장 ==='],
    [`기간: ${year}년 ${month}월`],
    [`작성일: ${new Date().toLocaleDateString('ko-KR')}`],
    [],
  ];

  Object.entries(vendorGroups).forEach(([vendor, txList]) => {
    rows.push(
      [`[ ${vendor} ]`],
      ['일자', '구분', '품목명', '수량', '단가', '금액', '누적금액'],
    );

    let cumulative = 0;
    txList.forEach(tx => {
      const amt = calcTxAmount(tx);
      cumulative += (tx.type === 'in' ? amt : -amt);
      rows.push([
        tx.date,
        tx.type === 'in' ? '매입' : '매출',
        tx.itemName || '-',
        parseFloat(tx.quantity) || 0,
        parseFloat(tx.unitPrice) || 0,
        amt,
        cumulative,
      ]);
    });

    const totalIn = txList.filter(t => t.type === 'in').reduce((s, t) => s + calcTxAmount(t), 0);
    const totalOut = txList.filter(t => t.type === 'out').reduce((s, t) => s + calcTxAmount(t), 0);
    rows.push(
      [`소계: 매입 ₩${totalIn.toLocaleString()} / 매출 ₩${totalOut.toLocaleString()}`],
      [],
    );
  });

  return rows;
}


// ============================================================
// 유틸리티
// ============================================================

/**
 * 거래의 금액 계산 (수량 × 단가)
 */
function calcTxAmount(tx) {
  return (parseFloat(tx.quantity) || 0) * (parseFloat(tx.unitPrice) || 0);
}

/**
 * 엑셀 다운로드 (단일 시트)
 * aoa(2D 배열)를 엑셀 시트로 변환하여 다운로드
 */
function downloadReport(filename, rows) {
  if (rows.length <= 5) {
    showToast('해당 기간에 데이터가 없습니다.', 'warning');
    return;
  }

  downloadExcelSheets([{ name: '시트1', rows }], filename);
  showToast(`${filename} 다운로드 완료!`, 'success');
}

/**
 * 엑셀 다운로드 (다중 시트)
 * 왜 별도? → 전체 서류 일괄 다운로드 시 시트별로 나눠서 한 파일로 제공
 */
function downloadMultiSheetReport(filename, sheets) {
  const sheetList = Object.entries(sheets).map(([name, rows]) => ({ name, rows }));
  downloadExcelSheets(sheetList, filename);
  showToast(`${filename} 전체 자료 다운로드 완료!`, 'success');
}
