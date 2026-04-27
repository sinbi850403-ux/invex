/**
 * ============================================================
 * INVEX RLS 패치 — 팀 멤버 쓰기 권한 + 보안 강화
 *
 * 문제:
 *   팀 멤버가 오너 워크스페이스에 데이터 업로드 시
 *   auth.uid() = member_uid, INSERT user_id = owner_uid
 *   → RLS 체크 실패 → 저장 차단
 *
 * 해결:
 *   is_workspace_member() 함수로 팀 멤버 여부를 확인하고
 *   모든 테이블 정책에 OR 조건 추가
 *
 * 적용:
 *   Supabase 대시보드 → SQL Editor → 전체 실행
 * ============================================================
 */

-- ============================================================
-- Step 1: 팀 멤버 확인 헬퍼 함수
-- ============================================================

-- 기존 함수 삭제 (파라미터명 변경 시 DROP 필요)
DROP FUNCTION IF EXISTS is_workspace_member(UUID);

/**
 * 현재 로그인 유저가 workspace_owner_uid 의 워크스페이스 멤버인지 확인
 * SECURITY DEFINER: RLS 우회하여 team_workspaces 직접 조회
 * STABLE: 같은 트랜잭션 내 동일 인자 → 캐시 재사용 (성능)
 */
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_owner_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_workspaces
    WHERE owner_id::uuid = workspace_owner_uid
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(members) AS m
        WHERE m->>'uid'    = auth.uid()::text
          AND m->>'status' = 'accepted'
      )
  );
$$;

-- ============================================================
-- Step 2: 팀원 이메일로 프로필 조회 (안전한 RPC)
-- profiles_select_for_invite 정책 대체
-- — 전체 목록 노출 대신 이메일 1건만 반환
-- ============================================================

CREATE OR REPLACE FUNCTION lookup_profile_by_email(target_email TEXT)
RETURNS TABLE(id UUID, name TEXT, email TEXT, photo_url TEXT, role TEXT, plan TEXT)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT p.id, p.name, p.email, p.photo_url, p.role, p.plan
  FROM profiles p
  WHERE lower(p.email) = lower(target_email)
  LIMIT 1;
$$;

-- ============================================================
-- Step 3: profiles RLS 수정
-- — profiles_select_for_invite 제거 (전체 유저 정보 노출 방지)
-- ============================================================

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_select_for_invite" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;

-- 자신 또는 관리자만 프로필 조회
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    auth.uid() = id
    OR auth.jwt()->>'email' IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr')
  );

-- 가입 시 트리거가 INSERT (SECURITY DEFINER 함수가 처리)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- 자신의 프로필만 수정
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- Step 4: 재고·거래 테이블 RLS 수정
-- ============================================================

-- items
DROP POLICY IF EXISTS "items_all" ON items;
CREATE POLICY "items_all" ON items FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- transactions
DROP POLICY IF EXISTS "tx_all" ON transactions;
CREATE POLICY "tx_all" ON transactions FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- vendors
DROP POLICY IF EXISTS "vendors_all" ON vendors;
CREATE POLICY "vendors_all" ON vendors FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- transfers
DROP POLICY IF EXISTS "transfers_all" ON transfers;
CREATE POLICY "transfers_all" ON transfers FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- stocktakes
DROP POLICY IF EXISTS "stocktakes_all" ON stocktakes;
CREATE POLICY "stocktakes_all" ON stocktakes FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- audit_logs
DROP POLICY IF EXISTS "audit_all" ON audit_logs;
CREATE POLICY "audit_all" ON audit_logs FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- account_entries
DROP POLICY IF EXISTS "accounts_all" ON account_entries;
CREATE POLICY "accounts_all" ON account_entries FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- purchase_orders
DROP POLICY IF EXISTS "orders_all" ON purchase_orders;
CREATE POLICY "orders_all" ON purchase_orders FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- pos_sales
DROP POLICY IF EXISTS "pos_all" ON pos_sales;
CREATE POLICY "pos_all" ON pos_sales FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- custom_fields
DROP POLICY IF EXISTS "fields_all" ON custom_fields;
CREATE POLICY "fields_all" ON custom_fields FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- user_settings
DROP POLICY IF EXISTS "settings_all" ON user_settings;
CREATE POLICY "settings_all" ON user_settings FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- ============================================================
-- Step 5: HR 테이블 RLS 수정
-- ============================================================

DROP POLICY IF EXISTS "employees_all"    ON employees;
DROP POLICY IF EXISTS "attendance_all"   ON attendance;
DROP POLICY IF EXISTS "payrolls_all"     ON payrolls;
DROP POLICY IF EXISTS "leaves_all"       ON leaves;
DROP POLICY IF EXISTS "salary_items_all" ON salary_items;

CREATE POLICY "employees_all" ON employees FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "attendance_all" ON attendance FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "payrolls_all" ON payrolls FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "leaves_all" ON leaves FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

CREATE POLICY "salary_items_all" ON salary_items FOR ALL
  USING (auth.uid() = user_id OR is_workspace_member(user_id))
  WITH CHECK (auth.uid() = user_id OR is_workspace_member(user_id));

-- ============================================================
-- 완료 체크
-- ============================================================
-- 아래 쿼리로 적용 결과 확인:
--
-- SELECT tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
