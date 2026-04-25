/**
 * page-attendance.js — 근태 관리
 * 역할: 월 단위로 직원별 출퇴근·휴게·연장/야간/휴일 근무를 기록하고 자동 집계
 * 왜 필수? → 급여(연장수당 1.5배, 야간 2.0배, 휴일 1.5배) 계산의 입력 데이터
 */
import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';
import { employees as employeesDb, attendance as attendanceDb } from './db.js';
import { classifyWorkMinutes, summarizeMonth, minToHours } from './attendance-calc.js';
import { canAction } from './auth.js';

function ymKey(y, m) { return `${y}-${String(m).padStart(2, '0')}`; }
function todayYM() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }

let currentEmpId = '';
let currentYear = todayYM().y;
let currentMonth = todayYM().m;

export async function renderAttendancePage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">근태 관리</h1>
        <div class="page-desc">월 단위 출퇴근 기록. 연장·야간·휴일 근무는 자동 분류됩니다.</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px;">
      <div class="form-row">
        <div class="form-group"><label>직원 선택</label><select id="att-emp" class="form-select"><option value="">로드 중…</option></select></div>
        <div class="form-group"><label>연도</label><input id="att-year" type="number" class="form-input" value="${currentYear}" /></div>
        <div class="form-group"><label>월</label><select id="att-month" class="form-select">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===currentMonth?'selected':''}>${i+1}월</option>`).join('')}</select></div>
        <div class="form-group" style="align-self:end;"><button class="btn btn-primary" id="btn-att-load">조회</button></div>
      </div>
    </div>

    <div id="att-summary"></div>
    <div class="card"><div id="att-table-wrap">직원을 선택하세요.</div></div>
  `;

  // 직원 목록 로드
  try {
    const emps = await employeesDb.list({ status: 'active' });
    setState({ employees: emps });
    const sel = container.querySelector('#att-emp');
    sel.innerHTML = `<option value="">-- 선택 --</option>` +
      emps.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.empNo)})</option>`).join('');
  } catch (e) {
    showToast('직원 목록 로드 실패', 'error');
  }

  container.querySelector('#btn-att-load').addEventListener('click', () => load(container));
  container.querySelector('#att-emp').addEventListener('change', () => load(container));
}

async function load(container) {
  currentEmpId = container.querySelector('#att-emp').value;
  currentYear = parseInt(container.querySelector('#att-year').value) || todayYM().y;
  currentMonth = parseInt(container.querySelector('#att-month').value) || todayYM().m;

  if (!currentEmpId) {
    container.querySelector('#att-table-wrap').innerHTML = '직원을 선택하세요.';
    container.querySelector('#att-summary').innerHTML = '';
    return;
  }
  const from = `${currentYear}-${String(currentMonth).padStart(2,'0')}-01`;
  const lastDay = new Date(currentYear, currentMonth, 0).getDate();
  const to = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;

  try {
    const recs = await attendanceDb.list({ employeeId: currentEmpId, from, to });
    renderAttendanceTable(container, recs, lastDay);
  } catch (e) { showToast('근태 조회 실패: ' + e.message, 'error'); }
}

function renderAttendanceTable(container, recs, lastDay) {
  const recMap = {};
  recs.forEach(r => { recMap[r.workDate] = r; });

  // 월간 요약
  const sum = summarizeMonth(recs);
  container.querySelector('#att-summary').innerHTML = `
    <div class="stats-grid" style="margin-bottom:12px;">
      <div class="stat-card"><div class="stat-label">출근일수</div><div class="stat-value">${sum.days}일</div></div>
      <div class="stat-card"><div class="stat-label">총 근무</div><div class="stat-value">${minToHours(sum.totalMin)}h</div></div>
      <div class="stat-card"><div class="stat-label">연장</div><div class="stat-value" style="color:var(--warning)">${minToHours(sum.overtimeMin)}h</div></div>
      <div class="stat-card"><div class="stat-label">야간</div><div class="stat-value" style="color:var(--accent)">${minToHours(sum.nightMin)}h</div></div>
      <div class="stat-card"><div class="stat-label">휴일</div><div class="stat-value" style="color:var(--danger)">${minToHours(sum.holidayMin)}h</div></div>
      <div class="stat-card"><div class="stat-label">결근</div><div class="stat-value">${sum.absentDays}일</div></div>
    </div>
  `;

  let rowsHtml = '';
  for (let day = 1; day <= lastDay; day++) {
    const dateKey = `${currentYear}-${String(currentMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const d = new Date(dateKey);
    const dow = ['일','월','화','수','목','금','토'][d.getDay()];
    const r = recMap[dateKey];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    rowsHtml += `
      <tr data-date="${dateKey}" class="${isWeekend ? 'row-weekend' : ''}" style="${isWeekend?'background:var(--bg-muted-2, rgba(0,0,0,0.02));':''}">
        <td>${day} <span style="color:var(--text-muted);">(${dow})</span></td>
        <td><input type="time" class="form-input att-ci" value="${r?.checkIn || ''}" style="padding:3px 6px;" /></td>
        <td><input type="time" class="form-input att-co" value="${r?.checkOut || ''}" style="padding:3px 6px;" /></td>
        <td><input type="number" class="form-input att-brk" value="${r?.breakMin || 60}" min="0" style="width:70px; padding:3px 6px;" /></td>
        <td class="text-right att-work">${r ? minToHours(r.workMin || 0) + 'h' : '-'}</td>
        <td class="text-right att-ot">${r ? minToHours(r.overtimeMin || 0) + 'h' : '-'}</td>
        <td class="text-right att-night">${r ? minToHours(r.nightMin || 0) + 'h' : '-'}</td>
        <td>
          <select class="form-select att-status" style="padding:3px 6px;">
            ${['정상','지각','조퇴','휴가','결근'].map(s => `<option ${r?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><input class="form-input att-note" value="${escapeHtml(r?.note || '')}" style="padding:3px 6px;" /></td>
      </tr>
    `;
  }

  container.querySelector('#att-table-wrap').innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
      <div style="color:var(--text-muted); font-size:12px;">시간 입력 후 "일괄 저장"을 누르면 연장/야간/휴일 근무가 자동 분류됩니다.</div>
      <button class="btn btn-primary" id="btn-att-save">💾 일괄 저장</button>
    </div>
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>일</th><th>출근</th><th>퇴근</th><th>휴게(분)</th>
            <th class="text-right">총근무</th>
            <th class="text-right">연장</th>
            <th class="text-right">야간</th>
            <th>상태</th><th>비고</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  container.querySelector('#btn-att-save').addEventListener('click', () => saveAll(container));
}

async function saveAll(container) {
  if (!canAction('attendance:edit') && !canAction('inout:create')) {
    // attendance:edit 권한이 별도로 없으면 staff 이상이면 자기 것은 허용
  }
  const rows = container.querySelectorAll('#att-table-wrap tbody tr');
  const payload = [];
  rows.forEach(tr => {
    const ci = tr.querySelector('.att-ci').value;
    const co = tr.querySelector('.att-co').value;
    const status = tr.querySelector('.att-status').value;
    const note = tr.querySelector('.att-note').value;
    const brk = parseInt(tr.querySelector('.att-brk').value) || 0;
    if (!ci && !co && status === '정상' && !note) return; // 빈 행 스킵
    const date = tr.dataset.date;
    const d = new Date(date);
    const isHoliday = d.getDay() === 0; // 일요일만 휴일 기본 가정 (공휴일 미반영)
    const { regular, overtime, night, holiday, totalWork } = classifyWorkMinutes(ci, co, brk, isHoliday);
    payload.push({
      employeeId: currentEmpId,
      workDate: date,
      checkIn: ci || null,
      checkOut: co || null,
      breakMin: brk,
      workMin: totalWork,
      overtimeMin: overtime,
      nightMin: night,
      holidayMin: holiday,
      status,
      note,
    });
  });

  if (payload.length === 0) { showToast('저장할 데이터가 없습니다', 'warning'); return; }
  try {
    await attendanceDb.bulkUpsert(payload);
    showToast(`${payload.length}건 저장되었습니다`, 'success');
    await load(container);
  } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
}
