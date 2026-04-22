import {
  createInventoryRecord,
  deleteInventoryRecord,
  recalcInventoryAmounts,
  updateInventoryRecord,
} from '../store/storeClient';

export type InventoryInput = {
  itemName: string;
  itemCode: string;
  category: string;
  vendor: string;
  warehouse: string;
  quantity: number;
  unit: string;
  unitPrice: number;
};

function toInventoryRecord(input: InventoryInput) {
  const record = {
    itemName: input.itemName.trim(),
    itemCode: input.itemCode.trim(),
    category: input.category.trim(),
    vendor: input.vendor.trim(),
    warehouse: input.warehouse.trim(),
    quantity: Number(input.quantity || 0),
    unit: input.unit.trim() || 'EA',
    unitPrice: Number(input.unitPrice || 0),
    salePrice: 0,
    supplyValue: 0,
    vat: 0,
    totalPrice: 0,
    note: '',
  };

  recalcInventoryAmounts(record);
  return record;
}

export function createInventoryItem(input: InventoryInput) {
  const record = toInventoryRecord(input);
  createInventoryRecord(record);
  return record;
}

export function editInventoryItem(target: number | string, input: InventoryInput) {
  const record = toInventoryRecord(input);
  updateInventoryRecord(target, record);
  return record;
}

export function removeInventoryItem(target: number | string) {
  const result = deleteInventoryRecord(target);
  return result;
}
