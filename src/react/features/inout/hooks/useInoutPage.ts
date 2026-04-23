import { useDeferredValue, useMemo, useState } from 'react';
import { getFilteredTransactions, getInoutOptions, getInoutSummary } from '../../../domain/inout/selectors';
import {
  createTransaction,
  removeTransaction,
  restoreRemovedTransaction,
  type InoutInput,
} from '../../../services/inout/inoutService';
import { useStore } from '../../../services/store/StoreContext';
import { validateInoutInput } from '../../../services/validation/inputValidation';

type MutationResult = {
  ok: boolean;
  message?: string;
};

type DeleteResult = MutationResult & {
  deleted?: Record<string, unknown>;
  index?: number;
};

export function useInoutPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState({
    keyword: '',
    type: '',
    vendor: '',
    quick: 'all',
  });
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(() => ({ ...filter, keyword: deferredKeyword }), [deferredKeyword, filter]);

  const summary = useMemo(() => getInoutSummary(state), [state]);
  const options = useMemo(() => getInoutOptions(state), [state]);
  const rows = useMemo(() => getFilteredTransactions(state, effectiveFilter), [effectiveFilter, state]);
  const composerOptions = useMemo(
    () => ({
      items: state.mappedData || [],
      vendors: options.vendors,
      warehouses: [
        ...new Set(
          [
            ...(state.mappedData || []).map((item) => String(item.warehouse || '').trim()),
            ...(state.transactions || []).map((tx) => String(tx.warehouse || '').trim()),
          ].filter(Boolean),
        ),
      ].sort(),
    }),
    [options.vendors, state.mappedData, state.transactions],
  );

  function saveTransaction(value: InoutInput): MutationResult {
    const validationError = validateInoutInput(value, {
      inventoryItems: state.mappedData || [],
      vendors: options.vendors,
      warehouses: composerOptions.warehouses,
    });
    if (validationError) return { ok: false, message: validationError };

    try {
      createTransaction(value, { inventoryItems: state.mappedData || [] });
      return { ok: true, message: '입출고를 등록했습니다.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.' };
    }
  }

  function deleteTransaction(row: { id?: string }): DeleteResult {
    if (!row.id) return { ok: false, message: '삭제 대상 ID를 찾을 수 없습니다.' };
    try {
      const result = removeTransaction(row.id);
      if (!result?.deleted) return { ok: false, message: '이미 삭제했거나 삭제할 수 없는 기록입니다.' };
      return {
        ok: true,
        message: '입출고 기록을 삭제했습니다.',
        deleted: result.deleted as Record<string, unknown>,
        index: result.index,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.' };
    }
  }

  function undoDeleteTransaction(deleted: Record<string, unknown>, index = 0): MutationResult {
    try {
      const restored = restoreRemovedTransaction(deleted, index);
      if (!restored) return { ok: false, message: '삭제 취소에 실패했습니다.' };
      return { ok: true, message: '삭제를 취소했습니다.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '삭제 취소 중 오류가 발생했습니다.' };
    }
  }

  return {
    filter,
    options,
    rows,
    summary,
    composerOptions,
    setFilter,
    saveTransaction,
    deleteTransaction,
    undoDeleteTransaction,
  };
}
