# INVEX DB 운영 Runbook (셀프호스트 Supabase)

> 대상 환경: AWS Lightsail Seoul ($10, 2GB RAM) + Docker Compose Supabase
>
> 본 문서는 일상 운영, 마이그레이션, 장애 대응 절차를 한 곳에 모은다.
> 시크릿(JWT_SECRET, app.rrn_key 등)은 **이 문서에 절대 기록하지 말 것** — 1Password Vault 사용.

---

## 0. 사전 자산 (1회 셋업 후 영구 보관)

| 자산 | 위치 | 비고 |
|------|------|------|
| Lightsail SSH key | 1Password "INVEX/Lightsail" | 분실 시 재발급 가능 |
| Cloudflare Tunnel credentials | 1Password "INVEX/CloudflareTunnel" | `~/.cloudflared/<UUID>.json` |
| Supabase JWT_SECRET | 1Password "INVEX/Supabase" | 64byte, 유출 시 모든 토큰 위조 가능 |
| Supabase ANON_KEY | 1Password "INVEX/Supabase" | 클라이언트 노출 OK |
| Supabase SERVICE_ROLE_KEY | 1Password "INVEX/Supabase" | 절대 클라이언트 노출 금지 |
| `app.rrn_key` (RRN/계좌 암호화) | 1Password + USB 오프라인 | **분실 시 평문 복호화 영구 불가** |
| Cloudflare R2 access key | 1Password "INVEX/R2" | 백업 업로드용 |
| Google OAuth Client ID/Secret | 1Password "INVEX/GoogleOAuth" | redirect URL 변경 시 사용 |

---

## 1. 신규 인스턴스 부트스트랩 (제로에서 운영까지)

### 1-1. Lightsail 인스턴스
```bash
# AWS Console → Lightsail → ap-northeast-2 (Seoul)
# Ubuntu 22.04 LTS, $10 plan, 고정 IP attach
# 방화벽: 22 (관리자 IP만), 80/443 차단 (Cloudflare Tunnel 사용)

ssh ubuntu@<lightsail-ip>
bash <(curl -fsSL https://raw.githubusercontent.com/<repo>/main/infra/lightsail/setup.sh)
```
또는 [infra/lightsail/setup.sh](../infra/lightsail/setup.sh) 를 SCP로 업로드 후 실행.

### 1-2. Supabase 셀프호스트
```bash
git clone --depth 1 https://github.com/supabase/supabase ~/supabase
cd ~/supabase/docker
cp .env.example .env

# 1Password에서 시크릿 가져와 .env에 채우기
# POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY,
# SITE_URL=https://app.invex.io.kr
# API_EXTERNAL_URL=https://api.invex.io.kr
# GOTRUE_EXTERNAL_GOOGLE_*

docker compose pull
docker compose up -d
docker compose ps   # 모든 서비스 healthy 확인
```

### 1-3. 암호화 키 주입
```bash
docker exec -it supabase-db psql -U postgres -c \
  "ALTER DATABASE postgres SET app.rrn_key = '<1Password에서 가져온 값>';"
docker compose restart db

# 검증
docker exec supabase-db psql -U postgres -c \
  "SELECT current_setting('app.rrn_key', true) IS NOT NULL;"
# → t (true) 기대
```

### 1-4. Cloudflare Tunnel
```bash
sudo curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
sudo dpkg -i /tmp/cf.deb
cloudflared tunnel login
cloudflared tunnel create invex-api

# infra/cloudflared/config.yml.example 참고하여 ~/.cloudflared/config.yml 작성
cloudflared tunnel route dns invex-api api.invex.io.kr
sudo cloudflared service install
sudo systemctl status cloudflared
```

### 1-5. DB 스키마 적용
```bash
# 옵션 A — 한 번에 schema.sql + 패치 6개 적용 (구식)
cd ~/invex   # git clone한 INVEX 리포
docker exec -i supabase-db psql -U postgres -d postgres < supabase/schema.sql
for f in supabase/fix-profiles-rls.sql \
         supabase/fix-profiles-rls-hr.sql \
         supabase/fix-team-rls.sql \
         supabase/fix-vendors-upsert.sql \
         supabase/fix-security-perf-2026-04.sql \
         supabase/item-code-normalization-2026-04.sql; do
  docker exec -i supabase-db psql -U postgres -d postgres < "$f"
done

# 옵션 B — dbmate 사용 (권장)
sudo curl -fsSL -o /usr/local/bin/dbmate https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64
sudo chmod +x /usr/local/bin/dbmate

export DATABASE_URL="postgres://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"
cd ~/invex
dbmate -d ./db/migrations status
dbmate -d ./db/migrations up
```

### 1-6. 검증 쿼리
```sql
-- 모든 테이블 존재 확인
\dt

-- RLS 정책 27개 이상 기대
SELECT count(*) FROM pg_policies WHERE schemaname='public';

-- pgcrypto extension 활성
SELECT extname FROM pg_extension WHERE extname='pgcrypto';

-- app.rrn_key 설정 확인
SELECT current_setting('app.rrn_key', true) IS NOT NULL;

-- 암복호화 라운드트립
SELECT pgp_sym_decrypt(
  pgp_sym_encrypt('test-rrn', current_setting('app.rrn_key')),
  current_setting('app.rrn_key')
);
-- 결과: 'test-rrn'

-- 관리자 이메일 등록 확인
SELECT * FROM system_config WHERE key='admin_emails';
```

---

## 2. 일상 마이그레이션 워크플로우 (스키마/컬럼 변경)

### 2-1. 신규 마이그레이션 생성 (개발자 로컬)
```bash
cd ~/invex
dbmate -d ./db/migrations new add_item_barcode
# 자동 생성: db/migrations/<ts>_add_item_barcode.sql
```

생성된 파일을 편집:
```sql
-- migrate:up
ALTER TABLE items ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode) WHERE barcode IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_items_barcode;
ALTER TABLE items DROP COLUMN IF EXISTS barcode;
```

> ⚠️ `CREATE/DROP INDEX CONCURRENTLY` 사용시 첫 줄을 `-- migrate:up transaction:false` 로 작성.

### 2-2. React 코드 동기화 체크리스트

| # | 파일 | 작업 |
|---|------|------|
| 1 | [src/db/converters.js](../src/db/converters.js) | snake_case ↔ camelCase 매핑 추가 |
| 2 | [src/db/items.js](../src/db/items.js) (또는 해당 도메인) | select/insert 컬럼 명시 |
| 3 | [src/components/inventory/ItemModal.jsx](../src/components/inventory/ItemModal.jsx) | 입력 폼 필드 |
| 4 | [src/pages/InventoryPage.jsx](../src/pages/InventoryPage.jsx) | 표시 컬럼 |
| 5 | RLS 정책 영향 검토 | PII면 view/column-level 권한 분리 |

### 2-3. 로컬 검증
```bash
# 로컬 PG 또는 Lightsail DEV 인스턴스에 적용
dbmate up
npm run dev   # React에서 동작 검증

# 멱등성 검증
dbmate rollback && dbmate up
```

### 2-4. PR → main 머지 → production 적용
1. PR 머지: GitHub Actions가 임시 PG 컨테이너에서 `dbmate up && rollback && up` dry-run
2. main 머지: 자동으로 production Lightsail SSH → 직전 자동 백업 → `dbmate up`

---

## 3. 무중단 변경 패턴 (zero-downtime)

| 변경 유형 | 안전 절차 |
|---------|----------|
| **컬럼 추가** | NULL 허용 + 기본값 → 코드 배포 → 데이터 백필 (단일 마이그레이션 OK) |
| **컬럼 삭제** | (배포 N) 코드에서 참조 제거 → 1주 모니터링 → (N+1) `DROP COLUMN` |
| **컬럼 이름 변경** | 1) 새 컬럼 추가 → 2) 트리거로 양방향 sync 또는 백필 → 3) 코드 전환 → 4) 구 컬럼 삭제 (3단계 배포) |
| **인덱스 추가** | `CREATE INDEX CONCURRENTLY` (락 회피) — `transaction:false` 필수 |
| **NOT NULL 추가** | 기본값 추가 → 백필 → `SET NOT NULL` 별도 마이그레이션 |
| **타입 변경** | 새 컬럼 추가 → 점진 마이그레이션 → 구 컬럼 삭제 |

---

## 4. 백업 / 복구

### 4-1. 일일 자동 백업 (Cloudflare R2)
```bash
# /etc/cron.daily/invex-backup (인스턴스 부트스트랩 시 자동 설치)
sudo cat /etc/cron.daily/invex-backup
# 보관 정책: 일일 7개 + 주간 4개 + 월간 6개
```

수동 백업:
```bash
docker exec supabase-db pg_dump -U postgres -Fc postgres \
  | rclone rcat r2:invex-backup/manual_$(date +%Y%m%d_%H%M).dump
```

### 4-2. 복구 시뮬레이션 (월 1회)
```bash
# 임시 컨테이너로 복구 검증
docker run --rm -d --name invex-restore-test -e POSTGRES_PASSWORD=test postgres:15
sleep 5
rclone cat r2:invex-backup/db_<latest>.dump | \
  docker exec -i invex-restore-test pg_restore -U postgres -d postgres
docker exec invex-restore-test psql -U postgres -c "\\dt"
docker stop invex-restore-test
```

### 4-3. 실제 복구 (재해 시)
```bash
# 1. 새 Lightsail 인스턴스 부트스트랩 (1-1 ~ 1-4)
# 2. 복구
rclone cat r2:invex-backup/db_<target>.dump | \
  docker exec -i supabase-db pg_restore -U postgres -d postgres --clean --if-exists
# 3. app.rrn_key 재주입 (1-3)
# 4. Cloudflare Tunnel 도메인 갱신
# 5. 사용자에게 복구 사실 공지
```

---

## 5. 시크릿 로테이션

### 5-1. JWT_SECRET 유출시
```bash
# 영향: 모든 발급된 토큰 즉시 무효화 → 전 사용자 재로그인 필요
# 1. 새 시크릿 생성
NEW_JWT=$(openssl rand -base64 64)

# 2. .env 업데이트 + ANON_KEY/SERVICE_ROLE_KEY 재발급
#    (jwt-generate 도구로 새 JWT_SECRET으로 서명)

# 3. 컨테이너 재시작
cd ~/supabase/docker
docker compose down
docker compose up -d

# 4. 클라이언트 .env.production 업데이트
#    Cloudflare Pages → Settings → Environment Variables → 재배포

# 5. 1Password 갱신 + 사고 보고서 작성
```

### 5-2. app.rrn_key 절대 분실 금지
- 매 분기 1Password + USB 오프라인 백업 라운드트립 검증
- 분실 시 RRN/계좌번호 평문 영구 복구 불가
- 사용자 데이터 유출 사고와 동급 — 법적 보고 의무 검토

---

## 6. 모니터링 / 알람

### 6-1. Lightsail CloudWatch
- CPU 80% 5분 지속 → 알람
- Disk 80% → 알람
- 인스턴스 다운 → 알람

### 6-2. PostgreSQL slow query
```sql
-- 한번만 실행
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- 주간 점검
SELECT calls, total_exec_time, mean_exec_time, query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

### 6-3. Supabase 컨테이너 헬스
```bash
# 매 5분 (cron)
docker compose -f ~/supabase/docker/docker-compose.yml ps --format json | \
  jq -e '.[] | select(.Health != "healthy")' && \
  echo "[ALARM] supabase service unhealthy" | \
  curl -X POST -d @- https://hooks.slack.com/...
```

---

## 7. 장애 대응 (incident response)

### 7-1. API 응답 없음 (5xx 폭증)
1. `docker compose ps` — 컨테이너 상태 확인
2. `docker compose logs -f rest auth` — 에러 로그 추적
3. `docker stats` — OOM 의심시 swap 사용량 확인
4. 임시 조치: `docker compose restart rest auth`
5. 근본 원인 분석 후 재발 방지

### 7-2. 디스크 full
1. `df -h /` — 사용량 확인
2. `docker system prune -af` — 미사용 이미지/컨테이너 정리
3. `du -sh ~/supabase/docker/volumes/db/data` — DB 데이터 크기
4. 백업 후 `pg_repack` 또는 인스턴스 $20 (4GB / 80GB) 업그레이드

### 7-3. Cloudflare Tunnel 끊김
1. `sudo systemctl status cloudflared`
2. `sudo journalctl -u cloudflared -f`
3. 자격증명 만료 의심: `cloudflared tunnel login` 재실행
4. 고정 IP 변경: `cloudflared tunnel route dns invex-api api.invex.io.kr` 재실행

---

## 8. 컷오버 (Supabase Cloud → 셀프호스트)

전체 절차는 `_workspace/migration-cutover.md` 또는 [planfile](../../.claude/plans/1-supabase-on-idempotent-aho.md) §I 마일스톤 참고.

핵심 포인트:
- DNS TTL 60초로 단축 (전일)
- 신규 사용자만 셀프호스트로 (테스트 단계)
- 구 Supabase Cloud는 **1개월 일시정지 보관** (롤백 대비)
- Google OAuth redirect URL은 **양쪽 1주일 병존**
