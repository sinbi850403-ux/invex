/**
 * GuidePage.jsx - 사용 가이드
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STEPS = [
  { num: 1, icon: '', title: '엑셀 파일 업로드', desc: '기존 재고 데이터가 담긴 엑셀(.xlsx)을 업로드하세요.', page: 'upload' },
  { num: 2, icon: '', title: '데이터 매핑 확인', desc: '엑셀 컬럼과 시스템 필드가 올바르게 매핑되었는지 확인하세요.', page: 'mapping' },
  { num: 3, icon: '', title: '재고 현황 확인', desc: '업로드된 재고 목록을 확인하고 수정하세요.', page: 'inventory' },
  { num: 4, icon: '', title: '입출고 등록', desc: '물품의 입고와 출고를 등록하세요. 재고가 자동으로 반영됩니다.', page: 'in' },
  { num: 5, icon: '', title: '보고서 확인', desc: '대시보드와 요약 보고에서 경영 현황을 한눈에 파악하세요.', page: 'summary' },
];

const FAQS = [
  { q: '무료 플랜으로 뭘 할 수 있나요?', a: '재고 현황 조회, 기본 입출고 관리, 엑셀 업로드가 가능합니다. 최대 100개 품목까지 관리할 수 있습니다.' },
  { q: '데이터는 안전한가요?', a: '네, Supabase 기반으로 안전하게 저장되며, 모든 통신은 HTTPS로 보호됩니다.' },
  { q: 'Pro로 업그레이드하면 뭐가 달라지나요?', a: '무제한 품목 관리, 바코드 스캔, 원가 분석, 문서 생성, 거래처 관리, 다중 창고 등 고급 기능을 사용할 수 있습니다.' },
  { q: '엑셀 없이도 사용할 수 있나요?', a: '네! 재고 현황 페이지에서 직접 품목을 추가할 수 있습니다. 엑셀 업로드는 기존 데이터를 빠르게 가져오기 위한 편의 기능입니다.' },
  { q: '여러 사람이 동시에 사용할 수 있나요?', a: 'Enterprise 플랜에서는 팀원 관리와 권한 설정이 가능합니다. 여러 사용자가 동시에 작업할 수 있습니다.' },
  { q: '모바일에서도 사용할 수 있나요?', a: '네! INVEX는 반응형 웹앱으로 모바일 브라우저에서도 사용 가능합니다. 홈 화면에 추가하면 앱처럼 사용할 수 있습니다.' },
];

const FEATURES = [
  { icon: '', name: '엑셀 업로드', desc: '기존 데이터를 빠르게 가져오기', page: 'upload' },
  { icon: '', name: '재고 관리', desc: '실시간 재고 현황 모니터링', page: 'inventory' },
  { icon: '', name: '입출고', desc: '입고·출고 내역 등록 및 추적', page: 'in' },
  { icon: '', name: '수요 예측', desc: '과거 데이터 기반 수요 분석', page: 'forecast' },
  { icon: '', name: '원가 분석', desc: '품목별 마진·원가 자동 계산', page: 'costing' },
  { icon: '', name: '손익 분석', desc: '매출/매입/이익 대시보드', page: 'profit' },
  { icon: '', name: '세무 서류', desc: '월마감·부가세 서류 자동 생성', page: 'tax-reports' },
  { icon: '', name: '문서 생성', desc: '견적서·거래명세서 자동 생성', page: 'documents' },
  { icon: '', name: '다중 창고', desc: '여러 창고 재고 통합 관리', page: 'warehouses' },
  { icon: '', name: '보고서', desc: 'ABC·추세 등 고급 분석', page: 'dashboard' },
  { icon: '', name: '백업/복원', desc: '데이터 안전 백업 및 복원', page: 'backup' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 16px', cursor: 'pointer', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          fontSize: '13px', fontWeight: '600', transition: 'background 0.2s',
        }}
        onClick={() => setOpen(o => !o)}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
      >
        <span>{q}</span>
        <span style={{ transition: 'transform 0.3s', fontSize: '11px', transform: open ? 'rotate(180deg)' : '' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: '0 16px 12px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.7' }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function GuidePage() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '8px' }}> 사용 가이드</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '24px' }}>
        처음이신가요? 아래 순서대로 따라하시면 금방 익히실 수 있어요.
      </p>

      {/* 빠른 시작 */}
      <div className="card" style={{ padding: '24px', marginBottom: '16px', borderLeft: '3px solid #8b5cf6' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}> 빠른 시작</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {STEPS.map(step => (
            <div
              key={step.num}
              style={{
                display: 'flex', gap: '12px', padding: '12px',
                borderRadius: '8px', background: 'rgba(139,92,246,0.06)',
                cursor: 'pointer', transition: 'background 0.2s',
              }}
              onClick={() => navigate('/' + step.page)}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(139,92,246,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(139,92,246,0.06)'}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: '700', fontSize: '14px', flexShrink: 0,
              }}>{step.num}</div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{step.icon} {step.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="card" style={{ padding: '24px', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}> 자주 묻는 질문</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {FAQS.map(faq => <FaqItem key={faq.q} {...faq} />)}
        </div>
      </div>

      {/* 기능별 가이드 */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}> 기능별 상세 가이드</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {FEATURES.map(f => (
            <div
              key={f.name}
              style={{
                padding: '16px', borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)',
                textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s',
              }}
              onClick={() => navigate('/' + f.page)}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139,92,246,0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{f.icon}</div>
              <div style={{ fontSize: '13px', fontWeight: '600' }}>{f.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
