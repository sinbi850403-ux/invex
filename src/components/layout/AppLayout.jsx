import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import Sidebar from './Sidebar.jsx';
import TopHeader from './TopHeader.jsx';
import { createLegacyPage } from '../../pages/LegacyPage.jsx';
import { PAGE_LOADERS } from '../../router-config.js';
import { initGlobalSearch } from '../../global-search.js';
import { checkAndShowOnboarding } from '../../onboarding.js';
import { showToast } from '../../toast.js';

// 네이티브 React 컴포넌트로 변환된 페이지
const REACT_PAGES = {
  // 1차 변환 (정적/단순 페이지)
  guide:           lazy(() => import('../../pages/GuidePage.jsx')),
  referral:        lazy(() => import('../../pages/ReferralPage.jsx')),
  settings:        lazy(() => import('../../pages/SettingsPage.jsx')),
  backup:          lazy(() => import('../../pages/BackupPage.jsx')),
  mypage:          lazy(() => import('../../pages/MyPage.jsx')),
  support:         lazy(() => import('../../pages/SupportPage.jsx')),
  // 2차 변환 (허브·보고서·예측·HR)
  'hub-inventory': lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubInventoryPage }))),
  'hub-warehouse': lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubWarehousePage }))),
  'hub-order':     lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubOrderPage }))),
  'hub-report':    lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubReportPage }))),
  'hub-documents': lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubDocumentsPage }))),
  'hub-settings':  lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubSettingsPage }))),
  'hub-hr':        lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubHrPage }))),
  'hub-support':   lazy(() => import('../../pages/HubsPage.jsx').then(m => ({ default: m.HubSupportPage }))),
  'weekly-report': lazy(() => import('../../pages/WeeklyReportPage.jsx')),
  'hr-dashboard':  lazy(() => import('../../pages/HrDashboardPage.jsx')),
  forecast:        lazy(() => import('../../pages/ForecastPage.jsx')),
  home:            lazy(() => import('../../pages/HomePage.jsx')),
  summary:         lazy(() => import('../../pages/SummaryPage.jsx')),
  // 3차 변환 (결제·팀·감사)
  billing:         lazy(() => import('../../pages/BillingPage.jsx')),
  team:            lazy(() => import('../../pages/TeamPage.jsx')),
  auditlog:        lazy(() => import('../../pages/AuditLogPage.jsx')),
  // 4차 변환 (창고이동·라벨·실사·창고관리)
  transfer:        lazy(() => import('../../pages/TransferPage.jsx')),
  labels:          lazy(() => import('../../pages/LabelsPage.jsx')),
  stocktake:       lazy(() => import('../../pages/StocktakePage.jsx')),
  warehouses:      lazy(() => import('../../pages/WarehousesPage.jsx')),
  // 5차 변환 (거래처·발주)
  vendors:         lazy(() => import('../../pages/VendorsPage.jsx')),
  orders:          lazy(() => import('../../pages/OrdersPage.jsx')),
  // 6차 변환 (업로드·매핑·스캐너·일괄·고급분석)
  upload:          lazy(() => import('../../pages/UploadPage.jsx')),
  mapping:         lazy(() => import('../../pages/MappingPage.jsx')),
  scanner:         lazy(() => import('../../pages/ScannerPage.jsx')),
  bulk:            lazy(() => import('../../pages/BulkPage.jsx')),
  dashboard:       lazy(() => import('../../pages/DashboardPage.jsx')),
  // 7차 변환 (수불부·원가·장부·권한)
  ledger:          lazy(() => import('../../pages/LedgerPage.jsx')),
  costing:         lazy(() => import('../../pages/CostingPage.jsx')),
  accounts:        lazy(() => import('../../pages/AccountsPage.jsx')),
  roles:           lazy(() => import('../../pages/RolesPage.jsx')),
  // 8차 변환 (API·문서·세무·손익)
  api:             lazy(() => import('../../pages/ApiPage.jsx')),
  documents:       lazy(() => import('../../pages/DocumentsPage.jsx')),
  'tax-reports':   lazy(() => import('../../pages/TaxReportsPage.jsx')),
  profit:          lazy(() => import('../../pages/ProfitPage.jsx')),
  // 9차 변환 (POS·관리자)
  pos:             lazy(() => import('../../pages/PosPage.jsx')),
  admin:           lazy(() => import('../../pages/AdminPage.jsx')),
  // 10차 변환 (HR: 직원·근태·급여·휴가·퇴직금·연말정산)
  employees:       lazy(() => import('../../pages/EmployeesPage.jsx')),
  attendance:      lazy(() => import('../../pages/AttendancePage.jsx')),
  payroll:         lazy(() => import('../../pages/PayrollPage.jsx')),
  leaves:          lazy(() => import('../../pages/LeavesPage.jsx')),
  severance:       lazy(() => import('../../pages/SeverancePage.jsx')),
  'yearend-settlement': lazy(() => import('../../pages/YearendSettlementPage.jsx')),
  // 11차 변환 (재고현황·입출고·수주관리 — 마지막 3개 핵심 페이지)
  inventory:       lazy(() => import('../../pages/InventoryPage.jsx')),
  in:              lazy(() => import('../../pages/InoutPage.jsx').then(m => ({ default: m.InPage }))),
  out:             lazy(() => import('../../pages/InoutPage.jsx').then(m => ({ default: m.OutPage }))),
  sales:           lazy(() => import('../../pages/SalesPage.jsx')),
};

// React 페이지는 네이티브 컴포넌트로, 나머지는 LegacyPage 래퍼로 생성
const PAGE_COMPONENTS = Object.fromEntries(
  Object.entries(PAGE_LOADERS).map(([id, loader]) => [
    id,
    REACT_PAGES[id] || createLegacyPage(id, loader),
  ])
);

function PageNotFound() {
  return (
    <div style={{padding:'40px', textAlign:'center'}}>
      <h2>페이지를 찾을 수 없습니다</h2>
    </div>
  );
}

export default function AppLayout() {
  const { user, profile, startPage } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('invex:sidebar-collapsed') === '1');

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('invex:sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

  // 앱 초기 진입 시 startPage로 이동
  useEffect(() => {
    if (startPage && startPage !== 'home') {
      navigate('/' + startPage, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 온보딩 체크
  useEffect(() => {
    if (user) {
      setTimeout(() => {
        checkAndShowOnboarding((pageId) => navigate('/' + pageId));
      }, 1000);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // 키보드 단축키 (Alt+숫자)
  useEffect(() => {
    const handler = (e) => {
      if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        const btns = Array.from(document.querySelectorAll('.nav-btn[data-page]')).filter(b => b.offsetParent !== null);
        const target = btns[Number(e.key) - 1];
        if (target?.dataset?.page) {
          e.preventDefault();
          navigate('/' + target.dataset.page);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [navigate]);

  // smart-details 토글 (details.smart-details)
  useEffect(() => {
    const handler = (e) => {
      const summary = e.target.closest('details.smart-details > summary');
      if (!summary) return;
      const details = summary.parentElement;
      if (!details || !(details instanceof HTMLDetailsElement)) return;
      e.preventDefault();
      details.open = !details.open;
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  // 오류 이벤트 처리
  useEffect(() => {
    const handleSyncFailed = () => {
      showToast('일부 데이터가 클라우드에 저장되지 않았습니다.', 'warning');
    };
    window.addEventListener('invex:sync-failed', handleSyncFailed);
    return () => window.removeEventListener('invex:sync-failed', handleSyncFailed);
  }, []);

  return (
    <div id="app">
      <button
        className="mobile-toggle"
        id="mobile-toggle"
        onClick={() => setSidebarOpen(prev => !prev)}
      ></button>
      {sidebarOpen && <div className="sidebar-overlay active" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
      />

<TopHeader user={user} profile={profile} sidebarCollapsed={sidebarCollapsed} />

      <main id="main-content" className={sidebarCollapsed ? 'sidebar-collapsed' : ''}>
        <Suspense fallback={<div style={{padding:'40px',textAlign:'center',color:'var(--text-muted)'}}>로딩 중...</div>}>
          <Routes>
            <Route index element={<Navigate to="/home" replace />} />
            {Object.entries(PAGE_COMPONENTS).map(([id, Component]) => (
              <Route
                key={id}
                path={'/' + id}
                element={<Component />}
              />
            ))}
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
