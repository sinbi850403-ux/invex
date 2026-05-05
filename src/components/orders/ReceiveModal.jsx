import React, { useState } from 'react';
import { showToast } from '../../toast.js';
import { fmt, toNum } from '../../domain/ordersConfig.js';

export function ReceiveModal({ order, onClose, onReceive }) {
  const today        = new Date().toISOString().split('T')[0];
  const prevReceived = order.receivedItems || {};

  const [receiveDate, setReceiveDate] = useState(today);
  const [warehouse, setWarehouse]     = useState('');
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
      const ordered  = toNum(it.qty);
      const already  = toNum(prevReceived[i] || 0);
      const max      = ordered - already;
      const qty      = Math.max(0, Math.min(toNum(qtys[i] || 0), max));
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
          <h3 className="modal-title"> 입고 처리 - {order.orderNo}</h3>
          <button className="modal-close" onClick={onClose}></button>
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
                  const ordered   = toNum(it.qty);
                  const already   = toNum(prevReceived[i] || 0);
                  const remaining = ordered - already;
                  return (
                    <tr key={i}>
                      <td>{it.name}</td>
                      <td className="text-right">{ordered.toLocaleString('ko-KR')}</td>
                      <td className="text-right" style={{ color: 'var(--text-muted)' }}>{already.toLocaleString('ko-KR')}</td>
                      <td className="text-right">
                        <input
                          type="number" className="form-input"
                          value={qtys[i] ?? ''} min="0" max={remaining}
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
