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
  // 2차 변환 (허브·보고서·예측)
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
      >☰</button>
      {sidebarOpen && <div className="sidebar-overlay active" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <TopHeader user={user} profile={profile} />

      <main id="main-content">
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
