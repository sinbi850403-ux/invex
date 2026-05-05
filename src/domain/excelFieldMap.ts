/**
 * excelFieldMap.ts — 엑셀 업로드/매핑 공통 필드 정의
 */

export interface ErpField {
  key: string;
  label: string;
  required: boolean;
}

export type FieldMapping = Record<string, number | undefined>;
export type MappedRow = Record<string, unknown>;

export const ERP_FIELDS: ErpField[] = [
  { key: 'itemName',    label: '품목명',       required: true },
  { key: 'itemCode',    label: '품목코드',     required: false },
  { key: 'category',    label: '분류',         required: false },
  { key: 'spec',        label: '규격',         required: false },
  { key: 'color',       label: '색상',         required: false },
  { key: 'year',        label: '년도',         required: false },
  { key: 'vendor',      label: '거래처',       required: false },
  { key: 'quantity',    label: '수량',         required: true },
  { key: 'unit',        label: '단위',         required: false },
  { key: 'unitPrice',   label: '매입가(원가)', required: false },
  { key: 'salePrice',   label: '판매가(소가)', required: false },
  { key: 'supplyValue', label: '공급가액',     required: false },
  { key: 'vat',         label: '부가세',       required: false },
  { key: 'totalPrice',  label: '합계금액',     required: false },
  { key: 'inDate',      label: '입고일자',     required: false },
  { key: 'warehouse',   label: '창고/위치',    required: false },
  { key: 'expiryDate',  label: '유통기한',     required: false },
  { key: 'lotNumber',   label: 'LOT번호',      required: false },
  { key: 'note',        label: '비고',         required: false },
  { key: 'safetyStock', label: '안전재고',     required: false },
];

export const MAPPING_KEYWORDS: Record<string, string[]> = {
  itemName:    ['품목명', '품목', '품명', '제품명', '상품명', '이름', 'name', 'item', '자재명', '자재'],
  itemCode:    ['품목코드', '코드', 'code', '품번', 'sku', '자재코드', '상품코드'],
  category:    ['분류', '카테고리', 'category', '유형', '종류', '구분', '자산'],
  spec:        ['규격', 'spec', '사양', '스펙'],
  color:       ['색상', 'color', '컬러', '칼라'],
  year:        ['년도', '연도', 'year', '입고년도', '제조년도'],
  vendor:      ['거래처', '업체', '업체명', '공급업체', '공급처', '매입처', 'vendor', 'supplier', '거래선'],
  quantity:    ['수량', 'qty', 'quantity', '재고', '개수', '입고수량', '출고수량', '현재고'],
  unit:        ['단위', 'unit', 'uom'],
  unitPrice:   ['매입가', '원가', '단가', '매입단가', '입고단가', '입고가', '사입가', '도매가', 'cost', 'price'],
  salePrice:   ['판매가', '소가', '판매단가', '소비자가', '외상단가', '출고단가', '출고가', '매출단가', '매출가', '소매가', 'sale', 'selling', 'retail'],
  supplyValue: ['공급가액', '공급가', '금액'],
  vat:         ['부가세', '세액', 'vat', 'tax'],
  totalPrice:  ['합계금액', '총금액', '합계', 'total', '총액'],
  inDate:      ['입고일자', '입고일', '날짜', 'date', 'indate', '입고날짜'],
  warehouse:   ['창고', '위치', 'warehouse', 'location', '보관', '저장위치'],
  expiryDate:  ['유통기한', '유효기한', '만료일', 'expiry', 'exp', '사용기한'],
  lotNumber:   ['lot', 'LOT', '로트', '로트번호', 'batch', '배치'],
  note:        ['비고', 'note', 'memo', '메모', '참고', '특이사항'],
  safetyStock: ['안전재고', '최소재고', '최소수량', 'safetystock'],
};

export const NUMERIC_FIELDS = new Set<string>([
  'quantity', 'unitPrice', 'salePrice', 'supplyValue', 'vat', 'totalPrice', 'safetyStock',
]);

export function autoMap(
  headers: string[],
  mapping: FieldMapping = {},
  { fillMissingOnly = false }: { fillMissingOnly?: boolean } = {}
): FieldMapping {
  const lower = headers.map(h => (h || '').toString().toLowerCase().trim());
  const usedIdx = new Set(Object.values(mapping).filter((v): v is number => Number.isInteger(v)));

  ERP_FIELDS.forEach(field => {
    if (fillMissingOnly && mapping[field.key] !== undefined) return;
    const kws = MAPPING_KEYWORDS[field.key] || [];
    const matchIdx = lower.findIndex((h, idx) => !usedIdx.has(idx) && kws.some(kw => h.includes(kw)));
    if (matchIdx >= 0) {
      mapping[field.key] = matchIdx;
      usedIdx.add(matchIdx);
    }
  });

  return mapping;
}

export function buildMappedData(dataRows: unknown[][], mapping: FieldMapping): MappedRow[] {
  return dataRows
    .filter(row => (row as unknown[]).some(cell => cell !== '' && cell != null))
    .map(row => {
      const obj: MappedRow = {};
      ERP_FIELDS.forEach(field => {
        const ci = mapping[field.key];
        let val: unknown = ci !== undefined ? ((row as unknown[])[ci] ?? '') : '';
        if (NUMERIC_FIELDS.has(field.key) && typeof val === 'string') {
          const clean = val.replace(/,/g, '').trim();
          if (clean !== '' && !isNaN(Number(clean))) val = parseFloat(clean);
        }
        obj[field.key] = val;
      });
      return obj;
    });
}
