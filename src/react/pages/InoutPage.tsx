import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InoutComposer } from '../features/inout/components/InoutComposer';
import { InoutFilters } from '../features/inout/components/InoutFilters';
import { InoutSummary } from '../features/inout/components/InoutSummary';
import { InoutTable } from '../features/inout/components/InoutTable';
import { useInoutPage } from '../features/inout/hooks/useInoutPage';

export function InoutPage() {
  const { filter, options, rows, summary, composerOptions, setFilter, saveTransaction, deleteTransaction } = useInoutPage();
  const [pendingDeleteRow, setPendingDeleteRow] = useState<{ id?: string; itemName?: string } | null>(null);

  function requestDelete(row: { id?: string; itemName?: string }) {
    setPendingDeleteRow(row);
  }

  function confirmDelete() {
    if (pendingDeleteRow) {
      deleteTransaction(pendingDeleteRow);
    }
    setPendingDeleteRow(null);
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Inout flow migrated</span>
        <h2>Inout now handles actual React-side registration and deletion flows.</h2>
        <p>
          The composer writes transactions to the shared store, inventory quantities update through
          the existing store logic, and the React page now owns real operational behavior.
        </p>
      </article>

      <InoutSummary summary={summary} />
      <InoutComposer
        items={composerOptions.items}
        vendors={composerOptions.vendors}
        onSubmit={saveTransaction}
      />
      <InoutFilters filter={filter} options={options} onChange={setFilter} />
      <InoutTable rows={rows} onDelete={requestDelete} />

      <ConfirmDialog
        open={!!pendingDeleteRow}
        danger
        title="입출고 기록 삭제"
        description={`"${pendingDeleteRow?.itemName || '선택 기록'}" 기록을 삭제할까요? 재고 수량에도 즉시 반영됩니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </section>
  );
}
