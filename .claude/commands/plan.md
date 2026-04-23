---
description: 새 기능 설계 — 요구사항 정리, 위험 분석, 단계별 계획 수립. 코드는 확인 후에만 건드림.
argument-hint: <기능 설명>
---

# /plan — INVEX 기능 기획

코드를 **한 줄도 건드리기 전에** 반드시 계획을 세운다.

## 진행 순서

### 1단계: 요구사항 정리
- 무엇을 만드는지 한 문장으로 재정의
- 사용자 시나리오 (누가, 어떤 상황에서, 무엇을 하는지)
- 완료 기준 (언제 "다 됐다"고 할 수 있는지)

### 2단계: INVEX 코드베이스 분석
현재 구조에서 영향받는 파일 파악:
- `src/main.js` — 라우팅/페이지 등록 필요 여부
- `src/store.js` — 새 상태 필요 여부
- `src/db.js` — 새 DB 테이블/쿼리 필요 여부
- `supabase/schema.sql` — 스키마 변경 필요 여부
- `src/plan.js` — 요금제(Free/Pro/Enterprise) 제한 추가 여부
- `src/page-hubs.js` — 허브 메뉴 추가 여부
- React 페이지 (`src/react/pages/`) — React 전환 대상인지

### 3단계: DB 스키마 설계 (변경 시)
```sql
-- 새 테이블 또는 컬럼 DDL 초안
-- RLS 정책 포함
```

### 4단계: 구현 단계 분해
- Phase 1: DB 스키마 (Supabase)
- Phase 2: store.js 상태 추가
- Phase 3: db.js CRUD 함수
- Phase 4: page-*.js UI 구현
- Phase 5: main.js 라우팅 등록
- Phase 6: 테스트 및 검증

### 5단계: 위험 평가
| 위험도 | 항목 | 대응 방법 |
|--------|------|----------|
| HIGH | 기존 RLS 정책 충돌 | 테스트 환경에서 먼저 확인 |
| MEDIUM | store.js 상태 충돌 | 기존 키 사용 금지, 새 키 추가 |
| LOW | UI 스타일 충돌 | style.css 클래스 중복 확인 |

### 6단계: 예상 복잡도
- **LOW**: 1개 파일, 단순 CRUD
- **MEDIUM**: 2-4개 파일, 새 DB 테이블
- **HIGH**: 5개 이상 파일, 아키텍처 변경

---

## ⚠️ 확인 대기

계획을 제시한 후 **반드시 사용자 승인을 기다린다**.
승인 전까지 파일을 수정하거나 생성하지 않는다.

응답 옵션:
- `"진행"` 또는 `"yes"` → 계획대로 구현 시작
- `"수정: [내용]"` → 계획 수정 후 재제시
- `"다른 방법: [내용]"` → 대안 계획 제시

---

## 예시

```
User: /plan 고객별 매출 통계 페이지 추가

Plan:
# 기능 계획: 고객별 매출 통계

## 요구사항
거래처별 매출/매입 합계를 한눈에 볼 수 있는 페이지

## 영향 파일
- src/page-accounts.js (기존 매출 데이터 재활용)
- src/page-hubs.js (허브 메뉴 추가)
- src/main.js (라우팅 등록)
- src/plan.js (Pro 이상 제한)

## 구현 단계
Phase 1: 데이터 집계 로직 (store.js 셀렉터)
Phase 2: page-vendor-stats.js 신규 생성
Phase 3: 차트 추가 (charts.js 활용)

복잡도: LOW
예상 시간: 2-3시간

진행할까요?
```
