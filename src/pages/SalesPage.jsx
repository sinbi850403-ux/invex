import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { addAuditLog } from '../audit-log.js';
import { createTransaction } from '../services/inoutService.js';
import { toNum, fmt, orderTotal, genOrderNo, calcDueDate } from '../domain/salesConfig.js';
import { StatusBadge } from '../components/sales/StatusBadge.jsx';
import { SalesModal }  from '../components/sales/SalesModal.jsx';
import { ShipModal }   from '../components/sales/ShipModal.jsx';
import { SalesDetail } from '../components/sales/SalesDetail.jsx';

export default function SalesPage() {
  const [state, setState] = useStore();
  const orders      = state.salesOrders || [];
  const vendors     = useMemo(() => (state.vendorMaster || []).filter(v => v.type === 'customer' || v.type === 'both'), [state.vendorMaster]);
  const itemsMaster = state.mappedData || [];

  const [currentTab,  setCurrentTab]  = useState('all');
  const [showModal,   setShowModal]   = useState(false);
  const [editOrder,   setEditOrder]   = useState(null);
  const [shipOrder,   setShipOrder]   = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);

  const today     = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const kpi = useMemo(() => ({
    all:      orders.length,
    active:   orders.filter(o => o.status === 'confirmed' || o.status === 'partial').length,
    complete: orders.filter(o => o.status === 'complete' && (o.shippedAt || '').startsWith(thisMonth)).length,
    draft:    orders.filter(o => o.status === 'draft').length,
  }), [orders, thisMonth]);

  const pendingReceivable = useMemo(() =>
    (state.accountEntries || []).filter(e => e.type === 'receivable' && !e.settled)
      .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    [state.accountEntries]
  );

  const filteredOrders = useMemo(() => {
    const map = {
      draft:     o => o.status === 'draft',
      confirmed: o => o.status === 'confirmed',
      active:    o => o.status === 'confirmed' || o.status === 'partial',
      complete:  o => o.status === 'complete',
      cancelled: o => o.status === 'cancelled',
    };
    return [...(map[currentTab] ? orders.filter(map[currentTab]) : orders)].reverse();
  }, [orders, currentTab]);

  /* ── 저장 ── */
  const handleSaveOrder = (newOrder, isEdit) => {
    const updated = isEdit ? orders.map(o => o.id === newOrder.id ? newOrder : o) : [...orders, newOrder];
    setState({ salesOrders: updated });
    addAuditLog(isEdit ? '수주수정' : '수주등록', newOrder.orderNo, { customer: newOrder.customer, total: orderTotal(newOrder).total });
    showToast(`수주서 ${newOrder.orderNo} ${isEdit ? '수정' : '저장'} 완료!`, 'success');
    setShowModal(false);
    setEditOrder(null);
  };

  /* ── 수주 확정 ── */
  const handleConfirm = (order) => {
    if (!confirm(`수주서 ${order.orderNo}를 확정하시겠습니까?\n확정 후에는 수정할 수 없습니다.`)) return;
    setState({ salesOrders: orders.map(o => o.id === order.id ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o) });
    addAuditLog('수주확정', order.orderNo, { customer: order.customer });
    showToast(`수주서 ${order.orderNo} 확정 완료!`, 'success');
  };

  /* ── 취소 ── */
  const handleCancel = (order) => {
    if (!confirm(`수주서 ${order.orderNo}를 취소하시겠습니까?`)) return;
    setState({ salesOrders: orders.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() } : o) });
    showToast(`수주서 ${order.orderNo} 취소 처리`, 'info');
  };

  /* ── 출고 처리 ── */
  const handleShip = (order, { shipDate, shipNote, thisShip, totalShipping }) => {
    const shipped = order.shippedItems || {};

    (order.items || []).forEach((it, i) => {
      const qty = thisShip[i] || 0;
      if (qty <= 0) return;
      createTransaction({
        type: 'out', itemName: it.name, itemCode: it.itemCode || '',
        quantity: qty, unitPrice: toNum(it.price), date: shipDate,
        vendor: order.customer,
        note: `수주 ${order.orderNo} 출고${shipNote ? ' - ' + shipNote : ''}`,
      }, true);
    });

    const newShipped = { ...shipped };
    (order.items || []).forEach((_, i) => { newShipped[i] = toNum(newShipped[i] || 0) + (thisShip[i] || 0); });

    const allComplete = (order.items || []).every((it, i) => newShipped[i] >= toNum(it.qty));
    const newStatus   = allComplete ? 'complete' : 'partial';

    const accountEntries = [...(state.accountEntries || [])];
    let receivableEntryId = order.receivableEntryId || '';
    if (allComplete && !order.receivableEntryId) {
      const { total } = orderTotal(order);
      const entry = {
        id: crypto.randomUUID(), type: 'receivable',
        vendorName: order.customer, amount: total,
        dueDate: order.paymentDueDate || calcDueDate(shipDate, 30),
        description: `수주 ${order.orderNo} 출고 - 미수금`,
        date: shipDate, settled: false,
        sourceOrderId: order.id, sourceOrderNo: order.orderNo,
      };
      accountEntries.push(entry);
      receivableEntryId = entry.id;
    }

    setState({
      salesOrders: orders.map(o => o.id === order.id ? { ...o, shippedItems: newShipped, status: newStatus, shippedAt: shipDate, receivableEntryId } : o),
      accountEntries,
    });
    addAuditLog('수주출고', order.orderNo, { customer: order.customer, status: newStatus, qty: totalShipping });
    showToast(
      allComplete
        ? `전량 출고 완료! 재고에 반영되었습니다.${!order.receivableEntryId ? ' 미수금도 생성되었습니다.' : ''}`
        : `부분 출고 처리 완료! (${totalShipping}개)`,
      'success'
    );
    setShipOrder(null);
  };

  /* ── 세금계산서 ── */
  const handleGenTaxInvoice = (order) => {
    if (!confirm(`수주서 ${order.orderNo}에 대한 매출 세금계산서를 발행하시겠습니까?`)) return;
    const invoiceNo = `TI-${order.orderNo}`;
    if ((state.taxInvoices || []).find(t => t.invoiceNo === invoiceNo)) { showToast('이미 발행된 세금계산서가 있습니다.', 'warning'); return; }
    const { supply, vat, total } = orderTotal(order);
    const taxInvoice = {
      id: crypto.randomUUID(), invoiceNo, type: 'sales',
      customer: order.customer, customerCode: order.customerCode || '',
      issueDate: today, supply, vat, total,
      items: (order.items || []).map(it => ({ name: it.name, itemCode: it.itemCode, qty: it.qty, price: it.price, amount: toNum(it.qty) * toNum(it.price) })),
      sourceOrderNo: order.orderNo, sourceOrderId: order.id, note: order.note || '',
    };
    setState({
      salesOrders: orders.map(o => o.id === order.id ? { ...o, taxInvoiceId: taxInvoice.id } : o),
      taxInvoices: [...(state.taxInvoices || []), taxInvoice],
    });
    addAuditLog('매출세금계산서발행', invoiceNo, { customer: order.customer, total });
    showToast(`매출 세금계산서 ${invoiceNo} 발행 완료!`, 'success');
  };

  const TABS = [
    { key: 'all',       label: `전체 (${orders.length})` },
    { key: 'draft',     label: `견적 (${kpi.draft})` },
    { key: 'confirmed', label: `수주확정 (${orders.filter(o => o.status === 'confirmed').length})` },
    { key: 'active',    label: `진행중 (${kpi.active})` },
    { key: 'complete',  label: `완료 (${orders.filter(o => o.status === 'complete').length})` },
    { key: 'cancelled', label: `취소 (${orders.filter(o => o.status === 'cancelled').length})` },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 수주 관리</h1>
          <div className="page-desc">견적 → 수주확정 → 출고 → 세금계산서 → 미수금 파이프라인을 관리합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => { setEditOrder(null); setShowModal(true); }}>+ 견적/수주 작성</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">진행중 수주</div>
          <div className="stat-value" style={{ color: '#2563eb' }}>{kpi.active}건</div>
          <div className="stat-sub">확정+부분출고</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">미수금 (받을 돈)</div>
          <div className="stat-value text-success">₩{fmt(pendingReceivable)}</div>
          <div className="stat-sub">미정산 누적</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번달 출고완료</div>
          <div className="stat-value text-accent">{kpi.complete}건</div>
          <div className="stat-sub">{thisMonth}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">전체 수주</div>
          <div className="stat-value">{kpi.all}건</div>
          <div className="stat-sub">누적</div>
        </div>
      </div>

      <div className="scan-mode-bar" style={{ marginBottom: '12px' }}>
        {TABS.map(t => (
          <button key={t.key} className={`scan-mode-btn${currentTab === t.key ? ' active' : ''}`} onClick={() => setCurrentTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="card card-flush">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">수주 내역이 없습니다</div>
            <div className="sub">오른쪽 상단 '견적/수주 작성'으로 시작하세요.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>수주번호</th><th>고객사</th><th>품목 (대표)</th>
                  <th className="text-right">공급가</th><th className="text-right">부가세</th>
                  <th className="text-right">합계</th><th>출고예정일</th><th>상태</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const { supply, vat, total } = orderTotal(order);
                  const itemPreview = (order.items || []).slice(0, 2).map(it => it.name).join(', ')
                    + ((order.items || []).length > 2 ? ` 외 ${order.items.length - 2}건` : '');
                  const overdue = order.deliveryDate && order.deliveryDate < today
                    && order.status !== 'complete' && order.status !== 'cancelled';
                  return (
                    <tr key={order.id}>
                      <td>
                        <button style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0 }} onClick={() => setDetailOrder(order)}>
                          {order.orderNo}
                        </button>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.orderDate || '-'}</div>
                      </td>
                      <td>
                        <strong>{order.customer}</strong>
                        {order.customerCode && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.customerCode}</div>}
                      </td>
                      <td style={{ fontSize: '13px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemPreview || '-'}</td>
                      <td className="text-right">₩{fmt(supply)}</td>
                      <td className="text-right" style={{ color: 'var(--text-muted)' }}>₩{fmt(vat)}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₩{fmt(total)}</td>
                      <td style={overdue ? { color: 'var(--danger)', fontWeight: 600 } : {}}>{order.deliveryDate || '-'}</td>
                      <td><StatusBadge status={order.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {order.status === 'draft' && (
                            <>
                              <button className="btn btn-xs btn-primary" onClick={() => handleConfirm(order)}>확정</button>
                              <button className="btn btn-xs btn-outline" onClick={() => { setEditOrder(order); setShowModal(true); }}>수정</button>
                            </>
                          )}
                          {(order.status === 'confirmed' || order.status === 'partial') && (
                            <button className="btn btn-xs btn-outline" style={{ color: '#16a34a', borderColor: '#16a34a' }} onClick={() => setShipOrder(order)}>출고</button>
                          )}
                          {order.status === 'complete' && !order.taxInvoiceId && (
                            <button className="btn btn-xs btn-outline" style={{ color: '#7c3aed', borderColor: '#7c3aed' }} onClick={() => handleGenTaxInvoice(order)}>세금계산서</button>
                          )}
                          {order.status !== 'cancelled' && order.status !== 'complete' && (
                            <button className="btn btn-xs btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => handleCancel(order)}>취소</button>
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

      {showModal && (
        <SalesModal editOrder={editOrder} orders={orders} vendors={vendors} itemsMaster={itemsMaster}
          onClose={() => { setShowModal(false); setEditOrder(null); }}
          onSave={handleSaveOrder}
        />
      )}
      {shipOrder && (
        <ShipModal order={shipOrder} onClose={() => setShipOrder(null)} onShip={data => handleShip(shipOrder, data)} />
      )}
      {detailOrder && (
        <SalesDetail order={detailOrder} onClose={() => setDetailOrder(null)} />
      )}
    </div>
  );
}
