import type { AppStoreState } from '../../services/store/storeClient';

function toNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDashboardMetrics(state: AppStoreState) {
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const lowStockCount = items.filter((item) => {
    const minimum = Number(state.safetyStock?.[item.itemName] || 0);
    return minimum > 0 && toNumber(item.quantity) <= minimum;
  }).length;
  const inventoryValue = items.reduce((sum, item) => {
    const total = toNumber(item.totalPrice);
    if (total > 0) return sum + total;
    const supply = toNumber(item.supplyValue);
    if (supply > 0) return sum + supply;
    return sum + Math.round(toNumber(item.quantity) * toNumber(item.unitPrice));
  }, 0);
  const today = new Date().toISOString().slice(0, 10);
  const todayTransactions = transactions.filter((tx) => String(tx.date || '').slice(0, 10) === today).length;
  const vendorCount = new Set(
    [...(state.vendorMaster || []).map((vendor) => vendor.name), ...items.map((item) => item.vendor)].filter(Boolean),
  ).size;

  return {
    itemCount: items.length,
    transactionCount: transactions.length,
    lowStockCount,
    inventoryValue,
    todayTransactions,
    vendorCount,
  };
}

export function getRecentTransactions(state: AppStoreState) {
  return [...(state.transactions || [])]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 6);
}

