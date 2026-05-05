/**
 * defaultState.js - 앱 초기 상태 정의
 */

export const DEFAULT_STATE = {
  rawData: [],          // 업로드된 원본 데이터
  sheetNames: [],       // 시트 이름 목록
  activeSheet: '',      // 현재 선택된 시트
  fileName: '',         // 업로드된 파일명
  columnMapping: {},    // 컬럼 매핑 정보
  mappedData: [],       // 매핑 완료된 정제 데이터
  currentStep: 1,       // 진행 단계
  allSheets: {},        // 모든 시트 데이터
  // 입출고 이력
  transactions: [],     // [{id, type, itemName, quantity, date, note, ...}]
  // 안전재고 설정
  safetyStock: {},      // { 품목명: 최소수량 }
  // 컬럼 표시 설정
  visibleColumns: null, // ['itemName','quantity','unitPrice'] 형태
  // 초보자 도움 모드
  beginnerMode: true,
  // 대시보드 보기 모드
  dashboardMode: 'executive',
  // 자동 컬럼정렬 상태
  tableSortPrefs: {},
  // 화면별 필터/정렬 뷰 설정 (사용자 편의 저장)
  inventoryViewPrefs: {
    filter: { keyword: '', category: '', warehouse: '', stock: '', itemCode: '', vendor: '', focus: 'all' },
    sort: { key: '', direction: '' },
  },
  inoutViewPrefs: {
    filter: { keyword: '', type: '', date: '', vendor: '', itemCode: '', quick: 'all' },
    sort: { key: 'date', direction: 'desc' },
  },
  // 각 mappedData row에는 expiryDate, lotNumber 필드도 포함 가능
  // 창고 간 이동 이력
  transfers: [],        // [{date, fromWarehouse, toWarehouse, itemName, quantity, ...}]
  // 커스텀 필드 (사용자 정의 컬럼)
  customFields: [],     // [{key, label, type, options?}]
  // 거래처 마스터
  vendorMaster: [],     // [{name, type, bizNumber, ceoName, contactName, phone, ...}]
  // 재고 실사 이력
  stocktakeHistory: [], // [{date, inspector, adjustCount, totalItems}]
  // 감사 추적
  auditLogs: [],        // [{id, timestamp, action, target, detail, user}]
  // 원가 계산 방식
  costMethod: 'weighted-avg', // 'weighted-avg' | 'fifo' | 'latest'
  // 매출/매입 전표
  accountEntries: [],   // [{id, type, vendorName, amount, currency, date, ...}]
  // 발주 이력
  purchaseOrders: [],   // [{id, orderNo, vendor, items, status, paymentDueDate, ...}]
  // 수주 이력 (판매 플로우)
  salesOrders: [],      // [{id, orderNo, customer, items, status, shippedItems, receivableEntryId, ...}]
  // 세금계산서 (매입/매출 공용)
  taxInvoices: [],      // [{id, invoiceNo, type, vendor/customer, items, supply, vat, total, ...}]
  // 문서 작성용 임시 draft
  documentDraft: null,
  // 통화 설정
  currency: { code: 'KRW', symbol: '₩', rate: 1 },
  // 사용자명
  userName: '관리자',
  // 창고별 현재고 캐시 (item_stocks 테이블, DB 트리거 자동갱신)
  itemStocks: [],      // [{itemId, warehouseId, quantity, lastUpdatedAt}]
  // 안전재고 (safety_stocks 테이블, 기존 safetyStock 객체 대체)
  safetyStocks: [],    // [{id, itemId, warehouseId, minQty, updatedAt}]
  // 창고 마스터 (Enterprise: 다중 창고 관리)
  warehouses: [
    { id: 'wh-default', name: '본사 창고', type: 'main', address: '', manager: '', memo: '', createdAt: '' }
  ],
  // 권한 관리 (Enterprise: RBAC)
  roles: [],              // [{id, name, icon, color, description, permissions, isSystem}]
  members: [],            // [{id, name, email, roleId, status, joinedAt}]
  // 역할별 기능 접근 권한 행렬 (role_permissions 테이블)
  rolePermissions: null,  // { admin: { pageId: boolean }, manager: {...}, staff: {...}, viewer: {...} }
  // API 연동 (Enterprise)
  apiKeys: [],            // [{id, name, key, scope, createdAt, lastUsed, visible}]
  webhooks: [],           // [{id, name, url, events, active, createdAt}]
  // 창고 필터 (UI 상태)
  activeWarehouseFilter: '',
  // 현재 요금제 (free / pro / enterprise)
  currentPlan: 'free',
  // 구독 정보
  subscription: {},       // {planId, status, startDate, nextPayDate, cardLast4, ...}
  // 결제 이력
  paymentHistory: [],     // [{id, date, planName, amount, status, method}]
  // 관리자 데이터
  adminUsers: [],         // [{uid, name, email, plan, role, status, createdAt, lastLogin}]
  adminNotices: [],       // [{id, title, content, date}]
  // 알림 상태
  notificationReadMap: {},
  notificationDeliveryLog: {},
  notificationChannelPrefs: { webhook: true },
  // 수불부 기초재고 수동 입력
  ledgerOpeningOverrides: {},
  // === HR 모듈 (Phase A) ===
  employees: [],         // 직원 마스터 [{id, empNo, name, dept, position, hireDate, baseSalary, ...}]
  attendance: [],        // 일별 근태   [{id, employeeId, workDate, checkIn, checkOut, workMin, overtimeMin, nightMin, holidayMin, status}]
  payrolls: [],          // 월별 급여   [{id, employeeId, payYear, payMonth, base, gross, net, status}]
  leaves: [],            // 휴가        [{id, employeeId, leaveType, startDate, endDate, days, status}]
  salaryItems: [],       // 수당·공제 마스터
  hrFilters: { dept: '', status: 'active' },
  currentPayrollPeriod: null, // {year, month}
};
