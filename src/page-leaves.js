/**
 * page-leaves.js — 휴가·연차 관리 (Phase A: 신청/승인 CRUD, Phase C: 자동 부여 확장)
 */
import { employees as employeesDb, leaves as leavesDb } from './db.js';
import { showToast } from './toast.js';
import { escapeHtml } from './ux-toolkit.js';
import { canAction } from './auth.js';

const LEAVE_TYPES = ['연차', '반차', '병가', '경조', '무급'];

function daysBetween(s, e) {
  if (!s || !e) return 1;
  const d1 = new Date(s), d2 = new Date(e);
  return Math.max(1, Math.round((d2 - d1) / (1000*60*60*24)) + 1);
}

export async function renderLeavesPage(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🏖️</span> 휴가·연차 관리</h1>
        <div class="page-desc">휴가 신청과 승인. (연차 자동 부여 로직은 Phase C 배포)</div>
      </div>
      <div class="page-actions"><button class="btn btn-primary" id="btn-lv-add">+ 휴가 신청</button></div>
    </div>
    <div class="card"><div id="lv-table">불러오는 중…</div></div>
  `;

  const emps = await employeesDb.list({ status: 'active' });
  const list = await leavesDb.list();

  const empMap = {};
  emps.forEach(e => empMap[e.id] = e);

  container.querySelector('#lv-table').innerHTML = list.length === 0
    ? '<div class="empty-state"><div class="icon">🏖️</div><div class="msg">신청된 휴가가 없습니다</div></div>'
    : `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr><th>직원</th><th>유형</th><th>기간</th><th class="text-right">일수</th><th>사유</th><th>상태</th><th style="width:120px;">관리</th></tr></thead>
        <tbody>
          ${list.map(l => {
            const e = empMap[l.employeeId] || {};
            return `<tr data-id="${l.id}">
              <td>${escapeHtml(e.name || '-')} (${escapeHtml(e.empNo || '-')})</td>
              <td><span class="badge badge-info">${escapeHtml(l.leaveType || '-')}</span></td>
              <td>${l.startDate || '-'} ~ ${l.endDate || '-'}</td>
              <td class="text-right">${l.days || 0}일</td>
              <td>${escapeHtml(l.reason || '-')}</td>
              <td>
                ${l.status === '신청' ? '<span class="badge badge-warning">신청</span>'
                 : l.status === '승인' ? '<span class="badge badge-success">승인</span>'
                 : '<span class="badge badge-danger">반려</span>'}
              </td>
              <td>
                ${l.status === '신청' ? `
                  <button class="btn-icon lv-approve" title="승인">✓</button>
                  <button class="btn-icon btn-icon-danger lv-reject" title="반려">✕</button>
                ` : ''}
                <button class="btn-icon btn-icon-danger lv-del" title="삭제">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  container.querySelector('#btn-lv-add').addEventListener('click', () => openLeaveModal(container, emps));
  container.querySelectorAll('.lv-approve').forEach(b => b.addEventListener('click', async () => {
    if (!canAction('leave:approve')) { showToast('권한 없음', 'error'); return; }
    const id = b.closest('tr').dataset.id;
    await leavesDb.update(id, { status: '승인', approvedAt: new Date().toISOString() });
    showToast('승인되었습니다', 'success');
    renderLeavesPage(container, navigateTo);
  }));
  container.querySelectorAll('.lv-reject').forEach(b => b.addEventListener('click', async () => {
    if (!canAction('leave:approve')) { showToast('권한 없음', 'error'); return; }
    const id = b.closest('tr').dataset.id;
    await leavesDb.update(id, { status: '반려' });
    showToast('반려되었습니다', 'success');
    renderLeavesPage(container, navigateTo);
  }));
  container.querySelectorAll('.lv-del').forEach(b => b.addEventListener('click', async () => {
    const id = b.closest('tr').dataset.id;
    if (!confirm('휴가 신청을 삭제하시겠습니까?')) return;
    await leavesDb.remove(id);
    renderLeavesPage(container, navigateTo);
  }));
}

function openLeaveModal(container, emps) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header"><h3>휴가 신청</h3><button class="btn-close">✕</button></div>
      <div class="modal-body">
        <div class="form-group">
          <label>직원 *</label>
          <select id="f-emp" class="form-select">
            <option value="">-- 선택 --</option>
            ${emps.map(e => `<option value="${e.id}">${escapeHtml(e.name)} (${escapeHtml(e.empNo)})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>유형</label>
          <select id="f-type" class="form-select">${LEAVE_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
        </div>
        <div class="form-row">
          <div class="form-group"><label>시작일 *</label><input id="f-start" type="date" class="form-input" /></div>
          <div class="form-group"><label>종료일 *</label><input id="f-end" type="date" class="form-input" /></div>
        </div>
        <div class="form-group"><label>사유</label><textarea id="f-reason" class="form-input" rows="3"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline btn-cancel">취소</button>
        <button class="btn btn-primary btn-save">신청</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.btn-close').addEventListener('click', close);
  overlay.querySelector('.btn-cancel').addEventListener('click', close);
  overlay.querySelector('.btn-save').addEventListener('click', async () => {
    const empId = overlay.querySelector('#f-emp').value;
    const start = overlay.querySelector('#f-start').value;
    const end = overlay.querySelector('#f-end').value;
    if (!empId || !start || !end) { showToast('직원·기간은 필수입니다', 'error'); return; }
    const type = overlay.querySelector('#f-type').value;
    const days = type === '반차' ? 0.5 : daysBetween(start, end);
    try {
      await leavesDb.create({
        employeeId: empId,
        leaveType: type,
        startDate: start,
        endDate: end,
        days,
        reason: overlay.querySelector('#f-reason').value,
        status: '신청',
      });
      showToast('신청되었습니다', 'success');
      close();
      renderLeavesPage(container);
    } catch (e) { showToast('신청 실패: ' + e.message, 'error'); }
  });
}
