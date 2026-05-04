-- ============================================================
-- 감사 트리거 + DB 관리자 정책 패치 (2026-05-04)
-- 실행 방법: Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. check_admin_email() — profiles_select_admin 정책용
--    system_config.admin_emails JSONB 배열 기반 체크
--    (DB 하드코딩 제거: VULN-011 대응)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS check_admin_email();
CREATE OR REPLACE FUNCTION check_admin_email()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  admin_emails jsonb;
  caller_email text;
BEGIN
  caller_email := auth.jwt()->>'email';
  IF caller_email IS NULL THEN
    RETURN false;
  END IF;
  SELECT value INTO admin_emails FROM system_config WHERE key = 'admin_emails';
  IF admin_emails IS NULL THEN
    RETURN false;
  END IF;
  RETURN admin_emails ? caller_email;
END;
$$;

-- profiles_select_admin 정책 교체 (하드코딩 이메일 제거)
DROP POLICY IF EXISTS "profiles_select_admin" ON profiles;
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT
  USING (check_admin_email());

-- ------------------------------------------------------------
-- 2. 급여 상태 변경 감사 트리거
--    payrolls.status 변경 시 audit_logs에 기록
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_payroll_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (
      auth.uid(),
      'payroll.statusChange',
      NEW.id::text,
      format('%s년 %s월 급여 상태: %s → %s', NEW.pay_year, NEW.pay_month, OLD.status, NEW.status),
      (SELECT email FROM profiles WHERE id = auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_payroll ON payrolls;
CREATE TRIGGER trg_audit_payroll
  AFTER UPDATE ON payrolls FOR EACH ROW EXECUTE FUNCTION audit_payroll_status_change();

-- ------------------------------------------------------------
-- 3. 직원 삭제 감사 트리거
--    employees 레코드 DELETE 시 audit_logs에 기록
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_employee_delete()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs(user_id, action, target, detail, user_email)
  VALUES (
    auth.uid(),
    'employee.delete',
    OLD.id::text,
    format('직원 삭제: %s (사번: %s)', OLD.name, OLD.emp_no),
    (SELECT email FROM profiles WHERE id = auth.uid())
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_employee_delete ON employees;
CREATE TRIGGER trg_audit_employee_delete
  BEFORE DELETE ON employees FOR EACH ROW EXECUTE FUNCTION audit_employee_delete();

-- ------------------------------------------------------------
-- 4. 프로필 역할 변경 감사 트리거
--    profiles.role 변경 시 audit_logs에 기록
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_profile_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO audit_logs(user_id, action, target, detail, user_email)
    VALUES (
      auth.uid(),
      'profile.roleChange',
      NEW.id::text,
      format('역할 변경: %s → %s (대상: %s)', OLD.role, NEW.role, NEW.email),
      (SELECT email FROM profiles WHERE id = auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;

DROP TRIGGER IF EXISTS trg_audit_profile_role ON profiles;
CREATE TRIGGER trg_audit_profile_role
  AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION audit_profile_role_change();

-- ------------------------------------------------------------
-- 확인 쿼리 (실행 후 트리거 생성 여부 검증)
-- ------------------------------------------------------------
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_audit_payroll',
  'trg_audit_employee_delete',
  'trg_audit_profile_role'
)
ORDER BY event_object_table;
