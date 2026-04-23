import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MutationResult } from '../hooks/useInventoryPage';
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
  onSubmit: (value: InventoryInput) => MutationResult;
};

const STORAGE_KEY = 'invex.react.inventory.defaults';

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

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function getStoredDefaults() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDefaults(next: Partial<InventoryInput>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures and keep the form usable.
  }
}

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
  const [formMessage, setFormMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const normalizedTemplates = useMemo(
    () =>
      itemTemplates.map((item) => ({
        ...item,
        itemName: normalizeText(item.itemName),
        itemCode: normalizeText(item.itemCode),
      })),
    [itemTemplates],
  );

  const estimatedAmount = Math.max(0, Number(form.quantity || 0) * Number(form.unitPrice || 0));

  useEffect(() => {
    if (isEditing) {
      setForm(initialValue);
    } else {
      const defaults = getStoredDefaults();
      setForm({
        ...emptyForm,
        ...defaults,
        ...initialValue,
      });
    }
    setSelectedTemplateKey('');
    setFormMessage(null);
  }, [initialValue, isEditing]);

  function update<K extends keyof InventoryInput>(key: K, value: InventoryInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (formMessage) setFormMessage(null);
  }

  function applyTemplateFields(template: (typeof normalizedTemplates)[number]) {
    setForm((current) => ({
      ...current,
      itemName: template.itemName || current.itemName,
      itemCode: template.itemCode || current.itemCode,
      category: template.category || current.category,
      unit: template.unit || current.unit || 'EA',
      vendor: template.vendor || current.vendor,
      warehouse: template.warehouse || current.warehouse,
      unitPrice: Number.isFinite(Number(template.unitPrice)) ? Number(template.unitPrice) : current.unitPrice,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = onSubmit(form);
    if (!result.ok) {
      setFormMessage({ type: 'error', text: result.message || '입력값을 다시 확인해주세요.' });
      return;
    }

    saveDefaults({
      category: form.category,
      vendor: form.vendor,
      warehouse: form.warehouse,
      unit: form.unit,
    });

    setFormMessage({ type: 'success', text: result.message || (isEditing ? '품목을 수정했습니다.' : '품목을 등록했습니다.') });
    if (!isEditing) {
      setForm((current) => ({
        ...emptyForm,
        category: current.category,
        vendor: current.vendor,
        warehouse: current.warehouse,
        unit: current.unit || 'EA',
      }));
      setSelectedTemplateKey('');
    }
  }

  function applyTemplate(nextKey: string) {
    setSelectedTemplateKey(nextKey);
    const selected = normalizedTemplates.find((item) => `${item.id}::${item.itemCode}::${item.itemName}` === nextKey);
    if (!selected) return;
    applyTemplateFields(selected);
  }

  function handleItemCodeBlur() {
    if (!normalizeText(form.itemCode)) return;
    const matched = normalizedTemplates.find((item) => item.itemCode && item.itemCode === normalizeText(form.itemCode));
    if (!matched) return;
    applyTemplateFields(matched);
    if (!normalizeText(form.itemName) && matched.itemName) {
      update('itemName', matched.itemName);
    }
  }

  function handleItemNameBlur() {
    if (!normalizeText(form.itemName)) return;
    const matched = normalizedTemplates.find((item) => item.itemName && item.itemName === normalizeText(form.itemName));
    if (!matched) return;
    applyTemplateFields(matched);
    if (!normalizeText(form.itemCode) && matched.itemCode) {
      update('itemCode', matched.itemCode);
    }
  }

  function resetCreateForm() {
    const defaults = getStoredDefaults();
    setForm({
      ...emptyForm,
      ...defaults,
    });
    setSelectedTemplateKey('');
    setFormMessage(null);
  }

  return (
    <article className="react-card">
      <div className="react-section-head">
        <div>
          <span className="react-card__eyebrow">품목 입력</span>
          <h3>{isEditing ? '품목 수정' : '품목 등록'}</h3>
        </div>
        {!isEditing ? (
          <button type="button" className="react-secondary-button" onClick={resetCreateForm}>
            새로 입력
          </button>
        ) : null}
      </div>

      <form className="react-form-grid" onSubmit={handleSubmit}>
        {!isEditing ? (
          <div className="react-field react-field--wide">
            <span>기존 품목 불러오기</span>
            <select className="react-select" value={selectedTemplateKey} onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">선택하면 카테고리, 단위, 거래처, 창고를 자동으로 채웁니다.</option>
              {normalizedTemplates.map((item) => {
                const key = `${item.id}::${item.itemCode}::${item.itemName}`;
                return (
                  <option key={key} value={key}>
                    {item.itemName}
                    {item.itemCode ? ` (${item.itemCode})` : ''}
                  </option>
                );
              })}
            </select>
          </div>
        ) : null}

        <div className="react-field">
          <span>품목명</span>
          <input
            className="react-input"
            value={form.itemName}
            onChange={(e) => update('itemName', e.target.value)}
            onBlur={handleItemNameBlur}
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
            onBlur={handleItemCodeBlur}
            placeholder="예: BEAN-1KG"
          />
          <small className="react-field-help">기존 코드나 품목명을 입력하면 저장된 기본 정보가 자동으로 반영됩니다.</small>
        </div>

        <div className="react-field">
          <span>카테고리</span>
          <select className="react-select" value={form.category} onChange={(e) => update('category', e.target.value)}>
            <option value="">카테고리 선택</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
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
            {warehouses.map((warehouse) => (
              <option key={warehouse} value={warehouse}>
                {warehouse}
              </option>
            ))}
          </select>
        </div>

        <div className="react-field">
          <span>수량</span>
          <input
            className="react-input"
            type="number"
            min={0}
            step="1"
            value={form.quantity}
            onChange={(e) => update('quantity', Number(e.target.value))}
            placeholder="0"
            required
          />
        </div>

        <div className="react-field">
          <span>단위</span>
          <select className="react-select" value={form.unit} onChange={(e) => update('unit', e.target.value)}>
            <option value="">단위 선택</option>
            {units.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
            {!units.includes('EA') ? <option value="EA">EA</option> : null}
          </select>
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
          <span>예상 금액</span>
          <div className="react-inline-metric">{new Intl.NumberFormat('ko-KR').format(estimatedAmount)}원</div>
          <small className="react-field-help">수량 × 단가 기준으로 바로 계산됩니다.</small>
        </div>

        {formMessage ? (
          <p className={formMessage.type === 'error' ? 'react-inline-feedback is-error' : 'react-inline-feedback is-success'}>
            {formMessage.text}
          </p>
        ) : null}

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
