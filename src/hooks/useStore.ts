/**
 * useStore.ts — store.js 브리지 훅
 *
 * React 컴포넌트에서 기존 store.js의 getState/setState를 쓸 수 있게 해주는 훅.
 * store.js가 invex:store-updated 이벤트를 dispatch할 때 자동으로 리렌더링됨.
 *
 * 수정 (P0-5):
 * - selectorRef 패턴으로 stale closure 제거
 * - shallowEqual로 배열 반환 셀렉터의 불필요한 리렌더 방지
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { getState, setState as storeSetState } from '../store.js';

type AnyState = ReturnType<typeof getState>;
type Selector<T> = (state: AnyState) => T;
type SetState = (partial: Partial<AnyState>) => void;

/**
 * 얕은 동등 비교 — 배열/객체/원시값 모두 처리 (BUG-009)
 * Object.is만 쓰면 배열·객체 셀렉터가 매 이벤트마다 새 참조를 반환해 불필요한 리렌더 발생
 * - 배열: 길이 + 각 요소 Object.is 비교
 * - 일반 객체: 키 집합 + 각 값 Object.is 비교 (s.currency, s.inventoryViewPrefs 등)
 */
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => Object.is(item, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  // 일반 plain 객체 얕은 비교
  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k =>
    Object.prototype.hasOwnProperty.call(b, k) &&
    Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
  );
}

export function useStore(): [AnyState, SetState];
export function useStore<T>(selector: Selector<T>): [T, SetState];
export function useStore<T = AnyState>(selector?: Selector<T>): [T | AnyState, SetState] {
  // selectorRef: 항상 최신 selector를 가리킴 — useEffect deps에 넣지 않아도 stale 없음
  const selectorRef = useRef<Selector<T | AnyState>>(selector || ((s: AnyState) => s as unknown as T));
  selectorRef.current = selector || ((s: AnyState) => s as unknown as T);

  const [value, setValue] = useState<T | AnyState>(() => selectorRef.current(getState()));

  useEffect(() => {
    const handler = () => {
      const next = selectorRef.current(getState());
      setValue(prev => shallowEqual(prev, next) ? prev : next);
    };
    window.addEventListener('invex:store-updated', handler);
    return () => window.removeEventListener('invex:store-updated', handler);
  }, []); // selectorRef는 ref이므로 deps 불필요 — stale closure 없음

  const update = useCallback<SetState>((partial) => {
    storeSetState(partial);
  }, []);

  return [value, update];
}

export function useStoreState(): [AnyState, SetState] {
  return useStore();
}
