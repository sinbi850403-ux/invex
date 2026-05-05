import React from 'react';
import { PLANS } from '../../plan.js';
import { timeAgo } from '../../domain/adminUtils.js';

export function UserCard({ u, onDetail, onPlan, onSuspend }) {
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
          {isOnline ? <span style={{ fontSize: 10, color: '#22c55e' }}> 온라인</span> : <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{timeAgo(u.lastLogin)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }} onClick={() => onDetail(u)}> 상세</button>
        <button style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-primary)', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'nowrap' }} onClick={() => onPlan(u)}> 요금제</button>
        <button style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${isActive ? '#ef444430' : '#22c55e30'}`, background: isActive ? '#ef444410' : '#22c55e10', cursor: 'pointer', fontSize: 12, color: isActive ? '#ef4444' : '#22c55e', whiteSpace: 'nowrap' }} onClick={() => onSuspend(u)}>{isActive ? ' 정지' : ' 활성화'}</button>
      </div>
    </div>
  );
}
