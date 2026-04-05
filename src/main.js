/**
 * main.js - INVEX 앱 진입점
 * 역할: 페이지 라우팅, 네비게이션 관리, 모바일 지원, 데이터 백업/복원
 */

import './style.css';
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
import { initGlobalSearch, toggleGlobalSearch } from './global-search.js';
import { initTheme, toggleTheme } from './theme.js';
import { initAuth, getCurrentUser, getUserProfileData, loginWithGoogle, logout } from './firebase-auth.js';
import { startSync, stopSync, syncToCloud, getSyncStatus } from './firebase-sync.js';
import { renderNotificationPanel, getNotificationCount } from './notifications.js';
import { showToast } from './toast.js';
import { canAccessPage, getPageBadge, showUpgradeModal, getCurrentPlan, PLANS, setPlan } from './plan.js';

// 다크 모드 초기화
initTheme();

// Firebase 인증 초기화 — 로그인 상태 변경 시 동기화 시작/중지
initAuth((user, profile) => {
  if (user) {
    startSync(user.uid);
    updateUserUI(user, profile);
  } else {
    stopSync();
    updateUserUI(null, null);
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

// 앱 초기화 (IndexedDB 복원은 비동기)
async function initApp() {
  await restoreState();
  navigateTo(currentPage);
}

initApp();

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
