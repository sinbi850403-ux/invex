/**
 * SupportPage.jsx - 고객 문의 (게시판)
 * 저장소: Supabase support_tickets 테이블 (TicketsArea/ReplyModal과 동일한 DB)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../supabase-client.js';
import { showToast } from '../toast.js';

// 문의 상태별 라벨
const STATUS_MAP = {
  open:     { label: '답변 대기', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  progress: { label: '확인 중',   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  closed:   { label: '답변 완료', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

const TYPE_MAP = {
  bug:     '버그/오류',
  feature: '기능 제안',
  payment: '결제/요금제',
  account: '계정',
  other:   '기타',
};

/** 목록 뷰 */
function ListView({ onWrite, onDetail, user }) {
  const [tickets, setTickets] = useState(null); // null = 로딩 중

  const loadTickets = useCallback(async () => {
    if (!user) { setTickets([]); return; }
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user.uid)
        .order('created_at', { ascending: false });
      setTickets(error || !data ? [] : data);
    } catch {
      setTickets([]);
    }
  }, [user]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: '800' }}>고객 문의</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>문의 내역과 답변을 확인할 수 있습니다.</p>
        </div>
        <button className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '13px' }} onClick={onWrite}>문의 작성</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {tickets === null ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>불러오는 중...</div>
        ) : !user ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>로그인 후 이용해주세요.</div>
        ) : tickets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>💬</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>아직 문의 내역이 없습니다.</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>궁금한 점이 있으시면 문의를 남겨주세요.</div>
          </div>
        ) : tickets.map(ticket => {
          const status = STATUS_MAP[ticket.status] || STATUS_MAP.open;
          const typeLabel = TYPE_MAP[ticket.type] || ticket.type;
          const date = ticket.created_at
            ? new Date(ticket.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '-';
          return (
            <div
              key={ticket.id}
              className="card"
              style={{ padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.2s' }}
              onClick={() => onDetail(ticket)}
              onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'}
              onMouseOut={e => e.currentTarget.style.borderColor = ''}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: status.bg, color: status.color, fontWeight: '600' }}>{status.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{typeLabel}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ticket.title}</div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{date}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 작성 뷰 */
function WriteView({ onBack, user, profile }) {
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) { showToast('제목을 입력하세요.', 'warning'); return; }
    if (!content.trim()) { showToast('내용을 입력하세요.', 'warning'); return; }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('support_tickets').insert({
        user_id:    user.uid,
        user_email: user.email || '',
        user_name:  profile?.name || user.displayName || '',
        type,
        title:   title.trim(),
        content: content.trim(),
        status:  'open',
      });
      if (error) throw error;
      showToast('문의가 등록되었습니다.', 'success');
      onBack();
    } catch (e) {
      showToast('등록에 실패했습니다: ' + e.message, 'error');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
      <button className="btn btn-ghost" style={{ marginBottom: '16px', fontSize: '13px' }} onClick={onBack}>← 목록으로</button>
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '20px' }}>문의 작성</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>문의 유형</label>
            <select className="input" style={{ width: '100%' }} value={type} onChange={e => setType(e.target.value)}>
              <option value="bug">버그/오류 신고</option>
              <option value="feature">기능 제안</option>
              <option value="payment">결제/요금제 문의</option>
              <option value="account">계정 문의</option>
              <option value="other">기타</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>제목</label>
            <input type="text" className="input" placeholder="제목을 입력하세요" style={{ width: '100%' }} value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>내용</label>
            <textarea className="input" rows={8} placeholder="문의 내용을 작성해주세요." style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} value={content} onChange={e => setContent(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onBack}>취소</button>
            <button className="btn btn-primary" style={{ padding: '10px 28px' }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '등록 중...' : '등록'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 상세 뷰 */
function DetailView({ ticket, onBack, onDelete }) {
  const status = STATUS_MAP[ticket.status] || STATUS_MAP.open;
  const typeLabel = TYPE_MAP[ticket.type] || ticket.type;
  const date = ticket.created_at
    ? new Date(ticket.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';
  const replyDate = ticket.replied_at
    ? new Date(ticket.replied_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  const handleDelete = async () => {
    if (!confirm('이 문의를 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('support_tickets').delete().eq('id', ticket.id);
      if (error) throw error;
      showToast('문의가 삭제되었습니다.', 'success');
      onDelete();
    } catch (e) {
      showToast('삭제에 실패했습니다: ' + e.message, 'error');
    }
  };

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '24px' }}>
      <button className="btn btn-ghost" style={{ marginBottom: '16px', fontSize: '13px' }} onClick={onBack}>← 목록으로</button>

      {/* 문의 내용 */}
      <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: status.bg, color: status.color, fontWeight: '600' }}>{status.label}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{typeLabel}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>{date}</span>
        </div>
        <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>{ticket.title}</h3>
        <div style={{ fontSize: '13px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{ticket.content}</div>
      </div>

      {/* 답변 */}
      {ticket.reply ? (
        <div className="card" style={{ padding: '24px', borderLeft: '3px solid #10b981' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700' }}>✅ 관리자 답변</span>
            {replyDate && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{replyDate}</span>}
          </div>
          <div style={{ fontSize: '13px', lineHeight: '1.8', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>{ticket.reply}</div>
        </div>
      ) : (
        <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>아직 답변이 등록되지 않았습니다. 확인 후 답변드리겠습니다.</div>
        </div>
      )}

      {/* 삭제 버튼 */}
      <div style={{ marginTop: '16px', textAlign: 'right' }}>
        <button className="btn btn-ghost" style={{ fontSize: '12px', color: '#ef4444' }} onClick={handleDelete}>문의 삭제</button>
      </div>
    </div>
  );
}

/** 메인 컴포넌트 */
export default function SupportPage() {
  const { user, profile } = useAuth();
  const [view, setView] = useState('list'); // 'list' | 'write' | 'detail'
  const [selectedTicket, setSelectedTicket] = useState(null);

  const handleBack = () => {
    setSelectedTicket(null);
    setView('list');
  };

  if (view === 'write') {
    return <WriteView onBack={handleBack} user={user} profile={profile} />;
  }

  if (view === 'detail' && selectedTicket) {
    return (
      <DetailView
        ticket={selectedTicket}
        onBack={handleBack}
        onDelete={handleBack}
      />
    );
  }

  return (
    <ListView
      onWrite={() => setView('write')}
      onDetail={(ticket) => { setSelectedTicket(ticket); setView('detail'); }}
      user={user}
    />
  );
}
