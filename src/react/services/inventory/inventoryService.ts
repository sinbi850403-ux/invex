import { addItem, deleteItem, recalcItemAmounts, updateItem } from '../../../store.js';
import { notifyStoreUpdated } from '../store/storeClient';

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

  recalcItemAmounts(record);
  return record;
}

export function createInventoryItem(input: InventoryInput) {
  const record = toInventoryRecord(input);
  addItem(record);
  notifyStoreUpdated(['mappedData']);
  return record;
}

export function editInventoryItem(target: number | string, input: InventoryInput) {
  const record = toInventoryRecord(input);
  updateItem(target, record);
  notifyStoreUpdated(['mappedData']);
  return record;
}

export function removeInventoryItem(target: number | string) {
  const result = deleteItem(target);
  notifyStoreUpdated(['mappedData']);
  return result;
}
