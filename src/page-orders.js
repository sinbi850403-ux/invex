/**
 * page-orders.js - 발주 이력 관리
 * 
 * 역할: 발주 생성 → 발송 → 입고 확인의 전체 발주 플로우 관리
 * 왜 필요? → 발주서를 보냈는데 입고가 안 된 건, 지연된 건을 추적
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { addAuditLog } from './audit-log.js';
import { generatePurchaseOrderPDF } from './pdf-generator.js';

export function renderOrdersPage(container, navigateTo) {
  const state = getState();
  const orders = state.purchaseOrders || [];
  const accounts = state.accountEntries || [];
  const currency = state.currency || { code: 'KRW', symbol: '₩', rate: 1 };

  // 상태별 분류
  const statusGroups = {
    pending: orders.filter(o => o.status === 'pending'),
    sent: orders.filter(o => o.status === 'sent'),
    partial: orders.filter(o => o.status === 'partial'),
    complete: orders.filter(o => o.status === 'complete'),
    cancelled: orders.filter(o => o.status === 'cancelled'),
  };

  const statusLabels = {
    pending: { text: '작성중', icon: '📝', color: 'var(--text-muted)', bg: 'rgba(139,148,158,0.15)' },
    sent: { text: '발주완료', icon: '📤', color: '#58a6ff', bg: 'rgba(88,166,255,0.15)' },
    partial: { text: '부분입고', icon: '📦', color: '#d29922', bg: 'rgba(210,153,34,0.15)' },
    complete: { text: '입고완료', icon: '✅', color: 'var(--success)', bg: 'rgba(63,185,80,0.15)' },
    cancelled: { text: '취소', icon: '❌', color: 'var(--danger)', bg: 'rgba(248,81,73,0.15)' },
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📋</span> 발주 이력 관리</h1>
        <div class="page-desc">발주서 생성부터 입고 확인까지 전체 플로우를 관리합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-new-order">+ 신규 발주</button>
      </div>
    </div>

    <!-- 상태별 KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
      ${Object.entries(statusGroups).filter(([k]) => k !== 'cancelled').map(([key, list]) => {
        const s = statusLabels[key];
        return `
          <div class="stat-card">
            <div class="stat-label">${s.icon} ${s.text}</div>
            <div class="stat-value" style="color:${s.color};">${list.length}건</div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- 발주 목록 -->
    <div class="card">
      <div class="card-title">📋 발주 목록 <span class="card-subtitle">${orders.length}건</span></div>
      ${orders.length === 0 ? `
        <div class="empty-state">
          <div class="icon">📋</div>
          <div class="msg">발주 이력이 없습니다</div>
          <div class="sub">"신규 발주" 버튼으로 첫 발주서를 작성하세요.<br/>또는 "자동 발주 추천"에서 추천 품목을 확인하세요.</div>
        </div>
      ` : `
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>발주번호</th>
                <th>발주일</th>
                <th>거래처</th>
                <th>품목 수</th>
                <th>총 금액</th>
                <th>상태</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              ${[...orders].reverse().map(order => {
                const s = statusLabels[order.status] || statusLabels.pending;
                const totalAmt = getOrderTotal(order);
                const linkedPayable = accounts.find(account => account.id === order.payableEntryId);
                const payableLabel = linkedPayable
                  ? (linkedPayable.settled ? '지급 완료' : '미지급 반영')
                  : '';
                return `
                  <tr>
                    <td><strong>${order.orderNo || '-'}</strong></td>
                    <td>${order.orderDate || '-'}</td>
                    <td>
                      <div>${order.vendor || '-'}</div>
                      <div style="font-size:11px; color:var(--text-muted);">결제예정 ${order.paymentDueDate || '-'}</div>
                    </td>
                    <td class="text-right">${(order.items || []).length}건</td>
                    <td class="text-right" style="font-weight:600;">${currency.symbol}${totalAmt.toLocaleString('ko-KR')}</td>
                    <td>
                      <span style="background:${s.bg}; color:${s.color}; padding:2px 10px; border-radius:10px; font-size:11px; font-weight:600;">
                        ${s.icon} ${s.text}
                      </span>
                      ${payableLabel ? `<div style="font-size:11px; color:var(--warning); margin-top:4px;">${payableLabel}</div>` : ''}
                    </td>
                    <td>
                      ${order.status === 'sent' ? `<button class="btn btn-sm btn-success btn-receive" data-id="${order.id}">입고확인</button>` : ''}
                      ${order.status === 'pending' ? `
                        <button class="btn btn-sm btn-primary btn-send" data-id="${order.id}">발주</button>
                        <button class="btn-icon btn-icon-danger btn-delete" data-id="${order.id}" title="삭제">🗑️</button>
                      ` : ''}
                      <button class="btn btn-sm btn-outline btn-pdf" data-id="${order.id}" title="PDF">📄</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- 신규 발주 모달 -->
    <div class="modal-overlay" id="order-modal" style="display:none;">
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <h3 class="modal-title">📋 신규 발주</h3>
          <button class="modal-close" id="order-close">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div class="form-group">
              <label class="form-label">거래처 <span class="required">*</span></label>
              <input class="form-input" id="order-vendor" placeholder="거래처명" list="vendor-list" />
              <datalist id="vendor-list">
                ${state.vendorMaster?.map(v => `<option value="${v.name}">`).join('') || ''}
              </datalist>
            </div>
            <div class="form-group">
              <label class="form-label">발주일</label>
              <input class="form-input" type="date" id="order-date" value="${new Date().toISOString().split('T')[0]}" />
            </div>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div class="form-group">
              <label class="form-label">결제예정일</label>
              <input class="form-input" type="date" id="order-payment-due" value="${getDefaultPaymentDueDate()}" />
            </div>
            <div class="form-group">
              <label class="form-label">비고</label>
              <input class="form-input" id="order-note" placeholder="메모 (선택)" />
            </div>
          </div>

          <div style="margin-top:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="font-size:14px;">📦 발주 품목</strong>
              <button class="btn btn-sm btn-outline" id="btn-add-order-item">+ 품목 추가</button>
            </div>
            <div id="order-items-list">
              <div class="order-item-row" style="display:grid; grid-template-columns:2fr 1fr 1fr 30px; gap:8px; margin-bottom:8px;">
                <input class="form-input" placeholder="품목명" data-field="name" list="item-list" />
                <input class="form-input" type="number" placeholder="수량" data-field="qty" min="1" />
                <input class="form-input" type="number" placeholder="단가" data-field="price" min="0" />
                <button class="btn-icon btn-icon-danger" style="align-self:center;" onclick="this.parentElement.remove()">✕</button>
              </div>
            </div>
            <datalist id="item-list">
              ${(state.mappedData || []).map(it => `<option value="${it.itemName}">`).join('')}
            </datalist>
          </div>

          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
            <button class="btn btn-outline" id="order-cancel">취소</button>
            <button class="btn btn-primary" id="order-save">발주서 저장</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // === 이벤트 ===

  // 모달 열기/닫기
  container.querySelector('#btn-new-order')?.addEventListener('click', () => {
    container.querySelector('#order-modal').style.display = 'flex';
  });
  const closeModal = () => { container.querySelector('#order-modal').style.display = 'none'; };
  container.querySelector('#order-close')?.addEventListener('click', closeModal);
  container.querySelector('#order-cancel')?.addEventListener('click', closeModal);

  // 품목 추가
  container.querySelector('#btn-add-order-item')?.addEventListener('click', () => {
    const list = container.querySelector('#order-items-list');
    const row = document.createElement('div');
    row.className = 'order-item-row';
    row.style.cssText = 'display:grid; grid-template-columns:2fr 1fr 1fr 30px; gap:8px; margin-bottom:8px;';
    row.innerHTML = `
      <input class="form-input" placeholder="품목명" data-field="name" list="item-list" />
      <input class="form-input" type="number" placeholder="수량" data-field="qty" min="1" />
      <input class="form-input" type="number" placeholder="단가" data-field="price" min="0" />
      <button class="btn-icon btn-icon-danger" style="align-self:center;" onclick="this.parentElement.remove()">✕</button>
    `;
    list.appendChild(row);
  });

  // 발주서 저장
  container.querySelector('#order-save')?.addEventListener('click', () => {
    const vendor = container.querySelector('#order-vendor').value.trim();
    const date = container.querySelector('#order-date').value;
    const paymentDueDate = container.querySelector('#order-payment-due').value || getDefaultPaymentDueDate(date);
    const note = container.querySelector('#order-note').value.trim();

    if (!vendor) { showToast('거래처를 입력하세요.', 'warning'); return; }

    // 품목 수집
    const rows = container.querySelectorAll('.order-item-row');
    const orderItems = [];
    rows.forEach(row => {
      const name = row.querySelector('[data-field="name"]').value.trim();
      const qty = parseFloat(row.querySelector('[data-field="qty"]').value) || 0;
      const price = parseFloat(row.querySelector('[data-field="price"]').value) || 0;
      if (name && qty > 0) orderItems.push({ name, qty, price });
    });

    if (orderItems.length === 0) { showToast('품목을 1개 이상 추가하세요.', 'warning'); return; }

    // 발주번호 자동 생성
    const orderNo = `PO-${date.replace(/-/g, '')}-${String(orders.length + 1).padStart(3, '0')}`;

    const newOrder = {
      id: Date.now().toString(),
      orderNo,
      orderDate: date,
      vendor,
      note,
      paymentDueDate,
      items: orderItems,
      status: 'pending',
      payableEntryId: '',
      createdAt: new Date().toISOString(),
    };

    setState({ purchaseOrders: [...orders, newOrder] });
    addAuditLog('발주등록', orderNo, {
      vendor,
      totalAmount: getOrderTotal(newOrder),
      paymentDueDate,
    });
    showToast(`발주서 ${orderNo} 저장 완료!`, 'success');
    closeModal();
    renderOrdersPage(container, navigateTo);
  });

  // 발주 완료 (상태 변경: pending → sent)
  container.querySelectorAll('.btn-send').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const updated = orders.map(o => o.id === id ? { ...o, status: 'sent', sentAt: new Date().toISOString() } : o);
      setState({ purchaseOrders: updated });
      const order = orders.find(o => o.id === id);
      if (order) {
        addAuditLog('발주전송', order.orderNo || id, {
          vendor: order.vendor,
          totalAmount: getOrderTotal(order),
        });
      }
      showToast('발주를 완료했습니다!', 'success');
      renderOrdersPage(container, navigateTo);
    });
  });

  // 입고 확인 (sent → complete)
  container.querySelectorAll('.btn-receive').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!confirm('입고가 완료되었습니까? 재고에 자동 반영됩니다.')) return;

      const order = orders.find(o => o.id === id);
      if (!order) return;

      // 재고에 입고 반영
      const items = [...(state.mappedData || [])];
      const txList = [...(state.transactions || [])];
      const accountEntries = [...(state.accountEntries || [])];
      const receivedDate = new Date().toISOString().split('T')[0];

      (order.items || []).forEach(oi => {
        // 기존 품목 찾기
        const idx = items.findIndex(it => it.itemName === oi.name);
        if (idx >= 0) {
          items[idx] = { ...items[idx], quantity: (parseFloat(items[idx].quantity) || 0) + oi.qty };
        }
        // 입고 거래 기록
        txList.push({
          type: 'in', date: receivedDate,
          itemName: oi.name, quantity: oi.qty, unitPrice: oi.price,
          vendor: order.vendor, note: `발주 ${order.orderNo} 입고`,
        });
      });

      const payableResult = ensurePayableEntryForOrder(order, accountEntries, receivedDate, currency.code);
      const updated = orders.map(o => o.id === id ? {
        ...o,
        status: 'complete',
        receivedAt: new Date().toISOString(),
        paymentDueDate: o.paymentDueDate || getDefaultPaymentDueDate(receivedDate),
        payableEntryId: payableResult.payableEntryId || o.payableEntryId || '',
      } : o);

      setState({
        purchaseOrders: updated,
        mappedData: items,
        transactions: txList,
        accountEntries: payableResult.accountEntries,
      });
      addAuditLog('발주입고', order.orderNo || id, {
        vendor: order.vendor,
        totalAmount: getOrderTotal(order),
        payableLinked: payableResult.payableCreated,
      });
      showToast(
        payableResult.payableCreated
          ? '입고 완료! 재고와 미지급금에 반영되었습니다.'
          : '입고 완료! 재고에 반영되었습니다.',
        'success'
      );
      renderOrdersPage(container, navigateTo);
    });
  });

  // 삭제
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('이 발주서를 삭제하시겠습니까?')) return;
      const id = btn.dataset.id;
      const order = orders.find(o => o.id === id);
      setState({ purchaseOrders: orders.filter(o => o.id !== id) });
      if (order) {
        addAuditLog('발주삭제', order.orderNo || id, {
          vendor: order.vendor,
          totalAmount: getOrderTotal(order),
        });
      }
      showToast('발주서를 삭제했습니다.', 'info');
      renderOrdersPage(container, navigateTo);
    });
  });

  // PDF 다운로드
  container.querySelectorAll('.btn-pdf').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = orders.find(o => o.id === btn.dataset.id);
      if (order) generatePurchaseOrderPDF(order);
    });
  });
}

function getOrderTotal(order) {
  return (order.items || []).reduce((sum, item) => {
    const qty = parseFloat(item.qty) || 0;
    const price = parseFloat(item.price) || 0;
    return sum + (qty * price);
  }, 0);
}

function getDefaultPaymentDueDate(baseDate = new Date().toISOString().split('T')[0], termDays = 30) {
  const dueDate = new Date(baseDate);
  dueDate.setDate(dueDate.getDate() + termDays);
  return dueDate.toISOString().split('T')[0];
}

function ensurePayableEntryForOrder(order, accountEntries, receivedDate, currencyCode) {
  const existingEntry = accountEntries.find(entry =>
    entry.type === 'payable' &&
    (entry.sourceOrderId === order.id || entry.id === order.payableEntryId)
  );

  if (existingEntry) {
    return {
      accountEntries,
      payableEntryId: existingEntry.id,
      payableCreated: false,
    };
  }

  const totalAmount = getOrderTotal(order);
  if (totalAmount <= 0) {
    return {
      accountEntries,
      payableEntryId: '',
      payableCreated: false,
    };
  }

  const payableEntry = {
    id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: 'payable',
    vendorName: order.vendor || '',
    amount: totalAmount,
    currency: currencyCode || 'KRW',
    date: receivedDate,
    dueDate: order.paymentDueDate || getDefaultPaymentDueDate(receivedDate),
    description: `발주 ${order.orderNo || ''} 입고`,
    settled: false,
    settledDate: '',
    source: 'purchase-order',
    sourceOrderId: order.id,
    sourceOrderNo: order.orderNo || '',
  };

  return {
    accountEntries: [...accountEntries, payableEntry],
    payableEntryId: payableEntry.id,
    payableCreated: true,
  };
}
