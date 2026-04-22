export function renderInlineLoginError({
  loginBtn,
  email,
  errorMsg,
  showResetAction,
  onRetry,
  onResetPassword,
}) {
  if (!loginBtn) return;

  const errorContainer = document.createElement('div');
  errorContainer.id = 'login-error-msg';
  errorContainer.style.cssText = 'margin-top:10px; animation: fadeSlideIn 0.3s ease;';

  const msgEl = document.createElement('div');
  msgEl.style.cssText =
    'color:#ef4444; font-size:13px; text-align:center; padding:10px 14px; background:rgba(239,68,68,0.1); border-radius:8px;';
  msgEl.textContent = errorMsg;
  errorContainer.appendChild(msgEl);

  const retryHints = ['네트워크', '불안정', '오프라인', '다시 시도', 'timeout', 'network', 'failed'];
  const normalizedMessage = String(errorMsg || '').toLowerCase();
  if (retryHints.some((hint) => normalizedMessage.includes(hint.toLowerCase()))) {
    const retryBtn = document.createElement('button');
    retryBtn.style.cssText =
      'width:100%; margin-top:8px; padding:10px 16px; background:linear-gradient(135deg, #3b82f6, #6366f1); color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;';
    retryBtn.textContent = '다시 시도';
    retryBtn.addEventListener('click', async () => {
      document.getElementById('login-error-msg')?.remove();
      await onRetry?.();
    });
    errorContainer.appendChild(retryBtn);
  }

  if (showResetAction && email) {
    const helpBox = document.createElement('div');
    helpBox.style.cssText = 'margin-top:8px; padding:12px 14px; background:rgba(99,102,241,0.1); border-radius:8px; border:1px solid rgba(99,102,241,0.2);';

    const helpText = document.createElement('div');
    helpText.style.cssText = 'color:var(--text-muted); font-size:12px; margin-bottom:8px; line-height:1.5;';
    helpText.textContent = '비밀번호가 기억나지 않으면 아래 버튼으로 재설정 메일을 받을 수 있습니다.';
    helpBox.appendChild(helpText);

    const resetBtn = document.createElement('button');
    resetBtn.style.cssText =
      'width:100%; padding:10px 16px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:white; border:none; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; transition:all 0.2s;';
    resetBtn.textContent = '비밀번호 재설정 메일 받기';
    resetBtn.addEventListener('click', async () => {
      resetBtn.disabled = true;
      resetBtn.textContent = '전송 중...';
      const success = await onResetPassword?.(email);
      if (!success) {
        resetBtn.disabled = false;
        resetBtn.textContent = '비밀번호 재설정 메일 받기';
        return;
      }

      errorContainer.innerHTML = '';
      const successEl = document.createElement('div');
      successEl.style.cssText =
        'color:#22c55e; font-size:13px; text-align:center; padding:14px; background:rgba(34,197,94,0.1); border-radius:8px; line-height:1.6;';
      successEl.innerHTML = `<strong>메일이 전송되었습니다.</strong><br><span style="font-size:12px; color:var(--text-muted);">${email} 메일함에서 비밀번호를 다시 설정해 주세요.</span>`;
      errorContainer.appendChild(successEl);
    });

    helpBox.appendChild(resetBtn);
    errorContainer.appendChild(helpBox);
  }

  loginBtn.parentNode?.insertBefore(errorContainer, loginBtn.nextSibling);
}

export function renderLoginScreen(container, { onGoogleLogin } = {}) {
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
    await onGoogleLogin?.();
  });
}
