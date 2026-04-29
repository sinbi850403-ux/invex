import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { initAuth, getCurrentUser, getUserProfileData, logout as authLogout } from '../auth.js';
import { isSupabaseConfigured } from '../supabase-client.js';
import { restoreState, setupRealtimeSync, cleanupRealtimeSync } from '../store.js';
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
      await restoreState(uid);

      const profilePlan = getUserProfileData()?.plan;
      if (profilePlan && PLANS[profilePlan]) setPlan(profilePlan);

      const lastPage = localStorage.getItem(LAST_PAGE_KEY);
      const page = (lastPage && lastPage in PAGE_LOADERS) ? lastPage : 'home';
      setStartPage(page);
      // Realtime 자동 동기화 비활성화 (2026-04-29)
      // 사용자가 수동으로 새로고침 버튼을 눌러야만 데이터 업데이트됨
      // setupRealtimeSync();

      // 워크스페이스 소속 시 오너 UID로 전환
      if (uid) {
        const wsId = await getWorkspaceId(uid);
        if (wsId && wsId !== uid) {
          setWorkspaceUserId(wsId);
          await restoreState(wsId);
        }
      }
    } finally {
      initializingRef.current = false;
      setIsInitializing(false);
    }
  }, []);

  useEffect(() => {
    // Supabase 미설정 시 자동 로그인
    if (!isSupabaseConfigured) {
      setUser({ uid: 'local', email: 'local@invex', displayName: '로컬 사용자' });
      setIsReady(true);
      initApp({ uid: 'local' });
      return;
    }

    // ── 최대 대기 타이머 ─────────────────────────────────────────────────────
    // 저장된 세션이 있으면 INITIAL_SESSION 복원을 기다려야 하므로 5초,
    // 없으면 Supabase cold-start 대응으로 2초 후 로그인 화면 표시
    const hasStoredSession = (() => {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && /^sb-.+-auth-token$/.test(k)) {
            const v = localStorage.getItem(k);
            if (v && v !== 'null' && v !== '{}') return true;
          }
        }
      } catch { /* ignore */ }
      return false;
    })();
    const readyFallback = setTimeout(() => setIsReady(true), hasStoredSession ? 5000 : 2000);

    initAuth(async (newUser, newProfile) => {
      clearTimeout(readyFallback);
      if (newUser) {
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
