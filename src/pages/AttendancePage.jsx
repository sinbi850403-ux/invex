/**
 * AttendancePage.jsx — 근태 관리 (초고도화)
 * - 탭: 테이블 입력 | 달력 뷰
 * - 달력: 일별 출/퇴근 시각·상태를 월간 달력에 시각화
 * - 상태별 색상 배지 (정상/지각/조퇴/휴가/결근)
 * - 요약 카드 + 일괄 저장 유지
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, attendance as attendanceDb } from '../db.js';
import { classifyWorkMinutes, summarizeMonth, minToHours } from '../attendance-calc.js';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const STATUS_OPTS = ['정상', '지각', '조퇴', '휴가', '결근'];
const STATUS_COLOR = {
  정상: { bg: 'var(--primary-subtle, #e3f0ff)', color: 'var(--primary)' },
  지각: { bg: '#fff8e1', color: '#f59e0b' },
  조퇴: { bg: '#fff3e0', color: '#f97316' },
  휴가: { bg: '#e8f5e9', color: '#10b981' },
  결근: { bg: '#fce4ec', color: 'var(--danger)' },
};

function todayYM() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }
function pad2(n) { return String(n).padStart(2, '0'); }
function dk(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

export default function AttendancePage() {
  const { y: initY, m: initM } = todayYM();
  const [emps, setEmps] = useState([]);
  const [empId, setEmpId] = useState('');
  const [year, setYear] = useState(initY);
  const [month, setMonth] = useState(initM);
  const [recMap, setRecMap] = useState({});
  const [rowData, setRowData] = useState({});
  const [summary, setSummary] = useState(null);
  const [lastDay, setLastDay] = useState(31);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('table'); // 'table' | 'calendar'

  useEffect(() => {
    employeesDb.list({ status: 'active' })
      .then(list => setEmps(list || []))
      .catch(() => showToast('직원 목록 로드 실패', 'error'));
  }, []);

  const load = useCallback(async () => {
    if (!empId) return;
    const ld = new Date(year, month, 0).getDate();
    setLastDay(ld);
    const from = dk(year, month, 1);
    const to = dk(year, month, ld);
    try {
      const list = await attendanceDb.list({ employeeId: empId, from, to });
      const map = {};
      list.forEach(r => { map[r.workDate] = r; });
      setRecMap(map);
      setSummary(summarizeMonth(list));
      const rd = {};
      for (let d = 1; d <= ld; d++) {
        const key = dk(year, month, d);
        const r = map[key];
        rd[key] = { ci: r?.checkIn || '', co: r?.checkOut || '', brk: r?.breakMin ?? 60, status: r?.status || '정상', note: r?.note || '' };
      }
      setRowData(rd);
      setLoaded(true);
    } catch (e) { showToast('근태 조회 실패: ' + e.message, 'error'); }
  }, [empId, year, month]);

  function updateRow(date, field, value) {
    setRowData(prev => ({ ...prev, [date]: { ...prev[date], [field]: value } }));
  }

  async function saveAll() {
    const payload = [];
    for (const [date, row] of Object.entries(rowData)) {
      if (!row.ci && !row.co && row.status === '정상' && !row.note) continue;
      const dow = new Date(date).getDay();
      const isHoliday = dow === 0;
      const { overtime, night, holiday, totalWork } = classifyWorkMinutes(row.ci, row.co, parseInt(row.brk) || 0, isHoliday);
      payload.push({
        employeeId: empId, workDate: date,
        checkIn: row.ci || null, checkOut: row.co || null,
        breakMin: parseInt(row.brk) || 0,
        workMin: totalWork, overtimeMin: overtime, nightMin: night, holidayMin: holiday,
        status: row.status, note: row.note,
      });
    }
    if (!payload.length) { showToast('저장할 데이터가 없습니다', 'warning'); return; }
    try {
      await attendanceDb.bulkUpsert(payload);
      showToast(`${payload.length}건 저장되었습니다`, 'success');
      load();
    } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
  }

  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay]);

  // 달력 계산: 해당 월 1일 요일 기준 그리드
  const calendarCells = useMemo(() => {
    const firstDow = new Date(year, month - 1, 1).getDay(); // 0=일
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) cells.push(d);
    return cells;
  }, [year, month, lastDay]);

  const empName = emps.find(e => e.id === empId)?.name || '';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">근태 관리</h1>
          <div className="page-desc">월 단위 출퇴근 기록. 연장·야간·휴일 근무는 자동 분류됩니다.</div>
        </div>
      </div>

      {/* 검색 조건 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: '1 1 180px', margin: 0 }}>
            <label className="form-label">직원 선택</label>
            <select className="form-select" value={empId} onChange={e => { setEmpId(e.target.value); setSummary(null); setRowData({}); setLoaded(false); }}>
              <option value="">-- 선택 --</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empNo})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: '0 0 100px', margin: 0 }}>
            <label className="form-label">연도</label>
            <input type="number" className="form-input" value={year} onChange={e => setYear(parseInt(e.target.value) || initY)} />
          </div>
          <div className="form-group" style={{ flex: '0 0 90px', margin: 0 }}>
            <label className="form-label">월</label>
            <select className="form-select" value={month} onChange={e => setMonth(parseInt(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select>
          </div>
          <button className="btn btn-primary" style={{ height: 38 }} onClick={load}>조회</button>
        </div>
      </div>

      {/* 요약 카드 */}
      {summary && (
        <div className="stat-grid" style={{ marginBottom: 12 }}>
          {[
            ['출근일수', `${summary.days}일`, ''],
            ['총 근무', `${minToHours(summary.totalMin)}h`, ''],
            ['연장', `${minToHours(summary.overtimeMin)}h`, 'var(--warning)'],
            ['야간', `${minToHours(summary.nightMin)}h`, '#8b5cf6'],
            ['휴일', `${minToHours(summary.holidayMin)}h`, 'var(--danger)'],
            ['결근', `${summary.absentDays}일`, summary.absentDays > 0 ? 'var(--danger)' : ''],
          ].map(([label, val, color]) => (
            <div key={label} className="stat-card">
              <div className="stat-label">{label}</div>
              <div className="stat-value" style={color ? { color } : {}}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* 뷰 탭 */}
      {loaded && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {[['table', '표 입력'], ['calendar', '달력 뷰']].map(([k, l]) => (
            <button key={k} className={`btn ${view === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      )}

      {/* 표 입력 뷰 */}
      {view === 'table' && (
        <div className="card">
          {!empId ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>직원을 선택하세요.</div>
          ) : !loaded ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>조회 버튼을 눌러 근태를 불러오세요.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {empName} · {year}년 {month}월 · 입력 후 일괄 저장
                </div>
                <button className="btn btn-primary" onClick={saveAll}>일괄 저장</button>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}>일</th>
                      <th>출근</th>
                      <th>퇴근</th>
                      <th style={{ width: 80 }}>휴게(분)</th>
                      <th className="text-right">총근무</th>
                      <th className="text-right">연장</th>
                      <th className="text-right">야간</th>
                      <th style={{ width: 90 }}>상태</th>
                      <th>비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map(d => {
                      const key = dk(year, month, d);
                      const dow = new Date(key).getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const row = rowData[key] || { ci: '', co: '', brk: 60, status: '정상', note: '' };
                      const r = recMap[key];
                      const sc = STATUS_COLOR[row.status] || STATUS_COLOR['정상'];
                      return (
                        <tr key={key} style={isWeekend ? { background: 'rgba(0,0,0,0.025)' } : {}}>
                          <td>
                            <span style={{ fontWeight: isWeekend ? 600 : 400, color: dow === 0 ? 'var(--danger)' : dow === 6 ? 'var(--primary)' : undefined }}>
                              {d} ({DOW[dow]})
                            </span>
                          </td>
                          <td><input type="time" className="form-input" value={row.ci} onChange={e => updateRow(key, 'ci', e.target.value)} style={{ padding: '3px 6px', minWidth: 90 }} /></td>
                          <td><input type="time" className="form-input" value={row.co} onChange={e => updateRow(key, 'co', e.target.value)} style={{ padding: '3px 6px', minWidth: 90 }} /></td>
                          <td><input type="number" className="form-input" value={row.brk} min="0" onChange={e => updateRow(key, 'brk', e.target.value)} style={{ width: 70, padding: '3px 6px' }} /></td>
                          <td className="text-right" style={{ fontSize: 13 }}>{r ? minToHours(r.workMin || 0) + 'h' : '-'}</td>
                          <td className="text-right" style={{ fontSize: 13, color: 'var(--warning)' }}>{r && r.overtimeMin > 0 ? minToHours(r.overtimeMin) + 'h' : '-'}</td>
                          <td className="text-right" style={{ fontSize: 13, color: '#8b5cf6' }}>{r && r.nightMin > 0 ? minToHours(r.nightMin) + 'h' : '-'}</td>
                          <td>
                            <select
                              className="form-select"
                              value={row.status}
                              onChange={e => updateRow(key, 'status', e.target.value)}
                              style={{ padding: '3px 6px', background: sc.bg, color: sc.color, fontWeight: 500 }}
                            >
                              {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
                            </select>
                          </td>
                          <td><input className="form-input" value={row.note} onChange={e => updateRow(key, 'note', e.target.value)} style={{ padding: '3px 6px' }} placeholder="메모" /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* 달력 뷰 */}
      {view === 'calendar' && loaded && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{empName} · {year}년 {month}월</div>
            <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
              {Object.entries(STATUS_COLOR).map(([s, c]) => (
                <span key={s} style={{ padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color, fontWeight: 500 }}>{s}</span>
              ))}
            </div>
          </div>

          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
            {DOW.map((d, i) => (
              <div key={d} style={{
                textAlign: 'center', padding: '6px 0', fontWeight: 600, fontSize: 13,
                color: i === 0 ? 'var(--danger)' : i === 6 ? 'var(--primary)' : 'var(--text-muted)',
              }}>{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {calendarCells.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} />;
              const key = dk(year, month, d);
              const row = rowData[key];
              const r = recMap[key];
              const dow = new Date(key).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isToday = key === dk(initY, initM, new Date().getDate()) && year === initY && month === initM;
              const sc = row ? STATUS_COLOR[row.status] || STATUS_COLOR['정상'] : null;
              return (
                <div key={key} style={{
                  border: isToday ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  minHeight: 80,
                  background: isWeekend ? 'var(--bg-subtle)' : 'var(--bg-card)',
                  position: 'relative',
                }}>
                  <div style={{
                    fontWeight: isToday ? 700 : isWeekend ? 600 : 400,
                    fontSize: 13,
                    color: dow === 0 ? 'var(--danger)' : dow === 6 ? 'var(--primary)' : undefined,
                    marginBottom: 4,
                  }}>{d}</div>
                  {row && row.status !== '정상' && (
                    <div style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 6,
                      background: sc?.bg, color: sc?.color, display: 'inline-block', marginBottom: 2,
                    }}>{row.status}</div>
                  )}
                  {row?.ci && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      <span style={{ color: '#10b981' }}>▶</span> {row.ci}
                    </div>
                  )}
                  {row?.co && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--danger)' }}>■</span> {row.co}
                    </div>
                  )}
                  {r && r.workMin > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {minToHours(r.workMin)}h
                      {r.overtimeMin > 0 && <span style={{ color: 'var(--warning)' }}> +{minToHours(r.overtimeMin)}h</span>}
                    </div>
                  )}
                  {row?.note && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.note}>
                      {row.note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
