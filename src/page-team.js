/**
 * page-team.js - 팀 관리 페이지
 * 역할: 팀원 초대, 관리, 역할 배정, 무료 기간 표시
 * 왜 필요? → 다중 사용자가 같은 데이터를 공유하려면 팀 관리가 필수
 */

import { getCurrentUser, getUserProfileData } from './auth.js';
import { isSupabaseConfigured as isConfigured } from './supabase-client.js';
import { showToast } from './toast.js';
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
} from './workspace.js';
import { escapeHtml } from './ux-toolkit.js';

function safeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function renderTeamPage(container, navigateTo) {
  const user = getCurrentUser();
  const profile = getUserProfileData();

  if (!isConfigured || !user) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">팀 관리</h1>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">🔒</div>
          <div class="msg">로그인이 필요합니다</div>
          <div class="sub">팀 기능을 사용하려면 먼저 로그인해 주세요.</div>
        </div>
      </div>
    `;
    return;
  }

  // 로딩 표시
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">팀 관리</h1>
    </div>
    <div class="card" style="text-align:center; padding:40px;">
      <div style="font-size:24px; margin-bottom:8px;">⏳</div>
      <div style="color:var(--text-muted);">팀 정보를 불러오는 중...</div>
    </div>
  `;

  // 워크스페이스 정보 + 내 초대장 병렬 로드
  const wsId = await getWorkspaceId(user.uid);
  const [metaResult, myPendingInvite] = await Promise.all([
    getWorkspaceMeta(wsId),
    getPendingInvite(user.uid),
  ]);
  let meta = metaResult;

  // 워크스페이스가 없으면 자동 생성
  if (!meta) {
    await createWorkspace(user.displayName ? `${user.displayName}의 워크스페이스` : 'My Workspace');
    meta = await getWorkspaceMeta(wsId);
  }

  const allMembers = meta?.members || [];
  const activeMembers = allMembers.filter(m => m.status !== 'pending');
  const pendingMembers = allMembers.filter(m => m.status === 'pending');
  const isOwner = meta?.owner_id === user.uid;
  const myMember = allMembers.find(m => m.uid === user.uid || m.id === user.uid);
  const myRole = isOwner ? 'owner' : (myMember?.role || myMember?.roleId || profile?.role || 'staff');
  const freePeriod = getFreePeriodInfo(profile?.createdAt);

  // 역할 라벨
  const roleLabels = {
    owner: { text: '대표', color: 'var(--accent)', icon: '' },
    admin: { text: '관리자', color: 'var(--success)', icon: '' },
    manager: { text: '매니저', color: 'var(--info, #58a6ff)', icon: '' },
    staff: { text: '직원', color: 'var(--text-muted)', icon: '' },
    viewer: { text: '열람자', color: 'var(--text-muted)', icon: '' },
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">팀 관리</h1>
        <div class="page-desc">팀원을 초대하고 함께 재고를 관리하세요. 모든 데이터가 실시간으로 공유됩니다.</div>
      </div>
      ${isOwner ? `
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-invite">+ 팀원 초대</button>
      </div>
      ` : ''}
    </div>

    <!-- 내 초대장 (비오너에게만 표시) -->
    ${myPendingInvite ? `
    <div class="card" style="border: 2px solid var(--accent); background: linear-gradient(135deg, rgba(37,99,235,0.05), rgba(139,92,246,0.05));">
      <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
        <div style="font-size:36px;">📬</div>
        <div style="flex:1; min-width:200px;">
          <div style="font-size:16px; font-weight:700; margin-bottom:4px;">팀 초대장이 도착했습니다!</div>
          <div style="font-size:13px; color:var(--text-muted); margin-bottom:2px;">
            <strong>${escapeHtml(myPendingInvite.invitedBy)}</strong>님이
            <strong>"${escapeHtml(myPendingInvite.workspaceName)}"</strong> 워크스페이스에 초대했습니다.
          </div>
          <div style="font-size:12px; color:var(--text-muted);">
            배정 역할: <strong>${escapeHtml(myPendingInvite.role || 'staff')}</strong> &nbsp;|&nbsp;
            초대일: ${new Date(myPendingInvite.invitedAt).toLocaleDateString('ko-KR')}
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-outline" id="btn-reject-invite" style="color:var(--danger); border-color:var(--danger);">거절</button>
          <button class="btn btn-primary" id="btn-accept-invite">수락</button>
        </div>
      </div>
    </div>
    ` : ''}

    <!-- 무료 기간 안내 -->
    <div class="card" style="background: linear-gradient(135deg, rgba(37,99,235,0.1), rgba(139,92,246,0.1)); border: 1px solid rgba(37,99,235,0.2);">
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
        <div>
          <div style="font-size:16px; font-weight:700; margin-bottom:4px;">
            🎁 1년 무료 이용 중
          </div>
          <div style="font-size:13px; color:var(--text-muted);">
            가입일: ${freePeriod.startDate} → 무료 종료: ${freePeriod.endDate}
          </div>
        </div>
        <div style="text-align:center;">
          <div style="font-size:28px; font-weight:800; color:var(--accent);">
            D-${freePeriod.daysLeft}
          </div>
          <div style="font-size:11px; color:var(--text-muted);">남은 무료 기간</div>
        </div>
      </div>
      <div style="margin-top:12px; height:6px; background:var(--border-light); border-radius:3px; overflow:hidden;">
        <div style="height:100%; width:${Math.round((freePeriod.daysLeft / 365) * 100)}%; background: linear-gradient(90deg, var(--accent), #a371f7); border-radius:3px; transition:width 0.5s;"></div>
      </div>
    </div>

    <!-- 워크스페이스 정보 -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">워크스페이스</div>
        <div class="stat-value" style="font-size:16px;">${escapeHtml(meta?.name || '-')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">활성 팀원</div>
        <div class="stat-value text-accent">${activeMembers.length}명</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">내 역할</div>
        <div class="stat-value" style="font-size:16px;">${roleLabels[myRole]?.icon || '👤'} ${roleLabels[myRole]?.text || '멤버'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">요금제</div>
        <div class="stat-value" style="font-size:16px;">🎁 무료</div>
      </div>
    </div>

    <!-- 활성 팀원 목록 -->
    <div class="card">
      <div class="card-title">👥 팀원 목록 <span class="card-subtitle">${activeMembers.length}명</span></div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px;"></th>
              <th>이름</th>
              <th>이메일</th>
              <th>역할</th>
              <th>참여일</th>
              ${isOwner ? '<th style="width:80px;">관리</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${activeMembers.map(m => {
              const rl = roleLabels[m.role] || roleLabels.staff;
              const isMe = m.uid === user.uid;
              const joinDate = m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('ko-KR') : '-';
              return `
                <tr>
                  <td style="font-size:20px; text-align:center;">${rl.icon}</td>
                  <td>
                    <strong>${escapeHtml(m.name || '사용자')}</strong>
                    ${isMe ? '<span class="badge badge-info" style="margin-left:6px; font-size:10px;">나</span>' : ''}
                  </td>
                  <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(m.email || '-')}</td>
                  <td>
                    <span class="badge" style="background:${rl.color}20; color:${rl.color}; border:1px solid ${rl.color}40;">
                      ${rl.text}
                    </span>
                  </td>
                  <td style="font-size:12px;">${joinDate}</td>
                  ${isOwner ? `
                    <td>
                      ${!isMe && m.role !== 'owner' ? `
                        <button class="btn-icon btn-icon-danger btn-remove-member" data-uid="${safeAttr(m.uid)}" data-name="${safeAttr(m.name)}" title="제거">🗑️</button>
                      ` : ''}
                    </td>
                  ` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 초대 대기 중 멤버 (오너에게만 표시, 대기자 있을 때만) -->
    ${isOwner && pendingMembers.length > 0 ? `
    <div class="card" style="border-left: 3px solid var(--warning, #f59e0b);">
      <div class="card-title">⏳ 초대 대기 중 <span class="card-subtitle">${pendingMembers.length}명</span></div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>역할</th>
              <th>초대일</th>
              <th style="width:80px;">취소</th>
            </tr>
          </thead>
          <tbody>
            ${pendingMembers.map(m => {
              const rl = roleLabels[m.role] || roleLabels.staff;
              const inviteDate = m.invitedAt ? new Date(m.invitedAt).toLocaleDateString('ko-KR') : '-';
              return `
                <tr style="opacity:0.75;">
                  <td>
                    <strong>${escapeHtml(m.name || '사용자')}</strong>
                    <span style="font-size:10px; margin-left:6px; padding:2px 6px; border-radius:10px; background:rgba(245,158,11,0.15); color:var(--warning,#f59e0b); border:1px solid rgba(245,158,11,0.3);">초대 대기</span>
                  </td>
                  <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(m.email || '-')}</td>
                  <td>
                    <span class="badge" style="background:${rl.color}20; color:${rl.color}; border:1px solid ${rl.color}40;">
                      ${rl.text}
                    </span>
                  </td>
                  <td style="font-size:12px;">${inviteDate}</td>
                  <td>
                    <button class="btn-icon btn-icon-danger btn-cancel-invite" data-uid="${safeAttr(m.uid)}" data-name="${safeAttr(m.name)}" title="초대 취소">✕</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- 실시간 동기화 안내 -->
    <div class="card" style="border-left:3px solid var(--success);">
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-size:24px;">🔄</span>
        <div>
          <div style="font-weight:600; margin-bottom:2px;">실시간 데이터 공유</div>
          <div style="font-size:13px; color:var(--text-muted);">
            팀원이 재고를 수정하면 다른 팀원의 화면에도 자동으로 반영됩니다.<br/>
            입출고 등록, 품목 수정, 거래처 관리 등 모든 데이터가 실시간으로 동기화됩니다.
          </div>
        </div>
      </div>
    </div>

    <!-- 초대 모달 -->
    <div class="modal-overlay" id="invite-modal" style="display:none;">
      <div class="modal" style="max-width:440px;">
        <div class="modal-header">
          <h3 class="modal-title">👥 팀원 초대</h3>
          <button class="modal-close" id="invite-close">✕</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info" style="margin-bottom:16px; font-size:13px;">
            초대할 팀원이 먼저 INVEX에 가입되어 있어야 합니다.<br/>
            가입한 이메일 주소를 입력해 주세요.
          </div>
          <div class="form-group">
            <label class="form-label">이메일 <span class="required">*</span></label>
            <input class="form-input" type="email" id="invite-email" placeholder="팀원의 가입 이메일" />
          </div>
          <div class="form-group">
            <label class="form-label">역할</label>
            <select class="form-select" id="invite-role">
              <option value="staff">👤 직원 — 입출고 등록, 재고 조회</option>
              <option value="manager">📋 매니저 — 직원 권한 + 보고서, 거래처 관리</option>
              <option value="admin">⚙️ 관리자 — 모든 기능 사용 가능</option>
              <option value="viewer">👁️ 열람자 — 조회만 가능</option>
            </select>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:16px;">
            <button class="btn btn-outline" id="invite-cancel">취소</button>
            <button class="btn btn-primary" id="invite-confirm">초대하기</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // === 이벤트 바인딩 ===

  // 초대 수락
  container.querySelector('#btn-accept-invite')?.addEventListener('click', async () => {
    const btn = container.querySelector('#btn-accept-invite');
    btn.disabled = true;
    btn.textContent = '처리 중...';
    const success = await acceptInvite();
    if (success) {
      // 로그아웃 유발하는 window.location.reload() 대신 워크스페이스 재연결 후 재렌더
      await startWorkspaceSync(user.uid);
      renderTeamPage(container, navigateTo);
    } else {
      btn.disabled = false;
      btn.textContent = '수락';
    }
  });

  // 초대 거절
  container.querySelector('#btn-reject-invite')?.addEventListener('click', async () => {
    if (!confirm('초대를 거절하시겠습니까?')) return;
    const btn = container.querySelector('#btn-reject-invite');
    btn.disabled = true;
    const success = await rejectInvite();
    if (success) {
      renderTeamPage(container, navigateTo);
    } else {
      btn.disabled = false;
    }
  });

  // 초대 모달 열기
  container.querySelector('#btn-invite')?.addEventListener('click', () => {
    container.querySelector('#invite-modal').style.display = 'flex';
    container.querySelector('#invite-email').focus();
  });

  // 초대 모달 닫기
  const closeInviteModal = () => {
    container.querySelector('#invite-modal').style.display = 'none';
  };
  container.querySelector('#invite-close')?.addEventListener('click', closeInviteModal);
  container.querySelector('#invite-cancel')?.addEventListener('click', closeInviteModal);

  // 초대 실행
  container.querySelector('#invite-confirm')?.addEventListener('click', async () => {
    const email = container.querySelector('#invite-email').value.trim();
    const role = container.querySelector('#invite-role').value;

    if (!email) {
      showToast('이메일을 입력해 주세요.', 'warning');
      return;
    }

    const btn = container.querySelector('#invite-confirm');
    btn.disabled = true;
    btn.textContent = '처리 중...';
    const success = await inviteMember(email, role);
    btn.disabled = false;
    btn.textContent = '초대하기';
    if (success) {
      closeInviteModal();
      renderTeamPage(container, navigateTo);
    }
  });

  // 초대 취소 (오너 — pending 멤버)
  container.querySelectorAll('.btn-cancel-invite').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const name = btn.dataset.name;
      if (!confirm(`"${name}" 님에 대한 초대를 취소하시겠습니까?`)) return;

      const success = await cancelInvite(uid);
      if (success) {
        renderTeamPage(container, navigateTo);
      }
    });
  });

  // 멤버 제거
  container.querySelectorAll('.btn-remove-member').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.dataset.uid;
      const name = btn.dataset.name;
      if (!confirm(`"${name}" 님을 팀에서 제거하시겠습니까?\n제거 후에도 해당 사용자의 개인 데이터는 유지됩니다.`)) return;

      const success = await removeMember(uid);
      if (success) {
        renderTeamPage(container, navigateTo);
      }
    });
  });
}
