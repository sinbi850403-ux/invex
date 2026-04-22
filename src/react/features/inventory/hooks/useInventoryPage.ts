import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { getFilteredInventoryRows, getInventoryOptions, getInventorySummary } from '../../../domain/inventory/selectors';
import {
  createInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  type InventoryInput,
} from '../../../services/inventory/inventoryService';
import { useStore } from '../../../services/store/StoreContext';

const emptyDraft: InventoryInput = {
  itemName: '',
  itemCode: '',
  category: '',
  vendor: '',
  warehouse: '',
  quantity: 0,
  unit: 'EA',
  unitPrice: 0,
};

export function useInventoryPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState({
    keyword: '',
    category: '',
    warehouse: '',
    focus: 'all',
  });
  const [editingTarget, setEditingTarget] = useState<number | string | null>(null);
  const [draft, setDraft] = useState<InventoryInput>(emptyDraft);
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(
    () => ({ ...filter, keyword: deferredKeyword }),
    [deferredKeyword, filter],
  );

  const summary = useMemo(() => getInventorySummary(state), [state]);
  const options = useMemo(() => getInventoryOptions(state), [state]);
  const rows = useMemo(() => getFilteredInventoryRows(state, effectiveFilter), [effectiveFilter, state]);

  useEffect(() => {
    if (editingTarget === null) return;
    const target =
      typeof editingTarget === 'number'
        ? state.mappedData?.[editingTarget]
        : (state.mappedData || []).find((item) => String(item.id || item._id || '') === String(editingTarget));
    if (!target) return;

    setDraft({
      itemName: target.itemName || '',
      itemCode: target.itemCode || '',
      category: target.category || '',
      vendor: target.vendor || '',
      warehouse: target.warehouse || '',
      quantity: Number(target.quantity || 0),
      unit: target.unit || 'EA',
      unitPrice: Number(target.unitPrice || 0),
    });
  }, [editingTarget, state.mappedData]);

  function startCreate() {
    setEditingTarget(null);
    setDraft(emptyDraft);
  }

  function startEdit(row: { id?: string; _index?: number; itemName?: string; itemCode?: string; category?: string; vendor?: string; warehouse?: string; quantity?: string | number; unit?: string; unitPrice?: string | number; }) {
    const nextTarget = row.id || row._index;
    if (typeof nextTarget !== 'number' && typeof nextTarget !== 'string') return;
    setEditingTarget(nextTarget);
    setDraft({
      itemName: row.itemName || '',
      itemCode: row.itemCode || '',
      category: row.category || '',
      vendor: row.vendor || '',
      warehouse: row.warehouse || '',
      quantity: Number(row.quantity || 0),
      unit: row.unit || 'EA',
      unitPrice: Number(row.unitPrice || 0),
    });
  }

  function saveItem(value: InventoryInput) {
    if (editingTarget === null) {
      createInventoryItem(value);
      setDraft(emptyDraft);
      return;
    }

    editInventoryItem(editingTarget, value);
    setEditingTarget(null);
    setDraft(emptyDraft);
  }

  function deleteItem(row: { id?: string; _index?: number }) {
    const target = row.id || row._index;
    if (typeof target !== 'number' && typeof target !== 'string') return;
    removeInventoryItem(target);
    if (editingTarget === target) {
      setEditingTarget(null);
      setDraft(emptyDraft);
    }
  }

  const editorOptions = useMemo(() => ({
    vendors: options.vendors,
    warehouses: options.warehouses,
  }), [options.vendors, options.warehouses]);

  return {
    draft,
    editingIndex: editingTarget,
    filter,
    editorOptions,
    options,
    rows,
    summary,
    setFilter,
    saveItem,
    deleteItem,
    startCreate,
    startEdit,
  };
}
