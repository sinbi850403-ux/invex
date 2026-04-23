-- ============================================================
-- 마이그레이션: transactions 테이블 컬럼 추가
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ============================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS item_code TEXT,
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_selling_price NUMERIC DEFAULT 0;
