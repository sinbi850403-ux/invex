import React from 'react';
import { fmt } from '../../domain/posConfig.js';

export function PosDashboard({ posData }) {
  const totalSales  = posData.reduce((s, d) => s + (parseFloat(d.totalSales)  || parseFloat(d.salesAmount) || 0), 0);
  const totalVat    = posData.reduce((s, d) => s + (parseFloat(d.vat)         || 0), 0);
  const totalCard   = posData.reduce((s, d) => s + (parseFloat(d.cardAmount)  || 0), 0);
  const totalCash   = posData.reduce((s, d) => s + (parseFloat(d.cashAmount)  || 0), 0);
  const totalPoint  = posData.reduce((s, d) => s + (parseFloat(d.pointAmount) || 0), 0);
  const totalRefund = posData.reduce((s, d) => s + (parseFloat(d.refund)      || 0), 0);
  const netSales    = totalSales - totalRefund;
  const totalSalesFooter = posData.reduce((s, d) => s + (parseFloat(d.salesAmount) || 0), 0);

  const storeMap = {};
  posData.forEach(d => { const s = d.storeName || '미지정'; storeMap[s] = (storeMap[s] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0); });
  const storeRanking = Object.entries(storeMap).sort((a, b) => b[1] - a[1]);

  const catMap = {};
  posData.forEach(d => { const c = d.category || '미분류'; catMap[c] = (catMap[c] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0); });
  const catRanking = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  const dateMap = {};
  posData.forEach(d => { const dt = d.saleDate || '미지정'; dateMap[dt] = (dateMap[dt] || 0) + (parseFloat(d.totalSales) || parseFloat(d.salesAmount) || 0); });
  const dateTrend = Object.entries(dateMap).sort((a, b) => a[0].localeCompare(b[0]));

  const paymentTotal = totalCard + totalCash + totalPoint || 1;
  const cardPct  = Math.round((totalCard  / paymentTotal) * 100);
  const cashPct  = Math.round((totalCash  / paymentTotal) * 100);
  const pointPct = 100 - cardPct - cashPct;
  const maxDate  = Math.max(...dateTrend.map(d => d[1])) || 1;

  return (
    <>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {[
          { label: '총 매출',   value: fmt(totalSales), sub: `${posData.length}건`,      cls: 'text-accent' },
          { label: '순매출',    value: fmt(netSales),   sub: `환불 ${fmt(totalRefund)}`,  cls: 'text-success' },
          { label: '부가세',    value: fmt(totalVat),   sub: '' },
          { label: '카드 매출', value: fmt(totalCard),  sub: `${cardPct}%`,   style: { color: 'var(--info, #58a6ff)' } },
          { label: '현금 매출', value: fmt(totalCash),  sub: `${cashPct}%`,   cls: 'text-success' },
          { label: '포인트',    value: fmt(totalPoint), sub: `${pointPct}%`,  style: { color: 'var(--warning)' } },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls || ''}`} style={s.style}>{s.value}</div>
            {s.sub && <div className="stat-change">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title"> 결제 수단 비율</div>
        <div style={{ display: 'flex', height: 32, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
          {totalCard  > 0 && <div style={{ width: `${cardPct}%`,  background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>카드 {cardPct}%</div>}
          {totalCash  > 0 && <div style={{ width: `${cashPct}%`,  background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>현금 {cashPct}%</div>}
          {totalPoint > 0 && <div style={{ width: `${pointPct}%`, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 600 }}>포인트 {pointPct}%</div>}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <span> 카드: {fmt(totalCard)}</span>
          <span> 현금: {fmt(totalCash)}</span>
          <span> 포인트: {fmt(totalPoint)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title"> 일자별 매출 추이</div>
          {dateTrend.length > 0 ? (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {dateTrend.map(([date, amount]) => (
                <div key={date} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: 12, minWidth: 80, color: 'var(--text-muted)' }}>{date}</span>
                  <div style={{ flex: 1, height: 20, background: 'var(--border-light)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((amount / maxDate) * 100)}%`, background: 'linear-gradient(90deg, var(--accent), #60a5fa)', borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, minWidth: 100, textAlign: 'right' }}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          ) : <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>일자 데이터 없음</div>}
        </div>

        <div>
          {storeRanking.length > 1 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-title"> 매장별 매출</div>
              {storeRanking.slice(0, 10).map(([name, amount], i) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                  <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{i + 1}</span>{name}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          )}
          {catRanking.length > 0 && (
            <div className="card">
              <div className="card-title"> 구분별 매출</div>
              {catRanking.slice(0, 10).map(([name, amount], i) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: 13 }}>
                  <span><span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{i + 1}</span>{name}</span>
                  <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{fmt(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-flush">
        <div className="card-title" style={{ padding: '12px 16px' }}> 상세 데이터 <span className="card-subtitle">{posData.length}건</span></div>
        <div className="table-wrapper" style={{ border: 'none', maxHeight: 400, overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>판매일자</th><th>매장</th><th>구분</th>
                <th className="text-right">총매출</th><th className="text-right">매출금액</th>
                <th className="text-right">부가세</th><th className="text-right">카드</th>
                <th className="text-right">현금</th><th className="text-right">포인트</th>
              </tr>
            </thead>
            <tbody>
              {posData.slice(0, 100).map((d, i) => (
                <tr key={i}>
                  <td className="col-num">{i + 1}</td>
                  <td>{d.saleDate || '-'}</td>
                  <td>{d.storeName || '-'}</td>
                  <td>{d.category || '-'}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{parseFloat(d.totalSales) ? fmt(parseFloat(d.totalSales)) : '-'}</td>
                  <td className="text-right">{parseFloat(d.salesAmount) ? fmt(parseFloat(d.salesAmount)) : '-'}</td>
                  <td className="text-right">{parseFloat(d.vat)         ? fmt(parseFloat(d.vat))         : '-'}</td>
                  <td className="text-right" style={{ color: 'var(--info, #58a6ff)' }}>{parseFloat(d.cardAmount)  ? fmt(parseFloat(d.cardAmount))  : '-'}</td>
                  <td className="text-right" style={{ color: 'var(--success)' }}>{parseFloat(d.cashAmount)  ? fmt(parseFloat(d.cashAmount))  : '-'}</td>
                  <td className="text-right" style={{ color: 'var(--warning)' }}>{parseFloat(d.pointAmount) ? fmt(parseFloat(d.pointAmount)) : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                <td /><td /><td />
                <td>합계</td>
                <td className="text-right">{fmt(totalSales)}</td>
                <td className="text-right">{fmt(totalSalesFooter)}</td>
                <td className="text-right">{fmt(totalVat)}</td>
                <td className="text-right">{fmt(totalCard)}</td>
                <td className="text-right">{fmt(totalCash)}</td>
                <td className="text-right">{fmt(totalPoint)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {posData.length > 100 && <div style={{ textAlign: 'center', padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>상위 100건만 표시 (전체 {posData.length}건)</div>}
      </div>
    </>
  );
}
