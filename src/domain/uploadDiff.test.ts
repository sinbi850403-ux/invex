import { describe, it, expect } from 'vitest';
import { buildUploadDiff } from './uploadDiff';

const row = (itemName: string, quantity: number | string, extra?: object) =>
  ({ itemName, quantity: String(quantity), ...extra });

describe('buildUploadDiff', () => {
  it('이전에 없던 행은 added로 계산한다', () => {
    const diff = buildUploadDiff([], [row('사과', 10)]);
    expect(diff.added).toBe(1);
    expect(diff.updated).toBe(0);
    expect(diff.unchanged).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('내용이 바뀐 행은 updated로 계산한다', () => {
    const prev = [row('사과', 10)];
    const next = [row('사과', 20)];
    const diff = buildUploadDiff(prev, next);
    expect(diff.updated).toBe(1);
    expect(diff.unchanged).toBe(0);
  });

  it('내용이 같은 행은 unchanged로 계산한다', () => {
    const r = row('사과', 10);
    const diff = buildUploadDiff([r], [{ ...r }]);
    expect(diff.unchanged).toBe(1);
    expect(diff.updated).toBe(0);
  });

  it('이전에만 있던 행은 removed로 계산한다', () => {
    const diff = buildUploadDiff([row('사과', 10), row('배', 5)], [row('사과', 10)]);
    expect(diff.removed).toBe(1);
  });

  it('품목코드 기준으로 매칭한다 (itemCode 우선)', () => {
    const prev = [{ itemCode: 'A001', itemName: '구품목', quantity: '5' }];
    const next = [{ itemCode: 'A001', itemName: '새품목', quantity: '5' }];
    const diff = buildUploadDiff(prev, next);
    expect(diff.updated).toBe(1);
  });

  it('fileName과 at 필드를 반환한다', () => {
    const diff = buildUploadDiff([], [], 'test.xlsx');
    expect(diff.fileName).toBe('test.xlsx');
    expect(typeof diff.at).toBe('string');
  });

  it('빈 배열끼리 비교하면 모두 0', () => {
    const diff = buildUploadDiff([], []);
    expect(diff.added).toBe(0);
    expect(diff.updated).toBe(0);
    expect(diff.unchanged).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('복합 시나리오 — added/updated/unchanged/removed 혼합', () => {
    const prev = [row('사과', 10), row('배', 5), row('포도', 3)];
    const next = [row('사과', 10), row('배', 8), row('수박', 2)];
    const diff = buildUploadDiff(prev, next);
    expect(diff.unchanged).toBe(1); // 사과 동일
    expect(diff.updated).toBe(1);   // 배 수량 변경
    expect(diff.added).toBe(1);     // 수박 신규
    expect(diff.removed).toBe(1);   // 포도 삭제
  });
});
