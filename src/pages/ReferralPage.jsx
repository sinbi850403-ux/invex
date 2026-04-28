/**
 * ReferralPage.jsx - 친구 초대 프로그램
 */
import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../toast.js';

/** 추천 코드 생성 (uid 기반) */
function generateCode(uid) {
  const hash = uid.slice(-6).toUpperCase();
  return `INV-${hash}`;
}

/** 이메일 마스킹 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const masked = local.slice(0, 2) + '***';
  return `${masked}@${domain}`;
}

export default function ReferralPage() {
  const [referralData, setStore] = useStore(s => s.referralData || {});
  const user = useMemo(() => getCurrentUser(), []);

  // 추천 코드 자동 생성
  const data = useMemo(() => {
    if (!referralData.code && user) {
      const code = generateCode(user.uid);
      const newData = { ...referralData, code, invited: [], rewards: 0, totalInvited: 0 };
      setStore({ referralData: newData });
      return newData;
    }
    return referralData;
  }, [referralData, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const myCode = data.code || '---';
  const invited = data.invited || [];
  const rewards = data.rewards || 0;
  const shareUrl = `https://invex.io.kr?ref=${myCode}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(myCode).then(() => showToast('추천 코드가 복사되었습니다!', 'success'));
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => showToast('초대 링크가 복사되었습니다!', 'success'));
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'INVEX - 스마트 재고 관리',
        text: `재고 관리가 엑셀보다 쉬워요! 추천 코드 [${myCode}]로 가입하면 Pro 1개월 무료!`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(
        `재고 관리가 엑셀보다 쉬워요! 추천 코드 [${myCode}]로 가입하면 Pro 1개월 무료!\n${shareUrl}`
      ).then(() => showToast('공유 메시지가 복사되었습니다. 카카오톡에 붙여넣으세요!', 'success'));
    }
  };

  const handleApplyCode = (e) => {
    const input = e.currentTarget.closest('div').querySelector('input');
    const code = input?.value.trim().toUpperCase();
    if (!code) { showToast('추천 코드를 입력하세요.', 'warning'); return; }
    if (code === myCode) { showToast('자신의 코드는 적용할 수 없습니다.', 'warning'); return; }
    if (data.appliedCode) { showToast('이미 추천 코드를 적용했습니다.', 'warning'); return; }
    setStore({ referralData: { ...data, appliedCode: code } });
    showToast('추천 코드가 적용되었습니다! Pro 1개월 보상이 지급됩니다. ', 'success');
  };

  const joinedCount = invited.filter(i => i.status === 'joined').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">친구 초대 프로그램</h1>
          <div className="page-desc">친구를 초대하면 Pro 기능을 무료로 사용할 수 있어요!</div>
        </div>
      </div>

      {/* 보상 배너 */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(124,58,237,0.15))', border: '1px solid rgba(37,99,235,0.3)', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}></div>
        <h2 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 8px' }}>친구 1명 초대 = Pro 1개월 무료!</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 20px' }}>
          추천 코드를 공유하세요. 친구가 가입하면<br />
          나도, 친구도 각각 <strong style={{ color: 'var(--accent)' }}>Pro 1개월</strong>을 무료로 받아요.
        </p>

        {/* 추천 코드 */}
        <div style={{ background: 'var(--bg-primary)', border: '2px dashed var(--accent)', borderRadius: '12px', padding: '16px', maxWidth: '400px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>내 추천 코드</div>
          <div style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '4px', color: 'var(--accent)' }}>{myCode}</div>
        </div>

        {/* 공유 버튼들 */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleCopyCode}> 코드 복사</button>
          <button className="btn btn-outline" onClick={handleCopyLink}> 링크 복사</button>
          <button className="btn btn-outline" onClick={handleShare} style={{ background: '#FEE500', color: '#3C1E1E', borderColor: '#FEE500' }}> 카카오톡</button>
        </div>
      </div>

      {/* 통계 */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginTop: '16px' }}>
        <div className="stat-card">
          <div className="stat-label">총 초대 수</div>
          <div className="stat-value text-accent">{invited.length}명</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">가입 완료</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{joinedCount}명</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">적립된 보상</div>
          <div className="stat-value" style={{ color: '#d29922' }}>{rewards}개월</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">잔여 Pro 기간</div>
          <div className="stat-value">{rewards}개월</div>
        </div>
      </div>

      {/* 추천 코드 입력 */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-title"> 추천 코드 입력</div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          친구에게 받은 추천 코드가 있으신가요?
        </p>
        <div style={{ display: 'flex', gap: '8px', maxWidth: '400px' }}>
          <input
            className="form-input"
            defaultValue={data.appliedCode || ''}
            disabled={!!data.appliedCode}
            placeholder="추천 코드 입력 (예: INV-A1B2C3)"
          />
          <button className="btn btn-primary" disabled={!!data.appliedCode} onClick={handleApplyCode}>
            {data.appliedCode ? ' 적용됨' : '적용'}
          </button>
        </div>
      </div>

      {/* 초대 이력 */}
      {invited.length > 0 && (
        <div className="card" style={{ marginTop: '16px' }}>
          <div className="card-title"> 초대 이력</div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>가입일</th>
                  <th>상태</th>
                  <th>보상</th>
                </tr>
              </thead>
              <tbody>
                {invited.map((inv, i) => (
                  <tr key={i}>
                    <td>{maskEmail(inv.email || '-')}</td>
                    <td>{inv.date || '-'}</td>
                    <td>
                      <span style={{
                        padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                        background: inv.status === 'joined' ? 'rgba(63,185,80,0.15)' : 'rgba(139,148,158,0.15)',
                        color: inv.status === 'joined' ? 'var(--success)' : 'var(--text-muted)',
                      }}>
                        {inv.status === 'joined' ? ' 가입완료' : '⏳ 대기중'}
                      </span>
                    </td>
                    <td style={{ fontWeight: '600', color: inv.status === 'joined' ? 'var(--success)' : 'var(--text-muted)' }}>
                      {inv.status === 'joined' ? '+1개월' : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 안내 */}
      <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid var(--accent)' }}>
        <div className="card-title"> 이용 안내</div>
        <ul style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '2', margin: '0', paddingLeft: '16px' }}>
          <li>초대받은 친구가 <strong>회원가입을 완료</strong>하면 보상이 지급됩니다.</li>
          <li>나도, 친구도 각각 <strong>Pro 1개월 무료</strong>를 받습니다.</li>
          <li>초대 횟수에 제한이 없습니다. 많이 초대할수록 더 오래 무료!</li>
          <li>추천 코드는 1인 1회만 적용 가능합니다.</li>
        </ul>
      </div>
    </div>
  );
}
