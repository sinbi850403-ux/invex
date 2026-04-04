/**
 * main.js - ERP-Lite 앱 진입점
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
import { renderNotificationPanel, getNotificationCount } from './notifications.js';
import { showToast } from './toast.js';

// 현재 페이지
let currentPage = 'upload';

// 페이지별 렌더 함수
const pages = {
  upload: renderUploadPage,
  mapping: renderMappingPage,
  inventory: renderInventoryPage,
  inout: renderInoutPage,
  summary: renderSummaryPage,
  scanner: renderScannerPage,
  documents: renderDocumentsPage,
  dashboard: renderDashboardPage,
};

/**
 * 페이지 전환
 * 모바일에서는 nav 클릭 시 사이드바 자동 닫힘
 */
function navigateTo(pageName) {
  if (!pages[pageName]) return;
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

// 모든 nav 영역의 버튼에 이벤트 연결
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    navigateTo(btn.dataset.page);
  });
});

// 알림 버튼 이벤트
document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
  e.stopPropagation();
  renderNotificationPanel();
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
    a.download = `ERP-Lite_백업_${new Date().toISOString().split('T')[0]}.json`;
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
