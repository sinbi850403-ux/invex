// 관리자 이메일 목록 — 환경변수(VITE_ADMIN_EMAILS)에서 읽어 소스코드 하드코딩 제거
// .env: VITE_ADMIN_EMAILS=sinbi850403@gmail.com,sinbi021499@gmail.com,sinbi0214@naver.com
//
// ※ VITE_ 변수는 클라이언트 번들에 포함됩니다.
//    이 체크는 최초 로그인 시 role 결정(profile.js)에서만 호출됩니다.
//    UI/플랜 접근 체크는 profile.role === 'admin' 을 직접 사용하여 이 목록을 참조하지 않습니다.
//    실제 보안은 Supabase RLS + isAdminVerified() (DB role 확인) 가 담당합니다.
const _raw = import.meta.env.VITE_ADMIN_EMAILS ?? '';
export const SUPER_ADMIN_EMAILS = Object.freeze(
  _raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isSuperAdminEmail(email) {
  return SUPER_ADMIN_EMAILS.includes(normalizeEmail(email));
}
