/**
 * page-support.js - 고객 문의 (게시판 형태)
 * 왜 게시판? → 이메일은 보내면 끝이지만, 게시판은 문의 내역과 답변 상태를 확인할 수 있음
 */
import { getCurrentUser, getUserProfileData } from './auth.js';
import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, deleteDoc } from './backend-store.js';
import { db, isConfigured } from './backend-config.js';
import { showToast } from './toast.js';

// 문의 상태별 라벨
const STATUS_MAP = {
  open: { label: '답변 대기', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  progress: { label: '확인 중', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  closed: { label: '답변 완료', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

// 문의 유형 라벨
const TYPE_MAP = {
  bug: '버그/오류',
  feature: '기능 제안',
  payment: '결제/요금제',
  account: '계정',
  other: '기타',
};

let currentView = 'list'; // 'list' | 'write' | 'detail'

export function renderSupportPage(container) {
  currentView = 'list';
  renderListView(container);
}

/**
 * 목록 뷰 — 내 문의 내역 + 글쓰기 버튼
 */
async function renderListView(container) {
  const user = getCurrentUser();

  container.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:24px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <div>
          <h2 style="font-size:22px; font-weight:800;">고객 문의</h2>
          <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">문의 내역과 답변을 확인할 수 있습니다.</p>
        </div>
        <button id="btn-write" class="btn btn-primary" style="padding:8px 20px; font-size:13px;">문의 작성</button>
      </div>

      <div id="ticket-list" style="display:flex; flex-direction:column; gap:8px;">
        <div style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">불러오는 중...</div>
      </div>
    </div>
  `;

  document.getElementById('btn-write').addEventListener('click', () => renderWriteView(container));

  // 저장소에서 내 문의 불러오기
  await loadMyTickets(container, user);
}

/**
 * 저장소에서 내 문의 목록 로드
 */
async function loadMyTickets(container, user) {
  const listEl = document.getElementById('ticket-list');
  if (!listEl) return;

  if (!isConfigured || !user) {
    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">로그인 후 이용해주세요.</div>`;
    return;
  }

  try {
    const q = query(
      collection(db, 'support_tickets'),
      where('userId', '==', user.uid)
    );
    const snapshot = await getDocs(q);

    // 클라이언트에서 최신순 정렬 (복합 인덱스 불필요)
    const tickets = [];
    snapshot.forEach(d => tickets.push({ id: d.id, ...d.data() }));
    tickets.sort((a, b) => {
      const ta = a.createdAt?.toDate?.() || new Date(0);
      const tb = b.createdAt?.toDate?.() || new Date(0);
      return tb - ta;
    });

    if (tickets.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:60px 20px;">
          <div style="font-size:36px; margin-bottom:12px; opacity:0.4;">📭</div>
          <div style="color:var(--text-muted); font-size:14px;">아직 문의 내역이 없습니다.</div>
          <div style="color:var(--text-muted); font-size:12px; margin-top:4px;">궁금한 점이 있으시면 문의를 남겨주세요.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    tickets.forEach(ticket => {
      const data = ticket;
      const status = STATUS_MAP[data.status] || STATUS_MAP.open;
      const typeLabel = TYPE_MAP[data.type] || data.type;
      const date = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-';

      const row = document.createElement('div');
      row.className = 'card';
      row.style.cssText = 'padding:16px 20px; cursor:pointer; transition:border-color 0.2s;';
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:${status.bg}; color:${status.color}; font-weight:600;">${status.label}</span>
              <span style="font-size:11px; color:var(--text-muted);">${typeLabel}</span>
            </div>
            <div style="font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${data.title}</div>
          </div>
          <div style="font-size:11px; color:var(--text-muted); white-space:nowrap; flex-shrink:0;">${date}</div>
        </div>
      `;
      row.addEventListener('mouseover', () => row.style.borderColor = 'rgba(139,92,246,0.3)');
      row.addEventListener('mouseout', () => row.style.borderColor = '');
      row.addEventListener('click', () => renderDetailView(container, ticket.id, data));
      listEl.appendChild(row);
    });
  } catch (e) {
    listEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted); font-size:13px;">문의 목록을 불러올 수 없습니다.</div>`;
  }
}

/**
 * 작성 뷰 — 새 문의 등록
 */
function renderWriteView(container) {
  const user = getCurrentUser();
  const profile = getUserProfileData();

  container.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:24px;">
      <button id="btn-back" class="btn btn-ghost" style="margin-bottom:16px; font-size:13px;">← 목록으로</button>

      <div class="card" style="padding:24px;">
        <h3 style="font-size:18px; font-weight:700; margin-bottom:20px;">문의 작성</h3>
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">문의 유형</label>
            <select id="support-type" class="input" style="width:100%;">
              <option value="bug">버그/오류 신고</option>
              <option value="feature">기능 제안</option>
              <option value="payment">결제/요금제 문의</option>
              <option value="account">계정 문의</option>
              <option value="other">기타</option>
            </select>
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">제목</label>
            <input id="support-title" type="text" class="input" placeholder="제목을 입력하세요" style="width:100%;" />
          </div>
          <div>
            <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">내용</label>
            <textarea id="support-content" class="input" rows="8" placeholder="문의 내용을 작성해주세요." style="width:100%; resize:vertical; font-family:inherit;"></textarea>
          </div>
          <div style="display:flex; gap:8px; justify-content:flex-end;">
            <button id="btn-cancel" class="btn btn-ghost">취소</button>
            <button id="btn-submit" class="btn btn-primary" style="padding:10px 28px;">등록</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => renderListView(container));
  document.getElementById('btn-cancel').addEventListener('click', () => renderListView(container));

  document.getElementById('btn-submit').addEventListener('click', async () => {
    const type = document.getElementById('support-type').value;
    const title = document.getElementById('support-title').value.trim();
    const content = document.getElementById('support-content').value.trim();

    if (!title) { showToast('제목을 입력하세요.', 'warning'); return; }
    if (!content) { showToast('내용을 입력하세요.', 'warning'); return; }

    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '등록 중...';

    try {
      if (isConfigured && user) {
        await addDoc(collection(db, 'support_tickets'), {
          type,
          title,
          content,
          userEmail: user.email || '',
          userName: profile?.name || user.displayName || '',
          userId: user.uid,
          status: 'open',
          reply: null,
          repliedAt: null,
          createdAt: serverTimestamp(),
        });
      }
      showToast('문의가 등록되었습니다.', 'success');
      renderListView(container);
    } catch (e) {
      showToast('등록에 실패했습니다. 다시 시도해주세요.', 'error');
      btn.disabled = false;
      btn.textContent = '등록';
    }
  });
}

/**
 * 상세 뷰 — 문의 내용 + 답변 확인
 */
function renderDetailView(container, ticketId, data) {
  const status = STATUS_MAP[data.status] || STATUS_MAP.open;
  const typeLabel = TYPE_MAP[data.type] || data.type;
  const date = data.createdAt?.toDate
    ? data.createdAt.toDate().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
  const replyDate = data.repliedAt?.toDate
    ? data.repliedAt.toDate().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  container.innerHTML = `
    <div style="max-width:700px; margin:0 auto; padding:24px;">
      <button id="btn-back" class="btn btn-ghost" style="margin-bottom:16px; font-size:13px;">← 목록으로</button>

      <!-- 문의 내용 -->
      <div class="card" style="padding:24px; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:${status.bg}; color:${status.color}; font-weight:600;">${status.label}</span>
          <span style="font-size:11px; color:var(--text-muted);">${typeLabel}</span>
          <span style="font-size:11px; color:var(--text-muted); margin-left:auto;">${date}</span>
        </div>
        <h3 style="font-size:18px; font-weight:700; margin-bottom:16px;">${data.title}</h3>
        <div style="font-size:13px; line-height:1.8; white-space:pre-wrap; color:var(--text-secondary);">${data.content}</div>
      </div>

      <!-- 답변 -->
      ${data.reply ? `
      <div class="card" style="padding:24px; border-left:3px solid #10b981;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
          <span style="font-size:13px; font-weight:700;">💬 관리자 답변</span>
          <span style="font-size:11px; color:var(--text-muted);">${replyDate}</span>
        </div>
        <div style="font-size:13px; line-height:1.8; white-space:pre-wrap; color:var(--text-secondary);">${data.reply}</div>
      </div>
      ` : `
      <div class="card" style="padding:24px; text-align:center;">
        <div style="font-size:13px; color:var(--text-muted);">아직 답변이 등록되지 않았습니다. 확인 후 답변드리겠습니다.</div>
      </div>
      `}

      <!-- 삭제 버튼 -->
      <div style="margin-top:16px; text-align:right;">
        <button id="btn-delete-ticket" class="btn btn-ghost" style="font-size:12px; color:#ef4444;">문의 삭제</button>
      </div>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => renderListView(container));

  document.getElementById('btn-delete-ticket').addEventListener('click', async () => {
    if (!confirm('이 문의를 삭제하시겠습니까?')) return;
    try {
      if (isConfigured) {
        await deleteDoc(doc(db, 'support_tickets', ticketId));
      }
      showToast('문의가 삭제되었습니다.', 'success');
      renderListView(container);
    } catch (e) {
      showToast('삭제에 실패했습니다.', 'error');
    }
  });
}
