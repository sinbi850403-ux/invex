/**
 * onboarding.js - 온보딩 마법사
 * 
 * 역할: 첫 로그인 사용자에게 3단계 가이드를 제공하여 빠른 정착 유도
 * 왜 필요? → "가입했는데 뭘 해야 하지?" → 이탈 방지. 정착률 3배↑
 */

import { getState, setState } from './store.js';
import { showToast } from './toast.js';

/**
 * 온보딩이 필요한지 확인하고, 필요하면 마법사 실행
 * 호출 시점: 로그인 직후, initAppAfterAuth()에서 호출
 */
export function checkAndShowOnboarding(navigateTo) {
  const state = getState();

  // 이미 온보딩 완료한 사용자면 스킵
  if (state._onboardingDone) return;

  // 데이터가 이미 있으면 기존 사용자이므로 스킵
  if ((state.mappedData || []).length > 0) {
    setState({ _onboardingDone: true });
    return;
  }

  // 온보딩 시작!
  showOnboardingModal(navigateTo);
}

function showOnboardingModal(navigateTo) {
  let currentStep = 0;

  const steps = [
    {
      icon: '👋',
      title: 'INVEX에 오신 것을 환영합니다!',
      desc: `재고 관리, 입출고 추적, 세무 서류까지<br/>
             모든 기능을 <strong>1년 무료</strong>로 이용할 수 있습니다.`,
      detail: `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div style="background:rgba(37,99,235,0.08); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px;">📦</div>
            <div style="font-size:12px; font-weight:600; margin-top:4px;">재고 관리</div>
          </div>
          <div style="background:rgba(63,185,80,0.08); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px;">🔄</div>
            <div style="font-size:12px; font-weight:600; margin-top:4px;">입출고 추적</div>
          </div>
          <div style="background:rgba(139,92,246,0.08); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px;">📑</div>
            <div style="font-size:12px; font-weight:600; margin-top:4px;">세무 서류</div>
          </div>
          <div style="background:rgba(210,153,34,0.08); border-radius:10px; padding:14px; text-align:center;">
            <div style="font-size:24px;">💹</div>
            <div style="font-size:12px; font-weight:600; margin-top:4px;">손익 분석</div>
          </div>
        </div>
      `,
      btnText: '시작하기 →',
    },
    {
      icon: '📄',
      title: '기존 엑셀 파일이 있으신가요?',
      desc: '엑셀 파일을 업로드하면 품목을 자동으로 인식합니다.<br/>없어도 괜찮아요, 직접 추가할 수 있습니다.',
      detail: `
        <div style="display:flex; gap:12px; margin-top:16px;">
          <button class="onb-action-btn onb-upload-btn" style="flex:1; background:linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; border:none; padding:14px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600;">
            📤 엑셀 파일 업로드
          </button>
          <button class="onb-action-btn onb-skip-btn" style="flex:1; background:#f8f9fc; color:#5a6474; border:1px solid #e2e6eb; padding:14px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600;">
            ✋ 나중에 할게요
          </button>
        </div>
      `,
      btnText: '다음 →',
    },
    {
      icon: '🎉',
      title: '준비 완료!',
      desc: '이제 INVEX의 모든 기능을 사용할 수 있습니다.',
      detail: `
        <div style="margin-top:16px; font-size:13px; color:#5a6474; line-height:1.8;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <span style="font-size:18px;">💡</span>
            <strong>TIP:</strong> 왼쪽 사이드바에서 원하는 메뉴를 선택하세요
          </div>
          <div style="background:#f8f9fc; border-radius:10px; padding:12px; margin-top:8px;">
            <strong>추천 순서:</strong><br/>
            1️⃣ 품목 등록 (재고 현황 → 품목 추가)<br/>
            2️⃣ 입출고 기록 (입출고 관리)<br/>
            3️⃣ 보고서 확인 (손익 분석 / 요약 보고)
          </div>
        </div>
      `,
      btnText: '시작하기! 🚀',
    },
  ];

  // 모달 생성
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10000';
  overlay.id = 'onboarding-overlay';

  function render() {
    const step = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;

    overlay.innerHTML = `
      <div style="
        background:var(--bg-card, #fff); border-radius:20px; max-width:460px; width:90%;
        padding:32px; box-shadow:0 24px 64px rgba(0,0,0,0.15); position:relative;
        animation: slideUp 0.3s ease;
      ">
        <!-- 프로그레스 바 -->
        <div style="display:flex; gap:6px; margin-bottom:24px;">
          ${steps.map((_, i) => `
            <div style="flex:1; height:4px; border-radius:2px; background:${i <= currentStep ? 'linear-gradient(135deg,#2563eb,#7c3aed)' : 'var(--border, #e2e6eb)'};"></div>
          `).join('')}
        </div>

        <!-- 스킵 -->
        <button id="onb-skip" style="
          position:absolute; top:16px; right:16px; background:none; border:none;
          color:var(--text-muted, #8b949e); font-size:13px; cursor:pointer;
        ">건너뛰기</button>

        <!-- 콘텐츠 -->
        <div style="text-align:center; margin-bottom:16px;">
          <div style="font-size:48px; margin-bottom:8px;">${step.icon}</div>
          <h2 style="font-size:20px; font-weight:700; margin:0 0 8px; color:var(--text-primary, #1a1a2e);">${step.title}</h2>
          <p style="font-size:14px; color:var(--text-muted, #5a6474); line-height:1.6; margin:0;">${step.desc}</p>
        </div>

        ${step.detail}

        <!-- 하단 버튼 -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px;">
          ${currentStep > 0 ? '<button id="onb-prev" style="background:none; border:none; color:var(--text-muted, #5a6474); font-size:13px; cursor:pointer;">← 이전</button>' : '<div></div>'}
          <button id="onb-next" style="
            background:linear-gradient(135deg,#2563eb,#7c3aed); color:#fff; border:none;
            padding:10px 24px; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer;
          ">${step.btnText}</button>
        </div>
      </div>
    `;

    // 이벤트
    overlay.querySelector('#onb-skip')?.addEventListener('click', finish);
    overlay.querySelector('#onb-prev')?.addEventListener('click', () => { currentStep--; render(); });
    overlay.querySelector('#onb-next')?.addEventListener('click', () => {
      if (currentStep < steps.length - 1) { currentStep++; render(); }
      else finish();
    });

    // 엑셀 업로드 버튼 → 업로드 페이지로 이동
    overlay.querySelector('.onb-upload-btn')?.addEventListener('click', () => {
      finish();
      navigateTo('upload');
    });

    // 나중에 버튼
    overlay.querySelector('.onb-skip-btn')?.addEventListener('click', () => {
      currentStep++;
      render();
    });
  }

  function finish() {
    setState({ _onboardingDone: true });
    overlay.remove();
    showToast('환영합니다! INVEX를 자유롭게 둘러보세요 🎉', 'success');
  }

  render();
  document.body.appendChild(overlay);
}
