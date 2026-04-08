/**
 * page-profit.js - 손익 분석 대시보드
 * 
 * 역할: 매입/매출 기반으로 이익률, 월별 수익 추이, 품목별 수익성을 분석
 * 왜 필요? → 사장님이 가장 궁금한 건 "이번 달 얼마 남았나?" 이 하나
 */

import { getState } from './store.js';
import { renderWeeklyTrendChart, renderMonthlyChart, renderCategoryChart } from './charts.js';
import { calcSaleAmount, calcPurchaseAmount } from './price-utils.js';


export function renderProfitPage(container, navigateTo) {
  const state = getState();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // === 전체 기간 손익 ===
  const totalPurchase = transactions.filter(tx => tx.type === 'in')
    .reduce((s, tx) => s + calcPurchaseAmount(tx), 0);
  const totalSales = transactions.filter(tx => tx.type === 'out')
    .reduce((s, tx) => s + calcSaleAmount(tx), 0);
  const totalProfit = totalSales - totalPurchase;
  const profitRate = totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : '0';

  // === 이번 달 손익 ===
  const prefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(prefix));
  const monthPurchase = monthTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + calcPurchaseAmount(tx), 0);
  const monthSales = monthTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + calcSaleAmount(tx), 0);
  const monthProfit = monthSales - monthPurchase;
  const monthRate = monthSales > 0 ? ((monthProfit / monthSales) * 100).toFixed(1) : '0';

  // === 월별 손익 추이 (최근 6개월) ===
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const p = `${y}-${String(m).padStart(2, '0')}`;
    const mTx = transactions.filter(tx => (tx.date || '').startsWith(p));
    const mIn = mTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + calcPurchaseAmount(tx), 0);
    const mOut = mTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + calcSaleAmount(tx), 0);
    monthlyData.push({ label: `${m}월`, purchase: mIn, sales: mOut, profit: mOut - mIn });
  }

  // === 품목별 수익성 TOP 10 ===
  const itemProfitMap = {};
  transactions.forEach(tx => {
    const name = tx.itemName || '미분류';
    if (!itemProfitMap[name]) itemProfitMap[name] = { purchase: 0, sales: 0 };
    if (tx.type === 'in') {
      itemProfitMap[name].purchase += calcPurchaseAmount(tx);
    } else {
      itemProfitMap[name].sales += calcSaleAmount(tx);
    }
  });

  const itemProfits = Object.entries(itemProfitMap)
    .map(([name, d]) => ({
      name, purchase: d.purchase, sales: d.sales,
      profit: d.sales - d.purchase,
      rate: d.sales > 0 ? ((d.sales - d.purchase) / d.sales * 100).toFixed(1) : '0',
    }))
    .sort((a, b) => b.profit - a.profit);

  // === 거래처별 수익성 ===
  const vendorProfitMap = {};
  transactions.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!vendorProfitMap[v]) vendorProfitMap[v] = { purchase: 0, sales: 0 };
    if (tx.type === 'in') {
      vendorProfitMap[v].purchase += calcPurchaseAmount(tx);
    } else {
      vendorProfitMap[v].sales += calcSaleAmount(tx);
    }
  });

  const vendorProfits = Object.entries(vendorProfitMap)
    .map(([name, d]) => ({
      name, purchase: d.purchase, sales: d.sales,
      profit: d.sales - d.purchase,
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 8);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💹</span> 손익 분석</h1>
        <div class="page-desc">매입/매출 기반 수익성을 한눈에 파악합니다.</div>
      </div>
    </div>

    <!-- 핵심 KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">이번 달 매출</div>
        <div class="stat-value text-accent" style="font-size:18px;">₩${monthSales.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 달 매입</div>
        <div class="stat-value" style="font-size:18px;">₩${monthPurchase.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번 달 이익</div>
        <div class="stat-value ${monthProfit >= 0 ? 'text-success' : 'text-danger'}" style="font-size:18px;">
          ${monthProfit >= 0 ? '+' : ''}₩${monthProfit.toLocaleString('ko-KR')}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이익률</div>
        <div class="stat-value ${parseFloat(monthRate) >= 0 ? 'text-success' : 'text-danger'}">${monthRate}%</div>
      </div>
    </div>

    <!-- 누적 실적 -->
    <div class="card" style="background:linear-gradient(135deg, rgba(63,185,80,0.05), rgba(37,99,235,0.05));">
      <div class="card-title">📊 전체 누적 실적</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px; text-align:center;">
        <div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">총 매출</div>
          <div style="font-size:20px; font-weight:700; color:var(--accent);">₩${totalSales.toLocaleString('ko-KR')}</div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">총 매입</div>
          <div style="font-size:20px; font-weight:700;">₩${totalPurchase.toLocaleString('ko-KR')}</div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">총 이익 (이익률 ${profitRate}%)</div>
          <div style="font-size:20px; font-weight:700; color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
            ${totalProfit >= 0 ? '+' : ''}₩${totalProfit.toLocaleString('ko-KR')}
          </div>
        </div>
      </div>
    </div>

    <!-- 월별 추이 차트 -->
    <div class="card">
      <div class="card-title">📈 월별 매출/매입/이익 추이</div>
      <div style="height:280px; position:relative;">
        <canvas id="chart-profit-monthly"></canvas>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
      <!-- 품목별 TOP 10 -->
      <div class="card">
        <div class="card-title">💎 품목별 수익성 TOP 10</div>
        ${itemProfits.slice(0, 10).map((item, i) => {
          const maxSales = itemProfits[0]?.sales || 1;
          const pct = Math.round((item.sales / maxSales) * 100);
          return `
            <div style="margin-bottom:10px;">
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                <span><span style="color:var(--text-muted); margin-right:4px;">${i + 1}</span> <strong>${item.name}</strong></span>
                <span style="color:${item.profit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">
                  ${item.profit >= 0 ? '+' : ''}₩${item.profit.toLocaleString('ko-KR')} (${item.rate}%)
                </span>
              </div>
              <div style="display:flex; gap:2px; height:6px;">
                <div style="flex:${item.sales}; background:var(--success); border-radius:3px; opacity:0.7;"></div>
                <div style="flex:${item.purchase}; background:var(--danger); border-radius:3px; opacity:0.7;"></div>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-top:2px;">
                <span>매출 ₩${item.sales.toLocaleString('ko-KR')}</span>
                <span>매입 ₩${item.purchase.toLocaleString('ko-KR')}</span>
              </div>
            </div>
          `;
        }).join('')}
        ${itemProfits.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">거래 데이터가 없습니다</div>' : ''}
      </div>

      <!-- 거래처별 실적 -->
      <div class="card">
        <div class="card-title">🤝 거래처별 거래 실적</div>
        ${vendorProfits.map(v => `
          <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border-light); font-size:13px;">
            <div style="flex:1;">
              <strong>${v.name}</strong>
            </div>
            <div style="text-align:right; font-size:11px;">
              <div style="color:var(--success);">매출 ₩${v.sales.toLocaleString('ko-KR')}</div>
              <div style="color:var(--text-muted);">매입 ₩${v.purchase.toLocaleString('ko-KR')}</div>
            </div>
          </div>
        `).join('')}
        ${vendorProfits.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">거래처 데이터가 없습니다</div>' : ''}
      </div>
    </div>
  `;

  // 차트 렌더링
  setTimeout(() => {
    renderProfitChart('chart-profit-monthly', monthlyData);
  }, 50);
}



/**
 * 손익 추이 차트 (매출/매입/이익 3선)
 */
function renderProfitChart(canvasId, data) {
  // charts.js의 Chart를 직접 import
  import('chart.js').then(({ Chart }) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const dark = document.documentElement.classList.contains('dark-mode');
    const textColor = dark ? '#8b949e' : '#5a6474';
    const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map(d => d.label),
        datasets: [
          {
            label: '매출',
            data: data.map(d => d.sales),
            backgroundColor: 'rgba(63,185,80,0.7)',
            borderRadius: 4,
            order: 2,
          },
          {
            label: '매입',
            data: data.map(d => d.purchase),
            backgroundColor: 'rgba(248,81,73,0.5)',
            borderRadius: 4,
            order: 3,
          },
          {
            label: '이익',
            data: data.map(d => d.profit),
            type: 'line',
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88,166,255,0.1)',
            fill: true,
            tension: 0.4,
            borderWidth: 2,
            pointRadius: 5,
            pointBackgroundColor: '#58a6ff',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 }, usePointStyle: true } },
          tooltip: {
            backgroundColor: dark ? '#21262d' : '#fff',
            titleColor: dark ? '#e6edf3' : '#1a1a2e',
            bodyColor: dark ? '#b1bac4' : '#5a6474',
            borderColor: dark ? '#30363d' : '#e2e6eb',
            borderWidth: 1, padding: 10, cornerRadius: 6,
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ₩${ctx.parsed.y.toLocaleString('ko-KR')}` },
          },
        },
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
          y: {
            ticks: { color: textColor, font: { size: 10 }, callback: (v) => `₩${(v/10000).toFixed(0)}만` },
            grid: { color: gridColor },
          },
        },
      },
    });
  });
}
