/**
 * payroll-validation-tests.js
 *
 * 급여 계산 검증 테스트 스위트
 * - 국세청 간이세액표 10건 검증
 * - 4대보험 계산 5건 검증
 * - 실제 급여 데이터 3건 검증
 * - 야간/연장/휴일 수당 조합 5건 검증
 */

import {
  calcInsurance,
  calcIncomeTax,
  calcWageFromAttendance,
  calcPayroll,
  calcSeverancePay,
  calcAnnualLeaveDays,
  classifyNightHours,
  summarizeMonthAttendance,
} from './payroll-calc.js';

import {
  INSURANCE_RATES,
  SIMPLE_TAX_TABLE,
  WAGE_MULTIPLIERS,
  MINIMUM_WAGE,
} from './payroll-rates-2025.js';

/**
 * 테스트 결과 포맷 및 보고
 */
function reportTest(testName, passed, expected, actual, details = '') {
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${testName}`);
  if (!passed) {
    console.log(`   기댓값: ${JSON.stringify(expected)}`);
    console.log(`   실제값: ${JSON.stringify(actual)}`);
    if (details) console.log(`   설명: ${details}`);
  }
  return passed;
}

/**
 * A. 간이세액표 검증 (10건)
 * 국세청 홈택스 간이세액표와 정확히 일치해야 함
 */
function testSimpleTaxTable() {
  console.log('\n=== A. 간이세액표 검증 (10건) ===');
  let passed = 0;
  const testCases = [
    // [급여, 부양가족수, 기댓값]
    [2000000, 0, 22050],   // 200만원, 부양가족 0명
    [2000000, 1, 18450],   // 200만원, 부양가족 1명
    [3000000, 0, 37550],   // 300만원, 부양가족 0명
    [3000000, 2, 29350],   // 300만원, 부양가족 2명
    [4000000, 0, 53050],   // 400만원, 부양가족 0명
    [4000000, 3, 39250],   // 400만원, 부양가족 3명
    [5000000, 0, 68550],   // 500만원, 부양가족 0명
    [5000000, 4, 50900],   // 500만원, 부양가족 4명
    [1500000, 1, 10950],   // 150만원, 부양가족 1명
    [1500000, 5, 550],     // 150만원, 부양가족 5명
  ];

  testCases.forEach(([gross, dependents, expected]) => {
    const actual = calcIncomeTax(gross, dependents).income_tax;
    const pass = reportTest(
      `소득세(${gross}, 부양=${dependents})`,
      actual === expected,
      expected,
      actual
    );
    if (pass) passed++;
  });

  console.log(`통과: ${passed}/10`);
  return passed === 10;
}

/**
 * B. 4대보험 계산 검증 (5건)
 * 국민연금 4.5%, 건강보험 3.545%, 고용보험 0.9%, 장기요양 12.95%
 */
function testFourPillarInsurance() {
  console.log('\n=== B. 4대보험 계산 검증 (5건) ===');
  let passed = 0;
  const testCases = [
    // [총지급액, 기댓 국민연금, 기댓 건강보험, 기댓 고용보험]
    [3000000, 135000, 106350, 27000],       // 300만원
    [2500000, 112500, 88625, 22500],        // 250만원
    [4000000, 180000, 141800, 36000],       // 400만원
    [2000000, 90000, 70900, 18000],         // 200만원
    [5000000, 225000, 177250, 45000],       // 500만원
  ];

  testCases.forEach(([gross, expNp, expHi, expEi]) => {
    const insurance = calcInsurance(gross, { np: true, hi: true, ei: true, wc: true });

    const npPass = reportTest(
      `국민연금(${gross})`,
      insurance.np === expNp,
      expNp,
      insurance.np
    );

    const hiPass = reportTest(
      `건강보험(${gross})`,
      insurance.hi === expHi,
      expHi,
      insurance.hi
    );

    const eiPass = reportTest(
      `고용보험(${gross})`,
      insurance.ei === expEi,
      expEi,
      insurance.ei
    );

    // 장기요양 = 건강보험료 × 12.95%
    const expLtc = Math.round(expHi * 0.1295);
    const ltcPass = reportTest(
      `장기요양(${gross})`,
      insurance.ltc === expLtc,
      expLtc,
      insurance.ltc
    );

    if (npPass && hiPass && eiPass && ltcPass) passed++;
  });

  console.log(`통과: ${passed}/5`);
  return passed === 5;
}

/**
 * C. 실제 급여 데이터 검증 (3건)
 * 실무 사례 기반 전체 급여 계산
 */
function testRealPayrollScenarios() {
  console.log('\n=== C. 실제 급여 데이터 검증 (3건) ===');
  let passed = 0;

  // 사례 1: 월급 정규직 (300만원, 부양가족 1명)
  const emp1 = {
    base_salary: 3000000,
    employment_type: '정규직',
    dependents: 1,
    children: 0,
    insurance_flags: { np: true, hi: true, ei: true, wc: true },
  };
  const result1 = calcPayroll(emp1, {}, {}, {});

  console.log('\n[사례 1] 월급 정규직 300만원, 부양가족 1명');
  console.log(`  총지급액: ${result1.gross}원`);
  console.log(`  4대보험: ${result1.np + result1.hi + result1.ltc + result1.ei}원`);
  console.log(`  소득세: ${result1.income_tax}원 (지방세 ${result1.local_tax}원)`);
  console.log(`  공제계: ${result1.total_deduct}원`);
  console.log(`  실지급액: ${result1.net}원`);

  const case1Pass = result1.net > 0 && result1.gross === 3000000 &&
                    result1.income_tax === 33450 &&
                    result1.total_deduct > 0;
  reportTest('사례1: 실지급액 양수', case1Pass, 'net > 0', result1.net);
  if (case1Pass) passed++;

  // 사례 2: 시급 근로자 (시급 12,000원 × 200시간)
  const emp2 = {
    hourly_wage: 12000,
    employment_type: '시급',
    dependents: 0,
    children: 0,
    insurance_flags: { np: true, hi: true, ei: true, wc: true },
  };
  const attendance2 = {
    total_min: 12000,  // 200시간
    overtime_min: 0,
    night_min: 0,
    holiday_min: 0,
  };
  const result2 = calcPayroll(emp2, attendance2, {}, {});

  console.log('\n[사례 2] 시급 근로자 12,000원 × 200시간');
  console.log(`  기본급(200h): ${result2.base}원`);
  console.log(`  총지급액: ${result2.gross}원`);
  console.log(`  실지급액: ${result2.net}원`);

  const case2Pass = result2.base === 2400000 && result2.net > 0;
  reportTest('사례2: 시급 기본급 정확', case2Pass, 2400000, result2.base);
  if (case2Pass) passed++;

  // 사례 3: 연장·야간·휴일 복합 (10h+5h+8h)
  const emp3 = {
    hourly_wage: 12000,
    employment_type: '시급',
    dependents: 0,
    children: 0,
    insurance_flags: { np: true, hi: true, ei: true, wc: true },
  };
  const attendance3 = {
    total_min: 16200,  // 270시간
    overtime_min: 600,  // 10시간 × 1.5
    night_min: 300,     // 5시간 × 2.0
    holiday_min: 480,   // 8시간 × 1.5
  };
  const result3 = calcPayroll(emp3, attendance3, {}, {});

  console.log('\n[사례 3] 연장(10h) + 야간(5h) + 휴일(8h)');
  console.log(`  기본급: ${result3.base}원`);
  console.log(`  연장급: ${result3.overtime_pay}원`);
  console.log(`  야간급: ${result3.night_pay}원`);
  console.log(`  휴일급: ${result3.holiday_pay}원`);
  console.log(`  총지급액: ${result3.gross}원`);
  console.log(`  실지급액: ${result3.net}원`);

  const expOvertime = Math.round(600 / 60 * 12000 * 1.5);  // 10h × 1.5
  const expNight = Math.round(300 / 60 * 12000 * 2.0);     // 5h × 2.0
  const expHoliday = Math.round(480 / 60 * 12000 * 1.5);   // 8h × 1.5

  const case3Pass = result3.overtime_pay === expOvertime &&
                    result3.night_pay === expNight &&
                    result3.holiday_pay === expHoliday;
  reportTest('사례3: 수당 조합 정확', case3Pass,
    { overtime: expOvertime, night: expNight, holiday: expHoliday },
    { overtime: result3.overtime_pay, night: result3.night_pay, holiday: result3.holiday_pay }
  );
  if (case3Pass) passed++;

  console.log(`\n통과: ${passed}/3`);
  return passed === 3;
}

/**
 * D. 야간 시간 분류 검증 (5건)
 */
function testNightHourClassification() {
  console.log('\n=== D. 야간 시간 분류 검증 (5건) ===');
  let passed = 0;

  const testCases = [
    // [checkIn, checkOut, expectedRegular, expectedNight, description]
    ['09:00', '17:00', 480, 0, '정규 시간'],
    ['21:00', '05:00', 300, 480, '자정 넘는 야간'],
    ['22:00', '07:00', 300, 540, '22:00 입장, 07:00 퇴장'],
    ['23:00', '23:30', 0, 30, '전체 야간'],
    ['06:30', '14:30', 480, 0, '아침 야간 범위 밖'],
  ];

  testCases.forEach(([checkIn, checkOut, expReg, expNight, desc]) => {
    const result = classifyNightHours(checkIn, checkOut);
    const pass = reportTest(
      `${desc} (${checkIn}-${checkOut})`,
      result.regular_min === expReg && result.night_min === expNight,
      { regular_min: expReg, night_min: expNight },
      result
    );
    if (pass) passed++;
  });

  console.log(`통과: ${passed}/5`);
  return passed === 5;
}

/**
 * E. 연차 부여 검증 (5건)
 */
function testAnnualLeaveAccrual() {
  console.log('\n=== E. 연차 부여 검증 (5건) ===');
  let passed = 0;

  const testCases = [
    // [hireDate, referenceDate, expectedDays, description]
    ['2025-01-01', '2025-06-01', 5, '입사 후 5개월'],
    ['2024-01-01', '2025-01-01', 15, '정확히 1년'],
    ['2023-01-01', '2025-01-01', 15, '1~3년 사이'],
    ['2022-01-01', '2025-01-01', 16, '3년 초과 (15+2년당1)'],
    ['2020-01-01', '2025-01-01', 17, '5년 근속'],
  ];

  testCases.forEach(([hireDate, refDate, expectedDays, desc]) => {
    const actual = calcAnnualLeaveDays(hireDate, refDate);
    const pass = reportTest(
      desc,
      actual === expectedDays,
      expectedDays,
      actual
    );
    if (pass) passed++;
  });

  console.log(`통과: ${passed}/5`);
  return passed === 5;
}

/**
 * F. 퇴직금 계산 검증 (3건)
 */
function testSeverancePay() {
  console.log('\n=== F. 퇴직금 계산 검증 (3건) ===');
  let passed = 0;

  const testCases = [
    // [평균임금, 근속년수, 기댓 퇴직금]
    [2500000, 5, 375000000],   // 평균 250만 × 5년 = 3.75억
    [3000000, 10, 900000000],  // 평균 300만 × 10년 = 9억
    [2000000, 3, 180000000],   // 평균 200만 × 3년 = 1.8억
  ];

  testCases.forEach(([avgSalary, yearsOfService, expected]) => {
    const actual = calcSeverancePay(avgSalary, yearsOfService);
    const pass = reportTest(
      `퇴직금(평균${avgSalary}, ${yearsOfService}년)`,
      actual === expected,
      expected,
      actual
    );
    if (pass) passed++;
  });

  console.log(`통과: ${passed}/3`);
  return passed === 3;
}

/**
 * 전체 테스트 실행
 */
export function runAllValidationTests() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║     INVEX 급여 계산 검증 테스트 스위트 v1.0        ║');
  console.log('║        (한국 노동법 & 세법 준수 확인)              ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const resultsA = testSimpleTaxTable();
  const resultsB = testFourPillarInsurance();
  const resultsC = testRealPayrollScenarios();
  const resultsD = testNightHourClassification();
  const resultsE = testAnnualLeaveAccrual();
  const resultsF = testSeverancePay();

  const allPassed = resultsA && resultsB && resultsC && resultsD && resultsE && resultsF;

  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                    최종 결과                      ║');
  console.log(allPassed ? '║            ✅ 모든 검증 통과 (PASS)            ║' : '║            ❌ 일부 실패 (FAIL)                  ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  return {
    allPassed,
    simpleTaxTable: resultsA,
    fourPillarInsurance: resultsB,
    realPayroll: resultsC,
    nightHours: resultsD,
    annualLeave: resultsE,
    severancePay: resultsF,
  };
}

// 직접 실행 시 테스트 자동 실행
if (typeof window === 'undefined') {
  runAllValidationTests();
}
