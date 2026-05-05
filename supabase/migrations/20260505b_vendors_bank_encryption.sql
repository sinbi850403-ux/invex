-- ============================================================
-- 20260505b vendors.bank_account 암호화 마이그레이션
-- 의존: 20260505_security_patch.sql (bank_account_enc/mask 컬럼 추가됨)
-- 실행: Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. 기존 평문 데이터 암호화 (app.rrn_key 또는 Vault 키 사용)
-- ============================================================
DO $$
DECLARE
  rrn_key TEXT;
  updated_cnt INT;
BEGIN
  -- Vault 우선 조회 → fallback: current_setting
  BEGIN
    SELECT decrypted_secret INTO rrn_key
    FROM vault.decrypted_secrets
    WHERE name = 'app.rrn_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    rrn_key := NULL;
  END;

  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    rrn_key := current_setting('app.rrn_key', true);
  END IF;

  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE WARNING '⚠ app.rrn_key 미설정 — 기존 데이터 암호화를 건너뜁니다. Vault 설정 후 재실행 필요.';
    RETURN;
  END IF;

  UPDATE vendors
     SET bank_account_enc  = pgp_sym_encrypt(bank_account, rrn_key),
         bank_account_mask = CASE
           WHEN length(regexp_replace(bank_account, '[^0-9]', '', 'g')) >= 8
             THEN left (regexp_replace(bank_account, '[^0-9]', '', 'g'), 4)
                  || '****'
                  || right(regexp_replace(bank_account, '[^0-9]', '', 'g'), 4)
           ELSE repeat('*', COALESCE(length(bank_account), 0))
         END
   WHERE bank_account IS NOT NULL
     AND bank_account != ''
     AND bank_account_enc IS NULL;   -- 이미 암호화된 행 재암호화 방지

  GET DIAGNOSTICS updated_cnt = ROW_COUNT;
  RAISE NOTICE '✅ vendors.bank_account 암호화 완료: % 행', updated_cnt;
END $$;

-- ============================================================
-- 2. 암호화 완료된 행 평문 null 처리
-- ============================================================
UPDATE vendors
   SET bank_account = NULL
 WHERE bank_account_enc IS NOT NULL
   AND bank_account IS NOT NULL;

-- 평문만 있고 암호화 안 된 행 경고
DO $$
DECLARE cnt INT;
BEGIN
  SELECT count(*) INTO cnt
  FROM vendors
  WHERE bank_account IS NOT NULL AND bank_account != '' AND bank_account_enc IS NULL;
  IF cnt > 0 THEN
    RAISE WARNING '⚠ SECURITY: % 거래처 행에 평문 bank_account가 남아있습니다. app.rrn_key 설정 후 재실행하세요.', cnt;
  END IF;
END $$;

-- ============================================================
-- 3. set_vendor_bank_account RPC  (신규 입력/수정 경로)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_vendor_bank_account(
  p_vendor_id UUID,
  plain       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  rrn_key TEXT;
  mask    TEXT;
BEGIN
  -- RLS: 본인 소유 거래처만 수정 가능
  IF NOT EXISTS (
    SELECT 1 FROM vendors WHERE id = p_vendor_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'permission_denied: 해당 거래처에 대한 권한이 없습니다.';
  END IF;

  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE vendors
       SET bank_account_enc = NULL,
           bank_account_mask = NULL
     WHERE id = p_vendor_id AND user_id = auth.uid();
    RETURN;
  END IF;

  -- 암호화 키 획득 (Vault → fallback)
  SELECT decrypted_secret INTO rrn_key
  FROM vault.decrypted_secrets WHERE name = 'app.rrn_key' LIMIT 1;

  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    rrn_key := current_setting('app.rrn_key', true);
  END IF;
  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION 'app.rrn_key 미설정';
  END IF;

  mask := CASE
    WHEN length(regexp_replace(plain, '[^0-9]', '', 'g')) >= 8
      THEN left (regexp_replace(plain, '[^0-9]', '', 'g'), 4)
           || '****'
           || right(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
    ELSE repeat('*', length(plain))
  END;

  UPDATE vendors
     SET bank_account_enc  = pgp_sym_encrypt(plain, rrn_key),
         bank_account_mask = mask,
         bank_account      = NULL   -- 평문 즉시 제거
   WHERE id = p_vendor_id AND user_id = auth.uid();

  INSERT INTO audit_logs(user_id, action, target, detail)
  VALUES (auth.uid(), 'vendor.setBankAccount', p_vendor_id::text, '계좌번호 업데이트');
END;
$$;

REVOKE ALL    ON FUNCTION public.set_vendor_bank_account(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_vendor_bank_account(UUID, TEXT) TO authenticated;

-- ============================================================
-- 4. decrypt_vendor_bank_account RPC  (관리자/매니저 전용 복호화)
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrypt_vendor_bank_account(
  p_vendor_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  caller_role TEXT;
  rrn_key     TEXT;
  enc_data    BYTEA;
  owner_uid   UUID;
BEGIN
  -- 역할 검증 (admin 또는 manager 만 복호화 가능)
  SELECT role INTO caller_role
  FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: admin or manager role required';
  END IF;

  -- 소유권 확인
  SELECT bank_account_enc, user_id INTO enc_data, owner_uid
  FROM vendors WHERE id = p_vendor_id;

  IF owner_uid != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied: 해당 거래처에 대한 권한이 없습니다.';
  END IF;

  IF enc_data IS NULL THEN RETURN NULL; END IF;

  -- 암호화 키 획득 (Vault → fallback)
  SELECT decrypted_secret INTO rrn_key
  FROM vault.decrypted_secrets WHERE name = 'app.rrn_key' LIMIT 1;

  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    rrn_key := current_setting('app.rrn_key', true);
  END IF;
  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION 'app.rrn_key 미설정';
  END IF;

  -- 감사 로그
  INSERT INTO audit_logs(user_id, action, target, detail)
  VALUES (auth.uid(), 'vendor.viewBankAccount', p_vendor_id::text, '계좌번호 평문 조회');

  RETURN pgp_sym_decrypt(enc_data, rrn_key);
END;
$$;

REVOKE ALL    ON FUNCTION public.decrypt_vendor_bank_account(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrypt_vendor_bank_account(UUID) TO authenticated;
