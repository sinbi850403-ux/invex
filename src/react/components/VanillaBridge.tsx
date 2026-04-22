/**
 * VanillaBridge.tsx - Vanilla 렌더러를 React 컴포넌트로 래핑
 *
 * 점진적 마이그레이션 중간 단계:
 *   Vanilla renderXxxPage(container, navigateTo) 함수를
 *   React 컴포넌트로 감싸 AppProviders(Auth + Store) 컨텍스트를 제공.
 *
 * 이 컴포넌트가 마운트되면 container div에 vanilla 렌더러를 실행하고,
 * 언마운트 시 container를 비워 메모리를 정리합니다.
 *
 * 사용 패턴 (vanillaLoader 헬퍼가 자동 처리):
 *   router.js: summary: vanillaLoader(() => import('./page-summary.js'), 'renderSummaryPage'),
 */

import { useEffect, useRef } from 'react';

type RenderFn = (container: HTMLElement, navigateTo: (page: string) => void) => void;

interface VanillaBridgeProps {
  renderFn: RenderFn;
  navigateTo: (page: string) => void;
}

export function VanillaBridge({ renderFn, navigateTo }: VanillaBridgeProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Vanilla 페이지 렌더링 — container 안에 DOM을 직접 주입
    renderFn(container, navigateTo);

    return () => {
      // 언마운트 시 cleanup: Vanilla 페이지가 남긴 이벤트 리스너 등 정리
      container.innerHTML = '';
    };
    // renderFn, navigateTo 모두 stable reference → 의도적으로 마운트 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ width: '100%', minHeight: '100%' }} />;
}
