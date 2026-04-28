import { describe, it, expect } from 'vitest';
import { calcAmount, applyAmounts, applyAmountsAll } from './inventoryAmount';

describe('calcAmount', () => {
  it('수량 × 단가로 공급가액을 계산한다', () => {
    const result = calcAmount(10, 1000);
    expect(result.supplyValue).toBe(10000);
  });

  it('부가세는 공급가액의 10% (floor)', () => {
    const result = calcAmount(3, 333);
    expect(result.vat).toBe(Math.floor(999 * 0.1));
  });

  it('합계 = 공급가액 + 부가세', () => {
    const result = calcAmount(5, 200);
    expect(result.totalPrice).toBe(result.supplyValue + result.vat);
  });

  it('문자열 수량/단가도 숫자로 처리한다', () => {
    const result = calcAmount('5', '200');
    expect(result.supplyValue).toBe(1000);
  });

  it('유효하지 않은 값은 0으로 처리한다', () => {
    const result = calcAmount('abc', undefined as unknown as string);
    expect(result.supplyValue).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.totalPrice).toBe(0);
  });

  it('수량 0이면 모든 금액이 0', () => {
    const result = calcAmount(0, 9999);
    expect(result.supplyValue).toBe(0);
    expect(result.vat).toBe(0);
    expect(result.totalPrice).toBe(0);
  });
});

describe('applyAmounts', () => {
  it('행 객체에 supplyValue/vat/totalPrice를 덮어쓴다', () => {
    const row = { quantity: 10, unitPrice: 500 };
    applyAmounts(row);
    expect(row.supplyValue).toBe(5000);
    expect(row.vat).toBe(500);
    expect(row.totalPrice).toBe(5500);
  });

  it('원본 객체를 반환한다', () => {
    const row = { quantity: 1, unitPrice: 100 };
    const returned = applyAmounts(row);
    expect(returned).toBe(row);
  });
});

describe('applyAmountsAll', () => {
  it('배열의 모든 행에 금액을 적용한다', () => {
    const rows = [
      { quantity: 2, unitPrice: 1000 },
      { quantity: 5, unitPrice: 200 },
    ];
    applyAmountsAll(rows);
    expect(rows[0].supplyValue).toBe(2000);
    expect(rows[1].supplyValue).toBe(1000);
  });

  it('원본 배열을 반환한다', () => {
    const rows = [{ quantity: 1, unitPrice: 100 }];
    const returned = applyAmountsAll(rows);
    expect(returned).toBe(rows);
  });
});
