/**
 * db/rolePermissions.js — 역할별 권한 행렬 CRUD
 *
 * role_permissions 테이블:
 *   user_id, role ('admin'|'manager'|'staff'|'viewer'), permissions (JSONB { pageId: boolean })
 *   UNIQUE(user_id, role) → upsert로 관리
 */

import { supabase } from '../supabase-client.js';
import { getUserId, handleError } from './core.js';

/**
 * 기본 권한 정의 — DB에 저장된 값이 없을 때 사용
 * HR/급여 페이지는 admin만 기본 true, 나머지는 false
 */
export const DEFAULT_ROLE_PERMISSIONS = {
  admin: {
    // 재고 관리
    dashboard: true, inventory: true, 'in': true, ledger: true,
    transfer: true, stocktake: true, bulk: true, scanner: true, labels: true,
    // 거래처·창고
    vendors: true, warehouses: true, orders: true,
    // 보고·분석
    summary: true, costing: true, profit: true, accounts: true, documents: true, auditlog: true,
    // 인사·급여 🔒
    'hr-dashboard': true, employees: true, attendance: true, payroll: true,
    leaves: true, severance: true, 'yearend-settlement': true,
    // 시스템
    settings: true, team: true, roles: true, backup: true,
  },
  manager: {
    dashboard: true, inventory: true, 'in': true, ledger: true,
    transfer: true, stocktake: true, bulk: false, scanner: true, labels: true,
    vendors: true, warehouses: true, orders: true,
    summary: true, costing: true, profit: true, accounts: true, documents: true, auditlog: false,
    // 매니저는 근태/휴가만 접근
    'hr-dashboard': false, employees: false, attendance: true, payroll: false,
    leaves: true, severance: false, 'yearend-settlement': false,
    settings: false, team: false, roles: false, backup: false,
  },
  staff: {
    dashboard: true, inventory: true, 'in': true, ledger: true,
    transfer: false, stocktake: false, bulk: false, scanner: true, labels: true,
    vendors: false, warehouses: false, orders: false,
    summary: false, costing: false, profit: false, accounts: false, documents: false, auditlog: false,
    // 직원은 HR 전체 차단
    'hr-dashboard': false, employees: false, attendance: false, payroll: false,
    leaves: true, severance: false, 'yearend-settlement': false,
    settings: false, team: false, roles: false, backup: false,
  },
  viewer: {
    dashboard: true, inventory: true, 'in': false, ledger: true,
    transfer: false, stocktake: false, bulk: false, scanner: false, labels: false,
    vendors: false, warehouses: false, orders: false,
    summary: true, costing: false, profit: false, accounts: false, documents: false, auditlog: false,
    // 열람자는 HR 전체 차단
    'hr-dashboard': false, employees: false, attendance: false, payroll: false,
    leaves: false, severance: false, 'yearend-settlement': false,
    settings: false, team: false, roles: false, backup: false,
  },
};

export const rolePermissions = {
  /**
   * 현재 사용자의 모든 역할 권한 로드
   * @returns {Object} { admin: {...}, manager: {...}, staff: {...}, viewer: {...} }
   */
  async loadAll() {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from('role_permissions')
      .select('role, permissions')
      .eq('user_id', userId);
    handleError(error, '권한 행렬 조회');

    // DB 데이터 + 기본값 병합 (없는 역할은 기본값으로 채움)
    const result = {};
    const ROLES = ['admin', 'manager', 'staff', 'viewer'];
    for (const role of ROLES) {
      const dbRow = (data || []).find(r => r.role === role);
      result[role] = dbRow?.permissions
        ? { ...DEFAULT_ROLE_PERMISSIONS[role], ...dbRow.permissions }
        : { ...DEFAULT_ROLE_PERMISSIONS[role] };
    }
    return result;
  },

  /**
   * 특정 역할의 권한 저장 (upsert)
   * @param {string} role - 'admin' | 'manager' | 'staff' | 'viewer'
   * @param {Object} permissions - { pageId: boolean, ... }
   */
  async save(role, permissions) {
    const userId = await getUserId();
    const { error } = await supabase
      .from('role_permissions')
      .upsert({ user_id: userId, role, permissions }, { onConflict: 'user_id,role' });
    handleError(error, '권한 저장');
  },

  /**
   * 모든 역할 권한 일괄 저장
   * @param {Object} allPerms - { admin: {...}, manager: {...}, staff: {...}, viewer: {...} }
   */
  async saveAll(allPerms) {
    const userId = await getUserId();
    const rows = Object.entries(allPerms).map(([role, permissions]) => ({
      user_id: userId, role, permissions,
    }));
    const { error } = await supabase
      .from('role_permissions')
      .upsert(rows, { onConflict: 'user_id,role' });
    handleError(error, '권한 일괄 저장');
  },
};
