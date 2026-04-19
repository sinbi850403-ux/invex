# INVEX ERP-Lite — 프로젝트 가이드

> **INVEX**는 중소기업 맞춤 재고·경영 관리 SaaS 플랫폼입니다.
> 인사, 재고, 급여, 매출/매입, 세무 등 실질적인 비즈니스 운영에 필요한 기능을 하나의 웹 앱에서 제공합니다.

---

## 1. 프로젝트 개요

| 항목 | 설명 |
|------|------|
| **프로젝트명** | INVEX (인벡스) |
| **유형** | SPA (Single Page Application) — 순수 Vanilla JS |
| **프레임워크** | 없음 (React/Vue 없이 Vanilla JS + Vite 번들링) |
| **백엔드** | Supabase (PostgreSQL + Auth + RLS) |
| **배포** | Vercel (자동 CI/CD) |
| **대상 사용자** | 중소기업, 소매점, 1인 사업자, 유통업 |

---

## 2. 기술 스택

### 프론트엔드
- **빌드 도구**: Vite 8.x
- **언어**: JavaScript (ES Modules)
- **스타일**: Vanilla CSS (style.css 95KB+, 다크모드/라이트모드 지원)
- **차트**: Chart.js 4.x
- **엑셀 처리**: ExcelJS, PapaParse
- **PDF 생성**: jsPDF + jspdf-autotable
- **바코드**: html5-qrcode
- **폰트**: Noto Sans KR (@fontsource)
- **에러 모니터링**: Sentry

### 백엔드 (Supabase)
- **DB**: PostgreSQL (RLS로 사용자 데이터 격리)
- **인증**: Supabase Auth (Google OAuth + 이메일/비밀번호)
- **스토리지**: Supabase Storage (향후 파일 첨부용)

### 배포
- **호스팅**: Vercel
- **도메인**: invex.io.kr (예정)
- **CI/CD**: GitHub → Vercel 자동 배포

---

## 3. 디렉토리 구조

```
erp-lite/
├── index.html           # 메인 SPA (앱 전체)
├── landing.html          # 마케팅 랜딩 페이지
├── vite.config.js        # Vite 멀티페이지 빌드 설정
├── vercel.json           # Vercel 배포 + SPA rewrite 설정
├── package.json          # 의존성 관리
├── .env                  # 환경변수 (Supabase 키, Git 미포함)
├── .env.example          # 환경변수 템플릿
│
├── src/                  # 소스 코드 (핵심)
│   ├── main.js           # ★ 앱 엔트리포인트 — 라우팅, 인증, 사이드바
│   ├── style.css         # ★ 전체 CSS 디자인 시스템
│   ├── auth.css          # 인증 화면 전용 스타일
│   │
│   ├── ── 핵심 인프라 ──
│   ├── auth.js           # 인증 (Supabase Auth 래퍼)
│   ├── store.js          # 상태관리 (메모리 + IndexedDB + Supabase 동기화)
│   ├── db.js             # DAL (Data Access Layer) — Supabase CRUD
│   ├── supabase-client.js # Supabase 클라이언트 싱글톤
│   ├── plan.js           # 요금제 관리 (Free/Pro/Enterprise)
│   ├── theme.js          # 다크모드/라이트모드 전환
│   ├── toast.js          # 알림 토스트 UI
│   │
│   ├── ── 유틸리티 ──
│   ├── traffic-manager.js # API 트래픽 매니저 (레이트 리밋, 재시도)
│   ├── error-monitor.js   # Sentry 에러 모니터링
│   ├── global-search.js   # 전체 검색 기능
│   ├── notifications.js   # 알림 시스템
│   ├── onboarding.js      # 신규 사용자 온보딩 가이드
│   ├── ux-toolkit.js      # UX 유틸 (스크롤, 애니메이션 등)
│   ├── workspace.js       # 멀티 워크스페이스 관리
│   ├── table-auto-sort.js # 테이블 자동 정렬
│   ├── page-collapsible.js # 카드 접기/펼치기
│   ├── excel.js           # 엑셀 파싱 유틸
│   ├── excel-templates.js # 엑셀 내보내기 템플릿
│   ├── price-utils.js     # 가격/VAT 계산 유틸
│   ├── pdf-font.js        # PDF 한글 폰트
│   ├── pdf-generator.js   # PDF 문서 생성기
│   ├── charts.js          # Chart.js 래퍼 (차트 생성 유틸)
│   ├── audit-log.js       # 감사 로그 페이지
│   ├── admin-auth.js      # 관리자 권한 체크
│   ├── auth-bridge.js     # 인증 브릿지 (레거시 호환)
│   ├── backend-config.js  # 백엔드 설정
│   ├── backend-store.js   # 백엔드 스토어 (Supabase 직접 CRUD)
│   │
│   ├── ── 페이지 모듈 (page-*.js) ──
│   ├── page-home.js       # 홈 대시보드 (미션, 요약, 바로가기)
│   ├── page-hubs.js       # ★ 허브 네비게이션 (8개 허브 → 하위 페이지)
│   ├── page-dashboard.js  # 고급 분석 대시보드
│   ├── page-inventory.js  # 재고 현황 (핵심, 84KB)
│   ├── page-inout.js      # 입출고 관리 (핵심, 58KB)
│   ├── page-upload.js     # 파일 업로드 (엑셀/CSV)
│   ├── page-mapping.js    # 컬럼 매핑
│   ├── page-summary.js    # 요약 보고
│   ├── page-profit.js     # 손익 분석
│   ├── page-costing.js    # 원가 분석
│   ├── page-accounts.js   # 매출/매입 장부
│   ├── page-ledger.js     # 수불부
│   ├── page-vendors.js    # 거래처 관리
│   ├── page-warehouses.js # 다중 창고 관리
│   ├── page-transfer.js   # 창고 간 이동
│   ├── page-stocktake.js  # 재고 실사
│   ├── page-bulk.js       # 일괄 처리
│   ├── page-scanner.js    # 바코드 스캐너
│   ├── page-labels.js     # 라벨 출력
│   ├── page-documents.js  # 문서 생성 (발주서, 거래명세서)
│   ├── page-orders.js     # 발주 이력
│   ├── page-auto-order.js # 자동 발주 추천
│   ├── page-forecast.js   # AI 수요 예측
│   ├── page-tax-reports.js # 세무/회계 서류
│   ├── page-pos.js        # POS 매출 분석 (관리자 전용)
│   ├── page-settings.js   # 기본 설정
│   ├── page-roles.js      # 권한 관리 (RBAC)
│   ├── page-team.js       # 팀 관리
│   ├── page-billing.js    # 구독/결제 관리
│   ├── page-backup.js     # 백업/복원
│   ├── page-api.js        # API 연동 (Enterprise)
│   ├── page-mypage.js     # 마이페이지
│   ├── page-guide.js      # 사용 가이드
│   ├── page-support.js    # 고객 문의
│   ├── page-referral.js   # 추천 프로그램
│   ├── page-weekly-report.js # 주간 보고서
│   ├── page-admin.js      # 총관리자 패널 (사용자 관리, 시스템 모니터링)
│   │
│   ├── landing.css        # 랜딩 페이지 전용 CSS
│   └── assets/            # 아이콘, 이미지 등
│
├── supabase/
│   ├── schema.sql         # ★ DB 스키마 정의 (12개 테이블 + RLS)
│   └── fix-profiles-rls.sql # RLS 정책 패치
│
├── public/                # 정적 파일 (서비스 워커 등)
│   └── sw.js              # PWA 서비스 워커
│
└── dist/                  # 빌드 결과물 (Git 미포함 권장)
```

---

## 4. 아키텍처

### 4.1 전체 데이터 흐름

```
사용자 조작 (UI)
    ↓
main.js (라우팅 + 이벤트)
    ↓
page-*.js (페이지별 로직)
    ↓
store.js (상태관리)
    ├── 메모리 (즉시 읽기)
    ├── IndexedDB (오프라인 캐시)
    └── Supabase (클라우드 영구 저장, 디바운스 2초)
         ↓
    db.js (DAL 레이어)
         ↓
    supabase-client.js (HTTP 통신)
```

### 4.2 주요 설계 원칙

1. **하이브리드 저장 전략**
   - `setState()` → 메모리 갱신 → IndexedDB 즉시 저장 → Supabase 디바운스 동기화
   - 오프라인에서도 IndexedDB로 작동, 온라인 복구 시 자동 동기화

2. **Lazy Loading (코드 분할)**
   - `pageLoaders` 객체에서 `import()` 동적 로딩
   - 초기 번들 크기 최소화, 방문한 페이지만 로드

3. **RLS (Row Level Security)**
   - 모든 테이블에 `auth.uid() = user_id` 정책 적용
   - 서버 레벨에서 사용자 데이터 완전 격리

4. **순환 참조 방지**
   - `plan.js` ↔ `auth.js` 간 `injectGetCurrentUser()` 패턴 사용
   - 의존성 역전으로 순환 import 차단

### 4.3 네비게이션 구조 (허브 기반)

```
🏠 홈 대시보드
    │
    ├── 📂 데이터 가져오기 (hub-data)
    │   ├── 파일 업로드
    │   └── 데이터 확인
    │
    ├── 📦 재고 관리 (hub-inventory)
    │   ├── 재고 현황
    │   ├── 입출고 관리
    │   ├── 일괄 처리
    │   └── 재고 실사
    │
    ├── 🏢 창고·거래처 (hub-warehouse)
    │   ├── 다중 창고 관리
    │   ├── 창고 이동
    │   └── 거래처 관리
    │
    ├── 🤖 발주·예측 (hub-order)
    │   ├── 자동 발주 추천
    │   ├── 발주 이력
    │   └── AI 수요 예측
    │
    ├── 📊 보고·분석 (hub-report)
    │   ├── 요약 보고
    │   ├── 주간 보고서
    │   ├── 손익 분석
    │   ├── 매출/매입
    │   ├── 원가 분석
    │   └── 고급 분석
    │
    ├── 📑 문서·서류 (hub-documents)
    │   ├── 세무/회계 서류
    │   ├── 문서 생성
    │   ├── 수불부
    │   └── 감사 추적
    │
    ├── ⚙️ 설정 (hub-settings)
    │   ├── 기본 설정
    │   ├── 팀 관리
    │   ├── 백업/복원
    │   ├── 권한 관리
    │   └── 구독 관리
    │
    └── 💬 지원 (hub-support)
        ├── 마이페이지
        ├── 사용 가이드
        ├── 고객 문의
        └── 친구 초대
```

---

## 5. 데이터 모델 (Supabase/PostgreSQL)

### 5.1 현재 테이블 (12개)

| 테이블 | 용도 | 주요 컬럼 |
|--------|------|-----------|
| `profiles` | 사용자 프로필 | id, name, email, plan, currency |
| `items` | 품목 마스터 (재고) | item_name, quantity, unit_price, category, warehouse |
| `transactions` | 입출고 이력 | type(in/out), item_name, quantity, date, vendor |
| `vendors` | 거래처 마스터 | name, type, biz_number, phone, email |
| `transfers` | 창고 간 이동 | from_warehouse, to_warehouse, item_name, quantity |
| `stocktakes` | 재고 실사 | date, inspector, details(JSONB) |
| `audit_logs` | 감사 로그 | action, target, detail |
| `account_entries` | 매출/매입 장부 | type(receivable/payable), vendor, amount, status |
| `purchase_orders` | 발주서 | vendor, items(JSONB), status, total_amount |
| `pos_sales` | POS 매출 | sale_date, store, category, amount |
| `custom_fields` | 커스텀 필드 정의 | field_key, label, field_type |
| `user_settings` | 사용자 설정 (K-V) | key, value(JSONB) |

### 5.2 Store 상태 구조 (store.js)

```javascript
{
  // 재고 데이터
  mappedData: [],          // 품목 배열 [{itemName, quantity, unitPrice, category, ...}]
  transactions: [],         // 입출고 기록 [{type, itemName, quantity, date, ...}]
  safetyStock: {},          // 안전재고 {품목명: 최소수량}
  
  // 거래처·창고
  vendorMaster: [],         // 거래처 목록
  warehouses: [],           // 창고 목록
  transfers: [],            // 창고 이동 이력
  
  // 회계·주문
  accountEntries: [],       // 매출/매입 전표
  purchaseOrders: [],       // 발주서
  
  // 설정
  currency: { code: 'KRW', symbol: '₩', rate: 1 },
  costMethod: 'weighted-avg',  // 원가 계산: 가중평균/FIFO/최근
  currentPlan: 'free',         // 요금제
  beginnerMode: true,          // 초보자 모드
  dashboardMode: 'executive',  // 대시보드 보기 모드
  
  // 권한 (Enterprise)
  roles: [],                // RBAC 역할
  members: [],              // 팀원 목록
  apiKeys: [],              // API 키
  webhooks: [],             // 웹훅 설정
}
```

---

## 6. 인증 시스템

### 6.1 지원 방식
- **Google OAuth** (주요): `supabase.auth.signInWithOAuth()`
- **이메일/비밀번호**: `supabase.auth.signInWithPassword()`
- **직접 인증 폴백**: SDK 장애 시 REST API 직접 호출 (`directPasswordLogin`)

### 6.2 인증 흐름
```
landing.html (비로그인)
    → "무료로 시작" 클릭
    → auth-gate (로그인/회원가입 폼)
    → Supabase Auth
    → initAuth() 콜백
    → applySession() → loadProfile()
    → main app (index.html 앱 UI)
```

### 6.3 권한 체계
```
viewer < staff < manager < admin (관리자)

총관리자 이메일: sinbi0214@naver.com, sinbi850403@gmail.com, admin@invex.io.kr
→ 요금제 무관, 모든 기능 접근 가능
```

---

## 7. 요금제 (plan.js)

| 구분 | Free | Pro | Enterprise |
|------|------|-----|------------|
| 가격 | ₩0 (영구 무료) | ₩290,000/월 | ₩490,000/월 |
| 품목 수 | 100건 | 무제한 | 무제한 |
| 사용자 수 | 1명 | 5명 | 무제한 |
| 핵심 기능 | 재고·입출고 | + 분석·문서·바코드 | + 다창고·RBAC·API |

> **1년 무료 정책**: 가입 후 365일간 모든 기능 무료 개방

---

## 8. 개발 환경 설정

### 8.1 필수 환경변수 (.env)
```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...YOUR_ANON_KEY
```

### 8.2 로컬 실행
```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:local    # http://127.0.0.1:4173
```

### 8.3 빌드 & 배포
```bash
npm run build        # dist/ 폴더에 프로덕션 빌드
npm run preview      # 빌드 결과 로컬 미리보기
# 배포는 GitHub push → Vercel 자동 배포
```

---

## 9. 코딩 컨벤션

### 9.1 파일 네이밍
- **페이지 모듈**: `page-{기능명}.js` → `export function render{기능명}Page(container, navigateTo)`
- **유틸리티**: `{용도}.js` (예: `toast.js`, `charts.js`)
- **CSS**: `style.css` (전역), `auth.css` (인증), `landing.css` (랜딩)

### 9.2 페이지 모듈 패턴
```javascript
// page-example.js
import { getState, setState } from './store.js';
import { showToast } from './toast.js';

/**
 * 예시 페이지 렌더링
 * @param {HTMLElement} container - 콘텐츠 영역
 * @param {Function} navigateTo - 페이지 이동 함수
 */
export function renderExamplePage(container, navigateTo) {
  const state = getState();
  
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📌</span> 페이지 제목</h1>
        <div class="page-desc">설명 텍스트</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-action">액션</button>
      </div>
    </div>
    <div class="card">
      <!-- 카드 내용 -->
    </div>
  `;
  
  // 이벤트 바인딩
  container.querySelector('#btn-action')?.addEventListener('click', () => {
    // 로직
    showToast('완료', 'success');
  });
}
```

### 9.3 새 페이지 추가 체크리스트
1. `src/page-{name}.js` 생성 → `renderXxxPage(container, navigateTo)` export
2. `main.js → pageLoaders` 객체에 lazy import 등록
3. `page-hubs.js → HUB_MAP`에 부모 허브 매핑 추가
4. `page-hubs.js → PAGE_LABELS`에 한글 라벨 추가
5. `plan.js → PAGE_MIN_PLAN`에 요금제 등급 등록
6. 해당 허브 렌더 함수에 카드 추가 (icon, title, desc, nav, color)

### 9.4 DB 컬럼 네이밍
- **Supabase (DB)**: `snake_case` → `item_name`, `unit_price`
- **Store (JS)**: `camelCase` → `itemName`, `unitPrice`
- **변환**: `db.js`의 `dbItemToStoreItem()` / `storeItemToDb()` 사용

### 9.5 CSS 클래스 규칙

| 용도 | 패턴 | 예시 |
|------|------|------|
| 카드 | `.card` | `.card-title`, `.card-collapse-body` |
| 버튼 | `.btn .btn-{variant}` | `.btn-primary`, `.btn-ghost`, `.btn-outline` |
| 통계 | `.stat-grid > .stat-card` | `.stat-value`, `.stat-label` |
| 테이블 | `.data-table` | `.data-table th`, `.data-table td` |
| 모달 | `.modal-overlay > .modal` | |
| 허브 카드 | `.hub-grid > .hub-card` | `.hub-card-icon`, `.hub-card-title` |
| 페이지 헤더 | `.page-header` | `.page-title`, `.page-desc`, `.page-actions` |
| 빈 상태 | `.empty-state` | `.msg`, `.sub` |

---

## 10. 핵심 모듈 역할 요약

| 모듈 | 역할 | 한 줄 설명 |
|------|------|-----------|
| `main.js` | 앱 엔트리 | 라우팅, 인증 게이트, 사이드바, 페이지 전환 관리 |
| `store.js` | 상태관리 | 메모리 + IndexedDB + Supabase 3층 저장 |
| `db.js` | DAL | Supabase CRUD API 래핑 (`db.items.list()` 등) |
| `auth.js` | 인증 | 로그인/회원가입/로그아웃, 프로필 로드 |
| `plan.js` | 요금제 | 기능 접근 제어, 업그레이드 모달 |
| `page-hubs.js` | 허브 네비 | 8개 허브 → 하위 페이지 타일 구조 |
| `traffic-manager.js` | API 보호 | 레이트 리밋, 재시도, 큐 관리 |
| `notifications.js` | 알림 | 안전재고 경고, 만료일 알림 등 |
| `charts.js` | 차트 유틸 | Chart.js 래퍼 (그라디언트, 반응형) |

---

## 11. 향후 개발 로드맵 (ERP 확장)

### Phase 1: 인사 관리 모듈 (HR)
> 직원 정보, 근태, 조직도

- [ ] `page-employees.js` — 직원 마스터 (이름, 부서, 직급, 입사일, 연락처)
- [ ] `page-attendance.js` — 출퇴근 기록, 근태 현황 대시보드
- [ ] `page-org-chart.js` — 조직도 시각화
- [ ] DB 테이블: `employees`, `attendance_records`, `departments`

### Phase 2: 급여 관리 모듈 (Payroll)
> 급여 계산, 지급 관리, 명세서

- [ ] `page-payroll.js` — 급여 계산 (기본급 + 수당 – 공제)
- [ ] `page-payslip.js` — 급여 명세서 PDF 생성
- [ ] `page-payroll-settings.js` — 급여 항목(수당/공제) 설정
- [ ] 4대 보험 자동 계산 (국민연금, 건강보험, 고용보험, 산재보험)
- [ ] 소득세 자동 계산 (간이세액표 기반)
- [ ] DB 테이블: `payroll_records`, `salary_items`, `payslips`

### Phase 3: 고급 회계 모듈
> 복식부기, 계정과목, 재무제표

- [ ] `page-journal.js` — 분개장 (차변/대변 전표 입력)
- [ ] `page-chart-of-accounts.js` — 계정과목 관리
- [ ] `page-financial-statements.js` — 재무상태표, 손익계산서 자동 생성
- [ ] DB 테이블: `journal_entries`, `chart_of_accounts`

### Phase 4: 고객 관리 (CRM)
> 고객 데이터, 상담 이력, 리드 파이프라인

- [ ] `page-customers.js` — 고객 DB (기존 vendors 확장)
- [ ] `page-crm-pipeline.js` — 영업 파이프라인 (칸반 보드)
- [ ] `page-crm-activities.js` — 상담/미팅 기록

### Phase 5: 프로젝트 관리
> 작업 관리, 일정, 타임라인

- [ ] `page-projects.js` — 프로젝트 목록 및 진행률
- [ ] `page-tasks.js` — 작업(Task) 관리 (칸반/리스트 뷰)
- [ ] `page-calendar.js` — 일정 캘린더

---

## 12. DB 스키마 확장 계획 (인사/급여)

```sql
-- 부서 테이블
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES departments(id),
  manager TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 직원 테이블
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emp_number TEXT,              -- 사번
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  position TEXT,                -- 직급
  hire_date TEXT,               -- 입사일
  resign_date TEXT,             -- 퇴사일
  phone TEXT,
  email TEXT,
  address TEXT,
  birth_date TEXT,
  gender TEXT,
  bank_name TEXT,
  bank_account TEXT,
  base_salary NUMERIC DEFAULT 0, -- 기본급
  status TEXT DEFAULT 'active',   -- active/leave/resigned
  extra JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 근태 기록
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status TEXT DEFAULT 'present',  -- present/absent/late/vacation/half-day
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 급여 기록
CREATE TABLE payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  pay_year INTEGER NOT NULL,
  pay_month INTEGER NOT NULL,
  base_salary NUMERIC DEFAULT 0,
  allowances JSONB DEFAULT '{}',   -- {식대: 200000, 교통비: 100000, ...}
  deductions JSONB DEFAULT '{}',   -- {국민연금: xxx, 건강보험: xxx, 소득세: xxx, ...}
  gross_pay NUMERIC DEFAULT 0,     -- 총 지급액
  total_deduction NUMERIC DEFAULT 0,
  net_pay NUMERIC DEFAULT 0,       -- 실수령액
  paid_date TEXT,
  status TEXT DEFAULT 'draft',     -- draft/confirmed/paid
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 급여 항목 설정
CREATE TABLE salary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'allowance' / 'deduction'
  calc_type TEXT DEFAULT 'fixed',  -- 'fixed' / 'percentage' / 'formula'
  amount NUMERIC DEFAULT 0,
  rate NUMERIC DEFAULT 0,          -- calc_type=percentage일 때 비율
  is_taxable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 13. 알려진 제약 & 주의사항

### ⚠️ 개발 시 주의
- `main.js` 1,100줄 / `style.css` 95KB+ / `page-inventory.js` 84KB — 파일 크기 주의, 신규 로직 추가 시 분리 고려
- 주석 한글 깨짐 있음 (유니코드 이스케이프) — 기능 영향 없음
- 프레임워크 없음 — DOM 조작·상태관리 모두 수동

### ⚠️ 운영 주의
- **Supabase Free 플랜** 사용 시 API 속도 제한 있음 → `traffic-manager.js`로 보호
- **RLS 정책** 변경 시 반드시 `schema.sql` 동기화 후 SQL Editor에서 실행
- **환경변수 유출 금지** — `.env`는 절대 Git 커밋 금지 (`.gitignore` 확인)

---

## 14. 자주 쓰는 유틸 패턴

### 토스트 알림
```javascript
import { showToast } from './toast.js';
showToast('저장되었습니다.', 'success');     // 성공
showToast('필수 항목을 확인하세요.', 'warning'); // 경고
showToast('오류가 발생했습니다.', 'error');    // 에러
showToast('처리 중입니다.', 'info');          // 정보
```

### 상태 읽기/쓰기
```javascript
import { getState, setState } from './store.js';

const state = getState();
const items = state.mappedData; // 품목 배열

setState({ mappedData: [...items, newItem] }); // 자동 저장 + 동기화
```

### 페이지 이동
```javascript
// page-*.js 내부에서
navigateTo('inventory');   // 재고 현황으로 이동
navigateTo('hub-report');  // 보고·분석 허브로 이동
```

### Supabase CRUD
```javascript
import * as db from './db.js';

const items = await db.items.list({ category: '식품' });
await db.items.create({ item_name: '사과', quantity: 100 });
await db.transactions.create({ type: 'in', item_name: '사과', quantity: 50 });
```

---

## 15. 연락처

| 구분 | 정보 |
|------|------|
| **관리자 이메일** | sinbi0214@naver.com |
| **GitHub** | (비공개 리포지토리) |
| **배포 URL** | Vercel (invex.io.kr 예정) |
