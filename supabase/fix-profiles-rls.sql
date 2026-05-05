-- ============================================================
-- INVEX 긴급 패치: profiles 테이블 INSERT 권한 부여
--
-- 문제: handle_new_user() 트리거가 profiles에 INSERT 시 RLS 차단
--        앱 코드에서 신규 프로필 생성 시 401/RLS 에러 발생
-- 원인: INSERT 정책이 없었음 (SELECT/UPDATE만 있었음)
-- 적용: Supabase 대시보드 → SQL Editor → 이 파일 전체 실행
-- ============================================================

-- 1. 기존 제한적 정책 삭제 후 재생성
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- 2. 새 정책: 자기 프로필 조회/수정/생성 허용
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (auth.jwt()->>'email' IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'sinbi021499@gmail.com', 'admin@invex.io.kr'));

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 3. role 컬럼 보강 (기존 DB 호환)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'viewer';

UPDATE public.profiles
SET role = 'viewer'
WHERE role IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('viewer', 'staff', 'manager', 'admin'));
  END IF;
END $$;

-- 4. 트리거 함수 재생성 — SECURITY DEFINER로 RLS 우회
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, photo_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '사용자'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN lower(COALESCE(NEW.email, '')) IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'sinbi021499@gmail.com', 'admin@invex.io.kr') THEN 'admin'
      ELSE 'viewer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. 트리거 재연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
