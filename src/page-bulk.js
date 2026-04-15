/**
 * page-bulk.js - 일괄 입출고 & 자동 발주 추천
 * 역할: 여러 품목을 한번에 입고/출고 + 과거 데이터 기반 발주 시점 자동 추천
 * 왜 필수? → 대량 입고/출고를 품목 하나씩 하면 시간 낭비. 자동 발주는 기회 손실 방지.
 */

import { getState, addTransaction } from './store.js';
import { showToast } from './toast.js';

export function renderBulkPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};

  // 자동 발주 추천 항목 계산
  const reorderItems = calcReorderRecommendations(items, transactions, safetyStock);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">⚡</span> 일괄 처리 & 자동 발주</h1>
        <div class="page-desc">여러 품목을 한번에 입고/출고하고, 발주 시점을 자동 추천받습니다.</div>
      </div>
    </div>

    <!-- 탭 -->
    <div class="scan-mode-bar" style="margin-bottom:16px;">
      <button class="scan-mode-btn active" id="tab-bulk" data-tab="bulk">⚡ 일괄 입출고</button>
      <button class="scan-mode-btn" id="tab-reorder" data-tab="reorder">🤖 자동 발주 추천 ${reorderItems.length > 0 ? `<span class="badge badge-danger" style="margin-left:4px;">${reorderItems.length}</span>` : ''}</button>
    </div>

    <div id="tab-content-bulk">
      ${renderBulkSection(items)}
    </div>

    <div id="tab-content-reorder" style="display:none;">
      ${renderReorderSection(reorderItems, items)}
    </div>
  `;

  // 탭 전환
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.querySelector('#tab-content-bulk').style.display = btn.dataset.tab === 'bulk' ? '' : 'none';
      container.querySelector('#tab-content-reorder').style.display = btn.dataset.tab === 'reorder' ? '' : 'none';
    });
  });

  // === 일괄 입출고 로직 ===
  let bulkType = 'in';
  const bulkRows = [];

  // 증감 모드 전환
  container.querySelector('#bulk-type-in')?.addEventListener('click', () => {
    bulkType = 'in';
    container.querySelector('#bulk-type-in').classList.add('active');
    container.querySelector('#bulk-type-out').classList.remove('active');
  });
  container.querySelector('#bulk-type-out')?.addEventListener('click', () => {
    bulkType = 'out';
    container.querySelector('#bulk-type-out').classList.add('active');
    container.querySelector('#bulk-type-in').classList.remove('active');
  });

  // 품목 추가
  container.querySelector('#btn-bulk-add')?.addEventListener('click', () => {
    addBulkRow();
  });

  function addBulkRow() {
    const tbody = container.querySelector('#bulk-rows');
    if (!tbody) return;
    const rowIdx = bulkRows.length;
    bulkRows.push({ itemIdx: '', qty: 1 });

    // 항상 최신 state에서 품목 읽기 (페이지 렌더 후 늦게 로드된 경우 대응)
    const latestItems = getState().mappedData || [];

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="form-select bulk-item" data-row="${rowIdx}" style="min-width:180px;">
          <option value="">-- 선택 --</option>
          ${latestItems.map((item, i) => `<option value="${i}">${item.itemName} (${item.itemCode || '-'}) [재고:${parseFloat(item.quantity) || 0}]</option>`).join('')}
        </select>
      </td>
      <td class="text-right bulk-current" data-row="${rowIdx}">-</td>
      <td><input type="number" class="form-input bulk-qty" data-row="${rowIdx}" value="1" min="1" style="width:80px; padding:3px 6px; text-align:right;" /></td>
      <td><input class="form-input bulk-note" data-row="${rowIdx}" placeholder="메모" style="width:120px; padding:3px 6px; font-size:11px;" /></td>
      <td><button class="btn-icon btn-icon-danger bulk-remove" data-row="${rowIdx}">✕</button></td>
    `;
    tbody.appendChild(tr);

    // 품목 선택 시 현재 재고 표시
    tr.querySelector('.bulk-item').addEventListener('change', (e) => {
      const idx = parseInt(e.target.value);
      const currentEl = tr.querySelector(`.bulk-current`);
      const currentItems = getState().mappedData || [];
      if (!isNaN(idx) && currentItems[idx]) {
        currentEl.textContent = (parseFloat(currentItems[idx].quantity) || 0).toLocaleString('ko-KR');
        bulkRows[rowIdx].itemIdx = idx;
      } else {
        currentEl.textContent = '-';
      }
    });

    tr.querySelector('.bulk-qty').addEventListener('change', (e) => {
      bulkRows[rowIdx].qty = parseInt(e.target.value) || 1;
    });

    tr.querySelector('.bulk-remove').addEventListener('click', () => {
      tr.remove();
    });
  }

  // 초기 3줄 추가
  if (items.length > 0) {
    addBulkRow();
    addBulkRow();
    addBulkRow();
  }

  // 일괄 실행
  container.querySelector('#btn-bulk-execute')?.addEventListener('click', () => {
    const rows = container.querySelectorAll('#bulk-rows tr');
    const today = new Date().toISOString().split('T')[0];
    const execItems = getState().mappedData || [];
    let count = 0;

    rows.forEach(tr => {
      const select = tr.querySelector('.bulk-item');
      const qtyInput = tr.querySelector('.bulk-qty');
      const noteInput = tr.querySelector('.bulk-note');

      const itemIdx = parseInt(select?.value);
      if (isNaN(itemIdx)) return;

      const item = execItems[itemIdx];
      const qty = parseInt(qtyInput?.value) || 0;
      if (qty <= 0) return;

      // 출고 시 재고 확인
      if (bulkType === 'out') {
        const currentQty = parseFloat(item.quantity) || 0;
        if (qty > currentQty) {
          showToast(`${item.itemName}: 재고 부족 (${currentQty})`, 'error');
          return;
        }
      }

      addTransaction({
        type: bulkType,
        itemName: item.itemName,
        itemCode: item.itemCode || '',
        quantity: qty,
        unitPrice: parseFloat(item.unitPrice) || 0,
        date: today,
        note: (noteInput?.value || '') + ' [일괄]',
      });
      count++;
    });

    if (count === 0) {
      showToast('처리할 품목이 없습니다.', 'warning');
      return;
    }

    showToast(`${bulkType === 'in' ? '입고' : '출고'} ${count}건 일괄 처리 완료`, 'success');
    renderBulkPage(container, navigateTo);
  });

  // === 자동 발주 추천 이벤트 ===
  container.querySelector('#btn-reorder-all')?.addEventListener('click', () => {
    navigateTo('documents');
  });
}

/**
 * 일괄 입출고 UI
 */
function renderBulkSection(items) {
  if (items.length === 0) {
    return '<div class="card"><div class="empty-state"><div class="icon">⚡</div><div class="msg">품목을 먼저 등록해주세요</div></div></div>';
  }

  return `
    <div class="card">
      <div class="card-title">⚡ 일괄 입출고</div>

      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button class="btn btn-success active" id="bulk-type-in" style="flex:1;">📥 일괄 입고</button>
        <button class="btn btn-outline" id="bulk-type-out" style="flex:1; color:var(--danger); border-color:var(--danger);">📤 일괄 출고</button>
      </div>

      <div class="table-wrapper" style="border:none; margin-bottom:12px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>품목 선택</th>
              <th class="text-right">현재 재고</th>
              <th>수량</th>
              <th>비고</th>
              <th style="width:40px;"></th>
            </tr>
          </thead>
          <tbody id="bulk-rows"></tbody>
        </table>
      </div>

      <div style="display:flex; gap:8px; justify-content:space-between;">
        <button class="btn btn-outline" id="btn-bulk-add">+ 행 추가</button>
        <button class="btn btn-primary btn-lg" id="btn-bulk-execute">⚡ 일괄 처리 실행</button>
      </div>
    </div>
  `;
}

/**
 * 자동 발주 추천 UI
 */
function renderReorderSection(reorderItems, items) {
  if (reorderItems.length === 0) {
    return `
      <div class="card">
        <div class="empty-state">
          <div class="icon" style="font-size:40px;">🤖</div>
          <div class="msg">현재 발주가 필요한 품목이 없습니다</div>
          <div class="sub">모든 품목이 충분한 재고를 보유하고 있습니다.</div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card" style="border-left:3px solid var(--danger);">
      <div class="card-title">🤖 자동 발주 추천 <span class="badge badge-danger">${reorderItems.length}건</span></div>
      <div style="font-size:13px; color:var(--text-muted); margin-bottom:16px;">
        과거 출고 패턴과 안전재고 설정을 분석하여 발주가 필요한 품목을 추천합니다.
      </div>

      <div class="table-wrapper" style="border:none; margin-bottom:16px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>긴급도</th>
              <th>품목명</th>
              <th>코드</th>
              <th class="text-right">현재 재고</th>
              <th class="text-right">안전재고</th>
              <th class="text-right">일평균 출고</th>
              <th class="text-right">예상 소진일</th>
              <th class="text-right">추천 발주량</th>
            </tr>
          </thead>
          <tbody>
            ${reorderItems.map(r => `
              <tr class="${r.daysLeft <= 3 ? 'row-danger' : r.daysLeft <= 7 ? 'row-warning' : ''}">
                <td>
                  ${r.daysLeft <= 0
                    ? '<span class="badge badge-danger">긴급</span>'
                    : r.daysLeft <= 3
                      ? '<span class="badge badge-danger">위험</span>'
                      : r.daysLeft <= 7
                        ? '<span class="badge badge-warning">주의</span>'
                        : '<span class="badge badge-info">참고</span>'
                  }
                </td>
                <td><strong>${r.itemName}</strong></td>
                <td style="color:var(--text-muted); font-size:12px;">${r.itemCode || '-'}</td>
                <td class="text-right ${r.currentQty <= 0 ? 'type-out' : ''}">${r.currentQty.toLocaleString('ko-KR')}</td>
                <td class="text-right">${r.safetyQty}</td>
                <td class="text-right">${r.avgDailyOut.toFixed(1)}</td>
                <td class="text-right" style="font-weight:600; ${r.daysLeft <= 3 ? 'color:var(--danger);' : ''}">
                  ${r.daysLeft <= 0 ? '소진됨!' : `D-${r.daysLeft}`}
                </td>
                <td class="text-right" style="font-weight:700; color:var(--accent);">
                  ${r.recommendedQty.toLocaleString('ko-KR')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-primary btn-lg" id="btn-reorder-all">📄 발주서 작성으로 이동</button>
      </div>
    </div>
  `;
}

/**
 * 자동 발주 추천 계산
 * 로직: 최근 30일 일평균 출고량 → 현재 재고 소진 예상일 계산
 *       소진 예상일이 14일 이내이면 발주 추천
 */
function calcReorderRecommendations(items, transactions, safetyStock) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  // 최근 30일 일별 출고량
  const outMap = {};
  transactions
    .filter(tx => tx.type === 'out' && tx.date >= cutoff)
    .forEach(tx => {
      const key = tx.itemName;
      outMap[key] = (outMap[key] || 0) + (parseFloat(tx.quantity) || 0);
    });

  const results = [];

  items.forEach(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const totalOut = outMap[item.itemName] || 0;
    const avgDailyOut = totalOut / 30;

    // 소진 예상일
    const daysLeft = avgDailyOut > 0 ? Math.floor(currentQty / avgDailyOut) : 999;

    // 안전재고 기준
    const safetyQty = safetyStock[item.itemName] || 0;

    // 발주 추천 조건: 14일 이내 소진 예상 또는 안전재고 이하
    const needReorder = daysLeft <= 14 || (safetyQty > 0 && currentQty <= safetyQty);
    if (!needReorder) return;

    // 추천 발주량: 30일치 + 안전재고 - 현재재고
    const recommendedQty = Math.max(
      1,
      Math.ceil(avgDailyOut * 30 + safetyQty - currentQty)
    );

    results.push({
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      currentQty,
      safetyQty,
      avgDailyOut,
      daysLeft: Math.max(0, daysLeft),
      recommendedQty,
    });
  });

  // 긴급도 순 정렬
  return results.sort((a, b) => a.daysLeft - b.daysLeft);
}
