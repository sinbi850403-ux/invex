import { useState } from 'react';
import { showToast } from '../../toast.js';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InoutComposer } from '../features/inout/components/InoutComposer';
import { InoutFilters } from '../features/inout/components/InoutFilters';
import { InoutSummary } from '../features/inout/components/InoutSummary';
import { InoutTable } from '../features/inout/components/InoutTable';
import { useInoutPage } from '../features/inout/hooks/useInoutPage';
import {
  DELETE_UNDO_LABEL,
  DELETE_UNDO_WINDOW_MS,
  getDeleteUndoGuide,
} from '../features/shared/deletePolicy';

export function InoutPage() {
  const {
    filter,
    options,
    rows,
    summary,
    composerOptions,
    setFilter,
    saveTransaction,
    deleteTransaction,
    undoDeleteTransaction,
  } = useInoutPage();
  const [pendingDeleteRow, setPendingDeleteRow] = useState<{ id?: string; itemName?: string } | null>(null);

  function requestDelete(row: { id?: string; itemName?: string }) {
    setPendingDeleteRow(row);
  }

  function confirmDelete() {
    if (!pendingDeleteRow) return;
    const result = deleteTransaction(pendingDeleteRow);
    if (!result.ok || !result.deleted) {
      showToast(result.message || '입출고 삭제에 실패했습니다.', 'warning');
      setPendingDeleteRow(null);
      return;
    }

    showToast(result.message || '입출고 기록을 삭제했습니다.', 'success', DELETE_UNDO_WINDOW_MS, {
      actionLabel: DELETE_UNDO_LABEL,
      onAction: () => {
        const undoResult = undoDeleteTransaction(result.deleted || {}, result.index || 0);
        showToast(undoResult.message || '삭제 취소를 완료했습니다.', undoResult.ok ? 'success' : 'warning');
      },
    });
    setPendingDeleteRow(null);
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">입출고 관리</span>
        <h2>입고/출고 등록과 삭제를 React 화면에서 바로 처리합니다.</h2>
        <p>
          입력한 거래는 공용 스토어에 즉시 반영되고 재고 수량도 함께 갱신됩니다.
          등록 결과를 표에서 바로 확인하고 필요하면 즉시 취소할 수 있습니다.
        </p>
      </article>

      <InoutSummary summary={summary} />
      <InoutComposer
        items={composerOptions.items}
        vendors={composerOptions.vendors}
        warehouses={composerOptions.warehouses}
        onSubmit={saveTransaction}
      />
      <InoutFilters filter={filter} options={options} onChange={setFilter} />
      <InoutTable rows={rows} onDelete={requestDelete} />

      <ConfirmDialog
        open={!!pendingDeleteRow}
        danger
        title="입출고 기록 삭제"
        description={`"${pendingDeleteRow?.itemName || '선택 기록'}"을 삭제합니다. ${getDeleteUndoGuide('입출고 기록')}`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </section>
  );
}

export default InoutPage;
