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
  if (!isSupabaseConfigured) {
    // Supabase 미설정 시 → 로컬 모드로 동작 (개발 편의)
    currentUser = null;
    userProfile = { role: 'admin', plan: 'free', name: '로컬 사용자' };
    if (callback) callback(null, userProfile);
    return;
  }

  if (callback) authChangeCallbacks.push(callback);

  // Supabase 인증 상태 변화 리스너
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = toCompatUser(session.user);

      // Supabase profiles 테이블에서 프로필 가져오기
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error && error.code === 'PGRST116') {
          // 프로필이 없으면 수동 생성 (트리거 실패 대비)
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

    // 모든 콜백 호출 (main.js 등)
    authChangeCallbacks.forEach(cb => cb(currentUser, userProfile));
  });
}

/**
 * Google 로그인
 */
export async function loginWithGoogle() {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) throw error;
    // OAuth는 리다이렉트 방식이라 여기서 user가 바로 반환되지 않음
    // onAuthStateChange에서 처리됨
    return data;
  } catch (error) {
    showToast('Google 로그인 실패: ' + error.message, 'error');
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

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || '사용자' },
      },
    });

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
  }
}

/**
 * 이메일/비밀번호 로그인
 */
export async function loginWithEmail(email, password) {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return null;
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    showToast(`${data.user?.user_metadata?.full_name || '사용자'}님, 환영합니다! 🎉`, 'success');
    return toCompatUser(data.user);
  } catch (error) {
    if (error.message.includes('Invalid login')) {
      showToast('이메일 또는 비밀번호가 올바르지 않습니다.', 'error');
    } else {
      showToast('로그인 실패: ' + error.message, 'error');
    }
    return null;
  }
}

/**
 * 비밀번호 재설정 이메일 전송
 */
export async function resetPassword(email) {
  if (!isSupabaseConfigured) {
    showToast('Supabase 설정이 필요합니다.', 'warning');
    return false;
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?type=recovery`,
    });

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

  try {
    await supabase.auth.signOut();
    currentUser = null;
    userProfile = null;
    showToast('로그아웃되었습니다.', 'info');
  } catch (error) {
    showToast('로그아웃 실패: ' + error.message, 'error');
  }
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
