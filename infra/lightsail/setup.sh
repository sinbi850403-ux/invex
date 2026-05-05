#!/usr/bin/env bash
#
# INVEX — AWS Lightsail Seoul 부트스트랩 스크립트
#
# 대상 OS: Ubuntu 22.04 LTS
# 대상 플랜: $10 (2GB RAM / 1 vCPU / 60GB SSD)
#
# 사용법:
#   ssh ubuntu@<lightsail-ip>
#   curl -fsSL https://raw.githubusercontent.com/<repo>/main/infra/lightsail/setup.sh | bash
#   또는 SCP로 업로드 후 bash setup.sh
#
# 이 스크립트는 다음을 수행합니다:
#   1. 시스템 업데이트 + 패키지 설치 (Docker, ufw, fail2ban, rclone)
#   2. swap 2GB 설정 (OOM 대비)
#   3. ufw 방화벽 (22번만 허용)
#   4. 타임존 Asia/Seoul
#   5. dbmate 설치
#   6. (수동) Supabase 클론 + .env 작성 + docker compose up 안내
#   7. (수동) Cloudflare Tunnel 셋업 안내
#
# 시크릿(JWT_SECRET, app.rrn_key 등)은 이 스크립트가 절대 생성/저장하지 않음.
# 1Password Vault에서 직접 가져와 .env에 채워 넣어야 함.

set -euo pipefail

log() { printf '\n\033[1;36m[INVEX]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[WARN]\033[0m %s\n' "$*"; }
err() { printf '\n\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

if [[ "$EUID" -eq 0 ]]; then
  err "root 사용자로 실행하지 마세요. 'ubuntu' 계정으로 실행하세요."
  exit 1
fi

# ============================================================
# 1. 시스템 업데이트 + 패키지 설치
# ============================================================
log "1/6 시스템 업데이트 중..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

log "필수 패키지 설치 (docker, ufw, fail2ban, rclone, jq, postgresql-client)..."
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  docker.io docker-compose-plugin \
  ufw fail2ban \
  rclone jq curl \
  postgresql-client-15 \
  ca-certificates

sudo usermod -aG docker "$USER"
log "  → docker 그룹 추가됨. 새 SSH 세션에서 sudo 없이 docker 명령 가능."

# ============================================================
# 2. swap 2GB 설정 (OOM 대비, 2GB RAM 인스턴스 안정화)
# ============================================================
if [[ ! -f /swapfile ]]; then
  log "2/6 swap 2GB 생성 중..."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  fi
  log "  → swap 활성화됨: $(free -h | grep Swap)"
else
  log "2/6 swap 이미 존재 — 건너뜀."
fi

# ============================================================
# 3. ufw 방화벽
# ============================================================
log "3/6 방화벽 설정 (22번만 허용, Cloudflare Tunnel은 outbound로 우회)..."
sudo ufw --force reset >/dev/null
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH (관리자 IP만 권장)'
sudo ufw --force enable
sudo ufw status verbose

# ============================================================
# 4. 타임존 + NTP
# ============================================================
log "4/6 타임존을 Asia/Seoul로 설정..."
sudo timedatectl set-timezone Asia/Seoul
sudo timedatectl set-ntp true
date

# ============================================================
# 5. dbmate 설치 (DB 마이그레이션 도구)
# ============================================================
if ! command -v dbmate >/dev/null; then
  log "5/6 dbmate 설치 중..."
  sudo curl -fsSL -o /usr/local/bin/dbmate \
    https://github.com/amacneil/dbmate/releases/latest/download/dbmate-linux-amd64
  sudo chmod +x /usr/local/bin/dbmate
  dbmate --version
else
  log "5/6 dbmate 이미 설치됨: $(dbmate --version)"
fi

# ============================================================
# 6. 후속 안내 (수동 작업)
# ============================================================
log "6/6 자동화 가능 단계 완료. 다음 작업은 수동 필요:"

cat <<'NEXT'

╔══════════════════════════════════════════════════════════════╗
║  다음 수동 단계                                               ║
╠══════════════════════════════════════════════════════════════╣

1) 새 SSH 세션 열기 (docker 그룹 적용)
   exit
   ssh ubuntu@<lightsail-ip>

2) Supabase 셀프호스트 클론
   git clone --depth 1 https://github.com/supabase/supabase ~/supabase
   cd ~/supabase/docker
   cp .env.example .env

3) 1Password에서 시크릿 가져와 .env 채우기
   - POSTGRES_PASSWORD
   - JWT_SECRET (64byte)
   - ANON_KEY, SERVICE_ROLE_KEY (위 JWT_SECRET으로 서명한 JWT)
   - SITE_URL=https://app.invex.io.kr
   - API_EXTERNAL_URL=https://api.invex.io.kr
   - GOTRUE_EXTERNAL_GOOGLE_* (Google OAuth)

4) Supabase 기동
   docker compose pull
   docker compose up -d
   docker compose ps  # 모든 서비스 healthy 확인

5) RRN 암호화 키 주입 (1Password에서 가져옴)
   docker exec -it supabase-db psql -U postgres -c \
     "ALTER DATABASE postgres SET app.rrn_key = '<32자이상-키>';"
   docker compose restart db

6) INVEX 리포 클론 + DB 스키마 적용
   git clone https://github.com/<your-org>/invex ~/invex
   cd ~/invex
   export DATABASE_URL="postgres://postgres:<POSTGRES_PASSWORD>@localhost:5432/postgres?sslmode=disable"
   dbmate -d ./db/migrations up

7) Cloudflare Tunnel 셋업
   sudo curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb
   sudo dpkg -i /tmp/cf.deb
   cloudflared tunnel login
   cloudflared tunnel create invex-api
   # ~/.cloudflared/config.yml 작성 (infra/cloudflared/config.yml.example 참고)
   cloudflared tunnel route dns invex-api api.invex.io.kr
   sudo cloudflared service install

8) 백업 자동화 (rclone + cron)
   rclone config            # R2 또는 S3 인증 설정
   sudo cp ~/invex/infra/cron/invex-backup /etc/cron.daily/
   sudo chmod +x /etc/cron.daily/invex-backup

9) 검증
   docker exec supabase-db psql -U postgres -c "\\dt"
   curl -s https://api.invex.io.kr/auth/v1/health | jq

자세한 절차는 db/runbook.md 참고.

╚══════════════════════════════════════════════════════════════╝
NEXT

log "셋업 스크립트 완료. 위 안내를 따라 수동 단계를 진행하세요."
