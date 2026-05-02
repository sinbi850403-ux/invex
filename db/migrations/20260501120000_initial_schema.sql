-- migrate:up
-- ============================================================
-- Initial schema (converted from supabase/schema.sql)
-- Reference: supabase/schema.sql remains as read-only snapshot
-- ============================================================

/**
 * INVEX ERP-Lite — Supabase 데이터베이스 스키마 (통합본)
 *
 * 실행 방법: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
 * 멱등성 보장: IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING / DROP POLICY IF EXISTS
 *
 * 테이블 생성 순서 (의존성)
 *   system_config → profiles → warehouses → items → item_stocks → safety_stocks
 *   → vendors → transactions → transfers → stocktakes → stocktake_items
 *   → audit_logs → account_entries → purchase_orders → purchase_order_items
 *   → pos_sales → custom_fields → user_settings
 *   → team_workspaces → workspace_members
 *   → departments → employees → attendance → payrolls → leaves → salary_items
 */

-- ============================================================
-- 0. 확장 모듈
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. 시스템 설정 (관리자 이메일 등 하드코딩 방지)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config(key, value, description)
VALUES (
  'admin_emails',
  '["sinbi0214@naver.com","sinbi850403@gmail.com","admin@invex.io.kr"]',
  '관리자 이메일 목록'
) ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. updated_at 자동 갱신 트리거 함수 (모든 테이블 공통)
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog, pg_temp;

-- ============================================================
-- 3. 사용자 프로필 (Supabase Auth 확장)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                 UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT,
  email              TEXT,
  photo_url          TEXT,
  role               TEXT        NOT NULL DEFAULT 'viewer'
                                 CHECK (role IN ('viewer', 'staff', 'manager', 'admin')),
  plan               TEXT        DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  industry_template  TEXT        DEFAULT 'general',
  cost_method        TEXT        DEFAULT 'weighted-avg',
  currency           JSONB       DEFAULT '{"code":"KRW","symbol":"₩","rate":1}',
  beginner_mode      BOOLEAN     DEFAULT true,
  dashboard_mode     TEXT        DEFAULT 'executive',
  visible_columns    TEXT[],
  onboarding_done    BOOLEAN     DEFAULT false,
  subscription       JSONB       DEFAULT '{}',
  payment_history    JSONB       DEFAULT '[]',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role               TEXT        NOT NULL DEFAULT 'viewer';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS industry_template  TEXT        DEFAULT 'general';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cost_method        TEXT        DEFAULT 'weighted-avg';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency           JSONB       DEFAULT '{"code":"KRW","symbol":"₩","rate":1}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS beginner_mode      BOOLEAN     DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dashboard_mode     TEXT        DEFAULT 'executive';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS visible_columns    TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_done   BOOLEAN     DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subscription       JSONB       DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS payment_history    JSONB       DEFAULT '[]';

-- 신규 가입 시 profiles 행 자동 생성
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
        ) AS e
        WHERE lower(e) = lower(COALESCE(NEW.email, ''))
      ) THEN 'admin'
      ELSE 'viewer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 4. 창고 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT         NOT NULL,
  code       TEXT,
  address    TEXT,
  manager    TEXT,
  memo       TEXT,
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  DEFAULT now(),
  updated_at TIMESTAMPTZ  DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_warehouses_user ON warehouses(user_id);

-- ============================================================
-- 5. 품목 마스터 (재고)
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_name      TEXT          NOT NULL,
  item_code      TEXT,
  category       TEXT,
  unit           TEXT          DEFAULT 'EA',
  unit_price     NUMERIC(15,2) NOT NULL DEFAULT 0,
  supply_value   NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat            NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_price    NUMERIC(15,2) NOT NULL DEFAULT 0,
  sale_price     NUMERIC(15,2) NOT NULL DEFAULT 0,
  spec           TEXT,
  color          TEXT,
  warehouse      TEXT,                                                    -- 레거시 텍스트
  warehouse_id   UUID          REFERENCES warehouses(id) ON DELETE SET NULL, -- 정규화 FK
  location       TEXT,
  vendor         TEXT,
  min_stock      NUMERIC(10,2),
  expiry_date    TEXT,                                                    -- 레거시 텍스트
  expiry_date_d  DATE,                                                    -- DATE 타입
  lot_number     TEXT,
  asset_type     TEXT,
  memo           TEXT,
  extra          JSONB         NOT NULL DEFAULT '{}',
  quantity       NUMERIC(15,4) NOT NULL DEFAULT 0,                        -- 레거시 캐시 (item_stocks로 대체 예정)
  created_at     TIMESTAMPTZ   DEFAULT now(),
  updated_at     TIMESTAMPTZ   DEFAULT now(),
  UNIQUE(user_id, item_name)
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE items ADD COLUMN IF NOT EXISTS spec           TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS color          TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS asset_type     TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS expiry_date_d  DATE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS warehouse_id   UUID REFERENCES warehouses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_user        ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_category    ON items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_items_warehouse   ON items(user_id, warehouse);
CREATE INDEX IF NOT EXISTS idx_items_warehouse_id ON items(user_id, warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_vendor      ON items(user_id, vendor);
CREATE INDEX IF NOT EXISTS idx_items_name        ON items(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_items_name_text   ON items(user_id, item_name text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_items_cat_name    ON items(user_id, category, item_name)
  INCLUDE (quantity, unit_price, min_stock);
CREATE INDEX IF NOT EXISTS idx_items_expiry      ON items(user_id, expiry_date_d) WHERE expiry_date_d IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_low_stock   ON items(user_id) WHERE quantity <= min_stock;

-- ============================================================
-- 6. 창고별 현재고 캐시 (item_stocks) — 재고 SoT
-- transactions / transfers INSERT·UPDATE·DELETE 시 트리거 자동 갱신
-- ============================================================
CREATE TABLE IF NOT EXISTS item_stocks (
  item_id         UUID          NOT NULL REFERENCES items(id)      ON DELETE CASCADE,
  warehouse_id    UUID          NOT NULL REFERENCES warehouses(id)  ON DELETE RESTRICT,
  user_id         UUID          NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  quantity        NUMERIC(15,4) NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_item_stocks_user_item ON item_stocks(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_item_stocks_user_wh   ON item_stocks(user_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_item_stocks_zero      ON item_stocks(user_id, item_id)
  WHERE quantity <= 0;

-- ============================================================
-- 7. 안전재고 (safety_stocks)
-- 기존 user_settings.key='safetyStock' JSON을 정규화
-- ============================================================
CREATE TABLE IF NOT EXISTS safety_stocks (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  item_id      UUID          NOT NULL REFERENCES items(id)     ON DELETE CASCADE,
  warehouse_id UUID          REFERENCES warehouses(id)         ON DELETE CASCADE, -- NULL = 전체 창고 통합
  min_qty      NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT uq_safety_stock UNIQUE NULLS NOT DISTINCT (user_id, item_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_safety_stocks_user_item ON safety_stocks(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_safety_stocks_item_wh   ON safety_stocks(item_id, warehouse_id);

-- ============================================================
-- 8. 거래처 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  type         TEXT,       -- 'supplier' | 'customer' | 'both'
  biz_number   TEXT,
  ceo_name     TEXT,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  bank_info    TEXT,
  memo         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_user ON vendors(user_id);

-- ============================================================
-- 9. 입출고 이력
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type                 TEXT          NOT NULL CHECK (type IN ('in', 'out', 'loss', 'adjust')),
  item_id              UUID          REFERENCES items(id)      ON DELETE SET NULL,  -- 전환 완료 후 NOT NULL
  item_name            TEXT          NOT NULL,                                       -- 비정규화 사본 (수불대장용)
  item_code            TEXT,
  quantity             NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_price           NUMERIC(15,2) NOT NULL DEFAULT 0,
  supply_value         NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  selling_price        NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_selling_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  spec                 TEXT,
  unit                 TEXT,
  category             TEXT,
  color                TEXT,
  date                 TEXT,         -- 레거시 텍스트
  txn_date             DATE,         -- DATE 타입 (인덱스·집계 대상)
  vendor               TEXT,         -- 비정규화 사본 (수불대장용, 거래처명 변경 이력 보존)
  vendor_id            UUID          REFERENCES vendors(id)    ON DELETE SET NULL,
  warehouse            TEXT,         -- 레거시 텍스트
  warehouse_id         UUID          REFERENCES warehouses(id) ON DELETE SET NULL,
  note                 TEXT,
  created_at           TIMESTAMPTZ   DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS item_id              UUID          REFERENCES items(id)      ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS txn_date             DATE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id            UUID          REFERENCES vendors(id)    ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS warehouse_id         UUID          REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS selling_price        NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS actual_selling_price NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS spec                 TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit                 TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category             TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS color                TEXT;

CREATE INDEX IF NOT EXISTS idx_tx_user         ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_txn_date     ON transactions(user_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_date         ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_item         ON transactions(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_tx_item_id      ON transactions(item_id, user_id)        WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_item_date    ON transactions(item_id, user_id, txn_date DESC) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_warehouse_id ON transactions(user_id, warehouse_id, txn_date DESC) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_vendor_id    ON transactions(vendor_id)                WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tx_composite    ON transactions(user_id, date DESC, type);
CREATE INDEX IF NOT EXISTS idx_tx_analysis     ON transactions(user_id, type, date DESC, category)
  INCLUDE (total_amount);

-- ============================================================
-- 10. 창고 간 이동
-- ============================================================
CREATE TABLE IF NOT EXISTS transfers (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id          UUID          REFERENCES items(id)      ON DELETE SET NULL,      -- 전환 완료 후 NOT NULL
  item_name        TEXT,         -- 비정규화 사본
  item_code        TEXT,
  from_warehouse   TEXT,         -- 레거시 텍스트
  to_warehouse     TEXT,         -- 레거시 텍스트
  from_warehouse_id UUID         REFERENCES warehouses(id) ON DELETE RESTRICT,
  to_warehouse_id  UUID          REFERENCES warehouses(id) ON DELETE RESTRICT,
  quantity         NUMERIC(15,4) NOT NULL DEFAULT 0,
  date             TEXT,         -- 레거시 텍스트
  date_d           DATE,
  note             TEXT,
  created_at       TIMESTAMPTZ   DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS item_id           UUID  REFERENCES items(id)      ON DELETE SET NULL;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS item_name         TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS item_code         TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS from_warehouse_id UUID  REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS to_warehouse_id   UUID  REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS date_d            DATE;

CREATE INDEX IF NOT EXISTS idx_transfers_user     ON transfers(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_date     ON transfers(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_date_d   ON transfers(user_id, date_d DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_item_id  ON transfers(item_id)           WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_from_wh  ON transfers(from_warehouse_id) WHERE from_warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfers_to_wh    ON transfers(to_warehouse_id)   WHERE to_warehouse_id IS NOT NULL;

-- ============================================================
-- 11. 재고 실사 헤더
-- ============================================================
CREATE TABLE IF NOT EXISTS stocktakes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date         TEXT,
  date_d       DATE,
  inspector    TEXT,
  adjust_count INTEGER     NOT NULL DEFAULT 0,
  total_items  INTEGER     NOT NULL DEFAULT 0,
  details      JSONB       DEFAULT '[]',  -- 레거시 (신규는 stocktake_items 사용)
  status       TEXT        NOT NULL DEFAULT 'draft', -- draft | confirmed
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE stocktakes ADD COLUMN IF NOT EXISTS date_d       DATE;
ALTER TABLE stocktakes ADD COLUMN IF NOT EXISTS adjust_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stocktakes ADD COLUMN IF NOT EXISTS total_items  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stocktakes ADD COLUMN IF NOT EXISTS status       TEXT    NOT NULL DEFAULT 'draft';

-- ============================================================
-- 12. 재고 실사 라인 아이템
-- ============================================================
CREATE TABLE IF NOT EXISTS stocktake_items (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  stocktake_id UUID          NOT NULL REFERENCES stocktakes(id)  ON DELETE CASCADE,
  item_id      UUID          REFERENCES items(id)                ON DELETE SET NULL,
  item_name    TEXT          NOT NULL,                            -- 비정규화 사본
  warehouse_id UUID          REFERENCES warehouses(id)           ON DELETE SET NULL,
  system_qty   NUMERIC(15,4) NOT NULL DEFAULT 0,                 -- item_stocks 기준 시스템 재고
  actual_qty   NUMERIC(15,4) NOT NULL DEFAULT 0,                 -- 실사 수량
  diff_qty     NUMERIC(15,4) GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
  unit_price   NUMERIC(15,2) NOT NULL DEFAULT 0,                 -- 차이금액 계산용
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_sti_stocktake     ON stocktake_items(stocktake_id);
CREATE INDEX IF NOT EXISTS idx_sti_item_id       ON stocktake_items(item_id)      WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sti_warehouse     ON stocktake_items(warehouse_id) WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sti_user_stocktake ON stocktake_items(user_id, stocktake_id);

-- ============================================================
-- 13. 감사 로그
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,  -- 탈퇴 후 익명화 보존
  action     TEXT        NOT NULL,
  target     TEXT,
  detail     TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(user_id, action, created_at DESC);

-- ============================================================
-- 14. 매출/매입 장부
-- ============================================================
CREATE TABLE IF NOT EXISTS account_entries (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type        TEXT          CHECK (type IN ('receivable', 'payable')),
  vendor      TEXT,
  vendor_id   UUID          REFERENCES vendors(id) ON DELETE SET NULL,
  description TEXT,
  amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  due_date    TEXT,
  status      TEXT          DEFAULT 'pending',
  paid_date   TEXT,
  memo        TEXT,
  created_at  TIMESTAMPTZ   DEFAULT now(),
  updated_at  TIMESTAMPTZ   DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE account_entries ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE account_entries ADD COLUMN IF NOT EXISTS memo      TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_user       ON account_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_vendor_id  ON account_entries(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_type_status ON account_entries(user_id, type, status)
  INCLUDE (amount);

-- ============================================================
-- 15. 발주서
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor         TEXT,
  vendor_id      UUID          REFERENCES vendors(id) ON DELETE SET NULL,
  status         TEXT          DEFAULT 'draft',
  items          JSONB         DEFAULT '[]',     -- 레거시 (purchase_order_items로 대체)
  total_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  order_date     TEXT,
  order_date_d   DATE,
  expected_date  TEXT,
  expected_date_d DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ   DEFAULT now(),
  updated_at     TIMESTAMPTZ   DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_id       UUID REFERENCES vendors(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_date_d    DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date   TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date_d DATE;

CREATE INDEX IF NOT EXISTS idx_po_vendor_id ON purchase_orders(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_status    ON purchase_orders(user_id, status, order_date DESC)
  WHERE status != 'completed';

-- ============================================================
-- 16. 발주서 라인 아이템 (purchase_orders.items JSONB 정규화)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  order_id     UUID          NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id      UUID          REFERENCES items(id)                   ON DELETE SET NULL,
  item_name    TEXT          NOT NULL,
  quantity     NUMERIC(15,4) NOT NULL DEFAULT 0,
  unit_price   NUMERIC(15,2) NOT NULL DEFAULT 0,
  received_qty NUMERIC(15,4) NOT NULL DEFAULT 0,
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_item  ON purchase_order_items(item_id) WHERE item_id IS NOT NULL;

-- ============================================================
-- 17. POS 매출
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_sales (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sale_date    TEXT,
  sale_date_d  DATE,
  store        TEXT,
  category     TEXT,
  item_name    TEXT,
  quantity     NUMERIC(15,4) NOT NULL DEFAULT 0,
  amount       NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  net_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_date_d DATE;

CREATE INDEX IF NOT EXISTS idx_pos_user ON pos_sales(user_id, sale_date DESC);

-- ============================================================
-- 18. 커스텀 필드 정의
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_fields (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_key  TEXT        NOT NULL,
  label      TEXT        NOT NULL,
  field_type TEXT        DEFAULT 'text',
  options    JSONB,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, field_key)
);

-- ============================================================
-- 19. 사용자 설정 (key-value)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   JSONB,
  PRIMARY KEY (user_id, key)
);

-- ============================================================
-- 20. 팀 워크스페이스 (team_workspaces)
-- NOTE: 기존 데이터 호환성 문제로 별도 마이그레이션 관리
--       supabase/migrations/20260429_add_team_workspaces.sql 참고
-- ============================================================
-- (생략 - 별도 마이그레이션으로 관리)

-- ============================================================
-- 22. 부서 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  parent_id  UUID        REFERENCES departments(id) ON DELETE SET NULL,
  manager    TEXT,
  sort_order INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_user ON departments(user_id);

-- ============================================================
-- 23. 직원 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  emp_no            TEXT          NOT NULL,
  name              TEXT          NOT NULL,
  dept              TEXT,
  department_id     UUID          REFERENCES departments(id)         ON DELETE SET NULL,
  position          TEXT,
  hire_date         DATE          NOT NULL,
  resign_date       DATE,
  rrn_enc           BYTEA,                   -- 주민번호 AES 암호화
  rrn_mask          TEXT,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  bank              TEXT,
  account_no        TEXT,                    -- 레거시 (account_no_enc로 전환 예정)
  account_no_enc    BYTEA,                   -- 계좌번호 AES 암호화
  account_no_mask   TEXT,
  base_salary       NUMERIC(12,0) NOT NULL DEFAULT 0,
  hourly_wage       NUMERIC(10,0) NOT NULL DEFAULT 0,
  employment_type   TEXT          DEFAULT '정규직',
  insurance_flags   JSONB         DEFAULT '{"np":true,"hi":true,"ei":true,"wc":true}',
  dependents        INTEGER       DEFAULT 0,
  children          INTEGER       DEFAULT 0,
  annual_leave_total NUMERIC(4,1) DEFAULT 15,
  annual_leave_used  NUMERIC(4,1) DEFAULT 0,
  memo              TEXT,
  status            TEXT          DEFAULT 'active',   -- active | resigned
  created_at        TIMESTAMPTZ   DEFAULT now(),
  updated_at        TIMESTAMPTZ   DEFAULT now(),
  UNIQUE(user_id, emp_no)
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emp_no            TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS dept              TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id     UUID REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rrn_enc           BYTEA;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS rrn_mask          TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_no_enc    BYTEA;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_no_mask   TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_wage       NUMERIC(10,0) NOT NULL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type   TEXT DEFAULT '정규직';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS insurance_flags   JSONB DEFAULT '{"np":true,"hi":true,"ei":true,"wc":true}';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS dependents        INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS children          INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_total NUMERIC(4,1) DEFAULT 15;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_used  NUMERIC(4,1) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_emp_user       ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_dept       ON employees(user_id, dept);
CREATE INDEX IF NOT EXISTS idx_emp_status     ON employees(user_id, status);
CREATE INDEX IF NOT EXISTS idx_emp_department ON employees(department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_emp_active     ON employees(user_id, name) WHERE status = 'active';

-- ============================================================
-- 24. 근태 기록
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  employee_id  UUID        REFERENCES employees(id)           ON DELETE CASCADE,
  work_date    DATE        NOT NULL,
  check_in     TIME,
  check_out    TIME,
  break_min    INTEGER     DEFAULT 0,
  work_min     INTEGER     DEFAULT 0,
  overtime_min INTEGER     DEFAULT 0,
  night_min    INTEGER     DEFAULT 0,
  holiday_min  INTEGER     DEFAULT 0,
  status       TEXT        DEFAULT '정상',
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, employee_id, work_date)
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS break_min    INTEGER DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS night_min    INTEGER DEFAULT 0;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS holiday_min  INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_att_user      ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_att_month     ON attendance(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_att_emp       ON attendance(employee_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_att_emp_month ON attendance(user_id, employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_att_date_range ON attendance(user_id, work_date, employee_id)
  INCLUDE (work_min, overtime_min, status);

-- ============================================================
-- 25. 급여 기록
-- ============================================================
CREATE TABLE IF NOT EXISTS payrolls (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID          NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  employee_id  UUID          REFERENCES employees(id)           ON DELETE CASCADE,
  pay_year     INTEGER       NOT NULL,
  pay_month    INTEGER       NOT NULL,
  base         NUMERIC(12,0) NOT NULL DEFAULT 0,
  allowances   JSONB         DEFAULT '{}',
  overtime_pay NUMERIC(12,0) NOT NULL DEFAULT 0,
  night_pay    NUMERIC(12,0) NOT NULL DEFAULT 0,
  holiday_pay  NUMERIC(12,0) NOT NULL DEFAULT 0,
  gross        NUMERIC(12,0) NOT NULL DEFAULT 0,
  np           NUMERIC(10,0) NOT NULL DEFAULT 0,
  hi           NUMERIC(10,0) NOT NULL DEFAULT 0,
  ltc          NUMERIC(10,0) NOT NULL DEFAULT 0,
  ei           NUMERIC(10,0) NOT NULL DEFAULT 0,
  income_tax   NUMERIC(10,0) NOT NULL DEFAULT 0,
  local_tax    NUMERIC(10,0) NOT NULL DEFAULT 0,
  other_deduct JSONB         DEFAULT '{}',
  total_deduct NUMERIC(12,0) NOT NULL DEFAULT 0,
  net          NUMERIC(12,0) NOT NULL DEFAULT 0,
  status       TEXT          DEFAULT '초안',     -- 초안 | 확정 | 지급
  paid_at      TIMESTAMPTZ,
  confirmed_by UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  issue_no     TEXT,
  memo         TEXT,
  created_at   TIMESTAMPTZ   DEFAULT now(),
  updated_at   TIMESTAMPTZ   DEFAULT now(),
  UNIQUE(user_id, pay_year, pay_month, employee_id)
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS ltc          NUMERIC(10,0) NOT NULL DEFAULT 0;
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS other_deduct JSONB         DEFAULT '{}';
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS confirmed_by UUID          REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS issue_no     TEXT;
ALTER TABLE payrolls ADD COLUMN IF NOT EXISTS memo         TEXT;

CREATE INDEX IF NOT EXISTS idx_payroll_user   ON payrolls(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payrolls(user_id, pay_year, pay_month);
CREATE INDEX IF NOT EXISTS idx_payroll_emp    ON payrolls(employee_id, pay_year, pay_month);
CREATE INDEX IF NOT EXISTS idx_payroll_status ON payrolls(user_id, status);

-- ============================================================
-- 26. 휴가
-- ============================================================
CREATE TABLE IF NOT EXISTS leaves (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES profiles(id)   ON DELETE CASCADE,
  employee_id UUID          REFERENCES employees(id)           ON DELETE CASCADE,
  leave_type  TEXT,
  start_date  DATE,
  end_date    DATE,
  days        NUMERIC(4,1)  DEFAULT 1,
  reason      TEXT,
  status      TEXT          DEFAULT '신청',   -- 신청 | 승인 | 반려
  approved_by UUID          REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_user   ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_emp    ON leaves(employee_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leaves(user_id, status, start_date DESC);

-- ============================================================
-- 27. 수당·공제 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS salary_items (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code       TEXT,
  name       TEXT          NOT NULL,
  kind       TEXT          DEFAULT '수당',   -- 수당 | 공제
  calc_type  TEXT          DEFAULT '정액',  -- 정액 | 정률 | 시간
  amount     NUMERIC(15,2) NOT NULL DEFAULT 0,
  rate       NUMERIC(10,4) NOT NULL DEFAULT 0,
  taxable    BOOLEAN       DEFAULT true,
  active     BOOLEAN       DEFAULT true,
  sort_order INTEGER       DEFAULT 0,
  created_at TIMESTAMPTZ   DEFAULT now()
);

-- 기존 DB 호환: 신규 컬럼 추가 (이미 있으면 무시)
ALTER TABLE salary_items ADD COLUMN IF NOT EXISTS code   TEXT;
ALTER TABLE salary_items ADD COLUMN IF NOT EXISTS kind   TEXT DEFAULT '수당';
ALTER TABLE salary_items ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_salary_items_user ON salary_items(user_id);

-- ============================================================
-- 28. RLS (Row Level Security)
-- ============================================================
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_stocks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_stocks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktakes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees         ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls          ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves            ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_items      ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_select"       ON profiles;
CREATE POLICY "profiles_select"       ON profiles FOR SELECT  USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  USING (auth.jwt()->>'email' IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr'));
DROP POLICY IF EXISTS "profiles_insert"       ON profiles;
CREATE POLICY "profiles_insert"       ON profiles FOR INSERT  WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_update"       ON profiles;
CREATE POLICY "profiles_update"       ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()));

-- 단순 user_id 기반 (FOR ALL)
DROP POLICY IF EXISTS "warehouses_all"     ON warehouses;
CREATE POLICY "warehouses_all"     ON warehouses     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "items_all"          ON items;
CREATE POLICY "items_all"          ON items          FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "item_stocks_all"    ON item_stocks;
CREATE POLICY "item_stocks_all"    ON item_stocks    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "safety_stocks_all"  ON safety_stocks;
CREATE POLICY "safety_stocks_all"  ON safety_stocks  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "vendors_all"        ON vendors;
CREATE POLICY "vendors_all"        ON vendors        FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "tx_all"             ON transactions;
CREATE POLICY "tx_all"             ON transactions   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "transfers_all"      ON transfers;
CREATE POLICY "transfers_all"      ON transfers      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "stocktakes_all"     ON stocktakes;
CREATE POLICY "stocktakes_all"     ON stocktakes     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "sti_all"            ON stocktake_items;
CREATE POLICY "sti_all"            ON stocktake_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "accounts_all"       ON account_entries;
CREATE POLICY "accounts_all"       ON account_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "orders_all"         ON purchase_orders;
CREATE POLICY "orders_all"         ON purchase_orders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "poi_all"            ON purchase_order_items;
CREATE POLICY "poi_all"            ON purchase_order_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "pos_all"            ON pos_sales;
CREATE POLICY "pos_all"            ON pos_sales      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "fields_all"         ON custom_fields;
CREATE POLICY "fields_all"         ON custom_fields  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "settings_all"       ON user_settings;
CREATE POLICY "settings_all"       ON user_settings  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "departments_all"    ON departments;
CREATE POLICY "departments_all"    ON departments    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "employees_all"      ON employees;
CREATE POLICY "employees_all"      ON employees      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "attendance_all"     ON attendance;
CREATE POLICY "attendance_all"     ON attendance     FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "leaves_all"         ON leaves;
CREATE POLICY "leaves_all"         ON leaves         FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "salary_items_all"   ON salary_items;
CREATE POLICY "salary_items_all"   ON salary_items   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- audit_logs: INSERT + SELECT 분리 (UPDATE/DELETE 차단 — 감사로그 변조 방지)
DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "audit_select" ON audit_logs;
CREATE POLICY "audit_select" ON audit_logs FOR SELECT USING (auth.uid() = user_id);

-- payrolls: 역할 기반 UPDATE/DELETE 제한
DROP POLICY IF EXISTS "payrolls_select" ON payrolls;
CREATE POLICY "payrolls_select" ON payrolls FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "payrolls_insert" ON payrolls;
CREATE POLICY "payrolls_insert" ON payrolls FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "payrolls_update" ON payrolls;
CREATE POLICY "payrolls_update" ON payrolls FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND (
      status = (SELECT p.status FROM payrolls p WHERE p.id = payrolls.id LIMIT 1)
      OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('manager', 'admin')
    )
  );
DROP POLICY IF EXISTS "payrolls_delete" ON payrolls;
CREATE POLICY "payrolls_delete" ON payrolls FOR DELETE
  USING (auth.uid() = user_id AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- team_workspaces / workspace_members RLS 정책
-- NOTE: 별도 마이그레이션으로 관리
--       supabase/migrations/20260429_add_team_workspaces.sql 참고

-- ============================================================
-- 29. updated_at 트리거 연결 (updated_at 컬럼이 있는 모든 테이블)
-- ============================================================
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles','items','vendors','account_entries','purchase_orders',
    'employees','payrolls','warehouses','safety_stocks'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 30. 이메일로 프로필 조회 RPC (팀 초대, 전체 테이블 노출 방지)
-- NOTE: team_workspaces RPC 함수는 별도 마이그레이션으로 관리
--       supabase/migrations/20260429_add_team_workspaces.sql 참고
-- ============================================================
-- (생략 - 별도 마이그레이션으로 관리)

-- ============================================================
-- 32. 주민번호 / 계좌번호 암호화 RPC
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

CREATE OR REPLACE FUNCTION set_employee_rrn(emp_id UUID, plain TEXT)
RETURNS VOID AS $$
BEGIN
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET rrn_enc = NULL WHERE id = emp_id AND user_id = auth.uid();
  ELSE
    UPDATE employees SET rrn_enc = pgp_sym_encrypt(plain, current_setting('app.rrn_key', true))
     WHERE id = emp_id AND user_id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION decrypt_rrn(emp_id UUID)
RETURNS TEXT AS $$
DECLARE enc_data BYTEA;
BEGIN
  SELECT rrn_enc INTO enc_data FROM employees WHERE id = emp_id AND user_id = auth.uid();
  IF enc_data IS NULL THEN RETURN NULL; END IF;
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'employee.viewRRN', emp_id::text, '주민번호 평문 조회');
  RETURN pgp_sym_decrypt(enc_data, current_setting('app.rrn_key', true));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION set_employee_account_no(emp_id UUID, plain TEXT)
RETURNS VOID AS $$
DECLARE mask TEXT;
BEGIN
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET account_no_enc = NULL, account_no_mask = NULL WHERE id = emp_id AND user_id = auth.uid();
  ELSE
    mask := CASE
      WHEN length(regexp_replace(plain, '[^0-9]', '', 'g')) >= 8
        THEN left(regexp_replace(plain, '[^0-9]', '', 'g'), 4) || '****' || right(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
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
  SELECT account_no_enc INTO enc_data FROM employees WHERE id = emp_id AND user_id = auth.uid();
  IF enc_data IS NULL THEN RETURN NULL; END IF;
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'employee.viewAccountNo', emp_id::text, '계좌번호 평문 조회');
  RETURN pgp_sym_decrypt(enc_data, current_setting('app.rrn_key', true));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION decrypt_account_no(UUID) TO authenticated;

-- ============================================================
-- 33. purchase_orders.total_amount 자동 동기화 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION sync_po_total_amount()
RETURNS TRIGGER AS $$
DECLARE target_order_id UUID;
BEGIN
  target_order_id := COALESCE(NEW.order_id, OLD.order_id);
  UPDATE purchase_orders
     SET total_amount = COALESCE((SELECT SUM(quantity * unit_price) FROM purchase_order_items WHERE order_id = target_order_id), 0),
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
-- 34. 재고 캐시 자동 갱신 트리거 (transactions)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_item_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id      UUID;
  v_warehouse_id UUID;
  v_user_id      UUID;
  v_delta        NUMERIC;
  v_sign         NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_item_id := OLD.item_id; v_warehouse_id := OLD.warehouse_id; v_user_id := OLD.user_id;
  ELSE
    v_item_id := NEW.item_id; v_warehouse_id := NEW.warehouse_id; v_user_id := NEW.user_id;
  END IF;

  IF v_item_id IS NULL OR v_warehouse_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.type = 'adjust' THEN
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (v_item_id, v_warehouse_id, v_user_id, NEW.quantity, now())
        ON CONFLICT (item_id, warehouse_id)
        DO UPDATE SET quantity = NEW.quantity, last_updated_at = now();
      RETURN NEW;
    END IF;
    v_delta := CASE NEW.type WHEN 'in' THEN NEW.quantity WHEN 'out' THEN -NEW.quantity WHEN 'loss' THEN -NEW.quantity ELSE 0 END;
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (v_item_id, v_warehouse_id, v_user_id, GREATEST(0, v_delta), now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET quantity = GREATEST(0, item_stocks.quantity + v_delta), last_updated_at = now();

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.item_id IS DISTINCT FROM NEW.item_id OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id THEN
      IF OLD.item_id IS NOT NULL AND OLD.warehouse_id IS NOT NULL THEN
        v_sign := CASE OLD.type WHEN 'in' THEN -1 WHEN 'out' THEN 1 WHEN 'loss' THEN 1 ELSE 0 END;
        UPDATE item_stocks SET quantity = GREATEST(0, quantity + v_sign * OLD.quantity), last_updated_at = now()
         WHERE item_id = OLD.item_id AND warehouse_id = OLD.warehouse_id;
      END IF;
      v_sign := CASE NEW.type WHEN 'in' THEN 1 WHEN 'out' THEN -1 WHEN 'loss' THEN -1 ELSE 0 END;
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (NEW.item_id, NEW.warehouse_id, v_user_id, GREATEST(0, v_sign * NEW.quantity), now())
        ON CONFLICT (item_id, warehouse_id)
        DO UPDATE SET quantity = GREATEST(0, item_stocks.quantity + v_sign * NEW.quantity), last_updated_at = now();
    ELSE
      v_delta := CASE OLD.type WHEN 'in' THEN -OLD.quantity WHEN 'out' THEN OLD.quantity WHEN 'loss' THEN OLD.quantity ELSE 0 END
               + CASE NEW.type WHEN 'in' THEN NEW.quantity WHEN 'out' THEN -NEW.quantity WHEN 'loss' THEN -NEW.quantity ELSE 0 END;
      UPDATE item_stocks SET quantity = GREATEST(0, quantity + v_delta), last_updated_at = now()
       WHERE item_id = v_item_id AND warehouse_id = v_warehouse_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    v_delta := CASE OLD.type WHEN 'in' THEN -OLD.quantity WHEN 'out' THEN OLD.quantity WHEN 'loss' THEN OLD.quantity ELSE 0 END;
    UPDATE item_stocks SET quantity = GREATEST(0, quantity + v_delta), last_updated_at = now()
     WHERE item_id = v_item_id AND warehouse_id = v_warehouse_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_update_item_stock ON transactions;
CREATE TRIGGER trg_update_item_stock
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock();

-- ============================================================
-- 35. 재고 캐시 자동 갱신 트리거 (transfers)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_item_stock_on_transfer()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.item_id IS NULL OR NEW.from_warehouse_id IS NULL OR NEW.to_warehouse_id IS NULL THEN RETURN NEW; END IF;
    UPDATE item_stocks SET quantity = GREATEST(0, quantity - NEW.quantity), last_updated_at = now()
     WHERE item_id = NEW.item_id AND warehouse_id = NEW.from_warehouse_id;
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (NEW.item_id, NEW.to_warehouse_id, NEW.user_id, NEW.quantity, now())
      ON CONFLICT (item_id, warehouse_id)
      DO UPDATE SET quantity = item_stocks.quantity + NEW.quantity, last_updated_at = now();

  ELSIF TG_OP = 'UPDATE' THEN
    -- OLD 역전
    IF OLD.item_id IS NOT NULL AND OLD.from_warehouse_id IS NOT NULL AND OLD.to_warehouse_id IS NOT NULL THEN
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (OLD.item_id, OLD.from_warehouse_id, OLD.user_id, OLD.quantity, now())
        ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = item_stocks.quantity + OLD.quantity, last_updated_at = now();
      UPDATE item_stocks SET quantity = GREATEST(0, quantity - OLD.quantity), last_updated_at = now()
       WHERE item_id = OLD.item_id AND warehouse_id = OLD.to_warehouse_id;
    END IF;
    -- NEW 적용
    IF NEW.item_id IS NOT NULL AND NEW.from_warehouse_id IS NOT NULL AND NEW.to_warehouse_id IS NOT NULL THEN
      UPDATE item_stocks SET quantity = GREATEST(0, quantity - NEW.quantity), last_updated_at = now()
       WHERE item_id = NEW.item_id AND warehouse_id = NEW.from_warehouse_id;
      INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
        VALUES (NEW.item_id, NEW.to_warehouse_id, NEW.user_id, NEW.quantity, now())
        ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = item_stocks.quantity + NEW.quantity, last_updated_at = now();
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.item_id IS NULL OR OLD.from_warehouse_id IS NULL OR OLD.to_warehouse_id IS NULL THEN RETURN OLD; END IF;
    INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, last_updated_at)
      VALUES (OLD.item_id, OLD.from_warehouse_id, OLD.user_id, OLD.quantity, now())
      ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = item_stocks.quantity + OLD.quantity, last_updated_at = now();
    UPDATE item_stocks SET quantity = GREATEST(0, quantity - OLD.quantity), last_updated_at = now()
     WHERE item_id = OLD.item_id AND warehouse_id = OLD.to_warehouse_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_update_stock_on_transfer ON transfers;
CREATE TRIGGER trg_update_stock_on_transfer
  AFTER INSERT OR UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock_on_transfer();

-- ============================================================
-- 36. 재고 전체 재계산 함수 (불일치 복구용)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_recalculate_item_stocks(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '인증이 필요합니다.'; END IF;
  IF target_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION '본인 데이터만 재계산할 수 있습니다.'; END IF;

  DELETE FROM item_stocks WHERE user_id = target_user_id;

  -- transactions 기반 (adjust 제외)
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT item_id, warehouse_id, target_user_id,
    GREATEST(0, SUM(CASE WHEN type='in' THEN quantity WHEN type IN ('out','loss') THEN -quantity ELSE 0 END)),
    now()
  FROM transactions
  WHERE user_id = target_user_id AND item_id IS NOT NULL AND warehouse_id IS NOT NULL AND type != 'adjust'
  GROUP BY item_id, warehouse_id
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated_at = now();

  -- adjust: 가장 최근 값으로 덮어씀
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT DISTINCT ON (item_id, warehouse_id) item_id, warehouse_id, target_user_id, quantity, now()
  FROM transactions
  WHERE user_id = target_user_id AND item_id IS NOT NULL AND warehouse_id IS NOT NULL AND type = 'adjust'
  ORDER BY item_id, warehouse_id, txn_date DESC NULLS LAST, created_at DESC
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated_at = now();

  -- transfers from 차감
  UPDATE item_stocks ist SET
    quantity = GREATEST(0, ist.quantity - sub.out_qty), last_updated_at = now()
  FROM (
    SELECT item_id, from_warehouse_id AS warehouse_id, SUM(quantity) AS out_qty
    FROM transfers WHERE user_id = target_user_id AND item_id IS NOT NULL AND from_warehouse_id IS NOT NULL
    GROUP BY item_id, from_warehouse_id
  ) sub
  WHERE ist.item_id = sub.item_id AND ist.warehouse_id = sub.warehouse_id;

  -- transfers to 증가
  INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
  SELECT item_id, to_warehouse_id, target_user_id, SUM(quantity), now()
  FROM transfers WHERE user_id = target_user_id AND item_id IS NOT NULL AND to_warehouse_id IS NOT NULL
  GROUP BY item_id, to_warehouse_id
  ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = item_stocks.quantity + EXCLUDED.quantity, last_updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

GRANT EXECUTE ON FUNCTION fn_recalculate_item_stocks(UUID) TO authenticated;

-- ============================================================
-- 37. 감사 트리거 (급여 상태변경 / 직원 삭제 / 역할 변경)
-- ============================================================
CREATE OR REPLACE FUNCTION audit_payroll_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (auth.uid(), 'payroll.statusChange', NEW.id::text,
      format('급여 상태: %s → %s (%s년 %s월)', OLD.status, NEW.status, NEW.pay_year, NEW.pay_month),
      (SELECT email FROM profiles WHERE id = auth.uid()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_payroll ON payrolls;
CREATE TRIGGER trg_audit_payroll
  AFTER UPDATE ON payrolls FOR EACH ROW EXECUTE FUNCTION audit_payroll_status_change();

CREATE OR REPLACE FUNCTION audit_employee_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(user_id, action, target, detail, user_email)
  VALUES (auth.uid(), 'employee.delete', OLD.id::text,
    format('직원 삭제: %s (사번: %s)', OLD.name, OLD.emp_no),
    (SELECT email FROM profiles WHERE id = auth.uid()));
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_employee_delete ON employees;
CREATE TRIGGER trg_audit_employee_delete
  BEFORE DELETE ON employees FOR EACH ROW EXECUTE FUNCTION audit_employee_delete();

CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (auth.uid(), 'profile.roleChange', NEW.id::text,
      format('역할 변경: %s → %s (%s)', OLD.role, NEW.role, NEW.email),
      (SELECT email FROM profiles WHERE id = auth.uid()));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
CREATE TRIGGER trg_audit_profile_role
  AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION audit_profile_role_change();

-- ============================================================
-- 38. 뷰 — 수불대장 (v_ledger)
-- ============================================================
CREATE OR REPLACE VIEW v_ledger AS
SELECT
  t.id, t.user_id,
  t.txn_date,
  t.date                      AS date_text,
  t.type,
  t.item_id,
  t.item_name,
  t.item_code,
  t.category, t.spec, t.color, t.unit,
  t.quantity, t.unit_price,
  t.selling_price, t.actual_selling_price,
  t.supply_value, t.vat, t.total_amount,
  t.vendor                    AS vendor_name_at_txn,   -- 거래 당시 거래처명 (불변)
  t.vendor_id,
  v.name                      AS vendor_name_current,
  t.warehouse                 AS warehouse_name_at_txn, -- 거래 당시 창고명 (불변)
  t.warehouse_id,
  w.name                      AS warehouse_name_current,
  ist.quantity                AS current_stock,
  t.note, t.created_at
FROM transactions t
LEFT JOIN vendors     v   ON v.id   = t.vendor_id
LEFT JOIN warehouses  w   ON w.id   = t.warehouse_id
LEFT JOIN item_stocks ist ON ist.item_id = t.item_id AND ist.warehouse_id = t.warehouse_id;

-- ============================================================
-- 39. 뷰 — 안전재고 미달 알람 (v_low_stock_alert)
-- ============================================================
CREATE OR REPLACE VIEW v_low_stock_alert AS
SELECT
  ss.user_id, ss.item_id,
  i.item_name, i.item_code, i.category,
  ss.warehouse_id,
  w.name                                        AS warehouse_name,
  ss.min_qty                                    AS safety_qty,
  COALESCE(agg.total_qty, 0)                    AS current_qty,
  ss.min_qty - COALESCE(agg.total_qty, 0)       AS shortage
FROM safety_stocks ss
JOIN items i ON i.id = ss.item_id
LEFT JOIN warehouses w ON w.id = ss.warehouse_id
LEFT JOIN (
  SELECT ist.item_id, ss2.id AS safety_stock_id,
    SUM(CASE WHEN ss2.warehouse_id IS NULL OR ist.warehouse_id = ss2.warehouse_id
             THEN ist.quantity ELSE 0 END) AS total_qty
  FROM item_stocks ist
  JOIN safety_stocks ss2 ON ss2.item_id = ist.item_id
  GROUP BY ist.item_id, ss2.id
) agg ON agg.safety_stock_id = ss.id
WHERE COALESCE(agg.total_qty, 0) < ss.min_qty;

-- ============================================================
-- 40. Materialized View (재고 요약, 월별 손익)
-- REFRESH: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_summary;
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS mv_inventory_summary;
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_inventory_summary AS
SELECT
  i.user_id, i.id AS item_id, i.item_name, i.category, i.warehouse,
  COALESCE(SUM(ist.quantity), i.quantity, 0)   AS quantity,
  i.unit_price, i.min_stock,
  CASE WHEN i.min_stock IS NOT NULL AND COALESCE(SUM(ist.quantity), i.quantity, 0) <= i.min_stock
       THEN true ELSE false END                AS is_low_stock,
  COUNT(DISTINCT t.id)                         AS tx_count_90d,
  MAX(t.txn_date)                              AS last_tx_date
FROM items i
LEFT JOIN item_stocks ist ON ist.item_id = i.id
LEFT JOIN transactions t  ON t.item_id  = i.id AND t.txn_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY i.id, i.user_id, i.item_name, i.category, i.warehouse, i.unit_price, i.min_stock, i.quantity
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS mv_inventory_summary_pk ON mv_inventory_summary(user_id, item_id);

DROP MATERIALIZED VIEW IF EXISTS mv_monthly_profit;
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
-- 41. Supabase Realtime 활성화
-- ============================================================
ALTER TABLE items             REPLICA IDENTITY FULL;
ALTER TABLE transactions      REPLICA IDENTITY FULL;
ALTER TABLE vendors           REPLICA IDENTITY FULL;
ALTER TABLE transfers         REPLICA IDENTITY FULL;
ALTER TABLE account_entries   REPLICA IDENTITY FULL;
ALTER TABLE purchase_orders   REPLICA IDENTITY FULL;
ALTER TABLE stocktakes        REPLICA IDENTITY FULL;
ALTER TABLE user_settings     REPLICA IDENTITY FULL;
ALTER TABLE profiles          REPLICA IDENTITY FULL;

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
-- 42. 기존 데이터 백필 (새 DB면 건너뜀 — IF NOT EXISTS 없어도 무해)
-- ============================================================

-- 모든 UPDATE 백필을 DO 블록으로 감싸서 에러 방지
DO $$ BEGIN
  UPDATE items i SET warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = i.user_id AND w.name = i.warehouse AND i.warehouse_id IS NULL AND i.warehouse IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE items SET expiry_date_d = expiry_date::DATE
   WHERE expiry_date_d IS NULL AND expiry_date ~ '^\d{4}-\d{2}-\d{2}$';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transactions SET txn_date = date::DATE
   WHERE txn_date IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transactions t SET warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = t.user_id AND w.name = t.warehouse AND t.warehouse_id IS NULL AND t.warehouse IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transactions t SET vendor_id = v.id
    FROM vendors v
   WHERE v.user_id = t.user_id AND v.name = t.vendor AND t.vendor_id IS NULL AND t.vendor IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transfers SET date_d = date::DATE
   WHERE date_d IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transfers tr SET item_id = i.id
    FROM items i
   WHERE i.user_id = tr.user_id AND i.item_name = tr.item_name AND tr.item_id IS NULL AND tr.item_name IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transfers tr SET from_warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = tr.user_id AND w.name = tr.from_warehouse AND tr.from_warehouse_id IS NULL AND tr.from_warehouse IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE transfers tr SET to_warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = tr.user_id AND w.name = tr.to_warehouse AND tr.to_warehouse_id IS NULL AND tr.to_warehouse IS NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE purchase_orders po SET vendor_id = v.id
    FROM vendors v WHERE v.user_id = po.user_id AND v.name = po.vendor AND po.vendor_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE purchase_orders SET order_date_d = order_date::DATE WHERE order_date_d IS NULL AND order_date ~ '^\d{4}-\d{2}-\d{2}$';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE purchase_orders SET expected_date_d = expected_date::DATE WHERE expected_date_d IS NULL AND expected_date ~ '^\d{4}-\d{2}-\d{2}$';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE account_entries ae SET vendor_id = v.id
    FROM vendors v WHERE v.user_id = ae.user_id AND v.name = ae.vendor AND ae.vendor_id IS NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  UPDATE pos_sales SET sale_date_d = sale_date::DATE WHERE sale_date_d IS NULL AND sale_date ~ '^\d{4}-\d{2}-\d{2}$';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- item_stocks 초기 백필 (기존 transactions 기반)
INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
SELECT item_id, warehouse_id, user_id,
  GREATEST(0, SUM(CASE WHEN type='in' THEN quantity WHEN type IN ('out','loss') THEN -quantity ELSE 0 END)),
  now()
FROM transactions
WHERE item_id IS NOT NULL AND warehouse_id IS NOT NULL AND type != 'adjust'
GROUP BY item_id, warehouse_id, user_id
ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated_at = now();

-- adjust: 가장 최근 값으로 덮어씀
INSERT INTO item_stocks (item_id, warehouse_id, user_id, quantity, last_updated_at)
SELECT DISTINCT ON (item_id, warehouse_id) item_id, warehouse_id, user_id, quantity, now()
FROM transactions
WHERE item_id IS NOT NULL AND warehouse_id IS NOT NULL AND type = 'adjust'
ORDER BY item_id, warehouse_id, txn_date DESC NULLS LAST, created_at DESC
ON CONFLICT (item_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity, last_updated_at = now();


-- migrate:down
-- WARNING: Initial schema rollback is destructive.
-- DO NOT EXECUTE without (a) full pg_dump backup, (b) explicit operator confirmation.
-- Manual procedure if absolutely needed:
--   1. pg_dump -Fc postgres > pre_rollback.dump
--   2. DROP SCHEMA public CASCADE; CREATE SCHEMA public;
--   3. (Optional) drop auth schema artefacts created by handle_new_user trigger
DO $do$
BEGIN
  RAISE NOTICE '[INVEX] Initial schema rollback intentionally left as no-op. See db/runbook.md.';
END
$do$;
