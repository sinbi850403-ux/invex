/**
 * UploadPage.jsx — 품목 엑셀 가져오기 1단계
 * 흐름: 파일 선택/드래그 → 파싱 → 미리보기 → MappingPage로 이동
 */
import React, { useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../toast.js';
import { readExcelFile, downloadExcelSheets } from '../excel.js';

const MAX_FILE_SIZE_MB = 10;
const ALLOWED_EXTS = ['.xlsx', '.xls', '.csv'];
const PREVIEW_ROWS = 5;

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const zoneRef = useRef(null);

  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [allRows, setAllRows] = useState(null); // 전체 2D 배열 (헤더 포함)
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(async (file) => {
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      showToast('xlsx, xls, csv 파일만 지원합니다.', 'error');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`파일 크기가 ${MAX_FILE_SIZE_MB}MB를 초과합니다.`, 'error');
      return;
    }

    try {
      showToast('파일을 읽는 중...', 'info', 1500);
      const result = await readExcelFile(file);
      const sheetName = result.sheetNames[0];
      const rows = result.sheets[sheetName]; // 2D 배열, rows[0] = 헤더

      if (!rows || rows.length < 2) {
        showToast('파일에 데이터가 없거나 헤더만 있습니다.', 'warning');
        return;
      }

      const hdrs = rows[0];
      const dataRows = rows.slice(1);

      setFileName(file.name);
      setHeaders(hdrs);
      setPreviewRows(dataRows.slice(0, PREVIEW_ROWS));
      setTotalRows(dataRows.length);
      setAllRows(rows);
    } catch (err) {
      showToast('파일을 읽는 중 오류가 발생했습니다: ' + err.message, 'error');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleNext = () => {
    if (!allRows) return;
    navigate('/mapping', { state: { rows: allRows, fileName } });
  };

  const downloadTemplate = async () => {
    try {
      const headers = ['품목명', '품목코드', '분류', '규격', '색상', '거래처', '수량', '단위', '매입가', '판매가', '창고/위치', '안전재고', '비고'];
      const sample = [
        ['사과 후지 10kg', 'ITM001', '과일', '10kg', '홍', '(주)농협유통', 100, 'BOX', 8000, 12000, '창고A', 10, ''],
        ['배 신고 5kg', 'ITM002', '과일', '5kg', '황', '(주)농협유통', 50, 'BOX', 9000, 14000, '창고A', 5, ''],
      ];
      await downloadExcelSheets(
        [{ name: '품목 가져오기 양식', rows: [headers, ...sample] }],
        '품목_가져오기_양식'
      );
      showToast('양식 다운로드를 시작합니다.', 'success');
    } catch (err) {
      showToast('다운로드 중 오류가 발생했습니다.', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <span className="title-icon">📤</span> 품목 엑셀 가져오기
          </h1>
          <div className="page-desc">재고 데이터를 엑셀에서 한 번에 불러옵니다.</div>
        </div>
      </div>

      {/* 진행 단계 */}
      <div className="steps">
        <div className="step active">
          <span className="step-num">1</span> 파일 올리기
        </div>
        <div className="step">
          <span className="step-num">2</span> 컬럼 매핑
        </div>
        <div className="step">
          <span className="step-num">3</span> 가져오기 완료
        </div>
      </div>

      {/* 파일 드래그앤드롭 영역 */}
      <div className="card">
        <div
          ref={zoneRef}
          className={`upload-zone${isDragging ? ' dragover' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="icon">📂</div>
          <div className="label">파일을 드래그하거나 클릭하여 업로드</div>
          <div className="hint">xlsx, xls, csv · 최대 {MAX_FILE_SIZE_MB}MB</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files.length > 0) handleFile(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* INVEX 표준 양식 다운로드 */}
      <div className="card card-compact" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>INVEX 표준 양식</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              샘플 데이터가 포함된 엑셀 양식을 다운로드하여 작성 후 업로드하세요.
            </div>
          </div>
          <button className="btn btn-outline" onClick={downloadTemplate} style={{ whiteSpace: 'nowrap' }}>
            ⬇ 양식 다운로드
          </button>
        </div>
      </div>

      {/* 미리보기 (파일 업로드 후 표시) */}
      {allRows && (
        <div className="card" style={{ marginTop: '16px' }}>
          <div className="card-title">
            미리보기
            <span className="card-subtitle" style={{ marginLeft: '8px' }}>
              총 {totalRows}행 감지
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }}>#</th>
                  {headers.map((h, i) => (
                    <th key={i}>{h || `(${i + 1}열)`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, ri) => (
                  <tr key={ri}>
                    <td className="col-num">{ri + 1}</td>
                    {headers.map((_, ci) => (
                      <td key={ci}>{row[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalRows > PREVIEW_ROWS && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
              상위 {PREVIEW_ROWS}행만 표시 (전체 {totalRows}행)
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="btn btn-primary" onClick={handleNext}>
              다음: 컬럼 매핑 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
