import React, { useState } from 'react';
import { showToast } from '../../toast.js';
import { toNum } from '../../domain/salesConfig.js';

export function ShipModal({ order, onClose, onShip }) {
  const today  = new Date().toISOString().slice(0, 10);
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
                          type="number" className="form-input"
                          value={qtys[i] ?? ''} min="0" max={remaining}
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
