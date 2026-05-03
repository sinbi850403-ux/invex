import { getSalePrice } from '../price-utils.js';

export const PROFIT_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export const toNumber   = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const sumBy      = (list, fn) => list.reduce((s, i) => s + fn(i), 0);
export const toDateKey  = (v) => new Date(v).toISOString().split('T')[0];
export const addDays    = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
export const isValidDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const fmtMoney      = (v) => `${Math.round(toNumber(v)).toLocaleString('ko-KR')}원`;
export const fmtSigned     = (v) => { const r = Math.round(toNumber(v)); if (!r) return '0원'; return `${r > 0 ? '+' : '-'}${Math.abs(r).toLocaleString('ko-KR')}원`; };
export const fmtPct        = (v) => `${toNumber(v).toFixed(1)}%`;
export const fmtSignedPct  = (v) => { const n = toNumber(v); if (Math.abs(n) < 0.0001) return '0.0%'; return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`; };
export const getTone       = (r) => r < 10 ? 'var(--danger)' : r < 20 ? 'var(--warning)' : 'var(--success)';

export const readLS  = (key) => { try { const r = localStorage.getItem(key); return r ? (JSON.parse(r) || {}) : {}; } catch { return {}; } };
export const writeLS = (key, obj) => { try { localStorage.setItem(key, JSON.stringify(obj)); } catch {} };

function getItemMetric(item, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(item, k)) return toNumber(item[k]);
    if (item?.extra && Object.prototype.hasOwnProperty.call(item.extra, k)) return toNumber(item.extra[k]);
  }
  return 0;
}

export function getTransactionAmount(tx, items) {
  const qty    = toNumber(tx.quantity);
  const direct = toNumber(tx.price ?? tx.unitPrice ?? tx.unitCost ?? 0);
  if (direct > 0) return qty * direct;
  const item = items.find(i => i.itemName === tx.itemName || (i.itemCode && i.itemCode === tx.itemCode));
  if (!item) return 0;
  const fp = tx.type === 'out' ? toNumber(getSalePrice(item)) : toNumber(item.unitPrice || item.unitCost);
  return qty * fp;
}

/**
 * buildItemRows — 품목별 손익 계산
 *
 * @param {Array} items        - 아이템 마스터 배열
 * @param {Array} transactions - 입출고 트랜잭션 배열 (선택, 없으면 아이템 마스터만 사용)
 *
 * 원가/판매가 폴백 순서:
 *   원가  : 아이템 마스터 unitPrice  → 입고 트랜잭션 가중평균
 *   판매가 : 아이템 마스터 salePrice  → 출고 트랜잭션 평균 단가 → getSalePrice(원가 기반 추정)
 */
export function buildItemRows(items, transactions) {
  // ── 트랜잭션 집계: 품목별 입고단가 가중평균 + 출고단가 평균 계산 ──────────
  const txAgg = {};
  const normCode = v => String(v || '').trim().replace(/^0+/, '').toLowerCase() || '';
  const normName = v => String(v || '').toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  const makeKey  = (name, code) => {
    const c = normCode(code);
    if (c) return `code:${c}`;
    const n = normName(name);
    return n ? `name:${n}` : '';
  };

  (transactions || []).forEach(tx => {
    const key = makeKey(tx.itemName, tx.itemCode);
    if (!key) return;
    if (!txAgg[key]) txAgg[key] = { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0 };
    const qty = parseFloat(tx.quantity) || 0;
    if (tx.type === 'in') {
      txAgg[key].inQty += qty;
      const sv = parseFloat(tx.supplyValue);
      txAgg[key].inAmt += (Number.isFinite(sv) && sv > 0) ? sv : (parseFloat(tx.unitPrice) || 0) * qty;
    } else {
      txAgg[key].outQty += qty;
      const sp = parseFloat(tx.actualSellingPrice || tx.sellingPrice || tx.salePrice) || parseFloat(tx.unitPrice) || 0;
      txAgg[key].outAmt += sp * qty;
    }
  });

  // ── 품목 행 계산 ────────────────────────────────────────────────────────────
  const rawRows = items.map(item => {
    const quantity = toNumber(item.quantity);

    // 원가: 아이템 마스터 → 입고 트랜잭션 가중평균
    const masterCost = toNumber(item.unitPrice || item.unitCost);
    const txKey      = makeKey(item.itemName, item.itemCode);
    const agg        = txAgg[txKey] || {};
    const weightedCost = (agg.inQty > 0 && agg.inAmt > 0) ? agg.inAmt / agg.inQty : 0;
    const unitCost   = masterCost > 0 ? masterCost : Math.round(weightedCost);

    // 판매가: 아이템 마스터 → 출고 트랜잭션 평균 → 원가 기반 추정(20% 마크업)
    const masterSalePrice = toNumber(item.salePrice);
    const avgOutPrice     = (agg.outQty > 0 && agg.outAmt > 0) ? Math.round(agg.outAmt / agg.outQty) : 0;
    const estimatedPrice  = unitCost > 0 ? toNumber(getSalePrice({ unitPrice: unitCost })) : 0;
    const salePrice = masterSalePrice > 0 ? masterSalePrice
                    : avgOutPrice     > 0 ? avgOutPrice
                    : estimatedPrice;

    const hasSalePrice    = masterSalePrice > 0 || avgOutPrice > 0;

    const discountAmount = getItemMetric(item, ['discountAmount','discount','discountValue','discount_price','할인금액']);
    const sgnaExpense    = getItemMetric(item, ['sgnaExpense','sgna','sellingGeneralAdminExpense','operatingExpense','판관비','판매관리비']);
    const grossSalesAmount  = Math.round(quantity * salePrice);
    const totalRevenue      = Math.max(0, Math.round(grossSalesAmount - discountAmount));
    const totalCost         = Math.round(quantity * unitCost);
    const grossProfit       = totalRevenue - totalCost;
    const operatingProfit   = grossProfit - Math.round(sgnaExpense);
    const profitRate        = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const costRatio         = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
    const operatingProfitRate = totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0;
    return {
      name: item.itemName || '(미분류 품목)', code: item.itemCode || '', category: item.category || '미분류',
      quantity, unitCost, salePrice, hasSalePrice,
      grossSalesAmount, discountAmount, sgnaExpense, totalCost, totalRevenue,
      grossProfit, operatingProfit, profit: operatingProfit,
      profitRate, costRatio, operatingProfitRate,
    };
  }).filter(r => r.quantity > 0 || r.totalCost > 0);

  const groupMap = new Map();
  rawRows.forEach(row => {
    const key = row.code ? row.code : row.name;
    if (!groupMap.has(key)) { groupMap.set(key, { ...row }); return; }
    const g = groupMap.get(key);
    const cq = g.quantity + row.quantity;
    const cc = g.totalCost + row.totalCost;
    const cr = g.totalRevenue + row.totalRevenue;
    const cs = g.sgnaExpense + row.sgnaExpense;
    const cgp = cr - cc; const cop = cgp - cs;
    g.quantity = cq; g.grossSalesAmount += row.grossSalesAmount; g.discountAmount += row.discountAmount;
    g.sgnaExpense = cs; g.totalCost = cc; g.totalRevenue = cr;
    g.grossProfit = cgp; g.operatingProfit = cop; g.profit = cop;
    g.unitCost = cq > 0 ? Math.round(cc / cq) : 0;
    g.salePrice = cq > 0 ? Math.round(g.grossSalesAmount / cq) : 0;
    g.profitRate = cr > 0 ? (cgp / cr) * 100 : 0;
    g.costRatio  = cr > 0 ? (cc / cr) * 100 : 0;
    g.operatingProfitRate = cr > 0 ? (cop / cr) * 100 : 0;
    g.hasSalePrice = g.hasSalePrice || row.hasSalePrice;
    if (!g.salePrice && row.salePrice) g.salePrice = row.salePrice;
  });
  return Array.from(groupMap.values());
}

export function buildPeriodSummary(transactions, items) {
  let totalIn = 0, totalOut = 0;
  transactions.forEach(tx => {
    const a = getTransactionAmount(tx, items);
    if (tx.type === 'in') totalIn += a;
    if (tx.type === 'out') totalOut += a;
  });
  return { totalIn: Math.round(totalIn), totalOut: Math.round(totalOut), profit: Math.round(totalOut - totalIn) };
}

export function buildMonthlySeries(transactions, items) {
  const map = new Map();
  transactions.forEach(tx => {
    if (!tx.date) return;
    const key = String(tx.date).slice(0, 7);
    if (!map.has(key)) map.set(key, { totalIn: 0, totalOut: 0 });
    const b = map.get(key); const a = getTransactionAmount(tx, items);
    if (tx.type === 'in') b.totalIn += a;
    if (tx.type === 'out') b.totalOut += a;
  });
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, row]) => ({
      label: `${key.replace('-', '년 ')}월`,
      totalIn: Math.round(row.totalIn), totalOut: Math.round(row.totalOut),
      profit: Math.round(row.totalOut - row.totalIn),
    }));
}

export function buildVendorSummary(transactions, items) {
  const map = new Map();
  transactions.forEach(tx => {
    const name = String(tx.vendor || '').trim() || '미지정';
    const cur = map.get(name) || { name, count: 0, totalIn: 0, totalOut: 0, lastDate: '' };
    cur.count++;
    if (String(tx.date || '') > cur.lastDate) cur.lastDate = String(tx.date || '');
    const a = getTransactionAmount(tx, items);
    if (tx.type === 'in') cur.totalIn += a;
    if (tx.type === 'out') cur.totalOut += a;
    map.set(name, cur);
  });
  return Array.from(map.values()).map(e => {
    const profit = e.totalOut - e.totalIn;
    return { ...e, totalIn: Math.round(e.totalIn), totalOut: Math.round(e.totalOut), profit: Math.round(profit), profitRate: e.totalOut > 0 ? (profit / e.totalOut) * 100 : 0, marginRate: e.totalIn > 0 ? (profit / e.totalIn) * 100 : 0 };
  });
}

export function summarizeByCategory(rows) {
  const map = new Map();
  rows.forEach(row => {
    const p = map.get(row.category) || { name: row.category, count: 0, revenue: 0, cost: 0, profit: 0 };
    p.count++; p.revenue += row.totalRevenue; p.cost += row.totalCost; p.profit += row.profit;
    map.set(row.category, p);
  });
  return Array.from(map.values())
    .map(e => ({ ...e, rate: e.revenue > 0 ? (e.profit / e.revenue) * 100 : 0 }))
    .sort((a, b) => b.profit - a.profit);
}

export function getCurrentMonthSummary(transactions) {
  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mt = transactions.filter(tx => String(tx.date || '').startsWith(cm));
  const totalIn  = sumBy(mt.filter(tx => tx.type === 'in'),  tx => toNumber(tx.totalPrice) || toNumber(tx.quantity) * toNumber(tx.unitCost || tx.unitPrice));
  const totalOut = sumBy(mt.filter(tx => tx.type === 'out'), tx => toNumber(tx.totalPrice) || toNumber(tx.quantity) * toNumber(getSalePrice(tx)));
  return { totalIn: Math.round(totalIn), totalOut: Math.round(totalOut), profit: Math.round(totalOut - totalIn) };
}

export function normalizeMonthlyMap(value) {
  const src = value && typeof value === 'object' ? value : {};
  const res = {};
  PROFIT_MONTHS.forEach(m => { res[m] = toNumber(src[m] ?? src[String(m)] ?? 0); });
  return res;
}

export function buildMonthlyPlannerData(transactions, items, year, maps) {
  const plan = {}; const actual = {};
  ['sales','cost','sgna','grossProfit','operatingProfit','operatingProfitRate'].forEach(k => { plan[k] = {}; actual[k] = {}; });
  const byCode = new Map(); const byName = new Map();
  (items || []).forEach(item => {
    const c = String(item.itemCode || '').trim(); const n = String(item.itemName || '').trim();
    if (c && !byCode.has(c)) byCode.set(c, item);
    if (n && !byName.has(n)) byName.set(n, item);
  });
  const findItem = (tx) => { const c = String(tx.itemCode || '').trim(); if (c && byCode.has(c)) return byCode.get(c); return byName.get(String(tx.itemName || '').trim()) || null; };
  const txSummary = {};
  PROFIT_MONTHS.forEach(m => { txSummary[m] = { sales: 0, cost: 0 }; });
  (transactions || []).forEach(tx => {
    if (tx.type !== 'out' || !tx.date) return;
    const m2 = /^(\d{4})-(\d{2})/.exec(String(tx.date));
    if (!m2 || Number(m2[1]) !== year) return;
    const month = Number(m2[2]); if (!PROFIT_MONTHS.includes(month)) return;
    const item = findItem(tx); const qty = toNumber(tx.quantity);
    const su = toNumber(tx.price ?? tx.actualSellingPrice ?? tx.salePrice ?? tx.unitPrice) || toNumber(item ? getSalePrice(item) : 0);
    const discount = toNumber(tx.discountAmount ?? tx.discount ?? tx.refundAmount);
    txSummary[month].sales += Math.max(0, qty * su - discount);
    const cu = toNumber(tx.unitCost ?? tx.cost) || toNumber(item?.unitPrice ?? item?.unitCost);
    txSummary[month].cost += qty * cu;
  });
  PROFIT_MONTHS.forEach(m => {
    const ps = toNumber(maps.salesPlan[m]); const pc = toNumber(maps.costPlan[m]); const pg = toNumber(maps.sgnaPlan[m]);
    const pGross = ps - pc; const pOp = pGross - pg;
    plan.sales[m] = Math.round(ps); plan.cost[m] = Math.round(pc); plan.sgna[m] = Math.round(pg);
    plan.grossProfit[m] = Math.round(pGross); plan.operatingProfit[m] = Math.round(pOp);
    plan.operatingProfitRate[m] = ps > 0 ? (pOp / ps) * 100 : 0;
    const as = toNumber(txSummary[m]?.sales); const ac = toNumber(txSummary[m]?.cost); const ag = toNumber(maps.sgnaActual[m]);
    const aGross = as - ac; const aOp = aGross - ag;
    actual.sales[m] = Math.round(as); actual.cost[m] = Math.round(ac); actual.sgna[m] = Math.round(ag);
    actual.grossProfit[m] = Math.round(aGross); actual.operatingProfit[m] = Math.round(aOp);
    actual.operatingProfitRate[m] = as > 0 ? (aOp / as) * 100 : 0;
  });
  return { plan, actual };
}
