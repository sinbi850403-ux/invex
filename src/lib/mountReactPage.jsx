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
import '../react/styles.css'; // React 페이지 전용 CSS (vanilla app에 마운트 시 필요)

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
 * reactLoader - 완전히 React로 재작성된 페이지 등록용 래퍼.
 * default export가 React 컴포넌트인 모듈을 pageLoaders에 등록.
 *
 * 사용 예:
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

/**
 * vanillaLoader - Vanilla renderXxxPage 함수를 VanillaBridge로 감싸 React 아래 등록.
 *
 * Vanilla 페이지를 그대로 유지하면서 React 컨텍스트(Auth, Store)를 주입.
 * 점진적 마이그레이션 중간 단계 — 나중에 reactLoader로 교체 가능.
 *
 * 사용 예:
 *   summary: vanillaLoader(() => import('./page-summary.js'), 'renderSummaryPage'),
 *
 * @param {() => Promise<object>} pageImportFn - page-xxx.js 동적 import
 * @param {string} renderFnName - 모듈에서 가져올 함수 이름
 */
export function vanillaLoader(pageImportFn, renderFnName) {
  return async () => {
    const [pageMod, { VanillaBridge }] = await Promise.all([
      pageImportFn(),
      import('../react/components/VanillaBridge.jsx'),
    ]);
    const renderFn = pageMod[renderFnName];
    const Wrapped = ({ navigateTo: navFn }) =>
      React.createElement(VanillaBridge, { renderFn, navigateTo: navFn });
    return (container, navFn) => mountReactPage(container, Wrapped, navFn);
  };
}
