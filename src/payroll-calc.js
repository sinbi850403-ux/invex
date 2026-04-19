/**
 * payroll-calc.js - 급여 계산 엔진 (순수 함수)
 *
 * 역할: 직원·근태·급여 데이터 → 최종 실지급액 까지 계산
 * 왜 순수 함수? → 테스트 가능, 함수형 프로그래밍, 부작용 없음
 *
 * 계산 순서 (표준 한국 급여 프로세스):
 * 1. 근태 데이터 수집 (근무시간, 야간, 연장, 휴일)
 * 2. 지급항목 계산
 *    - 기본급
 *    - 고정수당 (식대, 차량비 등)
 *    - 변동수당 (연장급, 야간급, 휴일급)
 * 3. 총지급액 = 모든 수당 합계
 * 4. 4대보험 계산 (과세대상 총지급액 기준)
 * 5. 소득세 · 지방소득세 계산
 * 6. 총공제 = 4대보험 + 소득세 + 기타공제
 * 7. 실지급액 = 총지급액 - 총공제
 */

import {
  INSURANCE_RATES,
  WAGE_MULTIPLIERS,
  calculateIncomeTaxInterpolated,
} from './payroll-rates-2025.js';

/**
 * 4대 보험료 계산
 * @param {number} gross - 과세대상 총지급액
 * @param {object} insuranceFlags - {np: true, hi: true, ei: true, wc: true}
 * @returns {object} { np, hi, ltc, ei }
 */
export function calcInsurance(gross, insuranceFlags = {}) {
  const flags = { np: true, hi: true, ei: true, wc: true, ...insuranceFlags };

  const np = flags.np ? Math.round(gross * INSURANCE_RATES.np) : 0;
  const hi = flags.hi ? Math.round(gross * INSURANCE_RATES.hi) : 0;
  const ltc = flags.hi ? Math.round(hi * INSURANCE_RATES.ltc_rate) : 0; // 건강보험 기준
  const ei = flags.ei ? Math.round(gross * INSURANCE_RATES.ei) : 0;

  return { np, hi, ltc, ei };
}

/**
 * 소득세 및 지방소득세 계산
 * @param {number} gross - 과세대상 총지급액
 * @param {number} dependents - 부양가족수
 * @returns {object} { income_tax, local_tax }
 */
export function calcIncomeTax(gross, dependents = 0) {
  const income_tax = calculateIncomeTaxInterpolated(gross, dependents);
  const local_tax = Math.round(income_tax * INSURANCE_RATES.local_tax_rate);

  return { income_tax, local_tax };
}

/**
 * 야간 근무 시간 분류
 * 야간: 22:00 ~ 06:00
 * @param {string} checkIn - HH:MM 형식
 * @param {string} checkOut - HH:MM 형식
 * @returns {object} { regular_min, night_min }
 */
export function classifyNightHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return { regular_min: 0, night_min: 0 };

  const parseTime = (timeStr) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  let inMin = parseTime(checkIn);
  let outMin = parseTime(checkOut);

  // 자정을 넘는 경우 (예: 22:00 ~ 06:00 다음날)
  if (outMin < inMin) {
    outMin += 24 * 60;
  }

  const NIGHT_START = 22 * 60;     // 22:00 = 1320분
  const NIGHT_END = 6 * 60;        // 06:00 = 360분
  const NIGHT_END_NEXT = NIGHT_END + 24 * 60; // 다음날 06:00

  let nightMin = 0;

  if (inMin < NIGHT_END) {
    // 자정 이전 오전에 들어온 경우
    nightMin = Math.max(0, Math.min(outMin, NIGHT_END_NEXT) - inMin);
  } else if (inMin >= NIGHT_START) {
    // 22:00 이후 들어온 경우
    nightMin = outMin - inMin;
  } else if (outMin > NIGHT_START) {
    // 일반 시간에 들어왔지만 22:00 이후 퇴근
    nightMin = outMin - NIGHT_START;
  }

  const regularMin = (outMin - inMin) - nightMin;

  return { regular_min: Math.max(0, regularMin), night_min: Math.max(0, nightMin) };
}

/**
 * 월별 근태 요약 (시간제 또는 연장 계산용)
 * @param {array} attendanceList - [{work_date, check_in, check_out, break_min, status}]
 * @returns {object} { total_min, overtime_min, night_min, holiday_min, ... }
 */
export function summarizeMonthAttendance(attendanceList = []) {
  let total_min = 0;
  let overtime_min = 0;
  let night_min = 0;
  let holiday_min = 0;
  let absence_days = 0;
  let late_days = 0;

  attendanceList.forEach((att) => {
    if (att.status === '결근') {
      absence_days++;
      return;
    }
    if (att.status === '지각') {
      late_days++;
    }

    // 근무시간 계산 (휴식시간 제외)
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
    work_days: attendanceList.filter((a) => a.status !== '결근').length,
    overtime_min,
    night_min,
    holiday_min,
    absence_days,
    late_days,
    holiday_pay_eligible: holiday_min > 0,
  };
}

/**
 * 시급 근로자의 월급여 계산
 * @param {number} hourlyWage - 시급
 * @param {object} attendance - summarizeMonthAttendance 결과
 * @returns {object} { base, overtime_pay, night_pay, holiday_pay }
 */
export function calcWageFromAttendance(hourlyWage, attendance = {}) {
  const {
    total_min = 0,
    overtime_min = 0,
    night_min = 0,
    holiday_min = 0,
  } = attendance;

  // 통상임금 = 시급 (기본으로 가정)
  // 정규 근무시간: total_min - overtime_min
  const regular_min = Math.max(0, total_min - overtime_min);
  const base = Math.round((regular_min / 60) * hourlyWage);

  // 연장급 (1.5배)
  const overtime_pay = Math.round((overtime_min / 60) * hourlyWage * WAGE_MULTIPLIERS.overtime);

  // 야간급 (2.0배, 또는 연장야간은 최소 2.5배 보장)
  // 단순화: night_min은 이미 야간만 분류된 것으로 가정
  const night_pay = Math.round((night_min / 60) * hourlyWage * WAGE_MULTIPLIERS.night);

  // 휴일급 (1.5배)
  const holiday_pay = Math.round((holiday_min / 60) * hourlyWage * WAGE_MULTIPLIERS.holiday);

  return { base, overtime_pay, night_pay, holiday_pay };
}

/**
 * 종합 급여 계산
 * @param {object} employee - {name, base_salary, hourly_wage, employment_type, insurance_flags, dependents, children}
 * @param {object} attendance - {total_min, overtime_min, night_min, holiday_min}
 * @param {object} allowances - {식대: 100000, 차량비: 50000, ...}
 * @param {object} otherDeduct - {대출금: 50000, ...}
 * @returns {object} complete payroll object
 */
export function calcPayroll(
  employee = {},
  attendance = {},
  allowances = {},
  otherDeduct = {}
) {
  const {
    base_salary = 0,
    hourly_wage = 0,
    employment_type = '정규직',
    insurance_flags = { np: true, hi: true, ei: true, wc: true },
    dependents = 0,
    children = 0,
  } = employee;

  // 1. 지급항목 계산
  let result = {
    base: 0,
    allowances: { ...allowances },
    overtime_pay: 0,
    night_pay: 0,
    holiday_pay: 0,
    gross: 0,
    np: 0,
    hi: 0,
    ltc: 0,
    ei: 0,
    income_tax: 0,
    local_tax: 0,
    other_deduct: { ...otherDeduct },
    total_deduct: 0,
    net: 0,
  };

  // 기본급 또는 시급 계산
  if (employment_type === '시급' || employment_type === '일용') {
    const wage = calcWageFromAttendance(hourly_wage, attendance);
    result.base = wage.base;
    result.overtime_pay = wage.overtime_pay;
    result.night_pay = wage.night_pay;
    result.holiday_pay = wage.holiday_pay;
  } else {
    // 월급 근로자
    result.base = base_salary;
    // 고정급 근로자는 근태 기반 추가 계산 없음
    // (별도 정책에 따라 추가 로직 가능)
  }

  // 무급휴가 차감 (병가, 경조, 무급 등)
  // 출석 데이터에서 휴가 일수만 파악 가능하므로
  // 현재는 모든 휴가를 무급으로 처리
  const leaveDays = attendance.leave_days || 0;
  if (leaveDays > 0 && result.base > 0) {
    const workDaysInMonth = Math.max(1, (attendance.work_days || 22)); // 기본값 22일
    const dailyWage = result.base / workDaysInMonth;
    const leaveDeduction = Math.round(leaveDays * dailyWage);
    result.base = Math.max(0, result.base - leaveDeduction);
  }

  // 2. 총지급액 계산
  const allowanceSum = Object.values(allowances).reduce((a, b) => a + b, 0);
  result.gross =
    result.base +
    allowanceSum +
    result.overtime_pay +
    result.night_pay +
    result.holiday_pay;

  // 3. 4대보험 계산
  const insurance = calcInsurance(result.gross, insurance_flags);
  result.np = insurance.np;
  result.hi = insurance.hi;
  result.ltc = insurance.ltc;
  result.ei = insurance.ei;

  // 4. 소득세 계산 (부양가족 기준)
  const tax = calcIncomeTax(result.gross, dependents);
  result.income_tax = tax.income_tax;
  result.local_tax = tax.local_tax;

  // 5. 총공제
  const otherDeductSum = Object.values(otherDeduct).reduce((a, b) => a + b, 0);
  result.total_deduct =
    result.np +
    result.hi +
    result.ltc +
    result.ei +
    result.income_tax +
    result.local_tax +
    otherDeductSum;

  // 6. 실지급액
  result.net = Math.max(0, result.gross - result.total_deduct);

  return result;
}

/**
 * 퇴직금 계산
 * @param {number} avgSalary - 최근 3개월 평균 월급
 * @param {number} yearsOfService - 근속년수
 * @returns {number} 퇴직금
 */
export function calcSeverancePay(avgSalary, yearsOfService) {
  // 퇴직금 = 평균임금 × 30일 × 근속년수
  return Math.round(avgSalary * 30 * yearsOfService);
}

/**
 * 연차 자동 부여 (입사일 기준)
 * @param {string} hireDate - YYYY-MM-DD
 * @param {string} referenceDate - 기준일 YYYY-MM-DD (기본값: 오늘)
 * @returns {number} 부여 연차일수
 */
export function calcAnnualLeaveDays(hireDate, referenceDate = null) {
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const hire = new Date(hireDate);

  const years = (ref - hire) / (365.25 * 24 * 60 * 60 * 1000);

  if (years < 1) {
    // 1년 미만: 월 1일
    return Math.floor(years * 12);
  } else if (years < 3) {
    // 1년 이상 3년 미만: 15일
    return 15;
  } else {
    // 3년 이상: 15일 + 2년마다 1일
    const additional = Math.floor((years - 3) / 2);
    return Math.min(15 + additional, 25);
  }
}

/**
 * 검증: 계산 결과가 합리적인지 확인
 * @param {object} payroll - calcPayroll 결과
 * @returns {array} 경고 메시지 배열
 */
export function validatePayroll(payroll = {}) {
  const warnings = [];

  if (payroll.gross <= 0) {
    warnings.push('총지급액이 0 이하입니다.');
  }

  if (payroll.gross < 1000000 && payroll.income_tax > 0) {
    // 100만원 미만은 소득세가 없어야 함
    warnings.push('저임금인데 소득세가 있습니다. 재확인하세요.');
  }

  if (payroll.net < 0) {
    warnings.push('실지급액이 음수입니다. 공제액을 확인하세요.');
  }

  if (payroll.total_deduct > payroll.gross) {
    warnings.push('총공제액이 총지급액을 초과합니다.');
  }

  return warnings;
}
