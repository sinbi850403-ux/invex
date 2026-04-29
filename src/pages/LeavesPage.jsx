/**
 * LeavesPage.jsx — 휴가·연차 관리 (초고도화)
 * - 연차 자동 부여: 입사 1년 미만 → 월 1일, 1년 이상 → 15+α일
 * - 직원별 연차 현황판 (부여·사용·잔여)
 * - 휴가 신청/승인/반려/삭제
 * - 필터: 직원·유형·상태·연도
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, leaves as leavesDb, attendance as attendanceDb } from '../db.js';
import { canAction } from '../auth.js';

const LEAVE_TYPES = ['연차', '반차', '병가', '경조', '무급', '특별휴가'];
const STATUS_LABELS = { '신청': 'badge-warning', '승인': 'badge-success', '반려': 'badge-danger' };

function daysBetween(s, e) {
  if (!s || !e) return 1;
  return Math.max(1, Math.round((new Date(e) - new Date(s)) / (1000 * 60 * 60 * 24)) + 1);
}

/** 근로기준법 기준 연차 계산 */
function calcAnnualLeaveEntitled(hireDate, targetYear) {
  if (!hireDate) return 0;
  const hire = new Date(hireDate);
  const yearStart = new Date(targetYear, 0, 1);
  const yearEnd = new Date(targetYear, 11, 31);

  const monthsWorked = (yearStart - hire) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsWorked < 0) {
    // 입사년도: 입사일 이후 해당 연도 내 근무 월수 × 1일
    const endOfYear = hire.getFullYear() === targetYear ? yearEnd : hire;
    const m = Math.max(0, Math.floor((Math.min(yearEnd, endOfYear) - hire) / (1000 * 60 * 60 * 24 * 30.44)));
    return Math.min(m, 11);
  }
  const yearsWorked = monthsWorked / 12;
  if (yearsWorked < 1) {
    // 1년 미만: 전년 입사월부터 이번 연도 내 발생 월차
    const m = Math.floor((yearEnd - hire) / (1000 * 60 * 60 * 24 * 30.44));
    return Math.min(m, 11);
  }
  // 1년 이상: 15일 + 2년 초과마다 1일 (최대 25일)
  const extra = Math.floor((yearsWorked - 1) / 2);
  return Math.min(15 + extra, 25);
}

async function syncLeaveToAttendance(employeeId, startDate, endDate) {
  const records = [];
  for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
    records.push({ employeeId, workDate: d.toISOString().split('T')[0], status: '휴가' });
  }
  if (records.length) await attendanceDb.bulkUpsert(records);
}

// ─── 휴가 신청 모달 ───────────────────────────────────
function LeaveModal({ emps, onClose, onSaved }) {
  const [empId, setEmpId] = useState('');
  const [leaveType, setLeaveType] = useState('연차');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const days = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return leaveType === '반차' ? 0.5 : daysBetween(startDate, endDate);
  }, [startDate, endDate, leaveType]);

  async function submit() {
    if (!empId || !startDate || !endDate) { showToast('직원·기간은 필수입니다', 'error'); return; }
    if (new Date(endDate) < new Date(startDate)) { showToast('종료일이 시작일보다 앞섭니다', 'error'); return; }
    setSubmitting(true);
    try {
      await leavesDb.create({ employeeId: empId, leaveType, startDate, endDate, days, reason, status: '신청' });
      showToast('신청되었습니다', 'success');
      onSaved();
    } catch (e) { showToast('신청 실패: ' + e.message, 'error'); }
    setSubmitting(false);
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3 className="modal-title">휴가 신청</h3>
          <button className="modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">직원 <span className="required">*</span></label>
            <select className="form-select" value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">-- 직원 선택 --</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empNo}) · {e.dept || '-'}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">휴가 유형</label>
            <select className="form-select" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
              {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">시작일 <span className="required">*</span></label>
              <input type="date" className="form-input" value={startDate} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">종료일 <span className="required">*</span></label>
              <input type="date" className="form-input" value={endDate} min={startDate} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>
          {days > 0 && (
            <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
              사용 일수: <strong>{days}일</strong>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">사유</label>
            <textarea className="form-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="사유를 입력하세요 (선택)" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? '처리 중…' : '신청'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── 연차 현황 카드 ───────────────────────────────────
function LeaveStatusCard({ emp, leaves, year }) {
  const entitled = calcAnnualLeaveEntitled(emp.hireDate, year);
  const used = leaves
    .filter(l => l.employeeId === emp.id && l.status === '승인' && l.leaveType === '연차' && (l.startDate || '').startsWith(String(year)))
    .reduce((s, l) => s + (l.days || 0), 0);
  const remaining = Math.max(0, entitled - used);
  const pct = entitled > 0 ? Math.min(100, Math.round((used / entitled) * 100)) : 0;

  return (
    <div className="card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{emp.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{emp.dept || '-'} · {emp.position || '-'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: remaining <= 3 ? 'var(--danger)' : 'var(--primary)' }}>{remaining}일</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>잔여</div>
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--border-color)', borderRadius: 2, marginBottom: 8 }}>
        <div style={{ height: '100%', width: pct + '%', background: pct >= 80 ? 'var(--danger)' : 'var(--primary)', borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>부여 {entitled}일</span>
        <span>사용 {used}일</span>
        <span>{pct}% 소진</span>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────
export default function LeavesPage() {
  const [leaves, setLeaves] = useState([]);
  const [emps, setEmps] = useState([]);
  const [empMap, setEmpMap] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('list'); // 'list' | 'status'

  // 필터
  const [filterEmp, setFilterEmp] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empList, leaveList] = await Promise.all([
        employeesDb.list({ status: 'active' }),
        leavesDb.list(),
      ]);
      setEmps(empList || []);
      const map = {};
      (empList || []).forEach(e => { map[e.id] = e; });
      setEmpMap(map);
      setLeaves(leaveList || []);
    } catch { showToast('데이터 로드 실패', 'error'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return leaves.filter(l => {
      if (filterEmp && l.employeeId !== filterEmp) return false;
      if (filterType && l.leaveType !== filterType) return false;
      if (filterStatus && l.status !== filterStatus) return false;
      if (filterYear && !(l.startDate || '').startsWith(String(filterYear))) return false;
      return true;
    });
  }, [leaves, filterEmp, filterType, filterStatus, filterYear]);

  // 이번달 통계
  const stats = useMemo(() => {
    const ym = `${filterYear}-`;
    const yearLeaves = leaves.filter(l => (l.startDate || '').startsWith(ym));
    const pending = yearLeaves.filter(l => l.status === '신청').length;
    const approved = yearLeaves.filter(l => l.status === '승인').length;
    const totalDays = yearLeaves.filter(l => l.status === '승인').reduce((s, l) => s + (l.days || 0), 0);
    return { pending, approved, totalDays };
  }, [leaves, filterYear]);

  async function approve(id) {
    if (!canAction('leave:approve')) { showToast('권한 없음', 'error'); return; }
    const leave = leaves.find(l => l.id === id);
    if (!leave) return;
    try {
      await leavesDb.update(id, { status: '승인', approvedAt: new Date().toISOString() });
      const emp = empMap[leave.employeeId];
      if (emp) await employeesDb.update(emp.id, { annualLeaveUsed: (emp.annualLeaveUsed || 0) + leave.days });
      await syncLeaveToAttendance(leave.employeeId, leave.startDate, leave.endDate);
      showToast('승인되었습니다', 'success');
      load();
    } catch (e) { showToast('승인 실패: ' + e.message, 'error'); }
  }

  async function reject(id) {
    if (!canAction('leave:approve')) { showToast('권한 없음', 'error'); return; }
    await leavesDb.update(id, { status: '반려' });
    showToast('반려되었습니다', 'success');
    load();
  }

  async function del(id) {
    if (!confirm('휴가 신청을 삭제하시겠습니까?')) return;
    await leavesDb.remove(id);
    load();
  }

  const years = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1];
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">휴가·연차 관리</h1>
          <div className="page-desc">휴가 신청·승인 및 연차 자동 부여 현황을 관리합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ 휴가 신청</button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">승인 대기</div>
          <div className="stat-value" style={{ color: stats.pending > 0 ? 'var(--warning)' : undefined }}>{stats.pending}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{filterYear}년 승인</div>
          <div className="stat-value">{stats.approved}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{filterYear}년 사용 일수</div>
          <div className="stat-value">{stats.totalDays}일</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">재직 직원</div>
          <div className="stat-value">{emps.length}명</div>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {[['list', '휴가 신청 목록'], ['status', '연차 현황판']].map(([k, l]) => (
          <button key={k} className={`btn ${tab === k ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'list' && (
        <>
          {/* 필터 */}
          <div className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="form-select" style={{ minWidth: 160 }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
                {years.map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select className="form-select" style={{ minWidth: 140 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
                <option value="">전체 직원</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <select className="form-select" style={{ minWidth: 120 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">전체 유형</option>
                {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
              <select className="form-select" style={{ minWidth: 120 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">전체 상태</option>
                <option value="신청">신청</option>
                <option value="승인">승인</option>
                <option value="반려">반려</option>
              </select>
              {(filterEmp || filterType || filterStatus) && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setFilterEmp(''); setFilterType(''); setFilterStatus(''); }}>필터 초기화</button>
              )}
            </div>
          </div>

          <div className="card">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중…</div>
            ) : filtered.length === 0 ? (
              <div className="empty-state"><div className="msg">조건에 맞는 휴가 신청이 없습니다</div></div>
            ) : (
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>직원</th>
                      <th>유형</th>
                      <th>기간</th>
                      <th className="text-right">일수</th>
                      <th>사유</th>
                      <th>상태</th>
                      <th>신청일</th>
                      <th style={{ width: 100 }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(l => {
                      const e = empMap[l.employeeId] || {};
                      return (
                        <tr key={l.id}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{e.name || '-'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.dept || ''}</div>
                          </td>
                          <td><span className="badge badge-info">{l.leaveType || '-'}</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}>{l.startDate || '-'} ~ {l.endDate || '-'}</td>
                          <td className="text-right"><strong>{l.days || 0}</strong>일</td>
                          <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason || '-'}</td>
                          <td><span className={`badge ${STATUS_LABELS[l.status] || 'badge-info'}`}>{l.status}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{(l.createdAt || '').slice(0, 10) || '-'}</td>
                          <td>
                            {l.status === '신청' && (
                              <>
                                <button className="btn-icon" title="승인" onClick={() => approve(l.id)}>✓</button>
                                <button className="btn-icon btn-icon-danger" title="반려" onClick={() => reject(l.id)}>✗</button>
                              </>
                            )}
                            <button className="btn-icon btn-icon-danger" title="삭제" onClick={() => del(l.id)}>×</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ fontWeight: 600 }}>합계</td>
                      <td className="text-right" style={{ fontWeight: 700 }}>
                        {filtered.filter(l => l.status === '승인').reduce((s, l) => s + (l.days || 0), 0)}일
                      </td>
                      <td colSpan={4} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'status' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>기준 연도:</span>
            <select className="form-select" style={{ width: 120 }} value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
              {years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>근로기준법 기준 (1년 미만 월 1일, 1년 이상 15일+α, 최대 25일)</span>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중…</div>
          ) : emps.length === 0 ? (
            <div className="empty-state"><div className="msg">재직 중인 직원이 없습니다</div></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {emps.map(e => <LeaveStatusCard key={e.id} emp={e} leaves={leaves} year={filterYear} />)}
            </div>
          )}
        </>
      )}

      {showModal && (
        <LeaveModal
          emps={emps}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
