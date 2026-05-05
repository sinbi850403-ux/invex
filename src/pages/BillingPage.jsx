/**
 * BillingPage.jsx - 결제/구독 관리
 */
import React, { useState, useEffect } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { PLANS, setPlan } from '../plan.js';
import { setState as storeSetState } from '../store.js';

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY ?? '';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function loadTossSDK() {
  return new Promise((resolve, reject) => {
    if (window.TossPayments) { resolve(window.TossPayments); return; }
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1/payment';
    script.onload = () => resolve(window.TossPayments);
    script.onerror = () => reject(new Error('토스페이먼츠 SDK 로딩 실패'));
    document.head.appendChild(script);
  });
}

/** Enterprise 상담 모달 */
function ContactModal({ onClose }) {
  const [company, setCompany] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const handleSubmit = () => {
    if (!company.trim() || !email.trim()) {
      showToast('회사명과 이메일을 입력해 주세요.', 'warning');
      return;
    }
    showToast('상담 신청이 접수되었습니다. 빠른 시일 내 연락드리겠습니다.', 'success');
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h3> Enterprise 상담 신청</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '14px', marginBottom: '16px', color: 'var(--text-muted)' }}>
              Enterprise 요금제는 맞춤 상담을 통해 진행됩니다.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">회사명</label>
            <input className="form-input" placeholder="회사명을 입력하세요" value={company} onChange={e => setCompany(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">담당자명</label>
            <input className="form-input" placeholder="담당자 성함" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">이메일</label>
            <input className="form-input" type="email" placeholder="email@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">문의 내용</label>
            <textarea className="form-input" rows={3} placeholder="사용 규모, 필요 기능 등" value={msg} onChange={e => setMsg(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>닫기</button>
          <button className="btn btn-primary" onClick={handleSubmit}> 상담 신청</button>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const [state] = useStore();
  const [showContact, setShowContact] = useState(false);

  // state.currentPlan 사용 — useStore가 store 업데이트를 구독하므로 reactive
  // getCurrentPlan()은 렌더 시 한 번만 읽어 stale해질 수 있음
  const currentPlan = state.currentPlan || 'free';
  const plan = PLANS[currentPlan];
  const subscription = state.subscription || {};
  const paymentHistory = state.paymentHistory || [];
  const nextPayDate = subscription.nextPayDate || null;

  // 결제 콜백 URL 처리 (마운트 시 1회)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentResult = params.get('payment');
    const planId = params.get('plan');

    if (paymentResult === 'success' && planId) {
      // orderId 검증: sessionStorage에 저장된 주문과 일치해야만 처리
      const returnedOrderId = params.get('orderId');
      const pendingRaw = sessionStorage.getItem('invex_pending_order');
      const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
      sessionStorage.removeItem('invex_pending_order');
      if (!pending || pending.orderId !== returnedOrderId || pending.planId !== planId) {
        window.history.replaceState({}, '', window.location.pathname);
        return; // 검증 실패 — 외부 조작 차단
      }
      const p = PLANS[planId];
      if (p) {
        const now = new Date();
        const nextPay = new Date(now);
        nextPay.setMonth(nextPay.getMonth() + 1);
        setPlan(planId);
        const prevHistory = state.paymentHistory || [];
        storeSetState({
          subscription: {
            planId,
            status: 'active',
            startDate: now.toISOString(),
            nextPayDate: nextPay.toISOString(),
          },
          paymentHistory: [
            {
              id: 'pay-' + Date.now().toString(36),
              date: now.toISOString(),
              planName: p.name,
              amount: p.price,
              status: 'paid',
              method: '토스페이먼츠',
            },
            ...prevHistory,
          ],
        });
        showToast(`${p.icon} ${p.name} 결제가 완료되었습니다!`, 'success');
      }
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paymentResult === 'fail') {
      showToast('결제가 실패했습니다. 다시 시도해 주세요.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // [SECURITY] simulatePayment / simulateCardAdd 는 개발 환경(DEV)에서만 사용 가능.
  // 프로덕션 번들에 포함되지 않도록 import.meta.env.DEV 분기로 완전히 격리한다.
  // VULN-001 / CODE-002 / ATTACK-001 대응 패치 (2026-05-03)
  const simulatePayment = import.meta.env.DEV
    ? (planId) => {
        const p = PLANS[planId];
        if (!confirm(`[테스트 모드]\n${p.name} (${p.price}/${p.period}) 구독을 시뮬레이션합니다.\n계속하시겠습니까?`)) return;
        const now = new Date();
        const nextPay = new Date(now);
        nextPay.setMonth(nextPay.getMonth() + 1);
        const prevHistory = state.paymentHistory || [];
        setPlan(planId);
        storeSetState({
          subscription: {
            planId, status: 'active',
            startDate: now.toISOString(),
            nextPayDate: nextPay.toISOString(),
            cardLast4: '4242', cardBrand: 'VISA', cardExpiry: '12/28',
          },
          paymentHistory: [
            {
              id: 'pay-' + Date.now().toString(36),
              date: now.toISOString(),
              planName: p.name,
              amount: p.price,
              status: 'paid',
              method: 'VISA •••• 4242',
            },
            ...prevHistory,
          ],
        });
        showToast(`${p.icon} ${p.name} 구독이 시작되었습니다! (테스트 모드)`, 'success');
        window.location.reload();
      }
    : null; // 프로덕션에서는 null — 절대 호출 불가

  /** 카드 등록 시뮬레이션 (개발 환경 전용) */
  const simulateCardAdd = import.meta.env.DEV
    ? () => {
        if (!confirm('[테스트 모드]\n테스트 카드(VISA 4242)를 등록합니다.')) return;
        const sub = { ...(state.subscription || {}), cardLast4: '4242', cardBrand: 'VISA', cardExpiry: '12/28' };
        storeSetState({ subscription: sub });
        showToast('테스트 카드가 등록되었습니다. (테스트 모드)', 'success');
      }
    : null; // 프로덕션에서는 null — 절대 호출 불가

  /** 구독하기 클릭 */
  const handleSubscribe = async (planId) => {
    if (planId === 'enterprise') {
      setShowContact(true);
      return;
    }
    try {
      let TossPayments;
      try {
        TossPayments = await loadTossSDK();
      } catch {
        // [SECURITY] SDK 로딩 실패 시 simulatePayment 폴백 제거 — 오류 메시지만 표시
        // VULN-001 / CODE-002 / ATTACK-001 대응 패치 (2026-05-03)
        showToast('결제 모듈을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.', 'error');
        return;
      }
      const tossPayments = TossPayments(TOSS_CLIENT_KEY);
      const orderId = 'invex_' + Date.now().toString(36);
      const amount = planId === 'pro' ? 29000 : 59000;
      // 결제 요청 전 orderId를 sessionStorage에 저장 (콜백 검증용)
      sessionStorage.setItem('invex_pending_order', JSON.stringify({ orderId, planId, amount }));
      await tossPayments.requestPayment('카드', {
        amount, orderId,
        orderName: `INVEX ${PLANS[planId].name} 월간 구독`,
        customerName: state.userName || '고객',
        successUrl: `${window.location.origin}/?payment=success&plan=${planId}&orderId=${orderId}`,
        failUrl: `${window.location.origin}/?payment=fail`,
      });
    } catch (err) {
      if (err.code === 'USER_CANCEL') {
        showToast('결제가 취소되었습니다.', 'info');
      } else {
        // [SECURITY] SDK 오류 시 simulatePayment 폴백 완전 제거 (DEV 환경에서도 자동 실행 안 함)
        // 개발자가 명시적으로 테스트 버튼을 눌러야만 시뮬레이션 실행 가능
        showToast('결제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error');
        console.error('[BillingPage] 결제 SDK 오류:', err);
      }
    }
  };

  /** 다운그레이드 */
  const handleDowngrade = () => {
    if (!confirm('Free 플랜으로 다운그레이드하시겠습니까?\n유료 기능에 대한 접근이 제한됩니다.')) return;
    setPlan('free');
    storeSetState({ subscription: {}, currentPlan: 'free' });
    showToast('Free 플랜으로 변경되었습니다.', 'info');
    window.location.reload();
  };

  /** 카드 추가 */
  const handleAddCard = async () => {
    try {
      const TossPayments = await loadTossSDK();
      const tossPayments = TossPayments(TOSS_CLIENT_KEY);
      await tossPayments.requestBillingAuth('카드', {
        customerKey: state.userName || 'customer_' + Date.now(),
        successUrl: `${window.location.origin}/?billing=success`,
        failUrl: `${window.location.origin}/?billing=fail`,
      });
    } catch (err) {
      // [SECURITY] SDK 오류 시 simulateCardAdd 폴백 제거 (VULN-001 대응 패치 2026-05-03)
      if (err && err.code !== 'USER_CANCEL') {
        showToast('카드 등록 모듈을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.', 'error');
      }
    }
  };

  /** 카드 삭제 */
  const handleRemoveCard = () => {
    if (!confirm('등록된 카드를 삭제하시겠습니까?')) return;
    const sub = { ...(state.subscription || {}) };
    delete sub.cardLast4;
    delete sub.cardBrand;
    delete sub.cardExpiry;
    storeSetState({ subscription: sub });
    showToast('카드가 삭제되었습니다.', 'info');
  };

  return (
    <div>
      {showContact && <ContactModal onClose={() => setShowContact(false)} />}

      <div className="page-header">
        <div>
          <h1 className="page-title">구독 관리</h1>
          <div className="page-desc">요금제를 선택하고 결제를 관리합니다.</div>
        </div>
      </div>

      {/* 현재 구독 상태 */}
      <div className="card" style={{ marginBottom: '20px', borderLeft: `4px solid ${plan.color}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>현재 요금제</div>
            <div style={{ fontSize: '24px', fontWeight: '800' }}>{plan.icon} {plan.name}</div>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{plan.description}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: '800', color: plan.color }}>{plan.price}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{plan.period}</div>
            {subscription.status === 'active' ? (
              <>
                <div style={{ marginTop: '4px' }}><span className="badge badge-success">구독 중</span></div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  다음 결제: {formatDate(nextPayDate)}
                </div>
              </>
            ) : currentPlan !== 'free' ? (
              <div style={{ marginTop: '4px' }}><span className="badge badge-warning">베타 무료</span></div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 요금제 비교 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-title"> 요금제 비교</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {Object.values(PLANS).map(p => {
            const isCurrent = currentPlan === p.id;
            return (
              <div
                key={p.id}
                style={{
                  border: `2px solid ${isCurrent ? p.color : 'var(--border)'}`,
                  borderRadius: '12px', padding: '24px', textAlign: 'center',
                  background: isCurrent ? `${p.color}10` : 'var(--bg-secondary)',
                  position: 'relative',
                  transform: p.id === 'pro' ? 'scale(1.02)' : undefined,
                }}
              >
                {p.id === 'pro' && (
                  <div style={{
                    position: 'absolute', top: '-10px', left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
                    color: '#fff', fontSize: '11px', padding: '2px 12px',
                    borderRadius: '10px', fontWeight: '600',
                  }}>인기</div>
                )}
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>{p.icon}</div>
                <div style={{ fontSize: '18px', fontWeight: '700' }}>{p.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>{p.description}</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: p.color, marginBottom: '4px' }}>{p.price}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>{p.period}</div>
                <div style={{ textAlign: 'left', fontSize: '13px', lineHeight: '2' }}>
                  {p.id === 'free' && <> 품목 100개까지<br /> 기본 재고 관리<br /> 입출고 관리<br /> 엑셀 업로드<br /> 다크 모드</>}
                  {p.id === 'pro' && <> 품목 <strong>무제한</strong><br /> AI 자동 발주 추천<br /> 원가 분석 (FIFO)<br /> 매출/매입 장부<br /> 감사 추적<br /> 사용자 5명</>}
                  {p.id === 'enterprise' && <> Pro 전체 기능<br /> 다중 창고 관리<br /> 사용자 <strong>무제한</strong><br /> 권한 관리 (RBAC)<br /> API 연동<br /> SLA 99.9%</>}
                </div>
                <div style={{ marginTop: '16px' }}>
                  {isCurrent ? (
                    <button className="btn btn-ghost" disabled style={{ width: '100%', opacity: 0.6 }}>현재 요금제</button>
                  ) : p.id === 'free' ? (
                    <button className="btn btn-ghost" style={{ width: '100%' }} onClick={handleDowngrade}>다운그레이드</button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', background: p.color }}
                      onClick={() => handleSubscribe(p.id)}
                    >
                      {p.id === 'enterprise' ? '상담 신청' : '구독하기'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 결제 수단 */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="card-title" style={{ margin: 0 }}> 결제 수단</div>
          <button className="btn btn-ghost btn-sm" onClick={handleAddCard}> 카드 추가</button>
        </div>
        {subscription.cardLast4 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px' }}></div>
            <div>
              <div style={{ fontWeight: '600' }}>{subscription.cardBrand || '카드'} •••• {subscription.cardLast4}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>만료: {subscription.cardExpiry || '-'}</div>
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={handleRemoveCard}>삭제</button>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}></div>
            <div>등록된 결제 수단이 없습니다.</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>구독 결제를 위해 카드를 등록하세요.</div>
          </div>
        )}
      </div>

      {/* 결제 이력 */}
      <div className="card">
        <div className="card-title"> 결제 이력</div>
        {paymentHistory.length > 0 ? (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>일자</th>
                  <th>요금제</th>
                  <th className="text-right">금액</th>
                  <th>상태</th>
                  <th>결제 수단</th>
                </tr>
              </thead>
              <tbody>
                {paymentHistory.map((h, i) => (
                  <tr key={h.id || i}>
                    <td style={{ fontSize: '12px' }}>{formatDate(h.date)}</td>
                    <td><strong>{h.planName}</strong></td>
                    <td className="text-right" style={{ fontWeight: '600' }}>{h.amount}</td>
                    <td>
                      <span className={`badge ${h.status === 'paid' ? 'badge-success' : h.status === 'refunded' ? 'badge-warning' : 'badge-default'}`}>
                        {h.status === 'paid' ? '결제 완료' : h.status === 'refunded' ? '환불' : '실패'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{h.method || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}></div>
            <div>결제 이력이 없습니다.</div>
          </div>
        )}
      </div>

      {/* 보안 안내 */}
      <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: 'var(--bg-secondary)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '16px' }}></span>
        <span>모든 결제는 <strong>토스페이먼츠</strong>를 통해 안전하게 처리됩니다. 카드 정보는 INVEX 서버에 저장되지 않습니다.</span>
      </div>
    </div>
  );
}
