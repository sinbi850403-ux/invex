---
description: Vite 빌드 오류 자동 진단 및 최소 수정. 한 번에 하나씩 안전하게 수정.
---

# /build-fix — INVEX 빌드 오류 수정

## 1단계: 빌드 실행

```bash
npm run build 2>&1
```

오류 없으면 종료: "빌드 성공 ✅"

## 2단계: 오류 파싱 및 그룹화

수집된 오류를 파일별로 그룹화:
- TypeScript 타입 오류
- import/export 오류 (모듈 못 찾음)
- 문법 오류
- Vite 설정 오류

의존성 순서대로 정렬 (import 오류 → 타입 오류 → 로직 오류)

## 3단계: 하나씩 수정 루프

각 오류에 대해:
1. **파일 읽기** — 오류 주변 컨텍스트 파악
2. **원인 진단** — 누락된 import? 잘못된 타입? 문법 오류?
3. **최소 수정** — 가장 작은 변경으로 해결
4. **재빌드** — `npm run build` 재실행으로 오류 해소 확인
5. **반복** — 다음 오류로 이동

## 4단계: INVEX 특화 체크

빌드 오류의 흔한 원인:

| 오류 유형 | INVEX 원인 | 해결법 |
|----------|-----------|--------|
| `Cannot find module` | `.jsx`/`.tsx` 확장자 명시 문제 | 확장자 제거 또는 정확히 명시 |
| `export default` 누락 | `reactLoader`가 default export 기대 | `export default ComponentName` 추가 |
| `Cannot find name` | TypeScript 타입 import 누락 | `import type { ... }` 추가 |
| `Circular dependency` | store.js ↔ auth.js 순환 | `injectGetCurrentUser()` 패턴 사용 |
| 한글 인코딩 | 주석/문자열 깨짐 | UTF-8 저장 확인 |

## 5단계: 중단 조건

다음 상황이면 멈추고 사용자에게 보고:
- 수정 후 오류가 더 늘어나는 경우
- 같은 오류가 3회 시도 후에도 지속
- 아키텍처 변경이 필요한 경우 (`/plan` 권장)
- 패키지 설치 필요 (`npm install` 필요)

## 6단계: 결과 요약

```
빌드 수정 결과
──────────────────────
수정 완료: N개 오류
           - src/react/pages/FooPage.tsx (export default 누락)
           - src/auth.js (import 경로 오류)
잔여 오류:  N개 (수동 확인 필요)
새 오류:    0개
──────────────────────
다음 단계: npm run build 로 최종 확인
```
