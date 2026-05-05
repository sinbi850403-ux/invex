-- ============================================================
-- 20260429 team_workspaces + workspace RPCs
-- ============================================================

-- 1. team_workspaces 테이블
CREATE TABLE IF NOT EXISTS public.team_workspaces (
  id         UUID        PRIMARY KEY,
  name       TEXT        NOT NULL DEFAULT 'My Workspace',
  owner_id   UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  members    JSONB       NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_workspaces ENABLE ROW LEVEL SECURITY;

-- 2. RLS 정책
-- owner: 전체 권한
DROP POLICY IF EXISTS "tw_owner_all" ON public.team_workspaces;
CREATE POLICY "tw_owner_all" ON public.team_workspaces
  FOR ALL USING (auth.uid() = owner_id);

-- member(pending/active): 자신이 속한 워크스페이스 조회 허용
DROP POLICY IF EXISTS "tw_member_select" ON public.team_workspaces;
CREATE POLICY "tw_member_select" ON public.team_workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(members) AS m
      WHERE m->>'uid' = auth.uid()::text
         OR m->>'id'  = auth.uid()::text
    )
  );

-- updated_at 자동 갱신 트리거
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_team_workspaces_updated_at'
  ) THEN
    CREATE TRIGGER set_team_workspaces_updated_at
      BEFORE UPDATE ON public.team_workspaces
      FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
  END IF;
END;
$$;

-- ============================================================
-- 3. RPC: create_workspace_for_user  (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_workspace_for_user(
  ws_name      TEXT,
  member_email TEXT DEFAULT '',
  member_name  TEXT DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    UUID := auth.uid();
  _member JSONB;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;

  _member := jsonb_build_object(
    'uid',      _uid::text,
    'id',       _uid::text,
    'email',    member_email,
    'name',     COALESCE(NULLIF(member_name, ''), '관리자'),
    'role',     'owner',
    'status',   'active',
    'joinedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  INSERT INTO public.team_workspaces (id, name, owner_id, members, created_at, updated_at)
  VALUES (_uid, COALESCE(NULLIF(ws_name, ''), 'My Workspace'), _uid,
          jsonb_build_array(_member), now(), now())
  ON CONFLICT (id) DO UPDATE
    SET name       = EXCLUDED.name,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace_for_user(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_workspace_for_user(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
-- 4. RPC: is_workspace_member  (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_workspace_member(owner_uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid    TEXT    := auth.uid()::text;
  _result BOOLEAN := false;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM   public.team_workspaces tw,
           jsonb_array_elements(tw.members) AS m
    WHERE  tw.id = owner_uid
      AND  (m->>'uid' = _uid OR m->>'id' = _uid)
      AND  m->>'status' = 'active'
  ) INTO _result;
  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated;

-- ============================================================
-- 5. RPC: workspace_add_member  (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.workspace_add_member(
  ws_id      UUID,
  new_member JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Auth required'; END IF;

  UPDATE public.team_workspaces
  SET    members    = members || jsonb_build_array(new_member),
         updated_at = now()
  WHERE  id = ws_id AND owner_id = _uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Permission denied or workspace not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_add_member(UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.workspace_add_member(UUID, JSONB) TO authenticated;

-- ============================================================
-- 6. RPC: workspace_set_member_status  (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.workspace_set_member_status(
  ws_id      UUID,
  member_uid UUID,
  new_status TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid         TEXT := member_uid::text;
  _cur_members JSONB;
  _new_members JSONB;
BEGIN
  SELECT members INTO _cur_members
  FROM   public.team_workspaces WHERE id = ws_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found'; END IF;

  SELECT jsonb_agg(
    CASE
      WHEN m->>'uid' = _uid OR m->>'id' = _uid
      THEN m || jsonb_build_object('status', new_status)
      ELSE m
    END
  )
  INTO _new_members
  FROM jsonb_array_elements(_cur_members) AS m;

  UPDATE public.team_workspaces
  SET    members    = COALESCE(_new_members, '[]'::jsonb),
         updated_at = now()
  WHERE  id = ws_id;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_set_member_status(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.workspace_set_member_status(UUID, UUID, TEXT) TO authenticated;

-- ============================================================
-- 7. RPC: workspace_remove_member  (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.workspace_remove_member(
  ws_id      UUID,
  member_uid UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid         TEXT  := member_uid::text;
  _cur_members JSONB;
  _owner_id    UUID;
  _new_members JSONB;
BEGIN
  SELECT members, owner_id INTO _cur_members, _owner_id
  FROM   public.team_workspaces WHERE id = ws_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace not found'; END IF;

  -- owner 본인 제거 방지
  IF _owner_id::text = _uid AND auth.uid()::text = _uid THEN
    RAISE EXCEPTION 'Cannot remove workspace owner';
  END IF;

  SELECT jsonb_agg(m)
  INTO   _new_members
  FROM   jsonb_array_elements(_cur_members) AS m
  WHERE  m->>'uid' <> _uid AND m->>'id' <> _uid;

  UPDATE public.team_workspaces
  SET    members    = COALESCE(_new_members, '[]'::jsonb),
         updated_at = now()
  WHERE  id = ws_id;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_remove_member(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.workspace_remove_member(UUID, UUID) TO authenticated;

-- ============================================================
-- 8. RPC: lookup_profile_for_invite  (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lookup_profile_for_invite(lookup_email TEXT)
RETURNS TABLE (id UUID, email TEXT, name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.email, p.name
  FROM   public.profiles p
  WHERE  lower(p.email) = lower(lookup_email)
  LIMIT  1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_profile_for_invite(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_profile_for_invite(TEXT) TO authenticated;
