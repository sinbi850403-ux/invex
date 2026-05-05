/**
 * RolesPage.jsx - 권한 관리 (RBAC) — 역할×기능 행렬 테이블
 *
 * B안: 역할(열) × 기능(행) 체크박스 행렬
 * - owner(대표)는 코드에서 항상 전체 허용, 수정 불가
 * - admin/manager/staff/viewer는 체크박스로 개별 제어
 * - HR/급여 그룹은 🔒 표시 + 경고 배너
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import * as db from '../db.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../db/rolePermissions.js';

// ────────────────────────────────────────────────
// 기능 그룹 정의
// ────────────────────────────────────────────────
const FEATURE_GROUPS = [
  {
    id: 'inventory',
    label: '재고 관리',
    icon: '📦',
    features: [
      { id: 'dashboard',  label: '대시보드' },
      { id: 'inventory',  label: '재고 현황' },
      { id: 'in',         label: '입출고 관리' },
      { id: 'ledger',     label: '수불부' },
      { id: 'transfer',   label: '창고 이동' },
      { id: 'stocktake',  label: '재고 실사' },
      { id: 'bulk',       label: '일괄 처리' },
      { id: 'scanner',    label: '바코드 스캔' },
      { id: 'labels',     label: '라벨 인쇄' },
    ],
  },
  {
    id: 'partner',
    label: '거래처·창고',
    icon: '🏢',
    features: [
      { id: 'vendors',    label: '거래처 관리' },
      { id: 'warehouses', label: '다중 창고' },
      { id: 'orders',     label: '발주 관리' },
    ],
  },
  {
    id: 'report',
    label: '보고·분석',
    icon: '📊',
    features: [
      { id: 'summary',    label: '요약 보고' },
      { id: 'costing',    label: '원가 분석' },
      { id: 'profit',     label: '손익 분석' },
      { id: 'accounts',   label: '매출/매입' },
      { id: 'documents',  label: '문서 생성' },
      { id: 'auditlog',   label: '감사 추적' },
    ],
  },
  {
    id: 'hr',
    label: '인사·급여',
    icon: '👥',
    sensitive: true,
    features: [
      { id: 'hr-dashboard',         label: 'HR 대시보드' },
      { id: 'employees',            label: '직원 관리' },
      { id: 'attendance',           label: '근태 관리' },
      { id: 'payroll',              label: '급여 계산' },
      { id: 'leaves',               label: '휴가·연차' },
      { id: 'severance',            label: '퇴직금 계산' },
      { id: 'yearend-settlement',   label: '연말정산 보조' },
    ],
  },
  {
    id: 'system',
    label: '시스템',
    icon: '⚙️',
    features: [
      { id: 'settings',   label: '설정' },
      { id: 'team',       label: '팀 관리' },
      { id: 'roles',      label: '권한 관리' },
      { id: 'backup',     label: '백업·복원' },
    ],
  },
];

// 열에 표시할 역할 목록 (owner는 항상 전체 허용 → 별도 표시)
const ROLES = [
  { id: 'owner',   label: '대표',   color: '#f59e0b', icon: '👑', fixed: true,  desc: '모든 권한 (변경 불가)' },
  { id: 'admin',   label: '관리자', color: '#ef4444', icon: '🛡️', fixed: false, desc: '실무 관리자' },
  { id: 'manager', label: '매니저', color: '#3b82f6', icon: '📊', fixed: false, desc: '부서 관리자' },
  { id: 'staff',   label: '직원',   color: '#10b981', icon: '👤', fixed: false, desc: '일반 직원' },
  { id: 'viewer',  label: '열람자', color: '#8b5cf6', icon: '👁️', fixed: false, desc: '조회 전용' },
];

// ────────────────────────────────────────────────
// 팀원 초대 모달
// ────────────────────────────────────────────────
function MemberModal({ roles, members, onSave, onClose }) {
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('staff');

  const handleSave = () => {
    if (!name.trim() || !email.trim()) {
      showToast('이름과 이메일을 입력해 주세요.', 'warning');
      return;
    }
    if (members.some(m => m.email === email.trim())) {
      showToast('이미 등록된 이메일입니다.', 'warning');
      return;
    }
    onSave({ name: name.trim(), email: email.trim(), roleId });
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3>👤 팀원 초대</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">이름 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="팀원 이름" />
          </div>
          <div className="form-group">
            <label className="form-label">이메일 <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input className="form-input" type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">역할</label>
            <select className="form-select" value={roleId} onChange={e => setRoleId(e.target.value)}>
              {ROLES.filter(r => r.id !== 'owner').map(r => (
                <option key={r.id} value={r.id}>{r.icon} {r.label} — {r.desc}</option>
              ))}
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

// ────────────────────────────────────────────────
// 메인 페이지
// ────────────────────────────────────────────────
export default function RolesPage() {
  const [state, setState] = useStore();
  const members           = state.members || [];

  // rolePermissions: store에서 로드 or 기본값
  const [perms, setPerms] = useState(() => {
    if (state.rolePermissions) return state.rolePermissions;
    return {
      owner:   null, // owner는 UI에서만 체크, DB에 저장 안 함
      admin:   { ...DEFAULT_ROLE_PERMISSIONS.admin },
      manager: { ...DEFAULT_ROLE_PERMISSIONS.manager },
      staff:   { ...DEFAULT_ROLE_PERMISSIONS.staff },
      viewer:  { ...DEFAULT_ROLE_PERMISSIONS.viewer },
    };
  });

  // store에서 rolePermissions가 로드됐을 때 동기화
  React.useEffect(() => {
    if (state.rolePermissions) {
      setPerms(prev => ({
        ...prev,
        ...state.rolePermissions,
        owner: null, // owner는 항상 전체 허용
      }));
    }
  }, [state.rolePermissions]);

  const [saving, setSaving]             = useState(false);
  const [showMemberModal, setShowMember] = useState(false);
  const [activeTab, setActiveTab]        = useState('matrix'); // 'matrix' | 'members'

  // 변경 추적 (초기값과 비교)
  const [isDirty, setIsDirty] = useState(false);

  // ── 체크박스 토글 ──
  const handleToggle = useCallback((role, featureId) => {
    if (role === 'owner') return; // owner는 변경 불가
    setPerms(prev => ({
      ...prev,
      [role]: { ...prev[role], [featureId]: !prev[role]?.[featureId] },
    }));
    setIsDirty(true);
  }, []);

  // ── 그룹 전체 체크/해제 ──
  const handleGroupToggle = useCallback((role, group, checked) => {
    if (role === 'owner') return;
    setPerms(prev => {
      const updated = { ...prev[role] };
      group.features.forEach(f => { updated[f.id] = checked; });
      return { ...prev, [role]: updated };
    });
    setIsDirty(true);
  }, []);

  // ── 역할 전체 초기화 ──
  const handleResetRole = useCallback((role) => {
    if (role === 'owner') return;
    setPerms(prev => ({ ...prev, [role]: { ...DEFAULT_ROLE_PERMISSIONS[role] } }));
    setIsDirty(true);
  }, []);

  // ── 저장 ──
  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave = {};
      ['admin', 'manager', 'staff', 'viewer'].forEach(r => {
        toSave[r] = { ...perms[r] };
      });
      await db.rolePermissions.saveAll(toSave);
      setState({ rolePermissions: toSave });
      setIsDirty(false);
      showToast('권한 설정이 저장되었습니다.', 'success');
    } catch (err) {
      console.error(err);
      showToast('저장 실패: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // ── 팀원 초대 ──
  const handleInviteMember = ({ name, email, roleId }) => {
    const newMember = {
      id: 'mem-' + Date.now().toString(36),
      name, email, roleId,
      status: 'invited',
      joinedAt: new Date().toISOString().split('T')[0],
    };
    setState({ members: [...members, newMember] });
    showToast(`${name}님을 초대했습니다.`, 'success');
    setShowMember(false);
  };

  // ── 팀원 삭제 ──
  const handleRemoveMember = (memberId) => {
    if (!window.confirm('이 팀원을 삭제하시겠습니까?')) return;
    setState({ members: members.filter(m => m.id !== memberId) });
    showToast('팀원을 삭제했습니다.', 'info');
  };

  // ── 그룹별 체크 상태 계산 (토글 버튼용) ──
  const getGroupCheck = (role, group) => {
    if (role === 'owner') return true;
    const rp = perms[role] || {};
    const all = group.features.every(f => rp[f.id] === true);
    const none = group.features.every(f => !rp[f.id]);
    if (all) return 'all';
    if (none) return 'none';
    return 'partial';
  };

  // ── 열별 통계 ──
  const roleStats = useMemo(() => {
    const allFeatures = FEATURE_GROUPS.flatMap(g => g.features);
    return ROLES.reduce((acc, role) => {
      if (role.id === 'owner') {
        acc[role.id] = allFeatures.length;
        return acc;
      }
      const rp = perms[role.id] || {};
      acc[role.id] = allFeatures.filter(f => rp[f.id] === true).length;
      return acc;
    }, {});
  }, [perms]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="title-icon">🔐</span> 권한 관리</h1>
          <div className="page-desc">역할별 기능 접근 권한을 설정합니다. 인사·급여는 대표·관리자만 접근 권장.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isDirty && (
            <span style={{ fontSize: '12px', color: 'var(--warning, #f59e0b)', fontWeight: 600 }}>
              ● 저장되지 않은 변경사항
            </span>
          )}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? '저장 중…' : '💾 저장'}
          </button>
          <button className="btn btn-accent" onClick={() => setShowMember(true)}>
            👤 팀원 초대
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'matrix',  label: '🔑 권한 행렬' },
          { id: 'members', label: `👥 팀원 목록 (${members.length})` },
        ].map(tab => (
          <button key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontWeight: activeTab === tab.id ? 700 : 400,
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: '14px',
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* ── 권한 행렬 탭 ── */}
      {activeTab === 'matrix' && (
        <>
          {/* HR 민감 데이터 경고 */}
          <div style={{
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px', padding: '10px 14px', marginBottom: '16px',
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
          }}>
            <span>🔒</span>
            <span>
              <strong>인사·급여 데이터는 민감 정보입니다.</strong>{' '}
              대표(owner) 및 관리자(admin) 외에는 접근을 제한하는 것을 권장합니다.
            </span>
          </div>

          {/* 역할 요약 카드 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '8px',
            marginBottom: '20px',
          }}>
            {ROLES.map(role => (
              <div key={role.id} className="card"
                style={{ borderTop: `3px solid ${role.color}`, padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '20px' }}>{role.icon}</div>
                <div style={{ fontWeight: 700, fontSize: '14px', margin: '4px 0' }}>{role.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>{role.desc}</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: role.color }}>
                  {roleStats[role.id]}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>기능 허용</div>
                {!role.fixed && (
                  <button className="btn btn-ghost btn-sm"
                    style={{ marginTop: '8px', fontSize: '11px', width: '100%' }}
                    onClick={() => handleResetRole(role.id)}>
                    초기화
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 권한 행렬 테이블 */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{
                      textAlign: 'left', padding: '12px 16px', fontWeight: 700,
                      borderBottom: '2px solid var(--border)', minWidth: '140px',
                      position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 2,
                    }}>기능</th>
                    {ROLES.map(role => (
                      <th key={role.id} style={{
                        padding: '12px 8px', textAlign: 'center', fontWeight: 700,
                        borderBottom: '2px solid var(--border)', minWidth: '90px',
                        color: role.color,
                      }}>
                        <div>{role.icon}</div>
                        <div style={{ fontSize: '12px' }}>{role.label}</div>
                        {role.fixed && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>
                            (고정)
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_GROUPS.map((group, gi) => (
                    <React.Fragment key={group.id}>
                      {/* 그룹 헤더 행 */}
                      <tr style={{ background: group.sensitive
                        ? 'rgba(239,68,68,0.05)'
                        : 'var(--bg-secondary)',
                      }}>
                        <td style={{
                          padding: '8px 16px', fontWeight: 700, fontSize: '12px',
                          color: group.sensitive ? 'var(--danger, #ef4444)' : 'var(--text-muted)',
                          borderTop: gi > 0 ? '2px solid var(--border)' : undefined,
                          position: 'sticky', left: 0,
                          background: group.sensitive ? 'rgba(239,68,68,0.08)' : 'var(--bg-secondary)',
                          zIndex: 1,
                        }}>
                          {group.icon} {group.label}
                          {group.sensitive && ' 🔒'}
                        </td>
                        {ROLES.map(role => {
                          const gc = getGroupCheck(role.id, group);
                          return (
                            <td key={role.id} style={{
                              textAlign: 'center',
                              borderTop: gi > 0 ? '2px solid var(--border)' : undefined,
                            }}>
                              {role.fixed ? (
                                <span style={{ fontSize: '16px', color: role.color }}>✓</span>
                              ) : (
                                <button
                                  onClick={() => handleGroupToggle(role.id, group, gc !== 'all')}
                                  title={gc === 'all' ? '그룹 전체 해제' : '그룹 전체 허용'}
                                  style={{
                                    fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                                    border: `1px solid ${role.color}40`,
                                    background: gc === 'all' ? `${role.color}20` : gc === 'partial' ? `${role.color}10` : 'transparent',
                                    color: gc === 'all' ? role.color : 'var(--text-muted)',
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                  }}>
                                  {gc === 'all' ? '전체 ✓' : gc === 'partial' ? '일부 …' : '전체 ✕'}
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* 기능별 행 */}
                      {group.features.map((feat, fi) => (
                        <tr key={feat.id}
                          style={{ borderBottom: '1px solid var(--border)', background: fi % 2 === 0 ? 'transparent' : 'var(--bg-secondary)08' }}>
                          <td style={{
                            padding: '8px 16px 8px 28px', color: 'var(--text)',
                            position: 'sticky', left: 0,
                            background: fi % 2 === 0 ? 'var(--bg)' : 'var(--bg-secondary)',
                            zIndex: 1,
                          }}>
                            {group.sensitive && (
                              <span style={{ fontSize: '10px', marginRight: '4px', opacity: 0.6 }}>🔒</span>
                            )}
                            {feat.label}
                          </td>
                          {ROLES.map(role => {
                            const isChecked = role.id === 'owner'
                              ? true
                              : perms[role.id]?.[feat.id] === true;
                            return (
                              <td key={role.id} style={{ textAlign: 'center', padding: '8px' }}>
                                {role.fixed ? (
                                  <span style={{ fontSize: '18px', color: role.color }}>✓</span>
                                ) : (
                                  <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggle(role.id, feat.id)}
                                      style={{
                                        width: '18px', height: '18px', cursor: 'pointer',
                                        accentColor: role.color,
                                      }}
                                    />
                                  </label>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 하단 저장 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={() => {
              if (!state.rolePermissions) return;
              setPerms({
                owner: null,
                admin:   { ...DEFAULT_ROLE_PERMISSIONS.admin,   ...state.rolePermissions?.admin },
                manager: { ...DEFAULT_ROLE_PERMISSIONS.manager, ...state.rolePermissions?.manager },
                staff:   { ...DEFAULT_ROLE_PERMISSIONS.staff,   ...state.rolePermissions?.staff },
                viewer:  { ...DEFAULT_ROLE_PERMISSIONS.viewer,  ...state.rolePermissions?.viewer },
              });
              setIsDirty(false);
            }} disabled={!isDirty}>
              되돌리기
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? '저장 중…' : '💾 변경사항 저장'}
            </button>
          </div>
        </>
      )}

      {/* ── 팀원 목록 탭 ── */}
      {activeTab === 'members' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="card-title">👥 팀원 목록
              <span className="card-subtitle" style={{ marginLeft: '6px' }}>({members.length}명)</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowMember(true)}>+ 팀원 초대</button>
          </div>
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
                    const role = ROLES.find(r => r.id === m.roleId) || {};
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.name}</strong></td>
                        <td style={{ color: 'var(--text-muted)' }}>{m.email}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                            background: `${role.color || '#666'}20`, color: role.color || '#666',
                          }}>
                            {role.icon} {role.label || m.roleId}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${m.status === 'active' ? 'badge-success' : 'badge-default'}`}>
                            {m.status === 'active' ? '활성' : '초대됨'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.joinedAt || '-'}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleRemoveMember(m.id)}>🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>👥</div>
              <div className="msg">아직 등록된 팀원이 없습니다.</div>
              <div className="sub">팀원을 초대하여 역할을 배정하세요.</div>
              <button className="btn btn-primary" style={{ marginTop: '12px' }}
                onClick={() => setShowMember(true)}>팀원 초대</button>
            </div>
          )}
        </div>
      )}

      {/* 모달 */}
      {showMemberModal && (
        <MemberModal
          roles={ROLES}
          members={members}
          onSave={handleInviteMember}
          onClose={() => setShowMember(false)}
        />
      )}
    </div>
  );
}
