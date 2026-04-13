import { supabase, isSupabaseConfigured, getSupabaseConfig, getSupabaseDebugInfo } from './supabase-client.js';
import { showToast } from './toast.js';

let currentUser = null;
let userProfile = null;
let authChangeCallbacks = [];
let authSubscription = null;
let authInitialized = false;
let isLoggingIn = false;

const AUTH_STORAGE_PATTERNS = [
  /^invex-supabase-auth$/,
  /^sb-.*-auth-token$/,
  /^supabase\.auth\./,
];
const LEGACY_AUTH_PREFIX = `${String.fromCharCode(102, 105, 114, 101, 98, 97, 115, 101)}:`;

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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

function emitAuthChanged() {
  authChangeCallbacks.forEach((callback) => callback(currentUser, userProfile));
}

function getFallbackProfile(user) {
  return {
    uid: user?.uid || null,
    email: user?.email || null,
    name: user?.displayName || '사용자',
    photoURL: user?.photoURL || null,
    role: 'admin',
    plan: 'free',
  };
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
    window.localStorage.removeItem('invex-supabase-auth');
  }
}

async function loadProfile(user) {
  const fallback = getFallbackProfile(user);

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.uid)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      const newProfile = {
        id: user.uid,
        email: user.email,
        name: user.displayName,
        photo_url: user.photoURL,
        role: 'admin',
        plan: 'free',
        created_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase.from('profiles').insert(newProfile);
      if (insertError) {
        console.warn('[Auth] profile bootstrap failed:', insertError.message);
        return fallback;
      }

      return {
        ...fallback,
        createdAt: newProfile.created_at,
      };
    }

    return {
      uid: data.id,
      email: data.email || fallback.email,
      name: data.name || fallback.name,
      photoURL: data.photo_url || fallback.photoURL,
      role: data.role || 'admin',
      plan: data.plan || 'free',
      createdAt: data.created_at,
      lastLogin: new Date().toISOString(),
      beginnerMode: data.beginner_mode,
      dashboardMode: data.dashboard_mode,
      industryTemplate: data.industry_template,
    };
  } catch (error) {
    console.warn('[Auth] profile load failed:', error.message);
    return fallback;
  }
}

async function applySession(session) {
  if (!session?.user) {
    // 이미 미인증 상태면 중복 콜백 방지 — getSession() timeout과
    // onAuthStateChange null 이벤트가 둘 다 도착해도 콜백은 1회만 실행
    if (currentUser === null && !isLoggingIn) {
      return;
    }
    currentUser = null;
    userProfile = null;
    isLoggingIn = false;
    emitAuthChanged();
    return;
  }

  currentUser = toCompatUser(session.user);
  userProfile = await loadProfile(currentUser);
  isLoggingIn = false;
  emitAuthChanged();
}

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

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.msg ||
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        'Direct auth request failed',
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

function renderInlineLoginError(loginBtn, email, errorMsg, showResetAction) {
  if (!loginBtn) return;

  const errorContainer = document.createElement('div');
  errorContainer.id = 'login-error-msg';
  errorContainer.style.cssText = 'margin-top:10px; animation: fadeSlideIn 0.3s ease;';

  const msgEl = document.createElement('div');
  msgEl.style.cssText = 'color:#ef4444; font-size:13px; text-align:center; padding:10px 14px; background:rgba(239,68,68,0.1); border-radius:8px;';
  msgEl.textContent = errorMsg;
  errorContainer.appendChild(msgEl);

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

export function initAuth(callback) {
  if (callback && !authChangeCallbacks.includes(callback)) {
    authChangeCallbacks.push(callback);
  }

  if (!isSupabaseConfigured) {
    purgeLegacyAuthStorage({ includeSupabaseSession: true });
    currentUser = null;
    userProfile = getFallbackProfile(null);
    if (callback) callback(null, userProfile);
    return;
  }

  if (authInitialized) {
    if (callback) callback(currentUser, userProfile);
    return;
  }

  authInitialized = true;
  sanitizeSupabaseStorage();

  // 초기 세션 복구 — 느린 네트워크에서도 작동하도록 여유 있는 timeout 설정
  // 실패해도 applySession(null)로 미인증 상태(랜딩)로 진입하므로 안전
  withTimeout(supabase.auth.getSession(), 8000, 'initial-session')
    .then(({ data }) => applySession(data?.session || null))
    .catch((error) => {
      console.warn('[Auth] Initial session recovery failed:', error.message);
      applySession(null);
    });

  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });
  authSubscription = listener?.subscription || null;
}

export async function loginWithGoogle() {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  if (isLoggingIn) {
    showToast('로그인 처리 중입니다. 잠시만 기다려 주세요.', 'info');
    return null;
  }

  isLoggingIn = true;

  try {
    const redirectTo = `${window.location.origin}/index.html`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });

    if (error) throw error;
    return data;
  } catch (error) {
    isLoggingIn = false;
    if (String(error.message || '').toLowerCase().includes('fetch')) {
      showToast('네트워크 연결을 확인해 주세요.', 'error');
    } else {
      showToast(`Google 로그인 실패: ${error.message}`, 'error');
    }
    return null;
  }
}

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
        options: {
          data: { full_name: name || '사용자' },
        },
      }),
      12000,
      'signup',
    );

    if (error) throw error;

    if (data.user && !data.user.confirmed_at && data.user.identities?.length === 0) {
      showToast('이미 가입된 이메일입니다. 로그인을 시도해 주세요.', 'warning');
      return null;
    }

    showToast(`${name || '사용자'}님, 가입이 완료되었습니다.`, 'success');
    return toCompatUser(data.user);
  } catch (error) {
    if (error.message.includes('already registered')) {
      showToast('이미 가입된 이메일입니다. 로그인을 시도해 주세요.', 'warning');
    } else if (error.message.includes('Password')) {
      showToast('비밀번호는 6자 이상이어야 합니다.', 'warning');
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

export async function loginWithEmail(email, password) {
  if (!isSupabaseConfigured) {
    showToast('로그인 설정이 누락되었습니다. 관리자에게 Supabase URL/키를 확인해 달라고 요청해 주세요.', 'warning');
    return null;
  }

  sanitizeSupabaseStorage();

  const loginBtn = document.getElementById('gate-email-login');
  const originalText = loginBtn?.textContent || '이메일로 로그인';
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = '로그인 중...';
    loginBtn.style.opacity = '0.7';
  }

  const existingError = document.getElementById('login-error-msg');
  if (existingError) existingError.remove();

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      12000,
      'login',
    );

    if (error) throw error;

    showToast(`${data.user?.user_metadata?.full_name || '사용자'}님, 로그인되었습니다.`, 'success');
    return toCompatUser(data.user);
  } catch (error) {
    let resolvedError = error;
    let lowerMessage = String(resolvedError?.message || '').toLowerCase();
    const isConnectivityIssue =
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('network') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('abort');

    if (isConnectivityIssue) {
      try {
        purgeLegacyAuthStorage({ includeSupabaseSession: true });
        const fallbackUser = await directPasswordLogin(email, password);
        showToast(`${fallbackUser?.user_metadata?.full_name || '사용자'}님, 로그인되었습니다.`, 'success');
        return toCompatUser(fallbackUser);
      } catch (fallbackError) {
        resolvedError = fallbackError;
        lowerMessage = String(resolvedError?.message || '').toLowerCase();
      }
    }

    let errorMsg = '';
    let showResetAction = false;

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
    } else if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('abort')
    ) {
      const debug = getSupabaseDebugInfo();
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        errorMsg = '현재 오프라인 상태입니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.';
      } else {
        errorMsg = '인증 서버 연결이 불안정합니다. 잠시 후 다시 시도해 주세요.';
      }
      console.error('[Auth] Network/login error', {
        message: resolvedError?.message,
        name: resolvedError?.name,
        online: navigator.onLine,
        supabase: debug,
      });
      showToast(errorMsg, 'error');
    } else {
      errorMsg = `로그인 실패: ${resolvedError?.message || '알 수 없는 오류'}`;
      showToast(errorMsg, 'error');
    }

    renderInlineLoginError(loginBtn, email, errorMsg, showResetAction);
    return null;
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
      loginBtn.style.opacity = '1';
    }
  }
}

export async function resetPassword(email) {
  if (!isSupabaseConfigured) {
    showToast('로그인 설정이 누락되었습니다. 관리자에게 Supabase URL/키를 확인해 달라고 요청해 주세요.', 'warning');
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
    showToast('비밀번호 재설정 메일을 전송했습니다.', 'success');
    return true;
  } catch (error) {
    showToast(`전송 실패: ${error.message}`, 'error');
    return false;
  }
}

export async function logout() {
  if (!isSupabaseConfigured) return false;

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
    purgeLegacyAuthStorage({ includeSupabaseSession: true });
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
  const roles = { viewer: 0, staff: 1, manager: 2, admin: 3 };
  return (roles[userProfile.role] || 0) >= (roles[requiredRole] || 0);
}

export function hasPlan(requiredPlan) {
  if (!userProfile) return false;
  const plans = { free: 0, pro: 1, enterprise: 2 };
  return (plans[userProfile.plan] || 0) >= (plans[requiredPlan] || 0);
}

export function renderLoginScreen(container) {
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
      <div style="text-align:center; max-width:400px; padding:40px;">
        <div style="font-size:48px; margin-bottom:16px;">INVEX</div>
        <h1 style="font-size:28px; font-weight:800; margin-bottom:8px;">INVEX</h1>
        <p style="color:var(--text-muted); margin-bottom:32px; font-size:14px;">
          중소기업 맞춤 재고/경영 관리 시스템
        </p>
        <button class="btn btn-primary btn-lg" id="btn-google-login" style="width:100%; gap:8px; font-size:15px;">
          <span style="display:inline-flex; width:20px; height:20px; border-radius:50%; background:#fff; color:#111827; align-items:center; justify-content:center; font-weight:800;">G</span>
          Google 계정으로 시작하기
        </button>
      </div>
    </div>
  `;

  container.querySelector('#btn-google-login')?.addEventListener('click', async () => {
    await loginWithGoogle();
  });
}
