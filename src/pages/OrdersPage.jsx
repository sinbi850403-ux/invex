/**
 * OrdersPage.jsx - 발주 관리 (구매 플로우 완전 구현)
 *
 * 플로우: 발주서 작성 → 발주 확정 → 입고 처리(부분/전체) → 매입 세금계산서 → 미지급금
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { addTransaction } from '../store.js';
import { addAuditLog } from '../audit-log.js';
import { generatePurchaseOrderPDF } from '../pdf-generator.js';

/* ── 상수 ──────────────────────────────────────────────── */
const STATUS = {
  draft:     { text: '작성중',   icon: '✏️', color: 'var(--text-muted)',  bg: 'rgba(139,148,158,.15)' },
  confirmed: { text: '발주확정', icon: '✅', color: '#58a6ff',            bg: 'rgba(88,166,255,.15)' },
  partial:   { text: '부분입고', icon: '📦', color: '#d29922',            bg: 'rgba(210,153,34,.15)' },
  complete:  { text: '입고완료', icon: '🎉', color: 'var(--success)',      bg: 'rgba(63,185,80,.15)' },
  cancelled: { text: '취소',     icon: '❌', color: 'var(--danger)',       bg: 'rgba(248,81,73,.15)' },
  pending:   { text: '작성중',   icon: '✏️', color: 'var(--text-muted)',  bg: 'rgba(139,148,158,.15)' },
  sent:      { text: '발주확정', icon: '✅', color: '#58a6ff',            bg: 'rgba(88,166,255,.15)' },
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

function calcDueDate(base = new Date().toISOString().split('T')[0], days = 30) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const EMPTY_ITEM = { name: '', itemCode: '', qty: '', price: '' };

/* ── 발주서 작성/수정 모달 ── */
function OrderModal({ editOrder, orders, vendors, itemsMaster, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0];
  const e = editOrder || {};
  const isEdit = !!editOrder;

  const [vendor, setVendor] = useState(e.vendor || '');
  const [orderDate, setOrderDate] = useState(e.orderDate || today);
  const [deliveryDate, setDeliveryDate] = useState(e.deliveryDate || calcDueDate(e.orderDate || today, 7));
  const [paymentDueDate, setPaymentDueDate] = useState(e.paymentDueDate || calcDueDate(e.orderDate || today, 30));
  const [note, setNote] = useState(e.note || '');
  const [orderItems, setOrderItems] = useState(
    (e.items && e.items.length > 0)
      ? e.items.map(it => ({ name: it.name || '', itemCode: it.itemCode || '', qty: String(it.qty || ''), price: String(it.price || '') }))
      : [{ ...EMPTY_ITEM }]
  );

  const supply = useMemo(() =>
    orderItems.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0),
    [orderItems]
  );
  const vat = Math.floor(supply * 0.1);
  const total = supply + vat;

  const updateItem = (idx, field, value) => {
    setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const handleItemNameChange = (idx, name) => {
    updateItem(idx, 'name', name);
    const master = itemsMaster.find(it => it.itemName === name);
    if (master) {
      setOrderItems(prev => prev.map((it, i) => {
        if (i !== idx) return it;
        return {
          ...it,
          name,
          itemCode: it.itemCode || master.itemCode || '',
          price: it.price || String(master.unitPrice || ''),
        };
      }));
    }
  };

  const handleVendorChange = (e) => {
    const selected = e.target;
    const opt = selected.options[selected.selectedIndex];
    const terms = opt?.dataset?.terms;
    setVendor(selected.value);
    const termDays = { cash: 0, transfer: 0, bill30: 30, bill60: 60, bill90: 90 };
    if (terms && termDays[terms] !== undefined) {
      setPaymentDueDate(calcDueDate(orderDate, termDays[terms] || 30));
    }
  };

  const addItem = () => setOrderItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => {
    if (orderItems.length > 1) setOrderItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!vendor) { showToast('거래처를 선택해 주세요.', 'warning'); return; }
    const validItems = orderItems.filter(it => it.name.trim() && toNum(it.qty) > 0);
    if (!validItems.length) { showToast('발주 품목을 1개 이상 입력해 주세요.', 'warning'); return; }

    const newOrder = {
      id:             e.id || crypto.randomUUID(),
      orderNo:        e.orderNo || genOrderNo(orders, orderDate),
      orderDate,
      deliveryDate,
      paymentDueDate,
      vendor,
      note:           note.trim(),
      items:          validItems.map(it => ({ name: it.name.trim(), itemCode: it.itemCode.trim(), qty: toNum(it.qty), price: toNum(it.price) })),
      status:         e.status || 'draft',
      createdAt:      e.createdAt || new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
      payableEntryId: e.payableEntryId || '',
      taxInvoiceId:   e.taxInvoiceId || '',
    };
    onSave(newOrder, isEdit);
  };

  const itemNameList = itemsMaster.map(it => it.itemName);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '720px', width: '95vw' }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? `✏️ 발주서 수정 - ${e.orderNo}` : '📋 신규 발주서 작성'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">거래처 <span className="required">*</span></label>
              <select className="form-select" value={vendor} onChange={handleVendorChange}>
                <option value="">-- 선택 --</option>
                {vendors.map(v => (
                  <option key={v.name} value={v.name} data-terms={v.paymentTerm || ''}>{v.name}</option>
                ))}
                {e.vendor && !vendors.find(v => v.name === e.vendor) && (
                  <option value={e.vendor}>{e.vendor}</option>
                )}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">발주일 <span className="required">*</span></label>
              <input className="form-input" type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">납기 예정일</label>
              <input className="form-input" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">결제 예정일</label>
              <input className="form-input" type="date" value={paymentDueDate} onChange={e => setPaymentDueDate(e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">비고</label>
            <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="메모 (선택)" />
          </div>

          {/* 품목 테이블 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '14px' }}>📦 발주 품목</strong>
              <button type="button" className="btn btn-sm btn-outline" onClick={addItem}>+ 품목 추가</button>
            </div>
            <datalist id="om-item-list">
              {itemNameList.map((n, i) => <option key={i} value={n} />)}
            </datalist>
            <div className="table-wrapper" style={{ borderRadius: '8px', overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>품목명</th>
                    <th style={{ width: '90px' }}>품목코드</th>
                    <th className="text-right" style={{ width: '80px' }}>수량</th>
                    <th className="text-right" style={{ width: '110px' }}>단가 (₩)</th>
                    <th className="text-right" style={{ width: '110px' }}>금액</th>
                    <th style={{ width: '36px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((it, idx) => {
                    const amt = toNum(it.qty) * toNum(it.price);
                    return (
                      <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            className="form-input"
                            list="om-item-list"
                            value={it.name}
                            placeholder="품목명"
                            style={{ minWidth: '140px' }}
                            onChange={e => handleItemNameChange(idx, e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            className="form-input"
                            value={it.itemCode}
                            placeholder="코드"
                            style={{ width: '80px', fontSize: '11px' }}
                            onChange={e => updateItem(idx, 'itemCode', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            className="form-input"
                            type="number"
                            min="1"
                            value={it.qty}
                            placeholder="0"
                            style={{ width: '70px', textAlign: 'right' }}
                            onChange={e => updateItem(idx, 'qty', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            className="form-input"
                            type="number"
                            min="0"
                            value={it.price}
                            placeholder="0"
                            style={{ width: '100px', textAlign: 'right' }}
                            onChange={e => updateItem(idx, 'price', e.target.value)}
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                          {amt > 0 ? '₩' + Math.round(amt).toLocaleString('ko-KR') : '-'}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn-icon btn-icon-danger"
                            style={{ fontSize: '12px' }}
                            onClick={() => removeItem(idx)}
                          >✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 합계 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '12px 20px', minWidth: '240px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text-muted)' }}>공급가액</span>
                <span>{'₩' + Math.round(supply).toLocaleString('ko-KR')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>부가세 (10%)</span>
                <span>{'₩' + Math.round(vat).toLocaleString('ko-KR')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <span>합계</span>
                <span style={{ color: 'var(--accent)' }}>{'₩' + Math.round(total).toLocaleString('ko-KR')}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={handleSave}>{isEdit ? '수정 저장' : '발주서 저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 발주서 상세 슬라이드오버 ── */
function OrderDetail({ order, onClose }) {
  const s = STATUS[order.status] || STATUS.draft;
  const total = orderTotal(order);
  const supply = total;
  const vat = Math.floor(supply * 0.1);

  return (
    <div
      style={{ display: 'block', position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '560px', maxWidth: '95vw', background: 'var(--bg-card)', boxShadow: '-4px 0 24px rgba(0,0,0,.3)', overflowY: 'auto' }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700 }}>
                {s.icon} {s.text}
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 2px' }}>{order.orderNo || ''}</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>거래처: <strong>{order.vendor || '-'}</strong></div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        </div>

        {/* 날짜 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--border)' }}>
          {[
            { label: '발주일', value: order.orderDate || '-' },
            { label: '납기예정', value: order.deliveryDate || '-' },
            { label: '결제예정', value: order.paymentDueDate || '-' },
          ].map(r => (
            <div key={r.label} style={{ background: 'var(--bg-card)', padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.label}</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '.05em' }}>발주 품목</div>
          <div className="table-wrapper" style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목명</th>
                  <th>코드</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">단가</th>
                  <th className="text-right">금액</th>
                  {order.receivedItems && <th className="text-right">입고</th>}
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => {
                  const amt = toNum(it.qty) * toNum(it.price);
                  const received = (order.receivedItems || {})[i] || 0;
                  return (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{it.itemCode || '-'}</td>
                      <td className="text-right">{toNum(it.qty).toLocaleString('ko-KR')}</td>
                      <td className="text-right">{fmt(it.price)}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>{fmt(amt)}</td>
                      {order.receivedItems && (
                        <td className="text-right" style={{ color: received >= toNum(it.qty) ? 'var(--success)' : 'var(--warning)' }}>
                          {received}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 합계 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
            <div style={{ background: 'var(--bg-input)', borderRadius: '8px', padding: '12px 20px', minWidth: '220px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>공급가액</span><span>{fmt(supply)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>부가세</span><span>{fmt(vat)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '16px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <span>합계</span><span style={{ color: 'var(--accent)' }}>{fmt(supply + vat)}</span>
              </div>
            </div>
          </div>

          {order.note && (
            <div style={{ background: 'var(--bg-input)', borderRadius: '6px', padding: '10px', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              📝 {order.note}
            </div>
          )}
          {order.taxInvoiceId && (
            <div style={{ background: 'rgba(63,185,80,.1)', border: '1px solid var(--success)', borderRadius: '6px', padding: '10px', fontSize: '13px', color: 'var(--success)' }}>
              ✅ 세금계산서 발행 완료 ({order.taxInvoiceId})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 입고 처리 모달 ── */
function ReceiveModal({ order, onClose, onReceive }) {
  const today = new Date().toISOString().split('T')[0];
  const prevReceived = order.receivedItems || {};

  const [receiveDate, setReceiveDate] = useState(today);
  const [warehouse, setWarehouse] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [qtys, setQtys] = useState(() => {
    const init = {};
    (order.items || []).forEach((it, i) => {
      const ordered = toNum(it.qty);
      const already = toNum(prevReceived[i] || 0);
      init[i] = String(Math.max(0, ordered - already));
    });
    return init;
  });

  const handleConfirm = () => {
    let totalReceiving = 0;
    const receiveQtys = {};
    (order.items || []).forEach((it, i) => {
      const ordered = toNum(it.qty);
      const already = toNum(prevReceived[i] || 0);
      const max = ordered - already;
      const qty = Math.max(0, Math.min(toNum(qtys[i] || 0), max));
      receiveQtys[i] = qty;
      totalReceiving += qty;
    });

    if (totalReceiving <= 0) { showToast('입고 수량을 입력해 주세요.', 'warning'); return; }

    onReceive({ receiveDate, warehouse, receiveNote, receiveQtys, totalReceiving });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '620px', width: '95vw' }}>
        <div className="modal-header">
          <h3 className="modal-title">📥 입고 처리 - {order.orderNo}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
            거래처: <strong style={{ color: 'var(--text-primary)' }}>{order.vendor}</strong> · 발주일: {order.orderDate}
          </div>
          <div className="table-wrapper" style={{ marginBottom: '16px', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목명</th>
                  <th className="text-right">발주수량</th>
                  <th className="text-right">기입고</th>
                  <th className="text-right">이번 입고 <span className="required">*</span></th>
                  <th className="text-right">단가</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => {
                  const ordered = toNum(it.qty);
                  const already = toNum(prevReceived[i] || 0);
                  const remaining = ordered - already;
                  return (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td className="text-right">{ordered.toLocaleString('ko-KR')}</td>
                      <td className="text-right" style={{ color: 'var(--text-muted)' }}>{already.toLocaleString('ko-KR')}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          className="form-input"
                          value={qtys[i] ?? ''}
                          min="0"
                          max={remaining}
                          disabled={remaining <= 0}
                          style={{ width: '80px', textAlign: 'right', opacity: remaining <= 0 ? 0.5 : 1 }}
                          onChange={e => setQtys(prev => ({ ...prev, [i]: e.target.value }))}
                        />
                      </td>
                      <td className="text-right" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(it.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">입고일 <span className="required">*</span></label>
              <input className="form-input" type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">창고</label>
              <input className="form-input" value={warehouse} onChange={e => setWarehouse(e.target.value)} placeholder="입고 창고 (선택)" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">비고</label>
            <input className="form-input" value={receiveNote} onChange={e => setReceiveNote(e.target.value)} placeholder="입고 비고" />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={handleConfirm}>입고 처리</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function OrdersPage() {
  const [state, setState] = useStore();
  const orders = state.purchaseOrders || [];
  const items = state.mappedData || [];
  const vendors = useMemo(
    () => (state.vendorMaster || []).filter(v => v.type === 'supplier' || v.type === 'both'),
    [state.vendorMaster]
  );

  const [currentTab, setCurrentTab] = useState('all');
  const [editOrder, setEditOrder] = useState(null);     // null=closed, {}=new, order=edit
  const [detailOrder, setDetailOrder] = useState(null); // null=closed, order=open
  const [receiveOrder, setReceiveOrder] = useState(null); // null=closed, order=open
  const [showOrderModal, setShowOrderModal] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const counts = useMemo(() => ({
    all:       orders.length,
    draft:     orders.filter(o => o.status === 'draft' || o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed' || o.status === 'sent').length,
    partial:   orders.filter(o => o.status === 'partial').length,
    complete:  orders.filter(o => o.status === 'complete').length,
  }), [orders]);

  const pendingAmt = useMemo(() =>
    orders
      .filter(o => ['draft','confirmed','partial','pending','sent'].includes(o.status))
      .reduce((s, o) => s + orderTotal(o), 0),
    [orders]
  );

  const thisMonthComplete = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7);
    return orders.filter(o => o.status === 'complete' && (o.receivedAt || '').startsWith(ym)).length;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = currentTab === 'all' ? orders : orders.filter(o => {
      const s = o.status;
      if (currentTab === 'draft')     return s === 'draft' || s === 'pending';
      if (currentTab === 'confirmed') return s === 'confirmed' || s === 'sent';
      return s === currentTab;
    });
    return [...list].reverse();
  }, [orders, currentTab]);

  /* 신규 발주 */
  const handleNewOrder = () => {
    setEditOrder({});
    setShowOrderModal(true);
  };

  /* 수정 */
  const handleEdit = (order) => {
    setEditOrder(order);
    setShowOrderModal(true);
  };

  /* 저장 */
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

  /* 발주 확정 */
  const handleConfirmOrder = (order) => {
    if (!confirm(`발주서 ${order.orderNo}를 확정하시겠습니까?\n확정 후에는 수정할 수 없습니다.`)) return;
    const updated = orders.map(o => o.id === order.id ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o);
    setState({ purchaseOrders: updated });
    addAuditLog('발주확정', order.orderNo, { vendor: order.vendor, total: orderTotal(order) });
    showToast(`발주서 ${order.orderNo} 확정 완료!`, 'success');
  };

  /* 취소 */
  const handleCancelOrder = (order) => {
    if (!confirm(`발주서 ${order.orderNo}를 취소하시겠습니까?`)) return;
    const updated = orders.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() } : o);
    setState({ purchaseOrders: updated });
    showToast(`발주서 ${order.orderNo} 취소 처리`, 'info');
  };

  /* 입고 처리 */
  const handleReceive = (order, { receiveDate, warehouse, receiveNote, receiveQtys, totalReceiving }) => {
    const prevReceived = order.receivedItems || {};

    /* 재고 반영 */
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

    /* 누적 입고 수량 */
    const newReceived = { ...prevReceived };
    (order.items || []).forEach((_, i) => {
      newReceived[i] = (toNum(prevReceived[i] || 0)) + (receiveQtys[i] || 0);
    });

    const allComplete = (order.items || []).every((it, i) => toNum(newReceived[i] || 0) >= toNum(it.qty));
    const newStatus = allComplete ? 'complete' : 'partial';

    /* 미지급금 생성 */
    const accountEntries = [...(state.accountEntries || [])];
    let payableEntryId = order.payableEntryId || '';
    let payableCreated = false;
    if (allComplete && !order.payableEntryId) {
      const total = orderTotal(order);
      if (total > 0) {
        const entry = {
          id: crypto.randomUUID(),
          type: 'payable', vendorName: order.vendor, amount: total,
          currency: 'KRW', date: receiveDate,
          dueDate: order.paymentDueDate || calcDueDate(receiveDate, 30),
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
    setReceiveOrder(null);
  };

  /* 세금계산서 생성 */
  const handleGenTaxInvoice = (order) => {
    if (!confirm(`발주서 ${order.orderNo}에 대한 매입 세금계산서를 발행하시겠습니까?`)) return;

    const supply = orderTotal(order);
    const vat = Math.floor(supply * 0.1);
    const invoiceNo = `TI-${order.orderNo}`;

    const taxInvoice = {
      id:          crypto.randomUUID(),
      invoiceNo,
      type:        'purchase',
      vendor:      order.vendor,
      date:        today,
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
  };

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
          <h1 className="page-title">📋 발주 관리</h1>
          <div className="page-desc">발주서 작성 → 발주 확정 → 입고 처리 → 세금계산서 생성까지 전체 구매 플로우를 관리합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleNewOrder}>+ 신규 발주</button>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
        {[
          { label: '미결 발주',       value: `${counts.draft + counts.confirmed + counts.partial}건`,  sub: '처리 대기 중' },
          { label: '미지급 예정',     value: fmt(pendingAmt),                                          sub: '입고 전 발주 합계' },
          { label: '이번달 입고완료', value: `${thisMonthComplete}건`,                                 sub: '이번달' },
          { label: '전체 발주',       value: `${orders.length}건`,                                     sub: '누적' },
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
            <button
              key={t.key}
              onClick={() => setCurrentTab(t.key)}
              style={{
                padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px',
                background: currentTab === t.key ? 'var(--accent)' : 'transparent',
                color: currentTab === t.key ? '#fff' : 'var(--text-muted)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 발주 목록 */}
      <div className="card card-flush">
        {filteredOrders.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
            <div>발주 이력이 없습니다. [+ 신규 발주] 버튼으로 시작하세요.</div>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>발주번호</th>
                  <th>거래처</th>
                  <th>발주일</th>
                  <th>납기예정</th>
                  <th>결제예정</th>
                  <th>품목</th>
                  <th className="text-right">총 금액</th>
                  <th>상태</th>
                  <th style={{ width: '160px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const s = STATUS[order.status] || STATUS.draft;
                  const total = orderTotal(order);
                  const isOverdue = order.paymentDueDate && order.paymentDueDate < today && order.status !== 'complete' && order.status !== 'cancelled';
                  const daysLeft = order.paymentDueDate
                    ? Math.ceil((new Date(order.paymentDueDate) - new Date(today)) / 86400000)
                    : null;
                  const itemNames = (order.items || []).slice(0, 2).map(it => it.name).join(', ');
                  const moreItems = (order.items || []).length > 2 ? ` 외 ${order.items.length - 2}건` : '';

                  return (
                    <tr key={order.id}>
                      <td>
                        <button
                          onClick={() => setDetailOrder(order)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                        >
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
                          <div style={{ fontSize: '10px' }}>
                            {daysLeft >= 0 ? `D-${daysLeft}` : `D+${Math.abs(daysLeft)} 초과`}
                          </div>
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
                              <button className="btn btn-xs btn-outline" onClick={() => handleEdit(order)}>수정</button>
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

      {/* 발주 작성/수정 모달 */}
      {showOrderModal && (
        <OrderModal
          editOrder={editOrder && editOrder.id ? editOrder : null}
          orders={orders}
          vendors={vendors}
          itemsMaster={items}
          onClose={() => { setShowOrderModal(false); setEditOrder(null); }}
          onSave={handleSaveOrder}
        />
      )}

      {/* 발주 상세 슬라이드오버 */}
      {detailOrder && (
        <OrderDetail
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
        />
      )}

      {/* 입고 처리 모달 */}
      {receiveOrder && (
        <ReceiveModal
          order={receiveOrder}
          onClose={() => setReceiveOrder(null)}
          onReceive={(data) => handleReceive(receiveOrder, data)}
        />
      )}
    </div>
  );
}
