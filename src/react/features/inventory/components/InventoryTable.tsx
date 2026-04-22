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

type InventoryTableProps = {
  rows: InventoryRow[];
  onEdit: (row: InventoryRow) => void;
  onDelete: (row: InventoryRow) => void;
};

function formatAmount(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? new Intl.NumberFormat('ko-KR').format(parsed) : '-';
}

export function InventoryTable({ rows, onDelete, onEdit }: InventoryTableProps) {
  return (
    <article className="react-card react-card--table">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">Inventory Table</span>
          <h3>Current inventory snapshot</h3>
        </div>
        <strong>{rows.length} rows</strong>
      </div>

      <div className="react-data-table">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Code</th>
              <th>Category</th>
              <th>Vendor</th>
              <th>Warehouse</th>
              <th>Qty</th>
              <th>Value</th>
              <th>Actions</th>
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
                        Edit
                      </button>
                      <button type="button" className="react-link-button is-danger" onClick={() => onDelete(row)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="react-empty-cell">
                  No inventory rows match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>
  );
}
