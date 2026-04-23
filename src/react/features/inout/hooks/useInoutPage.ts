import { useDeferredValue, useMemo, useState } from 'react';
import {
  getFilteredTransactions,
  getInoutOptions,
  getInoutSummary,
  type InoutSortKey,
} from '../../../domain/inout/selectors';
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
  const [sort, setSort] = useState<{ key: InoutSortKey; direction: 'asc' | 'desc' }>({
    key: 'date',
    direction: 'desc',
  });
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(() => ({ ...filter, keyword: deferredKeyword }), [deferredKeyword, filter]);

  const summary = useMemo(() => getInoutSummary(state), [state]);
  const options = useMemo(() => getInoutOptions(state), [state]);
  const rows = useMemo(() => getFilteredTransactions(state, effectiveFilter, sort), [effectiveFilter, sort, state]);
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
      return { ok: true, message: '입출고 기록을 저장했습니다.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.' };
    }
  }

  function changeSort(nextKey: InoutSortKey) {
    setSort((current) => {
      if (current.key === nextKey) {
        return {
          ...current,
          direction: current.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return {
        key: nextKey,
        direction: nextKey === 'date' || nextKey === 'quantity' ? 'desc' : 'asc',
      };
    });
  }

  function deleteTransaction(row: { id?: string }): DeleteResult {
    if (!row.id) return { ok: false, message: '삭제할 대상을 찾지 못했습니다.' };
    try {
      const result = removeTransaction(row.id);
      if (!result?.deleted) return { ok: false, message: '이미 삭제되었거나 존재하지 않는 기록입니다.' };
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

  function bulkSaveTransactions(inputs: InoutInput[]): MutationResult & { count?: number } {
    if (!inputs.length) return { ok: false, message: '등록할 데이터가 없습니다.' };
    let count = 0;
    const failMessages: string[] = [];

    for (const input of inputs) {
      const validationError = validateInoutInput(input, {
        inventoryItems: state.mappedData || [],
        vendors: options.vendors,
        warehouses: composerOptions.warehouses,
      });
      if (validationError) {
        failMessages.push(validationError);
        continue;
      }
      try {
        createTransaction(input, { inventoryItems: state.mappedData || [] });
        count++;
      } catch (error) {
        failMessages.push(error instanceof Error ? error.message : '알 수 없는 오류');
      }
    }

    if (count === 0) return { ok: false, message: failMessages[0] || '등록에 실패했습니다.' };
    const message =
      failMessages.length > 0
        ? `${count}건 저장 완료, ${failMessages.length}건은 확인이 필요합니다. 첫 오류: ${failMessages[0]}`
        : `${count}건을 성공적으로 저장했습니다.`;

    return { ok: true, message, count };
  }

  return {
    filter,
    options,
    sort,
    rows,
    summary,
    composerOptions,
    setFilter,
    changeSort,
    saveTransaction,
    bulkSaveTransactions,
    deleteTransaction,
    undoDeleteTransaction,
  };
}
