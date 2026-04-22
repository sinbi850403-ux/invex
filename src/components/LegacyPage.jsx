/**
 * LegacyPage.jsx - Vanilla JS 페이지를 React 컴포넌트로 래핑
 *
 * React Router가 앱 전체 쉘을 담당하는 Phase 1+에서 사용됩니다.
 * 아직 React로 변환되지 않은 페이지들을 React 라우트 안에서 렌더링할 수 있게 합니다.
 *
 * 동작 방식:
 *   1. loader()로 Vanilla page-*.js 모듈을 동적 import
 *   2. 모듈의 첫 번째 함수(renderXxxPage)를 컨테이너 div에 호출
 *   3. 언마운트 시 container.innerHTML 초기화
 *
 * 사용 예 (Phase 1+ 라우트 정의):
 *   <Route
 *     path="/inventory"
 *     element={<LegacyPage loader={() => import('../page-inventory.js')} />}
 *   />
 *
 * 페이지가 React로 변환되면 이 컴포넌트 대신 직접 React 컴포넌트를 사용합니다.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export function LegacyPage({ loader }) {
  const containerRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    loader().then((mod) => {
      if (cancelled) return;
      // renderXxxPage(container, navigateTo) 시그니처를 찾아 호출
      const renderFn = Object.values(mod).find((v) => typeof v === 'function');
      if (renderFn) {
        renderFn(container, (page) => navigate(`/${page}`));
      }
    });

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [loader, navigate]);

  return <div ref={containerRef} style={{ width: '100%' }} />;
}
