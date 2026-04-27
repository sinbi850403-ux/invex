/**
 * AdminPage.jsx — 총관리자 대시보드
 * page-admin.js → React 변환 (9차)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { showToast } from '../toast.js';
import { PLANS, setPlan } from '../plan.js';
import { supabase } from '../supabase-client.js';

const ADMIN_EMAILS = [
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
];

// ─── 유틸 ─────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  return fmtDate(iso);
}
function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function fetchAllUsers(attempt = 1) {
  try {
    const timeout = 20000;
    const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout));
    const { data, error } = await Promise.race([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      timeoutP,
    ]);
    if (error) {
      if (attempt < 3) { await new Promise(r => setTimeout(r, 1500 * attempt)); return fetchAllUsers(attempt + 1); }
      return [];
    }
    if (!Array.isArray(data) || data.length === 0) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); return fetchAllUsers(attempt + 1); }
      return [];
    }
    return data.map(u => ({ ...u, photoURL: u.photo_url, lastLogin: u.last_login_at, createdAt: u.created_at }));
  } catch {
    if (attempt < 3) { await new Promise(r => setTimeout(r, 1500 * attempt)); return fetchAllUsers(attempt + 1); }
    return [];
  }
}

// ─── 모달: 사용자 상세 ───────────────────────────────
function UserDetailModal({ user: u, onClose }) {
  const planInfo = PLANS[u.plan || 'free'] || PLANS.free;
  const isActive = u.status !== 'suspended';
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header" style={{ background: `${planInfo.color}20`, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {u.photoURL
              ? <img src={u.photoURL} style={{ width: 48, height: 48, borderRadius: '50%' }} alt="" />
              : <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${planInfo.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: planInfo.color }}>{(u.name || '?').charAt(0)}</div>
            }
            <div>
              <h3 style={{ margin: 0, fontSize: 16 }}>{u.name || '사용자'}</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email || '-'}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm modal-close" onClick={onClose} />
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            {[
              { label: '요금제', val: <span style={{ fontWeight: 700, color: planInfo.color }}>{planInfo.icon} {planInfo.name}</span> },
              { label: '상태', val: <span style={{ fontWeight: 700, color: isActive ? '#22c55e' : '#ef4444' }}>{isActive ? '✅ 활성' : '🚫 정지'}</span> },
              { label: '역할', val: u.role === 'admin' ? '👑 관리자' : u.role === 'manager' ? '⭐ 매니저' : '👤 일반' },
              { label: 'UID', val: <span style={{ fontSize: 10, wordBreak: 'break-all' }}>{u.id || '-'}</span> },
            ].map(({ label, val }) => (
              <div key={label} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 12, lineHeight: 2.2 }}>
            {[['가입일', fmtDate(u.createdAt)], ['최근 접속', fmtDate(u.lastLogin)], ['접속 방법', u.photoURL ? '🔐 Google' : '📧 이메일']].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <strong>{val}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 모달: 요금제 변경 ───────────────────────────────
function PlanChangeModal({ user: u, onClose, onRefresh, currentUser }) {
  async function changePlan(planId) {
    try {
      const { error } = await supabase.from('profiles').update({ plan: planId }).eq('id', u.id);
      if (error) throw error;
      if (currentUser?.id === u.id) setPlan(planId);
      onClose();
      showToast(`${u.name || '사용자'}님의 요금제를 ${PLANS[planId].name}으로 변경했습니다.`, 'success');
      onRefresh();
    } catch (e) { showToast('변경 실패: ' + e.message, 'error'); }
  }
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h3>💎 요금제 변경 — {u.name || '사용자'}</h3>
          <button className="btn btn-ghost btn-sm modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {Object.values(PLANS).map(p => {
              const isCurrent = (u.plan || 'free') === p.id;
              return (
                <div key={p.id}
                  style={{ border: `2px solid ${isCurrent ? p.color : 'var(--border)'}`, borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', background: isCurrent ? `${p.color}15` : 'var(--bg-secondary)', transition: 'all 0.2s' }}
                  onClick={() => changePlan(p.id)}
                  onMouseOver={e => e.currentTarget.style.borderColor = p.color}
                  onMouseOut={e => e.currentTarget.style.borderColor = isCurrent ? p.color : 'var(--border)'}
                >
                  <div style={{ fontSize: 24 }}>{p.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{p.name}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: p.color }}>{p.price}</div>
                  {isCurrent && <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}>✓ 현재</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 모달: 공지사항 ───────────────────────────────────
function NoticeModal({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 450 }}>
        <div className="modal-header">
          <h3>📢 공지사항 작성</h3>
          <button className="btn btn-ghost btn-sm modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">제목</label>
            <input className="form-input" placeholder="공지 제목" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">내용</label>
            <textarea className="form-input" rows={4} placeholder="공지 내용을 입력하세요" value={content} onChange={e => setContent(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => {
            if (!title.trim()) { showToast('제목을 입력하세요.', 'warning'); return; }
            onSave({ id: 'n' + Date.now(), title: title.trim(), content: content.trim(), date: new Date().toISOString() });
          }}>📢 게시</button>
        </div>
      </div>
    </div>
  );
}

// ─── 모달: 문의 답변 ──────────────────────────────────
function ReplyModal({ ticket, onClose, onSaved }) {
  const [reply, setReply] = useState(ticket.reply || '');
  async function submit() {
    if (!reply.trim()) { showToast('답변 내용을 입력하세요.', 'warning'); return; }
    try {
      const { error } = await supabase.from('support_tickets').update({ reply: reply.trim(), status: 'closed', replied_at: new Date().toISOString() }).eq('id', ticket.id);
      if (error) throw error;
      onClose();
      showToast('답변이 저장되었습니다.', 'success');
      onSaved();
    } catch (e) { showToast('저장 실패: ' + e.message, 'error'); }
  }
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3>💬 문의 답변</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{ticket.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{ticket.user_name} ({ticket.user_email})</div>
            <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.content}</div>
          </div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>답변 내용</label>
          <textarea className="input" rows={5} style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} value={reply} onChange={e => setReply(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={onClose}>취소</button>
            <button className="btn btn-primary" onClick={submit}>답변 저장</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 사용자 카드 ──────────────────────────────────────
function UserCard({ u, onDetail, onPlan, onSuspend }) {
  const planInfo = PLANS[u.plan || 'free'] || PLANS.free;
  const isActive = u.status !== 'suspended';
  const isOnline = u.lastLogin && (Date.now() - new Date(u.lastLogin).getTime()) < 15 * 60 * 1000;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {u.photoURL
          ? <img src={u.photoURL} style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }} alt="" />
          : <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${planInfo.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: planInfo.color }}>{(u.name || '?').charAt(0)}</div>
        }
        {isOnline && <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#22c55e', border: '2px solid var(--bg-secondary)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name || '(이름 없음)'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email || '-'}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${planInfo.color}15`, color: planInfo.color, fontWeight: 600 }}>{planInfo.icon} {(u.plan || 'free').toUpperCase()}</span>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: isActive ? '#22c55e15' : '#ef444415', color: isActive ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{isActive ? '● 활성' : '● 정지'}</span>
          {isOnline ? <span style={{ fontSize: 10, color: '#22c55e' }}>🟢 온라인</span> : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(u.lastLogin)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }} onClick={() => onDetail(u)}>👤 상세</button>
        <button style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }} onClick={() => onPlan(u)}>💎 요금제</button>
        <button style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${isActive ? '#ef444430' : '#22c55e30'}`, background: isActive ? '#ef444410' : '#22c55e10', cursor: 'pointer', fontSize: 12, color: isActive ? '#ef4444' : '#22c55e', whiteSpace: 'nowrap' }} onClick={() => onSuspend(u)}>{isActive ? '🚫 정지' : '✅ 활성화'}</button>
      </div>
    </div>
  );
}

// ─── 고객 문의 영역 ───────────────────────────────────
function TicketsArea({ reloadKey }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTicket, setReplyTicket] = useState(null);
  const [localKey, setLocalKey] = useState(reloadKey);

  const TICKET_STATUS = {
    open: { label: '답변 대기', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    progress: { label: '확인 중', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
    closed: { label: '답변 완료', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  };

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
      setTickets(error || !data ? [] : data);
    } catch { setTickets([]); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [localKey, reloadKey]);

  if (loading) return <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>불러오는 중...</div>;
  if (!tickets.length) return <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>접수된 문의가 없습니다.</div>;

  return (
    <>
      {tickets.map(d => {
        const st = TICKET_STATUS[d.status] || TICKET_STATUS.open;
        const date = d.created_at ? new Date(d.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
        return (
          <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 6, border: '1px solid var(--border)', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: st.bg, color: st.color, fontWeight: 600 }}>{st.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title || ''}</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.user_name || ''} ({d.user_email || ''}) · {date}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }} onClick={() => setReplyTicket(d)}>{d.reply ? '답변 수정' : '답변하기'}</button>
          </div>
        );
      })}
      {replyTicket && <ReplyModal ticket={replyTicket} onClose={() => setReplyTicket(null)} onSaved={() => { setReplyTicket(null); setLocalKey(k => k + 1); }} />}
    </>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────
export default function AdminPage() {
  const { user } = useAuth();
  const [storeState, setStoreState] = useStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [detailUser, setDetailUser] = useState(null);
  const [planUser, setPlanUser] = useState(null);
  const [showNotice, setShowNotice] = useState(false);
  const [ticketsKey, setTicketsKey] = useState(0);

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const all = await fetchAllUsers();
    setUsers(all);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin, loadUsers]);

  async function handleSuspend(u) {
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', u.id);
    if (error) { showToast('처리 실패: ' + error.message, 'error'); return; }
    showToast(newStatus === 'suspended' ? '사용자를 정지했습니다.' : '사용자를 활성화했습니다.', newStatus === 'suspended' ? 'warning' : 'success');
    loadUsers();
  }

  function handleSaveNotice(notice) {
    const notices = storeState.adminNotices || [];
    setStoreState({ adminNotices: [notice, ...notices] });
    setShowNotice(false);
    showToast('공지가 게시되었습니다.', 'success');
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>접근 권한이 없습니다</h2>
          <p style={{ color: 'var(--text-muted)' }}>총관리자만 접근할 수 있는 페이지입니다.</p>
        </div>
      </div>
    );
  }

  const notices = storeState.adminNotices || [];
  const paymentHistory = storeState.paymentHistory || [];
  const totalItems = (storeState.mappedData || []).length;
  const totalTransactions = (storeState.transactions || []).length;

  const totalUsers = users.length;
  const freeUsers = users.filter(u => (u.plan || 'free') === 'free').length;
  const proUsers = users.filter(u => u.plan === 'pro').length;
  const entUsers = users.filter(u => u.plan === 'enterprise').length;
  const paidUsers = proUsers + entUsers;
  const conversionRate = totalUsers > 0 ? Math.round((paidUsers / totalUsers) * 100) : 0;
  const monthlyRevenue = (proUsers * 29000) + (entUsers * 59000);
  const today = new Date().toISOString().slice(0, 10);
  const todaySignups = users.filter(u => u.createdAt?.startsWith(today)).length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeUsers = users.filter(u => u.lastLogin && new Date(u.lastLogin).getTime() > weekAgo).length;
  const recentUsers = [...users].sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0)).slice(0, 8);

  const filteredUsers = searchQ
    ? users.filter(u => (u.email || '').toLowerCase().includes(searchQ) || (u.name || '').toLowerCase().includes(searchQ))
    : users;

  const kpiCards = [
    { icon: '👥', label: '전체 사용자', value: totalUsers, unit: '명', color: '#3b82f6', sub: `오늘 +${todaySignups}` },
    { icon: '✅', label: '활성 사용자', value: activeUsers, unit: '명 (7일)', color: '#22c55e', sub: `${totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0}% 활동` },
    { icon: '💎', label: '유료 전환율', value: `${conversionRate}%`, unit: '', color: '#8b5cf6', sub: `Pro ${proUsers} / ENT ${entUsers}` },
    { icon: '💰', label: '예상 월 매출', value: '₩' + monthlyRevenue.toLocaleString(), unit: '', color: '#f59e0b', sub: '월간' },
    { icon: '📦', label: '등록 품목', value: totalItems.toLocaleString(), unit: '건', color: '#06b6d4', sub: '전체' },
    { icon: '📊', label: '총 거래', value: totalTransactions.toLocaleString(), unit: '건', color: '#ec4899', sub: '누적' },
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', padding: 8, borderRadius: 10, fontSize: 20, lineHeight: 1 }}>🛡️</span>
            총관리자 대시보드
          </h1>
          <div className="page-desc">INVEX 서비스 전체 관리 · {user?.email || ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>마지막 새로고침: {new Date().toLocaleTimeString('ko-KR')}</span>
          <button className="btn btn-ghost btn-sm" onClick={loadUsers} style={{ gap: 4 }}>🔄 새로고침</button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>관리자 데이터를 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
          {/* KPI 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
            {kpiCards.map(k => (
              <div key={k.label} className="card" style={{ padding: 16, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -8, right: -8, fontSize: 42, opacity: 0.06 }}>{k.icon}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>{k.unit}</span></div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* 2단 레이아웃 */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* 사용자 관리 */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>👥</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>사용자 관리</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>총 {totalUsers}명 등록</div>
                  </div>
                </div>
                <input className="form-input" placeholder="🔍 이름 / 이메일 검색" style={{ width: 200, fontSize: 12, padding: '6px 10px', borderRadius: 6 }}
                  value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} />
              </div>
              <div style={{ maxHeight: 500, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredUsers.length > 0
                  ? filteredUsers.map(u => <UserCard key={u.id} u={u} onDetail={setDetailUser} onPlan={setPlanUser} onSuspend={handleSuspend} />)
                  : <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}><div style={{ fontSize: 36, marginBottom: 12 }}>👤</div><div style={{ fontSize: 14, fontWeight: 600 }}>가입된 사용자가 없습니다</div></div>
                }
              </div>
            </div>

            {/* 오른쪽 패널 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 요금제 분포 */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>📊 요금제 분포</div>
                </div>
                {totalUsers > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: 6, height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                      {freeUsers > 0 && <div style={{ flex: freeUsers, background: '#64748b' }} title={`Free ${freeUsers}명`} />}
                      {proUsers > 0 && <div style={{ flex: proUsers, background: '#3b82f6' }} title={`Pro ${proUsers}명`} />}
                      {entUsers > 0 && <div style={{ flex: entUsers, background: '#8b5cf6' }} title={`Enterprise ${entUsers}명`} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                      {[['', 'Free', freeUsers, '#64748b'], ['⭐', 'Pro', proUsers, '#3b82f6'], ['🏆', 'Enterprise', entUsers, '#8b5cf6']].map(([icon, name, count, color]) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{icon}</span>
                          <span style={{ width: 70 }}>{name}</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                          </div>
                          <span style={{ width: 32, textAlign: 'right', fontWeight: 600 }}>{count}</span>
                          <span style={{ width: 32, textAlign: 'right', color: 'var(--text-muted)' }}>{totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>데이터 없음</div>}
              </div>

              {/* 최근 활동 */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>🕐 최근 활동</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
                  {recentUsers.length > 0 ? recentUsers.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>
                        {u.photoURL ? <img src={u.photoURL} style={{ width: 28, height: 28, borderRadius: '50%' }} alt="" /> : (u.name?.charAt(0) || '?')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name || '사용자'}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{u.email || ''}</div>
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 10, whiteSpace: 'nowrap' }}>{timeAgo(u.lastLogin)}</div>
                    </div>
                  )) : <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>활동 없음</div>}
                </div>
              </div>
            </div>
          </div>

          {/* 하단 3단 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            {/* 공지사항 */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>📢 공지사항</div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowNotice(true)}>+ 작성</button>
              </div>
              {notices.length > 0 ? notices.slice(0, 4).map(n => (
                <div key={n.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: 12 }}>{n.title}</strong>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{timeAgo(n.date)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.content}</div>
                </div>
              )) : <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>공지를 작성해보세요.</div>}
            </div>

            {/* 최근 결제 */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>💳 최근 결제</div>
              {paymentHistory.length > 0 ? paymentHistory.slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.userName || '-'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{p.planName}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--success)' }}>{p.amount}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(p.date)}</div>
                  </div>
                </div>
              )) : <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 12 }}>결제 내역 없음</div>}
            </div>

            {/* 시스템 정보 */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>⚙️ 시스템 정보</div>
              <div style={{ fontSize: 12, lineHeight: 2 }}>
                {[
                  ['도메인', <a key="d" href="https://invex.io.kr" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>invex.io.kr</a>],
                  ['호스팅', 'Vercel Edge'],
                  ['데이터베이스', 'Supabase Database'],
                  ['인증', 'Supabase Auth'],
                  ['결제', '토스페이먼츠'],
                  ['버전', <span key="v" style={{ background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 4, fontSize: 10 }}>v3.1</span>],
                  ['관리자', user?.email || '-'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                    <strong>{val}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 고객 문의 */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>💬</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>고객 문의 관리</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>접수된 문의에 답변하세요</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setTicketsKey(k => k + 1)}>🔄 새로고침</button>
            </div>
            <div style={{ maxHeight: 500, overflowY: 'auto', padding: 16 }}>
              <TicketsArea reloadKey={ticketsKey} />
            </div>
          </div>
        </>
      )}

      {detailUser && <UserDetailModal user={detailUser} onClose={() => setDetailUser(null)} />}
      {planUser && <PlanChangeModal user={planUser} currentUser={user} onClose={() => setPlanUser(null)} onRefresh={loadUsers} />}
      {showNotice && <NoticeModal onClose={() => setShowNotice(false)} onSave={handleSaveNotice} />}
    </div>
  );
}
