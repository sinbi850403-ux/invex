/**
 * firebase-auth.js - 인증 모듈 (Supabase 전환 완료)
 *
 * 왜 파일명을 유지? → main.js 등 20+ 파일이 이 파일을 import하고 있어서
 * 파일명을 바꾸면 전부 수정해야 함. 인터페이스만 유지하고 내부를 교체.
 *
 * 동작 방식:
 * 1. Supabase가 설정되어 있으면 → Supabase Auth 사용
 * 2. Supabase 미설정이면 → 로컬 모드 (개발/오프라인용)
 */

import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { showToast } from './toast.js';

// 현재 로그인 사용자
let currentUser = null;
let userProfile = null;

// 인증 상태 변화 리스너 콜백
let authChangeCallbacks = [];
let authSubscription = null;
let authInitialized = false;

// 로그인 진행 중 플래그 — 이중 클릭 방지
let _isLoggingIn = false;

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timeout`));
      }, ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Supabase user → 기존 코드 호환 형태로 변환
// 왜? → main.js가 user.uid, user.displayName, user.photoURL 을 참조하고 있어서
function toCompatUser(supabaseUser) {
  if (!supabaseUser) return null;
  return {
    uid: supabaseUser.id,
    email: supabaseUser.email,
    displayName: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '사용자',
    photoURL: supabaseUser.user_metadata?.avatar_url || null,
    // 원본 Supabase user도 보존
    _raw: supabaseUser,
  };
}

/**
 * 인증 상태 변화 감지 초기화
 * main.js에서 initAuth(callback) 형태로 호출됨
 */
export function initAuth(callback) {
  if (callback && !authChangeCallbacks.includes(callback)) {
    authChangeCallbacks.push(callback);
  }

  if (!isSupabaseConfigured) {
    // Supabase 미설정 시 → 로컬 모드로 동작 (개발 편의)
    currentUser = null;
    userProfile = { role: 'admin', plan: 'free', name: '로컬 사용자' };
    if (callback) callback(null, userProfile);
    return;
  }

  if (authInitialized) {
    if (callback) callback(currentUser, userProfile);
    return;
  }
  authInitialized = true;

  const emitAuthChanged = () => {
    authChangeCallbacks.forEach(cb => cb(currentUser, userProfile));
  };

  const applySession = async (session) => {
    if (session?.user) {
      currentUser = toCompatUser(session.user);

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error && error.code === 'PGRST116') {
          const newProfile = {
            id: session.user.id,
            name: currentUser.displayName,
            email: session.user.email,
            photo_url: currentUser.photoURL,
            plan: 'free',
            role: 'admin',
            created_at: new Date().toISOString(),
          };
          await supabase.from('profiles').insert(newProfile);
          userProfile = {
            uid: session.user.id,
            email: session.user.email,
            name: currentUser.displayName,
            photoURL: currentUser.photoURL,
            role: 'admin',
            plan: 'free',
            createdAt: newProfile.created_at,
          };
        } else if (profile) {
          userProfile = {
            uid: profile.id,
            email: profile.email,
            name: profile.name || currentUser.displayName,
            photoURL: profile.photo_url || currentUser.photoURL,
            role: 'admin',
            plan: profile.plan || 'free',
            createdAt: profile.created_at,
            lastLogin: new Date().toISOString(),
            beginnerMode: profile.beginner_mode,
            dashboardMode: profile.dashboard_mode,
            industryTemplate: profile.industry_template,
          };
        } else {
          userProfile = {
            role: 'admin',
            plan: 'free',
            name: currentUser.displayName || '사용자',
          };
        }
      } catch (error) {
        console.warn('[Auth] 프로필 로드 실패:', error.message);
        userProfile = {
          role: 'admin',
          plan: 'free',
          name: currentUser.displayName || '사용자',
        };
      }
    } else {
      currentUser = null;
      userProfile = null;
    }

    _isLoggingIn = false;
    emitAuthChanged();
  };

  // 초기 세션 강제 동기화 (브라우저/리다이렉트 타이밍 이슈 보완)
  supabase.auth.getSession().then(({ data }) => applySession(data?.session || null));

  // Supabase 인증 상태 변화 리스너
  const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
    await applySession(session);
  });
  authSubscription = listener?.subscription || null;
}

/**
 * Google 로그인
 */
export async function loginWithGoogle() {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  // 이중 클릭 방지 — OAuth 리다이렉트 중 중복 호출 차단
  if (_isLoggingIn) {
    showToast('로그인 처리 중입니다. 잠시만 기다려 주세요.', 'info');
    return null;
  }
  _isLoggingIn = true;

  try {
    // 리다이렉트 URL — 해시(#) 포함으로 앱 상태 복구 보장
    const redirectUrl = window.location.origin + '/index.html';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        // 팝업이 차단될 경우를 대비해 queryParams로 힌트 전달
        queryParams: {
          prompt: 'select_account',
        },
      },
    });

    if (error) throw error;

    // OAuth는 리다이렉트 방식 — 2초 후에도 페이지가 안 바뀌면 팝업 차단 안내
    setTimeout(() => {
      if (_isLoggingIn) {
        _isLoggingIn = false;
        showToast('팝업이 차단되었을 수 있습니다. 브라우저 주소창의 팝업 허용을 확인해 주세요.', 'warning', 5000);
      }
    }, 3000);

    return data;
  } catch (error) {
    _isLoggingIn = false;
    // 에러 유형별 사용자 친화적 메시지
    if (error.message?.includes('popup')) {
      showToast('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해 주세요.', 'warning');
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      showToast('네트워크 연결을 확인해 주세요.', 'error');
    } else {
      showToast('Google 로그인 실패: ' + error.message, 'error');
    }
    return null;
  }
}

/**
 * 이메일/비밀번호 회원가입
 */
export async function signupWithEmail(email, password, name) {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  // 로딩 상태 표시
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

    // Supabase는 이메일 확인이 필요할 수 있음
    if (data.user && !data.user.confirmed_at && data.user.identities?.length === 0) {
      showToast('이미 가입된 이메일입니다. 로그인을 시도해주세요.', 'warning');
      return null;
    }

    showToast(`${name || '사용자'}님, 가입을 환영합니다! 🎉`, 'success');
    return toCompatUser(data.user);
  } catch (error) {
    // 사용자 친화적 에러 메시지
    if (error.message.includes('already registered')) {
      showToast('이미 가입된 이메일입니다. 로그인을 시도해주세요.', 'warning');
    } else if (error.message.includes('Password')) {
      showToast('비밀번호가 너무 짧습니다. 6자 이상 입력해주세요.', 'warning');
    } else {
      showToast('회원가입 실패: ' + error.message, 'error');
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

/**
 * 이메일/비밀번호 로그인
 * 왜 UX 강화?
 * → 회사 메일(네이버, 다음 등)로 로그인하는 사용자가 대부분
 * → Google OAuth로 가입 후 이메일 로그인 시도 시 비밀번호 미설정 안내 필요
 * → 버튼 피드백(로딩/에러) + 인라인 해결 액션 제공
 */
export async function loginWithEmail(email, password) {
  if (!isSupabaseConfigured) {
    showToast('로그인 설정이 누락되었습니다. 관리자에게 Supabase URL/키를 확인해 달라고 요청해 주세요.', 'warning');
    return null;
  }

  // 로딩 상태 표시 — 사용자에게 처리 중임을 알림
  const loginBtn = document.getElementById('gate-email-login');
  const originalText = loginBtn?.textContent || '이메일로 로그인';
  if (loginBtn) {
    loginBtn.disabled = true;
    loginBtn.textContent = '로그인 중...';
    loginBtn.style.opacity = '0.7';
  }

  // 이전 에러 메시지 제거
  const existingError = document.getElementById('login-error-msg');
  if (existingError) existingError.remove();

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email,
        password,
      }),
      12000,
      'login',
    );

    if (error) throw error;

    showToast(`${data.user?.user_metadata?.full_name || '사용자'}님, 환영합니다! 🎉`, 'success');
    return toCompatUser(data.user);
  } catch (error) {
    let errorMsg = '';
    let showResetAction = false; // 비밀번호 설정/재설정 버튼 표시 여부

    if (error.message.includes('Invalid login')) {
      errorMsg = '이메일 또는 비밀번호가 올바르지 않습니다.';
      showResetAction = true; // 비밀번호 재설정 제안
      showToast('로그인 정보를 확인해 주세요.', 'error', 3000);
    } else if (error.message.includes('Email not confirmed')) {
      errorMsg = '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.';
      showToast(errorMsg, 'warning', 5000);
    } else if (
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.toLowerCase().includes('timeout')
    ) {
      errorMsg = '인증 서버 연결에 실패했습니다. Supabase 설정(URL/KEY) 또는 브라우저 캐시를 확인해 주세요.';
      showToast(errorMsg, 'error');
    } else {
      errorMsg = '로그인 실패: ' + error.message;
      showToast(errorMsg, 'error');
    }

    // 폼 아래에 인라인 에러 + 비밀번호 재설정 액션 삽입
    if (loginBtn) {
      const errorContainer = document.createElement('div');
      errorContainer.id = 'login-error-msg';
      errorContainer.style.cssText = 'margin-top:10px; animation: fadeSlideIn 0.3s ease;';

      // 에러 메시지
      const msgEl = document.createElement('div');
      msgEl.style.cssText = 'color:#ef4444; font-size:13px; text-align:center; padding:10px 14px; background:rgba(239,68,68,0.1); border-radius:8px;';
      msgEl.textContent = errorMsg;
      errorContainer.appendChild(msgEl);

      // 비밀번호 설정/재설정 액션 버튼
      if (showResetAction && email) {
        const helpBox = document.createElement('div');
        helpBox.style.cssText = 'margin-top:8px; padding:12px 14px; background:rgba(99,102,241,0.1); border-radius:8px; border:1px solid rgba(99,102,241,0.2);';

        const helpText = document.createElement('div');
        helpText.style.cssText = 'color:var(--text-muted); font-size:12px; margin-bottom:8px; line-height:1.5;';
        helpText.textContent = '처음이시거나 비밀번호를 잊으셨나요? 아래 버튼을 누르면 비밀번호를 설정할 수 있는 링크가 이메일로 발송됩니다.';
        helpBox.appendChild(helpText);

        const resetBtn = document.createElement('button');
        resetBtn.style.cssText = 'width:100%; padding:10px 16px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s;';
        resetBtn.textContent = '📧 비밀번호 설정 이메일 받기';
        resetBtn.onmouseover = () => { resetBtn.style.opacity = '0.9'; resetBtn.style.transform = 'translateY(-1px)'; };
        resetBtn.onmouseout = () => { resetBtn.style.opacity = '1'; resetBtn.style.transform = ''; };
        resetBtn.addEventListener('click', async () => {
          resetBtn.disabled = true;
          resetBtn.textContent = '전송 중...';
          const success = await resetPassword(email);
          if (success) {
            // 전송 성공 시 안내 메시지로 교체
            errorContainer.innerHTML = '';
            const successEl = document.createElement('div');
            successEl.style.cssText = 'color:#22c55e; font-size:13px; text-align:center; padding:14px; background:rgba(34,197,94,0.1); border-radius:8px; line-height:1.6;';
            successEl.innerHTML = `<strong>✅ 이메일이 전송되었습니다!</strong><br><span style="font-size:12px; color:var(--text-muted);">${email}의 메일함을 확인하고 비밀번호를 설정한 뒤 다시 로그인해 주세요.</span>`;
            errorContainer.appendChild(successEl);
          } else {
            resetBtn.disabled = false;
            resetBtn.textContent = '📧 비밀번호 설정 이메일 받기';
          }
        });
        helpBox.appendChild(resetBtn);
        errorContainer.appendChild(helpBox);
      }

      loginBtn.parentNode.insertBefore(errorContainer, loginBtn.nextSibling);
    }

    return null;
  } finally {
    // 버튼 복원
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;
      loginBtn.style.opacity = '1';
    }
  }
}

/**
 * 비밀번호 재설정 이메일 전송
 */
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
    showToast('비밀번호 재설정 이메일이 전송되었습니다. 📧', 'success');
    return true;
  } catch (error) {
    showToast('전송 실패: ' + error.message, 'error');
    return false;
  }
}

/**
 * 로그아웃
 */
export async function logout() {
  if (!isSupabaseConfigured) return;

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
    // 네트워크 실패여도 클라이언트 세션/UI는 정리해 "로그아웃 안됨" 체감 방지
    currentUser = null;
    userProfile = null;
    authChangeCallbacks.forEach(cb => cb(currentUser, userProfile));
  }

  if (signOutError) {
    showToast('로그아웃 처리 중 경고: ' + signOutError.message, 'warning');
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

/**
 * 현재 사용자 정보 반환
 */
export function getCurrentUser() {
  return currentUser;
}

export function getUserProfileData() {
  return userProfile;
}

/**
 * 권한 체크
 */
export function hasRole(requiredRole) {
  if (!userProfile) return false;
  const roles = { viewer: 0, staff: 1, manager: 2, admin: 3 };
  return (roles[userProfile.role] || 0) >= (roles[requiredRole] || 0);
}

/**
 * 유료 플랜 체크
 */
export function hasPlan(requiredPlan) {
  if (!userProfile) return false;
  const plans = { free: 0, pro: 1, enterprise: 2 };
  return (plans[userProfile.plan] || 0) >= (plans[requiredPlan] || 0);
}

/**
 * 로그인 화면 렌더
 */
export function renderLoginScreen(container) {
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; min-height:80vh;">
      <div style="text-align:center; max-width:400px; padding:40px;">
        <div style="font-size:48px; margin-bottom:16px;">📦</div>
        <h1 style="font-size:28px; font-weight:800; margin-bottom:8px;">INVEX</h1>
        <p style="color:var(--text-muted); margin-bottom:32px; font-size:14px;">
          중소기업 맞춤 재고·경영 관리 시스템
        </p>
        <button class="btn btn-primary btn-lg" id="btn-google-login" style="width:100%; gap:8px; font-size:15px;">
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" height="20" alt="" />
          Google 계정으로 시작하기
        </button>
        <p style="color:var(--text-muted); font-size:11px; margin-top:16px;">
          로그인하면 <a href="#" style="color:var(--accent);">이용약관</a> 및 
          <a href="#" style="color:var(--accent);">개인정보처리방침</a>에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  `;

  container.querySelector('#btn-google-login')?.addEventListener('click', async () => {
    await loginWithGoogle();
  });
}
