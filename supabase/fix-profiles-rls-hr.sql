/**
 * ============================================================
 * INVEX RLS 패치 + HR 모듈 완성본
 *
 * 목적:
 * 1. profiles RLS 정책 수정 (관리자 조회 권한 추가)
 * 2. HR 모듈 테이블 생성 (employees, attendance, payrolls, leaves, salary_items)
 * 3. 모든 HR 테이블 RLS 정책 설정
 * ============================================================
 */

-- ============================================================
-- Phase 1: profiles 테이블 RLS 정책 수정
-- ============================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update" ON profiles;
DROP POLICY IF EXISTS "profiles_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;

-- 새 정책: 자신 + 관리자만 조회
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    auth.uid() = id OR
    auth.jwt()->>'email' IN ('sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr')
  );

-- INSERT 정책 (회원가입 시 트리거로 자동 생성)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- UPDATE 정책 (자신의 프로필만 수정)
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- 트리거 함수 재생성 (SECURITY DEFINER로 service_role 권한 사용)
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

-- 트리거 재연결
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Phase 2: HR 모듈 테이블 생성
-- ============================================================

-- 확장 활성화
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. 직원 마스터 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emp_no text NOT NULL,
  name text NOT NULL,
  dept text,
  position text,
  hire_date date NOT NULL,
  resign_date date,
  rrn_enc bytea,
  rrn_mask text,
  bank text,
  account_no text,
  base_salary numeric(12,0) DEFAULT 0,
  hourly_wage numeric(10,0) DEFAULT 0,
  employment_type text DEFAULT '정규직',
  insurance_flags jsonb DEFAULT '{"np":true,"hi":true,"ei":true,"wc":true}',
  dependents int DEFAULT 0,
  children int DEFAULT 0,
  allowances jsonb DEFAULT '{}',
  annual_leave_days numeric(5,1) DEFAULT 15,
  annual_leave_used numeric(5,1) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, emp_no)
);

CREATE INDEX IF NOT EXISTS idx_employees_user_dept ON employees(user_id, dept);
CREATE INDEX IF NOT EXISTS idx_employees_user_status ON employees(user_id, resign_date);

-- ── 2. 출퇴근 기록 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  check_in time,
  check_out time,
  break_min int DEFAULT 0,
  overtime_min int DEFAULT 0,
  night_min int DEFAULT 0,
  holiday_min int DEFAULT 0,
  work_min int DEFAULT 0,
  leave_days numeric(4,1) DEFAULT 0,
  status text DEFAULT '정상',
  note text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_month ON attendance(user_id, work_date);

-- ── 3. 월별 급여 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payrolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id),
  pay_year int NOT NULL,
  pay_month int NOT NULL,
  base_salary numeric(12,0),
  allowances jsonb DEFAULT '{}',
  overtime_pay numeric(12,0),
  night_pay numeric(12,0),
  holiday_pay numeric(12,0),
  gross_pay numeric(12,0),
  np numeric(12,0),
  hi numeric(12,0),
  ltc numeric(12,0),
  ei numeric(12,0),
  income_tax numeric(12,0),
  local_tax numeric(12,0),
  deductions jsonb DEFAULT '{}',
  other_deduct jsonb DEFAULT '{}',
  total_deduction numeric(12,0),
  net_pay numeric(12,0),
  status text DEFAULT 'draft',
  paid_at timestamptz,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, pay_year, pay_month, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_payrolls_user_period ON payrolls(user_id, pay_year, pay_month);
CREATE INDEX IF NOT EXISTS idx_payrolls_status ON payrolls(user_id, status);

-- ── 4. 휴가 신청 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric(4,1) NOT NULL,
  reason text,
  status text DEFAULT '신청',
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaves_user_status ON leaves(user_id, status);
CREATE INDEX IF NOT EXISTS idx_leaves_user_period ON leaves(user_id, start_date, end_date);

-- ── 5. 수당/공제 항목 마스터 ────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  calc_type text DEFAULT 'fixed',
  amount numeric(12,0),
  rate numeric(5,2),
  formula text,
  is_taxable boolean DEFAULT true,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, code)
);

CREATE INDEX IF NOT EXISTS idx_salary_items_user ON salary_items(user_id);

-- ============================================================
-- Phase 3: HR 테이블 RLS 정책 설정
-- ============================================================

-- RLS 활성화
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_items ENABLE ROW LEVEL SECURITY;

-- RLS 정책 (사용자별 데이터 격리)
CREATE POLICY "employees_all" ON employees
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "attendance_all" ON attendance
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "payrolls_all" ON payrolls
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "leaves_all" ON leaves
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "salary_items_all" ON salary_items
  FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- 완료
-- ============================================================
-- 이 스크립트는 다음을 완료합니다:
-- ✅ 1. profiles RLS: 관리자 조회 권한 추가
-- ✅ 2. profiles INSERT 정책: 회원가입 트리거 작동
-- ✅ 3. HR 모듈: 5개 테이블 생성 (employees, attendance, payrolls, leaves, salary_items)
-- ✅ 4. 모든 HR 테이블: RLS 정책으로 사용자별 데이터 격리
-- ✅ 5. 인덱스: 조회 성능 최적화
