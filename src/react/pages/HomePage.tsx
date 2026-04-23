import { useNavigate } from 'react-router-dom';
import { getDashboardMetrics, getRecentTransactions } from '../domain/dashboard/selectors';
import { useAuth } from '../features/auth/AuthContext';
import { useStore } from '../services/store/StoreContext';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

const QUICK_MENUS = [
  {
    title: '재고 확인',
    description: '품목을 찾고 부족 재고를 먼저 체크합니다.',
    to: '/inventory',
  },
  {
    title: '입출고 등록',
    description: '오늘 거래를 바로 기록하고 반영합니다.',
    to: '/inout',
  },
  {
    title: '계정 관리',
    description: '로그인 상태와 권한 정보를 확인합니다.',
    to: '/auth',
  },
  {
    title: '전체 기능 열기',
    description: '아직 React에 없는 화면은 기존 앱에서 이어서 작업합니다.',
    href: '/index.html',
  },
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { isReady, state } = useStore();
  const metrics = getDashboardMetrics(state);
  const transactions = getRecentTransactions(state);

  const displayName = profile?.name || user?.displayName || user?.email || '사용자';
  const roleLabel = profile?.role || 'viewer';
  const planLabel = profile?.plan || 'free';

  return (
    <section className="react-page">
      <article className="react-hero-card">
        <div className="react-hero-card__content">
          <div>
            <span className="react-chip">대시보드</span>
            <h2>
              안녕하세요, {displayName}님.
              <br />
              오늘 필요한 재고와 거래를 빠르게 처리해보세요.
            </h2>
            <p>
              지금 작업 공간은 재고, 입출고, 계정 화면을 빠르게 쓰는 데 집중되어 있습니다.
              자주 쓰는 작업부터 바로 들어가고, 아직 없는 기능은 기존 전체 앱으로 이어서 이동할 수 있습니다.
            </p>
          </div>

          <div className="react-hero-card__panel">
            <span className="react-card__eyebrow">현재 로그인</span>
            <strong>{displayName}</strong>
            <p>
              {roleLabel} / {planLabel}
            </p>
            <small>{isReady ? '데이터 로드 완료' : '데이터 로딩 중...'}</small>
          </div>
        </div>
      </article>

      <div className="react-grid react-grid--stats">
        <article className="react-stat-card is-neutral">
          <span>재고 품목</span>
          <strong>{metrics.itemCount}</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>입출고 건수</span>
          <strong>{metrics.transactionCount}</strong>
        </article>
        <article className={metrics.lowStockCount ? 'react-stat-card is-warn' : 'react-stat-card is-neutral'}>
          <span>부족 재고</span>
          <strong>{metrics.lowStockCount}</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>재고 가치</span>
          <strong>{formatCurrency(metrics.inventoryValue)}원</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>오늘 입출고</span>
          <strong>{metrics.todayTransactions}</strong>
        </article>
        <article className="react-stat-card is-neutral">
          <span>거래처 수</span>
          <strong>{metrics.vendorCount}</strong>
        </article>
      </div>

      <div className="react-grid react-grid--two">
        <article className="react-card">
          <div className="react-section-head">
            <div>
              <span className="react-card__eyebrow">빠른 시작</span>
              <h3>자주 하는 작업</h3>
            </div>
          </div>

          <div className="react-quick-grid">
            {QUICK_MENUS.map((item) =>
              'href' in item ? (
                <a key={item.title} className="react-quick-btn react-quick-btn--link" href={item.href}>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </a>
              ) : (
                <button key={item.title} type="button" className="react-quick-btn" onClick={() => navigate(item.to)}>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </button>
              ),
            )}
          </div>
        </article>

        <article className="react-card">
          <div className="react-section-head">
            <div>
              <span className="react-card__eyebrow">최근 기록</span>
              <h3>마지막 입출고 내역</h3>
            </div>
          </div>

          <div className="react-activity-list">
            {transactions.length ? (
              transactions.map((tx, index) => (
                <div
                  key={tx.id ?? `${String(tx.date || '')}-${String(tx.itemName || '')}-${index}`}
                  className="react-activity-item"
                >
                  <span className={tx.type === 'in' ? 'react-badge is-good' : 'react-badge is-warn'}>
                    {tx.type === 'in' ? '입고' : '출고'}
                  </span>
                  <strong>{tx.itemName || '품목명 없음'}</strong>
                  <small>{tx.date || '-'}</small>
                  <p>
                    {(tx.vendor || '거래처 없음') + ' / 수량 '}
                    {tx.quantity || '-'}
                  </p>
                </div>
              ))
            ) : (
              <p className="react-empty-note">최근 입출고 기록이 없습니다.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export default HomePage;
