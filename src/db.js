/**
 * db.js - Supabase 데이터 접근 레이어 (DAL)
 *
 * 왜 별도 레이어?
 * → 페이지 코드가 직접 SQL을 쓰면 유지보수 지옥
 * → db.items.list(), db.transactions.create() 같은 깔끔한 API 제공
 * → 나중에 DB를 바꿔도 이 파일만 수정하면 됨
 *
 * 구조: db.{테이블}.{동작}() — CRUD 패턴
 *
 * ※ 이 파일은 thin re-exporter입니다.
 *    실제 구현은 src/db/ 서브모듈에 있습니다.
 */

// Re-export everything so existing `import * as db from './db.js'` still works
export { setWorkspaceUserId, clearWorkspaceUserId, primeUserIdCache, getAuthUserId, getWorkspaceContextUserId } from './db/core.js';
export { storeItemToDb, storeVendorToDb } from './db/converters.js';
export { items }         from './db/items.js';
export { transactions }  from './db/transactions.js';
export { vendors }       from './db/vendors.js';
export { transfers, stocktakes, itemStocks, safetyStocks } from './db/inventory.js';
export { auditLogs, accountEntries, purchaseOrders, posSales } from './db/accounts.js';
export { settings, personalSettings, customFields } from './db/settings.js';
export { employees, attendance, payrolls, leaves, salaryItems } from './db/hr.js';
export { loadAllData, clearAllUserData } from './db/loader.js';
