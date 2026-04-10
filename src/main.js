/**
 * main.js - INVEX ??吏꾩엯??
 * ??븷: ?섏씠吏 ?쇱슦?? ?ㅻ퉬寃뚯씠??愿由? 紐⑤컮??吏?? ?곗씠??諛깆뾽/蹂듭썝
 */

import './style.css';
import { initErrorMonitor, setMonitorUser, clearMonitorUser } from './error-monitor.js';

// ?먮윭 紐⑤땲?곕쭅 珥덇린??(媛?ν븳 ??鍮⑤━ ?ㅽ뻾)
// ???ш린?? ????珥덇린??怨쇱젙???먮윭???↔린 ?꾪븿
initErrorMonitor();
import { restoreState, getState, setState } from './store.js';
import { renderAuditLogPage } from './audit-log.js';
import { isAdmin } from './admin-auth.js';
import { checkAndShowOnboarding } from './onboarding.js';
import { initGlobalSearch, toggleGlobalSearch } from './global-search.js';
import { initTheme, toggleTheme } from './theme.js';
import { initAuth, getCurrentUser, getUserProfileData, loginWithGoogle, loginWithEmail, signupWithEmail, resetPassword, logout } from './firebase-auth.js';
import { startSync, stopSync, syncToCloud, getSyncStatus } from './firebase-sync.js';
import { startWorkspaceSync, stopWorkspaceSync, syncWorkspaceToCloud } from './workspace.js';
import { setSyncCallback } from './store.js';
import { renderNotificationPanel, getNotificationCount } from './notifications.js';
import { showToast } from './toast.js';
import { canAccessPage, getPageBadge, showUpgradeModal, getCurrentPlan, PLANS, setPlan, injectGetCurrentUser, injectGetUserProfile } from './plan.js';
import { mountAutoTableSort } from './table-auto-sort.js';

// ?ㅽ겕 紐⑤뱶 珥덇린??
initTheme();

// 珥앷?由ъ옄 湲곕뒫 ?댁젣瑜??꾪빐 getCurrentUser瑜?plan.js??二쇱엯
injectGetCurrentUser(getCurrentUser);
injectGetUserProfile(getUserProfileData);

// Firebase ?몄쬆 珥덇린????濡쒓렇???곹깭???곕씪 ???묎렐 ?쒖뼱
let isAuthReady = false;

// === ?쒕뵫 ?섏씠吏 ?대깽??===
// ?? ???쒕뵫?먯꽌 "臾대즺濡??쒖옉?섍린" ?대┃ ???쒕뵫 ?④린怨?濡쒓렇??寃뚯씠???쒖떆
function showAuthGate() {
  const landing = document.getElementById('landing-page');
  const gate = document.getElementById('auth-gate');
  if (landing) landing.style.display = 'none';
  if (gate) { gate.style.display = 'flex'; gate.style.opacity = '1'; }
}

['landing-goto-login', 'landing-cta-signup', 'landing-cta-bottom'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', showAuthGate);
});

// "湲곕뒫 ?섎윭蹂닿린" ??#features濡??ㅽ겕濡?
document.getElementById('landing-cta-demo')?.addEventListener('click', () => {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
});

// === 濡쒓렇??寃뚯씠???대깽??===

// ???꾪솚 (濡쒓렇?????뚯썝媛??
// ???꾪솚 (濡쒓렇?????뚯썝媛?? ??CSS ?대옒??湲곕컲?쇰줈 蹂寃?
// ?? ???몃씪??style? CSS ?뚯씪蹂대떎 ?곗꽑?쒖쐞媛 ?믪븘 auth.css瑜?臾댁떆??
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

// ?대찓??濡쒓렇??
document.getElementById('gate-email-login')?.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('이메일과 비밀번호를 입력해 주세요.', 'warning'); return; }
  await loginWithEmail(email, password);
});

// Enter ?ㅻ줈 濡쒓렇??
document.getElementById('login-password')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-login')?.click();
});

// ?대찓???뚯썝媛??
document.getElementById('gate-email-signup')?.addEventListener('click', async () => {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-password').value;
  const pw2 = document.getElementById('signup-password2').value;
  const agreed = document.getElementById('signup-agree')?.checked;
  if (!name) { showToast('이름을 입력해 주세요.', 'warning'); return; }
  if (!email) { showToast('이메일을 입력해 주세요.', 'warning'); return; }
  if (pw.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다.', 'warning'); return; }
  if (pw !== pw2) { showToast('비밀번호가 일치하지 않습니다.', 'warning'); return; }
  if (!agreed) { showToast('이용약관 및 개인정보처리방침에 동의해 주세요.', 'warning'); return; }
  await signupWithEmail(email, pw, name);
});

// Enter ?ㅻ줈 ?뚯썝媛??
document.getElementById('signup-password2')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-signup')?.click();
});

// ?댁슜?쎄? 紐⑤떖
document.getElementById('link-terms')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLegalModal('서비스 이용약관', getTermsContent());
});

// 媛쒖씤?뺣낫泥섎━諛⑹묠 紐⑤떖
document.getElementById('link-privacy')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLegalModal('개인정보처리방침', getPrivacyContent());
});

/**
 * 踰뺣쪧 臾몄꽌 紐⑤떖
 */
function showLegalModal(title, content) {
  // ??CSS ?대옒?? ???몃씪??style?먯꽌 CSS 蹂?섎? ?곕㈃ ?쇱씠??紐⑤뱶?먯꽌
  // --text-primary媛 #1a1a2e(?대몢?)濡??곸슜?섏뼱 湲?먭? ??蹂댁엫
  const modal = document.createElement('div');
  modal.className = 'legal-modal-overlay';
  modal.innerHTML = `
    <div class="legal-modal">
      <div class="legal-modal-header">
        <h3>📘 ${title}</h3>
        <button class="legal-modal-close" aria-label="닫기">닫기</button>
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
  return `
    <h4>1. 목적</h4>
    <p>이 약관은 INVEX가 제공하는 재고·입출고·문서 관리 서비스의 이용 조건과 회사 및 이용자의 권리, 의무, 책임 사항을 정하는 것을 목적으로 합니다.</p>

    <h4>2. 서비스 내용</h4>
    <p>서비스에는 재고 현황 관리, 입출고 기록, 거래처 연동, 보고서 작성, 문서 생성, 팀 협업 기능이 포함됩니다. 일부 기능은 요금제에 따라 제공 범위가 달라질 수 있습니다.</p>

    <h4>3. 계정과 이용자 책임</h4>
    <p>이용자는 정확한 정보를 바탕으로 계정을 생성해야 하며, 계정 정보와 접근 권한을 안전하게 관리할 책임이 있습니다. 계정의 부정 사용이 의심되는 경우 즉시 비밀번호를 변경하고 회사에 알려야 합니다.</p>

    <h4>4. 제한 사항</h4>
    <p>이용자는 서비스 운영을 방해하거나, 허위 데이터를 등록하거나, 관련 법령을 위반하는 방식으로 서비스를 사용해서는 안 됩니다. 회사는 필요한 경우 해당 계정의 이용을 제한할 수 있습니다.</p>

    <h4>5. 요금제와 변경</h4>
    <p>서비스는 무료 또는 유료 요금제로 제공될 수 있으며, 기능 구성과 가격은 사전 고지 후 변경될 수 있습니다. 유료 기능 사용 여부는 계정 설정 및 결제 상태에 따라 반영됩니다.</p>

    <h4>6. 면책</h4>
    <p>천재지변, 시스템 장애, 이용자의 입력 오류 또는 외부 서비스 장애로 인해 발생한 손해에 대해서는 관련 법령이 허용하는 범위에서 책임이 제한될 수 있습니다.</p>

    <p class="legal-date">시행일: 2026년 4월 1일</p>
  `;
}

function getPrivacyContent() {
  return `
    <h4>1. 수집하는 정보</h4>
    <p>서비스 이용을 위해 이름, 이메일 주소, 로그인 정보, 프로필 정보, 서비스 내 입력 데이터, 접속 기록 등의 정보가 처리될 수 있습니다.</p>

    <h4>2. 이용 목적</h4>
    <p>수집한 정보는 회원 식별, 로그인 처리, 재고 및 문서 기능 제공, 고객 문의 대응, 서비스 개선, 보안 및 오류 분석을 위해 사용됩니다.</p>

    <h4>3. 보관 기간</h4>
    <p>개인정보는 회원 탈퇴 또는 이용 목적 달성 시 지체 없이 삭제합니다. 다만 관계 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 안전하게 보관합니다.</p>

    <h4>4. 제3자 제공</h4>
    <p>회사는 이용자의 개인정보를 원칙적으로 외부에 판매하거나 무단 제공하지 않습니다. 다만 이용자 동의가 있거나 법령에 따른 요청이 있는 경우에 한해 최소 범위 내에서 제공할 수 있습니다.</p>

    <h4>5. 보호 조치</h4>
    <p>접근 권한 관리, 인증 정보 보호, 전송 구간 암호화, 운영 로그 관리 등 합리적인 수준의 보안 조치를 통해 개인정보를 보호합니다.</p>

    <h4>6. 이용자 권리</h4>
    <p>이용자는 본인의 개인정보에 대해 조회, 수정, 삭제 요청을 할 수 있으며, 서비스 내 계정 관리 기능 또는 고객 지원 채널을 통해 요청할 수 있습니다.</p>

    <h4>7. 문의</h4>
    <p>개인정보 관련 문의: sinbi0214@naver.com</p>

    <p class="legal-date">시행일: 2026년 4월 1일</p>
  `;
}

// 鍮꾨?踰덊샇 李얘린
document.getElementById('btn-forgot-pw')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('이메일 주소를 먼저 입력해 주세요.', 'warning'); return; }
  await resetPassword(email);
});

// Google ?뚯뀥 濡쒓렇??
document.getElementById('gate-google-login')?.addEventListener('click', async () => {
  const loadingEl = document.getElementById('gate-loading');
  if (loadingEl) loadingEl.style.display = 'block';
  const user = await loginWithGoogle();
  if (!user && loadingEl) loadingEl.style.display = 'none';
});

initAuth((user, profile) => {
  const gate = document.getElementById('auth-gate');
  
  if (user) {
    // ??濡쒓렇???깃났 ???쒕뵫 + 寃뚯씠???④린怨????쒖떆
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    if (gate) {
      gate.style.opacity = '0';
      setTimeout(() => { gate.style.display = 'none'; }, 300);
    }
    startSync(user.uid);
    // ?뚰겕?ㅽ럹?댁뒪 ?숆린?붾룄 ?쒖옉 (???媛??ㅼ떆媛?怨듭쑀)
    startWorkspaceSync(user.uid);
    // ?곗씠??蹂寃????먮룞?쇰줈 ?뚰겕?ㅽ럹?댁뒪???숆린??
    setSyncCallback(() => syncWorkspaceToCloud());
    updateUserUI(user, profile);
    // ?먮윭 紐⑤땲?곕쭅???ъ슜???뺣낫 ?ㅼ젙 (?대뼡 ?ъ슜?먯뿉寃??먮윭媛 諛쒖깮?덈뒗吏 異붿쟻)
    setMonitorUser(user.uid, user.email);
    
    // 珥앷?由ъ옄留?愿由ъ옄 硫붾돱 + POS 留ㅼ텧遺꾩꽍 ?쒖떆
    const adminBtn = document.querySelector('[data-page="admin"]');
    const posBtn = document.querySelector('[data-page="pos"]');
    if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';
    if (posBtn) posBtn.style.display = isAdmin() ? '' : 'none';
    
    // 理쒖큹 濡쒓렇???쒖뿉留???珥덇린??(以묐났 諛⑹?)
    if (!isAuthReady) {
      isAuthReady = true;
      initAppAfterAuth();
    }
  } else {
    // ??誘몃줈洹몄씤 ??寃뚯씠???쒖떆
    stopSync();
    stopWorkspaceSync();
    setSyncCallback(null);
    updateUserUI(null, null);
    clearMonitorUser();
    if (gate) {
      gate.style.display = 'none';
    }
    // 誘몃줈洹몄씤 ???쒕뵫 ?섏씠吏 ?쒖떆
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'block';
    isAuthReady = false;
  }
});

// ?꾩옱 ?섏씠吏 (?덉쓣 湲곕낯?쇰줈)
let currentPage = 'home';
let navigationToken = 0;
const RECENT_PAGES_KEY = 'invex_recent_pages_v1';
const LAST_PAGE_KEY = 'invex_last_page_v1';
const MAX_RECENT_PAGES = 6;

const pageLoaders = {
  home: () => import('./page-home.js').then(m => m.renderHomePage),
  upload: () => import('./page-upload.js').then(m => m.renderUploadPage),
  mapping: () => import('./page-mapping.js').then(m => m.renderMappingPage),
  inventory: () => import('./page-inventory.js').then(m => m.renderInventoryPage),
  inout: () => import('./page-inout.js').then(m => m.renderInoutPage),
  summary: () => import('./page-summary.js').then(m => m.renderSummaryPage),
  scanner: () => import('./page-scanner.js').then(m => m.renderScannerPage),
  documents: () => import('./page-documents.js').then(m => m.renderDocumentsPage),
  dashboard: () => import('./page-dashboard.js').then(m => m.renderDashboardPage),
  transfer: () => import('./page-transfer.js').then(m => m.renderTransferPage),
  ledger: () => import('./page-ledger.js').then(m => m.renderLedgerPage),
  settings: () => import('./page-settings.js').then(m => m.renderSettingsPage),
  vendors: () => import('./page-vendors.js').then(m => m.renderVendorsPage),
  stocktake: () => import('./page-stocktake.js').then(m => m.renderStocktakePage),
  bulk: () => import('./page-bulk.js').then(m => m.renderBulkPage),
  auditlog: async () => renderAuditLogPage,
  costing: () => import('./page-costing.js').then(m => m.renderCostingPage),
  labels: () => import('./page-labels.js').then(m => m.renderLabelsPage),
  accounts: () => import('./page-accounts.js').then(m => m.renderAccountsPage),
  warehouses: () => import('./page-warehouses.js').then(m => m.renderWarehousesPage),
  roles: () => import('./page-roles.js').then(m => m.renderRolesPage),
  api: () => import('./page-api.js').then(m => m.renderApiPage),
  billing: () => import('./page-billing.js').then(m => m.renderBillingPage),
  admin: () => import('./page-admin.js').then(m => m.renderAdminPage),
  mypage: () => import('./page-mypage.js').then(m => m.renderMyPage),
  guide: () => import('./page-guide.js').then(m => m.renderGuidePage),
  support: () => import('./page-support.js').then(m => m.renderSupportPage),
  team: () => import('./page-team.js').then(m => m.renderTeamPage),
  'tax-reports': () => import('./page-tax-reports.js').then(m => m.renderTaxReportsPage),
  'auto-order': () => import('./page-auto-order.js').then(m => m.renderAutoOrderPage),
  profit: () => import('./page-profit.js').then(m => m.renderProfitPage),
  backup: () => import('./page-backup.js').then(m => m.renderBackupPage),
  orders: () => import('./page-orders.js').then(m => m.renderOrdersPage),
  forecast: () => import('./page-forecast.js').then(m => m.renderForecastPage),
  referral: () => import('./page-referral.js').then(m => m.renderReferralPage),
  'weekly-report': () => import('./page-weekly-report.js').then(m => m.renderWeeklyReportPage),
  pos: () => import('./page-pos.js').then(m => m.renderPosPage),
};

const pageRendererCache = {};

function getPageLabel(pageId) {
  const btn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
  if (!btn) return pageId;
  return btn.textContent.replace(/\s+/g, ' ').trim();
}

function readRecentPages() {
  try {
    const raw = localStorage.getItem(RECENT_PAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(pageId => typeof pageId === 'string' && !!pageLoaders[pageId] && pageId !== 'home');
  } catch {
    return [];
  }
}

function writeRecentPages(pages) {
  localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(pages.slice(0, MAX_RECENT_PAGES)));
}

function updateRecentPages(pageId) {
  if (!pageId || pageId === 'home') return;
  const current = readRecentPages();
  const next = [pageId, ...current.filter(p => p !== pageId)].slice(0, MAX_RECENT_PAGES);
  writeRecentPages(next);
}

function renderQuickAccess() {
  const section = document.getElementById('quick-access-section');
  const divider = document.getElementById('quick-access-divider');
  const nav = document.getElementById('quick-access-nav');
  if (!section || !divider || !nav) return;

  const recentPages = readRecentPages();
  if (!recentPages.length) {
    section.style.display = 'none';
    divider.style.display = 'none';
    nav.innerHTML = '';
    return;
  }

  nav.innerHTML = recentPages.map(pageId => `
    <button class="nav-btn nav-btn-quick" data-quick-page="${pageId}" title="${getPageLabel(pageId)}">
      <span class="nav-icon">🕘</span> ${getPageLabel(pageId)}
    </button>
  `).join('');

  nav.querySelectorAll('[data-quick-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.quickPage));
  });

  section.style.display = '';
  divider.style.display = '';
}

function initNavigationShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      const visibleButtons = Array.from(document.querySelectorAll('.nav-btn[data-page]'))
        .filter(btn => btn.offsetParent !== null);
      const target = visibleButtons[Number(e.key) - 1];
      if (target?.dataset?.page) {
        e.preventDefault();
        navigateTo(target.dataset.page);
      }
    }
  });
}

/**
 * ?섏씠吏 ?꾪솚
 * ?붽툑??泥댄겕 ???묎렐 遺덇? ???낃렇?덉씠??紐⑤떖 ?쒖떆
 */
async function navigateTo(pageName) {
  if (!pageLoaders[pageName]) return;

  // ?붽툑???묎렐 ?쒖뼱
  if (!canAccessPage(pageName)) {
    showUpgradeModal(pageName);
    return;
  }

  currentPage = pageName;
  localStorage.setItem(LAST_PAGE_KEY, pageName);
  updateRecentPages(pageName);
  renderQuickAccess();
  const token = ++navigationToken;

  // 紐⑤뱺 nav ?곸뿭??踰꾪듉 ?쒖꽦 ?곹깭 ?낅뜲?댄듃
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageName);
  });

  const mainContent = document.getElementById('main-content');
  mainContent.dataset.page = pageName;
  mainContent.innerHTML = `
    <div class="card">
      <div class="empty-state" style="padding:32px 20px;">
        <div class="msg">페이지를 불러오는 중입니다.</div>
      </div>
    </div>
  `;
  mainContent.scrollTop = 0;

  try {
    const renderPage = await resolvePageRenderer(pageName);
    if (token !== navigationToken || currentPage !== pageName) return;
    mainContent.innerHTML = '';
    renderPage(mainContent, navigateTo);
    mountAutoTableSort(mainContent);
  } catch (error) {
    console.error('Failed to load page:', pageName, error);
    mainContent.innerHTML = `
      <div class="card">
        <div class="empty-state" style="padding:32px 20px;">
          <div class="msg">페이지를 불러오지 못했습니다.</div>
          <div class="sub">잠시 후 다시 시도해 주세요.</div>
        </div>
      </div>
    `;
    showToast('페이지를 불러오지 못했습니다.', 'warning');
    return;
  }

  // 紐⑤컮?쇱뿉???ъ씠?쒕컮 ?リ린
  closeSidebar();

  // ?뚮┝ 諭껋? ?낅뜲?댄듃
  updateNotifBadge();
}

async function resolvePageRenderer(pageName) {
  if (!pageRendererCache[pageName]) {
    pageRendererCache[pageName] = pageLoaders[pageName]();
  }
  return pageRendererCache[pageName];
}

/**
 * ?뚮┝ 諭껋? ?낅뜲?댄듃
 * ???섏씠吏 ?꾪솚 ?쒕쭏?? ???낆텧怨??깅줉 ???ш퀬 ?곹깭媛 諛붾????덉쑝誘濡?
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

// ?ъ씠?쒕컮 硫붾돱???붽툑??諛곗? ?곸슜 + ?대깽???곌껐
function updateSidebarBadges() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const pageId = btn.dataset.page;
    if (!pageId) return;

    // ?대깽???곌껐
    btn.addEventListener('click', () => navigateTo(pageId));

    // 湲곗〈 諛곗? ?쒓굅
    btn.querySelectorAll('.plan-badge').forEach(b => b.remove());

    const badge = getPageBadge(pageId);
    if (badge) {
      // ?좉툑 ?ㅽ????곸슜
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
renderQuickAccess();

// ?ъ씠?쒕컮 ?섎떒 ?붽툑???쒖떆 ?낅뜲?댄듃
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

// ?붽툑???대┃ ??蹂寃??앹뾽
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
        <h3>📦 요금제 선택</h3>
        <button class="btn btn-ghost btn-sm" id="plan-pick-close">닫기</button>
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
              ${current === p.id ? '<div style="margin-top:8px; font-size:11px; color:var(--success); font-weight:600;">???꾩옱 ?붽툑??/div>' : ''}
            </div>
          `).join('')}
        </div>
        <div style="margin-top:12px; font-size:11px; color:var(--text-muted); text-align:center;">
          * 臾대즺 泥댄뿕: 紐⑤뱺 湲곕뒫??利됱떆 ?쒖꽦?뷀빀?덈떎
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
      // ?ъ씠?쒕컮 諛곗? + ?쒖떆 媛깆떊
      updateSidebarBadges();
      updatePlanDisplay();
    });
  });
});

// ?뚮┝ 踰꾪듉 ?대깽??
document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
  e.stopPropagation();
  renderNotificationPanel();
});

// 湲濡쒕쾶 寃??珥덇린??& 踰꾪듉
initGlobalSearch(navigateTo);
document.getElementById('btn-global-search')?.addEventListener('click', () => {
  toggleGlobalSearch();
});

// ?ㅽ겕紐⑤뱶 ?좉? 踰꾪듉
document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  toggleTheme();
  const isDark = document.documentElement.classList.contains('dark-mode');
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = isDark ? '라이트 모드' : '다크 모드';
});

// === 紐⑤컮???좉? ===

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

// === ?곗씠??諛깆뾽 / 蹂듭썝 ===

/**
 * ??JSON 諛깆뾽? ??IndexedDB??釉뚮씪?곗?蹂꾨줈 寃⑸━?섏뼱 ?덉뼱??
 * ?ㅻⅨ 湲곌린濡??곗씠?곕? ?대룞?섍굅?? 留뚯빟????젣???鍮꾪븯湲??꾪빐
 */

// 諛깆뾽/蹂듭썝? ?꾩슜 ?섏씠吏(page-backup.js)濡??대룞??

// ??珥덇린??(濡쒓렇???꾨즺 ???몄텧)
// ??遺꾨━? ???몄쬆 ?뺤씤 ?꾩뿉 IndexedDB 蹂듭썝?섎㈃ 鍮??곗씠?곌? 濡쒕뱶?????덉쓬
async function initAppAfterAuth() {
  await restoreState();
  const lastPage = localStorage.getItem(LAST_PAGE_KEY);
  if (lastPage && pageLoaders[lastPage]) {
    currentPage = lastPage;
  }
  // ?붽툑??諛곗? & ?쒖떆 理쒖떊??
  updateSidebarBadges();
  renderQuickAccess();
  updatePlanDisplay();
  await navigateTo(currentPage);
  // 泥?濡쒓렇???ъ슜?먯뿉寃??⑤낫??留덈쾿???쒖떆
  checkAndShowOnboarding(navigateTo);
}

// Firebase 誘몄꽕??濡쒖뺄 媛쒕컻) ?쒖뿉??寃뚯씠???먮룞 ?댁젣
// isConfigured媛 false硫?initAuth?먯꽌 user=null濡?肄쒕갚 ??寃뚯씠?멸? ?⑥?留? 
// 濡쒖뺄 媛쒕컻???꾪빐 ?먮룞 ?댁젣
import { isConfigured } from './firebase-config.js';
if (!isConfigured) {
  const gate = document.getElementById('auth-gate');
  if (gate) gate.style.display = 'none';
  initAppAfterAuth();
}

initNavigationShortcuts();

// ?ъ슜??UI ?낅뜲?댄듃 (濡쒓렇??濡쒓렇?꾩썐 ???몄텧)
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
          <div style="font-size:10px; color:rgba(255,255,255,0.5);">${plan} ${syncStatus.isConnected ? '동기화' : ''}</div>
        </div>
        <button class="btn-icon" id="btn-logout" title="로그아웃" style="font-size:11px; color:rgba(255,255,255,0.5);">로그아웃</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', () => { logout(); });
  } else {
    userArea.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-login" style="color:rgba(255,255,255,0.7); font-size:12px; width:100%;">
        Google 로그인
      </button>
    `;
    document.getElementById('btn-login')?.addEventListener('click', () => { loginWithGoogle(); });
  }
}

// PWA Service Worker ?깅줉
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        registration.update?.();
        console.log('SW registered');
      })
      .catch((err) => console.log('SW failed:', err));
  });
}


