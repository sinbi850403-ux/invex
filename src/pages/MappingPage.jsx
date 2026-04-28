/**
 * MappingPage.jsx - 데이터 확인(매핑) 페이지
 * 역할: 엑셀 컬럼을 ERP 필드에 자동/수동 매핑하고 미리보기
 */
import React, { useMemo, useEffect } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { indexToCol } from '../excel.js';
import { ERP_FIELDS, autoMap, buildMappedData } from '../domain/excelFieldMap.js';
import { applyAmountsAll } from '../domain/inventoryAmount.js';
import { useNavigate } from 'react-router-dom';

export default function MappingPage() {
  const [state, setState] = useStore();
  const navigate = useNavigate();

  const rawData = state.rawData || [];
  const mappedDataFallback = state.mappedData || [];
  const sheetNames = state.sheetNames || [];
  const activeSheet = state.activeSheet || '';
  const allSheets = state.allSheets || {};

  // rawData 없으면 fallback 뷰
  if (!rawData.length) {
    if (mappedDataFallback.length > 0) {
      const previewRows = mappedDataFallback.slice(0, 100);
      return (
        <div>
          <div className="page-header"><h1 className="page-title"> 데이터 확인</h1></div>
          <div className="alert alert-info">
            업로드 원본(rawData)이 없어 저장된 데이터 기준으로 표시합니다. 총 {mappedDataFallback.length}건
          </div>
          <div className="card">
            <div className="card-title">저장 데이터 미리보기 <span className="card-subtitle">처음 {previewRows.length}건</span></div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '36px' }}>#</th>
                    <th>품목명</th><th>품목코드</th><th>분류</th><th>거래처</th>
                    <th>수량</th><th>단위</th><th>매입가</th><th>판매가</th><th>창고/위치</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="col-num">{idx + 1}</td>
                      <td>{row?.itemName ?? ''}</td>
                      <td>{row?.itemCode ?? ''}</td>
                      <td>{row?.category ?? ''}</td>
                      <td>{row?.vendor ?? ''}</td>
                      <td>{row?.quantity ?? ''}</td>
                      <td>{row?.unit ?? ''}</td>
                      <td>{row?.unitPrice ?? ''}</td>
                      <td>{row?.salePrice ?? ''}</td>
                      <td>{row?.warehouse ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn btn-outline" onClick={() => navigate('/upload')}>파일 다시 업로드</button>
            <button className="btn btn-primary" onClick={() => navigate('/inventory')}>재고 현황 보기</button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <div className="page-header"><h1 className="page-title"> 데이터 확인</h1></div>
        <div className="card">
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">먼저 파일을 업로드해 주세요</div>
            <div className="sub">엑셀 파일을 올리면 자동으로 이 화면에서 데이터를 확인할 수 있습니다.</div>
            <br />
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>파일 업로드하러 가기</button>
          </div>
        </div>
      </div>
    );
  }

  const headers = rawData[0] || [];
  const dataRows = rawData.slice(1);
  const mapping = state.columnMapping || {};

  // 자동 매핑 초기화 (mapping이 비어있을 때만)
  useEffect(() => {
    if (Object.keys(mapping).length === 0 && headers.length > 0) {
      const autoMapped = autoMap(headers);
      setState({ columnMapping: autoMapped });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mappedColsSet = useMemo(() => new Set(Object.values(mapping)), [mapping]);

  const handleSheetChange = (e) => {
    const newSheet = e.target.value;
    setState({ activeSheet: newSheet, rawData: allSheets[newSheet] || [], columnMapping: {} });
    showToast(`"${newSheet}" 시트로 전환`, 'info');
  };

  const handleMappingChange = (fieldKey, colIdxStr) => {
    const cur = { ...mapping };
    if (colIdxStr === '') { delete cur[fieldKey]; } else { cur[fieldKey] = parseInt(colIdxStr); }
    setState({ columnMapping: cur });
  };

  const handleConfirm = () => {
    const missing = ERP_FIELDS.filter(f => f.required && mapping[f.key] === undefined).map(f => f.label);
    if (missing.length > 0) {
      showToast(`필수 항목: ${missing.join(', ')}`, 'warning');
      return;
    }
    const mappedData = applyAmountsAll(buildMappedData(dataRows, mapping));
    const uploadSafetyStock = { ...(state.safetyStock || {}) };
    mappedData.forEach(row => {
      if (row.safetyStock !== '' && row.safetyStock !== undefined && row.safetyStock !== null) {
        const val = parseFloat(row.safetyStock);
        if (!isNaN(val)) uploadSafetyStock[row.itemName] = val;
      }
    });
    setState({ mappedData, currentStep: 3, safetyStock: uploadSafetyStock });
    showToast(`${mappedData.length}건 저장 완료`, 'success');
    navigate('/inventory');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 데이터 확인</h1>
          <div className="page-desc">엑셀 컬럼과 ERP 항목을 연결합니다.</div>
        </div>
      </div>

      {/* 진행 단계 */}
      <div className="steps">
        <div className="step done"><span className="step-num"></span> 파일 올리기</div>
        <div className="step active"><span className="step-num">2</span> 컬럼 매핑</div>
        <div className="step"><span className="step-num">3</span> 확인 완료</div>
      </div>

      <div className="alert alert-info">
         <strong>{state.fileName}</strong> | {dataRows.length}건의 데이터
        {sheetNames.length > 1 && (
          <>
            {' '}| 시트:{' '}
            <select className="filter-select" value={activeSheet} onChange={handleSheetChange} style={{ marginLeft: '4px' }}>
              {sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </>
        )}
      </div>

      {/* 컬럼 매핑 */}
      <div className="card">
        <div className="card-title">컬럼 연결 <span className="card-subtitle">비슷한 이름은 자동으로 연결됩니다</span></div>
        <div id="mapping-list">
          {ERP_FIELDS.map(field => {
            const selectedIdx = mapping[field.key];
            const preview = selectedIdx !== undefined ? (dataRows[0]?.[selectedIdx] ?? '-') : '';
            return (
              <div key={field.key} className="mapping-row">
                <span className="mapping-label">
                  {field.label}{field.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                </span>
                <select
                  className="mapping-select"
                  value={selectedIdx !== undefined ? selectedIdx : ''}
                  onChange={e => handleMappingChange(field.key, e.target.value)}
                >
                  <option value="">-- 선택 안 함 --</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{indexToCol(i)}: {h || `(빈 열)`}</option>
                  ))}
                </select>
                <span className="mapping-preview" title={preview}>
                  {preview ? `예: ${preview}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 미리보기 */}
      <div className="card">
        <div className="card-title">데이터 미리보기 <span className="card-subtitle">처음 10건</span></div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '36px' }}>#</th>
                {headers.map((h, i) => (
                  <th key={i} title={`엑셀 ${indexToCol(i)}열`} style={mappedColsSet.has(i) ? { background: 'rgba(37,99,235,0.15)' } : {}}>
                    {h || `(${indexToCol(i)}열)`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.slice(0, 10).map((row, ri) => (
                <tr key={ri}>
                  <td className="col-num">{ri + 1}</td>
                  {headers.map((_, ci) => (
                    <td key={ci} style={mappedColsSet.has(ci) ? { background: 'rgba(37,99,235,0.15)' } : {}}>
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button className="btn btn-outline" onClick={() => navigate('/upload')}>← 다시 업로드</button>
        <button className="btn btn-success btn-lg" onClick={handleConfirm}> 매핑 확인 완료</button>
      </div>
    </div>
  );
}
