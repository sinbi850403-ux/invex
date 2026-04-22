import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InventoryEditor } from '../features/inventory/components/InventoryEditor';
import { InventoryFilters } from '../features/inventory/components/InventoryFilters';
import { InventorySummary } from '../features/inventory/components/InventorySummary';
import { InventoryTable } from '../features/inventory/components/InventoryTable';
import { useInventoryPage } from '../features/inventory/hooks/useInventoryPage';

export function InventoryPage() {
  const {
    draft,
    editingIndex,
    editorOptions,
    filter,
    options,
    rows,
    summary,
    setFilter,
    saveItem,
    deleteItem,
    startCreate,
    startEdit,
  } = useInventoryPage();
  const [pendingDeleteRow, setPendingDeleteRow] = useState<{ id?: string; _index?: number; itemName?: string } | null>(null);

  function requestDelete(row: { id?: string; _index?: number; itemName?: string }) {
    setPendingDeleteRow(row);
  }

  function confirmDelete() {
    if (pendingDeleteRow) {
      deleteItem(pendingDeleteRow);
    }
    setPendingDeleteRow(null);
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">Inventory flow migrated</span>
        <h2>Inventory now supports actual React-side create, edit, and delete flows.</h2>
        <p>
          This page is no longer just a read-only placeholder. The editor writes to the shared
          store, the table reflects updates immediately, and the page structure stays feature-first.
        </p>
      </article>

      <InventorySummary summary={summary} />
      <InventoryEditor
        initialValue={draft}
        isEditing={editingIndex !== null}
        vendors={editorOptions.vendors}
        warehouses={editorOptions.warehouses}
        onCancelEdit={startCreate}
        onSubmit={saveItem}
      />
      <InventoryFilters filter={filter} options={options} onChange={setFilter} />
      <InventoryTable rows={rows} onEdit={startEdit} onDelete={requestDelete} />

      <ConfirmDialog
        open={!!pendingDeleteRow}
        danger
        title="품목 삭제"
        description={`"${pendingDeleteRow?.itemName || '선택 품목'}" 품목을 삭제할까요? 삭제 후에는 되돌리기 전까지 목록에서 사라집니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </section>
  );
}
