import React, { useState, useRef, useCallback } from 'react';
import { readExcelFile, downloadExcel } from '../../excel.js';
import { showToast } from '../../toast.js';
import { vendors as vendorsDb } from '../../db.js';
import { storeVendorToDb, dbVendorToStore } from '../../db/converters.js';

// ─── 키워드 매핑 ─────────────────────────────────────────────────────────────

const VENDOR_FIELD_KEYWORDS = {
  name:        ['거래처명', '거래처', '업체명', '업체', '회사명', '상호', '이름'],
  type:        ['구분', '유형', '타입', 'type'],
  code:        ['거래처코드', '코드', 'code'],
  bizNumber:   ['사업자번호', '사업자등록번호', '사업자'],
  ceoName:     ['대표자', '대표', '대표자명'],
  bizType:     ['업태'],
  bizItem:     ['종목', '업종'],
  contactName: ['담당자', '담당자명', '담당'],
  phone:       ['연락처', '전화', '전화번호', 'tel', 'phone', '휴대폰'],
  email:       ['이메일', 'email', '메일'],
  fax:         ['팩스', 'fax'],
  address:     ['주소', '사업장주소', 'address'],
  paymentTerm: ['결제조건', '결제방법', '결제'],
  creditLimit: ['신용한도', '한도'],
  bankName:    ['은행', '은행명'],
  bankAccount: ['계좌번호', '계좌'],
  bankHolder:  ['예금주'],
  note:        ['비고', '메모', '참고', 'note'],
};

const FIELD_LABELS = {
  name:        '거래처명 *',
  type:        '구분',
  code:        '거래처코드',
  bizNumber:   '사업자번호',
  ceoName:     '대표자',
  bizType:     '업태',
  bizItem:     '종목',
  contactName: '담당자',
  phone:       '연락처',
  email:       '이메일',
  fax:         '팩스',
  address:     '주소',
  paymentTerm: '결제조건',
  creditLimit: '신용한도',
  bankName:    '은행',
  bankAccount: '계좌번호',
  bankHolder:  '예금주',
  note:        '비고',
};

const TYPE_VALUE_MAP = {
  '매입처': 'supplier', '공급처': 'supplier', '공급업체': 'supplier', '매입': 'supplier',
  '매출처': 'customer', '고객': 'customer', '고객사': 'customer', '매출': 'customer',
  '양방향': 'both', '공급+고객': 'both', '매입+매출': 'both',
  'supplier': 'supplier', 'customer': 'customer', 'both': 'both',
};

const PAYMENT_VALUE_MAP = {
  '현금': 'cash', '카드': 'card', '계좌이체': 'transfer', '이체': 'transfer',
  '30일': 'bill30', '60일': 'bill60', '90일': 'bill90', '위탁': 'consign',
};

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function autoMapHeaders(headers) {
  const mapping = {};
  headers.forEach((raw, idx) => {
    const h = String(raw ?? '').trim().toLowerCase();
    if (!h) return;
    for (const [field, keywords] of Object.entries(VENDOR_FIELD_KEYWORDS)) {
      if (mapping[field] != null) continue;
      if (keywords.some(kw => h.includes(kw.toLowerCase()))) {
        mapping[field] = idx;
      }
    }
  });
  return mapping;
}

function rowToVendor(row, mapping) {
  const get = (field) => {
    const idx = mapping[field];
    if (idx == null) return '';
    return String(row[idx] ?? '').trim();
  };

  const rawType = get('type');
  const type = TYPE_VALUE_MAP[rawType] || TYPE_VALUE_MAP[rawType.toLowerCase()] || 'supplier';

  const rawPayment = get('paymentTerm');
  const paymentTerm = PAYMENT_VALUE_MAP[rawPayment] || PAYMENT_VALUE_MAP[rawPayment.toLowerCase()] || rawPayment;

  return {
    name:        get('name'),
    type,
    code:        get('code'),
    bizNumber:   get('bizNumber'),
    ceoName:     get('ceoName'),
    bizType:     get('bizType'),
    bizItem:     get('bizItem'),
    contactName: get('contactName'),
    phone:       get('phone'),
    email:       get('email'),
    fax:         get('fax'),
    address:     get('address'),
    paymentTerm,
    creditLimit: get('creditLimit'),
    bankName:    get('bankName'),
    bankAccount: get('bankAccount'),
    bankHolder:  get('bankHolder'),
    note:        get('note'),
  };
}

// ─── 양식 다운로드 ────────────────────────────────────────────────────────────

function downloadTemplate() {
  const rows = [
    {
      '거래처명': '(주)예시상사', '구분': '매입처', '사업자번호': '123-45-67890',
      '대표자': '홍길동', '업태': '도소매', '종목': '건자재',
      '담당자': '김담당', '연락처': '02-1234-5678', '이메일': 'example@test.com',
      '주소': '서울시 강남구 테헤란로 123', '결제조건': '계좌이체',
      '은행': '국민은행', '계좌번호': '123-456-789012', '예금주': '(주)예시상사', '비고': '',
    },
  ];
  downloadExcel(rows, '거래처_가져오기_양식');
}

// ─── StepIndicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }) {
  const steps = ['파일 업로드', '컬럼 매핑', '미리보기 & 가져오기'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
      {steps.map((label, i) => {
        const num = i + 1;
        const active = step === num;
        const done = step > num;
        return (
          <React.Fragment key={num}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '13px', fontWeight: 700,
                background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-input)',
                color: (done || active) ? '#fff' : 'var(--text-muted)',
                flexShrink: 0,
              }}>
                {done ? '✓' : num}
              </div>
              <span style={{ fontSize: '13px', fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: '1px', background: 'var(--border)', minWidth: '16px' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function VendorImportModal({ vendors, onClose, onImported }) {
  const [step, setStep]         = useState(1);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [headers, setHeaders]   = useState([]);   // 엑셀 헤더 행
  const [dataRows, setDataRows] = useState([]);   // 엑셀 데이터 행 (2D)
  const [mapping, setMapping]   = useState({});   // { fieldKey: colIndex }
  const fileInputRef = useRef(null);

  // ── Step 1: 파일 처리 ──────────────────────────────────────────────────────

  const processFile = useCallback(async (file) => {
    setLoading(true);
    try {
      const { sheetNames, sheets } = await readExcelFile(file);
      const sheetName = sheetNames[0];
      const rows = sheets[sheetName] || [];
      if (rows.length < 2) {
        showToast('데이터가 없습니다. 헤더 행 + 데이터 행이 필요합니다.', 'warning');
        return;
      }
      const hdrs = rows[0].map(h => String(h ?? ''));
      const data = rows.slice(1);
      setHeaders(hdrs);
      setDataRows(data);
      setMapping(autoMapHeaders(hdrs));
      setStep(2);
    } catch (err) {
      showToast(err?.message || '파일을 읽을 수 없습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── Step 2: 매핑 변경 ──────────────────────────────────────────────────────

  const setFieldCol = (field, colIdx) => {
    setMapping(prev => {
      const next = { ...prev };
      if (colIdx === '') {
        delete next[field];
      } else {
        next[field] = Number(colIdx);
      }
      return next;
    });
  };

  // ── Step 3: 미리보기 데이터 ────────────────────────────────────────────────

  const previewVendors = dataRows.map(row => rowToVendor(row, mapping));
  const validVendors   = previewVendors.filter(v => v.name);
  const invalidCount   = previewVendors.length - validVendors.length;

  const existingNames = new Set(vendors.map(v => v.name));
  const dupVendors    = validVendors.filter(v => existingNames.has(v.name));
  const newVendors    = validVendors.filter(v => !existingNames.has(v.name));

  // ── 가져오기 실행 ──────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!newVendors.length) {
      showToast('가져올 새 거래처가 없습니다.', 'warning');
      return;
    }
    setLoading(true);
    const saved = [];
    let failCount = 0;
    for (const vendor of newVendors) {
      try {
        const payload = storeVendorToDb(vendor);
        const result  = await vendorsDb.create(payload);
        saved.push(result ? dbVendorToStore(result) : vendor);
      } catch {
        failCount++;
      }
    }
    setLoading(false);
    if (saved.length) {
      onImported(saved);
      showToast(`${saved.length}개 거래처를 가져왔습니다.${failCount ? ` (실패 ${failCount}건)` : ''}`, 'success');
    } else {
      showToast('가져오기에 실패했습니다.', 'error');
    }
  }, [newVendors, onImported]);

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="modal-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>거래처 엑셀 가져오기</h2>
          <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={onClose}>✕</button>
        </div>

        <StepIndicator step={step} />

        {/* 스크롤 영역 */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>

          {/* ── Step 1 ─────────────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              {/* 드래그앤드롭 영역 */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: '12px',
                  padding: '48px 24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: dragging ? 'var(--accent-alpha, rgba(99,102,241,0.05))' : 'var(--bg-input)',
                  transition: 'all 0.15s',
                  marginBottom: '16px',
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
                <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>
                  파일을 드래그하거나 클릭하여 업로드
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  xlsx, xls, csv 파일 지원 · 최대 10MB
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={handleFileInput}
                />
              </div>

              {/* 양식 다운로드 안내 */}
              <div className="card card-compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>INVEX 표준 양식</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    처음 가져오기를 사용한다면 양식을 다운로드하여 작성하세요.
                  </div>
                </div>
                <button className="btn btn-outline" style={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={downloadTemplate}>
                  양식 다운로드
                </button>
              </div>

              {loading && (
                <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '14px' }}>
                  파일을 읽는 중...
                </div>
              )}
            </div>
          )}

          {/* ── Step 2 ─────────────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                엑셀 헤더를 자동으로 분석했습니다. 열 매핑을 확인하고 필요한 경우 수정하세요.
                <strong style={{ color: 'var(--accent)' }}> 거래처명</strong>은 필수입니다.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{
                      fontSize: '12px', width: '100px', flexShrink: 0,
                      color: field === 'name' ? 'var(--text)' : 'var(--text-muted)',
                      fontWeight: field === 'name' ? 600 : 400,
                    }}>
                      {label}
                    </label>
                    <select
                      className="form-input"
                      style={{ flex: 1, fontSize: '12px', padding: '5px 8px' }}
                      value={mapping[field] ?? ''}
                      onChange={e => setFieldCol(field, e.target.value)}
                    >
                      <option value="">(매핑 없음)</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `열 ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3 ─────────────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              {/* 요약 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                {[
                  { label: '전체 행',    value: previewVendors.length, color: undefined },
                  { label: '가져올 건',  value: newVendors.length,     color: 'var(--success)' },
                  { label: '오류/중복',  value: invalidCount + dupVendors.length, color: invalidCount + dupVendors.length > 0 ? 'var(--warning)' : undefined },
                ].map(c => (
                  <div key={c.label} className="card card-compact" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>{c.label}</div>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>

              {dupVendors.length > 0 && (
                <div style={{ padding: '10px 12px', background: 'var(--bg-warning, rgba(234,179,8,0.08))', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: 'var(--warning, #ca8a04)' }}>
                  <strong>중복 거래처 {dupVendors.length}건</strong>은 건너뜁니다: {dupVendors.slice(0, 5).map(v => v.name).join(', ')}{dupVendors.length > 5 ? ' 외...' : ''}
                </div>
              )}

              {/* 미리보기 테이블 */}
              <div style={{ marginBottom: '6px', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                미리보기 (최대 5행)
              </div>
              <div className="table-wrapper" style={{ marginBottom: '4px' }}>
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>거래처명</th>
                      <th>구분</th>
                      <th>사업자번호</th>
                      <th>대표자</th>
                      <th>연락처</th>
                      <th>이메일</th>
                      <th style={{ width: '60px' }}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewVendors.slice(0, 5).map((v, i) => {
                      const isDup = existingNames.has(v.name);
                      const isErr = !v.name;
                      return (
                        <tr key={i} style={{ opacity: (isDup || isErr) ? 0.5 : 1 }}>
                          <td style={{ fontWeight: 600 }}>{v.name || <span style={{ color: 'var(--danger)' }}>(이름 없음)</span>}</td>
                          <td>{v.type}</td>
                          <td>{v.bizNumber || '-'}</td>
                          <td>{v.ceoName || '-'}</td>
                          <td>{v.phone || '-'}</td>
                          <td>{v.email || '-'}</td>
                          <td>
                            {isErr ? (
                              <span style={{ color: 'var(--danger)', fontSize: '11px' }}>오류</span>
                            ) : isDup ? (
                              <span style={{ color: 'var(--warning, #ca8a04)', fontSize: '11px' }}>중복</span>
                            ) : (
                              <span style={{ color: 'var(--success)', fontSize: '11px' }}>신규</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {previewVendors.length > 5 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  ... 외 {previewVendors.length - 5}건
                </div>
              )}
            </div>
          )}
        </div>

        {/* 하단 버튼 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            {step > 1 && (
              <button className="btn btn-outline" onClick={() => setStep(s => s - 1)} disabled={loading}>
                이전
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={loading}>취소</button>

            {step === 1 && (
              <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()} disabled={loading}>
                파일 선택
              </button>
            )}

            {step === 2 && (
              <button
                className="btn btn-primary"
                disabled={mapping.name == null || loading}
                onClick={() => setStep(3)}
              >
                다음: 미리보기
              </button>
            )}

            {step === 3 && (
              <button
                className="btn btn-primary"
                disabled={newVendors.length === 0 || loading}
                onClick={handleImport}
              >
                {loading ? '가져오는 중...' : `가져오기 (${newVendors.length}건)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
