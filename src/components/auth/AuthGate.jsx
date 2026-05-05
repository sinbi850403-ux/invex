import React, { useState, useCallback } from 'react';
import { loginWithGoogle, loginWithEmail, signupWithEmail, resetPassword } from '../../auth.js';
import { showToast } from '../../toast.js';
import '../../auth.css';

export default function AuthGate({ onBack }) {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPassword2, setSignupPassword2] = useState('');
  const [agreed, setAgreed] = useState(false);

  const handleGoogleLogin = useCallback(async () => {
    setLoading(true);
    const user = await loginWithGoogle();
    if (!user) setLoading(false);
  }, []);

  const handleEmailLogin = useCallback(async () => {
    if (!loginEmail || !loginPassword) { showToast('이메일과 비밀번호를 입력해 주세요.', 'warning'); return; }
    setLoading(true);
    await loginWithEmail(loginEmail, loginPassword);
    setLoading(false);
  }, [loginEmail, loginPassword]);

  const handleSignup = useCallback(async () => {
    if (!signupName) { showToast('이름을 입력해 주세요.', 'warning'); return; }
    if (!signupEmail) { showToast('이메일을 입력해 주세요.', 'warning'); return; }
    if (signupPassword.length < 6) { showToast('비밀번호는 6자 이상이어야 합니다.', 'warning'); return; }
    if (signupPassword !== signupPassword2) { showToast('비밀번호가 일치하지 않습니다.', 'warning'); return; }
    if (!agreed) { showToast('이용약관 및 개인정보처리방침에 동의해 주세요.', 'warning'); return; }
    setLoading(true);
    await signupWithEmail(signupEmail, signupPassword, signupName);
    setLoading(false);
  }, [signupName, signupEmail, signupPassword, signupPassword2, agreed]);

  const handleForgotPw = useCallback(async (e) => {
    e.preventDefault();
    if (!loginEmail) { showToast('이메일 주소를 먼저 입력해 주세요.', 'warning'); return; }
    await resetPassword(loginEmail);
  }, [loginEmail]);

  return (
    <div id="auth-gate" className="auth-gate" style={{display:'flex', opacity:'1'}}>
      <div className="auth-container">
        <div className="auth-logo">
          <img src="/logo-mark.svg" alt="INVEX" width="88" height="88" style={{display:'block', margin:'0 auto'}} />
        </div>
        <h1 className="auth-title">INVEX</h1>
        <p className="auth-subtitle">Inventory Expert<br/>중소기업 맞춤 재고·경영 관리 시스템</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >로그인</button>
          <button
            className={`auth-tab ${activeTab === 'signup' ? 'active active-signup' : ''}`}
            onClick={() => setActiveTab('signup')}
          >회원가입</button>
        </div>

        <button className="auth-btn auth-btn-google" style={{padding:'16px', fontSize:'16px', gap:'12px', marginBottom:'20px'}} onClick={handleGoogleLogin}>
          <svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true" style={{display:'block'}}>
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Google 계정으로 시작하기
        </button>

        <div className="auth-divider">
          <div className="auth-divider-line"></div>
          <span className="auth-divider-text">또는 이메일로 진행하기</span>
          <div className="auth-divider-line"></div>
        </div>

        {activeTab === 'login' ? (
          <form className="auth-form" autoComplete="on" onSubmit={e => e.preventDefault()}>
            <div className="auth-field"><input className="auth-input" type="email" placeholder="이메일 주소" autoComplete="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} /></div>
            <div className="auth-field"><input className="auth-input" type="password" placeholder="비밀번호" autoComplete="current-password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmailLogin()} /></div>
            <div className="auth-forgot"><a href="#" className="auth-link-small" onClick={handleForgotPw}>비밀번호 찾기</a></div>
            <button type="button" className="auth-btn auth-btn-primary" onClick={handleEmailLogin}>이메일로 로그인</button>
          </form>
        ) : (
          <form className="auth-form" autoComplete="on" onSubmit={e => e.preventDefault()}>
            <div className="auth-field"><input className="auth-input" type="text" placeholder="이름 (닉네임)" autoComplete="name" value={signupName} onChange={e => setSignupName(e.target.value)} /></div>
            <div className="auth-field"><input className="auth-input" type="email" placeholder="이메일 주소" autoComplete="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} /></div>
            <div className="auth-field"><input className="auth-input" type="password" placeholder="비밀번호 (6자 이상)" autoComplete="new-password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} /></div>
            <div className="auth-field"><input className="auth-input" type="password" placeholder="비밀번호 확인" autoComplete="new-password" value={signupPassword2} onChange={e => setSignupPassword2(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignup()} /></div>
            <div className="auth-field">
              <div className="auth-agree">
                <input type="checkbox" className="auth-checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                <span>
                  <a href="/terms" className="auth-link-purple">서비스 이용약관</a> 및
                  <a href="/privacy" className="auth-link-purple">개인정보처리방침</a>에 동의합니다. <span className="auth-required">*</span>
                </span>
              </div>
            </div>
            <button type="button" className="auth-btn auth-btn-signup" onClick={handleSignup}>이메일로 회원가입</button>
          </form>
        )}

        {loading && (
          <div className="auth-loading">
            <div> 인증 확인 중...</div>
          </div>
        )}

        <p className="auth-footer-text">
          로그인하면 <a href="/terms" target="_blank" className="auth-link-blue">이용약관</a> 및
          <a href="/privacy" target="_blank" className="auth-link-blue">개인정보처리방침</a>에 동의하는 것으로 간주됩니다.
        </p>
        <div className="auth-security">
          <p> 모든 데이터는 암호화되어 안전하게 보관됩니다</p>
        </div>
      </div>
    </div>
  );
}
