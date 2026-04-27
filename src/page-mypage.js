/**
 * page-mypage.js - 마이페이지
 * 왜 필요? → 사용자가 프로필 수정, 비밀번호 변경, 회원탈퇴를 할 수 있어야 함 (개인정보보호법 준수)
 */
import { getCurrentUser, getUserProfileData, logout } from './auth.js';
import { supabase } from './supabase-client.js';
import { showToast } from './toast.js';
import { getCurrentPlan, PLANS } from './plan.js';

export function renderMyPage(container) {
  const user = getCurrentUser();
  const profile = getUserProfileData();
  const plan = getCurrentPlan();
  const planInfo = PLANS[plan] || PLANS.free;

  // 가입 경로 판별 — Google 로그인은 비밀번호 변경 불가 (Supabase app_metadata.provider)
  const isGoogleUser = user?._raw?.app_metadata?.provider === 'google';
  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt.seconds ? profile.createdAt.seconds * 1000 : profile.createdAt).toLocaleDateString('ko-KR')
    : '-';

  container.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:24px;">
      <h2 style="font-size:22px; font-weight:800; margin-bottom:24px;"> 마이페이지</h2>

      <!-- 프로필 카드 -->
      <div class="card" style="padding:24px; margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
          <div style="width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,#8b5cf6,#3b82f6); display:flex; align-items:center; justify-content:center; font-size:24px; color:white; font-weight:700;">
            ${(profile?.name || user?.displayName || '?')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-size:18px; font-weight:700;">${profile?.name || user?.displayName || '사용자'}</div>
            <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">${user?.email || '-'}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
              가입일: ${joinDate} · ${isGoogleUser ? ' Google 계정' : ' 이메일 가입'}
            </div>
          </div>
        </div>

        <!-- 현재 요금제 -->
        <div style="padding:12px 16px; background:rgba(139,92,246,0.1); border-radius:8px; border:1px solid rgba(139,92,246,0.2); margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:13px; font-weight:600;">${planInfo.icon} ${planInfo.name} 플랜</span>
              <span style="font-size:11px; color:var(--text-muted); margin-left:8px;">${planInfo.price}</span>
            </div>
          </div>
        </div>

        <!-- 이름 변경 -->
        <div style="margin-bottom:16px;">
          <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:6px;">이름 (닉네임)</label>
          <div style="display:flex; gap:8px;">
            <input id="my-name" type="text" value="${profile?.name || user?.displayName || ''}"
              class="input" style="flex:1;" />
            <button id="btn-update-name" class="btn btn-primary" style="white-space:nowrap;">변경</button>
          </div>
        </div>
      </div>

      <!-- 비밀번호 변경 -->
      <div class="card" style="padding:24px; margin-bottom:20px; ${isGoogleUser ? 'opacity:0.5;' : ''}">
        <h3 style="font-size:15px; font-weight:700; margin-bottom:16px;"> 비밀번호 변경</h3>
        ${isGoogleUser ? '<p style="font-size:12px; color:var(--text-muted);">Google 계정은 Google에서 비밀번호를 관리합니다.</p>' : `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <input id="my-current-pw" type="password" placeholder="현재 비밀번호" class="input" />
          <input id="my-new-pw" type="password" placeholder="새 비밀번호 (6자 이상)" class="input" />
          <input id="my-new-pw2" type="password" placeholder="새 비밀번호 확인" class="input" />
          <button id="btn-change-pw" class="btn btn-primary">비밀번호 변경</button>
        </div>
        `}
      </div>

      <!-- 계정 삭제 -->
      <div class="card" style="padding:24px; border:1px solid rgba(239,68,68,0.3);">
        <h3 style="font-size:15px; font-weight:700; color:#ef4444; margin-bottom:8px;">회원 탈퇴</h3>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">
          탈퇴하면 저장된 재고 데이터, 거래 내역 등 모든 정보가 삭제됩니다.
        </p>
        <button id="btn-delete-account" class="btn" style="background:#ef4444; color:white; font-size:13px;">
          탈퇴하기
        </button>
      </div>
    </div>
  `;

  // 이름 변경
  document.getElementById('btn-update-name')?.addEventListener('click', async () => {
    const newName = document.getElementById('my-name').value.trim();
    if (!newName) { showToast('이름을 입력하세요.', 'warning'); return; }
    const btn = document.getElementById('btn-update-name');
    btn.disabled = true;
    try {
      const { error: authErr } = await supabase.auth.updateUser({
        data: { name: newName, full_name: newName },
      });
      if (authErr) throw authErr;
      await supabase.from('profiles').upsert({ id: user.uid, name: newName }, { onConflict: 'id' });
      showToast('이름이 변경되었습니다.', 'success');
    } catch (e) {
      showToast('이름 변경 실패: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // 비밀번호 변경
  if (!isGoogleUser) {
    document.getElementById('btn-change-pw')?.addEventListener('click', async () => {
      const currentPw = document.getElementById('my-current-pw').value;
      const newPw = document.getElementById('my-new-pw').value;
      const newPw2 = document.getElementById('my-new-pw2').value;

      if (!currentPw) { showToast('현재 비밀번호를 입력하세요.', 'warning'); return; }
      if (newPw.length < 6) { showToast('새 비밀번호는 6자 이상이어야 합니다.', 'warning'); return; }
      if (newPw !== newPw2) { showToast('새 비밀번호가 일치하지 않습니다.', 'warning'); return; }

      try {
        // 현재 비밀번호 검증 — 임시 로그인 시도
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPw,
        });
        if (signInErr) {
          showToast('현재 비밀번호가 올바르지 않습니다.', 'error');
          return;
        }
        const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
        if (updateErr) throw updateErr;
        showToast('비밀번호가 변경되었습니다!', 'success');
        document.getElementById('my-current-pw').value = '';
        document.getElementById('my-new-pw').value = '';
        document.getElementById('my-new-pw2').value = '';
      } catch (e) {
        showToast('비밀번호 변경 실패: ' + e.message, 'error');
      }
    });
  }

  // 회원 탈퇴
  document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
    const confirmed = confirm('정말 탈퇴하시겠습니까?\n\n저장된 재고, 거래 내역 등 모든 데이터와 로그인 계정이 완전히 삭제됩니다.');
    if (!confirmed) return;
    const doubleCheck = prompt('탈퇴를 진행하려면 "회원탈퇴"를 입력하세요:');
    if (doubleCheck !== '회원탈퇴') { showToast('탈퇴가 취소되었습니다.', 'info'); return; }

    const btn = document.getElementById('btn-delete-account');
    if (btn) { btn.disabled = true; btn.textContent = '탈퇴 처리 중...'; }

    try {
      // delete_own_account() RPC: 모든 데이터 + auth.users 계정 완전 삭제
      // (supabase/delete-account.sql 실행 후 사용 가능)
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;

      // IndexedDB 로컬 캐시도 삭제
      try { indexedDB.deleteDatabase('invex-db'); } catch (_) {}

      showToast('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.', 'info', 4000);

      // 로컬 상태 초기화 후 로그인 화면으로 이동
      await logout();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '탈퇴하기'; }
      showToast('탈퇴 실패: ' + (e.message || '알 수 없는 오류'), 'error');
    }
  });
}
