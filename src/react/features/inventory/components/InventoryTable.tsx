type InventoryRow = {
  id?: string;
  _index?: number;
  itemName?: string;
  itemCode?: string;
  category?: string;
  vendor?: string;
  warehouse?: string;
  quantity?: string | number;
  totalPrice?: string | number;
  supplyValue?: string | number;
};

type InventorySortKey =
  | 'itemName'
  | 'itemCode'
  | 'category'
  | 'vendor'
  | 'warehouse'
  | 'quantity'
  | 'amount';

type InventoryTableProps = {
  rows: InventoryRow[];
  sort: {
    key: InventorySortKey;
    direction: 'asc' | 'desc';
  };
  onSortChange: (key: InventorySortKey) => void;
  onEdit: (row: InventoryRow) => void;
  onDelete: (row: InventoryRow) => void;
};

function formatAmount(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '-';
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSortChange,
}: {
  label: string;
  sortKey: InventorySortKey;
  sort: InventoryTableProps['sort'];
  onSortChange: InventoryTableProps['onSortChange'];
}) {
  const isActive = sort.key === sortKey;
  const indicator = isActive ? (sort.direction === 'asc' ? '▲' : '▼') : '↕';

  return (
    <button
      type="button"
      className={isActive ? 'react-sort-button is-active' : 'react-sort-button'}
      onClick={() => onSortChange(sortKey)}
      aria-label={`${label} 정렬`}
    >
      <span>{label}</span>
      <span className="react-sort-indicator">{indicator}</span>
    </button>
  );
}

export function InventoryTable({ rows, sort, onSortChange, onDelete, onEdit }: InventoryTableProps) {
  return (
    <article className="react-card react-card--table">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">재고 목록</span>
          <h3>현재 재고 현황</h3>
        </div>
        <strong>{rows.length}건</strong>
      </div>

      <div className="react-data-table">
        <table>
          <thead>
            <tr>
              <th><SortableHeader label="품목명" sortKey="itemName" sort={sort} onSortChange={onSortChange} /></th>
              <th><SortableHeader label="코드" sortKey="itemCode" sort={sort} onSortChange={onSortChange} /></th>
              <th><SortableHeader label="카테고리" sortKey="category" sort={sort} onSortChange={onSortChange} /></th>
              <th><SortableHeader label="거래처" sortKey="vendor" sort={sort} onSortChange={onSortChange} /></th>
              <th><SortableHeader label="창고" sortKey="warehouse" sort={sort} onSortChange={onSortChange} /></th>
              <th><SortableHeader label="수량" sortKey="quantity" sort={sort} onSortChange={onSortChange} /></th>
              <th><SortableHeader label="금액" sortKey="amount" sort={sort} onSortChange={onSortChange} /></th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.slice(0, 16).map((row, index) => (
                <tr key={row.id || `${row.itemCode || row.itemName || 'item'}-${index}`}>
                  <td>{row.itemName || '-'}</td>
                  <td>{row.itemCode || '-'}</td>
                  <td>{row.category || '-'}</td>
                  <td>{row.vendor || '-'}</td>
                  <td>{row.warehouse || '-'}</td>
                  <td>{row.quantity || '-'}</td>
                  <td>{formatAmount(row.totalPrice || row.supplyValue)}</td>
                  <td>
                    <div className="react-inline-actions">
                      <button type="button" className="react-link-button" onClick={() => onEdit(row)}>
                        수정
                      </button>
                      <button type="button" className="react-link-button is-danger" onClick={() => onDelete(row)}>
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="react-empty-cell">
                  조건에 맞는 품목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}

