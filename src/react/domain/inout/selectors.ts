import type { AppStoreState } from '../../services/store/storeClient';
import { isSameLocalDate, normalizeYyyyMmDd, toLocalDateTimestamp } from '../../utils/date';

export type InoutFilterState = {
  keyword: string;
  type: string;
  vendor: string;
  quick: string;
};

export type InoutSortKey = 'date' | 'type' | 'itemName' | 'itemCode' | 'quantity' | 'vendor' | 'warehouse';

export type InoutSortState = {
  key: InoutSortKey;
  direction: 'asc' | 'desc';
};

const DEFAULT_SORT: InoutSortState = {
  key: 'date',
  direction: 'desc',
};

function toNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeType(value: unknown) {
  const type = String(value ?? '').trim().toLowerCase();
  if (type === 'in' || type === '입고') return 'in';
  if (type === 'out' || type === '출고') return 'out';
  return '';
}

function getComparableTxValue(tx: Record<string, unknown>, key: InoutSortKey) {
  if (key === 'date') {
    const source = normalizeYyyyMmDd(tx.date) ? tx.date : tx.createdAt;
    return toLocalDateTimestamp(source);
  }
  if (key === 'quantity') return toNumber(tx.quantity);
  if (key === 'type') {
    const normalized = normalizeType(tx.type);
    if (normalized === 'in') return 0;
    if (normalized === 'out') return 1;
    return 2;
  }
  return String(tx[key] || '').trim().toLowerCase();
}

export function getInoutSummary(state: AppStoreState) {
  const transactions = state.transactions || [];
  const todayInbound = transactions.filter(
    (tx) => normalizeType(tx.type) === 'in' && isSameLocalDate(normalizeYyyyMmDd(tx.date) ? tx.date : tx.createdAt),
  ).length;
  const todayOutbound = transactions.filter(
    (tx) => normalizeType(tx.type) === 'out' && isSameLocalDate(normalizeYyyyMmDd(tx.date) ? tx.date : tx.createdAt),
  ).length;
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

export function getFilteredTransactions(
  state: AppStoreState,
  filter: InoutFilterState,
  sort: InoutSortState = DEFAULT_SORT,
) {
  const keyword = filter.keyword.trim().toLowerCase();
  const direction = sort.direction === 'asc' ? 1 : -1;

  return (state.transactions || [])
    .map((tx, index) => ({ ...tx, _index: index }))
    .filter((tx) => {
      if (keyword) {
        const haystack = [tx.itemName, tx.itemCode, tx.vendor, tx.note].join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }

      if (filter.type && normalizeType(tx.type) !== filter.type) return false;
      if (filter.vendor && tx.vendor !== filter.vendor) return false;
      if (filter.quick === 'today' && !isSameLocalDate(normalizeYyyyMmDd(tx.date) ? tx.date : tx.createdAt)) return false;
      if (filter.quick === 'missingVendor' && String(tx.vendor || '').trim()) return false;
      if (filter.quick === 'in' && normalizeType(tx.type) !== 'in') return false;
      if (filter.quick === 'out' && normalizeType(tx.type) !== 'out') return false;
      return true;
    })
    .sort((a, b) => {
      const av = getComparableTxValue(a as Record<string, unknown>, sort.key);
      const bv = getComparableTxValue(b as Record<string, unknown>, sort.key);

      if (typeof av === 'number' && typeof bv === 'number') {
        const delta = av - bv;
        if (delta !== 0) return delta * direction;
      } else {
        const delta = String(av).localeCompare(String(bv), 'ko-KR', { numeric: true, sensitivity: 'base' });
        if (delta !== 0) return delta * direction;
      }

      return Number(a._index || 0) - Number(b._index || 0);
    });
}
