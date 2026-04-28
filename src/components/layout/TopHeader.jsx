import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PAGE_LABELS } from '../../router-config.js';
import { toggleTheme } from '../../theme.js';

export default function TopHeader({ user, profile, sidebarCollapsed }) {
  const location = useLocation();
  const pageId = location.pathname.slice(1) || 'home';
  const pageLabel = PAGE_LABELS[pageId] || pageId;

  const userName = profile?.name || user?.displayName || '';
  const userPhoto = user?.photoURL;
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark-mode'));

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark-mode'));
    });
    obs.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const handleThemeToggle = () => {
    toggleTheme();
  };

  return (
    <header className={`top-header${sidebarCollapsed ? ' sidebar-collapsed' : ''}`} id="top-header">
      <div className="top-header-left">
        <nav className="breadcrumb" id="breadcrumb" aria-label="현재 위치">
          <span className="breadcrumb-current"> {pageLabel}</span>
        </nav>
      </div>
      <div className="top-header-right">
        <button
          className="btn-theme-toggle-header"
          onClick={handleThemeToggle}
          title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {isDark ? '☀' : '☾'}
        </button>
        <div className="sync-dot" id="sync-dot" title="동기화 연결됨" />
        <div className="top-header-user" id="top-header-user">
          {user && (
            <div className="top-user-compact">
              {userPhoto
                ? <img src={userPhoto} className="top-user-avatar" alt="" />
                : <span className="top-user-avatar-placeholder">{userName?.[0] || 'U'}</span>
              }
              <span className="top-user-name">{userName}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
