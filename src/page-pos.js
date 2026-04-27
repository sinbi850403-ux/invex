/**
 * page-pos.js - POS 매출 데이터 분석 (관리자 전용 테스트)
 * 
 * 왜 별도 페이지? → 기존 재고 매핑과 POS 매출 데이터는 구조가 완전히 다름
 * POS 데이터: 판매일자, 매장명, 구분, 총매출액, 매출금액, 부가세, 카드, 포인트
 * 재고 데이터: 품목명, 수량, 매입가, 판매가
 * 
 * 관리자만 접근 가능 (테스트 중)
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { readExcelFile, downloadExcel, downloadExcelSheets } from './excel.js';
import { isAdmin } from './admin-auth.js';

// POS 필드 정의 — POS 시스템에서 내보내는 일반적인 컬럼들
const POS_FIELDS = [
  { key: 'saleDate',    label: '판매일자' },
  { key: 'storeName',   label: '매장명' },
  { key: 'category',    label: '구분' },
  { key: 'totalSales',  label: '총매출액' },
  { key: 'salesAmount', label: '매출금액' },
  { key: 'vat',         label: '부가세' },
  { key: 'cardAmount',  label: '카드' },
  { key: 'cashAmount',  label: '현금' },
  { key: 'pointAmount', label: '포인트' },
  { key: 'refund',      label: '환불/할인' },
  { key: 'netSales',    label: '순매출' },
  { key: 'itemName',    label: '품목명' },
  { key: 'quantity',    label: '수량' },
  { key: 'unitPrice',   label: '단가' },
  { key: 'posNumber',   label: 'POS번호' },
  { key: 'note',        label: '비고' },
];

// 자동 매핑 키워드 — POS 시스템마다 헤더명이 다르므로 유연하게
const POS_KEYWORDS = {
  saleDate:    ['판매일자', '판매일', '거래일', '거래일자', '일자', '날짜', 'date'],
  storeName:   ['매장명', '매장', '매장코드', '점포', '지점', 'store'],
  category:    ['구분', '분류', '결제구분', '유형', '거래유형', 'type'],
  totalSales:  ['총매출액', '총매출', '매출합계', '합계금액', '합계', 'total'],
  salesAmount: ['매출금액', '매출액', '공급가액', '공급가', '금액', 'sales', 'amount'],
  vat:         ['부가세', '세액', '부가가치세', 'vat', 'tax'],
  cardAmount:  ['카드', '카드금액', '카드매출', '신용카드', 'card'],
  cashAmount:  ['현금', '현금금액', '현금매출', 'cash'],
  pointAmount: ['포인트', '포인트금액', '포인트사용', 'point'],
  refund:      ['환불', '할인', '반품', '환불금액', '할인금액', 'refund', 'discount'],
  netSales:    ['순매출', '순매출액', '실매출', 'net'],
  itemName:    ['품목명', '품목', '상품명', '제품명', '메뉴명', 'item'],
  quantity:    ['수량', '판매수량', 'qty', 'quantity'],
  unitPrice:   ['단가', '판매단가', '매출단가', 'price'],
  posNumber:   ['pos번호', 'pos', '승인번호', '전표번호'],
  note:        ['비고', '메모', 'note', 'memo'],
};

/**
 * POS 헤더 자동 매핑
 * 왜 별도 함수? → 재고 매핑과 키워드가 완전히 다르므로
 */
function autoMapPOS(headers) {
  const lower = headers.map(h => (h || '').toString().toLowerCase().trim());
  const mapping = {};
  const usedIdx = new Set();

  POS_FIELDS.forEach(field => {
    const kws = POS_KEYWORDS[field.key] || [];
    const matchIdx = lower.findIndex((h, idx) => !usedIdx.has(idx) && kws.some(kw => h.includes(kw)));
    if (matchIdx >= 0) {
      mapping[field.key] = matchIdx;
      usedIdx.add(matchIdx);
    }
  });

  return mapping;
}

export function renderPosPage(container, navigateTo) {
  // 관리자 권한 체크
  if (!isAdmin()) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">접근 제한</h1>
      </div>
      <div class="alert alert-danger" style="margin-top:16px;">
         이 기능은 관리자만 사용할 수 있습니다.
      </div>
    `;
    return;
  }

  const state = getState();
  const posData = state.posData || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">POS 매출 분석</h1>
        <div class="page-desc">POS 매출 데이터를 업로드하여 매출 현황을 분석합니다. <span class="badge badge-danger" style="font-size:10px;">관리자 전용</span></div>
      </div>
      <div class="page-actions">
        ${posData.length > 0 ? `
          <button class="btn btn-outline" id="btn-pos-export"> 내보내기</button>
          <button class="btn btn-outline" id="btn-pos-clear"> 데이터 초기화</button>
        ` : ''}
        <button class="btn btn-primary" id="btn-pos-upload"> POS 엑셀 업로드</button>
      </div>
    </div>

    ${posData.length > 0 ? renderPosDashboard(posData) : renderPosEmpty()}
  `;

  // 업로드 버튼
  container.querySelector('#btn-pos-upload')?.addEventListener('click', () => {
    openPosUploadModal(container, navigateTo);
  });

  // 내보내기
  container.querySelector('#btn-pos-export')?.addEventListener('click', () => {
    if (posData.length === 0) { showToast('내보낼 데이터가 없습니다.', 'warning'); return; }
    downloadExcel(posData, 'POS_매출_데이터');
    showToast('POS 데이터를 엑셀로 내보냈습니다.', 'success');
  });

  // 초기화
  container.querySelector('#btn-pos-clear')?.addEventListener('click', () => {
    if (confirm('POS 매출 데이터를 모두 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
      setState({ posData: [] });
      showToast('POS 데이터를 초기화했습니다.', 'info');
      renderPosPage(container, navigateTo);
    }
  });
}

/**
 * 데이터 없을 때 빈 상태 표시
 */
function renderPosEmpty() {
  return `
    <div class="card" style="text-align:center; padding:60px 20px;">
      <div style="font-size:48px; margin-bottom:16px;"></div>
      <h3 style="margin-bottom:8px;">POS 매출 데이터를 업로드해 주세요</h3>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">
        POS 시스템에서 엑셀로 내보낸 매출 데이터를 업로드하면<br/>
        자동으로 헤더를 인식하고 매출 현황을 분석합니다.
      </p>
      <div class="alert alert-info" style="max-width:500px; margin:0 auto; text-align:left; font-size:12px;">
        <strong> 지원되는 POS 헤더:</strong><br/>
        판매일자, 매장명, 구분, 총매출액, 매출금액, 부가세, 카드, 현금, 포인트 등<br/>
        → 헤더 이름이 조금 달라도 자동으로 인식합니다!
      </div>
    </div>
  `;
}

/**
 * POS 대시보드 렌더링
 * 왜 이렇게 나누나? → 소상공인이 가장 궁금한 것: "오늘/이번달 얼마 벌었지?"
 */
function renderPosDashboard(posData) {
  // === KPI 계산 ===
  const totalSales = posData.reduce((s, d) => s + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0), 0);
  const totalVat = posData.reduce((s, d) => s + (parseFloat(d.vat) || 0), 0);
  const totalCard = posData.reduce((s, d) => s + (parseFloat(d.cardAmount) || 0), 0);
  const totalCash = posData.reduce((s, d) => s + (parseFloat(d.cashAmount) || 0), 0);
  const totalPoint = posData.reduce((s, d) => s + (parseFloat(d.pointAmount) || 0), 0);
  const totalRefund = posData.reduce((s, d) => s + (parseFloat(d.refund) || 0), 0);
  const netSales = totalSales - totalRefund;
  const txCount = posData.length;

  // 매장별 매출
  const storeMap = {};
  posData.forEach(d => {
    const store = d.storeName || '미지정';
    storeMap[store] = (storeMap[store] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0);
  });
  const storeRanking = Object.entries(storeMap).sort((a, b) => b[1] - a[1]);

  // 구분별 매출
  const catMap = {};
  posData.forEach(d => {
    const cat = d.category || '미분류';
    catMap[cat] = (catMap[cat] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0);
  });
  const catRanking = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // 일자별 매출 추이
  const dateMap = {};
  posData.forEach(d => {
    const date = d.saleDate || '미지정';
    dateMap[date] = (dateMap[date] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0);
  });
  const dateTrend = Object.entries(dateMap).sort((a, b) => a[0].localeCompare(b[0]));

  // 결제수단 비율
  const paymentTotal = totalCard + totalCash + totalPoint || 1;
  const cardPct = Math.round((totalCard / paymentTotal) * 100);
  const cashPct = Math.round((totalCash / paymentTotal) * 100);
  const pointPct = 100 - cardPct - cashPct;

  const fmt = n => '₩' + Math.round(n).toLocaleString('ko-KR');

  return `
    <!-- KPI 카드 -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">총 매출</div>
        <div class="stat-value text-accent">${fmt(totalSales)}</div>
        <div class="stat-change">${txCount}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">순매출</div>
        <div class="stat-value text-success">${fmt(netSales)}</div>
        <div class="stat-change">환불 ${fmt(totalRefund)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">부가세</div>
        <div class="stat-value">${fmt(totalVat)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">카드 매출</div>
        <div class="stat-value" style="color:var(--info, #58a6ff);">${fmt(totalCard)}</div>
        <div class="stat-change">${cardPct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">현금 매출</div>
        <div class="stat-value text-success">${fmt(totalCash)}</div>
        <div class="stat-change">${cashPct}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">포인트</div>
        <div class="stat-value" style="color:var(--warning);">${fmt(totalPoint)}</div>
        <div class="stat-change">${pointPct}%</div>
      </div>
    </div>

    <!-- 결제 수단 비율 바 -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title"> 결제 수단 비율</div>
      <div style="display:flex; height:32px; border-radius:8px; overflow:hidden; margin-bottom:8px;">
        ${totalCard > 0 ? `<div style="width:${cardPct}%; background:linear-gradient(135deg, #3b82f6, #2563eb); display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:600;">카드 ${cardPct}%</div>` : ''}
        ${totalCash > 0 ? `<div style="width:${cashPct}%; background:linear-gradient(135deg, #22c55e, #16a34a); display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:600;">현금 ${cashPct}%</div>` : ''}
        ${totalPoint > 0 ? `<div style="width:${pointPct}%; background:linear-gradient(135deg, #f59e0b, #d97706); display:flex; align-items:center; justify-content:center; color:#fff; font-size:11px; font-weight:600;">포인트 ${pointPct}%</div>` : ''}
      </div>
      <div style="display:flex; gap:16px; font-size:12px; color:var(--text-muted);">
        <span> 카드: ${fmt(totalCard)}</span>
        <span> 현금: ${fmt(totalCash)}</span>
        <span> 포인트: ${fmt(totalPoint)}</span>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
      <!-- 일자별 매출 추이 -->
      <div class="card">
        <div class="card-title"> 일자별 매출 추이</div>
        ${dateTrend.length > 0 ? `
          <div style="max-height:300px; overflow-y:auto;">
            ${dateTrend.map(([date, amount]) => {
              const maxAmount = Math.max(...dateTrend.map(d => d[1])) || 1;
              const pct = Math.round((amount / maxAmount) * 100);
              return `
                <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--border-light);">
                  <span style="font-size:12px; min-width:80px; color:var(--text-muted);">${date}</span>
                  <div style="flex:1; height:20px; background:var(--border-light); border-radius:4px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:linear-gradient(90deg, var(--accent), #60a5fa); border-radius:4px;"></div>
                  </div>
                  <span style="font-size:12px; font-weight:600; min-width:100px; text-align:right;">${fmt(amount)}</span>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<div style="text-align:center; padding:20px; color:var(--text-muted);">일자 데이터 없음</div>'}
      </div>

      <!-- 매장별/구분별 현황 -->
      <div>
        ${storeRanking.length > 1 ? `
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title"> 매장별 매출</div>
          ${storeRanking.slice(0, 10).map(([name, amount], i) => `
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light); font-size:13px;">
              <span><span style="color:var(--text-muted); margin-right:4px;">${i + 1}</span> ${name}</span>
              <span style="font-weight:600; color:var(--accent);">${fmt(amount)}</span>
            </div>
          `).join('')}
        </div>
        ` : ''}
        
        ${catRanking.length > 0 ? `
        <div class="card">
          <div class="card-title"> 구분별 매출</div>
          ${catRanking.slice(0, 10).map(([name, amount], i) => `
            <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light); font-size:13px;">
              <span><span style="color:var(--text-muted); margin-right:4px;">${i + 1}</span> ${name}</span>
              <span style="font-weight:600; color:var(--accent);">${fmt(amount)}</span>
            </div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>

    <!-- 상세 데이터 테이블 -->
    <div class="card card-flush">
      <div class="card-title" style="padding:12px 16px;"> 상세 데이터 <span class="card-subtitle">${posData.length}건</span></div>
      <div class="table-wrapper" style="border:none; max-height:400px; overflow-y:auto;">
        <table class="data-table" style="font-size:12px;">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>판매일자</th>
              <th>매장</th>
              <th>구분</th>
              <th class="text-right">총매출</th>
              <th class="text-right">매출금액</th>
              <th class="text-right">부가세</th>
              <th class="text-right">카드</th>
              <th class="text-right">현금</th>
              <th class="text-right">포인트</th>
            </tr>
          </thead>
          <tbody>
            ${posData.slice(0, 100).map((d, i) => `
              <tr>
                <td class="col-num">${i + 1}</td>
                <td>${d.saleDate || '-'}</td>
                <td>${d.storeName || '-'}</td>
                <td>${d.category || '-'}</td>
                <td class="text-right" style="font-weight:600;">${parseFloat(d.totalSales) ? fmt(parseFloat(d.totalSales)) : '-'}</td>
                <td class="text-right">${parseFloat(d.salesAmount) ? fmt(parseFloat(d.salesAmount)) : '-'}</td>
                <td class="text-right">${parseFloat(d.vat) ? fmt(parseFloat(d.vat)) : '-'}</td>
                <td class="text-right" style="color:var(--info, #58a6ff);">${parseFloat(d.cardAmount) ? fmt(parseFloat(d.cardAmount)) : '-'}</td>
                <td class="text-right text-success">${parseFloat(d.cashAmount) ? fmt(parseFloat(d.cashAmount)) : '-'}</td>
                <td class="text-right" style="color:var(--warning);">${parseFloat(d.pointAmount) ? fmt(parseFloat(d.pointAmount)) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--bg-secondary);">
              <td></td><td></td><td></td>
              <td>합계</td>
              <td class="text-right">${fmt(totalSales)}</td>
              <td class="text-right">${fmt(posData.reduce((s, d) => s + (parseFloat(d.salesAmount) || 0), 0))}</td>
              <td class="text-right">${fmt(totalVat)}</td>
              <td class="text-right">${fmt(totalCard)}</td>
              <td class="text-right">${fmt(totalCash)}</td>
              <td class="text-right">${fmt(totalPoint)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${posData.length > 100 ? `<div style="text-align:center; padding:8px; font-size:12px; color:var(--text-muted);">상위 100건만 표시 (전체 ${posData.length}건)</div>` : ''}
    </div>
  `;
}

/**
 * POS 엑셀 업로드 모달
 * 왜 모달? → 메인 데이터를 유지한 채 업로드/미리보기를 처리하기 위해
 */
function openPosUploadModal(container, navigateTo) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:800px;">
      <div class="modal-header">
        <h3 class="modal-title"> POS 매출 데이터 업로드</h3>
        <button class="modal-close" id="pos-modal-close"></button>
      </div>
      <div class="modal-body">
        <div class="alert alert-info" style="margin-bottom:16px; font-size:12px;">
          <strong> 사용 방법:</strong><br/>
          ① 아래 '양식 다운로드'로 POS 엑셀 양식을 받으세요<br/>
          ② POS 시스템 데이터를 양식에 맞게 붙여넣거나 직접 업로드하세요<br/>
          ③ 매핑 결과를 확인하고 '등록' 버튼을 누르세요
        </div>
        <div style="margin-bottom:16px;">
          <button class="btn btn-outline" id="btn-pos-template"> POS 양식 다운로드</button>
        </div>
        <div style="border:2px dashed var(--border); border-radius:8px; padding:40px; text-align:center; cursor:pointer; transition:border-color 0.2s;" id="pos-dropzone">
          <div style="font-size:36px; margin-bottom:8px;"></div>
          <div style="font-size:14px; font-weight:500;">POS 엑셀 파일을 여기에 드래그하거나 클릭</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">.xlsx, .xls 파일 지원</div>
          <input type="file" id="pos-file-input" accept=".xlsx,.xls,.csv" style="display:none;" />
        </div>
        <div id="pos-preview" style="display:none; margin-top:16px;"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pos-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  // POS 양식 다운로드
  overlay.querySelector('#btn-pos-template').addEventListener('click', () => {
    downloadPosTemplate();
  });

  // 파일 업로드 이벤트
  const dropzone = overlay.querySelector('#pos-dropzone');
  const fileInput = overlay.querySelector('#pos-file-input');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border)';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    const file = e.dataTransfer.files[0];
    if (file) processPosFile(file, overlay, container, navigateTo, close);
  });
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processPosFile(file, overlay, container, navigateTo, close);
  });
}

/**
 * POS 엑셀 파일 파싱 + 자동 매핑 + 미리보기
 */
async function processPosFile(file, overlay, container, navigateTo, closeModal) {
  const previewEl = overlay.querySelector('#pos-preview');
  previewEl.style.display = 'block';
  previewEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);"> 파일 분석 중...</div>';

  try {
    const { sheets, sheetNames } = await readExcelFile(file);
    const sheetData = sheets[sheetNames[0]];

    if (!sheetData || sheetData.length < 2) {
      previewEl.innerHTML = '<div class="alert alert-warning">데이터가 없거나 헤더만 있습니다.</div>';
      return;
    }

    const headers = sheetData[0].map(h => String(h || '').trim());
    const mapping = autoMapPOS(headers);
    const mappedCount = Object.keys(mapping).length;

    // 데이터 파싱
    const rows = [];
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (!row || row.length === 0) continue;

      // 빈 행 건너뛰기 — 모든 값이 비어있으면 스킵
      const hasValue = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
      if (!hasValue) continue;

      const record = {};
      POS_FIELDS.forEach(field => {
        const colIdx = mapping[field.key];
        if (colIdx !== undefined && colIdx < row.length) {
          let val = row[colIdx];
          // 날짜 처리 (엑셀 시리얼 날짜 변환)
          if (field.key === 'saleDate' && typeof val === 'number' && val > 10000) {
            const d = new Date((val - 25569) * 86400 * 1000);
            val = d.toISOString().split('T')[0];
          }
          record[field.key] = val !== null && val !== undefined ? String(val).trim() : '';
        }
      });

      // 최소한 금액 데이터가 있어야 유효한 행
      if (record.totalSales || record.salesAmount || record.cardAmount) {
        rows.push(record);
      }
    }

    if (rows.length === 0) {
      previewEl.innerHTML = '<div class="alert alert-warning">유효한 매출 데이터가 없습니다. 헤더를 확인해 주세요.</div>';
      return;
    }

    // 미리보기
    const totalSales = rows.reduce((s, r) => s + (parseFloat(r.totalSales) || parseFloat(r.salesAmount) || 0), 0);
    const fmt = n => '₩' + Math.round(n).toLocaleString('ko-KR');

    previewEl.innerHTML = `
      <div class="alert alert-success" style="margin-bottom:12px;">
         <strong>${rows.length}건</strong> 인식 완료 | 
        매핑된 필드: <strong>${mappedCount}/${headers.length}</strong> |
        총 매출: <strong>${fmt(totalSales)}</strong>
      </div>

      <!-- 매핑 결과 -->
      <div style="margin-bottom:12px;">
        <strong style="font-size:13px;"> 자동 매핑 결과:</strong>
        <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
          ${POS_FIELDS.map(field => {
            const idx = mapping[field.key];
            if (idx === undefined) return '';
            return `<span style="font-size:11px; padding:3px 8px; border-radius:4px; background:var(--accent); color:#fff;">
              ${headers[idx]} → ${field.label}
            </span>`;
          }).join('')}
        </div>
        ${mappedCount < headers.length ? `
          <div style="margin-top:6px; font-size:11px; color:var(--text-muted);">
             매핑 안 된 컬럼: ${headers.filter((h, i) => !Object.values(mapping).includes(i)).join(', ')}
          </div>
        ` : ''}
      </div>

      <!-- 미리보기 테이블 -->
      <div class="table-wrapper" style="max-height:200px; overflow-y:auto; margin-bottom:12px;">
        <table class="data-table" style="font-size:11px;">
          <thead>
            <tr>
              <th>일자</th><th>매장</th><th>구분</th>
              <th class="text-right">총매출</th><th class="text-right">카드</th><th class="text-right">현금</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 10).map(r => `
              <tr>
                <td>${r.saleDate || '-'}</td>
                <td>${r.storeName || '-'}</td>
                <td>${r.category || '-'}</td>
                <td class="text-right">${parseFloat(r.totalSales) ? fmt(parseFloat(r.totalSales)) : (parseFloat(r.salesAmount) ? fmt(parseFloat(r.salesAmount)) : '-')}</td>
                <td class="text-right">${parseFloat(r.cardAmount) ? fmt(parseFloat(r.cardAmount)) : '-'}</td>
                <td class="text-right">${parseFloat(r.cashAmount) ? fmt(parseFloat(r.cashAmount)) : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${rows.length > 10 ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">... 외 ${rows.length - 10}건</div>` : ''}

      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-outline" id="pos-cancel">취소</button>
        <button class="btn btn-primary" id="pos-confirm"> ${rows.length}건 등록</button>
      </div>
    `;

    previewEl.querySelector('#pos-cancel').addEventListener('click', () => {
      previewEl.style.display = 'none';
    });

    previewEl.querySelector('#pos-confirm').addEventListener('click', () => {
      // 기존 데이터에 추가 (덮어쓰기가 아닌 누적)
      const state = getState();
      const existing = state.posData || [];
      setState({ posData: [...existing, ...rows] });
      showToast(` POS 매출 ${rows.length}건 등록 완료! (총 매출: ${fmt(totalSales)})`, 'success');
      closeModal();
      renderPosPage(container, navigateTo);
    });

  } catch (err) {
    previewEl.innerHTML = `<div class="alert alert-danger">파일 처리 중 오류: ${err.message}</div>`;
  }
}

/**
 * POS 엑셀 양식 생성 & 다운로드
 * 왜 별도 페이지? → 기존 재고 매핑과 POS 매출 데이터는 구조가 완전히 다름
 *   표준 양식을 제공하면 수동 입력/복사-붙여넣기가 쉬워짐
 */
function downloadPosTemplate() {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // 데이터 시트
  const headers = ['판매일자', '매장명', '구분', '총매출액', '매출금액', '부가세', '카드', '현금', '포인트', '환불/할인', '순매출', '품목명', '수량', '단가', 'POS번호', '비고'];
  const sampleRows = [
    [today, '본점', '정상', 750000, 681819, 68181, 450000, 300000, 0, 0, 750000, '', '', '', '0001', '1일차 매출'],
    [today, '본점', '정상', 500000, 454545, 45455, 500000, 0, 0, 0, 500000, '', '', '', '0002', '카드 100%'],
    [today, '본점', '정상', 150000, 136364, 13636, 0, 100000, 50000, 0, 150000, '', '', '', '0003', '현금+포인트'],
    [today, '본점', '소계', 1400000, 1272728, 127272, 950000, 400000, 50000, 0, 1400000, '', '', '', '', '본점 소계'],
    [today, '2호점', '정상', 320000, 290909, 29091, 320000, 0, 0, 0, 320000, '', '', '', '0004', ''],
    [today, '2호점', '정상', 180000, 163636, 16364, 100000, 80000, 0, 0, 180000, '', '', '', '0005', ''],
    [today, '2호점', '환불', -50000, -45455, -4545, -50000, 0, 0, 50000, -50000, '', '', '', '0006', '불량 환불'],
    [today, '2호점', '소계', 450000, 409090, 40910, 370000, 80000, 0, 50000, 450000, '', '', '', '', '2호점 소계'],
    [yesterday, '본점', '정상', 620000, 563636, 56364, 400000, 220000, 0, 0, 620000, '', '', '', '0007', '전일 매출'],
    [yesterday, '본점', '정상', 280000, 254545, 25455, 280000, 0, 0, 0, 280000, '', '', '', '0008', ''],
  ];

  const dataRows = [headers, ...sampleRows];

  // 안내 시트
  const guideData = [
    [' INVEX POS 매출 양식 사용 안내'],
    [''],
    [' 이 양식에 POS 매출 데이터를 작성하여 INVEX에 업로드하세요.'],
    [''],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['■ 작성 방법'],
    [''],
    ['  ① 판매일자 : YYYY-MM-DD 형식 (예: 2026-04-08)'],
    ['  ② 매장명   : 매장 이름 (본점, 2호점 등)'],
    ['  ③ 구분     : 정상, 소계, 환불 등'],
    ['  ④ 총매출액 : 해당 건의 총 매출 (부가세 포함)'],
    ['  ⑤ 매출금액 : 부가세 제외 공급가액'],
    ['  ⑥ 부가세   : 부가가치세 금액'],
    ['  ⑦ 카드     : 카드 결제 금액'],
    ['  ⑧ 현금     : 현금 결제 금액'],
    ['  ⑨ 포인트   : 포인트 사용 금액'],
    [''],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['■ POS 시스템에서 가져오기'],
    [''],
    ['  → POS 관리 프로그램에서 "매출 내역 조회" → "엑셀 내보내기"'],
    ['  → 내보낸 파일을 그대로 INVEX에 업로드해도 자동 인식됩니다!'],
    ['  → 이 양식은 POS 데이터가 없을 때 수동 입력용입니다.'],
    [''],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['■ 환불 처리'],
    [''],
    ['  → 환불 건은 금액을 음수(-)로 입력하세요'],
    ['  → 구분 컬럼에 "환불"이라고 적어주세요'],
    [''],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['■ 자동 인식되는 헤더 이름 (헤더가 조금 달라도 OK!)'],
    [''],
    ['  총매출: 총매출액, 총매출, 매출합계, 합계금액, 합계'],
    ['  카드:   카드, 카드금액, 카드매출, 신용카드'],
    ['  현금:   현금, 현금금액, 현금매출'],
    ['  부가세: 부가세, 세액, 부가가치세'],
    [''],
    [' 자세한 사용법: https://invex.io.kr'],
  ];
  downloadExcelSheets(
    [
      { name: 'POS 매출 데이터', rows: dataRows },
      { name: '작성방법', rows: guideData },
    ],
    'INVEX_POS매출_양식',
  );
  showToast('POS 양식을 다운로드했습니다.', 'success');
}
