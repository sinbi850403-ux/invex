import { useEffect, useState, type FormEvent } from 'react';
import type { InventoryInput } from '../../../services/inventory/inventoryService';

type InventoryEditorProps = {
  initialValue: InventoryInput;
  isEditing: boolean;
  categories: string[];
  units: string[];
  vendors: string[];
  warehouses: string[];
  itemTemplates: Array<{
    id: string;
    itemName: string;
    itemCode: string;
    category: string;
    unit: string;
    vendor: string;
    warehouse: string;
    unitPrice: number;
  }>;
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
  categories,
  units,
  vendors,
  warehouses,
  itemTemplates,
  onCancelEdit,
  onSubmit,
}: InventoryEditorProps) {
  const [form, setForm] = useState<InventoryInput>(initialValue);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');

  useEffect(() => {
    setForm(initialValue);
    setSelectedTemplateKey('');
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
      setSelectedTemplateKey('');
    }
  }

  function applyTemplate(nextKey: string) {
    setSelectedTemplateKey(nextKey);
    const selected = itemTemplates.find((item) => `${item.id}::${item.itemCode}::${item.itemName}` === nextKey);
    if (!selected) return;

    setForm((current) => ({
      ...current,
      itemName: selected.itemName || current.itemName,
      itemCode: selected.itemCode || current.itemCode,
      category: selected.category || current.category,
      unit: selected.unit || current.unit || 'EA',
      vendor: selected.vendor || current.vendor,
      warehouse: selected.warehouse || current.warehouse,
      unitPrice: Number.isFinite(Number(selected.unitPrice)) ? Number(selected.unitPrice) : current.unitPrice,
    }));
  }

  return (
    <article className="react-card">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">품목 편집기</span>
          <h3>{isEditing ? '품목 수정' : '품목 등록'}</h3>
        </div>
      </div>

      <form className="react-form-grid" onSubmit={handleSubmit}>
        {!isEditing ? (
          <select className="react-select" value={selectedTemplateKey} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">기존 품목 불러오기</option>
            {itemTemplates.map((item) => {
              const key = `${item.id}::${item.itemCode}::${item.itemName}`;
              return (
                <option key={key} value={key}>
                  {item.itemName}
                  {item.itemCode ? ` (${item.itemCode})` : ''}
                </option>
              );
            })}
          </select>
        ) : null}
        <input className="react-input" value={form.itemName} onChange={(e) => update('itemName', e.target.value)} placeholder="품목명" />
        <input className="react-input" value={form.itemCode} onChange={(e) => update('itemCode', e.target.value)} placeholder="품목코드" />
        <select className="react-select" value={form.category} onChange={(e) => update('category', e.target.value)}>
          <option value="">카테고리 선택</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select className="react-select" value={form.vendor} onChange={(e) => update('vendor', e.target.value)}>
          <option value="">거래처 선택</option>
          {vendors.map((vendor) => (
            <option key={vendor} value={vendor}>
              {vendor}
            </option>
          ))}
        </select>
        <select className="react-select" value={form.warehouse} onChange={(e) => update('warehouse', e.target.value)}>
          <option value="">창고 선택</option>
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
          placeholder="수량"
        />
        <select className="react-select" value={form.unit} onChange={(e) => update('unit', e.target.value)}>
          <option value="">단위 선택</option>
          {units.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
          {!units.includes('EA') ? <option value="EA">EA</option> : null}
        </select>
        <input
          className="react-input"
          type="number"
          value={form.unitPrice}
          onChange={(e) => update('unitPrice', Number(e.target.value))}
          placeholder="원가"
        />

        <div className="react-form-actions">
          <button type="submit" className="react-auth-submit">
            {isEditing ? '저장' : '품목 추가'}
          </button>
          {isEditing ? (
            <button type="button" className="react-secondary-button" onClick={onCancelEdit}>
              취소
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
}

