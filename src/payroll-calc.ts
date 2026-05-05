/**
 * payroll-calc.ts - 급여 계산 엔진 (순수 함수)
 *
 * 계산 순서: 근태 수집 → 지급항목 → 총지급 → 4대보험 → 소득세 → 총공제 → 실지급
 */

import {
  INSURANCE_RATES,
  WAGE_MULTIPLIERS,
  calculateIncomeTaxInterpolated,
} from './payroll-rates-2025.js';

export interface InsuranceFlags {
  np?: boolean;
  hi?: boolean;
  ei?: boolean;
  wc?: boolean;
}

export interface InsuranceResult {
  np: number;
  hi: number;
  ltc: number;
  ei: number;
}

export interface TaxResult {
  income_tax: number;
  local_tax: number;
}

export interface NightHoursResult {
  regular_min: number;
  night_min: number;
}

export interface AttendanceRecord {
  status?: string;
  work_min?: number;
  break_min?: number;
  overtime_min?: number;
  night_min?: number;
  holiday_min?: number;
}

export interface AttendanceSummary {
  total_days: number;
  total_min: number;
  work_days: number;
  overtime_min: number;
  night_min: number;
  holiday_min: number;
  absence_days: number;
  late_days: number;
  holiday_pay_eligible: boolean;
  leave_days?: number;
}

export interface WageResult {
  base: number;
  overtime_pay: number;
  night_pay: number;
  holiday_pay: number;
}

export interface EmployeeInput {
  base_salary?: number;
  hourly_wage?: number;
  employment_type?: string;
  insurance_flags?: InsuranceFlags;
  dependents?: number;
  children?: number;
}

export interface PayrollResult {
  base: number;
  allowances: Record<string, number>;
  overtime_pay: number;
  night_pay: number;
  holiday_pay: number;
  gross: number;
  np: number;
  hi: number;
  ltc: number;
  ei: number;
  income_tax: number;
  local_tax: number;
  other_deduct: Record<string, number>;
  total_deduct: number;
  net: number;
}

export function calcInsurance(gross: number, insuranceFlags: InsuranceFlags = {}): InsuranceResult {
  const flags = { np: true, hi: true, ei: true, wc: true, ...insuranceFlags };

  const np = flags.np ? Math.round(gross * INSURANCE_RATES.np) : 0;
  const hi = flags.hi ? Math.round(gross * INSURANCE_RATES.hi) : 0;
  const ltc = flags.hi ? Math.round(hi * INSURANCE_RATES.ltc_rate) : 0;
  const ei = flags.ei ? Math.round(gross * INSURANCE_RATES.ei) : 0;

  return { np, hi, ltc, ei };
}

export function calcIncomeTax(gross: number, dependents = 0): TaxResult {
  const income_tax = calculateIncomeTaxInterpolated(gross, dependents);
  const local_tax = Math.round(income_tax * INSURANCE_RATES.local_tax_rate);
  return { income_tax, local_tax };
}

export function classifyNightHours(checkIn: string, checkOut: string): NightHoursResult {
  if (!checkIn || !checkOut) return { regular_min: 0, night_min: 0 };

  const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  let inMin = parseTime(checkIn);
  let outMin = parseTime(checkOut);

  if (outMin < inMin) {
    outMin += 24 * 60;
  }

  const NIGHT_START = 22 * 60;
  const NIGHT_END = 6 * 60;
  const NIGHT_END_NEXT = NIGHT_END + 24 * 60;

  let nightMin = 0;

  if (inMin < NIGHT_END) {
    nightMin = Math.max(0, Math.min(outMin, NIGHT_END_NEXT) - inMin);
  } else if (inMin >= NIGHT_START) {
    nightMin = outMin - inMin;
  } else if (outMin > NIGHT_START) {
    nightMin = outMin - NIGHT_START;
  }

  const regularMin = (outMin - inMin) - nightMin;
  return { regular_min: Math.max(0, regularMin), night_min: Math.max(0, nightMin) };
}

export function summarizeMonthAttendance(attendanceList: AttendanceRecord[] = []): AttendanceSummary {
  let total_min = 0, overtime_min = 0, night_min = 0, holiday_min = 0;
  let absence_days = 0, late_days = 0;

  attendanceList.forEach(att => {
    if (att.status === '결근') { absence_days++; return; }
    if (att.status === '지각') { late_days++; }

    const workMin = att.work_min || 0;
    const breakMin = att.break_min || 0;
    const netMin = Math.max(0, workMin - breakMin);

    total_min += netMin;
    overtime_min += att.overtime_min || 0;
    night_min += att.night_min || 0;
    holiday_min += att.holiday_min || 0;
  });

  return {
    total_days: attendanceList.length,
    total_min,
    work_days: attendanceList.filter(a => a.status !== '결근').length,
    overtime_min,
    night_min,
    holiday_min,
    absence_days,
    late_days,
    holiday_pay_eligible: holiday_min > 0,
  };
}

export function calcWageFromAttendance(hourlyWage: number, attendance: Partial<AttendanceSummary> = {}): WageResult {
  const { total_min = 0, overtime_min = 0, night_min = 0, holiday_min = 0 } = attendance;

  const regular_min = Math.max(0, total_min - overtime_min);
  const base = Math.round((regular_min / 60) * hourlyWage);
  const overtime_pay = Math.round((overtime_min / 60) * hourlyWage * WAGE_MULTIPLIERS.overtime);
  const night_pay = Math.round((night_min / 60) * hourlyWage * WAGE_MULTIPLIERS.night);
  const holiday_pay = Math.round((holiday_min / 60) * hourlyWage * WAGE_MULTIPLIERS.holiday);

  return { base, overtime_pay, night_pay, holiday_pay };
}

export function calcPayroll(
  employee: EmployeeInput = {},
  attendance: Partial<AttendanceSummary> = {},
  allowances: Record<string, number> = {},
  otherDeduct: Record<string, number> = {}
): PayrollResult {
  const {
    base_salary = 0,
    hourly_wage = 0,
    employment_type = '정규직',
    insurance_flags = { np: true, hi: true, ei: true, wc: true },
    dependents = 0,
  } = employee;

  const result: PayrollResult = {
    base: 0,
    allowances: { ...allowances },
    overtime_pay: 0,
    night_pay: 0,
    holiday_pay: 0,
    gross: 0,
    np: 0, hi: 0, ltc: 0, ei: 0,
    income_tax: 0,
    local_tax: 0,
    other_deduct: { ...otherDeduct },
    total_deduct: 0,
    net: 0,
  };

  if (employment_type === '시급' || employment_type === '일용') {
    const wage = calcWageFromAttendance(hourly_wage, attendance);
    result.base = wage.base;
    result.overtime_pay = wage.overtime_pay;
    result.night_pay = wage.night_pay;
    result.holiday_pay = wage.holiday_pay;
  } else {
    result.base = base_salary;
  }

  const leaveDays = (attendance as AttendanceSummary & { leave_days?: number }).leave_days || 0;
  if (leaveDays > 0 && result.base > 0) {
    const workDaysInMonth = Math.max(1, attendance.work_days || 22);
    const dailyWage = result.base / workDaysInMonth;
    result.base = Math.max(0, result.base - Math.round(leaveDays * dailyWage));
  }

  const allowanceSum = Object.values(allowances).reduce((a, b) => a + b, 0);
  result.gross = result.base + allowanceSum + result.overtime_pay + result.night_pay + result.holiday_pay;

  const insurance = calcInsurance(result.gross, insurance_flags);
  result.np = insurance.np;
  result.hi = insurance.hi;
  result.ltc = insurance.ltc;
  result.ei = insurance.ei;

  const tax = calcIncomeTax(result.gross, dependents);
  result.income_tax = tax.income_tax;
  result.local_tax = tax.local_tax;

  const otherDeductSum = Object.values(otherDeduct).reduce((a, b) => a + b, 0);
  result.total_deduct = result.np + result.hi + result.ltc + result.ei + result.income_tax + result.local_tax + otherDeductSum;
  result.net = Math.max(0, result.gross - result.total_deduct);

  return result;
}

export function calcSeverancePay(avgSalary: number, yearsOfService: number): number {
  return Math.round(avgSalary * 30 * yearsOfService);
}

export function calcAnnualLeaveDays(hireDate: string, referenceDate: string | null = null): number {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const hire = new Date(hireDate);
  if (Number.isNaN(ref.getTime()) || Number.isNaN(hire.getTime()) || ref < hire) return 0;

  let months =
    (ref.getFullYear() - hire.getFullYear()) * 12 +
    (ref.getMonth() - hire.getMonth());
  if (ref.getDate() < hire.getDate()) months -= 1;
  months = Math.max(0, months);

  let years = ref.getFullYear() - hire.getFullYear();
  if (
    ref.getMonth() < hire.getMonth() ||
    (ref.getMonth() === hire.getMonth() && ref.getDate() < hire.getDate())
  ) {
    years -= 1;
  }

  if (years < 1) return months;
  if (years < 3) return 15;
  const additional = Math.floor((years - 3) / 2);
  return Math.min(15 + additional, 25);
}

export function validatePayroll(payroll: Partial<PayrollResult> = {}): string[] {
  const warnings: string[] = [];

  if ((payroll.gross ?? 0) <= 0) warnings.push('총지급액이 0 이하입니다.');
  if ((payroll.gross ?? 0) < 1000000 && (payroll.income_tax ?? 0) > 0) warnings.push('저임금인데 소득세가 있습니다. 재확인하세요.');
  if ((payroll.net ?? 0) < 0) warnings.push('실지급액이 음수입니다. 공제액을 확인하세요.');
  if ((payroll.total_deduct ?? 0) > (payroll.gross ?? 0)) warnings.push('총공제액이 총지급액을 초과합니다.');

  return warnings;
}
