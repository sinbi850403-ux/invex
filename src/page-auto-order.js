/**
 * page-auto-order.js - 자동 발주 추천 & 1클릭 발주서 생성
 *
 * 역할: 안전재고 부족 품목을 감지하고, 과거 입고 이력 기반으로
 *       최적 거래처·수량·단가를 추천 → 선택한 품목을 발주서로 1클릭 생성
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { openPurchaseOrderDraft } from './purchase-order-draft.js';

export function renderAutoOrderPage(container, navigateTo) {
  const state   = getState();
  const items   = state.mappedData    || [];
  const txs     = state.transactions  || [];
  const safety  = state.safetyStock   || {};
  const vendors = state.vendorMaster  || [];

  // ─── 1. 발주 추천 대상 품목 계산 ──────────────────────────────────────────
  const recommendations = [];

  items.forEach(item => {
    const key        = item.itemCode ? String(item.itemCode).trim() : (item.itemName || '').trim();
    const name       = item.itemName || '';
    const currentQty = parseFloat(item.quantity) || 0;
    const minQty     = safety[name] ?? safety[key];

    if (minQty === undefined || currentQty > minQty) return;

    // 입고 이력 기반 추천
    const inHist = txs.filter(tx =>
      tx.type === 'in' && (
        (tx.itemCode && item.itemCode && String(tx.itemCode).trim() === String(item.itemCode).trim()) ||
        tx.itemName === name
      )
    );
    const best          = findBestVendor(inHist, vendors);
    const avgQty        = calcAvgOrderQty(inHist);
    const shortage      = minQty - currentQty;
    const recommendQty  = Math.ceil(Math.max(avgQty, shortage * 2));
    const dailyUsage    = calcDailyUsage(key, name, txs);
    const daysUntilEmpty = dailyUsage > 0 ? Math.ceil(currentQty / dailyUsage) : null;

    recommendations.push({
      itemName:       name,
      itemCode:       item.itemCode || '',
      category:       item.category || '',
      unit:           item.unit     || '',
      currentQty,
      minQty,
      shortage,
      urgency: currentQty <= 0 ? 'critical' : currentQty <= minQty * 0.5 ? 'high' : 'medium',
      bestVendor:     best.name,
      bestVendorCode: best.code,
      bestPrice:      best.price,
      recommendQty,
      estimatedCost:  recommendQty * best.price,
      daysUntilEmpty,
      dailyUsage:     Math.round(dailyUsage * 10) / 10,
      lastOrderDate:  best.lastDate || '-',
    });
  });

  const urgencyOrder = { critical: 0, high: 1, medium: 2 };
  recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const urgencyLabels = {
    critical: { text: '긴급', color: 'var(--danger)',         bg: 'rgba(248,81,73,0.15)',   icon: '' },
    high:     { text: '주의', color: '#d29922',               bg: 'rgba(210,153,34,0.15)',  icon: '' },
    medium:   { text: '보통', color: 'var(--info, #58a6ff)',  bg: 'rgba(88,166,255,0.15)', icon: '' },
  };

  const totalCost = recommendations.reduce((s, r) => s + r.estimatedCost, 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">자동 발주 추천</h1>
        <div class="page-desc">안전재고 부족 품목을 감지하여 최적 발주 정보를 추천합니다. 항목을 선택해 즉시 발주서를 생성하세요.</div>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
      <div class="stat-card">
        <div class="stat-label">발주 필요 품목</div>
        <div class="stat-value text-danger">${recommendations.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">긴급 (재고 0)</div>
        <div class="stat-value" style="color:var(--danger);">${recommendations.filter(r=>r.urgency==='critical').length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 발주 금액</div>
        <div class="stat-value" style="font-size:18px;">₩${totalCost.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">추천 거래처 수</div>
        <div class="stat-value text-accent">${new Set(recommendations.map(r=>r.bestVendor)).size}곳</div>
      </div>
    </div>

    ${recommendations.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <div class="icon">✅</div>
          <div class="msg">모든 재고가 충분합니다!</div>
          <div class="sub">재고 현황 → 품목 편집에서 안전재고를 설정하면 부족 시 자동 추천됩니다.</div>
        </div>
      </div>
    ` : `
      <div class="card">
        <div class="card-title" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span>📋 발주 추천 목록</span>
          <span class="card-subtitle">${recommendations.length}건</span>
          <span style="flex:1;"></span>
          <span id="selected-summary" style="font-size:13px; color:var(--text-muted);"></span>
          <button class="btn btn-sm" id="btn-create-selected" style="display:none;">
            📄 선택 항목 발주서 생성
          </button>
          <button class="btn btn-primary btn-sm" id="btn-create-all">
            📄 전체 발주서 생성
          </button>
        </div>

        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:36px;"><input type="checkbox" id="check-all" title="전체 선택" /></th>
                <th>긴급도</th>
                <th>품목명</th>
                <th class="text-right">현재고</th>
                <th class="text-right">안전재고</th>
                <th class="text-right">부족</th>
                <th>소진예상</th>
                <th>추천 거래처</th>
                <th class="text-right">추천 수량</th>
                <th class="text-right">예상 단가</th>
                <th class="text-right">예상 금액</th>
              </tr>
            </thead>
            <tbody>
              ${recommendations.map((r, i) => {
                const u = urgencyLabels[r.urgency];
                return `
                  <tr>
                    <td><input type="checkbox" class="order-check" data-idx="${i}" /></td>
                    <td>
                      <span style="background:${u.bg};color:${u.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">
                        ${u.icon} ${u.text}
                      </span>
                    </td>
                    <td>
                      <strong>${r.itemName}</strong>
                      ${r.itemCode ? `<br/><span style="font-size:11px;color:var(--text-muted);">${r.itemCode}</span>` : ''}
                    </td>
                    <td class="text-right" style="color:${r.currentQty<=0?'var(--danger)':'var(--text-primary)'};font-weight:600;">${r.currentQty}</td>
                    <td class="text-right">${r.minQty}</td>
                    <td class="text-right" style="color:var(--danger);font-weight:600;">-${r.shortage}</td>
                    <td style="font-size:12px;">
                      ${r.daysUntilEmpty !== null
                        ? `<strong>D-${r.daysUntilEmpty}</strong><br/><span style="color:var(--text-muted);">${r.dailyUsage}개/일</span>`
                        : '-'}
                    </td>
                    <td style="font-size:13px;">
                      ${r.bestVendor !== '(없음)'
                        ? `<strong>${r.bestVendor}</strong><br/><span style="font-size:11px;color:var(--text-muted);">최근: ${r.lastOrderDate}</span>`
                        : '<span style="color:var(--text-muted);">미지정</span>'}
                    </td>
                    <td class="text-right" style="font-weight:600;color:var(--accent);">
                      <input type="number" class="form-input rec-qty" data-idx="${i}"
                        value="${r.recommendQty}" min="1"
                        style="width:70px;text-align:right;padding:2px 6px;font-size:13px;" />
                    </td>
                    <td class="text-right">₩${r.bestPrice.toLocaleString('ko-KR')}</td>
                    <td class="text-right rec-total" data-idx="${i}" style="font-weight:600;">
                      ₩${r.estimatedCost.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;">
                <td colspan="8" style="text-align:right;">합계</td>
                <td class="text-right">${recommendations.reduce((s,r)=>s+r.recommendQty,0)}</td>
                <td></td>
                <td class="text-right">₩${totalCost.toLocaleString('ko-KR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div class="card" style="border-left:3px solid var(--accent);">
        <div class="card-title">💡 추천 근거</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.8;">
          <ul style="margin:0;padding-left:16px;">
            <li><strong>추천 거래처</strong>: 해당 품목을 가장 많이 납품한 거래처 (동수면 최근 거래처)</li>
            <li><strong>추천 수량</strong>: max(과거 평균 발주량, 부족분 × 2)</li>
            <li><strong>예상 단가</strong>: 해당 거래처 최근 입고 단가</li>
            <li><strong>소진예상</strong>: 최근 30일 출고량 기준 일평균 소비량으로 계산</li>
          </ul>
        </div>
      </div>
    `}
  `;

  if (!recommendations.length) return;

  // ─── 이벤트 ────────────────────────────────────────────────────────────────

  // 수량 변경 시 금액 재계산
  container.querySelectorAll('.rec-qty').forEach(input => {
    input.addEventListener('input', () => {
      const i   = parseInt(input.dataset.idx, 10);
      const qty = parseFloat(input.value) || 0;
      const cost = qty * recommendations[i].bestPrice;
      recommendations[i].recommendQty  = qty;
      recommendations[i].estimatedCost = cost;
      const totalEl = container.querySelector(`.rec-total[data-idx="${i}"]`);
      if (totalEl) totalEl.textContent = '₩' + Math.round(cost).toLocaleString('ko-KR');
    });
  });

  // 전체 선택
  const checkAll = container.querySelector('#check-all');
  const updateSelectionUI = () => {
    const checked = [...container.querySelectorAll('.order-check:checked')];
    const btnSel  = container.querySelector('#btn-create-selected');
    const summary = container.querySelector('#selected-summary');
    if (checked.length > 0) {
      btnSel.style.display = '';
      const selCost = checked.reduce((s, cb) => s + recommendations[parseInt(cb.dataset.idx, 10)].estimatedCost, 0);
      summary.textContent = `${checked.length}건 선택 · ₩${Math.round(selCost).toLocaleString('ko-KR')}`;
    } else {
      btnSel.style.display = 'none';
      summary.textContent = '';
    }
  };

  checkAll.addEventListener('change', e => {
    container.querySelectorAll('.order-check').forEach(cb => { cb.checked = e.target.checked; });
    updateSelectionUI();
  });

  container.querySelectorAll('.order-check').forEach(cb => {
    cb.addEventListener('change', updateSelectionUI);
  });

  const openDraftForIndices = (indices) => {
    if (!indices.length) {
      showToast('발주서를 만들 항목이 없습니다.', 'warning');
      return;
    }

    const selectedItems = indices.map(index => recommendations[index]).filter(Boolean);
    const ok = openPurchaseOrderDraft({
      setState,
      navigateTo,
      source: 'auto-order',
      items: selectedItems,
      note: '자동 발주 추천에서 선택한 품목입니다.',
    });

    if (!ok) {
      showToast('발주서 초안을 만들 수 없습니다.', 'warning');
      return;
    }

    showToast(`${selectedItems.length}개 품목을 발주서 초안에 담았습니다.`, 'success');
  };

  // 전체 발주서 생성
  container.querySelector('#btn-create-all')?.addEventListener('click', () => {
    openDraftForIndices(recommendations.map((_, i) => i));
  });

  // 선택 항목 발주서 생성
  container.querySelector('#btn-create-selected')?.addEventListener('click', () => {
    const indices = [...container.querySelectorAll('.order-check:checked')].map(cb => parseInt(cb.dataset.idx, 10));
    openDraftForIndices(indices);
  });
}

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

/**
 * 과거 입고 이력에서 최적 거래처 찾기
 * - 먼저 vendorMaster 에서 코드 룩업
 * - 가장 많이 거래한 거래처, 동수면 최근 거래
 */
function findBestVendor(inHistory, vendorMaster) {
  if (!inHistory.length) return { name: '(없음)', code: '', price: 0, lastDate: null };

  const stats = {};
  inHistory.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!stats[v]) stats[v] = { count: 0, lastDate: '', lastPrice: 0 };
    stats[v].count++;
    if ((tx.date || '') > stats[v].lastDate) {
      stats[v].lastDate  = tx.date;
      stats[v].lastPrice = parseFloat(tx.unitPrice) || 0;
    }
  });

  const [bestName, bestStat] = Object.entries(stats).sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].lastDate.localeCompare(a[1].lastDate);
  })[0];

  const masterVendor = vendorMaster.find(v => v.name === bestName);

  return {
    name:     bestName,
    code:     masterVendor?.code || '',
    price:    bestStat.lastPrice,
    lastDate: bestStat.lastDate,
  };
}

/** 과거 평균 발주 수량 */
function calcAvgOrderQty(inHistory) {
  if (!inHistory.length) return 10;
  const total = inHistory.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  return Math.ceil(total / inHistory.length);
}

/** 일평균 소비량 (최근 30일 출고 기준) */
function calcDailyUsage(itemCode, itemName, txs) {
  const ago30 = new Date();
  ago30.setDate(ago30.getDate() - 30);
  const ago30Str = ago30.toISOString().slice(0, 10);

  const recentOut = txs.filter(tx => {
    if (tx.type !== 'out') return false;
    if ((tx.date || '') < ago30Str) return false;
    return (itemCode && tx.itemCode && String(tx.itemCode).trim() === itemCode) || tx.itemName === itemName;
  });

  const total = recentOut.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  return total / 30;
}
