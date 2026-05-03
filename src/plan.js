/**
 * plan.js - 요금제 관리 모듈
 * 역할: 현재 요금제 확인, 메뉴/기능 접근 제어, 업그레이드 안내
 * 왜 필요? → Free/Pro/Enterprise 요금제별로 기능을 분리하여 수익 모델 구현
 */

import { getState, setState } from './store.js';
import { isSuperAdminEmail } from './admin-emails.js';

// 요금제 정의 — 접근 가능 페이지는 PAGE_MIN_PLAN 단일 소스에서 관리
export const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    icon: '',
    color: '#6b7280',
    price: '₩0',
    period: '영구 무료',
    description: '1인 사업자·스타트업',
    itemLimit: 100,
    userLimit: 1,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    icon: '⭐',
    color: '#3b82f6',
    price: '₩29,000',
    period: '월',
    description: '중소기업·소매점',
    itemLimit: Infinity,
    userLimit: 5,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    icon: '',
    color: '#8b5cf6',
    price: '₩59,000',
    period: '월',
    description: '다점포·유통업',
    itemLimit: Infinity,
    userLimit: Infinity,
  },
};

// 각 페이지가 어느 요금제부터 사용 가능한지 매핑
const PAGE_MIN_PLAN = {
  // 허브 페이지 — 항상 무료 (네비게이션 전용)
  'hub-inventory': 'free', 'hub-warehouse': 'free',
  'hub-order': 'free', 'hub-report': 'free', 'hub-documents': 'free',
  'hub-settings': 'free', 'hub-support': 'free', 'hub-hr': 'free',
  // Free 기능
  home: 'free', upload: 'free', mapping: 'free',
  inventory: 'free', in: 'free', out: 'free', ledger: 'free',
  settings: 'free', billing: 'free', admin: 'free',
  mypage: 'free', guide: 'free', support: 'free', team: 'free', backup: 'free', referral: 'free',
  // Pro 기능
  bulk: 'pro', scanner: 'pro', labels: 'pro', transfer: 'pro',
  stocktake: 'pro', vendors: 'pro', summary: 'pro', dashboard: 'pro',
  costing: 'pro', accounts: 'pro', ledger: 'pro', documents: 'pro', auditlog: 'pro',
  'tax-reports': 'pro', orders: 'pro', profit: 'pro', forecast: 'pro', 'weekly-report': 'pro',
  // Enterprise 기능
  warehouses: 'enterprise', roles: 'enterprise', api: 'enterprise',
};

// 요금제 등급 순서 (비교용)
const PLAN_RANK = { free: 0, pro: 1, enterprise: 2 };

// 1년 무료 이용 기간 (일)
const FREE_PERIOD_DAYS = 365;

/**
 * 1년 무료 기간 내 여부 체크
 * 왜? → 가입 후 1년간 모든 기능 무료 개방. 1년 후 요금제 제한 적용.
 */
let _getUserProfile = null;
export function injectGetUserProfile(fn) { _getUserProfile = fn; }

function isInFreePeriod() {
  const profile = _getUserProfile?.();
  if (!profile || !profile.createdAt) return false;

  const created = new Date(profile.createdAt);
  const now = new Date();
  const daysSinceCreation = Math.floor((now - created) / (1000 * 60 * 60 * 24));

  return daysSinceCreation <= FREE_PERIOD_DAYS;
}

/**
 * 무료 기간 정보 반환 (외부에서 D-day 표시용)
 */
export function getFreePeriodStatus() {
  const profile = _getUserProfile?.();
  if (!profile || !profile.createdAt) {
    return { inFree: true, daysLeft: FREE_PERIOD_DAYS, endDate: '-' };
  }

  const created = new Date(profile.createdAt);
  const freeEnd = new Date(created);
  freeEnd.setDate(freeEnd.getDate() + FREE_PERIOD_DAYS);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((freeEnd - now) / (1000 * 60 * 60 * 24)));

  return {
    inFree: daysLeft > 0,
    daysLeft,
    endDate: freeEnd.toLocaleDateString('ko-KR'),
    startDate: created.toLocaleDateString('ko-KR'),
  };
}

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
  // React 컴포넌트(Sidebar 등)에 plan 변경 알림
  window.dispatchEvent(new CustomEvent('invex:plan-changed', { detail: { planId } }));
}

/**
 * 특정 페이지 접근 가능 여부
 * 현재 요금제 조회
 */
export function canAccessPage(pageId) {
  // 허브 페이지는 요금제·기간 무관 무조건 접근 가능 (네비게이션 전용)
  if (pageId && pageId.startsWith('hub-')) return true;
  // 홈도 항상 접근 가능
  if (pageId === 'home') return true;

  // 총관리자는 모든 페이지 무제한 접근
  const user = _getCurrentUser?.();
  if (user && isSuperAdminEmail(user.email)) return true;

  // 1년 무료 기간 체크 — 가입일 기준 365일 이내면 모든 기능 개방
  // 왜? → 1년 무료 오픈이므로 요금제 제한을 걸면 안 됨
  if (isInFreePeriod()) return true;

  const currentPlan = getCurrentPlan();
  if (!PLANS[currentPlan]) return false;
  if (currentPlan === 'enterprise') return true;
  const minPlan = PAGE_MIN_PLAN[pageId];
  if (!minPlan) return false;
  return PLAN_RANK[currentPlan] >= PLAN_RANK[minPlan];
}

// 순환참조 방지용: auth 모듈에서 함수를 lazy 주입
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
  // 1년 무료 기간이면 배지 숨김 (모든 기능 열림)
  if (isInFreePeriod()) return null;

  const minPlan = getPageMinPlan(pageId);
  const current = getCurrentPlan();

  if (PLAN_RANK[minPlan] <= PLAN_RANK[current]) return null;

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
        <div style="font-size:48px; margin-bottom:12px;"></div>
        <h3 style="font-size:20px; font-weight:800; margin-bottom:8px;">
          ${plan.name} 요금제 기능입니다
        </h3>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:24px; line-height:1.6;">
          이 기능은 <strong style="color:${plan.color};">${plan.icon} ${plan.name}</strong> 이상 요금제에서 사용할 수 있습니다.
          <br/>업그레이드 후 이용해주세요.
        </p>

        <div style="background:var(--bg-secondary); border-radius:12px; padding:20px; margin-bottom:24px; text-align:left;">
          <div style="font-weight:700; margin-bottom:8px;">${plan.icon} ${plan.name} — ${plan.price}/${plan.period}</div>
          <div style="font-size:13px; color:var(--text-muted);">${plan.description}</div>
        </div>

        <div style="display:flex; gap:8px; justify-content:center;">
          <button class="btn btn-ghost" id="upgrade-close">닫기</button>
          <button class="btn btn-primary" id="upgrade-action" style="background:linear-gradient(135deg, ${plan.color}, ${plan.color}dd);">
            ${plan.name}로 업그레이드
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

  // 업그레이드 버튼 → 결제 페이지로 이동 (결제 없이 플랜 변경 불가)
  modal.querySelector('#upgrade-action').addEventListener('click', () => {
    modal.remove();
    window.location.href = '/billing';
  });
}
