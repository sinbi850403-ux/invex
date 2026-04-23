---
description: 데드 코드 제거 및 안전한 리팩토링 — 테스트 통과 확인 후 하나씩 정리.
argument-hint: [파일명 | 빈칸(전체 스캔)]
---

# /refactor — INVEX 코드 정리

## 1단계: 데드 코드 탐지

```bash
npx knip          # 미사용 export, 파일, 의존성
npx depcheck      # 미사용 npm 패키지
```

직접 검색:
```bash
# 사용되지 않는 함수 찾기
grep -r "export function" src/ --include="*.js" | \
  while IFS= read -r line; do echo "$line"; done
```

## 2단계: 위험도 분류

| 단계 | 대상 | 처리 |
|------|------|------|
| **SAFE** | 미사용 유틸 함수, 주석 처리된 코드 | 바로 삭제 |
| **CAUTION** | page-*.js 함수, store 셀렉터 | dynamic import 확인 후 삭제 |
| **DANGER** | main.js 진입점, auth.js 핵심 | 절대 함부로 건드리지 않음 |

## 3단계: INVEX 특화 정리 대상

- `page-*.js` 파일 800줄 초과 → 하위 컴포넌트로 분리
- 중복된 Supabase 쿼리 → `db.js`로 통합
- 인라인 CSS 스타일 → `style.css` 클래스로 이동
- 하드코딩된 한글 문자열 → 상수로 추출
- `console.log` 디버그 코드 제거

## 4단계: 안전한 삭제 루프

각 항목마다:
1. `npm run build` — 기준선 확인
2. 코드 삭제
3. `npm run build` — 빌드 통과 확인
4. 실패 시 → 즉시 `git checkout -- <파일>`로 복구

## 5단계: 결과 요약

```
리팩토링 결과
──────────────────────
삭제: N개 미사용 함수
      N개 중복 로직 통합
      N줄 제거
빌드: ✅ 통과
──────────────────────
```
