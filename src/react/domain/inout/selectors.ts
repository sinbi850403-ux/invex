import type { AppStoreState } from '../../services/store/storeClient';

export type InoutFilterState = {
  keyword: string;
  type: string;
  vendor: string;
  quick: string;
};

function isToday(dateValue: unknown) {
  return String(dateValue || '').slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function getInoutSummary(state: AppStoreState) {
  const transactions = state.transactions || [];
  const todayInbound = transactions.filter((tx) => tx.type === 'in' && isToday(tx.date)).length;
  const todayOutbound = transactions.filter((tx) => tx.type === 'out' && isToday(tx.date)).length;
  const missingVendor = transactions.filter((tx) => !String(tx.vendor || '').trim()).length;

  return {
    totalTransactions: transactions.length,
    todayInbound,
    todayOutbound,
    missingVendor,
  };
}

export function getInoutOptions(state: AppStoreState) {
  const vendorMasterNames = (state.vendorMaster || []).map((vendor) => String(vendor.name || '').trim()).filter(Boolean);
  const txVendors = (state.transactions || []).map((tx) => String(tx.vendor || '').trim()).filter(Boolean);
  return {
    vendors: [...new Set([...vendorMasterNames, ...txVendors])].sort(),
  };
}

export function getFilteredTransactions(state: AppStoreState, filter: InoutFilterState) {
  const keyword = filter.keyword.trim().toLowerCase();

  return (state.transactions || [])
    .map((tx, index) => ({ ...tx, _index: index }))
    .filter((tx) => {
      if (keyword) {
        const haystack = [tx.itemName, tx.itemCode, tx.vendor, tx.note].join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }

      if (filter.type && tx.type !== filter.type) return false;
      if (filter.vendor && tx.vendor !== filter.vendor) return false;
      if (filter.quick === 'today' && !isToday(tx.date)) return false;
      if (filter.quick === 'missingVendor' && String(tx.vendor || '').trim()) return false;
      if (filter.quick === 'in' && tx.type !== 'in') return false;
      if (filter.quick === 'out' && tx.type !== 'out') return false;
      return true;
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
