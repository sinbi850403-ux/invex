import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  getFilteredInventoryRows,
  getInventoryOptions,
  getInventorySummary,
  type InventorySortKey,
} from '../../../domain/inventory/selectors';
import {
  createInventoryItem,
  editInventoryItem,
  removeInventoryItem,
  restoreRemovedInventoryItem,
  type InventoryInput,
} from '../../../services/inventory/inventoryService';
import { useStore } from '../../../services/store/StoreContext';
import { validateInventoryInput } from '../../../services/validation/inputValidation';

export type MutationResult = {
  ok: boolean;
  message?: string;
};

export type DeleteResult = MutationResult & {
  deleted?: Record<string, unknown>;
  index?: number;
};

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
  const [sort, setSort] = useState<{ key: InventorySortKey; direction: 'asc' | 'desc' }>({
    key: 'amount',
    direction: 'desc',
  });
  const [editingTarget, setEditingTarget] = useState<number | string | null>(null);
  const [draft, setDraft] = useState<InventoryInput>(emptyDraft);
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(() => ({ ...filter, keyword: deferredKeyword }), [deferredKeyword, filter]);

  const summary = useMemo(() => getInventorySummary(state), [state]);
  const options = useMemo(() => getInventoryOptions(state), [state]);
  const unitOptions = useMemo(
    () => [...new Set((state.mappedData || []).map((item) => String(item.unit || '').trim()).filter(Boolean))].sort(),
    [state.mappedData],
  );
  const rows = useMemo(() => getFilteredInventoryRows(state, effectiveFilter, sort), [effectiveFilter, sort, state]);

  function changeSort(nextKey: InventorySortKey) {
    setSort((current) => {
      if (current.key === nextKey) {
        return {
          ...current,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }

      return {
        key: nextKey,
        direction: nextKey === 'quantity' || nextKey === 'amount' ? 'desc' : 'asc',
      };
    });
  }

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

  function startEdit(row: {
    id?: string;
    _index?: number;
    itemName?: string;
    itemCode?: string;
    category?: string;
    vendor?: string;
    warehouse?: string;
    quantity?: string | number;
    unit?: string;
    unitPrice?: string | number;
  }) {
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

  function saveItem(value: InventoryInput): MutationResult {
    const validationError = validateInventoryInput(value, {
      categories: options.categories,
      units: unitOptions,
      vendors: options.vendors,
      warehouses: options.warehouses,
      existingItems: state.mappedData || [],
    });
    if (validationError) return { ok: false, message: validationError };

    try {
      if (editingTarget === null) {
        createInventoryItem(value);
        setDraft(emptyDraft);
        return { ok: true, message: '품목이 등록되었습니다.' };
      }

      editInventoryItem(editingTarget, value);
      setEditingTarget(null);
      setDraft(emptyDraft);
      return { ok: true, message: '품목이 수정되었습니다.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.' };
    }
  }

  function deleteItem(row: { id?: string; _index?: number }): DeleteResult {
    const target = row.id || row._index;
    if (typeof target !== 'number' && typeof target !== 'string') {
      return { ok: false, message: '삭제 대상 ID를 찾을 수 없습니다.' };
    }

    try {
      const result = removeInventoryItem(target);
      if (!result?.deleted) {
        return { ok: false, message: '이미 삭제되었거나 삭제할 수 없는 항목입니다.' };
      }
      if (editingTarget === target) {
        setEditingTarget(null);
        setDraft(emptyDraft);
      }
      return {
        ok: true,
        message: '품목을 삭제했습니다.',
        deleted: result.deleted as Record<string, unknown>,
        index: result.index,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.' };
    }
  }

  function undoDeleteItem(deleted: Record<string, unknown>, index = 0): MutationResult {
    try {
      const restored = restoreRemovedInventoryItem(deleted, index);
      if (!restored) return { ok: false, message: '삭제 취소에 실패했습니다.' };
      return { ok: true, message: '삭제를 취소했습니다.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '삭제 취소 중 오류가 발생했습니다.' };
    }
  }

  const editorOptions = useMemo(
    () => ({
      categories: options.categories,
      units: unitOptions,
      vendors: options.vendors,
      warehouses: options.warehouses,
      itemTemplates: (state.mappedData || []).map((item) => ({
        id: String(item.id || item._id || ''),
        itemName: String(item.itemName || ''),
        itemCode: String(item.itemCode || ''),
        category: String(item.category || ''),
        unit: String(item.unit || 'EA'),
        vendor: String(item.vendor || ''),
        warehouse: String(item.warehouse || ''),
        unitPrice: Number(item.unitPrice || 0),
      })),
    }),
    [options.categories, options.vendors, options.warehouses, state.mappedData, unitOptions],
  );

  return {
    draft,
    editingIndex: editingTarget,
    filter,
    editorOptions,
    options,
    sort,
    rows,
    summary,
    setFilter,
    changeSort,
    saveItem,
    deleteItem,
    undoDeleteItem,
    startCreate,
    startEdit,
  };
}
