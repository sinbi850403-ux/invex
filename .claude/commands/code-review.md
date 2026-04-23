---
description: push 전 코드 리뷰 — 보안·버그·품질 자동 점검. PR 번호 전달 시 GitHub PR 리뷰.
argument-hint: [PR번호 | 빈칸(로컬 변경사항 리뷰)]
---

# /code-review — INVEX 코드 리뷰

**입력값**: $ARGUMENTS

PR 번호가 있으면 → **GitHub PR 리뷰 모드**
없으면 → **로컬 변경사항 리뷰 모드**

---

## 로컬 리뷰 모드

### 1단계: 변경 파일 수집
```bash
git diff --name-only HEAD
```
변경 파일 없으면 종료: "리뷰할 변경사항이 없습니다."

### 2단계: INVEX 맞춤 체크리스트

**🔴 CRITICAL (보안·데이터 손실)**
- [ ] `.env` 파일 또는 API 키 하드코딩 없음
- [ ] Supabase 쿼리에 `user_id` 필터 포함 (RLS 이중 보호)
- [ ] 사용자 입력 검증 누락 없음 (특히 숫자 필드)
- [ ] `setState()` 후 IndexedDB/Supabase 동기화 보장
- [ ] 기존 데이터를 덮어쓰는 로직 없음

**🟠 HIGH (버그·로직 오류)**
- [ ] `async/await` 누락으로 인한 경쟁 조건 없음
- [ ] `try/catch` 빠진 Supabase 호출 없음
- [ ] `store.js` 상태 직접 수정 없음 (반드시 `setState()` 사용)
- [ ] 숫자 연산에 `Number.isFinite()` 검증 포함
- [ ] 삭제 전 확인 다이얼로그 포함

**🟡 MEDIUM (품질)**
- [ ] `console.log` 디버그 코드 제거
- [ ] 함수 50줄, 파일 800줄 초과 없음
- [ ] `showToast()` 로 사용자 피드백 제공
- [ ] 빈 상태 UI 처리 포함

**🟢 LOW (스타일)**
- [ ] 한글 주석/UI 텍스트 사용
- [ ] INVEX CSS 클래스 컨벤션 준수 (`.card`, `.btn-*`, `.stat-card`)
- [ ] `page-*.js` 파일명 규칙 준수

### 3단계: 리포트

```
INVEX 코드 리뷰 결과
─────────────────────
CRITICAL: N건
HIGH:     N건
MEDIUM:   N건
LOW:      N건

[결정]
✅ APPROVE   — CRITICAL/HIGH 없음
⚠️ 수정 필요 — HIGH 이상 발견
🚫 BLOCK     — CRITICAL 발견 (즉시 수정 필수)
```

---

## GitHub PR 리뷰 모드

```bash
gh pr view $ARGUMENTS --json number,title,body,changedFiles,additions,deletions
gh pr diff $ARGUMENTS
```

변경 파일 전체를 읽고 위 체크리스트 적용 → GitHub에 리뷰 게시:
```bash
# 승인
gh pr review $ARGUMENTS --approve --body "리뷰 요약"

# 수정 요청
gh pr review $ARGUMENTS --request-changes --body "수정 필요 항목"
```
