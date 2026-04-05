/**
 * page-billing.js - 결제/구독 관리 페이지
 * 역할: 요금제 비교, 결제 처리, 구독 이력, 카드 관리
 * 왜 필요? → 무료→유료 전환의 핵심 수익화 포인트
 * 결제 방식: 토스페이먼츠 SDK (테스트 모드 → 실결제 전환 가능)
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';
import { PLANS, getCurrentPlan, setPlan } from './plan.js';

// 토스페이먼츠 클라이언트 키 (테스트 키 → 실서비스 시 교체)
const TOSS_CLIENT_KEY = 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

/**
 * 날짜 포맷
 */
function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
}

/**
 * 토스페이먼츠 SDK 로드
 * 왜 동적 로딩? → 결제 페이지 진입 시에만 SDK를 불러오면 초기 로딩 속도 향상
 */
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

export function renderBillingPage(container, navigateTo) {
  const state = getState();
  const currentPlan = getCurrentPlan();
  const plan = PLANS[currentPlan];
  const subscription = state.subscription || {};
  const paymentHistory = state.paymentHistory || [];

  // 다음 결제일 계산 (현재 날짜 + 30일)
  const nextPayDate = subscription.nextPayDate || null;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">💳</span> 구독 관리</h1>
        <div class="page-desc">요금제를 선택하고 결제를 관리합니다.</div>
      </div>
    </div>

    <!-- 현재 구독 상태 -->
    <div class="card" style="margin-bottom:20px; border-left:4px solid ${plan.color};">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:12px; color:var(--text-muted);">현재 요금제</div>
          <div style="font-size:24px; font-weight:800;">${plan.icon} ${plan.name}</div>
          <div style="font-size:14px; color:var(--text-muted);">${plan.description}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:28px; font-weight:800; color:${plan.color};">${plan.price}</div>
          <div style="font-size:12px; color:var(--text-muted);">${plan.period}</div>
          ${subscription.status === 'active' ? `
            <div style="margin-top:4px;">
              <span class="badge badge-success">구독 중</span>
            </div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">
              다음 결제: ${formatDate(nextPayDate)}
            </div>
          ` : currentPlan !== 'free' ? `
            <div style="margin-top:4px;">
              <span class="badge badge-warning">무료 체험</span>
            </div>
          ` : ''}
        </div>
      </div>
    </div>

    <!-- 요금제 비교 -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">📋 요금제 비교</div>
      <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
        ${Object.values(PLANS).map(p => {
          const isCurrent = currentPlan === p.id;
          return `
            <div style="
              border:2px solid ${isCurrent ? p.color : 'var(--border)'};
              border-radius:12px; padding:24px; text-align:center;
              background:${isCurrent ? p.color + '10' : 'var(--bg-secondary)'};
              position:relative;
              ${p.id === 'pro' ? 'transform:scale(1.02);' : ''}
            ">
              ${p.id === 'pro' ? '<div style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#3b82f6,#8b5cf6); color:#fff; font-size:11px; padding:2px 12px; border-radius:10px; font-weight:600;">인기</div>' : ''}
              <div style="font-size:32px; margin-bottom:8px;">${p.icon}</div>
              <div style="font-size:18px; font-weight:700;">${p.name}</div>
              <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">${p.description}</div>
              <div style="font-size:28px; font-weight:800; color:${p.color}; margin-bottom:4px;">${p.price}</div>
              <div style="font-size:12px; color:var(--text-muted); margin-bottom:16px;">${p.period}</div>

              <div style="text-align:left; font-size:13px; line-height:2;">
                ${p.id === 'free' ? `
                  ✅ 품목 100개까지<br/>
                  ✅ 기본 재고 관리<br/>
                  ✅ 입출고 관리<br/>
                  ✅ 엑셀 업로드<br/>
                  ✅ 다크 모드
                ` : p.id === 'pro' ? `
                  ✅ 품목 <strong>무제한</strong><br/>
                  ✅ AI 자동 발주 추천<br/>
                  ✅ 원가 분석 (FIFO)<br/>
                  ✅ 매출/매입 장부<br/>
                  ✅ 감사 추적<br/>
                  ✅ 바코드 라벨 인쇄<br/>
                  ✅ 사용자 5명
                ` : `
                  ✅ Pro 전체 기능<br/>
                  ✅ 다중 창고 관리<br/>
                  ✅ 사용자 <strong>무제한</strong><br/>
                  ✅ 권한 관리 (RBAC)<br/>
                  ✅ API 연동<br/>
                  ✅ 전담 고객 지원<br/>
                  ✅ SLA 99.9%
                `}
              </div>

              <div style="margin-top:16px;">
                ${isCurrent
                  ? '<button class="btn btn-ghost" disabled style="width:100%; opacity:0.6;">현재 요금제</button>'
                  : p.id === 'free'
                    ? `<button class="btn btn-ghost btn-downgrade" data-plan="${p.id}" style="width:100%;">다운그레이드</button>`
                    : `<button class="btn btn-primary btn-subscribe" data-plan="${p.id}" style="width:100%; background:${p.color};">${p.id === 'enterprise' ? '상담 신청' : '구독하기'}</button>`
                }
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- 결제 수단 -->
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div class="card-title" style="margin:0;">💳 결제 수단</div>
        <button class="btn btn-ghost btn-sm" id="btn-add-card">➕ 카드 추가</button>
      </div>
      ${subscription.cardLast4 ? `
        <div style="display:flex; align-items:center; gap:12px; padding:12px; background:var(--bg-secondary); border-radius:8px;">
          <div style="font-size:24px;">💳</div>
          <div>
            <div style="font-weight:600;">${subscription.cardBrand || '카드'} •••• ${subscription.cardLast4}</div>
            <div style="font-size:12px; color:var(--text-muted);">만료: ${subscription.cardExpiry || '-'}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;" id="btn-remove-card">삭제</button>
        </div>
      ` : `
        <div style="text-align:center; padding:24px; color:var(--text-muted);">
          <div style="font-size:28px; margin-bottom:8px;">💳</div>
          <div>등록된 결제 수단이 없습니다.</div>
          <div style="font-size:12px; margin-top:4px;">구독 결제를 위해 카드를 등록하세요.</div>
        </div>
      `}
    </div>

    <!-- 결제 이력 -->
    <div class="card">
      <div class="card-title">📜 결제 이력</div>
      ${paymentHistory.length > 0 ? `
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead><tr>
              <th>일자</th>
              <th>요금제</th>
              <th class="text-right">금액</th>
              <th>상태</th>
              <th>결제 수단</th>
            </tr></thead>
            <tbody>
              ${paymentHistory.map(h => `
                <tr>
                  <td style="font-size:12px;">${formatDate(h.date)}</td>
                  <td><strong>${h.planName}</strong></td>
                  <td class="text-right" style="font-weight:600;">${h.amount}</td>
                  <td><span class="badge ${h.status === 'paid' ? 'badge-success' : h.status === 'refunded' ? 'badge-warning' : 'badge-default'}">${h.status === 'paid' ? '결제 완료' : h.status === 'refunded' ? '환불' : '실패'}</span></td>
                  <td style="font-size:12px; color:var(--text-muted);">${h.method || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : `
        <div style="text-align:center; padding:24px; color:var(--text-muted);">
          <div style="font-size:28px; margin-bottom:8px;">📜</div>
          <div>결제 이력이 없습니다.</div>
        </div>
      `}
    </div>

    <!-- 보안 안내 -->
    <div style="margin-top:16px; padding:12px; border-radius:8px; background:var(--bg-secondary); font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
      <span style="font-size:16px;">🔒</span>
      <span>모든 결제는 <strong>토스페이먼츠</strong>를 통해 안전하게 처리됩니다. 카드 정보는 INVEX 서버에 저장되지 않습니다.</span>
    </div>
  `;

  // === 이벤트 바인딩 ===

  // 구독 버튼 클릭
  container.querySelectorAll('.btn-subscribe').forEach(btn => {
    btn.addEventListener('click', async () => {
      const planId = btn.dataset.plan;
      const targetPlan = PLANS[planId];
      if (!targetPlan) return;

      // Enterprise는 상담 신청
      if (planId === 'enterprise') {
        showContactModal(container);
        return;
      }

      // 토스페이먼츠 결제 실행
      try {
        const TossPayments = await loadTossSDK();
        const tossPayments = TossPayments(TOSS_CLIENT_KEY);

        const orderId = 'invex_' + Date.now().toString(36);
        const amount = planId === 'pro' ? 290000 : 490000;

        // 결제 요청
        await tossPayments.requestPayment('카드', {
          amount,
          orderId,
          orderName: `INVEX ${targetPlan.name} 월간 구독`,
          customerName: state.userName || '고객',
          successUrl: `${window.location.origin}/?payment=success&plan=${planId}`,
          failUrl: `${window.location.origin}/?payment=fail`,
        });
      } catch (err) {
        if (err.code === 'USER_CANCEL') {
          showToast('결제가 취소되었습니다.', 'info');
        } else {
          console.error('결제 오류:', err);
          // 테스트 모드에서는 시뮬레이션으로 처리
          simulatePayment(planId, container, navigateTo);
        }
      }
    });
  });

  // 다운그레이드 버튼
  container.querySelectorAll('.btn-downgrade').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Free 플랜으로 다운그레이드하시겠습니까?\n유료 기능에 대한 접근이 제한됩니다.')) return;
      setPlan('free');
      setState({
        subscription: {},
        currentPlan: 'free',
      });
      showToast('Free 플랜으로 변경되었습니다.', 'info');
      window.location.reload();
    });
  });

  // 카드 추가 버튼
  container.querySelector('#btn-add-card')?.addEventListener('click', async () => {
    try {
      const TossPayments = await loadTossSDK();
      const tossPayments = TossPayments(TOSS_CLIENT_KEY);
      // 빌링키 발급 (정기 결제용)
      await tossPayments.requestBillingAuth('카드', {
        customerKey: state.userName || 'customer_' + Date.now(),
        successUrl: `${window.location.origin}/?billing=success`,
        failUrl: `${window.location.origin}/?billing=fail`,
      });
    } catch (err) {
      // 테스트 모드 시뮬레이션
      simulateCardAdd(container, navigateTo);
    }
  });

  // 카드 삭제
  container.querySelector('#btn-remove-card')?.addEventListener('click', () => {
    if (!confirm('등록된 카드를 삭제하시겠습니까?')) return;
    const sub = { ...subscription };
    delete sub.cardLast4;
    delete sub.cardBrand;
    delete sub.cardExpiry;
    setState({ subscription: sub });
    showToast('카드가 삭제되었습니다.', 'info');
    renderBillingPage(container, navigateTo);
  });

  // URL 파라미터 체크 (토스 결제 콜백)
  checkPaymentCallback(container, navigateTo);
}

/**
 * 결제 시뮬레이션 (테스트 모드)
 * 왜? → 실제 토스 가맹점 등록 전에도 UX를 확인할 수 있도록
 */
function simulatePayment(planId, container, navigateTo) {
  const plan = PLANS[planId];
  if (!confirm(`[테스트 모드]\n${plan.name} (${plan.price}/${plan.period}) 구독을 시뮬레이션합니다.\n계속하시겠습니까?`)) return;

  const now = new Date();
  const nextPay = new Date(now);
  nextPay.setMonth(nextPay.getMonth() + 1);

  // 구독 정보 저장
  const subscription = {
    planId,
    status: 'active',
    startDate: now.toISOString(),
    nextPayDate: nextPay.toISOString(),
    cardLast4: '4242',
    cardBrand: 'VISA',
    cardExpiry: '12/28',
  };

  // 결제 이력 추가
  const history = getState().paymentHistory || [];
  history.unshift({
    id: 'pay-' + Date.now().toString(36),
    date: now.toISOString(),
    planName: plan.name,
    amount: plan.price,
    status: 'paid',
    method: 'VISA •••• 4242',
  });

  setPlan(planId);
  setState({ subscription, paymentHistory: history });
  showToast(`${plan.icon} ${plan.name} 구독이 시작되었습니다!`, 'success');
  window.location.reload();
}

/**
 * 카드 등록 시뮬레이션
 */
function simulateCardAdd(container, navigateTo) {
  if (!confirm('[테스트 모드]\n테스트 카드(VISA 4242)를 등록합니다.')) return;

  const sub = getState().subscription || {};
  sub.cardLast4 = '4242';
  sub.cardBrand = 'VISA';
  sub.cardExpiry = '12/28';
  setState({ subscription: sub });
  showToast('테스트 카드가 등록되었습니다.', 'success');
  renderBillingPage(container, navigateTo);
}

/**
 * 토스 결제 콜백 URL 처리
 */
function checkPaymentCallback(container, navigateTo) {
  const params = new URLSearchParams(window.location.search);
  const paymentResult = params.get('payment');
  const planId = params.get('plan');

  if (paymentResult === 'success' && planId) {
    // 결제 성공 → 서버에서 승인 요청 후 구독 활성화
    // (실제로는 Vercel Serverless에서 토스 승인 API 호출)
    const plan = PLANS[planId];
    if (plan) {
      const now = new Date();
      const nextPay = new Date(now);
      nextPay.setMonth(nextPay.getMonth() + 1);

      setPlan(planId);
      setState({
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
            planName: plan.name,
            amount: plan.price,
            status: 'paid',
            method: '토스페이먼츠',
          },
          ...(getState().paymentHistory || []),
        ],
      });
      showToast(`${plan.icon} ${plan.name} 결제가 완료되었습니다!`, 'success');
    }
    // URL에서 파라미터 제거
    window.history.replaceState({}, '', window.location.pathname);
  }
}

/**
 * Enterprise 상담 모달
 */
function showContactModal(container) {
  const existing = document.getElementById('contact-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'contact-modal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal" style="max-width:450px;">
      <div class="modal-header">
        <h3>🏢 Enterprise 상담 신청</h3>
        <button class="btn btn-ghost btn-sm" id="contact-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="text-align:center; padding:16px 0;">
          <div style="font-size:32px; margin-bottom:8px;">🏢</div>
          <div style="font-size:14px; margin-bottom:16px; color:var(--text-muted);">
            Enterprise 요금제는 맞춤 상담을 통해 진행됩니다.
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">회사명</label>
          <input class="form-input" id="contact-company" placeholder="회사명을 입력하세요" />
        </div>
        <div class="form-group">
          <label class="form-label">담당자명</label>
          <input class="form-input" id="contact-name" placeholder="담당자 성함" />
        </div>
        <div class="form-group">
          <label class="form-label">이메일</label>
          <input class="form-input" type="email" id="contact-email" placeholder="email@company.com" />
        </div>
        <div class="form-group">
          <label class="form-label">문의 내용</label>
          <textarea class="form-input" id="contact-msg" rows="3" placeholder="사용 규모, 필요 기능 등"></textarea>
        </div>
      </div>
      <div class="modal-footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="btn btn-ghost" id="contact-cancel">닫기</button>
        <button class="btn btn-primary" id="contact-submit">📧 상담 신청</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#contact-close').addEventListener('click', () => modal.remove());
  modal.querySelector('#contact-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#contact-submit').addEventListener('click', () => {
    const company = modal.querySelector('#contact-company').value.trim();
    const email = modal.querySelector('#contact-email').value.trim();
    if (!company || !email) {
      showToast('회사명과 이메일을 입력해 주세요.', 'warning');
      return;
    }
    showToast('상담 신청이 접수되었습니다. 빠른 시일 내 연락드리겠습니다.', 'success');
    modal.remove();
  });
}
