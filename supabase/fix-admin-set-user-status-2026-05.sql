-- ============================================================
-- [SECURITY] P0-6: admin_set_user_status RPC 등록
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- ============================================================

CREATE OR REPLACE FUNCTION admin_set_user_status(target_id UUID, new_status TEXT)
RETURNS VOID AS $$
BEGIN
  -- 서버사이드 관리자 검증 (check_admin_email은 SECURITY DEFINER)
  IF NOT check_admin_email() THEN
    RAISE EXCEPTION 'permission_denied: 관리자 권한이 필요합니다.';
  END IF;
  -- new_status 화이트리스트 검증
  IF new_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid_status: 허용된 상태값은 active, suspended 입니다.';
  END IF;
  -- 감사 로그
  INSERT INTO audit_logs(user_id, action, target, detail)
    VALUES (auth.uid(), 'admin.setUserStatus', target_id::text,
            '상태 변경: ' || new_status);
  -- 상태 업데이트
  UPDATE profiles SET status = new_status WHERE id = target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog, pg_temp;
REVOKE EXECUTE ON FUNCTION admin_set_user_status(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_set_user_status(UUID, TEXT) TO authenticated;
