/**
 * page-summary.js - 요약 보고 페이지 (심플 버전)
 * 핵심 지표 + 부족 품목 + 카테고리/최근 흐름/상위 품목만 표시
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { enableLocalReportSort } from './report-local-sort.js';

export function renderSummaryPage(container, navigateTo) {
  const state = getState();
  const data = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};

  if (data.length === 0 && transactions.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="title-icon">📊</span> 요약 보고</h1>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📂</div>
          <div class="msg">아직 보고할 데이터가 없습니다.</div>
          <div class="sub">파일 업로드 또는 품목 등록 후 다시 확인해 주세요.</div>
          <br />
          <button class="btn btn-primary" id="btn-go-upload">파일 업로드하기</button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    return;
  }

  const summary = buildSummary(data, transactions, safetyStock);
  const topCategories = summary.categories.slice(0, 6);
  const warningRows = summary.warnings.slice(0, 10);
  const trendRows = summary.dailyTrend.slice(-7);
  const topByQtyRows = summary.topByQty.slice(0, 10);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📊</span> 요약 보고</h1>
        <div class="page-desc">핵심 숫자만 빠르게 확인할 수 있도록 단순화했습니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-summary">엑셀 내보내기</button>
        <button class="btn btn-outline" id="btn-print">인쇄</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 품목</div>
        <div class="stat-value text-accent">${summary.itemCount.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 재고 수량</div>
        <div class="stat-value">${summary.totalQty.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 재고 금액</div>
        <div class="stat-value text-success">${formatCurrency(summary.totalPrice)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">부족 품목</div>
        <div class="stat-value ${summary.warnings.length > 0 ? 'text-danger' : 'text-success'}">
          ${summary.warnings.length > 0 ? `${summary.warnings.length}건` : '없음'}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">재고 부족 품목</div>
      ${warningRows.length === 0 ? `
        <div class="empty-state" style="padding:16px 8px;">
          <div class="msg" style="font-size:14px;">부족 품목이 없습니다.</div>
        </div>
      ` : `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>품목명</th>
                <th class="text-right">현재 수량</th>
                <th class="text-right">안전재고</th>
                <th class="text-right">부족분</th>
              </tr>
            </thead>
            <tbody>
              ${warningRows.map((row) => `
                <tr>
                  <td><strong>${escapeHtml(row.name || '-')}</strong></td>
                  <td class="text-right">${row.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${row.min.toLocaleString('ko-KR')}</td>
                  <td class="text-right text-danger">${Math.max(0, row.min - row.qty).toLocaleString('ko-KR')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px; margin-top:16px;">
      <div class="card">
        <div class="card-title">카테고리 상위</div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>카테고리</th>
                <th class="text-right">품목 수</th>
                <th class="text-right">수량</th>
                <th class="text-right">금액</th>
              </tr>
            </thead>
            <tbody>
              ${topCategories.length ? topCategories.map((cat) => `
                <tr>
                  <td><strong>${escapeHtml(cat.name || '미분류')}</strong></td>
                  <td class="text-right">${cat.count.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${cat.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${formatCurrency(cat.price)}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="4" class="text-center">카테고리 데이터가 없습니다.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">최근 7일 입출고 흐름</div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th class="text-right">입고</th>
                <th class="text-right">출고</th>
                <th class="text-right">순증감</th>
              </tr>
            </thead>
            <tbody>
              ${trendRows.length ? trendRows.map((day) => `
                <tr>
                  <td>${day.date}</td>
                  <td class="text-right type-in">+${day.inQty.toLocaleString('ko-KR')}</td>
                  <td class="text-right type-out">-${day.outQty.toLocaleString('ko-KR')}</td>
                  <td class="text-right ${day.net >= 0 ? 'type-in' : 'type-out'}">
                    ${day.net >= 0 ? '+' : ''}${day.net.toLocaleString('ko-KR')}
                  </td>
                </tr>
              `).join('') : `
                <tr><td colspan="4" class="text-center">최근 거래가 없습니다.</td></tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="card-title">수량 상위 10개 품목</div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:56px;">순위</th>
              <th>품목명</th>
              <th>카테고리</th>
              <th class="text-right">수량</th>
              <th class="text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            ${topByQtyRows.length ? topByQtyRows.map((item, index) => `
              <tr>
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td><strong>${escapeHtml(item.itemName || '-')}</strong></td>
                <td>${escapeHtml(item.category || '-')}</td>
                <td class="text-right">${toNumber(item.quantity).toLocaleString('ko-KR')}</td>
                <td class="text-right">${formatCurrency(toNumber(item.totalPrice) || toNumber(item.supplyValue))}</td>
              </tr>
            `).join('') : `
              <tr><td colspan="5" class="text-center">품목 데이터가 없습니다.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.querySelector('#btn-export-summary')?.addEventListener('click', () => {
    try {
      const exportData = summary.categories.map((cat) => ({
        카테고리: cat.name || '미분류',
        품목수: cat.count,
        수량합계: cat.qty,
        금액합계: cat.price,
      }));
      const baseName = (state.fileName || '요약보고').replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_요약보고`);
      showToast('요약 보고서를 엑셀로 내보냈습니다.', 'success');
    } catch (error) {
      showToast(error?.message || '내보내기 중 오류가 발생했습니다.', 'error');
    }
  });

  container.querySelector('#btn-print')?.addEventListener('click', () => window.print());

  container.querySelectorAll('.data-table').forEach((table) => {
    table.dataset.autoSort = 'off';
  });
  enableLocalReportSort(container);
}

function buildSummary(data, transactions, safetyStock) {
  const itemCount = data.length;
  const totalQty = data.reduce((sum, row) => sum + toNumber(row.quantity), 0);
  const totalPrice = data.reduce((sum, row) => sum + (toNumber(row.totalPrice) || toNumber(row.supplyValue)), 0);

  const categoryMap = new Map();
  data.forEach((row) => {
    const key = String(row.category || '');
    if (!categoryMap.has(key)) {
      categoryMap.set(key, { name: key, count: 0, qty: 0, price: 0 });
    }
    const category = categoryMap.get(key);
    category.count += 1;
    category.qty += toNumber(row.quantity);
    category.price += toNumber(row.totalPrice) || toNumber(row.supplyValue);
  });
  const categories = [...categoryMap.values()].sort((a, b) => b.qty - a.qty);

  const warningItems = data
    .map((row) => {
      const min = toNumber(safetyStock?.[row.itemName]);
      const qty = toNumber(row.quantity);
      return { name: row.itemName, qty, min };
    })
    .filter((row) => row.min > 0 && row.qty <= row.min)
    .sort((a, b) => a.qty - b.qty);

  const topByQty = [...data]
    .sort((a, b) => toNumber(b.quantity) - toNumber(a.quantity))
    .slice(0, 10);

  const dailyTrend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const date = day.toISOString().slice(0, 10);
    const dayTx = transactions.filter((tx) => String(tx.date || '') === date);
    const inQty = dayTx.filter((tx) => tx.type === 'in').reduce((sum, tx) => sum + toNumber(tx.quantity), 0);
    const outQty = dayTx.filter((tx) => tx.type === 'out').reduce((sum, tx) => sum + toNumber(tx.quantity), 0);

    dailyTrend.push({
      date,
      inQty,
      outQty,
      net: inQty - outQty,
    });
  }

  return {
    itemCount,
    totalQty,
    totalPrice,
    categories,
    warnings: warningItems,
    topByQty,
    dailyTrend,
  };
}

function toNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  if (!value) return '-';
  return `₩ ${Math.round(value).toLocaleString('ko-KR')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
