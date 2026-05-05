-- ============================================================
-- INVEX — Stale Workspace Membership 정리
-- 실행: Supabase 대시보드 → SQL Editor → 전체 실행
-- 목적: joined_workspace_id가 오염된 user_settings 행 삭제
--       + team_workspaces에 active 상태로 남은 잘못된 멤버 제거
-- 생성: 2026-05-04
-- ============================================================

-- ============================================================
-- 1. 진단: 현재 joined_workspace_id 현황 확인 (실행 전 검토용)
-- ============================================================
/*
SELECT
  us.user_id,
  p.email,
  us.value AS joined_workspace_id,
  owner.email AS workspace_owner_email,
  CASE
    WHEN us.value::text = us.user_id::text THEN 'SELF (정상)'
    WHEN tw.id IS NULL                      THEN 'STALE (워크스페이스 없음)'
    WHEN NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(tw.members) m
      WHERE (m->>'uid' = us.user_id::text OR m->>'id' = us.user_id::text)
        AND m->>'status' = 'active'
    )                                        THEN 'STALE (멤버 아님)'
    ELSE 'VALID (정상 멤버)'
  END AS status
FROM user_settings us
JOIN profiles p ON p.id = us.user_id
LEFT JOIN team_workspaces tw ON tw.id = us.value::text
LEFT JOIN profiles owner ON owner.id = tw.owner_id::uuid
WHERE us.key = 'joined_workspace_id'
ORDER BY status;
*/

-- ============================================================
-- 2. Stale joined_workspace_id 삭제
--    - 해당 워크스페이스가 존재하지 않거나
--    - 해당 사용자가 active 멤버가 아닌 경우
-- ============================================================
DELETE FROM user_settings
WHERE key = 'joined_workspace_id'
  AND (
    -- 워크스페이스 자체가 없음
    NOT EXISTS (
      SELECT 1 FROM team_workspaces tw
      WHERE tw.id = user_settings.value::text
    )
    OR
    -- 워크스페이스는 있지만 active 멤버가 아님 + 오너도 아님
    NOT EXISTS (
      SELECT 1 FROM team_workspaces tw
      WHERE tw.id = user_settings.value::text
        AND (
          tw.owner_id = user_settings.user_id::text
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(tw.members) m
            WHERE (m->>'uid' = user_settings.user_id::text OR m->>'id' = user_settings.user_id::text)
              AND m->>'status' = 'active'
          )
        )
    )
  );

-- ============================================================
-- 3. team_workspaces.members에서 pending 상태 30일 초과 항목 제거
--    (방치된 초대장 정리)
-- ============================================================
UPDATE team_workspaces
SET members = COALESCE((
  SELECT jsonb_agg(m)
  FROM jsonb_array_elements(members) m
  WHERE NOT (
    m->>'status' = 'pending'
    AND (m->>'invitedAt')::timestamptz < now() - INTERVAL '30 days'
  )
), '[]'::jsonb),
updated_at = now()
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(members) m
  WHERE m->>'status' = 'pending'
    AND (m->>'invitedAt')::timestamptz < now() - INTERVAL '30 days'
);

-- ============================================================
-- 4. 결과 확인
-- ============================================================
SELECT
  'user_settings (joined_workspace_id)' AS table_name,
  COUNT(*) AS remaining_count
FROM user_settings
WHERE key = 'joined_workspace_id'
UNION ALL
SELECT
  'team_workspaces',
  COUNT(*)
FROM team_workspaces;
