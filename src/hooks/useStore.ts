/**
 * useStore.ts — store.js 브리지 훅
 *
 * React 컴포넌트에서 기존 store.js의 getState/setState를 쓸 수 있게 해주는 훅.
 * store.js가 invex:store-updated 이벤트를 dispatch할 때 자동으로 리렌더링됨.
 */
import { useState, useCallback, useEffect } from 'react';
import { getState, setState as storeSetState } from '../store.js';

type AnyState = ReturnType<typeof getState>;
type Selector<T> = (state: AnyState) => T;
type SetState = (partial: Partial<AnyState>) => void;

export function useStore(): [AnyState, SetState];
export function useStore<T>(selector: Selector<T>): [T, SetState];
export function useStore<T = AnyState>(selector?: Selector<T>): [T | AnyState, SetState] {
  const select = selector || ((s: AnyState) => s as unknown as T);

  const [value, setValue] = useState<T | AnyState>(() => select(getState()));

  useEffect(() => {
    const handler = () => {
      const next = select(getState());
      setValue(prev => Object.is(prev, next) ? prev : next);
    };
    window.addEventListener('invex:store-updated', handler);
    return () => window.removeEventListener('invex:store-updated', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback<SetState>((partial) => {
    storeSetState(partial);
  }, []);

  return [value, update];
}

export function useStoreState(): [AnyState, SetState] {
  return useStore();
}
