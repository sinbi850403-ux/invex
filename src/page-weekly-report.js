/**
 * page-weekly-report.js - 정기 보고서
 * 
 * 역할: 주간/월간 경영 요약 보고서를 자동 생성하여 확인
 * 왜 필요? → 매주 월요일마다 자동으로 경영 현황을 정리 → 습관 형성 → 의존도↑
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { getSalePrice } from './price-utils.js';
import { enableLocalReportSort } from './report-local-sort.js';

export function renderWeeklyReportPage(container, navigateTo) {
  const state = getState();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];
  const safetyStock = state.safetyStock || {};

  // 이번 주 / 지난 주 날짜 범위
  const now = new Date();
  const thisWeekStart = getMonday(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeekTx = filterByDateRange(transactions, thisWeekStart, now);
  const lastWeekTx = filterByDateRange(transactions, lastWeekStart, thisWeekStart);

  // 이번 주 매출/매입
  const thisWeekSales = calcTotal(thisWeekTx, 'out');
  const thisWeekPurchase = calcTotal(thisWeekTx, 'in');
  const lastWeekSales = calcTotal(lastWeekTx, 'out');
  const lastWeekPurchase = calcTotal(lastWeekTx, 'in');

  // 증감률
  const salesChange = calcChange(thisWeekSales, lastWeekSales);
  const purchaseChange = calcChange(thisWeekPurchase, lastWeekPurchase);

  // 재고 부족 품목
  const lowStockItems = items.filter(it => {
    const min = safetyStock[it.itemName];
    return min !== undefined && (parseFloat(it.quantity) || 0) <= min;
  });

  // 이번 주 TOP 5 출고 품목
  const outByItem = {};
  thisWeekTx.filter(tx => tx.type === 'out').forEach(tx => {
    const name = tx.itemName || '-';
    outByItem[name] = (outByItem[name] || 0) + (parseFloat(tx.quantity) || 0);
  });
  const topOutItems = Object.entries(outByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // 이번 주 TOP 5 입고 품목
  const inByItem = {};
  thisWeekTx.filter(tx => tx.type === 'in').forEach(tx => {
    const name = tx.itemName || '-';
    inByItem[name] = (inByItem[name] || 0) + (parseFloat(tx.quantity) || 0);
  });
  const topInItems = Object.entries(inByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const weekLabel = `${formatDate(thisWeekStart)} ~ ${formatDate(now)}`;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">주간 경영 보고서</h1>
        <div class="page-desc">${weekLabel}</div>
      </div>
    </div>

    <!-- 주간 KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">이번 주 매출</div>
        <div class="stat-value text-success">₩${thisWeekSales.toLocaleString()}</div>
        <div style="font-size:11px; color:${salesChange >= 0 ? 'var(--success)' : 'var(--danger)'}; margin-top:4px;">
          ${salesChange >= 0 ? '▲' : '▼'} 전주 대비 ${Math.abs(salesChange)}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 주 매입</div>
        <div class="stat-value" style="color:#58a6ff;">₩${thisWeekPurchase.toLocaleString()}</div>
        <div style="font-size:11px; color:${purchaseChange <= 0 ? 'var(--success)' : 'var(--danger)'}; margin-top:4px;">
          ${purchaseChange >= 0 ? '▲' : '▼'} 전주 대비 ${Math.abs(purchaseChange)}%
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 주 거래 건수</div>
        <div class="stat-value text-accent">${thisWeekTx.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">재고 부족 경고</div>
        <div class="stat-value ${lowStockItems.length > 0 ? 'text-danger' : ''}">${lowStockItems.length > 0 ? lowStockItems.length + '건' : '없음'}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-top:16px;">
      <!-- TOP 5 출고 -->
      <div class="card">
        <div class="card-title">📤 이번 주 출고 TOP 5</div>
        ${topOutItems.length === 0 ? '<div style="color:var(--text-muted); font-size:13px; padding:12px;">이번 주 출고 내역이 없습니다.</div>' : `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${topOutItems.map(([name, qty], i) => `
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="width:24px; height:24px; border-radius:50%; background:${i < 3 ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'var(--bg-secondary)'}; color:${i < 3 ? '#fff' : 'var(--text-muted)'}; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0;">${i + 1}</span>
                <span style="flex:1; font-size:13px; font-weight:600;">${name}</span>
                <span style="font-size:13px; font-weight:700; color:var(--accent);">${qty}개</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- TOP 5 입고 -->
      <div class="card">
        <div class="card-title">📥 이번 주 입고 TOP 5</div>
        ${topInItems.length === 0 ? '<div style="color:var(--text-muted); font-size:13px; padding:12px;">이번 주 입고 내역이 없습니다.</div>' : `
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${topInItems.map(([name, qty], i) => `
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="width:24px; height:24px; border-radius:50%; background:${i < 3 ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'var(--bg-secondary)'}; color:${i < 3 ? '#fff' : 'var(--text-muted)'}; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0;">${i + 1}</span>
                <span style="flex:1; font-size:13px; font-weight:600;">${name}</span>
                <span style="font-size:13px; font-weight:700; color:var(--success);">${qty}개</span>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    </div>

    <!-- 재고 부족 알림 -->
    ${lowStockItems.length > 0 ? `
      <div class="card" style="margin-top:16px; border-left:3px solid var(--danger);">
        <div class="card-title">⚠️ 재고 부족 품목 (${lowStockItems.length}건)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr><th class="col-fill">품목명</th><th class="text-right">현재고</th><th class="text-right">안전재고</th><th>상태</th></tr>
            </thead>
            <tbody>
              ${lowStockItems.slice(0, 10).map(it => {
                const qty = parseFloat(it.quantity) || 0;
                const min = safetyStock[it.itemName];
                return `
                  <tr>
                    <td class="col-fill"><strong>${it.itemName}</strong></td>
                    <td class="text-right" style="color:var(--danger); font-weight:700;">${qty}</td>
                    <td class="text-right">${min}</td>
                    <td style="color:var(--danger); font-size:12px;">
                      ${qty === 0 ? '🚨 재고 없음' : '⚠️ 부족'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- 요약 -->
    <div class="card" style="margin-top:16px; border-left:3px solid var(--accent);">
      <div class="card-title">💡 이번 주 인사이트</div>
      <ul style="font-size:13px; color:var(--text-muted); line-height:2; margin:0; padding-left:16px;">
        ${thisWeekTx.length === 0 ? '<li>이번 주에 등록된 거래가 없습니다. 입출고를 기록해보세요!</li>' : ''}
        ${salesChange > 20 ? '<li style="color:var(--success);">📈 이번 주 매출이 전주 대비 크게 증가했습니다!</li>' : ''}
        ${salesChange < -20 ? '<li style="color:var(--danger);">📉 이번 주 매출이 전주 대비 크게 감소했습니다. 원인을 확인해보세요.</li>' : ''}
        ${lowStockItems.length > 0 ? `<li style="color:var(--danger);">⚠️ ${lowStockItems.length}개 품목의 재고가 부족합니다. 발주를 검토하세요.</li>` : '<li style="color:var(--success);">✅ 재고 부족 품목이 없습니다.</li>'}
        ${topOutItems.length > 0 ? `<li>🏆 이번 주 가장 많이 출고된 품목: <strong>${topOutItems[0][0]}</strong> (${topOutItems[0][1]}개)</li>` : ''}
      </ul>
    </div>
  `;

  container.querySelectorAll('.data-table').forEach((table) => {
    table.dataset.autoSort = 'off';
  });
  enableLocalReportSort(container);
}

// === 유틸리티 ===

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function filterByDateRange(txList, start, end) {
  return txList.filter(tx => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    return d >= start && d < end;
  });
}

// 매출(out)은 판매단가(getSalePrice) 기준, 매입(in)은 매입단가(unitPrice) 기준
function calcTotal(txList, type) {
  return txList
    .filter(tx => tx.type === type)
    .reduce((s, tx) => {
      const qty = parseFloat(tx.quantity) || 0;
      const price = type === 'out'
        ? getSalePrice(tx)                          // 출고 = 판매단가 (손익분석과 동일 기준)
        : (parseFloat(tx.unitPrice) || 0);           // 입고 = 매입단가
      return s + qty * price;
    }, 0);
}

function calcChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
