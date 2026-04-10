/**
 * toast.js - common toast helper
 */

function ensureContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Shows a toast message.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'error'} type
 * @param {number|{actionLabel?: string, onAction?: Function}} duration
 * @param {{actionLabel?: string, onAction?: Function}} options
 */
export function showToast(message, type = 'info', duration = 2500, options = {}) {
  if (typeof duration === 'object' && duration !== null) {
    options = duration;
    duration = 2500;
  }

  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;
  toast.appendChild(messageEl);

  let dismissed = false;
  let actionInvoked = false;
  let timer = null;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  };

  if (options?.actionLabel && typeof options?.onAction === 'function') {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action';
    actionBtn.textContent = options.actionLabel;
    actionBtn.addEventListener('click', () => {
      if (actionInvoked) return;
      actionInvoked = true;
      clearTimeout(timer);
      options.onAction();
      dismiss();
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);
  timer = setTimeout(dismiss, duration);
}
