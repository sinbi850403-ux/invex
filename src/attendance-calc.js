/**
 * attendance-calc.js — 근태 시간 분류/집계 순수 함수
 * 역할: 출퇴근/휴게 입력을 정상·연장·야간·휴일 분(minute)으로 분해한다.
 * 왜 필수? → 급여 계산 시 연장(1.5배)/야간(2.0배)/휴일(1.5배) 가산을 정확히 적용하려면
 *           근무 시간을 법정 기준(근기법 §50, §56)대로 쪼개야 함.
 */

// HH:MM → 분
function toMin(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * 하루 근무를 4종으로 분류
 * @param {string} checkIn  - "09:00"
 * @param {string} checkOut - "20:00" (익일 가능하도록 +24h 처리)
 * @param {number} breakMin - 휴게시간(분)
 * @param {boolean} isHoliday - 휴일 여부
 * @returns {{regular:number, overtime:number, night:number, holiday:number, totalWork:number}}
 *
 * ■ 야간(night): 22:00~06:00 구간과 체류시간의 교집합에서 휴게비율만큼 차감
 *   → 정확한 야간 시작/종료 시각을 모르므로 휴게시간을 비례 배분하여 차감
 *   → 연장근로와 중복 가능 (급여 계산 시 야간+연장 stacking 별도 처리)
 * ■ 휴일(isHoliday): totalWork 전체가 holiday, 정규근무는 0
 * ■ 연장(overtime): 실근무 8시간(480분) 초과분 (근기법 §50)
 *
 * [알려진 한계] 휴게 시각을 알 수 없어 비례 차감 사용 — 야간에만 쉰 경우 약간 과소산정 가능
 */
export function classifyWorkMinutes(checkIn, checkOut, breakMin = 0, isHoliday = false) {
  const inMin = toMin(checkIn);
  let outMin = toMin(checkOut);
  if (inMin == null || outMin == null) {
    return { regular: 0, overtime: 0, night: 0, holiday: 0, totalWork: 0 };
  }
  if (outMin <= inMin) outMin += 24 * 60; // 익일 퇴근
  const totalSpan = outMin - inMin;                       // 체류 시간(분)
  const worked = Math.max(0, totalSpan - (breakMin || 0)); // 실근무 시간

  // ── 야간 교집합 계산 ───────────────────────────────────────
  // 야간 구간: 22:00(1320) ~ 익일 06:00(1320+480=1800)
  //           + 당일 00:00(0) ~ 06:00(360) (전날 22시 이후 출근한 당일 새벽 포함)
  // 두 구간은 실제 시간축 상 절대 중복되지 않음.
  const overlap = (a, b, c, d) => Math.max(0, Math.min(b, d) - Math.max(a, c));
  const rawNight = overlap(inMin, outMin, 22 * 60, 30 * 60)  // 22:00 ~ (익일)06:00
                 + overlap(inMin, outMin, 0,       6 * 60);  // 00:00 ~ 06:00 (새벽 출근)

  // 휴게시간을 비례 배분하여 야간에서 차감 (휴게 위치 미상이므로 비례 추정)
  const breakRatio = totalSpan > 0 ? (breakMin || 0) / totalSpan : 0;
  const night = Math.max(0, Math.round(rawNight * (1 - breakRatio)));

  if (isHoliday) {
    return { regular: 0, overtime: 0, night, holiday: worked, totalWork: worked };
  }

  // 법정 1일 소정근로 8시간(480분) 초과분은 연장 (근기법 §50)
  const regular = Math.min(worked, 480);
  const overtime = Math.max(0, worked - 480);

  return { regular, overtime, night, holiday: 0, totalWork: worked };
}

/**
 * 월간 집계 — 여러 근태 레코드 합산
 * @param {Array} records - attendance rows
 * @returns {{days:number, totalMin:number, regularMin:number, overtimeMin:number, nightMin:number, holidayMin:number, absentDays:number}}
 */
export function summarizeMonth(records) {
  const sum = { days: 0, totalMin: 0, regularMin: 0, overtimeMin: 0, nightMin: 0, holidayMin: 0, absentDays: 0 };
  (records || []).forEach(r => {
    if (r.status === '결근') { sum.absentDays++; return; }
    sum.days++;
    sum.totalMin    += (r.workMin     || 0);
    sum.overtimeMin += (r.overtimeMin || 0);
    sum.nightMin    += (r.nightMin    || 0);
    sum.holidayMin  += (r.holidayMin  || 0);
  });
  sum.regularMin = Math.max(0, sum.totalMin - sum.overtimeMin - sum.holidayMin);
  return sum;
}

export function minToHours(min) {
  return Math.round((min / 60) * 10) / 10;
}
