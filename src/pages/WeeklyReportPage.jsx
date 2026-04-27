/**
 * WeeklyReportPage.jsx - 주간 경영 보고서
 */
import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { getSalePrice } from '../price-utils.js';

// === 유틸리티 ===
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function filterByDateRange(txList, start, end) {
  return txList.filter(tx => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    return d >= start && d < end;
  });
}

function calcTotal(txList, type) {
  return txList
    .filter(tx => tx.type === type)
    .reduce((s, tx) => {
      const qty = parseFloat(tx.quantity) || 0;
      const price = type === 'out'
        ? getSalePrice(tx)
        : (parseFloat(tx.unitPrice) || 0);
      return s + qty * price;
    }, 0);
}

function calcChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 순위 배지 */
function RankBadge({ rank, type }) {
  const isTop = rank < 3;
  const bg = isTop
    ? type === 'out' ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)'
    : 'var(--bg-secondary)';
  const color = isTop ? '#fff' : 'var(--text-muted)';
  return (
    <span style={{
      width: '24px', height: '24px', borderRadius: '50%',
      background: bg, color, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: '700', flexShrink: 0,
    }}>
      {rank + 1}
    </span>
  );
}

export default function WeeklyReportPage() {
  const [state] = useStore();

  const {
    thisWeekSales, thisWeekPurchase,
    salesChange, purchaseChange,
    thisWeekTx, lowStockItems,
    topOutItems, topInItems,
    weekLabel,
  } = useMemo(() => {
    const transactions = state.transactions || [];
    const items = state.mappedData || [];
    const safetyStock = state.safetyStock || {};

    const now = new Date();
    const thisWeekStart = getMonday(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekTx = filterByDateRange(transactions, thisWeekStart, now);
    const lastWeekTx = filterByDateRange(transactions, lastWeekStart, thisWeekStart);

    const thisWeekSales = calcTotal(thisWeekTx, 'out');
    const thisWeekPurchase = calcTotal(thisWeekTx, 'in');
    const lastWeekSales = calcTotal(lastWeekTx, 'out');
    const lastWeekPurchase = calcTotal(lastWeekTx, 'in');
    const salesChange = calcChange(thisWeekSales, lastWeekSales);
    const purchaseChange = calcChange(thisWeekPurchase, lastWeekPurchase);

    const lowStockItems = items.filter(it => {
      const min = safetyStock[it.itemName];
      return min !== undefined && (parseFloat(it.quantity) || 0) <= min;
    });

    const outByItem = {};
    thisWeekTx.filter(tx => tx.type === 'out').forEach(tx => {
      const name = tx.itemName || '-';
      outByItem[name] = (outByItem[name] || 0) + (parseFloat(tx.quantity) || 0);
    });
    const topOutItems = Object.entries(outByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const inByItem = {};
    thisWeekTx.filter(tx => tx.type === 'in').forEach(tx => {
      const name = tx.itemName || '-';
      inByItem[name] = (inByItem[name] || 0) + (parseFloat(tx.quantity) || 0);
    });
    const topInItems = Object.entries(inByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const weekLabel = `${formatDate(thisWeekStart)} ~ ${formatDate(now)}`;

    return { thisWeekSales, thisWeekPurchase, salesChange, purchaseChange, thisWeekTx, lowStockItems, topOutItems, topInItems, weekLabel };
  }, [state.transactions, state.mappedData, state.safetyStock]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">주간 경영 보고서</h1>
          <div className="page-desc">{weekLabel}</div>
        </div>
      </div>

      {/* 주간 KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">이번 주 매출</div>
          <div className="stat-value text-success">₩{thisWeekSales.toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: salesChange >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
            {salesChange >= 0 ? '▲' : '▼'} 전주 대비 {Math.abs(salesChange)}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번 주 매입</div>
          <div className="stat-value" style={{ color: '#58a6ff' }}>₩{thisWeekPurchase.toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: purchaseChange <= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
            {purchaseChange >= 0 ? '▲' : '▼'} 전주 대비 {Math.abs(purchaseChange)}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번 주 거래 건수</div>
          <div className="stat-value text-accent">{thisWeekTx.length}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">재고 부족 경고</div>
          <div className={`stat-value${lowStockItems.length > 0 ? ' text-danger' : ''}`}>
            {lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}
          </div>
        </div>
      </div>

      {/* TOP 5 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        <div className="card">
          <div className="card-title">📤 이번 주 출고 TOP 5</div>
          {topOutItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>이번 주 출고 내역이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topOutItems.map(([name, qty], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RankBadge rank={i} type="out" />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '600' }}>{name}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>{qty}개</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">📥 이번 주 입고 TOP 5</div>
          {topInItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>이번 주 입고 내역이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topInItems.map(([name, qty], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RankBadge rank={i} type="in" />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '600' }}>{name}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--success)' }}>{qty}개</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 재고 부족 알림 */}
      {lowStockItems.length > 0 && (
        <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid var(--danger)' }}>
          <div className="card-title">⚠️ 재고 부족 품목 ({lowStockItems.length}건)</div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-fill">품목명</th>
                  <th className="text-right">현재고</th>
                  <th className="text-right">안전재고</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.slice(0, 10).map(it => {
                  const qty = parseFloat(it.quantity) || 0;
                  const min = state.safetyStock?.[it.itemName];
                  return (
                    <tr key={it.itemName}>
                      <td className="col-fill"><strong>{it.itemName}</strong></td>
                      <td className="text-right" style={{ color: 'var(--danger)', fontWeight: '700' }}>{qty}</td>
                      <td className="text-right">{min}</td>
                      <td style={{ color: 'var(--danger)', fontSize: '12px' }}>
                        {qty === 0 ? '🚫 재고 없음' : '⚠️ 부족'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 인사이트 */}
      <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid var(--accent)' }}>
        <div className="card-title">💡 이번 주 인사이트</div>
        <ul style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '2', margin: '0', paddingLeft: '16px' }}>
          {thisWeekTx.length === 0 && <li>이번 주에 등록된 거래가 없습니다. 입출고를 기록해보세요!</li>}
          {salesChange > 20 && <li style={{ color: 'var(--success)' }}>🎉 이번 주 매출이 전주 대비 크게 증가했습니다!</li>}
          {salesChange < -20 && <li style={{ color: 'var(--danger)' }}>📉 이번 주 매출이 전주 대비 크게 감소했습니다. 원인을 확인해보세요.</li>}
          {lowStockItems.length > 0
            ? <li style={{ color: 'var(--danger)' }}>⚠️ {lowStockItems.length}개 품목의 재고가 부족합니다. 발주를 검토하세요.</li>
            : <li style={{ color: 'var(--success)' }}>✅ 재고 부족 품목이 없습니다.</li>
          }
          {topOutItems.length > 0 && (
            <li>📦 이번 주 가장 많이 출고된 품목: <strong>{topOutItems[0][0]}</strong> ({topOutItems[0][1]}개)</li>
          )}
        </ul>
      </div>
    </div>
  );
}
