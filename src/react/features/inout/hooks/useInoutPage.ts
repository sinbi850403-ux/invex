import { useDeferredValue, useMemo, useState } from 'react';
import { getFilteredTransactions, getInoutOptions, getInoutSummary } from '../../../domain/inout/selectors';
import { createTransaction, removeTransaction, type InoutInput } from '../../../services/inout/inoutService';
import { useStore } from '../../../services/store/StoreContext';

export function useInoutPage() {
  const { state } = useStore();
  const [filter, setFilter] = useState({
    keyword: '',
    type: '',
    vendor: '',
    quick: 'all',
  });
  const deferredKeyword = useDeferredValue(filter.keyword);

  const effectiveFilter = useMemo(
    () => ({ ...filter, keyword: deferredKeyword }),
    [deferredKeyword, filter],
  );

  const summary = useMemo(() => getInoutSummary(state), [state]);
  const options = useMemo(() => getInoutOptions(state), [state]);
  const rows = useMemo(() => getFilteredTransactions(state, effectiveFilter), [effectiveFilter, state]);
  const composerOptions = useMemo(
    () => ({
      items: state.mappedData || [],
      vendors: options.vendors,
    }),
    [options.vendors, state.mappedData],
  );

  function saveTransaction(value: InoutInput) {
    createTransaction(value);
  }

  function deleteTransaction(row: { id?: string }) {
    if (!row.id) return;
    removeTransaction(row.id);
  }

  return { filter, options, rows, summary, composerOptions, setFilter, saveTransaction, deleteTransaction };
}
