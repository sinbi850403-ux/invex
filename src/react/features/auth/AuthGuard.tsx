import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function AuthGuard() {
  const { isReady, user } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <section className="react-page">
        <article className="react-card react-card--loading">
          <span className="react-chip">로딩 중</span>
          <h2>인증 상태를 확인하고 있습니다.</h2>
          <p>로그인 정보와 사용자 세션을 복원하는 중입니다. 잠시만 기다려주세요.</p>
        </article>
      </section>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
