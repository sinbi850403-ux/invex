/**
 * plan.js - 요금제 관리 모듈
 * 역할: 현재 요금제 확인, 메뉴/기능 접근 제어, 업그레이드 안내
 * 왜 필요? → Free/Pro/Enterprise 요금제별로 기능을 분리하여 수익 모델 구현
 */

import { getState, setState } from './store.js';

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
    price: '₩290,000',
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
    price: '₩490,000',
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
  costing: 'pro', accounts: 'pro', documents: 'pro', auditlog: 'pro',
  'tax-reports': 'pro', orders: 'pro', profit: 'pro', forecast: 'pro', 'weekly-report': 'pro',
  // Enterprise 기능
  warehouses: 'enterprise', roles: 'enterprise', api: 'enterprise', 'org-chart': 'enterprise',
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
  if (isNaN(created.getTime())) return false;

  const now = new Date();
  // IndexedDB 조작 방지: createdAt이 미래 날짜이면 무효 (CWE-345)
  // 공격자가 createdAt을 미래로 바꿔 무료 기간을 영구 연장하는 것을 차단
  if (created > now) return false;

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
  if (user?.role === 'admin') return true;

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
 * 업그레이드 안내 모달 표시
 * React 환경: CustomEvent → AppLayout의 리스너에서 처리 (innerHTML 직접 조작 제거)
 * 레거시 환경: DOM fallback (PLANS 상수값만 사용하므로 XSS 위험 없음)
 */
export function showUpgradeModal(pageId) {
  const minPlan = getPageMinPlan(pageId);
  const plan = PLANS[minPlan];
  if (!plan) return;

  // React 컴포넌트(AppLayout)에 모달 렌더링 위임
  window.dispatchEvent(new CustomEvent('invex:show-upgrade-modal', {
    detail: { pageId, minPlan, plan },
  }));
}
