import React from 'react';
import { STATUS, fmt, toNum, orderTotal } from '../../domain/ordersConfig.js';

export function OrderDetail({ order, onClose }) {
  const s      = STATUS[order.status] || STATUS.draft;
  const supply = orderTotal(order);
  const vat    = Math.floor(supply * 0.1);

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
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}></button>
        </div>

        {/* 날짜 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--border)' }}>
          {[
            { label: '발주일',   value: order.orderDate      || '-' },
            { label: '납기예정', value: order.deliveryDate   || '-' },
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
                  <th>품목명</th><th>코드</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">단가</th>
                  <th className="text-right">금액</th>
                  {order.receivedItems && <th className="text-right">입고</th>}
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((it, i) => {
                  const amt      = toNum(it.qty) * toNum(it.price);
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
               {order.note}
            </div>
          )}
          {order.taxInvoiceId && (
            <div style={{ background: 'rgba(63,185,80,.1)', border: '1px solid var(--success)', borderRadius: '6px', padding: '10px', fontSize: '13px', color: 'var(--success)' }}>
               세금계산서 발행 완료 ({order.taxInvoiceId})
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
