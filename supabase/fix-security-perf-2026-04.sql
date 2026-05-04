/**
 * INVEX ERP-Lite — 보안·성능 통합 패치 (2026-04)
 *
 * 적용 대상: 기존 Supabase 인스턴스 (schema.sql 이미 적용된 DB)
 * 적용 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체 실행
 *
 * 포함 내용:
 *   CRIT-01: profiles_select_for_invite 전체 노출 제거
 *   CRIT-02: tw_select 워크스페이스 전체 노출 제한
 *   CRIT-04: encrypt_rrn NULL 키 방어
 *   CRIT-05: update_updated_at search_path 고정
 *   MED-01:  audit_logs ON DELETE CASCADE → SET NULL (로그 보존)
 *   NEW-17:  workspace_members 테이블 신규
 *   NEW-18:  warehouses 테이블 신규
 *   NEW-19:  purchase_order_items 테이블 신규
 *   NEW-20:  stocktake_items 테이블 신규
 *   PERF:    중복 인덱스 제거 + 누락 인덱스 추가
 *   AUDIT:   감사 트리거 3개 (급여 상태, 직원 삭제, role 변경)
 */

-- ============================================================
-- CRIT-01: profiles 전체 열람 정책 제거
-- ============================================================
DROP POLICY IF EXISTS "profiles_select_for_invite" ON profiles;

-- 팀 초대 전용 RPC (이메일 단건 조회만 허용)
CREATE OR REPLACE FUNCTION get_profile_by_email(lookup_email TEXT)
RETURNS TABLE(id UUID, name TEXT, email TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '인증 필요'; END IF;
  RETURN QUERY SELECT p.id, p.name, p.email FROM profiles p
    WHERE p.email = lookup_email LIMIT 1;
END; $$;
GRANT EXECUTE ON FUNCTION get_profile_by_email(TEXT) TO authenticated;

-- ============================================================
-- CRIT-02: 워크스페이스 전체 열람 제한 (1단계: members JSONB 기반)
-- workspace_members 정규화 완료 후 하단의 2단계 주석 해제
-- ============================================================
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated USING (
  auth.uid()::text = owner_id
  OR members @> jsonb_build_array(jsonb_build_object('uid', auth.uid()::text))
);

-- ============================================================
-- CRIT-04: encrypt_rrn NULL 키 방어
-- ============================================================
CREATE OR REPLACE FUNCTION encrypt_rrn(plain TEXT)
RETURNS BYTEA AS $$
DECLARE rrn_key TEXT;
BEGIN
  rrn_key := current_setting('app.rrn_key', true);
  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION 'app.rrn_key 미설정 또는 길이 부족 (최소 32자). Supabase Vault 사용 권장.';
  END IF;
  RETURN pgp_sym_encrypt(plain, rrn_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- ============================================================
-- CRIT-05: update_updated_at search_path 고정
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog, pg_temp;

-- ============================================================
-- MED-01: audit_logs FK ON DELETE CASCADE → SET NULL
-- (탈퇴 후에도 감사 로그 익명화 보존)
-- ============================================================
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- ============================================================
-- NEW-17: workspace_members 테이블 (team_workspaces.members 정규화)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'pending',
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  UNIQUE(workspace_id, member_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wm_select" ON workspace_members FOR SELECT USING (
  member_id = auth.uid()
  OR EXISTS (SELECT 1 FROM team_workspaces tw WHERE tw.id = workspace_id AND tw.owner_id = auth.uid()::text)
);
CREATE POLICY "wm_insert" ON workspace_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM team_workspaces tw WHERE tw.id = workspace_id AND tw.owner_id = auth.uid()::text)
);
CREATE POLICY "wm_update" ON workspace_members FOR UPDATE USING (
  member_id = auth.uid()
  OR EXISTS (SELECT 1 FROM team_workspaces tw WHERE tw.id = workspace_id AND tw.owner_id = auth.uid()::text)
);
CREATE POLICY "wm_delete" ON workspace_members FOR DELETE USING (
  member_id = auth.uid()
  OR EXISTS (SELECT 1 FROM team_workspaces tw WHERE tw.id = workspace_id AND tw.owner_id = auth.uid()::text)
);
CREATE INDEX IF NOT EXISTS idx_wm_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wm_member ON workspace_members(member_id);

-- workspace_members 생성 후 tw_select 정책 교체 (2단계)
-- 아래 주석을 해제하고 실행하면 JSONB 배열 대신 workspace_members 테이블 기반으로 전환됩니다.
-- DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
-- CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated USING (
--   auth.uid()::text = owner_id
--   OR EXISTS (
--     SELECT 1 FROM workspace_members wm
--     WHERE wm.workspace_id = team_workspaces.id
--       AND wm.member_id = auth.uid()
--       AND wm.status = 'active'
--   )
-- );

-- 기존 members JSONB에서 workspace_members로 데이터 이전
INSERT INTO workspace_members (workspace_id, member_id, role, status, invited_at)
SELECT
  tw.id AS workspace_id,
  (m->>'uid')::UUID AS member_id,
  COALESCE(m->>'role', 'member') AS role,
  COALESCE(m->>'status', 'pending') AS status,
  COALESCE((m->>'joinedAt')::TIMESTAMPTZ, now()) AS invited_at
FROM team_workspaces tw,
     jsonb_array_elements(tw.members) AS m
WHERE
  m->>'uid' IS NOT NULL
  AND (m->>'uid')::TEXT ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = (m->>'uid')::UUID)
ON CONFLICT (workspace_id, member_id) DO NOTHING;

-- ============================================================
-- NEW-18: warehouses 창고 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  manager TEXT,
  memo TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouses_all" ON warehouses FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_user ON warehouses(user_id);

-- 기존 items.warehouse TEXT에서 창고명 시드
INSERT INTO warehouses (user_id, name)
SELECT DISTINCT user_id, warehouse FROM items
WHERE warehouse IS NOT NULL AND warehouse != ''
ON CONFLICT (user_id, name) DO NOTHING;

-- 기존 transactions.warehouse TEXT에서 추가 시드 (items에 없는 것)
INSERT INTO warehouses (user_id, name)
SELECT DISTINCT user_id, warehouse FROM transactions
WHERE warehouse IS NOT NULL AND warehouse != ''
ON CONFLICT (user_id, name) DO NOTHING;

-- updated_at 트리거 연결
DROP TRIGGER IF EXISTS set_updated_at ON warehouses;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- NEW-19: purchase_order_items (발주서 라인 아이템)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  received_qty NUMERIC DEFAULT 0,
  note TEXT
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_all" ON purchase_order_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_item ON purchase_order_items(item_id) WHERE item_id IS NOT NULL;

-- 기존 purchase_orders.items JSONB에서 이전
INSERT INTO purchase_order_items (user_id, order_id, item_name, quantity, unit_price)
SELECT
  po.user_id,
  po.id,
  COALESCE(line->>'item_name', line->>'itemName', '미지정')::TEXT,
  COALESCE((line->>'quantity')::NUMERIC, 0),
  COALESCE((line->>'unit_price')::NUMERIC, (line->>'unitPrice')::NUMERIC, 0)
FROM purchase_orders po,
     jsonb_array_elements(po.items) AS line
WHERE po.items IS NOT NULL AND po.items != '[]'::jsonb
  AND (line->>'item_name' IS NOT NULL OR line->>'itemName' IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- NEW-20: stocktake_items (재고 실사 라인 아이템)
-- ============================================================
CREATE TABLE IF NOT EXISTS stocktake_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  system_qty NUMERIC DEFAULT 0,
  actual_qty NUMERIC DEFAULT 0,
  diff_qty NUMERIC GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
  note TEXT
);

ALTER TABLE stocktake_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sti_all" ON stocktake_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_sti_stocktake ON stocktake_items(stocktake_id);

-- 기존 stocktakes.details JSONB에서 이전
INSERT INTO stocktake_items (user_id, stocktake_id, item_name, system_qty, actual_qty)
SELECT
  s.user_id,
  s.id,
  COALESCE(d->>'item_name', d->>'itemName', '미지정')::TEXT,
  COALESCE((d->>'system_qty')::NUMERIC, (d->>'systemQty')::NUMERIC, 0),
  COALESCE((d->>'actual_qty')::NUMERIC, (d->>'actualQty')::NUMERIC, 0)
FROM stocktakes s,
     jsonb_array_elements(s.details) AS d
WHERE s.details IS NOT NULL AND s.details != '[]'::jsonb
  AND (d->>'item_name' IS NOT NULL OR d->>'itemName' IS NOT NULL)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PERF: 중복 인덱스 제거
-- ============================================================
DROP INDEX CONCURRENTLY IF EXISTS idx_items_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_tx_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_att_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_att_month;
DROP INDEX CONCURRENTLY IF EXISTS idx_att_emp;
DROP INDEX CONCURRENTLY IF EXISTS idx_payroll_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_emp_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_leave_user;

-- ============================================================
-- PERF: 누락 인덱스 추가
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_analysis
  ON transactions(user_id, type, date DESC, category)
  INCLUDE (total_amount);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_item_id
  ON transactions(item_id, user_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_warehouse
  ON transactions(user_id, warehouse, date DESC)
  WHERE warehouse IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_name
  ON items(user_id, item_name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_name_text
  ON items(user_id, item_name text_pattern_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_cat_name
  ON items(user_id, category, item_name)
  INCLUDE (quantity, unit_price, min_stock);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_type_status
  ON account_entries(user_id, type, status)
  INCLUDE (amount);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_status
  ON purchase_orders(user_id, status, order_date DESC)
  WHERE status != 'completed';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_active
  ON employees(user_id, name)
  WHERE status = 'active';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_att_date_range
  ON attendance(user_id, work_date, employee_id)
  INCLUDE (work_min, overtime_min, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_date
  ON transfers(user_id, date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_action
  ON audit_logs(user_id, action, created_at DESC);

-- ============================================================
-- AUDIT: 감사 트리거 (급여 상태 변경 / 직원 삭제 / role 변경)
-- ============================================================

CREATE OR REPLACE FUNCTION audit_payroll_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (
      auth.uid(), 'payroll.statusChange', NEW.id::text,
      format('급여 상태: %s → %s (%s년 %s월)', OLD.status, NEW.status, NEW.pay_year, NEW.pay_month),
      (SELECT email FROM profiles WHERE id = auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_payroll ON payrolls;
CREATE TRIGGER trg_audit_payroll AFTER UPDATE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION audit_payroll_status_change();

CREATE OR REPLACE FUNCTION audit_employee_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(user_id, action, target, detail, user_email)
  VALUES (
    auth.uid(), 'employee.delete', OLD.id::text,
    format('직원 삭제: %s (사번: %s)', OLD.name, OLD.emp_no),
    (SELECT email FROM profiles WHERE id = auth.uid())
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_employee_delete ON employees;
CREATE TRIGGER trg_audit_employee_delete BEFORE DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_employee_delete();

CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (
      auth.uid(), 'profile.roleChange', NEW.id::text,
      format('역할 변경: %s → %s (%s)', OLD.role, NEW.role, NEW.email),
      (SELECT email FROM profiles WHERE id = auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
CREATE TRIGGER trg_audit_profile_role AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_role_change();

-- ============================================================
-- V004: transactions.txn_date DATE 컬럼 추가 (date TEXT 하위 호환)
-- ============================================================
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS txn_date DATE;
UPDATE transactions
   SET txn_date = date::DATE
 WHERE txn_date IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_txn_date
  ON transactions(user_id, txn_date DESC);

-- ============================================================
-- V007-ext: account_entries / purchase_orders vendor_id FK 추가
-- ============================================================
ALTER TABLE account_entries ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_accounts_vendor_id
  ON account_entries(vendor_id) WHERE vendor_id IS NOT NULL;
UPDATE account_entries ae
   SET vendor_id = v.id
  FROM vendors v
 WHERE v.user_id = ae.user_id AND v.name = ae.vendor AND ae.vendor_id IS NULL;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_vendor_id
  ON purchase_orders(vendor_id) WHERE vendor_id IS NOT NULL;
UPDATE purchase_orders po
   SET vendor_id = v.id
  FROM vendors v
 WHERE v.user_id = po.user_id AND v.name = po.vendor AND po.vendor_id IS NULL;

-- ============================================================
-- V008-ext: items.warehouse_id FK 추가 (warehouses 생성 후)
-- ============================================================
ALTER TABLE items ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_warehouse_id
  ON items(user_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
UPDATE items i
   SET warehouse_id = w.id
  FROM warehouses w
 WHERE w.user_id = i.user_id AND w.name = i.warehouse AND i.warehouse_id IS NULL;

-- ============================================================
-- V009: 부서 마스터 + employees.department_id FK
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  manager TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "departments_all" ON departments FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_departments_user ON departments(user_id);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_emp_department
  ON employees(department_id) WHERE department_id IS NOT NULL;

-- ============================================================
-- V010: payrolls.confirmed_by / leaves.approved_by FK 제약 추가
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payrolls_confirmed_by_fkey') THEN
    ALTER TABLE payrolls ADD CONSTRAINT payrolls_confirmed_by_fkey
      FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leaves_approved_by_fkey') THEN
    ALTER TABLE leaves ADD CONSTRAINT leaves_approved_by_fkey
      FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- V011: system_config 테이블 신규 + handle_new_user 이메일 외부화
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config(key, value, description)
VALUES (
  'admin_emails',
  '["sinbi0214@naver.com","sinbi850403@gmail.com","sinbi021499@gmail.com","admin@invex.io.kr"]',
  '관리자 이메일 목록'
) ON CONFLICT (key) DO NOTHING;

-- handle_new_user 함수 교체 (하드코딩 → system_config 참조)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, photo_url, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '사용자'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          COALESCE((SELECT value FROM system_config WHERE key = 'admin_emails'), '[]'::jsonb)
        ) AS admin_email
        WHERE lower(admin_email) = lower(COALESCE(NEW.email, ''))
      ) THEN 'admin'
      ELSE 'viewer'
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- ============================================================
-- V012: employees.account_no 암호화 (CRIT-06)
-- ============================================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_no_enc BYTEA;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_no_mask TEXT;

CREATE OR REPLACE FUNCTION set_employee_account_no(emp_id UUID, plain TEXT)
RETURNS VOID AS $$
DECLARE mask TEXT;
BEGIN
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET account_no_enc = NULL, account_no_mask = NULL
     WHERE id = emp_id AND user_id = auth.uid();
  ELSE
    mask := CASE
      WHEN length(regexp_replace(plain, '[^0-9]', '', 'g')) >= 8
        THEN left(regexp_replace(plain, '[^0-9]', '', 'g'), 4) || '****' ||
             right(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
      ELSE repeat('*', length(plain))
    END;
    UPDATE employees
       SET account_no_enc  = pgp_sym_encrypt(plain, current_setting('app.rrn_key', true)),
           account_no_mask = mask
     WHERE id = emp_id AND user_id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION set_employee_account_no(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION decrypt_account_no(emp_id UUID)
RETURNS TEXT AS $$
DECLARE enc_data BYTEA;
BEGIN
  SELECT account_no_enc INTO enc_data FROM employees
   WHERE id = emp_id AND user_id = auth.uid();
  IF enc_data IS NULL THEN RETURN NULL; END IF;
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'employee.viewAccountNo', emp_id::text, '계좌번호 평문 조회');
  RETURN pgp_sym_decrypt(enc_data, current_setting('app.rrn_key', true));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION decrypt_account_no(UUID) TO authenticated;

-- ============================================================
-- V013: V004 Phase 2 — transfers/pos_sales/items/purchase_orders DATE 컬럼
-- ============================================================
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS date_d DATE;
UPDATE transfers SET date_d = date::DATE WHERE date_d IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transfers_date_d ON transfers(user_id, date_d DESC);

ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_date_d DATE;
UPDATE pos_sales SET sale_date_d = sale_date::DATE WHERE sale_date_d IS NULL AND sale_date ~ '^\d{4}-\d{2}-\d{2}$';

ALTER TABLE items ADD COLUMN IF NOT EXISTS expiry_date_d DATE;
UPDATE items SET expiry_date_d = expiry_date::DATE WHERE expiry_date_d IS NULL AND expiry_date ~ '^\d{4}-\d{2}-\d{2}$';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_expiry ON items(user_id, expiry_date_d) WHERE expiry_date_d IS NOT NULL;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_date_d DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date_d DATE;
UPDATE purchase_orders SET order_date_d = order_date::DATE WHERE order_date_d IS NULL AND order_date ~ '^\d{4}-\d{2}-\d{2}$';
UPDATE purchase_orders SET expected_date_d = expected_date::DATE WHERE expected_date_d IS NULL AND expected_date ~ '^\d{4}-\d{2}-\d{2}$';

-- ============================================================
-- V014: payrolls RLS FOR ALL → SELECT/INSERT/UPDATE/DELETE 분리
-- ============================================================
DROP POLICY IF EXISTS "payrolls_all" ON payrolls;
CREATE POLICY "payrolls_select" ON payrolls FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "payrolls_insert" ON payrolls FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "payrolls_update" ON payrolls FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      status = (SELECT p2.status FROM payrolls p2 WHERE p2.id = id LIMIT 1)
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
    )
  );
CREATE POLICY "payrolls_delete" ON payrolls FOR DELETE
  USING (
    auth.uid() = user_id
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

-- ============================================================
-- V015: purchase_order_items 변경 → purchase_orders.total_amount 자동 동기화
-- ============================================================
CREATE OR REPLACE FUNCTION sync_po_total_amount()
RETURNS TRIGGER AS $$
DECLARE target_order_id UUID;
BEGIN
  target_order_id := COALESCE(NEW.order_id, OLD.order_id);
  UPDATE purchase_orders
     SET total_amount = COALESCE((
           SELECT SUM(quantity * unit_price)
             FROM purchase_order_items
            WHERE order_id = target_order_id
         ), 0),
         updated_at = now()
   WHERE id = target_order_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_po_total ON purchase_order_items;
CREATE TRIGGER trg_sync_po_total
  AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items
  FOR EACH ROW EXECUTE FUNCTION sync_po_total_amount();

-- ============================================================
-- V016: team_workspaces id/owner_id TEXT → UUID
-- 주의: 기존 값이 모두 유효한 UUID 형식이어야 함 (Supabase Auth UID)
-- ============================================================
DO $$
BEGIN
  -- 유효하지 않은 UUID 형식 데이터 확인 (있으면 RAISE)
  IF EXISTS (
    SELECT 1 FROM team_workspaces
    WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) THEN
    RAISE EXCEPTION 'team_workspaces에 UUID 형식이 아닌 id가 존재합니다. 수동 정리 후 재실행하세요.';
  END IF;
END $$;

-- workspace_members FK 임시 제거
ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey;

-- 타입 변환
ALTER TABLE team_workspaces ALTER COLUMN id TYPE UUID USING id::UUID;
ALTER TABLE team_workspaces ALTER COLUMN owner_id TYPE UUID USING owner_id::UUID;
ALTER TABLE workspace_members ALTER COLUMN workspace_id TYPE UUID USING workspace_id::UUID;

-- FK 복원
ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey
  FOREIGN KEY (workspace_id) REFERENCES team_workspaces(id) ON DELETE CASCADE;

-- RLS 정책 교체 (::text 캐스트 제거)
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
DROP POLICY IF EXISTS "tw_insert" ON team_workspaces;
DROP POLICY IF EXISTS "tw_update" ON team_workspaces;
DROP POLICY IF EXISTS "tw_delete" ON team_workspaces;

CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated USING (
  auth.uid() = owner_id
  OR members @> jsonb_build_array(jsonb_build_object('uid', auth.uid()::text))
);
CREATE POLICY "tw_insert" ON team_workspaces FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "tw_update" ON team_workspaces FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "tw_delete" ON team_workspaces FOR DELETE USING (auth.uid() = owner_id);

-- RPC 함수 UUID 파라미터로 교체
CREATE OR REPLACE FUNCTION workspace_add_member(ws_id UUID, new_member JSONB)
RETURNS VOID AS $$
DECLARE ws_owner UUID;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF ws_owner != auth.uid() THEN RAISE EXCEPTION '팀장만 멤버를 초대할 수 있습니다.'; END IF;
  UPDATE team_workspaces
    SET members = members || jsonb_build_array(new_member), updated_at = now()
    WHERE id = ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_add_member(UUID, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION workspace_remove_member(ws_id UUID, member_uid UUID)
RETURNS VOID AS $$
DECLARE ws_owner UUID; caller UUID := auth.uid();
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF caller != ws_owner AND caller != member_uid THEN RAISE EXCEPTION '권한이 없습니다.'; END IF;
  IF member_uid = ws_owner THEN RAISE EXCEPTION '팀장은 제거할 수 없습니다.'; END IF;
  UPDATE team_workspaces
    SET members = COALESCE((
          SELECT jsonb_agg(m) FROM jsonb_array_elements(members) m
          WHERE (m->>'uid')::UUID != member_uid
        ), '[]'::jsonb),
        updated_at = now()
    WHERE id = ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_remove_member(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION workspace_set_member_status(ws_id UUID, member_uid UUID, new_status TEXT)
RETURNS VOID AS $$
DECLARE caller UUID := auth.uid();
BEGIN
  IF caller != member_uid THEN RAISE EXCEPTION '본인의 초대 상태만 변경할 수 있습니다.'; END IF;
  IF new_status NOT IN ('active', 'rejected') THEN RAISE EXCEPTION '유효하지 않은 상태값입니다.'; END IF;
  UPDATE team_workspaces
    SET members = (
          SELECT jsonb_agg(
            CASE WHEN (m->>'uid')::UUID = member_uid
              THEN m || jsonb_build_object('status', new_status)
              ELSE m END
          ) FROM jsonb_array_elements(members) m
        ),
        updated_at = now()
    WHERE id = ws_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_set_member_status(UUID, UUID, TEXT) TO authenticated;

-- ============================================================
-- V017: Materialized View (재고 요약, 월별 손익)
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_inventory_summary AS
SELECT
  i.user_id, i.id AS item_id, i.item_name, i.category, i.warehouse,
  i.quantity, i.unit_price, i.min_stock,
  CASE WHEN i.min_stock IS NOT NULL AND i.quantity <= i.min_stock THEN true ELSE false END AS is_low_stock,
  COUNT(t.id)      AS tx_count_90d,
  MAX(t.txn_date)  AS last_tx_date
FROM items i
LEFT JOIN transactions t ON t.item_id = i.id
  AND t.txn_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY i.id, i.user_id, i.item_name, i.category, i.warehouse,
         i.quantity, i.unit_price, i.min_stock
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_inventory_summary_pk ON mv_inventory_summary(user_id, item_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_profit AS
SELECT
  user_id,
  date_trunc('month', txn_date)::DATE AS month,
  type, category,
  SUM(total_amount) AS total_amount,
  COUNT(*)          AS tx_count
FROM transactions
WHERE txn_date IS NOT NULL
GROUP BY user_id, date_trunc('month', txn_date), type, category
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_monthly_profit_pk ON mv_monthly_profit(user_id, month, type, category);

-- ============================================================
-- 완료 확인 쿼리
-- ============================================================
-- SELECT 'profiles_select_for_invite' AS check, COUNT(*) = 0 AS ok
--   FROM pg_policies WHERE policyname = 'profiles_select_for_invite';
-- SELECT 'workspace_members' AS check, to_regclass('public.workspace_members') IS NOT NULL AS ok;
-- SELECT 'warehouses' AS check, to_regclass('public.warehouses') IS NOT NULL AS ok;
-- SELECT 'purchase_order_items' AS check, to_regclass('public.purchase_order_items') IS NOT NULL AS ok;
-- SELECT 'stocktake_items' AS check, to_regclass('public.stocktake_items') IS NOT NULL AS ok;
-- SELECT 'audit_trigger_payroll' AS check, EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_payroll') AS ok;
-- SELECT 'txn_date' AS check, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='txn_date') AS ok;
-- SELECT 'departments' AS check, to_regclass('public.departments') IS NOT NULL AS ok;
-- SELECT 'account_entries.vendor_id' AS check, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='account_entries' AND column_name='vendor_id') AS ok;
-- SELECT 'items.warehouse_id' AS check, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='warehouse_id') AS ok;
-- SELECT 'system_config' AS check, to_regclass('public.system_config') IS NOT NULL AS ok;
-- SELECT 'account_no_enc' AS check, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='account_no_enc') AS ok;
-- SELECT 'txn_date_transfers' AS check, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='transfers' AND column_name='date_d') AS ok;
-- SELECT 'mv_inventory_summary' AS check, to_regclass('public.mv_inventory_summary') IS NOT NULL AS ok;
-- SELECT 'payrolls_rls_split' AS check, COUNT(*) >= 4 AS ok FROM pg_policies WHERE tablename = 'payrolls';
-- SELECT 'team_workspaces_uuid' AS check, data_type = 'uuid' AS ok FROM information_schema.columns WHERE table_name='team_workspaces' AND column_name='id';
