import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { getNotifications, renderNotificationPanel } from '../notifications.js';
import { renderWeeklyTrendChart, renderCategoryChart, destroyAllCharts } from '../charts.js';

const CHART_WEEKLY_ID  = 'home-chart-weekly';
const CHART_CATEGORY_ID = 'home-chart-category';

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
  const sv = toNumber(item.supplyValue);
  if (sv > 0) return sv;
  return toNumber(item.quantity) * toNumber(item.unitPrice || item.unitCost);
}

function getChartData(transactions, days) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const actual = Math.min(Math.max(days, 1), 365);
  return Array.from({ length: actual }, (_, i) => {
    const date = addDays(new Date(), -(actual - 1 - i));
    const dateKey = toDateKey(date);
    const dayTx = transactions.filter(tx => String(tx.date || '') === dateKey);
    return {
      date: dateKey,
      label: actual <= 14
        ? `${date.getMonth() + 1}/${date.getDate()} (${dayNames[date.getDay()]})`
        : `${date.getMonth() + 1}/${date.getDate()}`,
      inQty:  sumBy(dayTx.filter(tx => tx.type === 'in'),  tx => toNumber(tx.quantity)),
      outQty: sumBy(dayTx.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity)),
    };
  });
}

function getDaySpan(transactions) {
  const dates = transactions.map(tx => String(tx.date || '')).filter(Boolean).sort();
  if (!dates.length) return 7;
  const diff = Math.ceil((new Date() - new Date(dates[0])) / 86400000) + 1;
  return Math.min(Math.max(diff, 7), 365);
}

function Sparkline({ data, color = 'currentColor', height = 22, width = 56 }) {
  if (!data || data.length < 2) return null;
  const pad = 2;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      className="db-kpi-spark" aria-hidden="true" style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Delta({ current, prev, label }) {
  if (prev === 0 && current === 0) {
    return <span className="db-kpi-delta db-delta-flat">— {label} 동일</span>;
  }
  if (prev === 0) {
    return <span className="db-kpi-delta db-delta-up">신규 {current}건</span>;
  }
  const pct = (current - prev) / prev * 100;
  const abs = Math.abs(pct).toFixed(1);
  if (pct > 0) return <span className="db-kpi-delta db-delta-up">▲ {abs}% {label}</span>;
  if (pct < 0) return <span className="db-kpi-delta db-delta-down">▼ {abs}% {label}</span>;
  return <span className="db-kpi-delta db-delta-flat">— {label} 동일</span>;
}

const PERIOD_OPTIONS = [
  { label: '7일',  days: 7  },
  { label: '1달',  days: 30 },
  { label: '3달',  days: 90 },
  { label: '전체', days: 0  },
];

export default function HomePage() {
  const navigate   = useNavigate();
  const [state]    = useStore();
  const [period, setPeriod] = useState(7);

  const computed = useMemo(() => {
    const items        = state.mappedData   || [];
    const transactions = state.transactions || [];
    const safetyStock  = state.safetyStock  || {};
    const notifications = getNotifications();

    const today    = new Date();
    const todayKey = toDateKey(today);
    const yesterKey = toDateKey(addDays(today, -1));
    const thirtyDayCutoff = toDateKey(addDays(today, -30));

    const totalItems       = items.length;
    const totalSupplyValue = sumBy(items, getItemSupplyValue);

    const lowStockItems = items.filter(item => {
      const min = toNumber(safetyStock[item.itemName]);
      return min > 0 && toNumber(item.quantity) <= min;
    });

    const deadStockItems = items.filter(item => {
      if (toNumber(item.quantity) <= 0) return false;
      return !transactions.some(tx =>
        tx.type === 'out' && tx.itemName === item.itemName && String(tx.date || '') >= thirtyDayCutoff
      );
    });

    const todayTx   = transactions.filter(tx => String(tx.date || '') === todayKey);
    const yesterTx  = transactions.filter(tx => String(tx.date || '') === yesterKey);
    const todayInCount  = todayTx.filter(tx => tx.type === 'in').length;
    const todayOutCount = todayTx.filter(tx => tx.type === 'out').length;
    const yesterInCount  = yesterTx.filter(tx => tx.type === 'in').length;
    const yesterOutCount = yesterTx.filter(tx => tx.type === 'out').length;

    const recentTransactions = [...transactions]
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 8);

    const categoryMap = new Map();
    items.forEach(item => {
      const cat = item.category || '미분류';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + toNumber(item.quantity));
    });
    const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

    const weekData = getChartData(transactions, 7);
    const hasData  = totalItems > 0;
    const dateStr  = today.toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });

    const thisMonthKey  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthKey  = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthInCount  = transactions.filter(tx => (tx.date || '').startsWith(thisMonthKey) && tx.type === 'in').length;
    const prevMonthInCount  = transactions.filter(tx => (tx.date || '').startsWith(prevMonthKey) && tx.type === 'in').length;
    const thisMonthOutCount = transactions.filter(tx => (tx.date || '').startsWith(thisMonthKey) && tx.type === 'out').length;
    const prevMonthOutCount = transactions.filter(tx => (tx.date || '').startsWith(prevMonthKey) && tx.type === 'out').length;

    const sparkIn  = weekData.map(d => d.inQty);
    const sparkOut = weekData.map(d => d.outQty);

    return {
      items, transactions, safetyStock,
      totalItems, totalSupplyValue,
      lowStockItems, deadStockItems,
      todayInCount, todayOutCount, yesterInCount, yesterOutCount,
      thisMonthInCount, prevMonthInCount, thisMonthOutCount, prevMonthOutCount,
      recentTransactions, categories, weekData, hasData, dateStr, notifications,
      sparkIn, sparkOut,
    };
  }, [state.mappedData, state.transactions, state.safetyStock]);

  const {
    transactions, safetyStock,
    totalItems, totalSupplyValue,
    lowStockItems, deadStockItems,
    todayInCount, todayOutCount, yesterInCount, yesterOutCount,
    thisMonthInCount, prevMonthInCount, thisMonthOutCount, prevMonthOutCount,
    recentTransactions, categories, weekData, hasData, dateStr, notifications,
    sparkIn, sparkOut,
  } = computed;

  const onClickDate = useCallback((dateKey) => {
    sessionStorage.setItem('invex:inout-date-filter', dateKey);
    navigate('/inout');
  }, [navigate]);

  // 차트 렌더링 — period 변경 시 재렌더
  useEffect(() => {
    if (!hasData) return;
    const days = period === 0 ? getDaySpan(transactions) : period;
    const data = getChartData(transactions, days);
    destroyAllCharts();
    renderWeeklyTrendChart(CHART_WEEKLY_ID, data, onClickDate);
    if (categories.length > 0) renderCategoryChart(CHART_CATEGORY_ID, categories);
    return () => { destroyAllCharts(); };
  }, [hasData, transactions, categories, period, onClickDate]);

  const handleQuickIn  = () => { sessionStorage.setItem('invex:quick-open-inbound',  '1'); navigate('/in'); };
  const handleQuickOut = () => { sessionStorage.setItem('invex:quick-open-outbound', '1'); navigate('/out'); };

  return (
    <div>
      {/* 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">대시보드</h1>
          <div className="page-desc">{dateStr}</div>
        </div>
        <div className="page-actions">
          {notifications.length > 0 && (
            <button type="button" className="badge badge-danger dashboard-notif-trigger"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); renderNotificationPanel(); }}>
              알림 {notifications.length}건
            </button>
          )}
          <button className="btn btn-success" onClick={handleQuickIn}>입고 등록</button>
          <button className="btn btn-danger"  onClick={handleQuickOut}>출고 등록</button>
        </div>
      </div>

      {!hasData ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
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
                <span className="db-kpi-delta db-delta-flat">전월 집계 중</span>
                <Sparkline data={sparkIn.map((v, i) => v + sparkOut[i])} color="var(--accent)" />
              </div>
            </div>

            <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">재고 금액</div>
              <div className="db-kpi-value text-success">{formatCurrency(totalSupplyValue)}</div>
              <div className="db-kpi-footer">
                <Delta current={thisMonthInCount} prev={prevMonthInCount} label="전월 입고" />
                <Sparkline data={sparkIn} color="var(--success)" />
              </div>
            </div>

            <div className={`db-kpi-card${lowStockItems.length > 0 ? ' db-kpi-danger' : ''}`}
              onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">부족 품목</div>
              <div className={`db-kpi-value${lowStockItems.length > 0 ? ' text-danger' : ''}`}>
                {lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}
              </div>
              <div className="db-kpi-footer">
                <span className={`db-kpi-delta ${lowStockItems.length > 0 ? 'db-delta-down' : 'db-delta-flat'}`}>
                  {lowStockItems.length > 0 ? '주의 필요' : '정상 범위'}
                </span>
                <Sparkline data={[0, 0, 0, 0, 0, 0, lowStockItems.length]}
                  color={lowStockItems.length > 0 ? 'var(--danger)' : '#9ca3af'} />
              </div>
            </div>

            <div className="db-kpi-card" onClick={() => navigate('/in')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">오늘 입고</div>
              <div className="db-kpi-value text-success">{todayInCount}건</div>
              <div className="db-kpi-footer">
                <Delta current={todayInCount} prev={yesterInCount} label="전일비" />
                <Sparkline data={sparkIn} color="var(--success)" />
              </div>
            </div>

            <div className="db-kpi-card" onClick={() => navigate('/out')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">오늘 출고</div>
              <div className="db-kpi-value text-danger">{todayOutCount}건</div>
              <div className="db-kpi-footer">
                <Delta current={todayOutCount} prev={yesterOutCount} label="전일비" />
                <Sparkline data={sparkOut} color="var(--danger)" />
              </div>
            </div>

            <div className={`db-kpi-card${deadStockItems.length > 0 ? ' db-kpi-warn' : ''}`}
              onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">정체 재고(30일)</div>
              <div className={`db-kpi-value${deadStockItems.length > 0 ? ' text-warning' : ''}`}>
                {deadStockItems.length}건
              </div>
              <div className="db-kpi-footer">
                <span className={`db-kpi-delta ${deadStockItems.length > 0 ? 'db-delta-down' : 'db-delta-flat'}`}>
                  {deadStockItems.length > 0 ? '출고 검토 필요' : '정상'}
                </span>
                <Sparkline data={[0, 0, 0, 0, 0, 0, deadStockItems.length]}
                  color={deadStockItems.length > 0 ? '#f59e0b' : '#9ca3af'} />
              </div>
            </div>

          </div>

          {/* 재고 부족 경고 바 */}
          {lowStockItems.length > 0 && (
            <div className="db-alert-bar">
              <span className="db-alert-title">재고 부족 {lowStockItems.length}건</span>
              <span className="db-alert-items">
                {lowStockItems.slice(0, 3).map(item =>
                  `${item.itemName} (현재 ${toNumber(item.quantity)} / 안전 ${toNumber(safetyStock[item.itemName])})`
                ).join(' · ')}
                {lowStockItems.length > 3 ? ` 외 ${lowStockItems.length - 3}건` : ''}
              </span>
              <button className="db-alert-order-btn" onClick={() => navigate('/auto-order')}>
                발주 바로가기
              </button>
              <button className="db-alert-goto" onClick={() => navigate('/inventory')}>
                재고현황 →
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
                        <th>유형</th><th>품목명</th>
                        <th className="text-right">수량</th>
                        <th>날짜</th><th>거래처</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentTransactions.map((tx, i) => (
                        <tr key={tx.id || i}>
                          <td><span className={`badge ${tx.type === 'in' ? 'badge-success' : 'badge-danger'}`}>
                            {tx.type === 'in' ? '입고' : '출고'}
                          </span></td>
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

            {/* 입출고 흐름 (기간 필터) */}
            <div className="card">
              <div className="db-chart-header">
                <div className="card-title">입출고 흐름</div>
                <div className="db-period-btns">
                  {PERIOD_OPTIONS.map(opt => (
                    <button key={opt.days}
                      className={`db-period-btn${period === opt.days ? ' active' : ''}`}
                      onClick={() => setPeriod(opt.days)}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: '200px', position: 'relative' }}>
                <canvas id={CHART_WEEKLY_ID} />
              </div>
              <div className="db-chart-hint">차트 클릭 시 해당 날짜 입출고 상세로 이동</div>
            </div>

            {/* 분류별 비중 */}
            {categories.length > 0 && (
              <div className="card">
                <div className="card-title">분류별 재고 비중</div>
                <div style={{ height: '200px', position: 'relative' }}>
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
