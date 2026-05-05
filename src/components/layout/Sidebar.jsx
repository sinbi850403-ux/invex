import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { getPageBadge, getCurrentPlan, PLANS, setPlan } from '../../plan.js';
import { getNotificationCount, renderNotificationPanel } from '../../notifications.js';
import { initGlobalSearch, toggleGlobalSearch } from '../../global-search.js';
import { toggleTheme } from '../../theme.js';
import { showToast } from '../../toast.js';
import { PAGE_LABELS } from '../../router-config.js';
import { isSuperAdminEmail } from '../../admin-emails.js';

// 사이드바 섹션 정의
const NAV_SECTIONS = [
  {
    id: 'inventory',
    label: '재고 관리',
    items: [
      { id: 'in', label: '입고관리' },
      { id: 'out', label: '출고관리' },
      { id: 'ledger', label: '수불관리' },
      { id: 'inventory', label: '재고현황' },
    ],
  },
  {
    id: 'warehouse',
    label: '창고·거래처',
    items: [
      { id: 'warehouses', label: '다중 창고 관리' },
      { id: 'transfer', label: '창고 이동' },
      { id: 'vendors', label: '거래처 관리' },
    ],
  },
  {
    id: 'trading',
    label: '구매·판매',
    items: [
      { id: 'orders', label: '발주 관리' },
      { id: 'sales', label: '수주 관리' },
      { id: 'forecast', label: '수요 예측' },
    ],
  },
  {
    id: 'report',
    label: '보고·분석',
    items: [
      { id: 'summary', label: '요약 보고' },
      { id: 'weekly-report', label: '주간 보고서' },
      { id: 'profit', label: '손익 분석' },
      { id: 'accounts', label: '매출·매입' },
      { id: 'costing', label: '원가 분석' },
      { id: 'dashboard', label: '고급 분석' },
    ],
  },
  {
    id: 'documents',
    label: '문서·서류',
    items: [
      { id: 'tax-reports', label: '세무·회계 서류' },
      { id: 'documents', label: '문서 생성' },
      { id: 'auditlog', label: '감사 추적' },
    ],
  },
  {
    id: 'hr',
    label: '인사·급여',
    items: [
      { id: 'hr-dashboard', label: 'HR 대시보드' },
      { id: 'employees', label: '직원 관리' },
      { id: 'org-chart', label: '조직도' },
      { id: 'attendance', label: '근태 관리' },
      { id: 'payroll', label: '급여 계산' },
      { id: 'leaves', label: '휴가·연차' },
      { id: 'severance', label: '퇴직금 계산' },
      { id: 'yearend-settlement', label: '연말정산' },
    ],
  },
  {
    id: 'system',
    label: '설정·지원',
    items: [
      { id: 'settings', label: '기본 설정' },
      { id: 'team', label: '팀 관리' },
      { id: 'backup', label: '백업·복원' },
      { id: 'billing', label: '구독 관리' },
      { id: 'mypage', label: '마이페이지' },
      { id: 'guide', label: '사용 가이드' },
      { id: 'support', label: '고객 문의' },
      { id: 'referral', label: '추천 프로그램' },
      { id: 'admin', label: '관리자', adminOnly: true },
      { id: 'pos', label: 'POS 매출분석', adminOnly: true },
    ],
  },
];

export default function Sidebar({ isOpen, onClose, collapsed = false, onToggleCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, logout } = useAuth();
  const [openSections, setOpenSections] = useState({});
  const [notifCount, setNotifCount] = useState(0);
  const [planId, setPlanId] = useState(getCurrentPlan());
  const [fontScale, setFontScale] = useState(parseInt(localStorage.getItem('invex_font_scale') || '0', 10));
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark-mode'));

  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark-mode')));
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const currentPageId = location.pathname.slice(1) || 'home';

  // 현재 페이지에 해당하는 섹션 자동 열기
  useEffect(() => {
    const section = NAV_SECTIONS.find(s => s.items.some(item => item.id === currentPageId));
    if (section) {
      setOpenSections(prev => ({ ...prev, [section.id]: true }));
    }
  }, [currentPageId]);

  // 알림 카운트 업데이트
  useEffect(() => {
    const update = () => setNotifCount(getNotificationCount());
    update();
    window.addEventListener('notifications-updated', update);
    return () => window.removeEventListener('notifications-updated', update);
  }, []);

  // plan 변경 감지
  useEffect(() => {
    const update = () => setPlanId(getCurrentPlan());
    window.addEventListener('invex:plan-changed', update);
    return () => window.removeEventListener('invex:plan-changed', update);
  }, []);

  // Global search 초기화
  useEffect(() => {
    initGlobalSearch((pageId) => navigate('/' + pageId));
  }, [navigate]);

  const toggleSection = useCallback((sectionId) => {
    setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  const handleNavClick = useCallback((pageId) => {
    navigate('/' + pageId);
    localStorage.setItem('invex_last_page_v1', pageId);
    if (onClose) onClose(); // 모바일에서 사이드바 닫기
  }, [navigate, onClose]);

  const handleThemeToggle = useCallback(() => {
    toggleTheme();
  }, []);

  const handleFontToggle = useCallback(() => {
    const next = fontScale >= 2 ? 0 : fontScale + 1;
    setFontScale(next);
    localStorage.setItem('invex_font_scale', next);
    document.documentElement.classList.remove('font-scale-1', 'font-scale-2');
    if (next === 1) document.documentElement.classList.add('font-scale-1');
    else if (next === 2) document.documentElement.classList.add('font-scale-2');
    const labels = ['기본', '크게', '매우 크게'];
    showToast(`글자 크기: ${labels[next]}`, 'success');
  }, [fontScale]);

  const plan = PLANS[planId];
  const userName = profile?.name || user?.displayName || '사용자';
  const userPhoto = user?.photoURL;
  const adminMode = isSuperAdminEmail(user?.email);

  return (
    <aside id="sidebar" className={`sidebar ${isOpen ? 'open' : ''}${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* 접기/펼치기 토글 버튼 */}
      <button
        className="sidebar-collapse-btn"
        onClick={onToggleCollapse}
        title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <div className="sidebar-logo">
        <img src="/logo-mark.svg" alt="INVEX" width="28" height="28" style={{borderRadius:'7px', flexShrink:0}} />
        <div className="sidebar-logo-text">INVEX<span className="logo-sub">Inventory Expert</span></div>
      </div>

      {/* 상단 도구 */}
      <div className="sidebar-tools">
        <button className="btn-tool" id="btn-global-search" title="검색 (Ctrl+K)" onClick={() => toggleGlobalSearch()}>검색</button>
        <button className="btn-tool" id="btn-notifications" title="알림" onClick={(e) => { e.stopPropagation(); renderNotificationPanel(); }}>
          알림
          {notifCount > 0 && <span className="notif-dot" id="notif-dot" />}
        </button>
        <button className="btn-tool" id="btn-theme-toggle" title={isDark ? '라이트 모드' : '다크 모드'} onClick={handleThemeToggle}>{isDark ? '☀' : '☾'}</button>
        <button className="btn-tool" id="btn-font-toggle" title="글자 크기" onClick={handleFontToggle}>
          {fontScale === 0 ? '가' : fontScale === 1 ? '가+' : '가++'}
        </button>
      </div>

      <div className="sidebar-divider" />

      {/* 아코디언 네비게이션 */}
      <nav className="snav" id="sidebar-nav">
        <button
          className={`snav-direct nav-btn ${currentPageId === 'home' ? 'active' : ''}`}
          data-page="home"
          onClick={() => handleNavClick('home')}
        >대시보드</button>

        <div className="sidebar-divider" style={{margin:'6px 0'}} />

        {NAV_SECTIONS.map(section => (
          <div
            key={section.id}
            className={`snav-section ${openSections[section.id] ? 'open' : ''}`}
            data-section={section.id}
          >
            <button className="snav-header" onClick={() => toggleSection(section.id)}>
              <span className="snav-toggle">{openSections[section.id] ? '−' : '+'}</span>
              {section.label}
            </button>
            <div className="snav-body">
              {section.items.map(item => {
                if (item.adminOnly && !adminMode) return null;
                const badge = getPageBadge(item.id);
                return (
                  <button
                    key={item.id}
                    className={`snav-item nav-btn ${currentPageId === item.id ? 'active' : ''}`}
                    data-page={item.id}
                    style={{opacity: badge ? '0.55' : '1'}}
                    onClick={() => handleNavClick(item.id)}
                  >
                    {item.label}
                    {badge && (
                      <span className="plan-badge badge" style={{background: `linear-gradient(135deg,${badge.color},${badge.color}cc)`}}>
                        {badge.text}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 사이드바 하단 */}
      <div className="sidebar-footer">
        <div id="user-info-area">
          {user ? (
            <div className="sidebar-user">
              {userPhoto && <img src={userPhoto} className="sidebar-user-avatar" alt="" />}
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{userName}</div>
                <div className="sidebar-user-plan">{(profile?.plan || 'free').toUpperCase()}</div>
              </div>
              <button
                className="btn-icon"
                title="로그아웃"
                style={{fontSize:'11px', color:'rgba(255,255,255,0.5)'}}
                onClick={logout}
              >로그아웃</button>
            </div>
          ) : null}
        </div>
        <div
          className="sidebar-plan-badge"
          id="plan-display"
          title="요금제 변경"
        >
          <span className="plan-label" id="plan-name" style={{color: plan?.color}}>
            {plan ? `${plan.icon} ${plan.name}` : 'Free'}
          </span>
        </div>
        INVEX v3.0 · © 2026
      </div>
    </aside>
  );
}
