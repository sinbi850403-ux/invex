/**
 * page-orders.js - 발주 관리 (구매 플로우 완전 구현)
 *
 * 플로우: 발주서 작성 → 발주 확정 → 입고 처리(부분/전체) → 매입 세금계산서 → 미지급금
 */

import { getState, setState, addTransaction } from './store.js';
import { showToast } from './toast.js';
import { addAuditLog } from './audit-log.js';
import { generatePurchaseOrderPDF } from './pdf-generator.js';
import { escapeHtml } from './ux-toolkit.js';

/* ── 상수 ──────────────────────────────────────────────── */
const STATUS = {
  draft:     { text: '작성중',   icon: '📝', color: 'var(--text-muted)',  bg: 'rgba(139,148,158,.15)' },
  confirmed: { text: '발주확정', icon: '📤', color: '#58a6ff',            bg: 'rgba(88,166,255,.15)' },
  partial:   { text: '부분입고', icon: '📦', color: '#d29922',            bg: 'rgba(210,153,34,.15)' },
  complete:  { text: '입고완료', icon: '✅', color: 'var(--success)',      bg: 'rgba(63,185,80,.15)' },
  cancelled: { text: '취소',     icon: '❌', color: 'var(--danger)',       bg: 'rgba(248,81,73,.15)' },
  // 하위호환: 기존 'pending'→draft, 'sent'→confirmed
  pending:   { text: '작성중',   icon: '📝', color: 'var(--text-muted)',  bg: 'rgba(139,148,158,.15)' },
  sent:      { text: '발주확정', icon: '📤', color: '#58a6ff',            bg: 'rgba(88,166,255,.15)' },
};

const fmt = v => v ? '₩' + Math.round(Number(v) || 0).toLocaleString('ko-KR') : '-';
const toNum = v => parseFloat(String(v || '').replace(/,/g, '')) || 0;

function orderTotal(order) {
  return (order.items || []).reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
}

function genOrderNo(orders, date) {
  const d = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
  const today = orders.filter(o => (o.orderNo || '').includes(d));
  return `PO-${d}-${String(today.length + 1).padStart(3, '0')}`;
}

function dueDate(base = new Date().toISOString().split('T')[0], days = 30) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

let currentTab = 'all';

/* ═══════════════════════════════════════════════════════════
   메인 렌더
═══════════════════════════════════════════════════════════ */
export function renderOrdersPage(container, navigateTo) {
  const state   = getState();
  const orders  = state.purchaseOrders || [];

  const counts = {
    all:       orders.length,
    draft:     orders.filter(o => o.status === 'draft' || o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed' || o.status === 'sent').length,
    partial:   orders.filter(o => o.status === 'partial').length,
    complete:  orders.filter(o => o.status === 'complete').length,
  };

  const pendingAmt  = orders
    .filter(o => ['draft','confirmed','partial','pending','sent'].includes(o.status))
    .reduce((s, o) => s + orderTotal(o), 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📋</span> 발주 관리</h1>
        <div class="page-desc">발주서 작성 → 발주 확정 → 입고 처리 → 세금계산서 생성까지 전체 구매 플로우를 관리합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-auto-order" title="자동발주 추천 페이지">🤖 자동발주 추천</button>
        <button class="btn btn-primary" id="btn-new-order">+ 신규 발주</button>
      </div>
    </div>

    <!-- KPI -->
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px;">
      ${[
        { label: '미결 발주',   value: (counts.draft + counts.confirmed + counts.partial) + '건',  sub: '처리 대기 중' },
        { label: '미지급 예정', value: fmt(pendingAmt), sub: '입고 전 발주 합계' },
        { label: '이번달 입고완료', value: orders.filter(o => o.status === 'complete' && (o.receivedAt || '').startsWith(new Date().toISOString().slice(0,7))).length + '건', sub: '이번달' },
        { label: '전체 발주',   value: orders.length + '건', sub: '누적' },
      ].map(c => `
        <div class="card card-compact" style="text-align:center;">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${c.label}</div>
          <div style="font-size:20px; font-weight:700;">${c.value}</div>
          <div style="font-size:11px; color:var(--text-muted);">${c.sub}</div>
        </div>`).join('')}
    </div>

    <!-- 탭 필터 -->
    <div class="card card-compact" style="margin-bottom:12px;">
      <div style="display:flex; gap:4px; background:var(--bg-input); border-radius:8px; padding:4px; width:fit-content;">
        ${[
          { key: 'all',       label: `전체 (${counts.all})` },
          { key: 'draft',     label: `작성중 (${counts.draft})` },
          { key: 'confirmed', label: `발주확정 (${counts.confirmed})` },
          { key: 'partial',   label: `부분입고 (${counts.partial})` },
          { key: 'complete',  label: `입고완료 (${counts.complete})` },
        ].map(t => `
          <button class="order-tab" data-tab="${t.key}"
            style="padding:6px 14px; border-radius:6px; border:none; cursor:pointer; font-size:13px;
            background:${currentTab === t.key ? 'var(--accent)' : 'transparent'};
            color:${currentTab === t.key ? '#fff' : 'var(--text-muted)'};">
            ${t.label}
          </button>`).join('')}
      </div>
    </div>

    <!-- 발주 목록 -->
    <div class="card card-flush" id="order-list-area">
      ${renderOrderTable(orders)}
    </div>

    <!-- 상세 슬라이드오버 -->
    <div id="order-detail-overlay" style="display:none; position:fixed; inset:0; z-index:200; background:rgba(0,0,0,.4);">
      <div style="position:absolute; right:0; top:0; bottom:0; width:560px; max-width:95vw;
                  background:var(--bg-card); box-shadow:-4px 0 24px rgba(0,0,0,.3); overflow-y:auto;"
           id="order-detail-panel"></div>
    </div>

    <!-- 신규 / 수정 모달 -->
    <div class="modal-overlay" id="order-modal" style="display:none;">
      <div class="modal" style="max-width:720px; width:95vw;">
        <div class="modal-header">
          <h3 class="modal-title" id="order-modal-title">📋 신규 발주</h3>
          <button class="modal-close" id="order-modal-close">✕</button>
        </div>
        <div class="modal-body" id="order-modal-body"></div>
      </div>
    </div>

    <!-- 입고처리 모달 -->
    <div class="modal-overlay" id="receive-modal" style="display:none;">
      <div class="modal" style="max-width:620px; width:95vw;">
        <div class="modal-header">
          <h3 class="modal-title" id="receive-modal-title">📦 입고 처리</h3>
          <button class="modal-close" id="receive-modal-close">✕</button>
        </div>
        <div class="modal-body" id="receive-modal-body"></div>
      </div>
    </div>
  `;

  /* ── 탭 ── */
  container.querySelectorAll('.order-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderOrdersPage(container, navigateTo);
    });
  });

  container.querySelector('#btn-auto-order').addEventListener('click', () => navigateTo('auto-order'));
  container.querySelector('#btn-new-order').addEventListener('click', () => openOrderModal(container, null, navigateTo));
  container.querySelector('#order-modal-close').addEventListener('click', () => { container.querySelector('#order-modal').style.display = 'none'; });
  container.querySelector('#order-detail-overlay').addEventListener('click', e => {
    if (e.target.id === 'order-detail-overlay') container.querySelector('#order-detail-overlay').style.display = 'none';
  });
  container.querySelector('#receive-modal-close').addEventListener('click', () => { container.querySelector('#receive-modal').style.display = 'none'; });

  bindOrderActions(container, navigateTo);
}

/* ═══════════════════════════════════════════════════════════
   발주 목록 테이블
═══════════════════════════════════════════════════════════ */
function renderOrderTable(orders) {
  let filtered = currentTab === 'all' ? orders : orders.filter(o => {
    const s = o.status;
    if (currentTab === 'draft')     return s === 'draft'     || s === 'pending';
    if (currentTab === 'confirmed') return s === 'confirmed' || s === 'sent';
    return s === currentTab;
  });
  filtered = [...filtered].reverse();

  if (!filtered.length) {
    return `<div style="padding:48px; text-align:center; color:var(--text-muted);">
      <div style="font-size:40px; margin-bottom:12px;">📋</div>
      <div>발주 이력이 없습니다. [+ 신규 발주] 버튼으로 시작하세요.</div>
    </div>`;
  }

  const today = new Date().toISOString().split('T')[0];

  return `
    <div class="table-wrapper" style="border:none; border-radius:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>발주번호</th>
            <th>거래처</th>
            <th>발주일</th>
            <th>납기예정</th>
            <th>결제예정</th>
            <th>품목</th>
            <th class="text-right">총 금액</th>
            <th>상태</th>
            <th style="width:160px;">관리</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(order => {
            const s = STATUS[order.status] || STATUS.draft;
            const total = orderTotal(order);
            const isOverdue = order.paymentDueDate && order.paymentDueDate < today && order.status !== 'complete' && order.status !== 'cancelled';
            const daysLeft  = order.paymentDueDate ? Math.ceil((new Date(order.paymentDueDate) - new Date(today)) / 86400000) : null;
            const itemNames = (order.items || []).slice(0, 2).map(it => escapeHtml(it.name)).join(', ');
            const moreItems = (order.items || []).length > 2 ? ` 외 ${order.items.length - 2}건` : '';

            return `
              <tr>
                <td>
                  <button class="btn-order-detail" data-id="${order.id}"
                    style="background:none; border:none; color:var(--accent); cursor:pointer; font-weight:700; padding:0;">
                    ${escapeHtml(order.orderNo || '-')}
                  </button>
                </td>
                <td>
                  <div style="font-weight:600;">${escapeHtml(order.vendor || '-')}</div>
                  ${order.vendorCode ? `<div style="font-size:11px; color:var(--text-muted);">${escapeHtml(order.vendorCode)}</div>` : ''}
                </td>
                <td style="font-size:12px; color:var(--text-muted);">${order.orderDate || '-'}</td>
                <td style="font-size:12px;">${order.deliveryDate || '-'}</td>
                <td style="font-size:12px; ${isOverdue ? 'color:var(--danger); font-weight:700;' : ''}">
                  ${order.paymentDueDate || '-'}
                  ${daysLeft !== null && order.status !== 'complete' ? `<div style="font-size:10px;">${daysLeft >= 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)} 초과`}</div>` : ''}
                </td>
                <td style="font-size:12px;">
                  <div>${itemNames}${moreItems}</div>
                  <div style="font-size:11px; color:var(--text-muted);">${(order.items || []).length}개 품목</div>
                </td>
                <td class="text-right" style="font-weight:700;">${fmt(total)}</td>
                <td>
                  <span style="background:${s.bg}; color:${s.color}; padding:3px 10px; border-radius:10px; font-size:11px; font-weight:700; white-space:nowrap;">
                    ${s.icon} ${s.text}
                  </span>
                </td>
                <td>
                  <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    ${(order.status === 'draft' || order.status === 'pending') ? `
                      <button class="btn btn-xs btn-primary btn-confirm-order" data-id="${order.id}">확정</button>
                      <button class="btn btn-xs btn-outline btn-edit-order" data-id="${order.id}">수정</button>
                    ` : ''}
                    ${(order.status === 'confirmed' || order.status === 'sent' || order.status === 'partial') ? `
                      <button class="btn btn-xs btn-success btn-receive-order" data-id="${order.id}">입고처리</button>
                    ` : ''}
                    ${order.status === 'complete' && !order.taxInvoiceId ? `
                      <button class="btn btn-xs btn-outline btn-gen-tax" data-id="${order.id}" title="세금계산서 발행">세금계산서</button>
                    ` : ''}
                    <button class="btn btn-xs btn-outline btn-pdf-order" data-id="${order.id}" title="PDF">PDF</button>
                    ${order.status === 'draft' || order.status === 'pending' ? `
                      <button class="btn btn-xs btn-icon-danger btn-cancel-order" data-id="${order.id}">취소</button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ═══════════════════════════════════════════════════════════
   이벤트 바인딩
═══════════════════════════════════════════════════════════ */
function bindOrderActions(container, navigateTo) {
  const state = getState();
  const orders = state.purchaseOrders || [];

  /* 상세 보기 */
  container.querySelectorAll('.btn-order-detail').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) openOrderDetail(container, order);
    });
  });

  /* 발주 확정 */
  container.querySelectorAll('.btn-confirm-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (!order) return;
      if (!confirm(`발주서 ${order.orderNo}를 확정하시겠습니까?\n확정 후에는 수정할 수 없습니다.`)) return;
      const updated = orders.map(o => o.id === order.id ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o);
      setState({ purchaseOrders: updated });
      addAuditLog('발주확정', order.orderNo, { vendor: order.vendor, total: orderTotal(order) });
      showToast(`발주서 ${order.orderNo} 확정 완료!`, 'success');
      renderOrdersPage(container, navigateTo);
    });
  });

  /* 수정 */
  container.querySelectorAll('.btn-edit-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) openOrderModal(container, order, navigateTo);
    });
  });

  /* 입고 처리 */
  container.querySelectorAll('.btn-receive-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) openReceiveModal(container, order, navigateTo);
    });
  });

  /* 세금계산서 생성 */
  container.querySelectorAll('.btn-gen-tax').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) generateTaxInvoice(order, orders, navigateTo, container);
    });
  });

  /* PDF */
  container.querySelectorAll('.btn-pdf-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) generatePurchaseOrderPDF(order);
    });
  });

  /* 취소 */
  container.querySelectorAll('.btn-cancel-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (!order) return;
      if (!confirm(`발주서 ${order.orderNo}를 취소하시겠습니까?`)) return;
      const updated = orders.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() } : o);
      setState({ purchaseOrders: updated });
      showToast(`발주서 ${order.orderNo} 취소 처리`, 'info');
      renderOrdersPage(container, navigateTo);
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   발주서 작성 / 수정 모달
═══════════════════════════════════════════════════════════ */
function openOrderModal(container, editOrder, navigateTo) {
  const state   = getState();
  const vendors = (state.vendorMaster || []).filter(v => v.type === 'supplier' || v.type === 'both');
  const items   = state.mappedData || [];
  const orders  = state.purchaseOrders || [];
  const isEdit  = !!editOrder;

  const modal = container.querySelector('#order-modal');
  const body  = container.querySelector('#order-modal-body');
  container.querySelector('#order-modal-title').textContent = isEdit ? `📋 발주서 수정 - ${editOrder.orderNo}` : '📋 신규 발주서 작성';
  modal.style.display = 'flex';

  const e = editOrder || {};
  const initItems = (e.items || [{ name: '', qty: '', price: '', itemCode: '', spec: '' }]);

  body.innerHTML = `
    <datalist id="om-item-list">
      ${items.map(it => `<option value="${escapeHtml(it.itemName)}" data-code="${escapeHtml(it.itemCode || '')}" data-price="${it.unitPrice || 0}" data-spec="${escapeHtml(it.spec || '')}">`).join('')}
    </datalist>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">거래처 <span class="required">*</span></label>
        <select class="form-select" id="om-vendor">
          <option value="">-- 선택 --</option>
          ${vendors.map(v => `<option value="${escapeHtml(v.name)}" data-terms="${v.paymentTerm || ''}" ${e.vendor === v.name ? 'selected' : ''}>${escapeHtml(v.name)}</option>`).join('')}
          ${e.vendor && !vendors.find(v => v.name === e.vendor) ? `<option value="${escapeHtml(e.vendor)}" selected>${escapeHtml(e.vendor)}</option>` : ''}
        </select>
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">발주일 <span class="required">*</span></label>
        <input class="form-input" type="date" id="om-date" value="${e.orderDate || new Date().toISOString().split('T')[0]}" />
      </div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">납기 예정일</label>
        <input class="form-input" type="date" id="om-delivery" value="${e.deliveryDate || dueDate(e.orderDate, 7)}" />
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">결제 예정일</label>
        <input class="form-input" type="date" id="om-payment" value="${e.paymentDueDate || dueDate(e.orderDate, 30)}" />
      </div>
    </div>
    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">비고</label>
      <input class="form-input" id="om-note" value="${escapeHtml(e.note || '')}" placeholder="메모 (선택)" />
    </div>

    <!-- 품목 테이블 -->
    <div style="margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong style="font-size:14px;">📦 발주 품목</strong>
        <button type="button" class="btn btn-sm btn-outline" id="om-add-item">+ 품목 추가</button>
      </div>
      <div style="border:1px solid var(--border); border-radius:8px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:var(--bg-input);">
              <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">품목명</th>
              <th style="padding:8px 10px; text-align:left; color:var(--text-muted); width:90px;">품목코드</th>
              <th style="padding:8px 10px; text-align:right; color:var(--text-muted); width:80px;">수량</th>
              <th style="padding:8px 10px; text-align:right; color:var(--text-muted); width:110px;">단가 (₩)</th>
              <th style="padding:8px 10px; text-align:right; color:var(--text-muted); width:110px;">금액</th>
              <th style="width:36px;"></th>
            </tr>
          </thead>
          <tbody id="om-items-tbody">
            ${initItems.map((it, i) => renderOrderItemRow(it, i)).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 합계 -->
    <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
      <div style="background:var(--bg-input); border-radius:8px; padding:12px 20px; min-width:240px;">
        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
          <span style="color:var(--text-muted);">공급가액</span>
          <span id="om-supply">₩0</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px;">
          <span style="color:var(--text-muted);">부가세 (10%)</span>
          <span id="om-vat">₩0</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:16px; font-weight:700; border-top:1px solid var(--border); padding-top:8px;">
          <span>합계</span>
          <span id="om-total" style="color:var(--accent);">₩0</span>
        </div>
      </div>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end; border-top:1px solid var(--border); padding-top:12px;">
      <button class="btn btn-outline" id="om-cancel">취소</button>
      <button class="btn btn-primary" id="om-save">${isEdit ? '수정 저장' : '발주서 저장'}</button>
    </div>
  `;

  /* 닫기 */
  body.querySelector('#om-cancel').onclick = () => { modal.style.display = 'none'; };

  /* 거래처 선택 시 결제조건 자동 반영 */
  body.querySelector('#om-vendor').addEventListener('change', e => {
    const opt = e.target.selectedOptions[0];
    const terms = opt?.dataset?.terms;
    const termDays = { cash: 0, transfer: 0, bill30: 30, bill60: 60, bill90: 90 };
    if (terms && termDays[terms] !== undefined) {
      const baseDate = body.querySelector('#om-date').value;
      body.querySelector('#om-payment').value = dueDate(baseDate, termDays[terms] || 30);
    }
  });

  /* 합계 계산 */
  const recalcTotal = () => {
    const rows = body.querySelectorAll('.om-item-row');
    let supply = 0;
    rows.forEach(row => {
      const qty   = toNum(row.querySelector('.om-qty').value);
      const price = toNum(row.querySelector('.om-price').value);
      const amt   = qty * price;
      const amtEl = row.querySelector('.om-amt');
      if (amtEl) amtEl.textContent = amt > 0 ? '₩' + Math.round(amt).toLocaleString('ko-KR') : '-';
      supply += amt;
    });
    const vat   = Math.floor(supply * 0.1);
    const total = supply + vat;
    body.querySelector('#om-supply').textContent = '₩' + Math.round(supply).toLocaleString('ko-KR');
    body.querySelector('#om-vat').textContent    = '₩' + Math.round(vat).toLocaleString('ko-KR');
    body.querySelector('#om-total').textContent  = '₩' + Math.round(total).toLocaleString('ko-KR');
  };
  recalcTotal();

  body.querySelector('#om-items-tbody').addEventListener('input', recalcTotal);

  /* 품목 추가 */
  body.querySelector('#om-add-item').addEventListener('click', () => {
    const tbody = body.querySelector('#om-items-tbody');
    const idx = tbody.querySelectorAll('.om-item-row').length;
    tbody.insertAdjacentHTML('beforeend', renderOrderItemRow({}, idx));
    bindItemRowEvents(body, recalcTotal, items);
    recalcTotal();
  });

  /* 품목 자동 채우기 (품목명 선택 시 단가 자동) */
  bindItemRowEvents(body, recalcTotal, items);

  /* 저장 */
  body.querySelector('#om-save').addEventListener('click', () => {
    const vendor = body.querySelector('#om-vendor').value;
    if (!vendor) { showToast('거래처를 선택해 주세요.', 'warning'); return; }

    const orderItems = [];
    body.querySelectorAll('.om-item-row').forEach(row => {
      const name  = row.querySelector('.om-name').value.trim();
      const code  = row.querySelector('.om-code').value.trim();
      const qty   = toNum(row.querySelector('.om-qty').value);
      const price = toNum(row.querySelector('.om-price').value);
      if (name && qty > 0) orderItems.push({ name, itemCode: code, qty, price });
    });

    if (!orderItems.length) { showToast('발주 품목을 1개 이상 입력해 주세요.', 'warning'); return; }

    const orderDate = body.querySelector('#om-date').value;
    const newOrder = {
      id:              editOrder?.id || (Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
      orderNo:         editOrder?.orderNo || genOrderNo(orders, orderDate),
      orderDate,
      deliveryDate:    body.querySelector('#om-delivery').value,
      paymentDueDate:  body.querySelector('#om-payment').value,
      vendor,
      note:            body.querySelector('#om-note').value.trim(),
      items:           orderItems,
      status:          editOrder?.status || 'draft',
      createdAt:       editOrder?.createdAt || new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
      payableEntryId:  editOrder?.payableEntryId || '',
      taxInvoiceId:    editOrder?.taxInvoiceId || '',
    };

    const updated = isEdit
      ? orders.map(o => o.id === editOrder.id ? newOrder : o)
      : [...orders, newOrder];

    setState({ purchaseOrders: updated });
    addAuditLog(isEdit ? '발주수정' : '발주등록', newOrder.orderNo, { vendor, total: orderTotal(newOrder) });
    showToast(`발주서 ${newOrder.orderNo} ${isEdit ? '수정' : '저장'} 완료!`, 'success');
    modal.style.display = 'none';
    renderOrdersPage(container, navigateTo);
  });
}

function renderOrderItemRow(it, idx) {
  return `
    <tr class="om-item-row" style="border-top:1px solid var(--border);">
      <td style="padding:6px 8px;">
        <input class="form-input om-name" list="om-item-list" value="${escapeHtml(it.name || '')}" placeholder="품목명" style="min-width:140px;" />
      </td>
      <td style="padding:6px 8px;">
        <input class="form-input om-code" value="${escapeHtml(it.itemCode || '')}" placeholder="코드" style="width:80px; font-size:11px;" />
      </td>
      <td style="padding:6px 8px;">
        <input class="form-input om-qty" type="number" min="1" value="${it.qty || ''}" placeholder="0" style="width:70px; text-align:right;" />
      </td>
      <td style="padding:6px 8px;">
        <input class="form-input om-price" type="number" min="0" value="${it.price || ''}" placeholder="0" style="width:100px; text-align:right;" />
      </td>
      <td style="padding:6px 8px; text-align:right; font-weight:600;" class="om-amt">-</td>
      <td style="padding:6px 4px; text-align:center;">
        <button type="button" class="btn-icon btn-icon-danger om-remove" style="font-size:12px;">✕</button>
      </td>
    </tr>`;
}

function bindItemRowEvents(body, recalcTotal, itemsMaster) {
  body.querySelectorAll('.om-name').forEach(input => {
    input.addEventListener('change', () => {
      const name = input.value.trim();
      const master = itemsMaster.find(it => it.itemName === name);
      if (master) {
        const row = input.closest('.om-item-row');
        const codeEl  = row?.querySelector('.om-code');
        const priceEl = row?.querySelector('.om-price');
        if (codeEl  && !codeEl.value)  codeEl.value  = master.itemCode || '';
        if (priceEl && !priceEl.value) priceEl.value = master.unitPrice || '';
        recalcTotal();
      }
    });
  });
  body.querySelectorAll('.om-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const rows = body.querySelectorAll('.om-item-row');
      if (rows.length > 1) { btn.closest('.om-item-row').remove(); recalcTotal(); }
    });
  });
}

/* ═══════════════════════════════════════════════════════════
   발주서 상세 슬라이드오버
═══════════════════════════════════════════════════════════ */
function openOrderDetail(container, order) {
  const overlay = container.querySelector('#order-detail-overlay');
  const panel   = container.querySelector('#order-detail-panel');
  overlay.style.display = 'block';

  const s = STATUS[order.status] || STATUS.draft;
  const total = orderTotal(order);
  const supply = total;
  const vat    = Math.floor(supply * 0.1);

  panel.innerHTML = `
    <div style="padding:20px 24px 16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;">
      <div>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span style="background:${s.bg}; color:${s.color}; padding:3px 10px; border-radius:10px; font-size:11px; font-weight:700;">${s.icon} ${s.text}</span>
        </div>
        <h2 style="font-size:20px; font-weight:700; margin:0 0 2px;">${escapeHtml(order.orderNo || '')}</h2>
        <div style="font-size:13px; color:var(--text-muted);">거래처: <strong>${escapeHtml(order.vendor || '-')}</strong></div>
      </div>
      <button id="od-close" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted);">✕</button>
    </div>

    <!-- 날짜 정보 -->
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1px; background:var(--border);">
      ${[
        { label: '발주일',    value: order.orderDate || '-' },
        { label: '납기예정', value: order.deliveryDate || '-' },
        { label: '결제예정', value: order.paymentDueDate || '-' },
      ].map(r => `
        <div style="background:var(--bg-card); padding:10px 14px; text-align:center;">
          <div style="font-size:10px; color:var(--text-muted);">${r.label}</div>
          <div style="font-size:13px; font-weight:600;">${r.value}</div>
        </div>`).join('')}
    </div>

    <div style="padding:16px 24px;">
      <!-- 품목 목록 -->
      <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:8px; letter-spacing:.05em;">발주 품목</div>
      <div style="border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:16px;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:var(--bg-input);">
              <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">품목명</th>
              <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">코드</th>
              <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">수량</th>
              <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">단가</th>
              <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">금액</th>
              ${order.receivedItems ? '<th style="padding:8px 10px; text-align:right; color:var(--text-muted);">입고</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${(order.items || []).map((it, i) => {
              const amt = toNum(it.qty) * toNum(it.price);
              const received = (order.receivedItems || {})[i] || 0;
              return `<tr style="border-top:1px solid var(--border);">
                <td style="padding:8px 10px;">${escapeHtml(it.name)}</td>
                <td style="padding:8px 10px; font-size:11px; color:var(--text-muted);">${escapeHtml(it.itemCode || '-')}</td>
                <td style="padding:8px 10px; text-align:right;">${toNum(it.qty).toLocaleString('ko-KR')}</td>
                <td style="padding:8px 10px; text-align:right;">${fmt(it.price)}</td>
                <td style="padding:8px 10px; text-align:right; font-weight:600;">${fmt(amt)}</td>
                ${order.receivedItems ? `<td style="padding:8px 10px; text-align:right; color:${received >= toNum(it.qty) ? 'var(--success)' : 'var(--warning)'};">${received}</td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- 합계 -->
      <div style="display:flex; justify-content:flex-end; margin-bottom:16px;">
        <div style="background:var(--bg-input); border-radius:8px; padding:12px 20px; min-width:220px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
            <span style="color:var(--text-muted);">공급가액</span><span>${fmt(supply)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:8px;">
            <span style="color:var(--text-muted);">부가세</span><span>${fmt(vat)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:700; font-size:16px; border-top:1px solid var(--border); padding-top:8px;">
            <span>합계</span><span style="color:var(--accent);">${fmt(supply + vat)}</span>
          </div>
        </div>
      </div>

      ${order.note ? `<div style="background:var(--bg-input); border-radius:6px; padding:10px; font-size:13px; color:var(--text-muted); margin-bottom:16px;">📝 ${escapeHtml(order.note)}</div>` : ''}
      ${order.taxInvoiceId ? `<div style="background:rgba(63,185,80,.1); border:1px solid var(--success); border-radius:6px; padding:10px; font-size:13px; color:var(--success);">✅ 세금계산서 발행 완료 (${order.taxInvoiceId})</div>` : ''}
    </div>
  `;

  panel.querySelector('#od-close').addEventListener('click', () => { overlay.style.display = 'none'; });
}

/* ═══════════════════════════════════════════════════════════
   입고 처리 모달 (부분입고 지원)
═══════════════════════════════════════════════════════════ */
function openReceiveModal(container, order, navigateTo) {
  const modal = container.querySelector('#receive-modal');
  const body  = container.querySelector('#receive-modal-body');
  container.querySelector('#receive-modal-title').textContent = `📦 입고 처리 - ${order.orderNo}`;
  modal.style.display = 'flex';

  const prevReceived = order.receivedItems || {};

  body.innerHTML = `
    <div style="margin-bottom:12px; font-size:13px; color:var(--text-muted);">
      거래처: <strong style="color:var(--text-primary);">${escapeHtml(order.vendor)}</strong> · 발주일: ${order.orderDate}
    </div>
    <div style="border:1px solid var(--border); border-radius:8px; overflow:hidden; margin-bottom:16px;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:var(--bg-input);">
            <th style="padding:8px 10px; text-align:left; color:var(--text-muted);">품목명</th>
            <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">발주수량</th>
            <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">기입고</th>
            <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">이번 입고 <span class="required">*</span></th>
            <th style="padding:8px 10px; text-align:right; color:var(--text-muted);">단가</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map((it, i) => {
            const ordered   = toNum(it.qty);
            const already   = toNum(prevReceived[i] || 0);
            const remaining = ordered - already;
            return `<tr style="border-top:1px solid var(--border);">
              <td style="padding:8px 10px;">${escapeHtml(it.name)}</td>
              <td style="padding:8px 10px; text-align:right;">${ordered.toLocaleString('ko-KR')}</td>
              <td style="padding:8px 10px; text-align:right; color:var(--text-muted);">${already.toLocaleString('ko-KR')}</td>
              <td style="padding:8px 10px; text-align:right;">
                <input type="number" class="form-input receive-qty" data-idx="${i}" data-max="${remaining}"
                  value="${remaining}" min="0" max="${remaining}"
                  style="width:80px; text-align:right; ${remaining <= 0 ? 'opacity:.5;' : ''}"
                  ${remaining <= 0 ? 'disabled' : ''} />
              </td>
              <td style="padding:8px 10px; text-align:right; font-size:12px; color:var(--text-muted);">${fmt(it.price)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px;">
      <div class="form-group" style="margin:0;">
        <label class="form-label">입고일 <span class="required">*</span></label>
        <input class="form-input" type="date" id="receive-date" value="${new Date().toISOString().split('T')[0]}" />
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">창고</label>
        <input class="form-input" id="receive-warehouse" placeholder="입고 창고 (선택)" />
      </div>
    </div>
    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">비고</label>
      <input class="form-input" id="receive-note" placeholder="입고 비고" />
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end; border-top:1px solid var(--border); padding-top:12px;">
      <button class="btn btn-outline" id="receive-cancel">취소</button>
      <button class="btn btn-primary" id="receive-confirm">입고 처리</button>
    </div>
  `;

  body.querySelector('#receive-cancel').onclick = () => { modal.style.display = 'none'; };

  body.querySelector('#receive-confirm').addEventListener('click', () => {
    const state   = getState();
    const orders  = state.purchaseOrders || [];
    const receiveDate  = body.querySelector('#receive-date').value;
    const warehouse    = body.querySelector('#receive-warehouse').value.trim();
    const receiveNote  = body.querySelector('#receive-note').value.trim();

    /* 입고 수량 수집 */
    const receiveQtys = {};
    let totalReceiving = 0;
    body.querySelectorAll('.receive-qty').forEach(input => {
      const idx = parseInt(input.dataset.idx);
      const qty = Math.max(0, Math.min(toNum(input.value), toNum(input.dataset.max)));
      receiveQtys[idx] = qty;
      totalReceiving += qty;
    });

    if (totalReceiving <= 0) { showToast('입고 수량을 입력해 주세요.', 'warning'); return; }

    /* 재고 반영 + 트랜잭션 기록 */
    (order.items || []).forEach((it, i) => {
      const qty = receiveQtys[i] || 0;
      if (qty <= 0) return;
      addTransaction({
        type: 'in', date: receiveDate,
        itemName: it.name, itemCode: it.itemCode || '',
        quantity: qty, unitPrice: toNum(it.price),
        vendor: order.vendor,
        warehouse: warehouse || '',
        note: `발주 ${order.orderNo} 입고${receiveNote ? ' - ' + receiveNote : ''}`,
      });
    });

    /* 입고 수량 누적 업데이트 */
    const newReceived = { ...prevReceived };
    (order.items || []).forEach((_, i) => {
      newReceived[i] = (toNum(prevReceived[i] || 0)) + (receiveQtys[i] || 0);
    });

    /* 전량 입고 여부 체크 */
    const allComplete = (order.items || []).every((it, i) => toNum(newReceived[i] || 0) >= toNum(it.qty));
    const newStatus = allComplete ? 'complete' : 'partial';

    /* 미지급금 생성 (완료 시) */
    const accountEntries = [...(state.accountEntries || [])];
    let payableEntryId = order.payableEntryId || '';
    let payableCreated = false;
    if (allComplete && !order.payableEntryId) {
      const total = orderTotal(order);
      if (total > 0) {
        const entry = {
          id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'payable', vendorName: order.vendor, amount: total,
          currency: 'KRW', date: receiveDate,
          dueDate: order.paymentDueDate || dueDate(receiveDate, 30),
          description: `발주 ${order.orderNo} 입고 - 미지급금`,
          settled: false, source: 'purchase-order',
          sourceOrderId: order.id, sourceOrderNo: order.orderNo,
        };
        accountEntries.push(entry);
        payableEntryId = entry.id;
        payableCreated = true;
      }
    }

    const updatedOrders = orders.map(o => o.id === order.id ? {
      ...o, status: newStatus,
      receivedItems: newReceived,
      receivedAt: allComplete ? new Date().toISOString() : o.receivedAt,
      payableEntryId,
    } : o);

    setState({ purchaseOrders: updatedOrders, accountEntries });
    addAuditLog('발주입고', order.orderNo, { vendor: order.vendor, status: newStatus, qty: totalReceiving });

    showToast(
      allComplete
        ? `전량 입고 완료! 재고에 반영되었습니다.${payableCreated ? ' 미지급금도 생성되었습니다.' : ''}`
        : `부분 입고 처리 완료! (${totalReceiving}개 입고)`,
      'success'
    );
    modal.style.display = 'none';
    renderOrdersPage(container, navigateTo);
  });
}

/* ═══════════════════════════════════════════════════════════
   매입 세금계산서 생성
═══════════════════════════════════════════════════════════ */
function generateTaxInvoice(order, orders, navigateTo, container) {
  if (!confirm(`발주서 ${order.orderNo}에 대한 매입 세금계산서를 발행하시겠습니까?`)) return;

  const state  = getState();
  const supply = orderTotal(order);
  const vat    = Math.floor(supply * 0.1);
  const invoiceNo = `TI-${order.orderNo}`;

  const taxInvoice = {
    id:          `tax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    invoiceNo,
    type:        'purchase',
    vendor:      order.vendor,
    date:        new Date().toISOString().split('T')[0],
    supplyAmt:   supply,
    vatAmt:      vat,
    totalAmt:    supply + vat,
    items:       (order.items || []).map(it => ({
      name: it.name, itemCode: it.itemCode || '',
      qty: it.qty, price: it.price,
      supply: toNum(it.qty) * toNum(it.price),
    })),
    sourceOrderId:  order.id,
    sourceOrderNo:  order.orderNo,
    createdAt:      new Date().toISOString(),
  };

  const updatedOrders = orders.map(o => o.id === order.id ? { ...o, taxInvoiceId: taxInvoice.id } : o);
  const taxInvoices = [...(state.taxInvoices || []), taxInvoice];

  setState({ purchaseOrders: updatedOrders, taxInvoices });
  addAuditLog('세금계산서발행', invoiceNo, { vendor: order.vendor, total: supply + vat });
  showToast(`매입 세금계산서 ${invoiceNo} 발행 완료!`, 'success');
  renderOrdersPage(container, navigateTo);
}
