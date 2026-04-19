/**
 * page-employees.js — 직원 마스터 관리
 * 역할: 직원 등록/조회/수정, 주민번호(RRN) 암호화 저장, admin 전용 평문 조회
 * 왜 필수? → 급여·근태 모든 모듈의 기초 데이터. 민감정보(RRN/계좌)는 보안 분리.
 */
import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';
import { employees as employeesDb } from './db.js';
import { canAction } from './auth.js';
import { addAuditLog } from './audit-log.js';

const EMP_TYPES = ['정규직', '계약직', '시급직', '일용직'];

function fmtWon(n) {
  const v = parseFloat(n) || 0;
  return v ? '₩' + v.toLocaleString('ko-KR') : '-';
}

/** RRN 마스킹: 900101-1234567 → 900101-1****** */
function maskRRN(rrn) {
  const s = String(rrn || '').replace(/[^0-9]/g, '');
  if (s.length !== 13) return '';
  return `${s.slice(0, 6)}-${s[6]}******`;
}

async function loadEmployees() {
  try {
    const list = await employeesDb.list();
    setState({ employees: list });
    return list;
  } catch (e) {
    console.error(e);
    showToast('직원 목록 로드 실패', 'error');
    return getState().employees || [];
  }
}

export async function renderEmployeesPage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">👥</span> 직원 관리</h1>
        <div class="page-desc">직원 등록·수정·조회. 주민번호는 암호화 저장되며 admin만 평문 열람 가능합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-emp-add">+ 직원 추가</button>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px;">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <input id="emp-search" class="form-input" placeholder="이름/사번/부서 검색" style="flex:1; min-width:200px;" />
        <select id="emp-filter-status" class="form-select">
          <option value="active">재직중</option>
          <option value="resigned">퇴사</option>
          <option value="all">전체</option>
        </select>
      </div>
    </div>

    <div class="card">
      <div id="emp-table-wrap">불러오는 중…</div>
    </div>
  `;

  const list = await loadEmployees();
  renderTable(container, list);

  container.querySelector('#btn-emp-add').addEventListener('click', () => openModal(container, null));
  container.querySelector('#emp-search').addEventListener('input', () => renderTable(container, getState().employees || []));
  container.querySelector('#emp-filter-status').addEventListener('change', () => renderTable(container, getState().employees || []));
}

function renderTable(container, all) {
  const keyword = (container.querySelector('#emp-search')?.value || '').toLowerCase();
  const statusFilter = container.querySelector('#emp-filter-status')?.value || 'active';
  const rows = (all || []).filter(e => {
    if (statusFilter === 'active' && e.status === 'resigned') return false;
    if (statusFilter === 'resigned' && e.status !== 'resigned') return false;
    if (!keyword) return true;
    const hay = [e.name, e.empNo, e.dept, e.position].join(' ').toLowerCase();
    return hay.includes(keyword);
  });

  const wrap = container.querySelector('#emp-table-wrap');
  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="icon">👥</div><div class="msg">등록된 직원이 없습니다</div></div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>사번</th>
            <th>이름</th>
            <th>부서/직급</th>
            <th>입사일</th>
            <th>고용형태</th>
            <th class="text-right">기본급</th>
            <th>주민번호</th>
            <th style="width:80px;">관리</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(e => `
            <tr data-id="${e.id}">
              <td><strong>${escapeHtml(e.empNo || '')}</strong></td>
              <td>${escapeHtml(e.name || '')}</td>
              <td>${escapeHtml(e.dept || '-')} / ${escapeHtml(e.position || '-')}</td>
              <td>${e.hireDate || '-'}</td>
              <td><span class="badge badge-info">${escapeHtml(e.employmentType || '정규직')}</span></td>
              <td class="text-right">${fmtWon(e.baseSalary)}</td>
              <td style="font-family:monospace; font-size:12px;">
                ${e.rrnMask || '-'}
                ${e.rrnMask ? `<button class="btn-icon emp-view-rrn" data-id="${e.id}" title="평문 조회(admin)">🔓</button>` : ''}
              </td>
              <td>
                <button class="btn-icon emp-edit" data-id="${e.id}">✏️</button>
                <button class="btn-icon btn-icon-danger emp-del" data-id="${e.id}">✕</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('.emp-edit').forEach(b => b.addEventListener('click', () => {
    const emp = (all || []).find(x => x.id === b.dataset.id);
    if (emp) openModal(container, emp);
  }));
  wrap.querySelectorAll('.emp-del').forEach(b => b.addEventListener('click', async () => {
    if (!canAction('employee:delete')) { showToast('권한 없음(admin 전용)', 'error'); return; }
    if (!confirm('이 직원을 삭제하시겠습니까? 관련 근태·급여 기록도 함께 삭제됩니다.')) return;
    try {
      await employeesDb.remove(b.dataset.id);
      showToast('삭제되었습니다', 'success');
      const list = await loadEmployees();
      renderTable(container, list);
    } catch (e) { showToast('삭제 실패: ' + e.message, 'error'); }
  }));
  wrap.querySelectorAll('.emp-view-rrn').forEach(b => b.addEventListener('click', async () => {
    if (!canAction('employee:viewRRN')) { showToast('주민번호 평문 조회는 admin 전용입니다', 'error'); return; }
    try {
      const plain = await employeesDb.getRRN(b.dataset.id);
      if (plain) {
        addAuditLog('employee.viewRRN', 'employee:' + b.dataset.id, { employeeId: b.dataset.id });
        alert('주민등록번호: ' + plain + '\n\n※ 감사 로그에 조회 기록이 남습니다.');
      } else {
        showToast('조회 실패', 'error');
      }
    } catch (e) { showToast('조회 실패: ' + e.message, 'error'); }
  }));
}

function openModal(container, emp) {
  const isEdit = !!emp;
  const canEdit = isEdit ? canAction('employee:edit') : canAction('employee:create');
  if (!canEdit) { showToast('권한이 없습니다', 'error'); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-header">
        <h3>${isEdit ? '직원 수정' : '직원 추가'}</h3>
        <button class="btn-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group"><label>사번 *</label><input id="f-empNo" class="form-input" value="${escapeHtml(emp?.empNo || '')}" /></div>
          <div class="form-group"><label>이름 *</label><input id="f-name" class="form-input" value="${escapeHtml(emp?.name || '')}" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>부서</label><input id="f-dept" class="form-input" value="${escapeHtml(emp?.dept || '')}" /></div>
          <div class="form-group"><label>직급</label><input id="f-position" class="form-input" value="${escapeHtml(emp?.position || '')}" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>입사일 *</label><input id="f-hireDate" type="date" class="form-input" value="${emp?.hireDate || ''}" /></div>
          <div class="form-group"><label>고용형태</label>
            <select id="f-employmentType" class="form-select">
              ${EMP_TYPES.map(t => `<option ${emp?.employmentType === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>기본급(월)</label><input id="f-baseSalary" type="number" class="form-input" value="${emp?.baseSalary || 0}" /></div>
          <div class="form-group"><label>시급</label><input id="f-hourlyWage" type="number" class="form-input" value="${emp?.hourlyWage || 0}" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>연락처</label><input id="f-phone" class="form-input" value="${escapeHtml(emp?.phone || '')}" /></div>
          <div class="form-group"><label>이메일</label><input id="f-email" type="email" class="form-input" value="${escapeHtml(emp?.email || '')}" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>은행</label><input id="f-bank" class="form-input" value="${escapeHtml(emp?.bank || '')}" /></div>
          <div class="form-group"><label>계좌번호</label><input id="f-accountNo" class="form-input" value="${escapeHtml(emp?.accountNo || '')}" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>부양가족수</label><input id="f-dependents" type="number" class="form-input" value="${emp?.dependents || 0}" min="0" /></div>
          <div class="form-group"><label>20세 이하 자녀수</label><input id="f-children" type="number" class="form-input" value="${emp?.children || 0}" min="0" /></div>
        </div>
        <div class="form-group">
          <label>주민등록번호 ${isEdit ? '(변경 시에만 입력)' : ''}</label>
          <input id="f-rrn" class="form-input" placeholder="숫자 13자리 (저장 시 AES 암호화)" maxlength="14" />
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">※ 저장 후엔 admin만 평문 조회 가능 · 마스킹 표시만 남음</div>
        </div>
        <div class="form-group">
          <label>4대보험 가입</label>
          <div style="display:flex; gap:16px;">
            <label><input type="checkbox" id="f-ins-np" ${emp?.insuranceFlags?.np !== false ? 'checked' : ''}/> 국민연금</label>
            <label><input type="checkbox" id="f-ins-hi" ${emp?.insuranceFlags?.hi !== false ? 'checked' : ''}/> 건강보험</label>
            <label><input type="checkbox" id="f-ins-ei" ${emp?.insuranceFlags?.ei !== false ? 'checked' : ''}/> 고용보험</label>
            <label><input type="checkbox" id="f-ins-wc" ${emp?.insuranceFlags?.wc !== false ? 'checked' : ''}/> 산재</label>
          </div>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label>재직상태</label>
          <select id="f-status" class="form-select">
            <option value="active" ${emp.status !== 'resigned' ? 'selected' : ''}>재직중</option>
            <option value="resigned" ${emp.status === 'resigned' ? 'selected' : ''}>퇴사</option>
          </select>
        </div>
        <div class="form-group"><label>퇴사일</label><input id="f-resignDate" type="date" class="form-input" value="${emp?.resignDate || ''}" /></div>
        ` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline btn-cancel">취소</button>
        <button class="btn btn-primary btn-save">저장</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.btn-close').addEventListener('click', close);
  overlay.querySelector('.btn-cancel').addEventListener('click', close);

  overlay.querySelector('.btn-save').addEventListener('click', async () => {
    const rrnInput = overlay.querySelector('#f-rrn').value.replace(/[^0-9]/g, '');
    const payload = {
      empNo: overlay.querySelector('#f-empNo').value.trim(),
      name: overlay.querySelector('#f-name').value.trim(),
      dept: overlay.querySelector('#f-dept').value.trim(),
      position: overlay.querySelector('#f-position').value.trim(),
      hireDate: overlay.querySelector('#f-hireDate').value || null,
      employmentType: overlay.querySelector('#f-employmentType').value,
      baseSalary: parseFloat(overlay.querySelector('#f-baseSalary').value) || 0,
      hourlyWage: parseFloat(overlay.querySelector('#f-hourlyWage').value) || 0,
      phone: overlay.querySelector('#f-phone').value.trim(),
      email: overlay.querySelector('#f-email').value.trim(),
      bank: overlay.querySelector('#f-bank').value.trim(),
      accountNo: overlay.querySelector('#f-accountNo').value.trim(),
      dependents: parseInt(overlay.querySelector('#f-dependents').value) || 0,
      children: parseInt(overlay.querySelector('#f-children').value) || 0,
      insuranceFlags: {
        np: overlay.querySelector('#f-ins-np').checked,
        hi: overlay.querySelector('#f-ins-hi').checked,
        ei: overlay.querySelector('#f-ins-ei').checked,
        wc: overlay.querySelector('#f-ins-wc').checked,
      },
    };
    if (rrnInput.length === 13) {
      payload._rrnPlain = rrnInput;  // db 레이어에서 RPC 호출로 암호화
      payload.rrnMask = maskRRN(rrnInput);
    }
    if (isEdit) {
      payload.id = emp.id;
      payload.status = overlay.querySelector('#f-status').value;
      payload.resignDate = overlay.querySelector('#f-resignDate').value || null;
    }

    if (!payload.empNo || !payload.name || !payload.hireDate) {
      showToast('사번·이름·입사일은 필수입니다', 'error');
      return;
    }

    try {
      if (isEdit) {
        await employeesDb.update(emp.id, payload);
        showToast('수정되었습니다', 'success');
      } else {
        await employeesDb.create(payload);
        showToast('등록되었습니다', 'success');
      }
      close();
      const list = await loadEmployees();
      renderTable(container, list);
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  });
}
