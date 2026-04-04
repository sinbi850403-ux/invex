/**
 * notifications.js - 알림 센터
 * 역할: 재고 부족, 유통기한 임박 등 중요 알림을 한곳에서 관리
 * 왜 필요? → 사용자가 매번 각 페이지를 확인하지 않아도 위험 상황을 즉시 파악 가능
 */

import { getState } from './store.js';

/**
 * 알림 목록 생성
 * 여러 소스에서 알림을 수집하여 하나의 목록으로 반환
 */
export function getNotifications() {
  const state = getState();
  const items = state.mappedData || [];
  const safetyStock = state.safetyStock || {};
  const notifications = [];
  const today = new Date();

  // 1. 안전재고 부족 알림
  items.forEach(item => {
    const min = safetyStock[item.itemName];
    if (min === undefined) return;
    const qty = parseFloat(item.quantity) || 0;
    if (qty <= 0) {
      notifications.push({
        type: 'danger',
        icon: '🚨',
        title: `재고 없음: ${item.itemName}`,
        desc: `현재 재고 0, 안전재고 ${min}`,
        category: 'stock',
      });
    } else if (qty <= min) {
      notifications.push({
        type: 'warning',
        icon: '⚠️',
        title: `재고 부족: ${item.itemName}`,
        desc: `현재 ${qty} / 안전재고 ${min}`,
        category: 'stock',
      });
    }
  });

  // 2. 유통기한 임박 알림
  items.forEach(item => {
    if (!item.expiryDate) return;
    const expiry = new Date(item.expiryDate);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
      notifications.push({
        type: 'danger',
        icon: '🔴',
        title: `유통기한 만료: ${item.itemName}`,
        desc: `${item.expiryDate} (만료됨)`,
        category: 'expiry',
      });
    } else if (daysLeft <= 7) {
      notifications.push({
        type: 'danger',
        icon: '🟠',
        title: `유통기한 임박: ${item.itemName}`,
        desc: `${item.expiryDate} (D-${daysLeft})`,
        category: 'expiry',
      });
    } else if (daysLeft <= 30) {
      notifications.push({
        type: 'warning',
        icon: '🟡',
        title: `유통기한 주의: ${item.itemName}`,
        desc: `${item.expiryDate} (D-${daysLeft})`,
        category: 'expiry',
      });
    }
  });

  // 3. 비활성 재고 알림 (수량이 있지만 가치가 0인 품목)
  const noValueItems = items.filter(item => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.unitPrice) || 0;
    return qty > 0 && price === 0;
  });
  if (noValueItems.length > 0) {
    notifications.push({
      type: 'info',
      icon: 'ℹ️',
      title: `단가 미설정 품목 ${noValueItems.length}건`,
      desc: '단가를 설정하면 정확한 재고 가치를 파악할 수 있습니다.',
      category: 'info',
    });
  }

  return notifications;
}

/**
 * 알림 카운트 반환 (사이드바 뱃지 표시용)
 */
export function getNotificationCount() {
  return getNotifications().filter(n => n.type === 'danger' || n.type === 'warning').length;
}

/**
 * 알림 패널 렌더링
 * 왜 별도 페이지가 아닌 패널? → 어떤 페이지에서든 빠르게 확인할 수 있어야 하므로
 */
export function renderNotificationPanel() {
  const notifications = getNotifications();

  // 기존 패널 제거
  const existing = document.getElementById('notification-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'notification-panel';
  panel.className = 'notification-panel';

  panel.innerHTML = `
    <div class="notif-header">
      <strong>🔔 알림 센터</strong>
      <span class="badge ${notifications.length > 0 ? 'badge-danger' : 'badge-default'}" style="margin-left:8px;">${notifications.length}</span>
      <button class="notif-close" id="notif-close">✕</button>
    </div>
    <div class="notif-body">
      ${notifications.length === 0
        ? '<div style="text-align:center; padding:32px; color:var(--text-muted); font-size:13px;">✅ 알림이 없습니다</div>'
        : notifications.map(n => `
          <div class="notif-item notif-${n.type}">
            <span class="notif-icon">${n.icon}</span>
            <div class="notif-content">
              <div class="notif-title">${n.title}</div>
              <div class="notif-desc">${n.desc}</div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;

  document.body.appendChild(panel);

  // 닫기 이벤트
  panel.querySelector('#notif-close').addEventListener('click', () => panel.remove());

  // 패널 외부 클릭 시 닫기
  setTimeout(() => {
    const handler = (e) => {
      if (!panel.contains(e.target) && !e.target.closest('#btn-notifications')) {
        panel.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 100);
}
