import { ALL_FIELDS, DEFAULT_VISIBLE, toNum } from './inventoryConfig.js';

export function computeData(rawData, transactions) {
  const txAgg = {};
  const normName = (v) => String(v || '').trim();
  (transactions || []).forEach(tx => {
    const k = normName(tx.itemName);
    if (!k) return;
    if (!txAgg[k]) txAgg[k] = { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0, costAmt: 0, itemCode: '', vendor: '' };
    const qty = parseFloat(tx.quantity) || 0;
    if (!txAgg[k].itemCode && tx.itemCode) txAgg[k].itemCode = String(tx.itemCode).trim();
    if (!txAgg[k].vendor && tx.vendor) txAgg[k].vendor = String(tx.vendor).trim();
    if (tx.type === 'in') {
      txAgg[k].inQty += qty;
      txAgg[k].inAmt += Math.round((parseFloat(tx.unitPrice) || 0) * qty);
    } else {
      txAgg[k].outQty += qty;
      const sp = parseFloat(tx.actualSellingPrice || tx.sellingPrice) || 0;
      const cp = parseFloat(tx.unitPrice) || 0;
      txAgg[k].outAmt  += Math.round(sp * qty);
      txAgg[k].costAmt += Math.round(cp * qty);
    }
  });

  return (rawData || []).map(item => {
    const agg        = txAgg[normName(item.itemName)] || {};
    const inQty      = agg.inQty  || 0;
    const inAmt      = agg.inAmt  || 0;
    const outQty     = agg.outQty || 0;
    const outAmt     = agg.outAmt || 0;
    const unitPrice  = parseFloat(item.unitPrice) || 0;
    const storedQty  = parseFloat(item.quantity)  || 0;
    // item.quantity가 0이지만 트랜잭션 net이 양수면 트랜잭션 기준으로 표시 (Supabase sync 실패 복원)
    // qty는 아래 inQty/outQty 계산 후 확정 → 임시로 storedQty 사용
    let qty          = storedQty;

    // storedQty=0이지만 트랜잭션 net>0 → sync 실패로 인한 수량 손실 복원
    if (storedQty === 0 && inQty - outQty > 0) qty = Math.round((inQty - outQty) * 1000) / 1000;

    const weightedAvgCost = inAmt > 0 && inQty > 0 ? inAmt / inQty : unitPrice;

    const storedVat  = parseFloat(item.vat) || 0;
    const storedSv   = parseFloat(item.supplyValue) || 0;
    const vatRate    = storedSv > 0 && storedVat / storedSv < 0.05 ? 0 : 0.1;
    const supplyValue = inAmt > 0
      ? inAmt
      : inQty > 0 && unitPrice > 0
        ? Math.round(inQty * unitPrice)
        : qty > 0 && unitPrice > 0
          ? Math.round(qty * unitPrice)
          : 0;
    const vat        = Math.ceil(supplyValue * vatRate);
    const totalPrice = supplyValue + vat;

    const masterSalePrice = parseFloat(item.salePrice) || 0;
    const calcSalePrice   = outQty > 0 ? Math.round(outAmt / outQty) : 0;
    const salePrice       = masterSalePrice > 0 ? masterSalePrice : calcSalePrice;

    const costAmt = agg.costAmt > 0
      ? agg.costAmt
      : (outQty > 0 ? Math.round(weightedAvgCost * outQty) : 0);
    const profit  = outAmt - costAmt;

    const inDate = item.inDate || item.date || '';
    const year   = item.year  || (inDate ? String(inDate).slice(0, 4) : '');

    return {
      ...item,
      itemCode:             item.itemCode || agg.itemCode || '',
      vendor:               item.vendor || agg.vendor || '',
      quantity:             qty,          // ...item의 quantity(0)를 보정값으로 덮어씀
      color:                item.color || '',
      year,
      supplyValue:          supplyValue || '',
      vat:                  vat || '',
      totalPrice:           totalPrice || '',
      salePrice:            salePrice || '',
      inQty,
      outQty:               outQty || '',
      outTotalPrice:        outAmt  || '',
      purchaseCost:         costAmt || '',
      profit:               outAmt > 0 ? profit : '',
      profitMargin:         outAmt > 0 ? ((profit / outAmt) * 100).toFixed(1) + '%' : '',
      cogsMargin:           outAmt > 0 ? ((costAmt / outAmt) * 100).toFixed(1) + '%' : '',
      endingInventoryValue: qty > 0 ? Math.round(qty * (weightedAvgCost || unitPrice)) : '',
    };
  });
}

export function getVisibleFields(data, visibleColumns) {
  if (visibleColumns && Array.isArray(visibleColumns)) {
    const validCols = [...visibleColumns];
    if (!validCols.includes('itemName')) validCols.push('itemName');
    return ALL_FIELDS.filter(f => validCols.includes(f.key)).map(f => f.key);
  }
  // 기본: DEFAULT_VISIBLE 순서 그대로, 데이터 유무 체크 없이 항상 표시
  return ALL_FIELDS.filter(f => DEFAULT_VISIBLE.includes(f.key)).map(f => f.key);
}

export function applySmartSearch(data, safetyStock, keyword) {
  if (!keyword) return data;
  const kw = keyword.trim().toLowerCase();
  const matchers = [];

  kw.split(/\s+/).forEach(part => {
    const p = part.toLowerCase();
    const catM = p.match(/^분류:(.+)/);
    if (catM) { matchers.push(r => String(r.category || '').toLowerCase().includes(catM[1])); return; }
    const whM = p.match(/^창고:(.+)/);
    if (whM) { matchers.push(r => String(r.warehouse || '').toLowerCase().includes(whM[1])); return; }
    const geM = p.match(/^재고>=(\d+)/);
    if (geM) { const n = parseFloat(geM[1]); matchers.push(r => (parseFloat(r.quantity) || 0) >= n); return; }
    const leM = p.match(/^재고<=(\d+)/);
    if (leM) { const n = parseFloat(leM[1]); matchers.push(r => (parseFloat(r.quantity) || 0) <= n); return; }
    if (p === '부족')      { matchers.push(r => { const min = safetyStock[r.itemName]; return min != null && (parseFloat(r.quantity) || 0) <= min; }); return; }
    if (p === '품절')      { matchers.push(r => (parseFloat(r.quantity) || 0) === 0); return; }
    if (p === '거래처없음') { matchers.push(r => !String(r.vendor || '').trim()); return; }
    if (p === '위치없음')  { matchers.push(r => !String(r.warehouse || '').trim()); return; }
    matchers.push(r =>
      String(r.itemName || '').toLowerCase().includes(p) ||
      String(r.itemCode || '').toLowerCase().includes(p) ||
      String(r.vendor || '').toLowerCase().includes(p) ||
      String(r.category || '').toLowerCase().includes(p) ||
      String(r.warehouse || '').toLowerCase().includes(p)
    );
  });

  if (!matchers.length) return data;
  return data.filter(row => matchers.every(m => m(row)));
}

export function applyFilters(data, safetyStock, { keyword, category, warehouse, stock, itemCode, vendor, focus }) {
  let result = data;
  if (focus === 'low')               result = result.filter(r => { const min = safetyStock[r.itemName]; return min != null && (parseFloat(r.quantity) || 0) <= min; });
  else if (focus === 'zero')         result = result.filter(r => (parseFloat(r.quantity) || 0) === 0);
  else if (focus === 'missingVendor')    result = result.filter(r => !String(r.vendor || '').trim());
  else if (focus === 'missingWarehouse') result = result.filter(r => !String(r.warehouse || '').trim());

  if (category)  result = result.filter(r => String(r.category  || '') === category);
  if (warehouse) result = result.filter(r => String(r.warehouse || '') === warehouse);
  if (itemCode)  result = result.filter(r => String(r.itemCode  || '') === itemCode);
  if (vendor)    result = result.filter(r => String(r.vendor    || '') === vendor);
  if (stock === 'low') result = result.filter(r => { const min = safetyStock[r.itemName]; return min != null && (parseFloat(r.quantity) || 0) <= min; });
  if (keyword)   result = applySmartSearch(result, safetyStock, keyword);
  return result;
}

export function applySort(data, sort) {
  if (!sort || !sort.key || sort.key === 'default') return data;
  const { key, direction } = sort;
  return [...data].sort((a, b) => {
    if (key === '__lowStock') {
      return (b.__lowStock ? 1 : 0) - (a.__lowStock ? 1 : 0);
    }
    const aNum = toNum(a[key]), bNum = toNum(b[key]);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }
    const av = String(a[key] || ''), bv = String(b[key] || '');
    return direction === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko');
  });
}
