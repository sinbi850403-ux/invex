/**
 * usePermission.js — 현재 사용자의 역할별 기능 접근 권한 확인 훅
 *
 * 사용 예시:
 *   const { canAccess, isOwnerOrAdmin } = usePermission();
 *   if (!canAccess('payroll')) return <AccessDenied />;
 */

import { useMemo } from 'react';
import { useStore } from './useStore.js';
import { DEFAULT_ROLE_PERMISSIONS } from '../db/rolePermissions.js';

/** 현재 로그인한 사용자의 UID를 localStorage에서 읽는다 */
function getCurrentUid() {
  try {
    const raw = localStorage.getItem('invex-supabase-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user?.id ?? null;
    }
  } catch (_) {}
  return null;
}

/**
 * 기능별 접근 가능 여부를 확인하는 훅
 *
 * 역할 결정 우선순위:
 *  1. explicitRole 파라미터 (테스트/미리보기 용도)
 *  2. store.workspaceMeta.owner_id === currentUid → 'owner'
 *  3. store.workspaceMeta.members 내 현재 UID 매칭 → role 필드
 *  4. workspaceMeta 로딩 중(null) → isLoading=true, canAccess 허용(로딩 중단 방지)
 *  5. wsMeta 있지만 구성원 목록에 없는 경우 → 'viewer' (최소 권한)
 *
 * @param {string} [explicitRole] - 명시적으로 역할을 지정할 경우
 * @returns {{
 *   canAccess: (pageId: string) => boolean,
 *   isOwner: boolean,
 *   isOwnerOrAdmin: boolean,
 *   isLoading: boolean,
 *   currentRole: string,
 *   rolePermissions: Object
 * }}
 */
export function usePermission(explicitRole) {
  const [rolePerms] = useStore(s => s.rolePermissions);
  const [wsMeta]    = useStore(s => s.workspaceMeta);

  const { currentRole, isOwner, isOwnerOrAdmin, isLoading } = useMemo(() => {
    if (explicitRole) {
      return {
        currentRole: explicitRole,
        isOwner: explicitRole === 'owner',
        isOwnerOrAdmin: ['owner', 'admin'].includes(explicitRole),
        isLoading: false,
      };
    }

    const uid = getCurrentUid();

    // workspaceMeta 아직 로드되지 않음 → 로딩 중
    // 재로그인 직후 restoreState가 비동기로 완료되기 전에 컴포넌트가 렌더링되면
    // wsMeta가 null인 상태로 진입한다. isLoading=true를 반환하여 UI가 스피너를
    // 표시하도록 하고, canAccess는 허용(true)을 반환해 렌더링 중단을 방지한다.
    // (RLS는 DB 레벨에서 보호하므로 클라이언트 로딩 중 허용이 실제 데이터 노출로 이어지지 않음)
    if (!wsMeta) {
      return { currentRole: 'loading', isOwner: false, isOwnerOrAdmin: false, isLoading: true };
    }

    // workspaceMeta.owner_id 와 비교해 오너 여부 먼저 판단
    if (uid && wsMeta.owner_id === uid) {
      return { currentRole: 'owner', isOwner: true, isOwnerOrAdmin: true, isLoading: false };
    }

    // workspaceMeta.members 에서 현재 사용자의 역할 조회
    const memberList = Array.isArray(wsMeta.members) ? wsMeta.members : [];
    const me = uid ? memberList.find(m => m.uid === uid || m.id === uid) : null;
    if (me?.role) {
      const role = me.role;
      return {
        currentRole: role,
        isOwner: role === 'owner',
        isOwnerOrAdmin: ['owner', 'admin'].includes(role),
        isLoading: false,
      };
    }

    // wsMeta는 있는데 구성원 목록에 없는 경우 → 최소 권한
    return { currentRole: 'viewer', isOwner: false, isOwnerOrAdmin: false, isLoading: false };
  }, [explicitRole, wsMeta]);

  const canAccess = useMemo(() => {
    return (pageId) => {
      // 로딩 중에는 접근 허용 (로딩 완료 후 재렌더링 시 실제 역할로 재판단)
      if (isLoading) return true;
      // owner는 항상 전체 접근
      if (currentRole === 'owner') return true;

      const perms = rolePerms?.[currentRole]
        ?? DEFAULT_ROLE_PERMISSIONS[currentRole]
        ?? {};
      return perms[pageId] === true;
    };
  }, [currentRole, isLoading, rolePerms]);

  return { canAccess, isOwner, isOwnerOrAdmin, isLoading, currentRole, rolePermissions: rolePerms };
}

/**
 * 특정 역할이 pageId에 접근 가능한지 확인 (React 외부에서 사용 가능한 순수 함수)
 *
 * @param {string} role - 'owner' | 'admin' | 'manager' | 'staff' | 'viewer'
 * @param {string} pageId - 기능 ID
 * @param {Object|null} rolePerms - store의 rolePermissions (없으면 기본값 사용)
 */
export function checkPermission(role, pageId, rolePerms = null) {
  if (role === 'owner') return true;
  const perms = rolePerms?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? {};
  return perms[pageId] === true;
}
