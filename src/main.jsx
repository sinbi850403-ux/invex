import './style.css';
import './auth.css';
import './landing.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { initErrorMonitor } from './error-monitor.js';
import { initTheme } from './theme.js';

// 에러 모니터링 초기화
initErrorMonitor();

// 테마 초기화
initTheme();

// 폰트 스케일 초기 적용
const scale = parseInt(localStorage.getItem('invex_font_scale') || '0', 10);
document.documentElement.classList.remove('font-scale-1', 'font-scale-2');
if (scale === 1) document.documentElement.classList.add('font-scale-1');
else if (scale === 2) document.documentElement.classList.add('font-scale-2');

// PWA Service Worker: 기존 SW/캐시 정리
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(reg => reg.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.includes('invex')).map(k => caches.delete(k))))
        .catch(() => {});
    }
  });
}

const root = createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
