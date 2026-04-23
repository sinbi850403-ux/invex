import { useState } from 'react';
import { showToast } from '../../toast.js';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InventoryEditor } from '../features/inventory/components/InventoryEditor';
import { InventoryFilters } from '../features/inventory/components/InventoryFilters';
import { InventorySummary } from '../features/inventory/components/InventorySummary';
import { InventoryTable } from '../features/inventory/components/InventoryTable';
import { useInventoryPage } from '../features/inventory/hooks/useInventoryPage';
import {
  DELETE_UNDO_LABEL,
  DELETE_UNDO_WINDOW_MS,
  getDeleteUndoGuide,
} from '../features/shared/deletePolicy';

export function InventoryPage() {
  const {
    draft,
    editingIndex,
    editorOptions,
    filter,
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
  } = useInventoryPage();
  const [pendingDeleteRow, setPendingDeleteRow] = useState<{ id?: string; _index?: number; itemName?: string } | null>(null);

  function requestDelete(row: { id?: string; _index?: number; itemName?: string }) {
    setPendingDeleteRow(row);
  }

  function confirmDelete() {
    if (!pendingDeleteRow) return;
    const result = deleteItem(pendingDeleteRow);
    if (!result.ok || !result.deleted) {
      showToast(result.message || '품목 삭제에 실패했습니다.', 'warning');
      setPendingDeleteRow(null);
      return;
    }

    showToast(result.message || '품목을 삭제했습니다.', 'success', DELETE_UNDO_WINDOW_MS, {
      actionLabel: DELETE_UNDO_LABEL,
      onAction: () => {
        const undoResult = undoDeleteItem(result.deleted || {}, result.index || 0);
        showToast(undoResult.message || '삭제 취소를 완료했습니다.', undoResult.ok ? 'success' : 'warning');
      },
    });
    setPendingDeleteRow(null);
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">재고 현황</span>
        <h2>품목 등록부터 수정, 검색, 삭제까지 한 화면에서 끝낼 수 있습니다.</h2>
        <p>
          같은 거래처나 창고를 반복 입력하는 시간을 줄이기 위해 최근 입력값을 기억하고,
          기존 품목 정보를 불러와 새 품목을 더 빠르게 추가할 수 있게 구성했습니다.
        </p>
      </article>

      <InventorySummary summary={summary} />
      <InventoryEditor
        initialValue={draft}
        isEditing={editingIndex !== null}
        categories={editorOptions.categories}
        units={editorOptions.units}
        vendors={editorOptions.vendors}
        warehouses={editorOptions.warehouses}
        itemTemplates={editorOptions.itemTemplates}
        onCancelEdit={startCreate}
        onSubmit={saveItem}
      />
      <InventoryFilters
        filter={filter}
        options={options}
        resultCount={rows.length}
        totalCount={summary.itemCount}
        onChange={setFilter}
      />
      <InventoryTable rows={rows} sort={sort} onSortChange={changeSort} onEdit={startEdit} onDelete={requestDelete} />

      <ConfirmDialog
        open={!!pendingDeleteRow}
        danger
        title="품목 삭제"
        description={`"${pendingDeleteRow?.itemName || '선택 항목'}"을 삭제합니다. ${getDeleteUndoGuide('품목')}`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </section>
  );
}

export default InventoryPage;
