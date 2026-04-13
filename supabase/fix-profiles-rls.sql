-- ============================================================
-- INVEX 긴급 패치: profiles 테이블 INSERT 권한 부여
-- 
-- 문제: handle_new_user() 트리거가 profiles에 INSERT 시 RLS 차단
-- 원인: INSERT 정책이 없었음 (SELECT/UPDATE만 있었음)
-- ============================================================

-- 1. 기존 제한적 정책 삭제 후 재생성
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;

-- 2. 새 정책: 자기 프로필 조회/수정/생성 허용
CREATE POLICY "profiles_select" ON profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

-- 3. 트리거 함수 재생성 — service_role 권한으로 실행되도록
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, photo_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '사용자'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. 트리거 재연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
