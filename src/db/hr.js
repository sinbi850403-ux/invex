/**
 * db/hr.js — HR: 직원, 근태, 급여, 휴가, 수당/공제 마스터
 */

import { supabase } from '../supabase-client.js';
import { getUserId, withDbTimeout, handleError } from './core.js';
import {
  dbEmployeeToStore, storeEmployeeToDb,
  dbAttendanceToStore, storeAttendanceToDb,
  dbPayrollToStore, storePayrollToDb,
  dbLeaveToStore, storeLeaveToDb,
} from './converters.js';

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
    const userId = await getUserId();
    const rrnPlain = updates._rrnPlain;
    const row = storeEmployeeToDb(updates);
    const { data, error } = await supabase.from('employees').update(row).eq('id', id).eq('user_id', userId).select().single();
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

  async setAccountNo(id, plain) {
    const userId = await getUserId();
    const { data: emp } = await supabase.from('employees').select('id').eq('id', id).eq('user_id', userId).single();
    if (!emp) throw new Error('권한이 없거나 존재하지 않는 직원입니다.');
    const { error } = await supabase.rpc('set_employee_account_no', { emp_id: id, plain: plain ?? '' });
    handleError(error, '계좌번호 암호화');
  },

  async getAccountNo(id) {
    const userId = await getUserId();
    const { data: emp } = await supabase.from('employees').select('id').eq('id', id).eq('user_id', userId).single();
    if (!emp) throw new Error('조회 권한이 없습니다.');
    const { data, error } = await supabase.rpc('decrypt_account_no', { emp_id: id });
    handleError(error, '계좌번호 조회');
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
    const userId = await getUserId();
    const row = storeAttendanceToDb(updates);
    const { data, error } = await supabase.from('attendance').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '근태 수정');
    return dbAttendanceToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('attendance').delete().eq('id', id).eq('user_id', userId);
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
    const year  = options.payYear  ?? options.year;
    const month = options.payMonth ?? options.month;
    if (year)  query = query.eq('pay_year', year);
    if (month) query = query.eq('pay_month', month);
    if (options.status) query = query.eq('status', options.status);
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
    const userId = await getUserId();
    const row = storePayrollToDb(updates);
    const { data, error } = await supabase.from('payrolls').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '급여 수정');
    return dbPayrollToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('payrolls').delete().eq('id', id).eq('user_id', userId);
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
    const userId = await getUserId();
    const row = storeLeaveToDb(updates);
    const { data, error } = await supabase.from('leaves').update(row).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '휴가 수정');
    return dbLeaveToStore(data);
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('leaves').delete().eq('id', id).eq('user_id', userId);
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
    const userId = await getUserId();
    const { data, error } = await supabase.from('salary_items').update(updates).eq('id', id).eq('user_id', userId).select().single();
    handleError(error, '수당/공제 수정');
    return data;
  },
  async remove(id) {
    const userId = await getUserId();
    const { error } = await supabase.from('salary_items').delete().eq('id', id).eq('user_id', userId);
    handleError(error, '수당/공제 삭제');
  },
};
