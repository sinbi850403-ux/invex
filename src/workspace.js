/**
 * workspace.js - 팀 워크스페이스 관리 (Supabase 기반)
 *
 * 저장소 구조:
 *   team_workspaces 테이블 → 워크스페이스 메타 (이름, 소유자, 멤버 목록)
 *   user_settings (key: joined_workspace_id) → 각 사용자의 소속 워크스페이스
 *
 * 왜 Supabase? → 다중 브라우저/기기에서 동일한 데이터를 보려면 클라우드 저장 필수
 */

import { supabase, isSupabaseConfigured } from './supabase-client.js';
import * as db from './db.js';
import { getCurrentUser, getUserProfileData } from './auth.js';
import { getState, setState } from './store.js';
import { showToast } from './toast.js';

export const isConfigured = isSupabaseConfigured;

let currentWorkspaceId = null;

// ── Supabase team_workspaces 헬퍼 ─────────────────────────────

async function wsGet(wsId) {
  if (!wsId) return null;
  const { data } = await supabase
    .from('team_workspaces')
    .select('*')
    .eq('id', wsId)
    .maybeSingle();
  return data;
}

async function wsUpsert(wsId, payload) {
  const { error } = await supabase
    .from('team_workspaces')
    .upsert({ id: wsId, ...payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}

async function wsUpdateMembers(wsId, members) {
  const { error } = await supabase
    .from('team_workspaces')
    .update({ members, updated_at: new Date().toISOString() })
    .eq('id', wsId);
  if (error) throw error;
}

// ── Public API ────────────────────────────────────────────────

/**
 * 사용자가 속한 워크스페이스 ID 반환 (없으면 본인 UID)
 */
export async function getWorkspaceId(userId) {
  if (!isConfigured || !userId) return userId;
  try {
    const wsId = await db.settings.get('joined_workspace_id');
    return wsId || userId;
  } catch {
    return userId;
  }
}

/**
 * 워크스페이스 생성 (최초 1회, 팀장 전용)
 */
export async function createWorkspace(name) {
  const user = getCurrentUser();
  if (!user || !isConfigured) return null;

  const wsId = user.uid;
  try {
    await wsUpsert(wsId, {
      name: name || 'My Workspace',
      owner_id: user.uid,
      created_at: new Date().toISOString(),
      members: [{
        uid: user.uid,
        id: user.uid,
        email: user.email,
        name: user.displayName || '관리자',
        role: 'owner',
        status: 'active',
        joinedAt: new Date().toISOString(),
      }],
    });
    await db.settings.set('joined_workspace_id', wsId);
    currentWorkspaceId = wsId;

    // 워크스페이스 생성자(대표)는 profiles.role = 'admin'으로 승격
    // (DB CHECK 제약: viewer/staff/manager/admin — owner는 별도 매핑)
    try {
      await supabase.from('profiles').update({ role: 'admin' }).eq('id', user.uid);
      const profile = getUserProfileData();
      if (profile) profile.role = 'admin';
    } catch (_) { /* role 업그레이드 실패는 무시 — 기능에 영향 없음 */ }

    showToast(`워크스페이스 "${name}" 생성 완료!`, 'success');
    return wsId;
  } catch (e) {
    showToast('워크스페이스 생성 실패: ' + e.message, 'error');
    return null;
  }
}

/**
 * 워크스페이스 메타 정보 조회 (멤버 목록 포함)
 */
export async function getWorkspaceMeta(wsId) {
  if (!isConfigured || !wsId) return null;
  try {
    return await wsGet(wsId);
  } catch {
    return null;
  }
}

/**
 * 팀 멤버 초대 (이메일로) — Supabase profiles에서 사용자 조회 후 pending 상태로 추가
 */
const ALLOWED_INVITE_ROLES = new Set(['viewer', 'staff', 'manager', 'admin']);

export async function inviteMember(email, role = 'staff') {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  // role 유효성 검증 — 'owner' 등 허용 외 역할 차단
  if (!ALLOWED_INVITE_ROLES.has(role)) {
    showToast('유효하지 않은 역할입니다.', 'error');
    return false;
  }

  try {
    // Supabase profiles에서 이메일로 사용자 조회
    const { data: targetProfile, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    if (!targetProfile) {
      showToast('해당 이메일로 가입된 사용자가 없습니다. 먼저 가입을 안내해 주세요.', 'warning');
      return false;
    }

    if (targetProfile.id === user.uid) {
      showToast('자기 자신은 초대할 수 없습니다.', 'warning');
      return false;
    }

    const wsId = await getWorkspaceId(user.uid);
    const meta = await getWorkspaceMeta(wsId);

    // 오너만 초대 가능 (클라이언트 이중 보호 — DB 레벨은 RPC에서 검증)
    if (!meta || meta.owner_id !== user.uid) {
      showToast('팀장만 멤버를 초대할 수 있습니다.', 'error');
      return false;
    }
    const existingMembers = meta?.members || [];

    if (existingMembers.some(m => m.email === email || m.uid === targetProfile.id)) {
      showToast('이미 팀에 초대되었거나 속한 멤버입니다.', 'info');
      return false;
    }

    const newMember = {
      id: targetProfile.id,
      uid: targetProfile.id,
      name: targetProfile.name || '사용자',
      email: targetProfile.email || email,
      roleId: role,
      role,
      status: 'pending',
      invitedAt: new Date().toISOString(),
      invitedBy: user.displayName || user.email || '팀장',
      workspaceName: meta?.name || '워크스페이스',
    };

    // atomic RPC — Read-Modify-Write 경쟁 방지
    const { error: rpcErr } = await supabase.rpc('workspace_add_member', {
      ws_id: wsId,
      new_member: newMember,
    });
    if (rpcErr) throw rpcErr;

    showToast(`${targetProfile.name || email}님께 초대장을 보냈습니다! 상대방이 수락하면 팀원으로 합류됩니다.`, 'success');
    return true;
  } catch (e) {
    console.error('[Team] 초대 실패:', e.message);
    showToast('초대 중 오류가 발생했습니다: ' + e.message, 'error');
    return false;
  }
}

/**
 * 현재 사용자의 대기 중 초대장 조회
 * — team_workspaces에서 내 uid가 pending 상태인 항목 탐색
 */
export async function getPendingInvite(userId) {
  if (!isConfigured || !userId) return null;
  try {
    const myWsId = await db.settings.get('joined_workspace_id');

    // RLS가 이미 본인 관련 워크스페이스만 반환 + 이미 속한 워크스페이스 제외
    let query = supabase
      .from('team_workspaces')
      .select('id, name, owner_id, members');
    if (myWsId) query = query.neq('id', myWsId);

    const { data: workspaces } = await query;
    if (!workspaces) return null;

    for (const ws of workspaces) {
      const myEntry = (ws.members || []).find(
        m => (m.uid === userId || m.id === userId) && m.status === 'pending'
      );
      if (myEntry) {
        return {
          workspaceId: ws.id,
          workspaceName: ws.name || '워크스페이스',
          invitedBy: myEntry.invitedBy || '팀장',
          role: myEntry.role || 'staff',
          invitedAt: myEntry.invitedAt,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 초대 수락 — 멤버 상태 pending → active, 워크스페이스 ID 저장
 */
export async function acceptInvite() {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  try {
    // 이미 다른 워크스페이스에 소속된 경우 차단
    const existingWsId = await db.settings.get('joined_workspace_id');
    if (existingWsId && existingWsId !== user.uid) {
      showToast('이미 다른 워크스페이스에 소속되어 있습니다. 먼저 탈퇴 후 수락해 주세요.', 'warning');
      return false;
    }

    const pendingInvite = await getPendingInvite(user.uid);
    if (!pendingInvite) {
      showToast('초대장을 찾을 수 없습니다.', 'error');
      return false;
    }

    const { workspaceId, role } = pendingInvite;
    const meta = await getWorkspaceMeta(workspaceId);
    if (!meta) {
      showToast('워크스페이스를 찾을 수 없습니다.', 'error');
      return false;
    }

    // atomic RPC — 상태 변경
    const { error: rpcErr } = await supabase.rpc('workspace_set_member_status', {
      ws_id: workspaceId,
      member_uid: user.uid,
      new_status: 'active',
    });
    if (rpcErr) throw rpcErr;

    // 내 settings에 워크스페이스 ID 저장
    await db.settings.set('joined_workspace_id', workspaceId);
    currentWorkspaceId = workspaceId;

    showToast('팀 초대를 수락했습니다! 이제 같은 워크스페이스에서 데이터를 공유합니다.', 'success');
    return true;
  } catch (e) {
    console.error('[Team] 초대 수락 실패:', e.message);
    showToast('수락 중 오류가 발생했습니다: ' + e.message, 'error');
    return false;
  }
}

/**
 * 초대 거절 — 워크스페이스 멤버 목록에서 본인 제거
 */
export async function rejectInvite() {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  try {
    const pendingInvite = await getPendingInvite(user.uid);
    if (!pendingInvite) {
      showToast('초대장을 찾을 수 없습니다.', 'error');
      return false;
    }

    const { workspaceId } = pendingInvite;
    const { error: rpcErr } = await supabase.rpc('workspace_remove_member', {
      ws_id: workspaceId,
      member_uid: user.uid,
    });
    if (rpcErr) throw rpcErr;

    showToast('초대를 거절했습니다.', 'info');
    return true;
  } catch (e) {
    showToast('거절 중 오류가 발생했습니다: ' + e.message, 'error');
    return false;
  }
}

/**
 * 초대 취소 (팀장 전용) — pending 멤버 제거
 */
export async function cancelInvite(targetUid) {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  const wsId = await getWorkspaceId(user.uid);

  try {
    const meta = await getWorkspaceMeta(wsId);
    // 오너만 초대 취소 가능
    if (!meta || meta.owner_id !== user.uid) {
      showToast('팀장만 초대를 취소할 수 있습니다.', 'error');
      return false;
    }
    const { error: rpcErr } = await supabase.rpc('workspace_remove_member', {
      ws_id: wsId,
      member_uid: targetUid,
    });
    if (rpcErr) throw rpcErr;
    showToast('초대를 취소했습니다.', 'info');
    return true;
  } catch (e) {
    showToast('초대 취소 실패: ' + e.message, 'error');
    return false;
  }
}

/**
 * 팀 멤버 제거 (팀장 전용)
 */
export async function removeMember(targetUid) {
  const user = getCurrentUser();
  if (!user || !isConfigured) return false;

  const wsId = await getWorkspaceId(user.uid);

  try {
    const meta = await getWorkspaceMeta(wsId);
    // 오너만 멤버 제거 가능
    if (!meta || meta.owner_id !== user.uid) {
      showToast('팀장만 멤버를 제거할 수 있습니다.', 'error');
      return false;
    }
    // 오너 본인 제거 방지 (DB RPC에서도 차단하지만 클라이언트 이중 보호)
    if (targetUid === user.uid) {
      showToast('본인은 제거할 수 없습니다.', 'error');
      return false;
    }
    const { error: rpcErr } = await supabase.rpc('workspace_remove_member', {
      ws_id: wsId,
      member_uid: targetUid,
    });
    if (rpcErr) throw rpcErr;
    showToast('멤버를 제거했습니다.', 'info');
    return true;
  } catch (e) {
    showToast('멤버 제거 실패: ' + e.message, 'error');
    return false;
  }
}

/**
 * 워크스페이스 실시간 동기화 — Supabase Realtime으로 대체됨
 * (store.js의 setupRealtimeSync()가 모든 테이블 변경을 감지하므로 별도 구현 불필요)
 */
export async function startWorkspaceSync(userId) {
  if (!isConfigured || !userId) return;
  const wsId = await getWorkspaceId(userId);
  currentWorkspaceId = wsId;
}

/**
 * 워크스페이스 오너(대표)의 프로필 역할 자동 승격
 * 기존 사용자 대응 — initApp 시 한 번 호출
 *
 * profiles.role DB CHECK 제약(viewer/staff/manager/admin)으로 인해
 * DB에는 'admin'으로 저장, 인메모리 userProfile.role은 'owner'로 설정
 */
export async function ensureOwnerAdminRole(userId) {
  if (!isConfigured || !userId) return;
  try {
    const wsId = await getWorkspaceId(userId);
    if (!wsId) return;

    const meta = await wsGet(wsId);
    if (!meta || meta.owner_id !== userId) return; // 오너가 아님

    const profile = getUserProfileData();
    if (!profile) return;

    // 이미 admin 이상이면 스킵
    const ROLE_WEIGHT = { viewer: 0, staff: 1, manager: 2, admin: 3, owner: 4 };
    if ((ROLE_WEIGHT[profile.role] || 0) >= ROLE_WEIGHT.admin) return;

    // DB admin으로 승격
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', userId);

    if (!error) {
      profile.role = 'admin';
      console.log('[Workspace] 대표 역할 admin으로 자동 승격');
    }
  } catch (e) {
    console.warn('[Workspace] ensureOwnerAdminRole 실패:', e.message);
  }
}

export function stopWorkspaceSync() {
  currentWorkspaceId = null;
}

export function syncWorkspaceToCloud() {
  // Supabase Realtime + store.js syncToSupabase()가 처리하므로 no-op
}

export function getCurrentWorkspaceId() {
  return currentWorkspaceId;
}

/**
 * 무료 기간 계산 — 가입일 기준 1년 무료
 */
export function getFreePeriodInfo(createdAt) {
  if (!createdAt) return { daysLeft: 365, expired: false, endDate: '' };

  const created = new Date(createdAt);
  const freeEnd = new Date(created);
  freeEnd.setFullYear(freeEnd.getFullYear() + 1);

  const now = new Date();
  const daysLeft = Math.ceil((freeEnd - now) / (1000 * 60 * 60 * 24));

  return {
    daysLeft: Math.max(0, daysLeft),
    expired: daysLeft <= 0,
    endDate: freeEnd.toLocaleDateString('ko-KR'),
    startDate: created.toLocaleDateString('ko-KR'),
  };
}
