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
        <h2>입고와 출고를 입력하면 재고가 바로 반영되도록 흐름을 단순하게 정리했습니다.</h2>
        <p>
          자주 쓰는 거래처와 창고를 기억하고, 기존 품목을 선택하면 거래에 필요한 정보가 바로 채워집니다.
          건별 입력과 엑셀 일괄 등록을 같은 화면에서 이어서 처리할 수 있습니다.
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
      <InoutFilters
        filter={filter}
        options={options}
        resultCount={rows.length}
        totalCount={summary.totalTransactions}
        onChange={setFilter}
      />
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
