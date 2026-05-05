import React, { useState, useMemo } from 'react';
import { showToast } from '../../toast.js';
import { fmt, toNum, EMPTY_ITEM, genOrderNo, calcDueDate } from '../../domain/salesConfig.js';

export function SalesModal({ editOrder, orders, vendors, itemsMaster, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const e = editOrder || {};
  const isEdit = !!editOrder;

  const [customer, setCustomer]             = useState(e.customer || '');
  const [customerCode, setCustomerCode]     = useState(e.customerCode || '');
  const [orderDate, setOrderDate]           = useState(e.orderDate || today);
  const [deliveryDate, setDeliveryDate]     = useState(e.deliveryDate || calcDueDate(today, 7));
  const [paymentDueDate, setPaymentDueDate] = useState(e.paymentDueDate || calcDueDate(today, 30));
  const [note, setNote]                     = useState(e.note || '');
  const [orderItems, setOrderItems]         = useState(
    (e.items && e.items.length > 0)
      ? e.items.map(it => ({ name: it.name || '', itemCode: it.itemCode || '', qty: String(it.qty || ''), price: String(it.price || '') }))
      : [{ ...EMPTY_ITEM }]
  );

  const supply = useMemo(
    () => orderItems.reduce((s, it) => s + toNum(it.qty) * toNum(it.price), 0),
    [orderItems]
  );
  const vat   = Math.floor(supply * 0.1);

  const updateItem = (idx, field, value) =>
    setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const handleItemNameChange = (idx, name) => {
    updateItem(idx, 'name', name);
    const master = itemsMaster.find(it => it.itemName === name);
    if (master) {
      setOrderItems(prev => prev.map((it, i) => i !== idx ? it : {
        ...it, name,
        itemCode: it.itemCode || master.itemCode || '',
        price: it.price || String(master.sellingPrice || master.unitPrice || ''),
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
    onSave({
      id:                e.id || crypto.randomUUID(),
      orderNo:           e.orderNo || genOrderNo(orders, orderDate),
      orderDate, deliveryDate, paymentDueDate,
      customer,
      customerCode:      customerCode.trim(),
      note:              note.trim(),
      items:             validItems.map(it => ({ name: it.name.trim(), itemCode: it.itemCode.trim(), qty: toNum(it.qty), price: toNum(it.price) })),
      status:            e.status || 'draft',
      createdAt:         e.createdAt || new Date().toISOString(),
      updatedAt:         new Date().toISOString(),
      shippedItems:      e.shippedItems || {},
      receivableEntryId: e.receivableEntryId || '',
      taxInvoiceId:      e.taxInvoiceId || '',
    }, isEdit);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '760px', width: '95vw', maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? ` 수주 수정 - ${e.orderNo}` : ' 견적/수주 작성'}</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
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
                {customer && !vendors.find(v => v.name === customer) && <option value={customer}>{customer}</option>}
              </select>
            </div>
            <div>
              <label className="form-label">고객사 코드</label>
              <input className="form-input" type="text" value={customerCode} readOnly style={{ background: 'var(--bg-input,#1e2635)' }} />
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
                        <input className="form-input" list="sp-item-list" value={it.name} placeholder="품목명" style={{ minWidth: '140px' }} onChange={ev => handleItemNameChange(idx, ev.target.value)} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input className="form-input" value={it.itemCode} placeholder="자동" readOnly style={{ width: '90px', fontSize: '12px', background: 'var(--bg-input)' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input className="form-input" type="number" min="1" value={it.qty} placeholder="0" style={{ width: '70px', textAlign: 'right' }} onChange={ev => updateItem(idx, 'qty', ev.target.value)} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input className="form-input" type="number" min="0" value={it.price} placeholder="0" style={{ width: '110px', textAlign: 'right' }} onChange={ev => updateItem(idx, 'price', ev.target.value)} />
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>
                        {amt > 0 ? '₩' + Math.round(amt).toLocaleString('ko-KR') : '-'}
                      </td>
                      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                        <button type="button" className="btn btn-xs btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => removeItem(idx)}></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ 품목 추가</button>

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
