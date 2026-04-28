import React, { useState, useMemo } from 'react';
import { showToast } from '../../toast.js';
import { fmt, toNum, EMPTY_ITEM, genOrderNo, calcDueDate } from '../../domain/ordersConfig.js';

export function OrderModal({ editOrder, orders, vendors, itemsMaster, onClose, onSave }) {
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
  const vat   = Math.floor(supply * 0.1);
  const total = supply + vat;

  const updateItem = (idx, field, value) =>
    setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const handleItemNameChange = (idx, name) => {
    updateItem(idx, 'name', name);
    const master = itemsMaster.find(it => it.itemName === name);
    if (master) {
      setOrderItems(prev => prev.map((it, i) => i !== idx ? it : {
        ...it, name,
        itemCode: it.itemCode || master.itemCode || '',
        price: it.price || String(master.unitPrice || ''),
      }));
    }
  };

  const handleVendorChange = (evt) => {
    const sel = evt.target;
    const terms = sel.options[sel.selectedIndex]?.dataset?.terms;
    setVendor(sel.value);
    const termDays = { cash: 0, transfer: 0, bill30: 30, bill60: 60, bill90: 90 };
    if (terms && termDays[terms] !== undefined) {
      setPaymentDueDate(calcDueDate(orderDate, termDays[terms] || 30));
    }
  };

  const addItem    = () => setOrderItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx) => { if (orderItems.length > 1) setOrderItems(prev => prev.filter((_, i) => i !== idx)); };

  const handleSave = () => {
    if (!vendor) { showToast('거래처를 선택해 주세요.', 'warning'); return; }
    const validItems = orderItems.filter(it => it.name.trim() && toNum(it.qty) > 0);
    if (!validItems.length) { showToast('발주 품목을 1개 이상 입력해 주세요.', 'warning'); return; }
    onSave({
      id:             e.id || crypto.randomUUID(),
      orderNo:        e.orderNo || genOrderNo(orders, orderDate),
      orderDate, deliveryDate, paymentDueDate, vendor,
      note:           note.trim(),
      items:          validItems.map(it => ({ name: it.name.trim(), itemCode: it.itemCode.trim(), qty: toNum(it.qty), price: toNum(it.price) })),
      status:         e.status || 'draft',
      createdAt:      e.createdAt || new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
      payableEntryId: e.payableEntryId || '',
      taxInvoiceId:   e.taxInvoiceId   || '',
    }, isEdit);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '720px', width: '95vw' }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? ` 발주서 수정 - ${e.orderNo}` : ' 신규 발주서 작성'}</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">거래처 <span className="required">*</span></label>
              <select className="form-select" value={vendor} onChange={handleVendorChange}>
                <option value="">-- 선택 --</option>
                {vendors.map(v => <option key={v.name} value={v.name} data-terms={v.paymentTerm || ''}>{v.name}</option>)}
                {e.vendor && !vendors.find(v => v.name === e.vendor) && <option value={e.vendor}>{e.vendor}</option>}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">발주일 <span className="required">*</span></label>
              <input className="form-input" type="date" value={orderDate} onChange={ev => setOrderDate(ev.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">납기 예정일</label>
              <input className="form-input" type="date" value={deliveryDate} onChange={ev => setDeliveryDate(ev.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">결제 예정일</label>
              <input className="form-input" type="date" value={paymentDueDate} onChange={ev => setPaymentDueDate(ev.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">비고</label>
            <input className="form-input" value={note} onChange={ev => setNote(ev.target.value)} placeholder="메모 (선택)" />
          </div>

          {/* 품목 테이블 */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '14px' }}> 발주 품목</strong>
              <button type="button" className="btn btn-sm btn-outline" onClick={addItem}>+ 품목 추가</button>
            </div>
            <datalist id="om-item-list">
              {itemsMaster.map((n, i) => <option key={i} value={n.itemName} />)}
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
                          <input className="form-input" list="om-item-list" value={it.name} placeholder="품목명" style={{ minWidth: '140px' }} onChange={ev => handleItemNameChange(idx, ev.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input className="form-input" value={it.itemCode} placeholder="코드" style={{ width: '80px', fontSize: '11px' }} onChange={ev => updateItem(idx, 'itemCode', ev.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input className="form-input" type="number" min="1" value={it.qty} placeholder="0" style={{ width: '70px', textAlign: 'right' }} onChange={ev => updateItem(idx, 'qty', ev.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input className="form-input" type="number" min="0" value={it.price} placeholder="0" style={{ width: '100px', textAlign: 'right' }} onChange={ev => updateItem(idx, 'price', ev.target.value)} />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                          {amt > 0 ? '₩' + Math.round(amt).toLocaleString('ko-KR') : '-'}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <button type="button" className="btn-icon btn-icon-danger" style={{ fontSize: '12px' }} onClick={() => removeItem(idx)}></button>
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
