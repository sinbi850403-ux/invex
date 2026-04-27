/**
 * AttendancePage.jsx — 근태 관리
 * page-attendance.js → React 변환 (10차)
 */

import React, { useState, useEffect } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, attendance as attendanceDb } from '../db.js';
import { classifyWorkMinutes, summarizeMonth, minToHours } from '../attendance-calc.js';

function todayYM() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }

export default function AttendancePage() {
  const { y: initY, m: initM } = todayYM();
  const [emps, setEmps] = useState([]);
  const [empId, setEmpId] = useState('');
  const [year, setYear] = useState(initY);
  const [month, setMonth] = useState(initM);
  const [recs, setRecs] = useState([]);
  const [recMap, setRecMap] = useState({});
  const [rowData, setRowData] = useState({}); // {date: {ci, co, brk, status, note}}
  const [summary, setSummary] = useState(null);
  const [lastDay, setLastDay] = useState(31);

  useEffect(() => {
    employeesDb.list({ status: 'active' }).then(list => setEmps(list || [])).catch(() => showToast('직원 목록 로드 실패', 'error'));
  }, []);

  async function load() {
    if (!empId) return;
    const ld = new Date(year, month, 0).getDate();
    setLastDay(ld);
    const from = `${year}-${String(month).padStart(2,'0')}-01`;
    const to = `${year}-${String(month).padStart(2,'0')}-${String(ld).padStart(2,'0')}`;
    try {
      const list = await attendanceDb.list({ employeeId: empId, from, to });
      const map = {};
      list.forEach(r => { map[r.workDate] = r; });
      setRecs(list);
      setRecMap(map);
      setSummary(summarizeMonth(list));
      // init rowData
      const rd = {};
      for (let d = 1; d <= ld; d++) {
        const dk = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const r = map[dk];
        rd[dk] = { ci: r?.checkIn || '', co: r?.checkOut || '', brk: r?.breakMin ?? 60, status: r?.status || '정상', note: r?.note || '' };
      }
      setRowData(rd);
    } catch (e) { showToast('근태 조회 실패: ' + e.message, 'error'); }
  }

  function updateRow(date, field, value) {
    setRowData(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  }

  async function saveAll() {
    const payload = [];
    for (const [date, row] of Object.entries(rowData)) {
      if (!row.ci && !row.co && row.status === '정상' && !row.note) continue;
      const d = new Date(date);
      const isHoliday = d.getDay() === 0;
      const { regular, overtime, night, holiday, totalWork } = classifyWorkMinutes(row.ci, row.co, parseInt(row.brk) || 0, isHoliday);
      payload.push({ employeeId: empId, workDate: date, checkIn: row.ci || null, checkOut: row.co || null, breakMin: parseInt(row.brk) || 0, workMin: totalWork, overtimeMin: overtime, nightMin: night, holidayMin: holiday, status: row.status, note: row.note });
    }
    if (!payload.length) { showToast('저장할 데이터가 없습니다', 'warning'); return; }
    try { await attendanceDb.bulkUpsert(payload); showToast(`${payload.length}건 저장되었습니다`, 'success'); load(); }
    catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
  }

  const days = Array.from({ length: lastDay }, (_, i) => i + 1);
  const DOW = ['일','월','화','수','목','금','토'];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🕐 근태 관리</h1>
          <div className="page-desc">월 단위 출퇴근 기록. 연장·야간·휴일 근무는 자동 분류됩니다.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="form-row">
          <div className="form-group">
            <label>직원 선택</label>
            <select className="form-select" value={empId} onChange={e => { setEmpId(e.target.value); setSummary(null); setRowData({}); }}>
              <option value="">-- 선택 --</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empNo})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>연도</label>
            <input type="number" className="form-input" value={year} onChange={e => setYear(parseInt(e.target.value) || initY)} />
          </div>
          <div className="form-group">
            <label>월</label>
            <select className="form-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i+1} value={i+1}>{i+1}월</option>)}
            </select>
          </div>
          <div className="form-group" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-primary" onClick={load}>조회</button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="stat-grid" style={{ marginBottom: 12 }}>
          {[['출근일수', `${summary.days}일`], ['총 근무', `${minToHours(summary.totalMin)}h`],
            ['연장', `${minToHours(summary.overtimeMin)}h`, 'var(--warning)'],
            ['야간', `${minToHours(summary.nightMin)}h`, 'var(--accent)'],
            ['휴일', `${minToHours(summary.holidayMin)}h`, 'var(--danger)'],
            ['결근', `${summary.absentDays}일`]].map(([label, val, color]) => (
            <div key={label} className="stat-card">
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={color ? { color } : {}}>{val}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {!empId ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>직원을 선택하세요.</div> : Object.keys(rowData).length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>조회 버튼을 눌러 근태를 불러오세요.</div> : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>시간 입력 후 "일괄 저장"을 누르면 연장/야간/휴일 근무가 자동 분류됩니다.</div>
              <button className="btn btn-primary" onClick={saveAll}>💾 일괄 저장</button>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr><th>일</th><th>출근</th><th>퇴근</th><th>휴게(분)</th><th className="text-right">총근무</th><th className="text-right">연장</th><th className="text-right">야간</th><th>상태</th><th>비고</th></tr>
                </thead>
                <tbody>
                  {days.map(d => {
                    const dk = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const dow = DOW[new Date(dk).getDay()];
                    const isWeekend = new Date(dk).getDay() === 0 || new Date(dk).getDay() === 6;
                    const row = rowData[dk] || { ci: '', co: '', brk: 60, status: '정상', note: '' };
                    const r = recMap[dk];
                    return (
                      <tr key={dk} style={isWeekend ? { background: 'rgba(0,0,0,0.02)' } : {}}>
                        <td>{d} <span style={{ color: 'var(--text-muted)' }}>({dow})</span></td>
                        <td><input type="time" className="form-input" value={row.ci} onChange={e => updateRow(dk,'ci',e.target.value)} style={{ padding: '3px 6px' }} /></td>
                        <td><input type="time" className="form-input" value={row.co} onChange={e => updateRow(dk,'co',e.target.value)} style={{ padding: '3px 6px' }} /></td>
                        <td><input type="number" className="form-input" value={row.brk} min="0" onChange={e => updateRow(dk,'brk',e.target.value)} style={{ width: 70, padding: '3px 6px' }} /></td>
                        <td className="text-right">{r ? minToHours(r.workMin || 0) + 'h' : '-'}</td>
                        <td className="text-right">{r ? minToHours(r.overtimeMin || 0) + 'h' : '-'}</td>
                        <td className="text-right">{r ? minToHours(r.nightMin || 0) + 'h' : '-'}</td>
                        <td>
                          <select className="form-select" value={row.status} onChange={e => updateRow(dk,'status',e.target.value)} style={{ padding: '3px 6px' }}>
                            {['정상','지각','조퇴','휴가','결근'].map(s => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td><input className="form-input" value={row.note} onChange={e => updateRow(dk,'note',e.target.value)} style={{ padding: '3px 6px' }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
