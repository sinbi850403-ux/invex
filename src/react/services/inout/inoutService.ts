import { addTransaction, deleteTransaction } from '../../../store.js';
import { notifyStoreUpdated } from '../store/storeClient';

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

export function createTransaction(input: InoutInput) {
  const record = addTransaction({
    ...input,
    itemName: input.itemName.trim(),
    itemCode: input.itemCode.trim(),
    vendor: input.vendor.trim(),
    warehouse: input.warehouse.trim(),
    note: input.note.trim(),
    quantity: Number(input.quantity || 0),
    unitPrice: Number(input.unitPrice || 0),
  });

  notifyStoreUpdated(['transactions', 'mappedData']);
  return record;
}

export function removeTransaction(id: string) {
  const result = deleteTransaction(id);
  notifyStoreUpdated(['transactions', 'mappedData']);
  return result;
}
