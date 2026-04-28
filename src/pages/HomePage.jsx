/**
 * HomePage.jsx - 홈 대시보드
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { getNotifications, renderNotificationPanel } from '../notifications.js';
import { renderWeeklyTrendChart, renderCategoryChart, destroyAllCharts } from '../charts.js';

const CHART_WEEKLY_ID = 'home-chart-weekly';
const CHART_CATEGORY_ID = 'home-chart-category';

const PERIOD_OPTS = [
  { v: 7,  l: '7일' },
  { v: 30, l: '1달' },
  { v: 90, l: '3달' },
  { v: 0,  l: '전체' },
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
function sumBy(rows, fn) { return rows.reduce((s, r) => s + fn(r), 0); }
function toDateKey(value) { return new Date(value).toISOString().split('T')[0]; }
function addDays(base, delta) { const d = new Date(base); d.setDate(d.getDate() + delta); return d; }
function formatCurrency(value) {
  const n = toNumber(value);
  if (n <= 0) return '-';
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}
function getItemSupplyValue(item) {
  const supplyValue = toNumber(item.supplyValue);
  if (supplyValue > 0) return supplyValue;
  return toNumber(item.quantity) * toNumber(item.unitPrice || item.unitCost);
}

function getPeriodData(transactions, days) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const today = new Date();

  if (days === 7) {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, -(6 - i));
      const dateKey = toDateKey(date);
      const dayTx = transactions.filter(tx => String(tx.date || '') === dateKey);
      return {
        date: dateKey,
        label: `${date.getMonth() + 1}/${date.getDate()} (${dayNames[date.getDay()]})`,
        inQty:  sumBy(dayTx.filter(t => t.type === 'in'),  t => toNumber(t.quantity)),
        outQty: sumBy(dayTx.filter(t => t.type === 'out'), t => toNumber(t.quantity)),
      };
    });
  }

  if (days === 30) {
    return Array.from({ length: 30 }, (_, i) => {
      const date = addDays(today, -(29 - i));
      const dateKey = toDateKey(date);
      const dayTx = transactions.filter(tx => String(tx.date || '') === dateKey);
      return {
        date: dateKey,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        inQty:  sumBy(dayTx.filter(t => t.type === 'in'),  t => toNumber(t.quantity)),
        outQty: sumBy(dayTx.filter(t => t.type === 'out'), t => toNumber(t.quantity)),
      };
    });
  }

  if (days === 90) {
    return Array.from({ length: 13 }, (_, i) => {
      const weekEnd   = addDays(today, -(12 - i) * 7);
      const weekStart = addDays(weekEnd, -6);
      const s = toDateKey(weekStart), e = toDateKey(weekEnd);
      const weekTx = transactions.filter(tx => { const d = String(tx.date || ''); return d >= s && d <= e; });
      return {
        date: s,
        label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}주`,
        inQty:  sumBy(weekTx.filter(t => t.type === 'in'),  t => toNumber(t.quantity)),
        outQty: sumBy(weekTx.filter(t => t.type === 'out'), t => toNumber(t.quantity)),
      };
    });
  }

  // 전체 — 월별
  const monthMap = {};
  transactions.forEach(tx => {
    const month = (tx.date || '').substring(0, 7);
    if (!month) return;
    if (!monthMap[month]) monthMap[month] = { date: month + '-01', month, inQty: 0, outQty: 0, label: month };
    const qty = toNumber(tx.quantity);
    if (tx.type === 'in') monthMap[month].inQty += qty;
    else monthMap[month].outQty += qty;
  });
  return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
}

function Sparkline({ data, color = 'currentColor', height = 24, width = 72 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: 4, opacity: 0.75 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TrendBadge({ pct }) {
  if (pct == null) return null;
  const up = pct > 0, down = pct < 0;
  return (
    <div style={{ fontSize: 11, color: up ? 'var(--success)' : down ? 'var(--danger)' : 'var(--text-muted)', marginTop: 2 }}>
      {up ? '▲' : down ? '▼' : '–'} {Math.abs(pct)}% 전월 대비
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [state] = useStore();
  const [chartPeriod, setChartPeriod] = useState(7);

  const {
    items, transactions, safetyStock,
    totalItems, totalSupplyValue,
    lowStockItems, deadStockItems,
    todayInCount, todayOutCount,
    recentTransactions, categories,
    hasData, dateStr, notifications, todayKey,
    inTrendPct, outTrendPct,
    weekData,
  } = useMemo(() => {
    const items = state.mappedData || [];
    const transactions = state.transactions || [];
    const safetyStock = state.safetyStock || {};
    const notifications = getNotifications();

    const today = new Date();
    const todayKey = toDateKey(today);
    const thirtyDayCutoff = toDateKey(addDays(today, -30));

    const totalItems = items.length;
    const totalSupplyValue = sumBy(items, getItemSupplyValue);

    const lowStockItems = items.filter(item => {
      const minimum = toNumber(safetyStock[item.itemName]);
      return minimum > 0 && toNumber(item.quantity) <= minimum;
    });

    const deadStockItems = items.filter(item => {
      if (toNumber(item.quantity) <= 0) return false;
      return !transactions.some(tx =>
        tx.type === 'out' && tx.itemName === item.itemName && String(tx.date || '') >= thirtyDayCutoff
      );
    });

    const todayTransactions = transactions.filter(tx => String(tx.date || '') === todayKey);
    const todayInCount  = todayTransactions.filter(tx => tx.type === 'in').length;
    const todayOutCount = todayTransactions.filter(tx => tx.type === 'out').length;

    const recentTransactions = [...transactions]
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 8);

    const categoryMap = new Map();
    items.forEach(item => {
      const cat = item.category || '미분류';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + toNumber(item.quantity));
    });
    const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

    const weekData = getPeriodData(transactions, 7);
    const hasData = totalItems > 0;
    const dateStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthTx = transactions.filter(tx => (tx.date || '').startsWith(thisMonthKey));
    const prevMonthTx = transactions.filter(tx => (tx.date || '').startsWith(prevMonthKey));
    const thisMonthIn  = sumBy(thisMonthTx.filter(t => t.type === 'in'),  t => toNumber(t.quantity));
    const prevMonthIn  = sumBy(prevMonthTx.filter(t => t.type === 'in'),  t => toNumber(t.quantity));
    const thisMonthOut = sumBy(thisMonthTx.filter(t => t.type === 'out'), t => toNumber(t.quantity));
    const prevMonthOut = sumBy(prevMonthTx.filter(t => t.type === 'out'), t => toNumber(t.quantity));
    const inTrendPct  = prevMonthIn  > 0 ? Math.round((thisMonthIn  - prevMonthIn)  / prevMonthIn  * 100) : null;
    const outTrendPct = prevMonthOut > 0 ? Math.round((thisMonthOut - prevMonthOut) / prevMonthOut * 100) : null;

    return {
      items, transactions, safetyStock,
      totalItems, totalSupplyValue,
      lowStockItems, deadStockItems,
      todayInCount, todayOutCount,
      recentTransactions, categories,
      hasData, dateStr, notifications, todayKey,
      inTrendPct, outTrendPct, weekData,
    };
  }, [state.mappedData, state.transactions, state.safetyStock]);

  const chartData = useMemo(
    () => getPeriodData(transactions, chartPeriod),
    [transactions, chartPeriod]
  );

  const handleChartClick = useCallback((date) => {
    const month = String(date || '').substring(0, 7);
    if (month) {
      sessionStorage.setItem('invex:inout-filter-month', month);
      navigate('/out');
    }
  }, [navigate]);

  useEffect(() => {
    if (!hasData) return;
    destroyAllCharts();
    renderWeeklyTrendChart(CHART_WEEKLY_ID, chartData, handleChartClick);
    if (categories.length > 0) {
      renderCategoryChart(CHART_CATEGORY_ID, categories);
    }
    return () => { destroyAllCharts(); };
  }, [hasData, chartData, categories, handleChartClick]);

  const handleQuickIn = () => {
    sessionStorage.setItem('invex:quick-open-inbound', '1');
    navigate('/in');
  };
  const handleQuickOut = () => {
    sessionStorage.setItem('invex:quick-open-outbound', '1');
    navigate('/out');
  };

  const chartTitle = chartPeriod === 7 ? '최근 7일' : chartPeriod === 30 ? '최근 1달' : chartPeriod === 90 ? '최근 3달' : '전체';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">대시보드</h1>
          <div className="page-desc">{dateStr}</div>
        </div>
        <div className="page-actions">
          {notifications.length > 0 && (
            <button
              type="button"
              className="badge badge-danger dashboard-notif-trigger"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); renderNotificationPanel(); }}
            >
              알림 {notifications.length}건
            </button>
          )}
          <button className="btn btn-success" onClick={handleQuickIn}>입고 등록</button>
          <button className="btn btn-danger" onClick={handleQuickOut}>출고 등록</button>
        </div>
      </div>

      {!hasData ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📦</div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>아직 등록된 데이터가 없습니다</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
            엑셀 파일을 업로드하거나 품목을 직접 등록하면<br />여기에 핵심 경영 지표가 자동으로 표시됩니다.
          </p>
          <div className="empty-state-actions">
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>엑셀 업로드</button>
            <button className="btn btn-outline" onClick={() => navigate('/inventory')}>품목 직접 등록</button>
          </div>
        </div>
      ) : (
        <>
          {/* KPI 6개 */}
          <div className="db-kpi-grid">
            <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">총 품목</div>
              <div className="db-kpi-value text-accent">{totalItems.toLocaleString('ko-KR')}</div>
              <div className="db-kpi-footer">
                <span className="db-kpi-delta db-delta-flat">전체 등록 품목</span>
              </div>
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">재고 금액</div>
              <div className="db-kpi-value text-success">{formatCurrency(totalSupplyValue)}</div>
              <div className="db-kpi-footer">
                <span className="db-kpi-delta db-delta-flat">현재 보유 재고</span>
                <Sparkline data={weekData.map(d => Math.max(0, d.inQty - d.outQty))} color="var(--success)" />
              </div>
            </div>
            <div className={`db-kpi-card${lowStockItems.length > 0 ? ' db-kpi-danger' : ''}`} onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">부족 품목</div>
              <div className={`db-kpi-value${lowStockItems.length > 0 ? ' text-danger' : ''}`}>
                {lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}
              </div>
              <div className="db-kpi-footer">
                <span className="db-kpi-delta db-delta-flat">안전재고 미달</span>
              </div>
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/in')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">오늘 입고</div>
              <div className="db-kpi-value text-success">{todayInCount}건</div>
              <div className="db-kpi-footer">
                {inTrendPct != null ? (
                  <span className={`db-kpi-delta ${inTrendPct > 0 ? 'db-delta-up' : inTrendPct < 0 ? 'db-delta-down' : 'db-delta-flat'}`}>
                    {inTrendPct > 0 ? '▲' : inTrendPct < 0 ? '▼' : '–'} {Math.abs(inTrendPct)}% 전월 대비
                  </span>
                ) : (
                  <span className="db-kpi-delta db-delta-flat">전월 집계 중</span>
                )}
                <Sparkline data={weekData.map(d => d.inQty)} color="var(--success)" />
              </div>
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/out')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">오늘 출고</div>
              <div className="db-kpi-value text-danger">{todayOutCount}건</div>
              <div className="db-kpi-footer">
                {outTrendPct != null ? (
                  <span className={`db-kpi-delta ${outTrendPct > 0 ? 'db-delta-up' : outTrendPct < 0 ? 'db-delta-down' : 'db-delta-flat'}`}>
                    {outTrendPct > 0 ? '▲' : outTrendPct < 0 ? '▼' : '–'} {Math.abs(outTrendPct)}% 전월 대비
                  </span>
                ) : (
                  <span className="db-kpi-delta db-delta-flat">전월 집계 중</span>
                )}
                <Sparkline data={weekData.map(d => d.outQty)} color="var(--danger)" />
              </div>
            </div>
            <div className={`db-kpi-card${deadStockItems.length > 0 ? ' db-kpi-warn' : ''}`} style={{ cursor: deadStockItems.length > 0 ? 'pointer' : 'default' }}>
              <div className="db-kpi-label">정체 재고(30일)</div>
              <div className={`db-kpi-value${deadStockItems.length > 0 ? ' text-warning' : ''}`}>
                {deadStockItems.length}건
              </div>
              <div className="db-kpi-footer">
                {deadStockItems.length > 0 ? (
                  <button
                    className="db-kpi-delta db-delta-flat"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--warning)', fontSize: 11, fontWeight: 500 }}
                    onClick={(e) => { e.stopPropagation(); navigate('/auto-order'); }}
                  >
                    발주 바로가기 →
                  </button>
                ) : (
                  <span className="db-kpi-delta db-delta-flat">30일 미출고 품목</span>
                )}
              </div>
            </div>
          </div>

          {/* 재고 부족 경고 바 */}
          {lowStockItems.length > 0 && (
            <div className="db-alert-bar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="db-alert-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/inventory')}>재고 부족 {lowStockItems.length}건</span>
              <span className="db-alert-items" style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate('/inventory')}>
                {lowStockItems.slice(0, 3).map(item =>
                  `${item.itemName} (현재 ${toNumber(item.quantity)} / 안전 ${toNumber(safetyStock[item.itemName])})`
                ).join(' · ')}
                {lowStockItems.length > 3 ? ` 외 ${lowStockItems.length - 3}건` : ''}
              </span>
              <button
                className="btn btn-sm btn-outline"
                style={{ flexShrink: 0, fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)', padding: '2px 10px' }}
                onClick={() => navigate('/auto-order')}
              >
                발주 바로가기 →
              </button>
            </div>
          )}

          {/* 메인 3열 그리드 */}
          <div className="db-main-grid">
            {/* 최근 입출고 이력 */}
            <div className="card">
              <div className="card-title">최근 입출고 이력</div>
              {recentTransactions.length > 0 ? (
                <div className="table-wrapper" style={{ border: 'none', margin: '0' }}>
                  <table className="data-table" style={{ fontSize: '12px' }}>
                    <thead>
                      <tr>
                        <th>유형</th>
                        <th>품목명</th>
                        <th className="text-right">수량</th>
                        <th>날짜</th>
                        <th>거래처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.map((tx, i) => (
                        <tr key={tx.id || i}>
                          <td><span className={`badge ${tx.type === 'in' ? 'badge-success' : 'badge-danger'}`}>{tx.type === 'in' ? '입고' : '출고'}</span></td>
                          <td>{tx.itemName || '-'}</td>
                          <td className="text-right">{toNumber(tx.quantity).toLocaleString('ko-KR')}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{tx.date || '-'}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{tx.vendor || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state"><div className="msg">아직 기록된 거래가 없습니다</div></div>
              )}
            </div>

            {/* 입출고 흐름 차트 + 기간 필터 */}
            <div className="card">
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{chartTitle} 입출고 흐름 <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>클릭 → 출고내역</span></span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {PERIOD_OPTS.map(opt => (
                    <button
                      key={opt.v}
                      className={`btn btn-sm ${chartPeriod === opt.v ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setChartPeriod(opt.v)}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: '220px', position: 'relative', cursor: 'pointer' }}>
                <canvas id={CHART_WEEKLY_ID} />
              </div>
            </div>

            {/* 분류별 비중 */}
            {categories.length > 0 && (
              <div className="card">
                <div className="card-title">분류별 재고 비중</div>
                <div style={{ height: '220px', position: 'relative' }}>
                  <canvas id={CHART_CATEGORY_ID} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
