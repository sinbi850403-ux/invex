# Installed Harnesses (revfactory/harness-100, ko/)

INVEX 프로젝트에 설치된 harness 목록입니다. 원본은 https://github.com/revfactory/harness-100 의 `ko/` 디렉토리에서 가져왔습니다.

| # | Harness | Orchestrator Skill | 용도 |
|---|---------|--------------------|------|
| 16 | [fullstack-webapp](16-fullstack-webapp.md) | `fullstack-webapp` | 풀스택 웹앱 기획·구현 (architect, frontend-dev, backend-dev, devops-engineer, qa-engineer) |
| 19 | [database-architect](19-database-architect.md) | `database-architect` | DB 스키마/인덱스 설계 (data-modeler, migration-manager, db-performance-analyst, security-auditor, integration-reviewer) |
| 21 | [code-reviewer](21-code-reviewer.md) | `code-reviewer` | 코드 리뷰 (architecture-reviewer, security-analyst, performance-analyst, style-inspector, review-synthesizer) |
| 28 | [security-audit](28-security-audit.md) | `security-audit` | OWASP 기반 보안 감사 (vulnerability-scanner, code-analyst, security-consultant, pentest-reporter, audit-reviewer) |

## 사용 방법

각 harness는 **orchestrator skill**(같은 이름의 슬래시 커맨드처럼 동작)을 통해 호출합니다. 예:

- `/fullstack-webapp …` — 풀스택 기능 한 사이클 진행
- `/database-architect …` — DB 스키마 신규 설계 / 최적화
- `/code-reviewer …` — 현재 브랜치/PR 코드 리뷰
- `/security-audit …` — 보안 감사 1회 수행

각 orchestrator는 내부에서 자기 harness의 5개 specialist agent를 SendMessage로 조율하며, 자기 harness의 보조 skill들을 함께 사용합니다.

## 충돌 처리 메모

`19-database-architect`의 `performance-analyst`와 `21-code-reviewer`의 `performance-analyst`가 동명 충돌이라, 19쪽을 **`db-performance-analyst`**로 리네임했습니다. 19의 orchestrator skill / `query-optimization-catalog` skill / 보관된 CLAUDE.md 안의 참조도 모두 `db-performance-analyst`로 일괄 치환했습니다. 21의 `performance-analyst`는 원본 그대로 유지됩니다.

## 설치된 자산

- agents: 20개 (`.claude/agents/*.md`)
- skills: 13개 (`.claude/skills/*/skill.md`)

자세한 harness별 설명은 위 표의 링크에서 각 보관된 `CLAUDE.md`를 참고하세요.
