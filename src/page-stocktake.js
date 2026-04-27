/**
 * page-stocktake.js - 재고 실사
 * 목적: 시스템 재고와 실제 재고를 비교하고 차이를 조정한다.
 */

import { getState, setState, recalcItemAmounts } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { canAction } from './auth.js';
import { handlePageError } from './error-monitor.js';
import { escapeHtml, safeAttr } from './ux-toolkit.js';

function toNumber(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

function getGroupKey(item) {
  const code = String(item?.itemCode || '').trim();
  if (code) return `code:${code.toLowerCase()}`;
  const name = String(item?.itemName || '').trim().toLowerCase();
  return `name:${name || '-'}`;
}

export function renderStocktakePage(container, navigateTo) {
  const canAdjust = canAction('stocktake:adjust');
  const state = getState();
  const items = state.mappedData || [];
  const stocktakeHistory = state.stocktakeHistory || [];
  const today = new Date().toISOString().split('T')[0];

  const actualValues = new Map();
  const noteValues = new Map();
  const expandedGroupKeys = new Set();
  let warehouseFilter = '';

  const warehouseOptions = [...new Set(items.map((item) => String(item.warehouse || '').trim()).filter(Boolean))];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"> 재고 실사</h1>
        <div class="page-desc">실제 재고와 시스템 재고를 비교하고 차이를 조정합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-stocktake-history"> 실사 이력 (${stocktakeHistory.length}건)</button>
        <button class="btn btn-primary" id="btn-start-stocktake"> 새 실사 시작</button>
      </div>
    </div>
    <div id="stocktake-area">
      ${items.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            <div class="icon"></div>
            <div class="msg">등록된 품목이 없습니다</div>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="card-title"> 재고 실사표</div>
          <div style="display:flex; gap:12px; margin-bottom:16px; align-items:center;">
            <div class="form-group" style="margin:0;">
              <label class="form-label">실사일자</label>
              <input class="form-input" type="date" id="st-date" value="${today}" />
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">실사자</label>
              <input class="form-input" id="st-inspector" placeholder="실사 담당자" />
            </div>
            <div class="form-group" style="margin:0; flex:1;">
              <label class="form-label">창고 필터</label>
              <select class="form-select" id="st-warehouse">
                <option value="">전체 창고</option>
                ${warehouseOptions.map((warehouse) => `<option value="${safeAttr(warehouse)}">${escapeHtml(warehouse)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="table-wrapper" style="border:none;">
            <table class="data-table" id="stocktake-table">
              <thead>
                <tr>
                  <th style="width:40px;">#</th>
                  <th>품목명</th>
                  <th>코드</th>
                  <th>창고</th>
                  <th class="text-right">시스템 재고</th>
                  <th class="text-right">실사 재고</th>
                  <th class="text-right">차이</th>
                  <th>상태</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody id="st-body"></tbody>
            </table>
          </div>
          <div id="st-summary" style="margin-top:16px; display:none;">
            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
              <div class="stat-card"><div class="stat-label">검수 품목</div><div class="stat-value" id="st-checked">0</div></div>
              <div class="stat-card"><div class="stat-label">일치</div><div class="stat-value text-success" id="st-match">0</div></div>
              <div class="stat-card"><div class="stat-label">과잉</div><div class="stat-value text-accent" id="st-over">0</div></div>
              <div class="stat-card"><div class="stat-label">부족</div><div class="stat-value text-danger" id="st-under">0</div></div>
            </div>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
            <button class="btn btn-outline" id="btn-st-export"> 실사표 내보내기</button>
            <button class="btn btn-danger" id="btn-st-adjust" ${!canAdjust ? 'disabled title="매니저 이상만 재고 조정이 가능합니다." style="opacity:0.4;cursor:not-allowed;"' : ''}> 재고 조정 반영</button>
          </div>
        </div>
      `}
    </div>
  `;

  if (items.length === 0) return;

  const groups = [];
  const groupMap = new Map();
  items.forEach((item, idx) => {
    const key = getGroupKey(item);
    if (!groupMap.has(key)) {
      const bucket = { key, indices: [] };
      groupMap.set(key, bucket);
      groups.push(bucket);
    }
    groupMap.get(key).indices.push(idx);
  });

  groups.forEach((group) => {
    if (group.indices.length > 1) expandedGroupKeys.add(group.key);
  });

  function computeDiffMeta(index) {
    const raw = actualValues.get(index);
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const actualQty = Number.parseFloat(raw);
    if (!Number.isFinite(actualQty)) return null;

    const sysQty = toNumber(items[index]?.quantity);
    const diff = actualQty - sysQty;
    if (diff === 0) return { diff, badge: '<span class="badge badge-success">일치</span>', color: 'var(--success)' };
    if (diff > 0) return { diff, badge: '<span class="badge badge-info">과잉</span>', color: 'var(--accent)' };
    return { diff, badge: '<span class="badge badge-danger">부족</span>', color: 'var(--danger)' };
  }

  function isVisibleByWarehouse(index) {
    if (!warehouseFilter) return true;
    const wh = String(items[index]?.warehouse || '');
    return wh === warehouseFilter;
  }

  function updateSummary() {
    let checked = 0;
    let match = 0;
    let over = 0;
    let under = 0;

    actualValues.forEach((value, index) => {
      if (!isVisibleByWarehouse(index)) return;
      const meta = computeDiffMeta(index);
      if (!meta) return;
      checked += 1;
      if (meta.diff === 0) match += 1;
      else if (meta.diff > 0) over += 1;
      else under += 1;
    });

    const summary = container.querySelector('#st-summary');
    const checkedEl = container.querySelector('#st-checked');
    const matchEl = container.querySelector('#st-match');
    const overEl = container.querySelector('#st-over');
    const underEl = container.querySelector('#st-under');
    if (!summary || !checkedEl || !matchEl || !overEl || !underEl) return;

    if (checked > 0) {
      summary.style.display = 'block';
      checkedEl.textContent = String(checked);
      matchEl.textContent = String(match);
      overEl.textContent = String(over);
      underEl.textContent = String(under);
    } else {
      summary.style.display = 'none';
    }
  }

  function renderBody() {
    const tbody = container.querySelector('#st-body');
    if (!tbody) return;

    let rowNo = 1;
    let html = '';

    groups.forEach((group) => {
      const visibleIndices = group.indices.filter((idx) => isVisibleByWarehouse(idx));
      if (visibleIndices.length === 0) return;

      if (group.indices.length > 1) {
        const first = items[group.indices[0]] || {};
        const expanded = expandedGroupKeys.has(group.key);
        html += `
          <tr class="st-group-header" data-group-key="${safeAttr(group.key)}" style="background:var(--bg-lighter); border-left:3px solid var(--accent); cursor:pointer;">
            <td style="text-align:center;">${rowNo++}</td>
            <td colspan="8">
              <button type="button" class="btn btn-ghost btn-sm" data-group-toggle="${safeAttr(group.key)}" style="padding:2px 8px;">
                ${expanded ? '▼' : '▶'} ${escapeHtml(String(first.itemName || '-'))} ${first.itemCode ? `(${escapeHtml(String(first.itemCode))})` : ''} - 중복 ${group.indices.length}건
              </button>
            </td>
          </tr>
        `;
        if (!expanded) return;
      }

      visibleIndices.forEach((idx) => {
        const item = items[idx] || {};
        const sysQty = toNumber(item.quantity);
        const meta = computeDiffMeta(idx);
        const diffText = meta ? (meta.diff > 0 ? `+${meta.diff}` : String(meta.diff)) : '-';
        const statusHtml = meta ? meta.badge : '-';
        const diffColor = meta ? `color:${meta.color};` : '';
        const actualValue = actualValues.get(idx);
        const noteValue = noteValues.get(idx);
        const inputValueAttr = actualValue === undefined ? '' : `value="${safeAttr(String(actualValue))}"`;
        const noteValueAttr = noteValue === undefined ? '' : `value="${safeAttr(String(noteValue))}"`;
        const safeItemName = escapeHtml(String(item.itemName || '-'));
        const safeItemCode = escapeHtml(String(item.itemCode || '-'));
        const safeWarehouse = escapeHtml(String(item.warehouse || '-'));

        html += `
          <tr data-idx="${safeAttr(idx)}">
            <td class="col-num">${rowNo++}</td>
            <td><strong>${safeItemName}</strong></td>
            <td style="color:var(--text-muted); font-size:12px;">${safeItemCode}</td>
            <td style="font-size:12px;">${safeWarehouse}</td>
            <td class="text-right">${sysQty.toLocaleString('ko-KR')}</td>
            <td class="text-right">
              <input type="number" class="form-input st-actual" data-idx="${safeAttr(idx)}" ${inputValueAttr} placeholder="${safeAttr(sysQty)}" style="width:80px; padding:3px 6px; text-align:right; font-weight:600;" />
            </td>
            <td class="text-right st-diff" data-idx="${safeAttr(idx)}" style="font-weight:600; ${diffColor}">${diffText}</td>
            <td class="st-status" data-idx="${safeAttr(idx)}">${statusHtml}</td>
            <td>
              <input class="form-input st-note" data-idx="${safeAttr(idx)}" ${noteValueAttr} placeholder="메모" style="width:100px; padding:3px 6px; font-size:11px;" />
            </td>
          </tr>
        `;
      });
    });

    tbody.innerHTML = html || '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">표시할 품목이 없습니다.</td></tr>';

    tbody.querySelectorAll('.st-group-header [data-group-toggle]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = button.getAttribute('data-group-toggle');
        if (!key) return;
        if (expandedGroupKeys.has(key)) expandedGroupKeys.delete(key);
        else expandedGroupKeys.add(key);
        renderBody();
      });
    });

    tbody.querySelectorAll('.st-actual').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number.parseInt(input.dataset.idx || '', 10);
        if (Number.isNaN(idx)) return;
        actualValues.set(idx, input.value);
        updateSummary();
      });
    });

    tbody.querySelectorAll('.st-note').forEach((input) => {
      input.addEventListener('input', () => {
        const idx = Number.parseInt(input.dataset.idx || '', 10);
        if (Number.isNaN(idx)) return;
        noteValues.set(idx, input.value);
      });
    });

    updateSummary();
  }

  container.querySelector('#st-warehouse')?.addEventListener('change', (event) => {
    warehouseFilter = String(event.target.value || '');
    renderBody();
  });

  container.querySelector('#btn-st-export')?.addEventListener('click', () => {
    const date = String(container.querySelector('#st-date')?.value || today);
    const rows = items.map((item, idx) => {
      const sysQty = toNumber(item.quantity);
      const meta = computeDiffMeta(idx);
      const actualRaw = actualValues.get(idx);
      const actualQty = actualRaw === undefined || String(actualRaw).trim() === '' ? '' : Number.parseFloat(actualRaw);
      return {
        품목명: item.itemName || '',
        코드: item.itemCode || '',
        창고: item.warehouse || '',
        시스템재고: sysQty,
        실사재고: Number.isFinite(actualQty) ? actualQty : '',
        차이: meta ? meta.diff : '',
        비고: noteValues.get(idx) || '',
      };
    });
    downloadExcel(rows, `재고실사_${date}`);
    showToast('실사표를 내보냈습니다.', 'success');
  });

  container.querySelector('#btn-st-adjust')?.addEventListener('click', () => {
    if (!canAdjust) {
      showToast('재고 조정 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning');
      return;
    }

    try {
      const updatedItems = [...items];
      let adjustCount = 0;
      items.forEach((item, idx) => {
        const raw = actualValues.get(idx);
        if (raw === undefined || String(raw).trim() === '') return;
        const actualQty = Number.parseFloat(raw);
        if (!Number.isFinite(actualQty)) return;
        const sysQty = toNumber(item.quantity);
        if (actualQty === sysQty) return;
        const adjusted = { ...updatedItems[idx], quantity: actualQty };
        recalcItemAmounts(adjusted);
        updatedItems[idx] = adjusted;
        adjustCount += 1;
      });

      if (adjustCount === 0) {
        showToast('조정할 차이가 없습니다.', 'info');
        return;
      }

      if (!confirm(`${adjustCount}건의 재고를 실사 수량으로 조정하시겠습니까?`)) return;

      const record = {
        date: String(container.querySelector('#st-date')?.value || today),
        inspector: String(container.querySelector('#st-inspector')?.value || ''),
        adjustCount,
        totalItems: items.length,
      };
      const history = [...(state.stocktakeHistory || []), record];
      setState({ mappedData: updatedItems, stocktakeHistory: history });
      showToast(`${adjustCount}건 재고 조정 완료`, 'success');
      renderStocktakePage(container, navigateTo);
    } catch (error) {
      handlePageError(error, { page: 'stocktake', action: 'adjust' });
    }
  });

  container.querySelector('#btn-stocktake-history')?.addEventListener('click', () => {
    if (stocktakeHistory.length === 0) {
      showToast('이전 실사 기록이 없습니다.', 'info');
      return;
    }
    const text = stocktakeHistory
      .map((row) => `${row.date} - 담당: ${row.inspector || '-'} / 조정 ${row.adjustCount}건 / 총 ${row.totalItems}품목`)
      .join('\n');
    alert(`실사 이력\n\n${text}`);
  });

  container.querySelector('#btn-start-stocktake')?.addEventListener('click', () => {
    renderStocktakePage(container, navigateTo);
  });

  renderBody();
}
