/**
 * LeavesPage.jsx — 휴가·연차 관리
 * page-leaves.js → React 변환 (10차)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb, leaves as leavesDb, attendance as attendanceDb } from '../db.js';
import { canAction } from '../auth.js';

const LEAVE_TYPES = ['연차', '반차', '병가', '경조', '무급'];

function daysBetween(s, e) {
  if (!s || !e) return 1;
  return Math.max(1, Math.round((new Date(e) - new Date(s)) / (1000*60*60*24)) + 1);
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

  async function submit() {
    if (!empId || !startDate || !endDate) { showToast('직원·기간은 필수입니다', 'error'); return; }
    const days = leaveType === '반차' ? 0.5 : daysBetween(startDate, endDate);
    try {
      await leavesDb.create({ employeeId: empId, leaveType, startDate, endDate, days, reason, status: '신청' });
      showToast('신청되었습니다', 'success');
      onSaved();
    } catch (e) { showToast('신청 실패: ' + e.message, 'error'); }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header"><h3>🌴 휴가 신청</h3><button className="btn-close" onClick={onClose} /></div>
        <div className="modal-body">
          <div className="form-group">
            <label>직원 *</label>
            <select className="form-select" value={empId} onChange={e => setEmpId(e.target.value)}>
              <option value="">-- 선택 --</option>
              {emps.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empNo})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>유형</label>
            <select className="form-select" value={leaveType} onChange={e => setLeaveType(e.target.value)}>
              {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label>시작일 *</label><input type="date" className="form-input" value={startDate} onChange={e => setStart(e.target.value)} /></div>
            <div className="form-group"><label>종료일 *</label><input type="date" className="form-input" value={endDate} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div className="form-group"><label>사유</label><textarea className="form-input" rows={3} value={reason} onChange={e => setReason(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={submit}>신청</button>
        </div>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empList, leaveList] = await Promise.all([employeesDb.list({ status: 'active' }), leavesDb.list()]);
      setEmps(empList || []);
      const map = {};
      (empList || []).forEach(e => { map[e.id] = e; });
      setEmpMap(map);
      setLeaves(leaveList || []);
    } catch (e) { showToast('데이터 로드 실패', 'error'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(id) {
    if (!canAction('leave:approve')) { showToast('권한 없음', 'error'); return; }
    const leave = leaves.find(l => l.id === id);
    if (!leave) { showToast('휴가 정보를 찾을 수 없습니다', 'error'); return; }
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

  const statusBadge = s => s === '신청' ? <span className="badge badge-warning">신청</span> : s === '승인' ? <span className="badge badge-success">승인</span> : <span className="badge badge-danger">반려</span>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">🌴 휴가·연차 관리</h1>
          <div className="page-desc">휴가 신청과 승인. (연차 자동 부여 로직은 Phase C 배포)</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ 휴가 신청</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중…</div>
        : leaves.length === 0 ? <div className="empty-state"><div className="icon">🌴</div><div className="msg">신청된 휴가가 없습니다</div></div>
        : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>직원</th><th>유형</th><th>기간</th><th className="text-right">일수</th><th>사유</th><th>상태</th><th style={{ width: 120 }}>관리</th></tr>
              </thead>
              <tbody>
                {leaves.map(l => {
                  const e = empMap[l.employeeId] || {};
                  return (
                    <tr key={l.id}>
                      <td>{e.name || '-'} ({e.empNo || '-'})</td>
                      <td><span className="badge badge-info">{l.leaveType || '-'}</span></td>
                      <td>{l.startDate || '-'} ~ {l.endDate || '-'}</td>
                      <td className="text-right">{l.days || 0}일</td>
                      <td>{l.reason || '-'}</td>
                      <td>{statusBadge(l.status)}</td>
                      <td>
                        {l.status === '신청' && <>
                          <button className="btn-icon" title="승인" onClick={() => approve(l.id)}>✅</button>
                          <button className="btn-icon btn-icon-danger" title="반려" onClick={() => reject(l.id)}>❌</button>
                        </>}
                        <button className="btn-icon btn-icon-danger" title="삭제" onClick={() => del(l.id)}>🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <LeaveModal emps={emps} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
