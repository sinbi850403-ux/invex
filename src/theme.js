/**
 * theme.js - 다크 모드 / 라이트 모드 전환
 * 역할: 사용자 선호에 따른 테마 전환, 시스템 설정 자동 감지
 * 왜 필요? → 창고/야간 근무자에게 다크모드는 눈 보호 필수 기능
 */

const THEME_KEY = 'erp-lite-theme';

/**
 * 테마 초기화 - 앱 시작 시 호출
 */
export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);

  if (saved === 'dark') {
    setDarkMode(true);
  } else if (saved === 'light') {
    setDarkMode(false);
  } else {
    // 시스템 설정 감지
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(prefersDark);
  }

  // 시스템 설정 변경 시 자동 반영
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      setDarkMode(e.matches);
    }
  });
}

/**
 * 테마 토글
 */
export function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark-mode');
  setDarkMode(!isDark);
  localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
}

/**
 * 현재 테마 확인
 */
export function isDarkMode() {
  return document.documentElement.classList.contains('dark-mode');
}

function setDarkMode(dark) {
  if (dark) {
    document.documentElement.classList.add('dark-mode');
  } else {
    document.documentElement.classList.remove('dark-mode');
  }
}
