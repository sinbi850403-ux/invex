/**
 * BackupPage.jsx - 데이터 백업/복원
 */
import React, { useRef, useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { getState } from '../store.js';
import { showToast } from '../toast.js';

/** 백업 파일 다운로드 */
function downloadBackup(data, label, onSuccess) {
  try {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const filename = `INVEX_${label}_${dateStr}.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onSuccess?.(now.toISOString(), filename);
    showToast(`${label} 다운로드 완료! (${filename})`, 'success');
  } catch (e) {
    showToast('백업 실패: ' + e.message, 'error');
  }
}

export default function BackupPage() {
  const [storeState, setStore] = useStore();
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const { items, transactions, vendors, lastBackup, sizeKB } = useMemo(() => {
    const s = storeState;
    const items = s.mappedData || [];
    const transactions = s.transactions || [];
    const vendors = s.vendorMaster || [];
    const lastBackup = s._lastBackup || null;
    const rough = JSON.stringify(s).length;
    const sizeKB = Math.round(rough / 1024);
    return { items, transactions, vendors, lastBackup, sizeKB };
  }, [storeState]);

  const handleDownload = (data, label) => {
    downloadBackup(data, label, (iso) => setStore({ _lastBackup: iso }));
  };

  const restoreFromFile = (file) => {
    if (!file.name.endsWith('.json')) {
      showToast('JSON 파일만 복원할 수 있습니다.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const keys = Object.keys(data);
        const validKeys = ['mappedData', 'transactions', 'vendorMaster', 'transfers', 'safetyStock', 'warehouses'];
        const hasValidData = keys.some(k => validKeys.includes(k));
        if (!hasValidData && !data.mappedData && !data.transactions) {
          showToast('올바른 INVEX 백업 파일이 아닙니다.', 'error');
          return;
        }
        const itemCount = (data.mappedData || []).length;
        const txCount = (data.transactions || []).length;
        const summary = `품목 ${itemCount}건, 거래이력 ${txCount}건`;
        if (!confirm(`다음 데이터를 복원하시겠습니까?\n\n${summary}\n\n 현재 데이터가 대체됩니다.`)) return;
        setStore(data);
        showToast(`복원 완료! (${summary})`, 'success');
      } catch (err) {
        showToast('파일 읽기 실패: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) restoreFromFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) restoreFromFile(file);
    e.target.value = '';
  };

  const sizeDisplay = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + 'MB' : sizeKB + 'KB';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">데이터 백업/복원</h1>
          <div className="page-desc">소중한 데이터를 안전하게 백업하고, 필요할 때 복원하세요.</div>
        </div>
      </div>

      {/* 현재 데이터 요약 */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">등록 품목</div>
          <div className="stat-value text-accent">{items.length}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">거래 이력</div>
          <div className="stat-value">{transactions.length}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">거래처</div>
          <div className="stat-value">{vendors.length}곳</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">데이터 크기</div>
          <div className="stat-value" style={{ fontSize: '18px' }}>{sizeDisplay}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        {/* 백업 */}
        <div className="card" style={{ borderTop: '3px solid var(--success)' }}>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}></div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>데이터 백업</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              현재 모든 데이터를 JSON 파일로 다운로드합니다.<br />
              정기적으로 백업하면 데이터 유실을 방지할 수 있습니다.
            </p>

            {lastBackup && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                마지막 백업: {new Date(lastBackup).toLocaleString('ko-KR')}
              </div>
            )}

            <button
              className="btn btn-success btn-lg"
              style={{ width: '100%' }}
              onClick={() => handleDownload(getState(), '전체백업')}
            >
               전체 백업 다운로드
            </button>

            <div style={{ marginTop: '12px' }}>
              <button className="btn btn-outline btn-sm" style={{ margin: '4px' }} onClick={() => handleDownload({ mappedData: items }, '품목백업')}>품목만</button>
              <button className="btn btn-outline btn-sm" style={{ margin: '4px' }} onClick={() => handleDownload({ transactions }, '거래이력백업')}>거래이력만</button>
              <button className="btn btn-outline btn-sm" style={{ margin: '4px' }} onClick={() => handleDownload({ vendorMaster: vendors }, '거래처백업')}>거래처만</button>
            </div>
          </div>
        </div>

        {/* 복원 */}
        <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}></div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>데이터 복원</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              이전에 백업한 JSON 파일을 업로드하여 데이터를 복원합니다.<br />
              <strong style={{ color: 'var(--danger)' }}> 복원 시 현재 데이터가 대체됩니다.</strong>
            </p>

            <div
              style={{
                border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: '12px', padding: '32px 16px',
                cursor: 'pointer', transition: 'all 0.2s', marginBottom: '16px',
                background: isDragging ? 'rgba(37,99,235,0.05)' : '',
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div style={{ fontSize: '24px', marginBottom: '8px' }}></div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                백업 파일을 여기에 드래그하거나<br />클릭하여 선택하세요
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>.json 파일만 지원</div>
            </div>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        </div>
      </div>

      {/* 백업 팁 */}
      <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid var(--accent)' }}>
        <div className="card-title"> 백업 가이드</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
          <ul style={{ margin: '0', paddingLeft: '16px' }}>
            <li>매주 1회 이상 정기 백업을 권장합니다</li>
            <li>중요한 변경 작업(일괄 등록, 수불관리 등) 전후에 백업하세요</li>
            <li>백업 파일은 안전한 클라우드(구글 드라이브, 네이버 클라우드 등)에 보관하세요</li>
            <li>로그인하면 클라우드에 자동 동기화되어 별도 백업 없이도 안전합니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
