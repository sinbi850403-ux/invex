import { describe, it, expect } from 'vitest';
import { autoMap, buildMappedData, ERP_FIELDS, NUMERIC_FIELDS } from './excelFieldMap';

describe('autoMap', () => {
  it('한글 헤더를 ERP 필드로 매핑한다', () => {
    const headers = ['품목명', '수량', '단가'];
    const mapping = autoMap(headers);
    expect(mapping.itemName).toBe(0);
    expect(mapping.quantity).toBe(1);
    expect(mapping.unitPrice).toBe(2);
  });

  it('영문 헤더도 매핑한다', () => {
    const mapping = autoMap(['item', 'qty', 'price']);
    expect(mapping.itemName).toBe(0);
    expect(mapping.quantity).toBe(1);
    expect(mapping.unitPrice).toBe(2);
  });

  it('이미 매핑된 인덱스는 중복 할당하지 않는다', () => {
    const headers = ['품목명', '품목'];
    const mapping = autoMap(headers);
    const values = Object.values(mapping);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });

  it('fillMissingOnly: 기존 매핑이 있는 필드는 건드리지 않는다', () => {
    const headers = ['품목명', '수량'];
    const existing = { itemName: 99 };
    autoMap(headers, existing, { fillMissingOnly: true });
    expect(existing.itemName).toBe(99);
    expect(existing.quantity).toBe(1);
  });

  it('매핑되지 않는 헤더는 무시한다', () => {
    const mapping = autoMap(['알수없음', '모름']);
    expect(Object.keys(mapping)).toHaveLength(0);
  });
});

describe('buildMappedData', () => {
  it('데이터 행을 ERP 필드 객체로 변환한다', () => {
    const headers = ['품목명', '수량', '단가'];
    const mapping = autoMap(headers);
    const dataRows = [['사과', '10', '500']];
    const result = buildMappedData(dataRows, mapping);
    expect(result[0].itemName).toBe('사과');
    expect(result[0].quantity).toBe(10);
    expect(result[0].unitPrice).toBe(500);
  });

  it('빈 행은 제외한다', () => {
    const mapping = { itemName: 0, quantity: 1 };
    const dataRows = [['사과', '5'], ['', ''], ['배', '3']];
    const result = buildMappedData(dataRows, mapping);
    expect(result).toHaveLength(2);
  });

  it('숫자 필드는 parseFloat으로 변환한다', () => {
    const mapping = { quantity: 0 };
    const result = buildMappedData([['1,234']], mapping);
    expect(result[0].quantity).toBe(1234);
  });

  it('숫자 필드가 공백이면 원본 문자열 유지 (변환 안 함)', () => {
    const mapping = { quantity: 0 };
    const result = buildMappedData([['  ']], mapping);
    // clean.trim() === '' → 숫자 변환 건너뜀, 원본값 그대로 유지
    expect(result[0].quantity).toBe('  ');
  });
});

describe('ERP_FIELDS / NUMERIC_FIELDS', () => {
  it('ERP_FIELDS에 필수 필드(itemName, quantity)가 있다', () => {
    const requiredKeys = ERP_FIELDS.filter(f => f.required).map(f => f.key);
    expect(requiredKeys).toContain('itemName');
    expect(requiredKeys).toContain('quantity');
  });

  it('NUMERIC_FIELDS에 quantity, unitPrice가 포함된다', () => {
    expect(NUMERIC_FIELDS.has('quantity')).toBe(true);
    expect(NUMERIC_FIELDS.has('unitPrice')).toBe(true);
  });
});
