/**
 * page-guide.js - 사용 가이드
 * 왜 필요? → 처음 사용하는 고객이 빠르게 서비스를 이해하고 활용할 수 있도록
 */
import { showToast } from './toast.js';

export function renderGuidePage(container, navigateTo) {
  container.innerHTML = `
    <div style="max-width:800px; margin:0 auto; padding:24px;">
      <h2 style="font-size:22px; font-weight:800; margin-bottom:8px;">📖 사용 가이드</h2>
      <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">처음이신가요? 아래 순서대로 따라하시면 금방 익히실 수 있어요.</p>

      <!-- 빠른 시작 -->
      <div class="card" style="padding:24px; margin-bottom:16px; border-left:3px solid #8b5cf6;">
        <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">빠른 시작</h3>
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
        <div id="feature-cards" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:12px;">
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
    { q: '데이터는 안전한가요?', a: '네, Supabase 기반으로 안전하게 저장되며, 모든 통신은 HTTPS로 보호됩니다.' },
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

  // 기능별 가이드 카드 렌더링 (클릭으로 해당 페이지 이동)
  const featureContainer = document.getElementById('feature-cards');
  const features = [
    { icon: '📂', name: '엑셀 업로드', desc: '기존 데이터를 빠르게 가져오기', page: 'upload' },
    { icon: '📦', name: '재고 관리', desc: '실시간 재고 현황 모니터링', page: 'inventory' },
    { icon: '🔄', name: '입출고', desc: '입고·출고 내역 등록 및 추적', page: 'inout' },
    { icon: '🤖', name: '자동 발주', desc: 'AI 기반 발주 추천', page: 'auto-order' },
    { icon: '🔮', name: '수요 예측', desc: '과거 데이터 기반 수요 분석', page: 'forecast' },
    { icon: '💰', name: '원가 분석', desc: '품목별 마진·원가 자동 계산', page: 'costing' },
    { icon: '💹', name: '손익 분석', desc: '매출/매입/이익 대시보드', page: 'profit' },
    { icon: '📑', name: '세무 서류', desc: '월마감·부가세 서류 자동 생성', page: 'tax-reports' },
    { icon: '📄', name: '문서 생성', desc: '견적서·거래명세서 자동 생성', page: 'documents' },
    { icon: '🏢', name: '다중 창고', desc: '여러 창고 재고 통합 관리', page: 'warehouses' },
    { icon: '📊', name: '보고서', desc: 'ABC·추세 등 고급 분석', page: 'dashboard' },
    { icon: '💾', name: '백업/복원', desc: '데이터 안전 백업 및 복원', page: 'backup' },
  ];

  features.forEach(f => {
    const card = document.createElement('div');
    card.style.cssText = 'padding:16px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); text-align:center; cursor:pointer; transition:all 0.2s;';
    card.innerHTML = `
      <div style="font-size:28px; margin-bottom:8px;">${f.icon}</div>
      <div style="font-size:13px; font-weight:600;">${f.name}</div>
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${f.desc}</div>
    `;
    card.addEventListener('mouseover', () => {
      card.style.borderColor = 'rgba(139,92,246,0.4)';
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 4px 12px rgba(139,92,246,0.15)';
    });
    card.addEventListener('mouseout', () => {
      card.style.borderColor = 'rgba(255,255,255,0.06)';
      card.style.transform = '';
      card.style.boxShadow = '';
    });
    card.addEventListener('click', () => navigateTo(f.page));
    featureContainer.appendChild(card);
  });
}
