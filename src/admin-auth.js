import { getCurrentUser } from './auth.js';
import { supabase } from './supabase-client.js';
import { isSuperAdminEmail } from './admin-emails.js';

/**
 * 클라이언트 측 빠른 admin 확인 (동기 — UI 렌더링용)
 * 실제 권한 집행은 Supabase RLS가 담당하므로 이 체크를 우회해도 DB 접근 불가
 */
export function isAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  return isSuperAdminEmail(user.email);
}

/**
 * DB profiles 테이블의 role 컬럼까지 확인하는 서버 검증 (비동기)
 * 중요한 액션(급여 확정, 권한 변경 등) 직전에 호출
 */
export async function isAdminVerified() {
  const user = getCurrentUser();
  if (!user) return false;

  // 1차: 이메일 빠른 체크
  if (!isSuperAdminEmail(user.email)) return false;

  // 2차: DB role 컬럼 확인 (RLS 보호 하에 자신의 row만 읽힘)
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.uid)
      .single();
    if (error || !data) return false;
    return data.role === 'admin' || isSuperAdminEmail(user.email);
  } catch {
    // [SECURITY] DB 조회 실패 시 false 반환 (Fail-secure 원칙)
    // 이전에는 이메일 체크 폴백으로 오프라인 상태를 악용한 권한 우회 가능
    // VULN-003(부분) / admin-auth fail-open 대응 패치 (2026-05-03)
    return false;
  }
}
