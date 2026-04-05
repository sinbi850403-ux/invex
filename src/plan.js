/**
 * plan.js - 요금제 관리 모듈
 * 역할: 현재 요금제 확인, 메뉴/기능 접근 제어, 업그레이드 안내
 * 왜 필요? → Free/Pro/Enterprise 요금제별로 기능을 분리하여 수익 모델 구현
 */

import { getState, setState } from './store.js';

// 요금제 정의
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    icon: '🆓',
    color: '#6b7280',
    price: '₩0',
    period: '영구 무료',
    description: '1인 사업자·스타트업',
    itemLimit: 100,
    userLimit: 1,
    // Free에서 접근 가능한 페이지
    pages: [
      'home', 'upload', 'mapping', 'inventory', 'inout', 'settings', 'billing', 'admin',
      'mypage', 'guide', 'support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    icon: '⭐',
    color: '#3b82f6',
    price: '₩290,000',
    period: '월',
    description: '중소기업·소매점',
    itemLimit: Infinity,
    userLimit: 5,
    // Pro에서 추가로 접근 가능한 페이지
    pages: [
      'home', 'upload', 'mapping', 'inventory', 'inout', 'settings',
      'bulk', 'scanner', 'labels', 'transfer', 'stocktake', 'vendors',
      'summary', 'dashboard', 'costing', 'accounts', 'ledger', 'documents', 'auditlog', 'billing', 'admin',
      'mypage', 'guide', 'support',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    icon: '🏢',
    color: '#8b5cf6',
    price: '₩490,000',
    period: '월',
    description: '다점포·유통업',
    itemLimit: Infinity,
    userLimit: Infinity,
    // Enterprise는 모든 페이지 접근 가능
    pages: ['*'],
  },
};

// 각 페이지가 어느 요금제부터 사용 가능한지 매핑
const PAGE_MIN_PLAN = {
  // Free 기능
  home: 'free', upload: 'free', mapping: 'free',
  inventory: 'free', inout: 'free', settings: 'free', billing: 'free', admin: 'free',
  // Pro 기능
  bulk: 'pro', scanner: 'pro', labels: 'pro', transfer: 'pro',
  stocktake: 'pro', vendors: 'pro', summary: 'pro', dashboard: 'pro',
  costing: 'pro', accounts: 'pro', ledger: 'pro', documents: 'pro', auditlog: 'pro',
  // Enterprise 기능
  warehouses: 'enterprise', roles: 'enterprise', api: 'enterprise',
};

// 요금제 등급 순서 (비교용)
const PLAN_RANK = { free: 0, pro: 1, enterprise: 2 };

/**
 * 현재 요금제 조회
 */
export function getCurrentPlan() {
  const state = getState();
  return state.currentPlan || 'free';
}

/**
 * 요금제 변경
 */
export function setPlan(planId) {
  if (!PLANS[planId]) return;
  setState({ currentPlan: planId });
}

/**
 * 특정 페이지 접근 가능 여부
 * 왜 관리자 체크? → 총관리자는 요금제 무관하게 모든 기능 사용 가능
 */
// 총관리자 이메일 (page-admin.js의 ADMIN_EMAILS와 동기화 필수)
const SUPER_ADMINS = ['sinbi0214@naver.com', 'sinbi850403@gmail.com', 'admin@invex.io.kr'];

export function canAccessPage(pageId) {
  // 총관리자는 모든 페이지 무제한 접근
  const user = _getCurrentUser?.();
  if (user && SUPER_ADMINS.includes(user.email)) return true;

  const currentPlan = getCurrentPlan();
  const plan = PLANS[currentPlan];
  if (!plan) return false;
  if (plan.pages.includes('*')) return true;
  return plan.pages.includes(pageId);
}

// 순환참조 방지용: firebase-auth에서 함수를 lazy 주입
let _getCurrentUser = null;
export function injectGetCurrentUser(fn) { _getCurrentUser = fn; }

/**
 * 페이지의 최소 요금제 반환
 */
export function getPageMinPlan(pageId) {
  return PAGE_MIN_PLAN[pageId] || 'free';
}

/**
 * 페이지용 배지 텍스트 반환 (현재 요금제보다 높은 것만)
 */
export function getPageBadge(pageId) {
  const minPlan = getPageMinPlan(pageId);
  const current = getCurrentPlan();

  if (PLAN_RANK[minPlan] <= PLAN_RANK[current]) return null; // 접근 가능 → 배지 없음

  if (minPlan === 'pro') return { text: 'PRO', color: '#3b82f6' };
  if (minPlan === 'enterprise') return { text: 'ENT', color: '#8b5cf6' };
  return null;
}

/**
 * 업그레이드 안내 모달 HTML 생성
 */
export function showUpgradeModal(pageId) {
  const minPlan = getPageMinPlan(pageId);
  const plan = PLANS[minPlan];
  if (!plan) return;

  // 기존 모달 제거
  const existing = document.getElementById('upgrade-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'upgrade-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:440px; text-align:center;">
      <div style="padding:32px 24px;">
        <div style="font-size:48px; margin-bottom:12px;">🔒</div>
        <h3 style="font-size:20px; font-weight:800; margin-bottom:8px;">
          ${plan.name} 요금제 기능입니다
        </h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:24px; line-height:1.6;">
          이 기능은 <strong style="color:${plan.color};">${plan.icon} ${plan.name}</strong> 이상 요금제에서 사용할 수 있습니다.
          <br/>업그레이드하여 모든 기능을 활용하세요!
        </p>

        <div style="background:var(--bg-secondary); border-radius:12px; padding:20px; margin-bottom:24px; text-align:left;">
          <div style="font-weight:700; margin-bottom:8px;">${plan.icon} ${plan.name} — ${plan.price}/${plan.period}</div>
          <div style="font-size:13px; color:var(--text-muted);">${plan.description}</div>
        </div>

        <div style="display:flex; gap:8px; justify-content:center;">
          <button class="btn btn-ghost" id="upgrade-close">닫기</button>
          <button class="btn btn-primary" id="upgrade-action" style="background:linear-gradient(135deg, ${plan.color}, ${plan.color}dd);">
            ⚡ ${plan.name}로 업그레이드
          </button>
        </div>

        <div style="margin-top:16px; font-size:11px; color:var(--text-muted);">
          Pro 플랜부터 모든 고급 기능을 사용할 수 있습니다
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 닫기 이벤트
  modal.querySelector('#upgrade-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // 업그레이드 버튼 → 지금은 무료 체험 활성화
  modal.querySelector('#upgrade-action').addEventListener('click', () => {
    setPlan(minPlan);
    modal.remove();
    // 페이지 리로드로 사이드바 갱신
    window.location.reload();
  });
}
