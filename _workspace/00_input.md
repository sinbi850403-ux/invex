# INVEX 코드 리뷰 — 입력 명세

## 리뷰 요청
- **요청**: 면밀하게 깊이있게 코드 확인하고 리뷰
- **모드**: 풀 리뷰 (스타일 + 보안 + 성능 + 아키텍처)
- **날짜**: 2026-05-04

## 대상 프로젝트
- **경로**: `C:\Users\admin\Documents\GitHub\invex`
- **타입**: React 18 SPA + Supabase 백엔드
- **언어**: JavaScript (ES Modules) + JSX
- **프레임워크**: React 18.3.1 + React Router v6 + Vite
- **소스 파일 수**: 162개 (.js/.jsx/.ts/.tsx)

## 핵심 파일 (우선 리뷰 대상)
### 인증/보안 레이어
- src/contexts/AuthContext.jsx
- src/workspace.js (방금 보안 패치 적용)
- src/auth.js
- src/auth/ (service.js, rules.js, storage.js)
- src/supabase-client.js
- src/plan.js
- src/admin-auth.js
- src/admin-emails.js

### 데이터 레이어
- src/store.js
- src/db.js
- src/db/ (core.js, settings.js, etc.)
- src/traffic-manager.js

### 비즈니스 로직
- src/ai-report.js
- src/payroll-calc.js + payroll-calc.ts
- src/domain/
- src/audit-log.js

### 인프라
- supabase/schema.sql
- supabase/fix-team-rls.sql
- public/sw.js
- vite.config.js
- vercel.json

## 알려진 기술 부채
- page-*.js 레거시 파일들 (innerHTML XSS 잠재 위험)
- 하드코딩된 관리자 이메일 (fix-team-rls.sql)
- Zustand 설치됐지만 미사용
- .env VITE_OPENAI_API_KEY 빈 값
