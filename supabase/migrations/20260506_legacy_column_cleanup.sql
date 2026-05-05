-- ============================================================
-- INVEX ERP-Lite — 레거시 컬럼 정리 마이그레이션
-- 버전 체계: 20260506_V001 ~ V007
--
-- 실행 환경: Supabase 관리형 PostgreSQL
-- 실행 방법: Supabase Dashboard → SQL Editor
--            또는 supabase migration apply (dbmate 호환)
--
-- 주의사항:
--   1. 각 Phase는 독립 트랜잭션으로 실행 (BEGIN/COMMIT 포함)
--   2. Phase 1 → Phase 2 순서 엄수 (MV 재정의 후 DROP 필요)
--   3. 모든 DROP 전 사전 검증 쿼리 실행 필수 (count = 0 확인)
--   4. Supabase 브랜치 또는 pg_dump 스냅샷 후 실행 권고
-- ============================================================


-- ============================================================
-- [FS-01 필수 선행] v_ledger 뷰 재정의
-- V001에서 transactions.date, transactions.warehouse를 DROP하기 전에
-- 반드시 이 블록을 먼저 실행해야 합니다.
-- 뷰가 레거시 컬럼을 참조하고 있으면 V001 실행 즉시 뷰가 무효화됩니다.
-- ============================================================
CREATE OR REPLACE VIEW v_ledger WITH (security_invoker = on) AS
SELECT
  t.id, t.user_id,
  t.txn_date,
  t.type,
  t.item_id,
  t.item_name, t.item_code,
  t.category, t.spec, t.color, t.unit,
  t.quantity, t.unit_price,
  t.selling_price, t.actual_selling_price,
  t.supply_value, t.vat, t.total_amount,
  t.vendor        AS vendor_name_at_txn,
  t.vendor_id,
  v.name          AS vendor_name_current,
  t.warehouse_id,
  w.name          AS warehouse_name_current,
  ist.quantity    AS current_stock,
  t.note, t.created_at
FROM transactions t
LEFT JOIN vendors     v   ON v.id   = t.vendor_id
LEFT JOIN warehouses  w   ON w.id   = t.warehouse_id
LEFT JOIN item_stocks ist ON ist.item_id = t.item_id
                          AND ist.warehouse_id = t.warehouse_id;

DO $$ BEGIN
  RAISE NOTICE '[선행 완료] v_ledger 뷰 재정의 완료 — transactions.date/warehouse 참조 제거됨. V001 실행 가능.';
END $$;


-- ============================================================
-- [Phase 1-A] 사전 검증 쿼리
-- 각 SELECT COUNT(*)가 0을 반환해야 DROP 진행 가능
-- 실행 후 결과를 반드시 확인하세요
-- ============================================================

-- V001 실행 전 검증 (이 블록만 먼저 실행하여 0 확인)
SELECT 'transactions.date' AS check_target,
       COUNT(*) AS orphan_rows,
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END AS result
FROM transactions
WHERE txn_date IS NULL AND date IS NOT NULL

UNION ALL

SELECT 'transactions.warehouse',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM transactions
WHERE warehouse_id IS NULL AND warehouse IS NOT NULL

UNION ALL

SELECT 'transfers.date',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM transfers
WHERE date_d IS NULL AND date IS NOT NULL

UNION ALL

SELECT 'transfers.from_warehouse',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM transfers
WHERE from_warehouse_id IS NULL AND from_warehouse IS NOT NULL

UNION ALL

SELECT 'transfers.to_warehouse',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM transfers
WHERE to_warehouse_id IS NULL AND to_warehouse IS NOT NULL

UNION ALL

SELECT 'items.warehouse',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM items
WHERE warehouse_id IS NULL AND warehouse IS NOT NULL

UNION ALL

SELECT 'items.expiry_date',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM items
WHERE expiry_date_d IS NULL AND expiry_date IS NOT NULL
  AND expiry_date ~ '^\d{4}-\d{2}-\d{2}$'

UNION ALL

SELECT 'stocktakes.date',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM stocktakes
WHERE date_d IS NULL AND date IS NOT NULL

UNION ALL

SELECT 'pos_sales.sale_date',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM pos_sales
WHERE sale_date_d IS NULL AND sale_date IS NOT NULL

UNION ALL

SELECT 'purchase_orders.order_date',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM purchase_orders
WHERE order_date_d IS NULL AND order_date IS NOT NULL

UNION ALL

SELECT 'purchase_orders.expected_date',
       COUNT(*),
       CASE WHEN COUNT(*) = 0 THEN 'OK — DROP 가능' ELSE 'BLOCK — 백필 필요' END
FROM purchase_orders
WHERE expected_date_d IS NULL AND expected_date IS NOT NULL;

-- ============================================================
-- [Phase 1-B] 백필 누락 행 보정 (검증에서 BLOCK이 나온 경우만 실행)
-- schema.sql의 DO블록이 이미 실행됐다면 불필요하나, 안전장치로 포함
-- ============================================================

-- 트랜잭션 날짜 백필
DO $$ BEGIN
  UPDATE transactions SET txn_date = date::DATE
   WHERE txn_date IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
  RAISE NOTICE 'transactions.txn_date 백필 완료: % rows', (SELECT COUNT(*) FROM transactions WHERE txn_date IS NOT NULL);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'transactions 날짜 백필 오류: %', SQLERRM;
END $$;

-- 트랜잭션 warehouse_id 백필
DO $$ BEGIN
  UPDATE transactions t SET warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = t.user_id AND w.name = t.warehouse
     AND t.warehouse_id IS NULL AND t.warehouse IS NOT NULL;
  RAISE NOTICE 'transactions.warehouse_id 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'transactions warehouse 백필 오류: %', SQLERRM;
END $$;

-- transfers 날짜 백필
DO $$ BEGIN
  UPDATE transfers SET date_d = date::DATE
   WHERE date_d IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
  RAISE NOTICE 'transfers.date_d 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'transfers 날짜 백필 오류: %', SQLERRM;
END $$;

-- transfers warehouse 백필
DO $$ BEGIN
  UPDATE transfers tr SET from_warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = tr.user_id AND w.name = tr.from_warehouse
     AND tr.from_warehouse_id IS NULL AND tr.from_warehouse IS NOT NULL;
  UPDATE transfers tr SET to_warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = tr.user_id AND w.name = tr.to_warehouse
     AND tr.to_warehouse_id IS NULL AND tr.to_warehouse IS NOT NULL;
  RAISE NOTICE 'transfers warehouse_id 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'transfers warehouse 백필 오류: %', SQLERRM;
END $$;

-- items warehouse 백필
DO $$ BEGIN
  UPDATE items i SET warehouse_id = w.id
    FROM warehouses w
   WHERE w.user_id = i.user_id AND w.name = i.warehouse
     AND i.warehouse_id IS NULL AND i.warehouse IS NOT NULL;
  UPDATE items SET expiry_date_d = expiry_date::DATE
   WHERE expiry_date_d IS NULL AND expiry_date ~ '^\d{4}-\d{2}-\d{2}$';
  RAISE NOTICE 'items warehouse_id/expiry_date_d 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'items 백필 오류: %', SQLERRM;
END $$;

-- stocktakes 날짜 백필
DO $$ BEGIN
  UPDATE stocktakes SET date_d = date::DATE
   WHERE date_d IS NULL AND date ~ '^\d{4}-\d{2}-\d{2}$';
  RAISE NOTICE 'stocktakes.date_d 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'stocktakes 백필 오류: %', SQLERRM;
END $$;

-- pos_sales 날짜 백필
DO $$ BEGIN
  UPDATE pos_sales SET sale_date_d = sale_date::DATE
   WHERE sale_date_d IS NULL AND sale_date ~ '^\d{4}-\d{2}-\d{2}$';
  RAISE NOTICE 'pos_sales.sale_date_d 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pos_sales 백필 오류: %', SQLERRM;
END $$;

-- purchase_orders 날짜 백필
DO $$ BEGIN
  UPDATE purchase_orders SET order_date_d = order_date::DATE
   WHERE order_date_d IS NULL AND order_date ~ '^\d{4}-\d{2}-\d{2}$';
  UPDATE purchase_orders SET expected_date_d = expected_date::DATE
   WHERE expected_date_d IS NULL AND expected_date ~ '^\d{4}-\d{2}-\d{2}$';
  RAISE NOTICE 'purchase_orders 날짜 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'purchase_orders 백필 오류: %', SQLERRM;
END $$;


-- ============================================================
-- V001: transactions 레거시 컬럼 DROP
-- 의존: txn_date IS NOT NULL, warehouse_id 백필 완료
-- ============================================================
BEGIN;

-- 백업 테이블 생성 (롤백 시 복원 가능)
CREATE TABLE IF NOT EXISTS _bk_transactions_legacy_20260506 AS
SELECT id, date AS legacy_date, warehouse AS legacy_warehouse
FROM transactions
WHERE date IS NOT NULL OR warehouse IS NOT NULL;

-- 레거시 인덱스 DROP (date TEXT 기반)
DROP INDEX IF EXISTS idx_tx_date;
DROP INDEX IF EXISTS idx_tx_composite;
DROP INDEX IF EXISTS idx_tx_analysis;

-- 레거시 컬럼 DROP
ALTER TABLE transactions DROP COLUMN IF EXISTS date;
ALTER TABLE transactions DROP COLUMN IF EXISTS warehouse;

-- txn_date NOT NULL 강화 (모든 행에 txn_date가 채워진 것을 검증 후 실행)
-- NULL 행이 있으면 에러 발생 → 자동 롤백
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM transactions WHERE txn_date IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'txn_date IS NULL인 행이 존재합니다. 백필 후 재실행하세요.';
  END IF;
END $$;
ALTER TABLE transactions ALTER COLUMN txn_date SET NOT NULL;

-- [RS-01] idx_tx_analysis_v2: idx_tx_analysis(TEXT date 기반) DROP 후 대체 인덱스 즉시 생성
-- performance-analyst 권고: 대체 인덱스 없이 월별 분석 쿼리가 Seq Scan으로 전락하는 것 방지
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_analysis_v2
  ON transactions(user_id, type, txn_date DESC, category)
  INCLUDE (total_amount);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V001 완료: transactions.date/warehouse DROP, txn_date NOT NULL 강화, idx_tx_analysis_v2 생성';
END $$;


-- ============================================================
-- V002: transfers 레거시 컬럼 DROP
-- 의존: date_d, from/to_warehouse_id 백필 완료
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS _bk_transfers_legacy_20260506 AS
SELECT id,
       date AS legacy_date,
       from_warehouse AS legacy_from_warehouse,
       to_warehouse AS legacy_to_warehouse
FROM transfers
WHERE date IS NOT NULL OR from_warehouse IS NOT NULL OR to_warehouse IS NOT NULL;

-- 레거시 인덱스 DROP
DROP INDEX IF EXISTS idx_transfers_date;

-- 레거시 컬럼 DROP
ALTER TABLE transfers DROP COLUMN IF EXISTS date;
ALTER TABLE transfers DROP COLUMN IF EXISTS from_warehouse;
ALTER TABLE transfers DROP COLUMN IF EXISTS to_warehouse;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V002 완료: transfers 레거시 컬럼 3개 DROP';
END $$;


-- ============================================================
-- V003: items 레거시 컬럼 DROP
-- 의존: warehouse_id 백필 완료, expiry_date_d 백필 완료
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS _bk_items_legacy_20260506 AS
SELECT id,
       warehouse AS legacy_warehouse,
       expiry_date AS legacy_expiry_date
FROM items
WHERE warehouse IS NOT NULL OR expiry_date IS NOT NULL;

-- 레거시 인덱스 DROP (warehouse TEXT 기반)
DROP INDEX IF EXISTS idx_items_warehouse;

-- 레거시 컬럼 DROP
ALTER TABLE items DROP COLUMN IF EXISTS warehouse;
ALTER TABLE items DROP COLUMN IF EXISTS expiry_date;

-- idx_items_cat_name에서 quantity INCLUDE 제거는 Phase 2에서 quantity DROP 시 처리
-- (PostgreSQL은 INCLUDE 컬럼 DROP 시 인덱스 자동 재구성됨)

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V003 완료: items.warehouse, items.expiry_date DROP';
END $$;


-- ============================================================
-- V004: stocktakes 레거시 컬럼 DROP
-- 의존: date_d 백필 완료
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS _bk_stocktakes_legacy_20260506 AS
SELECT id, date AS legacy_date
FROM stocktakes
WHERE date IS NOT NULL;

ALTER TABLE stocktakes DROP COLUMN IF EXISTS date;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V004 완료: stocktakes.date DROP';
END $$;


-- ============================================================
-- V005: pos_sales 레거시 컬럼 DROP
-- 의존: sale_date_d 백필 완료
-- ============================================================
BEGIN;

-- pos_sales는 현재 idx_pos_user가 (user_id, sale_date DESC) 기반 — DROP 필요
DROP INDEX IF EXISTS idx_pos_user;

CREATE TABLE IF NOT EXISTS _bk_pos_sales_legacy_20260506 AS
SELECT id, sale_date AS legacy_sale_date
FROM pos_sales
WHERE sale_date IS NOT NULL;

ALTER TABLE pos_sales DROP COLUMN IF EXISTS sale_date;

-- sale_date_d 기반 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_pos_user_date ON pos_sales(user_id, sale_date_d DESC);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V005 완료: pos_sales.sale_date DROP, idx_pos_user_date 재생성';
END $$;


-- ============================================================
-- V006: purchase_orders 레거시 컬럼 DROP
-- 의존: order_date_d, expected_date_d 백필 완료
--       purchase_order_items 데이터 완전성 검증 (V006-A 실행 후)
-- ============================================================

-- [V006-A 사전 검증] purchase_orders.items JSONB 고아 행 확인
-- 결과가 0이어야 items JSONB 제거 가능
SELECT 'purchase_orders.items JSONB 고아 행' AS check_target,
       COUNT(*) AS orphan_count,
       CASE WHEN COUNT(*) = 0 THEN 'OK — items 컬럼 DROP 가능'
            ELSE 'BLOCK — purchase_order_items로 마이그레이션 필요' END AS result
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
WHERE (po.items IS NOT NULL AND po.items != '[]'::jsonb AND po.items != 'null'::jsonb)
  AND poi.id IS NULL;

-- [V006-A 보정] JSONB → purchase_order_items 마이그레이션 (고아 행이 있는 경우)
DO $$ BEGIN
  INSERT INTO purchase_order_items (user_id, order_id, item_name, quantity, unit_price)
  SELECT
    po.user_id,
    po.id AS order_id,
    item_obj->>'item_name' AS item_name,
    COALESCE((item_obj->>'quantity')::NUMERIC, 0) AS quantity,
    COALESCE((item_obj->>'unit_price')::NUMERIC, 0) AS unit_price
  FROM purchase_orders po,
       jsonb_array_elements(
         CASE WHEN jsonb_typeof(po.items) = 'array' THEN po.items ELSE '[]'::jsonb END
       ) AS item_obj
  WHERE (po.items IS NOT NULL AND po.items != '[]'::jsonb AND po.items != 'null'::jsonb)
    AND NOT EXISTS (
      SELECT 1 FROM purchase_order_items poi WHERE poi.order_id = po.id
    )
    AND (item_obj->>'item_name') IS NOT NULL;
  RAISE NOTICE 'purchase_orders.items JSONB 보정 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'JSONB 보정 오류: %', SQLERRM;
END $$;

-- [V006-B] purchase_orders.idx_po_status가 order_date TEXT 참조 — 재생성 필요
-- 현재: idx_po_status ON purchase_orders(user_id, status, order_date DESC) WHERE status != 'completed'
-- 변경: order_date_d DATE 기반으로 재생성
BEGIN;

CREATE TABLE IF NOT EXISTS _bk_purchase_orders_legacy_20260506 AS
SELECT id,
       order_date AS legacy_order_date,
       expected_date AS legacy_expected_date,
       items AS legacy_items_jsonb,
       note AS legacy_note
FROM purchase_orders
WHERE order_date IS NOT NULL OR expected_date IS NOT NULL
   OR (items IS NOT NULL AND items != '[]'::jsonb);

-- order_date TEXT 기반 인덱스 재생성 (TEXT 기반 인덱스 없으나 안전하게 처리)
DROP INDEX IF EXISTS idx_po_status;

-- 레거시 컬럼 DROP
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS order_date;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS expected_date;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS items;

-- note → notes 통합 (두 컬럼 공존 상태 해결)
-- note 데이터를 notes로 COALESCE 병합 후 note DROP
UPDATE purchase_orders
   SET notes = COALESCE(notes, note)
 WHERE note IS NOT NULL AND notes IS NULL;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS note;

-- order_date_d 기반 인덱스 재생성
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(user_id, status, order_date_d DESC)
  WHERE status != 'completed';

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V006 완료: purchase_orders 레거시 컬럼 DROP, note → notes 통합';
END $$;


-- ============================================================
-- V007: support_tickets 인덱스 추가 (현재 누락 상태)
-- Phase 1 마무리 — 성능 개선 마이그레이션
-- ============================================================
BEGIN;

CREATE INDEX IF NOT EXISTS idx_tickets_user   ON support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status, created_at DESC);

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V007 완료: support_tickets 인덱스 2개 추가';
END $$;


-- ============================================================
-- [Phase 1 완료 검증 쿼리]
-- 아래 쿼리를 실행하여 모든 레거시 컬럼이 제거되었는지 확인
-- ============================================================
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
       (table_name = 'transactions'    AND column_name IN ('date', 'warehouse'))
    OR (table_name = 'transfers'       AND column_name IN ('date', 'from_warehouse', 'to_warehouse'))
    OR (table_name = 'items'           AND column_name IN ('warehouse', 'expiry_date'))
    OR (table_name = 'stocktakes'      AND column_name = 'date')
    OR (table_name = 'pos_sales'       AND column_name = 'sale_date')
    OR (table_name = 'purchase_orders' AND column_name IN ('order_date', 'expected_date', 'items', 'note'))
  )
ORDER BY table_name, column_name;
-- 결과가 0행이면 Phase 1 완료


-- ============================================================
-- [Phase 2-A] 사전 검증
-- mv_inventory_summary 재정의 전 items.quantity fallback 의존 행 확인
-- ============================================================

-- MV에서 items.quantity fallback이 실제 사용되는 행 확인
-- (item_stocks에 없는데 items.quantity가 있는 품목)
SELECT COUNT(*) AS items_without_stock_rows,
       CASE WHEN COUNT(*) = 0 THEN 'OK — MV fallback 없음'
            ELSE '확인 필요 — item_stocks 백필 권고' END AS result
FROM items i
WHERE NOT EXISTS (
  SELECT 1 FROM item_stocks ist WHERE ist.item_id = i.id
)
AND i.quantity > 0;

-- purchase_order_items 데이터 완전성 재확인
SELECT COUNT(*) AS orphan_po_items,
       CASE WHEN COUNT(*) = 0 THEN 'OK — items JSONB 완전 전환'
            ELSE '주의 — 아직 JSONB에만 있는 발주 존재' END AS result
FROM purchase_orders po
LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
WHERE (po.items IS NOT NULL AND po.items != '[]'::jsonb AND po.items != 'null'::jsonb)
  AND poi.id IS NULL;

-- stocktake_items 데이터 완전성 확인
SELECT COUNT(*) AS orphan_stocktakes,
       CASE WHEN COUNT(*) = 0 THEN 'OK — details JSONB 완전 전환'
            ELSE '주의 — 아직 JSONB에만 있는 실사 존재' END AS result
FROM stocktakes st
LEFT JOIN stocktake_items sti ON sti.stocktake_id = st.id
WHERE (st.details IS NOT NULL AND st.details != '[]'::jsonb)
  AND sti.id IS NULL;

-- employees.dept → department_id 전환 완료 여부 확인
SELECT COUNT(*) AS dept_backfill_needed,
       CASE WHEN COUNT(*) = 0 THEN 'OK — 모든 dept 컬럼 전환 완료'
            ELSE 'BLOCK — dept 컬럼에 데이터가 있으나 department_id 미전환' END AS result
FROM employees
WHERE department_id IS NULL AND dept IS NOT NULL;


-- ============================================================
-- V008: mv_inventory_summary 재정의 (items.quantity fallback 제거)
-- 선행 조건: Phase 2-A 검증 모두 OK 확인 후 실행
-- ============================================================
BEGIN;

-- MV에서 직접 SELECT 차단 (security_invoker 뷰를 통해서만 접근)
DROP MATERIALIZED VIEW IF EXISTS mv_inventory_summary;

CREATE MATERIALIZED VIEW mv_inventory_summary AS
SELECT
  i.user_id,
  i.id            AS item_id,
  i.item_name,
  i.item_code,
  i.category,
  i.unit,
  COALESCE(SUM(ist.quantity), 0)                          AS quantity,
  i.unit_price,
  i.min_stock,
  CASE
    WHEN i.min_stock IS NOT NULL
         AND COALESCE(SUM(ist.quantity), 0) <= i.min_stock
    THEN true
    ELSE false
  END                                                     AS is_low_stock,
  COUNT(DISTINCT t.id)                                    AS tx_count_90d,
  MAX(t.txn_date)                                         AS last_tx_date
FROM items i
LEFT JOIN item_stocks  ist ON ist.item_id = i.id
LEFT JOIN transactions t   ON t.item_id   = i.id
                           AND t.txn_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY i.id, i.user_id, i.item_name, i.item_code, i.category,
         i.unit, i.unit_price, i.min_stock
WITH DATA;

CREATE UNIQUE INDEX mv_inventory_summary_pk ON mv_inventory_summary(user_id, item_id);
CREATE INDEX mv_inventory_summary_low ON mv_inventory_summary(user_id) WHERE is_low_stock = true;

-- security_invoker 래퍼 뷰 재생성 (items.warehouse 제거에 따른 컬럼 변경 반영)
CREATE OR REPLACE VIEW public.v_my_inventory_summary
WITH (security_invoker = true)
AS
  SELECT * FROM public.mv_inventory_summary
  WHERE user_id = auth.uid();

GRANT SELECT ON public.v_my_inventory_summary TO authenticated;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V008 완료: mv_inventory_summary 재정의 (items.quantity fallback 제거, items.warehouse 참조 제거)';
END $$;


-- ============================================================
-- V009: items.quantity DROP + 연관 인덱스 정리
-- 선행 조건: V008 완료, item_stocks에 데이터 100% 존재 확인 후
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS _bk_items_quantity_20260506 AS
SELECT id AS item_id, quantity AS legacy_quantity
FROM items
WHERE quantity != 0;

-- items.quantity 기반 인덱스 DROP
DROP INDEX IF EXISTS idx_items_low_stock;         -- WHERE quantity <= min_stock
DROP INDEX IF EXISTS idx_items_cat_name;          -- INCLUDE (quantity, ...)

-- idx_items_cat_name 재생성 (quantity INCLUDE 제거)
CREATE INDEX IF NOT EXISTS idx_items_cat_name ON items(user_id, category, item_name)
  INCLUDE (unit_price, min_stock);

-- items.quantity 컬럼 DROP
ALTER TABLE items DROP COLUMN IF EXISTS quantity;

-- item_stocks 기반 안전재고 미달 인덱스 추가
-- (기존 idx_items_low_stock의 역할을 item_stocks 테이블로 이전)
-- v_low_stock_alert 뷰가 이미 item_stocks 기반으로 작동하므로 추가 인덱스 불필요

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V009 완료: items.quantity DROP, idx_items_low_stock DROP, idx_items_cat_name 재생성';
END $$;


-- ============================================================
-- V010: employees 레거시 컬럼 DROP
-- 선행 조건: department_id 백필 완료, account_no 평문 암호화 완료
-- ============================================================

-- [V010-A] employees.dept 백필 (department_id IS NULL인 경우)
DO $$ BEGIN
  -- dept 이름과 일치하는 departments.name으로 FK 설정
  UPDATE employees e SET department_id = d.id
    FROM departments d
   WHERE d.user_id = e.user_id AND d.name = e.dept
     AND e.department_id IS NULL AND e.dept IS NOT NULL;
  RAISE NOTICE 'employees.department_id 백필 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'employees dept 백필 오류: %', SQLERRM;
END $$;

-- [V010-A 검증] — 0이어야 DROP 가능
SELECT COUNT(*) AS dept_orphan,
       CASE WHEN COUNT(*) = 0 THEN 'OK — dept DROP 가능'
            ELSE 'BLOCK — dept 데이터가 department_id로 미전환' END AS result
FROM employees WHERE department_id IS NULL AND dept IS NOT NULL;

-- account_no 평문 잔여 확인
SELECT COUNT(*) AS account_no_plaintext_remaining,
       CASE WHEN COUNT(*) = 0 THEN 'OK — account_no DROP 가능'
            ELSE '주의 — 평문이 남아있음, set_employee_account_no RPC 실행 필요' END AS result
FROM employees WHERE account_no IS NOT NULL;

BEGIN;

CREATE TABLE IF NOT EXISTS _bk_employees_legacy_20260506 AS
SELECT id AS employee_id,
       dept AS legacy_dept,
       account_no AS legacy_account_no_plaintext
FROM employees
WHERE dept IS NOT NULL OR account_no IS NOT NULL;

-- [FS-02 보안 필수] 백업 테이블 생성 즉시 동일 트랜잭션에서 RLS 적용
-- security-auditor V-04: account_no 평문이 RLS 없이 노출되는 시간 창 제거
-- CREATE TABLE AS는 기본적으로 RLS 비활성화 상태이므로 반드시 즉시 활성화해야 함
ALTER TABLE _bk_employees_legacy_20260506 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "_bk_emp_admin_only" ON _bk_employees_legacy_20260506;
CREATE POLICY "_bk_emp_admin_only" ON _bk_employees_legacy_20260506
  FOR ALL USING (check_admin_email());

-- 레거시 인덱스 DROP
DROP INDEX IF EXISTS idx_emp_dept;   -- (user_id, dept TEXT) 기반

ALTER TABLE employees DROP COLUMN IF EXISTS dept;
ALTER TABLE employees DROP COLUMN IF EXISTS account_no;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V010 완료: employees.dept/account_no DROP, _bk_employees_legacy RLS 즉시 적용';
END $$;


-- ============================================================
-- V011: stocktakes.details JSONB DROP
-- 선행 조건: stocktake_items 데이터 완전성 검증 완료
-- ============================================================

-- [V011-A] JSONB → stocktake_items 보정
DO $$ BEGIN
  INSERT INTO stocktake_items (user_id, stocktake_id, item_name, system_qty, actual_qty, unit_price)
  SELECT
    st.user_id,
    st.id AS stocktake_id,
    item_obj->>'item_name' AS item_name,
    COALESCE((item_obj->>'system_qty')::NUMERIC, 0) AS system_qty,
    COALESCE((item_obj->>'actual_qty')::NUMERIC, 0) AS actual_qty,
    COALESCE((item_obj->>'unit_price')::NUMERIC, 0) AS unit_price
  FROM stocktakes st,
       jsonb_array_elements(
         CASE WHEN jsonb_typeof(st.details) = 'array' THEN st.details ELSE '[]'::jsonb END
       ) AS item_obj
  WHERE (st.details IS NOT NULL AND st.details != '[]'::jsonb)
    AND NOT EXISTS (
      SELECT 1 FROM stocktake_items sti WHERE sti.stocktake_id = st.id
    )
    AND (item_obj->>'item_name') IS NOT NULL;
  RAISE NOTICE 'stocktakes.details JSONB 보정 완료';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'stocktakes JSONB 보정 오류: %', SQLERRM;
END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS _bk_stocktakes_details_20260506 AS
SELECT id AS stocktake_id, details AS legacy_details_jsonb
FROM stocktakes
WHERE details IS NOT NULL AND details != '[]'::jsonb;

ALTER TABLE stocktakes DROP COLUMN IF EXISTS details;

COMMIT;

DO $$ BEGIN
  RAISE NOTICE 'V011 완료: stocktakes.details JSONB DROP';
END $$;


-- ============================================================
-- [Phase 2 완료 검증 쿼리]
-- ============================================================
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
       (table_name = 'items'       AND column_name = 'quantity')
    OR (table_name = 'purchase_orders' AND column_name = 'items')
    OR (table_name = 'stocktakes'  AND column_name = 'details')
    OR (table_name = 'employees'   AND column_name IN ('dept', 'account_no'))
  )
ORDER BY table_name, column_name;
-- 결과가 0행이면 Phase 2 완료


-- ============================================================
-- [Phase 3] transfers FK NOT NULL 강화 (Phase 1 완료 후 실행)
-- 선행 조건: transfers 테이블에 date_d IS NULL인 행이 없음을 확인
-- ============================================================

-- 사전 검증
SELECT
  'transfers.date_d NULL' AS check_target,
  COUNT(*) AS null_count,
  CASE WHEN COUNT(*) = 0 THEN 'OK — NOT NULL 강화 가능'
       ELSE 'BLOCK' END AS result
FROM transfers WHERE date_d IS NULL

UNION ALL

SELECT 'transfers.item_id NULL', COUNT(*),
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCK' END
FROM transfers WHERE item_id IS NULL

UNION ALL

SELECT 'transfers.from_warehouse_id NULL', COUNT(*),
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCK' END
FROM transfers WHERE from_warehouse_id IS NULL

UNION ALL

SELECT 'transfers.to_warehouse_id NULL', COUNT(*),
  CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'BLOCK' END
FROM transfers WHERE to_warehouse_id IS NULL;

-- 검증 통과 후 실행
-- BEGIN;
-- ALTER TABLE transfers ALTER COLUMN date_d SET NOT NULL;
-- ALTER TABLE transfers ALTER COLUMN item_id SET NOT NULL;
-- ALTER TABLE transfers ALTER COLUMN from_warehouse_id SET NOT NULL;
-- ALTER TABLE transfers ALTER COLUMN to_warehouse_id SET NOT NULL;
-- COMMIT;

-- transactions.item_id NOT NULL 강화 (Phase 3)
SELECT COUNT(*) AS tx_item_id_null,
       CASE WHEN COUNT(*) = 0 THEN 'OK — NOT NULL 강화 가능'
            ELSE 'BLOCK — item_id IS NULL 행 처리 필요' END AS result
FROM transactions WHERE item_id IS NULL;

-- 검증 통과 후 실행
-- BEGIN;
-- ALTER TABLE transactions ALTER COLUMN item_id SET NOT NULL;
-- COMMIT;


-- ============================================================
-- [schema.sql 암호화 함수 충돌 해결]
-- schema.sql 섹션 32의 encrypt_rrn, set_employee_rrn, decrypt_rrn,
-- set_employee_account_no, decrypt_account_no 함수가
-- 20260505_security_patch.sql + 20260505c_vault_rrn_key.sql의
-- Vault 기반 업그레이드 버전을 덮어씁니다.
--
-- 해결책: schema.sql을 "초기화 전용"으로 표시하는 버전 체크 함수 설치
-- schema.sql 재실행 시 이 함수가 있으면 섹션 32 실행을 건너뜁니다.
-- ============================================================

-- 마이그레이션 버전 추적 테이블 (schema.sql 재실행 방지용)
CREATE TABLE IF NOT EXISTS _schema_migration_guard (
  migration_key TEXT PRIMARY KEY,
  applied_at    TIMESTAMPTZ DEFAULT now(),
  description   TEXT
);

-- 이미 Vault 마이그레이션이 적용됐음을 기록
INSERT INTO _schema_migration_guard (migration_key, description)
VALUES
  ('vault_rrn_key_20260505c', 'Vault 기반 암호화 함수: get_rrn_key + AES-256 — schema.sql 재실행으로 덮어쓰기 금지'),
  ('security_patch_20260505', 'decrypt_rrn/decrypt_account_no role check — schema.sql 재실행으로 덮어쓰기 금지')
ON CONFLICT (migration_key) DO NOTHING;

-- schema.sql 섹션 32 "안전 버전" 덮어쓰기 방지 함수
-- schema.sql을 재실행해야 하는 경우, 아래 함수가 존재하면
-- 섹션 32의 CREATE OR REPLACE FUNCTION encrypt_rrn 블록을 주석 처리하거나
-- 이 함수로 대체하세요.
CREATE OR REPLACE FUNCTION public.is_vault_migration_applied(migration_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public._schema_migration_guard
    WHERE _schema_migration_guard.migration_key = is_vault_migration_applied.migration_key
  );
END;
$$;

-- 실제 충돌 해결: Vault 기반 함수를 schema.sql보다 나중에 재실행하여 덮어씁니다.
-- schema.sql이 재실행된 경우를 감지하고 Vault 버전으로 복원하는 함수:
CREATE OR REPLACE FUNCTION public.restore_vault_crypto_functions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- encrypt_rrn이 GUC 방식인지 Vault 방식인지 확인 (소스에 'get_rrn_key' 포함 여부)
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_rrn_key'
  ) THEN
    RAISE EXCEPTION 'get_rrn_key() 함수가 없습니다. 20260505c_vault_rrn_key.sql을 먼저 실행하세요.';
  END IF;

  RAISE NOTICE '암호화 함수 상태: get_rrn_key() 존재 확인됨. Vault 기반 버전이 활성 상태입니다.';
  RAISE NOTICE '만약 schema.sql이 재실행되어 함수가 덮어씌워진 경우: supabase/migrations/20260505c_vault_rrn_key.sql을 재실행하세요.';
END;
$$;

SELECT public.restore_vault_crypto_functions();


-- ============================================================
-- [Phase 1 롤백 스크립트 — 비상시 사용]
-- 백업 테이블에서 레거시 컬럼 데이터 복원
-- ============================================================

-- V001 롤백 (transactions)
-- BEGIN;
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS date TEXT;
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS warehouse TEXT;
-- UPDATE transactions t
--    SET date = b.legacy_date,
--        warehouse = b.legacy_warehouse
--   FROM _bk_transactions_legacy_20260506 b
--  WHERE b.id = t.id;
-- ALTER TABLE transactions ALTER COLUMN txn_date DROP NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_tx_date      ON transactions(user_id, date DESC);
-- CREATE INDEX IF NOT EXISTS idx_tx_composite ON transactions(user_id, date DESC, type);
-- CREATE INDEX IF NOT EXISTS idx_tx_analysis  ON transactions(user_id, type, date DESC, category) INCLUDE (total_amount);
-- COMMIT;

-- V002 롤백 (transfers)
-- BEGIN;
-- ALTER TABLE transfers ADD COLUMN IF NOT EXISTS date TEXT;
-- ALTER TABLE transfers ADD COLUMN IF NOT EXISTS from_warehouse TEXT;
-- ALTER TABLE transfers ADD COLUMN IF NOT EXISTS to_warehouse TEXT;
-- UPDATE transfers t
--    SET date = b.legacy_date,
--        from_warehouse = b.legacy_from_warehouse,
--        to_warehouse = b.legacy_to_warehouse
--   FROM _bk_transfers_legacy_20260506 b WHERE b.id = t.id;
-- CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(user_id, date DESC);
-- COMMIT;

-- V003 롤백 (items)
-- BEGIN;
-- ALTER TABLE items ADD COLUMN IF NOT EXISTS warehouse TEXT;
-- ALTER TABLE items ADD COLUMN IF NOT EXISTS expiry_date TEXT;
-- UPDATE items i SET warehouse = b.legacy_warehouse, expiry_date = b.legacy_expiry_date
--   FROM _bk_items_legacy_20260506 b WHERE b.id = i.id;
-- CREATE INDEX IF NOT EXISTS idx_items_warehouse ON items(user_id, warehouse);
-- COMMIT;

-- V004 롤백 (stocktakes)
-- BEGIN;
-- ALTER TABLE stocktakes ADD COLUMN IF NOT EXISTS date TEXT;
-- UPDATE stocktakes s SET date = b.legacy_date FROM _bk_stocktakes_legacy_20260506 b WHERE b.id = s.id;
-- COMMIT;

-- V005 롤백 (pos_sales)
-- BEGIN;
-- ALTER TABLE pos_sales ADD COLUMN IF NOT EXISTS sale_date TEXT;
-- UPDATE pos_sales p SET sale_date = b.legacy_sale_date FROM _bk_pos_sales_legacy_20260506 b WHERE b.id = p.id;
-- DROP INDEX IF EXISTS idx_pos_user_date;
-- CREATE INDEX IF NOT EXISTS idx_pos_user ON pos_sales(user_id, sale_date DESC);
-- COMMIT;

-- V006 롤백 (purchase_orders)
-- BEGIN;
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS order_date TEXT;
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_date TEXT;
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
-- ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS note TEXT;
-- UPDATE purchase_orders p
--    SET order_date = b.legacy_order_date,
--        expected_date = b.legacy_expected_date,
--        items = b.legacy_items_jsonb,
--        note = b.legacy_note
--   FROM _bk_purchase_orders_legacy_20260506 b WHERE b.id = p.id;
-- DROP INDEX IF EXISTS idx_po_status;
-- CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(user_id, status, order_date DESC) WHERE status != 'completed';
-- COMMIT;

-- [Phase 2 롤백 스크립트]

-- V008 롤백 (mv_inventory_summary — items.quantity fallback 복원)
-- BEGIN;
-- DROP MATERIALIZED VIEW IF EXISTS mv_inventory_summary;
-- CREATE MATERIALIZED VIEW mv_inventory_summary AS
-- SELECT i.user_id, i.id AS item_id, i.item_name, i.category, i.warehouse,
--   COALESCE(SUM(ist.quantity), i.quantity, 0) AS quantity,
--   i.unit_price, i.min_stock,
--   CASE WHEN i.min_stock IS NOT NULL AND COALESCE(SUM(ist.quantity), i.quantity, 0) <= i.min_stock
--        THEN true ELSE false END AS is_low_stock,
--   COUNT(DISTINCT t.id) AS tx_count_90d, MAX(t.txn_date) AS last_tx_date
-- FROM items i
-- LEFT JOIN item_stocks ist ON ist.item_id = i.id
-- LEFT JOIN transactions t ON t.item_id = i.id AND t.txn_date >= CURRENT_DATE - INTERVAL '90 days'
-- GROUP BY i.id, i.user_id, i.item_name, i.category, i.warehouse, i.unit_price, i.min_stock, i.quantity
-- WITH DATA;
-- CREATE UNIQUE INDEX mv_inventory_summary_pk ON mv_inventory_summary(user_id, item_id);
-- COMMIT;
-- 주의: items.quantity가 이미 DROP됐다면 위 롤백 불가. _bk_items_quantity_20260506에서 복원 필요.

-- V009 롤백 (items.quantity 복원)
-- BEGIN;
-- ALTER TABLE items ADD COLUMN IF NOT EXISTS quantity NUMERIC(15,4) NOT NULL DEFAULT 0;
-- UPDATE items i SET quantity = b.legacy_quantity FROM _bk_items_quantity_20260506 b WHERE b.item_id = i.id;
-- CREATE INDEX IF NOT EXISTS idx_items_low_stock ON items(user_id) WHERE quantity <= min_stock;
-- COMMIT;
