import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { restoreState } from '../store.js';
import { getNotifications, renderNotificationPanel } from '../notifications.js';
import { renderWeeklyTrendChart, renderCategoryChart, destroyAllCharts } from '../charts.js';
import {
  PERIOD_OPTS, WIDGET_DEFS, DEFAULT_MAIN_ORDER, ROLE_CONFIG,
  loadLS, saveLS, exportCSV, getPeriodData, computeHomeDashboard,
  toNumber, formatCurrency, getItemSupplyValue,
} from '../domain/homeCompute.js';
import { Sparkline }   from '../components/home/Sparkline.jsx';
import { TrendBadge }  from '../components/home/TrendBadge.jsx';

const CHART_WEEKLY_ID   = 'home-chart-weekly';
const CHART_CATEGORY_ID = 'home-chart-category';

export default function HomePage() {
  const navigate = useNavigate();
  const [state] = useStore();

  const [chartPeriod,    setChartPeriod]    = useState(() => loadLS('invex:home-period', 7));
  const [txFilter,       setTxFilter]       = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dashRole,       setDashRole]       = useState(() => loadLS('invex:home-role', 'manager'));
  const [mainOrder,      setMainOrder]      = useState(() => loadLS('invex:home-order', DEFAULT_MAIN_ORDER));
  const [savedFilters,   setSavedFilters]   = useState(() => loadLS('invex:home-saved-filters', []));
  const [editMode,       setEditMode]       = useState(false);
  const [targets,        setTargets]        = useState(() => loadLS('invex:home-targets', { in: 0, out: 0, revenue: 0 }));
  const [editingTarget,  setEditingTarget]  = useState(null);
  const [targetInput,    setTargetInput]    = useState('');
  const [lastRefresh,    setLastRefresh]    = useState(() => new Date());
  const [refreshing,     setRefreshing]     = useState(false);

  const dragId = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const roleConf = ROLE_CONFIG[dashRole] || ROLE_CONFIG.manager;

  useEffect(() => { saveLS('invex:home-role',   dashRole);   }, [dashRole]);
  useEffect(() => { saveLS('invex:home-period', chartPeriod); }, [chartPeriod]);
  useEffect(() => { saveLS('invex:home-order',  mainOrder);  }, [mainOrder]);

  function saveCurrentFilter() {
    const name = window.prompt('필터 이름을 입력하세요 (예: 식품 1달)');
    if (!name || !name.trim()) return;
    const next = [...savedFilters, { name: name.trim(), category: categoryFilter, period: chartPeriod }];
    setSavedFilters(next);
    saveLS('invex:home-saved-filters', next);
  }
  function applySavedFilter(f) { setCategoryFilter(f.category); setChartPeriod(f.period); }
  function deleteSavedFilter(idx) {
    const next = savedFilters.filter((_, i) => i !== idx);
    setSavedFilters(next);
    saveLS('invex:home-saved-filters', next);
  }

  function openTargetEdit(key, currentVal) { setEditingTarget(key); setTargetInput(String(currentVal || '')); }
  function saveTarget() {
    const val = parseInt(targetInput, 10);
    if (isNaN(val) || val < 0) { setEditingTarget(null); return; }
    const next = { ...targets, [editingTarget]: val };
    setTargets(next);
    saveLS('invex:home-targets', next);
    setEditingTarget(null);
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await restoreState(); } catch {}
    setLastRefresh(new Date());
    setRefreshing(false);
  }, []);


  function handleDragStart(e, id) {
    dragId.current = id;
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.style.opacity = '0.5';
  }
  function handleDragEnd(e) {
    e.currentTarget.style.opacity = '';
    dragId.current = null;
    setDragOver(null);
  }
  function handleDragOver(e, id) {
    e.preventDefault();
    if (!dragId.current || dragId.current === id) return;
    setDragOver(id);
    const from = mainOrder.indexOf(dragId.current);
    const to   = mainOrder.indexOf(id);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...mainOrder];
    next.splice(from, 1);
    next.splice(to, 0, dragId.current);
    setMainOrder(next);
  }
  function handleDrop(e) { e.preventDefault(); setDragOver(null); }

  const {
    filteredTx, totalItems, totalSupplyValue,
    lowStockItems, deadStockItems,
    todayInCount, todayOutCount,
    monthInQty, monthOutQty,
    recentTransactions, categories,
    categoryOptions, winners, losers, gmroi,
    hasData, dateStr, inTrendPct, outTrendPct, weekData,
  } = useMemo(() =>
    computeHomeDashboard({
      items:        state.mappedData   || [],
      transactions: state.transactions || [],
      safetyStock:  state.safetyStock  || {},
      categoryFilter,
    }),
    [state.mappedData, state.transactions, state.safetyStock, categoryFilter]
  );

  const notifications = useMemo(() => getNotifications(), []);

  const chartData = useMemo(() => getPeriodData(filteredTx, chartPeriod), [filteredTx, chartPeriod]);

  const handleChartClick = useCallback((date) => {
    const month = String(date || '').substring(0, 7);
    if (month) { sessionStorage.setItem('invex:inout-filter-month', month); navigate('/out'); }
  }, [navigate]);

  useEffect(() => {
    if (!hasData) return;
    destroyAllCharts();
    renderWeeklyTrendChart(CHART_WEEKLY_ID, chartData, handleChartClick);
    if (categories.length > 0) renderCategoryChart(CHART_CATEGORY_ID, categories);
    return () => { destroyAllCharts(); };
  }, [hasData, chartData, categories, handleChartClick]);

  const chartTitle      = chartPeriod === 7 ? '최근 7일' : chartPeriod === 30 ? '최근 1달' : chartPeriod === 90 ? '최근 3달' : '전체';
  const allTransactions = state.transactions || [];

  function draggableProps(id) {
    if (!editMode) return {};
    return {
      draggable: true,
      onDragStart: e => handleDragStart(e, id),
      onDragEnd:   handleDragEnd,
      onDragOver:  e => handleDragOver(e, id),
      onDrop:      handleDrop,
      style: { outline: dragOver === id ? '2px dashed var(--accent)' : undefined, cursor: 'grab' },
    };
  }

  function renderWidget(id) {
    if (id === 'recent') return (
      <div key="recent" className="card" {...draggableProps('recent')}>
        {editMode && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, userSelect: 'none' }}>⠿ 드래그하여 순서 변경</div>}
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>최근 입출고 이력</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[{v:'all',l:'전체'},{v:'in',l:'입고'},{v:'out',l:'출고'}].map(opt => (
              <button key={opt.v} className={`btn btn-sm ${txFilter === opt.v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTxFilter(opt.v)}>{opt.l}</button>
            ))}
          </div>
        </div>
        {recentTransactions.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none', margin: 0 }}>
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead><tr><th>유형</th><th>품목명</th><th className="text-right">수량</th><th>날짜</th><th>거래처</th></tr></thead>
              <tbody>
                {recentTransactions.filter(tx => txFilter === 'all' || tx.type === txFilter).slice(0, 8).map((tx, i) => (
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
    );

    if (id === 'chart') return (
      <div key="chart" className="card" {...draggableProps('chart')}>
        {editMode && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, userSelect: 'none' }}>⠿ 드래그하여 순서 변경</div>}
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{chartTitle} 입출고 흐름 <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>클릭 → 출고내역</span></span>
          <div style={{ display: 'flex', gap: 3 }}>
            {PERIOD_OPTS.map(opt => (
              <button key={opt.v} className={`btn btn-sm ${chartPeriod === opt.v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChartPeriod(opt.v)}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 220, position: 'relative', cursor: 'pointer' }}>
          <canvas id={CHART_WEEKLY_ID} />
        </div>
      </div>
    );

    if (id === 'category' && categories.length > 0) return (
      <div key="category" className="card" {...draggableProps('category')}>
        {editMode && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, userSelect: 'none' }}>⠿ 드래그하여 순서 변경</div>}
        <div className="card-title">분류별 재고 비중</div>
        <div style={{ height: 220, position: 'relative' }}>
          <canvas id={CHART_CATEGORY_ID} />
        </div>
      </div>
    );

    return null;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">대시보드</h1>
          <div className="page-desc" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{dateStr}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {refreshing ? '갱신 중...' : `마지막 갱신: ${lastRefresh.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
            </span>
            <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, padding: '1px 6px' }} onClick={handleRefresh} disabled={refreshing}>
              수동 갱신
            </button>
          </div>
        </div>
        <div className="page-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {Object.entries(ROLE_CONFIG).map(([key, conf]) => (
              <button key={key} className={`btn btn-sm ${dashRole === key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 0, border: 'none', fontSize: 12 }} onClick={() => setDashRole(key)}>{conf.label}</button>
            ))}
          </div>
          {categoryOptions.length > 0 && (
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
              <option value="">전체 카테고리</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={saveCurrentFilter} title="현재 필터 조건 저장">+ 필터 저장</button>
          {allTransactions.length > 0 && (
            <button className="btn btn-outline btn-sm" style={{ fontSize: 12 }} onClick={() => exportCSV(allTransactions)}>CSV 내보내기</button>
          )}
          <button className={`btn btn-sm ${editMode ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 12 }} onClick={() => setEditMode(v => !v)}>
            {editMode ? ' 완료' : '⠿ 편집'}
          </button>
          {notifications.length > 0 && (
            <button type="button" className="badge badge-danger dashboard-notif-trigger"
              onClick={e => { e.preventDefault(); e.stopPropagation(); renderNotificationPanel(); }}>
              알림 {notifications.length}건
            </button>
          )}
          <button className="btn btn-success" onClick={() => { sessionStorage.setItem('invex:quick-open-inbound', '1'); navigate('/in'); }}>입고 등록</button>
          <button className="btn btn-danger"  onClick={() => { sessionStorage.setItem('invex:quick-open-outbound', '1'); navigate('/out'); }}>출고 등록</button>
        </div>
      </div>

      {savedFilters.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {savedFilters.map((f, idx) => (
            <div key={idx} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 12,
              background: categoryFilter === f.category && chartPeriod === f.period ? 'var(--accent)' : 'var(--bg-card)',
              border: '1px solid var(--border)', cursor: 'pointer',
              color: categoryFilter === f.category && chartPeriod === f.period ? '#fff' : 'var(--text)',
            }}>
              <span onClick={() => applySavedFilter(f)}>{f.name}</span>
              <span style={{ color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 2 }} onClick={() => deleteSavedFilter(idx)}>×</span>
            </div>
          ))}
        </div>
      )}

      {!hasData ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}></div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>아직 등록된 데이터가 없습니다</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
            엑셀 파일을 업로드하거나 품목을 직접 등록하면<br />여기에 핵심 경영 지표가 자동으로 표시됩니다.
          </p>
          <div className="empty-state-actions">
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>엑셀 업로드</button>
            <button className="btn btn-outline" onClick={() => navigate('/inventory')}>품목 직접 등록</button>
          </div>
        </div>
      ) : (
        <>
          <div className={`db-kpi-grid${dashRole === 'staff' ? ' db-kpi-grid-compact' : ''}`}>
            <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">총 품목</div>
              <div className="db-kpi-value text-accent">{totalItems.toLocaleString('ko-KR')}</div>
            </div>
            {dashRole === 'manager' && (
              <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
                <div className="db-kpi-label">재고 금액</div>
                <div className="db-kpi-value text-success">{formatCurrency(totalSupplyValue)}</div>
                {gmroi !== null && (
                  <div style={{ fontSize: 11, color: gmroi >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: 2 }}>
                    GMROI {gmroi >= 0 ? '+' : ''}{gmroi}
                  </div>
                )}
                <Sparkline data={weekData.map(d => Math.max(0, d.inQty - d.outQty))} color="var(--success)" />
              </div>
            )}
            <div className={`db-kpi-card${lowStockItems.length > 0 ? ' db-kpi-danger' : ''}`} onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-label">부족 품목</div>
              <div className={`db-kpi-value${lowStockItems.length > 0 ? ' text-danger' : ''}`}>
                {lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}
              </div>
            </div>

            {/* 오늘 입고 */}
            <div className="db-kpi-card" onClick={() => navigate('/in')} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="db-kpi-label">오늘 입고</div>
                {dashRole === 'manager' && (
                  <button className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: '1px 6px', color: 'var(--text-muted)' }}
                    onClick={e => { e.stopPropagation(); openTargetEdit('in', targets.in); }}>목표 설정</button>
                )}
              </div>
              <div className="db-kpi-value text-success">{todayInCount}건</div>
              {editingTarget === 'in' ? (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  <input type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditingTarget(null); }}
                    style={{ width: 80, fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
                    placeholder="목표 수량" autoFocus />
                  <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={saveTarget}>확인</button>
                </div>
              ) : targets.in > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    <span>이달 {monthInQty.toLocaleString('ko-KR')} / {targets.in.toLocaleString('ko-KR')}</span>
                    <span style={{ color: monthInQty >= targets.in ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {Math.min(Math.round(monthInQty / targets.in * 100), 999)}%
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: 'var(--success)', width: `${Math.min(monthInQty / targets.in * 100, 100)}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
              <TrendBadge pct={inTrendPct} />
              <Sparkline data={weekData.map(d => d.inQty)} color="var(--success)" />
            </div>

            {/* 오늘 출고 */}
            <div className="db-kpi-card" onClick={() => navigate('/out')} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="db-kpi-label">오늘 출고</div>
                {dashRole === 'manager' && (
                  <button className="btn btn-sm btn-ghost" style={{ fontSize: 10, padding: '1px 6px', color: 'var(--text-muted)' }}
                    onClick={e => { e.stopPropagation(); openTargetEdit('out', targets.out); }}>목표 설정</button>
                )}
              </div>
              <div className="db-kpi-value text-danger">{todayOutCount}건</div>
              {editingTarget === 'out' ? (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }} onClick={e => e.stopPropagation()}>
                  <input type="number" value={targetInput} onChange={e => setTargetInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveTarget(); if (e.key === 'Escape') setEditingTarget(null); }}
                    style={{ width: 80, fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)' }}
                    placeholder="목표 수량" autoFocus />
                  <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '2px 8px' }} onClick={saveTarget}>확인</button>
                </div>
              ) : targets.out > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    <span>이달 {monthOutQty.toLocaleString('ko-KR')} / {targets.out.toLocaleString('ko-KR')}</span>
                    <span style={{ color: monthOutQty >= targets.out ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 600 }}>
                      {Math.min(Math.round(monthOutQty / targets.out * 100), 999)}%
                    </span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: 'var(--danger)', width: `${Math.min(monthOutQty / targets.out * 100, 100)}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )}
              <TrendBadge pct={outTrendPct} />
              <Sparkline data={weekData.map(d => d.outQty)} color="var(--danger)" />
            </div>

            {dashRole === 'manager' && (
              <div className={`db-kpi-card${deadStockItems.length > 0 ? ' db-kpi-warn' : ''}`}>
                <div className="db-kpi-label">정체 재고(30일)</div>
                <div className={`db-kpi-value${deadStockItems.length > 0 ? ' text-warning' : ''}`}>{deadStockItems.length}건</div>
                {deadStockItems.length > 0 && (
                  <button className="btn btn-sm btn-outline"
                    style={{ marginTop: 6, fontSize: 11, color: 'var(--warning)', borderColor: 'var(--warning)', padding: '2px 8px' }}
                    onClick={e => { e.stopPropagation(); navigate('/auto-order'); }}>
                    발주 바로가기 →
                  </button>
                )}
              </div>
            )}
          </div>

          {dashRole === 'staff' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
              {[
                { icon: '', label: '입고 등록', desc: '상품 입고 처리', color: 'var(--success)', bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.3)',  route: '/in' },
                { icon: '', label: '출고 등록', desc: '상품 출고 처리', color: 'var(--danger)',  bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',  route: '/out' },
                { icon: '', label: '재고 조회', desc: '현재 재고 확인',  color: 'var(--accent)',  bg: 'rgba(88,166,255,0.08)', border: 'rgba(88,166,255,0.3)', route: '/inventory' },
              ].map(item => (
                <button key={item.route} onClick={() => navigate(item.route)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 10, background: item.bg, border: `1.5px solid ${item.border}`, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'transform 0.1s, box-shadow 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: item.color }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {lowStockItems.length > 0 && (
            <div className="db-alert-bar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="db-alert-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/inventory')}> 재고 부족 {lowStockItems.length}건</span>
              <span className="db-alert-items" style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate('/inventory')}>
                {lowStockItems.slice(0, 3).map(item =>
                  `${item.itemName} (현재 ${toNumber(item.quantity)} / 안전 ${toNumber((state.safetyStock || {})[item.itemName])})`
                ).join(' · ')}
                {lowStockItems.length > 3 ? ` 외 ${lowStockItems.length - 3}건` : ''}
              </span>
              <button className="btn btn-sm btn-outline" style={{ flexShrink: 0, fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)', padding: '2px 10px' }}
                onClick={() => navigate('/auto-order')}>발주 바로가기 →</button>
            </div>
          )}

          {roleConf.showWinners && (winners.length > 0 || losers.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="card-title" style={{ marginBottom: 10, fontSize: 13 }}> 판매 TOP (최근 30일)</div>
                {winners.length === 0
                  ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>데이터 없음</div>
                  : winners.map((w, i) => {
                    const pct = Math.round((w.qty / (winners[0].qty || 1)) * 100);
                    return (
                      <div key={i} style={{ marginBottom: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                            <span style={{ color: 'var(--text-muted)', marginRight: 5 }}>{i + 1}</span>{w.name}
                          </span>
                          <span style={{ color: 'var(--success)', fontWeight: 600, flexShrink: 0 }}>{w.qty.toLocaleString('ko-KR')}개</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--success)', borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })
                }
              </div>
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="card-title" style={{ marginBottom: 10, fontSize: 13 }}> 정체 재고 (30일 미출고)</div>
                {losers.length === 0
                  ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>정체 재고 없음</div>
                  : <>
                    {losers.map((item, i) => {
                      const pct = Math.round((getItemSupplyValue(item) / (getItemSupplyValue(losers[0]) || 1)) * 100);
                      return (
                        <div key={i} style={{ marginBottom: 7 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                              <span style={{ color: 'var(--text-muted)', marginRight: 5 }}>{i + 1}</span>{item.itemName}
                            </span>
                            <span style={{ color: 'var(--warning)', fontWeight: 600, flexShrink: 0 }}>{toNumber(item.quantity).toLocaleString('ko-KR')}개</span>
                          </div>
                          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--warning)', borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                    <button className="btn btn-sm btn-ghost" style={{ marginTop: 6, fontSize: 11, padding: '2px 8px' }} onClick={() => navigate('/auto-order')}>발주 검토 →</button>
                  </>
                }
              </div>
            </div>
          )}

          <div className="db-main-grid">
            {mainOrder.map(id => renderWidget(id))}
          </div>
        </>
      )}
    </div>
  );
}
