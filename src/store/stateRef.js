/**
 * stateRef.js - 공유 상태 홀더 (모든 서브모듈이 이 객체를 통해 state에 접근)
 *
 * 왜 stateHolder 패턴? → ES 모듈의 binding 특성상 다른 모듈에서 `let state`를
 * 직접 import하면 재할당이 반영되지 않는다. 객체 프로퍼티(current)를 공유하면
 * 어느 모듈에서든 최신 state를 참조할 수 있다.
 */

export const stateHolder = { current: null }; // store.js에서 초기화

export function dispatchUpdate(changedKeys) {
  window.dispatchEvent(new CustomEvent('invex:store-updated', { detail: { changedKeys } }));
}
