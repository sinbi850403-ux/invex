/**
 * db.js - Supabase 데이터 접근 레이어 (DAL)
 *
 * 왜 별도 레이어?
 * → 페이지 코드가 직접 SQL을 쓰면 유지보수 지옥
 * → db.items.list(), db.transactions.create() 같은 깔끔한 API 제공
 * → 나중에 DB를 바꿔도 이 파일만 수정하면 됨
 *
 * 구조: db.{테이블}.{동작}() — CRUD 패턴
 */

import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

const DB_TIMEOUT_MS = 15_000;

/**
 * Supabase 쿼리에 타임아웃을 적용하는 래퍼
 * 왜 필요? → 네트워크 지연 시 무한 대기 → UI 스피너 갇힘 방지
 */
function withDbTimeout(queryPromise, label = 'DB query') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout (${DB_TIMEOUT_MS}ms)`)), DB_TIMEOUT_MS);
  });
  return Promise.race([queryPromise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 에러 핸들링 유틸 — Supabase 에러를 통일된 형태로 변환
 */
function handleError(error, context) {
  if (error) {
    console.error(`[DB] ${context}:`, error.message);
    throw new Error(`${context}: ${error.message}`);
  }
}

/**
 * 현재 로그인한 사용자 ID를 안전하게 가져오기
 */
async function getUserId() {
  const user = getCurrentUser();
  if (!user || (!user.uid && !user.id)) {
    throw new Error('로그인이 필요합니다.');
  }
  return user.uid || user.id;
}

// ============================================================
// 품목 (Items) CRUD
// ============================================================
export const items = {
  /**
   * 전체 품목 조회
   * @param {Object} options - { category, warehouse, vendor, search, orderBy, limit }
   */
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('items')
      .select('*')
      .eq('user_id', userId);

    // 필터 적용
    if (options.category) query = query.eq('category', options.category);
    if (options.warehouse) query = query.eq('warehouse', options.warehouse);
    if (options.vendor) query = query.eq('vendor', options.vendor);
    if (options.search) query = query.ilike('item_name', `%${options.search}%`);

    // 정렬
    if (options.orderBy) {
      const [col, dir] = options.orderBy.split(':');
      query = query.order(col, { ascending: dir !== 'desc' });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    // 페이지네이션
    if (options.limit) query = query.limit(options.limit);
    if (options.offset) query = query.range(options.offset, options.offset + (options.limit || 50) - 1);

    const { data, error } = await query;
    handleError(error, '품목 조회');
    return data || [];
  },

  /**
   * 품목 1건 조회
   */
  async get(itemId) {
    const userId = await getUserId();
    const { data, error } = await withDbTimeout(
      supabase.from('items').select('*').eq('id', itemId).eq('user_id', userId).single(),
      '품목 상세 조회'
    );
    handleError(error, '품목 상세 조회');
    return data;
  },

  /**
   * 품목 생성
   * @param {Object} item - { item_name, category, quantity, ... }
   */
  async create(item) {
    const userId = await getUserId();
    const { data, error } = await withDbTimeout(
      supabase.from('items').insert({ ...item, user_id: userId }).select().single(),
      '품목 생성'
    );
    handleError(error, '품목 생성');
    return data;
  },

  /**
   * 품목 여러 건 일괄 생성 (엑셀 업로드용)
   * 왜 upsert? → 같은 품목명이 이미 있으면 업데이트, 없으면 생성
   */
  async bulkUpsert(itemsArray) {
    const userId = await getUserId();
    const rows = itemsArray.map(item => ({
      ...item,
      user_id: userId,
    }));

    // 500개씩 배치 처리 — Supabase 요청 크기 제한 대응
    const BATCH_SIZE = 500;
    const results = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { data, error } = await supabase
        .from('items')
        .upsert(batch, { onConflict: 'user_id,item_name' })
        .select();
      handleError(error, `품목 일괄 저장 (${i}~${i + batch.length})`);
      results.push(...(data || []));
    }

    return results;
  },

  /**
   * 품목 수정
   */
  async update(itemId, updates) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('items')
      .update(updates)
      .eq('id', itemId)
      .eq('user_id', userId)
      .select()
      .single();
    handleError(error, '품목 수정');
    return data;
  },

  /**
   * 품목 삭제
   */
  async remove(itemId) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);
    handleError(error, '품목 삭제');
  },

  /**
   * 여러 품목 일괄 삭제
   */
  async bulkRemove(itemIds) {
    const { error } = await supabase
      .from('items')
      .delete()
      .in('id', itemIds);
    handleError(error, '품목 일괄 삭제');
  },

  /**
   * 품목 수 (요금제 제한 체크용)
   */
  async count() {
    const userId = await getUserId();
    const { count, error } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    handleError(error, '품목 수 조회');
    return count || 0;
  },
};

// ============================================================
// 입출고 (Transactions) CRUD
// ============================================================
export const transactions = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId);

    if (options.type) query = query.eq('type', options.type);
    if (options.itemName) query = query.eq('item_name', options.itemName);
    if (options.dateFrom) query = query.gte('date', options.dateFrom);
    if (options.dateTo) query = query.lte('date', options.dateTo);
    if (options.vendor) query = query.eq('vendor', options.vendor);

    query = query.order('date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    handleError(error, '입출고 조회');
    return data || [];
  },

  async create(tx) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transactions')
      .insert({ ...tx, user_id: userId })
      .select()
      .single();
    handleError(error, '입출고 등록');
    return data;
  },

  async bulkCreate(txArray) {
    const userId = await getUserId();
    const rows = txArray.map(tx => ({ ...tx, user_id: userId }));
    const { data, error } = await supabase
      .from('transactions')
      .insert(rows)
      .select();
    handleError(error, '입출고 일괄 등록');
    return data || [];
  },

  async remove(txId) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', txId);
    handleError(error, '입출고 삭제');
  },
};

// ============================================================
// 거래처 (Vendors) CRUD
// ============================================================
export const vendors = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('user_id', userId)
      .order('name');
    handleError(error, '거래처 조회');
    return data || [];
  },

  async create(vendor) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('vendors')
      .insert({ ...vendor, user_id: userId })
      .select()
      .single();
    handleError(error, '거래처 생성');
    return data;
  },

  async update(vendorId, updates) {
    const { data, error } = await supabase
      .from('vendors')
      .update(updates)
      .eq('id', vendorId)
      .select()
      .single();
    handleError(error, '거래처 수정');
    return data;
  },

  async remove(vendorId) {
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq('id', vendorId);
    handleError(error, '거래처 삭제');
  },
};

// ============================================================
// 창고 이동 (Transfers)
// ============================================================
export const transfers = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    handleError(error, '이동 이력 조회');
    return data || [];
  },

  async create(transfer) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('transfers')
      .insert({ ...transfer, user_id: userId })
      .select()
      .single();
    handleError(error, '이동 등록');
    return data;
  },
};

// ============================================================
// 감사 로그 (Audit Logs)
// ============================================================
export const auditLogs = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '감사 로그 조회');
    return data || [];
  },

  async create(log) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('audit_logs')
      .insert({ ...log, user_id: userId });
    // 감사 로그 실패는 조용히 처리 — 사용자 경험에 영향 없게
    if (error) console.warn('[DB] 감사 로그 저장 실패:', error.message);
  },
};

// ============================================================
// 매출/매입 장부 (Account Entries)
// ============================================================
export const accountEntries = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('account_entries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleError(error, '장부 조회');
    return data || [];
  },

  async create(entry) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('account_entries')
      .insert({ ...entry, user_id: userId })
      .select()
      .single();
    handleError(error, '장부 등록');
    return data;
  },

  async update(entryId, updates) {
    const { data, error } = await supabase
      .from('account_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single();
    handleError(error, '장부 수정');
    return data;
  },

  async remove(entryId) {
    const { error } = await supabase
      .from('account_entries')
      .delete()
      .eq('id', entryId);
    handleError(error, '장부 삭제');
  },
};

// ============================================================
// 발주서 (Purchase Orders)
// ============================================================
export const purchaseOrders = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleError(error, '발주서 조회');
    return data || [];
  },

  async create(order) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({ ...order, user_id: userId })
      .select()
      .single();
    handleError(error, '발주서 생성');
    return data;
  },

  async update(orderId, updates) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .update(updates)
      .eq('id', orderId)
      .select()
      .single();
    handleError(error, '발주서 수정');
    return data;
  },
};

// ============================================================
// POS 매출 데이터
// ============================================================
export const posSales = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase
      .from('pos_sales')
      .select('*')
      .eq('user_id', userId);

    if (options.dateFrom) query = query.gte('sale_date', options.dateFrom);
    if (options.dateTo) query = query.lte('sale_date', options.dateTo);
    if (options.store) query = query.eq('store', options.store);

    query = query.order('sale_date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    handleError(error, 'POS 매출 조회');
    return data || [];
  },

  async bulkCreate(salesArray) {
    const userId = await getUserId();
    const rows = salesArray.map(s => ({ ...s, user_id: userId }));
    const { data, error } = await supabase
      .from('pos_sales')
      .insert(rows)
      .select();
    handleError(error, 'POS 매출 일괄 등록');
    return data || [];
  },
};

// ============================================================
// 재고 실사 (Stocktakes)
// ============================================================
export const stocktakes = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stocktakes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    handleError(error, '실사 이력 조회');
    return data || [];
  },

  async create(stocktake) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('stocktakes')
      .insert({ ...stocktake, user_id: userId })
      .select()
      .single();
    handleError(error, '실사 등록');
    return data;
  },
};

// ============================================================
// 사용자 설정 (Key-Value)
// ============================================================
export const settings = {
  async get(key) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('value')
      .eq('user_id', userId)
      .eq('key', key)
      .single();

    // 설정이 없으면 null 반환 (에러가 아님)
    if (error?.code === 'PGRST116') return null;
    handleError(error, `설정 조회 (${key})`);
    return data?.value ?? null;
  },

  async set(key, value) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, key, value }, { onConflict: 'user_id,key' });
    handleError(error, `설정 저장 (${key})`);
  },

  /**
   * 여러 설정을 한번에 조회
   */
  async getAll() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('user_settings')
      .select('key, value')
      .eq('user_id', userId);
    handleError(error, '전체 설정 조회');

    // [{key, value}] → {key: value} 객체로 변환
    const result = {};
    (data || []).forEach(row => { result[row.key] = row.value; });
    return result;
  },
};

// ============================================================
// 커스텀 필드
// ============================================================
export const customFields = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');
    handleError(error, '커스텀 필드 조회');
    return data || [];
  },

  async create(field) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('custom_fields')
      .insert({ ...field, user_id: userId })
      .select()
      .single();
    handleError(error, '커스텀 필드 생성');
    return data;
  },

  async remove(fieldId) {
    const { error } = await supabase
      .from('custom_fields')
      .delete()
      .eq('id', fieldId);
    handleError(error, '커스텀 필드 삭제');
  },
};

// ============================================================
// HR: 직원 마스터
// ============================================================
export const employees = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('employees').select('*').eq('user_id', userId);
    if (options.status) query = query.eq('status', options.status);
    if (options.dept) query = query.eq('dept', options.dept);
    query = query.order('emp_no', { ascending: true });
    const { data, error } = await query;
    handleError(error, '직원 조회');
    return (data || []).map(dbEmployeeToStore);
  },
  async get(id) {
    const userId = await getUserId();
    const { data, error } = await withDbTimeout(
      supabase.from('employees').select('*').eq('id', id).eq('user_id', userId).single(),
      '직원 상세'
    );
    handleError(error, '직원 상세');
    return dbEmployeeToStore(data);
  },
  async create(emp) {
    const userId = await getUserId();
    const rrnPlain = emp._rrnPlain;
    const row = storeEmployeeToDb(emp);
    const { data, error } = await withDbTimeout(
      supabase.from('employees').insert({ ...row, user_id: userId }).select().single(),
      '직원 등록'
    );
    handleError(error, '직원 등록');
    if (rrnPlain && data?.id) {
      const { error: e2 } = await supabase.rpc('set_employee_rrn', { emp_id: data.id, plain: rrnPlain });
      handleError(e2, '주민번호 암호화');
    }
    return dbEmployeeToStore(data);
  },
  async update(id, updates) {
    const rrnPlain = updates._rrnPlain;
    const row = storeEmployeeToDb(updates);
    const { data, error } = await supabase.from('employees').update(row).eq('id', id).select().single();
    handleError(error, '직원 수정');
    if (rrnPlain) {
      const { error: e2 } = await supabase.rpc('set_employee_rrn', { emp_id: id, plain: rrnPlain });
      handleError(e2, '주민번호 암호화');
    }
    return dbEmployeeToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    // 소유권 확인
    const { data: emp } = await supabase.from('employees').select('id').eq('id', id).eq('user_id', userId).single();
    if (!emp) throw new Error('삭제 권한이 없거나 존재하지 않는 직원입니다.');
    // 관련 데이터 cascade 삭제 (FK CASCADE가 없는 경우 대비)
    await supabase.from('attendance').delete().eq('employee_id', id).eq('user_id', userId);
    await supabase.from('payrolls').delete().eq('employee_id', id).eq('user_id', userId);
    const { error } = await supabase.from('employees').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '직원 삭제');
  },
  async bulkUpsert(arr) {
    const userId = await getUserId();
    const rows = arr.map(e => ({ ...storeEmployeeToDb(e), user_id: userId }));
    const { data, error } = await supabase.from('employees')
      .upsert(rows, { onConflict: 'user_id,emp_no' }).select();
    handleError(error, '직원 일괄 저장');
    return (data || []).map(dbEmployeeToStore);
  },
  /** 주민번호 평문 조회 (admin 전용, 소유권 검증 후 RPC 호출) */
  async getRRN(id) {
    const userId = await getUserId();
    // 이 직원이 현재 사용자 소유인지 먼저 확인
    const { data: emp } = await supabase.from('employees').select('id').eq('id', id).eq('user_id', userId).single();
    if (!emp) throw new Error('조회 권한이 없습니다.');
    const { data, error } = await supabase.rpc('decrypt_rrn', { emp_id: id });
    handleError(error, '주민번호 조회');
    return data;
  },
};

// ============================================================
// HR: 일별 근태
// ============================================================
export const attendance = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('attendance').select('*').eq('user_id', userId);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    if (options.from) query = query.gte('work_date', options.from);
    if (options.to)   query = query.lte('work_date', options.to);
    query = query.order('work_date', { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    handleError(error, '근태 조회');
    return (data || []).map(dbAttendanceToStore);
  },
  async create(rec) {
    const userId = await getUserId();
    const row = storeAttendanceToDb(rec);
    const { data, error } = await supabase.from('attendance')
      .upsert({ ...row, user_id: userId }, { onConflict: 'user_id,employee_id,work_date' })
      .select().single();
    handleError(error, '근태 저장');
    return dbAttendanceToStore(data);
  },
  async update(id, updates) {
    const row = storeAttendanceToDb(updates);
    const { data, error } = await supabase.from('attendance').update(row).eq('id', id).select().single();
    handleError(error, '근태 수정');
    return dbAttendanceToStore(data);
  },
  async remove(id) {
    const { error } = await supabase.from('attendance').delete().eq('id', id);
    handleError(error, '근태 삭제');
  },
  async bulkUpsert(arr) {
    const userId = await getUserId();
    const rows = arr.map(r => ({ ...storeAttendanceToDb(r), user_id: userId }));
    const { data, error } = await supabase.from('attendance')
      .upsert(rows, { onConflict: 'user_id,employee_id,work_date' }).select();
    handleError(error, '근태 일괄 저장');
    return (data || []).map(dbAttendanceToStore);
  },
};

// ============================================================
// HR: 월별 급여
// ============================================================
export const payrolls = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('payrolls').select('*').eq('user_id', userId);
    if (options.year)  query = query.eq('pay_year', options.year);
    if (options.month) query = query.eq('pay_month', options.month);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    query = query.order('pay_year', { ascending: false }).order('pay_month', { ascending: false });
    const { data, error } = await query;
    handleError(error, '급여 조회');
    return (data || []).map(dbPayrollToStore);
  },
  async create(p) {
    const userId = await getUserId();
    const row = storePayrollToDb(p);
    const { data, error } = await supabase.from('payrolls')
      .upsert({ ...row, user_id: userId }, { onConflict: 'user_id,pay_year,pay_month,employee_id' })
      .select().single();
    handleError(error, '급여 저장');
    return dbPayrollToStore(data);
  },
  async update(id, updates) {
    const row = storePayrollToDb(updates);
    const { data, error } = await supabase.from('payrolls').update(row).eq('id', id).select().single();
    handleError(error, '급여 수정');
    return dbPayrollToStore(data);
  },
  async remove(id) {
    const { error } = await supabase.from('payrolls').delete().eq('id', id);
    handleError(error, '급여 삭제');
  },
  async bulkUpsert(arr) {
    const userId = await getUserId();
    const rows = arr.map(r => ({ ...storePayrollToDb(r), user_id: userId }));
    const { data, error } = await supabase.from('payrolls')
      .upsert(rows, { onConflict: 'user_id,pay_year,pay_month,employee_id' }).select();
    handleError(error, '급여 일괄 저장');
    return (data || []).map(dbPayrollToStore);
  },
};

// ============================================================
// HR: 휴가
// ============================================================
export const leaves = {
  async list(options = {}) {
    const userId = await getUserId();
    let query = supabase.from('leaves').select('*').eq('user_id', userId);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    if (options.status) query = query.eq('status', options.status);
    query = query.order('start_date', { ascending: false });
    const { data, error } = await query;
    handleError(error, '휴가 조회');
    return (data || []).map(dbLeaveToStore);
  },
  async create(l) {
    const userId = await getUserId();
    const row = storeLeaveToDb(l);
    const { data, error } = await supabase.from('leaves').insert({ ...row, user_id: userId }).select().single();
    handleError(error, '휴가 신청');
    return dbLeaveToStore(data);
  },
  async update(id, updates) {
    const row = storeLeaveToDb(updates);
    const { data, error } = await supabase.from('leaves').update(row).eq('id', id).select().single();
    handleError(error, '휴가 수정');
    return dbLeaveToStore(data);
  },
  async remove(id) {
    const { error } = await supabase.from('leaves').delete().eq('id', id);
    handleError(error, '휴가 삭제');
  },
};

// ============================================================
// HR: 수당·공제 마스터
// ============================================================
export const salaryItems = {
  async list() {
    const userId = await getUserId();
    const { data, error } = await supabase.from('salary_items').select('*').eq('user_id', userId).order('sort_order');
    handleError(error, '수당/공제 조회');
    return data || [];
  },
  async create(item) {
    const userId = await getUserId();
    const { data, error } = await supabase.from('salary_items').insert({ ...item, user_id: userId }).select().single();
    handleError(error, '수당/공제 생성');
    return data;
  },
  async update(id, updates) {
    const { data, error } = await supabase.from('salary_items').update(updates).eq('id', id).select().single();
    handleError(error, '수당/공제 수정');
    return data;
  },
  async remove(id) {
    const { error } = await supabase.from('salary_items').delete().eq('id', id);
    handleError(error, '수당/공제 삭제');
  },
};

// ============================================================
// 전체 데이터 로드 (초기화용) — store.js 호환
// 왜? → 기존 getState()가 전체 데이터를 메모리에 갖고 있는 구조라서
// → 점진적 전환을 위해 한번에 전체 로딩 후 캐시하는 함수 제공
// ============================================================
export async function loadAllData() {
  const [
    itemsData,
    txData,
    vendorsData,
    transfersData,
    stocktakeData,
    auditData,
    accountData,
    orderData,
    posData,
    fieldData,
    settingsData,
  ] = await Promise.all([
    items.list(),
    transactions.list(),
    vendors.list(),
    transfers.list(),
    stocktakes.list(),
    auditLogs.list({ limit: 200 }),
    accountEntries.list(),
    purchaseOrders.list(),
    posSales.list({ limit: 1000 }),
    customFields.list(),
    settings.getAll(),
  ]);

  // 기존 store.js의 state 형태로 변환
  // 왜 이렇게? → 60개 페이지 파일이 getState()를 쓰고 있어서
  // 한번에 전부 바꾸기보다 점진적으로 전환하기 위해
  return {
    mappedData: itemsData.map(dbItemToStoreItem),
    transactions: txData.map(dbTxToStoreTx),
    vendorMaster: vendorsData.map(dbVendorToStore),
    transfers: transfersData,
    stocktakeHistory: stocktakeData,
    auditLogs: auditData,
    accountEntries: accountData,
    purchaseOrders: orderData,
    posData: posData,
    customFields: fieldData,
    // 설정값
    safetyStock: settingsData.safetyStock || {},
    beginnerMode: settingsData.beginnerMode ?? true,
    dashboardMode: settingsData.dashboardMode || 'executive',
    visibleColumns: settingsData.visibleColumns || null,
    inventoryViewPrefs: settingsData.inventoryViewPrefs || {},
    inoutViewPrefs: settingsData.inoutViewPrefs || {},
    tableSortPrefs: settingsData.tableSortPrefs || {},
    industryTemplate: settingsData.industryTemplate || 'general',
    costMethod: settingsData.costMethod || 'weighted-avg',
    currency: settingsData.currency || { code: 'KRW', symbol: '₩', rate: 1 },
  };
}

// ============================================================
// 현재 사용자 데이터 전체 삭제 (설정 페이지 전체초기화용)
// ============================================================
export async function clearAllUserData() {
  const userId = await getUserId();
  const tableNames = [
    'transactions',
    'transfers',
    'stocktakes',
    'audit_logs',
    'account_entries',
    'purchase_orders',
    'pos_sales',
    'custom_fields',
    'items',
    'vendors',
    'employees',
    'attendance',
    'payrolls',
    'leaves',
    'salary_items',
    'user_settings',
  ];

  const failures = [];
  for (const tableName of tableNames) {
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq('user_id', userId);
    if (error) failures.push({ tableName, error });
  }

  if (failures.length > 0) {
    const tableSummary = failures.map((entry) => entry.tableName).join(', ');
    throw new Error(`클라우드 초기화 실패: ${tableSummary}`);
  }
}

// ============================================================
// DB ↔ Store 변환 유틸
// DB는 snake_case, 기존 store는 camelCase라서 변환 필요
// ============================================================
function dbItemToStoreItem(dbItem) {
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
    warehouse: dbItem.warehouse,
    location: dbItem.location,
    vendor: dbItem.vendor,
    minStock: dbItem.min_stock,
    expiryDate: dbItem.expiry_date,
    lotNumber: dbItem.lot_number,
    memo: dbItem.memo,
    ...(dbItem.extra || {}),
  };
}

export function storeItemToDb(storeItem) {
  const { _id, itemName, itemCode, unitPrice, supplyValue, totalPrice,
    salePrice, minStock, expiryDate, lotNumber, ...rest } = storeItem;

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
    ...((_id) ? { id: _id } : {}),
    item_name: itemName,
    item_code: itemCode,
    unit_price: unitPrice,
    supply_value: supplyValue,
    total_price: totalPrice,
    sale_price: salePrice,
    min_stock: minStock,
    expiry_date: expiryDate,
    lot_number: lotNumber,
    extra,
    ...known,
  };
}

function dbTxToStoreTx(dbTx) {
  return {
    id: dbTx.id,
    type: dbTx.type,
    itemName: dbTx.item_name,
    quantity: dbTx.quantity,
    unitPrice: dbTx.unit_price,
    date: dbTx.date,
    vendor: dbTx.vendor,
    warehouse: dbTx.warehouse,
    note: dbTx.note,
  };
}

function dbVendorToStore(dbVendor) {
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
function dbEmployeeToStore(r) {
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
    accountNo: r.account_no,
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

function storeEmployeeToDb(e) {
  const out = {};
  if (e.id) out.id = e.id;
  if ('empNo' in e) out.emp_no = e.empNo;
  if ('name' in e) out.name = e.name;
  if ('dept' in e) out.dept = e.dept;
  if ('position' in e) out.position = e.position;
  if ('hireDate' in e) out.hire_date = e.hireDate;
  if ('resignDate' in e) out.resign_date = e.resignDate;
  if ('rrnMask' in e) out.rrn_mask = e.rrnMask;
  if ('phone' in e) out.phone = e.phone;
  if ('email' in e) out.email = e.email;
  if ('address' in e) out.address = e.address;
  if ('bank' in e) out.bank = e.bank;
  if ('accountNo' in e) out.account_no = e.accountNo;
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

function dbAttendanceToStore(r) {
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

function storeAttendanceToDb(a) {
  const out = {};
  if (a.id) out.id = a.id;
  if ('employeeId' in a) out.employee_id = a.employeeId;
  if ('workDate' in a) out.work_date = a.workDate;
  if ('checkIn' in a) out.check_in = a.checkIn;
  if ('checkOut' in a) out.check_out = a.checkOut;
  if ('breakMin' in a) out.break_min = a.breakMin;
  if ('workMin' in a) out.work_min = a.workMin;
  if ('overtimeMin' in a) out.overtime_min = a.overtimeMin;
  if ('nightMin' in a) out.night_min = a.nightMin;
  if ('holidayMin' in a) out.holiday_min = a.holidayMin;
  if ('status' in a) out.status = a.status;
  if ('note' in a) out.note = a.note;
  return out;
}

function dbPayrollToStore(r) {
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

function storePayrollToDb(p) {
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
  if ('paidAt' in p) out.paid_at = p.paidAt;
  if ('confirmedBy' in p) out.confirmed_by = p.confirmedBy;
  if ('confirmedAt' in p) out.confirmed_at = p.confirmedAt;
  if ('issueNo' in p) out.issue_no = p.issueNo;
  return out;
}

function dbLeaveToStore(r) {
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

function storeLeaveToDb(l) {
  const out = {};
  if (l.id) out.id = l.id;
  if ('employeeId' in l) out.employee_id = l.employeeId;
  if ('leaveType' in l) out.leave_type = l.leaveType;
  if ('startDate' in l) out.start_date = l.startDate;
  if ('endDate' in l) out.end_date = l.endDate;
  if ('days' in l) out.days = l.days;
  if ('reason' in l) out.reason = l.reason;
  if ('status' in l) out.status = l.status;
  if ('approvedBy' in l) out.approved_by = l.approvedBy;
  if ('approvedAt' in l) out.approved_at = l.approvedAt;
  return out;
}
