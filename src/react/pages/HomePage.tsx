import { getDashboardMetrics, getRecentTransactions } from '../domain/dashboard/selectors';
import { useAuth } from '../features/auth/AuthContext';
import { useStore } from '../services/store/StoreContext';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('ko-KR').format(value);
}

const QUICK_MENUS = [
  { icon: '📦', label: '재고 현황', page: 'inventory' },
  { icon: '🔄', label: '입출고 관리', page: 'inout' },
  { icon: '📊', label: '고급 분석', page: 'dashboard' },
  { icon: '🏢', label: '거래처 관리', page: 'vendors' },
  { icon: '🧾', label: '문서 생성', page: 'documents' },
  { icon: '⚙️', label: '기본 설정', page: 'settings' },
];

type HomePageProps = {
  navigateTo?: (page: string) => void;
};

export function HomePage({ navigateTo }: HomePageProps) {
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
              오늘의 재고 현황을 확인하세요.
            </h2>
            <p>
              품목, 입출고, 거래처, 분석 기능을 하나의 화면에서 빠르게 확인할 수 있습니다.
              아래 메뉴를 눌러 바로 이동해 보세요.
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
          <span>품목 수</span>
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
          <strong>₩{formatCurrency(metrics.inventoryValue)}</strong>
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
              <span className="react-card__eyebrow">빠른 메뉴</span>
              <h3>자주 사용하는 화면</h3>
            </div>
          </div>
          <div className="react-quick-grid">
            {QUICK_MENUS.map((item) => (
              <button
                key={item.page}
                type="button"
                className="react-quick-btn"
                onClick={() => navigateTo?.(item.page)}
              >
                <span className="react-quick-btn__icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="react-card">
          <div className="react-section-head">
            <div>
              <span className="react-card__eyebrow">최근 입출고</span>
              <h3>최근 입출고 내역</h3>
            </div>
          </div>
          <div className="react-activity-list">
            {transactions.length ? (
              transactions.map((tx, index) => (
                <div key={`${tx.itemName || 'tx'}-${index}`} className="react-activity-item">
                  <span className={tx.type === 'in' ? 'react-badge is-good' : 'react-badge is-warn'}>
                    {tx.type === 'in' ? '입고' : '출고'}
                  </span>
                  <strong>{tx.itemName || '품목명 없음'}</strong>
                  <small>{tx.date || '-'}</small>
                  <p>
                    {tx.vendor || '거래처 없음'} / 수량 {tx.quantity || '-'}
                  </p>
                </div>
              ))
            ) : (
              <p className="react-empty-note">입출고 내역이 없습니다.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export default HomePage;

