/**
 * page-stocktake.js - 재고 실사 (Stocktaking / Cycle Count)
 * 역할: 시스템 재고와 실물 재고를 대조하고, 차이를 분석/조정
 * 왜 필수? → 시스템 데이터와 실물이 다르면 ERP는 의미 없음. 정기 실사는 필수!
 */

import { getState, setState, recalcItemAmounts } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { canAction } from './auth.js';
import { handlePageError } from './error-monitor.js';

export function renderStocktakePage(container, navigateTo) {
  // ── 권한 플래그 ──────────────────────────────────────────
  const canAdjust   = canAction('stocktake:adjust');
  const canComplete = canAction('stocktake:complete');
  // ─────────────────────────────────────────────────────────

  const state = getState();
  const items = state.mappedData || [];
  const today = new Date().toISOString().split('T')[0];

  // 이전 실사 기록
  const stocktakeHistory = state.stocktakeHistory || [];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">재고 실사</h1>
        <div class="page-desc">시스템 재고와 실물 재고를 대조하고 차이를 조정합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-stocktake-history">📅 실사 이력 (${stocktakeHistory.length}건)</button>
        <button class="btn btn-primary" id="btn-start-stocktake">📋 새 실사 시작</button>
      </div>
    </div>

    <!-- 실사 진행 영역 -->
    <div id="stocktake-area">
      ${items.length === 0 ? `
        <div class="card">
          <div class="empty-state">
            <div class="icon">📋</div>
            <div class="msg">등록된 품목이 없습니다</div>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="card-title">🔍 재고 실사표</div>
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
                ${[...new Set(items.map(i => i.warehouse).filter(Boolean))].map(w => `<option value="${w}">${w}</option>`).join('')}
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
                  <th class="text-right">실물 재고</th>
                  <th class="text-right">차이</th>
                  <th>상태</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody id="st-body">
                ${items.map((item, i) => {
                  const sysQty = parseFloat(item.quantity) || 0;
                  return `
                    <tr data-idx="${i}">
                      <td class="col-num">${i + 1}</td>
                      <td><strong>${item.itemName}</strong></td>
                      <td style="color:var(--text-muted); font-size:12px;">${item.itemCode || '-'}</td>
                      <td style="font-size:12px;">${item.warehouse || '-'}</td>
                      <td class="text-right">${sysQty.toLocaleString('ko-KR')}</td>
                      <td class="text-right">
                        <input type="number" class="form-input st-actual" data-idx="${i}" value="" placeholder="${sysQty}" style="width:80px; padding:3px 6px; text-align:right; font-weight:600;" />
                      </td>
                      <td class="text-right st-diff" data-idx="${i}" style="font-weight:600;">-</td>
                      <td class="st-status" data-idx="${i}">-</td>
                      <td>
                        <input class="form-input st-note" data-idx="${i}" placeholder="메모" style="width:100px; padding:3px 6px; font-size:11px;" />
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <!-- 요약 -->
          <div id="st-summary" style="margin-top:16px; display:none;">
            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
              <div class="stat-card"><div class="stat-label">검수 품목</div><div class="stat-value" id="st-checked">0</div></div>
              <div class="stat-card"><div class="stat-label">일치</div><div class="stat-value text-success" id="st-match">0</div></div>
              <div class="stat-card"><div class="stat-label">과잉</div><div class="stat-value text-accent" id="st-over">0</div></div>
              <div class="stat-card"><div class="stat-label">부족</div><div class="stat-value text-danger" id="st-under">0</div></div>
            </div>
          </div>

          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
            <button class="btn btn-outline" id="btn-st-export">📥 실사표 내보내기</button>
            <button class="btn btn-danger" id="btn-st-adjust" ${!canAdjust ? 'disabled title="매니저 이상만 조정할 수 있습니다" style="opacity:0.4;cursor:not-allowed;"' : ''}>⚠️ 재고 조정 반영</button>
          </div>
        </div>
      `}
    </div>
  `;

  if (items.length === 0) return;

  // 실물 수량 입력 시 차이 계산
  container.querySelectorAll('.st-actual').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.idx);
      const sysQty = parseFloat(items[idx].quantity) || 0;
      const actualQty = parseFloat(input.value);

      const diffEl = container.querySelector(`.st-diff[data-idx="${idx}"]`);
      const statusEl = container.querySelector(`.st-status[data-idx="${idx}"]`);

      if (isNaN(actualQty) || input.value === '') {
        diffEl.textContent = '-';
        statusEl.innerHTML = '-';
        diffEl.style.color = '';
        updateSummary();
        return;
      }

      const diff = actualQty - sysQty;
      diffEl.textContent = diff > 0 ? `+${diff}` : diff.toString();
      diffEl.style.color = diff === 0 ? 'var(--success)' : diff > 0 ? 'var(--accent)' : 'var(--danger)';

      if (diff === 0) {
        statusEl.innerHTML = '<span class="badge badge-success">일치</span>';
      } else if (diff > 0) {
        statusEl.innerHTML = '<span class="badge badge-info">과잉</span>';
      } else {
        statusEl.innerHTML = '<span class="badge badge-danger">부족</span>';
      }

      updateSummary();
    });
  });

  function updateSummary() {
    const inputs = container.querySelectorAll('.st-actual');
    let checked = 0, match = 0, over = 0, under = 0;

    inputs.forEach((input, i) => {
      if (input.value === '') return;
      checked++;
      const sysQty = parseFloat(items[i].quantity) || 0;
      const actualQty = parseFloat(input.value);
      const diff = actualQty - sysQty;
      if (diff === 0) match++;
      else if (diff > 0) over++;
      else under++;
    });

    const summary = container.querySelector('#st-summary');
    if (checked > 0) {
      summary.style.display = 'block';
      container.querySelector('#st-checked').textContent = checked;
      container.querySelector('#st-match').textContent = match;
      container.querySelector('#st-over').textContent = over;
      container.querySelector('#st-under').textContent = under;
    } else {
      summary.style.display = 'none';
    }
  }

  // 창고 필터
  container.querySelector('#st-warehouse')?.addEventListener('change', (e) => {
    const wh = e.target.value;
    container.querySelectorAll('#st-body tr').forEach(tr => {
      const idx = parseInt(tr.dataset.idx);
      const itemWh = items[idx]?.warehouse || '';
      tr.style.display = !wh || itemWh === wh ? '' : 'none';
    });
  });

  // 실사표 내보내기
  container.querySelector('#btn-st-export')?.addEventListener('click', () => {
    const date = container.querySelector('#st-date').value;
    const inspector = container.querySelector('#st-inspector').value || '';
    const data = items.map((item, i) => {
      const input = container.querySelector(`.st-actual[data-idx="${i}"]`);
      const sysQty = parseFloat(item.quantity) || 0;
      const actual = input?.value !== '' ? parseFloat(input.value) : '';
      return {
        '품목명': item.itemName,
        '코드': item.itemCode || '',
        '창고': item.warehouse || '',
        '시스템재고': sysQty,
        '실물재고': actual,
        '차이': actual !== '' ? actual - sysQty : '',
        '비고': container.querySelector(`.st-note[data-idx="${i}"]`)?.value || '',
      };
    });
    downloadExcel(data, `재고실사_${date}`);
    showToast('실사표를 내보냈습니다.', 'success');
  });

  // 재고 조정 반영
  container.querySelector('#btn-st-adjust')?.addEventListener('click', () => {
    if (!canAdjust) {
      showToast('재고 조정 권한이 없습니다. 매니저 이상만 가능합니다.', 'warning');
      return;
    }
    try {
      const inputs = container.querySelectorAll('.st-actual');
      let adjustCount = 0;
      const updatedItems = [...items];

      inputs.forEach((input, i) => {
        if (input.value === '') return;
        const actualQty = parseFloat(input.value);
        if (isNaN(actualQty)) return;
        const sysQty = parseFloat(items[i].quantity) || 0;
        if (actualQty !== sysQty) {
          // 수량을 먼저 업데이트한 후 금액 재계산
          const adjusted = { ...updatedItems[i], quantity: actualQty };
          recalcItemAmounts(adjusted); // supplyValue, vat, totalPrice 정확히 재계산
          updatedItems[i] = adjusted;
          adjustCount++;
        }
      });

      if (adjustCount === 0) {
        showToast('조정할 차이가 없습니다.', 'info');
        return;
      }

      if (!confirm(`${adjustCount}건의 재고를 실물 수량으로 조정하시겠습니까?`)) return;

      const record = {
        date: container.querySelector('#st-date').value,
        inspector: container.querySelector('#st-inspector').value || '',
        adjustCount,
        totalItems: items.length,
      };

      const history = [...(state.stocktakeHistory || []), record];
      setState({ mappedData: updatedItems, stocktakeHistory: history });

      showToast(`${adjustCount}건 재고 조정 완료`, 'success');
      renderStocktakePage(container, navigateTo);
    } catch (err) {
      handlePageError(err, { page: 'stocktake', action: 'adjust' });
    }
  });

  // 실사 이력
  container.querySelector('#btn-stocktake-history')?.addEventListener('click', () => {
    if (stocktakeHistory.length === 0) {
      showToast('이전 실사 기록이 없습니다.', 'info');
      return;
    }
    alert('실사 이력:\n\n' + stocktakeHistory.map(h =>
      `${h.date} - 담당: ${h.inspector || '-'} / 조정 ${h.adjustCount}건 / 총 ${h.totalItems}품목`
    ).join('\n'));
  });
}
