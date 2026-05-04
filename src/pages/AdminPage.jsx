import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { showToast } from '../toast.js';
import { supabase } from '../supabase-client.js';
import { fetchAllUsers, timeAgo } from '../domain/adminUtils.js';
import { UserDetailModal } from '../components/admin/UserDetailModal.jsx';
import { PlanChangeModal } from '../components/admin/PlanChangeModal.jsx';
import { NoticeModal }    from '../components/admin/NoticeModal.jsx';
import { UserCard }       from '../components/admin/UserCard.jsx';
import { TicketsArea }    from '../components/admin/TicketsArea.jsx';

export default function AdminPage() {
  const { user, profile } = useAuth();
  const [storeState, setStoreState] = useStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [detailUser, setDetailUser] = useState(null);
  const [planUser, setPlanUser] = useState(null);
  const [showNotice, setShowNotice] = useState(false);
  const [ticketsKey, setTicketsKey] = useState(0);

  const isAdmin = profile?.role === 'admin';

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const all = await fetchAllUsers();
    setUsers(all);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin, loadUsers]);

  async function handleSuspend(u) {
    const newStatus = u.status === 'suspended' ? 'active' : 'suspended';
    // [SECURITY] P0-6: 직접 테이블 UPDATE 대신 SECURITY DEFINER RPC 경유.
    // 서버사이드에서 check_admin_email() 검증 + audit_log 기록.
    const { error } = await supabase.rpc('admin_set_user_status', {
      target_id: u.id,
      new_status: newStatus,
    });
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
          <div style={{ fontSize: 64, marginBottom: 16 }}></div>
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
    { icon: '', label: '전체 사용자',  value: totalUsers,                    unit: '명',     color: '#3b82f6', sub: `오늘 +${todaySignups}` },
    { icon: '', label: '활성 사용자',  value: activeUsers,                   unit: '명 (7일)', color: '#22c55e', sub: `${totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0}% 활동` },
    { icon: '', label: '유료 전환율',  value: `${conversionRate}%`,          unit: '',       color: '#8b5cf6', sub: `Pro ${proUsers} / ENT ${entUsers}` },
    { icon: '', label: '예상 월 매출', value: '₩' + monthlyRevenue.toLocaleString(), unit: '', color: '#f59e0b', sub: '월간' },
    { icon: '', label: '등록 품목',    value: totalItems.toLocaleString(),    unit: '건',     color: '#06b6d4', sub: '전체' },
    { icon: '', label: '총 거래',      value: totalTransactions.toLocaleString(), unit: '건', color: '#ec4899', sub: '누적' },
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)', padding: 8, borderRadius: 10, fontSize: 20, lineHeight: 1 }}></span>
            총관리자 대시보드
          </h1>
          <div className="page-desc">INVEX 서비스 전체 관리 · {user?.email || ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>마지막 새로고침: {new Date().toLocaleTimeString('ko-KR')}</span>
          <button className="btn btn-ghost btn-sm" onClick={loadUsers} style={{ gap: 4 }}> 새로고침</button>
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

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}></span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>사용자 관리</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>총 {totalUsers}명 등록</div>
                  </div>
                </div>
                <input className="form-input" placeholder=" 이름 / 이메일 검색" style={{ width: 200, fontSize: 12, padding: '6px 10px', borderRadius: 6 }}
                  value={searchQ} onChange={e => setSearchQ(e.target.value.toLowerCase())} />
              </div>
              <div style={{ maxHeight: 500, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredUsers.length > 0
                  ? filteredUsers.map(u => <UserCard key={u.id} u={u} onDetail={setDetailUser} onPlan={setPlanUser} onSuspend={handleSuspend} />)
                  : <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}><div style={{ fontSize: 36, marginBottom: 12 }}></div><div style={{ fontSize: 14, fontWeight: 600 }}>가입된 사용자가 없습니다</div></div>
                }
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}> 요금제 분포</div>
                </div>
                {totalUsers > 0 ? (
                  <>
                    <div style={{ display: 'flex', gap: 6, height: 12, borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                      {freeUsers > 0 && <div style={{ flex: freeUsers, background: '#64748b' }} title={`Free ${freeUsers}명`} />}
                      {proUsers > 0 && <div style={{ flex: proUsers, background: '#3b82f6' }} title={`Pro ${proUsers}명`} />}
                      {entUsers > 0 && <div style={{ flex: entUsers, background: '#8b5cf6' }} title={`Enterprise ${entUsers}명`} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                      {[['', 'Free', freeUsers, '#64748b'], ['⭐', 'Pro', proUsers, '#3b82f6'], ['', 'Enterprise', entUsers, '#8b5cf6']].map(([icon, name, count, color]) => (
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

              <div className="card">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}> 최근 활동</div>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}> 공지사항</div>
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

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}> 최근 결제</div>
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

            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}> 시스템 정보</div>
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

          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}></span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>고객 문의 관리</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>접수된 문의에 답변하세요</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setTicketsKey(k => k + 1)}> 새로고침</button>
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
