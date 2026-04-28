/**
 * INVEX ERP-Lite — Supabase 데이터베이스 스키마
 * 
 * 왜 PostgreSQL?
 * → ERP 데이터는 본질적으로 관계형 (품목↔거래처↔입출고↔회계)
 * → 문서 단위 제한 없이 테이블 구조로 확장 가능
 * → SQL JOIN/집계로 보고서 성능 10배↑
 * 
 * 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체 실행
 */

-- ============================================================
-- 1. 사용자 프로필 (Supabase Auth 확장)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  photo_url TEXT,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('viewer', 'staff', 'manager', 'admin')),
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  industry_template TEXT DEFAULT 'general',
  cost_method TEXT DEFAULT 'weighted-avg',
  currency JSONB DEFAULT '{"code":"KRW","symbol":"₩","rate":1}',
  beginner_mode BOOLEAN DEFAULT true,
  dashboard_mode TEXT DEFAULT 'executive',
  visible_columns TEXT[],
  onboarding_done BOOLEAN DEFAULT false,
  -- 구독 정보
  subscription JSONB DEFAULT '{}',
  payment_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- role 컬럼 보강 (기존 DB 호환)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'viewer';

UPDATE profiles
SET role = 'viewer'
WHERE role IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('viewer', 'staff', 'manager', 'admin'));
  END IF;
END $$;

-- 프로필 자동 생성 트리거: 가입 시 자동으로 profiles 행 생성
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
      WHEN lower(COALESCE(NEW.email, '')) IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr') THEN 'admin'
      ELSE 'viewer'
    END
  );
  RETURN NEW;
END;
-- [HF2] SECURITY DEFINER 함수 search_path 고정 (schema injection 방어)
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- 기존 트리거 삭제 후 재생성 (멱등성)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. 품목 (재고 마스터)
-- 왜 별도 테이블? → 엑셀 업로드 시 수천 행 가능, 문서 제한 없음
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_code TEXT,
  category TEXT,
  quantity NUMERIC DEFAULT 0,
  unit TEXT,
  unit_price NUMERIC DEFAULT 0,
  supply_value NUMERIC DEFAULT 0,
  vat NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  sale_price NUMERIC DEFAULT 0,
  warehouse TEXT,
  location TEXT,
  vendor TEXT,
  min_stock NUMERIC,
  expiry_date TEXT,
  lot_number TEXT,
  memo TEXT,
  -- ▼ 추가 컬럼 (스크린샷 수불 테이블 기준)
  asset_type TEXT,                      -- 자산 구분 (재고자산/소모품/비품 등)
  spec TEXT,                            -- 규격
  -- 커스텀 필드용 유연한 JSON 컬럼
  extra JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- 같은 사용자 내에서 품목명 중복 방지
  UNIQUE(user_id, item_name)
);

-- 품목 검색 성능용 인덱스
CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(user_id, category);
CREATE INDEX IF NOT EXISTS idx_items_warehouse ON items(user_id, warehouse);
CREATE INDEX IF NOT EXISTS idx_items_vendor ON items(user_id, vendor);
CREATE INDEX IF NOT EXISTS idx_items_low_stock ON items(user_id) WHERE quantity <= min_stock;

-- ============================================================
-- 3. 입출고 이력
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  item_name TEXT NOT NULL,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_code TEXT,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  supply_value NUMERIC DEFAULT 0,
  vat NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  selling_price NUMERIC DEFAULT 0,
  actual_selling_price NUMERIC DEFAULT 0,
  spec TEXT,
  unit TEXT,
  category TEXT,
  date TEXT,
  vendor TEXT,
  warehouse TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기존 DB 호환: 컬럼 누락 시 추가
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS supply_value NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vat NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS selling_price NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS actual_selling_price NUMERIC DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_item ON transactions(user_id, item_name);

-- ============================================================
-- 4. 거래처 마스터
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT, -- 'supplier' | 'customer' | 'both'
  biz_number TEXT,
  ceo_name TEXT,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  bank_info TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_vendors_user ON vendors(user_id);

-- ============================================================
-- 5. 창고 간 이동
-- ============================================================
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT,
  from_warehouse TEXT,
  to_warehouse TEXT,
  item_name TEXT,
  quantity NUMERIC DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id);

-- ============================================================
-- 6. 재고 실사
-- ============================================================
CREATE TABLE IF NOT EXISTS stocktakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date TEXT,
  inspector TEXT,
  adjust_count INTEGER DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  details JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. 감사 로그 (변경 추적)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- 탈퇴 후 로그 익명화 보존
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id, created_at DESC);

-- ============================================================
-- 8. 매출/매입 장부
-- ============================================================
CREATE TABLE IF NOT EXISTS account_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('receivable', 'payable')),
  vendor TEXT,
  description TEXT,
  amount NUMERIC DEFAULT 0,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  paid_date TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_user ON account_entries(user_id);

-- ============================================================
-- 9. 발주서
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vendor TEXT,
  status TEXT DEFAULT 'draft',
  items JSONB DEFAULT '[]',
  total_amount NUMERIC DEFAULT 0,
  order_date TEXT,
  expected_date TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 10. POS 매출 데이터
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sale_date TEXT,
  store TEXT,
  category TEXT,
  item_name TEXT,
  quantity NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_user ON pos_sales(user_id, sale_date DESC);

-- ============================================================
-- 11. 커스텀 필드 정의
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',
  options JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, field_key)
);

-- ============================================================
-- 12. 사용자 설정 (key-value 저장소)
-- 왜? → 필터 상태, 정렬 설정 등 구조화하기 애매한 설정들
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB,
  PRIMARY KEY (user_id, key)
);

-- ============================================================
-- 13. Row Level Security (RLS) — 사용자 데이터 격리
-- 왜? → 유저 A가 유저 B의 데이터에 절대 접근 못하게
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 모든 테이블에 동일한 RLS 정책: 자기 데이터만 접근
-- profiles
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT USING (auth.jwt()->>'email' IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr'));
-- 자기 프로필 INSERT (부트스트랩, 이름 변경 upsert 용)
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
-- [HF1] role 자가 에스컬레이션 방지: WITH CHECK으로 role 변경 차단
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
  );

-- items
CREATE POLICY "items_all" ON items FOR ALL USING (auth.uid() = user_id);

-- transactions
CREATE POLICY "tx_all" ON transactions FOR ALL USING (auth.uid() = user_id);

-- vendors
CREATE POLICY "vendors_all" ON vendors FOR ALL USING (auth.uid() = user_id);

-- transfers
CREATE POLICY "transfers_all" ON transfers FOR ALL USING (auth.uid() = user_id);

-- stocktakes
CREATE POLICY "stocktakes_all" ON stocktakes FOR ALL USING (auth.uid() = user_id);

-- audit_logs [HF3] FOR ALL → INSERT + SELECT 분리 (UPDATE/DELETE 차단 — 감사로그 변조 방지)
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "audit_select" ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

-- account_entries
CREATE POLICY "accounts_all" ON account_entries FOR ALL USING (auth.uid() = user_id);

-- purchase_orders
CREATE POLICY "orders_all" ON purchase_orders FOR ALL USING (auth.uid() = user_id);

-- pos_sales
CREATE POLICY "pos_all" ON pos_sales FOR ALL USING (auth.uid() = user_id);

-- custom_fields
CREATE POLICY "fields_all" ON custom_fields FOR ALL USING (auth.uid() = user_id);

-- user_settings
CREATE POLICY "settings_all" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- 팀 초대 전용 RPC: 이메일로 단일 프로필만 조회 (전체 노출 방지)
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
-- 15. 인사·급여·근태 모듈 (HR)
-- 왜 모듈 단위로 묶음? → 재고와 독립적으로 관리/권한/배포 가능
-- ============================================================

-- pgcrypto 확장 (주민번호 AES 암호화용)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 15-1. 직원 마스터
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emp_no TEXT NOT NULL,                           -- 사번
  name TEXT NOT NULL,
  dept TEXT,
  position TEXT,
  hire_date DATE NOT NULL,
  resign_date DATE,
  rrn_enc BYTEA,                                  -- 주민번호 AES 암호화
  rrn_mask TEXT,                                  -- "900101-1******" 표시용
  phone TEXT,
  email TEXT,
  address TEXT,
  bank TEXT,
  account_no TEXT,
  base_salary NUMERIC(12,0) DEFAULT 0,            -- 월 기본급
  hourly_wage NUMERIC(10,0) DEFAULT 0,            -- 시급 (시급제일 때)
  employment_type TEXT DEFAULT '정규직',             -- 정규직/계약직/시급/일용
  insurance_flags JSONB DEFAULT '{"np":true,"hi":true,"ei":true,"wc":true}',
  dependents INTEGER DEFAULT 0,                   -- 부양가족수
  children INTEGER DEFAULT 0,                     -- 20세 이하 자녀
  annual_leave_total NUMERIC(4,1) DEFAULT 15,     -- 연차 부여수
  annual_leave_used  NUMERIC(4,1) DEFAULT 0,      -- 연차 사용수
  memo TEXT,
  status TEXT DEFAULT 'active',                   -- active/resigned
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, emp_no)
);

CREATE INDEX IF NOT EXISTS idx_emp_user ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees(user_id, dept);
CREATE INDEX IF NOT EXISTS idx_emp_status ON employees(user_id, status);

-- 15-2. 일별 근태
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in TIME,
  check_out TIME,
  break_min INTEGER DEFAULT 0,
  work_min INTEGER DEFAULT 0,                     -- 총 근무시간(분)
  overtime_min INTEGER DEFAULT 0,                 -- 연장(8시간 초과)
  night_min INTEGER DEFAULT 0,                    -- 야간(22~06시)
  holiday_min INTEGER DEFAULT 0,                  -- 휴일근무
  status TEXT DEFAULT '정상',                       -- 정상/지각/결근/조퇴/휴가
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_att_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_att_month ON attendance(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance(employee_id, work_date DESC);

-- 15-3. 월별 급여
CREATE TABLE IF NOT EXISTS payrolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  pay_year INTEGER NOT NULL,
  pay_month INTEGER NOT NULL,
  base NUMERIC(12,0) DEFAULT 0,
  allowances JSONB DEFAULT '{}',                  -- {식대:100000, 차량:200000}
  overtime_pay NUMERIC(12,0) DEFAULT 0,
  night_pay NUMERIC(12,0) DEFAULT 0,
  holiday_pay NUMERIC(12,0) DEFAULT 0,
  gross NUMERIC(12,0) DEFAULT 0,                  -- 과세대상 총지급액
  np NUMERIC(10,0) DEFAULT 0,                     -- 국민연금
  hi NUMERIC(10,0) DEFAULT 0,                     -- 건강보험
  ltc NUMERIC(10,0) DEFAULT 0,                    -- 장기요양
  ei NUMERIC(10,0) DEFAULT 0,                     -- 고용보험
  income_tax NUMERIC(10,0) DEFAULT 0,
  local_tax NUMERIC(10,0) DEFAULT 0,
  other_deduct JSONB DEFAULT '{}',
  total_deduct NUMERIC(12,0) DEFAULT 0,
  net NUMERIC(12,0) DEFAULT 0,                    -- 실지급액
  status TEXT DEFAULT '초안',                       -- 초안/확정/지급
  paid_at TIMESTAMPTZ,
  confirmed_by UUID,
  confirmed_at TIMESTAMPTZ,
  issue_no TEXT,                                   -- 전자급여명세서 발급번호
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, pay_year, pay_month, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payroll_user ON payrolls(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payrolls(user_id, pay_year, pay_month);
CREATE INDEX IF NOT EXISTS idx_payroll_emp ON payrolls(employee_id, pay_year, pay_month);

-- 15-4. 휴가
CREATE TABLE IF NOT EXISTS leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT,                                -- 연차/반차/병가/경조/무급
  start_date DATE,
  end_date DATE,
  days NUMERIC(4,1) DEFAULT 1,
  reason TEXT,
  status TEXT DEFAULT '신청',                       -- 신청/승인/반려
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_user ON leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_emp ON leaves(employee_id, start_date DESC);

-- 15-5. 수당·공제 마스터
CREATE TABLE IF NOT EXISTS salary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  kind TEXT DEFAULT '수당',                         -- 수당/공제
  calc_type TEXT DEFAULT '정액',                    -- 정액/정률/시간
  amount NUMERIC DEFAULT 0,
  rate NUMERIC DEFAULT 0,                          -- 정률 계산용
  taxable BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_items_user ON salary_items(user_id);

-- RLS 활성화
ALTER TABLE employees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls     ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves       ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_all"    ON employees    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "attendance_all"   ON attendance   FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "payrolls_all"     ON payrolls     FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "leaves_all"       ON leaves       FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "salary_items_all" ON salary_items FOR ALL USING (auth.uid() = user_id);

-- 주민번호 암호화/복호화 RPC (서버 비밀키 사용 — Supabase Vault)
-- 왜 RPC로? → 클라이언트에 AES 키 노출 방지 + 평문 조회 시 감사로그 기록 강제
-- [HF2] SECURITY DEFINER 함수 3종 search_path 고정 (schema injection 방어)
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

-- 특정 직원의 주민번호 암호화 저장 (insert/update 이후 별도 호출)
-- 왜 분리? → 클라이언트가 bytea를 직접 다루지 않도록
CREATE OR REPLACE FUNCTION set_employee_rrn(emp_id UUID, plain TEXT)
RETURNS VOID AS $$
BEGIN
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET rrn_enc = NULL
     WHERE id = emp_id AND user_id = auth.uid();
  ELSE
    UPDATE employees
       SET rrn_enc = pgp_sym_encrypt(plain, current_setting('app.rrn_key', true))
     WHERE id = emp_id AND user_id = auth.uid();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

CREATE OR REPLACE FUNCTION decrypt_rrn(emp_id UUID)
RETURNS TEXT AS $$
DECLARE
  enc_data BYTEA;
  plain_rrn TEXT;
BEGIN
  SELECT rrn_enc INTO enc_data FROM employees
   WHERE id = emp_id AND user_id = auth.uid();
  IF enc_data IS NULL THEN RETURN NULL; END IF;
  plain_rrn := pgp_sym_decrypt(enc_data, current_setting('app.rrn_key', true));
  -- 평문 조회는 감사로그 자동 기록
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'employee.viewRRN', emp_id::text, '주민번호 평문 조회');
  RETURN plain_rrn;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

-- ============================================================
-- 14. updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_catalog, pg_temp;

-- updated_at 컬럼이 있는 테이블에 트리거 연결
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['profiles', 'items', 'vendors', 'account_entries', 'purchase_orders', 'employees', 'payrolls']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- Supabase Realtime 활성화
-- 여러 브라우저/기기에서 실시간 데이터 동기화를 위해 필요
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

-- supabase_realtime publication에 테이블 추가
DO $$
BEGIN
  -- publication이 없으면 생성, 있으면 테이블만 추가
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
EXCEPTION WHEN OTHERS THEN NULL; -- 이미 추가된 경우 무시
END $$;

-- ============================================================
-- 팀 워크스페이스 (team_workspaces)
-- 여러 브라우저/기기에서 동일한 팀 멤버 목록을 공유하기 위해 필요
-- ============================================================
CREATE TABLE IF NOT EXISTS team_workspaces (
  id TEXT PRIMARY KEY,                        -- 워크스페이스 ID (= 팀장 UID)
  name TEXT DEFAULT 'My Workspace',
  owner_id TEXT NOT NULL,                     -- 팀장 UID
  members JSONB DEFAULT '[]',                 -- [{uid, email, name, role, status, joinedAt}]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_workspaces ENABLE ROW LEVEL SECURITY;

-- 본인 워크스페이스 또는 초대된 워크스페이스만 조회
-- 주의: workspace_members 테이블 생성(섹션 17) 전까지는 owner_id 조건만 동작
CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated USING (
  auth.uid()::text = owner_id
  OR members @> jsonb_build_array(jsonb_build_object('uid', auth.uid()::text))
);
-- 본인 워크스페이스만 생성/수정/삭제 가능
CREATE POLICY "tw_insert" ON team_workspaces FOR INSERT WITH CHECK (auth.uid()::text = owner_id);
CREATE POLICY "tw_update" ON team_workspaces FOR UPDATE USING (auth.uid()::text = owner_id);
CREATE POLICY "tw_delete" ON team_workspaces FOR DELETE USING (auth.uid()::text = owner_id);

-- Realtime 활성화
ALTER TABLE team_workspaces REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE team_workspaces;

-- ============================================================
-- 팀 워크스페이스 atomic RPC — Read-Modify-Write 경쟁 방지
-- SECURITY DEFINER: RLS를 우회해 JSONB 배열 원자적 수정
-- ============================================================

-- 팀장만 멤버 추가 가능
CREATE OR REPLACE FUNCTION workspace_add_member(ws_id TEXT, new_member JSONB)
RETURNS VOID AS $$
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
-- [HF2] search_path 고정
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_add_member(TEXT, JSONB) TO authenticated;

-- 팀장(멤버 제거·초대 취소) 또는 본인(초대 거절·탈퇴) 호출 가능
CREATE OR REPLACE FUNCTION workspace_remove_member(ws_id TEXT, member_uid TEXT)
RETURNS VOID AS $$
DECLARE
  ws_owner TEXT;
  caller   TEXT := auth.uid()::text;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION '워크스페이스를 찾을 수 없습니다.'; END IF;
  IF caller != ws_owner AND caller != member_uid THEN RAISE EXCEPTION '권한이 없습니다.'; END IF;
  IF member_uid = ws_owner THEN RAISE EXCEPTION '팀장은 제거할 수 없습니다.'; END IF;
  UPDATE team_workspaces
    SET members    = COALESCE((
          SELECT jsonb_agg(m)
          FROM jsonb_array_elements(members) m
          WHERE m->>'uid' != member_uid
        ), '[]'::jsonb),
        updated_at = now()
    WHERE id = ws_id;
END;
-- [HF2] search_path 고정
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_remove_member(TEXT, TEXT) TO authenticated;

-- 본인의 초대 상태(active·rejected)만 변경 가능
CREATE OR REPLACE FUNCTION workspace_set_member_status(ws_id TEXT, member_uid TEXT, new_status TEXT)
RETURNS VOID AS $$
DECLARE
  caller TEXT := auth.uid()::text;
BEGIN
  IF caller != member_uid THEN RAISE EXCEPTION '본인의 초대 상태만 변경할 수 있습니다.'; END IF;
  IF new_status NOT IN ('active', 'rejected') THEN RAISE EXCEPTION '유효하지 않은 상태값입니다.'; END IF;
  UPDATE team_workspaces
    SET members    = (
          SELECT jsonb_agg(
            CASE WHEN m->>'uid' = member_uid
              THEN m || jsonb_build_object('status', new_status)
              ELSE m
            END
          )
          FROM jsonb_array_elements(members) m
        ),
        updated_at = now()
    WHERE id = ws_id;
END;
-- [HF2] search_path 고정
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
GRANT EXECUTE ON FUNCTION workspace_set_member_status(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 16. 성능 보강 인덱스 (DB 감사 권고 — 2026-04)
-- ============================================================

-- [PERF-01] transactions 복합 인덱스: type 필터 + 날짜 정렬 최적화
CREATE INDEX IF NOT EXISTS idx_tx_composite
  ON transactions(user_id, date DESC, type);

-- [PERF-02] payrolls 상태별 조회 (급여 확정·지급 현황)
CREATE INDEX IF NOT EXISTS idx_payroll_status
  ON payrolls(user_id, status);

-- [PERF-03] attendance 직원+날짜 복합 (월별 집계)
CREATE INDEX IF NOT EXISTS idx_att_emp_month
  ON attendance(user_id, employee_id, work_date);

-- [PERF-04] leaves 상태별 조회
CREATE INDEX IF NOT EXISTS idx_leave_status
  ON leaves(user_id, status, start_date DESC);

-- ============================================================
-- 17. 워크스페이스 멤버 정규화 (team_workspaces.members JSONB 대체)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES team_workspaces(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'pending', -- pending/active/rejected
  invited_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ,
  UNIQUE(workspace_id, member_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;

-- 워크스페이스 소유자 또는 본인만 조회
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

-- ============================================================
-- 18. 창고 마스터 (items.warehouse TEXT 정규화 기반)
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

-- ============================================================
-- 19. 발주서 라인 아이템 (purchase_orders.items JSONB 정규화)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  received_qty NUMERIC DEFAULT 0, -- 실제 입고 수량 (발주↔입고 연결)
  note TEXT
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poi_all" ON purchase_order_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_poi_order ON purchase_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_item ON purchase_order_items(item_id) WHERE item_id IS NOT NULL;

-- ============================================================
-- 20. 재고 실사 라인 아이템 (stocktakes.details JSONB 정규화)
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

-- ============================================================
-- 21. 성능 보강 인덱스 2차 (DB 설계 리뷰 — 2026-04)
-- ============================================================

-- [PERF-05] transactions: 손익 분석 커버링 인덱스
CREATE INDEX IF NOT EXISTS idx_tx_analysis
  ON transactions(user_id, type, date DESC, category)
  INCLUDE (total_amount);

-- [PERF-06] transactions: item_id 기반 재고 집계 (item_id nullable FK)
CREATE INDEX IF NOT EXISTS idx_tx_item_id
  ON transactions(item_id, user_id)
  WHERE item_id IS NOT NULL;

-- [PERF-07] transactions: warehouse 필터
CREATE INDEX IF NOT EXISTS idx_tx_warehouse
  ON transactions(user_id, warehouse, date DESC)
  WHERE warehouse IS NOT NULL;

-- [PERF-08] items: item_name 검색 (LIKE 'prefix%' 포함)
CREATE INDEX IF NOT EXISTS idx_items_name
  ON items(user_id, item_name);
CREATE INDEX IF NOT EXISTS idx_items_name_text
  ON items(user_id, item_name text_pattern_ops);

-- [PERF-09] items: 카테고리 + 이름 + 핵심 컬럼 커버링
CREATE INDEX IF NOT EXISTS idx_items_cat_name
  ON items(user_id, category, item_name)
  INCLUDE (quantity, unit_price, min_stock);

-- [PERF-10] account_entries: type + status 복합
CREATE INDEX IF NOT EXISTS idx_accounts_type_status
  ON account_entries(user_id, type, status)
  INCLUDE (amount);

-- [PERF-11] purchase_orders: status 필터 (진행 중만)
CREATE INDEX IF NOT EXISTS idx_po_status
  ON purchase_orders(user_id, status, order_date DESC)
  WHERE status != 'completed';

-- [PERF-12] employees: 재직자 전용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_emp_active
  ON employees(user_id, name)
  WHERE status = 'active';

-- [PERF-13] attendance: 전체 직원 월별 집계 (급여 계산)
CREATE INDEX IF NOT EXISTS idx_att_date_range
  ON attendance(user_id, work_date, employee_id)
  INCLUDE (work_min, overtime_min, status);

-- [PERF-14] transfers: 날짜 정렬
CREATE INDEX IF NOT EXISTS idx_transfers_date
  ON transfers(user_id, date DESC);

-- [PERF-15] audit_logs: action 타입 필터
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON audit_logs(user_id, action, created_at DESC);

-- ============================================================
-- 22. 감사 트리거 (고위험 이벤트 자동 기록)
-- ============================================================

-- 급여 상태 변경 감사 (초안→확정→지급)
CREATE OR REPLACE FUNCTION audit_payroll_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (
      auth.uid(),
      'payroll.statusChange',
      NEW.id::text,
      format('급여 상태: %s → %s (%s년 %s월)', OLD.status, NEW.status, NEW.pay_year, NEW.pay_month),
      (SELECT email FROM profiles WHERE id = auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_payroll ON payrolls;
CREATE TRIGGER trg_audit_payroll
  AFTER UPDATE ON payrolls
  FOR EACH ROW EXECUTE FUNCTION audit_payroll_status_change();

-- 직원 삭제 감사
CREATE OR REPLACE FUNCTION audit_employee_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(user_id, action, target, detail, user_email)
  VALUES (
    auth.uid(),
    'employee.delete',
    OLD.id::text,
    format('직원 삭제: %s (사번: %s)', OLD.name, OLD.emp_no),
    (SELECT email FROM profiles WHERE id = auth.uid())
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_employee_delete ON employees;
CREATE TRIGGER trg_audit_employee_delete
  BEFORE DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_employee_delete();

-- 역할(role) 변경 감사
CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (
      auth.uid(),
      'profile.roleChange',
      NEW.id::text,
      format('역할 변경: %s → %s (%s)', OLD.role, NEW.role, NEW.email),
      (SELECT email FROM profiles WHERE id = auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
CREATE TRIGGER trg_audit_profile_role
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_profile_role_change();

-- updated_at 트리거 신규 테이블에 연결
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['warehouses']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;
