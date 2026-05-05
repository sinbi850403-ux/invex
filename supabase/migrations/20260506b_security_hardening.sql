-- ============================================================
-- INVEX ERP-Lite — 보안 패치 마이그레이션 (FS-03)
--
-- 실행 타이밍: Phase 1 (V001~V007) 완료 직후
-- 실행 방법: Supabase Dashboard → SQL Editor
--
-- 포함 항목:
--   [V-06] audit_logs UPDATE/DELETE 명시 차단
--   [V-02] audit_logs INSERT 시 user_id 강제 설정 트리거
--   [V-03] encrypt_rrn / set_employee_rrn / set_employee_account_no role 검증 추가
--          + 감사 로그 기록 추가 (RS-06)
--   [V-09] _schema_migration_guard RLS 적용
-- ============================================================


-- ============================================================
-- [V-06] audit_logs UPDATE/DELETE 명시 차단
-- 묵시적 거부만으로는 향후 GRANT 변경 시 취약해질 수 있음
-- 명시적 USING(false) 정책으로 감사 로그 변조 방지
-- ============================================================
BEGIN;

DROP POLICY IF EXISTS "audit_no_update" ON audit_logs;
CREATE POLICY "audit_no_update" ON audit_logs
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS "audit_no_delete" ON audit_logs;
CREATE POLICY "audit_no_delete" ON audit_logs
  FOR DELETE USING (false);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[V-06 완료] audit_logs UPDATE/DELETE 명시 차단 정책 적용';
END $$;


-- ============================================================
-- [V-02] audit_logs BEFORE INSERT 트리거
-- 클라이언트가 user_id를 임의 UUID로 지정해도 auth.uid()로 강제 덮어씀
-- user_email도 현재 인증 사용자 이메일로 자동 설정
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION fn_force_audit_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  -- user_id를 항상 현재 인증된 사용자로 강제 설정
  -- 클라이언트가 임의 UUID를 지정해도 덮어씀
  NEW.user_id := auth.uid();

  -- user_email이 비어 있으면 현재 사용자 이메일 자동 설정
  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    SELECT email INTO NEW.user_email
    FROM profiles
    WHERE id = auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_audit_user_id ON audit_logs;
CREATE TRIGGER trg_force_audit_user_id
  BEFORE INSERT ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION fn_force_audit_user_id();

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[V-02 완료] audit_logs BEFORE INSERT 트리거 설치 — user_id 위조 방어';
END $$;


-- ============================================================
-- [V-03] encrypt_rrn — manager/admin role 검증 추가
-- 기존: 모든 authenticated 사용자가 주민번호 암호화 가능
-- 변경: manager 이상만 가능 + Vault AES-256 명시
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.encrypt_rrn(plain TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: manager or admin role required to encrypt PII';
  END IF;
  RETURN pgp_sym_encrypt(plain, public.get_rrn_key(), 'cipher-algo=aes256');
END;
$$;

REVOKE ALL    ON FUNCTION public.encrypt_rrn(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.encrypt_rrn(TEXT) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[V-03a 완료] encrypt_rrn — role 검증 + AES-256 명시 적용';
END $$;


-- ============================================================
-- [V-03] set_employee_rrn — manager/admin role 검증 + 감사 로그 추가 (RS-06)
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.set_employee_rrn(emp_id UUID, plain TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: manager or admin role required';
  END IF;

  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET rrn_enc = NULL, rrn_mask = NULL
     WHERE id = emp_id AND user_id = auth.uid();
  ELSE
    -- [RS-06] 감사 로그 기록 (암호화 입력 이력)
    INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'employee.setRrn', emp_id::text, '주민번호 암호화 입력');

    UPDATE employees
       SET rrn_enc  = pgp_sym_encrypt(plain, public.get_rrn_key(), 'cipher-algo=aes256'),
           rrn_mask = left(plain, 8) || '***'
     WHERE id = emp_id AND user_id = auth.uid();
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.set_employee_rrn(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_employee_rrn(UUID, TEXT) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[V-03b 완료] set_employee_rrn — role 검증 + 감사 로그 기록 추가';
END $$;


-- ============================================================
-- [V-03] set_employee_account_no — manager/admin role 검증 + 감사 로그 추가 (RS-06)
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.set_employee_account_no(emp_id UUID, plain TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  mask TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'permission_denied: manager or admin role required';
  END IF;

  IF plain IS NULL OR length(plain) = 0 THEN
    UPDATE employees SET account_no_enc = NULL, account_no_mask = NULL
     WHERE id = emp_id AND user_id = auth.uid();
    RETURN;
  END IF;

  mask := CASE
    WHEN length(regexp_replace(plain, '[^0-9]', '', 'g')) >= 8
      THEN left(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
           || '****'
           || right(regexp_replace(plain, '[^0-9]', '', 'g'), 4)
    ELSE repeat('*', length(plain))
  END;

  -- [RS-06] 감사 로그 기록 (암호화 입력 이력)
  INSERT INTO audit_logs(user_id, action, target, detail)
  VALUES (auth.uid(), 'employee.setAccountNo', emp_id::text, '계좌번호 암호화 입력');

  UPDATE employees
     SET account_no_enc  = pgp_sym_encrypt(plain, public.get_rrn_key(), 'cipher-algo=aes256'),
         account_no_mask = mask,
         account_no      = NULL   -- 평문 즉시 제거
   WHERE id = emp_id AND user_id = auth.uid();
END;
$$;

REVOKE ALL    ON FUNCTION public.set_employee_account_no(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_employee_account_no(UUID, TEXT) TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[V-03c 완료] set_employee_account_no — role 검증 + 감사 로그 기록 추가';
END $$;


-- ============================================================
-- [V-09] _schema_migration_guard RLS 적용
-- 마이그레이션 상태 추적 테이블을 일반 사용자로부터 보호
-- ============================================================
BEGIN;

ALTER TABLE IF EXISTS _schema_migration_guard ENABLE ROW LEVEL SECURITY;

-- 일반 사용자 전체 차단
DROP POLICY IF EXISTS "_guard_deny_all" ON _schema_migration_guard;
CREATE POLICY "_guard_deny_all" ON _schema_migration_guard
  FOR ALL USING (false);

-- 관리자만 SELECT 허용 (상태 확인용)
DROP POLICY IF EXISTS "_guard_admin_select" ON _schema_migration_guard;
CREATE POLICY "_guard_admin_select" ON _schema_migration_guard
  FOR SELECT USING (check_admin_email());

COMMIT;

DO $$ BEGIN
  RAISE NOTICE '[V-09 완료] _schema_migration_guard RLS 적용 — 관리자만 조회 가능';
END $$;


-- ============================================================
-- 보안 패치 완료 확인 쿼리
-- ============================================================
SELECT 'V-06 audit_logs UPDATE 차단' AS check_item,
       COUNT(*) AS policy_count,
       CASE WHEN COUNT(*) > 0 THEN '✅ 적용됨' ELSE '❌ 미적용' END AS result
FROM pg_policies
WHERE tablename = 'audit_logs' AND cmd = 'UPDATE'

UNION ALL

SELECT 'V-06 audit_logs DELETE 차단',
       COUNT(*),
       CASE WHEN COUNT(*) > 0 THEN '✅ 적용됨' ELSE '❌ 미적용' END
FROM pg_policies
WHERE tablename = 'audit_logs' AND cmd = 'DELETE'

UNION ALL

SELECT 'V-02 audit_logs INSERT 트리거',
       COUNT(*),
       CASE WHEN COUNT(*) > 0 THEN '✅ 설치됨' ELSE '❌ 미설치' END
FROM pg_trigger
WHERE tgname = 'trg_force_audit_user_id'

UNION ALL

SELECT 'V-03 encrypt_rrn role 검증',
       COUNT(*),
       CASE WHEN COUNT(*) > 0 THEN '✅ 적용됨' ELSE '❌ 미적용 (schema.sql 버전)' END
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'encrypt_rrn'
  -- role 검증 포함 버전은 prosrc에 'permission_denied' 포함
  AND p.prosrc LIKE '%permission_denied%';

DO $$ BEGIN
  RAISE NOTICE '보안 패치 완료 보고서 출력 완료. 위 SELECT 결과를 확인하세요.';
END $$;
