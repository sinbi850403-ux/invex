/**
 * MappingPage.jsx — 품목 엑셀 가져오기 2단계
 * 흐름: 컬럼 매핑 확인/수정 → 미리보기 → bulkUpsert 저장 → 재고 현황으로 이동
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ERP_FIELDS, autoMap, buildMappedData } from '../domain/excelFieldMap.ts';
import { buildUploadDiff } from '../domain/uploadDiff.ts';
import { items as itemsDb } from '../db.js';
import { dbItemToStoreItem } from '../db/converters.js';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';

const PREVIEW_ROWS = 5;

function indexToColLabel(idx) {
  // 0→A, 1→B, ... 25→Z, 26→AA
  let label = '';
  let n = idx;
  while (true) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    if (n < 26) break;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

function toDbRow(m) {
  const s = (v) => String(v || '').trim() || null;
  const n = (v) => {
    const x = parseFloat(String(v || '').replace(/,/g, ''));
    return isNaN(x) ? null : x;
  };
  return {
    item_name:    s(m.itemName),
    item_code:    s(m.itemCode),
    category:     s(m.category),
    spec:         s(m.spec),
    color:        s(m.color),
    vendor:       s(m.vendor),
    quantity:     n(m.quantity) ?? 0,
    unit:         s(m.unit) || 'EA',
    unit_price:   n(m.unitPrice),
    sale_price:   n(m.salePrice),
    supply_value: n(m.supplyValue),
    vat:          n(m.vat),
    total_price:  n(m.totalPrice),
    warehouse:    s(m.warehouse),
    expiry_date:  s(m.expiryDate),
    lot_number:   s(m.lotNumber),
    memo:         s(m.note),
    min_stock:    n(m.safetyStock),
  };
}

export default function MappingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [, setState] = useStore();

  // location.state에서 rows, fileName 수신
  const locationState = location.state;

  const rows = locationState?.rows;       // 2D 배열: rows[0]=헤더, rows[1..]=데이터
  const fileName = locationState?.fileName || '';

  // state가 없으면 UploadPage로 redirect
  useEffect(() => {
    if (!rows) {
      navigate('/upload', { replace: true });
    }
  }, [rows, navigate]);

  const headers = rows ? (rows[0] || []) : [];
  const dataRows = rows ? rows.slice(1) : [];

  const [mapping, setMapping] = useState(() => autoMap(headers));
  const [isImporting, setIsImporting] = useState(false);

  // 헤더가 바뀌면 자동 매핑 재실행
  useEffect(() => {
    if (headers.length > 0) {
      setMapping(autoMap(headers));
    }
  }, [headers.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // 미리보기 데이터 (상위 5행)
  const previewMapped = useMemo(
    () => buildMappedData(dataRows.slice(0, PREVIEW_ROWS), mapping),
    [dataRows, mapping]
  );

  // 유효 행 수 (itemName이 있는 것)
  const validCount = useMemo(() => {
    const allMapped = buildMappedData(dataRows, mapping);
    return allMapped.filter((r) => String(r.itemName || '').trim()).length;
  }, [dataRows, mapping]);

  const handleMappingChange = (fieldKey, colIdxStr) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (colIdxStr === '') {
        delete next[fieldKey];
      } else {
        next[fieldKey] = parseInt(colIdxStr, 10);
      }
      return next;
    });
  };

  const handleImport = async () => {
    // 필수 필드 검증
    const missing = ERP_FIELDS.filter((f) => f.required && mapping[f.key] === undefined).map((f) => f.label);
    if (missing.length > 0) {
      showToast(`필수 항목을 연결해 주세요: ${missing.join(', ')}`, 'warning');
      return;
    }

    const allMapped = buildMappedData(dataRows, mapping);
    const validRows = allMapped.filter((r) => String(r.itemName || '').trim());

    if (validRows.length === 0) {
      showToast('가져올 품목이 없습니다. 품목명 열을 확인해 주세요.', 'warning');
      return;
    }

    setIsImporting(true);
    try {
      const dbRows = validRows.map(toDbRow);
      const result = await itemsDb.bulkUpsert(dbRows);

      // 저장 후 전체 목록 다시 로드
      const listResult = await itemsDb.list();
      const storeItems = (listResult || []).map(dbItemToStoreItem);

      // diff 계산 (이전 데이터와 비교)
      // 이전 데이터는 없으므로 새 데이터 기준으로만 계산
      const diff = buildUploadDiff([], validRows, fileName);

      setState({ mappedData: storeItems });

      showToast(
        `${validRows.length}개 품목을 가져왔습니다. (신규 ${diff.added}건 / 수정 ${diff.updated}건)`,
        'success'
      );
      navigate('/inventory');
    } catch (err) {
      showToast('가져오기 중 오류가 발생했습니다: ' + (err?.message || String(err)), 'error');
    } finally {
      setIsImporting(false);
    }
  };

  if (!rows) return null; // redirect 처리 중

  // 미리보기에 표시할 필드 (매핑된 것 우선, 상위 6개)
  const previewFields = ERP_FIELDS.filter((f) => mapping[f.key] !== undefined).slice(0, 6);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="title-icon">🔗</span> 컬럼 매핑
          </h1>
          <div className="page-desc">엑셀 열과 ERP 항목을 연결합니다.</div>
        </div>
      </div>

      {/* 진행 단계 */}
      <div className="steps">
        <div className="step done">
          <span className="step-num">✓</span> 파일 올리기
        </div>
        <div className="step active">
          <span className="step-num">2</span> 컬럼 매핑
        </div>
        <div className="step">
          <span className="step-num">3</span> 가져오기 완료
        </div>
      </div>

      {/* 파일 정보 */}
      <div className="alert alert-info">
        파일: <strong>{fileName}</strong>
        &nbsp;|&nbsp;
        {dataRows.length}행 감지
        &nbsp;|&nbsp;
        유효 품목: <strong>{validCount}건</strong>
      </div>

      {/* 컬럼 매핑 */}
      <div className="card">
        <div className="card-title">
          필드 연결
          <span className="card-subtitle" style={{ marginLeft: '8px' }}>
            비슷한 이름은 자동으로 연결됩니다
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '8px',
          }}
        >
          {ERP_FIELDS.map((field) => {
            const selectedIdx = mapping[field.key];
            const preview =
              selectedIdx !== undefined ? (dataRows[0]?.[selectedIdx] ?? '') : '';

            return (
              <div
                key={field.key}
                className="mapping-row"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <span className="mapping-label" style={{ minWidth: '110px', flexShrink: 0 }}>
                  {field.label}
                  {field.required && (
                    <span style={{ color: 'var(--danger)' }}> *</span>
                  )}
                </span>
                <select
                  className="mapping-select"
                  value={selectedIdx !== undefined ? selectedIdx : ''}
                  onChange={(e) => handleMappingChange(field.key, e.target.value)}
                >
                  <option value="">-- 선택 안 함 --</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {indexToColLabel(i)}열: {h || `(빈 열)`}
                    </option>
                  ))}
                </select>
                {preview !== '' && preview !== null && preview !== undefined && (
                  <span
                    className="mapping-preview"
                    style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}
                    title={String(preview)}
                  >
                    예: {String(preview).slice(0, 12)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 미리보기 (상위 5행) */}
      {previewFields.length > 0 && (
        <div className="card" style={{ marginTop: '16px' }}>
          <div className="card-title">
            미리보기
            <span className="card-subtitle" style={{ marginLeft: '8px' }}>
              상위 {PREVIEW_ROWS}행
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>#</th>
                  {previewFields.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewMapped.map((row, ri) => (
                  <tr key={ri}>
                    <td className="col-num">{ri + 1}</td>
                    {previewFields.map((f) => (
                      <td key={f.key}>{String(row[f.key] ?? '')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', marginTop: '16px' }}>
        <button
          className="btn btn-outline"
          onClick={() => navigate('/upload')}
          disabled={isImporting}
        >
          ← 파일 다시 선택
        </button>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleImport}
          disabled={isImporting || validCount === 0}
        >
          {isImporting ? '가져오는 중...' : `가져오기 (${validCount}건) →`}
        </button>
      </div>
    </div>
  );
}
