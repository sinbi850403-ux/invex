export const PERIOD_OPTS = [
  { v: 7,  l: '7일' },
  { v: 30, l: '1달' },
  { v: 90, l: '3달' },
  { v: 0,  l: '전체' },
];

export const WIDGET_DEFS = [
  { id: 'recent',   label: '최근 입출고 이력' },
  { id: 'chart',    label: '입출고 흐름 차트' },
  { id: 'category', label: '분류별 재고 비중' },
];

export const DEFAULT_MAIN_ORDER = ['recent', 'chart', 'category'];

export const ROLE_CONFIG = {
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

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}
export function sumBy(rows, fn) { return rows.reduce((s, r) => s + fn(r), 0); }
export function toDateKey(value) { return new Date(value).toISOString().split('T')[0]; }
export function addDays(base, delta) { const d = new Date(base); d.setDate(d.getDate() + delta); return d; }
export function formatCurrency(value) {
  const n = toNumber(value);
  if (n <= 0) return '-';
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}
export function getItemSupplyValue(item, itemStocks) {
  const supplyValue = toNumber(item.supplyValue);
  if (supplyValue > 0) return supplyValue;
  if (!itemStocks) return 0;
  const qty = itemStocks.reduce((sum, s) => s.itemId === (item._id || item.id) ? sum + toNumber(s.quantity) : sum, 0);
  return qty * toNumber(item.unitPrice || item.unitCost);
}

export function loadLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
export function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getPeriodData(transactions, days) {
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

export function exportCSV(transactions) {
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

export function computeHomeDashboard({ items, transactions, safetyStock, categoryFilter, itemStocks = [] }) {
  const today  = new Date();
  const todayKey = toDateKey(today);
  const thirtyDayCutoff = toDateKey(addDays(today, -30));

  const getItemQty = (item) => {
    const id = item?._id || item?.id;
    const stockQty = itemStocks.reduce((sum, s) => s.itemId === id ? sum + toNumber(s.quantity) : sum, 0);
    if (stockQty > 0) return stockQty;
    return toNumber(item?.quantity);
  };

  const categoryOptions = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
  const filteredItems = categoryFilter ? items.filter(item => item.category === categoryFilter) : items;
  const itemNameSet   = categoryFilter ? new Set(filteredItems.map(i => i.itemName)) : null;
  const filteredTx    = itemNameSet ? transactions.filter(tx => itemNameSet.has(tx.itemName)) : transactions;

  const totalItems       = filteredItems.length;
  const totalSupplyValue = sumBy(filteredItems, item => getItemSupplyValue(item, itemStocks));

  const lowStockItems = filteredItems.filter(item => {
    const minimum = toNumber(safetyStock[item.itemName]);
    return minimum > 0 && getItemQty(item) <= minimum;
  });
  const deadStockItems = filteredItems.filter(item => {
    if (getItemQty(item) <= 0) return false;
    return !filteredTx.some(tx =>
      tx.type === 'out' && tx.itemName === item.itemName && String(tx.date || '') >= thirtyDayCutoff
    );
  });

  const todayTx       = filteredTx.filter(tx => String(tx.date || '') === todayKey);
  const todayInCount  = todayTx.filter(tx => tx.type === 'in').length;
  const todayOutCount = todayTx.filter(tx => tx.type === 'out').length;

  const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthKey  = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const monthTx      = filteredTx.filter(tx => (tx.date || '').startsWith(thisMonthKey));
  const monthInQty   = sumBy(monthTx.filter(t => t.type === 'in'),  t => toNumber(t.quantity));
  const monthOutQty  = sumBy(monthTx.filter(t => t.type === 'out'), t => toNumber(t.quantity));
  const monthRevenue = sumBy(monthTx.filter(t => t.type === 'out'), t => toNumber(t.quantity) * toNumber(t.unitPrice || 0));

  const recentTransactions = [...filteredTx]
    .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')))
    .slice(0, 30);

  const categoryMap = new Map();
  filteredItems.forEach(item => {
    const cat = item.category || '미분류';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + getItemQty(item));
  });
  const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

  const weekData = getPeriodData(filteredTx, 7);
  const dateStr  = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const thisIn  = sumBy(filteredTx.filter(t => t.type === 'in'  && (t.date || '').startsWith(thisMonthKey)), t => toNumber(t.quantity));
  const prevIn  = sumBy(filteredTx.filter(t => t.type === 'in'  && (t.date || '').startsWith(prevMonthKey)), t => toNumber(t.quantity));
  const thisOut = sumBy(filteredTx.filter(t => t.type === 'out' && (t.date || '').startsWith(thisMonthKey)), t => toNumber(t.quantity));
  const prevOut = sumBy(filteredTx.filter(t => t.type === 'out' && (t.date || '').startsWith(prevMonthKey)), t => toNumber(t.quantity));
  const inTrendPct  = prevIn  > 0 ? Math.round((thisIn  - prevIn)  / prevIn  * 100) : null;
  const outTrendPct = prevOut > 0 ? Math.round((thisOut - prevOut) / prevOut * 100) : null;

  const outQtyMap = {};
  filteredTx.filter(t => t.type === 'out' && String(t.date || '') >= thirtyDayCutoff)
    .forEach(t => { outQtyMap[t.itemName] = (outQtyMap[t.itemName] || 0) + toNumber(t.quantity); });
  const winners = Object.entries(outQtyMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  const losers = filteredItems
    .filter(item => {
      if (getItemQty(item) <= 0) return false;
      return !filteredTx.some(tx =>
        tx.type === 'out' && tx.itemName === item.itemName && String(tx.date || '') >= thirtyDayCutoff
      );
    })
    .sort((a, b) => getItemSupplyValue(b, itemStocks) - getItemSupplyValue(a, itemStocks))
    .slice(0, 5);

  const outTx30     = filteredTx.filter(t => t.type === 'out' && String(t.date || '') >= thirtyDayCutoff);
  const revenue     = sumBy(outTx30, t => toNumber(t.quantity) * toNumber(t.unitPrice  || t.price || 0));
  const cogs        = sumBy(outTx30, t => toNumber(t.quantity) * toNumber(t.unitCost || t.cost  || 0));
  const grossProfit = revenue - cogs;
  const gmroi = totalSupplyValue > 0 && revenue > 0
    ? Math.round(grossProfit / totalSupplyValue * 100) / 100
    : null;

  return {
    filteredTx, totalItems, totalSupplyValue,
    lowStockItems, deadStockItems,
    todayInCount, todayOutCount,
    monthInQty, monthOutQty, monthRevenue,
    recentTransactions, categories,
    categoryOptions, winners, losers, gmroi,
    dateStr, inTrendPct, outTrendPct, weekData,
    hasData: items.length > 0,
  };
}
