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
  if (!email || !password) { showToast('?대찓?쇨낵 鍮꾨?踰덊샇瑜??낅젰?섏꽭??', 'warning'); return; }
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
  if (!name) { showToast('?대쫫???낅젰?섏꽭??', 'warning'); return; }
  if (!email) { showToast('?대찓?쇱쓣 ?낅젰?섏꽭??', 'warning'); return; }
  if (pw.length < 6) { showToast('鍮꾨?踰덊샇??6???댁긽?댁뼱???⑸땲??', 'warning'); return; }
  if (pw !== pw2) { showToast('鍮꾨?踰덊샇媛 ?쇱튂?섏? ?딆뒿?덈떎.', 'warning'); return; }
  if (!agreed) { showToast('?댁슜?쎄? 諛?媛쒖씤?뺣낫泥섎━諛⑹묠???숈쓽?댁＜?몄슂.', 'warning'); return; }
  await signupWithEmail(email, pw, name);
});

// Enter ?ㅻ줈 ?뚯썝媛??
document.getElementById('signup-password2')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-signup')?.click();
});

// ?댁슜?쎄? 紐⑤떖
document.getElementById('link-terms')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLegalModal('?쒕퉬???댁슜?쎄?', getTermsContent());
});

// 媛쒖씤?뺣낫泥섎━諛⑹묠 紐⑤떖
document.getElementById('link-privacy')?.addEventListener('click', (e) => {
  e.preventDefault();
  showLegalModal('媛쒖씤?뺣낫泥섎━諛⑹묠', getPrivacyContent());
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
        <h3>?뱥 ${title}</h3>
        <button class="legal-modal-close">??/button>
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
  // ???몃씪??style???쒓굅? ??CSS 蹂?섍? ?쇱씠??紐⑤뱶?먯꽌 ?대몢???됱쓣 諛섑솚?섏뿬
  // ?대몢??紐⑤떖 諛곌꼍 ?꾩뿉 湲?먭? ??蹂댁씠??臾몄젣 諛쒖깮. auth.css??.legal-modal-body h4 洹쒖튃???곸슜??
  return `
    <h4>??議?(紐⑹쟻)</h4>
    <p>???쎄?? INVEX(?댄븯 "?쒕퉬??)媛 ?쒓났?섎뒗 ?ш퀬쨌寃쎌쁺 愿由??쒕퉬?ㅼ쓽 ?댁슜議곌굔 諛??덉감, ?뚯궗? ?댁슜?먯쓽 沅뚮━쨌?섎Т 諛?梨낆엫?ы빆??洹쒖젙?⑥쓣 紐⑹쟻?쇰줈 ?⑸땲??</p>
    
    <h4>??議?(?뺤쓽)</h4>
    <p>??"?쒕퉬??? INVEX媛 ?쒓났?섎뒗 ??湲곕컲 ?ш퀬愿由? ?낆텧怨?泥섎━, ?먭?遺꾩꽍, 臾몄꽌?앹꽦 ?깆쓽 湲곕뒫??留먰빀?덈떎.<br/>
    ??"?댁슜??? 蹂??쎄????곕씪 ?쒕퉬?ㅻ? ?댁슜?섎뒗 ?먮? 留먰빀?덈떎.<br/>
    ??"怨꾩젙"?대? ?댁슜?먯쓽 ?앸퀎怨??쒕퉬???댁슜???꾪빐 ?댁슜?먭? ?ㅼ젙?섍퀬 ?뚯궗媛 ?뱀씤?섎뒗 ?대찓??諛?鍮꾨?踰덊샇??議고빀??留먰빀?덈떎.</p>

    <h4>??議?(?쎄????⑤젰 諛?蹂寃?</h4>
    <p>??蹂??쎄?? ?쒕퉬???붾㈃??寃뚯떆?섍굅???대찓???깆쓽 諛⑸쾿?쇰줈 ?댁슜?먯뿉寃?怨듭??⑥쑝濡쒖뜥 ?⑤젰??諛쒖깮?⑸땲??<br/>
    ???뚯궗??愿??踰뺣졊???꾨같?섏? ?딅뒗 踰붿쐞?먯꽌 蹂??쎄???媛쒖젙?????덉뒿?덈떎.</p>

    <h4>??議?(?쒕퉬?ㅼ쓽 ?쒓났)</h4>
    <p>???뚯궗???ㅼ쓬怨?媛숈? ?쒕퉬?ㅻ? ?쒓났?⑸땲??<br/>
    - ?ш퀬 ?꾪솴 愿由?諛?紐⑤땲?곕쭅<br/>
    - ?낆텧怨?泥섎━ 諛??대젰 愿由?br/>
    - ?먭? 遺꾩꽍 諛?蹂닿퀬???앹꽦<br/>
    - 諛붿퐫???ㅼ틪 諛??쇰꺼 ?몄뇙<br/>
    - 嫄곕옒泥?愿由?br/>
    ???쒕퉬?ㅻ뒗 Free, Pro, Enterprise ?붽툑?쒕줈 援щ텇?섎ŉ, 媛??붽툑?쒕퀎 ?쒓났 湲곕뒫???ㅻ쫭?덈떎.</p>

    <h4>??議?(?댁슜?먯쓽 ?섎Т)</h4>
    <p>???댁슜?먮뒗 ??몄쓽 ?뺣낫瑜??꾩슜?섏뿬?쒕뒗 ???⑸땲??<br/>
    ???댁슜?먮뒗 ?쒕퉬?ㅻ? ?댁슜?섏뿬 遺덈쾿?됱쐞瑜??섏뿬?쒕뒗 ???⑸땲??<br/>
    ???댁슜?먮뒗 ?먯떊??怨꾩젙 ?뺣낫瑜??덉쟾?섍쾶 愿由ы븷 梨낆엫???덉뒿?덈떎.</p>

    <h4>??議?(?쒕퉬???댁슜 ?쒗븳)</h4>
    <p>?뚯궗???댁슜?먭? 蹂??쎄????꾨컲?섍굅???쒕퉬?ㅼ쓽 ?뺤긽?곸씤 ?댁쁺??諛⑺빐??寃쎌슦, ?쒕퉬???댁슜???쒗븳?섍굅??怨꾩젙????젣?????덉뒿?덈떎.</p>

    <h4>??議?(硫댁콉議고빆)</h4>
    <p>??泥쒖옱吏蹂, ?꾩웳 ??遺덇???젰?쇰줈 ?명븳 ?쒕퉬??以묐떒??????뚯궗??梨낆엫??吏吏 ?딆뒿?덈떎.<br/>
    ???댁슜?먯쓽 洹梨낆궗?좊줈 ?명븳 ?쒕퉬???댁슜 ?μ븷??????뚯궗??梨낆엫??吏吏 ?딆뒿?덈떎.</p>

    <p class="legal-date">?쒗뻾?? 2026??4??1??/p>
  `;
}

function getPrivacyContent() {
  return `
    <h4>1. 媛쒖씤?뺣낫???섏쭛 諛??댁슜 紐⑹쟻</h4>
    <p>INVEX(?댄븯 "?쒕퉬??)???ㅼ쓬??紐⑹쟻???꾪븯??媛쒖씤?뺣낫瑜?泥섎━?⑸땲??</p>
    <p>???뚯썝 媛??諛?愿由? ?뚯썝 媛???섏궗 ?뺤씤, ?쒕퉬???쒓났???곕Ⅸ 蹂몄씤 ?앸퀎쨌?몄쬆, ?뚯썝?먭꺽 ?좎?쨌愿由?br/>
    ???쒕퉬???쒓났: ?ш퀬愿由? ?낆텧怨?泥섎━, 蹂닿퀬???앹꽦 ???듭떖 ?쒕퉬???쒓났<br/>
    ??怨좉컼 吏?? 誘쇱썝 泥섎━, 怨듭??ы빆 ?꾨떖</p>

    <h4>2. ?섏쭛?섎뒗 媛쒖씤?뺣낫 ??ぉ</h4>
    <table>
      <tr>
        <td>?꾩닔??ぉ</td>
        <td>?대쫫(?됰꽕??, ?대찓??二쇱냼, 鍮꾨?踰덊샇</td>
      </tr>
      <tr>
        <td>?먮룞?섏쭛</td>
        <td>?묒냽 IP, ?묒냽 ?쒓컙, 釉뚮씪?곗? ?뺣낫</td>
      </tr>
      <tr>
        <td>?뚯뀥 濡쒓렇??/td>
        <td>Google 怨꾩젙 ?대쫫, ?대찓?? ?꾨줈???ъ쭊</td>
      </tr>
    </table>

    <h4>3. 媛쒖씤?뺣낫??蹂댁쑀 諛??댁슜 湲곌컙</h4>
    <p>???뚯썝 ?덊눜 ?쒓퉴吏 蹂댁쑀?섎ŉ, ?덊눜 ??吏泥??놁씠 ?뚭린?⑸땲??<br/>
    ???? 愿??踰뺣졊???곕씪 蹂댁〈???꾩슂??寃쎌슦 ?대떦 湲곌컙 ?숈븞 蹂댁〈?⑸땲??</p>

    <h4>4. 媛쒖씤?뺣낫???????쒓났</h4>
    <p>?쒕퉬?ㅻ뒗 ?댁슜?먯쓽 媛쒖씤?뺣낫瑜??먯튃?곸쑝濡????먯뿉寃??쒓났?섏? ?딆뒿?덈떎. ?ㅻ쭔, ?ㅼ쓬??寃쎌슦?먮뒗 ?덉쇅濡??⑸땲??<br/>
    ???댁슜?먭? ?ъ쟾???숈쓽??寃쎌슦<br/>
    ??踰뺣졊??洹쒖젙???섍굅?섍굅???섏궗 紐⑹쟻?쇰줈 踰뺣졊???뺥빐吏??덉감???곕씪 ?붿껌???덈뒗 寃쎌슦</p>

    <h4>5. 媛쒖씤?뺣낫???덉쟾???뺣낫 議곗튂</h4>
    <p>?쒕퉬?ㅻ뒗 媛쒖씤?뺣낫???덉쟾???뺣낫瑜??꾪빐 ?ㅼ쓬怨?媛숈? 議곗튂瑜?痍⑦븯怨??덉뒿?덈떎.<br/>
    ??鍮꾨?踰덊샇 ?뷀샇?????(Firebase Authentication)<br/>
    ???곗씠???꾩넚 ??SSL/TLS ?뷀샇??br/>
    ???묎렐 沅뚰븳 愿由?諛??묎렐 ?듭젣</p>

    <h4>6. ?댁슜?먯쓽 沅뚮━</h4>
    <p>?댁슜?먮뒗 ?몄젣?좎? ?먯떊??媛쒖씤?뺣낫瑜?議고쉶, ?섏젙, ??젣?????덉쑝硫? ?뚯썝 ?덊눜瑜??듯빐 媛쒖씤?뺣낫 泥섎━???뺤?瑜??붿껌?????덉뒿?덈떎.</p>

    <h4>7. 媛쒖씤?뺣낫 蹂댄샇梨낆엫??/h4>
    <p>?대찓?? sinbi0214@naver.com</p>

    <p class="legal-date">?쒗뻾?? 2026??4??1??/p>
  `;
}

// 鍮꾨?踰덊샇 李얘린
document.getElementById('btn-forgot-pw')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('?대찓??二쇱냼瑜?癒쇱? ?낅젰?댁＜?몄슂.', 'warning'); return; }
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
        <h3>?뱥 ?붽툑???좏깮</h3>
        <button class="btn btn-ghost btn-sm" id="plan-pick-close">??/button>
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
      showToast(`${PLANS[planId].icon} ${PLANS[planId].name} ?붽툑?쒕줈 蹂寃쎈릺?덉뒿?덈떎.`, 'success');
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
  // ?붽툑??諛곗? & ?쒖떆 理쒖떊??
  updateSidebarBadges();
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
      .then(() => console.log('SW registered'))
      .catch((err) => console.log('SW failed:', err));
  });
}



