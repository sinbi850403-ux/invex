import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function AuthPage() {
  const {
    isPending,
    isReady,
    profile,
    signOut,
    loginWithEmailPassword,
    loginWithGoogleAccount,
    registerWithEmail,
    sendPasswordReset,
    user,
  } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof location.state === 'object' && location.state && 'from' in location.state
      ? String(location.state.from || '/')
      : '/';

  if (isReady && user) {
    return <Navigate to={redirectTo} replace />;
  }

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!form.email || !form.password) {
      setError('이메일과 비밀번호를 입력해 주세요.');
      return;
    }

    const result = await loginWithEmailPassword(form.email, form.password);
    if (!result) {
      setError('로그인에 실패했습니다. 입력한 계정을 다시 확인해 주세요.');
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!form.name || !form.email || !form.password) {
      setError('이름, 이메일, 비밀번호를 모두 입력해 주세요.');
      return;
    }

    if (form.password.length < 6) {
      setError('비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    const result = await registerWithEmail(form.email, form.password, form.name);
    if (!result) {
      setError('회원가입을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    setMessage('가입 요청을 보냈습니다. 이메일 인증을 완료해 주세요.');
    setMode('login');
  }

  async function handlePasswordReset() {
    setMessage(null);
    setError(null);

    if (!form.email) {
      setError('비밀번호 재설정 메일을 받으려면 이메일을 먼저 입력해 주세요.');
      return;
    }

    const success = await sendPasswordReset(form.email);
    if (success) {
      setMessage('비밀번호 재설정 메일을 보냈습니다.');
      return;
    }

    setError('비밀번호 재설정 메일을 보내지 못했습니다.');
  }

  async function handleLogout() {
    await signOut();
  }

  return (
    <section className="react-page">
      <article className="react-card">
        <span className="react-chip">인증</span>
        <h2>로그인과 계정 인증을 한 화면에서 관리합니다.</h2>
        <p>
          이메일 로그인, Google OAuth, 회원가입, 비밀번호 재설정, 로그아웃까지
          모두 공통 인증 계층으로 연결되어 안정적으로 동작합니다.
        </p>
      </article>

      <div className="react-grid react-grid--two-auth">
        <article className="react-card">
          <div className="react-segmented">
            <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>
              로그인
            </button>
            <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => setMode('signup')}>
              회원가입
            </button>
          </div>

          <button
            type="button"
            className="react-auth-google"
            onClick={() => void loginWithGoogleAccount()}
            disabled={isPending}
          >
            Google 계정으로 계속하기
          </button>

          <div className="react-auth-divider">또는 이메일로 진행</div>

          {mode === 'login' ? (
            <form className="react-auth-form" onSubmit={handleEmailLogin}>
              <label className="react-field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
              </label>
              <label className="react-field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                />
              </label>
              <button type="submit" className="react-auth-submit" disabled={isPending}>
                로그인
              </button>
              <button type="button" className="react-auth-text-button" onClick={handlePasswordReset} disabled={isPending}>
                비밀번호 재설정 메일 보내기
              </button>
            </form>
          ) : (
            <form className="react-auth-form" onSubmit={handleSignup}>
              <label className="react-field">
                <span>이름</span>
                <input type="text" value={form.name} onChange={(event) => updateField('name', event.target.value)} />
              </label>
              <label className="react-field">
                <span>Email</span>
                <input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
              </label>
              <label className="react-field">
                <span>비밀번호</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField('password', event.target.value)}
                />
              </label>
              <label className="react-field">
                <span>비밀번호 확인</span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => updateField('confirmPassword', event.target.value)}
                />
              </label>
              <button type="submit" className="react-auth-submit" disabled={isPending}>
                계정 만들기
              </button>
            </form>
          )}

          {error ? <p className="react-auth-feedback is-error">{error}</p> : null}
          {message ? <p className="react-auth-feedback is-success">{message}</p> : null}
        </article>

        <article className="react-card">
          <span className="react-card__eyebrow">세션</span>
          <h3>현재 인증 상태</h3>
          <div className="react-session-card">
            <div>
              <strong>상태</strong>
              <p>{isReady ? '준비됨' : '확인 중'}</p>
            </div>
            <div>
              <strong>사용자</strong>
              <p>{user?.email || '로그아웃 상태'}</p>
            </div>
            <div>
              <strong>권한</strong>
              <p>{profile?.role || '-'}</p>
            </div>
            <div>
              <strong>플랜</strong>
              <p>{profile?.plan || '-'}</p>
            </div>
          </div>

          <button type="button" className="react-auth-logout" onClick={handleLogout} disabled={!user || isPending}>
            로그아웃
          </button>
        </article>
      </div>
    </section>
  );
}

