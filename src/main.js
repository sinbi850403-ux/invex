/**
 * main.js - INVEX 앱 진입점
 * 역할: 앱 초기화, 인증 게이트 UI, 사이드바 이벤트
 */

import './style.css';
import { initErrorMonitor, setMonitorUser, clearMonitorUser } from './error-monitor.js';
import { initAuth, getCurrentUser, getUserProfileData, loginWithGoogle, loginWithEmail, signupWithEmail, resetPassword, logout } from './auth.js';
import { initTheme, toggleTheme } from './theme.js';
import { injectGetCurrentUser, injectGetUserProfile, getPageBadge, getCurrentPlan, PLANS, setPlan } from './plan.js';
import { getNotificationCount, renderNotificationPanel, syncExternalNotifications } from './notifications.js';
import { showToast } from './toast.js';
import { isAdmin } from './admin-auth.js';
import { navigateTo, injectRouterCallbacks, PAGE_LOADERS, LAST_PAGE_KEY, renderQuickAccess } from './router.js';
import { initGlobalSearch, toggleGlobalSearch } from './global-search.js';
import { restoreState } from './store.js';
import { checkAndShowOnboarding } from './onboarding.js';
import { initSidebarCustomize } from './sidebar-customize.js';
// framework.js: html, on, createPage 유틸 (page-*.js에서 사용)
// 여기서는 직접 사용하지 않으므로 import 불필요


// 에러 모니터링 초기화
initErrorMonitor();

// 테마 초기화
initTheme();

// 의존성 주입
injectGetCurrentUser(getCurrentUser);
injectGetUserProfile(getUserProfileData);

// 인증 초기화 후 로그인 상태에 따라 화면 제어
let isAuthReady = false;

// === 인증 게이트 이벤트 ===
function showAuthGate() {
  const landing = document.getElementById('landing-page');
  const gate = document.getElementById('auth-gate');
  if (landing) landing.style.display = 'none';
  if (gate) { gate.style.display = 'flex'; gate.style.opacity = '1'; }
}

[
  'landing-goto-login',
  'landing-cta-signup',
  'landing-cta-bottom',
  'landing-pricing-free',
  'landing-pricing-pro',
  'landing-pricing-enterprise',
].forEach(id => {
  document.getElementById(id)?.addEventListener('click', showAuthGate);
});

document.getElementById('landing-cta-demo')?.addEventListener('click', () => {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('tab-login')?.addEventListener('click', () => {
  document.getElementById('form-login').style.display = 'block';
  document.getElementById('form-signup').style.display = 'none';
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  tabLogin.classList.add('active');
  tabLogin.classList.remove('active-signup');
  tabSignup.classList.remove('active', 'active-signup');
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('form-signup').style.display = 'block';
  const tabLogin = document.getElementById('tab-login');
  const tabSignup = document.getElementById('tab-signup');
  tabSignup.classList.add('active', 'active-signup');
  tabLogin.classList.remove('active', 'active-signup');
});

document.getElementById('gate-email-login')?.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showToast('이메일과 비밀번호를 입력해 주세요.', 'warning'); return; }
  await loginWithEmail(email, password);
});

['login-email', 'login-password'].forEach(id => {
  document.getElementById(id)?.addEventListener('focusin', () => {
    document.getElementById('login-error-msg')?.remove();
  });
});

document.getElementById('login-password')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-login')?.click();
});

document.getElementById('gate-email-signup')?.addEventListener('click', async () => {
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pw = document.getElementById('signup-password').value;
  const pw2 = document.getElementById('signup-password2').value;
  const agreed = document.getElementById('signup-agree')?.checked;
  if (!name) { showToast('이름을 입력해 주세요.', 'warning'); return; }
  if (!email) { showToast('이메일을 입력해 주세요.', 'warning'); return; }
  if (pw.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다.', 'warning'); return; }
  if (pw !== pw2) { showToast('비밀번호가 일치하지 않습니다.', 'warning'); return; }
  if (!agreed) { showToast('이용약관 및 개인정보처리방침에 동의해 주세요.', 'warning'); return; }
  await signupWithEmail(email, pw, name);
});

document.getElementById('signup-password2')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('gate-email-signup')?.click();
});

document.getElementById('btn-forgot-pw')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showToast('이메일 주소를 먼저 입력해 주세요.', 'warning'); return; }
  await resetPassword(email);
});

document.getElementById('gate-google-login')?.addEventListener('click', async () => {
  const loadingEl = document.getElementById('gate-loading');
  if (loadingEl) loadingEl.style.display = 'block';
  const user = await loginWithGoogle();
  if (!user && loadingEl) loadingEl.style.display = 'none';
});

initAuth((user, profile) => {
  const gate = document.getElementById('auth-gate');
  
  if (user) {
    // DB 프로필의 요금제를 앱 런타임 상태에 동기화
    const profilePlan = profile?.plan;
    if (profilePlan && PLANS[profilePlan]) {
      setPlan(profilePlan);
    }

    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    if (gate) {
      gate.style.opacity = '0';
      setTimeout(() => { gate.style.display = 'none'; }, 300);
    }
    updateUserUI(user, profile);
    setMonitorUser(user.uid, user.email);
    
    const adminBtn = document.querySelector('[data-page="admin"]');
    const posBtn = document.querySelector('[data-page="pos"]');
    if (adminBtn) adminBtn.style.display = isAdmin() ? '' : 'none';
    if (posBtn) posBtn.style.display = isAdmin() ? '' : 'none';
    
    if (!isAuthReady) {
      isAuthReady = true;
      initAppAfterAuth();
    }
  } else {
    updateUserUI(null, null);
    clearMonitorUser();
    const gateIsOpen = gate && gate.style.display === 'flex';
    if (!gateIsOpen) {
      if (gate) gate.style.display = 'none';
      const landing = document.getElementById('landing-page');
      if (landing) landing.style.display = 'block';
    }
    isAuthReady = false;
  }
});
// pageLoaders는 router.js의 PAGE_LOADERS로 이전됨


function initNavigationShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      const visibleButtons = Array.from(document.querySelectorAll('.nav-btn[data-page]'))
        .filter(btn => btn.offsetParent !== null);
      const target = visibleButtons[Number(e.key) - 1];
      if (target?.dataset?.page) {
        e.preventDefault();
        navigateTo(target.dataset.page);
      }
    }
  });
}

function initSmartDetailsToggles() {
  document.addEventListener('click', (event) => {
    const summary = event.target.closest('details.smart-details > summary');
    if (!summary) return;
    const details = summary.parentElement;
    if (!details || !(details instanceof HTMLDetailsElement)) return;
    event.preventDefault();
    details.open = !details.open;
  }, true);
}

/**
 * ?뚮┝ 諭껋? ?낅뜲?댄듃
 * ???섏씠吏 ?꾪솚 ?쒕쭏?? ???낆텧怨??깅줉 ???ш퀬 ?곹깭媛 諛붾????덉쑝誘濡?
 */
function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const count = getNotificationCount();
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-flex';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

window.addEventListener('notifications-updated', () => {
  updateNotifBadge();
  syncExternalNotifications();
});

window.addEventListener('invex:sync-failed', () => {
  showToast('일부 데이터가 클라우드에 저장되지 않았습니다. 잠시 후 재시도합니다.', 'warning');
});

window.addEventListener('invex:idb-failed', () => {
  showToast('로컬 저장에 실패했습니다. 브라우저 저장공간을 확인하세요.', 'warning');
});

window.addEventListener('invex:profile-load-failed', () => {
  showToast('프로필 로드에 실패했습니다. 페이지를 새로고침하세요.', 'error');
});

const CARD_STATE_KEY = 'invex_card_state_v1';
const CARD_PIN_KEY = 'invex_card_pins_v1';
const DETAILS_STATE_KEY = 'invex_details_state_v1';
const SUMMARY_MODE_KEY = 'invex_summary_mode_v1';

function readStorageMap(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorageMap(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function initCardCollapsibles(container, pageName) {
  const collapsiblePages = new Set([
    'inventory', 'inout', 'bulk', 'warehouses', 'transfer', 'stocktake', 'vendors', 'auto-order', 'orders', 'forecast',
    'summary', 'weekly-report', 'profit', 'accounts', 'costing', 'dashboard', 'tax-reports', 'documents',
  ]);
  if (!collapsiblePages.has(pageName)) return;

  const summaryMap = readStorageMap(SUMMARY_MODE_KEY);
  const summaryMode = summaryMap[pageName] === true;
  container.classList.toggle('summary-mode', summaryMode);
  mountSummaryToggle(container, pageName, summaryMode);

  const collapsedMap = readStorageMap(CARD_STATE_KEY);
  const pinnedMap = readStorageMap(CARD_PIN_KEY);
  const pinnedList = Array.isArray(pinnedMap[pageName]) ? pinnedMap[pageName] : [];

  const cards = Array.from(container.querySelectorAll('.card'));
  cards.forEach((card, index) => {
    if (card.classList.contains('fold-card') || card.classList.contains('mission-panel')) return;
    if (card.closest('.stat-grid')) return;
    if (card.querySelector('.card-collapse-toggle')) return;

    const titleEl = card.querySelector('.card-title') || card.querySelector('.chart-control-row .card-title');
    if (!titleEl) return;

    const titleText = normalizeTitle(titleEl.textContent);
    const cardId = `${pageName}::${titleText || 'card'}::${index}`;
    card.dataset.cardId = cardId;

    card.classList.add('card-collapsible');
    const head = document.createElement('div');
    head.className = 'card-collapse-head';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'card-collapse-title';
    titleWrap.appendChild(titleEl);

    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'card-collapse-pin';
    pin.textContent = pinnedList.includes(cardId) ? '고정됨' : '고정';
    pin.addEventListener('click', () => {
      const nextPinned = new Set(pinnedList);
      if (nextPinned.has(cardId)) {
        nextPinned.delete(cardId);
        card.classList.remove('is-pinned');
      } else {
        nextPinned.add(cardId);
        card.classList.add('is-pinned');
      }
      const nextList = Array.from(nextPinned);
      pinnedMap[pageName] = nextList;
      writeStorageMap(CARD_PIN_KEY, pinnedMap);
      pin.textContent = nextPinned.has(cardId) ? '고정됨' : '고정';
      applyPinnedOrder(container, cards, nextList);
    });

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'card-collapse-toggle';
    toggle.textContent = '접기 ▲';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.addEventListener('click', () => {
      const isCollapsed = card.classList.toggle('is-collapsed');
      toggle.textContent = isCollapsed ? '열기 ▼' : '접기 ▲';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
      collapsedMap[cardId] = isCollapsed;
      writeStorageMap(CARD_STATE_KEY, collapsedMap);
    });

    head.appendChild(titleWrap);
    head.appendChild(pin);
    head.appendChild(toggle);

    const body = document.createElement('div');
    body.className = 'card-collapse-body';
    while (card.firstChild) {
      body.appendChild(card.firstChild);
    }

    card.appendChild(head);
    card.appendChild(body);

    if (pinnedList.includes(cardId)) {
      card.classList.add('is-pinned');
    }

    if (typeof collapsedMap[cardId] === 'boolean') {
      const isCollapsed = collapsedMap[cardId];
      card.classList.toggle('is-collapsed', isCollapsed);
      toggle.textContent = isCollapsed ? '열기 ▼' : '접기 ▲';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));
    } else {
      const shouldCollapse = summaryMode || /가이드|안내|설명|도움|팁|FAQ/i.test(titleText) || card.classList.contains('quick-start-card');
      if (shouldCollapse) {
        card.classList.add('is-collapsed');
        toggle.textContent = '열기 ▼';
        toggle.setAttribute('aria-expanded', 'false');
      }
    }
  });

  applyPinnedOrder(container, cards, pinnedList);
  initDetailsPersistence(container, pageName, summaryMode);
  mountFoldResetButton(container, pageName, cards);
  mountPinManagerButton(container, pageName, cards);
}

function applyPinnedOrder(container, cards, pinnedList) {
  if (!pinnedList?.length) return;
  const byParent = new Map();
  cards.forEach(card => {
    if (!card.dataset.cardId || !pinnedList.includes(card.dataset.cardId)) return;
    const parent = card.parentElement;
    if (!parent) return;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(card);
  });
  byParent.forEach((pinnedCards, parent) => {
    pinnedCards
      .sort((a, b) => pinnedList.indexOf(a.dataset.cardId) - pinnedList.indexOf(b.dataset.cardId))
      .forEach(card => parent.insertBefore(card, parent.firstChild));
  });
}

function initDetailsPersistence(container, pageName, summaryMode) {
  const detailsMap = readStorageMap(DETAILS_STATE_KEY);
  const detailsList = Array.from(container.querySelectorAll('details.fold-card, details.smart-details'));
  detailsList.forEach((details, index) => {
    const summary = details.querySelector('summary');
    const summaryText = normalizeTitle(summary?.textContent);
    const detailsId = details.dataset.foldId || summaryText || `details-${index}`;
    const key = `${pageName}::details::${detailsId}`;
    if (typeof detailsMap[key] === 'boolean') {
      details.open = detailsMap[key];
    } else if (summaryMode) {
      details.open = false;
    }
    details.addEventListener('toggle', () => {
      detailsMap[key] = details.open;
      writeStorageMap(DETAILS_STATE_KEY, detailsMap);
    });
  });
}

function mountSummaryToggle() { /* 드롭다운으로 이전 */ }

function mountFoldResetButton() { /* 드롭다운으로 이전 */ }

function mountPinManagerButton(container, pageName, cards) {
  const actionSlot = container.querySelector('.page-header .page-actions');
  if (!actionSlot) return;
  if (actionSlot.querySelector('[data-view-settings]')) return;

  const summaryMap = readStorageMap(SUMMARY_MODE_KEY);
  const isSummary = summaryMap[pageName] === true;

  const wrap = document.createElement('div');
  wrap.className = 'view-settings-wrap';
  wrap.dataset.viewSettings = 'true';

  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'btn btn-outline';
  triggerBtn.textContent = '⚙️ 보기 설정';
  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('is-open');
  });

  const menu = document.createElement('div');
  menu.className = 'view-settings-menu';
  menu.innerHTML = `
    <button class="btn btn-ghost btn-sm" data-action="summary">${isSummary ? '📖 설명 펼치기' : '📋 요약만 보기'}</button>
    <button class="btn btn-ghost btn-sm" data-action="fold-reset">🔄 접기 초기화</button>
    <button class="btn btn-ghost btn-sm" data-action="pin-manager">📌 고정 관리</button>
  `;

  menu.querySelector('[data-action="summary"]').addEventListener('click', () => {
    const map = readStorageMap(SUMMARY_MODE_KEY);
    const nextMode = !container.classList.contains('summary-mode');
    container.classList.toggle('summary-mode', nextMode);
    map[pageName] = nextMode;
    writeStorageMap(SUMMARY_MODE_KEY, map);
    menu.querySelector('[data-action="summary"]').textContent = nextMode ? '📖 설명 펼치기' : '📋 요약만 보기';
    menu.classList.remove('is-open');
  });

  menu.querySelector('[data-action="fold-reset"]').addEventListener('click', () => {
    const collapsedMap = readStorageMap(CARD_STATE_KEY);
    Object.keys(collapsedMap).forEach(key => {
      if (key.startsWith(`${pageName}::`)) delete collapsedMap[key];
    });
    writeStorageMap(CARD_STATE_KEY, collapsedMap);
    const detailsMap = readStorageMap(DETAILS_STATE_KEY);
    Object.keys(detailsMap).forEach(key => {
      if (key.startsWith(`${pageName}::details::`)) delete detailsMap[key];
    });
    writeStorageMap(DETAILS_STATE_KEY, detailsMap);
    const sMap = readStorageMap(SUMMARY_MODE_KEY);
    sMap[pageName] = false;
    writeStorageMap(SUMMARY_MODE_KEY, sMap);
    container.classList.remove('summary-mode');
    cards.forEach(card => {
      if (!card.classList.contains('card-collapsible')) return;
      card.classList.remove('is-collapsed');
      const toggle = card.querySelector('.card-collapse-toggle');
      if (toggle) { toggle.textContent = '접기 ▲'; toggle.setAttribute('aria-expanded', 'true'); }
    });
    container.querySelectorAll('details.fold-card, details.smart-details').forEach(d => { d.open = true; });
    menu.querySelector('[data-action="summary"]').textContent = '📋 요약만 보기';
    menu.classList.remove('is-open');
  });

  menu.querySelector('[data-action="pin-manager"]').addEventListener('click', () => {
    menu.classList.remove('is-open');
    openPinManagerModal(container, pageName, cards);
  });

  wrap.appendChild(triggerBtn);
  wrap.appendChild(menu);
  actionSlot.prepend(wrap);
  document.addEventListener('click', () => { menu.classList.remove('is-open'); });
}

function openPinManagerModal(container, pageName, cards) {
  const existing = document.getElementById('pin-manager-modal');
  if (existing) {
    existing.remove();
  }

  const pinnedMap = readStorageMap(CARD_PIN_KEY);
  const pinnedList = Array.isArray(pinnedMap[pageName]) ? pinnedMap[pageName] : [];

  const overlay = document.createElement('div');
  overlay.id = 'pin-manager-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h3 class="modal-title">고정 카드 관리</h3>
        <button class="modal-close" data-pin-close>✕</button>
      </div>
      <div class="modal-body" id="pin-manager-body"></div>
    </div>
  `;

  const body = overlay.querySelector('#pin-manager-body');
  if (!pinnedList.length) {
    body.innerHTML = `
      <div class="empty-state" style="padding:24px;">
        <div class="icon">📌</div>
        <div class="msg">고정된 카드가 없습니다.</div>
      </div>
    `;
  } else {
    body.innerHTML = `
      <div style="display:grid; gap:8px;">
        ${pinnedList.map(id => {
          const card = cards.find(c => c.dataset.cardId === id);
          const title = normalizeTitle(card?.querySelector('.card-title')?.textContent) || '카드';
          return `
            <div class="pin-manager-item">
              <div class="pin-manager-title">${title}</div>
              <button class="btn btn-outline btn-sm" data-unpin="${id}">고정 해제</button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  overlay.querySelector('[data-pin-close]')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.remove();
  });

  body.querySelectorAll('[data-unpin]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.unpin;
      const nextPinned = pinnedList.filter(item => item !== id);
      pinnedMap[pageName] = nextPinned;
      writeStorageMap(CARD_PIN_KEY, pinnedMap);
      const card = cards.find(c => c.dataset.cardId === id);
      if (card) card.classList.remove('is-pinned');
      applyPinnedOrder(container, cards, nextPinned);
      openPinManagerModal(container, pageName, cards);
    });
  });

  document.body.appendChild(overlay);
}

// ?ъ씠?쒕컮 硫붾돱???붽툑??諛곗? ?곸슜 + ?대깽???곌껐
function updateSidebarBadges() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const pageId = btn.dataset.page;
    if (!pageId) return;

    // 뱃지만 업데이트 (클릭은 하단 이벤트 위임이 처리)
    // btn.addEventListener 제거 — 중복 방지

    // 湲곗〈 諛곗? ?쒓굅
    btn.querySelectorAll('.plan-badge').forEach(b => b.remove());

    const badge = getPageBadge(pageId);
    if (badge) {
      btn.style.opacity = '0.55';
      const badgeEl = document.createElement('span');
      badgeEl.className = 'plan-badge badge';
      badgeEl.textContent = badge.text;
      badgeEl.style.background = `linear-gradient(135deg,${badge.color},${badge.color}cc)`;
      btn.appendChild(badgeEl);
    } else {
      btn.style.opacity = '1';
    }
  });
}
updateSidebarBadges();
renderQuickAccess();

// ?ъ씠?쒕컮 ?섎떒 ?붽툑???쒖떆 ?낅뜲?댄듃
function updatePlanDisplay() {
  const planId = getCurrentPlan();
  const plan = PLANS[planId];
  const el = document.getElementById('plan-name');
  if (el && plan) {
    el.textContent = `${plan.icon} ${plan.name}`;
    el.style.color = plan.color;
  }
}
updatePlanDisplay();

// ?붽툑???대┃ ??蹂寃??앹뾽
document.getElementById('plan-display')?.addEventListener('click', () => {
  const current = getCurrentPlan();
  const existing = document.getElementById('plan-picker-modal');
  if (existing) { existing.remove(); return; }

  const modal = document.createElement('div');
  modal.id = 'plan-picker-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-header">
        <h3>📦 요금제 선택</h3>
        <button class="btn btn-ghost btn-sm" id="plan-pick-close">닫기</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
          ${Object.values(PLANS).map(p => `
            <div class="plan-pick-card" data-plan="${p.id}" style="
              border:2px solid ${current === p.id ? p.color : 'var(--border)'};
              border-radius:12px; padding:20px; text-align:center; cursor:pointer;
              background:${current === p.id ? p.color + '15' : 'var(--bg-secondary)'};
              transition:all 0.2s;
            ">
              <div style="font-size:28px;">${p.icon}</div>
              <div style="font-size:16px; font-weight:700; margin:4px 0;">${p.name}</div>
              <div style="font-size:20px; font-weight:800; color:${p.color};">${p.price}</div>
              <div style="font-size:11px; color:var(--text-muted);">${p.period}</div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${p.description}</div>
              ${current === p.id ? '<div style="margin-top:8px; font-size:11px; color:var(--success); font-weight:600;">???꾩옱 ?붽툑??/div>' : ''}
            </div>
          `).join('')}
        </div>
        <div style="margin-top:12px; font-size:11px; color:var(--text-muted); text-align:center;">
          * 臾대즺 泥댄뿕: 紐⑤뱺 湲곕뒫??利됱떆 ?쒖꽦?뷀빀?덈떎
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#plan-pick-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelectorAll('.plan-pick-card').forEach(card => {
    card.addEventListener('click', () => {
      const planId = card.dataset.plan;
      setPlan(planId);
      modal.remove();
      showToast(`${PLANS[planId].icon} ${PLANS[planId].name} 요금제로 변경되었습니다.`, 'success');
      // ?ъ씠?쒕컮 諛곗? + ?쒖떆 媛깆떊
      updateSidebarBadges();
      updatePlanDisplay();
    });
  });
});

// ?뚮┝ 踰꾪듉 ?대깽??
document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
  e.stopPropagation();
  renderNotificationPanel();
});

// 湲濡쒕쾶 寃??珥덇린??& 踰꾪듉
initGlobalSearch(navigateTo);
document.getElementById('btn-global-search')?.addEventListener('click', () => {
  toggleGlobalSearch();
});

// ?ㅽ겕紐⑤뱶 ?좉? 踰꾪듉
document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
  toggleTheme();
  const isDark = document.documentElement.classList.contains('dark-mode');
  const btn = document.getElementById('btn-theme-toggle');
  if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  btn?.setAttribute('title', isDark ? '라이트 모드' : '다크 모드');
});

// === 紐⑤컮???좉? ===

const sidebar = document.getElementById('sidebar');
const toggleBtn = document.getElementById('mobile-toggle');
const overlay = document.getElementById('sidebar-overlay');

function openSidebar() {
  sidebar?.classList.add('open');
  overlay?.classList.add('active');
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  overlay?.classList.remove('active');
}

toggleBtn?.addEventListener('click', () => {
  if (sidebar?.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

overlay?.addEventListener('click', closeSidebar);

// 사이드바 nav 클릭 — #sidebar 범위에서만 이벤트 위임
sidebar?.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn[data-page]');
  if (!btn || !sidebar.contains(btn)) return;
  navigateTo(btn.dataset.page);
});

// 라우터에 콜백 주입 (사이드바 닫기 / 카드 접기 / 알림 배지)
injectRouterCallbacks({
  initCardCollapsibles,
  closeSidebar,
  updateNotifBadge,
});

// === ?곗씠??諛깆뾽 / 蹂듭썝 ===

/**
 * ??JSON 諛깆뾽? ??IndexedDB??釉뚮씪?곗?蹂꾨줈 寃⑸━?섏뼱 ?덉뼱??
 * ?ㅻⅨ 湲곌린濡??곗씠?곕? ?대룞?섍굅?? 留뚯빟????젣???鍮꾪븯湲??꾪빐
 */

// 諛깆뾽/蹂듭썝? ?꾩슜 ?섏씠吏(page-backup.js)濡??대룞??

// ??珥덇린??(濡쒓렇???꾨즺 ???몄텧)
// ??遺꾨━? ???몄쬆 ?뺤씤 ?꾩뿉 IndexedDB 蹂듭썝?섎㈃ 鍮??곗씠?곌? 濡쒕뱶?????덉쓬
async function initAppAfterAuth() {
  // Supabase health check는 백그라운드로 실행해 초기 화면 진입을 막지 않음
  if (isSupabaseConfigured) {
    Promise.race([
      supabase.auth.getSession(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('health check timeout')), 3000)),
    ])
      .then(({ data, error }) => {
        if (error) throw error;
        if (!data?.session?.user) return;
      })
      .catch((e) => {
        const message = String(e?.message || '').toLowerCase();
        if (message.includes('no active session') || message.includes('session missing')) return;
        console.warn('[Health] Supabase 연결 불안정:', e.message);
        showToast('서버 연결이 불안정합니다. 일부 기능이 제한될 수 있습니다.', 'warning');
      });
  }

  await restoreState();
  // restoreState가 로컬 캐시의 예전 currentPlan을 복원할 수 있으므로,
  // 인증 프로필(plan)을 다시 우선 동기화한다.
  const profilePlan = getUserProfileData()?.plan;
  if (profilePlan && PLANS[profilePlan]) {
    setPlan(profilePlan);
  }
  const lastPage = localStorage.getItem(LAST_PAGE_KEY);
  const startPage = (lastPage && PAGE_LOADERS[lastPage]) ? lastPage : 'home';
  updateSidebarBadges();
  renderQuickAccess();
  updatePlanDisplay();
  initSidebarCustomize();
  await navigateTo(startPage);
  // 泥?濡쒓렇???ъ슜?먯뿉寃??⑤낫??留덈쾿???쒖떆
  checkAndShowOnboarding(navigateTo);
}

// Supabase 미설정(로컬 개발) 시에는 게이트 자동 제거
import { isSupabaseConfigured, supabase } from './supabase-client.js';
if (!isSupabaseConfigured) {
  const gate = document.getElementById('auth-gate');
  if (gate) gate.style.display = 'none';
  initAppAfterAuth();
}

initNavigationShortcuts();
initSmartDetailsToggles();

// ?ъ슜??UI ?낅뜲?댄듃 (濡쒓렇??濡쒓렇?꾩썐 ???몄텧)
function updateUserUI(user, profile) {
  const userArea = document.getElementById('user-info-area');
  if (!userArea) return;

  if (user) {
    const name = profile?.name || user.displayName || '사용자';
    const photo = user.photoURL;
    const plan = (profile?.plan || 'free').toUpperCase();
    userArea.innerHTML = `
      <div class="sidebar-user">
        ${photo ? `<img src="${photo}" class="sidebar-user-avatar" />` : ''}
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${name}</div>
          <div class="sidebar-user-plan">${plan}</div>
        </div>
        <button class="btn-icon" id="btn-logout" title="로그아웃" style="font-size:11px; color:rgba(255,255,255,0.5);">로그아웃</button>
      </div>
    `;
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-logout');
      if (btn) btn.disabled = true;
      try {
        await logout();
      } finally {
        if (btn) btn.disabled = false;
      }
    });
    // 상단 헤더 사용자 영역 업데이트
    const topUser = document.getElementById('top-header-user');
    if (topUser) {
      topUser.innerHTML = `
        <div class="top-user-compact">
          ${photo ? `<img src="${photo}" class="top-user-avatar" />` : `<span class="top-user-avatar-placeholder">${name[0]}</span>`}
          <span class="top-user-name">${name}</span>
        </div>
      `;
    }
  } else {
    userArea.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btn-login" style="color:rgba(255,255,255,0.7); font-size:12px; width:100%;">
        Google 로그인
      </button>
    `;
    document.getElementById('btn-login')?.addEventListener('click', () => { loginWithGoogle(); });
    const topUser2 = document.getElementById('top-header-user');
    if (topUser2) topUser2.innerHTML = '';
  }
}

// PWA Service Worker: 로그인 안정화를 위해 기존 SW/캐시 정리
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then((regs) => Promise.all(regs.map((reg) => reg.unregister())))
      .catch(() => {});

    if ('caches' in window) {
      caches.keys()
        .then((keys) => Promise.all(
          keys
            .filter((key) => key.includes('invex'))
            .map((key) => caches.delete(key))
        ))
        .catch(() => {});
    }
  });
}


