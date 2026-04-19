/**
 * framework.js — INVEX 경량 미니 프레임워크
 *
 * 왜 만들었나?
 * → 60개 page-*.js 파일이 각자 다른 방식으로 DOM을 조작하고 이벤트를 붙임
 * → 이 파일이 3가지 패턴을 통일시켜 코드가 어디서나 같은 모양으로 읽힘
 *
 * 내보내는 것:
 *   1. html``  — XSS 방지 템플릿 리터럴
 *   2. on()    — 이벤트 위임 (동적 DOM에 안전)
 *   3. createPage() — 페이지 표준 생명주기 팩토리
 */

// ── 1. html 태그드 템플릿 리터럴 ──────────────────────────────────────────
// 왜? → 변수 값이 자동으로 XSS 이스케이프됨
//      raw(value) 로 감싸면 이스케이프 생략 (신뢰된 HTML만)
//
// 사용법:
//   container.innerHTML = html`<div>${userName}</div>`;  // 자동 이스케이프
//   container.innerHTML = html`<div>${raw(trustedHtml)}</div>`;  // 원시 HTML
// ─────────────────────────────────────────────────────────────────────────

function escape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

/** 이스케이프를 건너뛸 때 감싸는 래퍼 */
export class RawHtml {
  constructor(value) { this.value = String(value ?? ''); }
}

export const raw = (value) => new RawHtml(value);

export function html(strings, ...values) {
  return strings.reduce((result, str, i) => {
    const value = values[i - 1];
    if (value === undefined) return result + str;
    if (value instanceof RawHtml) return result + value.value + str;
    if (Array.isArray(value)) return result + value.join('') + str;
    return result + escape(value) + str;
  });
}

// ── 2. on — 이벤트 위임 헬퍼 ─────────────────────────────────────────────
// 왜? → container.innerHTML = `` 후 querySelectorAll().forEach() 반복이 중복 코드
//      on(container, '#btn-save', 'click', handler) 한 줄로 해결
//      동적으로 생성된 DOM에도 자동 작동
//
// 사용법:
//   on(container, '.btn-del', 'click', (e, el) => deleteItem(el.dataset.id));
// ─────────────────────────────────────────────────────────────────────────

export function on(container, selector, eventType, handler) {
  container.addEventListener(eventType, (e) => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      handler(e, target);
    }
  });
}

// ── 3. createPage — 페이지 표준 생명주기 팩토리 ──────────────────────────
// 왜? → 모든 page-*.js 파일이 동일한 구조(render → mount → destroy)를 가지도록 강제
//      새 페이지를 추가할 때 빈 컨테이너를 먼저 클리어하는 것을 잊지 않도록 보장
//
// 사용법 (기존 방식 대신):
//   export const renderExamplePage = createPage({
//     render({ state, navigateTo }) { return html`<div>...</div>`; },
//     mount({ container, navigateTo }) {
//       on(container, '#btn-save', 'click', () => save());
//     },
//     destroy() { destroyAllCharts(); },  // 선택사항
//   });
// ─────────────────────────────────────────────────────────────────────────

export function createPage({ render, mount, destroy } = {}) {
  return function renderPage(container, navigateTo) {
    // 이전 페이지의 destroy 콜백이 있으면 먼저 정리
    if (typeof container._destroyPage === 'function') {
      try { container._destroyPage(); } catch (e) { /* 무시 */ }
    }

    // destroy가 있으면 컨테이너에 등록 (navigateTo 후 자동 호출됨)
    container._destroyPage = destroy || null;

    // 상태와 navigateTo를 render 함수에 전달해서 HTML 생성
    container.innerHTML = render ? render({ navigateTo }) : '';

    // DOM 그린 후 이벤트 바인딩
    if (mount) mount({ container, navigateTo });
  };
}
