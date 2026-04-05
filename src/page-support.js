/**
 * page-support.js - 고객 문의
 * 왜 필요? → 사용자가 문제 발생 시 연락할 수 있는 통로가 있어야 함 (서비스 신뢰도)
 */
import { getCurrentUser, getUserProfileData } from './firebase-auth.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, isConfigured } from './firebase-config.js';
import { showToast } from './toast.js';

export function renderSupportPage(container) {
  const user = getCurrentUser();
  const profile = getUserProfileData();

  container.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:24px;">
      <h2 style="font-size:22px; font-weight:800; margin-bottom:8px;">💬 고객 문의</h2>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">궁금한 점이나 불편한 사항을 알려주세요. 빠르게 답변드리겠습니다.</p>

      <!-- 빠른 연락 -->
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:12px; margin-bottom:24px;">
        <a href="mailto:sinbi0214@naver.com" style="text-decoration:none;">
          <div class="card" style="padding:20px; text-align:center; cursor:pointer; transition:transform 0.2s;"
               onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
            <div style="font-size:28px; margin-bottom:8px;">📧</div>
            <div style="font-size:14px; font-weight:600; color:var(--text-primary);">이메일 문의</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">sinbi0214@naver.com</div>
          </div>
        </a>
        <div class="card" style="padding:20px; text-align:center; opacity:0.6;">
          <div style="font-size:28px; margin-bottom:8px;">💬</div>
          <div style="font-size:14px; font-weight:600;">카카오톡 상담</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">준비 중</div>
        </div>
        <div class="card" style="padding:20px; text-align:center; opacity:0.6;">
          <div style="font-size:28px; margin-bottom:8px;">📞</div>
          <div style="font-size:14px; font-weight:600;">전화 상담</div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">준비 중</div>
        </div>
      </div>

      <!-- 문의 폼 -->
      <div class="card" style="padding:24px; margin-bottom:20px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">📝 문의하기</h3>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">문의 유형</label>
            <select id="support-type" class="input" style="width:100%;">
              <option value="bug">🐛 버그/오류 신고</option>
              <option value="feature">💡 기능 제안</option>
              <option value="payment">💳 결제/요금제 문의</option>
              <option value="account">👤 계정 문의</option>
              <option value="other">📝 기타</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">제목</label>
            <input id="support-title" type="text" class="input" placeholder="문의 제목을 입력하세요" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">내용</label>
            <textarea id="support-content" class="input" rows="6" placeholder="문의 내용을 상세하게 작성해주세요.&#10;&#10;버그 신고 시: 어떤 상황에서 문제가 발생했는지 알려주시면 더 빠른 해결이 가능합니다." style="width:100%; resize:vertical; font-family:inherit;"></textarea>
          </div>
          <button id="btn-submit-support" class="btn btn-primary" style="align-self:flex-end; padding:10px 32px;">
            문의 보내기
          </button>
        </div>
      </div>

      <!-- 운영 안내 -->
      <div class="card" style="padding:20px;">
        <h3 style="font-size:14px; font-weight:700; margin-bottom:12px;">⏰ 운영 안내</h3>
        <div style="font-size:12px; color:var(--text-muted); line-height:2;">
          <div>• 이메일 답변: 영업일 기준 <strong>1~2일</strong> 이내</div>
          <div>• 운영 시간: 평일 09:00 ~ 18:00 (주말·공휴일 휴무)</div>
          <div>• 긴급 문의: sinbi0214@naver.com으로 [긴급] 표시 후 발송</div>
        </div>
      </div>
    </div>
  `;

  // 문의 전송
  document.getElementById('btn-submit-support')?.addEventListener('click', async () => {
    const type = document.getElementById('support-type').value;
    const title = document.getElementById('support-title').value.trim();
    const content = document.getElementById('support-content').value.trim();

    if (!title) { showToast('제목을 입력하세요.', 'warning'); return; }
    if (!content) { showToast('내용을 입력하세요.', 'warning'); return; }

    try {
      // Firestore에 문의 저장
      if (isConfigured) {
        await addDoc(collection(db, 'support_tickets'), {
          type,
          title,
          content,
          userEmail: user?.email || 'anonymous',
          userName: profile?.name || user?.displayName || 'unknown',
          userId: user?.uid || null,
          status: 'open',
          createdAt: serverTimestamp(),
        });
      }

      showToast('문의가 접수되었습니다! 빠르게 답변드리겠습니다.', 'success');
      document.getElementById('support-title').value = '';
      document.getElementById('support-content').value = '';
    } catch (e) {
      // Firestore 저장 실패 시에도 이메일 안내
      showToast('문의 접수 중 오류가 발생했습니다. sinbi0214@naver.com으로 직접 이메일을 보내주세요.', 'warning');
    }
  });
}
