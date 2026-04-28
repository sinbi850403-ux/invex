# INVEX ERP-Lite — 프로젝트 가이드

> **INVEX**는 중소기업 맞춤 재고·경영 관리 SaaS 플랫폼입니다.
> 인사, 재고, 급여, 매출/매입, 세무 등 실질적인 비즈니스 운영에 필요한 기능을 하나의 웹 앱에서 제공합니다.

---

## 1. 프로젝트 개요

| 항목 | 설명 |
|------|------|
| **프로젝트명** | INVEX (인벡스) |
| **유형** | SPA (Single Page Application) — React 18 |
| **프레임워크** | React 18 + React Router v6 + Vite |
| **상태관리** | 커스텀 하이브리드 스토어 (메모리 + IndexedDB + Supabase) |
| **백엔드** | Supabase (PostgreSQL + Auth + RLS) |
| **배포** | Vercel (자동 CI/CD) |
| **대상 사용자** | 중소기업, 소매점, 1인 사업자, 유통업 |

---

## 2. 기술 스택

### 프론트엔드
- **빌드 도구**: Vite 8.x + @vitejs/plugin-react
- **언어**: JavaScript (ES Modules) + JSX
- **프레임워크**: React 18.3.1
- **라우팅**: React Router DOM 6.30.3
- **상태관리**: 커스텀 store.js (Zustand 설치돼 있으나 코어에서 미사용)
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
invex/
├── index.html               # 메인 SPA 엔트리
├── landing.html             # 마케팅 랜딩 페이지
├── vite.config.js           # Vite 멀티페이지 + 청크 분리 설정
├── vercel.json              # Vercel 배포 + SPA rewrite 설정
├── package.json             # 의존성 관리
├── .env                     # 환경변수 (Supabase 키, Git 미포함)
├── .env.example             # 환경변수 템플릿
│
├── src/                     # 소스 코드 (핵심)
│   ├── main.jsx             # ★ React 루트 — BrowserRouter, 앱 진입점
│   ├── App.jsx              # 루트 컴포넌트 (AuthProvider 래핑)
│   ├── router-config.js     # 라우트 정의 (PAGE_LOADERS, PAGE_LABELS)
│   ├── style.css            # ★ 전체 CSS 디자인 시스템
│   ├── auth.css             # 인증 화면 전용 스타일
│   │
│   ├── ── React 컴포넌트 ──
│   ├── components/
│   │   ├── auth/
│   │   │   ├── AuthGate.jsx        # 인증 게이트 UI
│   │   │   └── LandingPage.jsx     # 랜딩 → 앱 전환
│   │   └── layout/
│   │       ├── AppLayout.jsx       # 전체 레이아웃 (lazy route 로딩)
│   │       ├── Sidebar.jsx         # 사이드바 네비게이션
│   │       └── TopHeader.jsx       # 상단 헤더
│   │
│   ├── contexts/
│   │   └── AuthContext.jsx         # 인증 + 앱 초기화 상태 컨텍스트
│   │
│   ├── hooks/
│   │   └── useStore.js             # 커스텀 스토어 → React 훅 브릿지
│   │
│   ├── pages/                      # ★ 46개 React 페이지 컴포넌트
│   │   ├── LegacyPage.jsx          # 레거시 page-*.js → React 래퍼
│   │   ├── HomePage.jsx
│   │   ├── InventoryPage.jsx
│   │   ├── InoutPage.jsx
│   │   ├── EmployeesPage.jsx
│   │   ├── AttendancePage.jsx
│   │   ├── PayrollPage.jsx
│   │   ├── LeavesPage.jsx
│   │   ├── SeverancePage.jsx
│   │   ├── YearendSettlementPage.jsx
│   │   └── ... (총 46개)
│   │
│   ├── ── 핵심 인프라 ──
│   ├── store.js             # 상태관리 (메모리 + IndexedDB + Supabase 3층)
│   ├── db.js                # DAL (Data Access Layer) — Supabase CRUD
│   ├── supabase-client.js   # Supabase 클라이언트 싱글톤
│   ├── plan.js              # 요금제 관리 (Free/Pro/Enterprise)
│   ├── theme.js             # 다크모드/라이트모드 전환
│   ├── toast.js             # 알림 토스트 UI
│   │
│   ├── ── 인증 서비스 ──
│   ├── auth/
│   │   ├── async.js         # 비동기 인증 처리
│   │   ├── profile.js       # 프로필 관련
│   │   ├── rules.js         # 권한/역할 로직
│   │   ├── service.js       # Supabase Auth 래퍼
│   │   ├── storage.js       # localStorage 영속화
│   │   └── ui.js            # 인증 UI 헬퍼
│   │
│   ├── ── 도메인 로직 ──
│   ├── domain/
│   │   ├── excelFieldMap.js     # 엑셀 필드 매핑 정의
│   │   ├── inventoryAmount.js   # 재고 금액 계산
│   │   └── uploadDiff.js        # 업로드 차분 분석
│   │
│   ├── ── 유틸리티 ──
│   ├── traffic-manager.js   # API 트래픽 매니저 (레이트 리밋, 재시도)
│   ├── error-monitor.js     # Sentry 에러 모니터링
│   ├── global-search.js     # 전체 검색 기능
│   ├── notifications.js     # 알림 시스템
│   ├── onboarding.js        # 신규 사용자 온보딩 가이드
│   ├── excel.js             # 엑셀 파싱 유틸
│   ├── excel-templates.js   # 엑셀 내보내기 템플릿
│   ├── price-utils.js       # 가격/VAT 계산 유틸
│   ├── pdf-font.js          # PDF 한글 폰트
│   ├── pdf-generator.js     # PDF 문서 생성기
│   ├── charts.js            # Chart.js 래퍼
│   ├── audit-log.js         # 감사 로그
│   ├── admin-auth.js        # 관리자 권한 체크
│   │
│   ├── ── 레거시 페이지 모듈 (page-*.js) ──
│   │   # React 전환 전 Vanilla JS 렌더 함수들
│   │   # LegacyPage.jsx를 통해 React 앱 안에서 실행됨
│   ├── page-home.js, page-inventory.js, page-inout.js ...
│   │
│   └── assets/              # 아이콘, 이미지 등
│
├── supabase/
│   ├── schema.sql           # ★ DB 스키마 정의 (12개 테이블 + RLS)
│   └── fix-profiles-rls.sql # RLS 정책 패치
│
├── public/                  # 정적 파일
│   └── sw.js                # PWA 서비스 워커
│
└── dist/                    # 빌드 결과물 (Git 미포함 권장)
```

---

## 4. 아키텍처

### 4.1 전체 데이터 흐름

```
사용자 조작 (React UI)
    ↓
React Router (BrowserRouter)
    ↓
AppLayout.jsx (lazy 로딩)
    ↓
pages/*.jsx (React 페이지 컴포넌트)
  또는
LegacyPage.jsx → page-*.js (레거시 렌더 함수)
    ↓
useStore(selector) 훅 / store.js 직접 호출
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

### 4.2 React 아키텍처

INVEX는 **React 18 기반 SPA**입니다. Vanilla JS → React 전환이 완료되었습니다.

```
pages/*.jsx (46개)    →    AppLayout.jsx (lazy 로딩)
     ↕
useStore() 훅 → store.js (상태관리)
```

- **모든 페이지**: `pages/*.jsx` React 컴포넌트
- **상태**: `useStore()` 훅으로 store.js 이벤트 기반 상태 구독
- **레거시 호환**: `LegacyPage.jsx`로 일부 page-*.js 파일 래핑 (점진적 교체 예정)

### 4.3 주요 설계 원칙

1. **하이브리드 저장 전략**
   - `setState()` → 메모리 갱신 → IndexedDB 즉시 저장 → Supabase 디바운스 동기화
   - 오프라인에서도 IndexedDB로 작동, 온라인 복구 시 자동 동기화

2. **Lazy Loading (코드 분할)**
   - `router-config.js`의 `PAGE_LOADERS`에서 dynamic import
   - `AppLayout.jsx`에서 React `lazy + Suspense` 사용
   - Vite rollup manual chunks로 vendor 청크 분리

3. **RLS (Row Level Security)**
   - 모든 테이블에 `auth.uid() = user_id` 정책 적용
   - 서버 레벨에서 사용자 데이터 완전 격리

4. **순환 참조 방지**
   - `plan.js` ↔ `auth.js` 간 `injectGetCurrentUser()` 패턴 사용
   - `AuthContext.jsx`에서 의존성 주입

### 4.4 네비게이션 구조

사이드바는 **허브 버튼 + 재고관리 아코디언** 혼합 구조입니다.

```
🏠 홈 대시보드
    │
    ├── 📦 재고관리 ← 아코디언 (접기/펼치기)
    │   ├── 📥 입고관리  (route: 'in')
    │   ├── 📤 출고관리  (route: 'out')
    │   ├── 📋 수불관리  (route: 'ledger')
    │   └── 📊 재고현황  (route: 'inventory')
    │
    ├── 🏢 창고·거래처 (hub-warehouse)
    ├── 🤖 발주·예측 (hub-order)
    ├── 📊 보고·분석 (hub-report)
    ├── 📑 문서·서류 (hub-documents)
    ├── 👥 인사·급여 (hub-hr)
    │   ├── HR 대시보드
    │   ├── 직원 관리
    │   ├── 근태 관리
    │   ├── 급여 계산
    │   ├── 휴가·연차
    │   ├── 퇴직금 계산
    │   └── 연말정산 보조
    ├── ⚙️ 설정 (hub-settings)
    └── 💬 지원 (hub-support)
```

---

## 5. 상태관리

### 5.1 store.js (커스텀 하이브리드 스토어)

Zustand가 설치돼 있지만 코어는 **커스텀 store.js** 사용.
변경 시 `invex:store-updated` CustomEvent를 dispatch해 구독자에게 알림.

```javascript
// 직접 사용 (레거시 page-*.js 방식)
import { getState, setState } from './store.js';
const state = getState();
setState({ mappedData: [...] });

// React 컴포넌트에서 훅 사용
import { useStore } from './hooks/useStore.js';
const mappedData = useStore(s => s.mappedData);
const [beginnerMode, setBeginnerMode] = useStore(s => s.beginnerMode);
```

### 5.2 Store 상태 구조

```javascript
{
  // 재고 데이터
  mappedData: [],          // 품목 배열
  transactions: [],         // 입출고 기록
  safetyStock: {},          // 안전재고
  
  // 거래처·창고
  vendorMaster: [],
  warehouses: [],
  transfers: [],
  
  // 회계·주문
  accountEntries: [],
  purchaseOrders: [],
  
  // 설정
  currency: { code: 'KRW', symbol: '₩', rate: 1 },
  costMethod: 'weighted-avg',
  currentPlan: 'free',
  beginnerMode: true,
  dashboardMode: 'executive',
  
  // 권한 (Enterprise)
  roles: [],
  members: [],
  apiKeys: [],
  webhooks: [],
}
```

---

## 6. 데이터 모델 (Supabase/PostgreSQL)

### 6.1 현재 테이블 (12개)

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

### 6.2 DB 컬럼 네이밍
- **Supabase (DB)**: `snake_case` → `item_name`, `unit_price`
- **Store (JS)**: `camelCase` → `itemName`, `unitPrice`
- **변환**: `db.js`의 변환 함수 사용

---

## 7. 인증 시스템

### 7.1 지원 방식
- **Google OAuth** (주요): `supabase.auth.signInWithOAuth()`
- **이메일/비밀번호**: `supabase.auth.signInWithPassword()`
- **직접 인증 폴백**: SDK 장애 시 REST API 직접 호출

### 7.2 인증 흐름
```
landing.html (비로그인)
    → AuthGate.jsx (로그인/회원가입 폼)
    → Supabase Auth
    → AuthContext.jsx (initAuth 콜백)
    → profile 로드 + 상태 복원 + plan 주입
    → AppLayout.jsx (앱 UI)
```

### 7.3 Supabase Cold Start 대응
- `AuthContext`에서 2초 fallback 타이머 설정
- Supabase 미설정 시 로컬 모드로 폴백

### 7.4 권한 체계
```
viewer < staff < manager < admin

총관리자: sinbi0214@naver.com, sinbi850403@gmail.com, admin@invex.io.kr
→ 요금제 무관, 모든 기능 접근 가능
```

---

## 8. 요금제 (plan.js)

| 구분 | Free | Pro | Enterprise |
|------|------|-----|------------|
| 가격 | ₩0 (영구 무료) | ₩290,000/월 | ₩490,000/월 |
| 품목 수 | 100건 | 무제한 | 무제한 |
| 사용자 수 | 1명 | 5명 | 무제한 |
| 핵심 기능 | 재고·입출고 | + 분석·문서·바코드 | + 다창고·RBAC·API |

> **1년 무료 정책**: 가입 후 365일간 모든 기능 무료 개방

---

## 9. 개발 환경 설정

### 9.1 필수 환경변수 (.env)
```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...YOUR_ANON_KEY
```

### 9.2 로컬 실행
```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:local    # http://127.0.0.1:4173
```

### 9.3 빌드 & 배포
```bash
npm run build        # dist/ 폴더에 프로덕션 빌드
npm run preview      # 빌드 결과 로컬 미리보기
# 배포는 GitHub push → Vercel 자동 배포
```

---

## 10. 코딩 컨벤션

### 10.1 파일 네이밍
- **React 페이지**: `src/pages/{기능명}Page.jsx` → default export
- **React 컴포넌트**: `src/components/{분류}/{이름}.jsx`
- **레거시 페이지**: `src/page-{기능명}.js` → `export function render{기능명}Page(container, navigateTo)`
- **유틸리티**: `src/{용도}.js`

### 10.2 새 React 페이지 추가 체크리스트
1. `src/pages/{Name}Page.jsx` 생성 → default export
2. `src/router-config.js → PAGE_LOADERS`에 lazy import 등록
3. `src/pages/page-hubs.js → HUB_MAP`에 부모 허브 매핑 추가
4. `src/pages/page-hubs.js → PAGE_LABELS`에 한글 라벨 추가
5. `plan.js → PAGE_MIN_PLAN`에 요금제 등급 등록
6. 허브 페이지라면 해당 허브 렌더 함수에 카드 추가

### 10.3 React 페이지 패턴
```jsx
// src/pages/ExamplePage.jsx
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';

export default function ExamplePage({ navigateTo }) {
  const mappedData = useStore(s => s.mappedData);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="title-icon">📌</span> 페이지 제목</h1>
          <div className="page-desc">설명 텍스트</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => showToast('완료', 'success')}>
            액션
          </button>
        </div>
      </div>
      <div className="card">
        {/* 카드 내용 */}
      </div>
    </div>
  );
}
```

### 10.4 레거시 페이지 래핑 패턴
기존 `page-*.js` 파일을 React 트리에 통합할 때 `LegacyPage.jsx` 사용:
```jsx
// router-config.js에서
{
  pageId: 'example',
  loader: () => import('../page-example.js').then(m => m.renderExamplePage)
}
// → AppLayout이 LegacyPage.jsx로 자동 래핑
```

### 10.5 CSS 클래스 규칙

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

## 11. 핵심 모듈 역할 요약

| 모듈 | 역할 | 한 줄 설명 |
|------|------|-----------|
| `main.jsx` | React 진입점 | BrowserRouter + App 렌더 |
| `App.jsx` | 루트 컴포넌트 | AuthContext.Provider 래핑 |
| `contexts/AuthContext.jsx` | 인증 상태 | 로그인·프로필·앱 초기화 컨텍스트 |
| `components/layout/AppLayout.jsx` | 레이아웃 | Sidebar + 페이지 lazy 로딩 |
| `components/layout/Sidebar.jsx` | 사이드바 | 허브 네비게이션, 아코디언 |
| `router-config.js` | 라우트 정의 | PAGE_LOADERS, PAGE_LABELS |
| `hooks/useStore.js` | 상태 훅 | store.js 이벤트 → React 상태 |
| `store.js` | 상태관리 | 메모리 + IndexedDB + Supabase 3층 저장 |
| `db.js` | DAL | Supabase CRUD API 래핑 |
| `auth/service.js` | 인증 서비스 | Supabase Auth 래퍼 |
| `plan.js` | 요금제 | 기능 접근 제어, 업그레이드 모달 |
| `pages/LegacyPage.jsx` | 레거시 래퍼 | page-*.js → React 컴포넌트 변환 |
| `traffic-manager.js` | API 보호 | 레이트 리밋, 재시도, 큐 관리 |

---

## 12. 향후 개발 로드맵 (ERP 확장)

### Phase 1: 인사 관리 모듈 (HR) — 대부분 완료
- [x] `pages/EmployeesPage.jsx` — 직원 마스터
- [x] `pages/AttendancePage.jsx` — 근태 관리
- [x] `pages/PayrollPage.jsx` — 급여 계산
- [x] `pages/LeavesPage.jsx` — 휴가·연차
- [x] `pages/SeverancePage.jsx` — 퇴직금 계산
- [x] `pages/YearendSettlementPage.jsx` — 연말정산 보조

### Phase 2: 고급 회계 모듈
- [ ] `pages/JournalPage.jsx` — 분개장
- [ ] `pages/ChartOfAccountsPage.jsx` — 계정과목 관리
- [ ] `pages/FinancialStatementsPage.jsx` — 재무제표

### Phase 3: 고객 관리 (CRM)
- [ ] `pages/CustomersPage.jsx` — 고객 DB
- [ ] `pages/CrmPipelinePage.jsx` — 영업 파이프라인

---

## 13. DB 스키마 확장 계획 (인사/급여)

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
  emp_number TEXT,
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  position TEXT,
  hire_date TEXT,
  resign_date TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  birth_date TEXT,
  gender TEXT,
  bank_name TEXT,
  bank_account TEXT,
  base_salary NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'active',
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
  status TEXT DEFAULT 'present',
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
  allowances JSONB DEFAULT '{}',
  deductions JSONB DEFAULT '{}',
  gross_pay NUMERIC DEFAULT 0,
  total_deduction NUMERIC DEFAULT 0,
  net_pay NUMERIC DEFAULT 0,
  paid_date TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 급여 항목 설정
CREATE TABLE salary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  calc_type TEXT DEFAULT 'fixed',
  amount NUMERIC DEFAULT 0,
  rate NUMERIC DEFAULT 0,
  is_taxable BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 14. 알려진 제약 & 주의사항

### ⚠️ 개발 시 주의
- **하이브리드 아키텍처**: 신규 기능은 React(`pages/*.jsx`)로, 레거시는 `LegacyPage.jsx` 래핑 유지
- **store.js는 React 외부 상태**: `useState`/`useReducer` 아닌 `useStore()` 훅 사용
- **Zustand 미사용**: 설치됐지만 코어에서 사용 안 함 — 임의로 Zustand 도입 금지
- **style.css는 95KB+**: 디자인 시스템 전체가 한 파일. className은 기존 규칙 준수
- **page-inventory.js 84KB**: 레거시 중 가장 큰 파일. React 전환 시 하위 컴포넌트 분리 권장

### ⚠️ 운영 주의
- **Supabase Free 플랜** 사용 시 API 속도 제한 → `traffic-manager.js`로 보호
- **RLS 정책** 변경 시 반드시 `schema.sql` 동기화 후 SQL Editor에서 실행
- **환경변수 유출 금지** — `.env`는 절대 Git 커밋 금지

---

## 15. 자주 쓰는 유틸 패턴

### 토스트 알림
```javascript
import { showToast } from './toast.js';
showToast('저장되었습니다.', 'success');
showToast('필수 항목을 확인하세요.', 'warning');
showToast('오류가 발생했습니다.', 'error');
showToast('처리 중입니다.', 'info');
```

### 상태 읽기/쓰기 (React)
```jsx
import { useStore } from './hooks/useStore.js';

function MyComponent() {
  const mappedData = useStore(s => s.mappedData);
  // 쓰기는 store.js의 setState 직접 호출
}
```

### 상태 읽기/쓰기 (레거시)
```javascript
import { getState, setState } from './store.js';
const items = getState().mappedData;
setState({ mappedData: [...items, newItem] });
```

### Supabase CRUD
```javascript
import * as db from './db.js';
const items = await db.items.list({ category: '식품' });
await db.items.create({ item_name: '사과', quantity: 100 });
await db.transactions.create({ type: 'in', item_name: '사과', quantity: 50 });
await db.clearAllUserData(); // 전체 삭제 (회원탈퇴/초기화)
```

---

## 16. 연락처

| 구분 | 정보 |
|------|------|
| **관리자 이메일** | sinbi0214@naver.com |
| **GitHub** | (비공개 리포지토리) |
| **배포 URL** | Vercel (invex.io.kr 예정) |
