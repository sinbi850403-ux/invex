import { getState, setState } from './store.js';
import { showToast } from './toast.js';

const DEFAULT_ROLES = [
  {
    id: 'admin',
    name: '관리자',
    icon: '👑',
    color: '#f59e0b',
    description: '모든 메뉴와 기능에 접근할 수 있는 최고 권한입니다.',
    permissions: ['*'],
    isSystem: true,
  },
  {
    id: 'manager',
    name: '매니저',
    icon: '📋',
    color: '#3b82f6',
    description: '운영 관리와 인사 검토까지 맡는 역할입니다.',
    permissions: [
      'dashboard',
      'upload',
      'mapping',
      'inventory',
      'inout',
      'bulk',
      'scanner',
      'labels',
      'warehouses',
      'transfer',
      'stocktake',
      'vendors',
      'summary',
      'costing',
      'accounts',
      'ledger',
      'documents',
      'auditlog',
      'hr-dashboard',
      'employees',
      'attendance',
      'payroll',
      'leaves',
      'severance',
      'yearend-settlement',
    ],
    isSystem: true,
  },
  {
    id: 'editor',
    name: '편집자',
    icon: '✍️',
    color: '#10b981',
    description: '재고, 입출고, 문서와 기본 인사 입력을 처리하는 역할입니다.',
    permissions: [
      'dashboard',
      'inventory',
      'inout',
      'scanner',
      'documents',
      'transfer',
      'labels',
      'ledger',
      'employees',
      'attendance',
      'leaves',
    ],
    isSystem: true,
  },
  {
    id: 'viewer',
    name: '뷰어',
    icon: '👀',
    color: '#8b5cf6',
    description: '주요 현황을 조회만 할 수 있는 읽기 전용 역할입니다.',
    permissions: ['dashboard', 'inventory', 'summary', 'ledger', 'costing', 'hr-dashboard'],
    isSystem: true,
  },
];

const ALL_PERMISSIONS = [
  { id: 'dashboard', name: '대시보드', icon: '🏠', group: '기본' },
  { id: 'upload', name: '파일 업로드', icon: '📤', group: '데이터' },
  { id: 'mapping', name: '데이터 매핑', icon: '🧩', group: '데이터' },

  { id: 'inventory', name: '재고 현황', icon: '📦', group: '운영' },
  { id: 'inout', name: '입출고 관리', icon: '🔄', group: '운영' },
  { id: 'bulk', name: '일괄 처리', icon: '🗂️', group: '운영' },
  { id: 'scanner', name: '바코드 스캔', icon: '📷', group: '운영' },
  { id: 'labels', name: '라벨 인쇄', icon: '🏷️', group: '운영' },
  { id: 'warehouses', name: '창고 관리', icon: '🏬', group: '운영' },
  { id: 'transfer', name: '창고 이동', icon: '🚚', group: '운영' },
  { id: 'stocktake', name: '재고 실사', icon: '📝', group: '운영' },
  { id: 'vendors', name: '거래처 관리', icon: '🤝', group: '운영' },

  { id: 'summary', name: '요약 보고', icon: '📊', group: '보고' },
  { id: 'costing', name: '원가 분석', icon: '💹', group: '보고' },
  { id: 'accounts', name: '매출/매입', icon: '💳', group: '보고' },
  { id: 'ledger', name: '수불부', icon: '📒', group: '보고' },
  { id: 'documents', name: '문서 생성', icon: '📄', group: '보고' },
  { id: 'auditlog', name: '감사 추적', icon: '🔍', group: '보고' },

  { id: 'hr-dashboard', name: 'HR 대시보드', icon: '👥', group: '인사·급여' },
  { id: 'employees', name: '직원 관리', icon: '🪪', group: '인사·급여' },
  { id: 'attendance', name: '근태 관리', icon: '🕒', group: '인사·급여' },
  { id: 'payroll', name: '급여 계산', icon: '💵', group: '인사·급여' },
  { id: 'leaves', name: '휴가·연차 관리', icon: '🏖️', group: '인사·급여' },
  { id: 'severance', name: '퇴직금 계산', icon: '🧾', group: '인사·급여' },
  { id: 'yearend-settlement', name: '연말정산 보조', icon: '🧮', group: '인사·급여' },

  { id: 'settings', name: '설정', icon: '⚙️', group: '시스템' },
  { id: 'roles', name: '권한 관리', icon: '🔐', group: '시스템' },
  { id: 'api', name: 'API 연동', icon: '🔌', group: '시스템' },
];

const ROLE_ICON_OPTIONS = ['👑', '📋', '✍️', '👀', '📦', '👥', '💼', '🛠️', '🧠', '🎯'];

function buildPermissionGroups() {
  return ALL_PERMISSIONS.reduce((groups, permission) => {
    if (!groups[permission.group]) groups[permission.group] = [];
    groups[permission.group].push(permission);
    return groups;
  }, {});
}

function getRolesFromState(state) {
  return state.roles && state.roles.length > 0 ? state.roles : [...DEFAULT_ROLES];
}

function closeModal(modal) {
  if (modal) modal.style.display = 'none';
}

export function renderRolesPage(container) {
  const state = getState();
  const roles = getRolesFromState(state);
  const members = state.members || [];
  const permissionGroups = buildPermissionGroups();

  if (!state.roles || state.roles.length === 0) {
    setState({ roles });
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🔐</span> 권한 관리</h1>
        <div class="page-desc">역할별로 메뉴 접근 권한을 설정하고 팀원을 관리합니다.</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-primary" id="btn-add-role">+ 역할 추가</button>
        <button class="btn btn-accent" id="btn-add-member">팀원 초대</button>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:16px; margin-bottom:32px;">
      ${roles
        .map((role) => {
          const memberCount = members.filter((member) => member.roleId === role.id).length;
          const permissionCount = role.permissions.includes('*') ? ALL_PERMISSIONS.length : role.permissions.length;

          return `
            <div class="card" style="border-top:3px solid ${role.color}; position:relative;">
              ${
                role.isSystem
                  ? '<div style="position:absolute; top:8px; right:10px; font-size:11px; color:var(--text-muted);">시스템 역할</div>'
                  : `<button class="btn btn-ghost btn-sm btn-delete-role" data-role-id="${role.id}" style="position:absolute; top:4px; right:4px;">삭제</button>`
              }

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
                  <div style="font-size:18px; font-weight:700;">${permissionCount}</div>
                  <div style="font-size:10px; color:var(--text-muted);">권한</div>
                </div>
              </div>

              <button class="btn btn-ghost btn-sm btn-edit-perm" data-role-id="${role.id}" style="width:100%;">
                🔧 권한 설정
              </button>
            </div>
          `;
        })
        .join('')}
    </div>

    <div class="card">
      <div class="card-title">👥 팀원 목록 <span class="card-subtitle">(${members.length}명)</span></div>
      ${
        members.length > 0
          ? `
            <div class="table-wrapper" style="border:none;">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th>이메일</th>
                    <th>역할</th>
                    <th>상태</th>
                    <th>가입일</th>
                    <th style="width:70px;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${members
                    .map((member) => {
                      const role = roles.find((item) => item.id === member.roleId);
                      return `
                        <tr>
                          <td><strong>${member.name}</strong></td>
                          <td style="color:var(--text-muted);">${member.email}</td>
                          <td>
                            <span class="badge" style="background:${role?.color || '#666'}20; color:${role?.color || '#666'};">
                              ${role?.icon || ''} ${role?.name || '미지정'}
                            </span>
                          </td>
                          <td>
                            <span class="badge ${member.status === 'active' ? 'badge-success' : 'badge-default'}">
                              ${member.status === 'active' ? '활성' : '초대 중'}
                            </span>
                          </td>
                          <td style="font-size:12px; color:var(--text-muted);">${member.joinedAt || '-'}</td>
                          <td>
                            <button class="btn btn-ghost btn-sm btn-remove-member" data-member-id="${member.id}">제거</button>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')}
                </tbody>
              </table>
            </div>
          `
          : `
            <div style="text-align:center; padding:40px; color:var(--text-muted);">
              <div style="font-size:32px; margin-bottom:8px;">👥</div>
              <div>아직 등록된 팀원이 없습니다.</div>
              <div style="font-size:12px; margin-top:4px;">팀원을 초대해 역할을 배정해보세요.</div>
            </div>
          `
      }
    </div>

    <div id="perm-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:640px;">
        <div class="modal-header">
          <h3 id="perm-modal-title">권한 설정</h3>
          <button class="btn btn-ghost btn-sm" id="perm-modal-close">✕</button>
        </div>
        <div class="modal-body" id="perm-modal-body" style="max-height:450px; overflow-y:auto;"></div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="perm-cancel">취소</button>
          <button class="btn btn-primary" id="perm-save">저장</button>
        </div>
      </div>
    </div>

    <div id="role-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <h3>역할 추가</h3>
          <button class="btn btn-ghost btn-sm" id="role-modal-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">역할 이름 <span class="required">*</span></label>
            <input class="form-input" id="role-name" placeholder="예: 인사 담당자" />
          </div>
          <div class="form-group">
            <label class="form-label">설명</label>
            <input class="form-input" id="role-desc" placeholder="역할에 대한 간단한 설명" />
          </div>
          <div class="form-group">
            <label class="form-label">아이콘</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              ${ROLE_ICON_OPTIONS.map(
                (icon, index) => `
                  <label style="cursor:pointer;">
                    <input type="radio" name="role-icon" value="${icon}" style="display:none;" ${index === 0 ? 'checked' : ''} />
                    <span class="icon-option" style="font-size:24px; padding:4px 8px; border-radius:6px; border:2px solid ${
                      index === 0 ? 'var(--accent)' : 'transparent'
                    };">${icon}</span>
                  </label>
                `,
              ).join('')}
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
          <button class="btn btn-ghost" id="role-cancel">취소</button>
          <button class="btn btn-primary" id="role-save">추가</button>
        </div>
      </div>
    </div>

    <div id="member-modal" class="modal-overlay" style="display:none;">
      <div class="modal" style="max-width:460px;">
        <div class="modal-header">
          <h3>팀원 초대</h3>
          <button class="btn btn-ghost btn-sm" id="member-modal-close">✕</button>
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
              ${roles.map((role) => `<option value="${role.id}">${role.icon} ${role.name}</option>`).join('')}
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

  const permModal = container.querySelector('#perm-modal');
  const roleModal = container.querySelector('#role-modal');
  const memberModal = container.querySelector('#member-modal');
  let editingRoleId = null;

  function rerender() {
    renderRolesPage(container);
  }

  function closeAll() {
    closeModal(permModal);
    closeModal(roleModal);
    closeModal(memberModal);
  }

  container.querySelectorAll('.btn-edit-perm').forEach((button) => {
    button.addEventListener('click', () => {
      editingRoleId = button.dataset.roleId;
      const role = roles.find((item) => item.id === editingRoleId);
      if (!role) return;

      const body = container.querySelector('#perm-modal-body');
      const title = container.querySelector('#perm-modal-title');
      title.textContent = `${role.icon} ${role.name} — 권한 설정`;

      const isAll = role.permissions.includes('*');
      body.innerHTML = `
        <div style="margin-bottom:16px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:var(--bg-secondary); border-radius:8px;">
            <input type="checkbox" id="perm-all" ${isAll ? 'checked' : ''} />
            <span style="font-weight:700;">전체 권한</span>
          </label>
        </div>
        <div id="perm-list" style="${isAll ? 'opacity:0.45; pointer-events:none;' : ''}">
          ${Object.entries(permissionGroups)
            .map(
              ([group, permissions]) => `
                <div style="margin-bottom:14px;">
                  <div style="font-size:12px; font-weight:700; color:var(--text-muted); margin-bottom:8px;">${group}</div>
                  ${permissions
                    .map(
                      (permission) => `
                        <label style="display:flex; align-items:center; gap:8px; padding:4px 0; cursor:pointer;">
                          <input type="checkbox" class="perm-check" value="${permission.id}" ${
                            isAll || role.permissions.includes(permission.id) ? 'checked' : ''
                          } />
                          <span>${permission.icon} ${permission.name}</span>
                        </label>
                      `,
                    )
                    .join('')}
                </div>
              `,
            )
            .join('')}
        </div>
      `;

      const allCheckbox = body.querySelector('#perm-all');
      const permissionList = body.querySelector('#perm-list');
      allCheckbox?.addEventListener('change', (event) => {
        const checked = event.target.checked;
        permissionList.style.opacity = checked ? '0.45' : '1';
        permissionList.style.pointerEvents = checked ? 'none' : 'auto';
        if (checked) {
          body.querySelectorAll('.perm-check').forEach((checkbox) => {
            checkbox.checked = true;
          });
        }
      });

      permModal.style.display = 'flex';
    });
  });

  container.querySelector('#perm-save')?.addEventListener('click', () => {
    if (!editingRoleId) return;
    const isAll = container.querySelector('#perm-all')?.checked;
    const selected = [...container.querySelectorAll('.perm-check:checked')].map((checkbox) => checkbox.value);

    setState({
      roles: roles.map((role) =>
        role.id === editingRoleId
          ? {
              ...role,
              permissions: isAll ? ['*'] : selected,
            }
          : role,
      ),
    });

    showToast('권한을 저장했습니다.', 'success');
    closeAll();
    rerender();
  });

  container.querySelector('#btn-add-role')?.addEventListener('click', () => {
    roleModal.style.display = 'flex';
  });

  container.querySelector('#role-save')?.addEventListener('click', () => {
    const name = container.querySelector('#role-name').value.trim();
    const description = container.querySelector('#role-desc').value.trim();
    const icon = container.querySelector('input[name="role-icon"]:checked')?.value || '👤';

    if (!name) {
      showToast('역할 이름을 입력해주세요.', 'warning');
      return;
    }

    const newRole = {
      id: `role-${Date.now().toString(36)}`,
      name,
      icon,
      color: '#10b981',
      description: description || `${name} 역할`,
      permissions: ['dashboard', 'inventory'],
      isSystem: false,
    };

    setState({ roles: [...roles, newRole] });
    showToast(`"${name}" 역할을 추가했습니다.`, 'success');
    closeAll();
    rerender();
  });

  container.querySelectorAll('.btn-delete-role').forEach((button) => {
    button.addEventListener('click', () => {
      const roleId = button.dataset.roleId;
      if (!roleId) return;
      if (!confirm('이 역할을 삭제하시겠습니까? 해당 팀원은 뷰어 역할로 변경됩니다.')) return;

      setState({
        roles: roles.filter((role) => role.id !== roleId),
        members: members.map((member) => (member.roleId === roleId ? { ...member, roleId: 'viewer' } : member)),
      });

      showToast('역할을 삭제했습니다.', 'info');
      rerender();
    });
  });

  container.querySelector('#btn-add-member')?.addEventListener('click', () => {
    memberModal.style.display = 'flex';
  });

  container.querySelector('#member-save')?.addEventListener('click', () => {
    const name = container.querySelector('#member-name').value.trim();
    const email = container.querySelector('#member-email').value.trim();
    const roleId = container.querySelector('#member-role').value;

    if (!name || !email) {
      showToast('이름과 이메일을 입력해주세요.', 'warning');
      return;
    }

    if (members.some((member) => member.email === email)) {
      showToast('이미 등록된 이메일입니다.', 'warning');
      return;
    }

    const newMember = {
      id: `member-${Date.now().toString(36)}`,
      name,
      email,
      roleId,
      status: 'invited',
      joinedAt: new Date().toISOString().slice(0, 10),
    };

    setState({ members: [...members, newMember] });
    showToast(`${name}님을 초대했습니다.`, 'success');
    closeAll();
    rerender();
  });

  container.querySelectorAll('.btn-remove-member').forEach((button) => {
    button.addEventListener('click', () => {
      const memberId = button.dataset.memberId;
      if (!memberId) return;
      if (!confirm('이 팀원을 제거하시겠습니까?')) return;

      setState({ members: members.filter((member) => member.id !== memberId) });
      showToast('팀원을 제거했습니다.', 'info');
      rerender();
    });
  });

  ['perm-modal-close', 'perm-cancel', 'role-modal-close', 'role-cancel', 'member-modal-close', 'member-cancel'].forEach(
    (id) => {
      container.querySelector(`#${id}`)?.addEventListener('click', closeAll);
    },
  );

  [permModal, roleModal, memberModal].forEach((modal) => {
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeAll();
    });
  });

  container.querySelectorAll('.icon-option').forEach((option) => {
    option.parentElement?.addEventListener('click', () => {
      container.querySelectorAll('.icon-option').forEach((item) => {
        item.style.borderColor = 'transparent';
      });
      option.style.borderColor = 'var(--accent)';
    });
  });
}
