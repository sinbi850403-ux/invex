/**
 * MyPage.jsx - 마이페이지
 */
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../supabase-client.js';
import { showToast } from '../toast.js';
import { getCurrentPlan, PLANS } from '../plan.js';

export default function MyPage() {
  const { user, profile, logout } = useAuth();
  const plan = getCurrentPlan();
  const planInfo = PLANS[plan] || PLANS.free;

  const [name, setName] = useState(profile?.name || user?.displayName || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const [updatingName, setUpdatingName] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Google 로그인 여부
  const isGoogleUser = user?._raw?.app_metadata?.provider === 'google';

  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt.seconds ? profile.createdAt.seconds * 1000 : profile.createdAt).toLocaleDateString('ko-KR')
    : '-';

  const displayInitial = (profile?.name || user?.displayName || '?')[0]?.toUpperCase();

  const handleUpdateName = async () => {
    if (!name.trim()) { showToast('이름을 입력하세요.', 'warning'); return; }
    setUpdatingName(true);
    try {
      const { error: authErr } = await supabase.auth.updateUser({ data: { name: name.trim(), full_name: name.trim() } });
      if (authErr) throw authErr;
      await supabase.from('profiles').upsert({ id: user.uid, name: name.trim() }, { onConflict: 'id' });
      showToast('이름이 변경되었습니다.', 'success');
    } catch (e) {
      showToast('이름 변경 실패: ' + e.message, 'error');
    } finally {
      setUpdatingName(false);
    }
  };

  const handleChangePw = async () => {
    if (!currentPw) { showToast('현재 비밀번호를 입력하세요.', 'warning'); return; }
    if (newPw.length < 6) { showToast('새 비밀번호는 6자 이상이어야 합니다.', 'warning'); return; }
    if (newPw !== newPw2) { showToast('새 비밀번호가 일치하지 않습니다.', 'warning'); return; }
    setChangingPw(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPw });
      if (signInErr) { showToast('현재 비밀번호가 올바르지 않습니다.', 'error'); return; }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;
      showToast('비밀번호가 변경되었습니다!', 'success');
      setCurrentPw(''); setNewPw(''); setNewPw2('');
    } catch (e) {
      showToast('비밀번호 변경 실패: ' + e.message, 'error');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm('정말 탈퇴하시겠습니까?\n\n저장된 재고, 거래 내역 등 모든 데이터와 로그인 계정이 완전히 삭제됩니다.');
    if (!confirmed) return;
    const doubleCheck = prompt('탈퇴를 진행하려면 "회원탈퇴"를 입력하세요:');
    if (doubleCheck !== '회원탈퇴') { showToast('탈퇴가 취소되었습니다.', 'info'); return; }
    setDeletingAccount(true);
    try {
      const { error } = await supabase.rpc('delete_own_account');
      if (error) throw error;
      try { indexedDB.deleteDatabase('invex-db'); } catch (_) {}
      showToast('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.', 'info', 4000);
      await logout();
    } catch (e) {
      showToast('탈퇴 실패: ' + (e.message || '알 수 없는 오류'), 'error');
      setDeletingAccount(false);
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '24px' }}> 마이페이지</h2>

      {/* 프로필 카드 */}
      <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', color: 'white', fontWeight: '700' }}>
            {displayInitial}
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700' }}>{profile?.name || user?.displayName || '사용자'}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{user?.email || '-'}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              가입일: {joinDate} · {isGoogleUser ? ' Google 계정' : ' 이메일 가입'}
            </div>
          </div>
        </div>

        {/* 현재 요금제 */}
        <div style={{ padding: '12px 16px', background: 'rgba(139,92,246,0.1)', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{planInfo.icon} {planInfo.name} 플랜</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{planInfo.price}</span>
            </div>
          </div>
        </div>

        {/* 이름 변경 */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>이름 (닉네임)</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="input"
              style={{ flex: '1' }}
            />
            <button className="btn btn-primary" onClick={handleUpdateName} disabled={updatingName} style={{ whiteSpace: 'nowrap' }}>
              {updatingName ? '변경 중...' : '변경'}
            </button>
          </div>
        </div>
      </div>

      {/* 비밀번호 변경 */}
      <div className="card" style={{ padding: '24px', marginBottom: '20px', opacity: isGoogleUser ? 0.5 : 1 }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '16px' }}> 비밀번호 변경</h3>
        {isGoogleUser ? (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Google 계정은 Google에서 비밀번호를 관리합니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input type="password" placeholder="현재 비밀번호" className="input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            <input type="password" placeholder="새 비밀번호 (6자 이상)" className="input" value={newPw} onChange={e => setNewPw(e.target.value)} />
            <input type="password" placeholder="새 비밀번호 확인" className="input" value={newPw2} onChange={e => setNewPw2(e.target.value)} />
            <button className="btn btn-primary" onClick={handleChangePw} disabled={changingPw}>
              {changingPw ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        )}
      </div>

      {/* 계정 삭제 */}
      <div className="card" style={{ padding: '24px', border: '1px solid rgba(239,68,68,0.3)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#ef4444', marginBottom: '8px' }}>회원 탈퇴</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          탈퇴하면 저장된 재고 데이터, 거래 내역 등 모든 정보가 삭제됩니다.
        </p>
        <button
          className="btn"
          style={{ background: '#ef4444', color: 'white', fontSize: '13px' }}
          onClick={handleDeleteAccount}
          disabled={deletingAccount}
        >
          {deletingAccount ? '탈퇴 처리 중...' : '탈퇴하기'}
        </button>
      </div>
    </div>
  );
}
