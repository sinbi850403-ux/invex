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

-- 프로필 자동 생성 트리거: 가입 시 자동으로 profiles 행 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, name, email, photo_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '사용자'),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
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
  quantity NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
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
  FOREACH tbl IN ARRAY ARRAY['profiles', 'items', 'vendors', 'account_entries', 'purchase_orders']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;
