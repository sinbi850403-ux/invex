import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getNavigationMeta, navigationItems } from '../features/navigation/navigation';
import { AppRouter } from '../router';
import { useStore } from '../services/store/StoreContext';

export function AppShell() {
  const { isReady, profile, user } = useAuth();
  const { isReady: isStoreReady, state } = useStore();
  const location = useLocation();
  const currentMeta = getNavigationMeta(location.pathname);
  const inventoryCount = state.mappedData?.length || 0;
  const transactionCount = state.transactions?.length || 0;

  return (
    <div className="react-shell">
      <aside className="react-sidebar">
        <div className="react-brand">
          <span className="react-brand__eyebrow">Smart Workspace</span>
          <strong>INVEX</strong>
          <p>자주 쓰는 재고, 입출고, 계정 화면을 더 빠르게 쓰기 위한 작업 공간입니다.</p>
        </div>

        <nav className="react-nav" aria-label="주요 화면 이동">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? 'react-nav__item is-active' : 'react-nav__item')}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </NavLink>
          ))}
        </nav>

        <div className="react-sidebar__footer">
          <p>현재 작업 현황</p>
          <div className="react-sidebar__stats">
            <div>
              <span>플랜</span>
              <strong>{profile?.plan || 'free'}</strong>
            </div>
            <div>
              <span>재고 품목</span>
              <strong>{inventoryCount}</strong>
            </div>
            <div>
              <span>입출고 기록</span>
              <strong>{transactionCount}</strong>
            </div>
          </div>
        </div>
      </aside>

      <div className="react-workspace">
        <header className="react-topbar">
          <div>
            <span className="react-topbar__eyebrow">{currentMeta.eyebrow}</span>
            <h1>{currentMeta.title}</h1>
          </div>

          <div className="react-topbar__actions">
            <div className="react-session-pill">
              {isReady
                ? user
                  ? `${profile?.name || user.email || '사용자'} / ${(profile?.plan || 'free').toUpperCase()}`
                  : '로그아웃 상태'
                : '인증 확인 중'}
            </div>
            <div className="react-session-pill">
              {isStoreReady
                ? `데이터 준비 완료 / ${state.fileName || `재고 ${inventoryCount}건 · 입출고 ${transactionCount}건`}`
                : '저장된 데이터를 불러오는 중'}
            </div>
            <a className="react-topbar__link" href="/index.html">
              기존 전체 기능 열기
            </a>
          </div>
        </header>

        <main className="react-page-container">
          <AppRouter />
        </main>
      </div>
    </div>
  );
}
