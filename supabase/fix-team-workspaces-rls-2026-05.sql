-- ============================================================
-- team_workspaces RLS 정책 수정 (2026-05-04)
-- 오류: "new row violates row-level security policy for table 'team_workspaces'"
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- 1. team_workspaces 테이블 생성 (없는 경우)
CREATE TABLE IF NOT EXISTS team_workspaces (
  id         TEXT PRIMARY KEY,
  name       TEXT DEFAULT 'My Workspace',
  owner_id   TEXT NOT NULL,
  members    JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_workspaces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE team_workspaces REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. 기존 정책 전체 제거
DROP POLICY IF EXISTS "tw_select" ON team_workspaces;
DROP POLICY IF EXISTS "tw_insert" ON team_workspaces;
DROP POLICY IF EXISTS "tw_update" ON team_workspaces;
DROP POLICY IF EXISTS "tw_delete" ON team_workspaces;

-- 3. 정책 재생성
-- SELECT: 오너이거나 members 배열에 포함된 사람
CREATE POLICY "tw_select" ON team_workspaces FOR SELECT TO authenticated
  USING (
    auth.uid()::text = owner_id
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(members) AS m
      WHERE (m->>'uid') = auth.uid()::text
         OR (m->>'id')  = auth.uid()::text
    )
  );

-- INSERT: owner_id = 본인 UID 인 경우만 허용
CREATE POLICY "tw_insert" ON team_workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = owner_id);

-- UPDATE: 오너만 수정 가능
CREATE POLICY "tw_update" ON team_workspaces FOR UPDATE TO authenticated
  USING (auth.uid()::text = owner_id);

-- DELETE: 오너만 삭제 가능
CREATE POLICY "tw_delete" ON team_workspaces FOR DELETE TO authenticated
  USING (auth.uid()::text = owner_id);

-- 4. RPC 함수 (없는 경우 생성)
DROP FUNCTION IF EXISTS is_workspace_member(UUID);
CREATE OR REPLACE FUNCTION is_workspace_member(owner_uid UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = owner_uid THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM team_workspaces tw
    WHERE tw.id = owner_uid::text
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(tw.members) AS m
        WHERE ((m->>'uid') = auth.uid()::text OR (m->>'id') = auth.uid()::text)
          AND (m->>'status') = 'active'
      )
  );
END;
$$;

-- 멤버 추가 RPC
CREATE OR REPLACE FUNCTION workspace_add_member(ws_id TEXT, new_member JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws_owner TEXT;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION 'workspace not found'; END IF;
  IF ws_owner != auth.uid()::text THEN RAISE EXCEPTION 'only owner can invite'; END IF;
  UPDATE team_workspaces
    SET members = members || jsonb_build_array(new_member), updated_at = now()
    WHERE id = ws_id;
END;
$$;
GRANT EXECUTE ON FUNCTION workspace_add_member(TEXT, JSONB) TO authenticated;

-- 멤버 제거 RPC
CREATE OR REPLACE FUNCTION workspace_remove_member(ws_id TEXT, member_uid TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws_owner TEXT; caller TEXT := auth.uid()::text;
BEGIN
  SELECT owner_id INTO ws_owner FROM team_workspaces WHERE id = ws_id;
  IF ws_owner IS NULL THEN RAISE EXCEPTION 'workspace not found'; END IF;
  IF caller != ws_owner AND caller != member_uid THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF member_uid = ws_owner THEN RAISE EXCEPTION 'cannot remove owner'; END IF;
  UPDATE team_workspaces
    SET members = COALESCE((
      SELECT jsonb_agg(m) FROM jsonb_array_elements(members) m
      WHERE (m->>'uid') != member_uid AND (m->>'id') != member_uid
    ), '[]'::jsonb), updated_at = now()
    WHERE id = ws_id;
END;
$$;
GRANT EXECUTE ON FUNCTION workspace_remove_member(TEXT, TEXT) TO authenticated;

-- 멤버 상태 변경 RPC
CREATE OR REPLACE FUNCTION workspace_set_member_status(ws_id TEXT, member_uid TEXT, new_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE caller TEXT := auth.uid()::text;
BEGIN
  IF caller != member_uid THEN RAISE EXCEPTION 'can only change own status'; END IF;
  IF new_status NOT IN ('active', 'rejected') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE team_workspaces
    SET members = (
      SELECT jsonb_agg(
        CASE WHEN (m->>'uid') = member_uid OR (m->>'id') = member_uid
          THEN m || jsonb_build_object('status', new_status) ELSE m END
      ) FROM jsonb_array_elements(members) m
    ), updated_at = now()
    WHERE id = ws_id;
END;
$$;
GRANT EXECUTE ON FUNCTION workspace_set_member_status(TEXT, TEXT, TEXT) TO authenticated;

-- 5. 확인 쿼리
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'team_workspaces' ORDER BY cmd;
