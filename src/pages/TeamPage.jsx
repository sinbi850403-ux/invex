/**
 * TeamPage.jsx - 팀 관리
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { isSupabaseConfigured as isConfigured } from '../supabase-client.js';
import { showToast } from '../toast.js';
import {
  getWorkspaceId,
  createWorkspace,
  getWorkspaceMeta,
  inviteMember,
  removeMember,
  cancelInvite,
  getPendingInvite,
  acceptInvite,
  rejectInvite,
  getFreePeriodInfo,
  startWorkspaceSync,
  addTestMembers,
  removeTestMembers,
  changeMemberRole,
} from '../workspace.js';

const ROLE_LABELS = {
  owner:   { text: '대표',   color: 'var(--accent)',            icon: '' },
  admin:   { text: '관리자', color: 'var(--success)',           icon: '' },
  manager: { text: '매니저', color: 'var(--info, #58a6ff)',     icon: '' },
  staff:   { text: '직원',   color: 'var(--text-muted)',        icon: '' },
  viewer:  { text: '열람자', color: 'var(--text-muted)',        icon: '' },
};

/** 초대 모달 */
function InviteModal({ onClose, onInvited }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) {
      showToast('이메일을 입력해 주세요.', 'warning');
      return;
    }
    setLoading(true);
    const success = await inviteMember(email.trim(), role);
    setLoading(false);
    if (success) {
      onClose();
      onInvited();
    }
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <h3 className="modal-title"> 팀원 초대</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: '16px', fontSize: '13px' }}>
            초대할 팀원이 먼저 INVEX에 가입되어 있어야 합니다.<br />
            가입한 이메일 주소를 입력해 주세요.
          </div>
          <div className="form-group">
            <label className="form-label">이메일 <span className="required">*</span></label>
            <input
              className="form-input"
              type="email"
              placeholder="팀원의 가입 이메일"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">역할</label>
            <select className="form-select" value={role} onChange={e => setRole(e.target.value)}>
              <option value="staff"> 직원 — 입출고 등록, 재고 조회</option>
              <option value="manager"> 매니저 — 직원 권한 + 보고서, 거래처 관리</option>
              <option value="admin"> 관리자 — 모든 기능 사용 가능</option>
              <option value="viewer"> 열람자 — 조회만 가능</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn btn-outline" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={handleInvite} disabled={loading}>
              {loading ? '처리 중...' : '초대하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [wsId, setWsId] = useState(null);
  const [testLoading, setTestLoading] = useState(false);
  const [roleChangingUid, setRoleChangingUid] = useState(null);

  const load = useCallback(async () => {
    if (!isConfigured || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const resolvedWsId = await getWorkspaceId(user.uid);
      setWsId(resolvedWsId);
      const [metaResult, myPendingInvite] = await Promise.all([
        getWorkspaceMeta(resolvedWsId),
        getPendingInvite(user.uid),
      ]);
      let meta = metaResult;
      if (!meta) {
        // 워크스페이스가 없으면 자동 생성 시도
        // createWorkspace 내부에서 JWT 검증 → 실패 시 null 반환(토스트 이미 표시됨)
        const created = await createWorkspace(
          user.displayName ? `${user.displayName}의 워크스페이스` : 'My Workspace'
        );
        if (created) meta = await getWorkspaceMeta(resolvedWsId);
        // created === null 이면 meta는 null로 유지 → UI에서 재시도 버튼 표시
      }
      setData({ meta, myPendingInvite });
    } catch (e) {
      showToast('팀 정보를 불러오지 못했습니다: ' + e.message, 'error');
      setData({ meta: null, myPendingInvite: null });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (!isConfigured || !user) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">팀 관리</h1></div>
        <div className="card">
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">로그인이 필요합니다</div>
            <div className="sub">팀 기능을 사용하려면 먼저 로그인해 주세요.</div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">팀 관리</h1></div>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
          <div style={{ color: 'var(--text-muted)' }}>팀 정보를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  const { meta, myPendingInvite } = data || {};
  const allMembers = meta?.members || [];
  const activeMembers = allMembers.filter(m => m.status !== 'pending');
  const pendingMembers = allMembers.filter(m => m.status === 'pending');
  const isOwner = meta?.owner_id === user.uid;
  const myMember = allMembers.find(m => m.uid === user.uid || m.id === user.uid);
  const myRole = isOwner ? 'owner' : (myMember?.role || myMember?.roleId || profile?.role || 'staff');
  const freePeriod = getFreePeriodInfo(profile?.createdAt);
  const hasTestMembers = activeMembers.some(m => String(m.uid || '').startsWith('test-'));

  const handleAcceptInvite = async () => {
    setAcceptingInvite(true);
    const success = await acceptInvite();
    if (success) {
      await startWorkspaceSync(user.uid);
      load();
    }
    setAcceptingInvite(false);
  };

  const handleRejectInvite = async () => {
    if (!confirm('초대를 거절하시겠습니까?')) return;
    const success = await rejectInvite();
    if (success) load();
  };

  const handleRemoveMember = async (uid, name) => {
    if (!confirm(`"${name}" 님을 팀에서 제거하시겠습니까?\n제거 후에도 해당 사용자의 개인 데이터는 유지됩니다.`)) return;
    const success = await removeMember(uid);
    if (success) load();
  };

  const handleCancelInvite = async (uid, name) => {
    if (!confirm(`"${name}" 님에 대한 초대를 취소하시겠습니까?`)) return;
    const success = await cancelInvite(uid);
    if (success) load();
  };

  const handleRoleChange = async (targetUid, newRole) => {
    if (!wsId) return;
    setRoleChangingUid(targetUid);
    await changeMemberRole(wsId, targetUid, newRole);
    await load();
    setRoleChangingUid(null);
  };

  const handleAddTestMembers = async () => {
    if (!wsId) return;
    setTestLoading(true);
    const ok = await addTestMembers(wsId);
    if (ok) {
      showToast('테스트 팀원 4명을 추가했습니다.', 'success');
      await load();
    }
    setTestLoading(false);
  };

  const handleRemoveTestMembers = async () => {
    if (!wsId) return;
    setTestLoading(true);
    const ok = await removeTestMembers(wsId);
    if (ok) {
      showToast('테스트 팀원을 삭제했습니다.', 'info');
      await load();
    }
    setTestLoading(false);
  };

  return (
    <div>
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); load(); }}
        />
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">팀 관리</h1>
          <div className="page-desc">팀원을 초대하고 함께 재고를 관리하세요. 모든 데이터가 실시간으로 공유됩니다.</div>
        </div>
        <div className="page-actions">
          {isOwner && meta && (
            <>
              {hasTestMembers ? (
                <button className="btn btn-ghost" onClick={handleRemoveTestMembers} disabled={testLoading}
                  style={{ color: 'var(--danger)' }}>
                  {testLoading ? '처리 중…' : '🗑 테스트 삭제'}
                </button>
              ) : (
                <button className="btn btn-ghost" onClick={handleAddTestMembers} disabled={testLoading}
                  title="관리자·매니저·직원·열람자 가상 팀원 4명 자동 생성">
                  {testLoading ? '처리 중…' : '🧪 테스트 팀원'}
                </button>
              )}
              <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ 팀원 초대</button>
            </>
          )}
          {!meta && !loading && (
            <button className="btn btn-outline" onClick={load}>⟳ 워크스페이스 생성 재시도</button>
          )}
        </div>
      </div>

      {/* 내 초대장 (비오너에게만 표시) */}
      {myPendingInvite && (
        <div className="card" style={{ border: '2px solid var(--accent)', background: 'linear-gradient(135deg, rgba(37,99,235,0.05), rgba(139,92,246,0.05))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '36px' }}></div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>팀 초대장이 도착했습니다!</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                <strong>{myPendingInvite.invitedBy}</strong>님이{' '}
                <strong>"{myPendingInvite.workspaceName}"</strong> 워크스페이스에 초대했습니다.
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                배정 역할: <strong>{myPendingInvite.role || 'staff'}</strong> &nbsp;|&nbsp;
                초대일: {new Date(myPendingInvite.invitedAt).toLocaleDateString('ko-KR')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleRejectInvite}>거절</button>
              <button className="btn btn-primary" onClick={handleAcceptInvite} disabled={acceptingInvite}>
                {acceptingInvite ? '처리 중...' : '수락'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 무료 기간 안내 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(139,92,246,0.1))', border: '1px solid rgba(37,99,235,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}> 1년 무료 이용 중</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              가입일: {freePeriod.startDate} → 무료 종료: {freePeriod.endDate}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--accent)' }}>D-{freePeriod.daysLeft}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>남은 무료 기간</div>
          </div>
        </div>
        <div style={{ marginTop: '12px', height: '6px', background: 'var(--border-light)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.round((freePeriod.daysLeft / 365) * 100)}%`, background: 'linear-gradient(90deg, var(--accent), #a371f7)', borderRadius: '3px', transition: 'width 0.5s' }} />
        </div>
      </div>

      {/* 워크스페이스 미생성 안내 */}
      {!meta && (
        <div className="card" style={{ border: '1px solid var(--warning)', background: 'rgba(251,191,36,0.05)', textAlign: 'center', padding: '32px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: '8px' }}>워크스페이스를 생성하지 못했습니다</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
            로그인 세션이 만료되었을 수 있습니다.<br />
            페이지를 새로고침하거나 다시 로그인 후 재시도해 주세요.
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>새로고침</button>
            <button className="btn btn-primary" onClick={load}>워크스페이스 생성 재시도</button>
          </div>
        </div>
      )}

      {/* 워크스페이스 정보 */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">워크스페이스</div>
          <div className="stat-value" style={{ fontSize: '16px' }}>{meta?.name || '-'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">활성 팀원</div>
          <div className="stat-value text-accent">{activeMembers.length}명</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">내 역할</div>
          <div className="stat-value" style={{ fontSize: '16px' }}>
            {ROLE_LABELS[myRole]?.icon || ''} {ROLE_LABELS[myRole]?.text || '멤버'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">요금제</div>
          <div className="stat-value" style={{ fontSize: '16px' }}> 무료</div>
        </div>
      </div>

      {/* 활성 팀원 목록 */}
      <div className="card">
        <div className="card-title"> 팀원 목록 <span className="card-subtitle">{activeMembers.length}명</span></div>
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>이름</th>
                <th>이메일</th>
                <th>역할</th>
                <th>참여일</th>
                {isOwner && <th style={{ width: '160px' }}>역할 변경 / 관리</th>}
              </tr>
            </thead>
            <tbody>
              {activeMembers.map(m => {
                const rl = ROLE_LABELS[m.role] || ROLE_LABELS.staff;
                const isMe = m.uid === user.uid;
                const isTest = String(m.uid || '').startsWith('test-');
                const joinDate = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('ko-KR') : '-';
                return (
                  <tr key={m.uid || m.id} style={isTest ? { opacity: 0.8, background: 'rgba(245,158,11,0.04)' } : {}}>
                    <td style={{ fontSize: '20px', textAlign: 'center' }}>{rl.icon}</td>
                    <td>
                      <strong>{m.name || '사용자'}</strong>
                      {isMe && <span className="badge badge-info" style={{ marginLeft: '6px', fontSize: '10px' }}>나</span>}
                      {isTest && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>테스트</span>}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.email || '-'}</td>
                    <td>
                      <span className="badge" style={{ background: `${rl.color}20`, color: rl.color, border: `1px solid ${rl.color}40` }}>
                        {rl.text}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px' }}>{joinDate}</td>
                    {isOwner && (
                      <td>
                        {!isMe && m.role !== 'owner' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <select
                              value={m.role || 'staff'}
                              disabled={roleChangingUid === m.uid}
                              onChange={e => handleRoleChange(m.uid, e.target.value)}
                              style={{
                                fontSize: '12px', padding: '3px 6px',
                                borderRadius: '6px', border: '1px solid var(--border)',
                                background: 'var(--bg-secondary)', color: 'var(--text)',
                                cursor: 'pointer', flex: 1,
                              }}
                            >
                              <option value="admin">관리자</option>
                              <option value="manager">매니저</option>
                              <option value="staff">직원</option>
                              <option value="viewer">열람자</option>
                            </select>
                            <button
                              className="btn-icon btn-icon-danger"
                              title="제거"
                              onClick={() => handleRemoveMember(m.uid, m.name)}
                            >🗑</button>
                          </div>
                        ) : (
                          <td></td>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 초대 대기 중 멤버 (오너에게만 표시) */}
      {isOwner && pendingMembers.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--warning, #f59e0b)' }}>
          <div className="card-title">⏳ 초대 대기 중 <span className="card-subtitle">{pendingMembers.length}명</span></div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>이름</th>
                  <th>이메일</th>
                  <th>역할</th>
                  <th>초대일</th>
                  <th style={{ width: '80px' }}>취소</th>
                </tr>
              </thead>
              <tbody>
                {pendingMembers.map(m => {
                  const rl = ROLE_LABELS[m.role] || ROLE_LABELS.staff;
                  const inviteDate = m.invitedAt ? new Date(m.invitedAt).toLocaleDateString('ko-KR') : '-';
                  return (
                    <tr key={m.uid || m.id} style={{ opacity: 0.75 }}>
                      <td>
                        <strong>{m.name || '사용자'}</strong>
                        <span style={{ fontSize: '10px', marginLeft: '6px', padding: '2px 6px', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', color: 'var(--warning,#f59e0b)', border: '1px solid rgba(245,158,11,0.3)' }}>
                          초대 대기
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.email || '-'}</td>
                      <td>
                        <span className="badge" style={{ background: `${rl.color}20`, color: rl.color, border: `1px solid ${rl.color}40` }}>
                          {rl.text}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>{inviteDate}</td>
                      <td>
                        <button
                          className="btn-icon btn-icon-danger"
                          title="초대 취소"
                          onClick={() => handleCancelInvite(m.uid, m.name)}
                        ></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 실시간 동기화 안내 */}
      <div className="card" style={{ borderLeft: '3px solid var(--success)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}></span>
          <div>
            <div style={{ fontWeight: '600', marginBottom: '2px' }}>실시간 데이터 공유</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              팀원이 재고를 수정하면 다른 팀원의 화면에도 자동으로 반영됩니다.<br />
              입출고 등록, 품목 수정, 거래처 관리 등 모든 데이터가 실시간으로 동기화됩니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
