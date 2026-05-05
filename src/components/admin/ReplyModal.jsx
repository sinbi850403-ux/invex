import React, { useState } from 'react';
import { showToast } from '../../toast.js';
import { supabase } from '../../supabase-client.js';

export function ReplyModal({ ticket, onClose, onSaved }) {
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
          <h3> 문의 답변</h3>
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
