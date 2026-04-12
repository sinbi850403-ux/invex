import { getState } from './store.js';

function amount(value) {
  return `₩${(value || 0).toLocaleString('ko-KR')}`;
}

export function renderReportHubPage(container, navigateTo) {
  const state = getState();
  const inventory = state.inventory || [];
  const totalValue = inventory.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0);
  const categories = new Set(inventory.map((item) => item.category).filter(Boolean));

  const cards = [
    { title: '요약 보고', desc: '핵심 지표 빠른 확인', nav: 'summary', icon: '📊' },
    { title: '손익 분석', desc: '기간별 손익/마진 추이 확인', nav: 'profit', icon: '💹' },
    { title: '매출/매입', desc: '거래 흐름과 매입·매출 비교', nav: 'accounts', icon: '💳' },
    { title: '원가 분석', desc: '원가 구조와 변동 포인트', nav: 'costing', icon: '💰' },
    { title: '주간 보고서', desc: '주간 변화와 이상 신호', nav: 'weekly-report', icon: '📬' },
    { title: '고급 분석', desc: '추세/비교 차트 심화 확인', nav: 'dashboard', icon: '📈' },
    { title: '세무/회계 서류', desc: '신고용 자료 자동 생성', nav: 'tax-reports', icon: '📑' },
    { title: '문서 생성', desc: '증빙·출력 문서 관리', nav: 'documents', icon: '📄' },
  ];

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">보고서 센터</h1>
        <p class="page-desc">보고/분석 기능을 한 곳에서 선택하고 바로 이동합니다.</p>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="label">등록 품목</div><div class="value">${inventory.length.toLocaleString('ko-KR')}개</div></div>
      <div class="stat-card"><div class="label">분류 수</div><div class="value">${categories.size.toLocaleString('ko-KR')}개</div></div>
      <div class="stat-card"><div class="label">총 재고 금액</div><div class="value">${amount(totalValue)}</div></div>
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

