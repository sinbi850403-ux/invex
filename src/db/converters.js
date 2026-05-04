/**
 * db/converters.js — DB ↔ Store 변환 유틸
 * DB는 snake_case, 기존 store는 camelCase라서 변환 필요
 */

import { toNullableNumber, toNullableString } from './core.js';

/**
 * 날짜 문자열을 DB에 안전하게 전달하기 위한 헬퍼.
 * 빈 문자열 / null / undefined → null (PostgreSQL date/timestamptz 타입은 '' 거부)
 * 값이 있으면 trim한 문자열 반환.
 */
function dateOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return s || null;
}

export function dbItemToStoreItem(dbItem) {
  return {
    _id: dbItem.id,
    itemName: dbItem.item_name,
    itemCode: dbItem.item_code,
    category: dbItem.category,
    quantity: dbItem.quantity,
    unit: dbItem.unit,
    unitPrice: dbItem.unit_price,
    supplyValue: dbItem.supply_value,
    vat: dbItem.vat,
    totalPrice: dbItem.total_price,
    salePrice: dbItem.sale_price,
    sellingPrice: dbItem.sale_price,
    warehouse: dbItem.warehouse,
    warehouseId: dbItem.warehouse_id,   // FK
    location: dbItem.location,
    vendor: dbItem.vendor,
    minStock: dbItem.min_stock,
    expiryDate: dbItem.expiry_date,
    lotNumber: dbItem.lot_number,
    memo: dbItem.memo,
    assetType: dbItem.asset_type,
    spec: dbItem.spec,
    color: dbItem.color || '',
    ...(dbItem.extra || {}),
  };
}

export function storeItemToDb(storeItem) {
  const { _id, itemName, itemCode, unitPrice, supplyValue, totalPrice,
    salePrice, minStock, expiryDate, lotNumber, assetType, spec, ...rest } = storeItem;

  // 알려진 필드와 커스텀 필드 분리
  const knownKeys = new Set([
    'category', 'quantity', 'unit', 'warehouse', 'location', 'vendor', 'vat', 'memo',
  ]);
  const extra = {};
  const known = {};
  Object.entries(rest).forEach(([k, v]) => {
    if (knownKeys.has(k)) known[k] = v;
    else extra[k] = v;
  });

  return {
    ...((_id !== null && _id !== undefined && String(_id).trim() !== '') ? { id: _id } : {}),
    item_name: toNullableString(itemName),
    item_code: toNullableString(itemCode),
    unit_price: toNullableNumber(unitPrice),
    supply_value: toNullableNumber(supplyValue),
    total_price: toNullableNumber(totalPrice),
    sale_price: toNullableNumber(salePrice),
    min_stock: toNullableNumber(minStock),
    expiry_date: toNullableString(expiryDate),
    lot_number: toNullableString(lotNumber),
    asset_type: toNullableString(assetType),   // 자산 구분
    spec: toNullableString(spec),              // 규격
    extra,
    ...known,
  };
}

export function dbTxToStoreTx(dbTx) {
  return {
    id: dbTx.id,
    type: dbTx.type,
    itemId: dbTx.item_id,                           // UUID FK
    itemName: dbTx.item_name,
    itemCode: dbTx.item_code,
    quantity: dbTx.quantity,
    unitPrice: dbTx.unit_price,
    supplyValue: dbTx.supply_value,
    vat: dbTx.vat,
    totalAmount: dbTx.total_amount,
    sellingPrice: dbTx.selling_price,
    actualSellingPrice: dbTx.actual_selling_price,
    spec: dbTx.spec,
    unit: dbTx.unit,
    category: dbTx.category,
    color: dbTx.color || '',
    date: dbTx.date,
    txnDate: dbTx.txn_date,                         // DATE 타입
    vendor: dbTx.vendor,
    vendorId: dbTx.vendor_id,                       // UUID FK
    warehouse: dbTx.warehouse,
    warehouseId: dbTx.warehouse_id,                 // UUID FK
    note: dbTx.note,
  };
}

export function dbTransferToStore(r) {
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    itemCode: r.item_code,
    fromWarehouse: r.from_warehouse,
    toWarehouse: r.to_warehouse,
    fromWarehouseId: r.from_warehouse_id,
    toWarehouseId: r.to_warehouse_id,
    quantity: r.quantity,
    date: r.date,
    dateD: r.date_d,
    note: r.note,
    createdAt: r.created_at,
  };
}

export function dbVendorToStore(dbVendor) {
  return {
    _id: dbVendor.id,
    name: dbVendor.name,
    type: dbVendor.type,
    bizNumber: dbVendor.biz_number,
    ceoName: dbVendor.ceo_name,
    contactName: dbVendor.contact_name,
    phone: dbVendor.phone,
    email: dbVendor.email,
    address: dbVendor.address,
    bankInfo: dbVendor.bank_info,
    memo: dbVendor.memo,
  };
}

// ============================================================
// HR 변환기 (snake_case ↔ camelCase)
// ============================================================
export function dbEmployeeToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    empNo: r.emp_no,
    name: r.name,
    dept: r.dept,
    position: r.position,
    hireDate: r.hire_date,
    resignDate: r.resign_date,
    rrnMask: r.rrn_mask,
    phone: r.phone,
    email: r.email,
    address: r.address,
    bank: r.bank,
    // H-001: account_no 평문 컬럼 읽기 차단 — account_no_mask(마스킹) 만 노출
    // 실제 계좌번호 조회는 employees.getAccountNo(id) RPC를 통해 암호화 해제
    accountNoMask: r.account_no_mask ?? null,
    baseSalary: r.base_salary,
    hourlyWage: r.hourly_wage,
    employmentType: r.employment_type,
    insuranceFlags: r.insurance_flags || { np: true, hi: true, ei: true, wc: true },
    dependents: r.dependents,
    children: r.children,
    annualLeaveTotal: r.annual_leave_total,
    annualLeaveUsed: r.annual_leave_used,
    status: r.status,
    memo: r.memo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function storeEmployeeToDb(e) {
  const out = {};
  if (e.id) out.id = e.id;
  if ('empNo' in e) out.emp_no = e.empNo;
  if ('name' in e) out.name = e.name;
  if ('dept' in e) out.dept = e.dept;
  if ('position' in e) out.position = e.position;
  if ('hireDate' in e) out.hire_date = dateOrNull(e.hireDate);
  if ('resignDate' in e) out.resign_date = dateOrNull(e.resignDate);
  if ('rrnMask' in e) out.rrn_mask = e.rrnMask;
  if ('phone' in e) out.phone = e.phone;
  if ('email' in e) out.email = e.email;
  if ('address' in e) out.address = e.address;
  if ('bank' in e) out.bank = e.bank;
  // H-001: account_no 평문 컬럼 쓰기 차단 — 계좌번호는 employees.setAccountNo() RPC 경유
  // (기존: out.account_no = e.accountNo → 평문 저장 — 보안 취약)
  if ('baseSalary' in e) out.base_salary = e.baseSalary;
  if ('hourlyWage' in e) out.hourly_wage = e.hourlyWage;
  if ('employmentType' in e) out.employment_type = e.employmentType;
  if ('insuranceFlags' in e) out.insurance_flags = e.insuranceFlags;
  if ('dependents' in e) out.dependents = e.dependents;
  if ('children' in e) out.children = e.children;
  if ('annualLeaveTotal' in e) out.annual_leave_total = e.annualLeaveTotal;
  if ('annualLeaveUsed' in e) out.annual_leave_used = e.annualLeaveUsed;
  if ('status' in e) out.status = e.status;
  if ('memo' in e) out.memo = e.memo;
  return out;
}

export function dbAttendanceToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    workDate: r.work_date,
    checkIn: r.check_in,
    checkOut: r.check_out,
    breakMin: r.break_min,
    workMin: r.work_min,
    overtimeMin: r.overtime_min,
    nightMin: r.night_min,
    holidayMin: r.holiday_min,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
  };
}

export function storeAttendanceToDb(a) {
  const out = {};
  if (a.id) out.id = a.id;
  if ('employeeId' in a) out.employee_id = a.employeeId;
  if ('workDate' in a) out.work_date = dateOrNull(a.workDate);
  if ('checkIn' in a) out.check_in = dateOrNull(a.checkIn);
  if ('checkOut' in a) out.check_out = dateOrNull(a.checkOut);
  if ('breakMin' in a) out.break_min = a.breakMin;
  if ('workMin' in a) out.work_min = a.workMin;
  if ('overtimeMin' in a) out.overtime_min = a.overtimeMin;
  if ('nightMin' in a) out.night_min = a.nightMin;
  if ('holidayMin' in a) out.holiday_min = a.holidayMin;
  if ('status' in a) out.status = a.status;
  if ('note' in a) out.note = a.note;
  return out;
}

export function dbPayrollToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    payYear: r.pay_year,
    payMonth: r.pay_month,
    base: r.base,
    allowances: r.allowances || {},
    overtimePay: r.overtime_pay,
    nightPay: r.night_pay,
    holidayPay: r.holiday_pay,
    gross: r.gross,
    np: r.np,
    hi: r.hi,
    ltc: r.ltc,
    ei: r.ei,
    incomeTax: r.income_tax,
    localTax: r.local_tax,
    otherDeduct: r.other_deduct || {},
    totalDeduct: r.total_deduct,
    net: r.net,
    status: r.status,
    paidAt: r.paid_at,
    confirmedBy: r.confirmed_by,
    confirmedAt: r.confirmed_at,
    issueNo: r.issue_no,
    createdAt: r.created_at,
  };
}

export function storePayrollToDb(p) {
  const out = {};
  if (p.id) out.id = p.id;
  if ('employeeId' in p) out.employee_id = p.employeeId;
  if ('payYear' in p) out.pay_year = p.payYear;
  if ('payMonth' in p) out.pay_month = p.payMonth;
  if ('base' in p) out.base = p.base;
  if ('allowances' in p) out.allowances = p.allowances;
  if ('overtimePay' in p) out.overtime_pay = p.overtimePay;
  if ('nightPay' in p) out.night_pay = p.nightPay;
  if ('holidayPay' in p) out.holiday_pay = p.holidayPay;
  if ('gross' in p) out.gross = p.gross;
  if ('np' in p) out.np = p.np;
  if ('hi' in p) out.hi = p.hi;
  if ('ltc' in p) out.ltc = p.ltc;
  if ('ei' in p) out.ei = p.ei;
  if ('incomeTax' in p) out.income_tax = p.incomeTax;
  if ('localTax' in p) out.local_tax = p.localTax;
  if ('otherDeduct' in p) out.other_deduct = p.otherDeduct;
  if ('totalDeduct' in p) out.total_deduct = p.totalDeduct;
  if ('net' in p) out.net = p.net;
  if ('status' in p) out.status = p.status;
  if ('paidAt' in p) out.paid_at = dateOrNull(p.paidAt);
  if ('confirmedBy' in p) out.confirmed_by = p.confirmedBy;
  if ('confirmedAt' in p) out.confirmed_at = dateOrNull(p.confirmedAt);
  if ('issueNo' in p) out.issue_no = p.issueNo;
  return out;
}

export function dbLeaveToStore(r) {
  if (!r) return null;
  return {
    id: r.id,
    employeeId: r.employee_id,
    leaveType: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    days: r.days,
    reason: r.reason,
    status: r.status,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    createdAt: r.created_at,
  };
}

export function storeLeaveToDb(l) {
  const out = {};
  if (l.id) out.id = l.id;
  if ('employeeId' in l) out.employee_id = l.employeeId;
  if ('leaveType' in l) out.leave_type = l.leaveType;
  if ('startDate' in l) out.start_date = dateOrNull(l.startDate);
  if ('endDate' in l) out.end_date = dateOrNull(l.endDate);
  if ('days' in l) out.days = l.days;
  if ('reason' in l) out.reason = l.reason;
  if ('status' in l) out.status = l.status;
  if ('approvedBy' in l) out.approved_by = l.approvedBy;
  if ('approvedAt' in l) out.approved_at = dateOrNull(l.approvedAt);
  return out;
}
