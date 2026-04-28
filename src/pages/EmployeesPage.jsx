/**
 * EmployeesPage.jsx — 직원 마스터 관리
 * page-employees.js → React 변환 (10차)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb } from '../db.js';
import { canAction } from '../auth.js';
import { addAuditLog } from '../audit-log.js';

const EMP_TYPES = ['정규직', '계약직', '시급직', '일용직'];

function fmtWon(n) { const v = parseFloat(n) || 0; return v ? '₩' + v.toLocaleString('ko-KR') : '-'; }
function maskRRN(rrn) { const s = String(rrn || '').replace(/[^0-9]/g, ''); if (s.length !== 13) return ''; return `${s.slice(0,6)}-${s[6]}******`; }

// ─── 직원 추가/수정 모달 ──────────────────────────────
function EmpModal({ emp, onClose, onSaved }) {
  const isEdit = !!emp;
  const [form, setForm] = useState({
    empNo: emp?.empNo || '', name: emp?.name || '', dept: emp?.dept || '', position: emp?.position || '',
    hireDate: emp?.hireDate || '', employmentType: emp?.employmentType || '정규직',
    baseSalary: emp?.baseSalary || 0, hourlyWage: emp?.hourlyWage || 0,
    phone: emp?.phone || '', email: emp?.email || '', bank: emp?.bank || '', accountNo: emp?.accountNo || '',
    dependents: emp?.dependents || 0, children: emp?.children || 0,
    insuranceFlags: emp?.insuranceFlags || { np: true, hi: true, ei: true, wc: true },
    status: emp?.status || 'active', resignDate: emp?.resignDate || '',
    rrn: '',
  });

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setIns(k, v) { setForm(f => ({ ...f, insuranceFlags: { ...f.insuranceFlags, [k]: v } })); }

  async function save() {
    if (!form.empNo || !form.name || !form.hireDate) { showToast('사번·이름·입사일은 필수입니다', 'error'); return; }
    const canEdit = isEdit ? canAction('employee:edit') : canAction('employee:create');
    if (!canEdit) { showToast('권한이 없습니다', 'error'); return; }
    const payload = { ...form };
    const rrnClean = form.rrn.replace(/[^0-9]/g, '');
    if (rrnClean.length === 13) { payload._rrnPlain = rrnClean; payload.rrnMask = maskRRN(rrnClean); }
    delete payload.rrn;
    try {
      if (isEdit) { await employeesDb.update(emp.id, { ...payload, id: emp.id }); showToast('수정되었습니다', 'success'); }
      else { await employeesDb.create(payload); showToast('등록되었습니다', 'success'); }
      onSaved();
    } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>{isEdit ? '직원 수정' : '직원 추가'}</h3>
          <button className="btn-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group"><label>사번 *</label><input className="form-input" value={form.empNo} onChange={e => setF('empNo', e.target.value)} /></div>
            <div className="form-group"><label>이름 *</label><input className="form-input" value={form.name} onChange={e => setF('name', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>부서</label><input className="form-input" value={form.dept} onChange={e => setF('dept', e.target.value)} /></div>
            <div className="form-group"><label>직급</label><input className="form-input" value={form.position} onChange={e => setF('position', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>입사일 *</label><input type="date" className="form-input" value={form.hireDate} onChange={e => setF('hireDate', e.target.value)} /></div>
            <div className="form-group"><label>고용형태</label>
              <select className="form-select" value={form.employmentType} onChange={e => setF('employmentType', e.target.value)}>
                {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>기본급(월)</label><input type="number" className="form-input" value={form.baseSalary} onChange={e => setF('baseSalary', parseFloat(e.target.value) || 0)} /></div>
            <div className="form-group"><label>시급</label><input type="number" className="form-input" value={form.hourlyWage} onChange={e => setF('hourlyWage', parseFloat(e.target.value) || 0)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>연락처</label><input className="form-input" value={form.phone} onChange={e => setF('phone', e.target.value)} /></div>
            <div className="form-group"><label>이메일</label><input type="email" className="form-input" value={form.email} onChange={e => setF('email', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>은행</label><input className="form-input" value={form.bank} onChange={e => setF('bank', e.target.value)} /></div>
            <div className="form-group"><label>계좌번호</label><input className="form-input" value={form.accountNo} onChange={e => setF('accountNo', e.target.value)} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>부양가족수</label><input type="number" className="form-input" min="0" value={form.dependents} onChange={e => setF('dependents', parseInt(e.target.value) || 0)} /></div>
            <div className="form-group"><label>20세 이하 자녀수</label><input type="number" className="form-input" min="0" value={form.children} onChange={e => setF('children', parseInt(e.target.value) || 0)} /></div>
          </div>
          <div className="form-group">
            <label>주민등록번호 {isEdit ? '(변경 시에만 입력)' : ''}</label>
            <input className="form-input" placeholder="숫자 13자리 (저장 시 AES 암호화)" maxLength={14} value={form.rrn} onChange={e => setF('rrn', e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>※ 저장 후엔 admin만 평문 조회 가능 · 마스킹 표시만 남음</div>
          </div>
          <div className="form-group">
            <label>4대보험 가입</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {[['np','국민연금'],['hi','건강보험'],['ei','고용보험'],['wc','산재']].map(([k,l]) => (
                <label key={k}><input type="checkbox" checked={!!form.insuranceFlags[k]} onChange={e => setIns(k, e.target.checked)} /> {l}</label>
              ))}
            </div>
          </div>
          {isEdit && (
            <>
              <div className="form-group">
                <label>재직상태</label>
                <select className="form-select" value={form.status} onChange={e => setF('status', e.target.value)}>
                  <option value="active">재직중</option>
                  <option value="resigned">퇴사</option>
                </select>
              </div>
              <div className="form-group"><label>퇴사일</label><input type="date" className="form-input" value={form.resignDate} onChange={e => setF('resignDate', e.target.value)} /></div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────
export default function EmployeesPage() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [modalEmp, setModalEmp] = useState(undefined); // undefined=closed, null=add, obj=edit

  const load = useCallback(async () => {
    setLoading(true);
    try { setEmployees(await employeesDb.list()); } catch (e) { showToast('직원 목록 로드 실패', 'error'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = employees.filter(e => {
    if (statusFilter === 'active' && e.status === 'resigned') return false;
    if (statusFilter === 'resigned' && e.status !== 'resigned') return false;
    if (!searchQ) return true;
    return [e.name, e.empNo, e.dept, e.position].join(' ').toLowerCase().includes(searchQ.toLowerCase());
  });

  async function handleDelete(id) {
    if (!canAction('employee:delete')) { showToast('권한 없음(admin 전용)', 'error'); return; }
    if (!confirm('이 직원을 삭제하시겠습니까? 관련 근태·급여 기록도 함께 삭제됩니다.')) return;
    try { await employeesDb.remove(id); showToast('삭제되었습니다', 'success'); load(); }
    catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
  }

  async function handleViewRRN(id) {
    if (!canAction('employee:viewRRN')) { showToast('주민번호 평문 조회는 admin 전용입니다', 'error'); return; }
    try {
      const plain = await employeesDb.getRRN(id);
      if (plain) { addAuditLog('employee.viewRRN', 'employee:' + id, { employeeId: id }); alert('주민등록번호: ' + plain + '\n\n※ 감사 로그에 조회 기록이 남습니다.'); }
      else showToast('조회 실패', 'error');
    } catch (e) { showToast('조회 실패: ' + e.message, 'error'); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 직원 관리</h1>
          <div className="page-desc">직원 등록·수정·조회. 주민번호는 암호화 저장되며 admin만 평문 열람 가능합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setModalEmp(null)}>+ 직원 추가</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-input" placeholder="이름/사번/부서 검색" style={{ flex: 1, minWidth: 200 }} value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="active">재직중</option>
            <option value="resigned">퇴사</option>
            <option value="all">전체</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중…</div>
        : filtered.length === 0 ? <div className="empty-state"><div className="icon"></div><div className="msg">등록된 직원이 없습니다</div></div>
        : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>사번</th><th>이름</th><th>부서/직급</th><th>입사일</th><th>고용형태</th>
                  <th className="text-right">기본급</th><th>주민번호</th><th style={{ width: 80 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id}>
                    <td><strong>{e.empNo || ''}</strong></td>
                    <td>{e.name || ''}</td>
                    <td>{e.dept || '-'} / {e.position || '-'}</td>
                    <td>{e.hireDate || '-'}</td>
                    <td><span className="badge badge-info">{e.employmentType || '정규직'}</span></td>
                    <td className="text-right">{fmtWon(e.baseSalary)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {e.rrnMask || '-'}
                      {e.rrnMask && <button className="btn-icon" title="평문 조회(admin)" onClick={() => handleViewRRN(e.id)}></button>}
                    </td>
                    <td>
                      <button className="btn-icon" onClick={() => setModalEmp(e)}></button>
                      <button className="btn-icon btn-icon-danger" onClick={() => handleDelete(e.id)}></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalEmp !== undefined && (
        <EmpModal emp={modalEmp} onClose={() => setModalEmp(undefined)} onSaved={() => { setModalEmp(undefined); load(); }} />
      )}
    </div>
  );
}
