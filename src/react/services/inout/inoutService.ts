import { createInoutRecord, deleteInoutRecord, restoreInoutRecord } from '../store/storeClient';
import { findInventoryMasterItem } from '../validation/inputValidation';

export type InoutInput = {
  type: 'in' | 'out';
  itemName: string;
  itemCode: string;
  vendor: string;
  warehouse: string;
  quantity: number;
  unitPrice: number;
  date: string;
  note: string;
};

type InoutMasterItem = {
  itemName?: string;
  itemCode?: string;
  vendor?: string;
  warehouse?: string;
  unitPrice?: number | string;
};

type InoutCreateOptions = {
  inventoryItems?: InoutMasterItem[];
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createTransaction(input: InoutInput, options: InoutCreateOptions = {}) {
  const matchedItem = findInventoryMasterItem(input, options.inventoryItems || []);
  const vendor = normalizeText(input.vendor) || normalizeText(matchedItem?.vendor);
  const warehouse = normalizeText(input.warehouse) || normalizeText(matchedItem?.warehouse);

  const typedUnitPrice = toNumber(input.unitPrice);
  const fallbackUnitPrice = toNumber(matchedItem?.unitPrice);
  const unitPrice = typedUnitPrice > 0 ? typedUnitPrice : fallbackUnitPrice;

  const record = createInoutRecord({
    ...input,
    itemName: normalizeText(input.itemName),
    itemCode: normalizeText(input.itemCode),
    vendor,
    warehouse,
    note: normalizeText(input.note),
    quantity: toNumber(input.quantity),
    unitPrice,
  });
  return record;
}

export function removeTransaction(id: string) {
  const result = deleteInoutRecord(id);
  return result;
}

export function restoreRemovedTransaction(record: Record<string, unknown>, index = 0) {
  return restoreInoutRecord(record, index);
}
