/**
 * UploadPage.jsx - 파일 업로드 페이지
 * 흐름: 파일 선택 → 엑셀 파싱 → 자동 매핑 → 바로 재고 현황으로 이동
 */
import React, { useRef, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { readExcelFile } from '../excel.js';
import { getState } from '../store.js';
import { downloadTemplate, getTemplateList } from '../excel-templates.js';
import { ERP_FIELDS, autoMap, buildMappedData } from '../domain/excelFieldMap.js';
import { applyAmountsAll } from '../domain/inventoryAmount.js';
import { buildUploadDiff } from '../domain/uploadDiff.js';
import { useNavigate } from 'react-router-dom';

export default function UploadPage() {
  const [state, setState] = useStore();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const zoneRef = useRef(null);

  const templates = getTemplateList();

  const handleFile = useCallback(async (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      showToast('지원하지 않는 파일 형식입니다.', 'error');
      return;
    }
    try {
      showToast('파일을 읽는 중...', 'info', 1500);
      const result = await readExcelFile(file);
      const activeSheet = result.sheetNames[0];
      const rawData = result.sheets[activeSheet];

      if (!rawData || rawData.length < 2) {
        showToast('파일에 데이터가 없거나 헤더만 있습니다.', 'warning');
        return;
      }

      const headers = rawData[0];
      const dataRows = rawData.slice(1);
      const mapping = autoMap(headers);
      const mappedData = applyAmountsAll(buildMappedData(dataRows, mapping));
      const mappedCount = Object.keys(mapping).length;

      const previousMappedData = (getState().mappedData || []).slice();
      const uploadDiff = buildUploadDiff(previousMappedData, mappedData, file.name);

      const uploadSafetyStock = { ...getState().safetyStock };
      mappedData.forEach(row => {
        if (row.safetyStock !== '' && row.safetyStock !== undefined && row.safetyStock !== null) {
          const val = parseFloat(row.safetyStock);
          if (!isNaN(val)) uploadSafetyStock[row.itemName] = val;
        }
      });

      setState({
        rawData,
        sheetNames: result.sheetNames,
        activeSheet,
        fileName: file.name,
        currentStep: 3,
        allSheets: result.sheets,
        columnMapping: mapping,
        mappedData,
        safetyStock: uploadSafetyStock,
        lastUploadDiff: uploadDiff,
      });

      showToast(`"${file.name}" → ${mappedData.length}건 등록 (${mappedCount}개 필드 자동 매핑)`, 'success');
      navigate('/inventory');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [setState, navigate]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    zoneRef.current?.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleClear = () => {
    setState({ rawData: null, mappedData: [], fileName: '' });
    showToast('이전 데이터를 초기화했습니다.', 'info');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 파일 업로드</h1>
          <div className="page-desc">엑셀 파일을 올리면 자동으로 데이터를 읽고 재고에 등록합니다.</div>
        </div>
      </div>

      {/* 진행 안내 */}
      <div className="steps">
        <div className="step active"><span className="step-num">1</span> 파일 올리기</div>
        <div className="step"><span className="step-num">2</span> 자동 매핑</div>
        <div className="step"><span className="step-num">3</span> 재고 확인</div>
      </div>

      <div className="card">
        <div
          ref={zoneRef}
          className="upload-zone"
          style={{ cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); zoneRef.current?.classList.add('dragover'); }}
          onDragLeave={() => zoneRef.current?.classList.remove('dragover')}
          onDrop={handleDrop}
        >
          <div className="icon"></div>
          <div className="label">엑셀 파일을 여기에 끌어다 놓거나 클릭하세요</div>
          <div className="hint">.xlsx, .xls, .csv 파일 지원 · 업로드 즉시 자동 매핑됩니다</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files.length > 0) handleFile(e.target.files[0]); }}
          />
        </div>
      </div>

      {/* 현재 불러온 파일 */}
      {state.fileName && (
        <div className="alert alert-info" style={{ marginTop: '16px' }}>
           현재 불러온 파일: <strong>{state.fileName}</strong>
          ({(state.mappedData || []).length}건 등록됨)
          <button className="btn btn-outline btn-sm" onClick={handleClear} style={{ marginLeft: '12px' }}>
            새 파일로 교체
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/inventory')} style={{ marginLeft: '4px' }}>
            재고 현황 보기 →
          </button>
        </div>
      )}

      {/* 엑셀 양식 다운로드 */}
      <div className="card" style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}> 엑셀 양식 다운로드</h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          업종에 맞는 양식을 다운받아 데이터를 입력하고 업로드하세요. 샘플 데이터가 포함되어 있습니다.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {templates.map(tpl => (
            <button
              key={tpl.key}
              className="template-card"
              title={tpl.desc}
              onClick={() => {
                downloadTemplate(tpl.key);
                showToast('엑셀 양식을 다운로드합니다 ', 'success');
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>{tpl.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tpl.desc}</div>
              <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '6px' }}>⬇ 다운로드</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
