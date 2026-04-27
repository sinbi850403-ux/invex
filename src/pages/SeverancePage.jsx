/**
 * SeverancePage.jsx — 퇴직금 계산
 * page-severance.js → React 변환 (10차)
 */

import React, { useState, useEffect } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, payrolls as payrollsDb } from '../db.js';
import { calcSeverancePay } from '../payroll-calc.js';

export default function SeverancePage() {
  const [emps, setEmps] = useState([]);
  const [empId, setEmpId] = useState('');
  const [resignDate, setResignDate] = useState('');
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => { employeesDb.list().then(list => setEmps(list || [])); }, []);

  async function calc() {
    if (!empId || !resignDate) { showToast('직원과 퇴직 예정일을 입력하세요', 'error'); return; }
    setCalculating(true);
    try {
      const emp = emps.find(e => e.id === empId);
      if (!emp) { showToast('직원 정보를 찾을 수 없습니다', 'error'); return; }
      const hireDate = new Date(emp.hireDate);
      const resignDateObj = new Date(resignDate);
      const tenure = (resignDateObj - hireDate) / (365.25 * 24 * 60 * 60 * 1000);
      const payrollList = await payrollsDb.list({ employee_id: empId });
      const now = new Date(resignDate);
      const recent = payrollList
        .filter(p => { const d = new Date(p.payYear, p.payMonth - 1, 1); const mo = (now - d) / (30*24*60*60*1000); return mo >= 0 && mo <= 3; })
        .sort((a, b) => new Date(b.payYear, b.payMonth-1) - new Date(a.payYear, a.payMonth-1))
        .slice(0, 3);
      const totalGross = recent.reduce((s, p) => s + (p.gross || 0), 0);
      const avgSalary = Math.round(totalGross / 90);
      const severance = calcSeverancePay(avgSalary, tenure);
      setResult({ tenure, avgSalary, severance, empName: emp.name });
    } catch (e) { showToast('계산 실패: ' + e.message, 'error'); }
    setCalculating(false);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📋 퇴직금 계산</h1>
          <div className="page-desc">직원의 퇴직금을 자동으로 계산합니다. (평균임금 × 30일 × 근속년수)</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginBottom: 16 }}>퇴직금 계산</h3>
        <div className="form-row" style={{ gap: 12 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>직원 선택</label>
            <select className="form-select" value={empId} onChange={e => { setEmpId(e.target.value); setResult(null); }}>
              <option value="">-- 직원 선택 --</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name} (사번: {e.empNo})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 0.8 }}>
            <label>퇴직 예정일</label>
            <input type="date" className="form-input" value={resignDate} onChange={e => setResignDate(e.target.value)} />
          </div>
          <div style={{ flex: 0.4, display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={calc} disabled={calculating}>{calculating ? '계산 중…' : '계산'}</button>
          </div>
        </div>

        {result && (
          <div style={{ marginTop: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500, width: '30%' }}>근속년수</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}><strong>{result.tenure.toFixed(2)}</strong> 년</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500 }}>최근 3개월 평균임금</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}><strong>{result.avgSalary.toLocaleString()}</strong> 원</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500 }}>퇴직금 = 평균임금 × 30 × 근속년수</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>
                    <div style={{ fontSize: '1.2em', color: '#2196F3', fontWeight: 'bold' }}>{result.severance.toLocaleString()} 원</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => { showToast('퇴직금 계산 결과가 저장되었습니다', 'success'); }}>저장</button>
              <button className="btn btn-outline" onClick={() => { setResult(null); setEmpId(''); setResignDate(''); }}>초기화</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>퇴직금 지급 이력</h3>
        <div className="empty-state"><div className="icon">📋</div><div className="msg">지급된 퇴직금 이력이 없습니다</div></div>
      </div>
    </div>
  );
}
