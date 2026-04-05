/**
 * page-guide.js - 사용 가이드
 * 왜 필요? → 처음 사용하는 고객이 빠르게 서비스를 이해하고 활용할 수 있도록
 */
import { showToast } from './toast.js';

export function renderGuidePage(container, navigateTo) {
  container.innerHTML = `
    <div style="max-width:800px; margin:0 auto; padding:24px;">
      <h2 style="font-size:22px; font-weight:800; margin-bottom:8px;">📖 사용 가이드</h2>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">INVEX를 처음 사용하시나요? 아래 가이드를 따라해보세요!</p>

      <!-- 빠른 시작 -->
      <div class="card" style="padding:24px; margin-bottom:16px; border-left:3px solid #8b5cf6;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">🚀 빠른 시작 (5분 가이드)</h3>
        <div id="guide-steps" style="display:flex; flex-direction:column; gap:12px;">
        </div>
      </div>

      <!-- FAQ -->
      <div class="card" style="padding:24px; margin-bottom:16px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">❓ 자주 묻는 질문</h3>
        <div id="faq-list" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>

      <!-- 기능별 가이드 -->
      <div class="card" style="padding:24px;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">📚 기능별 상세 가이드</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
          ${getFeatureCards()}
        </div>
      </div>
    </div>
  `;

  // 빠른 시작 단계 렌더링
  const stepsContainer = document.getElementById('guide-steps');
  const steps = [
    { num: 1, icon: '📂', title: '엑셀 파일 업로드', desc: '기존 재고 데이터가 담긴 엑셀(.xlsx)을 업로드하세요.', page: 'upload' },
    { num: 2, icon: '📋', title: '데이터 매핑 확인', desc: '엑셀 컬럼과 시스템 필드가 올바르게 매핑되었는지 확인하세요.', page: 'mapping' },
    { num: 3, icon: '📦', title: '재고 현황 확인', desc: '업로드된 재고 목록을 확인하고 수정하세요.', page: 'inventory' },
    { num: 4, icon: '🔄', title: '입출고 등록', desc: '물품의 입고와 출고를 등록하세요. 재고가 자동으로 반영됩니다.', page: 'inout' },
    { num: 5, icon: '📊', title: '보고서 확인', desc: '대시보드와 요약 보고에서 경영 현황을 한눈에 파악하세요.', page: 'summary' },
  ];

  steps.forEach(step => {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex; gap:12px; padding:12px; border-radius:8px; background:rgba(139,92,246,0.06); cursor:pointer; transition:background 0.2s;';
    el.innerHTML = `
      <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#8b5cf6,#3b82f6); display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:14px; flex-shrink:0;">${step.num}</div>
      <div>
        <div style="font-size:14px; font-weight:600;">${step.icon} ${step.title}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">${step.desc}</div>
      </div>
    `;
    el.addEventListener('mouseover', () => el.style.background = 'rgba(139,92,246,0.12)');
    el.addEventListener('mouseout', () => el.style.background = 'rgba(139,92,246,0.06)');
    el.addEventListener('click', () => navigateTo(step.page));
    stepsContainer.appendChild(el);
  });

  // FAQ 렌더링
  const faqContainer = document.getElementById('faq-list');
  const faqs = [
    { q: '무료 플랜으로 뭘 할 수 있나요?', a: '재고 현황 조회, 기본 입출고 관리, 엑셀 업로드가 가능합니다. 최대 100개 품목까지 관리할 수 있습니다.' },
    { q: '데이터는 안전한가요?', a: '모든 데이터는 Google Firebase에 암호화되어 저장됩니다. SSL/TLS 보안 연결을 사용하며, 접근 권한이 철저히 관리됩니다.' },
    { q: 'Pro로 업그레이드하면 뭐가 달라지나요?', a: '무제한 품목 관리, 바코드 스캔, 원가 분석, 문서 생성, 거래처 관리, 다중 창고 등 고급 기능을 사용할 수 있습니다.' },
    { q: '엑셀 없이도 사용할 수 있나요?', a: '네! 재고 현황 페이지에서 직접 품목을 추가할 수 있습니다. 엑셀 업로드는 기존 데이터를 빠르게 가져오기 위한 편의 기능입니다.' },
    { q: '여러 사람이 동시에 사용할 수 있나요?', a: 'Enterprise 플랜에서는 팀원 관리와 권한 설정이 가능합니다. 여러 사용자가 동시에 작업할 수 있습니다.' },
    { q: '모바일에서도 사용할 수 있나요?', a: '네! INVEX는 반응형 웹앱으로 모바일 브라우저에서도 사용 가능합니다. 홈 화면에 추가하면 앱처럼 사용할 수 있습니다.' },
  ];

  faqs.forEach(faq => {
    const el = document.createElement('div');
    el.style.cssText = 'border:1px solid rgba(255,255,255,0.06); border-radius:8px; overflow:hidden;';
    el.innerHTML = `
      <div class="faq-q" style="padding:12px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; transition:background 0.2s;">
        <span>${faq.q}</span>
        <span class="faq-arrow" style="transition:transform 0.3s; font-size:11px;">▼</span>
      </div>
      <div class="faq-a" style="padding:0 16px; max-height:0; overflow:hidden; transition:max-height 0.3s ease, padding 0.3s ease; font-size:12px; color:var(--text-muted); line-height:1.7;">
        ${faq.a}
      </div>
    `;
    const qEl = el.querySelector('.faq-q');
    const aEl = el.querySelector('.faq-a');
    const arrow = el.querySelector('.faq-arrow');
    let open = false;
    qEl.addEventListener('click', () => {
      open = !open;
      aEl.style.maxHeight = open ? '200px' : '0';
      aEl.style.padding = open ? '0 16px 12px' : '0 16px';
      arrow.style.transform = open ? 'rotate(180deg)' : '';
    });
    qEl.addEventListener('mouseover', () => qEl.style.background = 'rgba(255,255,255,0.04)');
    qEl.addEventListener('mouseout', () => qEl.style.background = '');
    faqContainer.appendChild(el);
  });
}

function getFeatureCards() {
  const features = [
    { icon: '📂', name: '엑셀 업로드', desc: '기존 데이터를 빠르게 가져오기' },
    { icon: '📦', name: '재고 관리', desc: '실시간 재고 현황 모니터링' },
    { icon: '🔄', name: '입출고', desc: '입고·출고 내역 등록 및 추적' },
    { icon: '📱', name: '바코드 스캔', desc: '카메라로 바코드 빠른 인식' },
    { icon: '💰', name: '원가 분석', desc: '품목별 마진·원가 자동 계산' },
    { icon: '📄', name: '문서 생성', desc: '견적서·거래명세서 자동 생성' },
    { icon: '🏢', name: '다중 창고', desc: '여러 창고 재고 통합 관리' },
    { icon: '📊', name: '보고서', desc: 'ABC·추세 등 고급 분석' },
  ];
  return features.map(f => `
    <div style="padding:16px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); text-align:center; transition:border-color 0.2s;"
         onmouseover="this.style.borderColor='rgba(139,92,246,0.3)'"
         onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
      <div style="font-size:28px; margin-bottom:8px;">${f.icon}</div>
      <div style="font-size:13px; font-weight:600;">${f.name}</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${f.desc}</div>
    </div>
  `).join('');
}
