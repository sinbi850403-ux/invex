import { getState, restoreState, setState } from '../../../store.js';

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

export function notifyStoreUpdated(changedKeys: StoreChangedKey[]) {
  window.dispatchEvent(
    new CustomEvent('invex:store-updated', { detail: { changedKeys } }),
  );
}

export function subscribeStore(listener: () => void) {
  const handleUpdate = () => listener();
  window.addEventListener('invex:store-updated', handleUpdate);

  return () => {
    window.removeEventListener('invex:store-updated', handleUpdate);
  };
}
