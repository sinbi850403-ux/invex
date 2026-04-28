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

// ─── 상세 모달 ────────────────────────────────────────
function PayrollDetailModal({ payroll: p, year, month, onClose }) {
  const allowanceSum = Object.values(p.allowances || {}).reduce((a, b) => a + b, 0);
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h3>{p.name} ({p.empNo}) - {year}년 {month}월</h3>
          <button className="btn-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <h4 style={{ marginBottom: 12, fontSize: 14 }}>【지급항목】</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td style={{ padding: '8px 0' }}>기본급</td><td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtWon(p.base)}</td></tr>
              {allowanceSum > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>수당</td><td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtWon(allowanceSum)}</td></tr>}
              {(p.overtime_pay || 0) > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>초과근무비</td><td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtWon(p.overtime_pay)}</td></tr>}
              {(p.night_pay || 0) > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>야간근무비</td><td style={{ textAlign: 'right', fontWeight: 500 }}>{fmtWon(p.night_pay)}</td></tr>}
              <tr style={{ borderBottom: '2px solid #333', background: '#fafafa' }}><td style={{ padding: '10px 0', fontWeight: 'bold' }}>총 지급액</td><td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold', color: '#2196F3', fontSize: 16 }}>{fmtWon(p.gross)}</td></tr>
            </tbody>
          </table>
          <h4 style={{ marginBottom: 12, fontSize: 14 }}>【공제항목】</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
            <tbody>
              {(p.np||0) > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>국민연금</td><td style={{ textAlign: 'right' }}>{fmtWon(p.np)}</td></tr>}
              {(p.hi||0) > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>건강보험</td><td style={{ textAlign: 'right' }}>{fmtWon(p.hi)}</td></tr>}
              {(p.ltc||0) > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>장기요양보험</td><td style={{ textAlign: 'right' }}>{fmtWon(p.ltc)}</td></tr>}
              {(p.income_tax||0) > 0 && <tr style={{ borderBottom: '1px solid #e0e0e0' }}><td>소득세</td><td style={{ textAlign: 'right' }}>{fmtWon(p.income_tax)}</td></tr>}
              <tr style={{ background: '#fff5e6' }}><td style={{ padding: '10px 0', fontWeight: 'bold' }}>총 공제액</td><td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold' }}>{fmtWon(p.total_deduct)}</td></tr>
            </tbody>
          </table>
          <table style={{ width: '100%' }}>
            <tbody><tr style={{ background: '#f0f7ff' }}><td style={{ padding: 12, fontWeight: 'bold', color: '#2196F3' }}>실지급액</td><td style={{ padding: 12, textAlign: 'right', fontWeight: 'bold', fontSize: 20, color: '#2196F3' }}>{fmtWon(p.net)}</td></tr></tbody>
          </table>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => generatePayslipPDF(p, year, month)}> PDF 출력</button>
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
        const empAtt = allAtt.filter(a => a.employeeId === emp.id);
        const attSummary = summarizeMonthAttendance(empAtt);
        const p = calcPayroll(emp, attSummary, emp.allowances || {}, {});
        result.push({ employeeId: emp.id, empNo: emp.empNo, name: emp.name, dept: emp.dept, ...p });
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
      const rows = payrolls.map(p => ({
        employeeId: p.employeeId, payYear: calcYear, payMonth: calcMonth,
        baseSalary: p.base || 0, allowances: p.allowances || {},
        deductions: { np: p.np||0, hi: p.hi||0, ltc: p.ltc||0, ei: p.ei||0, income_tax: p.income_tax||0, local_tax: p.local_tax||0 },
        grossPay: p.gross||0, totalDeduction: p.total_deduct||0, netPay: p.net||0, status: 'confirmed', confirmedAt, confirmedBy: currentUser?.id,
      }));
      await payrollsDb.bulkUpsert(rows);
      addAuditLog('payroll.confirm', `payroll:${calcYear}-${calcMonth}`, { year: calcYear, month: calcMonth, targetCount: payrolls.length, confirmedBy: currentUser?.id });
      showToast(`${payrolls.length}명의 급여가 확정되었습니다`, 'success');
    } catch (e) { showToast('확정 실패: ' + e.message, 'error'); }
    setConfirming(false);
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
            {[['대상 직원', payrolls.length + '명'], ['총 지급액', fmtWon(totalGross)], ['총 공제액', fmtWon(totalDeduct)], ['총 실지급', fmtWon(totalNet)]].map(([label, val]) => (
              <div key={label} className="stat-card"><div className="stat-value">{val}</div><div className="stat-label">{label}</div></div>
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
                  <th className="text-right">기본급</th><th className="text-right">수당</th>
                  <th className="text-right">초과/야간</th><th className="text-right">4대보험</th>
                  <th className="text-right">세금</th>
                  <th className="text-right" style={{ background: '#f5f5f5', color: '#2196F3' }}>실지급액</th>
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
                      <td className="text-right">{fmtWon(allowanceSum)}</td>
                      <td className="text-right">{fmtWon(overtime)}</td>
                      <td className="text-right">{fmtWon(insurance)}</td>
                      <td className="text-right">{fmtWon(tax)}</td>
                      <td className="text-right" style={{ background: '#f5f5f5', color: '#2196F3', fontWeight: 'bold' }}>{fmtWon(p.net)}</td>
                      <td><button className="btn-icon" onClick={() => setDetailPayroll(p)}>→</button></td>
                    </tr>
                  );
                })}
                <tr style={{ background: '#f0f0f0', fontWeight: 'bold', borderTop: '2px solid #333' }}>
                  <td colSpan={3}>합계</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+(p.base||0),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+Object.values(p.allowances||{}).reduce((a,b)=>a+b,0),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+((p.overtime_pay||0)+(p.night_pay||0)+(p.holiday_pay||0)),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+((p.np||0)+(p.hi||0)+(p.ltc||0)+(p.ei||0)),0))}</td>
                  <td className="text-right">{fmtWon(payrolls.reduce((s,p)=>s+((p.income_tax||0)+(p.local_tax||0)),0))}</td>
                  <td className="text-right" style={{ color: '#2196F3' }}>{fmtWon(totalNet)}</td>
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
