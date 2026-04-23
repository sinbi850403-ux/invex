/**
 * page-admin.js - 총관리자 대시보드 (Pro Edition)
 * 역할: 백엔드에 저장된 실제 사용자 데이터를 조회하여 SaaS 전체를 관리
 * 관리자 권한 체크
 * 접근 제한: 총관리자 이메일만 접근 가능, 일반 사용자에게는 메뉴 자체가 숨김
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { getCurrentUser } from './auth.js';
import { PLANS, setPlan } from './plan.js';
import { supabase } from './supabase-client.js';
import { escapeHtml } from './ux-toolkit.js';

// ═══════════════════════════════════════════
// 전역 onclick 핸들러 (이벤트 버블링 우회)
// ═══════════════════════════════════════════
let _adminUserCache = [];
let _adminContainer = null;
let _adminNavigateTo = null;

window._invexAdminAction = function(btn) {
  const action = btn.dataset.action;
  const uid    = btn.dataset.uid;
  const u      = _adminUserCache.find(x => x.id === uid);

  if (action === 'detail') {
    if (u) showUserDetailModal(u);
    else showToast('사용자 정보를 찾을 수 없습니다', 'error');

  } else if (action === 'plan') {
    if (u) showPlanChangeModal(u, _adminContainer, _adminNavigateTo);
    else showToast('사용자 정보를 찾을 수 없습니다', 'error');

  } else if (action === 'suspend') {
    const current   = btn.dataset.status;
    const newStatus = current === 'suspended' ? 'active' : 'suspended';
    supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', uid)
      .then(({ error }) => {
        if (error) { showToast('처리 실패: ' + error.message, 'error'); return; }
        showToast(
          newStatus === 'suspended' ? '사용자를 정지했습니다.' : '사용자를 활성화했습니다.',
          newStatus === 'suspended' ? 'warning' : 'success'
        );
        if (_adminContainer && _adminNavigateTo)
          renderAdminPage(_adminContainer, _adminNavigateTo);
      });
  }
};

// ═══════════════════════════════════════════
// 총관리자(사이트 소유자) 이메일 목록
// ═══════════════════════════════════════════
const ADMIN_EMAILS = [
  'sinbi0214@naver.com',     // 총관리자 (네이버)
  'sinbi850403@gmail.com',   // 총관리자 (구글)
  'admin@invex.io.kr',       // 시스템 관리자
];

/**
 * 관리자 권한 체크
 */
export function isAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email);
}

/**
 * 백엔드 사용자 목록 가져오기 (Supabase profiles 테이블)
 * Supabase cold start 대응: 최대 3회 재시도, 타임아웃 20초
 */
async function fetchAllUsers(attempt = 1) {
  try {
    const timeout = 20000; // 20초 (cold start 대응)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Supabase query timeout')), timeout)
    );

    const queryPromise = supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error) {
      console.warn(`사용자 목록 조회 실패 (시도 ${attempt}):`, error.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        return fetchAllUsers(attempt + 1);
      }
      return [];
    }

    if (!Array.isArray(data) || data.length === 0) {
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
        return fetchAllUsers(attempt + 1);
      }
      return [];
    }

    // 필드명 정규화 (DB 컬럼명 → JS 객체)
    return data.map(u => ({
      ...u,
      photoURL: u.photo_url,
      lastLogin: u.last_login_at,
      createdAt: u.created_at,
    }));
  } catch (e) {
    console.warn(`사용자 목록 조회 실패 (시도 ${attempt}):`, e.message);
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1500 * attempt));
      return fetchAllUsers(attempt + 1);
    }
    return [];
  }
}

/**
 * 날짜 포맷 유틸
 */
function fmt(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return fmt(iso);
}

/**
 * ═══════════════════════════════════════════
 * 메인 렌더 함수
 * ═══════════════════════════════════════════
 */
export async function renderAdminPage(container, navigateTo) {
  const user = getCurrentUser();

  // 관리자 아닌 경우 차단
  if (!isAdmin()) {
    container.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:center; min-height:60vh; text-align:center;">
        <div>
          <div style="font-size:64px; margin-bottom:16px;">🚫</div>
          <h2 style="font-size:20px; font-weight:700; margin-bottom:8px;">접근 권한이 없습니다</h2>
          <p style="color:var(--text-muted);">총관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    `;
    return;
  }

  // 로딩 표시
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; min-height:40vh;">
      <div style="text-align:center;">
        <div style="font-size:32px; animation:spin 1s linear infinite;">⚙️</div>
        <p style="margin-top:12px; color:var(--text-muted);">관리자 데이터를 불러오는 중...</p>
      </div>
    </div>
  `;

  // 백엔드에서 실제 사용자 데이터 조회
  const allUsers = await fetchAllUsers();
  // 전역 캐시에 저장 (onclick 핸들러에서 참조)
  _adminUserCache  = allUsers;
  _adminContainer  = container;
  _adminNavigateTo = navigateTo;
  const state = getState();
  const notices = state.adminNotices || [];
  const paymentHistory = state.paymentHistory || [];
  const totalItems = (state.mappedData || []).length;
  const totalTransactions = (state.transactions || []).length;

  // 통계 계산
  const totalUsers = allUsers.length;
  const freeUsers = allUsers.filter(u => (u.plan || 'free') === 'free').length;
  const proUsers = allUsers.filter(u => u.plan === 'pro').length;
  const entUsers = allUsers.filter(u => u.plan === 'enterprise').length;
  const paidUsers = proUsers + entUsers;
  const conversionRate = totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 100) : 0;
  const monthlyRevenue = (proUsers * 290000) + (entUsers * 490000);

  // 최근 활동 (최근 로그인 기준 정렬)
  const recentUsers = [...allUsers]
    .sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0))
    .slice(0, 8);

  // 오늘 가입자
  const today = new Date().toISOString().slice(0, 10);
  const todaySignups = allUsers.filter(u => u.createdAt?.startsWith(today)).length;

  // 7일 내 활성 사용자
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeUsers = allUsers.filter(u => u.lastLogin && new Date(u.lastLogin).getTime() > weekAgo).length;

  container.innerHTML = `
    <!-- 헤더 -->
    <div class="page-header" style="margin-bottom:20px;">
      <div>
        <h1 class="page-title" style="display:flex; align-items:center; gap:10px;">
          <span style="background:linear-gradient(135deg,#f59e0b,#ef4444); padding:8px; border-radius:10px; font-size:20px; line-height:1;">👑</span>
          총관리자 대시보드
        </h1>
        <div class="page-desc">INVEX 서비스 전체 관리 · ${user?.email || ''}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="font-size:11px; color:var(--text-muted);">마지막 새로고침: ${new Date().toLocaleTimeString('ko-KR')}</span>
        <button class="btn btn-ghost btn-sm" id="btn-admin-refresh" style="gap:4px;">🔄 새로고침</button>
      </div>
    </div>

    <!-- KPI 카드 (6열) -->
    <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:12px; margin-bottom:20px;">
      ${kpiCard('👥', '전체 사용자', totalUsers, '명', '#3b82f6', `오늘 +${todaySignups}`)}
      ${kpiCard('🟢', '활성 사용자', activeUsers, '명 (7일)', '#22c55e', `${totalUsers > 0 ? Math.round((activeUsers/totalUsers)*100) : 0}% 활동`)}
      ${kpiCard('💎', '유료 전환율', conversionRate, '%', '#8b5cf6', `Pro ${proUsers} / ENT ${entUsers}`)}
      ${kpiCard('💰', '예상 월 매출', '₩' + monthlyRevenue.toLocaleString(), '', '#f59e0b', '월간')}
      ${kpiCard('📦', '등록 품목', totalItems.toLocaleString(), '건', '#06b6d4', '전체')}
      ${kpiCard('📋', '총 거래', totalTransactions.toLocaleString(), '건', '#ec4899', '누적')}
    </div>

    <!-- 메인 2단 레이아웃 -->
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:20px;">

      <!-- 왼쪽: 사용자 관리 카드 목록 -->
      <div class="card" style="padding:0; overflow:hidden;">
        <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:16px;">👥</span>
            <div>
              <div style="font-weight:700; font-size:14px;">사용자 관리</div>
              <div style="font-size:11px; color:var(--text-muted);">총 ${totalUsers}명 등록</div>
            </div>
          </div>
          <input class="form-input" id="admin-user-search" placeholder="🔍 이름 / 이메일 검색" style="width:200px; font-size:12px; padding:6px 10px; border-radius:6px;" />
        </div>
        <div style="max-height:500px; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:8px;" id="admin-user-cards">
          ${allUsers.length > 0 ? allUsers.map(u => renderUserCard(u)).join('') : `
            <div style="text-align:center; padding:48px; color:var(--text-muted);">
              <div style="font-size:36px; margin-bottom:12px;">👥</div>
              <div style="font-size:14px; font-weight:600;">아직 가입된 사용자가 없습니다</div>
            </div>
          `}
        </div>
      </div>


      <!-- 오른쪽 패널 -->
      <div style="display:flex; flex-direction:column; gap:16px;">

        <!-- 요금제 분포 차트 -->
        <div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div style="font-weight:700; font-size:14px;">📊 요금제 분포</div>
          </div>
          ${totalUsers > 0 ? `
            <div style="display:flex; gap:6px; height:12px; border-radius:6px; overflow:hidden; margin-bottom:14px;">
              ${freeUsers > 0 ? `<div style="flex:${freeUsers}; background:#64748b;" title="Free ${freeUsers}명"></div>` : ''}
              ${proUsers > 0 ? `<div style="flex:${proUsers}; background:#3b82f6;" title="Pro ${proUsers}명"></div>` : ''}
              ${entUsers > 0 ? `<div style="flex:${entUsers}; background:#8b5cf6;" title="Enterprise ${entUsers}명"></div>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; font-size:12px;">
              ${planRow('🆓', 'Free', freeUsers, totalUsers, '#64748b')}
              ${planRow('⭐', 'Pro', proUsers, totalUsers, '#3b82f6')}
              ${planRow('🏢', 'Enterprise', entUsers, totalUsers, '#8b5cf6')}
            </div>
          ` : `
            <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">데이터 없음</div>
          `}
        </div>

        <!-- 최근 활동 -->
        <div class="card">
          <div style="font-weight:700; font-size:14px; margin-bottom:14px;">🕐 최근 활동</div>
          <div style="display:flex; flex-direction:column; gap:2px; max-height:220px; overflow-y:auto;">
            ${recentUsers.length > 0 ? recentUsers.map(u => `
              <div style="display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--border); font-size:12px;">
                <div style="width:28px; height:28px; border-radius:50%; background:var(--bg-secondary); display:flex; align-items:center; justify-content:center; font-size:11px; flex-shrink:0;">
                  ${u.photoURL ? `<img src="${u.photoURL}" style="width:28px; height:28px; border-radius:50%;" />` : u.name?.charAt(0) || '👤'}
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.name || '사용자'}</div>
                  <div style="color:var(--text-muted); font-size:10px;">${u.email || ''}</div>
                </div>
                <div style="color:var(--text-muted); font-size:10px; white-space:nowrap;">${timeAgo(u.lastLogin)}</div>
              </div>
            `).join('') : `
              <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">활동 없음</div>
            `}
          </div>
        </div>
      </div>
    </div>

    <!-- 하단: 3단 레이아웃 -->
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; margin-bottom:20px;">

      <!-- 공지사항 -->
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
          <div style="font-weight:700; font-size:14px;">📢 공지사항</div>
          <button class="btn btn-ghost btn-sm" id="btn-add-notice" style="font-size:11px;">+ 작성</button>
        </div>
        ${notices.length > 0 ? notices.slice(0, 4).map(n => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong style="font-size:12px;">${n.title}</strong>
              <span style="font-size:9px; color:var(--text-muted);">${timeAgo(n.date)}</span>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${n.content}</div>
          </div>
        `).join('') : `
          <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:12px;">
            공지를 작성해보세요.
          </div>
        `}
      </div>

      <!-- 최근 결제 -->
      <div class="card">
        <div style="font-weight:700; font-size:14px; margin-bottom:14px;">💳 최근 결제</div>
        ${paymentHistory.length > 0 ? paymentHistory.slice(0, 5).map(p => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border); font-size:12px;">
            <div>
              <div style="font-weight:600;">${p.userName || '-'}</div>
              <div style="color:var(--text-muted); font-size:10px;">${p.planName}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700; color:var(--success);">${p.amount}</div>
              <div style="font-size:10px; color:var(--text-muted);">${timeAgo(p.date)}</div>
            </div>
          </div>
        `).join('') : `
          <div style="text-align:center; padding:24px; color:var(--text-muted); font-size:12px;">결제 내역 없음</div>
        `}
      </div>

      <!-- 시스템 정보 -->
      <div class="card">
        <div style="font-weight:700; font-size:14px; margin-bottom:14px;">🖥️ 시스템 정보</div>
        <div style="font-size:12px; line-height:2;">
          ${sysRow('도메인', '<a href="https://invex.io.kr" target="_blank" style="color:var(--accent);">invex.io.kr</a>')}
          ${sysRow('호스팅', 'Vercel Edge')}
          ${sysRow('데이터베이스', 'Supabase Database')}
          ${sysRow('인증', 'Supabase Auth')}
          ${sysRow('결제', '토스페이먼츠')}
          ${sysRow('버전', '<span style="background:var(--accent); color:#fff; padding:1px 6px; border-radius:4px; font-size:10px;">v3.1</span>')}
          ${sysRow('관리자', user?.email || '-')}
        </div>
      </div>
    </div>

    <!-- 고객 문의 관리 -->
    <div class="card" style="padding:0; overflow:hidden; margin-bottom:20px;">
      <div style="padding:16px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:16px;">💬</span>
          <div>
            <div style="font-weight:700; font-size:14px;">고객 문의 관리</div>
            <div style="font-size:11px; color:var(--text-muted);">접수된 문의에 답변하세요</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" id="btn-load-tickets">🔄 새로고침</button>
      </div>
      <div id="admin-tickets-area" style="max-height:500px; overflow-y:auto; padding:16px;">
        <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">불러오는 중...</div>
      </div>
    </div>
  `;

  // ═══════════════════════════════════════════
  // 이벤트 바인딩
  // ═══════════════════════════════════════════

  // 새로고침
  container.querySelector('#btn-admin-refresh')?.addEventListener('click', () => {
    renderAdminPage(container, navigateTo);
  });

  // 사용자 검색
  container.querySelector('#admin-user-search')?.addEventListener('input', (e) => {
    filterUsers(container);
  });

  // 요금제 필터
  container.querySelector('#admin-filter-plan')?.addEventListener('change', () => {
    filterUsers(container);
  });

  // (관리 버튼은 onclick="window._invexAdminAction(this)" 인라인으로 처리됨)

  // 공지 작성
  container.querySelector('#btn-add-notice')?.addEventListener('click', () => {
    showNoticeModal(container, navigateTo);
  });

  // 고객 문의 로드
  loadAdminTickets(container);
  container.querySelector('#btn-load-tickets')?.addEventListener('click', () => loadAdminTickets(container));
}

// ═══════════════════════════════════════════
// 헬퍼: KPI 카드 생성
// ═══════════════════════════════════════════
function kpiCard(icon, label, value, unit, color, sub) {
  return `
    <div class="card" style="padding:16px; text-align:center; position:relative; overflow:hidden;">
      <div style="position:absolute; top:-8px; right:-8px; font-size:42px; opacity:0.06;">${icon}</div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px;">${label}</div>
      <div style="font-size:22px; font-weight:800; color:${color}; line-height:1.2;">${value}<span style="font-size:11px; font-weight:400; color:var(--text-muted);">${unit}</span></div>
      <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">${sub}</div>
    </div>
  `;
}

// 요금제 분포 행
function planRow(icon, name, count, total, color) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return `
    <div style="display:flex; align-items:center; gap:8px;">
      <span>${icon}</span>
      <span style="width:70px;">${name}</span>
      <div style="flex:1; height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
        <div style="width:${pct}%; height:100%; background:${color}; border-radius:3px; transition:width 0.4s;"></div>
      </div>
      <span style="width:32px; text-align:right; font-weight:600;">${count}</span>
      <span style="width:32px; text-align:right; color:var(--text-muted);">${pct}%</span>
    </div>
  `;
}

// 시스템 행
function sysRow(label, value) {
  return `
    <div style="display:flex; justify-content:space-between; padding:2px 0; border-bottom:1px solid var(--border);">
      <span style="color:var(--text-muted);">${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

// ═══════════════════════════════════════════
// 사용자 테이블 행
// ═══════════════════════════════════════════
function renderUserRow(u) {
  const planId = u.plan || 'free';
  const planInfo = PLANS[planId] || PLANS.free;
  const isActive = u.status !== 'suspended';
  const isOnline = u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 15 * 60 * 1000;

  return `
    <tr data-uid="${u.id}" data-plan="${planId}" data-email="${u.email || ''}" data-name="${u.name || ''}">
      <td style="padding-left:20px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="position:relative;">
            ${u.photoURL
              ? `<img src="${u.photoURL}" style="width:32px; height:32px; border-radius:50%; object-fit:cover;" />`
              : `<div style="width:32px; height:32px; border-radius:50%; background:linear-gradient(135deg,${planInfo.color}30,${planInfo.color}15); display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:${planInfo.color};">${(u.name || '?').charAt(0)}</div>`
            }
            ${isOnline ? `<div style="position:absolute; bottom:0; right:0; width:8px; height:8px; border-radius:50%; background:#22c55e; border:2px solid var(--bg-primary);"></div>` : ''}
          </div>
          <div>
            <div style="font-weight:600; font-size:13px;">${u.name || '(이름 없음)'}</div>
            <div style="font-size:10px; color:var(--text-muted);">${u.email || '-'}</div>
          </div>
        </div>
      </td>
      <td>
        <span style="
          display:inline-flex; align-items:center; gap:3px;
          padding:3px 8px; border-radius:5px; font-size:11px; font-weight:600;
          background:${planInfo.color}15; color:${planInfo.color};
        ">
          ${planInfo.icon} ${planId.toUpperCase()}
        </span>
      </td>
      <td>
        <div style="font-size:11px; ${isOnline ? 'color:#22c55e; font-weight:600;' : 'color:var(--text-muted);'}">
          ${isOnline ? '🟢 온라인' : timeAgo(u.lastLogin)}
        </div>
      </td>
      <td>
        <span style="
          display:inline-flex; align-items:center; gap:3px;
          padding:2px 7px; border-radius:4px; font-size:10px; font-weight:600;
          background:${isActive ? '#22c55e15' : '#ef444415'}; color:${isActive ? '#22c55e' : '#ef4444'};
        ">
          ${isActive ? '● 활성' : '● 정지'}
        </span>
      </td>
      <td style="text-align:center;">
        <div style="display:flex; gap:2px; justify-content:center;">
          <button class="btn btn-ghost btn-sm" onclick="window._invexAdminAction(this)" data-action="detail" data-uid="${u.id}" title="상세 보기" style="font-size:12px; padding:4px 6px;">👁️</button>
          <button class="btn btn-ghost btn-sm" onclick="window._invexAdminAction(this)" data-action="plan" data-uid="${u.id}" title="요금제 변경" style="font-size:12px; padding:4px 6px;">💎</button>
          <button class="btn btn-ghost btn-sm" onclick="window._invexAdminAction(this)" data-action="suspend" data-uid="${u.id}" data-status="${u.status || 'active'}" title="${isActive ? '정지' : '활성화'}" style="font-size:12px; padding:4px 6px;">
            ${isActive ? '● 활성' : '● 정지'}
          </button>
        </div>
      </td>
    </tr>
  `;
}

// ═══════════════════════════════════════════
// 사용자 카드 렌더
// ═══════════════════════════════════════════
function renderUserCard(u) {
  const planId = u.plan || 'free';
  const planInfo = PLANS[planId] || PLANS.free;
  const isActive = u.status !== 'suspended';
  const isOnline = u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 15 * 60 * 1000;

  return `
    <div style="
      display:flex; align-items:center; gap:12px;
      padding:12px 14px; border-radius:10px;
      border:1px solid var(--border);
      background:var(--bg-secondary);
    " data-email="${u.email || ''}" data-name="${u.name || ''}" data-plan="${planId}">

      <!-- 아바타 -->
      <div style="position:relative; flex-shrink:0;">
        ${u.photoURL
          ? `<img src="${u.photoURL}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;" />`
          : `<div style="width:38px;height:38px;border-radius:50%;background:${planInfo.color}25;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:${planInfo.color};">${(u.name||'?').charAt(0)}</div>`
        }
        ${isOnline ? `<div style="position:absolute;bottom:0;right:0;width:9px;height:9px;border-radius:50%;background:#22c55e;border:2px solid var(--bg-secondary);"></div>` : ''}
      </div>

      <!-- 사용자 정보 -->
      <div style="flex:1; min-width:0;">
        <div style="font-weight:700; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.name || '(이름 없음)'}</div>
        <div style="font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email || '-'}</div>
        <div style="display:flex; align-items:center; gap:6px; margin-top:4px;">
          <span style="font-size:10px; padding:1px 6px; border-radius:4px; background:${planInfo.color}15; color:${planInfo.color}; font-weight:600;">${planInfo.icon} ${planId.toUpperCase()}</span>
          <span style="font-size:10px; padding:1px 6px; border-radius:4px; background:${isActive ? '#22c55e15' : '#ef444415'}; color:${isActive ? '#22c55e' : '#ef4444'}; font-weight:600;">${isActive ? '● 활성' : '● 정지'}</span>
          ${isOnline ? `<span style="font-size:10px; color:#22c55e;">🟢 온라인</span>` : `<span style="font-size:10px; color:var(--text-muted);">${timeAgo(u.lastLogin)}</span>`}
        </div>
      </div>

      <!-- 액션 버튼 -->
      <div style="display:flex; gap:6px; flex-shrink:0;">
        <button type="button" onclick="window._invexAdminAction(this)" data-action="detail" data-uid="${u.id}"
          style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg-primary); cursor:pointer; font-size:12px; color:var(--text-primary); white-space:nowrap;"
          title="상세 보기">👁 상세</button>
        <button type="button" onclick="window._invexAdminAction(this)" data-action="plan" data-uid="${u.id}"
          style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg-primary); cursor:pointer; font-size:12px; color:var(--text-primary); white-space:nowrap;"
          title="요금제 변경">💎 요금제</button>
        <button type="button" onclick="window._invexAdminAction(this)" data-action="suspend" data-uid="${u.id}" data-status="${u.status || 'active'}"
          style="padding:6px 10px; border-radius:6px; border:1px solid ${isActive ? '#ef444430' : '#22c55e30'}; background:${isActive ? '#ef444410' : '#22c55e10'}; cursor:pointer; font-size:12px; color:${isActive ? '#ef4444' : '#22c55e'}; white-space:nowrap;"
          title="${isActive ? '정지' : '활성화'}">${isActive ? '🚫 정지' : '✅ 활성화'}</button>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════
// 필터링 (카드 기반)
// ═══════════════════════════════════════════
function filterUsers(container) {
  const q = (container.querySelector('#admin-user-search')?.value || '').toLowerCase();

  container.querySelectorAll('#admin-user-cards > div[data-email]').forEach(card => {
    const email = (card.dataset.email || '').toLowerCase();
    const name = (card.dataset.name || '').toLowerCase();
    const rowPlan = card.dataset.plan || 'free';

    const matchText = !q || email.includes(q) || name.includes(q);

    card.style.display = matchText ? '' : 'none';
  });
}

// ═══════════════════════════════════════════
// 사용자 상세 모달
// ═══════════════════════════════════════════
function showUserDetailModal(u) {
  const planInfo = PLANS[u.plan || 'free'] || PLANS.free;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-header" style="background:linear-gradient(135deg,${planInfo.color}20,transparent); border-bottom:1px solid var(--border);">
        <div style="display:flex; align-items:center; gap:12px;">
          ${u.photoURL
            ? `<img src="${u.photoURL}" style="width:48px; height:48px; border-radius:50%;" />`
            : `<div style="width:48px; height:48px; border-radius:50%; background:${planInfo.color}25; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:${planInfo.color};">${(u.name || '?').charAt(0)}</div>`
          }
          <div>
            <h3 style="margin:0; font-size:16px;">${u.name || '사용자'}</h3>
            <div style="font-size:12px; color:var(--text-muted);">${u.email || '-'}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm modal-close">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:13px;">
          <div style="padding:12px; background:var(--bg-secondary); border-radius:8px;">
            <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;">요금제</div>
            <div style="font-weight:700; color:${planInfo.color};">${planInfo.icon} ${planInfo.name}</div>
          </div>
          <div style="padding:12px; background:var(--bg-secondary); border-radius:8px;">
            <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;">상태</div>
            <div style="font-weight:700; color:${u.status === 'suspended' ? '#ef4444' : '#22c55e'};">${u.status === 'suspended' ? '🚫 정지' : '✅ 활성'}</div>
          </div>
          <div style="padding:12px; background:var(--bg-secondary); border-radius:8px;">
            <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;">역할</div>
            <div style="font-weight:700;">${u.role === 'admin' ? '👑 관리자' : u.role === 'manager' ? '📋 매니저' : '👤 일반'}</div>
          </div>
          <div style="padding:12px; background:var(--bg-secondary); border-radius:8px;">
            <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;">UID</div>
            <div style="font-weight:500; font-size:10px; word-break:break-all;">${u.id || u.uid || '-'}</div>
          </div>
        </div>
        <div style="margin-top:16px; font-size:12px; line-height:2.2;">
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">가입일</span>
            <strong>${fmt(u.createdAt)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border);">
            <span style="color:var(--text-muted);">최근 접속</span>
            <strong>${fmt(u.lastLogin)}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span style="color:var(--text-muted);">접속 방법</span>
            <strong>${u.photoURL ? '🌐 Google' : '📧 이메일'}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

// ═══════════════════════════════════════════
// 요금제 변경 모달
// ═══════════════════════════════════════════
function showPlanChangeModal(user, container, navigateTo) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <h3>💎 요금제 변경 — ${user.name || '사용자'}</h3>
        <button class="btn btn-ghost btn-sm modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:12px;">
          ${Object.values(PLANS).map(p => `
            <div class="plan-card-admin" data-plan="${p.id}" style="
              border:2px solid ${(user.plan || 'free') === p.id ? p.color : 'var(--border)'};
              border-radius:10px; padding:16px; text-align:center; cursor:pointer;
              background:${(user.plan || 'free') === p.id ? p.color + '15' : 'var(--bg-secondary)'};
              transition:all 0.2s;
            " onmouseover="this.style.borderColor='${p.color}'" onmouseout="this.style.borderColor='${(user.plan || 'free') === p.id ? p.color : 'var(--border)'}'" >
              <div style="font-size:24px;">${p.icon}</div>
              <div style="font-size:13px; font-weight:700; margin:4px 0;">${p.name}</div>
              <div style="font-size:15px; font-weight:800; color:${p.color};">${p.price}</div>
              ${(user.plan || 'free') === p.id ? '<div style="font-size:10px; color:var(--success); margin-top:4px;">✓ 현재</div>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelectorAll('.plan-card-admin').forEach(card => {
    card.addEventListener('click', async () => {
      const planId = card.dataset.plan;
      try {
        // .select()로 실제 업데이트된 행 수 확인 — RLS 차단 시 data=[] 반환
        const { data, error } = await supabase
          .from('profiles')
          .update({ plan: planId })
          .eq('id', user.id)
          .select('id, plan');

        if (error) throw error;

        // data가 비어있으면 RLS가 업데이트를 차단한 것
        if (!data || data.length === 0) {
          throw new Error(
            'RLS 정책으로 인해 변경이 차단됐습니다.\n' +
            'Supabase SQL Editor에서 supabase/fix-admin-plan-update.sql 을 실행해 주세요.'
          );
        }

        // 로컬 캐시 즉시 반영 (재렌더 전 캐시 동기화)
        if (_adminUserCache) {
          const cached = _adminUserCache.find(u => u.id === user.id);
          if (cached) cached.plan = planId;
        }

        // 현재 로그인한 관리자 본인이면 로컬 플랜도 갱신
        const me = getCurrentUser();
        if (me?.uid === user.id) {
          setPlan(planId);
        }

        modal.remove();
        showToast(`${user.name || '사용자'}님의 요금제를 ${PLANS[planId].name}으로 변경했습니다.`, 'success');
        renderAdminPage(container, navigateTo);
      } catch (e) {
        showToast('변경 실패: ' + e.message, 'error');
      }
    });
  });
}

// ═══════════════════════════════════════════
// 공지사항 모달
// ═══════════════════════════════════════════
function showNoticeModal(container, navigateTo) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:450px;">
      <div class="modal-header">
        <h3>📢 공지사항 작성</h3>
        <button class="btn btn-ghost btn-sm modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">제목</label>
          <input class="form-input" id="notice-title" placeholder="공지 제목" />
        </div>
        <div class="form-group">
          <label class="form-label">내용</label>
          <textarea class="form-input" id="notice-content" rows="4" placeholder="공지 내용을 입력하세요"></textarea>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-ghost modal-close">취소</button>
        <button class="btn btn-primary" id="notice-save">📢 게시</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => modal.remove()));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#notice-save').addEventListener('click', () => {
    const title = modal.querySelector('#notice-title').value.trim();
    const content = modal.querySelector('#notice-content').value.trim();
    if (!title) { showToast('제목을 입력하세요.', 'warning'); return; }
    const notices = getState().adminNotices || [];
    notices.unshift({ id: 'n' + Date.now(), title, content, date: new Date().toISOString() });
    setState({ adminNotices: notices });
    modal.remove();
    showToast('공지가 게시되었습니다.', 'success');
    renderAdminPage(container, navigateTo);
  });
}

// ═══════════════════════════════════════════
// 고객 문의 관리 — 목록 로드 + 답변
// ═══════════════════════════════════════════
const TICKET_STATUS = {
  open: { label: '답변 대기', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  progress: { label: '확인 중', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  closed: { label: '답변 완료', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

async function loadAdminTickets(container) {
  const area = container.querySelector('#admin-tickets-area');
  if (!area) return;

  try {
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !tickets || tickets.length === 0) {
      area.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">접수된 문의가 없습니다.</div>';
      return;
    }

    area.innerHTML = '';
    tickets.forEach(d => {
      const st = TICKET_STATUS[d.status] || TICKET_STATUS.open;
      const date = d.created_at
        ? new Date(d.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '-';

      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:8px; margin-bottom:6px; border:1px solid var(--border); gap:12px;';
      row.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
            <span style="font-size:10px; padding:1px 6px; border-radius:3px; background:${st.bg}; color:${st.color}; font-weight:600;">${st.label}</span>
            <span style="font-size:11px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(d.title || '')}</span>
          </div>
          <div style="font-size:10px; color:var(--text-muted);">${escapeHtml(d.user_name || '')} (${escapeHtml(d.user_email || '')}) · ${date}</div>
        </div>
        <button class="btn btn-ghost btn-sm btn-reply-ticket" data-id="${escapeHtml(d.id)}" style="font-size:11px; flex-shrink:0;">${d.reply ? '답변 수정' : '답변하기'}</button>
      `;
      area.appendChild(row);
    });

    // 답변 버튼 이벤트
    area.querySelectorAll('.btn-reply-ticket').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ticketId = btn.dataset.id;
        const ticket = tickets.find(t => t.id === ticketId);
        if (ticket) showReplyModal(ticketId, ticket, container);
      });
    });
  } catch (e) {
    area.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">문의 목록을 불러올 수 없습니다.</div>';
  }
}

/**
 * 답변 모달 — 관리자가 문의에 답변
 */
function showReplyModal(ticketId, data, container) {
  const existing = document.getElementById('reply-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'reply-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h3>💬 문의 답변</h3>
        <button class="modal-close" id="reply-close">×</button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div style="margin-bottom:16px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
          <div style="font-size:13px; font-weight:600; margin-bottom:4px;">${escapeHtml(data.title)}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-bottom:8px;">${escapeHtml(data.userName)} (${escapeHtml(data.userEmail)})</div>
          <div style="font-size:12px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(data.content)}</div>
        </div>
        <label style="font-size:12px; font-weight:600; color:var(--text-muted); display:block; margin-bottom:4px;">답변 내용</label>
        <textarea id="reply-content" class="input" rows="5" style="width:100%; resize:vertical; font-family:inherit;">${escapeHtml(data.reply || '')}</textarea>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:12px;">
          <button class="btn btn-ghost" id="reply-cancel">취소</button>
          <button class="btn btn-primary" id="reply-submit">답변 저장</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('#reply-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#reply-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#reply-submit').addEventListener('click', async () => {
    const reply = document.getElementById('reply-content').value.trim();
    if (!reply) { showToast('답변 내용을 입력하세요.', 'warning'); return; }

    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ reply, status: 'closed', replied_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (error) throw error;
      modal.remove();
      showToast('답변이 저장되었습니다.', 'success');
      loadAdminTickets(container);
    } catch (e) {
      showToast('저장 실패: ' + e.message, 'error');
    }
  });
}
