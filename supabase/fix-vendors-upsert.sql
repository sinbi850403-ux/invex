-- ============================================================
-- INVEX — vendors 거래처 upsert 지원을 위한 unique 제약
-- Supabase 대시보드 → SQL Editor → 실행
-- ============================================================
-- vendors.upsert()가 onConflict: 'user_id,name'으로 동작하려면
-- (user_id, name) 복합 unique 제약이 필요

ALTER TABLE vendors
  ADD CONSTRAINT IF NOT EXISTS vendors_user_id_name_unique
  UNIQUE (user_id, name);
