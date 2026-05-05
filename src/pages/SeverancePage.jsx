/**
 * SeverancePage.jsx — 퇴직금 계산 (초고도화)
 * - 실제 DB 저장 (employee.extra.severanceHistory)
 * - 지급 이력 목록 + 삭제
 * - 평균임금 최근 3개월 자동 계산
 * - 중간정산 지원
 */

import React, { useState, useEffect, useMemo } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, payrolls as payrollsDb } from '../db.js';
import { calcSeverancePay } from '../payroll-calc.js';

function fmtWon(n) {
  const v = parseFloat(n) || 0;
  return v ? '₩' + Math.round(v).toLocaleString('ko-KR') : '₩0';
}
function fmtYears(y) {
  const yr = Math.floor(y);
  const mo = Math.round((y - yr) * 12);
  if (mo === 0) return `${yr}년`;
  return `${yr}년 ${mo}개월`;
}

const PAYOUT_TYPES = ['퇴직 지급', '중간정산', '사망 지급', '기타'];

export default function SeverancePage() {
  const [emps, setEmps] = useState([]);
  const [empId, setEmpId] = useState('');
  const [resignDate, setResignDate] = useState(new Date().toISOString().slice(0, 10));
  const [payoutType, setPayoutType] = useState('퇴직 지급');
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]); // {empName, payoutType, tenure, avgSalary, severance, date, id}
  const [histFilter, setHistFilter] = useState('');

  useEffect(() => {
    employeesDb.list().then(list => {
      setEmps(list || []);
      // 전체 이력 취합
      const all = [];
      (list || []).forEach(e => {
        const hist = (e.extra?.severanceHistory || []);
        hist.forEach(h => all.push({ ...h, empName: e.name, empNo: e.empNo, empId: e.id }));
      });
      all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setHistory(all);
    }).catch(() => showToast('직원 목록 로드 실패', 'error'));
  }, []);

  async function calc() {
    if (!empId || !resignDate) { showToast('직원과 퇴직 예정일을 입력하세요', 'error'); return; }
    setCalculating(true);
    setResult(null);
    try {
      const emp = emps.find(e => e.id === empId);
      if (!emp) { showToast('직원 정보를 찾을 수 없습니다', 'error'); return; }
      if (!emp.hireDate) { showToast('입사일이 등록되지 않은 직원입니다', 'error'); return; }

      const hireDate = new Date(emp.hireDate);
      const resignDateObj = new Date(resignDate);
      if (resignDateObj <= hireDate) { showToast('퇴직일이 입사일보다 앞섭니다', 'error'); return; }

      const tenure = (resignDateObj - hireDate) / (365.25 * 24 * 60 * 60 * 1000);
      if (tenure < 1) { showToast('근속 1년 미만은 퇴직금 지급 대상이 아닙니다 (법적 기준)', 'warning'); }

      const payrollList = await payrollsDb.list({ employee_id: empId });
      const now = new Date(resignDate);
      const recent = payrollList
        .filter(p => {
          const d = new Date(p.payYear, (p.payMonth || 1) - 1, 1);
          const mo = (now - d) / (30 * 24 * 60 * 60 * 1000);
          return mo >= 0 && mo <= 3;
        })
        .sort((a, b) => new Date(b.payYear, b.payMonth - 1) - new Date(a.payYear, a.payMonth - 1))
        .slice(0, 3);

      const totalGross = recent.reduce((s, p) => s + (p.gross || 0), 0);
      const avgSalary = recent.length > 0
        ? Math.round(totalGross / 90)
        : Math.round((emp.baseSalary || 0) / 30); // 급여 이력 없으면 기본급 사용

      const severance = calcSeverancePay(avgSalary, tenure);
      setResult({
        emp,
        tenure,
        avgSalary,
        severance,
        recentPayrolls: recent,
        usedBaseSalary: recent.length === 0,
      });
    } catch (e) { showToast('계산 실패: ' + e.message, 'error'); }
    setCalculating(false);
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      const emp = result.emp;
      const prevHistory = emp.extra?.severanceHistory || [];
      const newEntry = {
        id: Date.now().toString(),
        payoutType,
        tenure: result.tenure,
        avgSalary: result.avgSalary,
        severance: result.severance,
        resignDate,
        date: new Date().toISOString().slice(0, 10),
        hireDate: emp.hireDate,
      };
      const newExtra = { ...(emp.extra || {}), severanceHistory: [...prevHistory, newEntry] };
      await employeesDb.update(emp.id, { ...emp, extra: newExtra });

      // 이력 갱신
      const updated = await employeesDb.list();
      setEmps(updated || []);
      const all = [];
      (updated || []).forEach(e => {
        (e.extra?.severanceHistory || []).forEach(h => all.push({ ...h, empName: e.name, empNo: e.empNo, empId: e.id }));
      });
      all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setHistory(all);

      showToast('퇴직금 지급 이력이 저장되었습니다', 'success');
      setResult(null);
      setEmpId('');
    } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
    setSaving(false);
  }

  async function deleteHistory(empId, entryId) {
    if (!confirm('이 퇴직금 이력을 삭제하시겠습니까?')) return;
    try {
      const emp = emps.find(e => e.id === empId);
      if (!emp) return;
      const newHistory = (emp.extra?.severanceHistory || []).filter(h => h.id !== entryId);
      await employeesDb.update(emp.id, { ...emp, extra: { ...(emp.extra || {}), severanceHistory: newHistory } });
      setHistory(prev => prev.filter(h => !(h.empId === empId && h.id === entryId)));
      showToast('삭제되었습니다', 'success');
    } catch (e) { showToast('삭제 실패', 'error'); }
  }

  const filteredHistory = useMemo(() => {
    if (!histFilter) return history;
    const q = histFilter.toLowerCase();
    return history.filter(h => (h.empName || '').toLowerCase().includes(q) || (h.empNo || '').includes(q));
  }, [history, histFilter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">퇴직금 계산</h1>
          <div className="page-desc">평균임금 × 30일 × 근속년수. 최근 3개월 급여 이력을 기반으로 자동 계산합니다.</div>
        </div>
      </div>

      {/* 계산 섹션 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">퇴직금 계산</div>
        <div className="form-row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label className="form-label">직원 선택</label>
            <select className="form-select" value={empId} onChange={e => { setEmpId(e.target.value); setResult(null); }}>
              <option value="">-- 직원 선택 --</option>
              {emps.map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} ({e.empNo}) · 입사 {e.hireDate || '미등록'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ flex: '1 1 160px' }}>
            <label className="form-label">퇴직 예정일</label>
            <input type="date" className="form-input" value={resignDate} onChange={e => setResignDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 140px' }}>
            <label className="form-label">지급 유형</label>
            <select className="form-select" value={payoutType} onChange={e => setPayoutType(e.target.value)}>
              {PAYOUT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" style={{ height: 38 }} onClick={calc} disabled={calculating}>
              {calculating ? '계산 중…' : '계산하기'}
            </button>
          </div>
        </div>

        {result && (
          <div style={{ marginTop: 20 }}>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', marginBottom: 16 }} />

            {result.usedBaseSalary && (
              <div className="alert alert-warning" style={{ marginBottom: 12, fontSize: 13 }}>
                급여 이력이 없어 기본급({fmtWon(result.emp.baseSalary)}/월)을 기준으로 계산했습니다. 급여 기록 입력 후 재계산을 권장합니다.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[
                { label: '직원', value: `${result.emp.name} (${result.emp.empNo})` },
                { label: '입사일', value: result.emp.hireDate || '-' },
                { label: '퇴직 예정일', value: resignDate },
                { label: '근속 기간', value: fmtYears(result.tenure) },
                { label: '일평균임금', value: fmtWon(result.avgSalary) + '/일' },
                { label: '기준 (최근 3개월)', value: result.recentPayrolls.length > 0 ? `${result.recentPayrolls.length}개월 급여 기반` : '기본급 기반' },
              ].map(({ label, value }) => (
                <div key={label} style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: '16px 20px', background: 'var(--primary-subtle, rgba(33,150,243,0.08))', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>퇴직금 = 일평균임금 × 30일 × {result.tenure.toFixed(2)}년</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>{fmtWon(result.severance)}</div>
              </div>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? '저장 중…' : '이력 저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 지급 이력 */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="card-title" style={{ margin: 0 }}>퇴직금 지급 이력</div>
          <input
            className="form-input"
            placeholder="직원명/사번 검색"
            style={{ width: 200 }}
            value={histFilter}
            onChange={e => setHistFilter(e.target.value)}
          />
        </div>
        {filteredHistory.length === 0 ? (
          <div className="empty-state"><div className="msg">저장된 퇴직금 이력이 없습니다</div></div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>직원</th>
                  <th>유형</th>
                  <th>입사일</th>
                  <th>퇴직일</th>
                  <th className="text-right">근속</th>
                  <th className="text-right">일평균임금</th>
                  <th className="text-right">퇴직금</th>
                  <th>저장일</th>
                  <th style={{ width: 60 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map(h => (
                  <tr key={`${h.empId}-${h.id}`}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{h.empName || '-'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{h.empNo || ''}</div>
                    </td>
                    <td><span className="badge badge-info">{h.payoutType || '퇴직 지급'}</span></td>
                    <td style={{ fontSize: 13 }}>{h.hireDate || '-'}</td>
                    <td style={{ fontSize: 13 }}>{h.resignDate || '-'}</td>
                    <td className="text-right">{fmtYears(h.tenure || 0)}</td>
                    <td className="text-right">{fmtWon(h.avgSalary)}</td>
                    <td className="text-right"><strong style={{ color: 'var(--primary)' }}>{fmtWon(h.severance)}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.date || '-'}</td>
                    <td>
                      <button className="btn-icon btn-icon-danger" title="삭제" onClick={() => deleteHistory(h.empId, h.id)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ fontWeight: 600 }}>합계</td>
                  <td className="text-right" style={{ fontWeight: 700, color: 'var(--primary)' }}>
                    {fmtWon(filteredHistory.reduce((s, h) => s + (h.severance || 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
