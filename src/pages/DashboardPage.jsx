/**
 * DashboardPage.jsx - 고급 분석 (ABC 분석, 회전율, 월별 추이, 유통기한 임박)
 */
import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';

function calcABCAnalysis(items) {
  const sorted = items
    .map(item => ({
      ...item,
      totalPrice: parseFloat(item.totalPrice) || (() => {
        const supply = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
        return supply + Math.floor(supply * 0.1);
      })(),
    }))
    .sort((a, b) => b.totalPrice - a.totalPrice);

  const grandTotal = sorted.reduce((s, r) => s + r.totalPrice, 0) || 1;
  let cumulative = 0;

  return sorted.map(item => {
    cumulative += item.totalPrice;
    const cumPercent = Math.round((cumulative / grandTotal) * 100);
    let grade = 'C';
    if (cumPercent <= 80) grade = 'A';
    else if (cumPercent <= 95) grade = 'B';
    return { ...item, cumPercent, grade };
  });
}

function calcTurnoverRate(items, transactions) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  const outMap = {};
  transactions
    .filter(tx => tx.type === 'out' && tx.date >= cutoff)
    .forEach(tx => { outMap[tx.itemName] = (outMap[tx.itemName] || 0) + (parseFloat(tx.quantity) || 0); });

  return items.map(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const outQty = outMap[item.itemName] || 0;
    const turnover = currentQty > 0 ? outQty / currentQty : 0;
    return { itemName: item.itemName, itemCode: item.itemCode || '', currentQty, outQty, turnover };
  }).sort((a, b) => b.turnover - a.turnover);
}

function calcMonthlyTrend(transactions) {
  if (!transactions.length) return [];
  const monthMap = {};
  transactions.forEach(tx => {
    const month = (tx.date || '').substring(0, 7);
    if (!month) return;
    if (!monthMap[month]) monthMap[month] = { month, inQty: 0, outQty: 0 };
    const qty = parseFloat(tx.quantity) || 0;
    if (tx.type === 'in') monthMap[month].inQty += qty;
    else monthMap[month].outQty += qty;
  });
  return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
}

function getExpiryAlerts(items) {
  const today = new Date();
  return items
    .filter(item => item.expiryDate)
    .map(item => {
      const expiry = new Date(item.expiryDate);
      const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      return { ...item, daysLeft };
    })
    .filter(item => item.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export default function DashboardPage() {
  const [state] = useStore();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  const abcData      = useMemo(() => calcABCAnalysis(items), [items]);
  const turnoverData = useMemo(() => calcTurnoverRate(items, transactions), [items, transactions]);
  const monthlyTrend = useMemo(() => calcMonthlyTrend(transactions), [transactions]);
  const expiryAlerts = useMemo(() => getExpiryAlerts(items), [items]);

  const totalValue   = useMemo(() => items.reduce((s, r) => s + (parseFloat(r.totalPrice) || 0), 0), [items]);
  const avgTurnover  = useMemo(() =>
    turnoverData.length > 0
      ? (turnoverData.reduce((s, t) => s + t.turnover, 0) / turnoverData.length).toFixed(1)
      : '0',
    [turnoverData]
  );
  const deadStockCount = useMemo(() => turnoverData.filter(t => t.turnover === 0).length, [turnoverData]);

  if (items.length === 0) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">고급 분석</h1></div>
        <div className="card">
          <div className="empty-state">
            <div className="icon">📊</div>
            <div className="msg">분석할 데이터가 없습니다.</div>
            <div className="sub">품목을 등록하면 ABC 분석과 회전율을 바로 확인할 수 있습니다.</div>
          </div>
        </div>
      </div>
    );
  }

  const handleExport = () => {
    const exportData = abcData.map(d => ({
      '등급': d.grade, '품목명': d.itemName, '품목코드': d.itemCode || '',
      '수량': d.quantity, '금액': d.totalPrice, '누적비중(%)': d.cumPercent,
    }));
    downloadExcel(exportData, 'ABC분석');
    showToast('ABC 분석표를 내보냈습니다.', 'success');
  };

  const aCount = abcData.filter(d => d.grade === 'A').length;
  const bCount = abcData.filter(d => d.grade === 'B').length;
  const cCount = abcData.filter(d => d.grade === 'C').length;
  const total  = abcData.length || 1;
  const maxTrend = monthlyTrend.length > 0
    ? Math.max(...monthlyTrend.map(t => Math.max(t.inQty, t.outQty))) || 1
    : 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 고급 분석</h1>
          <div className="page-desc">재고 데이터를 바탕으로 운영 판단에 필요한 핵심 지표를 보여줍니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={handleExport}>분석표 내보내기</button>
        </div>
      </div>

      {/* KPI */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">총 재고 가치</div>
          <div className="stat-value text-accent">{totalValue > 0 ? '₩' + Math.round(totalValue).toLocaleString('ko-KR') : '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">평균 회전율</div>
          <div className="stat-value">{avgTurnover}회</div>
          <div className="stat-change">최근 30일 기준</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">A등급 품목</div>
          <div className="stat-value text-success">{aCount}개</div>
          <div className="stat-change">가치 상위 80% 차지</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">비활성 재고</div>
          <div className={`stat-value${deadStockCount > 0 ? ' text-danger' : ''}`}>{deadStockCount}개</div>
          <div className="stat-change">30일간 출고 없음</div>
        </div>
      </div>

      {/* ABC 분석 */}
      <div className="card">
        <div className="card-title">ABC 분석 <span className="card-subtitle">금액 기준 품목 등급 분류</span></div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <span className="badge badge-success" style={{ padding: '6px 14px' }}>A등급: 상위 80%</span>
          <span className="badge badge-warning" style={{ padding: '6px 14px' }}>B등급: 80~95%</span>
          <span className="badge badge-default" style={{ padding: '6px 14px' }}>C등급: 나머지</span>
        </div>
        <div style={{ display: 'flex', height: '30px', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ width: `${(aCount/total)*100}%`, background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>A: {aCount}</div>
          <div style={{ width: `${(bCount/total)*100}%`, background: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>B: {bCount}</div>
          <div style={{ width: `${(cCount/total)*100}%`, background: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 600 }}>C: {cCount}</div>
        </div>
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>순위</th>
                <th>등급</th>
                <th className="col-fill">품목명</th>
                <th>코드</th>
                <th className="text-right">수량</th>
                <th className="text-right">금액</th>
                <th className="text-right">누적비중</th>
              </tr>
            </thead>
            <tbody>
              {abcData.slice(0, 20).map((d, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                  </td>
                  <td>
                    <span className={`badge ${d.grade === 'A' ? 'badge-success' : d.grade === 'B' ? 'badge-warning' : 'badge-default'}`}>{d.grade}</span>
                  </td>
                  <td className="col-fill"><strong>{d.itemName}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{d.itemCode || '-'}</td>
                  <td className="text-right">{parseFloat(d.quantity || 0).toLocaleString('ko-KR')}</td>
                  <td className="text-right">{d.totalPrice > 0 ? '₩' + Math.round(d.totalPrice).toLocaleString('ko-KR') : '-'}</td>
                  <td className="text-right">
                    <div className="ratio-bar">
                      <div className="ratio-bar-track"><div className="ratio-bar-fill" style={{ width: `${d.cumPercent}%` }} /></div>
                      <span className="ratio-bar-label">{d.cumPercent}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 재고 회전율 */}
      <div className="card">
        <div className="card-title">재고 회전율 <span className="card-subtitle">최근 30일 출고 기준</span></div>
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-fill">품목명</th>
                <th>코드</th>
                <th className="text-right">현재 재고</th>
                <th className="text-right">30일 출고량</th>
                <th className="text-right">회전율</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {turnoverData.slice(0, 20).map((d, i) => (
                <tr key={i}>
                  <td className="col-fill"><strong>{d.itemName}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{d.itemCode || '-'}</td>
                  <td className="text-right">{d.currentQty.toLocaleString('ko-KR')}</td>
                  <td className="text-right">{d.outQty.toLocaleString('ko-KR')}</td>
                  <td className="text-right"><strong>{d.turnover.toFixed(1)}</strong></td>
                  <td>
                    {d.turnover === 0
                      ? <span className="badge badge-danger">비활성</span>
                      : d.turnover < 1
                        ? <span className="badge badge-warning">저회전</span>
                        : <span className="badge badge-success">정상</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 월별 추이 */}
      {monthlyTrend.length > 0 && (
        <div className="card">
          <div className="card-title">월별 입출고 추이</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {monthlyTrend.map(m => (
              <div key={m.month}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <strong>{m.month}</strong>
                  <span>입고 <span className="type-in">{m.inQty.toLocaleString('ko-KR')}</span> | 출고 <span className="type-out">{m.outQty.toLocaleString('ko-KR')}</span></span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <div style={{ height: '12px', flex: 1, background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(m.inQty/maxTrend)*100}%`, background: 'var(--success)', borderRadius: '3px' }} />
                  </div>
                  <div style={{ height: '12px', flex: 1, background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(m.outQty/maxTrend)*100}%`, background: 'var(--danger)', borderRadius: '3px' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 유통기한 임박 */}
      {expiryAlerts.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--warning)' }}>
          <div className="card-title" style={{ color: 'var(--warning)' }}>유통기한 임박 품목 <span className="badge badge-warning">{expiryAlerts.length}건</span></div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-fill">품목명</th>
                  <th>LOT</th>
                  <th className="text-right">수량</th>
                  <th>유통기한</th>
                  <th>D-Day</th>
                </tr>
              </thead>
              <tbody>
                {expiryAlerts.map((e, i) => (
                  <tr key={i} className={e.daysLeft <= 0 ? 'row-danger' : e.daysLeft <= 7 ? 'row-warning' : ''}>
                    <td className="col-fill"><strong>{e.itemName}</strong></td>
                    <td style={{ color: 'var(--text-muted)' }}>{e.lotNumber || '-'}</td>
                    <td className="text-right">{parseFloat(e.quantity || 0).toLocaleString('ko-KR')}</td>
                    <td>{e.expiryDate}</td>
                    <td>
                      {e.daysLeft <= 0
                        ? <span className="badge badge-danger">만료</span>
                        : e.daysLeft <= 7
                          ? <span className="badge badge-danger">D-{e.daysLeft}</span>
                          : <span className="badge badge-warning">D-{e.daysLeft}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
