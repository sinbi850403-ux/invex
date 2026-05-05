import React from 'react';
import { PLANS, setPlan } from '../../plan.js';
import { showToast } from '../../toast.js';
import { supabase } from '../../supabase-client.js';

export function PlanChangeModal({ user: u, onClose, onRefresh, currentUser }) {
  async function changePlan(planId) {
    try {
      // P1-5: profiles 직접 UPDATE → RLS auth.uid()=id 위반 수정
      // SECURITY DEFINER RPC로 교체 (관리자만 호출 가능한 서버 함수)
      const { error } = await supabase.rpc('admin_change_user_plan', {
        target_user_id: u.id,
        new_plan: planId,
      });
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
          <h3> 요금제 변경 — {u.name || '사용자'}</h3>
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
                  {isCurrent && <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}> 현재</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
