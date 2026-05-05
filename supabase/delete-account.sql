-- ============================================================
-- INVEX — 회원탈퇴 완전 삭제 함수
-- Supabase 대시보드 → SQL Editor → 전체 실행
-- ============================================================
-- SECURITY DEFINER: postgres(superuser)로 실행되어 auth.users 삭제 가능

CREATE OR REPLACE FUNCTION delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  -- 1. 하위 데이터부터 순서대로 삭제 (FK 제약 고려)
  DELETE FROM salary_items    WHERE user_id = uid;
  DELETE FROM leaves          WHERE user_id = uid;
  DELETE FROM payrolls        WHERE user_id = uid;
  DELETE FROM attendance      WHERE user_id = uid;
  DELETE FROM employees       WHERE user_id = uid;
  DELETE FROM pos_sales       WHERE user_id = uid;
  DELETE FROM purchase_orders WHERE user_id = uid;
  DELETE FROM account_entries WHERE user_id = uid;
  DELETE FROM audit_logs      WHERE user_id = uid;
  DELETE FROM stocktakes      WHERE user_id = uid;
  DELETE FROM transfers       WHERE user_id = uid;
  DELETE FROM vendors         WHERE user_id = uid;
  DELETE FROM transactions    WHERE user_id = uid;
  DELETE FROM items           WHERE user_id = uid;
  DELETE FROM user_settings   WHERE user_id = uid;
  DELETE FROM custom_fields   WHERE user_id = uid;

  -- 2. 팀 워크스페이스 삭제 (오너인 경우)
  DELETE FROM team_workspaces WHERE owner_id = uid::text;

  -- 3. 프로필 삭제
  DELETE FROM profiles WHERE id = uid;

  -- 4. Auth 계정 완전 삭제 (SECURITY DEFINER → postgres 권한으로 실행)
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- 로그인한 사용자에게 실행 권한 부여
GRANT EXECUTE ON FUNCTION delete_own_account() TO authenticated;
