-- ============================================================
-- [SECURITY] P0-5: vendors.bank_account 암호화 마이그레이션
-- 실행 순서: Supabase Dashboard > SQL Editor 에서 순서대로 실행
-- 주의: pgcrypto 확장이 활성화되어 있어야 합니다 (CREATE EXTENSION IF NOT EXISTS pgcrypto)
-- 주의: app.rrn_key 설정이 완료된 후 실행하세요
-- ============================================================

-- 1단계: 새 컬럼 추가
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS bank_account_enc  BYTEA,
  ADD COLUMN IF NOT EXISTS bank_account_mask TEXT;

-- 2단계: 기존 평문 bank_account → 암호화 (app.rrn_key 재사용)
-- ※ app.rrn_key 가 설정된 경우에만 실행. 미설정 시 이 단계 건너뜀.
DO $$
BEGIN
  IF current_setting('app.rrn_key', true) IS NOT NULL
     AND length(current_setting('app.rrn_key', true)) >= 32 THEN
    UPDATE vendors
       SET bank_account_enc  = pgp_sym_encrypt(bank_account, current_setting('app.rrn_key', true)),
           bank_account_mask = CASE
             WHEN length(regexp_replace(bank_account, '[^0-9]', '', 'g')) >= 8
               THEN left(regexp_replace(bank_account, '[^0-9]', '', 'g'), 4)
                    || '****'
                    || right(regexp_replace(bank_account, '[^0-9]', '', 'g'), 4)
             ELSE repeat('*', COALESCE(length(bank_account), 0))
           END
     WHERE bank_account IS NOT NULL AND bank_account != '';
    RAISE NOTICE '% 행의 bank_account 암호화 완료', (SELECT count(*) FROM vendors WHERE bank_account_enc IS NOT NULL);
  ELSE
    RAISE NOTICE 'app.rrn_key 미설정 — 기존 데이터 암호화 건너뜀. Vault 설정 후 재실행 필요.';
  END IF;
END $$;

-- 3단계: 암호화 완료 후 평문 컬럼 null 처리
-- ※ 복호화 RPC 코드 배포 완료 후 실행하세요
-- UPDATE vendors SET bank_account = NULL WHERE bank_account_enc IS NOT NULL;

-- 4단계: set_vendor_bank_account RPC
CREATE OR REPLACE FUNCTION set_vendor_bank_account(vendor_id UUID, plain TEXT)
RETURNS VOID AS $$
DECLARE mask TEXT;
BEGIN
  -- RLS: 본인 소유 거래처만 수정 가능
  IF NOT EXISTS (SELECT 1 FROM vendors WHERE id = vendor_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'permission_denied: 해당 거래처에 대한 권한이 없습니다.';
  END IF;
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE vendors
       SET bank_account_enc = NULL, bank_account_mask = NULL
     WHERE id = vendor_id AND user_id = auth.uid();
  ELSE
    mask := CASE
      WHEN length(regexp_replace(plain, '[^0-9]', '', 'g')) >= 8
        THEN left(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
             || '****'
             || right(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
      ELSE repeat('*', length(plain))
    END;
    UPDATE vendors
       SET bank_account_enc  = pgp_sym_encrypt(plain, current_setting('app.rrn_key', true)),
           bank_account_mask = mask
     WHERE id = vendor_id AND user_id = auth.uid();
  END IF;
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'vendor.setBankAccount', vendor_id::text, '계좌번호 업데이트');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
REVOKE EXECUTE ON FUNCTION set_vendor_bank_account(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_vendor_bank_account(UUID, TEXT) TO authenticated;

-- 5단계: decrypt_vendor_bank_account RPC
CREATE OR REPLACE FUNCTION decrypt_vendor_bank_account(vendor_id UUID)
RETURNS TEXT AS $$
DECLARE enc_data BYTEA;
BEGIN
  SELECT bank_account_enc INTO enc_data
    FROM vendors WHERE id = vendor_id AND user_id = auth.uid();
  IF enc_data IS NULL THEN RETURN NULL; END IF;
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'vendor.viewBankAccount', vendor_id::text, '계좌번호 평문 조회');
  RETURN pgp_sym_decrypt(enc_data, current_setting('app.rrn_key', true));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
REVOKE EXECUTE ON FUNCTION decrypt_vendor_bank_account(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION decrypt_vendor_bank_account(UUID) TO authenticated;

-- ============================================================
-- 코드 수정 TODO (배포 전 완료 필요):
-- 1. src/db/converters.js: dbVendorToStore — bankAccount 대신 bankAccountMask 사용
-- 2. src/db/vendors.js: create/update 에서 set_vendor_bank_account() RPC 호출
-- 3. src/components/vendors/VendorModal.jsx — 계좌번호 입력 필드를 RPC 호출로 변경
-- 4. supabase/schema.sql — vendors 테이블 CREATE에 신규 컬럼 반영
-- ============================================================
