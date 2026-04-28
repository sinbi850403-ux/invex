/**
 * HomePage.jsx - 홈 대시보드
 */
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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

// 드래그 가능한 메인 위젯 목록
const WIDGET_DEFS = [
  { id: 'recent',   label: '최근 입출고 이력' },
  { id: 'chart',    label: '입출고 흐름 차트' },
  { id: 'category', label: '분류별 재고 비중' },
];

const DEFAULT_MAIN_ORDER = ['recent', 'chart', 'category'];

function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

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

function exportCSV(transactions) {
  const header = ['유형', '품목명', '수량', '날짜', '거래처', '단가', '금액'];
  const rows = transactions.map(tx => [
    tx.type === 'in' ? '입고' : '출고',
    tx.itemName || '',
    toNumber(tx.quantity),
    tx.date || '',
    tx.vendor || '',
    toNumber(tx.unitPrice || tx.unitCost || 0),
    Math.round(toNumber(tx.quantity) * toNumber(tx.unitPrice || tx.unitCost || 0)),
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invex-거래내역-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 역할별 표시 설정 ─────────────────────────────────────────────
const ROLE_CONFIG = {
  manager: {
    label: '경영자',
    showWinners: true,
    showCategory: true,
    showGmroi: true,
    kpiCards: ['totalItems', 'totalValue', 'lowStock', 'todayIn', 'todayOut', 'deadStock'],
  },
  staff: {
    label: '직원',
    showWinners: false,
    showCategory: false,
    showGmroi: false,
    kpiCards: ['totalItems', 'lowStock', 'todayIn', 'todayOut'],
  },
};

export default function HomePage() {
  const navigate = useNavigate();
  const [state] = useStore();

  // ── 커스터마이징 상태 ────────────────────────────────────────
  const [chartPeriod, setChartPeriod]     = useState(() => loadLS('invex:home-period', 7));
  const [txFilter, setTxFilter]           = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dashRole, setDashRole]           = useState(() => loadLS('invex:home-role', 'manager'));
  const [mainOrder, setMainOrder]         = useState(() => loadLS('invex:home-order', DEFAULT_MAIN_ORDER));
  const [savedFilters, setSavedFilters]   = useState(() => loadLS('invex:home-saved-filters', []));
  const [editMode, setEditMode]           = useState(false);

  // 드래그 상태
  const dragId = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const roleConf = ROLE_CONFIG[dashRole] || ROLE_CONFIG.manager;

  // ── 역할/기간 변경 시 localStorage 동기화 ──────────────────
  useEffect(() => { saveLS('invex:home-role', dashRole); }, [dashRole]);
  useEffect(() => { saveLS('invex:home-period', chartPeriod); }, [chartPeriod]);
  useEffect(() => { saveLS('invex:home-order', mainOrder); }, [mainOrder]);

  // ── 필터 저장 ────────────────────────────────────────────────
  function saveCurrentFilter() {
    const name = window.prompt('필터 이름을 입력하세요 (예: 식품 1달)');
    if (!name || !name.trim()) return;
    const next = [...savedFilters, { name: name.trim(), category: categoryFilter, period: chartPeriod }];
    setSavedFilters(next);
    saveLS('invex:home-saved-filters', next);
  }
  function applySavedFilter(f) {
    setCategoryFilter(f.category);
    setChartPeriod(f.period);
  }
  function deleteSavedFilter(idx) {
    const next = savedFilters.filter((_, i) => i !== idx);
    setSavedFilters(next);
    saveLS('invex:home-saved-filters', next);
  }

  // ── 드래그 & 드롭 ────────────────────────────────────────────
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
  function handleDrop(e) {
    e.preventDefault();
    setDragOver(null);
  }

  // ── 데이터 계산 ──────────────────────────────────────────────
  const {
    items, transactions, safetyStock,
    totalItems, totalSupplyValue,
    lowStockItems, deadStockItems,
    todayInCount, todayOutCount,
    recentTransactions, categories,
    categoryOptions,
    winners, losers, gmroi,
    hasData, dateStr, notifications,
    inTrendPct, outTrendPct, weekData,
  } = useMemo(() => {
    const items        = state.mappedData   || [];
    const transactions = state.transactions || [];
    const safetyStock  = state.safetyStock  || {};
    const notifications = getNotifications();

    const today = new Date();
    const todayKey = toDateKey(today);
    const thirtyDayCutoff = toDateKey(addDays(today, -30));

    const categoryOptions = [...new Set(items.map(i => i.category).filter(Boolean))].sort();

    const filteredItems = categoryFilter
      ? items.filter(item => item.category === categoryFilter)
      : items;
    const itemNameSet = categoryFilter ? new Set(filteredItems.map(i => i.itemName)) : null;
    const filteredTx  = itemNameSet
      ? transactions.filter(tx => itemNameSet.has(tx.itemName))
      : transactions;

    const totalItems       = filteredItems.length;
    const totalSupplyValue = sumBy(filteredItems, getItemSupplyValue);

    const lowStockItems = filteredItems.filter(item => {
      const minimum = toNumber(safetyStock[item.itemName]);
      return minimum > 0 && toNumber(item.quantity) <= minimum;
    });
    const deadStockItems = filteredItems.filter(item => {
      if (toNumber(item.quantity) <= 0) return false;
      return !filteredTx.some(tx =>
        tx.type === 'out' && tx.itemName === item.itemName && String(tx.date || '') >= thirtyDayCutoff
      );
    });

    const todayTx      = filteredTx.filter(tx => String(tx.date || '') === todayKey);
    const todayInCount  = todayTx.filter(tx => tx.type === 'in').length;
    const todayOutCount = todayTx.filter(tx => tx.type === 'out').length;

    const recentTransactions = [...filteredTx]
      .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
      .slice(0, 30);

    const categoryMap = new Map();
    filteredItems.forEach(item => {
      const cat = item.category || '미분류';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + toNumber(item.quantity));
    });
    const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

    const weekData = getPeriodData(filteredTx, 7);
    const hasData  = items.length > 0;
    const dateStr  = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

    const thisMonthKey  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthKey  = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const thisIn  = sumBy(filteredTx.filter(t => t.type === 'in'  && (t.date || '').startsWith(thisMonthKey)), t => toNumber(t.quantity));
    const prevIn  = sumBy(filteredTx.filter(t => t.type === 'in'  && (t.date || '').startsWith(prevMonthKey)), t => toNumber(t.quantity));
    const thisOut = sumBy(filteredTx.filter(t => t.type === 'out' && (t.date || '').startsWith(thisMonthKey)), t => toNumber(t.quantity));
    const prevOut = sumBy(filteredTx.filter(t => t.type === 'out' && (t.date || '').startsWith(prevMonthKey)), t => toNumber(t.quantity));
    const inTrendPct  = prevIn  > 0 ? Math.round((thisIn  - prevIn)  / prevIn  * 100) : null;
    const outTrendPct = prevOut > 0 ? Math.round((thisOut - prevOut) / prevOut * 100) : null;

    // Winners
    const outQtyMap = {};
    filteredTx.filter(t => t.type === 'out' && String(t.date || '') >= thirtyDayCutoff)
      .forEach(t => { outQtyMap[t.itemName] = (outQtyMap[t.itemName] || 0) + toNumber(t.quantity); });
    const winners = Object.entries(outQtyMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    // Losers
    const losers = filteredItems
      .filter(item => {
        if (toNumber(item.quantity) <= 0) return false;
        return !filteredTx.some(tx =>
          tx.type === 'out' && tx.itemName === item.itemName && String(tx.date || '') >= thirtyDayCutoff
        );
      })
      .sort((a, b) => getItemSupplyValue(b) - getItemSupplyValue(a))
      .slice(0, 5);

    // GMROI
    const outTx30    = filteredTx.filter(t => t.type === 'out' && String(t.date || '') >= thirtyDayCutoff);
    const revenue    = sumBy(outTx30, t => toNumber(t.quantity) * toNumber(t.unitPrice  || t.price || 0));
    const cogs       = sumBy(outTx30, t => toNumber(t.quantity) * toNumber(t.unitCost || t.cost  || 0));
    const grossProfit = revenue - cogs;
    const gmroi = totalSupplyValue > 0 && revenue > 0
      ? Math.round(grossProfit / totalSupplyValue * 100) / 100
      : null;

    return {
      items, transactions: filteredTx, safetyStock,
      totalItems, totalSupplyValue,
      lowStockItems, deadStockItems,
      todayInCount, todayOutCount,
      recentTransactions, categories,
      categoryOptions, winners, losers, gmroi,
      hasData, dateStr, notifications,
      inTrendPct, outTrendPct, weekData,
    };
  }, [state.mappedData, state.transactions, state.safetyStock, categoryFilter]);

  const chartData = useMemo(
    () => getPeriodData(transactions, chartPeriod),
    [transactions, chartPeriod]
  );

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

  const chartTitle = chartPeriod === 7 ? '최근 7일' : chartPeriod === 30 ? '최근 1달' : chartPeriod === 90 ? '최근 3달' : '전체';
  const allTransactions = state.transactions || [];

  // ── 위젯 렌더러 ──────────────────────────────────────────────
  function renderWidget(id) {
    if (id === 'recent') return (
      <div key="recent" className="card"
        draggable={editMode}
        onDragStart={editMode ? e => handleDragStart(e, 'recent') : undefined}
        onDragEnd={editMode ? handleDragEnd : undefined}
        onDragOver={editMode ? e => handleDragOver(e, 'recent') : undefined}
        onDrop={editMode ? handleDrop : undefined}
        style={{ outline: editMode && dragOver === 'recent' ? '2px dashed var(--accent)' : undefined, cursor: editMode ? 'grab' : undefined }}
      >
        {editMode && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, userSelect: 'none' }}>⠿ 드래그하여 순서 변경</div>}
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>최근 입출고 이력</span>
          <div style={{ display: 'flex', gap: 3 }}>
            {[{v:'all',l:'전체'},{v:'in',l:'입고'},{v:'out',l:'출고'}].map(opt => (
              <button key={opt.v}
                className={`btn btn-sm ${txFilter === opt.v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTxFilter(opt.v)}>{opt.l}</button>
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
      <div key="chart" className="card"
        draggable={editMode}
        onDragStart={editMode ? e => handleDragStart(e, 'chart') : undefined}
        onDragEnd={editMode ? handleDragEnd : undefined}
        onDragOver={editMode ? e => handleDragOver(e, 'chart') : undefined}
        onDrop={editMode ? handleDrop : undefined}
        style={{ outline: editMode && dragOver === 'chart' ? '2px dashed var(--accent)' : undefined, cursor: editMode ? 'grab' : undefined }}
      >
        {editMode && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, userSelect: 'none' }}>⠿ 드래그하여 순서 변경</div>}
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{chartTitle} 입출고 흐름 <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>클릭 → 출고내역</span></span>
          <div style={{ display: 'flex', gap: 3 }}>
            {PERIOD_OPTS.map(opt => (
              <button key={opt.v}
                className={`btn btn-sm ${chartPeriod === opt.v ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setChartPeriod(opt.v)}>{opt.l}</button>
            ))}
          </div>
        </div>
        <div style={{ height: 220, position: 'relative', cursor: 'pointer' }}>
          <canvas id={CHART_WEEKLY_ID} />
        </div>
      </div>
    );

    if (id === 'category' && roleConf.showCategory && categories.length > 0) return (
      <div key="category" className="card"
        draggable={editMode}
        onDragStart={editMode ? e => handleDragStart(e, 'category') : undefined}
        onDragEnd={editMode ? handleDragEnd : undefined}
        onDragOver={editMode ? e => handleDragOver(e, 'category') : undefined}
        onDrop={editMode ? handleDrop : undefined}
        style={{ outline: editMode && dragOver === 'category' ? '2px dashed var(--accent)' : undefined, cursor: editMode ? 'grab' : undefined }}
      >
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
      {/* 페이지 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">대시보드</h1>
          <div className="page-desc">{dateStr}</div>
        </div>
        <div className="page-actions" style={{ flexWrap: 'wrap', gap: 6 }}>
          {/* 역할 전환 */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {Object.entries(ROLE_CONFIG).map(([key, conf]) => (
              <button key={key}
                className={`btn btn-sm ${dashRole === key ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 0, border: 'none', fontSize: 12 }}
                onClick={() => setDashRole(key)}
              >{conf.label}</button>
            ))}
          </div>

          {/* 카테고리 필터 */}
          {categoryOptions.length > 0 && (
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
            >
              <option value="">전체 카테고리</option>
              {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* 필터 저장 */}
          <button className="btn btn-sm btn-ghost" style={{ fontSize: 12 }} onClick={saveCurrentFilter} title="현재 필터 조건 저장">
            + 필터 저장
          </button>

          {/* 내보내기 */}
          {allTransactions.length > 0 && (
            <button className="btn btn-outline btn-sm" style={{ fontSize: 12 }} onClick={() => exportCSV(allTransactions)}>
              CSV 내보내기
            </button>
          )}

          {/* 대시보드 편집 모드 */}
          <button
            className={`btn btn-sm ${editMode ? 'btn-primary' : 'btn-ghost'}`}
            style={{ fontSize: 12 }}
            onClick={() => setEditMode(v => !v)}
          >{editMode ? '✓ 완료' : '⠿ 편집'}</button>

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

      {/* 저장된 필터 칩 */}
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
              <span style={{ color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 2 }}
                onClick={() => deleteSavedFilter(idx)}>×</span>
            </div>
          ))}
        </div>
      )}

      {!hasData ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
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
          {/* KPI */}
          <div className={`db-kpi-grid${dashRole === 'staff' ? ' db-kpi-grid-compact' : ''}`}>
            <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">📦</div>
              <div className="db-kpi-label">총 품목</div>
              <div className="db-kpi-value text-accent">{totalItems.toLocaleString('ko-KR')}</div>
            </div>
            {dashRole === 'manager' && (
              <div className="db-kpi-card" onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
                <div className="db-kpi-icon">💰</div>
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
              <TrendBadge pct={inTrendPct} />
              <Sparkline data={weekData.map(d => d.inQty)} color="var(--success)" />
            </div>
            <div className="db-kpi-card" onClick={() => navigate('/out')} style={{ cursor: 'pointer' }}>
              <div className="db-kpi-icon">📤</div>
              <div className="db-kpi-label">오늘 출고</div>
              <div className="db-kpi-value text-danger">{todayOutCount}건</div>
              <TrendBadge pct={outTrendPct} />
              <Sparkline data={weekData.map(d => d.outQty)} color="var(--danger)" />
            </div>
            {dashRole === 'manager' && (
              <div className={`db-kpi-card${deadStockItems.length > 0 ? ' db-kpi-warn' : ''}`}>
                <div className="db-kpi-icon">🕰️</div>
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
            {/* 직원 전용: 빠른 액션 카드 */}
            {dashRole === 'staff' && (
              <div className="db-kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="db-kpi-label">빠른 메뉴</div>
                <button className="btn btn-sm btn-success" onClick={() => navigate('/in')}>입고 등록</button>
                <button className="btn btn-sm btn-danger"  onClick={() => navigate('/out')}>출고 등록</button>
                <button className="btn btn-sm btn-ghost"   onClick={() => navigate('/inventory')}>재고 조회</button>
              </div>
            )}
          </div>

          {/* 재고 부족 경고 바 */}
          {lowStockItems.length > 0 && (
            <div className="db-alert-bar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="db-alert-title" style={{ cursor: 'pointer' }} onClick={() => navigate('/inventory')}>⚠️ 재고 부족 {lowStockItems.length}건</span>
              <span className="db-alert-items" style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate('/inventory')}>
                {lowStockItems.slice(0, 3).map(item =>
                  `${item.itemName} (현재 ${toNumber(item.quantity)} / 안전 ${toNumber(safetyStock[item.itemName])})`
                ).join(' · ')}
                {lowStockItems.length > 3 ? ` 외 ${lowStockItems.length - 3}건` : ''}
              </span>
              <button className="btn btn-sm btn-outline"
                style={{ flexShrink: 0, fontSize: 11, color: 'var(--danger)', borderColor: 'var(--danger)', padding: '2px 10px' }}
                onClick={() => navigate('/auto-order')}>
                발주 바로가기 →
              </button>
            </div>
          )}

          {/* Winners / Losers (경영자 전용) */}
          {roleConf.showWinners && (winners.length > 0 || losers.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div className="card" style={{ padding: '14px 16px' }}>
                <div className="card-title" style={{ marginBottom: 10, fontSize: 13 }}>🏆 판매 TOP (최근 30일)</div>
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
                <div className="card-title" style={{ marginBottom: 10, fontSize: 13 }}>💤 정체 재고 (30일 미출고)</div>
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

          {/* 메인 위젯 그리드 (드래그 순서 반영) */}
          <div className="db-main-grid">
            {mainOrder.map(id => renderWidget(id))}
          </div>
        </>
      )}
    </div>
  );
}
