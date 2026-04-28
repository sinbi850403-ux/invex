/**
 * uploadDiff.ts — 업로드 전후 변경사항 계산 공통 모듈
 */

export interface UploadDiff {
  fileName: string;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  at: string;
}

type DataRow = Record<string, unknown>;

const COMPARE_KEYS = [
  'itemName', 'itemCode', 'category', 'spec', 'quantity', 'unit',
  'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice',
  'warehouse', 'expiryDate', 'lotNumber', 'note', 'safetyStock',
] as const;

function getRowKey(row: DataRow | undefined, index: number): string {
  const code = String(row?.itemCode || '').trim();
  const name = String(row?.itemName || '').trim();
  if (code) return `code:${code}`;
  if (name) return `name:${name}`;
  return `row:${index}`;
}

function isRowChanged(prev: DataRow | undefined, next: DataRow): boolean {
  return COMPARE_KEYS.some(
    key => String(prev?.[key] ?? '').trim() !== String(next?.[key] ?? '').trim()
  );
}

export function buildUploadDiff(
  previousRows: DataRow[],
  nextRows: DataRow[],
  fileName = ''
): UploadDiff {
  const previousMap = new Map<string, DataRow>();
  previousRows.forEach((row, i) => previousMap.set(getRowKey(row, i), row));

  const touched = new Set<string>();
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
