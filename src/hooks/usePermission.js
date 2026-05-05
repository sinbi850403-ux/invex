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

// 현재 로그인한 사용자의 역할을 가져오는 함수
// AuthContext에서 주입된 currentUser.role 또는 localStorage 기반 fallback
function getCurrentUserRole() {
  try {
    const raw = localStorage.getItem('invex-supabase-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user?.user_metadata?.role || null;
    }
  } catch (_) {}
  return null;
}

/**
 * 기능별 접근 가능 여부를 확인하는 훅
 *
 * @param {string} [explicitRole] - 명시적으로 역할을 지정할 경우 (미지정 시 현재 사용자 역할)
 * @returns {{
 *   canAccess: (pageId: string) => boolean,
 *   isOwner: boolean,
 *   isOwnerOrAdmin: boolean,
 *   currentRole: string,
 *   rolePermissions: Object
 * }}
 */
export function usePermission(explicitRole) {
  const rolePerms = useStore(s => s.rolePermissions);
  const members   = useStore(s => s.members) || [];

  const { currentRole, isOwner, isOwnerOrAdmin } = useMemo(() => {
    if (explicitRole) {
      return {
        currentRole: explicitRole,
        isOwner: explicitRole === 'owner',
        isOwnerOrAdmin: ['owner', 'admin'].includes(explicitRole),
      };
    }
    // state.members에서 현재 로그인 사용자의 역할 찾기
    // (멀티 멤버 시나리오 — 현재는 대부분 단독 owner)
    const role = getCurrentUserRole() || 'owner';
    return {
      currentRole: role,
      isOwner: role === 'owner',
      isOwnerOrAdmin: ['owner', 'admin'].includes(role),
    };
  }, [explicitRole, members]);

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
