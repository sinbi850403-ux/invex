-- ============================================================
-- INVEX — create_workspace_for_user RPC 생성
-- Supabase 대시보드 → SQL Editor → 전체 실행
--
-- 문제: RPC 함수가 DB에 없어 404 → wsUpsert 폴백 → RLS 403
-- 해결: SECURITY DEFINER 함수로 RLS 우회하여 워크스페이스 생성
-- ============================================================

CREATE OR REPLACE FUNCTION create_workspace_for_user(
  ws_name      TEXT,
  member_email TEXT DEFAULT '',
  member_name  TEXT DEFAULT '관리자'
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid         TEXT := auth.uid()::text;
  existing_id TEXT;
BEGIN
  -- 인증 확인
  IF uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  -- 이미 존재하는 워크스페이스 확인
  SELECT id INTO existing_id FROM team_workspaces WHERE id = uid;

  IF existing_id IS NOT NULL THEN
    -- 이미 있으면 이름만 업데이트 후 반환 (idempotent)
    UPDATE team_workspaces
       SET name       = COALESCE(ws_name, name),
           updated_at = now()
     WHERE id = uid;
    RETURN uid;
  END IF;

  -- 신규 워크스페이스 생성
  INSERT INTO team_workspaces (id, name, owner_id, members, created_at, updated_at)
  VALUES (
    uid,
    COALESCE(ws_name, 'My Workspace'),
    uid,
    jsonb_build_array(
      jsonb_build_object(
        'uid',      uid,
        'id',       uid,
        'email',    COALESCE(member_email, ''),
        'name',     COALESCE(member_name, '관리자'),
        'role',     'owner',
        'status',   'active',
        'joinedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
    ),
    now(),
    now()
  );

  RETURN uid;
END;
$$;

-- 인증된 사용자에게 실행 권한 부여
GRANT EXECUTE ON FUNCTION create_workspace_for_user(TEXT, TEXT, TEXT) TO authenticated;
