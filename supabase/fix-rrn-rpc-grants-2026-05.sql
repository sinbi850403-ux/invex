-- ============================================================
-- [SECURITY] P0-4: 주민번호 암호화 RPC GRANT 누락 수정
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- ============================================================

-- encrypt_rrn: PUBLIC 실행 권한 제거
REVOKE EXECUTE ON FUNCTION encrypt_rrn(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION encrypt_rrn(TEXT) TO authenticated;

-- set_employee_rrn: PUBLIC 실행 권한 제거
REVOKE EXECUTE ON FUNCTION set_employee_rrn(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_employee_rrn(UUID, TEXT) TO authenticated;

-- decrypt_rrn: PUBLIC 실행 권한 제거 (핵심 — 인증 사용자만 호출 가능)
REVOKE EXECUTE ON FUNCTION decrypt_rrn(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION decrypt_rrn(UUID) TO authenticated;
