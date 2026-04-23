import type { InoutInput } from '../inout/inoutService';
import type { InventoryInput } from '../inventory/inventoryService';

type InventoryMasterItem = {
  itemName?: string;
  itemCode?: string;
  category?: string;
  unit?: string;
  vendor?: string;
  warehouse?: string;
  quantity?: number | string;
  unitPrice?: number | string;
};

type InventoryValidationContext = {
  categories?: string[];
  units?: string[];
  vendors?: string[];
  warehouses?: string[];
  existingItems?: InventoryMasterItem[];
};

type InoutValidationContext = {
  inventoryItems?: InventoryMasterItem[];
  vendors?: string[];
  warehouses?: string[];
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function toNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function includesNormalized(options: string[] = [], value: string) {
  if (!value || !options.length) return false;
  const target = normalizeText(value);
  return options.some((option) => normalizeText(option) === target);
}

function validateMasterSelection(label: string, value: string, options: string[] = []) {
  if (!value || !options.length) return null;
  if (includesNormalized(options, value)) return null;
  return `${label}는 등록된 목록에서 선택해 주세요.`;
}

export function findInventoryMasterItem(
  value: Pick<InoutInput, 'itemName' | 'itemCode'>,
  inventoryItems: InventoryMasterItem[] = [],
) {
  const code = normalizeText(value.itemCode);
  const name = normalizeText(value.itemName);
  if (!code && !name) return null;

  if (code) {
    const byCode = inventoryItems.find((item) => normalizeText(item.itemCode) === code);
    if (byCode) return byCode;
  }

  if (name) {
    const byName = inventoryItems.find((item) => normalizeText(item.itemName) === name);
    if (byName) return byName;
  }

  return null;
}

export function isYyyyMmDd(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

export function validateInventoryInput(
  value: InventoryInput,
  context: InventoryValidationContext = {},
): string | null {
  if (!normalizeText(value.itemName)) return '품목명은 필수입니다.';

  const quantity = Number(value.quantity);
  if (!Number.isFinite(quantity)) return '수량은 숫자여야 합니다.';
  if (quantity < 0) return '수량은 0 이상이어야 합니다.';

  const unitPrice = Number(value.unitPrice);
  if (!Number.isFinite(unitPrice)) return '원가는 숫자여야 합니다.';
  if (unitPrice < 0) return '원가는 0 이상이어야 합니다.';

  const categoryError = validateMasterSelection('카테고리', normalizeText(value.category), context.categories || []);
  if (categoryError) return categoryError;

  const unitError = validateMasterSelection('단위', normalizeText(value.unit), context.units || []);
  if (unitError) return unitError;

  const vendorError = validateMasterSelection('거래처', normalizeText(value.vendor), context.vendors || []);
  if (vendorError) return vendorError;

  const warehouseError = validateMasterSelection('창고', normalizeText(value.warehouse), context.warehouses || []);
  if (warehouseError) return warehouseError;

  return null;
}

export function validateInoutInput(
  value: InoutInput,
  context: InoutValidationContext = {},
): string | null {
  if (!normalizeText(value.itemName)) return '품목명은 필수입니다.';
  if (!normalizeText(value.date)) return '거래일은 필수입니다.';
  if (!isYyyyMmDd(value.date)) return '거래일 형식이 올바르지 않습니다. (YYYY-MM-DD)';

  const quantity = Number(value.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return '수량은 1 이상의 숫자여야 합니다.';

  const unitPrice = Number(value.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return '단가는 0 이상의 숫자여야 합니다.';

  const matchedItem = findInventoryMasterItem(value, context.inventoryItems || []);
  if (value.type === 'out') {
    if (!matchedItem) {
      return '출고는 등록된 품목에서만 선택할 수 있습니다.';
    }

    const availableQuantity = toNumber(matchedItem.quantity);
    if (Number.isFinite(availableQuantity) && quantity > availableQuantity) {
      return `출고 수량이 현재 재고(${availableQuantity})를 초과할 수 없습니다.`;
    }
  }

  const vendorError = validateMasterSelection('거래처', normalizeText(value.vendor), context.vendors || []);
  if (vendorError) return vendorError;

  const warehouseError = validateMasterSelection('창고', normalizeText(value.warehouse), context.warehouses || []);
  if (warehouseError) return warehouseError;

  return null;
}
