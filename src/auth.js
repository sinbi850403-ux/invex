import { supabase, isSupabaseConfigured, getSupabaseConfig, getSupabaseDebugInfo } from './supabase-client.js';
import { showToast } from './toast.js';
import {
  ACTION_MIN_ROLE as AUTH_ACTION_MIN_ROLE,
  PAGE_MIN_ROLE as AUTH_PAGE_MIN_ROLE,
  hasRequiredPlan,
  hasRequiredRole,
} from './auth/rules.js';
import { createBootstrapProfile, getFallbackProfile as createFallbackProfile, mapProfileData } from './auth/profile.js';
import { renderInlineLoginError as renderVanillaLoginError, renderLoginScreen as renderVanillaLoginScreen } from './auth/ui.js';
import { purgeLegacyAuthStorage as purgeAuthStorage, sanitizeSupabaseStorage as sanitizeAuthStorage } from './auth/storage.js';
import { withTimeout } from './auth/async.js';

let currentUser = null;
let userProfile = null;
let authChangeCallbacks = [];
let authSubscription = null;
let authInitialized = false;
// RLS/권한 오류로 프로필 부트스트랩이 실패했으면 재시도하지 않음 (localStorage 영속)
const _BS_BLOCKED_KEY = 'invex-profile-bs-blocked';
let profileBootstrapBlocked = (() => {
  try { return localStorage.getItem(_BS_BLOCKED_KEY) === '1'; } catch (_) { return false; }
})();
// 동시 부트스트랩 방지 — 진행 중이면 같은 Promise를 공유
let profileBootstrapInflight = null;

// ─── 이중 클릭 / 중복 요청 방지 플래그 ─────────────────────────────────────
// isLoggingIn: 이메일 로그인 진행 중 이중 클릭 방지 (Google OAuth 에는 사용 X)
let isLoggingIn = false;

// applySessionSeq: 로그아웃 후 늦게 도착하는 applySession 결과를 폐기하기 위한
// 단조증가 시퀀스 번호. logout()이 호출될 때마다 번호를 올려서
// 이전 세션 복구 비동기 경로가 끝났을 때 자신이 구식임을 인지하고 중단.
let applySessionSeq = 0;

// Google OAuth 로그인 중 타임아웃 핸들러 (취소 감지용)
let googleLoginTimeoutId = null;

const AUTH_STORAGE_PATTERNS = [
  /^invex-supabase-auth$/,
  /^sb-.*-auth-token$/,
  /^supabase\.auth\./,
];
const LEGACY_AUTH_PREFIX = `${String.fromCharCode(102, 105, 114, 101, 98, 97, 115, 101)}:`;
// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

function toCompatUser(supabaseUser) {
  if (!supabaseUser) return null;
  return {
    uid: supabaseUser.id,
    email: supabaseUser.email,
    displayName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '사용자',
    photoURL: supabaseUser.user_metadata?.avatar_url || null,
    _raw: supabaseUser,
  };
}

/**
 * 각 콜백을 독립 try/catch 로 감싸서 실행
 * → 콜백 1개가 오류를 던져도 나머지 콜백이 모두 실행됨
 * → 앱 전체가 멈추는 현상 방지
 */
function emitAuthChanged() {
  authChangeCallbacks.forEach((callback) => {
    try {
      callback(currentUser, userProfile);
    } catch (err) {
      console.error('[Auth] authChangeCallback threw:', err);
    }
  });
}

function getFallbackProfile(user) {
  return {
    uid: user?.uid || null,
    email: user?.email || null,
    name: user?.displayName || '사용자',
    photoURL: user?.photoURL || null,
    role: resolveProfileRole(null, user?.email),
    plan: 'free',
  };
}

// ─── 스토리지 관련 ────────────────────────────────────────────────────────────

function resolveProfileRole(role, email) {
  if (isSuperAdminEmail(email)) return 'admin';
  if (VALID_ROLES.has(role)) return role;
  return 'viewer';
}

function forEachStorageKey(callback) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key) callback(key);
  }
}

function purgeLegacyAuthStorage(options = {}) {
  const { includeSupabaseSession = false } = options;
  if (typeof window === 'undefined' || !window.localStorage) return;

  const keys = [];
  forEachStorageKey((key) => {
    const matches =
      key.startsWith(LEGACY_AUTH_PREFIX) ||
      AUTH_STORAGE_PATTERNS.some((pattern) => pattern.test(key));
    if (!matches) return;

    const isSupabaseKey =
      key === 'invex-supabase-auth' ||
      /^sb-.*-auth-token$/.test(key) ||
      /^supabase\.auth\./.test(key);

    if (!includeSupabaseSession && isSupabaseKey) return;
    keys.push(key);
  });

  keys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  });
}

function sanitizeSupabaseStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  purgeLegacyAuthStorage({ includeSupabaseSession: false });

  const raw = window.localStorage.getItem('invex-supabase-auth');
  if (!raw) return;

  try {
    JSON.parse(raw);
  } catch {
    // 손상된 JSON → 삭제하여 무한 복구 루프 방지
    console.warn('[Auth] Corrupted auth storage detected — clearing');
    window.localStorage.removeItem('invex-supabase-auth');
  }
}

// ─── 프로필 로드 ──────────────────────────────────────────────────────────────

function isRlsOrAuthError(err) {
  if (!err) return false;
  const msg = String(err.message || err.code || '').toLowerCase();
  return msg.includes('row-level security') ||
         msg.includes('row level security') ||
         msg.includes('401') ||
         msg.includes('unauthorized') ||
         err.code === '42501' ||
         err.code === 'PGRST301';
}

async function loadProfile(user) {
  const fallback = createFallbackProfile(user);

  try {
    // SELECT 시도 — 8초 타임아웃, 실패 시 한 번만 재시도
    let result;
    try {
      result = await withTimeout(
        supabase.from('profiles').select('*').eq('id', user.uid).maybeSingle(),
        8000,
        'load-profile',
      );
    } catch (firstErr) {
      const transient = firstErr.message?.includes('timeout') || firstErr.message?.includes('fetch');
      if (!transient) {
        // 권한·RLS 오류는 즉시 폴백
        return fallback;
      }
      // 일시 오류만 1회 재시도 (조용히)
      await new Promise(r => setTimeout(r, 1500));
      try {
        result = await withTimeout(
          supabase.from('profiles').select('*').eq('id', user.uid).maybeSingle(),
          6000,
          'load-profile-retry',
        );
      } catch {
        // 재시도도 실패 — 폴백으로 조용히 계속 진행 (콘솔 도배 X)
        return fallback;
      }
    }

    const { data, error } = result || {};
    if (error) {
      // 권한 오류면 조용히 폴백
      if (isRlsOrAuthError(error)) return fallback;
      // 그 외는 1회만 경고 후 폴백
      console.warn('[Auth] profile select error:', error.message);
      return fallback;
    }

    if (!data) {
      // 프로필 미존재 → 부트스트랩 시도. 단, 이전에 RLS로 차단됐으면 건너뜀.
      if (profileBootstrapBlocked) {
        return { ...fallback, createdAt: new Date().toISOString() };
      }

      const newProfile = createBootstrapProfile(user);

      // 동시 호출이 같은 upsert를 중복 발사하지 않도록 in-flight Promise 공유
      if (!profileBootstrapInflight) {
        profileBootstrapInflight = supabase
          .from('profiles')
          .upsert(newProfile, { onConflict: 'id', ignoreDuplicates: true })
          .then(({ error: insertError }) => {
            if (insertError) {
              if (isRlsOrAuthError(insertError)) {
                if (!profileBootstrapBlocked) {
                  console.info('[Auth] profile 부트스트랩 차단 (RLS) — 폴백 프로필로 동작');
                  profileBootstrapBlocked = true;
                  try { localStorage.setItem(_BS_BLOCKED_KEY, '1'); } catch (_) {}
                }
              } else {
                console.warn('[Auth] profile insert error:', insertError.message);
              }
            }
          })
          .catch(() => {})
          .finally(() => { profileBootstrapInflight = null; });
      }
      await profileBootstrapInflight;
      return { ...fallback, createdAt: newProfile.created_at };
    }

    return mapProfileData(data, fallback);
  } catch (error) {
    // 어떤 오류든 앱이 멈추면 안 됨 — 폴백으로 계속
    if (!isRlsOrAuthError(error)) {
      console.warn('[Auth] profile load fallback:', error.message);
    }
    return fallback;
  }
}

// ─── 세션 적용 ────────────────────────────────────────────────────────────────

/**
 * applySession — 세션 변경 시 currentUser/userProfile 갱신 후 콜백 실행
 *
 * [수정 사항]
 * - seq 파라미터로 구식 비동기 호출 감지: logout()이 seq를 올리면
 *   이전 applySession 호출은 완료 시 seq 불일치를 보고 중단.
 *   → 로그아웃 후 늦게 도착한 프로필로 상태가 덮어씌워지는 race condition 제거.
 */
async function applySession(session, seq) {
  if (!session?.user) {
    // 이미 로그아웃 상태면 콜백 불필요 (loginWithEmail pre-signout 중에도 동일)
    // isLoggingIn=true 상태에서 pre-signout이 null 콜백을 발생시키면
    // isAuthReady가 false로 리셋되어 initAppAfterAuth가 중복 호출되는 버그 방지
    if (currentUser === null) return;
    currentUser = null;
    userProfile = null;
    isLoggingIn = false;
    emitAuthChanged();
    return;
  }

  const user = toCompatUser(session.user);
  const profile = await loadProfile(user);

  // 프로필 로딩이 끝나는 사이에 logout()이 호출됐으면 폐기
  if (seq !== applySessionSeq) {
    console.warn('[Auth] applySession discarded — superseded by logout or newer session');
    return;
  }

  currentUser = user;
  userProfile = profile;
  isLoggingIn = false;
  emitAuthChanged();
}

// ─── directPasswordLogin (fallback) ──────────────────────────────────────────

async function directPasswordLogin(email, password) {
  const { url, anonKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'X-Client-Info': 'invex-direct-auth',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // JSON 파싱 실패 시 raw text 로 오류 메시지 구성
      const rawText = await response.text().catch(() => '');
      throw new Error(rawText || `서버 응답 파싱 실패 (HTTP ${response.status})`);
    }

    if (!response.ok) {
      throw new Error(
        payload?.msg ||
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        `Direct auth failed (HTTP ${response.status})`,
      );
    }

    const { error } = await withTimeout(
      supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      }),
      8000,
      'set-session',
    );

    if (error) throw error;
    return payload.user || null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 인라인 로그인 오류 표시 ──────────────────────────────────────────────────

function renderInlineLoginError(loginBtn, email, errorMsg, showResetAction) {
  if (!loginBtn) return;

  const errorContainer = document.createElement('div');
  errorContainer.id = 'login-error-msg';
  errorContainer.style.cssText = 'margin-top:10px; animation: fadeSlideIn 0.3s ease;';

  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'color:#ef4444; font-size:13px; text-align:center; padding:10px 14px; background:rgba(239,68,68,0.1); border-radius:8px;';
  msgEl.textContent = errorMsg;
  errorContainer.appendChild(msgEl);

  // 네트워크 오류 시 재시도 버튼
  if (errorMsg.includes('지연') || errorMsg.includes('불안정') || errorMsg.includes('오프라인') || errorMsg.includes('재시도')) {
    const retryBtn = document.createElement('button');
    retryBtn.style.cssText = 'width:100%; margin-top:8px; padding:10px 16px; background:linear-gradient(135deg, #3b82f6, #6366f1); color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;';
    retryBtn.textContent = '🔄 다시 시도';
    retryBtn.addEventListener('click', () => {
      document.getElementById('login-error-msg')?.remove();
      document.getElementById('gate-email-login')?.click();
    });
    errorContainer.appendChild(retryBtn);
  }

  if (showResetAction && email) {
    const helpBox = document.createElement('div');
    helpBox.style.cssText = 'margin-top:8px; padding:12px 14px; background:rgba(99,102,241,0.1); border-radius:8px; border:1px solid rgba(99,102,241,0.2);';

    const helpText = document.createElement('div');
    helpText.style.cssText = 'color:var(--text-muted); font-size:12px; margin-bottom:8px; line-height:1.5;';
    helpText.textContent = '처음이시거나 비밀번호가 기억나지 않으면 아래 버튼으로 재설정 메일을 받을 수 있습니다.';
    helpBox.appendChild(helpText);

    const resetBtn = document.createElement('button');
    resetBtn.style.cssText = 'width:100%; padding:10px 16px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s;';
    resetBtn.textContent = '비밀번호 재설정 메일 받기';
    resetBtn.addEventListener('click', async () => {
      resetBtn.disabled = true;
      resetBtn.textContent = '전송 중...';
      const success = await resetPassword(email);
      if (!success) {
        resetBtn.disabled = false;
        resetBtn.textContent = '비밀번호 재설정 메일 받기';
        return;
      }

      errorContainer.innerHTML = '';
      const successEl = document.createElement('div');
      successEl.style.cssText = 'color:#22c55e; font-size:13px; text-align:center; padding:14px; background:rgba(34,197,94,0.1); border-radius:8px; line-height:1.6;';
      successEl.innerHTML = `<strong>이메일을 전송했습니다.</strong><br><span style="font-size:12px; color:var(--text-muted);">${email} 메일함에서 비밀번호를 다시 설정해 주세요.</span>`;
      errorContainer.appendChild(successEl);
    });

    helpBox.appendChild(resetBtn);
    errorContainer.appendChild(helpBox);
  }

  loginBtn.parentNode.insertBefore(errorContainer, loginBtn.nextSibling);
}

// ─── initAuth ─────────────────────────────────────────────────────────────────

export function initAuth(callback) {
  if (callback && !authChangeCallbacks.includes(callback)) {
    authChangeCallbacks.push(callback);
  }

  if (!isSupabaseConfigured) {
    purgeAuthStorage({ includeSupabaseSession: true });
    currentUser = null;
    userProfile = createFallbackProfile(null);
    if (callback) {
      try { callback(null, userProfile); } catch (e) { console.error('[Auth] callback error:', e); }
    }
    return;
  }

  if (authInitialized) {
    if (callback) {
      try { callback(currentUser, userProfile); } catch (e) { console.error('[Auth] callback error:', e); }
    }
    return;
  }

  authInitialized = true;
  sanitizeAuthStorage();

  // 초기 세션 복구 — seq=0 으로 시작
  const initSeq = applySessionSeq;
  withTimeout(supabase.auth.getSession(), 6000, 'initial-session')
    .then(({ data }) => applySession(data?.session || null, initSeq))
    .catch(async (error) => {
      // 타임아웃 시 1회 조용히 재시도 (네트워크 일시 지연 대응)
      if (error.message?.includes('timeout')) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const { data } = await withTimeout(supabase.auth.getSession(), 6000, 'initial-session-retry');
          return applySession(data?.session || null, initSeq);
        } catch {
          // 재시도 실패 — 로그인 화면으로 (조용히)
          return applySession(null, initSeq);
        }
      }
      console.warn('[Auth] Initial session recovery failed:', error.message);
      applySession(null, initSeq);
    });

  // onAuthStateChange — 내부 에러를 반드시 캐치하여 Supabase 리스너가 죽지 않도록
  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
    try {
      if (_event === 'PASSWORD_RECOVERY') {
        // 비밀번호 재설정 링크 클릭 시 — 새 비밀번호 입력 모달 표시
        showPasswordRecoveryModal();
        return;
      }
      await applySession(session, applySessionSeq);
    } catch (err) {
      console.error('[Auth] onAuthStateChange handler error:', err);
    }
  });
  authSubscription = listener?.subscription || null;
}

// ─── Google 로그인 ────────────────────────────────────────────────────────────

/**
 * loginWithGoogle
 *
 * [수정 사항]
 * - OAuth 리다이렉트 전에 isLoggingIn 를 false 로 명시적 초기화
 *   (이전 버전: 성공 경로에서 절대 false 로 돌아오지 않아 취소 후 재시도 불가)
 * - 3분 타임아웃 후 isLoggingIn 자동 리셋
 *   (네트워크 오류나 팝업 차단으로 redirect 가 안 일어났을 때 복구)
 */
export async function loginWithGoogle(options = {}) {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  // 이미 OAuth 리다이렉트 중이면 토스트만 보여주고 중단
  // (중복 클릭 방지 — 단, 페이지가 새로고침되면 플래그는 초기화됨)
  if (googleLoginTimeoutId !== null) {
    showToast('Google 로그인 진행 중입니다. 잠시 기다려 주세요.', 'info');
    return null;
  }

  // 3분 후 자동 해제 (OAuth 팝업 차단·취소 등으로 redirect가 안 된 경우)
  googleLoginTimeoutId = setTimeout(() => {
    googleLoginTimeoutId = null;
  }, 3 * 60 * 1000);

  try {
    const redirectTo = options.redirectTo || `${window.location.origin}/index.html`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) throw error;
    // 성공 → 리다이렉트가 시작됨 (페이지가 이동하므로 JS 상태는 자연히 초기화)
    return data;
  } catch (error) {
    // 오류 시 즉시 해제
    clearTimeout(googleLoginTimeoutId);
    googleLoginTimeoutId = null;

    if (String(error.message || '').toLowerCase().includes('fetch')) {
      showToast('네트워크 연결을 확인해 주세요.', 'error');
    } else {
      showToast(`Google 로그인 실패: ${error.message}`, 'error');
    }
    return null;
  }
}

// ─── 이메일 회원가입 ──────────────────────────────────────────────────────────

export async function signupWithEmail(email, password, name) {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  const signupBtn = document.getElementById('gate-email-signup');
  const originalText = signupBtn?.textContent || '회원가입';
  if (signupBtn) {
    signupBtn.disabled = true;
    signupBtn.textContent = '가입 처리 중...';
    signupBtn.style.opacity = '0.7';
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name || '사용자' } },
      }),
      12000,
      'signup',
    );

    if (error) throw error;

    if (data.user && !data.user.confirmed_at && data.user.identities?.length === 0) {
      showToast('이미 가입된 이메일입니다. 로그인을 시도해 주세요.', 'warning');
      return null;
    }

    showToast(`${name || '사용자'}님, 가입이 완료되었습니다. 메일함을 확인해 인증을 완료해 주세요.`, 'success', 6000);
    return toCompatUser(data.user);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      showToast('이미 가입된 이메일입니다. 로그인을 시도해 주세요.', 'warning');
    } else if (msg.includes('password')) {
      showToast('비밀번호는 6자 이상이어야 합니다.', 'warning');
    } else if (msg.includes('timeout')) {
      showToast('서버 응답이 느립니다. 잠시 후 다시 시도해 주세요.', 'error');
    } else {
      showToast(`회원가입 실패: ${error.message}`, 'error');
    }
    return null;
  } finally {
    if (signupBtn) {
      signupBtn.disabled = false;
      signupBtn.textContent = originalText;
      signupBtn.style.opacity = '1';
    }
  }
}

// ─── 이메일 로그인 ────────────────────────────────────────────────────────────

/**
 * loginWithEmail
 *
 * [수정 사항]
 * - isLoggingIn 플래그를 함수 진입 즉시 확인 → 이중 클릭 완전 차단
 *   (이전: pre-signout 3초 동안 두 번째 클릭이 통과)
 * - pre-signout 시작 전 버튼 즉시 비활성화
 */
export async function loginWithEmail(email, password) {
  if (!isSupabaseConfigured) {
    showToast('로그인 설정이 누락되었습니다. 관리자에게 Supabase URL/키를 확인해 달라고 요청해 주세요.', 'warning');
    return null;
  }

  // ── 이중 클릭 / 중복 요청 방지 ──────────────────────────────────────────────
  if (isLoggingIn) {
    showToast('로그인 처리 중입니다. 잠시만 기다려 주세요.', 'info');
    return null;
  }
  isLoggingIn = true;

  const loginBtn = document.getElementById('gate-email-login');
  const originalText = loginBtn?.textContent || '이메일로 로그인';

  // 버튼은 플래그 세팅 직후 즉시 비활성화 (pre-signout 3초 동안도 차단)
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = '로그인 중...';
    loginBtn.style.opacity = '0.7';
  }

  document.getElementById('login-error-msg')?.remove();

  try {
    // ── Supabase 클라이언트 내부 상태 초기화 ─────────────────────────────────
    // localStorage 정리만으로는 클라이언트 내부 토큰/갱신 상태가 남아
    // signInWithPassword 충돌 또는 fetch timeout의 근본 원인이 됨
    try {
      await withTimeout(supabase.auth.signOut({ scope: 'local' }), 3000, 'pre-login-signout');
    } catch {
      // signOut 실패해도 로그인 계속
    }
    purgeAuthStorage({ includeSupabaseSession: true });

    // ── 로그인 시도 (재시도 포함) ─────────────────────────────────────────────
    async function attemptLogin(attempt = 1) {
      const timeout = attempt === 1 ? 15000 : 20000;
      try {
        const { data, error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          timeout,
          'login',
        );
        if (error) throw error;
        return data.user;
      } catch (err) {
        const m = String(err?.message || '').toLowerCase();
        const isNetwork = m.includes('fetch') || m.includes('network') || m.includes('timeout') || m.includes('abort');
        if (isNetwork && attempt === 1) {
          // 1차 실패 → 1.5초 대기 후 directPasswordLogin fallback 시도
          await new Promise(r => setTimeout(r, 1500));
          purgeAuthStorage({ includeSupabaseSession: true });
          const fallbackUser = await directPasswordLogin(email, password);
          return fallbackUser;
        }
        throw err;
      }
    }

    const user = await attemptLogin(1).catch(async (err) => {
      const m = String(err?.message || '').toLowerCase();
      const isNetwork = m.includes('fetch') || m.includes('network') || m.includes('timeout') || m.includes('abort');
      if (isNetwork) {
        await new Promise(r => setTimeout(r, 2000));
        return attemptLogin(2);
      }
      throw err;
    });

    showToast(`${user?.user_metadata?.full_name || '사용자'}님, 로그인되었습니다.`, 'success');
    return toCompatUser(user);

  } catch (error) {
    const lowerMessage = String(error?.message || '').toLowerCase();

    let errorMsg = '';
    let showResetAction = false;

    const isConnectivity =
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('network') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('abort');

    if (
      lowerMessage.includes('invalid login') ||
      lowerMessage.includes('invalid credentials') ||
      lowerMessage.includes('email or password') ||
      lowerMessage.includes('invalid email or password')
    ) {
      errorMsg = '이메일 또는 비밀번호가 올바르지 않습니다.';
      showResetAction = true;
      showToast('로그인 정보를 확인해 주세요.', 'error', 3000);
    } else if (lowerMessage.includes('email not confirmed')) {
      errorMsg = '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.';
      showToast(errorMsg, 'warning', 5000);
    } else if (isConnectivity) {
      const debug = getSupabaseDebugInfo();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        errorMsg = '현재 오프라인 상태입니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
      } else {
        errorMsg = '인증 서버 응답이 지연되고 있습니다. [다시 시도] 버튼을 눌러주세요.';
      }
      console.error('[Auth] Network/login error (after retries)', {
        message: error?.message,
        name: error?.name,
        online: navigator?.onLine,
        supabase: debug,
      });
      showToast(errorMsg, 'error', 8000);
    } else {
      errorMsg = `로그인 실패: ${error?.message || '알 수 없는 오류'}`;
      showToast(errorMsg, 'error');
    }

    renderVanillaLoginError({
      loginBtn,
      email,
      errorMsg,
      showResetAction,
      onRetry: () => loginWithEmail(email, password),
      onResetPassword: resetPassword,
    });
    return null;

  } finally {
    // isLoggingIn 은 applySession 완료 시 false 로 돌아오지만,
    // 로그인 실패 경로에서는 applySession 이 호출되지 않으므로 여기서 직접 해제
    isLoggingIn = false;

    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
      loginBtn.style.opacity = '1';
    }
  }
}

// ─── 비밀번호 재설정 ──────────────────────────────────────────────────────────

export async function resetPassword(email) {
  if (!isSupabaseConfigured) {
    showToast('로그인 설정이 누락되었습니다.', 'warning');
    return false;
  }

  try {
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?type=recovery`,
      }),
      12000,
      'reset-password',
    );

    if (error) throw error;
    showToast('비밀번호 재설정 메일을 전송했습니다. 메일함을 확인해 주세요.', 'success', 6000);
    return true;
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (msg.includes('timeout')) {
      showToast('서버 응답이 느립니다. 잠시 후 다시 시도해 주세요.', 'error');
    } else if (msg.includes('rate limit') || msg.includes('too many')) {
      showToast('너무 많은 요청이 전송됐습니다. 잠시 후 다시 시도해 주세요.', 'warning');
    } else {
      showToast(`전송 실패: ${error.message}`, 'error');
    }
    return false;
  }
}

/**
 * 비밀번호 재설정 링크 클릭 후 새 비밀번호 입력 모달
 */
function showPasswordRecoveryModal() {
  const existing = document.getElementById('pw-recovery-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pw-recovery-modal';
  overlay.style.cssText = [
    'position:fixed; inset:0; z-index:9999;',
    'background:rgba(0,0,0,0.7); backdrop-filter:blur(4px);',
    'display:flex; align-items:center; justify-content:center;',
  ].join('');

  overlay.innerHTML = `
    <div style="background:var(--bg-card,#1e293b); border:1px solid rgba(255,255,255,0.1);
                border-radius:16px; padding:40px 32px; width:100%; max-width:400px;
                box-shadow:0 24px 80px rgba(0,0,0,0.5); font-family:inherit;">
      <div style="text-align:center; margin-bottom:24px;">
        <div style="font-size:40px; margin-bottom:10px;">🔑</div>
        <h2 style="font-size:18px; font-weight:800; color:var(--text,#f0f4f8); margin-bottom:6px;">새 비밀번호 설정</h2>
        <p style="font-size:13px; color:var(--text-muted,#94a3b8);">사용할 새 비밀번호를 입력해 주세요.</p>
      </div>
      <div id="pw-recovery-err" style="display:none; margin-bottom:14px; padding:10px 14px;
           background:rgba(239,68,68,0.1); border-radius:8px;
           color:#ef4444; font-size:13px; text-align:center;"></div>
      <input id="pw-recovery-new" type="password" placeholder="새 비밀번호 (8자 이상)"
        style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);
               background:rgba(255,255,255,0.05); color:var(--text,#f0f4f8); font-size:14px;
               margin-bottom:10px; outline:none; box-sizing:border-box;" />
      <input id="pw-recovery-confirm" type="password" placeholder="새 비밀번호 확인"
        style="width:100%; padding:12px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);
               background:rgba(255,255,255,0.05); color:var(--text,#f0f4f8); font-size:14px;
               margin-bottom:20px; outline:none; box-sizing:border-box;" />
      <button id="pw-recovery-btn"
        style="width:100%; padding:13px; border-radius:10px; border:none; cursor:pointer;
               background:linear-gradient(135deg,#3b82f6,#6366f1); color:#fff;
               font-size:15px; font-weight:700; font-family:inherit; transition:opacity 0.2s;">
        비밀번호 변경하기
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  const newPw = overlay.querySelector('#pw-recovery-new');
  const confirmPw = overlay.querySelector('#pw-recovery-confirm');
  const btn = overlay.querySelector('#pw-recovery-btn');
  const errEl = overlay.querySelector('#pw-recovery-err');

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }

  btn.addEventListener('click', async () => {
    const pw = newPw.value.trim();
    const cpw = confirmPw.value.trim();
    errEl.style.display = 'none';

    if (pw.length < 8) { showErr('비밀번호는 8자 이상이어야 합니다.'); return; }
    if (pw !== cpw) { showErr('비밀번호가 일치하지 않습니다.'); return; }

    btn.disabled = true;
    btn.textContent = '변경 중...';

    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      btn.disabled = false;
      btn.textContent = '비밀번호 변경하기';
      showErr(`변경 실패: ${error.message}`);
      return;
    }

    overlay.remove();
    showToast('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.', 'success', 5000);
    // 변경 후 로그아웃 → 로그인 화면으로
    await supabase.auth.signOut({ scope: 'local' });
  });
}

// ─── 로그아웃 ─────────────────────────────────────────────────────────────────

/**
 * logout
 *
 * [수정 사항]
 * - applySessionSeq 증가 → 진행 중인 applySession 이 로그아웃 후 완료돼도
 *   seq 불일치로 자동 폐기 (stale 프로필 덮어쓰기 race condition 해소)
 * - Google OAuth 타임아웃 타이머도 함께 해제
 */
export async function logout() {
  if (!isSupabaseConfigured) return false;

  // 진행 중인 applySession 결과를 무효화
  applySessionSeq += 1;

  // Google 로그인 타이머 해제
  if (googleLoginTimeoutId !== null) {
    clearTimeout(googleLoginTimeoutId);
    googleLoginTimeoutId = null;
  }

  let signOutError = null;
  try {
    const { error } = await withTimeout(
      supabase.auth.signOut({ scope: 'local' }),
      8000,
      'logout',
    );
    signOutError = error || null;
  } catch (error) {
    signOutError = error;
  } finally {
    purgeAuthStorage({ includeSupabaseSession: true });
    // 부트스트랩 차단 상태 초기화 — 다음 로그인(다른 계정 포함)이 정상 부트스트랩되도록
    profileBootstrapBlocked = false;
    profileBootstrapInflight = null;
    try { localStorage.removeItem(_BS_BLOCKED_KEY); } catch (_) {}
    currentUser = null;
    userProfile = null;
    isLoggingIn = false;
    emitAuthChanged();
  }

  if (signOutError) {
    showToast(`로그아웃 처리 경고: ${signOutError.message}`, 'warning');
    return false;
  }

  showToast('로그아웃되었습니다.', 'info');
  return true;
}

// ─── 기타 공개 API ────────────────────────────────────────────────────────────

export function disposeAuth() {
  authSubscription?.unsubscribe?.();
  authSubscription = null;
  authInitialized = false;
}

export function getCurrentUser() {
  return currentUser;
}

export function getUserProfileData() {
  return userProfile;
}

export function hasRole(requiredRole) {
  if (!userProfile) return false;
  return hasRequiredRole(userProfile.role, requiredRole);
}

export function hasPlan(requiredPlan) {
  if (!userProfile) return false;
  return hasRequiredPlan(userProfile.plan, requiredPlan);
}

export const ROLE_LABELS = {
  viewer:  '열람자(Viewer)',
  staff:   '직원(Staff)',
  manager: '매니저(Manager)',
  admin:   '관리자(Admin)',
};

export const PAGE_MIN_ROLE = {
  home:         'viewer',
  inventory:    'viewer',
  summary:      'viewer',
  ledger:       'viewer',
  dashboard:    'viewer',
  forecast:     'viewer',
  inout:        'staff',
  transfer:     'staff',
  scanner:      'staff',
  labels:       'staff',
  vendors:      'staff',
  upload:       'staff',
  mapping:      'staff',
  stocktake:    'manager',
  bulk:         'manager',
  costing:      'manager',
  accounts:     'manager',
  orders:       'manager',
  sales:        'manager',
  profit:       'manager',
  'weekly-report': 'manager',
  'tax-reports':'manager',
  warehouses:   'admin',
  settings:     'admin',
  roles:        'admin',
  api:          'admin',
  team:         'admin',
  backup:       'admin',
  // 인사·급여 모듈
  'hr-dashboard': 'manager',
  employees:      'staff',
  attendance:     'staff',
  payroll:        'admin',
  leaves:         'staff',
  severance:      'manager',
  'yearend-settlement': 'manager',
};

export const ACTION_MIN_ROLE = {
  'item:create':        'staff',
  'item:edit':          'staff',
  'item:delete':        'manager',
  'item:bulk':          'manager',
  'inout:create':       'staff',
  'inout:delete':       'manager',
  'inout:bulk':         'manager',
  'transfer:create':    'staff',
  'transfer:delete':    'manager',
  'stocktake:adjust':   'manager',
  'stocktake:complete': 'manager',
  'vendor:create':      'staff',
  'vendor:edit':        'staff',
  'vendor:delete':      'manager',
  'warehouse:create':   'admin',
  'warehouse:edit':     'admin',
  'warehouse:delete':   'admin',
  'settings:save':      'admin',
  'backup:restore':     'admin',
  'order:create':       'manager',
  'order:delete':       'manager',
  // 인사·급여 액션
  'payroll:confirm':    'admin',
  'payroll:export':     'admin',
  'payroll:email':      'admin',
  'employee:viewRRN':   'admin',
  'employee:bulkEdit':  'admin',
  'employee:create':    'manager',
  'employee:edit':      'manager',
  'employee:delete':    'admin',
  'attendance:edit':    'manager',
  'leave:approve':      'manager',
};

export function canAction(actionKey) {
  if (!isSupabaseConfigured) return true;
  if (!userProfile) return false;
  const required = AUTH_ACTION_MIN_ROLE[actionKey] || ACTION_MIN_ROLE[actionKey];
  if (!required) return true;
  return hasRole(required);
}

export function canAccessByRole(pageName) {
  if (!isSupabaseConfigured) return true;
  if (!userProfile) return false;
  const minRole = AUTH_PAGE_MIN_ROLE[pageName] || PAGE_MIN_ROLE[pageName];
  if (!minRole) return true;
  return hasRole(minRole);
}

export function renderLoginScreen(container) {
  return renderVanillaLoginScreen(container, {
    onGoogleLogin: () => loginWithGoogle(),
  });

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
      <div style="text-align:center; max-width:400px; padding:40px;">
        <div style="font-size:48px; margin-bottom:16px;">INVEX</div>
        <h1 style="font-size:28px; font-weight:800; margin-bottom:8px;">INVEX</h1>
        <p style="color:var(--text-muted); margin-bottom:32px; font-size:14px;">
          중소기업 맞춤 재고/경영 관리 시스템
        </p>
        <button class="btn btn-primary btn-lg" id="btn-google-login" style="width:100%; gap:12px; padding:16px; font-size:16px; background:#ffffff; color:#0f172a; border:1px solid rgba(255,255,255,0.08); box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <svg width="28" height="28" viewBox="0 0 48 48" aria-hidden="true" style="display:block;"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
          Google 계정으로 시작하기
        </button>
      </div>
    </div>
  `;

  container.querySelector('#btn-google-login')?.addEventListener('click', async () => {
    await loginWithGoogle();
  });
}
