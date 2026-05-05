-- ============================================================
-- INVEX Item-Code Normalization Migration (2026-04)
-- 목적:
-- 1) items 고유키를 item_name 중심에서 item_code 중심으로 전환
-- 2) transactions.item_id를 item_code 우선으로 정규화
-- 3) 재고/수불 집계 정확도를 높이고 품명 중복(코드 상이) 케이스 허용
--
-- 적용 전 체크:
-- - 백업 권장
-- - 트래픽 낮은 시간대 적용 권장
-- - 본 스크립트는 가능한 한 멱등적으로 작성됨
-- ============================================================

-- ------------------------------------------------------------
-- 0) 사전 점검 (참고용 SELECT)
-- ------------------------------------------------------------
-- 같은 user 내 item_code 중복 확인
-- SELECT user_id, item_code, COUNT(*)
-- FROM items
-- WHERE item_code IS NOT NULL AND btrim(item_code) <> ''
-- GROUP BY user_id, item_code
-- HAVING COUNT(*) > 1;

-- 같은 user 내 item_name 중복 확인 (코드 없는 항목)
-- SELECT user_id, item_name, COUNT(*)
-- FROM items
-- WHERE item_code IS NULL OR btrim(item_code) = ''
-- GROUP BY user_id, item_name
-- HAVING COUNT(*) > 1;

-- ------------------------------------------------------------
-- 1) 정규화 컬럼 보강
-- ------------------------------------------------------------
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS item_code_norm TEXT;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS item_code_norm TEXT;

-- ------------------------------------------------------------
-- 2) 정규화 값 백필
-- ------------------------------------------------------------
UPDATE items
SET item_code_norm = NULLIF(lower(regexp_replace(item_code, '\\s+', '', 'g')), '')
WHERE item_code IS NOT NULL;

UPDATE transactions
SET item_code_norm = NULLIF(lower(regexp_replace(item_code, '\\s+', '', 'g')), '')
WHERE item_code IS NOT NULL;

-- ------------------------------------------------------------
-- 3) 기존 제약 제거 (item_name 절대 유니크 해제)
--    참고: schema.sql의 UNIQUE(user_id, item_name)
-- ------------------------------------------------------------
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_user_id_item_name_key;

-- ------------------------------------------------------------
-- 4) 인덱스/유니크 전환
-- ------------------------------------------------------------
-- item_code 존재 시: user+item_code_norm 유니크
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_user_code_norm
  ON items(user_id, item_code_norm)
  WHERE item_code_norm IS NOT NULL;

-- item_code 미존재 시에만: 기존처럼 user+item_name 유니크 유지
CREATE UNIQUE INDEX IF NOT EXISTS uq_items_user_name_when_no_code
  ON items(user_id, item_name)
  WHERE item_code_norm IS NULL;

-- 조회 성능용
CREATE INDEX IF NOT EXISTS idx_items_user_code_norm
  ON items(user_id, item_code_norm)
  WHERE item_code_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_user_code_norm
  ON transactions(user_id, item_code_norm)
  WHERE item_code_norm IS NOT NULL;

-- ------------------------------------------------------------
-- 5) transactions.item_id 백필 (코드 우선, 이름 보조)
-- ------------------------------------------------------------
-- 5-1) item_code_norm 매칭 우선
UPDATE transactions t
SET item_id = i.id
FROM items i
WHERE t.user_id = i.user_id
  AND t.item_id IS NULL
  AND t.item_code_norm IS NOT NULL
  AND i.item_code_norm = t.item_code_norm;

-- 5-2) 아직 NULL인 건 item_name 보조 매칭
UPDATE transactions t
SET item_id = i.id
FROM items i
WHERE t.user_id = i.user_id
  AND t.item_id IS NULL
  AND (t.item_code_norm IS NULL)
  AND i.item_name = t.item_name;

-- ------------------------------------------------------------
-- 6) warehouse/vendor FK 보강 (누락분)
-- ------------------------------------------------------------
UPDATE transactions t
SET warehouse_id = w.id
FROM warehouses w
WHERE t.user_id = w.user_id
  AND t.warehouse_id IS NULL
  AND t.warehouse IS NOT NULL
  AND w.name = t.warehouse;

UPDATE transactions t
SET vendor_id = v.id
FROM vendors v
WHERE t.user_id = v.user_id
  AND t.vendor_id IS NULL
  AND t.vendor IS NOT NULL
  AND v.name = t.vendor;

-- ------------------------------------------------------------
-- 7) txn_date 백필 (텍스트 date 보정)
-- ------------------------------------------------------------
UPDATE transactions
SET txn_date = date::DATE
WHERE txn_date IS NULL
  AND date ~ '^\\d{4}-\\d{2}-\\d{2}$';

-- ------------------------------------------------------------
-- 8) item_stocks 재계산 (사용자별 안전 실행)
-- ------------------------------------------------------------
DO $$
DECLARE u RECORD;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM transactions LOOP
    BEGIN
      PERFORM set_config('request.jwt.claim.sub', u.user_id::text, true);
      PERFORM fn_recalculate_item_stocks(u.user_id);
    EXCEPTION WHEN OTHERS THEN
      -- 함수 내부 권한/인증 제약이 있으면 전체 중단 대신 스킵
      RAISE NOTICE 'fn_recalculate_item_stocks skipped for user %: %', u.user_id, SQLERRM;
    END;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 9) 검증 쿼리
-- ------------------------------------------------------------
-- A. 트랜잭션 중 item_id 미매핑 건수
-- SELECT COUNT(*) AS tx_without_item_id
-- FROM transactions
-- WHERE item_id IS NULL;

-- B. item_code_norm 중복(있으면 유니크 전환 충돌 가능성)
-- SELECT user_id, item_code_norm, COUNT(*)
-- FROM items
-- WHERE item_code_norm IS NOT NULL
-- GROUP BY user_id, item_code_norm
-- HAVING COUNT(*) > 1;

-- C. 재고 현황 핵심 공란 점검
-- SELECT
--   COUNT(*) AS total_items,
--   COUNT(*) FILTER (WHERE COALESCE(item_code, '') = '') AS blank_item_code,
--   COUNT(*) FILTER (WHERE COALESCE(vendor, '') = '') AS blank_vendor,
--   COUNT(*) FILTER (WHERE COALESCE(spec, '') = '') AS blank_spec,
--   COUNT(*) FILTER (WHERE COALESCE(color, '') = '') AS blank_color
-- FROM items;

-- D. 거래내역 기반 보강 가능 건수 (item에 비어있고 tx에는 값 있는 경우)
-- SELECT COUNT(DISTINCT i.id) AS fillable_by_tx
-- FROM items i
-- JOIN transactions t
--   ON t.user_id = i.user_id
--  AND (
--       (i.item_code_norm IS NOT NULL AND t.item_code_norm = i.item_code_norm)
--    OR (i.item_code_norm IS NULL AND t.item_name = i.item_name)
--  )
-- WHERE (COALESCE(i.vendor,'') = '' AND COALESCE(t.vendor,'') <> '')
--    OR (COALESCE(i.spec,'') = '' AND COALESCE(t.spec,'') <> '')
--    OR (COALESCE(i.color,'') = '' AND COALESCE(t.color,'') <> '');

-- ============================================================
-- 후속 권장:
-- 1) 앱 업로드 시 upsert conflict 기준을 user_id,item_code_norm 우선 사용
-- 2) item_code 없는 항목은 입력 단계에서 경고 또는 자동 생성 코드 부여
-- ============================================================
