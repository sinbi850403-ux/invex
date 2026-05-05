-- ============================================================
-- 20260505c Supabase Vault — app.rrn_key 마이그레이션
--
-- 목적: current_setting('app.rrn_key') → Supabase Vault 방식으로 전환
-- 효과: 암호화 키가 DB 설정값이 아닌 pgsodium 기반 암호화 저장소에 보관됨
--
-- 실행 순서:
--   1. 이 SQL 전체 실행 (함수 업데이트)
--   2. Vault에 키 등록 (아래 2번 항목 참고)
--   3. 기존 app.rrn_key GUC 의존 코드 제거 (앱 배포)
-- ============================================================

-- ============================================================
-- 1. Vault 확장 활성화 (이미 활성화된 경우 무시됨)
-- ============================================================
-- 주의: Supabase 관리형 프로젝트는 이미 vault가 내장되어 있음
-- 로컬 개발환경(supabase start)에서는 아래 명령어로 활성화:
-- CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- ============================================================
-- 2. Vault에 암호화 키 등록 (최초 1회)
--    실행 전 반드시 실제 키 값으로 교체할 것
-- ============================================================
-- 방법 A: SQL로 직접 등록 (Dashboard SQL Editor)
--   SELECT vault.create_secret(
--     'YOUR_ACTUAL_32CHAR_KEY_HERE',   -- 최소 32자 이상 랜덤 키
--     'app.rrn_key',                    -- 시크릿 이름
--     'RRN/계좌번호 암호화 키'           -- 설명
--   );
--
-- 방법 B: Supabase Dashboard → Vault → New Secret
--   Name: app.rrn_key
--   Secret: (32자 이상의 랜덤 문자열)
--
-- ※ 키 생성 예시 (터미널):
--   openssl rand -base64 32
--   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
--
-- ※ 기존 current_setting('app.rrn_key') 로 암호화된 데이터가 있다면
--   반드시 동일한 키 값을 사용해야 복호화 가능합니다.

-- ============================================================
-- 3. get_rrn_key() 헬퍼 함수 — Vault 우선, fallback: current_setting
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_rrn_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  rrn_key TEXT;
BEGIN
  -- Vault 우선 조회
  BEGIN
    SELECT decrypted_secret INTO rrn_key
    FROM vault.decrypted_secrets
    WHERE name = 'app.rrn_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    rrn_key := NULL;
  END;

  IF rrn_key IS NOT NULL AND length(rrn_key) >= 32 THEN
    RETURN rrn_key;
  END IF;

  -- Fallback: PostgreSQL GUC (로컬 개발/임시 환경용)
  rrn_key := current_setting('app.rrn_key', true);

  IF rrn_key IS NULL OR length(rrn_key) < 32 THEN
    RAISE EXCEPTION
      'app.rrn_key 미설정: Supabase Dashboard → Vault에 app.rrn_key 시크릿을 등록하거나, '
      'SET app.rrn_key = ''32자이상키'' 로 임시 설정하세요.';
  END IF;

  RETURN rrn_key;
END;
$$;

-- 보안: 이 함수는 SECURITY DEFINER이므로 직접 노출 금지
REVOKE ALL    ON FUNCTION public.get_rrn_key() FROM PUBLIC;
-- postgres 슈퍼유저만 내부 호출 허용 (다른 SECURITY DEFINER 함수에서 호출)

-- ============================================================
-- 4. encrypt_rrn — get_rrn_key() 사용으로 업데이트
-- ============================================================
CREATE OR REPLACE FUNCTION public.encrypt_rrn(plain TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pgp_sym_encrypt(plain, public.get_rrn_key());
END;
$$;

REVOKE ALL    ON FUNCTION public.encrypt_rrn(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.encrypt_rrn(TEXT) TO authenticated;

-- ============================================================
-- 5. set_employee_rrn — get_rrn_key() 사용으로 업데이트
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_employee_rrn(emp_id UUID, plain TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET rrn_enc = NULL, rrn_mask = NULL
     WHERE id = emp_id AND user_id = auth.uid();
  ELSE
    UPDATE employees
       SET rrn_enc  = pgp_sym_encrypt(plain, public.get_rrn_key()),
           rrn_mask = left(plain, 8) || '***'
     WHERE id = emp_id AND user_id = auth.uid();
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.set_employee_rrn(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_employee_rrn(UUID, TEXT) TO authenticated;

-- ============================================================
-- 6. decrypt_rrn — get_rrn_key() + role check (보안 패치 통합)
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrypt_rrn(emp_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  enc_val     BYTEA;
  owner_uid   UUID;
BEGIN
  -- DB 레벨 역할 검증 (클라이언트 우회 불가)
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: admin or manager role required';
  END IF;

  -- 소유권 확인
  SELECT rrn_enc, user_id INTO enc_val, owner_uid
  FROM public.employees WHERE id = emp_id;

  IF owner_uid != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied: you do not own this employee record';
  END IF;

  IF enc_val IS NULL THEN RETURN NULL; END IF;

  -- 감사 로그
  INSERT INTO public.audit_logs(user_id, action, target, detail)
  VALUES (auth.uid(), 'decrypt_rrn', emp_id::text, 'RRN plaintext viewed');

  RETURN pgp_sym_decrypt(enc_val, public.get_rrn_key());
END;
$$;

REVOKE ALL    ON FUNCTION public.decrypt_rrn(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrypt_rrn(UUID) TO authenticated;

-- ============================================================
-- 7. set_employee_account_no — get_rrn_key() 사용으로 업데이트
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_employee_account_no(emp_id UUID, plain TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mask TEXT;
BEGIN
  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET account_no_enc = NULL, account_no_mask = NULL
     WHERE id = emp_id AND user_id = auth.uid();
    RETURN;
  END IF;

  mask := CASE
    WHEN length(regexp_replace(plain, '[^0-9]', '', 'g')) >= 8
      THEN left (regexp_replace(plain, '[^0-9]', '', 'g'), 4)
           || '****'
           || right(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
    ELSE repeat('*', length(plain))
  END;

  UPDATE employees
     SET account_no_enc  = pgp_sym_encrypt(plain, public.get_rrn_key()),
         account_no_mask = mask,
         account_no      = NULL   -- 평문 즉시 제거
   WHERE id = emp_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL    ON FUNCTION public.set_employee_account_no(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_employee_account_no(UUID, TEXT) TO authenticated;

-- ============================================================
-- 8. decrypt_account_no — get_rrn_key() + role check (보안 패치 통합)
-- ============================================================
CREATE OR REPLACE FUNCTION public.decrypt_account_no(emp_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  enc_val     BYTEA;
  owner_uid   UUID;
BEGIN
  -- DB 레벨 역할 검증
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: admin or manager role required';
  END IF;

  -- 소유권 확인
  SELECT account_no_enc, user_id INTO enc_val, owner_uid
  FROM public.employees WHERE id = emp_id;

  IF owner_uid != auth.uid() THEN
    RAISE EXCEPTION 'permission_denied: you do not own this employee record';
  END IF;

  IF enc_val IS NULL THEN RETURN NULL; END IF;

  -- 감사 로그
  INSERT INTO public.audit_logs(user_id, action, target, detail)
  VALUES (auth.uid(), 'decrypt_account_no', emp_id::text, 'Account No plaintext viewed');

  RETURN pgp_sym_decrypt(enc_val, public.get_rrn_key());
END;
$$;

REVOKE ALL    ON FUNCTION public.decrypt_account_no(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrypt_account_no(UUID) TO authenticated;

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE '✅ Vault 마이그레이션 완료';
  RAISE NOTICE '   get_rrn_key()  — Vault 우선, GUC fallback 헬퍼 생성됨';
  RAISE NOTICE '   encrypt_rrn / set_employee_rrn / decrypt_rrn 업데이트됨';
  RAISE NOTICE '   set_employee_account_no / decrypt_account_no 업데이트됨';
  RAISE NOTICE '';
  RAISE NOTICE '⚠ 다음 단계: Vault에 app.rrn_key 등록';
  RAISE NOTICE '   SELECT vault.create_secret(''YOUR_KEY_HERE'', ''app.rrn_key'', ''RRN key'');';
END $$;
