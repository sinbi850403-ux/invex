import React from 'react';

export default function LandingPage({ onShowAuth }) {
  return (
    <div id="landing-page" className="landing-page">
      {/* 네비게이션 바 */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-logo">
            <img src="/logo-mark.svg" alt="INVEX" width="32" height="32" style={{verticalAlign:'middle', borderRadius:'8px'}} />
            <span>INVEX</span>
          </div>
          <div className="landing-nav-links">
            <a href="#features">기능</a>
            <a href="#pricing">요금제</a>
            <a href="#faq">FAQ</a>
            <button className="landing-cta-btn-sm" onClick={onShowAuth}>무료로 시작하기</button>
          </div>
        </div>
      </nav>

      {/* 히어로 섹션 */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-badge"> 지금 가입하면 1년 무료!</div>
          <h1 className="landing-h1">
            재고 관리,<br/>
            <span className="landing-gradient-text">엑셀 말고 INVEX</span>
          </h1>
          <p className="landing-hero-desc">
            입출고부터 세무 서류까지, 중소기업에 필요한 모든 것을<br/>
            하나의 플랫폼에서. 팀원과 실시간 공유까지.
          </p>
          <div className="landing-hero-btns">
            <button className="landing-cta-btn" onClick={onShowAuth}>무료로 시작하기 →</button>
            <button className="landing-cta-btn-outline" onClick={() => document.getElementById('features')?.scrollIntoView({behavior:'smooth'})}>기능 둘러보기</button>
          </div>
          <div className="landing-hero-trust">
            <span> 카드 등록 없이 시작</span>
            <span> 1년간 모든 기능 무료</span>
            <span> 5분 만에 세팅 완료</span>
          </div>
        </div>
      </section>

      {/* 핵심 기능 */}
      <section className="landing-section" id="features">
        <h2 className="landing-h2">왜 INVEX인가요?</h2>
        <p className="landing-section-desc">엑셀로 관리하던 시간, INVEX가 아껴드립니다</p>
        <div className="landing-features-grid">
          {[
            {icon:'', title:'실시간 재고 파악', desc:'입출고 즉시 반영, 안전재고 경고, 다중 창고까지. 재고가 몇 개인지 실시간으로.'},
            {icon:'', title:'자동 분석 & 차트', desc:'매출/매입/이익을 자동 계산. 품목별 수익성 TOP10, 월별 추이 차트 한눈에.'},
            {icon:'', title:'AI 발주 추천', desc:'재고 부족을 미리 감지하고, 어떤 거래처에 얼마나 주문할지 자동 추천합니다.'},
            {icon:'', title:'세무 서류 1클릭', desc:'월마감 보고서, 매입매출장, 부가세 기초자료를 버튼 하나로 엑셀 생성.'},
            {icon:'', title:'팀 실시간 공유', desc:'팀원을 초대하면 같은 데이터를 실시간으로 공유. 누가 뭘 했는지 감사 추적까지.'},
            {icon:'', title:'PDF 출력 & 문서', desc:'발주서, 거래명세서를 전문적인 PDF로 출력. 카톡으로 바로 전송.'},
          ].map(f => (
            <div key={f.title} className="landing-feature-card">
              <div className="landing-feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 작동 흐름 */}
      <section className="landing-section landing-section-dark">
        <h2 className="landing-h2">5분이면 시작합니다</h2>
        <div className="landing-steps">
          <div className="landing-step"><div className="landing-step-num">1</div><h3>가입</h3><p>Google 또는 이메일로 1분 안에 가입하세요</p></div>
          <div className="landing-step-arrow">→</div>
          <div className="landing-step"><div className="landing-step-num">2</div><h3>INVEX 양식 다운로드</h3><p>전용 엑셀 양식을 받아 품목·수량·단가를 입력합니다</p></div>
          <div className="landing-step-arrow">→</div>
          <div className="landing-step"><div className="landing-step-num">3</div><h3>업로드 & 관리 시작</h3><p>양식을 업로드하면 재고·입출고·분석이 즉시 시작됩니다</p></div>
        </div>
      </section>

      {/* 요금제 */}
      <section className="landing-section" id="pricing">
        <h2 className="landing-h2">합리적인 요금제</h2>
        <p className="landing-section-desc">지금 가입하면 1년간 모든 기능을 무료로 이용할 수 있습니다</p>
        <div className="landing-pricing-grid">
          <div className="landing-pricing-card">
            <div className="landing-pricing-name">Free</div>
            <div className="landing-pricing-price">₩0<span>/월</span></div>
            <ul className="landing-pricing-list">
              <li> 재고 현황 관리</li><li> 입출고 기록</li><li> 엑셀 업로드/내보내기</li><li> 데이터 백업</li>
              <li className="muted"> 자동 발주 추천</li><li className="muted"> 세무 서류 생성</li>
            </ul>
            <button className="landing-pricing-btn" onClick={onShowAuth}>무료로 시작</button>
          </div>
          <div className="landing-pricing-card landing-pricing-popular">
            <div className="landing-pricing-badge"> 1년 무료</div>
            <div className="landing-pricing-name">Pro</div>
            <div className="landing-pricing-price">₩29,000<span>/월</span></div>
            <ul className="landing-pricing-list">
              <li> Free 전체 기능</li><li> 자동 발주 추천</li><li> 손익 분석 대시보드</li>
              <li> 세무/회계 서류 생성</li><li> PDF 출력</li><li> 팀 협업 (5명)</li>
            </ul>
            <button className="landing-pricing-btn landing-pricing-btn-primary" onClick={onShowAuth}>1년 무료로 시작</button>
          </div>
          <div className="landing-pricing-card">
            <div className="landing-pricing-name">Enterprise</div>
            <div className="landing-pricing-price">₩59,000<span>/월</span></div>
            <ul className="landing-pricing-list">
              <li> Pro 전체 기능</li><li> 다중 창고 관리</li><li> 권한 관리</li>
              <li> API 연동</li><li> 팀 협업 (무제한)</li><li> 전담 지원</li>
            </ul>
            <button className="landing-pricing-btn" onClick={onShowAuth}>문의하기</button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-section landing-section-dark" id="faq">
        <h2 className="landing-h2">자주 묻는 질문</h2>
        <div className="landing-faq">
          {[
            {q:'1년 무료 이후에는 어떻게 되나요?', a:'1년 무료 기간이 끝나면 Free 요금제로 자동 전환됩니다. 데이터는 삭제되지 않으며, 유료 기능만 잠깁니다.'},
            {q:'어떤 엑셀 파일을 사용해야 하나요?', a:'INVEX 전용 엑셀 양식을 다운로드해서 품목명·수량·단가를 입력한 뒤 업로드하시면 됩니다.'},
            {q:'데이터가 안전한가요?', a:'Supabase 기반으로 모든 데이터가 안전하게 저장되며, 추가로 JSON 백업 기능도 제공합니다.'},
            {q:'팀원과 함께 쓸 수 있나요?', a:'네! 이메일로 팀원을 초대하면 같은 데이터를 실시간으로 공유하며 함께 작업할 수 있습니다.'},
          ].map(item => (
            <details key={item.q} className="landing-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 최종 CTA */}
      <section className="landing-cta-section">
        <h2>지금 바로 시작하세요</h2>
        <p>카드 등록 없이, 1년간 모든 기능을 무료로 이용하세요.</p>
        <button className="landing-cta-btn" onClick={onShowAuth}>무료로 시작하기 →</button>
      </section>

      {/* 푸터 */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div> INVEX © 2026. All rights reserved.</div>
          <div>
            <a href="/terms">이용약관</a> · <a href="/privacy">개인정보처리방침</a> · <a href="mailto:support@invex.io.kr">고객지원</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
