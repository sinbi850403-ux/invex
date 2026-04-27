/**
 * page-roles.js - 권한 관리 (RBAC) 페이지 (Enterprise)
 * 역할: 사용자 역할 정의, 메뉴/기능별 접근 권한 설정
 * 왜 필요? → 다수 사용자가 같은 시스템을 사용할 때, 
 *            데이터 무결성과 보안을 위해 권한 분리가 필수
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';

// 기본 역할 정의
const DEFAULT_ROLES = [
  {
    id: 'admin',
    name: '관리자',
    icon: '',
    color: '#f59e0b',
    description: '모든 기능에 접근 가능. 사용자/역할 관리 권한 보유.',
    permissions: ['*'], // 전체 권한
    isSystem: true, // 삭제 불가
  },
  {
    id: 'manager',
    name: '매니저',
    icon: '',
    color: '#3b82f6',
    description: '데이터 조회/편집 가능. 설정 및 사용자 관리 불가.',
    permissions: [
      'dashboard', 'inventory', 'in', 'scanner', 'documents',
      'transfer', 'vendors', 'summary', 'ledger', 'costing',
      'accounts', 'warehouses', 'stocktake', 'bulk', 'labels',
    ],
    isSystem: true,
  },
  {
    id: 'editor',
    name: '편집자',
    icon: '',
    color: '#10b981',
    description: '재고 입출고, 문서 생성 등 일상 업무 수행.',
    permissions: [
      'dashboard', 'inventory', 'in', 'scanner', 'documents',
      'transfer', 'labels', 'ledger',
    ],
    isSystem: true,
  },
  {
    id: 'viewer',
    name: '뷰어',
    icon: '',
    color: '#8b5cf6',
    description: '데이터 조회만 가능. 편집/삭제 불가.',
    permissions: [
      'dashboard', 'inventory', 'summary', 'ledger', 'costing',
    ],
    isSystem: true,
  },
];

// 메뉴/기능 목록 (권한 체크용)
const ALL_PERMISSIONS = [
  { id: 'dashboard', name: '대시보드', icon: '', group: '기본' },
  { id: 'upload', name: '파일 업로드', icon: '', group: '데이터' },
  { id: 'mapping', name: '데이터 확인', icon: '', group: '데이터' },
  { id: 'inventory', name: '재고 현황', icon: '', group: '관리' },
  { id: 'in', name: '입출고 관리', icon: '', group: '관리' },
  { id: 'bulk', name: '일괄 처리', icon: '', group: '관리' },
  { id: 'scanner', name: '바코드 스캔', icon: '', group: '관리' },
  { id: 'labels', name: '라벨 인쇄', icon: '', group: '관리' },
  { id: 'warehouses', name: '다중 창고', icon: '', group: '관리' },
  { id: 'transfer', name: '창고 이동', icon: '', group: '관리' },
  { id: 'stocktake', name: '수불관리', icon: '', group: '관리' },
  { id: 'vendors', name: '거래처 관리', icon: '', group: '관리' },
  { id: 'summary', name: '요약 보고', icon: '', group: '보고' },
  { id: 'costing', name: '원가 분석', icon: '', group: '보고' },
  { id: 'accounts', name: '매출/매입', icon: '', group: '보고' },
  { id: 'ledger', name: '수불부', icon: '', group: '보고' },
  { id: 'documents', name: '문서 생성', icon: '', group: '보고' },
  { id: 'auditlog', name: '감사 추적', icon: '', group: '보고' },
  { id: 'settings', name: '설정', icon: '', group: '시스템' },
  { id: 'roles', name: '권한 관리', icon: '', group: '시스템' },
  { id: 'api', name: 'API 연동', icon: '', group: '시스템' },
];

function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR'); }

export function renderRolesPage(container, navigateTo) {
  const state = getState();
  // 역할 데이터 초기화 (최초 접속 시)
  const roles = state.roles && state.roles.length > 0 ? state.roles : [...DEFAULT_ROLES];
  const members = state.members || [];

  // 역할이 아직 저장 안 됐으면 저장
  if (!state.roles || state.roles.length === 0) {
    setState({ roles });
  }

  // 권한 그룹별 분류
  const permGroups = {};
  ALL_PERMISSIONS.forEach(p => {
    if (!permGroups[p.group]) permGroups[p.group] = [];
    permGroups[p.group].push(p);
  });

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">권한 관리</h1>
        <div class="page-desc">Enterprise — 역할별 접근 권한을 설정하고 팀원을 관리합니다.</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" id="btn-add-role"> 역할 추가</button>
        <button class="btn btn-accent" id="btn-add-member"> 팀원 초대</button>
      </div>
    </div>

    <!-- 역할 카드 그리드 -->
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px; margin-bottom:32px;">
      ${roles.map(role => {
        const memberCount = members.filter(m => m.roleId === role.id).length;
        const permCount = role.permissions.includes('*') ? ALL_PERMISSIONS.length : role.permissions.length;
        return `
          <div class="card" style="border-top:3px solid ${role.color}; position:relative;">
            ${role.isSystem ? '<div style="position:absolute; top:8px; right:8px; font-size:10px; color:var(--text-muted);">시스템</div>' : `<button class="btn btn-ghost btn-sm btn-delete-role" data-role-id="${role.id}" style="position:absolute; top:4px; right:4px;"></button>`}
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
              <div style="font-size:28px;">${role.icon}</div>
              <div>
                <div style="font-size:16px; font-weight:700;">${role.name}</div>
                <div style="font-size:11px; color:var(--text-muted);">${role.description}</div>
              </div>
            </div>
            <div style="display:flex; gap:12px; margin-bottom:12px;">
              <div style="background:var(--bg-secondary); border-radius:6px; padding:6px 10px; flex:1; text-align:center;">
                <div style="font-size:18px; font-weight:700;">${memberCount}</div>
                <div style="font-size:10px; color:var(--text-muted);">팀원</div>
              </div>
              <div style="background:var(--bg-secondary); border-radius:6px; padding:6px 10px; flex:1; text-align:center;">
                <div style="font-size:18px; font-weight:700;">${permCount}</div>
                <div style="font-size:10px; color:var(--text-muted);">권한</div>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm btn-edit-perm" data-role-id="${role.id}" style="width:100%;">
               권한 설정
            </button>
          </div>
        `;
      }).join('')}
    </div>

    <!-- 팀원 목록 -->
    <div class="card">
      <div class="card-title"> 팀원 목록 <span class="card-subtitle">(${members.length}명)</span></div>
      ${members.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead><tr>
              <th>이름</th>
              <th>이메일</th>
              <th>역할</th>
              <th>상태</th>
              <th>가입일</th>
              <th style="width:60px;"></th>
            </tr></thead>
            <tbody>
              ${members.map(m => {
                const role = roles.find(r => r.id === m.roleId) || {};
                return `
                  <tr>
                    <td><strong>${m.name}</strong></td>
                    <td style="color:var(--text-muted);">${m.email}</td>
                    <td><span class="badge" style="background:${role.color || '#666'}20; color:${role.color || '#666'};">${role.icon || ''} ${role.name || '미지정'}</span></td>
                    <td><span class="badge ${m.status === 'active' ? 'badge-success' : 'badge-default'}">${m.status === 'active' ? '활성' : '초대됨'}</span></td>
                    <td style="font-size:12px; color:var(--text-muted);">${m.joinedAt || '-'}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm btn-remove-member" data-member-id="${m.id}"></button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center; padding:40px; color:var(--text-muted);">
          <div style="font-size:32px; margin-bottom:8px;"></div>
          <div>아직 등록된 팀원이 없습니다.</div>
          <div style="font-size:12px; margin-top:4px;">팀원을 초대하여 역할을 배정하세요.</div>
        </div>
      `}
    </div>

    <!-- 권한 설정 모달 -->
    <div id="perm-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:600px;">
        <div class="modal-header">
          <h3 id="perm-modal-title">권한 설정</h3>
          <button class="btn btn-ghost btn-sm" id="perm-modal-close"></button>
        </div>
        <div class="modal-body" id="perm-modal-body" style="max-height:450px; overflow-y:auto;"></div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="perm-cancel">취소</button>
          <button class="btn btn-primary" id="perm-save">저장</button>
        </div>
      </div>
    </div>

    <!-- 역할 추가 모달 -->
    <div id="role-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:450px;">
        <div class="modal-header">
          <h3>역할 추가</h3>
          <button class="btn btn-ghost btn-sm" id="role-modal-close"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">역할 이름 <span class="required">*</span></label>
            <input class="form-input" id="role-name" placeholder="예: 물류 담당자" />
          </div>
          <div class="form-group">
            <label class="form-label">설명</label>
            <input class="form-input" id="role-desc" placeholder="역할에 대한 간단한 설명" />
          </div>
          <div class="form-group">
            <label class="form-label">아이콘</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${['','','','','','','','','',''].map(icon => `
                <label style="cursor:pointer;">
                  <input type="radio" name="role-icon" value="${icon}" style="display:none;" />
                  <span class="icon-option" style="font-size:24px; padding:4px 8px; border-radius:6px; border:2px solid transparent;">${icon}</span>
                </label>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="role-cancel">취소</button>
          <button class="btn btn-primary" id="role-save">추가</button>
        </div>
      </div>
    </div>

    <!-- 팀원 초대 모달 -->
    <div id="member-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:450px;">
        <div class="modal-header">
          <h3> 팀원 초대</h3>
          <button class="btn btn-ghost btn-sm" id="member-modal-close"></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">이름 <span class="required">*</span></label>
            <input class="form-input" id="member-name" placeholder="팀원 이름" />
          </div>
          <div class="form-group">
            <label class="form-label">이메일 <span class="required">*</span></label>
            <input class="form-input" type="email" id="member-email" placeholder="email@example.com" />
          </div>
          <div class="form-group">
            <label class="form-label">역할</label>
            <select class="form-select" id="member-role">
              ${roles.map(r => `<option value="${r.id}">${r.icon} ${r.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="member-cancel">취소</button>
          <button class="btn btn-primary" id="member-save">초대</button>
        </div>
      </div>
    </div>
  `;

  // === 이벤트 바인딩 ===

  const permModal = container.querySelector('#perm-modal');
  const roleModal = container.querySelector('#role-modal');
  const memberModal = container.querySelector('#member-modal');
  let editingRoleId = null;

  // 모달 유틸
  function closeAll() {
    permModal.style.display = 'none';
    roleModal.style.display = 'none';
    memberModal.style.display = 'none';
  }

  // 권한 설정 모달 열기
  container.querySelectorAll('.btn-edit-perm').forEach(btn => {
    btn.addEventListener('click', () => {
      editingRoleId = btn.dataset.roleId;
      const role = roles.find(r => r.id === editingRoleId);
      if (!role) return;

      container.querySelector('#perm-modal-title').textContent = `${role.icon} ${role.name} — 권한 설정`;
      const body = container.querySelector('#perm-modal-body');

      const isAll = role.permissions.includes('*');
      body.innerHTML = `
        <div style="margin-bottom:16px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:var(--bg-secondary); border-radius:8px;">
            <input type="checkbox" id="perm-all" ${isAll ? 'checked' : ''} />
            <span style="font-weight:700;">전체 권한 (관리자)</span>
          </label>
        </div>
        <div id="perm-list" style="${isAll ? 'opacity:0.4; pointer-events:none;' : ''}">
          ${Object.entries(permGroups).map(([group, perms]) => `
            <div style="margin-bottom:12px;">
              <div style="font-size:12px; font-weight:600; color:var(--text-muted); margin-bottom:6px;">${group}</div>
              ${perms.map(p => `
                <label style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
                  <input type="checkbox" class="perm-check" value="${p.id}" ${isAll || role.permissions.includes(p.id) ? 'checked' : ''} />
                  <span>${p.icon} ${p.name}</span>
                </label>
              `).join('')}
            </div>
          `).join('')}
        </div>
      `;

      // 전체 권한 토글
      body.querySelector('#perm-all').addEventListener('change', (e) => {
        const list = body.querySelector('#perm-list');
        list.style.opacity = e.target.checked ? '0.4' : '1';
        list.style.pointerEvents = e.target.checked ? 'none' : 'auto';
        if (e.target.checked) {
          body.querySelectorAll('.perm-check').forEach(cb => cb.checked = true);
        }
      });

      permModal.style.display = 'flex';
    });
  });

  // 권한 저장
  container.querySelector('#perm-save').addEventListener('click', () => {
    if (!editingRoleId) return;
    const isAll = container.querySelector('#perm-all').checked;
    const selected = [];
    container.querySelectorAll('.perm-check:checked').forEach(cb => selected.push(cb.value));

    const updatedRoles = roles.map(r => {
      if (r.id === editingRoleId) {
        return { ...r, permissions: isAll ? ['*'] : selected };
      }
      return r;
    });

    setState({ roles: updatedRoles });
    showToast('권한이 저장되었습니다.', 'success');
    closeAll();
    renderRolesPage(container, navigateTo);
  });

  // 역할 추가
  container.querySelector('#btn-add-role').addEventListener('click', () => {
    roleModal.style.display = 'flex';
  });

  container.querySelector('#role-save').addEventListener('click', () => {
    const name = container.querySelector('#role-name').value.trim();
    if (!name) { showToast('역할 이름을 입력해 주세요.', 'warning'); return; }

    const iconInput = container.querySelector('input[name="role-icon"]:checked');
    const icon = iconInput ? iconInput.value : '';
    const desc = container.querySelector('#role-desc').value.trim();

    const newRole = {
      id: 'role-' + Date.now().toString(36),
      name,
      icon,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
      description: desc || `${name} 역할`,
      permissions: ['dashboard', 'inventory'],
      isSystem: false,
    };

    setState({ roles: [...roles, newRole] });
    showToast(`"${name}" 역할을 추가했습니다.`, 'success');
    closeAll();
    renderRolesPage(container, navigateTo);
  });

  // 역할 삭제
  container.querySelectorAll('.btn-delete-role').forEach(btn => {
    btn.addEventListener('click', () => {
      const roleId = btn.dataset.roleId;
      if (!confirm('이 역할을 삭제하시겠습니까?')) return;
      const updated = roles.filter(r => r.id !== roleId);
      // 해당 역할의 멤버를 viewer로 변경
      const updatedMembers = members.map(m => m.roleId === roleId ? { ...m, roleId: 'viewer' } : m);
      setState({ roles: updated, members: updatedMembers });
      showToast('역할을 삭제했습니다.', 'info');
      renderRolesPage(container, navigateTo);
    });
  });

  // 팀원 초대
  container.querySelector('#btn-add-member').addEventListener('click', () => {
    memberModal.style.display = 'flex';
  });

  container.querySelector('#member-save').addEventListener('click', () => {
    const name = container.querySelector('#member-name').value.trim();
    const email = container.querySelector('#member-email').value.trim();
    const roleId = container.querySelector('#member-role').value;

    if (!name || !email) { showToast('이름과 이메일을 입력해 주세요.', 'warning'); return; }
    if (members.some(m => m.email === email)) { showToast('이미 등록된 이메일입니다.', 'warning'); return; }

    const newMember = {
      id: 'mem-' + Date.now().toString(36),
      name, email, roleId,
      status: 'invited',
      joinedAt: new Date().toISOString().split('T')[0],
    };

    setState({ members: [...members, newMember] });
    showToast(`${name}님을 초대했습니다.`, 'success');
    closeAll();
    renderRolesPage(container, navigateTo);
  });

  // 팀원 삭제
  container.querySelectorAll('.btn-remove-member').forEach(btn => {
    btn.addEventListener('click', () => {
      const memberId = btn.dataset.memberId;
      if (!confirm('이 팀원을 삭제하시겠습니까?')) return;
      setState({ members: members.filter(m => m.id !== memberId) });
      showToast('팀원을 삭제했습니다.', 'info');
      renderRolesPage(container, navigateTo);
    });
  });

  // 모달 닫기
  ['perm-modal-close', 'perm-cancel', 'role-modal-close', 'role-cancel', 'member-modal-close', 'member-cancel'].forEach(id => {
    container.querySelector(`#${id}`)?.addEventListener('click', closeAll);
  });
  [permModal, roleModal, memberModal].forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) closeAll(); });
  });

  // 아이콘 선택 스타일링
  container.querySelectorAll('.icon-option').forEach(opt => {
    opt.parentElement.addEventListener('click', () => {
      container.querySelectorAll('.icon-option').forEach(o => o.style.borderColor = 'transparent');
      opt.style.borderColor = 'var(--accent)';
    });
  });
}
