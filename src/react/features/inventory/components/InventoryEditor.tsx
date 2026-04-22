import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryInput } from '../../../services/inventory/inventoryService';

type InventoryEditorProps = {
  initialValue: InventoryInput;
  isEditing: boolean;
  vendors: string[];
  warehouses: string[];
  onCancelEdit: () => void;
  onSubmit: (value: InventoryInput) => void;
};

const emptyForm: InventoryInput = {
  itemName: '',
  itemCode: '',
  category: '',
  vendor: '',
  warehouse: '',
  quantity: 0,
  unit: 'EA',
  unitPrice: 0,
};

export function InventoryEditor({
  initialValue,
  isEditing,
  vendors,
  warehouses,
  onCancelEdit,
  onSubmit,
}: InventoryEditorProps) {
  const [form, setForm] = useState<InventoryInput>(initialValue);

  useEffect(() => {
    setForm(initialValue);
  }, [initialValue]);

  function update<K extends keyof InventoryInput>(key: K, value: InventoryInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.itemName.trim()) return;
    onSubmit(form);
    if (!isEditing) {
      setForm(emptyForm);
    }
  }

  return (
    <article className="react-card">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">Inventory editor</span>
          <h3>{isEditing ? 'Edit inventory item' : 'Create inventory item'}</h3>
        </div>
      </div>

      <form className="react-form-grid" onSubmit={handleSubmit}>
        <input className="react-input" value={form.itemName} onChange={(e) => update('itemName', e.target.value)} placeholder="Item name" />
        <input className="react-input" value={form.itemCode} onChange={(e) => update('itemCode', e.target.value)} placeholder="Item code" />
        <input className="react-input" value={form.category} onChange={(e) => update('category', e.target.value)} placeholder="Category" />
        <select className="react-select" value={form.vendor} onChange={(e) => update('vendor', e.target.value)}>
          <option value="">Select vendor</option>
          {vendors.map((vendor) => (
            <option key={vendor} value={vendor}>
              {vendor}
            </option>
          ))}
        </select>
        <select className="react-select" value={form.warehouse} onChange={(e) => update('warehouse', e.target.value)}>
          <option value="">Select warehouse</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse} value={warehouse}>
              {warehouse}
            </option>
          ))}
        </select>
        <input
          className="react-input"
          type="number"
          value={form.quantity}
          onChange={(e) => update('quantity', Number(e.target.value))}
          placeholder="Quantity"
        />
        <input className="react-input" value={form.unit} onChange={(e) => update('unit', e.target.value)} placeholder="Unit" />
        <input
          className="react-input"
          type="number"
          value={form.unitPrice}
          onChange={(e) => update('unitPrice', Number(e.target.value))}
          placeholder="Unit price"
        />

        <div className="react-form-actions">
          <button type="submit" className="react-auth-submit">
            {isEditing ? 'Save item' : 'Add item'}
          </button>
          {isEditing ? (
            <button type="button" className="react-secondary-button" onClick={onCancelEdit}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
}
