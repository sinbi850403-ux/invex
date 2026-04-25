import { getState } from './store.js';
import { getPageBadge } from './plan.js';

function renderHubCard({ icon, title, desc, nav, color = '#2563eb', meta = '' }) {
  const badge = getPageBadge(nav);
  const badgeHtml = badge
    ? `<span class="hub-card-badge" style="background:${badge.color}">${badge.text}</span>`
    : '';
  const iconBg = `${color}18`;

  return `
    <button class="hub-card" data-nav="${nav}" style="--hub-accent:${color}">
      <div class="hub-card-icon" style="background:${iconBg}">${icon}</div>
      <div class="hub-card-body">
        <div class="hub-card-title">${title}${badgeHtml}</div>
        <div class="hub-card-desc">${desc}</div>
        ${meta ? `<div class="hub-card-meta">${meta}</div>` : ''}
      </div>
      <div class="hub-card-arrow">→</div>
    </button>
  `;
}

function bindHubNav(container, navigateTo) {
  container.querySelectorAll('.hub-card[data-nav]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetPage = element.dataset.nav;
      if (!targetPage) return;
      navigateTo(targetPage);
    });
  });
}

export function renderHubInventory(container, navigateTo) {
  const state = getState();
  const itemCount = (state.mappedData || []).length;
  const txCount = (state.transactions || []).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📦</span> 재고 관리</h1>
        <div class="page-desc">재고 현황, 입출고, 일괄처리, 실사를 한 곳에서 관리합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '📦',
        title: '재고 현황',
        desc: '품목별 재고, 금액, 안전재고 상태를 조회합니다.',
        nav: 'inventory',
        color: '#2563eb',
        meta: `등록 품목 ${itemCount}건`,
      })}
      ${renderHubCard({
        icon: '📥',
        title: '입출고 관리',
        desc: '입고와 출고를 기록하고 재고 수량을 즉시 반영합니다.',
        nav: 'inout',
        color: '#16a34a',
        meta: `전체 기록 ${txCount}건`,
      })}
      ${renderHubCard({
        icon: '🧩',
        title: '일괄 처리',
        desc: '수정, 삭제, 분류 변경을 한 번에 처리합니다.',
        nav: 'bulk',
        color: '#d97706',
      })}
      ${renderHubCard({
        icon: '🧮',
        title: '재고 실사',
        desc: '실제 재고와 시스템 재고를 비교하고 차이를 조정합니다.',
        nav: 'stocktake',
        color: '#7c3aed',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubWarehouse(container, navigateTo) {
  const state = getState();
  const vendorCount = (state.vendorMaster || []).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🏬</span> 창고·거래처</h1>
        <div class="page-desc">다중 창고와 거래처 정보를 함께 관리합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '🏬',
        title: '창고 관리',
        desc: '창고를 추가하고 창고별 재고를 분리 관리합니다.',
        nav: 'warehouses',
        color: '#0284c7',
      })}
      ${renderHubCard({
        icon: '🔁',
        title: '창고 이동',
        desc: '창고 간 재고 이동을 기록하고 이력을 추적합니다.',
        nav: 'transfer',
        color: '#6366f1',
      })}
      ${renderHubCard({
        icon: '🤝',
        title: '거래처 관리',
        desc: '공급처와 고객사 정보를 등록하고 관리합니다.',
        nav: 'vendors',
        color: '#059669',
        meta: `등록 거래처 ${vendorCount}곳`,
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubOrder(container, navigateTo) {
  const state = getState();
  const purchaseOrders = state.purchaseOrders || [];
  const salesOrders = state.salesOrders || [];
  const pendingPO = purchaseOrders.filter((order) => order.status === 'confirmed' || order.status === 'partial').length;
  const pendingSO = salesOrders.filter((order) => order.status === 'confirmed' || order.status === 'partial').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🛒</span> 발주·예측</h1>
        <div class="page-desc">발주, 수주, 자동 추천, 수요 예측을 통합 관리합니다.</div>
      </div>
    </div>
    <div style="margin-bottom:8px;font-size:12px;color:var(--text-muted);font-weight:600;">구매 흐름</div>
    <div class="hub-grid" style="margin-bottom:20px;">
      ${renderHubCard({
        icon: '🤖',
        title: '자동 발주 추천',
        desc: '부족 품목을 감지하고 발주 후보를 자동으로 추천합니다.',
        nav: 'auto-order',
        color: '#0284c7',
      })}
      ${renderHubCard({
        icon: '📄',
        title: '발주 관리',
        desc: '발주 진행 상태와 이력을 조회합니다.',
        nav: 'orders',
        color: '#2563eb',
        meta: pendingPO > 0 ? `진행 중 ${pendingPO}건` : '',
      })}
    </div>
    <div style="margin-bottom:8px;font-size:12px;color:var(--text-muted);font-weight:600;">판매 흐름</div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '🧾',
        title: '수주 관리',
        desc: '견적, 주문, 출고 흐름을 한 화면에서 관리합니다.',
        nav: 'sales',
        color: '#16a34a',
        meta: pendingSO > 0 ? `진행 중 ${pendingSO}건` : '',
      })}
      ${renderHubCard({
        icon: '📈',
        title: 'AI 수요 예측',
        desc: '과거 흐름을 바탕으로 미래 수요를 예측합니다.',
        nav: 'forecast',
        color: '#7c3aed',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubReport(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📊</span> 보고·분석</h1>
        <div class="page-desc">요약 보고, 손익, 주간 보고, 고급 분석을 한 곳에서 확인합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '📄',
        title: '요약 보고',
        desc: '핵심 지표를 빠르게 확인합니다.',
        nav: 'summary',
        color: '#2563eb',
      })}
      ${renderHubCard({
        icon: '🗓️',
        title: '주간 보고서',
        desc: '주간 흐름과 이상 신호를 정리합니다.',
        nav: 'weekly-report',
        color: '#0891b2',
      })}
      ${renderHubCard({
        icon: '💹',
        title: '손익 분석',
        desc: '매출, 원가, 이익 구조를 분석합니다.',
        nav: 'profit',
        color: '#16a34a',
      })}
      ${renderHubCard({
        icon: '📚',
        title: '미수·미지급 정산',
        desc: '채권과 채무 현황을 점검합니다.',
        nav: 'accounts',
        color: '#d97706',
      })}
      ${renderHubCard({
        icon: '🧮',
        title: '원가 분석',
        desc: '원가 구조와 변동 추이를 확인합니다.',
        nav: 'costing',
        color: '#dc2626',
      })}
      ${renderHubCard({
        icon: '📉',
        title: '고급 분석',
        desc: '대시보드 기반으로 다양한 지표를 탐색합니다.',
        nav: 'dashboard',
        color: '#7c3aed',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubDocuments(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🗂️</span> 문서·서류</h1>
        <div class="page-desc">세무 문서, 자동 문서 생성, 원장을 한 곳에서 관리합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '🧾',
        title: '세무·회계 서류',
        desc: '부가세와 재고 관련 문서를 생성합니다.',
        nav: 'tax-reports',
        color: '#dc2626',
      })}
      ${renderHubCard({
        icon: '📄',
        title: '문서 생성',
        desc: '발주서, 거래명세서, 견적서를 생성합니다.',
        nav: 'documents',
        color: '#2563eb',
      })}
      ${renderHubCard({
        icon: '📒',
        title: '원장',
        desc: '입출고 흐름과 잔액을 상세 조회합니다.',
        nav: 'ledger',
        color: '#059669',
      })}
      ${renderHubCard({
        icon: '🕵️',
        title: '감사 추적',
        desc: '변경 이력과 작업 로그를 확인합니다.',
        nav: 'auditlog',
        color: '#6366f1',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubSettings(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">⚙️</span> 설정</h1>
        <div class="page-desc">기본 설정, 팀 관리, 권한, 백업을 관리합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '⚙️',
        title: '기본 설정',
        desc: '통화, 단위, 세금 등 기본 옵션을 설정합니다.',
        nav: 'settings',
        color: '#64748b',
      })}
      ${renderHubCard({
        icon: '👥',
        title: '팀 관리',
        desc: '팀원 초대와 워크스페이스 구성을 관리합니다.',
        nav: 'team',
        color: '#2563eb',
      })}
      ${renderHubCard({
        icon: '💾',
        title: '백업/복원',
        desc: '데이터를 백업하고 복원합니다.',
        nav: 'backup',
        color: '#0891b2',
      })}
      ${renderHubCard({
        icon: '🔐',
        title: '권한 관리',
        desc: '역할별 접근 권한을 설정합니다.',
        nav: 'roles',
        color: '#7c3aed',
      })}
      ${renderHubCard({
        icon: '💳',
        title: '구독 관리',
        desc: '요금제와 결제 정보를 관리합니다.',
        nav: 'billing',
        color: '#d97706',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubHr(container, navigateTo) {
  const state = getState();
  const employeeCount = (state.employees || []).filter((employee) => employee.status !== 'resigned').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">👥</span> 인사·급여</h1>
        <div class="page-desc">직원 정보, 근태, 급여, 휴가를 통합 관리합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '📊',
        title: 'HR 대시보드',
        desc: '인원, 근태, 급여 현황을 한눈에 확인합니다.',
        nav: 'hr-dashboard',
        color: '#2563eb',
      })}
      ${renderHubCard({
        icon: '🧑‍💼',
        title: '직원 관리',
        desc: '직원 등록, 조회, 수정, 상태 관리를 수행합니다.',
        nav: 'employees',
        color: '#0284c7',
        meta: employeeCount > 0 ? `재직 ${employeeCount}명` : '',
      })}
      ${renderHubCard({
        icon: '🕒',
        title: '근태 관리',
        desc: '출퇴근과 근무 시간을 관리합니다.',
        nav: 'attendance',
        color: '#16a34a',
      })}
      ${renderHubCard({
        icon: '💸',
        title: '급여 계산',
        desc: '급여와 공제 항목을 계산합니다.',
        nav: 'payroll',
        color: '#d97706',
      })}
      ${renderHubCard({
        icon: '🌴',
        title: '휴가·연차 관리',
        desc: '연차 잔여와 휴가 요청 흐름을 관리합니다.',
        nav: 'leaves',
        color: '#7c3aed',
      })}
      ${renderHubCard({
        icon: '📦',
        title: '퇴직금 계산',
        desc: '퇴직금 예상액을 계산합니다.',
        nav: 'severance',
        color: '#059669',
      })}
      ${renderHubCard({
        icon: '🧾',
        title: '연말정산 보조',
        desc: '연말정산 준비 데이터를 계산합니다.',
        nav: 'yearend-settlement',
        color: '#dc2626',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export function renderHubSupport(container, navigateTo) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🛟</span> 지원</h1>
        <div class="page-desc">마이페이지, 가이드, 고객 문의, 추천을 이용합니다.</div>
      </div>
    </div>
    <div class="hub-grid">
      ${renderHubCard({
        icon: '🙍',
        title: '마이페이지',
        desc: '내 정보와 계정을 관리합니다.',
        nav: 'mypage',
        color: '#2563eb',
      })}
      ${renderHubCard({
        icon: '📘',
        title: '사용 가이드',
        desc: '기능별 사용법을 빠르게 확인합니다.',
        nav: 'guide',
        color: '#16a34a',
      })}
      ${renderHubCard({
        icon: '💬',
        title: '고객 문의',
        desc: '문의 접수와 답변 상태를 확인합니다.',
        nav: 'support',
        color: '#0891b2',
      })}
      ${renderHubCard({
        icon: '🎁',
        title: '친구 초대',
        desc: '추천 링크를 공유하고 혜택을 받습니다.',
        nav: 'referral',
        color: '#d97706',
      })}
    </div>
  `;

  bindHubNav(container, navigateTo);
}

export const HUB_MAP = {
  inventory: 'hub-inventory',
  inout: 'hub-inventory',
  bulk: 'hub-inventory',
  stocktake: 'hub-inventory',
  warehouses: 'hub-warehouse',
  transfer: 'hub-warehouse',
  vendors: 'hub-warehouse',
  'auto-order': 'hub-order',
  orders: 'hub-order',
  sales: 'hub-order',
  forecast: 'hub-order',
  summary: 'hub-report',
  'weekly-report': 'hub-report',
  profit: 'hub-report',
  accounts: 'hub-report',
  costing: 'hub-report',
  dashboard: 'hub-report',
  'tax-reports': 'hub-documents',
  documents: 'hub-documents',
  ledger: 'hub-documents',
  auditlog: 'hub-documents',
  settings: 'hub-settings',
  team: 'hub-settings',
  backup: 'hub-settings',
  roles: 'hub-settings',
  billing: 'hub-settings',
  mypage: 'hub-support',
  guide: 'hub-support',
  support: 'hub-support',
  referral: 'hub-support',
  'hr-dashboard': 'hub-hr',
  employees: 'hub-hr',
  attendance: 'hub-hr',
  payroll: 'hub-hr',
  leaves: 'hub-hr',
  severance: 'hub-hr',
  'yearend-settlement': 'hub-hr',
};

export const PAGE_LABELS = {
  home: '대시보드',
  'hub-inventory': '재고 관리',
  'hub-warehouse': '창고·거래처',
  'hub-order': '발주·예측',
  'hub-report': '보고·분석',
  'hub-documents': '문서·서류',
  'hub-settings': '설정',
  'hub-support': '지원',
  'hub-hr': '인사·급여',
  'hr-dashboard': 'HR 대시보드',
  employees: '직원 관리',
  attendance: '근태 관리',
  payroll: '급여 계산',
  leaves: '휴가·연차 관리',
  severance: '퇴직금 계산',
  'yearend-settlement': '연말정산 보조',
  upload: '파일 업로드',
  mapping: '데이터 확인',
  inventory: '재고 현황',
  inout: '입출고 관리',
  bulk: '일괄 처리',
  stocktake: '재고 실사',
  warehouses: '창고 관리',
  transfer: '창고 이동',
  vendors: '거래처 관리',
  'auto-order': '자동 발주 추천',
  orders: '발주 관리',
  sales: '수주 관리',
  forecast: 'AI 수요 예측',
  summary: '요약 보고',
  'weekly-report': '주간 보고서',
  profit: '손익 분석',
  accounts: '미수·미지급 정산',
  costing: '원가 분석',
  dashboard: '고급 분석',
  'tax-reports': '세무·회계 서류',
  documents: '문서 생성',
  ledger: '원장',
  auditlog: '감사 추적',
  settings: '기본 설정',
  team: '팀 관리',
  backup: '백업/복원',
  roles: '권한 관리',
  billing: '구독 관리',
  mypage: '마이페이지',
  guide: '사용 가이드',
  support: '고객 문의',
  referral: '친구 초대',
  admin: '관리자',
  pos: 'POS 매출분석',
  scanner: '바코드 스캔',
  labels: '라벨 출력',
  api: 'API 연동',
};

// Note: upload and mapping pages still exist (page-upload.js, page-mapping.js)
// but are no longer directly accessible from sidebar navigation.
// They can still be accessed programmatically via navigateTo('upload') or navigateTo('mapping')
