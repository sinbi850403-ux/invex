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
import { HUB_MAP, PAGE_LABELS } from './page-hubs.js';
import {
  renderHubInventory, renderHubWarehouse, renderHubOrder,
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
  home:            () => import('./page-home.js').then(m => m.renderHomePage),
  upload:          () => import('./page-upload.js').then(m => m.renderUploadPage),
  mapping:         () => import('./page-mapping.js').then(m => m.renderMappingPage),
  inventory:       () => import('./page-inventory.js').then(m => m.renderInventoryPage),
  in:              () => import('./page-inout.js').then(m => m.renderInPage),
  out:             () => import('./page-inout.js').then(m => m.renderOutPage),
  summary:         () => import('./page-summary.js').then(m => m.renderSummaryPage),
  scanner:         () => import('./page-scanner.js').then(m => m.renderScannerPage),
  documents:       () => import('./page-documents.js').then(m => m.renderDocumentsPage),
  dashboard:       () => import('./page-dashboard.js').then(m => m.renderDashboardPage),
  transfer:        () => import('./page-transfer.js').then(m => m.renderTransferPage),
  ledger:          () => import('./page-ledger.js').then(m => m.renderLedgerPage),
  settings:        () => import('./page-settings.js').then(m => m.renderSettingsPage),
  vendors:         () => import('./page-vendors.js').then(m => m.renderVendorsPage),
  stocktake:       () => import('./page-stocktake.js').then(m => m.renderStocktakePage),
  bulk:            () => import('./page-bulk.js').then(m => m.renderBulkPage),
  costing:         () => import('./page-costing.js').then(m => m.renderCostingPage),
  labels:          () => import('./page-labels.js').then(m => m.renderLabelsPage),
  accounts:        () => import('./page-accounts.js').then(m => m.renderAccountsPage),
  warehouses:      () => import('./page-warehouses.js').then(m => m.renderWarehousesPage),
  roles:           () => import('./page-roles.js').then(m => m.renderRolesPage),
  api:             () => import('./page-api.js').then(m => m.renderApiPage),
  billing:         () => import('./page-billing.js').then(m => m.renderBillingPage),
  admin:           () => import('./page-admin.js').then(m => m.renderAdminPage),
  mypage:          () => import('./page-mypage.js').then(m => m.renderMyPage),
  guide:           () => import('./page-guide.js').then(m => m.renderGuidePage),
  support:         () => import('./page-support.js').then(m => m.renderSupportPage),
  team:            () => import('./page-team.js').then(m => m.renderTeamPage),
  'tax-reports':   () => import('./page-tax-reports.js').then(m => m.renderTaxReportsPage),

  profit:          () => import('./page-profit.js').then(m => m.renderProfitPage),
  backup:          () => import('./page-backup.js').then(m => m.renderBackupPage),
  orders:          () => import('./page-orders.js').then(m => m.renderOrdersPage),
  forecast:        () => import('./page-forecast.js').then(m => m.renderForecastPage),
  referral:        () => import('./page-referral.js').then(m => m.renderReferralPage),
  'weekly-report': () => import('./page-weekly-report.js').then(m => m.renderWeeklyReportPage),
  pos:             () => import('./page-pos.js').then(m => m.renderPosPage),
  // HR 모듈 (Phase A)
  'hr-dashboard':  () => import('./page-hr-dashboard.js').then(m => m.renderHrDashboardPage),
  employees:       () => import('./page-employees.js').then(m => m.renderEmployeesPage),
  attendance:      () => import('./page-attendance.js').then(m => m.renderAttendancePage),
  payroll:         () => import('./page-payroll.js').then(m => m.renderPayrollPage),
  leaves:          () => import('./page-leaves.js').then(m => m.renderLeavesPage),
  severance:       () => import('./page-severance.js').then(m => m.renderSeverancePage),
  'yearend-settlement': () => import('./page-yearend-settlement.js').then(m => m.renderYearendSettlementPage),
  // 동기 렌더러 (이미 import된 모듈)
  auditlog:        async () => renderAuditLogPage,
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
      <span class="nav-icon"></span> ${getPageLabel(id)}
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
    el.innerHTML = `<span class="breadcrumb-current">대시보드</span>`;
  } else if (parentHub) {
    el.innerHTML = `
      <span class="breadcrumb-item" data-bc-nav="home">대시보드</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-item" data-bc-nav="${parentHub}">${PAGE_LABELS[parentHub] || parentHub}</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">${label}</span>
    `;
  } else {
    el.innerHTML = `
      <span class="breadcrumb-item" data-bc-nav="home">대시보드</span>
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
  // ★ 실패한 Promise는 캐시에 저장하지 않음 — 재시도 가능하도록
  if (!_cache[pageName]) {
    const promise = PAGE_LOADERS[pageName]();
    _cache[pageName] = promise;
    promise.catch(() => { delete _cache[pageName]; });
  }
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

    // ── snav 아코디언 active 상태 갱신 ──────────────────────
    // 모든 .snav-item, .snav-direct에서 active 제거 후 현재 페이지만 활성화
    document.querySelectorAll('.snav-item, .snav-direct').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });

    // 기존 nav-btn[data-page]도 지원 (admin/pos 등)
    document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
      if (!btn.classList.contains('snav-item') && !btn.classList.contains('snav-direct')) {
        btn.classList.toggle('active', btn.dataset.page === pageName);
      }
    });

    updateBreadcrumb(pageName);

    const main = document.getElementById('main-content');
    if (!main) {
      console.error('[Router] #main-content 요소를 찾을 수 없습니다.');
      showToast('페이지 레이아웃 오류가 발생했습니다.', 'warning');
      return;
    }
    main.dataset.page = pageName;
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

    // ★ 스테일 캐시 자동 복구
    // 배포 후 브라우저가 오래된 main.js(캐시)를 사용하면 새 배포의 청크 해시와 불일치.
    // "Failed to fetch dynamically imported module" 또는 "text/html MIME type" 오류가 발생.
    // → 이 경우 페이지를 강제 리로드해서 새 index.html + 새 main.js를 받아오게 함.
    const msg = err?.message || '';
    const isStaleChunk = msg.includes('Failed to fetch') || msg.includes('dynamically imported')
      || msg.includes('MIME type') || msg.includes('Importing a module script failed');
    if (isStaleChunk) {
      console.warn('[Router] 스테일 청크 감지 — 페이지를 자동으로 리로드합니다.');
      // 무한 리로드 방지: 최근 10초 안에 이미 리로드했으면 중단
      const RELOAD_KEY = 'invex_stale_reload_ts';
      const lastReload = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
      if (Date.now() - lastReload > 10_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return;
      }
      console.error('[Router] 연속 리로드 차단 — 서버 또는 네트워크 오류일 수 있습니다.');
    }

    const main = document.getElementById('main-content');
    if (main) {
      main.innerHTML = `
        <div class="card">
          <div class="empty-state" style="padding:32px 20px;">
            <div class="msg">페이지를 불러오지 못했습니다.</div>
            <div class="sub">${err?.message || '잠시 후 다시 시도해 주세요.'}</div>
            ${isStaleChunk ? `<button class="btn btn-primary" style="margin-top:12px;" onclick="location.reload()">새로고침</button>` : ''}
          </div>
        </div>
      `;
    }
    showToast('페이지를 불러오지 못했습니다: ' + (err?.message || pageName), 'warning');
  }
}
