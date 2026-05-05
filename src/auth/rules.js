export const ROLE_ORDER = {
  viewer: 0,
  staff: 1,
  manager: 2,
  admin: 3,
  owner: 4,  // 워크스페이스 대표 — admin보다 높음 (모든 기능 접근 가능)
};

export const PLAN_ORDER = {
  free: 0,
  pro: 1,
  enterprise: 2,
};

export const ROLE_LABELS = {
  viewer: '열람(Viewer)',
  staff: '직원(Staff)',
  manager: '매니저(Manager)',
  admin: '관리자(Admin)',
};

export const PAGE_MIN_ROLE = {
  home: 'viewer',
  inventory: 'viewer',
  summary: 'viewer',
  ledger: 'viewer',
  dashboard: 'viewer',
  forecast: 'viewer',
  inout: 'staff',
  transfer: 'staff',
  scanner: 'staff',
  labels: 'staff',
  vendors: 'staff',
  upload: 'staff',
  mapping: 'staff',
  stocktake: 'manager',
  bulk: 'manager',
  costing: 'manager',
  accounts: 'manager',
  orders: 'manager',
  sales: 'manager',
  profit: 'manager',
  'weekly-report': 'manager',
  'tax-reports': 'manager',
  warehouses: 'admin',
  settings: 'admin',
  roles: 'admin',
  api: 'admin',
  team: 'admin',
  backup: 'admin',
  'hr-dashboard': 'manager',
  employees: 'staff',
  attendance: 'staff',
  payroll: 'admin',
  leaves: 'staff',
  severance: 'manager',
  'yearend-settlement': 'manager',
};

export const ACTION_MIN_ROLE = {
  'item:create': 'staff',
  'item:edit': 'staff',
  'item:delete': 'manager',
  'item:bulk': 'manager',
  'inout:create': 'staff',
  'inout:delete': 'manager',
  'inout:bulk': 'manager',
  'transfer:create': 'staff',
  'transfer:delete': 'manager',
  'stocktake:adjust': 'manager',
  'stocktake:complete': 'manager',
  'vendor:create': 'staff',
  'vendor:edit': 'staff',
  'vendor:delete': 'manager',
  'warehouse:create': 'admin',
  'warehouse:edit': 'admin',
  'warehouse:delete': 'admin',
  'settings:save': 'admin',
  'backup:restore': 'admin',
  'order:create': 'manager',
  'order:delete': 'manager',
  'payroll:confirm': 'admin',
  'payroll:export': 'admin',
  'payroll:email': 'admin',
  'employee:viewRRN': 'admin',
  'employee:bulkEdit': 'admin',
  'employee:create': 'manager',
  'employee:edit': 'manager',
  'employee:delete': 'admin',
  'attendance:edit': 'manager',
  'leave:approve': 'manager',
};

export function hasRequiredRole(currentRole, requiredRole) {
  return (ROLE_ORDER[currentRole] || 0) >= (ROLE_ORDER[requiredRole] || 0);
}

export function hasRequiredPlan(currentPlan, requiredPlan) {
  return (PLAN_ORDER[currentPlan] || 0) >= (PLAN_ORDER[requiredPlan] || 0);
}
