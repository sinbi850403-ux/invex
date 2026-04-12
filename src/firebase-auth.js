/**
 * firebase-auth.js
 * NOTE: Existing import path is kept for compatibility.
 * Auth provider has been migrated to Supabase.
 */

import { showToast } from './toast.js';
import { supabase, isSupabaseConfigured } from './supabase-config.js';

let currentUser = null;
let userProfile = null;
let authChangeCallbacks = [];
let authSubscription = null;
let authInitialized = false;
let recoveryFlowInProgress = false;

function normalizeUser(user) {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  const provider =
    user.app_metadata?.provider ||
    user.identities?.[0]?.provider ||
    metadata.provider ||
    'email';

  return {
    uid: user.id,
    id: user.id,
    email: user.email || '',
    displayName: metadata.name || metadata.full_name || user.email || '사용자',
    photoURL: metadata.avatar_url || '',
    providerData: [{ providerId: provider === 'google' ? 'google.com' : 'password' }],
    createdAt: user.created_at || null,
    raw: user,
  };
}

function buildProfile(user) {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  const appMetadata = user.app_metadata || {};
  return {
    uid: user.id,
    email: user.email || '',
    name: metadata.name || metadata.full_name || user.email || '사용자',
    photoURL: metadata.avatar_url || '',
    role: metadata.role || appMetadata.role || 'admin',
    plan: metadata.plan || appMetadata.plan || 'free',
    createdAt: user.created_at || new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };
}

function emitAuthChange() {
  authChangeCallbacks.forEach((cb) => cb(currentUser, userProfile));
}

async function handlePasswordRecovery() {
  if (!supabase || recoveryFlowInProgress) return;
  recoveryFlowInProgress = true;
  try {
    showToast('비밀번호 재설정 모드입니다. 새 비밀번호를 입력해 주세요.', 'info');
    const nextPassword = window.prompt('새 비밀번호를 입력해 주세요. (6자 이상)');
    if (!nextPassword) {
      showToast('비밀번호 재설정이 취소되었습니다.', 'info');
      return;
    }
    if (nextPassword.length < 6) {
      showToast('비밀번호는 6자 이상이어야 합니다.', 'warning');
      return;
    }
    const nextPasswordConfirm = window.prompt('새 비밀번호를 다시 입력해 주세요.');
    if (nextPassword !== nextPasswordConfirm) {
      showToast('비밀번호 확인이 일치하지 않습니다.', 'warning');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      showToast('비밀번호 재설정 실패: ' + error.message, 'error');
      return;
    }

    showToast('비밀번호가 재설정되었습니다. 새 비밀번호로 로그인해 주세요.', 'success');
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = `${window.location.origin}${window.location.pathname}`;
  } finally {
    recoveryFlowInProgress = false;
  }
}

export function isAuthConfigured() {
  return isSupabaseConfigured;
}

export function initAuth(callback) {
  if (callback) authChangeCallbacks.push(callback);

  if (!isSupabaseConfigured || !supabase) {
    currentUser = null;
    userProfile = { role: 'admin', plan: 'free', name: '로컬 사용자' };
    if (callback) callback(null, userProfile);
    return;
  }

  if (authInitialized) return;
  authInitialized = true;

  supabase.auth.getSession().then(({ data }) => {
    const sessionUser = data?.session?.user || null;
    currentUser = normalizeUser(sessionUser);
    userProfile = buildProfile(sessionUser);
    emitAuthChange();
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (_event === 'PASSWORD_RECOVERY') {
      handlePasswordRecovery();
    }
    const sessionUser = session?.user || null;
    currentUser = normalizeUser(sessionUser);
    userProfile = buildProfile(sessionUser);
    emitAuthChange();
  });
  authSubscription = data?.subscription || null;
}

export async function loginWithGoogle() {
  if (!isSupabaseConfigured || !supabase) {
    showToast('Supabase 설정이 필요합니다. .env 값을 확인해 주세요.', 'warning');
    return null;
  }

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) {
    showToast('Google 로그인 실패: ' + error.message, 'error');
    return null;
  }

  showToast('Google 로그인으로 이동합니다.', 'info');
  return null;
}

export async function signupWithEmail(email, password, name) {
  if (!isSupabaseConfigured || !supabase) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name || '사용자',
      },
      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
    },
  });

  if (error) {
    showToast('회원가입 실패: ' + error.message, 'error');
    return null;
  }

  if (data?.user && !data.session) {
    showToast('가입 완료! 이메일 인증 후 로그인해 주세요.', 'success');
  } else {
    showToast(`${name || '사용자'}님, 환영합니다!`, 'success');
  }
  return normalizeUser(data?.user || null);
}

export async function loginWithEmail(email, password) {
  if (!isSupabaseConfigured || !supabase) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    showToast('로그인 실패: ' + error.message, 'error');
    return null;
  }

  const user = normalizeUser(data?.user || null);
  showToast(`${user?.displayName || '사용자'}님, 환영합니다!`, 'success');
  return user;
}

export async function resetPassword(email) {
  if (!isSupabaseConfigured || !supabase) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return false;
  }

  const redirectTo = `${window.location.origin}/`;
  let result = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  // Supabase Redirect URL 미등록 환경에서도 동작하도록 1회 재시도
  if (result.error?.message?.toLowerCase?.().includes('redirect')) {
    result = await supabase.auth.resetPasswordForEmail(email);
  }

  if (result.error) {
    if (String(result.error.message || '').toLowerCase().includes('rate limit')) {
      showToast('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'warning');
      return false;
    }
    showToast('비밀번호 재설정 메일 발송 실패: ' + result.error.message, 'error');
    return false;
  }

  showToast('메일을 보냈습니다. 받은편지함/스팸함을 확인해 주세요.', 'success');
  return true;
}

export async function updateProfileName(name) {
  if (!currentUser || !supabase) return false;
  const { error } = await supabase.auth.updateUser({ data: { name } });
  if (error) {
    showToast('이름 변경 실패: ' + error.message, 'error');
    return false;
  }
  if (userProfile) userProfile.name = name;
  if (currentUser) currentUser.displayName = name;
  emitAuthChange();
  return true;
}

export async function changePassword(currentPassword, newPassword) {
  if (!currentUser || !supabase) return false;

  // Supabase는 보통 현재 비밀번호 재입력 없이 변경 가능.
  // 안전하게 현재 비밀번호를 한번 확인한다.
  const email = currentUser.email;
  if (email && currentPassword) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (signInError) {
      showToast('현재 비밀번호가 올바르지 않습니다.', 'error');
      return false;
    }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    showToast('비밀번호 변경 실패: ' + error.message, 'error');
    return false;
  }
  showToast('비밀번호가 변경되었습니다.', 'success');
  return true;
}

export async function deleteAccount() {
  showToast('계정 삭제는 현재 관리자 처리 방식으로 운영 중입니다.', 'warning');
  return false;
}

export async function logout() {
  if (!isSupabaseConfigured || !supabase) {
    currentUser = null;
    userProfile = null;
    emitAuthChange();
    showToast('로그아웃되었습니다.', 'info');
    return true;
  }

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  currentUser = null;
  userProfile = null;
  emitAuthChange();

  if (error) {
    showToast('로그아웃 처리 중 경고: ' + error.message, 'warning');
    return false;
  }
  showToast('로그아웃되었습니다.', 'info');
  return true;
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
        <div style="font-size:48px; margin-bottom:16px;">📦</div>
        <h1 style="font-size:28px; font-weight:800; margin-bottom:8px;">INVEX</h1>
        <p style="color:var(--text-muted); margin-bottom:32px; font-size:14px;">
          중소기업 맞춤형 재고경영 관리 서비스
        </p>
        <button class="btn btn-primary btn-lg" id="btn-google-login" style="width:100%; gap:8px; font-size:15px;">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="" />
          Google 계정으로 시작하기
        </button>
      </div>
    </div>
  `;

  container.querySelector('#btn-google-login')?.addEventListener('click', async () => {
    await loginWithGoogle();
  });
}

export function disposeAuth() {
  authSubscription?.unsubscribe?.();
  authSubscription = null;
  authInitialized = false;
}
