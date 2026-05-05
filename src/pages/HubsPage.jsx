/**
 * HubsPage.jsx - 허브 네비게이션 페이지 (8개)
 *
 * 각 허브는 같은 레이아웃을 공유하며 데이터와 카드 목록만 다릅니다.
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { getPageBadge } from '../plan.js';

/** 허브 카드 단일 컴포넌트 */
function HubCard({ icon, title, desc, nav, color = '#2563eb', meta = '' }) {
  const navigate = useNavigate();
  const badge = getPageBadge(nav);
  const iconBg = `${color}18`;

  return (
    <button
      className="hub-card"
      data-nav={nav}
      style={{ '--hub-accent': color }}
      onClick={() => navigate('/' + nav)}
    >
      <div className="hub-card-icon" style={{ background: iconBg }}>{icon}</div>
      <div className="hub-card-body">
        <div className="hub-card-title">
          {title}
          {badge && (
            <span className="hub-card-badge" style={{ background: badge.color }}>{badge.text}</span>
          )}
        </div>
        <div className="hub-card-desc">{desc}</div>
        {meta && <div className="hub-card-meta">{meta}</div>}
      </div>
      <div className="hub-card-arrow">→</div>
    </button>
  );
}

/** hub-inventory — 재고 관리 */
export function HubInventoryPage() {
  const [state] = useStore();
  const itemCount = useMemo(() => (state.mappedData || []).length, [state.mappedData]);
  const inCount = useMemo(() => (state.transactions || []).filter(t => t.type === 'in').length, [state.transactions]);
  const outCount = useMemo(() => (state.transactions || []).filter(t => t.type === 'out').length, [state.transactions]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 재고 관리</h1>
          <div className="page-desc">재고 현황, 입출고, 일괄처리, 실사를 한 곳에서 관리합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="재고 현황" desc="품목별 재고, 금액, 안전재고 상태를 조회합니다." nav="inventory" color="#2563eb" meta={`등록 품목 ${itemCount}건`} />
        <HubCard icon="" title="입고 관리" desc="입고를 기록하면 재고 수량이 즉시 증가합니다." nav="in" color="#16a34a" meta={`입고 기록 ${inCount}건`} />
        <HubCard icon="" title="출고 관리" desc="출고를 기록하면 재고 수량이 즉시 감소합니다." nav="out" color="#dc2626" meta={`출고 기록 ${outCount}건`} />
        <HubCard icon="" title="일괄 처리" desc="수정, 삭제, 분류 변경을 한 번에 처리합니다." nav="bulk" color="#d97706" />
        <HubCard icon="" title="재고 실사" desc="실제 재고와 시스템 재고를 비교하고 차이를 조정합니다." nav="stocktake" color="#7c3aed" />
      </div>
    </div>
  );
}

/** hub-warehouse — 창고·거래처 */
export function HubWarehousePage() {
  const [state] = useStore();
  const vendorCount = useMemo(() => (state.vendorMaster || []).length, [state.vendorMaster]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 창고·거래처</h1>
          <div className="page-desc">다중 창고와 거래처 정보를 함께 관리합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="창고 관리" desc="창고를 추가하고 창고별 재고를 분리 관리합니다." nav="warehouses" color="#0284c7" />
        <HubCard icon="" title="창고 이동" desc="창고 간 재고 이동을 기록하고 이력을 추적합니다." nav="transfer" color="#6366f1" />
        <HubCard icon="" title="거래처 관리" desc="공급처와 고객사 정보를 등록하고 관리합니다." nav="vendors" color="#059669" meta={`등록 거래처 ${vendorCount}곳`} />
      </div>
    </div>
  );
}

/** hub-order — 발주·예측 */
export function HubOrderPage() {
  const [state] = useStore();
  const pendingPO = useMemo(() => (state.purchaseOrders || []).filter(o => o.status === 'confirmed' || o.status === 'partial').length, [state.purchaseOrders]);
  const pendingSO = useMemo(() => (state.salesOrders || []).filter(o => o.status === 'confirmed' || o.status === 'partial').length, [state.salesOrders]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 발주·예측</h1>
          <div className="page-desc">발주, 수주, 자동 추천, 수요 예측을 통합 관리합니다.</div>
        </div>
      </div>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>구매 흐름</div>
      <div className="hub-grid" style={{ marginBottom: '20px' }}>
        <HubCard icon="" title="발주 관리" desc="발주 진행 상태와 이력을 조회합니다." nav="orders" color="#2563eb" meta={pendingPO > 0 ? `진행 중 ${pendingPO}건` : ''} />
      </div>
      <div style={{ marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>판매 흐름</div>
      <div className="hub-grid">
        <HubCard icon="" title="수주 관리" desc="견적, 주문, 출고 흐름을 한 화면에서 관리합니다." nav="sales" color="#16a34a" meta={pendingSO > 0 ? `진행 중 ${pendingSO}건` : ''} />
        <HubCard icon="" title="수요 예측" desc="과거 흐름을 바탕으로 미래 수요를 예측합니다." nav="forecast" color="#7c3aed" />
      </div>
    </div>
  );
}

/** hub-report — 보고·분석 */
export function HubReportPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 보고·분석</h1>
          <div className="page-desc">요약 보고, 손익, 주간 보고, 고급 분석을 한 곳에서 확인합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="요약 보고" desc="핵심 지표를 빠르게 확인합니다." nav="summary" color="#2563eb" />
        <HubCard icon="" title="주간 보고서" desc="주간 흐름과 이상 신호를 정리합니다." nav="weekly-report" color="#0891b2" />
        <HubCard icon="" title="손익 분석" desc="매출, 원가, 이익 구조를 분석합니다." nav="profit" color="#16a34a" />
        <HubCard icon="" title="미수·미지급 정산" desc="채권과 채무 현황을 점검합니다." nav="accounts" color="#d97706" />
        <HubCard icon="" title="원가 분석" desc="원가 구조와 변동 추이를 확인합니다." nav="costing" color="#dc2626" />
        <HubCard icon="" title="고급 분석" desc="대시보드 기반으로 다양한 지표를 탐색합니다." nav="dashboard" color="#7c3aed" />
      </div>
    </div>
  );
}

/** hub-documents — 문서·서류 */
export function HubDocumentsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 문서·서류</h1>
          <div className="page-desc">세무 문서, 자동 문서 생성, 원장을 한 곳에서 관리합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="세무·회계 서류 (개발중)" desc="부가세와 재고 관련 문서를 생성합니다." nav="tax-reports" color="#dc2626" />
        <HubCard icon="" title="문서 생성" desc="발주서, 거래명세서, 견적서를 생성합니다." nav="documents" color="#2563eb" />
        <HubCard icon="" title="원장" desc="입출고 흐름과 잔액을 상세 조회합니다." nav="ledger" color="#059669" />
        <HubCard icon="" title="감사 추적 (개발중)" desc="변경 이력과 작업 로그를 확인합니다." nav="auditlog" color="#6366f1" />
      </div>
    </div>
  );
}

/** hub-settings — 설정 */
export function HubSettingsPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 설정</h1>
          <div className="page-desc">기본 설정, 팀 관리, 권한, 백업을 관리합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="기본 설정" desc="통화, 단위, 세금 등 기본 옵션을 설정합니다." nav="settings" color="#64748b" />
        <HubCard icon="" title="팀 관리" desc="팀원 초대와 워크스페이스 구성을 관리합니다." nav="team" color="#2563eb" />
        <HubCard icon="" title="백업/복원" desc="데이터를 백업하고 복원합니다." nav="backup" color="#0891b2" />
        <HubCard icon="" title="권한 관리" desc="역할별 접근 권한을 설정합니다." nav="roles" color="#7c3aed" />
        <HubCard icon="" title="구독 관리" desc="요금제와 결제 정보를 관리합니다." nav="billing" color="#d97706" />
      </div>
    </div>
  );
}

/** hub-hr — 인사·급여 */
export function HubHrPage() {
  const [state] = useStore();
  const employeeCount = useMemo(
    () => (state.employees || []).filter(e => e.status !== 'resigned').length,
    [state.employees]
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 인사·급여</h1>
          <div className="page-desc">직원 정보, 근태, 급여, 휴가를 통합 관리합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="HR 대시보드" desc="인원, 근태, 급여 현황을 한눈에 확인합니다." nav="hr-dashboard" color="#2563eb" />
        <HubCard icon="" title="직원 관리" desc="직원 등록, 조회, 수정, 상태 관리를 수행합니다." nav="employees" color="#0284c7" meta={employeeCount > 0 ? `재직 ${employeeCount}명` : ''} />
        <HubCard icon="⏱" title="근태 관리" desc="출퇴근과 근무 시간을 관리합니다." nav="attendance" color="#16a34a" />
        <HubCard icon="" title="급여 계산" desc="급여와 공제 항목을 계산합니다." nav="payroll" color="#d97706" />
        <HubCard icon="" title="휴가·연차 관리" desc="연차 잔여와 휴가 요청 흐름을 관리합니다." nav="leaves" color="#7c3aed" />
        <HubCard icon="" title="퇴직금 계산" desc="퇴직금 예상액을 계산합니다." nav="severance" color="#059669" />
        <HubCard icon="" title="연말정산 보조" desc="연말정산 준비 데이터를 계산합니다." nav="yearend-settlement" color="#dc2626" />
      </div>
    </div>
  );
}

/** hub-support — 지원 */
export function HubSupportPage() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 지원</h1>
          <div className="page-desc">마이페이지, 가이드, 고객 문의, 추천을 이용합니다.</div>
        </div>
      </div>
      <div className="hub-grid">
        <HubCard icon="" title="마이페이지" desc="내 정보와 계정을 관리합니다." nav="mypage" color="#2563eb" />
        <HubCard icon="" title="사용 가이드" desc="기능별 사용법을 빠르게 확인합니다." nav="guide" color="#16a34a" />
        <HubCard icon="" title="고객 문의" desc="문의 접수와 답변 상태를 확인합니다." nav="support" color="#0891b2" />
        <HubCard icon="" title="친구 초대" desc="추천 링크를 공유하고 혜택을 받습니다." nav="referral" color="#d97706" />
      </div>
    </div>
  );
}
