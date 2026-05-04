-- ============================================================
-- INVEX — 통합 RLS 패치 (최종 정리본)
-- Supabase 대시보드 → SQL Editor → 전체 실행
-- ============================================================

-- ============================================================
-- 0. 관리자 이메일 단일 소스 헬퍼 함수 (V-003)
-- 하드코딩 이메일을 모든 정책에 반복하는 대신 이 함수만 수정
-- ============================================================
CREATE OR REPLACE FUNCTION check_admin_email()
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT auth.jwt()->>'email' IN (
    'sinbi0214@naver.com',
    'sinbi850403@gmail.com',
    'sinbi021499@gmail.com',
    'admin@invex.io.kr'
  )
$$;

-- ============================================================
-- 1. profiles RLS 정책
-- ============================================================
DROP POLICY IF EXISTS "profiles_select"            ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin"      ON profiles;
DROP POLICY IF EXISTS "profiles_select_for_invite" ON profiles;
DROP POLICY IF EXISTS "profiles_insert"            ON profiles;
DROP POLICY IF EXISTS "profiles_update"            ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin"      ON profiles;
DROP POLICY IF EXISTS "users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "users can update own profile" ON profiles;

-- 본인 프로필만 조회
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- 관리자: 모든 프로필 조회 — check_admin_email() 사용 (V-003 수정)
CREATE POLICY "profiles_select_admin" ON profiles
  FOR SELECT USING (check_admin_email());

-- V-004 수정: profiles_select_for_invite 제거 (IDOR — 모든 인증 사용자가 전체 PII 열람 가능)
-- 초대 이메일 조회는 아래 lookup_profile_for_invite() SECURITY DEFINER RPC로 대체
-- (RPC는 id, email, name 최소 필드만 반환)

-- 본인 프로필 생성/수정
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 관리자: 모든 프로필 수정 — check_admin_email() 사용 (V-003 수정)
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE
  USING (check_admin_email())
  WITH CHECK (check_admin_email());

-- ============================================================
-- 1-1. 초대 이메일 조회 RPC (V-004 대체 — 최소 PII 노출)
-- profiles_select_for_invite 정책 없이 이메일 기반 조회 제공
-- ============================================================
CREATE OR REPLACE FUNCTION lookup_profile_for_invite(lookup_email TEXT)
RETURNS TABLE(id UUID, email TEXT, name TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  -- 빈 입력 차단
  IF lookup_email IS NULL OR trim(lookup_email) = '' THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.name
    FROM profiles p
    WHERE p.email = lower(trim(lookup_email))
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION lookup_profile_for_invite(TEXT) TO authenticated;

-- ============================================================
-- 2. 신규 회원 프로필 자동 생성 트리거
-- ============================================================
-- 관리자 이메일 목록 — 트리거 컨텍스트에서는 auth.jwt() 미사용, 직접 비교
-- check_admin_email()과 동일 목록으로 유지 (V-003: 변경 시 이 함수도 함께 수정)
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
      WHEN lower(COALESCE(NEW.email, '')) IN (
        'sinbi0214@naver.com', 'sinbi850403@gmail.com',
        'sinbi021499@gmail.com', 'admin@invex.io.kr'
      ) THEN 'admin'
      ELSE 'viewer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 3. transactions 누락 컬럼 추가
-- ============================================================
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS item_code            TEXT,
  ADD COLUMN IF NOT EXISTS supply_value         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat                  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_selling_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS spec                 TEXT,
  ADD COLUMN IF NOT EXISTS unit                 TEXT,
  ADD COLUMN IF NOT EXISTS category             TEXT;

-- ============================================================
-- 4. Realtime 활성화
-- ============================================================
ALTER TABLE items           REPLICA IDENTITY FULL;
ALTER TABLE transactions    REPLICA IDENTITY FULL;
ALTER TABLE vendors         REPLICA IDENTITY FULL;
ALTER TABLE transfers       REPLICA IDENTITY FULL;
ALTER TABLE account_entries REPLICA IDENTITY FULL;
ALTER TABLE purchase_orders REPLICA IDENTITY FULL;
ALTER TABLE stocktakes      REPLICA IDENTITY FULL;
ALTER TABLE user_settings   REPLICA IDENTITY FULL;
ALTER TABLE profiles        REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR TABLE
      items, transactions, vendors, transfers,
      account_entries, purchase_orders, stocktakes,
      user_settings, profiles;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE
      items, transactions, vendors, transfers,
      account_entries, purchase_orders, stocktakes,
      user_settings, profiles;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 5. team_workspaces 테이블 + RLS
-- ============================================================
CREATE TABLE IF NOT EXISTS team_workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT DEFAULT 'My Workspace',
  owner_id   TEXT NOT NULL,
  members    JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_workspaces REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
DROP POLICY IF EXISTS "tw_insert" ON team_workspaces;
DROP POLICY IF EXISTS "tw_update" ON team_workspaces;
DROP POLICY IF EXISTS "tw_delete" ON team_workspaces;

-- 오너이거나 members 배열에 포함된 사람만 조회
CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated
  USING (
    auth.uid()::text = owner_id
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(members) AS m
      WHERE (m->>'uid') = auth.uid()::text
         OR (m->>'id')  = auth.uid()::text
    )
  );

CREATE POLICY "tw_insert" ON team_workspaces FOR INSERT
  WITH CHECK (auth.uid()::text = owner_id);

CREATE POLICY "tw_update" ON team_workspaces FOR UPDATE
  USING (auth.uid()::text = owner_id);

CREATE POLICY "tw_delete" ON team_workspaces FOR DELETE
  USING (auth.uid()::text = owner_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE team_workspaces;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- 6. 워크스페이스 멤버 확인 헬퍼 함수
-- is_workspace_member(owner_uid)
--   - 본인이 오너이면 true
--   - members 배열에 uid/id 일치 + status = 'active' 이면 true
-- ============================================================
DROP FUNCTION IF EXISTS is_workspace_member(UUID);

CREATE OR REPLACE FUNCTION is_workspace_member(owner_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = owner_uid THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM team_workspaces tw
    WHERE tw.id = owner_uid::text
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(tw.members) AS m
        WHERE ((m->>'uid') = auth.uid()::text OR (m->>'id') = auth.uid()::text)
          AND (m->>'status') = 'active'
      )
  );
END;
$$;

-- ============================================================
-- 7. 워크스페이스 멤버 조작 RPC 함수
-- ============================================================

-- 멤버 추가 (팀장 전용)
CREATE OR REPLACE FUNCTION workspace_add_member(ws_id TEXT, new_member JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_owner TEXT;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF ws_owner != auth.uid()::text THEN RAISE EXCEPTION '팀장만 멤버를 초대할 수 있습니다.'; END IF;
  UPDATE team_workspaces
    SET members    = members || jsonb_build_array(new_member),
        updated_at = now()
    WHERE id = ws_id;
END;
$$;
GRANT EXECUTE ON FUNCTION workspace_add_member(TEXT, JSONB) TO authenticated;

-- 멤버 제거 (팀장 또는 본인 탈퇴)
CREATE OR REPLACE FUNCTION workspace_remove_member(ws_id TEXT, member_uid TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws_owner TEXT;
  caller   TEXT := auth.uid()::text;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF caller != ws_owner AND caller != member_uid THEN RAISE EXCEPTION '권한이 없습니다.'; END IF;
  IF member_uid = ws_owner THEN RAISE EXCEPTION '팀장은 제거할 수 없습니다.'; END IF;
  UPDATE team_workspaces
    SET members = COALESCE((
          SELECT jsonb_agg(m)
          FROM jsonb_array_elements(members) m
          WHERE (m->>'uid') != member_uid AND (m->>'id') != member_uid
        ), '[]'::jsonb),
        updated_at = now()
    WHERE id = ws_id;
END;
$$;
GRANT EXECUTE ON FUNCTION workspace_remove_member(TEXT, TEXT) TO authenticated;

-- 멤버 상태 변경 (본인의 초대 수락/거절만 가능)
CREATE OR REPLACE FUNCTION workspace_set_member_status(ws_id TEXT, member_uid TEXT, new_status TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller TEXT := auth.uid()::text;
BEGIN
  IF caller != member_uid THEN RAISE EXCEPTION '본인의 초대 상태만 변경할 수 있습니다.'; END IF;
  IF new_status NOT IN ('active', 'rejected') THEN RAISE EXCEPTION '유효하지 않은 상태값입니다.'; END IF;
  UPDATE team_workspaces
    SET members = (
          SELECT jsonb_agg(
            CASE WHEN (m->>'uid') = member_uid OR (m->>'id') = member_uid
              THEN m || jsonb_build_object('status', new_status)
              ELSE m
            END
          )
          FROM jsonb_array_elements(members) m
        ),
        updated_at = now()
    WHERE id = ws_id;
END;
$$;
GRANT EXECUTE ON FUNCTION workspace_set_member_status(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 8. 데이터 테이블 RLS — is_workspace_member() 기반
-- 팀 멤버도 오너 데이터에 읽기/쓰기 가능
-- ============================================================
DROP POLICY IF EXISTS "items_all"      ON items;
DROP POLICY IF EXISTS "tx_all"         ON transactions;
DROP POLICY IF EXISTS "vendors_all"    ON vendors;
DROP POLICY IF EXISTS "transfers_all"  ON transfers;
DROP POLICY IF EXISTS "stocktakes_all" ON stocktakes;
DROP POLICY IF EXISTS "audit_all"      ON audit_logs;
DROP POLICY IF EXISTS "accounts_all"   ON account_entries;
DROP POLICY IF EXISTS "orders_all"     ON purchase_orders;
DROP POLICY IF EXISTS "pos_all"        ON pos_sales;
DROP POLICY IF EXISTS "fields_all"     ON custom_fields;
DROP POLICY IF EXISTS "settings_all"   ON user_settings;

CREATE POLICY "items_all"      ON items           FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "tx_all"         ON transactions    FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "vendors_all"    ON vendors         FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "transfers_all"  ON transfers       FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "stocktakes_all" ON stocktakes      FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "audit_all"      ON audit_logs      FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "accounts_all"   ON account_entries FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "orders_all"     ON purchase_orders FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "pos_all"        ON pos_sales       FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "fields_all"     ON custom_fields   FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "settings_all"   ON user_settings   FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));

-- ============================================================
-- 9. HR 테이블 RLS
-- ============================================================
DROP POLICY IF EXISTS "employees_all"    ON employees;
DROP POLICY IF EXISTS "attendance_all"   ON attendance;
DROP POLICY IF EXISTS "payrolls_all"     ON payrolls;
DROP POLICY IF EXISTS "leaves_all"       ON leaves;
DROP POLICY IF EXISTS "salary_items_all" ON salary_items;

CREATE POLICY "employees_all"    ON employees    FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "attendance_all"   ON attendance   FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "payrolls_all"     ON payrolls     FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "leaves_all"       ON leaves       FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));
CREATE POLICY "salary_items_all" ON salary_items FOR ALL USING (is_workspace_member(user_id)) WITH CHECK (is_workspace_member(user_id));

-- ============================================================
-- 완료 확인 쿼리 (주석 해제 후 실행)
-- ============================================================
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
