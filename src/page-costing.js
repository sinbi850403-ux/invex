/**
 * page-costing.js - 원가 분석 (FIFO / 이동평균법)
 * 역할: 매입 원가를 자동 계산하여 정확한 수익성 분석을 지원
 */

import { getState, setState } from './store.js';
import { downloadExcel } from './excel.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';

const COSTING_TEXT_COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const COSTING_SORT_FIELDS = [
  { key: 'itemName', label: '품목명' },
  { key: 'itemCode', label: '코드' },
  { key: 'qty', label: '재고수량', numeric: true, align: 'text-right' },
  { key: 'unitCost', label: '단위원가', numeric: true, align: 'text-right' },
  { key: 'totalCost', label: '총 원가', numeric: true, align: 'text-right' },
  { key: 'sellPrice', label: '판매단가', numeric: true, align: 'text-right' },
  { key: 'marketValue', label: '시가환산', numeric: true, align: 'text-right' },
  { key: 'profit', label: '예상이익', numeric: true, align: 'text-right' },
  { key: 'marginRate', label: '매출이익률', numeric: true, align: 'text-right' },
];
const COSTING_SORT_FIELD_MAP = Object.fromEntries(COSTING_SORT_FIELDS.map(field => [field.key, field]));
let costingSortState = { key: 'totalCost', direction: 'desc' };
const expandedCostGroups = new Set();

export function renderCostingPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const costMethod = state.costMethod || 'weighted-avg';
  const costData = calculateCosts(items, transactions, costMethod);

  const totalCost = costData.reduce((sum, row) => sum + row.totalCost, 0);
  const totalMarket = costData.reduce((sum, row) => sum + row.marketValue, 0);
  const totalProfit = totalMarket - totalCost;
  const avgMargin = totalMarket > 0 ? ((totalProfit / totalMarket) * 100).toFixed(1) : '-';
  const sortedCostData = sortCostRows(costData, costingSortState);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">원가 분석</h1>
        <div class="page-desc">매입 원가와 예상 마진을 한눈에 정리합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-cost-export">📊 원가표 내보내기</button>
      </div>
    </div>

    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
        <label class="form-label" style="margin:0; font-weight:600;">원가 계산 방식:</label>
        <label style="display:flex; align-items:center; gap:4px; cursor:pointer; font-size:13px;">
          <input type="radio" name="cost-method" value="weighted-avg" ${costMethod === 'weighted-avg' ? 'checked' : ''} />
          총평균법(가중평균) <span style="color:var(--text-muted); font-size:11px;">(권장)</span>
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

    <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="stat-card">
        <div class="stat-label">총 매입원가</div>
        <div class="stat-value">${formatCostMoney(totalCost)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">시가 환산액</div>
        <div class="stat-value">${formatCostMoney(totalMarket)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 마진</div>
        <div class="stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}">${formatSignedCostMoney(totalProfit)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 매출이익률</div>
        <div class="stat-value text-accent">${avgMargin === '-' ? '-' : `${avgMargin}%`}</div>
      </div>
    </div>

    <details class="card card-compact" style="margin-top:12px;">
      <summary style="cursor:pointer; font-weight:700; list-style:none;">
        📘 계산식 보기 (이익률/원가 계산 기준)
      </summary>
      <div style="margin-top:10px; font-size:13px; color:var(--text-secondary); line-height:1.8;">
        <div>총 매입원가 = Σ(현재수량 × 단위원가)</div>
        <div>시가 환산액 = Σ(현재수량 × 판매가)</div>
        <div>예상 마진 = 시가 환산액 - 총 매입원가</div>
        <div>평균 매출이익률 = (예상 마진 / 시가 환산액) × 100</div>
        <div style="margin-top:8px; color:var(--text-muted);">원가 계산 방식</div>
        <div>총평균법(가중평균): 입고 단가를 평균내어 원가를 계산</div>
        <div>선입선출(FIFO): 먼저 들어온 재고부터 원가를 적용</div>
        <div>최종매입원가법: 마지막 입고 단가를 기준으로 계산</div>
      </div>
    </details>

    <div class="card card-flush">
      <div style="padding:12px 16px; border-bottom:1px solid var(--border); background:var(--bg-card);">
        <strong>🧮 품목별 원가 분석</strong>
        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">(${sortedCostData.length}개 품목)</span>
        <span style="color:var(--text-muted); font-size:12px; margin-left:8px;">정렬: ${getCostSortSummary(costingSortState)}</span>
      </div>
      <div class="table-wrapper" style="border:none; border-radius:0;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              ${COSTING_SORT_FIELDS.map(field => renderCostingHeader(field, costingSortState)).join('')}
            </tr>
          </thead>
          <tbody id="costing-tbody">
            ${(() => {
              const groupOrder = [];
              const groupMap = new Map();
              sortedCostData.forEach(row => {
                const key = row.itemCode ? String(row.itemCode).trim() : String(row.itemName || '').trim();
                if (!groupMap.has(key)) { groupMap.set(key, []); groupOrder.push(key); }
                groupMap.get(key).push(row);
              });

              let html = '';
              let rowNum = 1;
              groupOrder.forEach(key => {
                const group = groupMap.get(key);
                if (group.length === 1) {
                  html += renderCostingRow(group[0], rowNum++ - 1);
                } else {
                  const isExpanded = expandedCostGroups.has(key);
                  const totalQty = group.reduce((s, r) => s + (r.qty || 0), 0);
                  const totalCostSum = group.reduce((s, r) => s + (r.totalCost || 0), 0);
                  html += `
                    <tr class="cost-group-header" data-cost-group-key="${escapeHtml(key)}"
                        style="cursor:pointer; background:var(--bg-card); border-left:3px solid var(--accent);">
                      <td class="col-num">${rowNum++}</td>
                      <td colspan="9" style="padding-left:8px;">
                        <span style="margin-right:6px; font-size:12px;">${isExpanded ? '▼' : '▶'}</span>
                        <strong>${escapeHtml(group[0].itemName)}</strong>
                        ${group[0].itemCode ? `<span style="color:var(--text-muted); font-size:11px; margin-left:6px;">${escapeHtml(group[0].itemCode)}</span>` : ''}
                        <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${group.length}항목 · 총 ${totalQty.toLocaleString('ko-KR')}개 · ₩${Math.round(totalCostSum).toLocaleString('ko-KR')}</span>
                      </td>
                    </tr>
                    ${isExpanded ? group.map((row, i) => renderCostingRow(row, rowNum + i - 2, true)).join('') : ''}
                  `;
                }
              });
              return html;
            })()}
          </tbody>
        </table>
      </div>
    </div>
    <div class="chart-help-text">표 제목을 누르면 큰 값 순서나 가나다순으로 바로 정렬됩니다.</div>
  `;

  container.querySelectorAll('input[name="cost-method"]').forEach(radio => {
    radio.addEventListener('change', (event) => {
      setState({ costMethod: event.target.value });
      renderCostingPage(container, navigateTo);
    });
  });

  container.querySelectorAll('.table-sort-btn[data-sort-key]').forEach(button => {
    button.addEventListener('click', () => {
      const nextKey = button.dataset.sortKey;
      if (!nextKey) return;

      costingSortState = getNextCostSortState(costingSortState, nextKey);
      renderCostingPage(container, navigateTo);
    });
  });

  // 원가 분석 그룹 헤더 클릭 → 펼치기/접기
  container.querySelectorAll('.cost-group-header').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.costGroupKey;
      if (expandedCostGroups.has(key)) {
        expandedCostGroups.delete(key);
      } else {
        expandedCostGroups.add(key);
      }
      renderCostingPage(container, navigateTo);
    });
  });

  container.querySelector('#btn-cost-export')?.addEventListener('click', () => {
    if (sortedCostData.length === 0) {
      showToast('데이터가 없습니다.', 'warning');
      return;
    }

    const exportRows = sortedCostData.map(row => ({
      '품목명': row.itemName,
      '코드': row.itemCode || '',
      '재고수량': row.qty,
      '단위원가': row.unitCost,
      '총원가': row.totalCost,
      '판매단가': row.sellPrice,
      '시가환산': row.marketValue,
      '예상이익': row.profit,
      '마진율(%)': getCostMarginRate(row) ?? '',
    }));

    downloadExcel(exportRows, `원가분석_${new Date().toISOString().split('T')[0]}`);
    showToast('원가표를 내보냈습니다.', 'success');
  });
}

function renderCostingHeader(field, sortState) {
  const classes = ['sortable-col'];
  if (field.align) classes.push(field.align);
  if (field.key === 'itemName') classes.push('col-fill');

  return `
    <th class="${classes.join(' ')}">
      <button type="button" class="table-sort-btn ${sortState.key === field.key ? 'active' : ''}" data-sort-key="${field.key}">
        <span>${field.label}</span>
        <span class="table-sort-arrow">${getCostSortArrow(field.key, sortState)}</span>
      </button>
    </th>
  `;
}

function renderCostingRow(row, index, isChild = false) {
  const marginRate = getCostMarginRate(row);
  const marginText = marginRate === null ? '-' : `${marginRate.toFixed(1)}%`;
  const rowClass = marginRate !== null && marginRate < 0
    ? 'row-danger'
    : marginRate !== null && marginRate < 10
      ? 'row-warning'
      : '';
  const childStyle = isChild ? 'background:var(--bg-lighter);' : '';

  return `
    <tr class="${rowClass}" style="${childStyle}">
      <td class="col-num">${index + 1}</td>
      <td class="col-fill" style="${isChild ? 'padding-left:24px;' : ''}"><strong>${row.itemName}</strong></td>
      <td style="color:var(--text-muted); font-size:12px;">${row.itemCode || '-'}</td>
      <td class="text-right">${row.qty.toLocaleString('ko-KR')}</td>
      <td class="text-right">${formatCostMoney(row.unitCost)}</td>
      <td class="text-right">${formatCostMoney(row.totalCost)}</td>
      <td class="text-right">${formatCostMoney(row.sellPrice)}</td>
      <td class="text-right">${formatCostMoney(row.marketValue)}</td>
      <td class="text-right ${row.profit >= 0 ? 'type-in' : 'type-out'}">${formatSignedCostMoney(row.profit)}</td>
      <td class="text-right" style="font-weight:600;">${marginText}</td>
    </tr>
  `;
}

function getCostSortArrow(key, sortState) {
  if (sortState.key !== key) return '↕';
  return sortState.direction === 'asc' ? '↑' : '↓';
}

function getCostSortSummary(sortState) {
  const label = COSTING_SORT_FIELD_MAP[sortState.key]?.label || '품목명';
  return `${label} ${sortState.direction === 'asc' ? '오름차순' : '내림차순'}`;
}

function getNextCostSortState(currentSort, nextKey) {
  if (currentSort.key === nextKey) {
    return {
      key: nextKey,
      direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    key: nextKey,
    direction: COSTING_SORT_FIELD_MAP[nextKey]?.numeric ? 'desc' : 'asc',
  };
}

function sortCostRows(rows, sortState) {
  return [...rows].sort((left, right) => compareCostRows(left, right, sortState));
}

function compareCostRows(left, right, sortState) {
  const leftValue = getCostSortValue(left, sortState.key);
  const rightValue = getCostSortValue(right, sortState.key);

  const leftEmpty = leftValue === null || leftValue === '';
  const rightEmpty = rightValue === null || rightValue === '';
  if (leftEmpty && rightEmpty) return COSTING_TEXT_COLLATOR.compare(left.itemName || '', right.itemName || '');
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  let result = 0;
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue - rightValue;
  } else {
    result = COSTING_TEXT_COLLATOR.compare(String(leftValue), String(rightValue));
  }

  if (result === 0) {
    result = COSTING_TEXT_COLLATOR.compare(left.itemName || '', right.itemName || '');
  }

  return sortState.direction === 'desc' ? result * -1 : result;
}

function getCostSortValue(row, key) {
  if (key === 'marginRate') return getCostMarginRate(row);

  const value = row[key];
  if (value === null || value === undefined || value === '') return null;
  return COSTING_SORT_FIELD_MAP[key]?.numeric ? Number(value) : String(value).trim();
}

function getCostMarginRate(row) {
  if (!row.marketValue) return null;
  return Number((((row.profit || 0) / row.marketValue) * 100).toFixed(1));
}

function formatCostMoney(value) {
  if (!value) return '-';
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

function formatSignedCostMoney(value) {
  if (!value) return '-';
  return `${value < 0 ? '-₩' : '₩'}${Math.abs(Math.round(value)).toLocaleString('ko-KR')}`;
}

/**
 * 원가 계산 로직
 * weighted-avg : 총평균법 — 전체 입고 내역의 수량 가중평균 단가
 *                (= 총매입금액 / 총매입수량). 매 입고 후 재산정하는 이동평균법과 다름.
 *                한국 중소기업 회계에서 가장 널리 허용되는 방식(법인세법 시행령 §74).
 * fifo         : 선입선출법 — 가장 오래된 입고 단가를 원가로 사용
 * latest       : 최종매입원가법 — 가장 최근 입고 단가를 원가로 사용
 */
function calculateCosts(items, transactions, method) {
  return items.map(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const sellPrice = parseFloat(item.salePrice) || parseFloat(item.sellPrice) || unitPrice;

    const inTransactions = transactions
      .filter(tx => tx.type === 'in' && tx.itemName === item.itemName)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    let unitCost = unitPrice;

    switch (method) {
      case 'fifo':
        unitCost = inTransactions.length > 0 ? (parseFloat(inTransactions[0].unitPrice) || unitPrice) : unitPrice;
        break;
      case 'latest':
        unitCost = inTransactions.length > 0 ? (parseFloat(inTransactions[inTransactions.length - 1].unitPrice) || unitPrice) : unitPrice;
        break;
      case 'weighted-avg':
      default:
        if (inTransactions.length > 0) {
          let totalQty = 0;
          let totalValue = 0;

          inTransactions.forEach(tx => {
            const txQty = parseFloat(tx.quantity) || 0;
            const txPrice = parseFloat(tx.unitPrice) || unitPrice;
            totalQty += txQty;
            totalValue += txQty * txPrice;
          });

          unitCost = totalQty > 0 ? Math.round(totalValue / totalQty) : unitPrice;
        }
        break;
    }

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
