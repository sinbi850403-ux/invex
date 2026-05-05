-- ============================================================
-- INVEX — team_workspaces create_workspace_for_user RPC
-- 워크스페이스 생성을 SECURITY DEFINER 함수로 래핑
--   - owner_id 를 클라이언트가 아닌 auth.uid() 서버측에서 설정
--   - 기존 tw_insert RLS (auth.uid()::text = owner_id) 와 충돌 없음
--   - auth.uid() 가 NULL 이면 명확한 예외 반환
-- ============================================================

CREATE OR REPLACE FUNCTION create_workspace_for_user(
  ws_name     TEXT,
  member_email TEXT DEFAULT NULL,
  member_name  TEXT DEFAULT 'admin'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller TEXT := auth.uid()::text;
BEGIN
  IF caller IS NULL OR caller = '' THEN
    RAISE EXCEPTION 'Auth required. Please log in again.';
  END IF;

  INSERT INTO team_workspaces (id, name, owner_id, members, created_at, updated_at)
  VALUES (
    caller,
    COALESCE(NULLIF(TRIM(ws_name), ''), 'My Workspace'),
    caller,
    jsonb_build_array(
      jsonb_build_object(
        'uid',      caller,
        'id',       caller,
        'email',    COALESCE(member_email, ''),
        'name',     COALESCE(NULLIF(TRIM(member_name), ''), 'admin'),
        'role',     'owner',
        'status',   'active',
        'joinedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    ),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name       = EXCLUDED.name,
    updated_at = now();

  RETURN caller;
END;
$$;

GRANT EXECUTE ON FUNCTION create_workspace_for_user(TEXT, TEXT, TEXT) TO authenticated;
