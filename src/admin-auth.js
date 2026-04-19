import { getCurrentUser } from './auth.js';
import { supabase } from './supabase-client.js';

const ADMIN_EMAILS = [
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
];

/**
 * 클라이언트 측 빠른 admin 확인 (동기 — UI 렌더링용)
 * 실제 권한 집행은 Supabase RLS가 담당하므로 이 체크를 우회해도 DB 접근 불가
 */
export function isAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email);
}

/**
 * DB profiles 테이블의 role 컬럼까지 확인하는 서버 검증 (비동기)
 * 중요한 액션(급여 확정, 권한 변경 등) 직전에 호출
 */
export async function isAdminVerified() {
  const user = getCurrentUser();
  if (!user) return false;

  // 1차: 이메일 빠른 체크
  if (!ADMIN_EMAILS.includes(user.email)) return false;

  // 2차: DB role 컬럼 확인 (RLS 보호 하에 자신의 row만 읽힘)
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (error || !data) return false;
    return data.role === 'admin' || ADMIN_EMAILS.includes(user.email);
  } catch {
    // DB 조회 실패 시 이메일 체크만으로 폴백 (오프라인 대비)
    return ADMIN_EMAILS.includes(user.email);
  }
}
