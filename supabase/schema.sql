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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
  item_code TEXT,                        -- 상품코드 (비정규화 저장 → 조회 성능)
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  supply_value NUMERIC DEFAULT 0,        -- 공급가액 (unit_price × quantity)
  vat NUMERIC DEFAULT 0,                 -- 부가세 (supply_value × 0.1)
  total_amount NUMERIC DEFAULT 0,        -- 합계금액 (supply_value + vat)
  date TEXT,
  vendor TEXT,
  warehouse TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
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
-- 팀 초대: 인증된 사용자가 이메일로 다른 사용자 프로필 조회 허용
CREATE POLICY "profiles_select_for_invite" ON profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

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

-- audit_logs
CREATE POLICY "audit_all" ON audit_logs FOR ALL USING (auth.uid() = user_id);

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
CREATE OR REPLACE FUNCTION encrypt_rrn(plain TEXT)
RETURNS BYTEA AS $$
BEGIN
  -- 프로덕션에서는 Supabase Vault 시크릿 사용 권장
  RETURN pgp_sym_encrypt(plain, current_setting('app.rrn_key', true));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 14. updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
