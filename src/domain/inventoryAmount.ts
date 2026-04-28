/**
 * inventoryAmount.ts — 수량×단가 기반 금액 계산 공통 모듈
 */

const VAT_RATE = 0.1;

export interface AmountResult {
  supplyValue: number;
  vat: number;
  totalPrice: number;
}

export interface InventoryRow extends Record<string, unknown> {
  quantity: number | string;
  unitPrice: number | string;
  supplyValue?: number;
  vat?: number;
  totalPrice?: number;
}

export function calcAmount(quantity: number | string, unitPrice: number | string): AmountResult {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const supplyValue = qty * price;
  const vat = Math.floor(supplyValue * VAT_RATE);
  return { supplyValue, vat, totalPrice: supplyValue + vat };
}

export function applyAmounts(row: InventoryRow): InventoryRow {
  const { supplyValue, vat, totalPrice } = calcAmount(row.quantity, row.unitPrice);
  row.supplyValue = supplyValue;
  row.vat = vat;
  row.totalPrice = totalPrice;
  return row;
}

export function applyAmountsAll(rows: InventoryRow[]): InventoryRow[] {
  rows.forEach(applyAmounts);
  return rows;
}
