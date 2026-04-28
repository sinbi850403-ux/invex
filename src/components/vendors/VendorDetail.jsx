import React from 'react';
import { TYPE_LABEL, TYPE_BADGE, PAYMENT_TERMS, toNum, fmt } from '../../domain/vendorsConfig.js';

export function VendorDetail({ vendor, transactions, onClose, onEdit }) {
  const vendorTxs = transactions.filter(tx => (tx.vendor || '').trim() === vendor.name).reverse();
  const inAmt  = vendorTxs.filter(t => t.type === 'in').reduce((s, t) => s + toNum(t.quantity) * toNum(t.unitPrice || 0), 0);
  const outAmt = vendorTxs.filter(t => t.type === 'out').reduce((s, t) => s + toNum(t.quantity) * toNum(t.unitPrice || 0), 0);
  const payLabel = (PAYMENT_TERMS.find(p => p.value === vendor.paymentTerm) || {}).label || '-';

  const infoCells = [
    { label: '사업자번호', value: vendor.bizNumber },
    { label: '업태 / 종목', value: [vendor.bizType, vendor.bizItem].filter(Boolean).join(' / ') },
    { label: '담당자', value: vendor.contactName },
    { label: '연락처', value: vendor.phone },
    { label: '이메일', value: vendor.email },
    { label: '팩스', value: vendor.fax },
    { label: '결제조건', value: payLabel !== '-' ? payLabel : '' },
    { label: '신용한도', value: vendor.creditLimit ? fmt(vendor.creditLimit) : '' },
  ].filter(r => r.value);

  return (
    <div style={{ display: 'block', position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '520px', maxWidth: '95vw', background: 'var(--bg-card)', boxShadow: '-4px 0 24px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '20px 24px 8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className={`badge ${TYPE_BADGE[vendor.type] || ''}`}>{TYPE_LABEL[vendor.type] || ''}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{vendor.code || ''}</span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 2px' }}>{vendor.name}</h2>
            {vendor.ceoName && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>대표: {vendor.ceoName}</div>}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm btn-outline" onClick={onEdit}> 수정</button>
            <button style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose}></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1px', background: 'var(--border)', marginBottom: '16px' }}>
          {[{ label: '총 거래 건수', value: `${vendorTxs.length}건` }, { label: '누적 매입액', value: fmt(inAmt) }, { label: '누적 매출액', value: fmt(outAmt) }].map(c => (
            <div key={c.label} style={{ background: 'var(--bg-card)', padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>{c.value}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', marginBottom: '10px' }}>기본 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {infoCells.map(r => (
                <div key={r.label} style={{ background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>{r.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.value}</div>
                </div>
              ))}
            </div>
            {vendor.address && (
              <div style={{ marginTop: '8px', background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>주소</div>
                <div style={{ fontSize: '13px' }}>{vendor.address}</div>
              </div>
            )}
            {(vendor.bankName || vendor.bankAccount) && (
              <div style={{ marginTop: '8px', background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>계좌정보</div>
                <div style={{ fontSize: '13px' }}>{[vendor.bankName, vendor.bankAccount, vendor.bankHolder].filter(Boolean).join(' / ')}</div>
              </div>
            )}
            {vendor.note && (
              <div style={{ marginTop: '8px', background: 'var(--bg-input)', borderRadius: '6px', padding: '8px 10px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px' }}>비고</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{vendor.note}</div>
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.05em', marginBottom: '10px' }}>
              최근 거래 이력 <span style={{ fontWeight: 400 }}>({vendorTxs.length}건)</span>
            </div>
            {vendorTxs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>거래 이력이 없습니다.</div>
            ) : (
              <div className="table-wrapper" style={{ border: 'none' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>날짜</th><th>구분</th><th>품목</th><th className="text-right">수량</th><th className="text-right">금액</th></tr>
                  </thead>
                  <tbody>
                    {vendorTxs.slice(0, 20).map((tx, i) => {
                      const amt = toNum(tx.quantity) * toNum(tx.unitPrice || 0);
                      return (
                        <tr key={tx.id || i}>
                          <td style={{ color: 'var(--text-muted)' }}>{String(tx.date || '').slice(0, 10)}</td>
                          <td><span className={tx.type === 'in' ? 'type-in' : 'type-out'}>{tx.type === 'in' ? '입고' : '출고'}</span></td>
                          <td>{tx.itemName || '-'}</td>
                          <td className="text-right">{toNum(tx.quantity).toLocaleString('ko-KR')}</td>
                          <td className="text-right">{fmt(amt)}</td>
                        </tr>
                      );
                    })}
                    {vendorTxs.length > 20 && (
                      <tr><td colSpan={5} style={{ padding: '8px', textAlign: 'center', color: 'var(--text-muted)' }}>외 {vendorTxs.length - 20}건 더 있음</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
