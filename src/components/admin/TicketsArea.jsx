import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabase-client.js';
import { ReplyModal } from './ReplyModal.jsx';

const TICKET_STATUS = {
  open:     { label: '답변 대기', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  progress: { label: '확인 중',   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  closed:   { label: '답변 완료', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

export function TicketsArea({ reloadKey }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyTicket, setReplyTicket] = useState(null);
  const [localKey, setLocalKey] = useState(reloadKey);

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
