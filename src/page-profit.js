import { getState } from './store.js';
import { getSalePrice } from './price-utils.js';
import { downloadExcel, downloadExcelSheets } from './excel.js';
import { generateTransactionPDF } from './pdf-generator.js';
import { showToast } from './toast.js';
import { destroyAllCharts, renderProfitTrendChart, renderVendorProfitChart } from './charts.js';
import { jsPDF } from 'jspdf';
import { applyKoreanFont } from './pdf-font.js';
import { enableLocalReportSort } from './report-local-sort.js';

export function renderProfitPage(container, navigateTo) {
  destroyAllCharts();

  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const vendorMaster = state.vendorMaster || [];

  const periodPrefs = readProfitPeriodPrefs();
  const fallbackFrom = toDateKey(addDays(new Date(), -30));
  const fallbackTo = toDateKey(new Date());
  let periodFrom = isValidDateKey(periodPrefs.from) ? periodPrefs.from : fallbackFrom;
  let periodTo = isValidDateKey(periodPrefs.to) ? periodPrefs.to : fallbackTo;
  if (periodFrom > periodTo) {
    const tmp = periodFrom;
    periodFrom = periodTo;
    periodTo = tmp;
  }

  const viewPrefs = readProfitViewPrefs();
  const activeTab = viewPrefs.tab === 'vendors' ? 'vendors' : 'items';
  const vendorSort = viewPrefs.vendorSort || 'profit';
  const vendorLimit = Number(viewPrefs.vendorLimit) || 8;
  const vendorKeyword = String(viewPrefs.vendorKeyword || '').trim();
  const vendorLossOnly = viewPrefs.vendorLossOnly === true;
  const vendorType = viewPrefs.vendorType || 'all';

  const rawRows = items
    .map((item) => {
      const quantity = toNumber(item.quantity);
      const unitCost = toNumber(item.unitPrice || item.unitCost);
      const salePrice = toNumber(getSalePrice(item));
      const hasSalePrice = toNumber(item.salePrice) > 0;
      const totalCost = Math.round(quantity * unitCost);
      const totalRevenue = Math.round(quantity * salePrice);
      const profit = totalRevenue - totalCost;
      const profitRate = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;   // 매출총이익률
      const marginRate = totalCost > 0 ? (profit / totalCost) * 100 : 0;         // 마진율
      const costRatio = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0; // 매출원가율

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
        costRatio,
      };
    })
    .filter((row) => row.quantity > 0 || row.totalCost > 0);

  // 동일 품목명 또는 동일 코드끼리 그룹핑
  const groupMap = new Map();
  rawRows.forEach((row) => {
    const key = row.code ? row.code : row.name;
    if (!groupMap.has(key)) {
      groupMap.set(key, { ...row });
    } else {
      const g = groupMap.get(key);
      const combinedQty = g.quantity + row.quantity;
      const combinedCost = g.totalCost + row.totalCost;
      const combinedRevenue = g.totalRevenue + row.totalRevenue;
      g.quantity = combinedQty;
      g.totalCost = combinedCost;
      g.totalRevenue = combinedRevenue;
      g.profit = combinedRevenue - combinedCost;
      g.unitCost = combinedQty > 0 ? Math.round(combinedCost / combinedQty) : 0;
      g.profitRate = combinedRevenue > 0 ? (g.profit / combinedRevenue) * 100 : 0;
      g.marginRate = combinedCost > 0 ? (g.profit / combinedCost) * 100 : 0;
      g.costRatio = combinedRevenue > 0 ? (combinedCost / combinedRevenue) * 100 : 0;
      g.hasSalePrice = g.hasSalePrice || row.hasSalePrice;
      if (!g.salePrice && row.salePrice) g.salePrice = row.salePrice;
    }
  });
  const rows = Array.from(groupMap.values());

  const sortedByProfit = [...rows].sort((a, b) => b.profit - a.profit);
  const topProfit = sortedByProfit.slice(0, 5);
  const riskRows = [...rows]
    .filter((row) => row.hasSalePrice)
    .sort((a, b) => a.profitRate - b.profitRate)
    .slice(0, 5);

  const totalCost = sumBy(rows, (row) => row.totalCost);
  const totalRevenue = sumBy(rows, (row) => row.totalRevenue);
  const totalProfit = totalRevenue - totalCost;
  const avgProfitRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;  // 매출총이익률
  const avgMarginRate = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;         // 마진율(수익률)
  const totalCostRatio = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;    // 매출원가율

  const salePriceCount = rows.filter((row) => row.hasSalePrice).length;
  const salePriceRate = rows.length > 0 ? (salePriceCount / rows.length) * 100 : 0;
  const lowMarginCount = rows.filter((row) => row.hasSalePrice && row.profitRate < 10).length;
  const lossCount = rows.filter((row) => row.profit < 0).length;

  const categorySummary = summarizeByCategory(rows).slice(0, 5);
  const periodTransactions = transactions.filter((tx) => {
    const dateKey = String(tx.date || '');
    return dateKey >= periodFrom && dateKey <= periodTo;
  });
  const periodSummary = buildPeriodSummary(periodTransactions, items);
  const monthlySeries = buildMonthlySeries(periodTransactions, items);
  const monthlySummary = getCurrentMonthSummary(transactions);

  const vendorTransactions = filterTransactionsByType(periodTransactions, vendorType);
  const vendorSummary = buildVendorSummary(vendorTransactions, items);
  const vendorSummarySorted = sortVendorSummary(vendorSummary, vendorSort);
  const vendorFiltered = filterVendorRows(vendorSummarySorted, vendorKeyword, vendorLossOnly);
  const vendorChartRows = vendorFiltered.slice(0, vendorLimit);
  const vendorTotalCount = new Set([
    ...vendorMaster.map((v) => v.name).filter(Boolean),
    ...vendorSummary.map((v) => v.name),
  ]).size;
  const vendorActiveCount = vendorSummary.length;
  const vendorInactiveCount = Math.max(vendorTotalCount - vendorActiveCount, 0);
  const topVendor = vendorFiltered[0];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💹</span> 손익 분석</h1>
        <div class="page-desc">재고 기준 예상 손익과 기간 거래 손익을 한 화면에서 확인합니다.</div>
      </div>
      <div class="page-actions" style="gap:8px;">
        <div class="export-menu" id="profit-export-menu">
          <button class="btn btn-outline" id="btn-profit-export-toggle">내보내기</button>
          <div class="export-menu-panel" id="profit-export-panel">
            <button class="btn btn-ghost btn-sm" data-profit-export="summary">손익 요약 엑셀</button>
            <button class="btn btn-ghost btn-sm" data-profit-export="items">품목 손익 엑셀</button>
            <button class="btn btn-ghost btn-sm" data-profit-export="vendors">거래처 손익 엑셀</button>
            <button class="btn btn-ghost btn-sm" data-profit-export="transactions">기간 거래 PDF</button>
            <button class="btn btn-ghost btn-sm" data-profit-export="charts-xlsx">차트 데이터 엑셀</button>
            <button class="btn btn-ghost btn-sm" data-profit-export="charts-pdf">차트 PDF</button>
          </div>
        </div>
        <button class="btn btn-outline" id="btn-profit-go-inventory">재고 화면으로 이동</button>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:end;">
        <div style="display:flex; gap:8px; align-items:center;">
          <label class="form-label" style="margin:0;">기간</label>
          <input class="form-input" type="date" id="profit-from" value="${periodFrom}" />
          <span style="color:var(--text-muted);">~</span>
          <input class="form-input" type="date" id="profit-to" value="${periodTo}" />
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" data-profit-range="7">최근 7일</button>
          <button class="btn btn-outline btn-sm" data-profit-range="30">최근 30일</button>
          <button class="btn btn-outline btn-sm" data-profit-range="90">최근 90일</button>
          <button class="btn btn-outline btn-sm" data-profit-range="month">이번 달</button>
        </div>
      </div>
      <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:18px; font-size:13px; color:var(--text-muted);">
        <div>기간 매입 합계 <strong>${formatSignedMoney(periodSummary.totalIn)}</strong></div>
        <div>기간 매출 합계 <strong>${formatSignedMoney(periodSummary.totalOut)}</strong></div>
        <div>기간 손익 <strong style="color:${periodSummary.profit >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatSignedMoney(periodSummary.profit)}</strong></div>
      </div>
    </div>

    <div class="profit-chart-grid">
      <div class="card">
        <div class="chart-control-row">
          <div>
            <div class="card-title">기간 손익 흐름</div>
            <div class="chart-help-text">기간 내 매입/매출/손익 흐름을 한 번에 확인합니다.</div>
          </div>
          <div class="chart-control-inline">
            <button class="btn btn-ghost btn-sm" id="btn-profit-trend-download">차트 PNG</button>
          </div>
        </div>
        <div class="chart-canvas-lg">
          <canvas id="profit-trend-chart"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="chart-control-row">
          <div>
            <div class="card-title">거래처 손익 TOP</div>
            <div class="chart-help-text">기간 내 손익 기준 상위 거래처 흐름입니다.</div>
          </div>
          <div class="chart-control-inline">
            <button class="btn btn-ghost btn-sm" id="btn-profit-vendor-download">차트 PNG</button>
            <span class="chart-control-label">정렬 기준</span>
            <select class="filter-select chart-sort-select" id="profit-vendor-sort">
              <option value="profit" ${vendorSort === 'profit' ? 'selected' : ''}>손익</option>
              <option value="out" ${vendorSort === 'out' ? 'selected' : ''}>매출</option>
              <option value="in" ${vendorSort === 'in' ? 'selected' : ''}>매입</option>
            </select>
            <span class="chart-control-label">표시 수</span>
            <select class="filter-select chart-sort-select" id="profit-vendor-limit">
              <option value="5" ${vendorLimit === 5 ? 'selected' : ''}>5곳</option>
              <option value="8" ${vendorLimit === 8 ? 'selected' : ''}>8곳</option>
              <option value="12" ${vendorLimit === 12 ? 'selected' : ''}>12곳</option>
            </select>
          </div>
        </div>
        <div class="chart-canvas-lg">
          <canvas id="profit-vendor-chart"></canvas>
        </div>
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
        <div class="stat-label">매출총이익률</div>
        <div class="stat-value ${avgProfitRate >= 0 ? 'text-success' : 'text-danger'}">${formatPercent(avgProfitRate)}</div>
        <div class="stat-change">(판매가-원가) / 판매가</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">매출원가율</div>
        <div class="stat-value ${totalCostRatio <= 80 ? 'text-success' : 'text-danger'}">${formatPercent(totalCostRatio)}</div>
        <div class="stat-change">원가 / 매출 · 수익률 ${formatPercent(avgMarginRate)}</div>
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

    <details class="card card-compact" style="margin-top:12px;">
      <summary style="cursor:pointer; font-weight:700; list-style:none;">
        📘 계산식 보기 (이익률/원가율 기준)
      </summary>
      <div style="margin-top:10px; font-size:13px; color:var(--text-secondary); line-height:1.8;">
        <div>총 예상 이익 = 총 예상 매출 - 총 원가</div>
        <div>매출총이익률 = (총 예상 이익 / 총 예상 매출) × 100</div>
        <div>매출원가율 = (총 원가 / 총 예상 매출) × 100</div>
        <div>수익률(마진) = (총 예상 이익 / 총 원가) × 100</div>
        <div>판매가 입력률 = (판매가 입력 품목 수 / 전체 품목 수) × 100</div>
        <div style="margin-top:8px; color:var(--text-muted);">
          판매가가 없는 품목은 손익 정확도가 낮아질 수 있어 보수적으로 해석하는 것을 권장합니다.
        </div>
      </div>
    </details>

    <div class="tabs">
      <button class="tab-btn ${activeTab === 'items' ? 'active' : ''}" data-profit-tab="items">품목 손익</button>
      <button class="tab-btn ${activeTab === 'vendors' ? 'active' : ''}" data-profit-tab="vendors">거래처 손익</button>
    </div>

    <div class="profit-tab" id="profit-tab-items" style="display:${activeTab === 'items' ? 'block' : 'none'};">
      <div class="card" style="padding-bottom: 8px;">
        <div class="card-title">한눈에 보는 핵심 포인트</div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:14px;">
          <div style="border:1px solid var(--border); border-radius:10px; padding:12px;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">수익 상위 품목 TOP 5</div>
            ${renderQuickList(
              topProfit,
              (row, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:${
              i === topProfit.length - 1 ? 'none' : '1px solid var(--border-light)'
            }">
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(
                  row.name,
                )}</div>
                <div style="font-size:11px; color:var(--text-muted);">${formatPercent(row.profitRate)} · ${row.quantity.toLocaleString(
              'ko-KR',
            )}개</div>
              </div>
              <div style="font-size:12px; font-weight:700; color:var(--success);">${formatSignedMoney(row.profit)}</div>
            </div>
          `,
            )}
          </div>
          <div style="border:1px solid var(--border); border-radius:10px; padding:12px;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">주의 필요 품목 TOP 5</div>
            ${renderQuickList(
              riskRows,
              (row, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:${
              i === riskRows.length - 1 ? 'none' : '1px solid var(--border-light)'
            }">
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(
                  row.name,
                )}</div>
                <div style="font-size:11px; color:var(--text-muted);">개당 ${formatSignedMoney(
                  row.salePrice - row.unitCost,
                )}</div>
              </div>
              <div style="font-size:12px; font-weight:700; color:${
                row.profitRate < 10 ? 'var(--danger)' : 'var(--warning)'
              }">${formatPercent(row.profitRate)}</div>
            </div>
          `,
              '판매가가 입력된 품목이 없습니다.',
            )}
          </div>
          <div style="border:1px solid var(--border); border-radius:10px; padding:12px;">
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">카테고리 수익 TOP 5</div>
            ${renderQuickList(
              categorySummary,
              (category, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:6px 0; border-bottom:${
              i === categorySummary.length - 1 ? 'none' : '1px solid var(--border-light)'
            }">
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(
                  category.name,
                )}</div>
                <div style="font-size:11px; color:var(--text-muted);">${category.count}품목 · 이익률 ${formatPercent(
              category.rate,
            )}</div>
              </div>
              <div style="font-size:12px; font-weight:700; color:${
                category.profit >= 0 ? 'var(--success)' : 'var(--danger)'
              }">${formatSignedMoney(category.profit)}</div>
            </div>
          `,
              '카테고리 데이터가 없습니다.',
            )}
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
                <th class="text-right">매출총이익률</th>
                <th class="text-right">매출원가율</th>
                <th class="text-right">수익률(마진)</th>
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
                  <td class="text-right" style="color:${row.costRatio <= 80 ? 'var(--success)' : 'var(--danger)'};">${formatPercent(row.costRatio)}</td>
                  <td class="text-right" style="color:${row.marginRate >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatPercent(row.marginRate)}</td>
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
    </div>

    <div class="profit-tab" id="profit-tab-vendors" style="display:${activeTab === 'vendors' ? 'block' : 'none'};">
      <div class="card card-compact" style="margin-bottom:12px;">
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
          <input class="form-input" id="profit-vendor-keyword" placeholder="거래처 검색" value="${escapeHtmlAttr(vendorKeyword)}" />
          <select class="filter-select" id="profit-vendor-type">
            <option value="all" ${vendorType === 'all' ? 'selected' : ''}>전체 거래</option>
            <option value="in" ${vendorType === 'in' ? 'selected' : ''}>매입만</option>
            <option value="out" ${vendorType === 'out' ? 'selected' : ''}>매출만</option>
          </select>
          <label class="toggle-pill">
            <input type="checkbox" id="profit-vendor-loss" ${vendorLossOnly ? 'checked' : ''} />
            손실 거래처만
          </label>
          <button class="btn btn-ghost btn-sm" id="profit-vendor-reset">필터 초기화</button>
        </div>
      </div>
      <div class="card" style="padding-bottom: 8px;">
        <div class="card-title">거래처 손익 요약</div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
          <div class="stat-card">
            <div class="stat-label">기간 거래처</div>
            <div class="stat-value">${vendorActiveCount.toLocaleString('ko-KR')}곳</div>
            <div class="stat-change">거래 없음 ${vendorInactiveCount.toLocaleString('ko-KR')}곳</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">기간 매입 합계</div>
            <div class="stat-value text-accent">${formatMoney(periodSummary.totalIn)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">기간 매출 합계</div>
            <div class="stat-value text-success">${formatMoney(periodSummary.totalOut)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">기간 손익</div>
            <div class="stat-value ${periodSummary.profit >= 0 ? 'text-success' : 'text-danger'}">${formatSignedMoney(
              periodSummary.profit,
            )}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">최고 손익 거래처</div>
            <div class="stat-value">${topVendor ? escapeHtml(topVendor.name) : '-'}</div>
            <div class="stat-change">${topVendor ? formatSignedMoney(topVendor.profit) : '데이터 없음'}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">거래처별 손익 상세</div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>거래처</th>
                <th class="text-right">거래 수</th>
                <th class="text-right">매입</th>
                <th class="text-right">매출</th>
                <th class="text-right">손익</th>
                <th class="text-right">이익률</th>
                <th class="text-right">마진율</th>
                <th class="text-right">최근 거래</th>
              </tr>
            </thead>
            <tbody>
              ${
                vendorFiltered.length === 0
                  ? `
                <tr>
                  <td colspan="9" style="text-align:center; color:var(--text-muted); padding:28px 0;">기간 내 거래처 손익 데이터가 없습니다.</td>
                </tr>
              `
                  : vendorFiltered
                      .map((row, index) => {
                        const tone = row.profit >= 0 ? 'var(--success)' : 'var(--danger)';
                        return `
                <tr>
                  <td class="col-num">${index + 1}</td>
                  <td>${escapeHtml(row.name)}</td>
                  <td class="text-right">${row.count.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${formatMoney(row.totalIn)}</td>
                  <td class="text-right">${formatMoney(row.totalOut)}</td>
                  <td class="text-right" style="font-weight:700; color:${tone};">${formatSignedMoney(row.profit)}</td>
                  <td class="text-right">${formatPercent(row.profitRate)}</td>
                  <td class="text-right">${formatPercent(row.marginRate)}</td>
                  <td class="text-right">${row.lastDate || '-'}</td>
                </tr>
              `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:0;">
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
        <div>
          <div style="font-size:12px; color:var(--text-muted);">이번 달 입·출고 손익(거래기준)</div>
          <div style="margin-top:6px; font-size:13px; line-height:1.7;">
            <div>매입: <strong>${formatMoney(monthlySummary.totalIn)}</strong></div>
            <div>매출: <strong>${formatMoney(monthlySummary.totalOut)}</strong></div>
            <div>거래 손익: <strong style="color:${
              monthlySummary.profit >= 0 ? 'var(--success)' : 'var(--danger)'
            }">${formatSignedMoney(monthlySummary.profit)}</strong></div>
          </div>
        </div>
        <div>
          <div style="font-size:12px; color:var(--text-muted);">해석 기준</div>
          <div style="margin-top:6px; font-size:12px; color:var(--text-secondary); line-height:1.7;">
            <div>상단의 <strong>계산식 보기</strong>에서 산식과 해석 기준을 확인할 수 있습니다.</div>
            <div>기간 손익은 거래 내역 기준, 품목 손익은 현재 재고 기준으로 계산됩니다.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-profit-go-inventory')?.addEventListener('click', () => navigateTo('inventory'));

  const fromInput = container.querySelector('#profit-from');
  const toInput = container.querySelector('#profit-to');
  const persistAndRefresh = () => {
    const nextFrom = fromInput?.value;
    const nextTo = toInput?.value;
    saveProfitPeriodPrefs({ from: nextFrom, to: nextTo });
    renderProfitPage(container, navigateTo);
  };
  fromInput?.addEventListener('change', persistAndRefresh);
  toInput?.addEventListener('change', persistAndRefresh);

  container.querySelectorAll('[data-profit-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.profitRange;
      const now = new Date();
      let from = null;
      let to = toDateKey(now);
      if (value === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        from = toDateKey(start);
      } else {
        const days = Number.parseInt(value, 10);
        from = toDateKey(addDays(now, -days + 1));
      }
      saveProfitPeriodPrefs({ from, to });
      renderProfitPage(container, navigateTo);
    });
  });

  container.querySelectorAll('[data-profit-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextTab = btn.dataset.profitTab;
      saveProfitViewPrefs({ tab: nextTab });
      renderProfitPage(container, navigateTo);
    });
  });

  const vendorKeywordInput = container.querySelector('#profit-vendor-keyword');
  const vendorTypeSelect = container.querySelector('#profit-vendor-type');
  const vendorLossInput = container.querySelector('#profit-vendor-loss');
  const vendorResetBtn = container.querySelector('#profit-vendor-reset');
  const updateVendorFilter = () => {
    saveProfitViewPrefs({
      vendorKeyword: vendorKeywordInput?.value || '',
      vendorType: vendorTypeSelect?.value || 'all',
      vendorLossOnly: !!vendorLossInput?.checked,
    });
    renderProfitPage(container, navigateTo);
  };
  vendorKeywordInput?.addEventListener('input', updateVendorFilter);
  vendorTypeSelect?.addEventListener('change', updateVendorFilter);
  vendorLossInput?.addEventListener('change', updateVendorFilter);
  vendorResetBtn?.addEventListener('click', () => {
    saveProfitViewPrefs({ vendorKeyword: '', vendorLossOnly: false, vendorType: 'all' });
    renderProfitPage(container, navigateTo);
  });

  const vendorSortSelect = container.querySelector('#profit-vendor-sort');
  const vendorLimitSelect = container.querySelector('#profit-vendor-limit');
  const updateVendorView = () => {
    saveProfitViewPrefs({
      vendorSort: vendorSortSelect?.value,
      vendorLimit: vendorLimitSelect?.value,
    });
    renderProfitPage(container, navigateTo);
  };
  vendorSortSelect?.addEventListener('change', updateVendorView);
  vendorLimitSelect?.addEventListener('change', updateVendorView);

  const exportMenu = container.querySelector('#profit-export-menu');
  const exportToggle = container.querySelector('#btn-profit-export-toggle');
  const exportPanel = container.querySelector('#profit-export-panel');
  const docClickHandler = (event) => {
    if (exportMenu && !exportMenu.contains(event.target)) {
      exportMenu.classList.remove('is-open');
      document.removeEventListener('click', docClickHandler);
    }
  };

  exportToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!exportMenu) return;
    const isOpen = exportMenu.classList.contains('is-open');
    if (isOpen) {
      exportMenu.classList.remove('is-open');
      document.removeEventListener('click', docClickHandler);
    } else {
      exportMenu.classList.add('is-open');
      document.addEventListener('click', docClickHandler);
    }
  });
  exportPanel?.addEventListener('click', (event) => event.stopPropagation());

  container.querySelectorAll('[data-profit-export]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.profitExport;
      const periodLabel = `${periodFrom}_${periodTo}`;
      try {
        if (type === 'summary') {
          const exportRows = [
            {
              기간: `${periodFrom} ~ ${periodTo}`,
              '기간 매입 합계': periodSummary.totalIn,
              '기간 매출 합계': periodSummary.totalOut,
              '기간 손익': periodSummary.profit,
              '총 예상 매출': totalRevenue,
              '총 원가': totalCost,
              '총 예상 이익': totalProfit,
              '평균 이익률(%)': Number(avgProfitRate.toFixed(2)),
              '마진율(%)': Number(avgMarginRate.toFixed(2)),
              '판매가 입력률(%)': Number(salePriceRate.toFixed(2)),
            },
          ];
          downloadExcel(exportRows, `손익요약_${periodLabel}`);
          showToast('손익 요약 엑셀을 내보냈습니다.', 'success');
        } else if (type === 'items') {
          const exportRows = sortedByProfit.map((row) => ({
            품목명: row.name,
            코드: row.code,
            분류: row.category,
            수량: row.quantity,
            원가: row.unitCost,
            판매가: row.salePrice,
            '총 원가': row.totalCost,
            '총 매출': row.totalRevenue,
            손익: row.profit,
            '이익률(%)': Number(row.profitRate.toFixed(2)),
            '마진율(%)': Number(row.marginRate.toFixed(2)),
          }));
          if (exportRows.length === 0) {
            showToast('내보낼 품목 손익 데이터가 없습니다.', 'warning');
            return;
          }
          downloadExcel(exportRows, `품목손익_${periodLabel}`);
          showToast('품목 손익 엑셀을 내보냈습니다.', 'success');
        } else if (type === 'vendors') {
          const exportRows = vendorFiltered.map((row) => ({
            거래처: row.name,
            '거래 수': row.count,
            매입: row.totalIn,
            매출: row.totalOut,
            손익: row.profit,
            '이익률(%)': Number(row.profitRate.toFixed(2)),
            '마진율(%)': Number(row.marginRate.toFixed(2)),
            '최근 거래일': row.lastDate || '-',
          }));
          if (exportRows.length === 0) {
            showToast('내보낼 거래처 손익 데이터가 없습니다.', 'warning');
            return;
          }
          downloadExcel(exportRows, `거래처손익_${periodLabel}`);
          showToast('거래처 손익 엑셀을 내보냈습니다.', 'success');
        } else if (type === 'transactions') {
          if (periodTransactions.length === 0) {
            showToast('기간 내 거래가 없어 PDF를 만들 수 없습니다.', 'warning');
            return;
          }
          generateTransactionPDF(periodTransactions, '손익 분석 거래', `${periodFrom}~${periodTo}`);
        } else if (type === 'charts-xlsx') {
          const chartSheets = [
            {
              name: '기간손익',
              rows: monthlySeries.map((row) => ({
                기간: row.label,
                매입: row.totalIn,
                매출: row.totalOut,
                손익: row.profit,
              })),
            },
            {
              name: '거래처손익',
              rows: vendorFiltered.map((row) => ({
                거래처: row.name,
                매입: row.totalIn,
                매출: row.totalOut,
                손익: row.profit,
                '이익률(%)': Number(row.profitRate.toFixed(2)),
              })),
            },
          ];
          await downloadExcelSheets(chartSheets, `손익차트_${periodLabel}`);
        } else if (type === 'charts-pdf') {
          await downloadChartsPdf(periodFrom, periodTo);
        }
      } catch (err) {
        showToast(err.message || '내보내기에 실패했습니다.', 'error');
      }
    });
  });

  container.querySelector('#btn-profit-trend-download')?.addEventListener('click', () => {
    downloadCanvasImage('profit-trend-chart', `손익흐름_${periodFrom}_${periodTo}`);
  });
  container.querySelector('#btn-profit-vendor-download')?.addEventListener('click', () => {
    downloadCanvasImage('profit-vendor-chart', `거래처손익_${periodFrom}_${periodTo}`);
  });

  renderProfitTrendChart('profit-trend-chart', monthlySeries);
  renderVendorProfitChart('profit-vendor-chart', vendorChartRows);

  container.querySelectorAll('.data-table').forEach((table) => {
    table.dataset.autoSort = 'off';
  });
  enableLocalReportSort(container);
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

function buildPeriodSummary(transactions, items) {
  let totalIn = 0;
  let totalOut = 0;
  transactions.forEach((tx) => {
    const amount = getTransactionAmount(tx, items);
    if (tx.type === 'in') totalIn += amount;
    if (tx.type === 'out') totalOut += amount;
  });
  return {
    totalIn: Math.round(totalIn),
    totalOut: Math.round(totalOut),
    profit: Math.round(totalOut - totalIn),
  };
}

function buildMonthlySeries(transactions, items) {
  const map = new Map();
  transactions.forEach((tx) => {
    if (!tx.date) return;
    const key = String(tx.date).slice(0, 7);
    if (!map.has(key)) map.set(key, { totalIn: 0, totalOut: 0 });
    const bucket = map.get(key);
    const amount = getTransactionAmount(tx, items);
    if (tx.type === 'in') bucket.totalIn += amount;
    if (tx.type === 'out') bucket.totalOut += amount;
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, row]) => ({
      label: `${key.replace('-', '년 ')}월`,
      totalIn: Math.round(row.totalIn),
      totalOut: Math.round(row.totalOut),
      profit: Math.round(row.totalOut - row.totalIn),
    }));
}

function buildVendorSummary(transactions, items) {
  const map = new Map();
  transactions.forEach((tx) => {
    const name = String(tx.vendor || '').trim() || '미지정';
    const current = map.get(name) || { name, count: 0, totalIn: 0, totalOut: 0, lastDate: '' };
    current.count += 1;
    if (String(tx.date || '') > current.lastDate) current.lastDate = String(tx.date || '');
    const amount = getTransactionAmount(tx, items);
    if (tx.type === 'in') current.totalIn += amount;
    if (tx.type === 'out') current.totalOut += amount;
    map.set(name, current);
  });

  return Array.from(map.values()).map((entry) => {
    const profit = entry.totalOut - entry.totalIn;
    const profitRate = entry.totalOut > 0 ? (profit / entry.totalOut) * 100 : 0;
    const marginRate = entry.totalIn > 0 ? (profit / entry.totalIn) * 100 : 0;
    return {
      ...entry,
      totalIn: Math.round(entry.totalIn),
      totalOut: Math.round(entry.totalOut),
      profit: Math.round(profit),
      profitRate,
      marginRate,
    };
  });
}

function sortVendorSummary(rows, sortKey) {
  const list = [...rows];
  if (sortKey === 'out') return list.sort((a, b) => b.totalOut - a.totalOut);
  if (sortKey === 'in') return list.sort((a, b) => b.totalIn - a.totalIn);
  return list.sort((a, b) => b.profit - a.profit);
}

function filterTransactionsByType(transactions, type) {
  if (type === 'in' || type === 'out') {
    return transactions.filter((tx) => tx.type === type);
  }
  return transactions;
}

function filterVendorRows(rows, keyword, lossOnly) {
  let list = [...rows];
  if (keyword) {
    const lowered = keyword.toLowerCase();
    list = list.filter((row) => row.name.toLowerCase().includes(lowered));
  }
  if (lossOnly) {
    list = list.filter((row) => row.profit < 0);
  }
  return list;
}

function getTransactionAmount(tx, items) {
  const qty = toNumber(tx.quantity);
  const direct = toNumber(tx.price ?? tx.unitPrice ?? tx.unitCost ?? 0);
  if (direct > 0) return qty * direct;
  const item = items.find((i) => i.itemName === tx.itemName || (i.itemCode && i.itemCode === tx.itemCode));
  if (!item) return 0;
  const fallbackPrice = tx.type === 'out' ? toNumber(getSalePrice(item)) : toNumber(item.unitPrice || item.unitCost);
  return qty * fallbackPrice;
}

function readProfitPeriodPrefs() {
  try {
    const raw = localStorage.getItem('invex_profit_period_v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveProfitPeriodPrefs(next) {
  localStorage.setItem('invex_profit_period_v1', JSON.stringify(next));
}

function readProfitViewPrefs() {
  try {
    const raw = localStorage.getItem('invex_profit_view_v1');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveProfitViewPrefs(next) {
  const current = readProfitViewPrefs();
  const merged = { ...current, ...next };
  localStorage.setItem('invex_profit_view_v1', JSON.stringify(merged));
}

function addDays(baseDate, delta) {
  const copy = new Date(baseDate);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function toDateKey(value) {
  return new Date(value).toISOString().split('T')[0];
}

function isValidDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

async function downloadChartsPdf(periodFrom, periodTo) {
  const trendCanvas = document.getElementById('profit-trend-chart');
  const vendorCanvas = document.getElementById('profit-vendor-chart');
  if (!trendCanvas || !vendorCanvas) {
    showToast('차트를 찾을 수 없습니다.', 'warning');
    return;
  }

  const doc = new jsPDF('p', 'pt', 'a4');
  await applyKoreanFont(doc);

  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 50;

  doc.setFontSize(14);
  doc.text(`손익 분석 차트 (${periodFrom}~${periodTo})`, margin, 30);

  const addChart = (canvas, title) => {
    const img = canvas.toDataURL('image/png', 1.0);
    const width = pageWidth - margin * 2;
    const ratio = canvas.height / canvas.width || 0.6;
    const height = Math.max(160, width * ratio);
    if (y + height + 40 > pageHeight) {
      doc.addPage();
      y = 50;
    }
    doc.setFontSize(11);
    doc.text(title, margin, y);
    y += 16;
    doc.addImage(img, 'PNG', margin, y, width, height);
    y += height + 24;
  };

  addChart(trendCanvas, '기간 손익 흐름');
  addChart(vendorCanvas, '거래처 손익 TOP');

  doc.save(`손익차트_${periodFrom}_${periodTo}.pdf`);
}

function downloadCanvasImage(canvasId, fileName) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    showToast('차트를 찾을 수 없습니다.', 'warning');
    return;
  }
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `${fileName}.png`;
    link.click();
  } catch {
    showToast('차트 이미지를 저장하지 못했습니다.', 'error');
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(text) {
  return escapeHtml(text).replace(/`/g, '&#96;');
}
