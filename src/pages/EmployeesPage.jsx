/**
 * EmployeesPage.jsx — 직원 마스터 관리 (초고도화)
 * - 부서별 필터 + 고용형태 필터
 * - 엑셀 내보내기 (ExcelJS)
 * - 통계 카드 (재직/퇴사/부서 수/총 급여)
 * - 연락처·계좌번호 인라인 마스킹
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../toast.js';
import { employees as employeesDb } from '../db.js';
import { canAction } from '../auth.js';
import { addAuditLog } from '../audit-log.js';
import { fmtWon } from '../utils/formatters.js';

const EMP_TYPES = ['정규직', '계약직', '시급직', '일용직'];
function maskRRN(rrn) {
  const s = String(rrn || '').replace(/[^0-9]/g, '');
  if (s.length !== 13) return '';
  return `${s.slice(0, 6)}-${s[6]}******`;
}
function tenure(hireDate) {
  if (!hireDate) return '';
  const ms = Date.now() - new Date(hireDate).getTime();
  const yr = Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000));
  const mo = Math.floor((ms % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
  return yr > 0 ? `${yr}년 ${mo}개월` : `${mo}개월`;
}

// ─── 직원 추가/수정 모달 ──────────────────────────────
function EmpModal({ emp, onClose, onSaved }) {
  const isEdit = !!emp;
  const [form, setForm] = useState({
    empNo: emp?.empNo || '',
    name: emp?.name || '',
    dept: emp?.dept || '',
    position: emp?.position || '',
    hireDate: emp?.hireDate || '',
    employmentType: emp?.employmentType || '정규직',
    baseSalary: emp?.baseSalary || 0,
    hourlyWage: emp?.hourlyWage || 0,
    phone: emp?.phone || '',
    email: emp?.email || '',
    bank: emp?.bank || '',
    accountNo: '',  // 변경 시에만 입력 (현재 마스킹값: accountNoMask)
    dependents: emp?.dependents || 0,
    children: emp?.children || 0,
    insuranceFlags: emp?.insuranceFlags || { np: true, hi: true, ei: true, wc: true },
    allowances: emp?.allowances || { 식대: 0, 직책수당: 0, 상여금: 0, 기타수당: 0 },
    smeReduction: emp?.smeReduction || { enabled: false, category: 'youth', startDate: '' },
    status: emp?.status || 'active',
    resignDate: emp?.resignDate || '',
    rrn: '',
  });
  const [tab, setTab] = useState('basic');

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setIns(k, v) { setForm(f => ({ ...f, insuranceFlags: { ...f.insuranceFlags, [k]: v } })); }
  function setSme(k, v) { setForm(f => ({ ...f, smeReduction: { ...f.smeReduction, [k]: v } })); }

  async function save() {
    if (!form.empNo || !form.name || !form.hireDate) { showToast('사번·이름·입사일은 필수입니다', 'error'); return; }
    const canEdit = isEdit ? canAction('employee:edit') : canAction('employee:create');
    if (!canEdit) { showToast('권한이 없습니다', 'error'); return; }
    const newAccountNo = form.accountNo.trim();
    const payload = { ...form };
    delete payload.accountNo;  // H-001: storeEmployeeToDb에서 account_no 직접 쓰기 차단 — RPC 경유
    const rrnClean = form.rrn.replace(/[^0-9]/g, '');
    if (rrnClean.length === 13) { payload._rrnPlain = rrnClean; payload.rrnMask = maskRRN(rrnClean); }
    delete payload.rrn;
    try {
      if (isEdit) {
        await employeesDb.update(emp.id, { ...payload, id: emp.id });
        // 계좌번호 변경 시 별도 암호화 RPC 경유 저장
        if (newAccountNo) {
          await employeesDb.setAccountNo(emp.id, newAccountNo);
        }
        showToast('수정되었습니다', 'success');
      } else {
        const saved = await employeesDb.create(payload);
        if (newAccountNo && saved?.id) {
          await employeesDb.setAccountNo(saved.id, newAccountNo);
        }
        showToast('등록되었습니다', 'success');
      }
      onSaved();
    } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
  }

  const tabStyle = (k) => ({
    padding: '6px 16px',
    border: 'none',
    borderBottom: tab === k ? '2px solid var(--primary)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: tab === k ? 600 : 400,
    color: tab === k ? 'var(--primary)' : 'var(--text-muted)',
    fontSize: 14,
  });

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? '직원 수정' : '직원 추가'}</h3>
          <button className="modal-close" onClick={onClose} />
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px' }}>
          {[['basic', '기본정보'], ['pay', '급여·보험'], ['extra', '추가정보']].map(([k, l]) => (
            <button key={k} style={tabStyle(k)} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'basic' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">사번 <span className="required">*</span></label>
                  <input className="form-input" value={form.empNo} onChange={e => setF('empNo', e.target.value)} placeholder="예: EMP001" />
                </div>
                <div className="form-group">
                  <label className="form-label">이름 <span className="required">*</span></label>
                  <input className="form-input" value={form.name} onChange={e => setF('name', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">부서</label>
                  <input className="form-input" value={form.dept} onChange={e => setF('dept', e.target.value)} placeholder="예: 개발팀" />
                </div>
                <div className="form-group">
                  <label className="form-label">직급</label>
                  <input className="form-input" value={form.position} onChange={e => setF('position', e.target.value)} placeholder="예: 대리" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">입사일 <span className="required">*</span></label>
                  <input type="date" className="form-input" value={form.hireDate} onChange={e => setF('hireDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">고용형태</label>
                  <select className="form-select" value={form.employmentType} onChange={e => setF('employmentType', e.target.value)}>
                    {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">연락처</label>
                  <input className="form-input" value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="010-0000-0000" />
                </div>
                <div className="form-group">
                  <label className="form-label">이메일</label>
                  <input type="email" className="form-input" value={form.email} onChange={e => setF('email', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">주민등록번호 {isEdit ? '(변경 시에만 입력)' : ''}</label>
                <input className="form-input" placeholder="숫자 13자리 (저장 시 AES 암호화)" maxLength={14} value={form.rrn} onChange={e => setF('rrn', e.target.value)} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>저장 후엔 admin만 평문 열람 가능 · 마스킹만 표시됩니다</div>
              </div>
              {isEdit && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">재직상태</label>
                    <select className="form-select" value={form.status} onChange={e => setF('status', e.target.value)}>
                      <option value="active">재직중</option>
                      <option value="resigned">퇴사</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">퇴사일</label>
                    <input type="date" className="form-input" value={form.resignDate} onChange={e => setF('resignDate', e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'pay' && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">기본급(월)</label>
                  <input type="number" className="form-input" min="0" value={form.baseSalary} onChange={e => setF('baseSalary', parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="form-group">
                  <label className="form-label">시급 (시급직인 경우)</label>
                  <input type="number" className="form-input" min="0" value={form.hourlyWage} onChange={e => setF('hourlyWage', parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">은행</label>
                  <input className="form-input" value={form.bank} onChange={e => setF('bank', e.target.value)} placeholder="예: 국민은행" />
                </div>
                <div className="form-group">
                  <label className="form-label">계좌번호{isEdit && emp?.accountNoMask && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>현재: {emp.accountNoMask}</span>}</label>
                  <input className="form-input" value={form.accountNo} onChange={e => setF('accountNo', e.target.value)} placeholder={isEdit ? '변경할 계좌번호 입력 (미입력 시 유지)' : '계좌번호'} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">4대보험 가입</label>
                <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
                  {[['np', '국민연금'], ['hi', '건강보험'], ['ei', '고용보험'], ['wc', '산재']].map(([k, l]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!form.insuranceFlags[k]} onChange={e => setIns(k, e.target.checked)} />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">부양가족수 (본인 포함)</label>
                  <input type="number" className="form-input" min="0" value={form.dependents} onChange={e => setF('dependents', parseInt(e.target.value) || 0)} />
                </div>
                <div className="form-group">
                  <label className="form-label">20세 이하 자녀수</label>
                  <input type="number" className="form-input" min="0" value={form.children} onChange={e => setF('children', parseInt(e.target.value) || 0)} />
                </div>
              </div>

              {/* 수당 설정 */}
              <div className="form-group" style={{ marginTop: 8, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }}>수당 설정 (기본값)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    ['식대', '월 20만원 이하 비과세'],
                    ['직책수당', '직위·직책 수당'],
                    ['상여금', '정기 상여 (0이면 미지급)'],
                    ['기타수당', '기타 지급 수당'],
                  ].map(([key, hint]) => (
                    <div key={key} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: 12 }}>
                        {key}
                        {key === '식대' && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>⚡비과세 20만↓</span>}
                      </label>
                      <input
                        type="number" min="0" step="10000"
                        className="form-input"
                        placeholder={hint}
                        value={form.allowances?.[key] || 0}
                        onChange={e => setForm(f => ({
                          ...f,
                          allowances: { ...f.allowances, [key]: parseFloat(e.target.value) || 0 },
                        }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                  · 급여 계산 시 기본값으로 적용 · 매월 급여 화면에서 항목별 수정 가능
                </div>
              </div>

              {/* 중소기업 취업자 소득세 감면 */}
              <div className="form-group" style={{ marginTop: 8, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  <input type="checkbox" checked={!!form.smeReduction?.enabled} onChange={e => setSme('enabled', e.target.checked)} />
                  중소기업 취업자 소득세 감면 적용 (조세특례제한법 제30조)
                </label>
                {form.smeReduction?.enabled && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="form-row" style={{ margin: 0 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">감면 유형</label>
                        <select className="form-select" value={form.smeReduction?.category || 'youth'} onChange={e => setSme('category', e.target.value)}>
                          <option value="youth">청년 (만 15~34세) — 90% 감면</option>
                          <option value="disabled">장애인 — 70% 감면</option>
                          <option value="over60">60세 이상 — 70% 감면</option>
                          <option value="career_break">경력단절여성 — 70% 감면</option>
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">감면 시작일 (중소기업 취업일)</label>
                        <input type="date" className="form-input" value={form.smeReduction?.startDate || ''} onChange={e => setSme('startDate', e.target.value)} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                      · 취업일로부터 5년간 적용 · 청년: 연 200만원 한도 · 기타: 연 150만원 한도
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'extra' && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
              추가 정보는 저장 후 상세 페이지에서 입력 예정입니다.
            </div>
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
  const [deptFilter, setDeptFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalEmp, setModalEmp] = useState(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEmployees(await employeesDb.list()); }
    catch { showToast('직원 목록 로드 실패', 'error'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const depts = useMemo(() => [...new Set(employees.map(e => e.dept).filter(Boolean))].sort(), [employees]);

  const filtered = useMemo(() => employees.filter(e => {
    if (statusFilter === 'active' && e.status === 'resigned') return false;
    if (statusFilter === 'resigned' && e.status !== 'resigned') return false;
    if (deptFilter && e.dept !== deptFilter) return false;
    if (typeFilter && e.employmentType !== typeFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      if (![e.name, e.empNo, e.dept, e.position, e.phone].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [employees, statusFilter, deptFilter, typeFilter, searchQ]);

  const stats = useMemo(() => {
    const active = employees.filter(e => e.status !== 'resigned');
    const resigned = employees.filter(e => e.status === 'resigned');
    const totalSalary = active.reduce((s, e) => s + (e.baseSalary || 0), 0);
    const deptCount = new Set(active.map(e => e.dept).filter(Boolean)).size;
    return { active: active.length, resigned: resigned.length, totalSalary, deptCount };
  }, [employees]);

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
      if (plain) {
        addAuditLog('employee.viewRRN', 'employee:' + id, { employeeId: id });
        alert('주민등록번호: ' + plain + '\n\n※ 감사 로그에 조회 기록이 남습니다.');
      } else showToast('조회 실패', 'error');
    } catch (e) { showToast('조회 실패: ' + e.message, 'error'); }
  }

  async function exportExcel() {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('직원목록');
      ws.columns = [
        { header: '사번', key: 'empNo', width: 12 },
        { header: '이름', key: 'name', width: 10 },
        { header: '부서', key: 'dept', width: 14 },
        { header: '직급', key: 'position', width: 12 },
        { header: '고용형태', key: 'employmentType', width: 12 },
        { header: '입사일', key: 'hireDate', width: 14 },
        { header: '근속', key: 'tenure', width: 14 },
        { header: '기본급', key: 'baseSalary', width: 14 },
        { header: '연락처', key: 'phone', width: 16 },
        { header: '이메일', key: 'email', width: 24 },
        { header: '은행', key: 'bank', width: 10 },
        { header: '상태', key: 'status', width: 8 },
      ];
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F0FF' } };
      filtered.forEach(e => {
        ws.addRow({
          empNo: e.empNo, name: e.name, dept: e.dept || '', position: e.position || '',
          employmentType: e.employmentType || '정규직', hireDate: e.hireDate || '',
          tenure: tenure(e.hireDate), baseSalary: e.baseSalary || 0,
          phone: e.phone || '', email: e.email || '', bank: e.bank || '',
          status: e.status === 'resigned' ? '퇴사' : '재직',
        });
      });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `직원목록_${new Date().toLocaleDateString('ko-KR').replace(/\. /g, '-').replace('.', '')}.xlsx`; a.click();
      URL.revokeObjectURL(url);
      showToast('엑셀 내보내기 완료', 'success');
    } catch (e) { showToast('내보내기 실패: ' + e.message, 'error'); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">직원 관리</h1>
          <div className="page-desc">직원 등록·수정·조회. 주민번호는 암호화 저장되며 admin만 평문 열람 가능합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={exportExcel}>엑셀 내보내기</button>
          <button className="btn btn-primary" onClick={() => setModalEmp(null)}>+ 직원 추가</button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">재직 인원</div>
          <div className="stat-value">{stats.active}명</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">퇴사 인원</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{stats.resigned}명</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">부서 수</div>
          <div className="stat-value">{stats.deptCount}개</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">월 총 인건비</div>
          <div className="stat-value" style={{ fontSize: 18 }}>₩{stats.totalSalary.toLocaleString('ko-KR')}</div>
        </div>
      </div>

      {/* 필터 */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="이름·사번·부서·연락처 검색"
            style={{ flex: 1, minWidth: 180 }}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <select className="form-select" style={{ minWidth: 110 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="active">재직중</option>
            <option value="resigned">퇴사</option>
            <option value="all">전체</option>
          </select>
          <select className="form-select" style={{ minWidth: 120 }} value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
            <option value="">전체 부서</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="form-select" style={{ minWidth: 110 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">전체 유형</option>
            {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(deptFilter || typeFilter || searchQ) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setDeptFilter(''); setTypeFilter(''); setSearchQ(''); }}>초기화</button>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><div className="msg">조건에 맞는 직원이 없습니다</div></div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>사번</th>
                  <th>이름</th>
                  <th>부서/직급</th>
                  <th>고용형태</th>
                  <th>입사일</th>
                  <th>근속</th>
                  <th className="text-right">기본급</th>
                  <th>주민번호</th>
                  <th style={{ width: 80 }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <tr key={e.id} style={e.status === 'resigned' ? { opacity: 0.6 } : {}}>
                    <td><strong>{e.empNo || ''}</strong></td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{e.name || ''}</div>
                      {e.email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.email}</div>}
                    </td>
                    <td>
                      <div>{e.dept || '-'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.position || ''}</div>
                    </td>
                    <td><span className="badge badge-info">{e.employmentType || '정규직'}</span></td>
                    <td style={{ fontSize: 13 }}>{e.hireDate || '-'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tenure(e.hireDate)}</td>
                    <td className="text-right">{fmtWon(e.baseSalary)}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {e.rrnMask || '-'}
                      {e.rrnMask && (
                        <button className="btn-icon" title="평문 조회(admin)" onClick={() => handleViewRRN(e.id)} style={{ marginLeft: 4 }}>
                          🔍
                        </button>
                      )}
                    </td>
                    <td>
                      <button className="btn-icon" title="수정" onClick={() => setModalEmp(e)}>✏️</button>
                      <button className="btn-icon btn-icon-danger" title="삭제" onClick={() => handleDelete(e.id)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ fontWeight: 600 }}>합계 {filtered.length}명</td>
                  <td className="text-right" style={{ fontWeight: 700 }}>
                    {fmtWon(filtered.reduce((s, e) => s + (e.baseSalary || 0), 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {modalEmp !== undefined && (
        <EmpModal
          emp={modalEmp}
          onClose={() => setModalEmp(undefined)}
          onSaved={() => { setModalEmp(undefined); load(); }}
        />
      )}
    </div>
  );
}
