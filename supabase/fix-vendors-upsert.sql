-- ============================================================
-- INVEX — vendors 거래처 upsert 지원을 위한 unique 제약
-- Supabase 대시보드 → SQL Editor → 실행
-- ============================================================
-- vendors.upsert()가 onConflict: 'user_id,name'으로 동작하려면
-- (user_id, name) 복합 unique 제약이 필요
-- PostgreSQL은 ADD CONSTRAINT IF NOT EXISTS 미지원 → DO 블록으로 우회

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendors_user_id_name_unique'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_user_id_name_unique UNIQUE (user_id, name);
  END IF;
END $$;
