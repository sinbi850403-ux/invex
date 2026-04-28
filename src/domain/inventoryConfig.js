import React from 'react';

export const ALL_FIELDS = [
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

export const ALWAYS_VISIBLE = [
  'category','itemCode','itemName','spec','unit',
  'outTotalPrice','supplyValue','profit','profitMargin',
  'cogsMargin','quantity','endingInventoryValue',
];

export const SORT_OPTIONS = [
  { value: 'default',          label: '정렬 없음 (원본 순서)' },
  { value: 'itemName:asc',     label: '품목명 오름차순' },
  { value: 'quantity:desc',    label: '수량 많은 순' },
  { value: 'quantity:asc',     label: '수량 적은 순' },
  { value: 'totalPrice:desc',  label: '합계금액 높은 순' },
  { value: 'vendor:asc',       label: '거래처 가나다순' },
];

export const FOCUS_CHIPS = [
  { value: 'all',              label: '전체 보기' },
  { value: 'low',              label: '부족 품목' },
  { value: 'zero',             label: '수량 0' },
  { value: 'missingVendor',    label: '거래처 미입력' },
  { value: 'missingWarehouse', label: '창고 미입력' },
];

export const MONEY_KEYS = new Set([
  'unitPrice','salePrice','supplyValue','vat','totalPrice',
  'outTotalPrice','purchaseCost','profit','endingInventoryValue',
]);
export const NUM_KEYS     = new Set(['quantity','inQty','outQty']);
export const PERCENT_KEYS = new Set(['profitMargin','cogsMargin']);

export const toNum = v => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
export const fmt   = v => { const n = Math.round(toNum(v)); return n ? '₩' + n.toLocaleString('ko-KR') : '-'; };

export function formatCell(key, value) {
  const isNumericField = MONEY_KEYS.has(key) || NUM_KEYS.has(key) || PERCENT_KEYS.has(key);
  if (value === '' || value == null) return isNumericField ? '-' : '';
  if (MONEY_KEYS.has(key)) {
    const n = toNum(value);
    if (!isNaN(n)) return '₩' + Math.round(n).toLocaleString('ko-KR');
  }
  if (NUM_KEYS.has(key)) {
    const n = toNum(value);
    if (!isNaN(n)) return Math.round(n).toLocaleString('ko-KR');
  }
  return String(value);
}
