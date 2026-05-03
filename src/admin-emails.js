// [SECURITY] TODO: 이 하드코딩된 이메일 목록을 DB로 이전 필요 (중기 작업, 우선순위 P1)
//
// 현재 문제:
//   - 관리자 이메일 3개가 클라이언트 번들에 평문 노출 (VULN-003 / CWE-798)
//   - 번들 분석 도구(source-map-explorer 등)로 누구나 관리자 이메일 파악 가능
//
// 목표 상태 (중기 로드맵):
//   1. system_config 테이블에 이미 admin_emails 행이 존재 (supabase/schema.sql 참고)
//      → SELECT value FROM system_config WHERE key = 'admin_emails'
//   2. Supabase Edge Function 또는 DB Function (handle_new_user 트리거 참고)에서만 조회
//   3. 클라이언트에서는 profiles.role = 'admin' 체크로 대체
//      → isAdminVerified() (admin-auth.js) 가 DB role 체크를 이미 구현함
//
// 완전 이전 전까지는 isAdmin() 대신 isAdminVerified() 사용을 권장.
// (ATTACK-004 참고: system_config RLS 패치 후 REST API 직접 조회도 차단됨)
export const SUPER_ADMIN_EMAILS = Object.freeze([
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
]);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.includes(normalizeEmail(email));
}
