import { getState } from './store.js';
import { getSalePrice } from './price-utils.js';

export function renderProfitPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  const rows = items
    .map((item) => {
      const quantity = toNumber(item.quantity);
      const unitCost = toNumber(item.unitPrice || item.unitCost);
      const salePrice = toNumber(getSalePrice(item));
      const hasSalePrice = toNumber(item.salePrice) > 0;
      const totalCost = Math.round(quantity * unitCost);
      const totalRevenue = Math.round(quantity * salePrice);
      const profit = totalRevenue - totalCost;
      const profitRate = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
      const marginRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;

      return {
        name: item.itemName || '(미분류 품목)',
        code: item.itemCode || '',
        category: item.category || '미분류',
        quantity,
        unitCost,
        salePrice,
        hasSalePrice,
        totalCost,
        totalRevenue,
        profit,
        profitRate,
        marginRate,
      };
    })
    .filter((row) => row.quantity > 0 || row.totalCost > 0);

  const sortedByProfit = [...rows].sort((a, b) => b.profit - a.profit);
  const topProfit = sortedByProfit.slice(0, 5);
  const riskRows = [...rows]
    .filter((row) => row.hasSalePrice)
    .sort((a, b) => a.profitRate - b.profitRate)
    .slice(0, 5);

  const totalCost = sumBy(rows, (row) => row.totalCost);
  const totalRevenue = sumBy(rows, (row) => row.totalRevenue);
  const totalProfit = totalRevenue - totalCost;
  const avgProfitRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const avgMarginRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

  const salePriceCount = rows.filter((row) => row.hasSalePrice).length;
  const salePriceRate = rows.length > 0 ? (salePriceCount / rows.length) * 100 : 0;
  const lowMarginCount = rows.filter((row) => row.hasSalePrice && row.profitRate < 10).length;
  const lossCount = rows.filter((row) => row.profit < 0).length;

  const categorySummary = summarizeByCategory(rows).slice(0, 5);
  const monthlySummary = getCurrentMonthSummary(transactions);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💹</span> 손익 분석</h1>
        <div class="page-desc">재고 기준 예상 손익을 한눈에 확인하고, 손실 가능 품목을 빠르게 점검합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-profit-go-inventory">재고 화면으로 이동</button>
      </div>
    </div>

    ${
      salePriceRate < 70
        ? `
      <div class="alert alert-warning">
        <span>⚠️</span>
        <span>
          판매가 입력률이 <strong>${formatPercent(salePriceRate)}</strong> 입니다.
          정확한 손익 분석을 위해 재고 화면에서 판매가를 보완해 주세요.
        </span>
      </div>
    `
        : ''
    }

    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">총 예상 매출</div>
        <div class="stat-value text-accent">${formatMoney(totalRevenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 원가</div>
        <div class="stat-value">${formatMoney(totalCost)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 예상 이익</div>
        <div class="stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}">${formatSignedMoney(totalProfit)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 이익률</div>
        <div class="stat-value ${avgProfitRate >= 0 ? 'text-success' : 'text-danger'}">${formatPercent(avgProfitRate)}</div>
        <div class="stat-change">마진율 ${formatPercent(avgMarginRate)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">판매가 입력률</div>
        <div class="stat-value ${salePriceRate >= 70 ? 'text-success' : 'text-warning'}">${formatPercent(salePriceRate)}</div>
        <div class="stat-change">${salePriceCount} / ${rows.length} 품목</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">주의 품목</div>
        <div class="stat-value ${lowMarginCount + lossCount > 0 ? 'text-danger' : 'text-success'}">${lowMarginCount + lossCount}건</div>
        <div class="stat-change">저마진 ${lowMarginCount}건 · 손실 ${lossCount}건</div>
      </div>
    </div>

    <div class="card" style="padding-bottom: 8px;">
      <div class="card-title">한눈에 보는 핵심 포인트</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:14px;">
        <div style="border:1px solid var(--border); border-radius:10px; padding:12px;">
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">수익 상위 품목 TOP 5</div>
          ${renderQuickList(topProfit, (row, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:${i === topProfit.length - 1 ? 'none' : '1px solid var(--border-light)'};">
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(row.name)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${formatPercent(row.profitRate)} · ${row.quantity.toLocaleString('ko-KR')}개</div>
              </div>
              <div style="font-size:12px; font-weight:700; color:var(--success);">${formatSignedMoney(row.profit)}</div>
            </div>
          `)}
        </div>
        <div style="border:1px solid var(--border); border-radius:10px; padding:12px;">
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">주의 필요 품목 TOP 5</div>
          ${renderQuickList(riskRows, (row, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:${i === riskRows.length - 1 ? 'none' : '1px solid var(--border-light)'};">
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(row.name)}</div>
                <div style="font-size:11px; color:var(--text-muted);">개당 ${formatSignedMoney(row.salePrice - row.unitCost)}</div>
              </div>
              <div style="font-size:12px; font-weight:700; color:${row.profitRate < 10 ? 'var(--danger)' : 'var(--warning)'};">${formatPercent(row.profitRate)}</div>
            </div>
          `, '판매가가 입력된 품목이 없습니다.')}
        </div>
        <div style="border:1px solid var(--border); border-radius:10px; padding:12px;">
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">카테고리 수익 TOP 5</div>
          ${renderQuickList(categorySummary, (category, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:${i === categorySummary.length - 1 ? 'none' : '1px solid var(--border-light)'};">
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(category.name)}</div>
                <div style="font-size:11px; color:var(--text-muted);">${category.count}품목 · 이익률 ${formatPercent(category.rate)}</div>
              </div>
              <div style="font-size:12px; font-weight:700; color:${category.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatSignedMoney(category.profit)}</div>
            </div>
          `, '카테고리 데이터가 없습니다.')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">
        품목별 손익 상세
        <span class="card-subtitle">${rows.length.toLocaleString('ko-KR')}개 품목</span>
      </div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>품목명</th>
              <th>분류</th>
              <th class="text-right">수량</th>
              <th class="text-right">원가</th>
              <th class="text-right">판매가</th>
              <th class="text-right">개당 이익</th>
              <th class="text-right">총 이익</th>
              <th class="text-right">이익률</th>
              <th class="text-center">상태</th>
            </tr>
          </thead>
          <tbody>
            ${
              sortedByProfit.length === 0
                ? `
              <tr>
                <td colspan="10" style="text-align:center; color:var(--text-muted); padding:28px 0;">
                  손익을 계산할 재고 데이터가 없습니다.
                </td>
              </tr>
            `
                : sortedByProfit
                    .map((row, index) => {
                      const perUnitProfit = row.salePrice - row.unitCost;
                      const tone = getTone(row.profitRate);
                      return `
                <tr class="${row.profit < 0 ? 'row-danger' : row.profitRate < 10 ? 'row-warning' : ''}">
                  <td class="col-num">${index + 1}</td>
                  <td>
                    <strong>${escapeHtml(row.name)}</strong>
                    ${row.code ? `<div style="font-size:11px; color:var(--text-muted);">${escapeHtml(row.code)}</div>` : ''}
                  </td>
                  <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(row.category)}</td>
                  <td class="text-right">${row.quantity.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${formatMoney(row.unitCost)}</td>
                  <td class="text-right">
                    ${formatMoney(row.salePrice)}
                    ${!row.hasSalePrice ? '<span style="font-size:10px; color:var(--warning); margin-left:4px;">추정</span>' : ''}
                  </td>
                  <td class="text-right ${perUnitProfit >= 0 ? 'type-in' : 'type-out'}">${formatSignedMoney(perUnitProfit)}</td>
                  <td class="text-right ${row.profit >= 0 ? 'type-in' : 'type-out'}">${formatSignedMoney(row.profit)}</td>
                  <td class="text-right" style="font-weight:700; color:${tone};">${formatPercent(row.profitRate)}</td>
                  <td class="text-center">
                    <span class="badge ${
                      row.profit < 0 ? 'badge-danger' : row.profitRate < 10 ? 'badge-warning' : 'badge-success'
                    }">${row.profit < 0 ? '손실' : row.profitRate < 10 ? '주의' : '양호'}</span>
                  </td>
                </tr>
              `;
                    })
                    .join('')
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:0;">
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
        <div>
          <div style="font-size:12px; color:var(--text-muted);">이번 달 입·출고 손익(거래기준)</div>
          <div style="margin-top:6px; font-size:13px; line-height:1.7;">
            <div>매입: <strong>${formatMoney(monthlySummary.totalIn)}</strong></div>
            <div>매출: <strong>${formatMoney(monthlySummary.totalOut)}</strong></div>
            <div>거래 손익: <strong style="color:${monthlySummary.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatSignedMoney(monthlySummary.profit)}</strong></div>
          </div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted);">해석 기준</div>
          <div style="margin-top:6px; font-size:12px; color:var(--text-secondary); line-height:1.7;">
            <div>이익률 = (판매가 - 원가) / 판매가</div>
            <div>마진율 = (판매가 - 원가) / 원가</div>
            <div>판매가 미입력 품목은 기본 마진 규칙으로 추정됩니다.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-profit-go-inventory')?.addEventListener('click', () => navigateTo('inventory'));
}

function summarizeByCategory(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const previous = map.get(row.category) || { name: row.category, count: 0, revenue: 0, cost: 0, profit: 0 };
    previous.count += 1;
    previous.revenue += row.totalRevenue;
    previous.cost += row.totalCost;
    previous.profit += row.profit;
    map.set(row.category, previous);
  });

  return [...map.values()]
    .map((entry) => ({
      ...entry,
      rate: entry.revenue > 0 ? (entry.profit / entry.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.profit - a.profit);
}

function getCurrentMonthSummary(transactions) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyTransactions = transactions.filter((tx) => String(tx.date || '').startsWith(currentMonth));

  const totalIn = sumBy(
    monthlyTransactions.filter((tx) => tx.type === 'in'),
    (tx) => toNumber(tx.totalPrice) || toNumber(tx.quantity) * toNumber(tx.unitCost || tx.unitPrice),
  );

  const totalOut = sumBy(
    monthlyTransactions.filter((tx) => tx.type === 'out'),
    (tx) => toNumber(tx.totalPrice) || toNumber(tx.quantity) * toNumber(getSalePrice(tx)),
  );

  return {
    totalIn: Math.round(totalIn),
    totalOut: Math.round(totalOut),
    profit: Math.round(totalOut - totalIn),
  };
}

function renderQuickList(list, renderRow, emptyMessage = '데이터가 없습니다.') {
  if (!list.length) {
    return `<div style="padding:10px 0; font-size:12px; color:var(--text-muted);">${emptyMessage}</div>`;
  }
  return list.map((row, index) => renderRow(row, index)).join('');
}

function getTone(rate) {
  if (rate < 10) return 'var(--danger)';
  if (rate < 20) return 'var(--warning)';
  return 'var(--success)';
}

function sumBy(list, mapper) {
  return list.reduce((sum, item) => sum + mapper(item), 0);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value) {
  const rounded = Math.round(toNumber(value));
  return `${rounded.toLocaleString('ko-KR')}원`;
}

function formatSignedMoney(value) {
  const rounded = Math.round(toNumber(value));
  if (rounded === 0) return '0원';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('ko-KR')}원`;
}

function formatPercent(value) {
  return `${toNumber(value).toFixed(1)}%`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
