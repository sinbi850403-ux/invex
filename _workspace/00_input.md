# INVEX ERP-Lite — DB 아키텍처 분석 입력

## 프로젝트 개요
- **서비스**: INVEX ERP-Lite — 중소기업용 재고·경영 관리 SaaS
- **DBMS**: PostgreSQL (Supabase 관리형)
- **대상 파일**: `supabase/schema.sql` (1647 lines) + `supabase/migrations/` 폴더

---

## 현재 테이블 목록 (29개)

| # | 테이블 | 설명 |
|---|--------|------|
| 1 | system_config | 시스템 설정 (admin_emails 등) |
| 2 | profiles | 사용자 프로필 (Supabase auth 확장) |
| 3 | warehouses | 창고 마스터 |
| 4 | items | 품목 마스터 |
| 5 | item_stocks | 창고별 현재고 캐시 (SoT) |
| 6 | safety_stocks | 안전재고 설정 |
| 7 | vendors | 거래처 마스터 |
| 8 | transactions | 입출고 이력 (type: in/out/loss/adjust) |
| 9 | transfers | 창고 간 이동 |
| 10 | stocktakes | 재고 실사 헤더 |
| 11 | stocktake_items | 재고 실사 라인 아이템 |
| 12 | audit_logs | 감사 로그 |
| 13 | account_entries | 매출/매입 장부 (receivable/payable) |
| 14 | purchase_orders | 발주서 헤더 |
| 15 | purchase_order_items | 발주서 라인 아이템 |
| 16 | pos_sales | POS 매출 |
| 17 | custom_fields | 커스텀 필드 정의 |
| 18 | user_settings | 사용자 설정 (KV) |
| 19 | team_workspaces | 팀 워크스페이스 (별도 마이그레이션) |
| 20 | workspace_members | 워크스페이스 멤버 (별도 마이그레이션) |
| 21 | departments | 부서 마스터 |
| 22 | employees | 직원 마스터 (PII: rrn_enc, account_no_enc) |
| 23 | attendance | 근태 기록 |
| 24 | payrolls | 급여 기록 |
| 25 | leaves | 휴가 신청 |
| 26 | salary_items | 수당/공제 마스터 |
| 27 | role_permissions | 역할별 기능 권한 행렬 |
| 28 | support_tickets | 고객 문의 |

---

## 현재 이슈 (분석 우선순위)

### 🔴 구조적 레거시 — 이중 컬럼 패턴
거의 모든 주요 테이블에 **TEXT 레거시 컬럼**과 **정규화된 UUID/DATE 컬럼**이 공존:
- `items.warehouse` (TEXT) ↔ `items.warehouse_id` (UUID FK)
- `transactions.date` (TEXT) ↔ `transactions.txn_date` (DATE)
- `transactions.vendor` (TEXT) ↔ `transactions.vendor_id` (UUID FK)
- `transactions.warehouse` (TEXT) ↔ `transactions.warehouse_id` (UUID FK)
- `transfers.date` (TEXT) ↔ `transfers.date_d` (DATE)
- `transfers.from_warehouse` (TEXT) ↔ `transfers.from_warehouse_id` (UUID FK)
- `transfers.to_warehouse` (TEXT) ↔ `transfers.to_warehouse_id` (UUID FK)
- `purchase_orders.items` (JSONB 레거시) ↔ `purchase_order_items` (정규화 테이블)
- `purchase_orders.order_date` (TEXT) ↔ `purchase_orders.order_date_d` (DATE)
- `stocktakes.details` (JSONB 레거시) ↔ `stocktake_items` (정규화 테이블)

### 🔴 재고 SoT 혼재
- `items.quantity` — 레거시 캐시 컬럼 (댓글: "item_stocks로 대체 예정")
- `item_stocks` — 트리거 기반 실시간 캐시 (실제 SoT)
- `mv_inventory_summary` — Materialized View가 `i.quantity`를 fallback으로 사용하여 SoT 혼란

### 🔴 암호화 불일치
- `schema.sql`의 `encrypt_rrn`, `set_employee_rrn`, `decrypt_rrn`, `set_employee_account_no`, `decrypt_account_no` 함수:
  → `current_setting('app.rrn_key')` 직접 사용, AES 버전 미지정 (기본 AES-128)
- `migrations/20260505c_vault_rrn_key.sql`: 동일 함수를 Vault 기반 + AES-256으로 업그레이드
  → schema.sql과 migration 간 **버전 충돌** — 재실행 시 schema.sql이 덮어씀

### 🟡 RLS — audit_logs 취약
- UPDATE/DELETE 정책 없음 (의도적): 감사로그 변조 불가
- 하지만 `audit_insert`는 `WITH CHECK (auth.uid() = user_id)` — user_id를 임의 UUID로 설정 가능?
- `audit_select`는 `user_id = auth.uid()` — 다른 사용자 로그는 볼 수 없음 (OK)

### 🟡 REPLICA IDENTITY FULL 보안 이슈
9개 테이블에 적용됨: items, transactions, vendors, transfers, account_entries, purchase_orders, stocktakes, user_settings, profiles
→ DELETE 시 OLD 행 전체가 Realtime 채널에 노출 (PII 포함 가능)

### 🟡 Materialized View 갱신 전략 미흡
- `mv_inventory_summary`, `mv_monthly_profit` — REFRESH 트리거 없음, 수동 CONCURRENTLY 필요
- 실시간성 요구 vs 비용 트레이드오프 미결정

### 🟡 인덱스 누락 가능 영역
- `employees(user_id, hire_date)` — 재직 기간 필터 없음
- `attendance(user_id, employee_id, work_date)` — 인덱스 있으나 work_date 범위 쿼리 성능 미검증
- `payrolls(employee_id, pay_year, pay_month)` — 인덱스 있음
- `support_tickets` — 인덱스 전혀 없음

### 🟢 잘 설계된 부분
- 모든 테이블 RLS 적용 (`auth.uid() = user_id`)
- SECURITY DEFINER 함수에 `SET search_path = public, pg_catalog, pg_temp` — search path injection 방지
- system_config 기반 admin 이메일 관리 (하드코딩 제거)
- item_stocks 트리거 로직이 INSERT/UPDATE/DELETE 3가지 케이스 모두 처리
- stocktake_items.diff_qty GENERATED ALWAYS AS 컬럼

---

## 분석 목표

1. **data-modeler**: 이중 컬럼 레거시 패턴 정리 방안, 최종 정규화 목표 스키마 설계
2. **migration-manager**: 레거시→정규화 무중단 마이그레이션 플랜 (Zero-downtime, 롤백 포함)
3. **db-performance-analyst**: 현재 인덱스 전략 평가, 쿼리 최적화, MV 갱신 전략
4. **security-auditor**: 암호화 일관성 검증, RLS 완전성, REPLICA IDENTITY 리스크, 감사 로그 무결성
5. **integration-reviewer**: 4개 영역 정합성 교차 검증, 운영 준비성 평가

---

## 기술 컨텍스트

- **Supabase 제약**: RLS 필수 (`auth.uid() = user_id`), Vault 가용, pgcrypto 설치됨
- **앱 언어**: React 18 + JavaScript (snake_case ↔ camelCase 변환은 db.js DAL에서 처리)
- **배포**: Vercel + Supabase (관리형 PostgreSQL)
- **현재 예상 규모**: 소규모 (수백~수천 rows), 향후 중소기업 수십 곳 운영 목표
- **핵심 쿼리 패턴**: user_id 필터 + 날짜 범위 + 카테고리/창고 집계
