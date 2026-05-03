import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initCardCollapsibles } from '../card-collapsibles.js';
import { LAST_PAGE_KEY } from '../router-config.js';
import { mountAutoTableSort } from '../table-auto-sort.js';
import { syncExternalNotifications } from '../notifications.js';

// 렌더러 캐시 (모듈 재로딩 방지)
const _rendererCache = {};

/**
 * createLegacyPage(pageId, loader) — 레거시 renderXxxPage를 React 컴포넌트로 감싸기
 *
 * @param {string} pageId - 페이지 ID (예: 'inventory')
 * @param {Function} loader - () => Promise<renderFn>
 */
export function createLegacyPage(pageId, loader) {
  function LegacyPageComponent() {
    const containerRef = useRef(null);
    const navigate = useNavigate();
    const [renderer, setRenderer] = useState(null);
    const [error, setError] = useState(null);

    // 안정적인 navigateTo 어댑터 (React Router navigate 래핑)
    const navigateRef = useRef(null);
    const navigateTo = useCallback((targetPageId) => {
      const path = targetPageId.startsWith('/') ? targetPageId : '/' + targetPageId;
      navigate(path);
    }, [navigate]);
    navigateRef.current = navigateTo;

    // 렌더러 로드 (한 번만)
    useEffect(() => {
      if (_rendererCache[pageId]) {
        setRenderer(() => _rendererCache[pageId]);
        return;
      }
      const promise = loader();
      promise.then((fn) => {
        _rendererCache[pageId] = fn;
        setRenderer(() => fn);
      }).catch((err) => {
        console.error(`[LegacyPage] 페이지 로드 실패 (${pageId}):`, err);
        // stale chunk 감지 → 자동 새로고침
        const msg = err?.message || '';
        if (msg.includes('Failed to fetch') || msg.includes('MIME type') || msg.includes('dynamically imported')) {
          const RELOAD_KEY = 'invex_stale_reload_ts';
          const last = parseInt(sessionStorage.getItem(RELOAD_KEY) || '0', 10);
          if (Date.now() - last > 10_000) {
            sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
            window.location.reload();
            return;
          }
        }
        setError(err?.message || '페이지를 불러올 수 없습니다.');
        delete _rendererCache[pageId];
      });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 렌더러 실행
    useEffect(() => {
      if (!renderer || !containerRef.current) return;
      const container = containerRef.current;

      // 페이지 데이터 설정
      container.dataset.page = pageId;
      localStorage.setItem(LAST_PAGE_KEY, pageId);

      // 스켈레톤 표시
      container.innerHTML = '<div class="skeleton-page"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>';

      let cancelled = false;
      Promise.resolve(renderer(container, (pid) => navigateRef.current(pid))).then(() => {
        if (cancelled) return;
        // 렌더 완료 후 후처리
        try { initCardCollapsibles(container, pageId); } catch(e) {}
        try { mountAutoTableSort(container); } catch(e) {}
        try { syncExternalNotifications(); } catch(e) {}
        // 알림 배지 업데이트
        window.dispatchEvent(new CustomEvent('notifications-updated'));
      }).catch((err) => {
        if (!cancelled) {
          console.error(`[LegacyPage] 렌더 오류 (${pageId}):`, err);
          const safeMsg = String(err.message || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          container.innerHTML = `<div class="page-error"><p>페이지 렌더링 오류: ${safeMsg}</p><button onclick="location.reload()">새로고침</button></div>`;
        }
      });

      return () => {
        cancelled = true;
        // 페이지 언마운트 이벤트 (기존 정리 로직 트리거)
        container.dispatchEvent(new CustomEvent('invex:page-unload', { bubbles: false }));
      };
    }, [renderer]); // eslint-disable-line react-hooks/exhaustive-deps

    if (error) {
      return (
        <div className="page-error" style={{padding: '40px', textAlign: 'center'}}>
          <p style={{color: 'var(--danger)'}}>페이지 오류: {error}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>새로고침</button>
        </div>
      );
    }

    return <div ref={containerRef} className="legacy-page-container" />;
  }

  LegacyPageComponent.displayName = `LegacyPage(${pageId})`;
  return LegacyPageComponent;
}
