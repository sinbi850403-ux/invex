import { describe, it, expect } from 'vitest';
import {
  calcInsurance,
  calcIncomeTax,
  calcSeverancePay,
  calcAnnualLeaveDays,
  validatePayroll,
  calcPayroll,
  classifyNightHours,
  summarizeMonthAttendance,
} from './payroll-calc';
import { INSURANCE_RATES } from './payroll-rates-2025.js';

describe('calcInsurance', () => {
  it('국민연금 = gross × 4.5%', () => {
    const { np } = calcInsurance(3000000);
    expect(np).toBe(Math.round(3000000 * INSURANCE_RATES.np));
  });

  it('건강보험 = gross × 3.545%', () => {
    const { hi } = calcInsurance(3000000);
    expect(hi).toBe(Math.round(3000000 * INSURANCE_RATES.hi));
  });

  it('장기요양 = 건강보험료 × 12.95%', () => {
    const result = calcInsurance(3000000);
    expect(result.ltc).toBe(Math.round(result.hi * INSURANCE_RATES.ltc_rate));
  });

  it('고용보험 = gross × 0.9%', () => {
    const { ei } = calcInsurance(3000000);
    expect(ei).toBe(Math.round(3000000 * INSURANCE_RATES.ei));
  });

  it('보험 미가입 플래그면 해당 항목 0', () => {
    const result = calcInsurance(3000000, { np: false, hi: false, ei: false });
    expect(result.np).toBe(0);
    expect(result.hi).toBe(0);
    expect(result.ltc).toBe(0);
    expect(result.ei).toBe(0);
  });

  it('gross=0이면 모두 0', () => {
    const result = calcInsurance(0);
    expect(result.np + result.hi + result.ltc + result.ei).toBe(0);
  });
});

describe('calcIncomeTax', () => {
  it('급여 100만원 미만이면 소득세 0', () => {
    const { income_tax } = calcIncomeTax(900000, 1);
    expect(income_tax).toBe(0);
  });

  it('부양가족이 많을수록 소득세가 낮거나 같다', () => {
    const t0 = calcIncomeTax(3000000, 0).income_tax;
    const t2 = calcIncomeTax(3000000, 2).income_tax;
    expect(t2).toBeLessThanOrEqual(t0);
  });

  it('지방소득세 = 소득세 × 10%', () => {
    const { income_tax, local_tax } = calcIncomeTax(3000000, 1);
    expect(local_tax).toBe(Math.round(income_tax * 0.1));
  });
});

describe('calcSeverancePay', () => {
  it('1년 근속 시 평균월급 × 30일', () => {
    expect(calcSeverancePay(3000000, 1)).toBe(3000000 * 30);
  });

  it('5년 근속 시 5배', () => {
    expect(calcSeverancePay(3000000, 5)).toBe(3000000 * 30 * 5);
  });

  it('근속년수 0이면 0', () => {
    expect(calcSeverancePay(3000000, 0)).toBe(0);
  });
});

describe('calcAnnualLeaveDays', () => {
  it('입사 6개월 = 6일', () => {
    const hire = new Date();
    hire.setMonth(hire.getMonth() - 6);
    const days = calcAnnualLeaveDays(hire.toISOString().split('T')[0]);
    expect(days).toBe(6);
  });

  it('1년~3년 미만 = 15일', () => {
    const hire = new Date();
    hire.setFullYear(hire.getFullYear() - 2);
    const days = calcAnnualLeaveDays(hire.toISOString().split('T')[0]);
    expect(days).toBe(15);
  });

  it('5년 근속 = 16일 (15 + 1)', () => {
    const days = calcAnnualLeaveDays('2020-01-01', '2025-01-01');
    expect(days).toBe(16);
  });

  it('20년 이상도 최대 25일', () => {
    const days = calcAnnualLeaveDays('2000-01-01', '2025-01-01');
    expect(days).toBeLessThanOrEqual(25);
  });
});

describe('validatePayroll', () => {
  it('정상 급여는 경고 없음', () => {
    const warnings = validatePayroll({ gross: 3000000, net: 2500000, total_deduct: 500000, income_tax: 37550 });
    expect(warnings).toHaveLength(0);
  });

  it('총지급액 0이면 경고', () => {
    const warnings = validatePayroll({ gross: 0, net: 0, total_deduct: 0 });
    expect(warnings.some(w => w.includes('총지급액'))).toBe(true);
  });

  it('공제액이 총지급액 초과하면 경고', () => {
    const warnings = validatePayroll({ gross: 1000000, net: -100000, total_deduct: 1100000 });
    expect(warnings.some(w => w.includes('총공제액'))).toBe(true);
  });
});

describe('classifyNightHours', () => {
  it('빈 시간은 0 반환', () => {
    expect(classifyNightHours('', '09:00')).toEqual({ regular_min: 0, night_min: 0 });
  });

  it('주간 근무는 야간 없음', () => {
    const { night_min } = classifyNightHours('09:00', '18:00');
    expect(night_min).toBe(0);
  });

  it('22:00~01:00은 야간 180분', () => {
    const { night_min } = classifyNightHours('22:00', '01:00');
    expect(night_min).toBe(180);
  });
});

describe('summarizeMonthAttendance', () => {
  it('빈 배열은 모두 0', () => {
    const s = summarizeMonthAttendance([]);
    expect(s.total_min).toBe(0);
    expect(s.absence_days).toBe(0);
  });

  it('결근은 total_min에 포함 안 됨', () => {
    const s = summarizeMonthAttendance([{ status: '결근' }, { status: '정상', work_min: 480 }]);
    expect(s.absence_days).toBe(1);
    expect(s.work_days).toBe(1);
  });
});

describe('calcPayroll 통합 테스트', () => {
  it('월급 300만원 직원의 실지급액이 총지급액보다 작다', () => {
    const result = calcPayroll({ base_salary: 3000000, dependents: 1 });
    expect(result.net).toBeLessThan(result.gross);
    expect(result.net).toBeGreaterThan(0);
  });

  it('net = gross - total_deduct', () => {
    const result = calcPayroll({ base_salary: 2500000 });
    expect(result.net).toBe(result.gross - result.total_deduct);
  });

  it('수당이 있으면 gross가 base보다 크다', () => {
    const result = calcPayroll({ base_salary: 3000000 }, {}, { 식대: 200000 });
    expect(result.gross).toBeGreaterThan(result.base);
  });
});
