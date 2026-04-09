/**
 * page-profit.js - 손익 분석 대시보드 (회계사/세무사 관점)
 * 
 * ★ 소상공인이 가장 중요하게 보는 3가지:
 *   1. 이번 달 얼마 남았나? (매출총이익)
 *   2. 어떤 품목이 가장 많이 벌어주나? (품목별 이익률)
 *   3. 마진이 얼마인가? (매출총이익률)
 * 
 * 회계 용어 정리:
 *   - 매출액 = 수량 × 판매가(소가)
 *   - 매출원가(매입원가) = 수량 × 매입가(원가)
 *   - 매출총이익 = 매출액 - 매출원가
 *   - 매출총이익률(%) = (매출총이익 / 매출액) × 100
 *   - 마진율(%) = (이익 / 원가) × 100 = "원가 대비 얼마나 남는지"
 *   - 이익률(%) = (이익 / 판매가) × 100 = "판매가 대비 얼마나 남는지"
 */

import { getState } from './store.js';
import { getSalePrice } from './price-utils.js';

const DEFAULT_PROFIT_SORT = {
  category: { key: 'profit', direction: 'desc' },
  item: { key: 'profit', direction: 'desc' },
};

let profitSortState = {
  category: { ...DEFAULT_PROFIT_SORT.category },
  item: { ...DEFAULT_PROFIT_SORT.item },
};

const TEXT_SORT_KEYS = new Set(['name', 'category', 'code']);

function getProfitDefaultDirection(key) {
  return TEXT_SORT_KEYS.has(key) ? 'asc' : 'desc';
}

function toggleProfitSort(section, key) {
  const current = profitSortState[section];
  if (current.key === key) {
    profitSortState[section] = {
      key,
      direction: current.direction === 'desc' ? 'asc' : 'desc',
    };
    return;
  }

  profitSortState[section] = {
    key,
    direction: getProfitDefaultDirection(key),
  };
}

function getProfitSortIcon(section, key) {
  const current = profitSortState[section];
  if (current.key !== key) {
    return '<span style="margin-left:4px; color:var(--text-muted); font-size:10px;">↕</span>';
  }

  return `<span style="margin-left:4px; color:var(--accent); font-size:10px;">${current.direction === 'desc' ? '▼' : '▲'}</span>`;
}

function compareProfitValues(a, b, direction) {
  const dir = direction === 'desc' ? -1 : 1;

  if (typeof a === 'string' || typeof b === 'string') {
    return String(a || '').localeCompare(String(b || ''), 'ko') * dir;
  }

  return ((Number(a) || 0) - (Number(b) || 0)) * dir;
}

function sortProfitRows(rows, section, getValue) {
  const current = profitSortState[section];

  return [...rows].sort((a, b) => {
    const primary = compareProfitValues(
      getValue(a, current.key),
      getValue(b, current.key),
      current.direction
    );

    if (primary !== 0) return primary;

    return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  });
}

function getCategorySortValue(row, key) {
  switch (key) {
    case 'name': return row.name || '';
    case 'count': return row.count;
    case 'cost': return row.cost;
    case 'revenue': return row.revenue;
    case 'profit': return row.profit;
    case 'rate': return parseFloat(row.rate) || 0;
    default: return row.profit;
  }
}

function getItemSortValue(row, key) {
  switch (key) {
    case 'name': return row.name || '';
    case 'category': return row.category || '';
    case 'qty': return row.qty;
    case 'costPrice': return row.costPrice;
    case 'salePrice': return row.salePrice;
    case 'perUnitProfit': return row.salePrice - row.costPrice;
    case 'profitRate': return row.profitRate;
    case 'marginRate': return row.marginRate;
    case 'profit': return row.profit;
    default: return row.profit;
  }
}

export function renderProfitPage(container, navigateTo) {
  const state = getState();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];

  // === 재고 기반 손익 (품목 데이터에서 계산) ===
  // 왜? → 거래 이력이 없어도 재고 목록만 있으면 잠재 이익을 보여줌
  const inventoryAnalysis = items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const costPrice = parseFloat(item.unitPrice) || 0;     // 매입가
    const salePrice = getSalePrice(item);                    // 판매가 (없으면 20% 마진 추정)
    const hasRealSalePrice = parseFloat(item.salePrice) > 0; // 실제 판매가 입력 여부

    const totalCost = Math.round(qty * costPrice);            // 매입 총액 (원단위 반올림)
    const totalRevenue = Math.round(qty * salePrice);          // 매출 총액 (원단위 반올림)
    const profit = totalRevenue - totalCost;                   // 이익
    const profitRate = totalRevenue > 0 ? (profit / totalRevenue * 100) : 0; // 이익률(%)
    const marginRate = totalCost > 0 ? (profit / totalCost * 100) : 0;      // 마진율(%)

    return {
      name: item.itemName || '(미분류)',
      code: item.itemCode || '',
      category: item.category || '',
      qty,
      costPrice,
      salePrice,
      hasRealSalePrice,
      totalCost,
      totalRevenue,
      profit,
      profitRate,
      marginRate,
    };
  }).filter(d => d.qty > 0 || d.totalCost > 0); // 수량 또는 금액이 있는 것만

  // === 전체 합산 ===
  const totalCost = inventoryAnalysis.reduce((s, d) => s + d.totalCost, 0);
  const totalRevenue = inventoryAnalysis.reduce((s, d) => s + d.totalRevenue, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgProfitRate = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : '0';
  const avgMarginRate = totalCost > 0 ? (totalProfit / totalCost * 100).toFixed(1) : '0';

  // 판매가 입력된 비율
  const salePriceCount = inventoryAnalysis.filter(d => d.hasRealSalePrice).length;
  const salePricePercent = inventoryAnalysis.length > 0
    ? Math.round(salePriceCount / inventoryAnalysis.length * 100) : 0;

  // === 이익 TOP 5 / 마진 낮은 TOP 5 ===
  const profitRanking = [...inventoryAnalysis].sort((a, b) => b.profit - a.profit);
  const top5 = profitRanking.slice(0, 5);
  const lowMargin = [...inventoryAnalysis]
    .filter(d => d.totalCost > 0 && d.hasRealSalePrice)
    .sort((a, b) => a.profitRate - b.profitRate)
    .slice(0, 5);

  // === 분류별 이익 ===
  const categoryMap = {};
  inventoryAnalysis.forEach(d => {
    const cat = d.category || '(미분류)';
    if (!categoryMap[cat]) categoryMap[cat] = { cost: 0, revenue: 0, profit: 0, count: 0 };
    categoryMap[cat].cost += d.totalCost;
    categoryMap[cat].revenue += d.totalRevenue;
    categoryMap[cat].profit += d.profit;
    categoryMap[cat].count += 1;
  });
  const categoryData = Object.entries(categoryMap)
    .map(([name, d]) => ({
      name, ...d,
      rate: d.revenue > 0 ? (d.profit / d.revenue * 100).toFixed(1) : '0',
    }));

  const sortedCategoryData = sortProfitRows(categoryData, 'category', getCategorySortValue);
  const sortedInventoryAnalysis = sortProfitRows(inventoryAnalysis, 'item', getItemSortValue);

  // === 거래 기반 손익 (월별) ===
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTx = transactions.filter(tx => (tx.date || '').startsWith(currentMonth));
  const monthIn = monthTx.filter(tx => tx.type === 'in').reduce((s, tx) => s + (parseFloat(tx.totalPrice || tx.quantity * tx.unitPrice) || 0), 0);
  const monthOut = monthTx.filter(tx => tx.type === 'out').reduce((s, tx) => s + (parseFloat(tx.totalPrice || tx.quantity * (getSalePrice(tx))) || 0), 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💹</span> 손익 분석</h1>
        <div class="page-desc">매입가·판매가 기반 이익률을 정확하게 분석합니다.</div>
      </div>
    </div>

    <!-- 판매가 입력 안내 (입력률이 낮으면 경고) -->
    ${salePricePercent < 50 ? `
    <div class="alert alert-info" style="margin-bottom:16px;">
      ⚠️ <strong>판매가(소가) 입력률: ${salePricePercent}%</strong> (${salePriceCount}/${inventoryAnalysis.length}개 품목)
      <br/><span style="font-size:12px; color:var(--text-muted);">
        재고 현황에서 판매단가를 입력하면 더 정확한 이익률을 볼 수 있습니다. 미입력 품목은 매입가 +20% 추정치로 계산됩니다.
      </span>
    </div>
    ` : ''}

    <!-- ━━━ 1. 손익 요약 (가장 중요한 숫자) ━━━ -->
    <div class="card" style="background:linear-gradient(135deg, rgba(63,185,80,0.05), rgba(37,99,235,0.05)); margin-bottom:20px;">
      <div class="card-title" style="font-size:16px;">📊 손익 요약 (매출총이익)</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:16px; text-align:center; margin-top:12px;">
        <div>
          <div style="font-size:11px; color:var(--text-muted);">예상 매출액</div>
          <div style="font-size:11px; color:var(--text-muted);">수량 × 판매가</div>
          <div style="font-size:22px; font-weight:800; color:var(--accent); margin-top:4px;">₩${totalRevenue.toLocaleString('ko-KR')}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">매입 원가</div>
          <div style="font-size:11px; color:var(--text-muted);">수량 × 매입가</div>
          <div style="font-size:22px; font-weight:800; margin-top:4px;">₩${totalCost.toLocaleString('ko-KR')}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">매출총이익</div>
          <div style="font-size:11px; color:var(--text-muted);">매출 - 원가</div>
          <div style="font-size:22px; font-weight:800; color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; margin-top:4px;">
            ${totalProfit >= 0 ? '+' : ''}₩${totalProfit.toLocaleString('ko-KR')}
          </div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">이익률</div>
          <div style="font-size:11px; color:var(--text-muted);">이익 ÷ 매출 × 100</div>
          <div style="font-size:22px; font-weight:800; color:${parseFloat(avgProfitRate) >= 0 ? 'var(--success)' : 'var(--danger)'}; margin-top:4px;">
            ${avgProfitRate}%
          </div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--text-muted);">마진율</div>
          <div style="font-size:11px; color:var(--text-muted);">이익 ÷ 원가 × 100</div>
          <div style="font-size:22px; font-weight:800; color:var(--accent); margin-top:4px;">
            ${avgMarginRate}%
          </div>
        </div>
      </div>
      <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--border); font-size:11px; color:var(--text-muted);">
        💡 <strong>이익률</strong> = 판매가 대비 남는 금액 비율 | <strong>마진율</strong> = 원가 대비 남는 금액 비율
        (예: 1만원에 사서 1.5만원에 팔면 → 이익률 33.3%, 마진율 50%)
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
      <!-- ━━━ 2. 이익 TOP 5 (효자 품목) ━━━ -->
      <div class="card">
        <div class="card-title">🏆 이익 TOP 5 (효자 품목)</div>
        ${top5.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted);">데이터 없음</div>' : ''}
        ${top5.map((d, i) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border-light);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:var(--text-muted); font-size:12px; margin-right:4px;">${i + 1}</span>
                <strong>${d.name}</strong>
                ${d.code ? `<span style="color:var(--text-muted); font-size:11px; margin-left:4px;">(${d.code})</span>` : ''}
              </div>
              <span style="font-weight:700; color:var(--success); font-size:14px;">
                +₩${d.profit.toLocaleString('ko-KR')}
              </span>
            </div>
            <div style="display:flex; gap:12px; font-size:11px; color:var(--text-muted); margin-top:4px;">
              <span>매입가 ₩${d.costPrice.toLocaleString('ko-KR')}</span>
              <span>→</span>
              <span>판매가 ₩${d.salePrice.toLocaleString('ko-KR')}
                ${!d.hasRealSalePrice ? '<span style="color:var(--warning);">(추정)</span>' : ''}
              </span>
              <span>×${d.qty}개</span>
              <span style="font-weight:600; color:var(--accent);">이익률 ${d.profitRate.toFixed(1)}%</span>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- ━━━ 3. 마진 낮은 TOP 5 (주의 품목) ━━━ -->
      <div class="card">
        <div class="card-title">⚠️ 마진 낮은 품목 TOP 5 (주의)</div>
        ${lowMargin.length === 0 ? '<div style="text-align:center; padding:20px; color:var(--text-muted);">판매가가 입력된 품목이 없습니다</div>' : ''}
        ${lowMargin.map((d, i) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border-light);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:var(--text-muted); font-size:12px; margin-right:4px;">${i + 1}</span>
                <strong>${d.name}</strong>
              </div>
              <span style="font-weight:700; color:${d.profitRate < 10 ? 'var(--danger)' : 'var(--warning)'}; font-size:14px;">
                이익률 ${d.profitRate.toFixed(1)}%
              </span>
            </div>
            <div style="display:flex; gap:12px; font-size:11px; color:var(--text-muted); margin-top:4px;">
              <span>매입가 ₩${d.costPrice.toLocaleString('ko-KR')}</span>
              <span>→</span>
              <span>판매가 ₩${d.salePrice.toLocaleString('ko-KR')}</span>
              <span>이익 ₩${(d.salePrice - d.costPrice).toLocaleString('ko-KR')}/개</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- ━━━ 4. 분류별 이익 분석 ━━━ -->
    <div class="card" style="margin-top:16px;">
      <div class="card-title">📋 분류별 이익 분석</div>
      <div style="padding:0 16px 12px; font-size:11px; color:var(--text-muted);">헤더를 클릭하면 오름차순/내림차순으로 정렬됩니다.</div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th data-profit-sort="category" data-sort-key="name" style="cursor:pointer; user-select:none;">분류 ${getProfitSortIcon('category', 'name')}</th>
              <th class="text-right" data-profit-sort="category" data-sort-key="count" style="cursor:pointer; user-select:none;">품목수 ${getProfitSortIcon('category', 'count')}</th>
              <th class="text-right" data-profit-sort="category" data-sort-key="cost" style="cursor:pointer; user-select:none;">매입 총액 ${getProfitSortIcon('category', 'cost')}</th>
              <th class="text-right" data-profit-sort="category" data-sort-key="revenue" style="cursor:pointer; user-select:none;">매출 총액 (예상) ${getProfitSortIcon('category', 'revenue')}</th>
              <th class="text-right" data-profit-sort="category" data-sort-key="profit" style="cursor:pointer; user-select:none;">이익 ${getProfitSortIcon('category', 'profit')}</th>
              <th class="text-right" data-profit-sort="category" data-sort-key="rate" style="cursor:pointer; user-select:none;">이익률 ${getProfitSortIcon('category', 'rate')}</th>
            </tr>
          </thead>
          <tbody>
            ${sortedCategoryData.map(c => `
              <tr>
                <td><strong>${c.name}</strong></td>
                <td class="text-right">${c.count}개</td>
                <td class="text-right">₩${c.cost.toLocaleString('ko-KR')}</td>
                <td class="text-right">₩${c.revenue.toLocaleString('ko-KR')}</td>
                <td class="text-right" style="font-weight:700; color:${c.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${c.profit >= 0 ? '+' : ''}₩${c.profit.toLocaleString('ko-KR')}
                </td>
                <td class="text-right" style="font-weight:700; color:${parseFloat(c.rate) >= 20 ? 'var(--success)' : parseFloat(c.rate) >= 10 ? 'var(--warning)' : 'var(--danger)'};">
                  ${c.rate}%
                </td>
              </tr>
            `).join('')}
            ${sortedCategoryData.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">분류 데이터가 없습니다</td></tr>' : ''}
          </tbody>
          <tfoot>
            <tr style="font-weight:700; background:var(--bg-card);">
              <td>합계</td>
              <td class="text-right">${inventoryAnalysis.length}개</td>
              <td class="text-right">₩${totalCost.toLocaleString('ko-KR')}</td>
              <td class="text-right">₩${totalRevenue.toLocaleString('ko-KR')}</td>
              <td class="text-right" style="color:${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                ${totalProfit >= 0 ? '+' : ''}₩${totalProfit.toLocaleString('ko-KR')}
              </td>
              <td class="text-right">${avgProfitRate}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- ━━━ 5. 전체 품목 이익률 상세 ━━━ -->
    <div class="card" style="margin-top:16px;">
      <div class="card-title">📦 품목별 이익률 상세 (${inventoryAnalysis.length}개)</div>
      <div style="padding:0 16px 12px; font-size:11px; color:var(--text-muted);">헤더를 클릭하면 원하는 기준으로 바로 정렬됩니다.</div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th data-profit-sort="item" data-sort-key="name" style="cursor:pointer; user-select:none;">품목명 ${getProfitSortIcon('item', 'name')}</th>
              <th data-profit-sort="item" data-sort-key="category" style="cursor:pointer; user-select:none;">분류 ${getProfitSortIcon('item', 'category')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="qty" style="cursor:pointer; user-select:none;">수량 ${getProfitSortIcon('item', 'qty')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="costPrice" style="cursor:pointer; user-select:none;">매입가 ${getProfitSortIcon('item', 'costPrice')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="salePrice" style="cursor:pointer; user-select:none;">판매가 ${getProfitSortIcon('item', 'salePrice')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="perUnitProfit" style="cursor:pointer; user-select:none;">개당 이익 ${getProfitSortIcon('item', 'perUnitProfit')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="profitRate" style="cursor:pointer; user-select:none;">이익률(%) ${getProfitSortIcon('item', 'profitRate')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="marginRate" style="cursor:pointer; user-select:none;">마진율(%) ${getProfitSortIcon('item', 'marginRate')}</th>
              <th class="text-right" data-profit-sort="item" data-sort-key="profit" style="cursor:pointer; user-select:none;">총 이익 ${getProfitSortIcon('item', 'profit')}</th>
            </tr>
          </thead>
          <tbody>
            ${sortedInventoryAnalysis.map((d, i) => {
              const perUnitProfit = d.salePrice - d.costPrice;
              return `
              <tr>
                <td class="col-num">${i + 1}</td>
                <td>
                  <strong>${d.name}</strong>
                  ${!d.hasRealSalePrice ? '<span style="font-size:10px; color:var(--warning); margin-left:3px;">추정</span>' : ''}
                </td>
                <td style="font-size:12px; color:var(--text-muted);">${d.category || '-'}</td>
                <td class="text-right">${d.qty.toLocaleString('ko-KR')}</td>
                <td class="text-right">₩${d.costPrice.toLocaleString('ko-KR')}</td>
                <td class="text-right">₩${d.salePrice.toLocaleString('ko-KR')}</td>
                <td class="text-right" style="color:${perUnitProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${perUnitProfit >= 0 ? '+' : ''}₩${perUnitProfit.toLocaleString('ko-KR')}
                </td>
                <td class="text-right" style="font-weight:600; color:${d.profitRate >= 20 ? 'var(--success)' : d.profitRate >= 10 ? 'var(--warning)' : 'var(--danger)'};">
                  ${d.profitRate.toFixed(1)}%
                </td>
                <td class="text-right" style="color:var(--text-muted);">${d.marginRate.toFixed(1)}%</td>
                <td class="text-right" style="font-weight:700; color:${d.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">
                  ${d.profit >= 0 ? '+' : ''}₩${d.profit.toLocaleString('ko-KR')}
                </td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 회계 용어 설명 (교육적 목적) -->
    <div style="margin-top:20px; padding:16px; border:1px solid var(--border); border-radius:8px; font-size:12px; color:var(--text-muted);">
      <strong>📖 용어 설명</strong><br/>
      • <strong>이익률(%)</strong> = (판매가 - 매입가) ÷ 판매가 × 100 → "팔 때 얼마나 남는지" (세무서·은행 기준)<br/>
      • <strong>마진율(%)</strong> = (판매가 - 매입가) ÷ 매입가 × 100 → "원가 대비 얼마나 올려 파는지" (상인 기준)<br/>
      • <strong style="color:var(--warning);">추정</strong> 표시 = 판매가를 입력하지 않아 매입가 +20%로 추정한 품목<br/>
      • 재고 현황에서 <strong>판매단가</strong>를 입력하면 정확한 분석이 가능합니다.
    </div>
  `;

  container.querySelectorAll('[data-profit-sort]').forEach(header => {
    header.addEventListener('click', () => {
      toggleProfitSort(header.dataset.profitSort, header.dataset.sortKey);
      renderProfitPage(container, navigateTo);
    });
  });
}
