/**
 * RolesPage.jsx - 권한 관리 (RBAC) (Enterprise)
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';

const DEFAULT_ROLES = [
  {
    id: 'admin', name: '관리자', icon: '', color: '#f59e0b',
    description: '모든 기능에 접근 가능. 사용자/역할 관리 권한 보유.',
    permissions: ['*'], isSystem: true,
  },
  {
    id: 'manager', name: '매니저', icon: '', color: '#3b82f6',
    description: '데이터 조회/편집 가능. 설정 및 사용자 관리 불가.',
    permissions: ['dashboard','inventory','in','scanner','documents','transfer','vendors','summary','ledger','costing','accounts','warehouses','stocktake','bulk','labels'],
    isSystem: true,
  },
  {
    id: 'editor', name: '편집자', icon: '', color: '#10b981',
    description: '재고 입출고, 문서 생성 등 일상 업무 수행.',
    permissions: ['dashboard','inventory','in','scanner','documents','transfer','labels','ledger'],
    isSystem: true,
  },
  {
    id: 'viewer', name: '뷰어', icon: '', color: '#8b5cf6',
    description: '데이터 조회만 가능. 편집/삭제 불가.',
    permissions: ['dashboard','inventory','summary','ledger','costing'],
    isSystem: true,
  },
];

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

const PERM_GROUPS = ALL_PERMISSIONS.reduce((acc, p) => {
  if (!acc[p.group]) acc[p.group] = [];
  acc[p.group].push(p);
  return acc;
}, {});

const ICONS = ['','','','','','','','','','⭐'];

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

/* ── 권한 설정 모달 ── */
function PermModal({ role, onSave, onClose }) {
  const [permAll, setPermAll] = useState(role.permissions.includes('*'));
  const [selected, setSelected] = useState(new Set(
    role.permissions.includes('*') ? ALL_PERMISSIONS.map(p => p.id) : role.permissions
  ));

  const toggleAll = (checked) => {
    setPermAll(checked);
    if (checked) setSelected(new Set(ALL_PERMISSIONS.map(p => p.id)));
  };

  const togglePerm = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    onSave(permAll ? ['*'] : [...selected]);
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3>{role.icon} {role.name} — 권한 설정</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
              <input type="checkbox" checked={permAll} onChange={e => toggleAll(e.target.checked)} />
              <span style={{ fontWeight: 700 }}>전체 권한 (관리자)</span>
            </label>
          </div>
          <div style={{ opacity: permAll ? 0.4 : 1, pointerEvents: permAll ? 'none' : 'auto' }}>
            {Object.entries(PERM_GROUPS).map(([group, perms]) => (
              <div key={group} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{group}</div>
                {perms.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => togglePerm(p.id)} />
                    <span>{p.icon} {p.name}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  );
}

/* ── 역할 추가 모달 ── */
function RoleModal({ roles, onSave, onClose }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [icon, setIcon] = useState('');

  const handleSave = () => {
    if (!name.trim()) { showToast('역할 이름을 입력해 주세요.', 'warning'); return; }
    onSave({ name: name.trim(), desc: desc.trim(), icon });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3>역할 추가</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">역할 이름 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="예: 물류 담당자" />
          </div>
          <div className="form-group">
            <label className="form-label">설명</label>
            <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="역할에 대한 간단한 설명" />
          </div>
          <div className="form-group">
            <label className="form-label">아이콘</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ICONS.map(ic => (
                <span
                  key={ic}
                  onClick={() => setIcon(ic)}
                  style={{
                    fontSize: '24px', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer',
                    border: `2px solid ${icon === ic ? 'var(--accent)' : 'transparent'}`,
                    background: icon === ic ? 'var(--bg-secondary)' : 'transparent',
                  }}
                >{ic}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>추가</button>
        </div>
      </div>
    </div>
  );
}

/* ── 팀원 초대 모달 ── */
function MemberModal({ roles, members, onSave, onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState(roles[0]?.id || 'viewer');

  const handleSave = () => {
    if (!name.trim() || !email.trim()) { showToast('이름과 이메일을 입력해 주세요.', 'warning'); return; }
    if (members.some(m => m.email === email.trim())) { showToast('이미 등록된 이메일입니다.', 'warning'); return; }
    onSave({ name: name.trim(), email: email.trim(), roleId });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3> 팀원 초대</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">이름 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="팀원 이름" />
          </div>
          <div className="form-group">
            <label className="form-label">이메일 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">역할</label>
            <select className="form-select" value={roleId} onChange={e => setRoleId(e.target.value)}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>초대</button>
        </div>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const [state, setState] = useStore();

  const roles = useMemo(() => {
    if (state.roles && state.roles.length > 0) return state.roles;
    return DEFAULT_ROLES;
  }, [state.roles]);

  const members = state.members || [];

  // 최초 진입 시 기본 역할 저장
  React.useEffect(() => {
    if (!state.roles || state.roles.length === 0) {
      setState({ roles: DEFAULT_ROLES });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [permEditRole, setPermEditRole] = useState(null); // role object
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showMemberModal, setShowMemberModal] = useState(false);

  const handleSavePerms = (permissions) => {
    const updatedRoles = roles.map(r => r.id === permEditRole.id ? { ...r, permissions } : r);
    setState({ roles: updatedRoles });
    showToast('권한이 저장되었습니다.', 'success');
    setPermEditRole(null);
  };

  const handleAddRole = ({ name, desc, icon }) => {
    const newRole = {
      id: 'role-' + Date.now().toString(36),
      name, icon, color: randomColor(),
      description: desc || `${name} 역할`,
      permissions: ['dashboard', 'inventory'],
      isSystem: false,
    };
    setState({ roles: [...roles, newRole] });
    showToast(`"${name}" 역할을 추가했습니다.`, 'success');
    setShowRoleModal(false);
  };

  const handleDeleteRole = (roleId) => {
    if (!window.confirm('이 역할을 삭제하시겠습니까?')) return;
    const updated = roles.filter(r => r.id !== roleId);
    const updatedMembers = members.map(m => m.roleId === roleId ? { ...m, roleId: 'viewer' } : m);
    setState({ roles: updated, members: updatedMembers });
    showToast('역할을 삭제했습니다.', 'info');
  };

  const handleInviteMember = ({ name, email, roleId }) => {
    const newMember = {
      id: 'mem-' + Date.now().toString(36),
      name, email, roleId,
      status: 'invited',
      joinedAt: new Date().toISOString().split('T')[0],
    };
    setState({ members: [...members, newMember] });
    showToast(`${name}님을 초대했습니다.`, 'success');
    setShowMemberModal(false);
  };

  const handleRemoveMember = (memberId) => {
    if (!window.confirm('이 팀원을 삭제하시겠습니까?')) return;
    setState({ members: members.filter(m => m.id !== memberId) });
    showToast('팀원을 삭제했습니다.', 'info');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 권한 관리</h1>
          <div className="page-desc">Enterprise — 역할별 접근 권한을 설정하고 팀원을 관리합니다.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => setShowRoleModal(true)}>+ 역할 추가</button>
          <button className="btn btn-accent" onClick={() => setShowMemberModal(true)}> 팀원 초대</button>
        </div>
      </div>

      {/* 역할 카드 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {roles.map(role => {
          const memberCount = members.filter(m => m.roleId === role.id).length;
          const permCount = role.permissions.includes('*') ? ALL_PERMISSIONS.length : role.permissions.length;
          return (
            <div key={role.id} className="card" style={{ borderTop: `3px solid ${role.color}`, position: 'relative' }}>
              {role.isSystem
                ? <div style={{ position: 'absolute', top: '8px', right: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>시스템</div>
                : <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteRole(role.id)} style={{ position: 'absolute', top: '4px', right: '4px' }}></button>
              }
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ fontSize: '28px' }}>{role.icon}</div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{role.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{role.description}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>{memberCount}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>팀원</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '6px 10px', flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700 }}>{permCount}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>권한</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => setPermEditRole(role)}>
                 권한 설정
              </button>
            </div>
          );
        })}
      </div>

      {/* 팀원 목록 */}
      <div className="card">
        <div className="card-title"> 팀원 목록 <span className="card-subtitle">({members.length}명)</span></div>
        {members.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>역할</th>
                  <th>상태</th>
                  <th>가입일</th>
                  <th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => {
                  const role = roles.find(r => r.id === m.roleId) || {};
                  return (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong></td>
                      <td style={{ color: 'var(--text-muted)' }}>{m.email}</td>
                      <td>
                        <span className="badge" style={{ background: `${role.color || '#666'}20`, color: role.color || '#666' }}>
                          {role.icon} {role.name || '미지정'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-default'}`}>
                          {m.status === 'active' ? '활성' : '초대됨'}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.joinedAt || '-'}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleRemoveMember(m.id)}></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}></div>
            <div>아직 등록된 팀원이 없습니다.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>팀원을 초대하여 역할을 배정하세요.</div>
          </div>
        )}
      </div>

      {/* 모달들 */}
      {permEditRole && (
        <PermModal
          role={permEditRole}
          onSave={handleSavePerms}
          onClose={() => setPermEditRole(null)}
        />
      )}
      {showRoleModal && (
        <RoleModal
          roles={roles}
          onSave={handleAddRole}
          onClose={() => setShowRoleModal(false)}
        />
      )}
      {showMemberModal && (
        <MemberModal
          roles={roles}
          members={members}
          onSave={handleInviteMember}
          onClose={() => setShowMemberModal(false)}
        />
      )}
    </div>
  );
}
