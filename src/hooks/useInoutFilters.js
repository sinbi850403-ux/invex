import { useState, useMemo, useEffect } from 'react';
import { showToast } from '../toast.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};
const normCode = (v) => {
  const raw = String(v ?? '').trim().replace(/\s+/g, '').toLowerCase();
  if (!raw) return '';
  const stripped = raw.replace(/^0+/, '');
  return stripped || '0';
};
const normName = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
const makeKey = (itemName, itemCode) => {
  const c = normCode(itemCode);
  if (c) return `c:${c}`;
  const n = normName(itemName);
  if (n) return `n:${n}`;
  return '';
};
const toPositiveNumber = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const deriveUnitCostFromSupply = (row) => {
  const qty = toPositiveNumber(row?.quantity);
  const supply = toPositiveNumber(row?.supplyValue);
  if (qty <= 0 || supply <= 0) return 0;
  return supply / qty;
};
const medianOfSorted = (arr) => {
  const n = arr.length;
  if (!n) return 0;
  const m = Math.floor(n / 2);
  return n % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
};
const quantileOfSorted = (arr, q) => {
  if (!arr.length) return 0;
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = arr[base + 1] ?? arr[base];
  return arr[base] + rest * (next - arr[base]);
};

export function useInoutFilters({ transactions, mappedData, mode }) {
  const isInMode = mode === 'in';
  const isOutMode = mode === 'out';
  const today = todayStr();
  const month = monthStr();

  const initialQuick = isInMode ? 'in' : isOutMode ? 'out' : 'all';
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState(isInMode ? 'in' : isOutMode ? 'out' : '');
  const [vendorFilter, setVendorFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [quick, setQuick] = useState(initialQuick);
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });

  useEffect(() => {
    const m = sessionStorage.getItem('invex:inout-filter-month');
    if (m) {
      sessionStorage.removeItem('invex:inout-filter-month');
      setMonthFilter(m);
    }
  }, []);

  const itemMap = useMemo(() => {
    const map = new Map();
    (mappedData || []).forEach((it) => {
      const ck = makeKey('', it.itemCode);
      const nk = makeKey(it.itemName, '');
      if (ck && !map.has(ck)) map.set(ck, it);
      if (nk && !map.has(nk)) map.set(nk, it);
      if (it.itemName && !map.has(it.itemName)) map.set(it.itemName, it); // ?リ옇????筌뤿굞??
    });
    return map;
  }, [mappedData]);

  const resolveItem = (tx) => itemMap.get(makeKey(tx.itemName, tx.itemCode)) || itemMap.get(makeKey(tx.itemName, '')) || {};

  const costStatsMap = useMemo(() => {
    const buckets = {};
    transactions.forEach((tx) => {
      if (tx.type !== 'in') return;
      const k = makeKey(tx.itemName, tx.itemCode);
      if (!k) return;

      const qty = toPositiveNumber(tx.quantity);
      if (qty <= 0) return;

      const fromSupply = deriveUnitCostFromSupply(tx);
      const fromUnit = toPositiveNumber(tx.unitPrice);
      const unitCost = fromSupply > 0 ? fromSupply : fromUnit;
      if (!unitCost) return;

      if (!buckets[k]) buckets[k] = [];
      buckets[k].push({ unitCost, qty });
    });

    const result = {};
    Object.entries(buckets).forEach(([k, rows]) => {
      const units = rows.map((r) => r.unitCost).sort((a, b) => a - b);
      if (!units.length) return;

      const q1 = quantileOfSorted(units, 0.25);
      const q3 = quantileOfSorted(units, 0.75);
      const iqr = Math.max(0, q3 - q1);
      const lower = Math.max(0, q1 - 1.5 * iqr);
      const upper = q3 + 1.5 * iqr;

      let inliers = rows.filter((r) => r.unitCost >= lower && r.unitCost <= upper);
      if (!inliers.length) inliers = rows;

      const totalQty = inliers.reduce((s, r) => s + r.qty, 0);
      const totalAmt = inliers.reduce((s, r) => s + r.unitCost * r.qty, 0);
      const inlierUnits = inliers.map((r) => r.unitCost).sort((a, b) => a - b);

      result[k] = {
        weighted: totalQty > 0 ? totalAmt / totalQty : 0,
        median: medianOfSorted(inlierUnits),
        min: inlierUnits[0] || 0,
        max: inlierUnits[inlierUnits.length - 1] || 0,
        count: inlierUnits.length,
      };
    });
    return result;
  }, [transactions]);

  const wacMap = useMemo(() => {
    const map = {};
    Object.entries(costStatsMap).forEach(([k, s]) => {
      map[k] = toPositiveNumber(s?.weighted || s?.median || 0);
    });
    return map;
  }, [costStatsMap]);

  const resolveWac = (tx, itemData) => {
    const key = makeKey(tx.itemName, tx.itemCode);
    const stats = costStatsMap[key] || null;
    const salePrice = toPositiveNumber(tx.actualSellingPrice || tx.sellingPrice || itemData?.salePrice);
    const maxCostRatioToSale = 5;
    const isPlausibleCost = (cost) => (
      cost > 0 &&
      Number.isFinite(cost) &&
      (salePrice <= 0 || cost <= salePrice * maxCostRatioToSale)
    );

    const costFromStats = toPositiveNumber(stats?.weighted || stats?.median || 0);
    if (isPlausibleCost(costFromStats)) return costFromStats;

    const costFromItemSupply = deriveUnitCostFromSupply(itemData);
    if (isPlausibleCost(costFromItemSupply)) return costFromItemSupply;

    const costFromItemUnit = toPositiveNumber(itemData?.unitPrice);
    if (isPlausibleCost(costFromItemUnit)) return costFromItemUnit;

    const costFromRow = toPositiveNumber(tx.unitPrice);
    if (isPlausibleCost(costFromRow)) return costFromRow;

    // 원가 데이터 없음 → 0 반환 (salePrice 폴백 제거: 이익=0 오표시 방지)
    return 0;
  };

  const inList = useMemo(() => transactions.filter(tx => tx.type === 'in'), [transactions]);
  const outList = useMemo(() => transactions.filter(tx => tx.type === 'out'), [transactions]);

  const vendorOptions = useMemo(() => {
    const set = new Set(transactions.map(tx => tx.vendor).filter(Boolean));
    return Array.from(set).sort();
  }, [transactions]);

  const quickChips = isInMode
    ? [
        { value: 'in', label: '전체 보기' },
        { value: 'today', label: '오늘 기록' },
        { value: 'recent3', label: '최근 3일' },
        { value: 'missingVendor', label: '거래처 미입력' },
      ]
    : isOutMode
      ? [
          { value: 'out', label: '전체 보기' },
          { value: 'today', label: '오늘 기록' },
          { value: 'recent3', label: '최근 3일' },
          { value: 'missingVendor', label: '거래처 미입력' },
        ]
      : [
          { value: 'all', label: '전체 보기' },
          { value: 'today', label: '오늘 기록' },
          { value: 'in', label: '입고만' },
          { value: 'out', label: '출고만' },
          { value: 'missingVendor', label: '거래처 미입력' },
          { value: 'recent3', label: '최근 3일' },
        ];
  const handleQuickChange = (val) => {
    setQuick(val);
    if (!isInMode && !isOutMode) {
      if (val === 'in') setTypeFilter('in');
      else if (val === 'out') setTypeFilter('out');
      else setTypeFilter('');
    }
    if (val === 'today') setDateFilter(today);
    else setDateFilter('');
  };

  const threeDaysAgo = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 2);
    return d.toISOString().slice(0, 10);
  }, []);

  const filtered = useMemo(() => {
    const kw = keyword.toLowerCase();
    return transactions.filter(tx => {
      if (kw && !(
        (tx.itemName || '').toLowerCase().includes(kw) ||
        (tx.itemCode || '').toLowerCase().includes(kw) ||
        (tx.vendor || '').toLowerCase().includes(kw)
      )) return false;
      if (typeFilter && tx.type !== typeFilter) return false;
      if (dateFilter && tx.date !== dateFilter) return false;
      if (monthFilter && !String(tx.date || '').startsWith(monthFilter)) return false;
      if (vendorFilter && tx.vendor !== vendorFilter) return false;
      if (quick === 'today' && tx.date !== today) return false;
      if (quick === 'in' && tx.type !== 'in') return false;
      if (quick === 'out' && tx.type !== 'out') return false;
      if (quick === 'missingVendor' && String(tx.vendor || '').trim()) return false;
      if (quick === 'recent3' && String(tx.date || '') < threeDaysAgo) return false;
      return true;
    });
  }, [transactions, keyword, typeFilter, dateFilter, monthFilter, vendorFilter, quick, today, threeDaysAgo]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aItem = resolveItem(a);
      const bItem = resolveItem(b);
      let av, bv;
      if (sort.key === 'date') {
        av = new Date(a.date || a.createdAt || 0).getTime();
        bv = new Date(b.date || b.createdAt || 0).getTime();
      } else if (sort.key === 'quantity') {
        av = parseFloat(a.quantity) || 0;
        bv = parseFloat(b.quantity) || 0;
      } else if (sort.key === 'unitPrice') {
        av = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        bv = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
      } else if (sort.key === 'sellingPrice') {
        av = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        bv = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
      } else if (sort.key === 'supply') {
        const aWac = resolveWac(a, aItem);
        const bWac = resolveWac(b, bItem);
        av = aWac * (parseFloat(a.quantity) || 0);
        bv = bWac * (parseFloat(b.quantity) || 0);
      } else if (sort.key === 'outAmt') {
        av = (parseFloat(a.sellingPrice || aItem.salePrice) || 0) * (parseFloat(a.quantity) || 0);
        bv = (parseFloat(b.sellingPrice || bItem.salePrice) || 0) * (parseFloat(b.quantity) || 0);
      } else if (sort.key === 'outTotal') {
        av = Math.round((parseFloat(a.sellingPrice || aItem.salePrice) || 0) * (parseFloat(a.quantity) || 0) * 1.1);
        bv = Math.round((parseFloat(b.sellingPrice || bItem.salePrice) || 0) * (parseFloat(b.quantity) || 0) * 1.1);
      } else if (sort.key === 'outVat') {
        av = Math.round((parseFloat(a.sellingPrice || aItem.salePrice) || 0) * (parseFloat(a.quantity) || 0) * 0.1);
        bv = Math.round((parseFloat(b.sellingPrice || bItem.salePrice) || 0) * (parseFloat(b.quantity) || 0) * 0.1);
      } else if (sort.key === 'profit') {
        const aQty = parseFloat(a.quantity) || 0; const bQty = parseFloat(b.quantity) || 0;
        const aUp = resolveWac(a, aItem);
        const bUp = resolveWac(b, bItem);
        const aSp = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        const bSp = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
        av = (aSp - aUp) * aQty; bv = (bSp - bUp) * bQty;
      } else if (sort.key === 'vat') {
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        av = Math.ceil(aUp * (parseFloat(a.quantity) || 0) * 0.1);
        bv = Math.ceil(bUp * (parseFloat(b.quantity) || 0) * 0.1);
      } else if (sort.key === 'totalPrice') {
        const aUp = parseFloat(a.unitPrice || aItem.unitPrice) || 0;
        const bUp = parseFloat(b.unitPrice || bItem.unitPrice) || 0;
        const aSupply = Math.round(aUp * (parseFloat(a.quantity) || 0));
        const bSupply = Math.round(bUp * (parseFloat(b.quantity) || 0));
        av = aSupply + Math.ceil(aSupply * 0.1);
        bv = bSupply + Math.ceil(bSupply * 0.1);
      } else if (sort.key === 'profitMargin') {
        const aQty = parseFloat(a.quantity) || 0; const bQty = parseFloat(b.quantity) || 0;
        const aUp = resolveWac(a, aItem);
        const bUp = resolveWac(b, bItem);
        const aSp = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        const bSp = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
        const aSupply = aUp * aQty; const aOut = aSp * aQty;
        const bSupply = bUp * bQty; const bOut = bSp * bQty;
        av = aOut > 0 ? (aOut - aSupply) / aOut * 100 : 0;
        bv = bOut > 0 ? (bOut - bSupply) / bOut * 100 : 0;
      } else if (sort.key === 'cogsMargin') {
        const aQty = parseFloat(a.quantity) || 0; const bQty = parseFloat(b.quantity) || 0;
        const aUp = resolveWac(a, aItem);
        const bUp = resolveWac(b, bItem);
        const aSp = parseFloat(a.sellingPrice || aItem.salePrice) || 0;
        const bSp = parseFloat(b.sellingPrice || bItem.salePrice) || 0;
        const aOut = aSp * aQty; const bOut = bSp * bQty;
        av = aOut > 0 ? aUp * aQty / aOut * 100 : 0;
        bv = bOut > 0 ? bUp * bQty / bOut * 100 : 0;
      } else if (sort.key === 'note') {
        av = (a.note || '').toLowerCase(); bv = (b.note || '').toLowerCase();
      } else if (sort.key === 'itemName') {
        av = (a.itemName || '').toLowerCase(); bv = (b.itemName || '').toLowerCase();
      } else if (sort.key === 'color') {
        av = (a.color || aItem.color || '').toLowerCase();
        bv = (b.color || bItem.color || '').toLowerCase();
      } else if (sort.key === 'vendor') {
        av = (a.vendor || '').toLowerCase(); bv = (b.vendor || '').toLowerCase();
      } else if (sort.key === 'category') {
        av = (a.category || aItem.category || '').toLowerCase();
        bv = (b.category || bItem.category || '').toLowerCase();
      } else if (sort.key === 'itemCode') {
        av = (a.itemCode || aItem.itemCode || '').toLowerCase();
        bv = (b.itemCode || bItem.itemCode || '').toLowerCase();
      } else if (sort.key === 'spec') {
        av = (a.spec || aItem.spec || '').toLowerCase();
        bv = (b.spec || bItem.spec || '').toLowerCase();
      } else if (sort.key === 'unit') {
        av = (a.unit || aItem.unit || '').toLowerCase();
        bv = (b.unit || bItem.unit || '').toLowerCase();
      } else {
        av = a[sort.key] || ''; bv = b[sort.key] || '';
      }
      if (typeof av === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'ko-KR', { numeric: true }) * dir;
    });
  }, [filtered, sort, itemMap, wacMap]);

  const inTotals = useMemo(() => {
    if (!isInMode) return null;
    let totQty = 0, totSupply = 0, totVat = 0, totTotal = 0;
    sorted.forEach(tx => {
      const q = parseFloat(tx.quantity) || 0;
      const itd = resolveItem(tx);
      const cost = parseFloat(tx.unitPrice || itd.unitPrice) || 0;
      const sup = Math.round(cost * q);
      totQty += q; totSupply += sup;
      totVat += Math.ceil(sup * 0.1);
      totTotal += sup + Math.ceil(sup * 0.1);
    });
    return { totQty, totSupply, totVat, totTotal };
  }, [sorted, isInMode, itemMap]);

  const outTotals = useMemo(() => {
    if (!isOutMode) return null;
    let totQty = 0, totOutAmt = 0, totVat = 0, totOutTotal = 0, totWacSupply = 0, totProfit = 0;
    sorted.forEach(tx => {
      const q = parseFloat(tx.quantity) || 0;
      const itd = resolveItem(tx);
      const sp = parseFloat(tx.sellingPrice || itd.salePrice) || 0;
      const oa = Math.round(sp * q);
      const wac = resolveWac(tx, itd);
      const ws = Math.round(wac * q);
      const vat = Math.round(oa * 0.1);
      totQty += q; totOutAmt += oa;
      totOutTotal += Math.round(oa * 1.1);
      totWacSupply += ws; totProfit += oa - ws;
      totVat += vat;
    });
    return {
      totQty, totOutAmt, totVat, totOutTotal, totWacSupply, totProfit,
      totProfitMargin: totOutAmt > 0 ? (totProfit / totOutAmt * 100).toFixed(1) + '%' : '-',
      totCogsMargin:   totOutAmt > 0 ? (totWacSupply / totOutAmt * 100).toFixed(1) + '%' : '-',
    };
  }, [sorted, isOutMode, itemMap, wacMap]);

  const statTotal = isInMode ? inList.length : isOutMode ? outList.length : transactions.length;
  const statTodayIn = useMemo(() => inList.filter(tx => tx.date === today).length, [inList, today]);
  const statTodayOut = useMemo(() => outList.filter(tx => tx.date === today).length, [outList, today]);
  const statToday = isInMode ? statTodayIn : isOutMode ? statTodayOut : statTodayIn;
  const statMonthIn = useMemo(() => inList.filter(tx => String(tx.date || '').startsWith(month)).length, [inList, month]);
  const statMonthOut = useMemo(() => outList.filter(tx => String(tx.date || '').startsWith(month)).length, [outList, month]);
  const stat3 = isInMode ? statMonthIn : isOutMode ? statMonthOut : statTodayOut;

  const toggleSort = (key) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'date', dir: 'desc' };
    });
  };

  const handleReset = () => {
    setKeyword('');
    setTypeFilter(isInMode ? 'in' : isOutMode ? 'out' : '');
    setVendorFilter('');
    setDateFilter('');
    setQuick(initialQuick);
    setSort({ key: 'date', dir: 'desc' });
    showToast('?熬곥굤??? ?筌먲퐣議???貫?껆뵳??됀筌???鍮??', 'info');
  };

  return {
    keyword, setKeyword,
    typeFilter, setTypeFilter,
    vendorFilter, setVendorFilter,
    dateFilter, setDateFilter,
    monthFilter, setMonthFilter,
    quick, sort, setSort,
    sorted, filtered, itemMap, wacMap, resolveItem, resolveWac,
    vendorOptions, quickChips,
    handleQuickChange, handleReset, toggleSort,
    inTotals, outTotals,
    statTotal, statToday, stat3,
    today,
  };
}
