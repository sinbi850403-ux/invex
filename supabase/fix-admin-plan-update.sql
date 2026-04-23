-- ============================================================
-- INVEX 패치: 관리자의 타 유저 요금제·역할 변경 허용
--
-- 문제: profiles_update 정책이 auth.uid() = id 조건만 있어
--       관리자가 다른 사용자의 plan/role 을 UPDATE 해도
--       Supabase가 에러 없이 0행만 업데이트함 (RLS 차단)
-- 해결: 관리자 이메일에 한해 모든 profiles 행 UPDATE 허용
--
-- ★ Supabase 대시보드 → SQL Editor 에서 실행 ★
-- ============================================================

-- 기존 관리자 SELECT 정책 (이미 존재하면 무시)
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT
  USING (
    auth.jwt()->>'email' IN (
      'sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr'
    )
  );

-- 관리자 UPDATE 정책 추가 (신규)
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE
  USING (
    auth.jwt()->>'email' IN (
      'sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr'
    )
  )
  WITH CHECK (
    auth.jwt()->>'email' IN (
      'sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr'
    )
  );
