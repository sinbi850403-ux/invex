import { canAccessPage, showUpgradeModal } from './plan.js';
import { mountAutoTableSort } from './table-auto-sort.js';
import { showToast } from './toast.js';
import { syncExternalNotifications } from './notifications.js';
import { unmountCurrentReactPage, reactLoader, vanillaLoader } from './lib/mountReactPage.jsx';
import { HUB_MAP, PAGE_LABELS } from './page-hubs.js';
import {
  renderHubData,
  renderHubInventory,
  renderHubWarehouse,
  renderHubOrder,
  renderHubReport,
  renderHubDocuments,
  renderHubSettings,
  renderHubSupport,
  renderHubHr,
} from './page-hubs.js';
import { renderAuditLogPage } from './audit-log.js';

export { reactLoader, vanillaLoader };

export const LAST_PAGE_KEY = 'invex_last_page_v1';
const RECENT_PAGES_KEY = 'invex_recent_pages_v1';
const MAX_RECENT = 6;

export let currentPage = 'home';
let _token = 0;
const _cache = {};

let _initCardCollapsibles = () => {};
let _closeSidebar = () => {};
let _updateNotifBadge = () => {};

export function injectRouterCallbacks({ initCardCollapsibles, closeSidebar, updateNotifBadge }) {
  _initCardCollapsibles = initCardCollapsibles || _initCardCollapsibles;
  _closeSidebar = closeSidebar || _closeSidebar;
  _updateNotifBadge = updateNotifBadge || _updateNotifBadge;
}

export const PAGE_LOADERS = {
  home: reactLoader(() => import('./react/pages/HomePage')),
  inventory: reactLoader(() => import('./react/pages/InventoryPage')),
  inout: reactLoader(() => import('./react/pages/InoutPage')),

  upload: vanillaLoader(() => import('./page-upload.js'), 'renderUploadPage'),
  mapping: vanillaLoader(() => import('./page-mapping.js'), 'renderMappingPage'),
  summary: vanillaLoader(() => import('./page-summary.js'), 'renderSummaryPage'),
  scanner: vanillaLoader(() => import('./page-scanner.js'), 'renderScannerPage'),
  documents: vanillaLoader(() => import('./page-documents.js'), 'renderDocumentsPage'),
  dashboard: vanillaLoader(() => import('./page-dashboard.js'), 'renderDashboardPage'),
  transfer: vanillaLoader(() => import('./page-transfer.js'), 'renderTransferPage'),
  ledger: vanillaLoader(() => import('./page-ledger.js'), 'renderLedgerPage'),
  settings: vanillaLoader(() => import('./page-settings.js'), 'renderSettingsPage'),
  vendors: vanillaLoader(() => import('./page-vendors.js'), 'renderVendorsPage'),
  stocktake: vanillaLoader(() => import('./page-stocktake.js'), 'renderStocktakePage'),
  bulk: vanillaLoader(() => import('./page-bulk.js'), 'renderBulkPage'),
  costing: vanillaLoader(() => import('./page-costing.js'), 'renderCostingPage'),
  labels: vanillaLoader(() => import('./page-labels.js'), 'renderLabelsPage'),
  accounts: vanillaLoader(() => import('./page-accounts.js'), 'renderAccountsPage'),
  warehouses: vanillaLoader(() => import('./page-warehouses.js'), 'renderWarehousesPage'),
  roles: vanillaLoader(() => import('./page-roles.js'), 'renderRolesPage'),
  api: vanillaLoader(() => import('./page-api.js'), 'renderApiPage'),
  billing: vanillaLoader(() => import('./page-billing.js'), 'renderBillingPage'),
  admin: vanillaLoader(() => import('./page-admin.js'), 'renderAdminPage'),
  mypage: vanillaLoader(() => import('./page-mypage.js'), 'renderMyPage'),
  guide: vanillaLoader(() => import('./page-guide.js'), 'renderGuidePage'),
  support: vanillaLoader(() => import('./page-support.js'), 'renderSupportPage'),
  team: vanillaLoader(() => import('./page-team.js'), 'renderTeamPage'),
  'tax-reports': vanillaLoader(() => import('./page-tax-reports.js'), 'renderTaxReportsPage'),
  'auto-order': vanillaLoader(() => import('./page-auto-order.js'), 'renderAutoOrderPage'),
  profit: vanillaLoader(() => import('./page-profit.js'), 'renderProfitPage'),
  backup: vanillaLoader(() => import('./page-backup.js'), 'renderBackupPage'),
  orders: vanillaLoader(() => import('./page-orders.js'), 'renderOrdersPage'),
  forecast: vanillaLoader(() => import('./page-forecast.js'), 'renderForecastPage'),
  referral: vanillaLoader(() => import('./page-referral.js'), 'renderReferralPage'),
  'weekly-report': vanillaLoader(() => import('./page-weekly-report.js'), 'renderWeeklyReportPage'),
  pos: vanillaLoader(() => import('./page-pos.js'), 'renderPosPage'),

  'hr-dashboard': vanillaLoader(() => import('./page-hr-dashboard.js'), 'renderHrDashboardPage'),
  employees: vanillaLoader(() => import('./page-employees.js'), 'renderEmployeesPage'),
  attendance: vanillaLoader(() => import('./page-attendance.js'), 'renderAttendancePage'),
  payroll: vanillaLoader(() => import('./page-payroll.js'), 'renderPayrollPage'),
  leaves: vanillaLoader(() => import('./page-leaves.js'), 'renderLeavesPage'),
  severance: vanillaLoader(() => import('./page-severance.js'), 'renderSeverancePage'),
  'yearend-settlement': vanillaLoader(() => import('./page-yearend-settlement.js'), 'renderYearendSettlementPage'),

  auditlog: async () => renderAuditLogPage,
  'hub-data': async () => renderHubData,
  'hub-inventory': async () => renderHubInventory,
  'hub-warehouse': async () => renderHubWarehouse,
  'hub-order': async () => renderHubOrder,
  'hub-report': async () => renderHubReport,
  'hub-documents': async () => renderHubDocuments,
  'hub-settings': async () => renderHubSettings,
  'hub-support': async () => renderHubSupport,
  'hub-hr': async () => renderHubHr,
};

export function readRecentPages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_PAGES_KEY) || '[]');
    return parsed.filter((id) => typeof id === 'string' && PAGE_LOADERS[id] && id !== 'home');
  } catch {
    return [];
  }
}

function addRecentPage(pageId) {
  if (!pageId || pageId === 'home') return;
  const next = [pageId, ...readRecentPages().filter((p) => p !== pageId)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_PAGES_KEY, JSON.stringify(next));
}

export function renderQuickAccess() {
  const section = document.getElementById('quick-access-section');
  const divider = document.getElementById('quick-access-divider');
  const nav = document.getElementById('quick-access-nav');
  if (!section || !divider || !nav) return;

  const pages = readRecentPages();
  const visible = pages.length > 0;
  section.style.display = visible ? '' : 'none';
  divider.style.display = visible ? '' : 'none';

  nav.innerHTML = pages
    .map(
      (id) => `
    <button class="nav-btn nav-btn-quick" data-quick-page="${id}" title="${getPageLabel(id)}">
      <span class="nav-icon">🕘</span> ${getPageLabel(id)}
    </button>
  `,
    )
    .join('');

  nav.querySelectorAll('[data-quick-page]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.quickPage));
  });
}

export function updateBreadcrumb(pageName) {
  const el = document.getElementById('breadcrumb');
  if (!el) return;

  const label = PAGE_LABELS[pageName] || pageName;
  const parentHub = HUB_MAP[pageName];

  if (pageName === 'home') {
    el.innerHTML = '<span class="breadcrumb-current">🏠 대시보드</span>';
  } else if (parentHub) {
    el.innerHTML = `
      <span class="breadcrumb-item" data-bc-nav="home">🏠</span>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-item" data-bc-nav="${parentHub}">${PAGE_LABELS[parentHub] || parentHub}</span>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">${label}</span>
    `;
  } else {
    el.innerHTML = `
      <span class="breadcrumb-item" data-bc-nav="home">🏠</span>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">${label}</span>
    `;
  }

  el.querySelectorAll('[data-bc-nav]').forEach((node) => {
    node.addEventListener('click', () => navigateTo(node.dataset.bcNav));
  });
}

function getPageLabel(pageId) {
  if (PAGE_LABELS[pageId]) return PAGE_LABELS[pageId];
  const btn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
  if (!btn) return pageId;
  return (btn.querySelector('.nav-main') || btn).textContent.replace(/\s+/g, ' ').trim();
}

async function resolveRenderer(pageName) {
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

export async function navigateTo(pageName) {
  try {
    if (!PAGE_LOADERS[pageName]) {
      console.warn('[Router] Unknown page:', pageName);
      return;
    }

    if (!canAccessPage(pageName)) {
      showUpgradeModal(pageName);
      return;
    }

    currentPage = pageName;
    localStorage.setItem(LAST_PAGE_KEY, pageName);
    addRecentPage(pageName);
    renderQuickAccess();

    const token = ++_token;
    const activeId = HUB_MAP[pageName] || pageName;

    document.querySelectorAll('[data-page]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === activeId);
    });

    updateBreadcrumb(pageName);

    const main = document.getElementById('main-content');
    if (!main) {
      console.error('[Router] #main-content not found.');
      showToast('페이지 UI 요소를 찾을 수 없습니다.', 'warning');
      return;
    }

    main.dataset.page = pageName;
    unmountCurrentReactPage();
    main.innerHTML = getSkeletonHtml();
    main.scrollTop = 0;

    const renderPage = await resolveRenderer(pageName);
    if (token !== _token || currentPage !== pageName) return;

    if (typeof renderPage !== 'function') {
      throw new Error(`페이지 렌더 함수가 없습니다: ${pageName}`);
    }

    main.dispatchEvent(new CustomEvent('invex:page-unload', { bubbles: false }));
    main.innerHTML = '';
    renderPage(main, navigateTo);

    main.classList.remove('page-enter');
    void main.offsetWidth;
    main.classList.add('page-enter');

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
    showToast(`페이지를 불러오지 못했습니다: ${err?.message || pageName}`, 'warning');
  }
}
