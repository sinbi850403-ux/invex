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
    sort,
    rows,
    summary,
    setFilter,
    changeSort,
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
        <span className="react-chip">재고 현황</span>
        <h2>품목 등록, 수정, 삭제를 현재 화면에서 바로 처리합니다.</h2>
        <p>
          편집기에 입력하면 목록이 즉시 반영됩니다.
          기존 품목 템플릿을 불러와 더 빠르게 등록할 수 있습니다.
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
      <InventoryFilters filter={filter} options={options} onChange={setFilter} />
      <InventoryTable rows={rows} sort={sort} onSortChange={changeSort} onEdit={startEdit} onDelete={requestDelete} />

      <ConfirmDialog
        open={!!pendingDeleteRow}
        danger
        title="품목 삭제"
        description={`"${pendingDeleteRow?.itemName || '선택 품목'}" 품목을 삭제할까요? 삭제 전에는 되돌리기 전까지 목록에서 사라집니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteRow(null)}
      />
    </section>
  );
}

export default InventoryPage;

