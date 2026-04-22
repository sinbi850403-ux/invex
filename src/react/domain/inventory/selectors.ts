import type { AppStoreState } from '../../services/store/storeClient';

export type InventoryFilterState = {
  keyword: string;
  category: string;
  warehouse: string;
  focus: string;
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
  const totalValue = items.reduce((sum, item) => sum + toNumber(item.totalPrice || item.supplyValue), 0);
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

export function getFilteredInventoryRows(state: AppStoreState, filter: InventoryFilterState) {
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
    .sort((a, b) => toNumber(b.totalPrice || b.supplyValue) - toNumber(a.totalPrice || a.supplyValue));
}
