/**
 * page-referral.js - 추천인 보상 프로그램
 * 
 * 역할: 친구 초대 → 추천 코드 공유 → 보상 지급
 * 왜 필요? → 바이럴 확산. "친구가 가입하면 Pro 1개월 무료" = 가장 저렴한 마케팅
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { getCurrentUser } from './auth.js';

export function renderReferralPage(container, navigateTo) {
  const state = getState();
  const user = getCurrentUser();
  const referralData = state.referralData || {};

  // 추천 코드 생성 (없으면 자동 생성)
  if (!referralData.code && user) {
    const code = generateCode(user.uid);
    setState({ referralData: { ...referralData, code, invited: [], rewards: 0, totalInvited: 0 } });
  }

  const data = getState().referralData || {};
  const myCode = data.code || '---';
  const invited = data.invited || [];
  const rewards = data.rewards || 0;
  const shareUrl = `https://invex.io.kr?ref=${myCode}`;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">친구 초대 프로그램</h1>
        <div class="page-desc">친구를 초대하면 Pro 기능을 무료로 사용할 수 있어요!</div>
      </div>
    </div>

    <!-- 보상 배너 -->
    <div class="card" style="background:linear-gradient(135deg, rgba(37,99,235,0.15), rgba(124,58,237,0.15)); border:1px solid rgba(37,99,235,0.3); padding:32px; text-align:center;">
      <div style="font-size:48px; margin-bottom:12px;"></div>
      <h2 style="font-size:22px; font-weight:800; margin:0 0 8px;">친구 1명 초대 = Pro 1개월 무료!</h2>
      <p style="color:var(--text-muted); font-size:14px; margin:0 0 20px;">
        추천 코드를 공유하세요. 친구가 가입하면<br/>
        나도, 친구도 각각 <strong style="color:var(--accent);">Pro 1개월</strong>을 무료로 받아요.
      </p>
      
      <!-- 추천 코드 -->
      <div style="background:var(--bg-primary); border:2px dashed var(--accent); border-radius:12px; padding:16px; max-width:400px; margin:0 auto;">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">내 추천 코드</div>
        <div style="font-size:28px; font-weight:800; letter-spacing:4px; color:var(--accent);" id="ref-code">${myCode}</div>
      </div>

      <!-- 공유 버튼들 -->
      <div style="display:flex; gap:8px; justify-content:center; margin-top:16px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="btn-copy-code"> 코드 복사</button>
        <button class="btn btn-outline" id="btn-copy-link"> 링크 복사</button>
        <button class="btn btn-outline" id="btn-share-kakao" style="background:#FEE500; color:#3C1E1E; border-color:#FEE500;"> 카카오톡</button>
      </div>
    </div>

    <!-- 통계 -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); margin-top:16px;">
      <div class="stat-card">
        <div class="stat-label">총 초대 수</div>
        <div class="stat-value text-accent">${invited.length}명</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">가입 완료</div>
        <div class="stat-value" style="color:var(--success);">${invited.filter(i => i.status === 'joined').length}명</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">적립된 보상</div>
        <div class="stat-value" style="color:#d29922;">${rewards}개월</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">잔여 Pro 기간</div>
        <div class="stat-value">${rewards}개월</div>
      </div>
    </div>

    <!-- 추천 코드 입력 (내가 초대 받은 경우) -->
    <div class="card" style="margin-top:16px;">
      <div class="card-title"> 추천 코드 입력</div>
      <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">
        친구에게 받은 추천 코드가 있으신가요?
      </p>
      <div style="display:flex; gap:8px; max-width:400px;">
        <input class="form-input" id="input-ref-code" placeholder="추천 코드 입력 (예: INV-A1B2C3)" 
               value="${data.appliedCode || ''}" ${data.appliedCode ? 'disabled' : ''} />
        <button class="btn btn-primary" id="btn-apply-code" ${data.appliedCode ? 'disabled' : ''}>
          ${data.appliedCode ? ' 적용됨' : '적용'}
        </button>
      </div>
    </div>

    <!-- 초대 이력 -->
    ${invited.length > 0 ? `
      <div class="card" style="margin-top:16px;">
        <div class="card-title"> 초대 이력</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>이메일</th>
                <th>가입일</th>
                <th>상태</th>
                <th>보상</th>
              </tr>
            </thead>
            <tbody>
              ${invited.map(inv => `
                <tr>
                  <td>${maskEmail(inv.email || '-')}</td>
                  <td>${inv.date || '-'}</td>
                  <td>
                    <span style="padding:2px 10px; border-radius:10px; font-size:11px; font-weight:600;
                      background:${inv.status === 'joined' ? 'rgba(63,185,80,0.15)' : 'rgba(139,148,158,0.15)'};
                      color:${inv.status === 'joined' ? 'var(--success)' : 'var(--text-muted)'};">
                      ${inv.status === 'joined' ? ' 가입완료' : '⏳ 대기중'}
                    </span>
                  </td>
                  <td style="font-weight:600; color:${inv.status === 'joined' ? 'var(--success)' : 'var(--text-muted)'};">
                    ${inv.status === 'joined' ? '+1개월' : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- 안내 -->
    <div class="card" style="margin-top:16px; border-left:3px solid var(--accent);">
      <div class="card-title"> 이용 안내</div>
      <ul style="font-size:13px; color:var(--text-muted); line-height:2; margin:0; padding-left:16px;">
        <li>초대받은 친구가 <strong>회원가입을 완료</strong>하면 보상이 지급됩니다.</li>
        <li>나도, 친구도 각각 <strong>Pro 1개월 무료</strong>를 받습니다.</li>
        <li>초대 횟수에 제한이 없습니다. 많이 초대할수록 더 오래 무료!</li>
        <li>추천 코드는 1인 1회만 적용 가능합니다.</li>
      </ul>
    </div>
  `;

  // === 이벤트 ===

  // 코드 복사
  container.querySelector('#btn-copy-code')?.addEventListener('click', () => {
    navigator.clipboard.writeText(myCode).then(() => {
      showToast('추천 코드가 복사되었습니다!', 'success');
    });
  });

  // 링크 복사
  container.querySelector('#btn-copy-link')?.addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast('초대 링크가 복사되었습니다!', 'success');
    });
  });

  // 카카오톡 공유 (웹 공유 API 사용)
  container.querySelector('#btn-share-kakao')?.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({
        title: 'INVEX - 스마트 재고 관리',
        text: `재고 관리가 엑셀보다 쉬워요! 추천 코드 [${myCode}]로 가입하면 Pro 1개월 무료!`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      // 공유 API 미지원 → 링크 복사
      navigator.clipboard.writeText(`재고 관리가 엑셀보다 쉬워요! 추천 코드 [${myCode}]로 가입하면 Pro 1개월 무료!\n${shareUrl}`).then(() => {
        showToast('공유 메시지가 복사되었습니다. 카카오톡에 붙여넣으세요!', 'success');
      });
    }
  });

  // 추천 코드 적용
  container.querySelector('#btn-apply-code')?.addEventListener('click', () => {
    const code = container.querySelector('#input-ref-code').value.trim().toUpperCase();
    if (!code) { showToast('추천 코드를 입력하세요.', 'warning'); return; }
    if (code === myCode) { showToast('자신의 코드는 적용할 수 없습니다.', 'warning'); return; }

    const current = getState().referralData || {};
    if (current.appliedCode) { showToast('이미 추천 코드를 적용했습니다.', 'warning'); return; }

    setState({ referralData: { ...current, appliedCode: code } });
    showToast('추천 코드가 적용되었습니다! Pro 1개월 보상이 지급됩니다. ', 'success');
    renderReferralPage(container, navigateTo);
  });
}

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
