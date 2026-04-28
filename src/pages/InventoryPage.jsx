/**
 * InventoryPage.jsx - 재고 현황 (React 네이티브 변환)
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';
import { generateInventoryPDF } from '../pdf-generator.js';
import { canAction } from '../auth.js';
import {
  addItem, updateItem, deleteItem, restoreItem,
  setSafetyStock, rebuildInventoryFromTransactions, recalcItemAmounts,
  getState as getRawState,
} from '../store.js';
import { enableColumnResize } from '../ux-toolkit.js';

// ── 상수 ────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20;

const ALL_FIELDS = [
  { key: 'category',             label: '자산',         numeric: false },
  { key: 'inDate',               label: '입고일자',     numeric: false },
  { key: 'itemCode',             label: '상품코드',     numeric: false },
  { key: 'vendor',               label: '거래처',       numeric: false },
  { key: 'itemName',             label: '품명',         numeric: false },
  { key: 'spec',                 label: '규격',         numeric: false },
  { key: 'unit',                 label: '단위',         numeric: false },
  { key: 'inQty',                label: '입고수량',     numeric: true  },
  { key: 'unitPrice',            label: '원가',         numeric: true  },
  { key: 'supplyValue',          label: '매입원가',     numeric: true  },
  { key: 'vat',                  label: '부가세',       numeric: true  },
  { key: 'totalPrice',           label: '합계금액',     numeric: true  },
  { key: 'salePrice',            label: '출고단가',     numeric: true  },
  { key: 'outQty',               label: '출고수량',     numeric: true  },
  { key: 'outTotalPrice',        label: '출고합계',     numeric: true  },
  { key: 'purchaseCost',         label: '매입원가',     numeric: true  },
  { key: 'profit',               label: '이익액',       numeric: true  },
  { key: 'profitMargin',         label: '이익률',       numeric: false },
  { key: 'cogsMargin',           label: '원가율',       numeric: false },
  { key: 'quantity',             label: '기말재고수량', numeric: true  },
  { key: 'endingInventoryValue', label: '기말재고액',   numeric: true  },
  { key: 'warehouse',            label: '창고/위치',    numeric: false },
  { key: 'expiryDate',           label: '유통기한',     numeric: false },
  { key: 'lotNumber',            label: 'LOT번호',      numeric: false },
  { key: 'note',                 label: '비고',         numeric: false },
];

const ALWAYS_VISIBLE = [
  'category','itemCode','itemName','spec','unit',
  'outTotalPrice','supplyValue','profit','profitMargin',
  'cogsMargin','quantity','endingInventoryValue',
];

const SORT_OPTIONS = [
  { value: 'default',          label: '정렬 없음 (원본 순서)' },
  { value: 'itemName:asc',     label: '품목명 오름차순' },
  { value: 'quantity:desc',    label: '수량 많은 순' },
  { value: 'quantity:asc',     label: '수량 적은 순' },
  { value: 'totalPrice:desc',  label: '합계금액 높은 순' },
  { value: 'vendor:asc',       label: '거래처 가나다순' },
];

const FOCUS_CHIPS = [
  { value: 'all',              label: '전체 보기' },
  { value: 'low',              label: '부족 품목' },
  { value: 'zero',             label: '수량 0' },
  { value: 'missingVendor',    label: '거래처 미입력' },
  { value: 'missingWarehouse', label: '위치 미입력' },
];

const MONEY_KEYS = new Set([
  'unitPrice','salePrice','supplyValue','vat','totalPrice',
  'outTotalPrice','purchaseCost','profit','endingInventoryValue',
]);
const NUM_KEYS = new Set(['quantity','inQty','outQty']);

// ── 헬퍼 ────────────────────────────────────────────────────────────────────
const toNum = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const fmt   = v => { const n = Math.round(toNum(v)); return n ? '₩' + n.toLocaleString('ko-KR') : '-'; };

const PERCENT_KEYS = new Set(['profitMargin', 'cogsMargin']);

function formatCell(key, value) {
  const isNumericField = MONEY_KEYS.has(key) || NUM_KEYS.has(key) || PERCENT_KEYS.has(key);
  if (value === '' || value == null) return isNumericField ? '-' : '';
  if (MONEY_KEYS.has(key)) {
    const n = toNum(value);
    if (!isNaN(n)) {
      const color = '';
      const text = '₩' + Math.round(n).toLocaleString('ko-KR');
      return color ? <span style={{ color }}>{text}</span> : text;
    }
  }
  if (NUM_KEYS.has(key)) {
    const n = toNum(value);
    if (!isNaN(n)) return Math.round(n).toLocaleString('ko-KR');
  }
  return String(value);
}

function computeData(rawData, transactions) {
  const txAgg = {};
  (transactions || []).forEach(tx => {
    const k = tx.itemName;
    if (!k) return;
    if (!txAgg[k]) txAgg[k] = { inQty: 0, inAmt: 0, outQty: 0, outAmt: 0, costAmt: 0 };
    const qty = parseFloat(tx.quantity) || 0;
    if (tx.type === 'in') {
      txAgg[k].inQty += qty;
      txAgg[k].inAmt += Math.round((parseFloat(tx.unitPrice) || 0) * qty); // 실제 입고금액 누계
    } else {
      txAgg[k].outQty += qty;
      const sp = parseFloat(tx.actualSellingPrice || tx.sellingPrice) || 0;
      const cp = parseFloat(tx.unitPrice) || 0;
      txAgg[k].outAmt  += Math.round(sp * qty);
      txAgg[k].costAmt += Math.round(cp * qty); // 실제 출고원가 누계
    }
  });
  return (rawData || []).map(item => {
    const agg = txAgg[item.itemName] || {};
    const inQty     = agg.inQty  || 0;
    const inAmt     = agg.inAmt  || 0; // 실제 입고금액 합계 (tx.unitPrice 기반)
    const outQty    = agg.outQty || 0;
    const outAmt    = agg.outAmt || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const qty       = parseFloat(item.quantity)  || 0;

    // 가중평균 단가: 실제 거래 기반 우선, 없으면 품목 마스터 단가
    const weightedAvgCost = inAmt > 0 && inQty > 0 ? inAmt / inQty : unitPrice;

    // 공급가액: 실제 거래 inAmt 우선 → 거래기록 없으면 현재재고 × 단가 (stale storedSv 사용 안 함)
    const storedVat = parseFloat(item.vat) || 0;
    const storedSv  = parseFloat(item.supplyValue) || 0;
    const vatRate   = storedSv > 0 && storedVat / storedSv < 0.05 ? 0 : 0.1;
    const supplyValue = inAmt > 0
      ? inAmt
      : inQty > 0 && unitPrice > 0
        ? Math.round(inQty * unitPrice)
        : qty > 0 && unitPrice > 0
          ? Math.round(qty * unitPrice)  // 거래 없는 품목: 현재수량 × 단가
          : 0;
    const vat        = Math.ceil(supplyValue * vatRate);
    const totalPrice = supplyValue + vat;

    const masterSalePrice = parseFloat(item.salePrice) || 0;
    const calcSalePrice   = outQty > 0 ? Math.round(outAmt / outQty) : 0;
    const salePrice       = masterSalePrice > 0 ? masterSalePrice : calcSalePrice;

    // 매입원가: 실제 출고 거래 costAmt 우선, 없으면 가중평균 단가 × 출고수량
    const costAmt = agg.costAmt > 0
      ? agg.costAmt
      : (outQty > 0 ? Math.round(weightedAvgCost * outQty) : 0);
    const profit  = outAmt - costAmt;

    return {
      ...item,
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

function getVisibleFields(data, visibleColumns) {
  const hasData = new Set(
    ALL_FIELDS.map(f => f.key).filter(key =>
      (data || []).some(row => row[key] !== '' && row[key] != null)
    )
  );
  if (visibleColumns && Array.isArray(visibleColumns)) {
    const validCols = [...visibleColumns];
    if (!validCols.includes('category')) validCols.push('category');
    return ALL_FIELDS.filter(f => validCols.includes(f.key)).map(f => f.key);
  }
  return ALL_FIELDS.filter(f => ALWAYS_VISIBLE.includes(f.key) && hasData.has(f.key)).map(f => f.key);
}

function applySmartSearch(data, safetyStock, keyword) {
  if (!keyword) return data;
  const kw = keyword.trim().toLowerCase();

  // 구조화 쿼리 파싱
  const matchers = [];

  const tokenize = (raw) => {
    const parts = raw.split(/\s+/);
    parts.forEach(part => {
      const p = part.toLowerCase();
      // 분류:xxx
      const catM = p.match(/^분류:(.+)/);
      if (catM) { matchers.push(r => String(r.category || '').toLowerCase().includes(catM[1])); return; }
      // 창고:xxx
      const whM = p.match(/^창고:(.+)/);
      if (whM) { matchers.push(r => String(r.warehouse || '').toLowerCase().includes(whM[1])); return; }
      // 재고>=N
      const geM = p.match(/^재고>=(\d+)/);
      if (geM) { const n = parseFloat(geM[1]); matchers.push(r => (parseFloat(r.quantity) || 0) >= n); return; }
      // 재고<=N
      const leM = p.match(/^재고<=(\d+)/);
      if (leM) { const n = parseFloat(leM[1]); matchers.push(r => (parseFloat(r.quantity) || 0) <= n); return; }
      // 부족
      if (p === '부족') { matchers.push(r => { const min = safetyStock[r.itemName]; return min != null && (parseFloat(r.quantity) || 0) <= min; }); return; }
      // 품절
      if (p === '품절') { matchers.push(r => (parseFloat(r.quantity) || 0) === 0); return; }
      // 거래처없음
      if (p === '거래처없음') { matchers.push(r => !String(r.vendor || '').trim()); return; }
      // 위치없음
      if (p === '위치없음') { matchers.push(r => !String(r.warehouse || '').trim()); return; }
      // 일반 키워드
      matchers.push(r =>
        String(r.itemName || '').toLowerCase().includes(p) ||
        String(r.itemCode || '').toLowerCase().includes(p) ||
        String(r.vendor || '').toLowerCase().includes(p) ||
        String(r.category || '').toLowerCase().includes(p) ||
        String(r.warehouse || '').toLowerCase().includes(p)
      );
    });
  };

  tokenize(kw);
  if (!matchers.length) return data;
  return data.filter(row => matchers.every(m => m(row)));
}

function applyFilters(data, safetyStock, { keyword, category, warehouse, stock, itemCode, vendor, focus }) {
  let result = data;
  if (focus === 'low')              result = result.filter(r => { const min = safetyStock[r.itemName]; return min != null && (parseFloat(r.quantity) || 0) <= min; });
  else if (focus === 'zero')        result = result.filter(r => (parseFloat(r.quantity) || 0) === 0);
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

function applySort(data, sort) {
  if (!sort || !sort.key || sort.key === 'default') return data;
  const { key, direction } = sort;
  return [...data].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === '__lowStock') {
      const aLow = a.__lowStock ? 1 : 0;
      const bLow = b.__lowStock ? 1 : 0;
      return bLow - aLow;
    }
    const aNum = toNum(av), bNum = toNum(bv);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }
    av = String(av || ''); bv = String(bv || '');
    return direction === 'asc' ? av.localeCompare(bv, 'ko') : bv.localeCompare(av, 'ko');
  });
}

// ── 모달 컴포넌트 ────────────────────────────────────────────────────────────
function ItemModal({ item, editIdx, onClose, onSaved }) {
  const isEdit = editIdx != null;
  const [state] = useStore();
  const safetyStock = state.safetyStock || {};
  const vendors    = (state.vendorMaster || []).filter(v => v.type === 'supplier' || v.type === 'both');
  const existingCats   = [...new Set((state.mappedData || []).map(d => d.category).filter(Boolean))].sort();
  const existingUnits  = [...new Set((state.mappedData || []).map(d => d.unit).filter(Boolean))].sort();
  const allUnits       = [...new Set([...existingUnits, 'EA', 'BOX', 'KG', 'L', 'M', 'SET'])];

  const [form, setForm] = useState({
    itemName:    item?.itemName    ?? '',
    itemCode:    item?.itemCode    ?? '',
    spec:        item?.spec        ?? '',
    category:    item?.category    ?? '',
    quantity:    String(item?.quantity    ?? ''),
    unit:        item?.unit        ?? '',
    unitPrice:   String(item?.unitPrice   ?? ''),
    salePrice:   String(item?.salePrice   ?? ''),
    vendor:      item?.vendor      ?? '',
    warehouse:       item?.warehouse   ?? '',
    note:            item?.note        ?? '',
    lockedUntil:     item?.lockedUntil ?? '',
    safetyStockMin:  String(item?.itemName ? (safetyStock[item.itemName] ?? '') : ''),
  });
  const [errors, setErrors] = useState({});

  const qty      = parseFloat(form.quantity)  || 0;
  const up       = parseFloat(form.unitPrice) || 0;
  const sp       = parseFloat(form.salePrice) || 0;
  const supply   = qty * up;
  const vat      = Math.ceil(supply * 0.1);
  const total    = supply + vat;
  const margin   = sp > 0 ? sp - up : null;

  const statusItems = [
    { done: !!form.itemName.trim(),  text: '품목명이 입력되었습니다.' },
    { done: form.quantity !== '',    text: '수량이 입력되었습니다.' },
    { done: up > 0,                  text: '원가가 입력되었습니다.' },
    { done: sp > 0,                  text: '판매가가 입력되었습니다.' },
    { done: !!form.vendor.trim(),    text: '거래처가 연결되었습니다.' },
    { done: !!form.warehouse.trim(), text: '창고/위치가 입력되었습니다.' },
  ];
  const quality = statusItems.filter(s => s.done).length;

  function genItemCode() {
    const items = getRawState().mappedData || [];
    const nums  = items.map(d => parseInt((d.itemCode || '').replace(/\D/g, '')) || 0);
    return 'I' + String(nums.length ? Math.max(...nums) + 1 : 1).padStart(5, '0');
  }

  function handleSave() {
    const errs = {};
    const name = form.itemName.trim();
    if (!name) errs.itemName = '품목명은 필수입니다.';
    else if (!isEdit) {
      const existing = (getRawState().mappedData || []).map(d => d.itemName?.trim().toLowerCase());
      if (existing.includes(name.toLowerCase())) errs.itemName = `"${name}"은(는) 이미 등록된 품목명입니다.`;
    }
    if (form.quantity !== '' && isNaN(parseFloat(form.quantity))) errs.quantity = '숫자만 입력해 주세요.';
    if (form.unitPrice !== '' && (isNaN(up) || up < 0)) errs.unitPrice = '0 이상의 숫자를 입력해 주세요.';
    if (form.salePrice !== '' && (isNaN(sp) || sp < 0)) errs.salePrice = '0 이상의 숫자를 입력해 주세요.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const newItem = {
      itemName:    name,
      itemCode:    form.itemCode.trim(),
      spec:        form.spec.trim(),
      category:    form.category.trim(),
      vendor:      form.vendor,
      quantity:    parseFloat(form.quantity) || 0,
      unit:        form.unit.trim(),
      unitPrice:   up,
      salePrice:   sp,
      warehouse:   form.warehouse.trim(),
      note:        form.note.trim(),
      lockedUntil: form.lockedUntil || null,
    };

    const prevItem  = isEdit ? (getRawState().mappedData[editIdx] || {}) : {};
    const prevSv    = parseFloat(prevItem.supplyValue) || 0;
    const prevVat   = parseFloat(prevItem.vat) || 0;
    const vatRate   = (isEdit && prevSv > 0 && prevVat / prevSv < 0.05) ? 0 : 0.1;
    newItem.supplyValue = newItem.quantity * newItem.unitPrice;
    newItem.vat         = Math.ceil(newItem.supplyValue * vatRate);
    newItem.totalPrice  = newItem.supplyValue + newItem.vat;

    if (isEdit) {
      updateItem(editIdx, newItem);
      showToast(`"${name}" 품목을 수정했습니다.`, 'success');
    } else {
      addItem(newItem);
      showToast(`"${name}" 품목을 추가했습니다.`, 'success');
    }
    const ssv = parseFloat(form.safetyStockMin);
    if (!isNaN(ssv) && ssv >= 0) setSafetyStock(name, ssv);
    onSaved();
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const f = (field) => ({ value: form[field], onChange: e => setForm(p => ({ ...p, [field]: e.target.value })) });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 980 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? '품목 수정' : '새 품목 추가'}</h3>
          <button className="modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="form-shell">
            <div className="form-shell-main">
              <datalist id="dl-category">{existingCats.map(v => <option key={v} value={v} />)}</datalist>
              <datalist id="dl-unit">{allUnits.map(v => <option key={v} value={v} />)}</datalist>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">품목명 <span className="required">*</span></label>
                  <input className={`form-input${errors.itemName ? ' is-error' : ''}`} {...f('itemName')} placeholder="예: A4용지, 복사용지 80g" />
                  {errors.itemName && <div className="field-error">{errors.itemName}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">품목코드</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-input" {...f('itemCode')} placeholder="예: I00001" style={{ flex: 1 }} />
                    {!isEdit && <button type="button" className="btn btn-outline btn-sm" onClick={() => setForm(p => ({ ...p, itemCode: genItemCode() }))}>자동</button>}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">규격/스펙</label>
                  <input className="form-input" {...f('spec')} placeholder="예: 80g/m², A4, 500매" />
                </div>
                <div className="form-group">
                  <label className="form-label">분류(카테고리)</label>
                  <input className="form-input" {...f('category')} list="dl-category" placeholder="예: 사무용품" autoComplete="off" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">수량 <span className="required">*</span></label>
                  <input className={`form-input${errors.quantity ? ' is-error' : ''}`} type="number" min="0" {...f('quantity')} placeholder="0" />
                  {errors.quantity && <div className="field-error">{errors.quantity}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">단위</label>
                  <input className="form-input" {...f('unit')} list="dl-unit" placeholder="EA, BOX, KG ..." autoComplete="off" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">매입가(원가)</label>
                  <input className={`form-input${errors.unitPrice ? ' is-error' : ''}`} type="number" min="0" {...f('unitPrice')} placeholder="0" />
                  {errors.unitPrice && <div className="field-error">{errors.unitPrice}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">판매단가</label>
                  <input className={`form-input${errors.salePrice ? ' is-error' : ''}`} type="number" min="0" {...f('salePrice')} placeholder="미입력 시 손익 정확도 저하" />
                  {sp > 0 && up > 0 && sp < up && <div className="form-warn-msg">판매가가 원가보다 낮습니다.</div>}
                </div>
              </div>

              <details className="smart-details" open>
                <summary>추가 정보 더 보기</summary>
                <div className="smart-details-body">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">주공급처</label>
                      <select className="form-select" value={form.vendor} onChange={e => setForm(p => ({ ...p, vendor: e.target.value }))}>
                        <option value="">-- 선택 또는 직접 입력 --</option>
                        {vendors.map(v => <option key={v.id || v.name} value={v.name}>{v.name}{v.code ? ` (${v.code})` : ''}</option>)}
                        {form.vendor && !vendors.find(v => v.name === form.vendor) && <option value={form.vendor}>{form.vendor}</option>}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">창고/위치</label>
                      <input className="form-input" {...f('warehouse')} placeholder="예: 본사 1층 A-03" />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">비고</label>
                      <input className="form-input" {...f('note')} placeholder="메모" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">품목 잠금 해제일</label>
                      <input className="form-input" type="date" {...f('lockedUntil')} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">안전재고 기준 수량</label>
                      <input className="form-input" type="number" min="0" {...f('safetyStockMin')} placeholder="이 이하면 경고 표시" />
                    </div>
                    <div className="form-group" />
                  </div>
                </div>
              </details>
            </div>

            <div className="form-shell-side">
              <div className="form-card">
                <div className="form-card-title">입력 진행 상태</div>
                <div className="form-card-desc">필수값만 채워도 저장됩니다.</div>
                <div className="form-status-list">
                  {statusItems.map((s, i) => (
                    <div key={i} className={`form-status-item${s.done ? ' is-complete' : ''}`}>{s.text}</div>
                  ))}
                </div>
              </div>
              <div className="smart-summary-grid">
                <div className="smart-summary-item">
                  <div className="smart-summary-label">현재 재고 가치</div>
                  <div className="smart-summary-value">{total > 0 ? '₩' + Math.round(total).toLocaleString('ko-KR') : '₩0'}</div>
                  <div className="smart-summary-note">
                    {total > 0 ? `공급가액 ${fmt(supply)} / 부가세 ${fmt(vat)} / 합계 ${fmt(total)}` : '수량과 원가를 입력하면 자동 계산됩니다.'}
                  </div>
                </div>
                <div className="smart-summary-item">
                  <div className="smart-summary-label">예상 판매 기준 차익</div>
                  <div className="smart-summary-value">{margin == null ? '미입력' : `${margin >= 0 ? '+' : '-'}₩${Math.abs(Math.round(margin)).toLocaleString('ko-KR')}`}</div>
                  <div className="smart-summary-note">{margin == null ? '판매가를 넣으면 원가 대비 차익을 바로 볼 수 있습니다.' : `개당 차익 ${margin >= 0 ? '+' : '-'}₩${Math.abs(Math.round(margin)).toLocaleString('ko-KR')}`}</div>
                </div>
                <div className="smart-summary-item">
                  <div className="smart-summary-label">데이터 품질</div>
                  <div className="smart-summary-value">{quality}/6 단계 완료</div>
                  <div className="smart-summary-note">{quality >= 5 ? '보고와 발주에 필요한 정보가 잘 채워져 있습니다.' : '거래처, 위치, 판매가를 채우면 분석 품질이 올라갑니다.'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>{isEdit ? '수정 저장' : '품목 저장'}</button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [state, setState] = useStore();

  const canEdit   = canAction('item:edit');
  const canDelete = canAction('item:delete');
  const canCreate = canAction('item:create');
  const canBulk   = canAction('item:bulk');

  const tableRef = useRef(null);

  // 저장된 뷰 설정
  const savedPrefs = state.inventoryViewPrefs || {};
  const [filter, setFilterRaw] = useState({
    keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all',
    ...((savedPrefs.filter) || {}),
  });
  const [sort, setSort]         = useState(savedPrefs.sort || { key: '', direction: '' });
  const [page, setPage]         = useState(1);
  const [modal, setModal]       = useState(null); // null | { type:'add' } | { type:'edit', idx }
  const [selected, setSelected] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [colPanel, setColPanel]       = useState(false);
  const [deleting, setDeleting]       = useState(null); // idx or 'bulk'

  // 필터 변경 시 1페이지로 리셋
  const setFilter = useCallback(patch => {
    setFilterRaw(prev => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  // 외부 드릴다운(DashboardPage 등)에서 검색 필터 주입
  useEffect(() => {
    const kw = sessionStorage.getItem('invex:inventory-search');
    if (kw) {
      sessionStorage.removeItem('invex:inventory-search');
      setFilter({ keyword: kw });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 뷰 설정 자동저장 (debounce)
  const prefsTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(prefsTimerRef.current);
    prefsTimerRef.current = setTimeout(() => {
      setState({ inventoryViewPrefs: { filter, sort } });
    }, 300);
    return () => clearTimeout(prefsTimerRef.current);
  }, [filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // 트랜잭션 기반 재고 동기화 (고아 품목 감지)
  useEffect(() => {
    const st = getRawState();
    const txs    = st.transactions || [];
    const mapped = st.mappedData   || [];
    const keys   = new Set(mapped.map(d => (d.itemCode ? String(d.itemCode) : String(d.itemName || '')).trim()));
    const hasOrphaned = txs.some(tx => {
      const k = (tx.itemCode ? String(tx.itemCode) : String(tx.itemName || '')).trim();
      return k && !keys.has(k);
    });
    if (hasOrphaned) rebuildInventoryFromTransactions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rawData     = state.mappedData   || [];
  const transactions = state.transactions || [];
  const safetyStock  = state.safetyStock  || {};
  const visibleCols  = state.visibleColumns;

  // 계산 데이터
  const data = useMemo(() => computeData(rawData, transactions), [rawData, transactions]);

  // 필터링 + 정렬
  const filtered = useMemo(() => applyFilters(data, safetyStock, filter), [data, safetyStock, filter]);
  const sorted   = useMemo(() => applySort(filtered, sort), [filtered, sort]);

  // 페이지네이션
  const totalPages   = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage     = Math.min(page, totalPages);
  const pageItems    = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 컬럼 넓이 수동 조절 (pageItems 선언 이후에 위치해야 TDZ 오류 없음)
  useEffect(() => {
    if (tableRef.current) enableColumnResize(tableRef.current);
  }, [pageItems]);

  // 표시 컬럼
  const activeFields = useMemo(() => getVisibleFields(data, visibleCols), [data, visibleCols]);
  const allAvailableFields = useMemo(
    () => ALL_FIELDS.filter(f => data.some(row => row[f.key] !== '' && row[f.key] != null)),
    [data]
  );

  // 통계
  const stats = useMemo(() => ({
    total:     data.length,
    qty:       Math.round(data.reduce((s, r) => s + (toNum(r.quantity)), 0)).toLocaleString('ko-KR'),
    supply:    fmt(data.reduce((s, r) => s + toNum(r.supplyValue), 0)),
    vat:       fmt(data.reduce((s, r) => s + toNum(r.vat), 0)),
    price:     fmt(data.reduce((s, r) => s + toNum(r.totalPrice), 0)),
    warnings:  data.filter(r => { const min = safetyStock[r.itemName]; return min != null && toNum(r.quantity) <= min; }).length,
  }), [data, safetyStock]);

  // 옵션 목록
  const categories  = useMemo(() => [...new Set(data.map(r => r.category).filter(Boolean))].sort(), [data]);
  const warehouses  = useMemo(() => [...new Set(data.map(r => r.warehouse).filter(Boolean))].sort(), [data]);
  const itemCodes   = useMemo(() => [...new Set(data.map(r => r.itemCode).filter(Boolean))].sort(), [data]);
  const vendors     = useMemo(() => [...new Set(data.map(r => r.vendor).filter(Boolean))].sort(), [data]);

  function toggleSort(key) {
    setSort(prev => {
      if (prev.key === key) return prev.direction === 'asc' ? { key, direction: 'desc' } : { key: '', direction: '' };
      return { key, direction: 'asc' };
    });
  }

  function sortIndicator(key) {
    if (sort.key !== key) return ' ↕';
    return sort.direction === 'asc' ? ' ↑' : ' ↓';
  }

  function toggleSelect(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIdxs = pageItems.map((_, i) => (safePage - 1) * PAGE_SIZE + i);
    const allSelected = pageIdxs.every(i => selected.has(i));
    setSelected(prev => {
      const next = new Set(prev);
      pageIdxs.forEach(i => allSelected ? next.delete(i) : next.add(i));
      return next;
    });
  }

  function handleDelete(idx) {
    deleteItem(idx);
    showToast('품목이 삭제되었습니다.', 'success');
    setDeleting(null);
    setSelected(prev => { const next = new Set(prev); next.delete(idx); return next; });
  }

  function handleBulkDelete() {
    const idxs = [...selected].sort((a, b) => b - a);
    idxs.forEach(i => deleteItem(i));
    showToast(`${idxs.length}개 품목이 삭제되었습니다.`, 'success');
    setSelected(new Set());
    setDeleting(null);
  }

  function handleExportExcel() {
    const rows = (filter.keyword || filter.category || filter.focus !== 'all' ? filtered : data).map(row => {
      const r = {};
      ALL_FIELDS.forEach(f => { r[f.label] = row[f.key] ?? ''; });
      return r;
    });
    downloadExcel(rows, '재고현황');
    showToast('엑셀로 내보냈습니다.', 'success');
  }

  async function handleExportPDF() {
    try {
      await generateInventoryPDF(filtered.length ? filtered : data);
      showToast('PDF를 생성했습니다.', 'success');
    } catch (e) {
      showToast('PDF 생성 실패: ' + e.message, 'error');
    }
  }

  function applyColumnSettings(cols) {
    setState({ visibleColumns: cols });
    setColPanel(false);
    showToast('표시 항목이 변경되었습니다.', 'success');
  }

  // 빈 상태
  if (data.length === 0) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title"> 재고 현황</h1>
            <div className="page-desc">품목별 재고 수량과 금액을 관리합니다.</div>
          </div>
          <div className="page-actions">
            {canCreate && <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>+ 품목 추가</button>}
          </div>
        </div>
        <div className="card">
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">아직 등록된 품목이 없습니다</div>
            <div className="sub">엑셀 파일을 업로드하거나 품목을 직접 등록해 주세요.</div>
          </div>
        </div>
        {modal && (
          <ItemModal item={null} editIdx={null} onClose={() => setModal(null)} onSaved={() => setModal(null)} />
        )}
      </div>
    );
  }

  const pageIdxs = pageItems.map((_, i) => (safePage - 1) * PAGE_SIZE + i);
  const allPageSelected = pageIdxs.length > 0 && pageIdxs.every(i => selected.has(i));

  return (
    <div>
      {/* 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title"> 재고 현황</h1>
          <div className="page-desc">{state.fileName ? ` ${state.fileName} ` : ''}총 {data.length}개 품목</div>
        </div>
        <div className="page-actions">
          {canBulk && (
            <button className="btn btn-outline" onClick={() => { rebuildInventoryFromTransactions(); showToast('재고 재계산 완료', 'success'); }}>
               재고 재계산
            </button>
          )}
          <button className="btn btn-outline" onClick={handleExportExcel}> 엑셀</button>
          <button className="btn btn-outline" onClick={handleExportPDF}> PDF</button>
          {canCreate && <button className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>+ 품목 추가</button>}
        </div>
      </div>

      {/* KPI 통계 */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card"><div className="stat-label">전체 품목</div><div className="stat-value text-accent">{stats.total}</div></div>
        <div className="stat-card"><div className="stat-label">총 수량</div><div className="stat-value text-accent">{stats.qty}</div></div>
        <div className="stat-card"><div className="stat-label">공급가액 합계</div><div className="stat-value text-accent">{stats.supply}</div></div>
        <div className="stat-card"><div className="stat-label">부가세 합계</div><div className="stat-value text-accent">{stats.vat}</div></div>
        <div className="stat-card"><div className="stat-label">합계금액</div><div className="stat-value text-success">{stats.price}</div></div>
        <div className="stat-card" style={stats.warnings > 0 ? { cursor: 'pointer' } : {}} onClick={stats.warnings > 0 ? () => navigateTo('orders') : undefined} title={stats.warnings > 0 ? '발주 관리로 이동' : ''}>
          <div className="stat-label">재고 부족 경고</div>
          <div className={`stat-value${stats.warnings > 0 ? ' text-danger' : ''}`}>{stats.warnings > 0 ? `${stats.warnings}건 ↗` : '없음'}</div>
          {stats.warnings > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>클릭 → 발주 관리</div>}
        </div>
      </div>

      {/* 필터 영역 */}
      <div className="card" style={{ marginBottom: 12 }}>
        {/* 빠른 필터 칩 */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {FOCUS_CHIPS.map(chip => (
            <button
              key={chip.value}
              className={`btn btn-sm ${filter.focus === chip.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter({ focus: chip.value })}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* 검색 + 툴바 */}
        <div className="toolbar">
          <input
            type="text"
            className="search-input"
            placeholder="스마트 검색: 품목명, 분류:식품, 창고:본사, 재고>=10, 부족, 품절"
            title={"스마트 검색 문법\n품목명 자유 입력\n분류:식품  — 카테고리 일치\n창고:본사  — 창고 일치\n거래처:ABC — 거래처 일치\n재고>=10  — 수량 이상\n재고<=5   — 수량 이하\n부족       — 안전재고 미달\n품절       — 수량 = 0\n거래처없음 — 거래처 미입력\n창고없음   — 창고 미입력\n여러 조건은 공백으로 구분"}
            value={filter.keyword}
            onChange={e => setFilter({ keyword: e.target.value })}
          />
          <button className="filter-toggle-btn" onClick={() => setShowFilters(p => !p)}>
             상세 필터
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setFilter({ keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' })}>
            초기화
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setColPanel(p => !p)}>표시 항목 설정</button>
            {colPanel && (
              <ColumnPanel
                fields={allAvailableFields}
                activeFields={activeFields}
                onApply={applyColumnSettings}
                onClose={() => setColPanel(false)}
              />
            )}
          </div>
        </div>

        {/* 빠른 검색 버튼 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>빠른 검색</span>
          {['부족', '품절', '거래처없음', '위치없음', '재고>=10'].map(q => (
            <button key={q} className="btn btn-ghost btn-sm" onClick={() => setFilter({ keyword: q })}>{q}</button>
          ))}
        </div>

        {/* 상세 필터 */}
        {showFilters && (
          <div className="filter-detail-panel" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            <select className="filter-select" value={filter.itemCode} onChange={e => setFilter({ itemCode: e.target.value })}>
              <option value="">전체 품목코드</option>
              {itemCodes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.vendor} onChange={e => setFilter({ vendor: e.target.value })}>
              <option value="">전체 거래처</option>
              {vendors.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.category} onChange={e => setFilter({ category: e.target.value })}>
              <option value="">전체 분류</option>
              {categories.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.warehouse} onChange={e => setFilter({ warehouse: e.target.value })}>
              <option value="">전체 창고</option>
              {warehouses.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="filter-select" value={filter.stock} onChange={e => setFilter({ stock: e.target.value })}>
              <option value="">전체 재고</option>
              <option value="low">부족 항목만</option>
            </select>
            <select
              className="filter-select"
              value={sort.key && sort.direction ? `${sort.key}:${sort.direction}` : 'default'}
              onChange={e => {
                const v = e.target.value;
                if (v === 'default') setSort({ key: '', direction: '' });
                else { const [k, d] = v.split(':'); setSort({ key: k, direction: d }); }
              }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}

        {filtered.length !== data.length && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            {data.length}개 중 {filtered.length}개 표시
          </div>
        )}
      </div>

      {/* 일괄 작업 바 */}
      {selected.size > 0 && (
        <div className="card inventory-bulk-bar" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="inventory-bulk-count">선택 {selected.size}개</span>
          <button className="btn btn-outline btn-sm" onClick={() => {
            const rows = [...selected].map(i => {
              const r = {}; ALL_FIELDS.forEach(f => { r[f.label] = data[i]?.[f.key] ?? ''; }); return r;
            });
            downloadExcel(rows, '재고현황_선택');
          }}>선택 엑셀 내보내기</button>
          {canDelete && (
            <button className="btn btn-danger btn-sm" onClick={() => setDeleting('bulk')}>선택 삭제</button>
          )}
        </div>
      )}

      {/* 테이블 */}
      <div className="card card-flush">
        <div className="table-wrapper">
          <table className="data-table" ref={tableRef}>
            <thead>
              <tr>
                {canDelete && <th style={{ width: 32 }}><input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} /></th>}
                <th style={{ width: 40 }}>#</th>
                {activeFields.map(key => {
                  const f = ALL_FIELDS.find(x => x.key === key);
                  return (
                    <th key={key} className={f?.numeric ? 'text-right' : ''} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(key)}>
                      {f?.label}{sortIndicator(key)}
                    </th>
                  );
                })}
                {(canEdit || canDelete) && <th>관리</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr><td colSpan={activeFields.length + 3} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>검색 결과가 없습니다</td></tr>
              ) : pageItems.map((row, i) => {
                const globalIdx = (safePage - 1) * PAGE_SIZE + i;
                const isLow = safetyStock[row.itemName] != null && toNum(row.quantity) <= safetyStock[row.itemName];
                return (
                  <tr key={row.itemCode || row.itemName || i} className={isLow ? 'row-warning' : ''}>
                    {canDelete && (
                      <td><input type="checkbox" checked={selected.has(globalIdx)} onChange={() => toggleSelect(globalIdx)} /></td>
                    )}
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                    {activeFields.map(key => {
                      const f = ALL_FIELDS.find(x => x.key === key);
                      const val = formatCell(key, row[key]);
                      return (
                        <td key={key} className={f?.numeric ? 'text-right' : ''}>
                          {isLow && key === 'quantity' ? (
                            <span style={{ color: 'var(--danger)' }}> {val}</span>
                          ) : val}
                        </td>
                      );
                    })}
                    {(canEdit || canDelete) && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {canEdit && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'edit', idx: globalIdx })}>수정</button>
                          )}
                          {canDelete && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(globalIdx)}>삭제</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="pagination" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
            <button className="btn btn-ghost btn-sm" disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
            <button className="btn btn-ghost btn-sm" disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} / {sorted.length}개
            </span>
            <button className="btn btn-ghost btn-sm" disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="btn btn-ghost btn-sm" disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        표시 항목 설정 버튼으로 보고 싶은 열만 선택해 주세요.
      </div>

      {/* 품목 추가/수정 모달 */}
      {modal && (
        <ItemModal
          item={modal.type === 'edit' ? data[modal.idx] : null}
          editIdx={modal.type === 'edit' ? modal.idx : null}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}

      {/* 삭제 확인 */}
      {deleting != null && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleting(null); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">삭제 확인</h3>
              <button className="modal-close" onClick={() => setDeleting(null)} />
            </div>
            <div className="modal-body">
              {deleting === 'bulk'
                ? <p>{selected.size}개 품목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
                : <p>"{data[deleting]?.itemName}" 품목을 삭제하시겠습니까?</p>
              }
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setDeleting(null)}>취소</button>
              <button className="btn btn-danger" onClick={() => deleting === 'bulk' ? handleBulkDelete() : handleDelete(deleting)}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 컬럼 설정 패널 ────────────────────────────────────────────────────────────
function ColumnPanel({ fields, activeFields, onApply, onClose }) {
  const [checked, setChecked] = useState(new Set(activeFields));

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function toggle(key) {
    setChecked(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  return (
    <div className="col-settings-panel" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 200, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: 16, minWidth: 260 }}>
      <div className="col-settings-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <strong>표시 항목 선택</strong>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>닫기</button>
      </div>
      <div className="col-settings-body" style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {fields.map(f => (
          <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={checked.has(f.key)} onChange={() => toggle(f.key)} />
            {f.label}
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setChecked(new Set(fields.map(f => f.key)))}>전체 선택</button>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onApply([...checked])}>적용</button>
      </div>
    </div>
  );
}
