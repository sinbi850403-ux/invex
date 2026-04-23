import { useMemo, useState, type FormEvent } from 'react';
import type { InoutInput } from '../../../services/inout/inoutService';

type SubmitResult = {
  ok: boolean;
  message?: string;
};

type InoutComposerProps = {
  items: Array<{
    itemName?: string;
    itemCode?: string;
    category?: string;
    unit?: string;
    vendor?: string;
    warehouse?: string;
    unitPrice?: number | string;
  }>;
  vendors: string[];
  warehouses: string[];
  onSubmit: (value: InoutInput) => SubmitResult;
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

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function buildItemKey(item: { itemName?: string; itemCode?: string }) {
  return `${normalizeText(item.itemCode)}::${normalizeText(item.itemName)}`;
}

export function InoutComposer({ items, vendors, warehouses, onSubmit }: InoutComposerProps) {
  const [form, setForm] = useState<InoutInput>(defaultForm);
  const [selectedItemKey, setSelectedItemKey] = useState('');
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const itemOptions = useMemo(() => items.filter((item) => normalizeText(item.itemName)), [items]);
  const selectedItem = useMemo(
    () => itemOptions.find((item) => buildItemKey(item) === selectedItemKey) || null,
    [itemOptions, selectedItemKey],
  );

  const mergedWarehouseOptions = useMemo(
    () =>
      [...new Set([...warehouses, ...itemOptions.map((item) => normalizeText(item.warehouse)).filter(Boolean)])].sort(),
    [itemOptions, warehouses],
  );

  function update<K extends keyof InoutInput>(key: K, value: InoutInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (formMessage) setFormMessage(null);
  }

  function applySelectedItem(selected: (typeof itemOptions)[number]) {
    const unitPrice = Number(selected.unitPrice || 0);
    const nextKey = buildItemKey(selected);
    setSelectedItemKey(nextKey);
    setForm((current) => ({
      ...current,
      itemName: normalizeText(selected.itemName),
      itemCode: normalizeText(selected.itemCode),
      vendor: normalizeText(selected.vendor) || current.vendor,
      warehouse: normalizeText(selected.warehouse) || current.warehouse,
      unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : current.unitPrice,
    }));
  }

  function findItemFromInputs() {
    const code = normalizeText(form.itemCode);
    const name = normalizeText(form.itemName);

    if (code) {
      const byCode = itemOptions.find((item) => normalizeText(item.itemCode) === code);
      if (byCode) return byCode;
    }

    if (name) {
      const byName = itemOptions.find((item) => normalizeText(item.itemName) === name);
      if (byName) return byName;
    }

    return null;
  }

  function bindMasterFieldsFromInput() {
    const matched = findItemFromInputs();
    if (!matched) return;
    applySelectedItem(matched);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = onSubmit(form);
    if (!result.ok) {
      setFormMessage({ type: 'error', text: result.message || '입력값을 확인해 주세요.' });
      return;
    }

    setFormMessage({ type: 'success', text: result.message || '입출고를 등록했습니다.' });
    setForm((current) => ({
      ...defaultForm,
      type: current.type,
      date: new Date().toISOString().slice(0, 10),
    }));
    setSelectedItemKey('');
  }

  function handleSelectItem(nextKey: string) {
    setSelectedItemKey(nextKey);
    const selected = itemOptions.find((item) => buildItemKey(item) === nextKey);
    if (!selected) return;
    applySelectedItem(selected);
  }

  return (
    <article className="react-card">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">입출고 등록</span>
          <h3>입고/출고 이력 추가</h3>
        </div>
      </div>

      <form className="react-form-grid" onSubmit={handleSubmit}>
        <div className="react-field">
          <span>유형</span>
          <select className="react-select" value={form.type} onChange={(e) => update('type', e.target.value as 'in' | 'out')}>
            <option value="in">입고</option>
            <option value="out">출고</option>
          </select>
        </div>

        <div className="react-field react-field--wide">
          <span>품목 선택</span>
          <select className="react-select" value={selectedItemKey} onChange={(e) => handleSelectItem(e.target.value)}>
            <option value="">선택하면 거래처/창고/단가가 자동 채워집니다.</option>
            {itemOptions.map((item) => {
              const itemName = normalizeText(item.itemName);
              const itemCode = normalizeText(item.itemCode);
              const key = buildItemKey(item);
              return (
                <option key={key} value={key}>
                  {itemName}
                  {itemCode ? ` (${itemCode})` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div className="react-field">
          <span>품목명</span>
          <input
            className="react-input"
            value={form.itemName}
            onChange={(e) => update('itemName', e.target.value)}
            onBlur={bindMasterFieldsFromInput}
            placeholder="예: 아메리카노 원두 1kg"
            required
          />
        </div>

        <div className="react-field">
          <span>품목코드</span>
          <input
            className="react-input"
            value={form.itemCode}
            onChange={(e) => update('itemCode', e.target.value)}
            onBlur={bindMasterFieldsFromInput}
            placeholder="예: BEAN-1KG"
          />
          <small className="react-field-help">품목코드/품목명이 등록값과 같으면 마스터 정보를 자동 반영합니다.</small>
        </div>

        <div className="react-field">
          <span>카테고리</span>
          <input className="react-input" value={selectedItem?.category || ''} readOnly placeholder="품목 선택 시 자동 표시" />
        </div>

        <div className="react-field">
          <span>단위</span>
          <input className="react-input" value={selectedItem?.unit || ''} readOnly placeholder="품목 선택 시 자동 표시" />
        </div>

        <div className="react-field">
          <span>거래처</span>
          <select className="react-select" value={form.vendor} onChange={(e) => update('vendor', e.target.value)}>
            <option value="">거래처 선택</option>
            {vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
        </div>

        <div className="react-field">
          <span>창고</span>
          <select className="react-select" value={form.warehouse} onChange={(e) => update('warehouse', e.target.value)}>
            <option value="">창고 선택</option>
            {mergedWarehouseOptions.map((warehouse) => (
              <option key={warehouse} value={warehouse}>
                {warehouse}
              </option>
            ))}
          </select>
        </div>

        <div className="react-field">
          <span>거래일</span>
          <input className="react-input" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />
        </div>

        <div className="react-field">
          <span>수량</span>
          <input
            className="react-input"
            type="number"
            min={1}
            step="1"
            value={form.quantity}
            onChange={(e) => update('quantity', Number(e.target.value))}
            placeholder={`수량${selectedItem?.unit ? ` (${selectedItem.unit})` : ''}`}
            required
          />
        </div>

        <div className="react-field">
          <span>단가</span>
          <input
            className="react-input"
            type="number"
            min={0}
            step="1"
            value={form.unitPrice}
            onChange={(e) => update('unitPrice', Number(e.target.value))}
            placeholder="0"
            required
          />
        </div>

        <div className="react-field react-field--wide">
          <span>비고</span>
          <input className="react-input react-input--wide" value={form.note} onChange={(e) => update('note', e.target.value)} placeholder="선택 사항" />
        </div>

        {formMessage ? (
          <p className={formMessage.type === 'error' ? 'react-inline-feedback is-error' : 'react-inline-feedback is-success'}>
            {formMessage.text}
          </p>
        ) : null}

        <div className="react-form-actions">
          <button type="submit" className="react-auth-submit">
            거래 등록
          </button>
        </div>
      </form>
    </article>
  );
}
