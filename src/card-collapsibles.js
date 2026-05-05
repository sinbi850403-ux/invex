// src/card-collapsibles.js
// 카드 접기/펼치기 + 고정 기능

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
    'inventory', 'in', 'bulk', 'warehouses', 'transfer', 'stocktake', 'vendors', 'orders', 'forecast',
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
  triggerBtn.textContent = ' 보기 설정';
  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('is-open');
  });

  const menu = document.createElement('div');
  menu.className = 'view-settings-menu';
  menu.innerHTML = `
    <button class="btn btn-ghost btn-sm" data-action="summary">${isSummary ? ' 설명 펼치기' : ' 요약만 보기'}</button>
    <button class="btn btn-ghost btn-sm" data-action="fold-reset"> 접기 초기화</button>
    <button class="btn btn-ghost btn-sm" data-action="pin-manager"> 고정 관리</button>
  `;

  menu.querySelector('[data-action="summary"]').addEventListener('click', () => {
    const map = readStorageMap(SUMMARY_MODE_KEY);
    const nextMode = !container.classList.contains('summary-mode');
    container.classList.toggle('summary-mode', nextMode);
    map[pageName] = nextMode;
    writeStorageMap(SUMMARY_MODE_KEY, map);
    menu.querySelector('[data-action="summary"]').textContent = nextMode ? ' 설명 펼치기' : ' 요약만 보기';
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
    menu.querySelector('[data-action="summary"]').textContent = ' 요약만 보기';
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
        <button class="modal-close" data-pin-close></button>
      </div>
      <div class="modal-body" id="pin-manager-body"></div>
    </div>
  `;

  const body = overlay.querySelector('#pin-manager-body');
  if (!pinnedList.length) {
    body.innerHTML = `
      <div class="empty-state" style="padding:24px;">
        <div class="icon"></div>
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

export { initCardCollapsibles, readStorageMap, writeStorageMap };
