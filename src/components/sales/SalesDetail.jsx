import React from 'react';
import { STATUS, fmt, toNum, orderTotal } from '../../domain/salesConfig.js';
import { StatusBadge } from './StatusBadge.jsx';

export function SalesDetail({ order, onClose }) {
  const { supply, vat, total } = orderTotal(order);
  const shipped = order.shippedItems || {};

  return (
    <div
      style={{ display: 'block', position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)' }}
      onClick={ev => { if (ev.target === ev.currentTarget) onClose(); }}
    >
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 'min(520px,100vw)', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', boxShadow: '-4px 0 24px rgba(0,0,0,.3)', overflowY: 'auto' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <StatusBadge status={order.status} />
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '6px 0 2px' }}>{order.orderNo}</h2>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>발행일: {order.orderDate || '-'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--text-muted)' }}></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--border)' }}>
          {[
            { label: '수주일',   value: order.orderDate || '-' },
            { label: '출고예정', value: order.deliveryDate || '-' },
            { label: '결제예정', value: order.paymentDueDate || '-' },
          ].map(r => (
            <div key={r.label} style={{ background: 'var(--bg-card)', padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{r.label}</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
            {[
              { label: '고객사',     value: order.customer },
              { label: '고객사코드', value: order.customerCode || '-' },
              { label: '메모',       value: order.note || '-' },
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
                  const s = toNum(shipped[i] || 0);
                  return (
                    <tr key={i}>
                      <td>
                        <strong>{it.name}</strong>
                        <br />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{it.itemCode || '-'}</span>
                      </td>
                      <td className="text-right">{it.qty}</td>
                      <td className="text-right" style={{ color: '#16a34a' }}>{s}</td>
                      <td className="text-right" style={{ color: it.qty - s > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{it.qty - s}</td>
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
