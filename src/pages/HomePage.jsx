/**
 * HomePage.jsx - 홈 대시보드
 */
import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { getNotifications, renderNotificationPanel } from '../notifications.js';
import { renderWeeklyTrendChart, renderCategoryChart, destroyAllCharts } from '../charts.js';

const CHART_WEEKLY_ID = 'home-chart-weekly';
const CHART_CATEGORY_ID = 'home-chart-category';

// 헬퍼 함수들
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
function getLast7Days(transactions) {
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(new Date(), -(6 - i));
    const dateKey = toDateKey(date);
    const dayTx = transactions.filter(tx => String(tx.date || '') === dateKey);
    return {
      date: dateKey,
      label: `${date.getMonth() + 1}/${date.getDate()} (${dayNames[date.getDay()]})`,
      inQty:  sumBy(dayTx.filter(tx => tx.type === 'in'),  tx => toNumber(tx.quantity)),
      outQty: sumBy(dayTx.filter(tx => tx.type === 'out'), tx => toNumber(tx.quantity)),
    };
  });
}

export default function HomePage() {
  const navigate = useNavigate();
  const [state] = useStore();

  const {
    items, transactions, safetyStock,
    totalItems, totalSupplyValue,
    lowStockItems, deadStockItems,
    todayInCount, todayOutCount,
    recentTransactions, categories, weekData,
    hasData, dateStr, notifications,
    todayKey,
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
    const todayInCount = todayTransactions.filter(tx => tx.type === 'in').length;
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

    const weekData = getLast7Days(transactions);
    const hasData = totalItems > 0;
    const dateStr = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    return {
      items, transactions, safetyStock,
      totalItems, totalSupplyValue,
      lowStockItems, deadStockItems,
      todayInCount, todayOutCount,
      recentTransactions, categories, weekData,
      hasData, dateStr, notifications, todayKey,
    };
  }, [state.mappedData, state.transactions, state.safetyStock]);

  // 차트 렌더링
  useEffect(() => {
    if (!hasData) return;
    destroyAllCharts();
    renderWeeklyTrendChart(CHART_WEEKLY_ID, weekData);
    if (categories.length > 0) {
      renderCategoryChart(CHART_CATEGORY_ID, categories);
    }
    return () => { destroyAllCharts(); };
  }, [hasData, weekData, categories]);

  const handleQuickIn = () => {
    sessionStorage.setItem('invex:quick-open-inbound', '1');
    navigate('/in');
  };
  const handleQuickOut = () => {
    sessionStorage.setItem('invex:quick-open-outbound', '1');
    navigate('/out');
  };

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
              <div className="db-kpi-icon">📦</div>
              <div className="db-kpi-label">총 품목</div>
              <div className="db-kpi-value text-accent">{totalItems.toLocaleString('ko-KR')}</div>
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">💰</div>
              <div className="db-kpi-label">재고 금액</div>
              <div className="db-kpi-value text-success">{formatCurrency(totalSupplyValue)}</div>
            </div>
            <div className={`db-kpi-card${lowStockItems.length > 0 ? ' db-kpi-danger' : ''}`} onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">⚠️</div>
              <div className="db-kpi-label">부족 품목</div>
              <div className={`db-kpi-value${lowStockItems.length > 0 ? ' text-danger' : ''}`}>
                {lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}
              </div>
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/in')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">📥</div>
              <div className="db-kpi-label">오늘 입고</div>
              <div className="db-kpi-value text-success">{todayInCount}건</div>
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/out')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">📤</div>
              <div className="db-kpi-label">오늘 출고</div>
              <div className="db-kpi-value text-danger">{todayOutCount}건</div>
            </div>
            <div className={`db-kpi-card${deadStockItems.length > 0 ? ' db-kpi-warn' : ''}`} onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">🕰️</div>
              <div className="db-kpi-label">정체 재고(30일)</div>
              <div className={`db-kpi-value${deadStockItems.length > 0 ? ' text-warning' : ''}`}>
                {deadStockItems.length}건
              </div>
            </div>
          </div>

          {/* 재고 부족 경고 바 */}
          {lowStockItems.length > 0 && (
            <div className="db-alert-bar" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <span className="db-alert-title">⚠️ 재고 부족 {lowStockItems.length}건</span>
              <span className="db-alert-items">
                {lowStockItems.slice(0, 3).map(item =>
                  `${item.itemName} (현재 ${toNumber(item.quantity)} / 안전 ${toNumber(safetyStock[item.itemName])})`
                ).join(' · ')}
                {lowStockItems.length > 3 ? ` 외 ${lowStockItems.length - 3}건` : ''}
              </span>
              <span className="db-alert-cta">바로가기 →</span>
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

            {/* 최근 7일 차트 */}
            <div className="card">
              <div className="card-title">최근 7일 입출고 흐름</div>
              <div style={{ height: '220px', position: 'relative' }}>
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
