/**
 * page-costing.js - 원가 계산 (FIFO / 이동평균법)
 * 역할: 매입 원가를 자동 계산하여 정확한 수익성 분석 지원
 * 왜 필수? → 원가를 모르면 마진을 모르고, 마진을 모르면 경영을 못함
 */

import { getState, setState } from './store.js';
import { downloadExcel } from './excel.js';
import { showToast } from './toast.js';

const DEFAULT_COST_SORT = { key: 'profit', direction: 'desc' };
const COST_TEXT_SORT_KEYS = new Set(['itemName', 'itemCode']);

let costingSortState = { ...DEFAULT_COST_SORT };

function getCostDefaultDirection(key) {
  return COST_TEXT_SORT_KEYS.has(key) ? 'asc' : 'desc';
}

function toggleCostSort(key) {
  if (costingSortState.key === key) {
    costingSortState = {
      key,
      direction: costingSortState.direction === 'desc' ? 'asc' : 'desc',
    };
    return;
  }

  costingSortState = {
    key,
    direction: getCostDefaultDirection(key),
  };
}

function getCostSortIcon(key) {
  if (costingSortState.key !== key) {
    return '<span style="margin-left:4px; color:var(--text-muted); font-size:10px;">↕</span>';
  }

  return `<span style="margin-left:4px; color:var(--accent); font-size:10px;">${costingSortState.direction === 'desc' ? '▼' : '▲'}</span>`;
}

function getCostSortValue(row, key) {
  switch (key) {
    case 'itemName': return row.itemName || '';
    case 'itemCode': return row.itemCode || '';
    case 'qty': return row.qty;
    case 'unitCost': return row.unitCost;
    case 'totalCost': return row.totalCost;
    case 'sellPrice': return row.sellPrice;
    case 'marketValue': return row.marketValue;
    case 'profit': return row.profit;
    case 'margin': return row.marketValue > 0 ? ((row.profit / row.marketValue) * 100) : 0;
    default: return row.profit;
  }
}

function compareCostValues(a, b, direction) {
  const dir = direction === 'desc' ? -1 : 1;

  if (typeof a === 'string' || typeof b === 'string') {
    return String(a || '').localeCompare(String(b || ''), 'ko') * dir;
  }

  return ((Number(a) || 0) - (Number(b) || 0)) * dir;
}

function sortCostRows(rows) {
  return [...rows].sort((a, b) => {
    const primary = compareCostValues(
      getCostSortValue(a, costingSortState.key),
      getCostSortValue(b, costingSortState.key),
      costingSortState.direction
    );

    if (primary !== 0) return primary;

    return String(a.itemName || '').localeCompare(String(b.itemName || ''), 'ko');
  });
}

export function renderCostingPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  // 원가 계산 방식 (기본: 이동평균법)
  const costMethod = state.costMethod || 'weighted-avg';

  // 원가 계산 실행
  const costData = calculateCosts(items, transactions, costMethod);
  const sortedCostData = sortCostRows(costData);

  // 전체 요약
  const totalCost = costData.reduce((s, r) => s + r.totalCost, 0);
  const totalMarket = costData.reduce((s, r) => s + r.marketValue, 0);
  const totalProfit = totalMarket - totalCost;
  const avgMargin = totalMarket > 0 ? ((totalProfit / totalMarket) * 100).toFixed(1) : '-';

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💰</span> 원가 분석</h1>
        <div class="page-desc">매입 원가를 자동 계산하고 수익성을 분석합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-cost-export">📥 원가표 내보내기</button>
      </div>
    </div>

    <!-- 원가 계산 방식 선택 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <label class="form-label" style="margin:0; font-weight:600;">원가 계산 방식:</label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="weighted-avg" ${costMethod === 'weighted-avg' ? 'checked' : ''} />
          이동평균법 <span style="color:var(--text-muted); font-size:11px;">(권장)</span>
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="fifo" ${costMethod === 'fifo' ? 'checked' : ''} />
          선입선출법 (FIFO)
        </label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="latest" ${costMethod === 'latest' ? 'checked' : ''} />
          최종매입원가법
        </label>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card">
        <div class="stat-label">총 매입원가</div>
        <div class="stat-value">${totalCost > 0 ? '₩' + totalCost.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">시가 환산액</div>
        <div class="stat-value">${totalMarket > 0 ? '₩' + totalMarket.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 마진</div>
        <div class="stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}">${totalProfit !== 0 ? '₩' + totalProfit.toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 마진율</div>
        <div class="stat-value text-accent">${avgMargin}%</div>
      </div>
    </div>

    <!-- 원가 테이블 -->
    <div class="card card-flush">
      <div style="padding:12px 16px; border-bottom:1px solid var(--border); background:var(--bg-card);">
        <strong>💰 품목별 원가 분석</strong>
        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">(${costData.length}개 품목)</span>
      </div>
      <div style="padding:0 16px 12px; font-size:11px; color:var(--text-muted);">헤더를 클릭하면 품목명·금액·마진율 기준으로 정렬됩니다.</div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th data-cost-sort="itemName" style="cursor:pointer; user-select:none;">품목명 ${getCostSortIcon('itemName')}</th>
              <th data-cost-sort="itemCode" style="cursor:pointer; user-select:none;">코드 ${getCostSortIcon('itemCode')}</th>
              <th class="text-right" data-cost-sort="qty" style="cursor:pointer; user-select:none;">재고수량 ${getCostSortIcon('qty')}</th>
              <th class="text-right" data-cost-sort="unitCost" style="cursor:pointer; user-select:none;">단위원가 ${getCostSortIcon('unitCost')}</th>
              <th class="text-right" data-cost-sort="totalCost" style="cursor:pointer; user-select:none;">총 원가 ${getCostSortIcon('totalCost')}</th>
              <th class="text-right" data-cost-sort="sellPrice" style="cursor:pointer; user-select:none;">판매단가 ${getCostSortIcon('sellPrice')}</th>
              <th class="text-right" data-cost-sort="marketValue" style="cursor:pointer; user-select:none;">시가환산 ${getCostSortIcon('marketValue')}</th>
              <th class="text-right" data-cost-sort="profit" style="cursor:pointer; user-select:none;">예상이익 ${getCostSortIcon('profit')}</th>
              <th class="text-right" data-cost-sort="margin" style="cursor:pointer; user-select:none;">마진율 ${getCostSortIcon('margin')}</th>
            </tr>
          </thead>
          <tbody>
            ${sortedCostData.map((r, i) => {
              const margin = r.marketValue > 0 ? ((r.profit / r.marketValue) * 100).toFixed(1) : '-';
              return `
                <tr class="${parseFloat(margin) < 0 ? 'row-danger' : parseFloat(margin) < 10 ? 'row-warning' : ''}">
                  <td class="col-num">${i + 1}</td>
                  <td><strong>${r.itemName}</strong></td>
                  <td style="color:var(--text-muted); font-size:12px;">${r.itemCode || '-'}</td>
                  <td class="text-right">${r.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">₩${r.unitCost.toLocaleString('ko-KR')}</td>
                  <td class="text-right">₩${r.totalCost.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${r.sellPrice > 0 ? '₩' + r.sellPrice.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right">${r.marketValue > 0 ? '₩' + r.marketValue.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right ${r.profit >= 0 ? 'type-in' : 'type-out'}">${r.profit !== 0 ? '₩' + r.profit.toLocaleString('ko-KR') : '-'}</td>
                  <td class="text-right" style="font-weight:600;">${margin}%</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // 원가 방식 변경
  container.querySelectorAll('input[name="cost-method"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      setState({ costMethod: e.target.value });
      renderCostingPage(container, navigateTo);
    });
  });

  container.querySelectorAll('[data-cost-sort]').forEach(header => {
    header.addEventListener('click', () => {
      toggleCostSort(header.dataset.costSort);
      renderCostingPage(container, navigateTo);
    });
  });

  // 내보내기
  container.querySelector('#btn-cost-export').addEventListener('click', () => {
    if (costData.length === 0) { showToast('데이터가 없습니다.', 'warning'); return; }
    const data = sortedCostData.map(r => ({
      '품목명': r.itemName,
      '코드': r.itemCode || '',
      '재고수량': r.qty,
      '단위원가': r.unitCost,
      '총원가': r.totalCost,
      '판매단가': r.sellPrice,
      '시가환산': r.marketValue,
      '예상이익': r.profit,
      '마진율(%)': r.marketValue > 0 ? ((r.profit / r.marketValue) * 100).toFixed(1) : 0,
    }));
    downloadExcel(data, `원가분석_${new Date().toISOString().split('T')[0]}`);
    showToast('원가표를 내보냈습니다.', 'success');
  });
}

/**
 * 원가 계산 로직
 * 이동평균법: 기존 단가 그대로 사용 (매입 시점 평균)
 * FIFO: 가장 오래된 매입 단가부터 적용
 * 최종매입원가법: 가장 최근 매입 단가 적용
 */
function calculateCosts(items, transactions, method) {
  return items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const sellPrice = parseFloat(item.sellPrice) || unitPrice;

    // 해당 품목의 입고 거래
    const inTx = transactions
      .filter(tx => tx.type === 'in' && tx.itemName === item.itemName)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let unitCost;

    switch (method) {
      case 'fifo':
        // FIFO: 가장 오래된 매입 단가 (첫 입고)
        unitCost = inTx.length > 0 ? (parseFloat(inTx[0].unitPrice) || unitPrice) : unitPrice;
        break;
      case 'latest':
        // 최종매입원가: 가장 최근 입고 단가
        unitCost = inTx.length > 0 ? (parseFloat(inTx[inTx.length - 1].unitPrice) || unitPrice) : unitPrice;
        break;
      case 'weighted-avg':
      default:
        // 이동평균: 전체 입고 가중평균 (없으면 현재 단가)
        if (inTx.length > 0) {
          let totalQty = 0, totalVal = 0;
          inTx.forEach(tx => {
            const txQty = parseFloat(tx.quantity) || 0;
            const txPrice = parseFloat(tx.unitPrice) || unitPrice;
            totalQty += txQty;
            totalVal += txQty * txPrice;
          });
          unitCost = totalQty > 0 ? Math.round(totalVal / totalQty) : unitPrice;
        } else {
          unitCost = unitPrice;
        }
        break;
    }

    // 왜 Math.round? → 원단위 반올림으로 소수점 제거 (한국 회계 기준)
    unitCost = Math.round(unitCost);
    const totalCost = Math.round(qty * unitCost);
    const marketValue = Math.round(qty * sellPrice);
    const profit = marketValue - totalCost;

    return {
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      qty,
      unitCost,
      totalCost,
      sellPrice: Math.round(sellPrice),
      marketValue,
      profit,
    };
  });
}
