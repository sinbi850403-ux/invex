import { ALL_FIELDS, DEFAULT_VISIBLE, toNum } from './inventoryConfig.js';

export function computeData(rawData, transactions) {
  const txAgg = {};
  const normName = (v) =>
    String(v || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '');
  const normCode = (v) => {
    const raw = String(v || '').trim().replace(/\s+/g, '').toLowerCase();
    if (!raw) return '';
    const stripped = raw.replace(/^0+/, '');
    return stripped || '0';
  };
  const makeKey = (itemName, itemCode) => {
    const code = normCode(itemCode);
    if (code) return `code:${code}`;
    const name = normName(itemName);
    if (name) return `name:${name}`;
    return '';
  };
  const getOrCreateAgg = (key) => {
    if (!key) return null;
    if (!txAgg[key]) {
      txAgg[key] = {
        inQty: 0, inAmt: 0, outQty: 0, outAmt: 0, costAmt: 0,
        itemCode: '', vendor: '', category: '', color: '', spec: '', unit: '',
      };
    }
    return txAgg[key];
  };
  (transactions || []).forEach(tx => {
    const codeKey = makeKey('', tx.itemCode);
    const nameKey = makeKey(tx.itemName, '');
    const baseKey = codeKey || nameKey;
    if (!baseKey) return;
    const agg = getOrCreateAgg(baseKey);
    if (codeKey && !txAgg[codeKey]) txAgg[codeKey] = agg;
    if (nameKey && !txAgg[nameKey]) txAgg[nameKey] = agg;

    const qty = parseFloat(tx.quantity) || 0;
    if (!agg.itemCode && tx.itemCode) agg.itemCode = String(tx.itemCode).trim();
    if (!agg.vendor && tx.vendor) agg.vendor = String(tx.vendor).trim();
    if (!agg.category && tx.category) agg.category = String(tx.category).trim();
    if (!agg.color && tx.color) agg.color = String(tx.color).trim();
    if (!agg.spec && tx.spec) agg.spec = String(tx.spec).trim();
    if (!agg.unit && tx.unit) agg.unit = String(tx.unit).trim();
    if (tx.type === 'in') {
      agg.inQty += qty;
      const inSupply = parseFloat(tx.supplyValue);
      if (Number.isFinite(inSupply) && inSupply > 0) {
        agg.inAmt += Math.round(inSupply);
      } else {
        agg.inAmt += Math.round((parseFloat(tx.unitPrice) || 0) * qty);
      }
    } else {
      agg.outQty += qty;
      const sp = parseFloat(tx.actualSellingPrice || tx.sellingPrice || tx.salePrice) || 0;
      const cp = parseFloat(tx.unitPrice) || 0;
      agg.outAmt  += Math.round(sp * qty);
      const outSupply = parseFloat(tx.supplyValue);
      if (Number.isFinite(outSupply) && outSupply > 0) {
        agg.costAmt += Math.round(outSupply);
      } else {
        agg.costAmt += Math.round(cp * qty);
      }
    }
  });

  return (rawData || []).map(item => {
    const byCode = txAgg[makeKey('', item.itemCode)] || null;
    const byName = txAgg[makeKey(item.itemName, '')] || null;
    const agg        = byCode || byName || {};
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
    const basisCost = weightedAvgCost > 0 ? weightedAvgCost : unitPrice;
    const supplyValue = qty > 0 && basisCost > 0
      ? Math.round(qty * basisCost)
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

    // 매입원가: 아이템 마스터 unitPrice > 입고 트랜잭션 가중평균 순으로 폴백
    // 아이템 마스터에 단가가 없어도 입고 시 입력한 단가로부터 자동 계산
    const displayUnitPrice = unitPrice > 0
      ? unitPrice
      : (weightedAvgCost > 0 ? Math.round(weightedAvgCost) : '');

    return {
      ...item,
      itemCode:             item.itemCode || agg.itemCode || '',
      vendor:               item.vendor || agg.vendor || '',
      category:             item.category || agg.category || '',
      color:                item.color || agg.color || '',
      spec:                 item.spec || agg.spec || '',
      unit:                 item.unit || agg.unit || '',
      quantity:             qty,          // ...item의 quantity(0)를 보정값으로 덮어씀
      year,
      unitPrice:            displayUnitPrice,
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
  const fieldMeta = ALL_FIELDS.find(f => f.key === key);
  const isNumericField = !!fieldMeta?.numeric;

  const toMaybeNumber = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const s = String(v).replace(/,/g, '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  return [...data].sort((a, b) => {
    if (key === '__lowStock') {
      return (b.__lowStock ? 1 : 0) - (a.__lowStock ? 1 : 0);
    }

    if (isNumericField) {
      const aNum = toMaybeNumber(a[key]);
      const bNum = toMaybeNumber(b[key]);
      if (aNum == null && bNum == null) return 0;
      if (aNum == null) return 1;
      if (bNum == null) return -1;
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    const av = String(a[key] ?? '').trim();
    const bv = String(b[key] ?? '').trim();
    if (!av && !bv) return 0;
    if (!av) return 1;
    if (!bv) return -1;

    // 상품코드는 자연 정렬(0012, 010, 100 등) 적용
    const compare = key === 'itemCode'
      ? av.localeCompare(bv, 'ko', { numeric: true, sensitivity: 'base' })
      : av.localeCompare(bv, 'ko', { sensitivity: 'base' });
    return direction === 'asc' ? compare : -compare;
  });
}
