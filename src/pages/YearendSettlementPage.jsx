/**
 * YearendSettlementPage.jsx — 연말정산 보조
 * page-yearend-settlement.js → React 변환 (10차)
 */

import React, { useState, useEffect } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, payrolls as payrollsDb } from '../db.js';
import { calcIncomeTax } from '../payroll-calc.js';

// ─── 상세 모달 ────────────────────────────────────────
function DetailModal({ s, onClose }) {
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h3>{s.name} ({s.empNo}) - 연말정산 상세</h3>
          <button className="btn-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {[
                ['연간 급여합계', (s.annualGross||0).toLocaleString() + ' 원'],
                ['4대보험 합계', (s.annualInsurance||0).toLocaleString() + ' 원'],
                ['월별 소득세 합계', (s.monthlyTaxPaid||0).toLocaleString() + ' 원'],
                ['부양가족', s.dependents + '명'],
              ].map(([label, val]) => (
                <tr key={label} style={{ borderBottom: '1px solid #e0e0e0' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500 }}>{label}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{val}</td>
                </tr>
              ))}
              <tr style={{ borderBottom: '1px solid #e0e0e0' }}>
                <td style={{ padding: '8px 0', fontWeight: 500, color: '#2196F3' }}>재계산 소득세</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: '#2196F3', fontWeight: 'bold' }}>{(s.yearendTax||0).toLocaleString()} 원</td>
              </tr>
              <tr style={{ background: '#f0f7ff' }}>
                <td style={{ padding: '12px 0', fontWeight: 'bold', color: '#2196F3', fontSize: '1.1em' }}>환급액 / 납부액</td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 'bold', color: s.refundAmount > 0 ? '#4CAF50' : '#F44336', fontSize: '1.2em' }}>
                  {s.refundAmount > 0 ? '+' : ''}{(s.refundAmount||0).toLocaleString()} 원
                </td>
              </tr>
            </tbody>
          </table>

          <h4 style={{ marginTop: 20, marginBottom: 12 }}>월별 급여</h4>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '0.9em' }}>
              <thead><tr><th>연월</th><th className="text-right">급여</th><th className="text-right">세액</th></tr></thead>
              <tbody>
                {(s.payrolls || []).map((p, i) => (
                  <tr key={i}>
                    <td>{p.payYear}년 {String(p.payMonth).padStart(2,'0')}월</td>
                    <td className="text-right">{(p.gross||0).toLocaleString()}</td>
                    <td className="text-right">{((p.incomeTax||0)+(p.localTax||0)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────
export default function YearendSettlementPage() {
  const [calcYear, setCalcYear] = useState(new Date().getFullYear());
  const [dept, setDept] = useState('');
  const [depts, setDepts] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [emps, setEmps] = useState([]);

  useEffect(() => {
    employeesDb.list().then(list => {
      setEmps(list || []);
      const ds = [...new Set((list||[]).filter(e=>e.dept).map(e=>e.dept))].sort();
      setDepts(ds);
    });
  }, []);

  async function calc() {
    setLoading(true);
    try {
      const filtered = dept ? emps.filter(e => e.dept === dept) : emps;
      const allPayrolls = await payrollsDb.list();
      const yearPayrolls = allPayrolls.filter(p => p.payYear === calcYear);
      const result = filtered.map(emp => {
        const empPayrolls = yearPayrolls.filter(p => p.employeeId === emp.id);
        const annualGross = empPayrolls.reduce((s,p)=>s+(p.gross||0),0);
        const monthlyTaxPaid = empPayrolls.reduce((s,p)=>s+((p.incomeTax||0)+(p.localTax||0)),0);
        const annualInsurance = empPayrolls.reduce((s,p)=>s+((p.np||0)+(p.hi||0)+(p.ltc||0)+(p.ei||0)),0);
        const yearendTax = calcIncomeTax(annualGross, emp.dependents || 0);
        const refundAmount = monthlyTaxPaid + annualInsurance - yearendTax;
        return { id: emp.id, name: emp.name, empNo: emp.empNo, dept: emp.dept, annualGross, monthlyTaxPaid, yearendTax, refundAmount, annualInsurance, dependents: emp.dependents||0, payrolls: empPayrolls };
      });
      setSettlements(result);
    } catch (e) { showToast('계산 실패: ' + e.message, 'error'); }
    setLoading(false);
  }

  const totalGross = settlements.reduce((s,x)=>s+x.annualGross,0);
  const totalTaxPaid = settlements.reduce((s,x)=>s+x.monthlyTaxPaid,0);
  const totalYearendTax = settlements.reduce((s,x)=>s+x.yearendTax,0);
  const totalRefund = settlements.reduce((s,x)=>s+x.refundAmount,0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📅 연말정산 보조</h1>
          <div className="page-desc">연간 급여를 기반으로 환급액을 자동 계산합니다.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ gap: 12, marginBottom: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>정산 연도</label>
            <select className="form-select" value={calcYear} onChange={e => setCalcYear(parseInt(e.target.value))}>
              {[2025, 2024, 2023].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>부서 필터</label>
            <select className="form-select" value={dept} onChange={e => setDept(e.target.value)}>
              <option value="">전체</option>
              {depts.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div style={{ flex: 0.4, display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={calc} disabled={loading}>{loading ? '계산 중…' : '계산'}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>연말정산 요약</h3>
        {settlements.length === 0
          ? <div style={{ color: 'var(--text-muted)', padding: 20 }}>계산 후 표시됩니다</div>
          : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>직원명</th>
                  <th className="text-right">연간 급여</th>
                  <th className="text-right">기납부 세액</th>
                  <th className="text-right">재계산 세액</th>
                  <th className="text-right">환급액</th>
                  <th style={{ width: 80 }}>상세</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s, i) => (
                  <tr key={s.id}>
                    <td>{s.name} ({s.empNo})</td>
                    <td className="text-right">{(s.annualGross||0).toLocaleString()}</td>
                    <td className="text-right">{(s.monthlyTaxPaid||0).toLocaleString()}</td>
                    <td className="text-right">{(s.yearendTax||0).toLocaleString()}</td>
                    <td className="text-right" style={{ color: s.refundAmount > 0 ? '#4CAF50' : '#F44336', fontWeight: 'bold' }}>
                      {s.refundAmount > 0 ? '+' : ''}{(s.refundAmount||0).toLocaleString()}
                    </td>
                    <td><button className="btn-icon" onClick={() => setDetail(s)}>→</button></td>
                  </tr>
                ))}
                <tr style={{ background: '#f5f5f5', fontWeight: 'bold', borderTop: '2px solid #333' }}>
                  <td>합계</td>
                  <td className="text-right">{totalGross.toLocaleString()}</td>
                  <td className="text-right">{totalTaxPaid.toLocaleString()}</td>
                  <td className="text-right">{totalYearendTax.toLocaleString()}</td>
                  <td className="text-right" style={{ color: totalRefund > 0 ? '#4CAF50' : '#F44336', fontWeight: 'bold' }}>
                    {totalRefund > 0 ? '+' : ''}{totalRefund.toLocaleString()}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && <DetailModal s={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
