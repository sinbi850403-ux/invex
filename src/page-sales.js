/**
 * page-sales.js - 수주 관리 (판매 플로우 완전 구현)
 *
 * 파이프라인: 견적서 작성 → 수주 확정 → 부분/전량 출고 → 거래명세서 → 세금계산서 → 미수금
 *
 * 상태 흐름:
 *   draft(견적) → confirmed(수주확정) → partial(부분출고) → complete(출고완료) / cancelled(취소)
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { addTransaction } from './store.js';
import { addAuditLog } from './audit-log.js';

const STATUS = {
  draft:     { label: '견적',     color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  confirmed: { label: '수주확정', color: '#2563eb', bg: 'rgba(37,99,235,0.12)'  },
  partial:   { label: '부분출고', color: '#d97706', bg: 'rgba(217,119,6,0.12)'  },
  complete:  { label: '출고완료', color: '#16a34a', bg: 'rgba(22,163,74,0.12)'  },
  cancelled: { label: '취소',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
};

let currentTab = 'all';

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────
function orderTotal(order) {
  const supply = (order.items || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  return { supply, vat: Math.floor(supply * 0.1), total: supply + Math.floor(supply * 0.1) };
}

function genOrderNo(orders, date) {
  const d   = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const seq = String(orders.filter(o => (o.orderNo || '').includes(d)).length + 1).padStart(3, '0');
  return `SO-${d}-${seq}`;
}

function dueDate(base, days) {
  const d = new Date(base || Date.now());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmt  = v => (parseFloat(v) || 0).toLocaleString('ko-KR');
const toNum = v => parseFloat(String(v).replace(/,/g, '')) || 0;

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── 메인 렌더 ──────────────────────────────────────────────────────────────
export function renderSalesPage(container, navigateTo) {
  const state  = getState();
  const orders = state.salesOrders || [];
  const today  = new Date().toISOString().slice(0, 10);

  const kpi = {
    all:       orders.length,
    active:    orders.filter(o => o.status === 'confirmed' || o.status === 'partial').length,
    complete:  orders.filter(o => o.status === 'complete' && (o.shippedAt || '').startsWith(today.slice(0,7))).length,
    draft:     orders.filter(o => o.status === 'draft').length,
  };

  const pendingReceivable = (state.accountEntries || [])
    .filter(e => e.type === 'receivable' && !e.settled)
    .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">수주 관리</h1>
        <div class="page-desc">견적 → 수주확정 → 출고 → 세금계산서 → 미수금 파이프라인을 관리합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-new-order">+ 견적/수주 작성</button>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));">
      <div class="stat-card">
        <div class="stat-label">진행중 수주</div>
        <div class="stat-value" style="color:#2563eb;">${kpi.active}건</div>
        <div class="stat-sub">확정+부분출고</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">미수금 (받을 돈)</div>
        <div class="stat-value text-success">₩${fmt(pendingReceivable)}</div>
        <div class="stat-sub">미정산 누적</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">이번달 출고완료</div>
        <div class="stat-value text-accent">${kpi.complete}건</div>
        <div class="stat-sub">${today.slice(0,7)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">전체 수주</div>
        <div class="stat-value">${kpi.all}건</div>
        <div class="stat-sub">누적</div>
      </div>
    </div>

    <!-- 탭 -->
    <div class="scan-mode-bar" style="margin-bottom:12px;">
      <button class="scan-mode-btn ${currentTab==='all'?'active':''}" data-tab="all">전체</button>
      <button class="scan-mode-btn ${currentTab==='active'?'active':''}" data-tab="active">진행중</button>
      <button class="scan-mode-btn ${currentTab==='complete'?'active':''}" data-tab="complete">완료</button>
      <button class="scan-mode-btn ${currentTab==='cancelled'?'active':''}" data-tab="cancelled">취소</button>
    </div>

    <div class="card card-flush" id="sales-table-wrap">
      ${renderSalesTable(orders)}
    </div>

    <!-- 수주 작성/수정 모달 -->
    <div class="modal-overlay" id="sales-modal" style="display:none;">
      <div class="modal" style="max-width:760px; max-height:92vh; overflow-y:auto;">
        <div class="modal-header">
          <h2 class="modal-title" id="sales-modal-title"> 견적/수주 작성</h2>
          <button class="modal-close" id="sales-modal-close"></button>
        </div>
        <div class="modal-body" id="sales-modal-body"></div>
      </div>
    </div>

    <!-- 출고 처리 모달 -->
    <div class="modal-overlay" id="ship-modal" style="display:none;">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h2 class="modal-title" id="ship-modal-title"> 출고 처리</h2>
          <button class="modal-close" id="ship-modal-close"></button>
        </div>
        <div class="modal-body" id="ship-modal-body"></div>
      </div>
    </div>

    <!-- 상세 슬라이드오버 -->
    <div id="sales-detail-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:1100;" ></div>
    <div id="sales-detail-panel" style="display:none; position:fixed; top:0; right:0; height:100%; width:min(520px,100vw); background:var(--bg-card); border-left:1px solid var(--border); z-index:1101; overflow-y:auto; box-shadow:-4px 0 24px rgba(0,0,0,0.3);"></div>
  `;

  // 탭 전환
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      container.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab));
      container.querySelector('#sales-table-wrap').innerHTML = renderSalesTable(orders);
      bindSalesActions(container, navigateTo);
    });
  });

  container.querySelector('#btn-new-order').addEventListener('click', () => openSalesModal(container, null, navigateTo));
  container.querySelector('#sales-modal-close').addEventListener('click', () => { container.querySelector('#sales-modal').style.display = 'none'; });
  container.querySelector('#ship-modal-close').addEventListener('click', () => { container.querySelector('#ship-modal').style.display = 'none'; });

  bindSalesActions(container, navigateTo);
}

// ─── 수주 테이블 ─────────────────────────────────────────────────────────────
function renderSalesTable(orders) {
  let filtered = orders;
  if (currentTab === 'active')    filtered = orders.filter(o => o.status === 'confirmed' || o.status === 'partial');
  if (currentTab === 'complete')  filtered = orders.filter(o => o.status === 'complete');
  if (currentTab === 'cancelled') filtered = orders.filter(o => o.status === 'cancelled');

  if (!filtered.length) return `<div class="empty-state"><div class="icon"></div><div class="msg">수주 내역이 없습니다</div><div class="sub">오른쪽 상단 '견적/수주 작성'으로 시작하세요.</div></div>`;

  const today = new Date().toISOString().slice(0, 10);

  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>수주번호</th>
            <th>고객사</th>
            <th>품목 (대표)</th>
            <th class="text-right">공급가</th>
            <th class="text-right">부가세</th>
            <th class="text-right">합계</th>
            <th>출고예정일</th>
            <th>상태</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.slice().reverse().map(order => {
            const s = STATUS[order.status] || STATUS.draft;
            const { supply, vat, total } = orderTotal(order);
            const itemPreview = (order.items || []).slice(0, 2).map(it => it.name).join(', ') + ((order.items || []).length > 2 ? ` 외 ${(order.items||[]).length-2}건` : '');
            const overdue = order.deliveryDate && order.deliveryDate < today && order.status !== 'complete' && order.status !== 'cancelled';
            return `
              <tr>
                <td>
                  <a href="#" class="sales-detail-link" data-id="${order.id}" style="color:var(--accent);text-decoration:none;font-weight:600;">${escapeHtml(order.orderNo)}</a>
                  <div style="font-size:11px;color:var(--text-muted);">${order.orderDate || '-'}</div>
                </td>
                <td>
                  <strong>${escapeHtml(order.customer)}</strong>
                  ${order.customerCode ? `<div style="font-size:11px;color:var(--text-muted);">${escapeHtml(order.customerCode)}</div>` : ''}
                </td>
                <td style="font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(itemPreview)}</td>
                <td class="text-right">₩${fmt(supply)}</td>
                <td class="text-right" style="color:var(--text-muted);">₩${fmt(vat)}</td>
                <td class="text-right" style="font-weight:700;">₩${fmt(total)}</td>
                <td style="${overdue?'color:var(--danger);font-weight:600;':''}">${order.deliveryDate || '-'}</td>
                <td>
                  <span style="background:${s.bg};color:${s.color};padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;">${s.label}</span>
                </td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${order.status === 'draft' ? `<button class="btn btn-xs btn-primary sales-btn-confirm" data-id="${order.id}">확정</button>` : ''}
                    ${order.status === 'draft' ? `<button class="btn btn-xs btn-outline sales-btn-edit" data-id="${order.id}">수정</button>` : ''}
                    ${(order.status === 'confirmed' || order.status === 'partial') ? `<button class="btn btn-xs btn-outline sales-btn-ship" data-id="${order.id}" style="color:#16a34a;border-color:#16a34a;">출고</button>` : ''}
                    ${order.status === 'complete' ? `<button class="btn btn-xs btn-outline sales-btn-invoice" data-id="${order.id}" style="color:#7c3aed;border-color:#7c3aed;">세금계산서</button>` : ''}
                    ${(order.status !== 'cancelled' && order.status !== 'complete') ? `<button class="btn btn-xs btn-outline sales-btn-cancel" data-id="${order.id}" style="color:var(--danger);border-color:var(--danger);">취소</button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── 수주 모달 ───────────────────────────────────────────────────────────────
function openSalesModal(container, editOrder, navigateTo) {
  const state   = getState();
  const vendors = (state.vendorMaster || []).filter(v => v.type === 'customer' || v.type === 'both');
  const items   = state.mappedData || [];
  const orders  = state.salesOrders || [];

  const e = editOrder || {};
  const isEdit = !!editOrder;

  const body = container.querySelector('#sales-modal-body');
  container.querySelector('#sales-modal-title').textContent = isEdit ? ` 수주 수정 - ${e.orderNo}` : ' 견적/수주 작성';

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div>
        <label class="form-label">고객사 *</label>
        <select class="form-input" id="sm-customer">
          <option value="">-- 고객사 선택 --</option>
          ${vendors.map(v => `<option value="${escapeHtml(v.name)}" data-code="${escapeHtml(v.code||'')}" data-days="${v.paymentTermDays||30}" ${e.customer===v.name?'selected':''}>${escapeHtml(v.name)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="form-label">고객사 코드</label>
        <input class="form-input" id="sm-customer-code" type="text" value="${escapeHtml(e.customerCode||'')}" readonly style="background:var(--bg-input,#1e2635);" />
      </div>
      <div>
        <label class="form-label">수주일 *</label>
        <input class="form-input" id="sm-date" type="date" value="${e.orderDate || new Date().toISOString().slice(0,10)}" />
      </div>
      <div>
        <label class="form-label">출고예정일</label>
        <input class="form-input" id="sm-delivery" type="date" value="${e.deliveryDate || dueDate(null,7)}" />
      </div>
      <div>
        <label class="form-label">결제예정일</label>
        <input class="form-input" id="sm-payment" type="date" value="${e.paymentDueDate || dueDate(null,30)}" />
      </div>
      <div>
        <label class="form-label">메모</label>
        <input class="form-input" id="sm-note" type="text" value="${escapeHtml(e.note||'')}" placeholder="특이사항" />
      </div>
    </div>

    <!-- 품목 라인 -->
    <div style="margin-bottom:8px;font-weight:600;font-size:14px;">품목</div>
    <div class="table-wrapper" style="margin-bottom:8px;">
      <table class="data-table" style="min-width:600px;">
        <thead>
          <tr>
            <th style="width:200px;">품목명</th>
            <th style="width:110px;">품목코드</th>
            <th style="width:80px;text-align:right;">수량</th>
            <th style="width:120px;text-align:right;">단가 (판매)</th>
            <th style="width:120px;text-align:right;">금액</th>
            <th style="width:36px;"></th>
          </tr>
        </thead>
        <tbody id="sm-items-tbody">
          ${(e.items || [{}]).map((it, idx) => renderSalesItemRow(it, idx)).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn btn-outline btn-sm" id="sm-add-item">+ 품목 추가</button>

    <!-- 합계 -->
    <div style="margin-top:16px;padding:12px 16px;background:var(--bg-input,#1e2635);border-radius:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
      <div><div style="font-size:11px;color:var(--text-muted);">공급가액</div><div style="font-size:18px;font-weight:700;" id="sm-supply">₩0</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">부가세(10%)</div><div style="font-size:18px;font-weight:700;color:var(--text-muted);" id="sm-vat">₩0</div></div>
      <div><div style="font-size:11px;color:var(--text-muted);">합계</div><div style="font-size:22px;font-weight:700;color:var(--accent);" id="sm-total">₩0</div></div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:20px;">
      <button class="btn btn-outline" id="sm-cancel">취소</button>
      <button class="btn btn-primary" id="sm-save"> 저장</button>
    </div>
  `;

  // 고객사 선택 시 코드 자동채움 + 결제일 자동계산
  body.querySelector('#sm-customer').addEventListener('change', function() {
    const opt = this.options[this.selectedIndex];
    body.querySelector('#sm-customer-code').value = opt.dataset.code || '';
    const days = parseInt(opt.dataset.days || '30', 10);
    const orderDate = body.querySelector('#sm-date').value;
    body.querySelector('#sm-payment').value = dueDate(orderDate, days);
  });

  // 아이템 자동완성 바인딩
  bindSalesItemEvents(body, recalc, items);

  function recalc() {
    let supply = 0;
    body.querySelectorAll('.sm-item-row').forEach(row => {
      const qty   = toNum(row.querySelector('.sm-qty').value);
      const price = toNum(row.querySelector('.sm-price').value);
      const amt   = qty * price;
      const amtEl = row.querySelector('.sm-amt');
      if (amtEl) amtEl.textContent = amt > 0 ? '₩' + Math.round(amt).toLocaleString('ko-KR') : '-';
      supply += amt;
    });
    const vat = Math.floor(supply * 0.1);
    body.querySelector('#sm-supply').textContent = '₩' + Math.round(supply).toLocaleString('ko-KR');
    body.querySelector('#sm-vat').textContent    = '₩' + Math.round(vat).toLocaleString('ko-KR');
    body.querySelector('#sm-total').textContent  = '₩' + (supply + vat).toLocaleString('ko-KR');
  }
  recalc();

  body.querySelector('#sm-items-tbody').addEventListener('input', recalc);

  body.querySelector('#sm-add-item').addEventListener('click', () => {
    const tbody = body.querySelector('#sm-items-tbody');
    const idx = tbody.querySelectorAll('.sm-item-row').length;
    tbody.insertAdjacentHTML('beforeend', renderSalesItemRow({}, idx));
    bindSalesItemEvents(body, recalc, items);
    recalc();
  });

  body.querySelector('#sm-cancel').addEventListener('click', () => { container.querySelector('#sales-modal').style.display = 'none'; });

  body.querySelector('#sm-save').addEventListener('click', () => {
    const customer = body.querySelector('#sm-customer').value;
    if (!customer) { showToast('고객사를 선택해 주세요.', 'warning'); return; }

    const orderItems = [];
    body.querySelectorAll('.sm-item-row').forEach(row => {
      const name  = row.querySelector('.sm-name').value.trim();
      const code  = row.querySelector('.sm-code').value.trim();
      const qty   = toNum(row.querySelector('.sm-qty').value);
      const price = toNum(row.querySelector('.sm-price').value);
      if (name && qty > 0) orderItems.push({ name, itemCode: code, qty, price });
    });
    if (!orderItems.length) { showToast('품목을 1개 이상 입력해 주세요.', 'warning'); return; }

    const orderDate = body.querySelector('#sm-date').value;
    const newOrder = {
      id:               editOrder?.id || crypto.randomUUID(),
      orderNo:          editOrder?.orderNo || genOrderNo(orders, orderDate),
      orderDate,
      deliveryDate:     body.querySelector('#sm-delivery').value,
      paymentDueDate:   body.querySelector('#sm-payment').value,
      customer,
      customerCode:     body.querySelector('#sm-customer-code').value.trim(),
      note:             body.querySelector('#sm-note').value.trim(),
      items:            orderItems,
      status:           editOrder?.status || 'draft',
      createdAt:        editOrder?.createdAt || new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
      shippedItems:     editOrder?.shippedItems || {},
      receivableEntryId: editOrder?.receivableEntryId || '',
      taxInvoiceId:     editOrder?.taxInvoiceId || '',
    };

    const allOrders = state.salesOrders || [];
    const updated = isEdit
      ? allOrders.map(o => o.id === editOrder.id ? newOrder : o)
      : [...allOrders, newOrder];

    setState({ salesOrders: updated });
    addAuditLog(isEdit ? '수주수정' : '수주등록', newOrder.orderNo, { customer, total: orderTotal(newOrder).total });
    showToast(`수주서 ${newOrder.orderNo} ${isEdit ? '수정' : '저장'} 완료!`, 'success');
    container.querySelector('#sales-modal').style.display = 'none';
    renderSalesPage(container, navigateTo);
  });

  // datalist
  const dl = document.getElementById('sm-item-datalist') || (() => {
    const d = document.createElement('datalist');
    d.id = 'sm-item-datalist';
    document.body.appendChild(d);
    return d;
  })();
  dl.innerHTML = items.map(it => `<option value="${escapeHtml(it.itemName || '')}">`).join('');

  container.querySelector('#sales-modal').style.display = 'flex';
}

function renderSalesItemRow(it, idx) {
  return `
    <tr class="sm-item-row">
      <td>
        <input class="form-input sm-name" list="sm-item-datalist" value="${escapeHtml(it.name||'')}" placeholder="품목명" style="width:100%;padding:4px 8px;font-size:13px;" />
      </td>
      <td>
        <input class="form-input sm-code" type="text" value="${escapeHtml(it.itemCode||'')}" placeholder="자동" readonly style="width:100%;padding:4px 8px;font-size:12px;background:var(--bg-input);" />
      </td>
      <td>
        <input class="form-input sm-qty" type="number" value="${it.qty||1}" min="1" style="width:70px;text-align:right;padding:4px 6px;" />
      </td>
      <td>
        <input class="form-input sm-price" type="number" value="${it.price||0}" min="0" style="width:110px;text-align:right;padding:4px 6px;" />
      </td>
      <td class="text-right sm-amt" style="font-weight:600;">-</td>
      <td>
        <button class="btn btn-xs btn-outline sm-remove-item" style="color:var(--danger);border-color:var(--danger);"></button>
      </td>
    </tr>
  `;
}

function bindSalesItemEvents(body, recalc, items) {
  body.querySelectorAll('.sm-name').forEach(input => {
    if (input._bound) return;
    input._bound = true;
    input.addEventListener('change', () => {
      const name = input.value.trim();
      const item = items.find(it => (it.itemName || '') === name);
      if (item) {
        const row = input.closest('.sm-item-row');
        row.querySelector('.sm-code').value  = item.itemCode || '';
        row.querySelector('.sm-price').value = item.sellingPrice || item.unitPrice || 0;
        recalc();
      }
    });
  });
  body.querySelectorAll('.sm-remove-item').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', () => {
      const tbody = body.querySelector('#sm-items-tbody');
      if (tbody.querySelectorAll('.sm-item-row').length <= 1) { showToast('최소 1개 품목이 필요합니다.', 'warning'); return; }
      btn.closest('.sm-item-row').remove();
      recalc();
    });
  });
}

// ─── 출고 처리 모달 ──────────────────────────────────────────────────────────
function openShipModal(container, order, navigateTo) {
  const modal = container.querySelector('#ship-modal');
  const body  = container.querySelector('#ship-modal-body');
  container.querySelector('#ship-modal-title').textContent = ` 출고 처리 - ${order.orderNo}`;

  const shipped = order.shippedItems || {};

  body.innerHTML = `
    <div style="margin-bottom:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
      <div><span style="color:var(--text-muted);">고객사:</span> <strong>${escapeHtml(order.customer)}</strong></div>
      <div><span style="color:var(--text-muted);">수주번호:</span> <strong>${escapeHtml(order.orderNo)}</strong></div>
    </div>

    <div class="table-wrapper" style="margin-bottom:16px;">
      <table class="data-table">
        <thead>
          <tr>
            <th>품목명</th>
            <th class="text-right">수주수량</th>
            <th class="text-right">기출고</th>
            <th class="text-right">잔량</th>
            <th class="text-right" style="color:var(--accent);">이번 출고</th>
          </tr>
        </thead>
        <tbody>
          ${(order.items || []).map((it, i) => {
            const alreadyShipped = parseFloat(shipped[i] || 0);
            const remaining = it.qty - alreadyShipped;
            return `
              <tr>
                <td><strong>${escapeHtml(it.name)}</strong><br/><span style="font-size:11px;color:var(--text-muted);">${escapeHtml(it.itemCode||'-')}</span></td>
                <td class="text-right">${it.qty}</td>
                <td class="text-right" style="color:${alreadyShipped>0?'#16a34a':'var(--text-muted)'};">${alreadyShipped}</td>
                <td class="text-right" style="font-weight:600;color:${remaining>0?'var(--text-primary)':'var(--text-muted)'};">${remaining}</td>
                <td class="text-right">
                  <input type="number" class="form-input ship-qty" data-idx="${i}" data-max="${remaining}"
                    value="${remaining}" min="0" max="${remaining}"
                    style="width:80px;text-align:right;padding:4px 6px;" ${remaining<=0?'disabled':''} />
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div>
        <label class="form-label">출고일</label>
        <input class="form-input" id="ship-date" type="date" value="${new Date().toISOString().slice(0,10)}" />
      </div>
      <div>
        <label class="form-label">출고 메모</label>
        <input class="form-input" id="ship-note" type="text" placeholder="배송처, 기사 등" />
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn btn-outline" id="ship-cancel-btn">취소</button>
      <button class="btn btn-primary" id="ship-confirm-btn"> 출고 처리</button>
    </div>
  `;

  body.querySelector('#ship-cancel-btn').addEventListener('click', () => { modal.style.display = 'none'; });

  body.querySelector('#ship-confirm-btn').addEventListener('click', () => {
    const shipDate  = body.querySelector('#ship-date').value;
    const shipNote  = body.querySelector('#ship-note').value.trim();

    let totalShipping = 0;
    const thisShip = {};
    body.querySelectorAll('.ship-qty').forEach(input => {
      const i   = parseInt(input.dataset.idx, 10);
      const qty = parseFloat(input.value) || 0;
      if (qty > parseFloat(input.dataset.max)) { showToast('잔량을 초과할 수 없습니다.', 'warning'); return; }
      thisShip[i] = qty;
      totalShipping += qty;
    });
    if (totalShipping <= 0) { showToast('출고 수량을 1 이상 입력해 주세요.', 'warning'); return; }

    // addTransaction('out') 호출 (품목별)
    const state2 = getState();
    order.items.forEach((it, i) => {
      const qty = thisShip[i] || 0;
      if (qty <= 0) return;
      addTransaction({
        type:       'out',
        itemName:   it.name,
        itemCode:   it.itemCode || '',
        quantity:   qty,
        unitPrice:  it.price,
        date:       shipDate,
        vendor:     order.customer,
        note:       `수주 ${order.orderNo} 출고${shipNote ? ' - ' + shipNote : ''}`,
      });
    });

    // shippedItems 누적 업데이트
    const newShipped = { ...shipped };
    order.items.forEach((_, i) => {
      newShipped[i] = (parseFloat(newShipped[i] || 0)) + (thisShip[i] || 0);
    });

    const allComplete = order.items.every((it, i) => newShipped[i] >= it.qty);
    const newStatus = allComplete ? 'complete' : 'partial';

    // 미수금(receivable) 자동 생성 (완납시)
    const allOrders = state2.salesOrders || [];
    const accountEntries = [...(state2.accountEntries || [])];
    let receivableEntryId = order.receivableEntryId || '';

    if (allComplete && !order.receivableEntryId) {
      const { total } = orderTotal(order);
      const entry = {
        id:          crypto.randomUUID(),
        type:        'receivable',
        vendorName:  order.customer,
        amount:      total,
        dueDate:     order.paymentDueDate || dueDate(shipDate, 30),
        description: `수주 ${order.orderNo} 출고 - 미수금`,
        date:        shipDate,
        settled:     false,
        sourceOrderId: order.id,
        sourceOrderNo: order.orderNo,
      };
      accountEntries.push(entry);
      receivableEntryId = entry.id;
    }

    const updatedOrders = allOrders.map(o => o.id === order.id
      ? { ...o, shippedItems: newShipped, status: newStatus, shippedAt: shipDate, receivableEntryId }
      : o
    );

    setState({ salesOrders: updatedOrders, accountEntries });
    addAuditLog('수주출고', order.orderNo, { customer: order.customer, status: newStatus, qty: totalShipping });

    showToast(
      allComplete
        ? `전량 출고 완료! 재고에 반영되었습니다.${!order.receivableEntryId ? ' 미수금도 생성되었습니다.' : ''}`
        : `부분 출고 처리 완료! (${totalShipping}개)`,
      'success'
    );
    modal.style.display = 'none';
    renderSalesPage(container, navigateTo);
  });

  modal.style.display = 'flex';
}

// ─── 세금계산서 발행 (매출) ───────────────────────────────────────────────────
function generateSalesTaxInvoice(container, order, navigateTo) {
  if (!confirm(`수주서 ${order.orderNo}에 대한 매출 세금계산서를 발행하시겠습니까?`)) return;

  const state2 = getState();
  const { supply, vat, total } = orderTotal(order);

  const invoiceNo = `TI-${order.orderNo}`;
  const existing  = (state2.taxInvoices || []).find(t => t.invoiceNo === invoiceNo);
  if (existing) { showToast('이미 발행된 세금계산서가 있습니다.', 'warning'); return; }

  const taxInvoice = {
    id:         crypto.randomUUID(),
    invoiceNo,
    type:       'sales',
    customer:   order.customer,
    customerCode: order.customerCode || '',
    issueDate:  new Date().toISOString().slice(0, 10),
    supply,
    vat,
    total,
    items:      (order.items || []).map(it => ({
      name: it.name, itemCode: it.itemCode, qty: it.qty,
      price: it.price, amount: it.qty * it.price,
    })),
    sourceOrderNo: order.orderNo,
    sourceOrderId: order.id,
    note:       order.note || '',
  };

  const allOrders = state2.salesOrders || [];
  const updatedOrders = allOrders.map(o => o.id === order.id ? { ...o, taxInvoiceId: taxInvoice.id } : o);
  const taxInvoices   = [...(state2.taxInvoices || []), taxInvoice];

  setState({ salesOrders: updatedOrders, taxInvoices });
  addAuditLog('매출세금계산서발행', invoiceNo, { customer: order.customer, total });
  showToast(`매출 세금계산서 ${invoiceNo} 발행 완료!`, 'success');
  renderSalesPage(container, navigateTo);
}

// ─── 상세 슬라이드오버 ────────────────────────────────────────────────────────
function openSalesDetail(container, order) {
  const overlay = container.querySelector('#sales-detail-overlay');
  const panel   = container.querySelector('#sales-detail-panel');
  const { supply, vat, total } = orderTotal(order);
  const shipped = order.shippedItems || {};
  const s = STATUS[order.status] || STATUS.draft;

  panel.innerHTML = `
    <div style="padding:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
          <span style="background:${s.bg};color:${s.color};padding:3px 12px;border-radius:12px;font-size:12px;font-weight:600;">${s.label}</span>
          <h2 style="font-size:20px;font-weight:700;margin:6px 0 2px;">${escapeHtml(order.orderNo)}</h2>
          <div style="font-size:13px;color:var(--text-muted);">발행일: ${order.orderDate || '-'}</div>
        </div>
        <button id="sales-detail-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);"></button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:13px;">
        ${[
          { label: '고객사',    value: order.customer },
          { label: '고객사코드', value: order.customerCode || '-' },
          { label: '출고예정일', value: order.deliveryDate || '-' },
          { label: '결제예정일', value: order.paymentDueDate || '-' },
          { label: '메모',      value: order.note || '-' },
        ].map(r => `
          <div style="padding:8px;background:var(--bg-input,#1e2635);border-radius:6px;">
            <div style="color:var(--text-muted);font-size:11px;">${r.label}</div>
            <div style="font-weight:600;">${escapeHtml(r.value)}</div>
          </div>
        `).join('')}
        <div style="padding:8px;background:var(--bg-input,#1e2635);border-radius:6px;">
          <div style="color:var(--text-muted);font-size:11px;">합계</div>
          <div style="font-weight:700;color:var(--accent);">₩${fmt(total)}</div>
        </div>
      </div>

      <div style="font-weight:600;margin-bottom:8px;">품목</div>
      <div class="table-wrapper" style="margin-bottom:16px;">
        <table class="data-table">
          <thead><tr><th>품목명</th><th class="text-right">수주</th><th class="text-right">출고</th><th class="text-right">잔량</th><th class="text-right">금액</th></tr></thead>
          <tbody>
            ${(order.items || []).map((it, i) => {
              const s2 = parseFloat(shipped[i] || 0);
              return `<tr>
                <td><strong>${escapeHtml(it.name)}</strong><br/><span style="font-size:11px;color:var(--text-muted);">${escapeHtml(it.itemCode||'-')}</span></td>
                <td class="text-right">${it.qty}</td>
                <td class="text-right" style="color:#16a34a;">${s2}</td>
                <td class="text-right" style="color:${it.qty-s2>0?'var(--danger)':'var(--text-muted)'};">${it.qty - s2}</td>
                <td class="text-right">₩${fmt(it.qty * it.price)}</td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="4" style="text-align:right;">공급가 / 부가세 / 합계</td>
              <td class="text-right">₩${fmt(supply)} / ₩${fmt(vat)} / ₩${fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${order.taxInvoiceId ? `<div style="padding:8px 12px;background:rgba(124,58,237,0.1);border-radius:6px;font-size:12px;color:#7c3aed;margin-bottom:12px;"> 세금계산서 발행 완료 (TI-${order.orderNo})</div>` : ''}
      ${order.receivableEntryId ? `<div style="padding:8px 12px;background:rgba(22,163,74,0.1);border-radius:6px;font-size:12px;color:#16a34a;margin-bottom:12px;"> 미수금 등록 완료</div>` : ''}
    </div>
  `;

  overlay.style.display = '';
  panel.style.display = '';

  panel.querySelector('#sales-detail-close').addEventListener('click', () => {
    overlay.style.display = 'none';
    panel.style.display = 'none';
  });
  overlay.addEventListener('click', () => {
    overlay.style.display = 'none';
    panel.style.display = 'none';
  }, { once: true });
}

// ─── 액션 바인딩 ─────────────────────────────────────────────────────────────
function bindSalesActions(container, navigateTo) {
  const state2 = getState();
  const orders = state2.salesOrders || [];

  container.querySelectorAll('.sales-detail-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const order = orders.find(o => o.id === a.dataset.id);
      if (order) openSalesDetail(container, order);
    });
  });

  container.querySelectorAll('.sales-btn-confirm').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (!order || !confirm(`수주서 ${order.orderNo}를 확정하시겠습니까?\n확정 후에는 수정할 수 없습니다.`)) return;
      const updated = orders.map(o => o.id === order.id ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o);
      setState({ salesOrders: updated });
      addAuditLog('수주확정', order.orderNo, { customer: order.customer });
      showToast(`수주서 ${order.orderNo} 확정 완료!`, 'success');
      renderSalesPage(container, navigateTo);
    });
  });

  container.querySelectorAll('.sales-btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) openSalesModal(container, order, navigateTo);
    });
  });

  container.querySelectorAll('.sales-btn-ship').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) openShipModal(container, order, navigateTo);
    });
  });

  container.querySelectorAll('.sales-btn-invoice').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) generateSalesTaxInvoice(container, order, navigateTo);
    });
  });

  container.querySelectorAll('.sales-btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (!order || !confirm(`수주서 ${order.orderNo}를 취소하시겠습니까?`)) return;
      const updated = orders.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() } : o);
      setState({ salesOrders: updated });
      showToast(`수주서 ${order.orderNo} 취소 처리`, 'info');
      renderSalesPage(container, navigateTo);
    });
  });
}
