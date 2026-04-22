import {
  addItem,
  addTransaction,
  deleteItem,
  deleteTransaction,
  getState,
  recalcItemAmounts,
  restoreState,
  setState,
  updateItem,
} from '../../../store.js';

export type AppStoreState = ReturnType<typeof getState>;
export type StoreChangedKey = keyof AppStoreState | 'mappedData' | 'transactions' | '*';

export async function restoreAppStore() {
  await restoreState();
  return getState();
}

export function getStoreSnapshot() {
  return getState();
}

export function updateStore(partial: Partial<AppStoreState>) {
  setState(partial);
}

function notifyStoreUpdated(changedKeys: StoreChangedKey[]) {
  window.dispatchEvent(
    new CustomEvent('invex:store-updated', { detail: { changedKeys } }),
  );
}

function runLegacyMutation<T>(changedKeys: StoreChangedKey[], mutation: () => T) {
  const result = mutation();
  notifyStoreUpdated(changedKeys);
  return result;
}

export function recalcInventoryAmounts(record: Record<string, unknown>) {
  recalcItemAmounts(record);
}

export function createInventoryRecord(record: Record<string, unknown>) {
  return runLegacyMutation(['mappedData'], () => addItem(record));
}

export function updateInventoryRecord(target: number | string, record: Record<string, unknown>) {
  return runLegacyMutation(['mappedData'], () => updateItem(target, record));
}

export function deleteInventoryRecord(target: number | string) {
  return runLegacyMutation(['mappedData'], () => deleteItem(target));
}

export function createInoutRecord(record: Record<string, unknown>) {
  return runLegacyMutation(['transactions', 'mappedData'], () => addTransaction(record));
}

export function deleteInoutRecord(id: string) {
  return runLegacyMutation(['transactions', 'mappedData'], () => deleteTransaction(id));
}

export function subscribeStore(listener: () => void) {
  const handleUpdate = () => listener();
  window.addEventListener('invex:store-updated', handleUpdate);

  return () => {
    window.removeEventListener('invex:store-updated', handleUpdate);
  };
}
