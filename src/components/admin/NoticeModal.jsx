import React, { useState } from 'react';
import { showToast } from '../../toast.js';

export function NoticeModal({ onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 450 }}>
        <div className="modal-header">
          <h3> 공지사항 작성</h3>
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
          }}> 게시</button>
        </div>
      </div>
    </div>
  );
}
