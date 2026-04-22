import { useMemo, useState, type FormEvent } from 'react';
import type { InoutInput } from '../../../services/inout/inoutService';

type InoutComposerProps = {
  items: Array<{
    itemName?: string;
    itemCode?: string;
    vendor?: string;
    warehouse?: string;
    unitPrice?: number | string;
  }>;
  vendors: string[];
  onSubmit: (value: InoutInput) => void;
};

const defaultForm: InoutInput = {
  type: 'in',
  itemName: '',
  itemCode: '',
  vendor: '',
  warehouse: '',
  quantity: 0,
  unitPrice: 0,
  date: new Date().toISOString().slice(0, 10),
  note: '',
};

export function InoutComposer({ items, vendors, onSubmit }: InoutComposerProps) {
  const [form, setForm] = useState<InoutInput>(defaultForm);
  const [selectedItemKey, setSelectedItemKey] = useState('');

  const itemOptions = useMemo(
    () => items.filter((item) => String(item.itemName || '').trim()),
    [items],
  );

  function update<K extends keyof InoutInput>(key: K, value: InoutInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.itemName.trim() || !form.date) return;
    onSubmit(form);
    setForm(defaultForm);
  }

  function handleSelectItem(nextKey: string) {
    setSelectedItemKey(nextKey);
    const selected = itemOptions.find(
      (item) => `${String(item.itemCode || '').trim()}::${String(item.itemName || '').trim()}` === nextKey,
    );
    if (!selected) return;

    const unitPrice = Number(selected.unitPrice || 0);
    setForm((current) => ({
      ...current,
      itemName: String(selected.itemName || '').trim(),
      itemCode: String(selected.itemCode || '').trim(),
      vendor: current.vendor || String(selected.vendor || '').trim(),
      warehouse: current.warehouse || String(selected.warehouse || '').trim(),
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    }));
  }

  return (
    <article className="react-card">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">Transaction composer</span>
          <h3>Create inbound or outbound entry</h3>
        </div>
      </div>

      <form className="react-form-grid" onSubmit={handleSubmit}>
        <select className="react-select" value={form.type} onChange={(e) => update('type', e.target.value as 'in' | 'out')}>
          <option value="in">Inbound</option>
          <option value="out">Outbound</option>
        </select>
        <select className="react-select" value={selectedItemKey} onChange={(e) => handleSelectItem(e.target.value)}>
          <option value="">Select item</option>
          {itemOptions.map((item) => {
            const itemName = String(item.itemName || '').trim();
            const itemCode = String(item.itemCode || '').trim();
            const key = `${itemCode}::${itemName}`;
            return (
              <option key={key} value={key}>
                {itemName}{itemCode ? ` (${itemCode})` : ''}
              </option>
            );
          })}
        </select>
        <input className="react-input" value={form.itemName} onChange={(e) => update('itemName', e.target.value)} placeholder="Item name" />
        <input className="react-input" value={form.itemCode} onChange={(e) => update('itemCode', e.target.value)} placeholder="Item code" />
        <select className="react-select" value={form.vendor} onChange={(e) => update('vendor', e.target.value)}>
          <option value="">Select vendor</option>
          {vendors.map((vendor) => (
            <option key={vendor} value={vendor}>
              {vendor}
            </option>
          ))}
        </select>
        <input className="react-input" value={form.warehouse} onChange={(e) => update('warehouse', e.target.value)} placeholder="Warehouse" />
        <input className="react-input" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
        <input className="react-input" type="number" value={form.quantity} onChange={(e) => update('quantity', Number(e.target.value))} placeholder="Quantity" />
        <input className="react-input" type="number" value={form.unitPrice} onChange={(e) => update('unitPrice', Number(e.target.value))} placeholder="Unit price" />
        <input className="react-input react-input--wide" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="Note" />

        <div className="react-form-actions">
          <button type="submit" className="react-auth-submit">
            Save transaction
          </button>
        </div>
      </form>
    </article>
  );
}
