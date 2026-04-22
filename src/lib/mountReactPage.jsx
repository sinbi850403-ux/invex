/**
 * mountReactPage.jsx - Vanilla JS ↔ React 브리지
 *
 * main.js의 pageLoaders가 React 컴포넌트를 렌더링할 수 있게 해주는 유틸.
 * React 18 createRoot API 사용.
 *
 * 사용 패턴 (main.js pageLoaders에 추가):
 *   guide: reactLoader(() => import('./react/pages/GuidePage.jsx')),
 *
 * 설계 원칙:
 *   - Vanilla 라우터(navigateTo)가 여전히 마스터 라우터
 *   - React 컴포넌트는 navigateTo를 prop으로 받아 페이지 이동
 *   - AppProviders(AuthProvider + StoreProvider)가 자동 감쌈
 *   - 페이지 이탈 시 React 트리를 정상 언마운트 → 메모리 누수 방지
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '../react/app/AppProviders';

// 현재 마운트된 React 루트 (페이지 간 단일 인스턴스 유지)
let _root = null;
let _container = null;

/**
 * React 컴포넌트를 DOM 컨테이너에 마운트.
 * 같은 컨테이너면 update, 다른 컨테이너면 이전 루트 언마운트 후 새로 마운트.
 *
 * @param {HTMLElement} container - 렌더링 대상 (#main-content)
 * @param {React.ComponentType} Component - 렌더링할 React 페이지 컴포넌트
 * @param {Function} navigateTo - main.js의 navigateTo (prop으로 전달)
 */
export function mountReactPage(container, Component, navigateTo) {
  const element = (
    <AppProviders>
      <Component navigateTo={navigateTo} />
    </AppProviders>
  );

  if (_root && _container === container) {
    _root.render(element);
  } else {
    unmountCurrentReactPage();
    _root = createRoot(container);
    _root.render(element);
    _container = container;
  }
}

/**
 * 현재 마운트된 React 페이지를 정리.
 * navigateTo에서 skeleton 표시 전에 반드시 호출 → 메모리 누수 방지.
 */
export function unmountCurrentReactPage() {
  if (_root) {
    _root.unmount();
    _root = null;
    _container = null;
  }
}

/**
 * pageLoaders 등록용 React 래퍼.
 * Vanilla renderXxxPage와 동일한 (container, navigateTo) => void 시그니처를 반환.
 *
 * 사용 예:
 *   // main.js pageLoaders에서 페이지 변환 시:
 *   inventory: reactLoader(() => import('./react/pages/InventoryPage')),
 *
 * @param {() => Promise<{default: React.ComponentType}>} importFn
 */
export function reactLoader(importFn) {
  return async () => {
    const { default: Component } = await importFn();
    return (container, navFn) => mountReactPage(container, Component, navFn);
  };
}
