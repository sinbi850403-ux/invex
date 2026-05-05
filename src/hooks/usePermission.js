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
 *  2. store.members 내 현재 UID 매칭 → role 필드
 *  3. store.workspaceMeta.owner_id === currentUid → 'owner'
 *  4. 위 모두 해당 없으면 'viewer' (최소 권한, owner 아님)
 *
 * @param {string} [explicitRole] - 명시적으로 역할을 지정할 경우
 * @returns {{
 *   canAccess: (pageId: string) => boolean,
 *   isOwner: boolean,
 *   isOwnerOrAdmin: boolean,
 *   currentRole: string,
 *   rolePermissions: Object
 * }}
 */
export function usePermission(explicitRole) {
  const [rolePerms] = useStore(s => s.rolePermissions);
  const [wsMeta]    = useStore(s => s.workspaceMeta);

  const { currentRole, isOwner, isOwnerOrAdmin } = useMemo(() => {
    if (explicitRole) {
      return {
        currentRole: explicitRole,
        isOwner: explicitRole === 'owner',
        isOwnerOrAdmin: ['owner', 'admin'].includes(explicitRole),
      };
    }

    const uid = getCurrentUid();

    // workspaceMeta.owner_id 와 비교해 오너 여부 먼저 판단
    if (uid && wsMeta?.owner_id === uid) {
      return { currentRole: 'owner', isOwner: true, isOwnerOrAdmin: true };
    }

    // workspaceMeta.members 에서 현재 사용자의 역할 조회
    const memberList = Array.isArray(wsMeta?.members) ? wsMeta.members : [];
    const me = uid ? memberList.find(m => m.uid === uid || m.id === uid) : null;
    if (me?.role) {
      const role = me.role;
      return {
        currentRole: role,
        isOwner: role === 'owner',
        isOwnerOrAdmin: ['owner', 'admin'].includes(role),
      };
    }

    // workspaceMeta 아직 로드되지 않음 → 단독 사용자(오너)로 간주
    // 재로그인 직후 restoreState가 비동기로 완료되기 전에 컴포넌트가 렌더링되면
    // wsMeta가 null인 상태로 진입한다. 이때 viewer를 반환하면 "접근 권한이 없습니다"
    // 화면이 표시되므로, 로드 완료 전에는 owner로 간주하고 이후 재렌더링 시 정정한다.
    // (RLS는 DB 레벨에서 보호하므로 클라이언트 역할이 owner여도 타인 데이터 노출 없음)
    if (!wsMeta) {
      return { currentRole: 'owner', isOwner: true, isOwnerOrAdmin: true };
    }
    // wsMeta는 있는데 구성원 목록에 없는 경우 → 최소 권한
    return { currentRole: 'viewer', isOwner: false, isOwnerOrAdmin: false };
  }, [explicitRole, wsMeta]);

  const canAccess = useMemo(() => {
    return (pageId) => {
      // owner는 항상 전체 접근
      if (currentRole === 'owner') return true;

      const perms = rolePerms?.[currentRole]
        ?? DEFAULT_ROLE_PERMISSIONS[currentRole]
        ?? {};
      return perms[pageId] === true;
    };
  }, [currentRole, rolePerms]);

  return { canAccess, isOwner, isOwnerOrAdmin, currentRole, rolePermissions: rolePerms };
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
