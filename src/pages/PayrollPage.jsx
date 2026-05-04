/**
 * PayrollPage.jsx — 급여 계산 & 확정
 * page-payroll.js → React 변환 (10차)
 */

import React, { useState, useEffect } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, attendance as attendanceDb, payrolls as payrollsDb } from '../db.js';
import { canAction, getCurrentUser } from '../auth.js';
import { isAdminVerified } from '../admin-auth.js';
import { addAuditLog } from '../audit-log.js';
import { calcPayroll } from '../payroll-calc.js';
import { summarizeMonthAttendance } from '../attendance-calc.js';
import { generatePayslipPDF, generatePayslipBulkPDF } from '../pdf-generator.js';

function fmtWon(n) { const v = parseFloat(n) || 0; return v ? '₩' + v.toLocaleString('ko-KR') : '-'; }

// ─── 4대보험 요율 레이블 (모달 표시용) ───────────────────
const INSURANCE_RATE_LABELS = {
  np:  '국민연금',
  hi:  '건강보험',
  ltc: '장기요양',
  ei:  '고용보험',
};
const INSURANCE_RATES_DISPLAY = {
  np:  '4.5%',
  hi:  '3.545%',
  ltc: '건보×12.95%',
  ei:  '0.9%',
};

function RateTag({ rate }) {
  return <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>({rate})</span>;
}

// ─── 상세 모달 ────────────────────────────────────────
function PayrollDetailModal({ payroll: p, year, month, onClose }) {
  const allowanceSum = Object.values(p.allowances || {}).reduce((a, b) => a + b, 0);
  const TD_L = { padding: '7px 4px', color: 'var(--text-primary)', verticalAlign: 'middle' };
  const TD_R = { padding: '7px 4px', textAlign: 'right', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' };
  const ROW_SEP = { borderBottom: '1px solid var(--border)' };
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>{p.name} ({p.empNo}) — {year}년 {month}월</h3>
          <button className="btn-close" onClick={onClose} />
        </div>
        <div className="modal-body" style={{ color: 'var(--text-primary)' }}>

          {/* ── 지급항목 ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.5px' }}>
            지급 항목
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <tbody>
              <tr style={ROW_SEP}><td style={TD_L}>기본급</td><td style={{ ...TD_R, fontWeight: 500 }}>{fmtWon(p.base)}</td></tr>
              {allowanceSum > 0 && <tr style={ROW_SEP}><td style={TD_L}>각종 수당</td><td style={{ ...TD_R, fontWeight: 500 }}>{fmtWon(allowanceSum)}</td></tr>}
              {(p.overtime_pay || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>초과근무수당</td><td style={{ ...TD_R, fontWeight: 500 }}>{fmtWon(p.overtime_pay)}</td></tr>}
              {(p.night_pay    || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>야간근무수당</td><td style={{ ...TD_R, fontWeight: 500 }}>{fmtWon(p.night_pay)}</td></tr>}
              {(p.holiday_pay  || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>휴일근무수당</td><td style={{ ...TD_R, fontWeight: 500 }}>{fmtWon(p.holiday_pay)}</td></tr>}
              <tr style={{ background: 'var(--accent-light)', borderTop: '2px solid var(--accent)' }}>
                <td style={{ ...TD_L, fontWeight: 700 }}>총 지급액</td>
                <td style={{ ...TD_R, fontWeight: 700, color: 'var(--accent)', fontSize: 16 }}>{fmtWon(p.gross)}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 공제항목 ── */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.5px' }}>
            공제 항목
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <tbody>
              {(p.np  || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>{INSURANCE_RATE_LABELS.np}<RateTag rate={INSURANCE_RATES_DISPLAY.np} /></td><td style={TD_R}>{fmtWon(p.np)}</td></tr>}
              {(p.hi  || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>{INSURANCE_RATE_LABELS.hi}<RateTag rate={INSURANCE_RATES_DISPLAY.hi} /></td><td style={TD_R}>{fmtWon(p.hi)}</td></tr>}
              {(p.ltc || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>{INSURANCE_RATE_LABELS.ltc}<RateTag rate={INSURANCE_RATES_DISPLAY.ltc} /></td><td style={TD_R}>{fmtWon(p.ltc)}</td></tr>}
              {(p.ei  || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>{INSURANCE_RATE_LABELS.ei}<RateTag rate={INSURANCE_RATES_DISPLAY.ei} /></td><td style={TD_R}>{fmtWon(p.ei)}</td></tr>}
              {(p.income_tax || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>소득세<span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>(간이세액표)</span></td><td style={TD_R}>{fmtWon(p.income_tax)}</td></tr>}
              {(p.local_tax  || 0) > 0 && <tr style={ROW_SEP}><td style={TD_L}>지방소득세<span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>(소득세×10%)</span></td><td style={TD_R}>{fmtWon(p.local_tax)}</td></tr>}
              <tr style={{ background: 'var(--warning-light)', borderTop: '2px solid var(--warning)' }}>
                <td style={{ ...TD_L, fontWeight: 700 }}>총 공제액</td>
                <td style={{ ...TD_R, fontWeight: 700, color: 'var(--warning)' }}>{fmtWon(p.total_deduct)}</td>
              </tr>
            </tbody>
          </table>

          {/* ── 실지급액 ── */}
          <div style={{ background: 'var(--accent)', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>실 지 급 액</span>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{fmtWon(p.net)}</span>
          </div>

        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => generatePayslipPDF(p, year, month)}>📄 PDF 출력</button>
          <button className="btn btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────
export default function PayrollPage() {
  const now = new Date();
  const defaultMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const [monthStr, setMonthStr] = useState(defaultMonth);
  const [dept, setDept] = useState('');
  const [depts, setDepts] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [calcYear, setCalcYear] = useState(now.getFullYear());
  const [calcMonth, setCalcMonth] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [detailPayroll, setDetailPayroll] = useState(null);
  const [emps, setEmps] = useState([]);
  const [editingAllowance, setEditingAllowance] = useState(null); // employeeId
  const [allowanceValue, setAllowanceValue] = useState('');
  const [editingOvertime, setEditingOvertime] = useState(null); // { id, overHours, nightHours }

  useEffect(() => {
    employeesDb.list({ status: 'active' }).then(list => {
      setEmps(list || []);
      const ds = [...new Set((list || []).filter(e => e.dept).map(e => e.dept))].sort();
      setDepts(ds);
    });
  }, []);

  async function calcAll() {
    if (!monthStr) { showToast('월을 선택하세요', 'warning'); return; }
    setLoading(true);
    const [y, m] = monthStr.split('-').map(Number);
    try {
      const filtered = dept ? emps.filter(e => e.dept === dept && !e.resignDate) : emps.filter(e => !e.resignDate);
      const allAtt = await attendanceDb.list({ from: `${y}-${String(m).padStart(2,'0')}-01`, to: `${y}-${String(m).padStart(2,'0')}-31` });
      const result = [];
      for (const emp of filtered) {
        // ① 근태 데이터: camelCase → snake_case (classifyWorkMinutes 입력 형식)
        const empAttRaw = allAtt.filter(a => a.employeeId === emp.id);
        const empAttConverted = empAttRaw.map(a => ({
          check_in:      a.checkIn,
          check_out:     a.checkOut,
          break_min:     a.breakMin    || 0,
          work_min:      a.workMin     || 0,
          overtime_min:  a.overtimeMin || 0,
          night_min:     a.nightMin    || 0,
          holiday_min:   a.holidayMin  || 0,
          status:        a.status,
          is_holiday:    a.isHoliday   || false,
        }));

        // ② 근태 집계 후 calcPayroll 입력 형식으로 매핑
        const attSummaryRaw = summarizeMonthAttendance(empAttConverted);
        const attSummary = {
          total_min:    attSummaryRaw.total_work_min    || 0,
          overtime_min: attSummaryRaw.total_overtime_min || 0,
          night_min:    attSummaryRaw.total_night_min    || 0,
          holiday_min:  attSummaryRaw.total_holiday_min  || 0,
          work_days:    attSummaryRaw.work_days          || 0,
          leave_days:   attSummaryRaw.leave_days         || 0,
        };

        // ③ 직원 데이터: camelCase → snake_case (calcPayroll 입력 형식)
        const empForCalc = {
          base_salary:      emp.baseSalary    || 0,
          hourly_wage:      emp.hourlyWage    || 0,
          employment_type:  emp.employmentType || '정규직',
          insurance_flags:  emp.insuranceFlags || { np: true, hi: true, ei: true, wc: true },
          dependents:       emp.dependents    || 0,
          children:         emp.children      || 0,
        };

        const p = calcPayroll(empForCalc, attSummary, emp.allowances || {}, {});
        result.push({
          employeeId: emp.id, empNo: emp.empNo, name: emp.name, dept: emp.dept,
          _hourlyWage: emp.hourlyWage || 0,
          _employmentType: emp.employmentType || '정규직',
          ...p,
        });
      }
      setPayrolls(result);
      setCalcYear(y);
      setCalcMonth(m);
    } catch (e) { showToast('계산 실패: ' + e.message, 'error'); }
    setLoading(false);
  }

  async function confirmPayroll() {
    const adminOk = await isAdminVerified();
    if (!adminOk || !canAction('payroll:confirm')) { showToast('급여 확정은 admin만 가능합니다', 'error'); return; }
    if (!payrolls.length) { showToast('먼저 급여를 계산하세요', 'warning'); return; }
    if (!confirm(`${calcYear}년 ${calcMonth}월 급여를 확정하시겠습니까?\n이후 수정이 불가능합니다.`)) return;
    setConfirming(true);
    try {
      const currentUser = await getCurrentUser();
      const confirmedAt = new Date().toISOString();
      // storePayrollToDb이 인식하는 camelCase 키로 전달
      const rows = payrolls.map(p => ({
        employeeId:  p.employeeId,
        payYear:     calcYear,
        payMonth:    calcMonth,
        base:        p.base        || 0,
        allowances:  p.allowances  || {},
        gross:       p.gross       || 0,
        np:          p.np          || 0,
        hi:          p.hi          || 0,
        ltc:         p.ltc         || 0,
        ei:          p.ei          || 0,
        incomeTax:   p.income_tax  || 0,
        localTax:    p.local_tax   || 0,
        totalDeduct: p.total_deduct|| 0,
        net:         p.net         || 0,
        status:      'confirmed',
        confirmedAt,
        confirmedBy: currentUser?.uid || currentUser?.id,
      }));
      await payrollsDb.bulkUpsert(rows);
      addAuditLog('payroll.confirm', `payroll:${calcYear}-${calcMonth}`, { year: calcYear, month: calcMonth, targetCount: payrolls.length, confirmedBy: currentUser?.id });
      showToast(`${payrolls.length}명의 급여가 확정되었습니다`, 'success');
    } catch (e) { showToast('확정 실패: ' + e.message, 'error'); }
    setConfirming(false);
  }

  // ── 수당 편집 ──────────────────────────────────────────
  function startEditAllowance(id, currentSum) {
    setEditingAllowance(id);
    setAllowanceValue(String(Math.round(currentSum)));
  }
  function commitAllowance(id) {
    const numVal = parseInt(allowanceValue.replace(/[^0-9]/g, ''), 10) || 0;
    setPayrolls(prev => prev.map(p => {
      if (p.employeeId !== id) return p;
      const overtime = (p.overtime_pay||0)+(p.night_pay||0)+(p.holiday_pay||0);
      const newGross = (p.base||0) + numVal + overtime;
      const newNet = newGross - (p.total_deduct||0);
      return { ...p, allowances: { _manual: numVal }, gross: newGross, net: newNet };
    }));
    setEditingAllowance(null);
  }

  // ── 초과/야간 시간 편집 ─────────────────────────────────
  function startEditOvertime(p) {
    // 현재 pay → 역산 (시급 또는 통상시급 기준)
    const isHourly = p._employmentType === '시급' || p._employmentType === '일용';
    const hourlyRate = isHourly ? (p._hourlyWage || 0) : (p.base || 0) / 209;
    const ovMult = 1.5;
    const nightMult = isHourly ? 2.0 : 0.5; // 시급제=전체2배, 월급제=가산분0.5배
    const overHours = hourlyRate > 0 ? Math.round(((p.overtime_pay||0) / (hourlyRate * ovMult)) * 2) / 2 : 0;
    const nightHours = hourlyRate > 0 ? Math.round(((p.night_pay||0) / (hourlyRate * nightMult)) * 2) / 2 : 0;
    setEditingOvertime({ id: p.employeeId, overHours: String(overHours), nightHours: String(nightHours) });
  }
  function commitOvertime() {
    if (!editingOvertime) return;
    const { id, overHours, nightHours } = editingOvertime;
    setPayrolls(prev => prev.map(p => {
      if (p.employeeId !== id) return p;
      const isHourly = p._employmentType === '시급' || p._employmentType === '일용';
      const hourlyRate = isHourly ? (p._hourlyWage || 0) : (p.base || 0) / 209;
      const ov = parseFloat(overHours) || 0;
      const nt = parseFloat(nightHours) || 0;
      const overtime_pay = Math.round(hourlyRate * ov * 1.5);
      const night_pay    = Math.round(hourlyRate * nt * (isHourly ? 2.0 : 0.5));
      const allowanceSum = Object.values(p.allowances||{}).reduce((a,b)=>a+b,0);
      const newGross = (p.base||0) + allowanceSum + overtime_pay + night_pay + (p.holiday_pay||0);
      const newNet = newGross - (p.total_deduct||0);
      return { ...p, overtime_pay, night_pay, gross: newGross, net: newNet };
    }));
    setEditingOvertime(null);
  }
  function handleOvertimeBlur(e) {
    // 같은 행 안의 다른 input으로 이동 시 blur 무시
    if (e.relatedTarget && e.currentTarget.closest('tr')?.contains(e.relatedTarget)) return;
    commitOvertime();
  }

  const totalGross = payrolls.reduce((s, p) => s + (p.gross || 0), 0);
  const totalDeduct = payrolls.reduce((s, p) => s + (p.total_deduct || 0), 0);
  const totalNet = payrolls.reduce((s, p) => s + (p.net || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 급여 계산 & 확정</h1>
          <div className="page-desc">월별 급여를 자동 계산·검토·확정합니다. Admin만 확정 및 명세서 발행 가능합니다.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '0 0 auto', margin: 0 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>정산 월</label>
            <input type="month" className="form-input" value={monthStr} onChange={e => setMonthStr(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, margin: 0 }}>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 4, fontWeight: 500 }}>부서</label>
            <select className="form-select" value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">전체</option>
              {depts.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={calcAll} disabled={loading}>{loading ? '계산 중…' : '계산'}</button>
        </div>
      </div>

      {payrolls.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginBottom: 12 }}>이번달 급여 요약</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { label: '대상 직원', val: payrolls.length + '명', color: 'var(--info)', border: 'var(--info)' },
              { label: '총 지급액', val: fmtWon(totalGross), color: 'var(--accent)', border: 'var(--accent)' },
              { label: '총 공제액', val: fmtWon(totalDeduct), color: 'var(--warning)', border: 'var(--warning)' },
              { label: '총 실지급', val: fmtWon(totalNet), color: 'var(--success)', border: 'var(--success)' },
            ].map(({ label, val, color, border }) => (
              <div key={label} className="stat-card" style={{ borderTop: `3px solid ${border}` }}>
                <div className="stat-value" style={{ color }}>{val}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>급여 계산 결과</h3>
        {payrolls.length === 0 ? <div style={{ color: 'var(--text-muted)', padding: 20 }}>월을 선택하고 "계산" 버튼을 클릭하세요.</div> : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>사번</th><th>이름</th><th>부서</th>
                  <th className="text-right">기본급</th>
                  <th className="text-right" title="더블클릭으로 직접 입력">수당 ✎</th>
                  <th className="text-right" title="더블클릭으로 직접 입력">초과/야간 ✎</th><th className="text-right">4대보험</th>
                  <th className="text-right" title="소득세 + 지방소득세(소득세×10%)">소득세</th>
                  <th className="text-right" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>실지급액</th>
                  <th style={{ width: 60 }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.map(p => {
                  const insurance = (p.np||0)+(p.hi||0)+(p.ltc||0)+(p.ei||0);
                  const tax = (p.income_tax||0)+(p.local_tax||0);
                  const overtime = (p.overtime_pay||0)+(p.night_pay||0)+(p.holiday_pay||0);
                  const allowanceSum = Object.values(p.allowances||{}).reduce((a,b)=>a+b,0);
                  return (
                    <tr key={p.employeeId}>
                      <td><strong>{p.empNo||''}</strong></td>
                      <td>{p.name||''}</td>
                      <td>{p.dept||'-'}</td>
                      <td className="text-right">{fmtWon(p.base)}</td>

                      {/* ── 수당: 더블클릭 금액 직접 입력 ── */}
                      <td className="text-right" title="더블클릭으로 수정" style={{ cursor: 'text' }}
                        onDoubleClick={() => startEditAllowance(p.employeeId, allowanceSum)}>
                        {editingAllowance === p.employeeId ? (
                          <input autoFocus type="text" value={allowanceValue}
                            onChange={e => setAllowanceValue(e.target.value)}
                            onBlur={() => commitAllowance(p.employeeId)}
                            onKeyDown={e => { if (e.key === 'Enter') commitAllowance(p.employeeId); if (e.key === 'Escape') setEditingAllowance(null); }}
                            style={{ width: 90, textAlign: 'right', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 4px', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13 }} />
                        ) : (
                          <span style={{ borderBottom: '1px dashed var(--text-muted)', paddingBottom: 1 }}>{fmtWon(allowanceSum)}</span>
                        )}
                      </td>

                      {/* ── 초과/야간: 더블클릭 시간 입력 → 자동 금액 계산 ── */}
                      <td title="더블클릭 → 시간 입력으로 자동 계산"
                        style={{ cursor: 'text', whiteSpace: 'nowrap' }}
                        onDoubleClick={() => startEditOvertime(p)}>
                        {editingOvertime?.id === p.employeeId ? (() => {
                          const isHourly = p._employmentType === '시급' || p._employmentType === '일용';
                          const rate = isHourly ? (p._hourlyWage||0) : (p.base||0)/209;
                          const ov = parseFloat(editingOvertime.overHours)||0;
                          const nt = parseFloat(editingOvertime.nightHours)||0;
                          const preview = Math.round(rate*ov*1.5) + Math.round(rate*nt*(isHourly?2.0:0.5));
                          const INP = { type:'number', min:'0', step:'0.5',
                            style:{ width:46, textAlign:'right', border:'1px solid var(--accent)',
                              borderRadius:4, padding:'2px 3px', background:'var(--bg-card)',
                              color:'var(--text-primary)', fontSize:12 } };
                          return (
                            <div style={{ display:'flex', gap:3, alignItems:'center', justifyContent:'flex-end' }}>
                              <span style={{ fontSize:10, color:'var(--text-muted)' }}>초과</span>
                              <input {...INP} autoFocus value={editingOvertime.overHours}
                                onChange={e => setEditingOvertime(s=>({...s, overHours:e.target.value}))}
                                onBlur={handleOvertimeBlur}
                                onKeyDown={e=>{ if(e.key==='Enter') commitOvertime(); if(e.key==='Escape') setEditingOvertime(null); }} />
                              <span style={{ fontSize:10, color:'var(--text-muted)' }}>야간</span>
                              <input {...INP} value={editingOvertime.nightHours}
                                onChange={e => setEditingOvertime(s=>({...s, nightHours:e.target.value}))}
                                onBlur={handleOvertimeBlur}
                                onKeyDown={e=>{ if(e.key==='Enter') commitOvertime(); if(e.key==='Escape') setEditingOvertime(null); }} />
                              <span style={{ fontSize:9, color:'var(--text-muted)' }}>h</span>
                              {preview > 0 && <span style={{ fontSize:10, color:'var(--accent)', marginLeft:2 }}>={fmtWon(preview)}</span>}
                            </div>
                          );
                        })() : (
                          <span style={{ borderBottom:'1px dashed var(--text-muted)', paddingBottom:1, float:'right' }}>{fmtWon(overtime)}</span>
                        )}
                      </td>
                      <td className="text-right">{fmtWon(insurance)}</td>
                      <td className="text-right">{fmtWon(tax)}</td>
                      <td className="text-right" style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 'bold' }}>{fmtWon(p.net)}</td>
                      <td><button className="btn-icon" onClick={() => setDetailPayroll(p)}>→</button></td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--bg-main)', fontWeight: 'bold', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3} style={{ color: 'var(--text-secondary)', fontSize: 12, letterSpacing: '0.5px' }}>합계</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+(p.base||0),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+Object.values(p.allowances||{}).reduce((a,b)=>a+b,0),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+((p.overtime_pay||0)+(p.night_pay||0)+(p.holiday_pay||0)),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+((p.np||0)+(p.hi||0)+(p.ltc||0)+(p.ei||0)),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+((p.income_tax||0)+(p.local_tax||0)),0))}</td>
                  <td className="text-right" style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}>{fmtWon(totalNet)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payrolls.length > 0 && (
        <div className="card" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={confirmPayroll} disabled={confirming}>{confirming ? '저장 중…' : ' 급여 확정'}</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => generatePayslipBulkPDF(payrolls, calcYear, calcMonth)}> 명세서 다운로드</button>
        </div>
      )}

      {detailPayroll && <PayrollDetailModal payroll={detailPayroll} year={calcYear} month={calcMonth} onClose={() => setDetailPayroll(null)} />}
    </div>
  );
}
