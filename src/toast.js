/**
 * toast.js - 화면 하단 알림 메시지
 * 왜 별도 파일? → 여러 페이지에서 공통으로 사용하는 UI 기능이라서
 */

// 토스트 컨테이너가 없으면 생성
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
 * 토스트 메시지 표시
 * @param {string} message - 표시할 메시지
 * @param {'info'|'success'|'warning'|'error'} type - 메시지 종류
 * @param {number} duration - 표시 시간(ms), 기본 2500
 */
export function showToast(message, type = 'info', duration = 2500) {
  const container = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // 일정 시간 후 자동 제거
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}
