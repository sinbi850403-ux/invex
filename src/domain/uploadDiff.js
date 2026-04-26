/**
 * uploadDiff.js — 업로드 전후 변경사항 계산 공통 모듈
 */

const COMPARE_KEYS = [
  'itemName', 'itemCode', 'category', 'spec', 'quantity', 'unit',
  'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice',
  'warehouse', 'expiryDate', 'lotNumber', 'note', 'safetyStock',
];

function getRowKey(row, index) {
  const code = String(row?.itemCode || '').trim();
  const name = String(row?.itemName || '').trim();
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return `row:${index}`;
}

function isRowChanged(prev, next) {
  return COMPARE_KEYS.some(
    key => String(prev?.[key] ?? '').trim() !== String(next?.[key] ?? '').trim()
  );
}

/**
 * 업로드 전후 행 배열을 비교해 added/updated/unchanged/removed 수를 반환
 * @param {Object[]} previousRows
 * @param {Object[]} nextRows
 * @param {string} fileName
 * @returns {{ fileName, added, updated, unchanged, removed, at }}
 */
export function buildUploadDiff(previousRows, nextRows, fileName = '') {
  const previousMap = new Map();
  previousRows.forEach((row, i) => previousMap.set(getRowKey(row, i), row));

  const touched = new Set();
  let added = 0, updated = 0, unchanged = 0;

  nextRows.forEach((row, i) => {
    const key = getRowKey(row, i);
    const prev = previousMap.get(key);
    if (!prev) { added++; return; }
    touched.add(key);
    if (isRowChanged(prev, row)) updated++;
    else unchanged++;
  });

  return {
    fileName,
    added,
    updated,
    unchanged,
    removed: Math.max(0, previousRows.length - touched.size),
    at: new Date().toISOString(),
  };
}
