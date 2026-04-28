/**
 * SalesPage.jsx - 수주 관리 (판매 플로우 완전 구현)
 *
 * 파이프라인: 견적서 작성 → 수주 확정 → 부분/전량 출고 → 거래명세서 → 세금계산서 → 미수금
 *
 * 상태 흐름:
 *   draft(견적) → confirmed(수주확정) → partial(부분출고) → complete(출고완료) / cancelled(취소)
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { addAuditLog } from '../audit-log.js';
import { addTransaction, getState as getRawState } from '../store.js';

/* ── 상수 ────────────────────────────────────────────────── */
const STATUS = {
  draft:     { label: '견적',     color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  confirmed: { label: '수주확정', color: '#2563eb', bg: 'rgba(37,99,235,0.12)'  },
  partial:   { label: '부분출고', color: '#d97706', bg: 'rgba(217,119,6,0.12)'  },
  complete:  { label: '출고완료', color: '#16a34a', bg: 'rgba(22,163,74,0.12)'  },
  cancelled: { label: '취소',     color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
};

const fmt   = v => (parseFloat(v) || 0).toLocaleString('ko-KR');
const toNum = v => parseFloat(String(v || '').replace(/,/g, '')) || 0;

function orderTotal(order) {
  const supply = (order.items || []).reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0);
  return { supply, vat: Math.floor(supply * 0.1), total: supply + Math.floor(supply * 0.1) };
}

function genOrderNo(orders, date) {
  const d   = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
  const seq = String((orders || []).filter(o => (o.orderNo || '').includes(d)).length + 1).padStart(3, '0');
  return `SO-${d}-${seq}`;
}

function calcDueDate(base, days) {
  const d = new Date(base || Date.now());
  d.setDate(d.getDate() + (days || 0));
  return d.toISOString().slice(0, 10);
}

const EMPTY_ITEM = { name: '', itemCode: '', qty: '', price: '' };

/* ── 상태 배지 ── */
function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.draft;
  return (
    <span style={{ background: s.bg, color: s.color, padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

/* ── 수주 작성/수정 모달 ── */
function SalesModal({ editOrder, orders, vendors, itemsMaster, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const e = editOrder || {};
  const isEdit = !!editOrder;

  const [customer, setCustomer]         = useState(e.customer || '');
  const [customerCode, setCustomerCode] = useState(e.customerCode || '');
  const [orderDate, setOrderDate]       = useState(e.orderDate || today);
  const [deliveryDate, setDeliveryDate] = useState(e.deliveryDate || calcDueDate(today, 7));
  const [paymentDueDate, setPaymentDueDate] = useState(e.paymentDueDate || calcDueDate(today, 30));
  const [note, setNote]                 = useState(e.note || '');
  const [orderItems, setOrderItems]     = useState(
    (e.items && e.items.length > 0)
      ? e.items.map(it => ({ name: it.name || '', itemCode: it.itemCode || '', qty: String(it.qty || ''), price: String(it.price || '') }))
      : [{ ...EMPTY_ITEM }]
  );

  const supply = useMemo(
    () => orderItems.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0),
    [orderItems]
  );
  const vat   = Math.floor(supply * 0.1);
  const total = supply + vat;

  const updateItem = (idx, field, value) =>
    setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

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
          price: it.price || String(master.sellingPrice || master.unitPrice || ''),
        };
      }));
    }
  };

  const handleCustomerChange = (ev) => {
    const sel = ev.target;
    const opt = sel.options[sel.selectedIndex];
    setCustomer(sel.value);
    setCustomerCode(opt?.dataset?.code || '');
    const days = parseInt(opt?.dataset?.days || '30', 10);
    setPaymentDueDate(calcDueDate(orderDate, days));
  };

  const addItem    = () => setOrderItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => {
    if (orderItems.length <= 1) { showToast('최소 1개 품목이 필요합니다.', 'warning'); return; }
    setOrderItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    if (!customer) { showToast('고객사를 선택해 주세요.', 'warning'); return; }
    const validItems = orderItems.filter(it => it.name.trim() && toNum(it.qty) > 0);
    if (!validItems.length) { showToast('품목을 1개 이상 입력해 주세요.', 'warning'); return; }

    const newOrder = {
      id:               e.id || crypto.randomUUID(),
      orderNo:          e.orderNo || genOrderNo(orders, orderDate),
      orderDate,
      deliveryDate,
      paymentDueDate,
      customer,
      customerCode:     customerCode.trim(),
      note:             note.trim(),
      items:            validItems.map(it => ({ name: it.name.trim(), itemCode: it.itemCode.trim(), qty: toNum(it.qty), price: toNum(it.price) })),
      status:           e.status || 'draft',
      createdAt:        e.createdAt || new Date().toISOString(),
      updatedAt:        new Date().toISOString(),
      shippedItems:     e.shippedItems || {},
      receivableEntryId: e.receivableEntryId || '',
      taxInvoiceId:     e.taxInvoiceId || '',
    };
    onSave(newOrder, isEdit);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '760px', width: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? ` 수주 수정 - ${e.orderNo}` : ' 견적/수주 작성'}</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          {/* 기본 정보 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label className="form-label">고객사 *</label>
              <select className="form-input" value={customer} onChange={handleCustomerChange}>
                <option value="">-- 고객사 선택 --</option>
                {vendors.map(v => (
                  <option key={v.name} value={v.name} data-code={v.code || ''} data-days={v.paymentTermDays || 30}>
                    {v.name}
                  </option>
                ))}
                {customer && !vendors.find(v => v.name === customer) && (
                  <option value={customer}>{customer}</option>
                )}
              </select>
            </div>
            <div>
              <label className="form-label">고객사 코드</label>
              <input
                className="form-input"
                type="text"
                value={customerCode}
                readOnly
                style={{ background: 'var(--bg-input,#1e2635)' }}
              />
            </div>
            <div>
              <label className="form-label">수주일 *</label>
              <input className="form-input" type="date" value={orderDate} onChange={ev => setOrderDate(ev.target.value)} />
            </div>
            <div>
              <label className="form-label">출고예정일</label>
              <input className="form-input" type="date" value={deliveryDate} onChange={ev => setDeliveryDate(ev.target.value)} />
            </div>
            <div>
              <label className="form-label">결제예정일</label>
              <input className="form-input" type="date" value={paymentDueDate} onChange={ev => setPaymentDueDate(ev.target.value)} />
            </div>
            <div>
              <label className="form-label">메모</label>
              <input className="form-input" type="text" value={note} onChange={ev => setNote(ev.target.value)} placeholder="특이사항" />
            </div>
          </div>

          {/* 품목 테이블 */}
          <div style={{ marginBottom: '8px', fontWeight: 600, fontSize: '14px' }}> 품목</div>
          <datalist id="sp-item-list">
            {itemsMaster.map((it, i) => <option key={i} value={it.itemName || ''} />)}
          </datalist>
          <div className="table-wrapper" style={{ marginBottom: '8px' }}>
            <table className="data-table" style={{ minWidth: '600px' }}>
              <thead>
                <tr>
                  <th>품목명</th>
                  <th style={{ width: '100px' }}>품목코드</th>
                  <th className="text-right" style={{ width: '80px' }}>수량</th>
                  <th className="text-right" style={{ width: '120px' }}>단가 (판매)</th>
                  <th className="text-right" style={{ width: '120px' }}>금액</th>
                  <th style={{ width: '36px' }}></th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((it, idx) => {
                  const amt = toNum(it.qty) * toNum(it.price);
                  return (
                    <tr key={idx}>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          className="form-input"
                          list="sp-item-list"
                          value={it.name}
                          placeholder="품목명"
                          style={{ minWidth: '140px' }}
                          onChange={ev => handleItemNameChange(idx, ev.target.value)}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          className="form-input"
                          value={it.itemCode}
                          placeholder="자동"
                          readOnly
                          style={{ width: '90px', fontSize: '12px', background: 'var(--bg-input)' }}
                          onChange={ev => updateItem(idx, 'itemCode', ev.target.value)}
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
                          onChange={ev => updateItem(idx, 'qty', ev.target.value)}
                        />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          value={it.price}
                          placeholder="0"
                          style={{ width: '110px', textAlign: 'right' }}
                          onChange={ev => updateItem(idx, 'price', ev.target.value)}
                        />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                        {amt > 0 ? '₩' + Math.round(amt).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline"
                          style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          onClick={() => removeItem(idx)}
                        ></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ 품목 추가</button>

          {/* 합계 */}
          <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--bg-input,#1e2635)', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>공급가액</div>
              <div style={{ fontSize: '18px', fontWeight: 700 }}>₩{Math.round(supply).toLocaleString('ko-KR')}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>부가세 (10%)</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-muted)' }}>₩{Math.round(vat).toLocaleString('ko-KR')}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>합계</div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>₩{(supply + vat).toLocaleString('ko-KR')}</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={handleSave}>{isEdit ? '수정 저장' : ' 저장'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 출고 처리 모달 ── */
function ShipModal({ order, onClose, onShip }) {
  const today = new Date().toISOString().slice(0, 10);
  const shipped = order.shippedItems || {};

  const [shipDate, setShipDate] = useState(today);
  const [shipNote, setShipNote] = useState('');
  const [qtys, setQtys] = useState(() => {
    const init = {};
    (order.items || []).forEach((it, i) => {
      const remaining = toNum(it.qty) - toNum(shipped[i] || 0);
      init[i] = String(Math.max(0, remaining));
    });
    return init;
  });

  const handleConfirm = () => {
    let totalShipping = 0;
    const thisShip = {};
    let valid = true;
    (order.items || []).forEach((it, i) => {
      const remaining = toNum(it.qty) - toNum(shipped[i] || 0);
      const qty = toNum(qtys[i] || 0);
      if (qty > remaining) { showToast('잔량을 초과할 수 없습니다.', 'warning'); valid = false; return; }
      thisShip[i] = qty;
      totalShipping += qty;
    });
    if (!valid) return;
    if (totalShipping <= 0) { showToast('출고 수량을 1 이상 입력해 주세요.', 'warning'); return; }
    onShip({ shipDate, shipNote, thisShip, totalShipping });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '640px', width: '95vw' }}>
        <div className="modal-header">
          <h3 className="modal-title"> 출고 처리 - {order.orderNo}</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
            고객사: <strong style={{ color: 'var(--text-primary)' }}>{order.customer}</strong> · 수주일: {order.orderDate}
          </div>
          <div className="table-wrapper" style={{ marginBottom: '16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목명</th>
                  <th className="text-right">수주수량</th>
                  <th className="text-right">기출고</th>
                  <th className="text-right">잔량</th>
                  <th className="text-right" style={{ color: 'var(--accent)' }}>이번 출고 *</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => {
                  const alreadyShipped = toNum(shipped[i] || 0);
                  const remaining = toNum(it.qty) - alreadyShipped;
                  return (
                    <tr key={i}>
                      <td>
                        <strong>{it.name}</strong>
                        <br />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{it.itemCode || '-'}</span>
                      </td>
                      <td className="text-right">{it.qty}</td>
                      <td className="text-right" style={{ color: alreadyShipped > 0 ? '#16a34a' : 'var(--text-muted)' }}>{alreadyShipped}</td>
                      <td className="text-right" style={{ fontWeight: 600, color: remaining > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{remaining}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          className="form-input"
                          value={qtys[i] ?? ''}
                          min="0"
                          max={remaining}
                          disabled={remaining <= 0}
                          style={{ width: '80px', textAlign: 'right', opacity: remaining <= 0 ? 0.5 : 1 }}
                          onChange={ev => setQtys(prev => ({ ...prev, [i]: ev.target.value }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label className="form-label">출고일 *</label>
              <input className="form-input" type="date" value={shipDate} onChange={ev => setShipDate(ev.target.value)} />
            </div>
            <div>
              <label className="form-label">출고 메모</label>
              <input className="form-input" type="text" value={shipNote} onChange={ev => setShipNote(ev.target.value)} placeholder="배송처, 기사 등" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={handleConfirm}> 출고 처리</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 수주 상세 슬라이드오버 ── */
function SalesDetail({ order, onClose }) {
  const s = STATUS[order.status] || STATUS.draft;
  const { supply, vat, total } = orderTotal(order);
  const shipped = order.shippedItems || {};

  return (
    <div
      style={{ display: 'block', position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)' }}
      onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(520px,100vw)', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,.3)', overflowY: 'auto' }}>
        {/* 헤더 */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <StatusBadge status={order.status} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '6px 0 2px' }}>{order.orderNo}</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>발행일: {order.orderDate || '-'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-muted)' }}></button>
        </div>

        {/* 날짜 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--border)' }}>
          {[
            { label: '수주일',    value: order.orderDate || '-' },
            { label: '출고예정',  value: order.deliveryDate || '-' },
            { label: '결제예정',  value: order.paymentDueDate || '-' },
          ].map(r => (
            <div key={r.label} style={{ background: 'var(--bg-card)', padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.label}</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 24px' }}>
          {/* 메타 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {[
              { label: '고객사',    value: order.customer },
              { label: '고객사코드', value: order.customerCode || '-' },
              { label: '메모',      value: order.note || '-' },
            ].map(r => (
              <div key={r.label} style={{ padding: '8px', background: 'var(--bg-input,#1e2635)', borderRadius: '6px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.label}</div>
                <div style={{ fontWeight: 600 }}>{r.value}</div>
              </div>
            ))}
            <div style={{ padding: '8px', background: 'var(--bg-input,#1e2635)', borderRadius: '6px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>합계</div>
              <div style={{ fontWeight: 700, color: 'var(--accent)' }}>₩{fmt(total)}</div>
            </div>
          </div>

          {/* 품목 */}
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>품목</div>
          <div className="table-wrapper" style={{ marginBottom: '16px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>품목명</th>
                  <th className="text-right">수주</th>
                  <th className="text-right">출고</th>
                  <th className="text-right">잔량</th>
                  <th className="text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => {
                  const s2 = toNum(shipped[i] || 0);
                  return (
                    <tr key={i}>
                      <td>
                        <strong>{it.name}</strong>
                        <br />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{it.itemCode || '-'}</span>
                      </td>
                      <td className="text-right">{it.qty}</td>
                      <td className="text-right" style={{ color: '#16a34a' }}>{s2}</td>
                      <td className="text-right" style={{ color: it.qty - s2 > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{it.qty - s2}</td>
                      <td className="text-right">₩{fmt(it.qty * it.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={4} style={{ textAlign: 'right' }}>공급가 / 부가세 / 합계</td>
                  <td className="text-right">₩{fmt(supply)} / ₩{fmt(vat)} / ₩{fmt(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {order.taxInvoiceId && (
            <div style={{ padding: '8px 12px', background: 'rgba(124,58,237,0.1)', borderRadius: '6px', fontSize: '12px', color: '#7c3aed', marginBottom: '12px' }}>
               세금계산서 발행 완료 (TI-{order.orderNo})
            </div>
          )}
          {order.receivableEntryId && (
            <div style={{ padding: '8px 12px', background: 'rgba(22,163,74,0.1)', borderRadius: '6px', fontSize: '12px', color: '#16a34a', marginBottom: '12px' }}>
               미수금 등록 완료
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 메인 컴포넌트 ── */
export default function SalesPage() {
  const [state, setState] = useStore();
  const orders       = state.salesOrders || [];
  const vendors      = useMemo(() => (state.vendorMaster || []).filter(v => v.type === 'customer' || v.type === 'both'), [state.vendorMaster]);
  const itemsMaster  = state.mappedData || [];

  const [currentTab,   setCurrentTab]   = useState('all');
  const [showModal,    setShowModal]     = useState(false);
  const [editOrder,    setEditOrder]     = useState(null);
  const [shipOrder,    setShipOrder]     = useState(null);
  const [detailOrder,  setDetailOrder]   = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  /* ── KPI ── */
  const kpi = useMemo(() => ({
    all:      orders.length,
    active:   orders.filter(o => o.status === 'confirmed' || o.status === 'partial').length,
    complete: orders.filter(o => o.status === 'complete' && (o.shippedAt || '').startsWith(thisMonth)).length,
    draft:    orders.filter(o => o.status === 'draft').length,
  }), [orders, thisMonth]);

  const pendingReceivable = useMemo(() =>
    (state.accountEntries || [])
      .filter(e => e.type === 'receivable' && !e.settled)
      .reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
    [state.accountEntries]
  );

  /* ── 탭 필터 ── */
  const filteredOrders = useMemo(() => {
    let list = orders;
    if (currentTab === 'draft')     list = orders.filter(o => o.status === 'draft');
    if (currentTab === 'confirmed') list = orders.filter(o => o.status === 'confirmed');
    if (currentTab === 'active')    list = orders.filter(o => o.status === 'confirmed' || o.status === 'partial');
    if (currentTab === 'complete')  list = orders.filter(o => o.status === 'complete');
    if (currentTab === 'cancelled') list = orders.filter(o => o.status === 'cancelled');
    return [...list].reverse();
  }, [orders, currentTab]);

  /* ── 저장 ── */
  const handleSaveOrder = (newOrder, isEdit) => {
    const updated = isEdit
      ? orders.map(o => o.id === newOrder.id ? newOrder : o)
      : [...orders, newOrder];
    setState({ salesOrders: updated });
    addAuditLog(isEdit ? '수주수정' : '수주등록', newOrder.orderNo, { customer: newOrder.customer, total: orderTotal(newOrder).total });
    showToast(`수주서 ${newOrder.orderNo} ${isEdit ? '수정' : '저장'} 완료!`, 'success');
    setShowModal(false);
    setEditOrder(null);
  };

  /* ── 수주 확정 ── */
  const handleConfirm = (order) => {
    if (!confirm(`수주서 ${order.orderNo}를 확정하시겠습니까?\n확정 후에는 수정할 수 없습니다.`)) return;
    const updated = orders.map(o => o.id === order.id ? { ...o, status: 'confirmed', confirmedAt: new Date().toISOString() } : o);
    setState({ salesOrders: updated });
    addAuditLog('수주확정', order.orderNo, { customer: order.customer });
    showToast(`수주서 ${order.orderNo} 확정 완료!`, 'success');
  };

  /* ── 취소 ── */
  const handleCancel = (order) => {
    if (!confirm(`수주서 ${order.orderNo}를 취소하시겠습니까?`)) return;
    const updated = orders.map(o => o.id === order.id ? { ...o, status: 'cancelled', cancelledAt: new Date().toISOString() } : o);
    setState({ salesOrders: updated });
    showToast(`수주서 ${order.orderNo} 취소 처리`, 'info');
  };

  /* ── 출고 처리 ── */
  const handleShip = (order, { shipDate, shipNote, thisShip, totalShipping }) => {
    const shipped = order.shippedItems || {};

    // 재고 출고 반영
    (order.items || []).forEach((it, i) => {
      const qty = thisShip[i] || 0;
      if (qty <= 0) return;
      addTransaction({
        type:      'out',
        itemName:  it.name,
        itemCode:  it.itemCode || '',
        quantity:  qty,
        unitPrice: toNum(it.price),
        date:      shipDate,
        vendor:    order.customer,
        note:      `수주 ${order.orderNo} 출고${shipNote ? ' - ' + shipNote : ''}`,
      });
    });

    // 누적 출고 업데이트
    const newShipped = { ...shipped };
    (order.items || []).forEach((_, i) => {
      newShipped[i] = toNum(newShipped[i] || 0) + (thisShip[i] || 0);
    });

    const allComplete = (order.items || []).every((it, i) => newShipped[i] >= toNum(it.qty));
    const newStatus   = allComplete ? 'complete' : 'partial';

    // 미수금 자동 생성 (전량 완료 시)
    const accountEntries = [...(state.accountEntries || [])];
    let receivableEntryId = order.receivableEntryId || '';
    if (allComplete && !order.receivableEntryId) {
      const { total } = orderTotal(order);
      const entry = {
        id:             crypto.randomUUID(),
        type:           'receivable',
        vendorName:     order.customer,
        amount:         total,
        dueDate:        order.paymentDueDate || calcDueDate(shipDate, 30),
        description:    `수주 ${order.orderNo} 출고 - 미수금`,
        date:           shipDate,
        settled:        false,
        sourceOrderId:  order.id,
        sourceOrderNo:  order.orderNo,
      };
      accountEntries.push(entry);
      receivableEntryId = entry.id;
    }

    const updatedOrders = orders.map(o => o.id === order.id
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
    setShipOrder(null);
  };

  /* ── 세금계산서 발행 ── */
  const handleGenTaxInvoice = (order) => {
    if (!confirm(`수주서 ${order.orderNo}에 대한 매출 세금계산서를 발행하시겠습니까?`)) return;

    const invoiceNo = `TI-${order.orderNo}`;
    const existing  = (state.taxInvoices || []).find(t => t.invoiceNo === invoiceNo);
    if (existing) { showToast('이미 발행된 세금계산서가 있습니다.', 'warning'); return; }

    const { supply, vat, total } = orderTotal(order);
    const taxInvoice = {
      id:             crypto.randomUUID(),
      invoiceNo,
      type:           'sales',
      customer:       order.customer,
      customerCode:   order.customerCode || '',
      issueDate:      today,
      supply,
      vat,
      total,
      items:          (order.items || []).map(it => ({
        name: it.name, itemCode: it.itemCode, qty: it.qty,
        price: it.price, amount: toNum(it.qty) * toNum(it.price),
      })),
      sourceOrderNo:  order.orderNo,
      sourceOrderId:  order.id,
      note:           order.note || '',
    };

    const updatedOrders = orders.map(o => o.id === order.id ? { ...o, taxInvoiceId: taxInvoice.id } : o);
    const taxInvoices   = [...(state.taxInvoices || []), taxInvoice];
    setState({ salesOrders: updatedOrders, taxInvoices });
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

      {/* KPI */}
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

      {/* 탭 */}
      <div className="scan-mode-bar" style={{ marginBottom: '12px' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`scan-mode-btn${currentTab === t.key ? ' active' : ''}`}
            onClick={() => setCurrentTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 수주 테이블 */}
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
                  <th>수주번호</th>
                  <th>고객사</th>
                  <th>품목 (대표)</th>
                  <th className="text-right">공급가</th>
                  <th className="text-right">부가세</th>
                  <th className="text-right">합계</th>
                  <th>출고예정일</th>
                  <th>상태</th>
                  <th>관리</th>
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
                        <button
                          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 700, padding: 0 }}
                          onClick={() => setDetailOrder(order)}
                        >
                          {order.orderNo}
                        </button>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.orderDate || '-'}</div>
                      </td>
                      <td>
                        <strong>{order.customer}</strong>
                        {order.customerCode && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.customerCode}</div>}
                      </td>
                      <td style={{ fontSize: '13px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {itemPreview || '-'}
                      </td>
                      <td className="text-right">₩{fmt(supply)}</td>
                      <td className="text-right" style={{ color: 'var(--text-muted)' }}>₩{fmt(vat)}</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>₩{fmt(total)}</td>
                      <td style={overdue ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
                        {order.deliveryDate || '-'}
                      </td>
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
                            <button
                              className="btn btn-xs btn-outline"
                              style={{ color: '#16a34a', borderColor: '#16a34a' }}
                              onClick={() => setShipOrder(order)}
                            >출고</button>
                          )}
                          {order.status === 'complete' && !order.taxInvoiceId && (
                            <button
                              className="btn btn-xs btn-outline"
                              style={{ color: '#7c3aed', borderColor: '#7c3aed' }}
                              onClick={() => handleGenTaxInvoice(order)}
                            >세금계산서</button>
                          )}
                          {order.status !== 'cancelled' && order.status !== 'complete' && (
                            <button
                              className="btn btn-xs btn-outline"
                              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                              onClick={() => handleCancel(order)}
                            >취소</button>
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

      {/* 수주 작성/수정 모달 */}
      {showModal && (
        <SalesModal
          editOrder={editOrder}
          orders={orders}
          vendors={vendors}
          itemsMaster={itemsMaster}
          onClose={() => { setShowModal(false); setEditOrder(null); }}
          onSave={handleSaveOrder}
        />
      )}

      {/* 출고 처리 모달 */}
      {shipOrder && (
        <ShipModal
          order={shipOrder}
          onClose={() => setShipOrder(null)}
          onShip={(data) => handleShip(shipOrder, data)}
        />
      )}

      {/* 상세 슬라이드오버 */}
      {detailOrder && (
        <SalesDetail
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </div>
  );
}
