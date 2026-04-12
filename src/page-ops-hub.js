import { getState } from './store.js';

function statValue(value, suffix = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `${value.toLocaleString('ko-KR')}${suffix}`;
}

export function renderOpsHubPage(container, navigateTo) {
  const state = getState();
  const inventory = state.inventory || [];
  const transactions = state.transactions || [];
  const lowStockCount = inventory.filter((item) => (item.quantity || 0) <= (item.safeStock || 0)).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayTxCount = transactions.filter((tx) => (tx.date || '').slice(0, 10) === today).length;

  const cards = [
    { title: '재고 현황', desc: '품목별 수량/금액과 부족 품목 확인', nav: 'inventory', icon: '📦' },
    { title: '입출고 관리', desc: '입고·출고를 바로 등록/수정', nav: 'inout', icon: '🔄' },
    { title: '재고 실사', desc: '실물 재고와 장부 차이 확인', nav: 'stocktake', icon: '📋' },
    { title: '다중 창고 관리', desc: '창고별 재고 분산 조회', nav: 'warehouses', icon: '🏢' },
    { title: '창고 이동', desc: '창고 간 이동 처리', nav: 'transfer', icon: '🏭' },
    { title: '거래처 관리', desc: '공급처·고객사 정보 관리', nav: 'vendors', icon: '🤝' },
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">재고 관리 허브</h1>
        <p class="page-desc">관리 기능을 목적별로 모아 빠르게 이동할 수 있습니다.</p>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="label">오늘 처리 건수</div><div class="value">${statValue(todayTxCount, '건')}</div></div>
      <div class="stat-card"><div class="label">전체 품목</div><div class="value">${statValue(inventory.length, '개')}</div></div>
      <div class="stat-card"><div class="label">부족/주의 품목</div><div class="value">${statValue(lowStockCount, '개')}</div></div>
    </div>

    <div class="card" style="padding:18px;">
      <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px;">
        ${cards
          .map(
            (card) => `
          <button class="hub-link-card" data-nav="${card.nav}" type="button">
            <div class="hub-link-icon">${card.icon}</div>
            <div class="hub-link-title">${card.title}</div>
            <div class="hub-link-desc">${card.desc}</div>
          </button>
        `,
          )
          .join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });
}

