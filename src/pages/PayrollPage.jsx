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
import { fmtWon } from '../utils/formatters.js';

// ─── 상세 모달 ────────────────────────────────────────
function PayrollDetailModal({ payroll: p, year, month, onClose }) {
  const allowanceSum = Object.values(p.allowances || {}).reduce((a, b) => a + b, 0);

  const payRows = [
    { label: '기본급', val: p.base, always: true },
    { label: '각종 수당', val: allowanceSum, cond: allowanceSum > 0 },
    { label: '초과근무수당', val: p.overtime_pay },
    { label: '야간근무수당', val: p.night_pay },
    { label: '휴일근무수당', val: p.holiday_pay },
  ].filter(r => r.always || (r.cond ?? (r.val || 0) > 0));

  const deductRows = [
    { label: '국민연금', rate: '4.5%',         val: p.np },
    { label: '건강보험', rate: '3.545%',        val: p.hi },
    { label: '장기요양', rate: '건보×12.95%',   val: p.ltc },
    { label: '고용보험', rate: '0.9%',          val: p.ei },
    { label: '소득세',   rate: '간이세액표',     val: p.income_tax },
    { label: '지방소득세', rate: '소득세×10%',  val: p.local_tax },
  ].filter(r => (r.val || 0) > 0);

  const grossRatio = p.gross > 0 ? Math.min((p.gross / (p.gross + p.total_deduct)) * 100, 100) : 0;

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 520, padding: 0, overflow: 'hidden' }}>

        {/* ── 헤더 ── */}
        <div style={{
          background: 'linear-gradient(135deg, #0f1737 0%, #1e3a8a 100%)',
          padding: '20px 24px 16px',
          position: 'relative',
        }}>
          {/* 닫기 버튼 */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 14, right: 16,
            background: 'rgba(255,255,255,0.15)', border: 'none',
            borderRadius: '50%', width: 28, height: 28,
            color: '#fff', cursor: 'pointer', fontSize: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>

          {/* 이름 & 기간 */}
          <div style={{ fontSize: 11, color: 'rgba(160,185,220,0.9)', marginBottom: 4, letterSpacing: '0.5px' }}>
            급여명세서
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
            {p.name}
            <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(160,185,220,0.8)', marginLeft: 8 }}>
              {p.empNo} · {p.dept}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(160,185,220,0.8)' }}>
            {year}년 {month}월분
          </div>

          {/* 실지급액 하이라이트 */}
          <div style={{
            marginTop: 16, background: 'rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(160,185,220,0.9)' }}>실지급액</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {fmtWon(p.net)}
            </span>
          </div>

          {/* 지급/공제 바 */}
          <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${grossRatio}%`,
              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              borderRadius: 2, transition: 'width 0.6s',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: 'rgba(160,185,220,0.7)' }}>
            <span>지급 {fmtWon(p.gross)}</span>
            <span>공제 {fmtWon(p.total_deduct)}</span>
          </div>
        </div>

        {/* ── 바디 ── */}
        <div style={{ padding: '0 24px 20px', background: 'var(--bg-card, var(--bg-secondary))' }}>

          {/* 지급 항목 */}
          <div style={{ paddingTop: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', color: '#3b82f6',
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ display: 'inline-block', width: 3, height: 12, background: '#3b82f6', borderRadius: 2 }} />
              지급 항목
            </div>
            {payRows.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtWon(r.val)}
                </span>
              </div>
            ))}
            {/* 지급 합계 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', marginTop: 6,
              background: 'rgba(59,130,246,0.08)', borderRadius: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>총 지급액</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#3b82f6', fontVariantNumeric: 'tabular-nums' }}>
                {fmtWon(p.gross)}
              </span>
            </div>
          </div>

          {/* 공제 항목 */}
          <div style={{ paddingTop: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', color: '#ef4444',
              marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ display: 'inline-block', width: 3, height: 12, background: '#ef4444', borderRadius: 2 }} />
              공제 항목
            </div>
            {deductRows.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>
                  {r.label}
                  {r.rate && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 5,
                      background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: 4 }}>
                      {r.rate}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtWon(r.val)}
                </span>
              </div>
            ))}
            {/* 공제 합계 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', marginTop: 6,
              background: 'rgba(239,68,68,0.07)', borderRadius: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>총 공제액</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
                {fmtWon(p.total_deduct)}
              </span>
            </div>
          </div>
        </div>

        {/* ── 푸터 ── */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '12px 24px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-card, var(--bg-secondary))',
        }}>
          <button className="btn btn-ghost" style={{ fontSize: 13 }}
            onClick={() => generatePayslipPDF(p, year, month)}>
            📄 PDF 출력
          </button>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={onClose}>
            닫기
          </button>
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
  const [depts, setDepts] = useState([]);
  const [payrolls, setPayrolls] = useState([]);
  const [deptFilter, setDeptFilter] = useState(''); // 결과 테이블 필터 (계산과 분리)
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
      const filtered = emps.filter(e => !e.resignDate); // 항상 전체 직원 계산, 부서 필터는 결과 테이블에서
      // limit: 5000 — Supabase 기본 상한 1000행 초과 방지.
      // 직원 100명 × 31일 = 최대 3100행. 5000은 충분한 여유.
      const allAtt = await attendanceDb.list({ from: `${y}-${String(m).padStart(2,'0')}-01`, to: `${y}-${String(m).padStart(2,'0')}-31`, limit: 5000 });
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

  // 부서 필터 적용 (계산은 전체, 보기/집계는 필터 기준)
  const visiblePayrolls = deptFilter ? payrolls.filter(p => p.dept === deptFilter) : payrolls;
  const totalGross  = visiblePayrolls.reduce((s, p) => s + (p.gross        || 0), 0);
  const totalDeduct = visiblePayrolls.reduce((s, p) => s + (p.total_deduct || 0), 0);
  const totalNet    = visiblePayrolls.reduce((s, p) => s + (p.net          || 0), 0);

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
          <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={calcAll} disabled={loading}>
            {loading ? '계산 중…' : '🧮 전체 직원 계산'}
          </button>
          {emps.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              재직 중 {emps.filter(e => !e.resignDate).length}명 일괄 계산
            </span>
          )}
        </div>
      </div>

      {payrolls.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginBottom: 12 }}>이번달 급여 요약</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { label: deptFilter ? `${deptFilter} 직원` : '대상 직원', val: visiblePayrolls.length + '명' },
              { label: '총 지급액', val: fmtWon(totalGross) },
              { label: '총 공제액', val: fmtWon(totalDeduct) },
              { label: '총 실지급', val: fmtWon(totalNet) },
            ].map(({ label, val }) => (
              <div key={label} className="stat-card" style={{ borderTop: '3px solid var(--accent)' }}>
                <div className="stat-value" style={{ color: 'var(--accent)' }}>{val}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0 }}>급여 계산 결과
            {payrolls.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                {deptFilter ? `${deptFilter} ${visiblePayrolls.length}명` : `전체 ${payrolls.length}명`}
              </span>
            )}
          </h3>
          {payrolls.length > 0 && depts.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>부서 필터</span>
              <select className="form-select" style={{ fontSize: 13, padding: '4px 8px', width: 'auto' }}
                value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
                <option value="">전체</option>
                {depts.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
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
                {visiblePayrolls.map(p => {
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
                  <td colSpan={3} style={{ color: 'var(--text-secondary)', fontSize: 12, letterSpacing: '0.5px' }}>
                    합계 {deptFilter && <span style={{ fontWeight: 400 }}>({deptFilter})</span>}
                  </td>
                  <td className="text-right">{fmtWon(visiblePayrolls.reduce((s,p)=>s+(p.base||0),0))}</td>
                  <td className="text-right">{fmtWon(visiblePayrolls.reduce((s,p)=>s+Object.values(p.allowances||{}).reduce((a,b)=>a+b,0),0))}</td>
                  <td className="text-right">{fmtWon(visiblePayrolls.reduce((s,p)=>s+((p.overtime_pay||0)+(p.night_pay||0)+(p.holiday_pay||0)),0))}</td>
                  <td className="text-right">{fmtWon(visiblePayrolls.reduce((s,p)=>s+((p.np||0)+(p.hi||0)+(p.ltc||0)+(p.ei||0)),0))}</td>
                  <td className="text-right">{fmtWon(visiblePayrolls.reduce((s,p)=>s+((p.income_tax||0)+(p.local_tax||0)),0))}</td>
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
