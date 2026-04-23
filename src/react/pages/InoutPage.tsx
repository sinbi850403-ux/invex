import { useState } from 'react';
import { showToast } from '../../toast.js';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InoutComposer } from '../features/inout/components/InoutComposer';
import { InoutExcelPanel, type ExcelRow } from '../features/inout/components/InoutExcelPanel';
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

  function handleExcelImport(excelRows: ExcelRow[]) {
    const result = bulkSaveTransactions(excelRows);
    if (result.ok) showToast(result.message ?? '등록 완료', 'success');
    else showToast(result.message ?? '등록 실패', 'warning');
    return result;
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">입출고 관리</span>
        <h2>입고/출고 이력을 등록하고 재고에 즉시 반영합니다.</h2>
        <p>
          건별로 직접 입력하거나 엑셀로 대량 업로드할 수 있습니다.
          등록 즉시 재고 수량이 갱신되며, 실수로 등록했을 때 즉시 취소도 가능합니다.
        </p>
      </article>

      <InoutSummary summary={summary} />
      <InoutExcelPanel rows={rows} onImport={handleExcelImport} />
      <InoutComposer
        items={composerOptions.items}
        vendors={composerOptions.vendors}
        warehouses={composerOptions.warehouses}
        onSubmit={saveTransaction}
      />
      <InoutFilters filter={filter} options={options} onChange={setFilter} />
      <InoutTable rows={rows} sort={sort} onSortChange={changeSort} onDelete={requestDelete} />

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
