# 입출고 Excel 일괄 등록 — 검증 계획

## 1단계: 스키마 검증 ✅

### 1.1 Transactions 테이블 구조
```sql
-- schema.sql 라인 250-276
CREATE TABLE IF NOT EXISTS transactions (
  id                   UUID PRIMARY KEY,
  item_id              UUID REFERENCES items(id) ON DELETE SET NULL,    ✅ 존재
  item_name            TEXT NOT NULL,                                    ✅ 존재
  warehouse_id         UUID REFERENCES warehouses(id) ON DELETE SET NULL,✅ 존재
  warehouse            TEXT,                                             ✅ 레거시 텍스트
  type                 TEXT NOT NULL CHECK (type IN ('in', 'out', 'loss', 'adjust')),
  quantity             NUMERIC(15,4),
  unit_price           NUMERIC(15,2),
  ...
);
```

**결론**: ✅ item_id, warehouse_id 둘 다 FK 컬럼 존재

### 1.2 Item_Stocks 테이블 구조
```sql
-- schema.sql 라인 192-199
CREATE TABLE IF NOT EXISTS item_stocks (
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  user_id         UUID NOT NULL,
  quantity        NUMERIC(15,4) DEFAULT 0,
  PRIMARY KEY (item_id, warehouse_id)
);
```

**결론**: ✅ item_id + warehouse_id 복합 기본키

### 1.3 자동 갱신 트리거
```sql
-- schema.sql 라인 966-1029
CREATE OR REPLACE FUNCTION fn_update_item_stock()
  ...
  IF v_item_id IS NULL OR v_warehouse_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  -- item_id, warehouse_id가 둘 다 NOT NULL이어야만 트리거 실행
  ...

DROP TRIGGER IF EXISTS trg_update_item_stock ON transactions;
CREATE TRIGGER trg_update_item_stock
  AFTER INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_item_stock();
```

**결론**: ✅ 트리거가 transactions INSERT 시 item_stocks 자동 생성/업데이트

---

## 2단계: 코드 로직 검증 ✅

### 2.1 DB 변환기 (converters.js)
```javascript
// 라인 8-35: dbItemToStoreItem
export function dbItemToStoreItem(dbItem) {
  return {
    _id: dbItem.id,  // ✅ items.id → store._id
    itemName: dbItem.item_name,
    ...
  };
}

// 라인 70-96: dbTxToStoreTx
export function dbTxToStoreTx(dbTx) {
  return {
    itemId: dbTx.item_id,  // ✅ transactions.item_id → store.itemId
    itemName: dbTx.item_name,
    ...
  };
}
```

**결론**: ✅ _id, itemId 필드 정확히 변환

### 2.2 Excel 파서 (inoutExcelParser.js)
```javascript
// 라인 49: warehouse 컬럼 감지
warehouse: findCol('창고', '위치', '보관'),

// 라인 97: warehouse 값 추출
warehouse: colMap.warehouse >= 0 ? String(row[colMap.warehouse] ?? '').trim() : '',
```

**결론**: ✅ Excel 헤더에서 warehouse 컬럼 자동 감지

### 2.3 업로드 모달 (BulkUploadModal.jsx)
```javascript
// 라인 106: 사용자 가이드
"창고는 선택사항 — 비워두면 "본사 창고"로 자동 할당"

// 라인 81: 기본값 설정
warehouse: r.warehouse || '본사 창고'
```

**결론**: ✅ warehouse 기본값 '본사 창고' 설정

### 2.4 동기화 레이어 (supabaseSync.js)
```javascript
// 라인 125-134: warehouse 변환
const getWarehouseId = (warehouseName) => {
  if (!warehouseName) {
    return '80c5ae39-c6fb-4dbc-a18f-bca85ecf8930'; // 본사 창고 ID
  }
  const warehouse = (stateHolder.current.warehouses || []).find(w =>
    w.name === warehouseName
  );
  return warehouse ? warehouse.id : '80c5ae39-c6fb-4dbc-a18f-bca85ecf8930';
};

// 라인 137-147: item 변환 (신규) ✅
const getItemId = (itemName) => {
  if (!itemName) return null;
  const item = (stateHolder.current.mappedData || []).find(m =>
    m.itemName === itemName
  );
  return item ? item._id : null;
};

// 라인 148-158: 매핑
const newTxs = ... map(tx => ({
  item_id: getItemId(tx.itemName),        // ✅ 신규
  item_name: tx.itemName,
  warehouse_id: getWarehouseId(tx.warehouse), // ✅ 기존
  ...
}))
```

**결론**: ✅ item_id, warehouse_id 둘 다 변환하여 매핑

---

## 3단계: 데이터 흐름 검증

### 3.1 정상 흐름 (Happy Path)
```
1️⃣ Excel 파일 준비
   └─ 컬럼: 품명, 수량, 창고, ...
   └─ 예: "갤럭시 S25", 10, "본사 창고"

2️⃣ BulkUploadModal 업로드
   ├─ readExcelFile() → 엑셀 파싱
   ├─ buildColMap() → 헤더 매칭
   └─ parseExcelRows() → 데이터 행 추출
      └─ itemName: "갤럭시 S25" ✅
      └─ warehouse: "본사 창고" ✅

3️⃣ 사용자 [등록] 클릭
   └─ addTransactionsBulk(rows)
   └─ setState({ transactions: [...rows] })
   └─ scheduleSyncToSupabase(['transactions'])

4️⃣ supabaseSync.js (500ms 후)
   ├─ getItemId("갤럭시 S25")
   │  └─ mappedData에서 찾음 → item._id (UUID) ✅
   ├─ getWarehouseId("본사 창고")
   │  └─ warehouses에서 찾음 → warehouse.id (UUID) ✅
   └─ bulkCreate([{
        item_id: "80c5ae39-...-S25_uuid",  ✅ FK 값
        warehouse_id: "80c5ae39-...-창고uuid",✅ FK 값
        item_name: "갤럭시 S25",
        quantity: 10,
        ...
      }])

5️⃣ Supabase INSERT 실행
   ├─ transactions 행 생성 (item_id, warehouse_id 설정) ✅
   └─ Trigger fn_update_item_stock() 자동 실행
      └─ item_id ≠ NULL && warehouse_id ≠ NULL ✅
      └─ item_stocks upsert:
         INSERT INTO item_stocks(item_id, warehouse_id, user_id, quantity, ...)
           VALUES(S25_uuid, 창고uuid, user_id, 10, ...)
           ON CONFLICT (item_id, warehouse_id)
           DO UPDATE SET quantity = GREATEST(0, quantity + 10) ✅

6️⃣ 결과
   ├─ transactions: 1건 생성 (item_id, warehouse_id 설정) ✅
   ├─ item_stocks: (S25_uuid, 창고uuid) 행 생성/업데이트 ✅
   └─ 재고현황: 갤럭시 S25 본사 창고 = 10 ✅
```

### 3.2 에지 케이스 (Edge Cases)

#### Case A: 품목이 없는 경우
```
Excel: "존재하지 않는 상품명", 5, "본사 창고"
  ↓
getItemId("존재하지 않는 상품명")
  → mappedData에서 찾지 못함
  → return null ✅
  ↓
INSERT INTO transactions(item_id=NULL, warehouse_id, ...)
  ↓
Trigger fn_update_item_stock()
  IF v_item_id IS NULL OR v_warehouse_id IS NULL THEN RETURN; ✅
  → item_stocks 미생성 (이는 의도된 동작)
  → 거래 기록은 남음 (item_id=NULL)
```

**해석**: 
- 품목이 없으면 item_id = NULL로 저장
- item_stocks는 생성되지 않음 (재고 계산에 포함 안됨)
- 사용자는 경고를 받아야 함 (현재: 미구현 ⚠️)

#### Case B: 창고가 없는 경우
```
Excel: "갤럭시 S25", 5, "존재하지 않는 창고"
  ↓
getWarehouseId("존재하지 않는 창고")
  → warehouses에서 찾지 못함
  → return '80c5ae39-...-본사창고' (fallback) ✅
  ↓
INSERT INTO transactions(item_id, warehouse_id='본사창고_uuid', ...)
  ↓
item_stocks 생성: (S25_uuid, 본사창고_uuid) ✅
```

**해석**: 창고가 없으면 자동으로 본사 창고로 할당 ✅

#### Case C: warehouse 필드 비어있음
```
Excel: "갤럭시 S25", 5, ""
  ↓
BulkUploadModal: r.warehouse || '본사 창고'
  → "" (falsy) → '본사 창고' ✅
  ↓
getWarehouseId('본사 창고')
  → return '본사창고_uuid' ✅
```

**해석**: 빈 값도 자동으로 본사 창고 할당 ✅

---

## 4단계: 테스트 체크리스트

### 필수 검증 사항
- [ ] 현재 앱에 품목 있는가? (예: "갤럭시 S25")
- [ ] 현재 앱에 창고 있는가? (예: "본사 창고")
- [ ] Excel 파일 업로드 가능한가?
- [ ] 미리보기에서 매칭 표시되는가? ("매칭" vs "신규")

### Supabase 검증 (SQL Editor 실행)
```sql
-- 1. 최근 업로드한 트랜잭션 확인
SELECT id, item_id, item_name, warehouse_id, warehouse, quantity 
FROM transactions 
WHERE created_at > now() - interval '1 minute'
LIMIT 5;

-- 2. item_id가 실제로 채워졌는가?
SELECT COUNT(*) as total, 
       COUNT(item_id) as with_item_id,
       COUNT(CASE WHEN item_id IS NULL THEN 1 END) as null_item_id
FROM transactions;

-- 3. item_stocks이 생성되었는가?
SELECT item_id, warehouse_id, quantity 
FROM item_stocks 
ORDER BY last_updated_at DESC 
LIMIT 5;
```

---

## 5단계: 예상 결과

### 성공 시나리오 ✅
```
Excel: 
  품명         창고        수량
  갤럭시 S25   본사 창고   10
  아이폰 15    본사 창고   5
  (비워둠)             2  ← 자동으로 본사 창고 할당

After Upload:
  
  transactions 테이블:
  id | item_id | item_name | warehouse_id | quantity
  ---|---------|-----------|--------------|----------
  x1 | uuid-S25| 갤럭시 S25  | uuid-wh1     | 10
  x2 | uuid-i15| 아이폰 15   | uuid-wh1     | 5
  x3 | uuid-??  | ???       | uuid-wh1     | 2

  item_stocks 테이블:
  item_id   | warehouse_id | quantity
  ----------|--------------|----------
  uuid-S25  | uuid-wh1     | 10
  uuid-i15  | uuid-wh1     | 5
  uuid-??   | uuid-wh1     | 2
  (각각 자동 생성)
```

---

## 6단계: 결론

### 구현된 기능 ✅
1. ✅ warehouse 텍스트 → warehouse_id UUID 변환
2. ✅ item_name 텍스트 → item_id UUID 변환
3. ✅ warehouse 기본값 설정 ('본사 창고')
4. ✅ Excel 헤더 자동 감지
5. ✅ 트리거에 의한 자동 item_stocks 생성

### 미완료 사항 ⚠️
1. ⚠️ 품목 미매칭 경고 (item_id=NULL인 경우 사용자에게 알림)
2. ⚠️ 창고 미존재 경고 (자동 할당하지만 사용자에게 알림)

### 다음 단계
1. 위 테스트 체크리스트 실행
2. Supabase SQL Editor에서 검증 쿼리 실행
3. 문제 발견 시 로깅 및 수정

---

## 부록: 버그 추적 (Previous Issues)

| 문제 | 원인 | 해결 |
|------|------|------|
| item_id=NULL | getItemId 함수 미구현 | ✅ 완료 (커밋: 50dc613) |
| warehouse_id=NULL | 하드코딩된 UUID 미일치 | ✅ 해결 (본사 창고 ID 확인) |
| item_stocks INSERT 0 rows | item_id=NULL로 트리거 무시 | ✅ item_id 추가로 해결 |

