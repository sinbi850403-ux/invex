/**
 * main.js - INVEX 앱 진입점
 * 역할: 페이지 라우팅, 네비게이션 관리, 모바일 지원, 데이터 백업/복원
 */

import './style.css';
import { initErrorMonitor, setMonitorUser, clearMonitorUser } from './error-monitor.js';

// 에러 모니터링 초기화 (가능한 한 빨리 실행)
// 왜 여기서? → 앱 초기화 과정의 에러도 잡기 위함
initErrorMonitor();
import { restoreState, getState, setState } from './store.js';
import { renderUploadPage } from './page-upload.js';
import { renderMappingPage } from './page-mapping.js';
import { renderInventoryPage } from './page-inventory.js';
import { renderInoutPage } from './page-inout.js';
import { renderSummaryPage } from './page-summary.js';
import { renderScannerPage } from './page-scanner.js';
import { renderDocumentsPage } from './page-documents.js';
import { renderDashboardPage } from './page-dashboard.js';
import { renderHomePage } from './page-home.js';
import { renderTransferPage } from './page-transfer.js';
import { renderLedgerPage } from './page-ledger.js';
import { renderSettingsPage } from './page-settings.js';
import { renderVendorsPage } from './page-vendors.js';
import { renderStocktakePage } from './page-stocktake.js';
import { renderBulkPage } from './page-bulk.js';
import { renderAuditLogPage } from './audit-log.js';
import { renderCostingPage } from './page-costing.js';
import { renderLabelsPage } from './page-labels.js';
import { renderAccountsPage } from './page-accounts.js';
import { renderWarehousesPage } from './page-warehouses.js';
import { renderRolesPage } from './page-roles.js';
import { renderApiPage } from './page-api.js';
import { renderBillingPage } from './page-billing.js';
import { renderAdminPage, isAdmin } from './page-admin.js';
import { renderMyPage } from './page-mypage.js';
import { renderGuidePage } from './page-guide.js';
import { renderSupportPage } from './page-support.js';
import { renderTeamPage } from './page-team.js';
import { renderTaxReportsPage } from './page-tax-reports.js';
import { renderAutoOrderPage } from './page-auto-order.js';
import { renderProfitPage } from './page-profit.js';
import { renderBackupPage } from './page-backup.js';
import { renderOrdersPage } from './page-orders.js';
import { initGlobalSearch, toggleGlobalSearch } from './global-search.js';
import { initTheme, toggleTheme } from './theme.js';
import { initAuth, getCurrentUser, getUserProfileData, loginWithGoogle, loginWithEmail, signupWithEmail, resetPassword, logout } from './firebase-auth.js';
import { startSync, stopSync, syncToCloud, getSyncStatus } from './firebase-sync.js';
import { startWorkspaceSync, stopWorkspaceSync, syncWorkspaceToCloud } from './workspace.js';
import { setSyncCallback } from './store.js';
import { renderNotificationPanel, getNotificationCount } from './notifications.js';
import { showToast } from './toast.js';
import { canAccessPage, getPageBadge, showUpgradeModal, getCurrentPlan, PLANS, setPlan, injectGetCurrentUser, injectGetUserProfile } from './plan.js';

// 다크 모드 초기화
initTheme();

// 총관리자 기능 해제를 위해 getCurrentUser를 plan.js에 주입
injectGetCurrentUser(getCurrentUser);
injectGetUserProfile(getUserProfileData);

// Firebase 인증 초기화 — 로그인 상태에 따라 앱 접근 제어
let isAuthReady = false;

// === 로그인 게이트 이벤트 ===

// 탭 전환 (로그인 ↔ 회원가입)
// 탭 전환 (로그인 ↔ 회원가입) — CSS 클래스 기반으로 변경
// 왜? → 인라인 style은 CSS 파일보다 우선순위가 높아 auth.css를 무시함
document.getElementById('tab-login')?.addEventListener('click', () => {
  document.getElementById('form-login').style.display = 'block';
  document.getElementById('form-signup').style.display = 'none';
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  tabLogin.classList.add('active');
  tabLogin.classList.remove('active-signup');
  tabSignup.classList.remove('active', 'active-signup');
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-signup').style.display = 'block';
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  tabSignup.classList.add('active', 'active-signup');
  tabLogin.classList.remove('active', 'active-signup');
});

// 이메일 로그인
document.getElementById('gate-email-login')?.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('이메일과 비밀번호를 입력하세요.', 'warning'); return; }
  await loginWithEmail(email, password);
});

// Enter 키로 로그인
document.getElementById('login-password')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-login')?.click();
});

// 이메일 회원가입
document.getElementById('gate-email-signup')?.addEventListener('click', async () => {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-password').value;
  const pw2 = document.getElementById('signup-password2').value;
  const agreed = document.getElementById('signup-agree')?.checked;
  if (!name) { showToast('이름을 입력하세요.', 'warning'); return; }
  if (!email) { showToast('이메일을 입력하세요.', 'warning'); return; }
  if (pw.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다.', 'warning'); return; }
  if (pw !== pw2) { showToast('비밀번호가 일치하지 않습니다.', 'warning'); return; }
  if (!agreed) { showToast('이용약관 및 개인정보처리방침에 동의해주세요.', 'warning'); return; }
  await signupWithEmail(email, pw, name);
});

// Enter 키로 회원가입
document.getElementById('signup-password2')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-signup')?.click();
});

// 이용약관 모달
document.getElementById('link-terms')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLegalModal('서비스 이용약관', getTermsContent());
});

// 개인정보처리방침 모달
document.getElementById('link-privacy')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLegalModal('개인정보처리방침', getPrivacyContent());
});

/**
 * 법률 문서 모달
 */
function showLegalModal(title, content) {
  // 왜 CSS 클래스? → 인라인 style에서 CSS 변수를 쓰면 라이트 모드에서
  // --text-primary가 #1a1a2e(어두움)로 적용되어 글자가 안 보임
  const modal = document.createElement('div');
  modal.className = 'legal-modal-overlay';
  modal.innerHTML = `
    <div class="legal-modal">
      <div class="legal-modal-header">
        <h3>📋 ${title}</h3>
        <button class="legal-modal-close">✕</button>
      </div>
      <div class="legal-modal-body">
        ${content}
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.legal-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

function getTermsContent() {
  // 왜 인라인 style을 제거? → CSS 변수가 라이트 모드에서 어두운 색을 반환하여
  // 어두운 모달 배경 위에 글자가 안 보이는 문제 발생. auth.css의 .legal-modal-body h4 규칙이 적용됨.
  return `
    <h4>제1조 (목적)</h4>
    <p>이 약관은 INVEX(이하 "서비스")가 제공하는 재고·경영 관리 서비스의 이용조건 및 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
    
    <h4>제2조 (정의)</h4>
    <p>① "서비스"란 INVEX가 제공하는 웹 기반 재고관리, 입출고 처리, 원가분석, 문서생성 등의 기능을 말합니다.<br/>
    ② "이용자"란 본 약관에 따라 서비스를 이용하는 자를 말합니다.<br/>
    ③ "계정"이란 이용자의 식별과 서비스 이용을 위해 이용자가 설정하고 회사가 승인하는 이메일 및 비밀번호의 조합을 말합니다.</p>

    <h4>제3조 (약관의 효력 및 변경)</h4>
    <p>① 본 약관은 서비스 화면에 게시하거나 이메일 등의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.<br/>
    ② 회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.</p>

    <h4>제4조 (서비스의 제공)</h4>
    <p>① 회사는 다음과 같은 서비스를 제공합니다.<br/>
    - 재고 현황 관리 및 모니터링<br/>
    - 입출고 처리 및 이력 관리<br/>
    - 원가 분석 및 보고서 생성<br/>
    - 바코드 스캔 및 라벨 인쇄<br/>
    - 거래처 관리<br/>
    ② 서비스는 Free, Pro, Enterprise 요금제로 구분되며, 각 요금제별 제공 기능이 다릅니다.</p>

    <h4>제5조 (이용자의 의무)</h4>
    <p>① 이용자는 타인의 정보를 도용하여서는 안 됩니다.<br/>
    ② 이용자는 서비스를 이용하여 불법행위를 하여서는 안 됩니다.<br/>
    ③ 이용자는 자신의 계정 정보를 안전하게 관리할 책임이 있습니다.</p>

    <h4>제6조 (서비스 이용 제한)</h4>
    <p>회사는 이용자가 본 약관을 위반하거나 서비스의 정상적인 운영을 방해한 경우, 서비스 이용을 제한하거나 계정을 삭제할 수 있습니다.</p>

    <h4>제7조 (면책조항)</h4>
    <p>① 천재지변, 전쟁 등 불가항력으로 인한 서비스 중단에 대해 회사는 책임을 지지 않습니다.<br/>
    ② 이용자의 귀책사유로 인한 서비스 이용 장애에 대해 회사는 책임을 지지 않습니다.</p>

    <p class="legal-date">시행일: 2026년 4월 1일</p>
  `;
}

function getPrivacyContent() {
  return `
    <h4>1. 개인정보의 수집 및 이용 목적</h4>
    <p>INVEX(이하 "서비스")는 다음의 목적을 위하여 개인정보를 처리합니다.</p>
    <p>① 회원 가입 및 관리: 회원 가입 의사 확인, 서비스 제공에 따른 본인 식별·인증, 회원자격 유지·관리<br/>
    ② 서비스 제공: 재고관리, 입출고 처리, 보고서 생성 등 핵심 서비스 제공<br/>
    ③ 고객 지원: 민원 처리, 공지사항 전달</p>

    <h4>2. 수집하는 개인정보 항목</h4>
    <table>
      <tr>
        <td>필수항목</td>
        <td>이름(닉네임), 이메일 주소, 비밀번호</td>
      </tr>
      <tr>
        <td>자동수집</td>
        <td>접속 IP, 접속 시간, 브라우저 정보</td>
      </tr>
      <tr>
        <td>소셜 로그인</td>
        <td>Google 계정 이름, 이메일, 프로필 사진</td>
      </tr>
    </table>

    <h4>3. 개인정보의 보유 및 이용 기간</h4>
    <p>① 회원 탈퇴 시까지 보유하며, 탈퇴 후 지체 없이 파기합니다.<br/>
    ② 단, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보존합니다.</p>

    <h4>4. 개인정보의 제3자 제공</h4>
    <p>서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 다만, 다음의 경우에는 예외로 합니다.<br/>
    ① 이용자가 사전에 동의한 경우<br/>
    ② 법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차에 따라 요청이 있는 경우</p>

    <h4>5. 개인정보의 안전성 확보 조치</h4>
    <p>서비스는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다.<br/>
    ① 비밀번호 암호화 저장 (Firebase Authentication)<br/>
    ② 데이터 전송 시 SSL/TLS 암호화<br/>
    ③ 접근 권한 관리 및 접근 통제</p>

    <h4>6. 이용자의 권리</h4>
    <p>이용자는 언제든지 자신의 개인정보를 조회, 수정, 삭제할 수 있으며, 회원 탈퇴를 통해 개인정보 처리의 정지를 요청할 수 있습니다.</p>

    <h4>7. 개인정보 보호책임자</h4>
    <p>이메일: sinbi0214@naver.com</p>

    <p class="legal-date">시행일: 2026년 4월 1일</p>
  `;
}

// 비밀번호 찾기
document.getElementById('btn-forgot-pw')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('이메일 주소를 먼저 입력해주세요.', 'warning'); return; }
  await resetPassword(email);
});

// Google 소셜 로그인
document.getElementById('gate-google-login')?.addEventListener('click', async () => {
  const loadingEl = document.getElementById('gate-loading');
  if (loadingEl) loadingEl.style.display = 'block';
  const user = await loginWithGoogle();
  if (!user && loadingEl) loadingEl.style.display = 'none';
});

initAuth((user, profile) => {
  const gate = document.getElementById('auth-gate');
  
  if (user) {
    // ✅ 로그인 성공 → 게이트 숨기고 앱 표시
    if (gate) {
      gate.style.opacity = '0';
      setTimeout(() => { gate.style.display = 'none'; }, 300);
    }
    startSync(user.uid);
    // 워크스페이스 동기화도 시작 (팀원 간 실시간 공유)
    startWorkspaceSync(user.uid);
    // 데이터 변경 시 자동으로 워크스페이스에 동기화
    setSyncCallback(() => syncWorkspaceToCloud());
    updateUserUI(user, profile);
    // 에러 모니터링에 사용자 정보 설정 (어떤 사용자에게 에러가 발생했는지 추적)
    setMonitorUser(user.uid, user.email);
    
    // 총관리자만 관리자 메뉴 표시
    const adminBtn = document.querySelector('[data-page="admin"]');
    if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';
    
    // 최초 로그인 시에만 앱 초기화 (중복 방지)
    if (!isAuthReady) {
      isAuthReady = true;
      initAppAfterAuth();
    }
  } else {
    // ❌ 미로그인 → 게이트 표시
    stopSync();
    stopWorkspaceSync();
    setSyncCallback(null);
    updateUserUI(null, null);
    clearMonitorUser();
    if (gate) {
      gate.style.display = 'flex';
      gate.style.opacity = '1';
    }
    isAuthReady = false;
  }
});

// 현재 페이지 (홈을 기본으로)
let currentPage = 'home';

// 페이지별 렌더 함수
const pages = {
  home: renderHomePage,
  upload: renderUploadPage,
  mapping: renderMappingPage,
  inventory: renderInventoryPage,
  inout: renderInoutPage,
  summary: renderSummaryPage,
  scanner: renderScannerPage,
  documents: renderDocumentsPage,
  dashboard: renderDashboardPage,
  transfer: renderTransferPage,
  ledger: renderLedgerPage,
  settings: renderSettingsPage,
  vendors: renderVendorsPage,
  stocktake: renderStocktakePage,
  bulk: renderBulkPage,
  auditlog: renderAuditLogPage,
  costing: renderCostingPage,
  labels: renderLabelsPage,
  accounts: renderAccountsPage,
  warehouses: renderWarehousesPage,
  roles: renderRolesPage,
  api: renderApiPage,
  billing: renderBillingPage,
  admin: renderAdminPage,
  mypage: renderMyPage,
  guide: renderGuidePage,
  support: renderSupportPage,
  team: renderTeamPage,
  'tax-reports': renderTaxReportsPage,
  'auto-order': renderAutoOrderPage,
  profit: renderProfitPage,
  backup: renderBackupPage,
  orders: renderOrdersPage,
};

/**
 * 페이지 전환
 * 요금제 체크 → 접근 불가 시 업그레이드 모달 표시
 */
function navigateTo(pageName) {
  if (!pages[pageName]) return;

  // 요금제 접근 제어
  if (!canAccessPage(pageName)) {
    showUpgradeModal(pageName);
    return;
  }

  currentPage = pageName;

  // 모든 nav 영역의 버튼 활성 상태 업데이트
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageName);
  });

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '';
  mainContent.scrollTop = 0;
  pages[pageName](mainContent, navigateTo);

  // 모바일에서 사이드바 닫기
  closeSidebar();

  // 알림 뱃지 업데이트
  updateNotifBadge();
}

/**
 * 알림 뱃지 업데이트
 * 왜 페이지 전환 시마다? → 입출고 등록 후 재고 상태가 바뀔 수 있으므로
 */
function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const count = getNotificationCount();
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

// 사이드바 메뉴에 요금제 배지 적용 + 이벤트 연결
function updateSidebarBadges() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const pageId = btn.dataset.page;
    if (!pageId) return;

    // 이벤트 연결
    btn.addEventListener('click', () => navigateTo(pageId));

    // 기존 배지 제거
    btn.querySelectorAll('.plan-badge').forEach(b => b.remove());

    const badge = getPageBadge(pageId);
    if (badge) {
      // 잠금 스타일 적용
      btn.style.opacity = '0.55';
      const badgeEl = document.createElement('span');
      badgeEl.className = 'plan-badge';
      badgeEl.textContent = badge.text;
      badgeEl.style.cssText = `font-size:9px; background:linear-gradient(135deg,${badge.color},${badge.color}cc); color:#fff; padding:1px 5px; border-radius:4px; margin-left:auto;`;
      btn.appendChild(badgeEl);
    } else {
      btn.style.opacity = '1';
    }
  });
}
updateSidebarBadges();

// 사이드바 하단 요금제 표시 업데이트
function updatePlanDisplay() {
  const planId = getCurrentPlan();
  const plan = PLANS[planId];
  const el = document.getElementById('plan-name');
  if (el && plan) {
    el.textContent = `${plan.icon} ${plan.name}`;
    el.style.color = plan.color;
  }
}
updatePlanDisplay();

// 요금제 클릭 → 변경 팝업
document.getElementById('plan-display')?.addEventListener('click', () => {
  const current = getCurrentPlan();
  const existing = document.getElementById('plan-picker-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'plan-picker-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-header">
        <h3>📋 요금제 선택</h3>
        <button class="btn btn-ghost btn-sm" id="plan-pick-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
          ${Object.values(PLANS).map(p => `
            <div class="plan-pick-card" data-plan="${p.id}" style="
              border:2px solid ${current === p.id ? p.color : 'var(--border)'};
              border-radius:12px; padding:20px; text-align:center; cursor:pointer;
              background:${current === p.id ? p.color + '15' : 'var(--bg-secondary)'};
              transition:all 0.2s;
            ">
              <div style="font-size:28px;">${p.icon}</div>
              <div style="font-size:16px; font-weight:700; margin:4px 0;">${p.name}</div>
              <div style="font-size:20px; font-weight:800; color:${p.color};">${p.price}</div>
              <div style="font-size:11px; color:var(--text-muted);">${p.period}</div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${p.description}</div>
              ${current === p.id ? '<div style="margin-top:8px; font-size:11px; color:var(--success); font-weight:600;">✓ 현재 요금제</div>' : ''}
            </div>
          `).join('')}
        </div>
        <div style="margin-top:12px; font-size:11px; color:var(--text-muted); text-align:center;">
          * 무료 체험: 모든 기능을 즉시 활성화합니다
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#plan-pick-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelectorAll('.plan-pick-card').forEach(card => {
    card.addEventListener('click', () => {
      const planId = card.dataset.plan;
      setPlan(planId);
      modal.remove();
      showToast(`${PLANS[planId].icon} ${PLANS[planId].name} 요금제로 변경되었습니다.`, 'success');
      // 사이드바 배지 + 표시 갱신
      updateSidebarBadges();
      updatePlanDisplay();
    });
  });
});

// 알림 버튼 이벤트
document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
  e.stopPropagation();
  renderNotificationPanel();
});

// 글로벌 검색 초기화 & 버튼
initGlobalSearch(navigateTo);
document.getElementById('btn-global-search')?.addEventListener('click', () => {
  toggleGlobalSearch();
});

// 다크모드 토글 버튼
document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  toggleTheme();
  const isDark = document.documentElement.classList.contains('dark-mode');
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = isDark ? '☀️ 라이트' : '🌙 다크';
});

// === 모바일 토글 ===

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('mobile-toggle');
const overlay = document.getElementById('sidebar-overlay');

function openSidebar() {
  sidebar?.classList.add('open');
  overlay?.classList.add('active');
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  overlay?.classList.remove('active');
}

toggleBtn?.addEventListener('click', () => {
  if (sidebar?.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

overlay?.addEventListener('click', closeSidebar);

// === 데이터 백업 / 복원 ===

/**
 * 왜 JSON 백업? → IndexedDB는 브라우저별로 격리되어 있어서
 * 다른 기기로 데이터를 이동하거나, 만약의 삭제에 대비하기 위해
 */

document.getElementById('btn-backup')?.addEventListener('click', () => {
  try {
    const state = getState();
    // 백업에 필요한 핵심 데이터만 추출 (rawData 등 대용량 원본은 제외)
    const backup = {
      version: '1.5',
      exportedAt: new Date().toISOString(),
      fileName: state.fileName,
      mappedData: state.mappedData || [],
      transactions: state.transactions || [],
      safetyStock: state.safetyStock || {},
      columnMapping: state.columnMapping || {},
      visibleColumns: state.visibleColumns || null,
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `INVEX_백업_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('데이터를 백업했습니다.', 'success');
  } catch (err) {
    showToast('백업 실패: ' + err.message, 'error');
  }
});

const restoreInput = document.getElementById('restore-input');
document.getElementById('btn-restore')?.addEventListener('click', () => {
  restoreInput?.click();
});

restoreInput?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const backup = JSON.parse(ev.target.result);

      // 기본 유효성 검사
      if (!backup.mappedData || !Array.isArray(backup.mappedData)) {
        showToast('유효하지 않은 백업 파일입니다.', 'error');
        return;
      }

      if (!confirm(`백업 파일을 복원하시겠습니까?\n\n파일: ${backup.fileName || '알 수 없음'}\n품목 수: ${backup.mappedData.length}건\n입출고 기록: ${(backup.transactions || []).length}건\n\n⚠️ 현재 데이터가 모두 교체됩니다.`)) {
        return;
      }

      setState({
        mappedData: backup.mappedData,
        transactions: backup.transactions || [],
        safetyStock: backup.safetyStock || {},
        fileName: backup.fileName || '',
        columnMapping: backup.columnMapping || {},
        visibleColumns: backup.visibleColumns || null,
        currentStep: 3,
      });

      showToast(`복원 완료: ${backup.mappedData.length}건`, 'success');
      navigateTo('inventory');
    } catch (err) {
      showToast('복원 실패: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);

  // 같은 파일 재선택 가능하도록 초기화
  e.target.value = '';
});

// 앱 초기화 (로그인 완료 후 호출)
// 왜 분리? → 인증 확인 전에 IndexedDB 복원하면 빈 데이터가 로드될 수 있음
async function initAppAfterAuth() {
  await restoreState();
  // 요금제 배지 & 표시 최신화
  updateSidebarBadges();
  updatePlanDisplay();
  navigateTo(currentPage);
}

// Firebase 미설정(로컬 개발) 시에는 게이트 자동 해제
// isConfigured가 false면 initAuth에서 user=null로 콜백 → 게이트가 뜨지만, 
// 로컬 개발을 위해 자동 해제
import { isConfigured } from './firebase-config.js';
if (!isConfigured) {
  const gate = document.getElementById('auth-gate');
  if (gate) gate.style.display = 'none';
  initAppAfterAuth();
}

// 사용자 UI 업데이트 (로그인/로그아웃 시 호출)
function updateUserUI(user, profile) {
  const userArea = document.getElementById('user-info-area');
  if (!userArea) return;

  if (user) {
    const name = profile?.name || user.displayName || '사용자';
    const photo = user.photoURL;
    const plan = (profile?.plan || 'free').toUpperCase();
    const syncStatus = getSyncStatus();
    userArea.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; padding:4px 0;">
        ${photo ? `<img src="${photo}" style="width:24px; height:24px; border-radius:50%; border:1px solid rgba(255,255,255,0.2);" />` : ''}
        <div style="flex:1; min-width:0;">
          <div style="font-size:11px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
          <div style="font-size:10px; color:rgba(255,255,255,0.5);">${plan} ${syncStatus.isConnected ? '☁️' : ''}</div>
        </div>
        <button class="btn-icon" id="btn-logout" title="로그아웃" style="font-size:11px; color:rgba(255,255,255,0.5);">↗</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', () => { logout(); });
  } else {
    userArea.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-login" style="color:rgba(255,255,255,0.7); font-size:12px; width:100%;">
        🔐 로그인
      </button>
    `;
    document.getElementById('btn-login')?.addEventListener('click', () => { loginWithGoogle(); });
  }
}

// PWA Service Worker 등록
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('SW registered'))
      .catch((err) => console.log('SW failed:', err));
  });
}
