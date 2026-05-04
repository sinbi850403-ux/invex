import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { initAuth, getCurrentUser, getUserProfileData, logout as authLogout } from '../auth.js';
import { isSupabaseConfigured } from '../supabase-client.js';
import { restoreState, setupRealtimeSync, cleanupRealtimeSync, getState as getStoreState, wasLoadedFromSupabase } from '../store.js';
import { primeUserIdCache, setWorkspaceUserId, clearWorkspaceUserId } from '../db.js';
import { injectGetCurrentUser, injectGetUserProfile, PLANS, setPlan, getCurrentPlan } from '../plan.js';
import { setMonitorUser, clearMonitorUser } from '../error-monitor.js';
import { getWorkspaceId } from '../workspace.js';
import { LAST_PAGE_KEY, PAGE_LOADERS } from '../router-config.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [startPage, setStartPage] = useState('home');
  const initializingRef = useRef(false);
  const hasRetriedBootstrapRef = useRef(false);

  // 의존성 주입 (plan.js가 auth.js에 의존하지 않도록 역전)
  useEffect(() => {
    injectGetCurrentUser(getCurrentUser);
    injectGetUserProfile(getUserProfileData);
  }, []);

  const initApp = useCallback(async (loggedInUser) => {
    if (initializingRef.current) return;
    initializingRef.current = true;
    setIsInitializing(true);
    try {
      const uid = loggedInUser?.uid || null;
      primeUserIdCache(uid);

      // getWorkspaceId 먼저 조회 후 올바른 uid로 restoreState 1회만 실행 (P1-3)
      // 이전: restoreState(uid) + (wsId !== uid 이면) restoreState(wsId) → 2배 쿼리(26회)
      // 개선: wsId를 먼저 확정하고 effectiveUid로 단 1회만 restoreState 호출
      const wsId = (uid && isSupabaseConfigured) ? await getWorkspaceId(uid) : uid;
      const effectiveUid = (wsId && wsId !== uid) ? wsId : uid;

      // 워크스페이스 멤버인 경우 오너 UID를 DB 쿼리 기준으로 설정
      if (wsId && wsId !== uid) {
        setWorkspaceUserId(wsId);
      }

      // effectiveUid로 상태 복원 (단 1회)
      await restoreState(effectiveUid);

      // 로그인 직후 세션 갱신 레이스로 0건이 들어오는 케이스 보정:
      // wasLoadedFromSupabase()가 true이면 Supabase 쿼리가 정상 응답한 것이므로 재시도 불필요
      // (신규 계정처럼 데이터가 0건인 정상 케이스와 구분)
      const getCoreCounts = () => {
        const s = getStoreState() || {};
        return {
          itemCount: s.mappedData?.length || 0,
          txCount: s.transactions?.length || 0,
        };
      };
      const looksPartialBootstrap = () => {
        const { itemCount, txCount } = getCoreCounts();
        return itemCount > 0 && txCount === 0;
      };
      const hasNoCoreData = () => {
        const { itemCount, txCount } = getCoreCounts();
        return itemCount === 0 && txCount === 0;
      };
      if (
        isSupabaseConfigured &&
        effectiveUid &&
        !wasLoadedFromSupabase() &&
        (hasNoCoreData() || looksPartialBootstrap()) &&
        !hasRetriedBootstrapRef.current
      ) {
        hasRetriedBootstrapRef.current = true;
        await new Promise(r => setTimeout(r, 400)); // 1200ms → 400ms
        await restoreState(effectiveUid);
      }

      const profilePlan = getUserProfileData()?.plan;
      if (profilePlan && PLANS[profilePlan]) setPlan(profilePlan);

      const lastPage = localStorage.getItem(LAST_PAGE_KEY);
      const page = (lastPage && lastPage in PAGE_LOADERS) ? lastPage : 'home';
      setStartPage(page);
      // Realtime 자동 동기화 비활성화 (2026-04-29)
      // 사용자가 수동으로 새로고침 버튼을 눌러야만 데이터 업데이트됨
      // setupRealtimeSync();
    } finally {
      initializingRef.current = false;
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    // Supabase 미설정 처리
    if (!isSupabaseConfigured) {
      // 프로덕션 환경에서는 로컬 모드 차단 — 로그인 화면 표시
      if (import.meta.env.PROD) {
        console.error('[INVEX] 프로덕션 환경에서 Supabase 설정이 없습니다.');
        setIsReady(true);
        return;
      }
      // 개발 환경에서만 로컬 모드 허용
      setUser({ uid: 'local', email: 'local@invex', displayName: '로컬 사용자' });
      setIsReady(true);
      initApp({ uid: 'local' });
      return;
    }

    // ── 최대 대기 타이머 ─────────────────────────────────────────────────────
    // 저장된 세션이 있으면 INITIAL_SESSION 복원을 기다려야 하므로 2초,
    // OAuth 콜백(#access_token / ?code=) 처리 중이면 5초 (네트워크 교환 필요),
    // 없으면 Supabase cold-start 대응으로 1초 후 로그인 화면 표시
    const hasStoredSession = (() => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          // invex-supabase-auth: 커스텀 storageKey (supabase-client.js)
          // sb-*-auth-token: Supabase SDK 기본 키 패턴
          if (k && (k === 'invex-supabase-auth' || /^sb-.+-auth-token$/.test(k))) {
            const v = localStorage.getItem(k);
            if (v && v !== 'null' && v !== '{}') return true;
          }
        }
      } catch { /* ignore */ }
      return false;
    })();
    const hasOAuthCallback = (
      window.location.hash.includes('access_token') ||
      window.location.search.includes('code=')
    );
    const readyFallbackMs = hasStoredSession ? 2000 : hasOAuthCallback ? 5000 : 1000;
    const readyFallback = setTimeout(() => setIsReady(true), readyFallbackMs);

    initAuth(async (newUser, newProfile) => {
      clearTimeout(readyFallback);
      if (newUser) {
        hasRetriedBootstrapRef.current = false;
        setMonitorUser(newUser.uid, newUser.email);
        const profilePlan = newProfile?.plan;
        if (profilePlan && PLANS[profilePlan]) setPlan(profilePlan);
        setUser(newUser);
        setProfile(newProfile);
        setIsReady(true);
        await initApp(newUser);
      } else {
        clearMonitorUser();
        cleanupRealtimeSync();
        clearWorkspaceUserId();
        setUser(null);
        setProfile(null);
        setIsReady(true);
      }
    });
    return () => clearTimeout(readyFallback);
  }, [initApp]);

  const logout = useCallback(async () => {
    cleanupRealtimeSync();
    clearWorkspaceUserId();
    await authLogout();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, isReady, isInitializing, startPage, logout, getCurrentPlan }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
