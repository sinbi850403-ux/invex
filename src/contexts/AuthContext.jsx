import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

  // 의존성 주입 (plan.js가 auth.js에 의존하지 않도록 역전)
  useEffect(() => {
    injectGetCurrentUser(getCurrentUser);
    injectGetUserProfile(getUserProfileData);
  }, []);

  const initApp = useCallback(async (loggedInUser) => {
    if (isInitializing) return;
    setIsInitializing(true);
    try {
      const uid = loggedInUser?.uid || null;
      primeUserIdCache(uid);
      await restoreState(uid);

      const profilePlan = getUserProfileData()?.plan;
      if (profilePlan && PLANS[profilePlan]) setPlan(profilePlan);

      const lastPage = localStorage.getItem(LAST_PAGE_KEY);
      const page = (lastPage && PAGE_LOADERS[lastPage]) ? lastPage : 'home';
      setStartPage(page);
      setupRealtimeSync();

      // 워크스페이스 소속 시 오너 UID로 전환
      if (uid) {
        const wsId = await getWorkspaceId(uid);
        if (wsId && wsId !== uid) {
          setWorkspaceUserId(wsId);
          await restoreState(wsId);
        }
      }
    } finally {
      setIsInitializing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Supabase 미설정 시 자동 로그인
    if (!isSupabaseConfigured) {
      setUser({ uid: 'local', email: 'local@invex', displayName: '로컬 사용자' });
      setIsReady(true);
      initApp({ uid: 'local' });
      return;
    }

    // ── 최대 대기 타이머 ─────────────────────────────────────────────────────
    // localStorage에 저장된 세션이 있으면 세션 복원 완료까지 대기 (로그인 화면 깜빡임 방지)
    // 세션 없으면 2초, 있으면 6초 (loadProfile 타임아웃 4초 + 여유)
    const hasStoredSession = (() => {
      try {
        const raw = localStorage.getItem('invex-supabase-auth');
        if (!raw) return false;
        const d = JSON.parse(raw);
        return Boolean(d?.access_token || d?.currentSession?.access_token);
      } catch { return false; }
    })();
    const readyFallback = setTimeout(() => setIsReady(true), hasStoredSession ? 6000 : 2000);

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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
