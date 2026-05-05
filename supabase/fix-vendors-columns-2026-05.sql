-- fix-vendors-columns-2026-05.sql
-- vendors 테이블 누락 컬럼 추가 + 기존 type=null 데이터 기본값 처리
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행

-- 1. 누락된 컬럼 추가
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS code         TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS biz_type     TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS biz_item     TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_term TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS fax          TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_name    TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS bank_holder  TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS note         TEXT;

-- 2. type NULL 데이터를 'supplier'(매입처)로 기본값 설정
-- (기존 레거시 데이터는 대부분 매입처이므로 supplier가 가장 일반적)
UPDATE vendors SET type = 'supplier' WHERE type IS NULL;

-- 3. type 컬럼에 기본값 설정 (향후 누락 방지)
ALTER TABLE vendors ALTER COLUMN type SET DEFAULT 'supplier';

-- 확인 쿼리
SELECT id, name, type, code FROM vendors ORDER BY created_at DESC LIMIT 20;
