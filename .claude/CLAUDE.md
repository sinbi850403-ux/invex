# INVEX — Harness 사용 가이드

이 프로젝트는 [revfactory/harness-100](https://github.com/revfactory/harness-100) 의 4개 harness를 설치해 사용합니다. 프로젝트 자체의 도메인·아키텍처 가이드는 루트 [../CLAUDE.md](../CLAUDE.md) (또는 `claude.md`) 를 참고하세요.

이 파일은 **harness 운용 규칙**만 다룹니다.

---

## 설치된 4개 harness

| # | Orchestrator (slash 트리거) | 자연어 트리거 예시 | 5명의 specialist |
|---|---|---|---|
| 16 | `/fullstack-webapp` | "웹앱 만들어줘" | architect, frontend-dev, backend-dev, qa-engineer, devops-engineer |
| 19 | `/database-architect` | "DB 설계해줘" | data-modeler, migration-manager, **db-performance-analyst**, security-auditor, integration-reviewer |
| 21 | `/code-reviewer` | "코드 리뷰해줘" | style-inspector, security-analyst, performance-analyst, architecture-reviewer, review-synthesizer |
| 28 | `/security-audit` | "보안 감사해줘" | vulnerability-scanner, code-analyst, pentest-reporter, security-consultant, audit-reviewer |

각 harness의 원본 설명은 [harnesses/](harnesses/) 아래 동명 `.md` 파일에 보관돼 있고, 인덱스는 [harnesses/README.md](harnesses/README.md).

---

## 호출 규칙

- **단일 harness 호출**: 위 표의 slash 트리거 또는 자연어로 호출. orchestrator skill이 specialist 5명을 SendMessage로 조율.
- **에이전트 직접 호출**: `Agent` tool에 `subagent_type: "<agent-name>"` 지정. 단일 전문가 자문이 필요할 때 사용 (예: 단일 보안 패치 검토 → `security-analyst` 한 명만 호출).
- **harness 동시 호출 금지**: orchestrator끼리 호출하지 말 것. 예를 들어 `/fullstack-webapp`이 `/code-reviewer`를 호출하지 않음. 필요하면 사용자가 차례로 트리거하거나, 한 orchestrator 안에서 specialist를 직접 부름.

---

## 산출물 저장 규약

모든 harness가 동일하게 **`_workspace/`** 디렉토리에 단계별 보고서를 저장합니다. 파일명이 4개 harness 사이에 충돌하므로, 동시에 두 개를 굴리면 서로 덮어씁니다.

| 단계 | 16-fullstack | 19-database | 21-review | 28-security |
|------|-------------|-------------|-----------|-------------|
| 입력 | `00_input.md` | `00_input.md` | `00_input.md` | `00_input.md` |
| 1차 산출 | `01_architecture.md` | `01_data_model.md` | `01_style_review.md` | `01_vulnerability_scan.md` |
| 2차 | `02_api_spec.md` | `02_migration.sql` + `02_migration_plan.md` | `02_security_review.md` | `02_code_analysis.md` |
| 3차 | `03_db_schema.md` | `03_performance.md` | `03_performance_review.md` | `03_pentest_report.md` |
| 4차 | `04_test_plan.md` | `04_security.md` | `04_architecture_review.md` | `04_remediation_plan.md` |
| 종합 | `05_deploy_guide.md` + `06_review_report.md` | `05_review_report.md` | `05_review_summary.md` | `05_audit_report.md` |

**규칙**:
- 새로운 harness 실행 전 이전 산출물을 보관하고 싶으면 `_workspace/` → `_workspace/archive/<날짜>-<harness>/` 로 이동.
- `_workspace/` 는 `.gitignore` 에 추가하거나, 산출 보고서를 정식 문서화할 때 별도 위치(`docs/`, `supabase/` 등)로 옮길 것.

---

## INVEX 프로젝트 맥락에서의 사용 메모

루트 [../CLAUDE.md](../CLAUDE.md) 의 도메인 정보(Vanilla JS SPA + Supabase, RLS, 12개 테이블, 향후 HR/Payroll 확장)와 결합해 활용:

### 16-fullstack-webapp
- **주의**: 이 harness의 `frontend-dev` 기본 가정은 **React/Next.js** 입니다. INVEX 는 Vanilla JS + Vite 라서, 호출할 때 입력에 *"프레임워크 없음, Vanilla JS, `src/page-*.js` 패턴 사용"* 을 명시하세요. 그래야 specialist 가 React 코드를 만들지 않습니다.
- 새 페이지 모듈 추가(예: `page-employees.js`)에 적합. 루트 가이드의 [§9.3 새 페이지 추가 체크리스트](../CLAUDE.md) 와 함께 사용.

### 19-database-architect
- **Supabase 전용 컨텍스트** 를 입력에 포함: *"Postgres + RLS, `auth.uid() = user_id` 정책 필수, schema 변경은 [supabase/schema.sql](../supabase/schema.sql) 에 반영"*.
- 향후 HR/Payroll 테이블(`employees`, `attendance_records`, `payroll_records` 등) 설계에 적합. 루트 가이드 §12 의 미리 정의된 스키마와 함께 사용.

### 21-code-reviewer
- 이 harness 의 `performance-analyst` 는 **코드 성능** 분석가 (19의 `db-performance-analyst` 와는 별개).
- INVEX의 무거운 페이지(`page-inventory.js` 84KB, `page-inout.js` 70KB+, `style.css` 95KB+) 리팩토링 검토에 적합. 입력에 *"파일 크기/도메인 분리 우선순위 평가 포함"* 명시.

### 28-security-audit
- **RLS 정책 검증** 을 입력에 명시: *"각 테이블의 RLS 정책이 `user_id = auth.uid()` 로 되어있는지 + `audit_logs`/`profiles` 테이블의 권한 정책 확인"*.
- 인증 시스템(`auth.js`, `admin-auth.js`)의 fallback (`directPasswordLogin`) 도 감사 대상으로 명시할 것.

---

## 충돌 처리 메모 (개발자용)

설치 시 19와 21의 `performance-analyst` 가 동명 충돌이라, **19쪽을 `db-performance-analyst` 로 리네임** 했습니다. 영향 범위:

- [agents/db-performance-analyst.md](agents/db-performance-analyst.md) — frontmatter `name:` 도 일치하게 변경
- [skills/database-architect/skill.md](skills/database-architect/skill.md) — orchestrator 안 참조 일괄 치환
- [skills/query-optimization-catalog/skill.md](skills/query-optimization-catalog/skill.md) — extending skill 참조 치환
- [harnesses/19-database-architect.md](harnesses/19-database-architect.md) — 보관본 안 참조 치환

업스트림 harness-100 을 다시 가져와 덮어쓸 일이 생기면 이 4개 파일에서 같은 치환을 다시 해야 합니다.

---

## 새 harness 추가 절차

(필요할 때 참고)

1. `git clone --depth 1 --filter=blob:none --sparse https://github.com/revfactory/harness-100.git` 로 임시 클론 + sparse-checkout
2. `ko/<NN>-<name>/.claude/agents/*` → `.claude/agents/` 복사
3. `ko/<NN>-<name>/.claude/skills/*` → `.claude/skills/` 복사
4. `ko/<NN>-<name>/.claude/CLAUDE.md` → `.claude/harnesses/<NN>-<name>.md` 로 보관
5. 동명 agent·skill 충돌 시 한쪽을 리네임하고 그 harness 내부 참조도 일괄 치환
6. 위의 "설치된 4개 harness" 표와 [harnesses/README.md](harnesses/README.md) 업데이트
