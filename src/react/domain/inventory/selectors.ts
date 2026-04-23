import type { AppStoreState } from '../../services/store/storeClient';

export type InventoryFilterState = {
  keyword: string;
  category: string;
  warehouse: string;
  focus: string;
};

export type InventorySortKey =
  | 'itemName'
  | 'itemCode'
  | 'category'
  | 'vendor'
  | 'warehouse'
  | 'quantity'
  | 'amount';

export type InventorySortState = {
  key: InventorySortKey;
  direction: 'asc' | 'desc';
};

function toNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getInventorySummary(state: AppStoreState) {
  const items = state.mappedData || [];
  const warehouses = new Set(items.map((item) => item.warehouse).filter(Boolean)).size;
  const categories = new Set(items.map((item) => item.category).filter(Boolean)).size;
  const totalQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const totalValue = items.reduce((sum, item) => {
    const total = toNumber(item.totalPrice);
    if (total > 0) return sum + total;
    const supply = toNumber(item.supplyValue);
    if (supply > 0) return sum + supply;
    return sum + Math.round(toNumber(item.quantity) * toNumber(item.unitPrice));
  }, 0);
  const lowStock = items.filter((item) => {
    const minimum = Number(state.safetyStock?.[item.itemName] || 0);
    return minimum > 0 && toNumber(item.quantity) <= minimum;
  }).length;

  return { itemCount: items.length, warehouses, categories, totalQuantity, totalValue, lowStock };
}

export function getInventoryOptions(state: AppStoreState) {
  const items = state.mappedData || [];
  const vendorMasterNames = (state.vendorMaster || []).map((vendor) => String(vendor.name || '').trim()).filter(Boolean);
  const itemVendorNames = items.map((item) => String(item.vendor || '').trim()).filter(Boolean);
  const vendors = [...new Set([...vendorMasterNames, ...itemVendorNames])].sort();

  return {
    categories: [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
    warehouses: [...new Set(items.map((item) => item.warehouse).filter(Boolean))].sort(),
    vendors,
  };
}

export function getFilteredInventoryRows(
  state: AppStoreState,
  filter: InventoryFilterState,
  sort: InventorySortState = { key: 'amount', direction: 'desc' },
) {
  const keyword = filter.keyword.trim().toLowerCase();

  return (state.mappedData || [])
    .map((item, index) => ({ ...item, _index: index }))
    .filter((item) => {
      if (keyword) {
        const haystack = [item.itemName, item.itemCode, item.vendor, item.spec].join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }

      if (filter.category && item.category !== filter.category) return false;
      if (filter.warehouse && item.warehouse !== filter.warehouse) return false;

      if (filter.focus === 'low') {
        const minimum = Number(state.safetyStock?.[item.itemName] || 0);
        if (!(minimum > 0 && toNumber(item.quantity) <= minimum)) return false;
      }

      if (filter.focus === 'missingVendor' && item.vendor) return false;
      return true;
    })
    .sort((a, b) => compareInventoryRows(a, b, sort));
}

function compareInventoryRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  sort: InventorySortState,
) {
  const direction = sort.direction === 'asc' ? 1 : -1;

  if (sort.key === 'quantity') {
    return direction * (toNumber(a.quantity) - toNumber(b.quantity));
  }

  if (sort.key === 'amount') {
    const getAmt = (row: typeof a) => {
      const total = toNumber(row.totalPrice);
      if (total > 0) return total;
      const supply = toNumber(row.supplyValue);
      if (supply > 0) return supply;
      return Math.round(toNumber(row.quantity) * toNumber(row.unitPrice));
    };
    return direction * (getAmt(a) - getAmt(b));
  }

  const aText = String(a[sort.key] || '').trim().toLowerCase();
  const bText = String(b[sort.key] || '').trim().toLowerCase();
  return direction * aText.localeCompare(bText, 'ko');
}
