/**
 * OrdersPage.jsx - 발주 관리
 * 플로우: 발주서 작성 → 발주 확정 → 입고 처리 → 세금계산서
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { createTransaction } from '../services/inoutService.js';
import { addAuditLog } from '../audit-log.js';
import { generatePurchaseOrderPDF } from '../pdf-generator.js';
import { STATUS, fmt, toNum, orderTotal, calcDueDate } from '../domain/ordersConfig.js';
import { OrderModal } from '../components/orders/OrderModal.jsx';
import { OrderDetail } from '../components/orders/OrderDetail.jsx';
import { ReceiveModal } from '../components/orders/ReceiveModal.jsx';

export default function OrdersPage() {
  const [state, setState] = useStore();
  const orders  = state.purchaseOrders || [];
  const items   = state.mappedData     || [];
  const vendors = useMemo(
    () => (state.vendorMaster || []).filter(v => v.type === 'supplier' || v.type === 'both'),
    [state.vendorMaster]
  );

  const [currentTab,    setCurrentTab]    = useState('all');
  const [editOrder,     setEditOrder]     = useState(null);
  const [detailOrder,   setDetailOrder]   = useState(null);
  const [receiveOrder,  setReceiveOrder]  = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const counts = useMemo(() => ({
    all:       orders.length,
    draft:     orders.filter(o => o.status === 'draft'     || o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed' || o.status === 'sent').length,
    partial:   orders.filter(o => o.status === 'partial').length,
    complete:  orders.filter(o => o.status === 'complete').length,
  }), [orders]);

  const pendingAmt = useMemo(() =>
    orders.filter(o => ['draft','confirmed','partial','pending','sent'].includes(o.status))
          .reduce((s, o) => s + orderTotal(o), 0),
    [orders]
  );

  const thisMonthComplete = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return orders.filter(o => o.status === 'complete' && (o.receivedAt || '').startsWith(ym)).length;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const list = currentTab === 'all' ? orders : orders.filter(o => {
      const s = o.status;
      if (currentTab === 'draft')     return s === 'draft'     || s === 'pending';
      if (currentTab === 'confirmed') return s === 'confirmed' || s === 'sent';
      return s === currentTab;
    });
    return [...list].reverse();
  }, [orders, currentTab]);

  // ── 핸들러 ────────────────────────────────────────────────────────────────
  const handleSaveOrder = (newOrder, isEdit) => {
    const updated = isEdit
      ? orders.map(o => o.id === newOrder.id ? newOrder : o)
      : [...orders, newOrder];
    setState({ purchaseOrders: updated });
    addAuditLog(isEdit ? '발주수정' : '발주등록', newOrder.orderNo, { vendor: newOrder.vendor, total: orderTotal(newOrder) });
    showToast(`발주서 ${newOrder.orderNo} ${isEdit ? '수정' : '저장'} 완료!`, 'success');
    setShowOrderModal(false);
    setEditOrder(null);
  };

  const handleConfirmOrder = (order) => {
    if (!confirm(`발주서 ${order.orderNo}를 확정하시겠습니까?\n확정 후에는 수정할 수 없습니다.`)) return;
    setState({ purchaseOrders: orders.map(o => o.id === order.id ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o) });
    addAuditLog('발주확정', order.orderNo, { vendor: order.vendor, total: orderTotal(order) });
    showToast(`발주서 ${order.orderNo} 확정 완료!`, 'success');
  };

  const handleCancelOrder = (order) => {
    if (!confirm(`발주서 ${order.orderNo}를 취소하시겠습니까?`)) return;
    setState({ purchaseOrders: orders.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() } : o) });
    showToast(`발주서 ${order.orderNo} 취소 처리`, 'info');
  };

  const handleReceive = (order, { receiveDate, warehouse, receiveNote, receiveQtys, totalReceiving }) => {
    const prevReceived = order.receivedItems || {};

    (order.items || []).forEach((it, i) => {
      const qty = receiveQtys[i] || 0;
      if (qty <= 0) return;
      createTransaction({
        type: 'in', date: receiveDate,
        itemName: it.name, itemCode: it.itemCode || '',
        quantity: qty, unitPrice: toNum(it.price),
        vendor: order.vendor, warehouse: warehouse || '',
        note: `발주 ${order.orderNo} 입고${receiveNote ? ' - ' + receiveNote : ''}`,
      }, true);
    });

    const newReceived = { ...prevReceived };
    (order.items || []).forEach((_, i) => {
      newReceived[i] = toNum(prevReceived[i] || 0) + (receiveQtys[i] || 0);
    });
    const allComplete = (order.items || []).every((it, i) => toNum(newReceived[i] || 0) >= toNum(it.qty));
    const newStatus   = allComplete ? 'complete' : 'partial';

    const accountEntries = [...(state.accountEntries || [])];
    let payableEntryId = order.payableEntryId || '';
    let payableCreated = false;
    if (allComplete && !order.payableEntryId) {
      const total = orderTotal(order);
      if (total > 0) {
        const entry = {
          id: crypto.randomUUID(), type: 'payable',
          vendorName: order.vendor, amount: total, currency: 'KRW',
          date: receiveDate, dueDate: order.paymentDueDate || calcDueDate(receiveDate, 30),
          description: `발주 ${order.orderNo} 입고 - 미지급금`,
          settled: false, source: 'purchase-order',
          sourceOrderId: order.id, sourceOrderNo: order.orderNo,
        };
        accountEntries.push(entry);
        payableEntryId = entry.id;
        payableCreated = true;
      }
    }

    setState({
      purchaseOrders: orders.map(o => o.id === order.id ? {
        ...o, status: newStatus, receivedItems: newReceived,
        receivedAt: allComplete ? new Date().toISOString() : o.receivedAt,
        payableEntryId,
      } : o),
      accountEntries,
    });
    addAuditLog('발주입고', order.orderNo, { vendor: order.vendor, status: newStatus, qty: totalReceiving });
    showToast(
      allComplete
        ? `전량 입고 완료! 재고에 반영되었습니다.${payableCreated ? ' 미지급금도 생성되었습니다.' : ''}`
        : `부분 입고 처리 완료! (${totalReceiving}개 입고)`,
      'success'
    );
    setReceiveOrder(null);
  };

  const handleGenTaxInvoice = (order) => {
    if (!confirm(`발주서 ${order.orderNo}에 대한 매입 세금계산서를 발행하시겠습니까?`)) return;
    const supply    = orderTotal(order);
    const invoiceNo = `TI-${order.orderNo}`;
    const taxInvoice = {
      id: crypto.randomUUID(), invoiceNo, type: 'purchase',
      vendor: order.vendor, date: today,
      supplyAmt: supply, vatAmt: Math.floor(supply * 0.1), totalAmt: supply + Math.floor(supply * 0.1),
      items: (order.items || []).map(it => ({ name: it.name, itemCode: it.itemCode || '', qty: it.qty, price: it.price, supply: toNum(it.qty) * toNum(it.price) })),
      sourceOrderId: order.id, sourceOrderNo: order.orderNo, createdAt: new Date().toISOString(),
    };
    setState({
      purchaseOrders: orders.map(o => o.id === order.id ? { ...o, taxInvoiceId: taxInvoice.id } : o),
      taxInvoices: [...(state.taxInvoices || []), taxInvoice],
    });
    addAuditLog('세금계산서발행', invoiceNo, { vendor: order.vendor, total: taxInvoice.totalAmt });
    showToast(`매입 세금계산서 ${invoiceNo} 발행 완료!`, 'success');
  };

  // ── 렌더 ──────────────────────────────────────────────────────────────────
  const TABS = [
    { key: 'all',       label: `전체 (${counts.all})` },
    { key: 'draft',     label: `작성중 (${counts.draft})` },
    { key: 'confirmed', label: `발주확정 (${counts.confirmed})` },
    { key: 'partial',   label: `부분입고 (${counts.partial})` },
    { key: 'complete',  label: `입고완료 (${counts.complete})` },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 발주 관리</h1>
          <div className="page-desc">발주서 작성 → 발주 확정 → 입고 처리 → 세금계산서 생성까지 전체 구매 플로우를 관리합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => { setEditOrder({}); setShowOrderModal(true); }}>+ 신규 발주</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: '미결 발주',       value: `${counts.draft + counts.confirmed + counts.partial}건`, sub: '처리 대기 중' },
          { label: '미지급 예정',     value: fmt(pendingAmt),                                         sub: '입고 전 발주 합계' },
          { label: '이번달 입고완료', value: `${thisMonthComplete}건`,                                sub: '이번달' },
          { label: '전체 발주',       value: `${orders.length}건`,                                    sub: '누적' },
        ].map(c => (
          <div key={c.label} className="card card-compact" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-input)', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setCurrentTab(t.key)} style={{
              padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
              background: currentTab === t.key ? 'var(--accent)' : 'transparent',
              color: currentTab === t.key ? '#fff' : 'var(--text-muted)',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* 발주 목록 */}
      <div className="card card-flush">
        {filteredOrders.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}></div>
            <div>발주 이력이 없습니다. [+ 신규 발주] 버튼으로 시작하세요.</div>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>발주번호</th><th>거래처</th><th>발주일</th><th>납기예정</th>
                  <th>결제예정</th><th>품목</th><th className="text-right">총 금액</th>
                  <th>상태</th><th style={{ width: '160px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const s        = STATUS[order.status] || STATUS.draft;
                  const total    = orderTotal(order);
                  const isOverdue = order.paymentDueDate && order.paymentDueDate < today && order.status !== 'complete' && order.status !== 'cancelled';
                  const daysLeft  = order.paymentDueDate ? Math.ceil((new Date(order.paymentDueDate) - new Date(today)) / 86400000) : null;
                  const itemNames = (order.items || []).slice(0, 2).map(it => it.name).join(', ');
                  const moreItems = (order.items || []).length > 2 ? ` 외 ${order.items.length - 2}건` : '';
                  return (
                    <tr key={order.id}>
                      <td>
                        <button onClick={() => setDetailOrder(order)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                          {order.orderNo || '-'}
                        </button>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{order.vendor || '-'}</div>
                        {order.vendorCode && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.vendorCode}</div>}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{order.orderDate || '-'}</td>
                      <td style={{ fontSize: '12px' }}>{order.deliveryDate || '-'}</td>
                      <td style={{ fontSize: '12px', ...(isOverdue ? { color: 'var(--danger)', fontWeight: 700 } : {}) }}>
                        {order.paymentDueDate || '-'}
                        {daysLeft !== null && order.status !== 'complete' && (
                          <div style={{ fontSize: '10px' }}>{daysLeft >= 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)} 초과`}</div>
                        )}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        <div>{itemNames}{moreItems}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(order.items || []).length}개 품목</div>
                      </td>
                      <td className="text-right" style={{ fontWeight: 700 }}>{fmt(total)}</td>
                      <td>
                        <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {s.icon} {s.text}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(order.status === 'draft' || order.status === 'pending') && (
                            <>
                              <button className="btn btn-xs btn-primary" onClick={() => handleConfirmOrder(order)}>확정</button>
                              <button className="btn btn-xs btn-outline" onClick={() => { setEditOrder(order); setShowOrderModal(true); }}>수정</button>
                            </>
                          )}
                          {(order.status === 'confirmed' || order.status === 'sent' || order.status === 'partial') && (
                            <button className="btn btn-xs btn-success" onClick={() => setReceiveOrder(order)}>입고처리</button>
                          )}
                          {order.status === 'complete' && !order.taxInvoiceId && (
                            <button className="btn btn-xs btn-outline" onClick={() => handleGenTaxInvoice(order)}>세금계산서</button>
                          )}
                          <button className="btn btn-xs btn-outline" onClick={() => generatePurchaseOrderPDF(order)}>PDF</button>
                          {(order.status === 'draft' || order.status === 'pending') && (
                            <button className="btn btn-xs btn-icon-danger" onClick={() => handleCancelOrder(order)}>취소</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showOrderModal && (
        <OrderModal
          editOrder={editOrder && editOrder.id ? editOrder : null}
          orders={orders} vendors={vendors} itemsMaster={items}
          onClose={() => { setShowOrderModal(false); setEditOrder(null); }}
          onSave={handleSaveOrder}
        />
      )}
      {detailOrder  && <OrderDetail  order={detailOrder}  onClose={() => setDetailOrder(null)} />}
      {receiveOrder && <ReceiveModal order={receiveOrder} onClose={() => setReceiveOrder(null)} onReceive={data => handleReceive(receiveOrder, data)} />}
    </div>
  );
}
