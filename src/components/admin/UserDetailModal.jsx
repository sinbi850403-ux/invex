import React from 'react';
import { PLANS } from '../../plan.js';
import { fmtDate } from '../../domain/adminUtils.js';

export function UserDetailModal({ user: u, onClose }) {
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
              { label: '상태', val: <span style={{ fontWeight: 700, color: isActive ? '#22c55e' : '#ef4444' }}>{isActive ? ' 활성' : ' 정지'}</span> },
              { label: '역할', val: u.role === 'admin' ? ' 관리자' : u.role === 'manager' ? '⭐ 매니저' : ' 일반' },
              { label: 'UID', val: <span style={{ fontSize: 10, wordBreak: 'break-all' }}>{u.id || '-'}</span> },
            ].map(({ label, val }) => (
              <div key={label} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 12, lineHeight: 2.2 }}>
            {[['가입일', fmtDate(u.createdAt)], ['최근 접속', fmtDate(u.lastLogin)], ['접속 방법', u.photoURL ? ' Google' : ' 이메일']].map(([label, val]) => (
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
