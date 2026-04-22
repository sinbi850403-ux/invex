/**
 * router.js — INVEX SPA 라우터
 *
 * 왜 분리했나?
 * → main.js가 1,100줄을 넘었고, 그 중 300줄이 순수 라우팅 로직
 * → 라우팅만 여기로 옮겨 main.js는 "앱 초기화"만 담당하도록 역할 분리
 *
 * 내보내는 것:
 *   - PAGE_LOADERS      : 페이지 ID → 동적 import 매핑
 *   - navigateTo(id)    : 페이지 이동 (권한 체크 + 스켈레톤 + 캐싱 포함)
 *   - currentPage       : 현재 페이지 ID (읽기 전용)
 *   - readRecentPages() : 최근 방문 페이지 목록
 *   - renderQuickAccess(): 사이드바 빠른 이동 섹션 렌더
 *   - updateBreadcrumb(): 브레드크럼 업데이트
 *   - LAST_PAGE_KEY     : 마지막 페이지 localStorage 키
 */

import { canAccessPage, showUpgradeModal } from './plan.js';
import { mountAutoTableSort } from './table-auto-sort.js';
import { showToast } from './toast.js';
import { syncExternalNotifications } from './notifications.js';
import { unmountCurrentReactPage, reactLoader, vanillaLoader } from './lib/mountReactPage.jsx';

// 헬퍼 re-export — 외부에서 PAGE_LOADERS 확장 시 사용 가능
export { reactLoader, vanillaLoader };
import { HUB_MAP, PAGE_LABELS } from './page-hubs.js';
import {
  renderHubData, renderHubInventory, renderHubWarehouse, renderHubOrder,
  renderHubReport, renderHubDocuments, renderHubSettings, renderHubSupport,
  renderHubHr,
} from './page-hubs.js';
import { renderAuditLogPage } from './audit-log.js';

// ── 상수 ────────────────────────────────────────────────────────────────
export const LAST_PAGE_KEY   = 'invex_last_page_v1';
const RECENT_PAGES_KEY       = 'invex_recent_pages_v1';
const MAX_RECENT             = 6;

// ── 상태 ────────────────────────────────────────────────────────────────
export let currentPage = 'home';
let _token = 0;                   // 연속 navigateTo 호출 시 이전 결과 무시용
const _cache = {};                // 페이지 렌더러 캐시 (모듈 재로딩 방지)

// ── 콜백 주입 (main.js → router.js 순환 참조 방지) ──────────────────────
// → main.js가 initCardCollapsibles, closeSidebar, updateNotifBadge를 주입함
let _initCardCollapsibles = () => {};
let _closeSidebar         = () => {};
let _updateNotifBadge     = () => {};

export function injectRouterCallbacks({ initCardCollapsibles, closeSidebar, updateNotifBadge }) {
  _initCardCollapsibles = initCardCollapsibles || _initCardCollapsibles;
  _closeSidebar         = closeSidebar         || _closeSidebar;
  _updateNotifBadge     = updateNotifBadge     || _updateNotifBadge;
}

// ── 페이지 로더 맵 ────────────────────────────────────────────────────────
// lazy import: 방문한 페이지만 번들에서 로드됨 → 초기 로딩 최소화
export const PAGE_LOADERS = {
  // ── React 전환 완료 페이지 ──────────────────────────────────────────────
  home:            reactLoader(() => import('./react/pages/HomePage')),
  inventory:       reactLoader(() => import('./react/pages/InventoryPage')),
  inout:           reactLoader(() => import('./react/pages/InoutPage')),
  // ── VanillaBridge 래핑 (Vanilla 유지 + React 컨텍스트 주입) ─────────────
  // vanillaLoader: Vanilla renderXxxPage를 VanillaBridge로 감싸 App(Auth+Store) 제공
  // 나중에 reactLoader로 교체하면 완전한 React 전환 완료
  upload:          vanillaLoader(() => import('./page-upload.js'),          'renderUploadPage'),
  mapping:         vanillaLoader(() => import('./page-mapping.js'),         'renderMappingPage'),
  summary:         vanillaLoader(() => import('./page-summary.js'),         'renderSummaryPage'),
  scanner:         vanillaLoader(() => import('./page-scanner.js'),         'renderScannerPage'),
  documents:       vanillaLoader(() => import('./page-documents.js'),       'renderDocumentsPage'),
  dashboard:       vanillaLoader(() => import('./page-dashboard.js'),       'renderDashboardPage'),
  transfer:        vanillaLoader(() => import('./page-transfer.js'),        'renderTransferPage'),
  ledger:          vanillaLoader(() => import('./page-ledger.js'),          'renderLedgerPage'),
  settings:        vanillaLoader(() => import('./page-settings.js'),        'renderSettingsPage'),
  vendors:         vanillaLoader(() => import('./page-vendors.js'),         'renderVendorsPage'),
  stocktake:       vanillaLoader(() => import('./page-stocktake.js'),       'renderStocktakePage'),
  bulk:            vanillaLoader(() => import('./page-bulk.js'),            'renderBulkPage'),
  costing:         vanillaLoader(() => import('./page-costing.js'),         'renderCostingPage'),
  labels:          vanillaLoader(() => import('./page-labels.js'),          'renderLabelsPage'),
  accounts:        vanillaLoader(() => import('./page-accounts.js'),        'renderAccountsPage'),
  warehouses:      vanillaLoader(() => import('./page-warehouses.js'),      'renderWarehousesPage'),
  roles:           vanillaLoader(() => import('./page-roles.js'),           'renderRolesPage'),
  api:             vanillaLoader(() => import('./page-api.js'),             'renderApiPage'),
  billing:         vanillaLoader(() => import('./page-billing.js'),         'renderBillingPage'),
  admin:           vanillaLoader(() => import('./page-admin.js'),           'renderAdminPage'),
  mypage:          vanillaLoader(() => import('./page-mypage.js'),          'renderMyPage'),
  guide:           vanillaLoader(() => import('./page-guide.js'),           'renderGuidePage'),
  support:         vanillaLoader(() => import('./page-support.js'),         'renderSupportPage'),
  team:            vanillaLoader(() => import('./page-team.js'),            'renderTeamPage'),
  'tax-reports':   vanillaLoader(() => import('./page-tax-reports.js'),     'renderTaxReportsPage'),
  'auto-order':    vanillaLoader(() => import('./page-auto-order.js'),      'renderAutoOrderPage'),
  profit:          vanillaLoader(() => import('./page-profit.js'),          'renderProfitPage'),
  backup:          vanillaLoader(() => import('./page-backup.js'),          'renderBackupPage'),
  orders:          vanillaLoader(() => import('./page-orders.js'),          'renderOrdersPage'),
  forecast:        vanillaLoader(() => import('./page-forecast.js'),        'renderForecastPage'),
  referral:        vanillaLoader(() => import('./page-referral.js'),        'renderReferralPage'),
  'weekly-report': vanillaLoader(() => import('./page-weekly-report.js'),   'renderWeeklyReportPage'),
  pos:             vanillaLoader(() => import('./page-pos.js'),             'renderPosPage'),
  // HR 모듈
  'hr-dashboard':  vanillaLoader(() => import('./page-hr-dashboard.js'),    'renderHrDashboardPage'),
  employees:       vanillaLoader(() => import('./page-employees.js'),       'renderEmployeesPage'),
  attendance:      vanillaLoader(() => import('./page-attendance.js'),      'renderAttendancePage'),
  payroll:         vanillaLoader(() => import('./page-payroll.js'),         'renderPayrollPage'),
  leaves:          vanillaLoader(() => import('./page-leaves.js'),          'renderLeavesPage'),
  severance:       vanillaLoader(() => import('./page-severance.js'),       'renderSeverancePage'),
  'yearend-settlement': vanillaLoader(() => import('./page-yearend-settlement.js'), 'renderYearendSettlementPage'),
  // ── 허브·감사로그 (동기 렌더러 — vanillaLoader 불필요) ────────────────────
  auditlog:        async () => renderAuditLogPage,
  'hub-data':      async () => renderHubData,
  'hub-inventory': async () => renderHubInventory,
  'hub-warehouse': async () => renderHubWarehouse,
  'hub-order':     async () => renderHubOrder,
  'hub-report':    async () => renderHubReport,
  'hub-documents': async () => renderHubDocuments,
  'hub-settings':  async () => renderHubSettings,
  'hub-support':   async () => renderHubSupport,
  'hub-hr':        async () => renderHubHr,
};

// ── 최근 방문 페이지 ────────────────────────────────────────────────────
export function readRecentPages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PAGES_KEY) || '[]');
    // 유효한 페이지 ID만, home 제외
    return parsed.filter(id => typeof id === 'string' && PAGE_LOADERS[id] && id !== 'home');
  } catch { return []; }
}

function addRecentPage(pageId) {
  if (!pageId || pageId === 'home') return;
  const next = [pageId, ...readRecentPages().filter(p => p !== pageId)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
}

// ── 사이드바 빠른 이동 렌더 ──────────────────────────────────────────────
export function renderQuickAccess() {
  const section = document.getElementById('quick-access-section');
  const divider = document.getElementById('quick-access-divider');
  const nav     = document.getElementById('quick-access-nav');
  if (!section || !divider || !nav) return;

  const pages = readRecentPages();
  const visible = pages.length > 0;
  section.style.display = visible ? '' : 'none';
  divider.style.display = visible ? '' : 'none';

  nav.innerHTML = pages.map(id => `
    <button class="nav-btn nav-btn-quick" data-quick-page="${id}" title="${getPageLabel(id)}">
      <span class="nav-icon">🕘</span> ${getPageLabel(id)}
    </button>
  `).join('');

  nav.querySelectorAll('[data-quick-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.quickPage));
  });
}

// ── 브레드크럼 업데이트 ─────────────────────────────────────────────────
export function updateBreadcrumb(pageName) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;

  const label     = PAGE_LABELS[pageName] || pageName;
  const parentHub = HUB_MAP[pageName];

  if (pageName === 'home') {
    el.innerHTML = `<span class="breadcrumb-current">🏠 대시보드</span>`;
  } else if (parentHub) {
    el.innerHTML = `
      <span class="breadcrumb-item" data-bc-nav="home">🏠</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-item" data-bc-nav="${parentHub}">${PAGE_LABELS[parentHub] || parentHub}</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${label}</span>
    `;
  } else {
    el.innerHTML = `
      <span class="breadcrumb-item" data-bc-nav="home">🏠</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${label}</span>
    `;
  }

  el.querySelectorAll('[data-bc-nav]').forEach(node => {
    node.addEventListener('click', () => navigateTo(node.dataset.bcNav));
  });
}

// ── 내부 헬퍼 ───────────────────────────────────────────────────────────
function getPageLabel(pageId) {
  if (PAGE_LABELS[pageId]) return PAGE_LABELS[pageId];
  const btn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
  if (!btn) return pageId;
  return (btn.querySelector('.nav-main') || btn).textContent.replace(/\s+/g, ' ').trim();
}

async function resolveRenderer(pageName) {
  // 한 번 로드한 렌더러는 캐싱해서 재로딩 방지
  if (!_cache[pageName]) _cache[pageName] = PAGE_LOADERS[pageName]();
  return _cache[pageName];
}

function getSkeletonHtml() {
  return `
    <div class="skeleton-page">
      <div class="skeleton-header">
        <div class="skeleton-line skeleton-lg skeleton-w60"></div>
        <div class="skeleton-line skeleton-sm skeleton-w40"></div>
      </div>
      <div class="skeleton-stats">
        <div class="skeleton-stat"></div><div class="skeleton-stat"></div>
        <div class="skeleton-stat"></div><div class="skeleton-stat"></div>
      </div>
      <div class="skeleton-card">
        <div class="skeleton-line skeleton-w40"></div>
        <div class="skeleton-line skeleton-w90"></div>
        <div class="skeleton-line skeleton-w70"></div>
      </div>
    </div>
  `;
}

// ── 핵심 함수: 페이지 이동 ───────────────────────────────────────────────
/**
 * SPA 페이지 이동
 * - 권한 체크 → 스켈레톤 → 렌더러 로드(캐싱) → 렌더 → 후처리
 * - token: 연속 호출 시 이전 비동기 결과를 자동으로 무시
 */
export async function navigateTo(pageName) {
  try {
    if (!PAGE_LOADERS[pageName]) {
      console.warn('[Router] 알 수 없는 페이지:', pageName);
      return;
    }

    // 요금제 권한 체크 — 미달 시 업그레이드 모달 표시 후 중단
    if (!canAccessPage(pageName)) {
      showUpgradeModal(pageName);
      return;
    }

    currentPage = pageName;
    localStorage.setItem(LAST_PAGE_KEY, pageName);
    addRecentPage(pageName);
    renderQuickAccess();

    const token = ++_token;

    // 사이드바 활성 하이라이트 (자식 페이지는 부모 허브를 활성화)
    const activeId = HUB_MAP[pageName] || pageName;
    document.querySelectorAll('[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === activeId);
    });

    updateBreadcrumb(pageName);

    const main = document.getElementById('main-content');
    if (!main) {
      console.error('[Router] #main-content 요소를 찾을 수 없습니다.');
      showToast('페이지 레이아웃 오류가 발생했습니다.', 'warning');
      return;
    }
    main.dataset.page = pageName;
    unmountCurrentReactPage(); // React 페이지 이탈 시 정상 언마운트 (메모리 누수 방지)
    main.innerHTML    = getSkeletonHtml();
    main.scrollTop    = 0;

    const renderPage = await resolveRenderer(pageName);
    // 다른 navigateTo가 먼저 완료됐으면 이 결과는 버림
    if (token !== _token || currentPage !== pageName) return;

    if (typeof renderPage !== 'function') {
      throw new Error(`렌더러가 함수가 아닙니다: ${pageName}`);
    }

    main.dispatchEvent(new CustomEvent('invex:page-unload', { bubbles: false }));
    main.innerHTML = '';
    renderPage(main, navigateTo);

    // 페이지 전환 페이드인 애니메이션
    main.classList.remove('page-enter');
    void main.offsetWidth;
    main.classList.add('page-enter');

    // 카드 접기 초기화 (main.js에서 주입된 함수)
    _initCardCollapsibles(main, pageName);
    mountAutoTableSort(main);

    _closeSidebar();
    _updateNotifBadge();
    syncExternalNotifications();
  } catch (err) {
    console.error('[Router] 페이지 로드 실패:', pageName, err);
    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = `
        <div class="card">
          <div class="empty-state" style="padding:32px 20px;">
            <div class="msg">페이지를 불러오지 못했습니다.</div>
            <div class="sub">${err?.message || '잠시 후 다시 시도해 주세요.'}</div>
          </div>
        </div>
      `;
    }
    showToast('페이지를 불러오지 못했습니다: ' + (err?.message || pageName), 'warning');
  }
}
