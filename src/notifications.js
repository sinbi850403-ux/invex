/**
 * notifications.js - 알림 센터
 * 읽지 않은 알림을 추적하고, 패널/뱃지/대시보드 카운트를 동일 기준으로 유지합니다.
 */

import { getState, setState } from './store.js';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hashText(text) {
  let hash = 5381;
  const input = String(text || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function buildNotificationId(category, title, desc) {
  return `n_${hashText(`${category}|${title}|${desc}`)}`;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emitUpdated() {
  window.dispatchEvent(new CustomEvent('notifications-updated'));
}

function pushNotification(list, payload) {
  const id = buildNotificationId(payload.category, payload.title, payload.desc);
  list.push({ id, ...payload });
}

/**
 * 알림 목록 생성
 * @param {{ includeRead?: boolean }} options
 */
export function getNotifications(options = {}) {
  const { includeRead = false } = options;
  const state = getState();
  const items = state.mappedData || [];
  const safetyStock = state.safetyStock || {};
  const readMap = state.notificationReadMap || {};
  const notifications = [];
  const today = new Date();

  items.forEach((item) => {
    const min = safetyStock[item.itemName];
    if (min === undefined) return;

    const qty = toNumber(item.quantity);
    if (qty <= 0) {
      pushNotification(notifications, {
        type: 'danger',
        icon: '',
        title: `재고 없음: ${item.itemName}`,
        desc: `현재 재고 0 / 안전재고 ${min}`,
        category: 'stock',
      });
      return;
    }

    if (qty <= toNumber(min)) {
      pushNotification(notifications, {
        type: 'warning',
        icon: '',
        title: `재고 부족: ${item.itemName}`,
        desc: `현재 ${qty} / 안전재고 ${min}`,
        category: 'stock',
      });
    }
  });

  items.forEach((item) => {
    if (!item.expiryDate) return;
    const expiry = new Date(item.expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      pushNotification(notifications, {
        type: 'danger',
        icon: '',
        title: `유통기한 만료: ${item.itemName}`,
        desc: `${item.expiryDate} (만료됨)`,
        category: 'expiry',
      });
      return;
    }

    if (daysLeft <= 7) {
      pushNotification(notifications, {
        type: 'danger',
        icon: '',
        title: `유통기한 임박: ${item.itemName}`,
        desc: `${item.expiryDate} (D-${daysLeft})`,
        category: 'expiry',
      });
      return;
    }

    if (daysLeft <= 30) {
      pushNotification(notifications, {
        type: 'warning',
        icon: '',
        title: `유통기한 주의: ${item.itemName}`,
        desc: `${item.expiryDate} (D-${daysLeft})`,
        category: 'expiry',
      });
    }
  });

  const noValueItems = items.filter((item) => {
    const qty = toNumber(item.quantity);
    const price = toNumber(item.unitPrice);
    return qty > 0 && price === 0;
  });
  if (noValueItems.length > 0) {
    pushNotification(notifications, {
      type: 'info',
      icon: '',
      title: `단가 미설정 품목 ${noValueItems.length}건`,
      desc: '단가를 설정하면 정확한 재고 가치를 파악할 수 있습니다.',
      category: 'info',
    });
  }

  // ── 이상 탐지: 마진율 이상 ─────────────────────────────────────
  const lowMarginItems = items.filter((item) => {
    const cost = toNumber(item.unitCost || item.unitPrice || 0);
    const sale = toNumber(item.salePrice || 0);
    if (cost <= 0 || sale <= 0) return false;
    const margin = (sale - cost) / sale * 100;
    return margin < 10; // 마진율 10% 미만
  });
  if (lowMarginItems.length > 0) {
    pushNotification(notifications, {
      type: 'warning',
      icon: '',
      title: `마진율 이상 품목 ${lowMarginItems.length}건`,
      desc: `마진율 10% 미만: ${lowMarginItems.slice(0, 2).map(i => i.itemName).join(', ')}${lowMarginItems.length > 2 ? ' 외' : ''}`,
      category: 'anomaly',
    });
  }

  // ── 이상 탐지: 재고 급감 (7일 이내 출고량 > 현재고 50%) ──────────
  const transactions = state.transactions || [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentOut = {};
  transactions.forEach((tx) => {
    if (tx.type !== 'out') return;
    if (!tx.date || new Date(tx.date) < sevenDaysAgo) return;
    const name = tx.itemName || '';
    if (!name) return;
    recentOut[name] = (recentOut[name] || 0) + toNumber(tx.quantity);
  });
  const rapidDropItems = items.filter((item) => {
    const outQty = recentOut[item.itemName] || 0;
    const curQty = toNumber(item.quantity);
    if (outQty <= 0 || curQty <= 0) return false;
    return outQty >= curQty * 0.5; // 7일 출고량이 현재고의 50% 이상
  });
  if (rapidDropItems.length > 0) {
    pushNotification(notifications, {
      type: 'warning',
      icon: '',
      title: `재고 급감 품목 ${rapidDropItems.length}건`,
      desc: `최근 7일 출고량이 현재고의 50% 이상: ${rapidDropItems.slice(0, 2).map(i => i.itemName).join(', ')}${rapidDropItems.length > 2 ? ' 외' : ''}`,
      category: 'anomaly',
    });
  }

  if (includeRead) return notifications;
  return notifications.filter((notification) => !readMap[notification.id]);
}

export function getNotificationCount() {
  return getNotifications().length;
}

export function acknowledgeNotification(notificationId) {
  if (!notificationId) return;
  const state = getState();
  const nextReadMap = {
    ...(state.notificationReadMap || {}),
    [notificationId]: Date.now(),
  };
  setState({ notificationReadMap: nextReadMap });
  emitUpdated();
}

export function acknowledgeAllNotifications() {
  const unread = getNotifications();
  if (!unread.length) return;

  const state = getState();
  const nextReadMap = { ...(state.notificationReadMap || {}) };
  unread.forEach((notification) => {
    nextReadMap[notification.id] = Date.now();
  });
  setState({ notificationReadMap: nextReadMap });
  emitUpdated();
}

function getNotificationEventId(notification) {
  if (notification.category === 'stock') return 'stock.low';
  if (notification.category === 'expiry') return 'stock.low';
  return null;
}

async function sendWebhook(url, payload) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (_) {}
}

export async function syncExternalNotifications() {
  const state = getState();
  const prefs = state.notificationChannelPrefs || {};
  if (!prefs.webhook) return;

  const webhooks = (state.webhooks || []).filter(w => w.url && w.active !== false);
  if (!webhooks.length) return;

  const delivered = { ...(state.notificationDeliveryLog || {}) };
  const notifications = getNotifications({ includeRead: true });
  const tasks = [];

  notifications.forEach(notification => {
    const eventId = getNotificationEventId(notification);
    if (!eventId) return;
    const deliveryKey = `${eventId}::${notification.id}`;
    if (delivered[deliveryKey]) return;

    const payload = {
      event: eventId,
      id: notification.id,
      title: notification.title,
      desc: notification.desc,
      type: notification.type,
      category: notification.category,
      createdAt: new Date().toISOString(),
    };

    webhooks.forEach(wh => {
      if (Array.isArray(wh.events) && wh.events.length > 0 && !wh.events.includes(eventId)) return;
      tasks.push(sendWebhook(wh.url, payload));
    });

    delivered[deliveryKey] = Date.now();
  });

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
    setState({ notificationDeliveryLog: delivered });
  }
}

function renderPanelContent(panel) {
  const notifications = getNotifications();

  panel.innerHTML = `
    <div class="notif-header">
      <strong> 알림 센터</strong>
      <span class="badge ${notifications.length > 0 ? 'badge-danger' : 'badge-default'}" style="margin-left:8px;">${notifications.length}</span>
      <div class="notif-actions">
        ${notifications.length > 0 ? '<button class="notif-action-btn" id="notif-mark-all">전체 확인</button>' : ''}
        <button class="notif-close" id="notif-close"></button>
      </div>
    </div>
    <div class="notif-body">
      ${notifications.length === 0
        ? '<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px;"> 알림이 없습니다</div>'
        : notifications.map((notification) => `
          <div class="notif-item notif-${notification.type}">
            <span class="notif-icon">${notification.icon}</span>
            <div class="notif-content">
              <div class="notif-title">${escapeHtml(notification.title)}</div>
              <div class="notif-desc">${escapeHtml(notification.desc)}</div>
            </div>
            <button class="notif-check-btn" data-notif-id="${notification.id}">확인</button>
          </div>
        `).join('')
      }
    </div>
  `;

  panel.querySelector('#notif-close')?.addEventListener('click', () => panel.remove());
  panel.querySelector('#notif-mark-all')?.addEventListener('click', () => {
    acknowledgeAllNotifications();
    renderPanelContent(panel);
  });

  panel.querySelectorAll('[data-notif-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      acknowledgeNotification(button.dataset.notifId);
      renderPanelContent(panel);
    });
  });
}

/**
 * 알림 패널 렌더링
 */
export function renderNotificationPanel() {
  const existing = document.getElementById('notification-panel');
  if (existing) {
    existing.remove();
    return;
  }

  const panel = document.createElement('div');
  panel.id = 'notification-panel';
  panel.className = 'notification-panel';
  renderPanelContent(panel);
  document.body.appendChild(panel);

  setTimeout(() => {
    const handler = (event) => {
      if (
        !panel.contains(event.target) &&
        !event.target.closest('#btn-notifications') &&
        !event.target.closest('.dashboard-notif-trigger')
      ) {
        panel.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 100);
}
