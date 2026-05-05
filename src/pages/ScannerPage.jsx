/**
 * ScannerPage.jsx - 바코드/QR 스캔 입출고
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { createTransaction } from '../services/inoutService.js';

/* 스캔 확인 모달 */
function ScanConfirmModal({ payload, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" style={{ display: 'flex' }}>
      <div className="modal" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 className="modal-title">스캔 등록 확인</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gap: '10px' }}>
            <div><strong>{payload.item.itemName}</strong> ({payload.item.itemCode || '-'})</div>
            <div>유형: <strong>{payload.type === 'in' ? ' 입고' : ' 출고'}</strong></div>
            <div>수량: <strong>{payload.qty.toLocaleString('ko-KR')}개</strong></div>
            <div>기준 재고: {payload.currentQty.toLocaleString('ko-KR')}개 → {
              payload.type === 'in'
                ? (payload.currentQty + payload.qty).toLocaleString('ko-KR')
                : Math.max(0, payload.currentQty - payload.qty).toLocaleString('ko-KR')
            }개</div>
            <div>날짜: {payload.date}</div>
            {payload.note && <div>메모: {payload.note}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={onConfirm}>등록</button>
        </div>
      </div>
    </div>
  );
}

export default function ScannerPage() {
  const [state] = useStore();
  const items = state.mappedData || [];

  const [scanType, setScanType] = useState('in');
  const [scanHistory, setScanHistory] = useState([]);
  const [scanResult, setScanResult] = useState(null); // { item, qty, note }
  const [manualCode, setManualCode] = useState('');
  const [scanQty, setScanQty] = useState('1');
  const [scanNote, setScanNote] = useState('');
  const [confirmPayload, setConfirmPayload] = useState(null);
  const [scanning, setScanning] = useState(false);

  const scannerRef = useRef(null);
  const regionId = 'scanner-region';

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch (_) {}
      scannerRef.current = null;
    }
  }, []);

  // 페이지 언마운트 시 스캐너 정리
  useEffect(() => {
    return () => { stopScanner(); };
  }, [stopScanner]);

  const handleScanResult = useCallback((code) => {
    const matchedItem = items.find(item => item.itemCode === code || item.itemCode === code.trim());
    if (!matchedItem) {
      setScanResult({ notFound: true, code });
      return;
    }
    setScanResult({ item: matchedItem });
    setScanQty('1');
    setScanNote('');
  }, [items]);

  const handleStartScan = async () => {
    try {
      await stopScanner();
      scannerRef.current = new Html5Qrcode(regionId);
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => handleScanResult(decodedText),
        () => {}
      );
      setScanning(true);
      showToast('카메라 스캔을 시작합니다.', 'success');
    } catch (err) {
      showToast('카메라를 열 수 없습니다: ' + err.message, 'error');
    }
  };

  const handleStopScan = async () => {
    await stopScanner();
    setScanning(false);
    showToast('스캔을 중지했습니다.', 'info');
  };

  const handleManualSearch = () => {
    if (!manualCode.trim()) { showToast('코드를 입력해 주세요.', 'warning'); return; }
    handleScanResult(manualCode.trim());
    setManualCode('');
  };

  const handleRegister = () => {
    if (!scanResult?.item) return;
    const qty = parseFloat(scanQty);
    if (!qty || qty <= 0) { showToast('수량을 입력해 주세요.', 'warning'); return; }
    const currentQty = parseFloat(scanResult.item.quantity) || 0;
    if (scanType === 'out' && qty > currentQty) {
      showToast(`재고가 부족합니다. (현재 ${currentQty})`, 'error');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    setConfirmPayload({
      item: scanResult.item, qty, note: scanNote, type: scanType,
      date: today, currentQty,
    });
  };

  const handleConfirm = () => {
    const { item, qty, note, type, date } = confirmPayload;
    createTransaction({
      type,
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      quantity: qty,
      unitPrice: parseFloat(item.unitPrice) || 0,
      date,
      note: note ? `[스캔] ${note}` : '[스캔]',
    }, true);
    setScanHistory(prev => [{
      time: new Date().toLocaleTimeString('ko-KR'),
      type, name: item.itemName, code: item.itemCode, qty,
    }, ...prev.slice(0, 19)]);
    setConfirmPayload(null);
    setScanResult(null);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 바코드/QR 스캔</h1>
          <div className="page-desc">카메라로 바코드를 스캔하면 자동으로 품목을 찾아 입출고를 등록합니다.</div>
        </div>
      </div>

      {/* 스캔 모드 선택 */}
      <div className="scan-mode-bar">
        <button
          className={`scan-mode-btn${scanType === 'in' ? ' active' : ''}`}
          onClick={() => { setScanType('in'); showToast(' 입고 모드로 전환', 'info'); }}
        > 입고 모드</button>
        <button
          className={`scan-mode-btn${scanType === 'out' ? ' active' : ''}`}
          onClick={() => { setScanType('out'); showToast(' 출고 모드로 전환', 'info'); }}
        > 출고 모드</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* 카메라 영역 */}
        <div className="card">
          <div className="card-title"> 카메라 스캔</div>
          <div id={regionId} style={{ width: '100%', minHeight: '300px', background: '#000', borderRadius: '8px', overflow: 'hidden' }} />
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={handleStartScan} disabled={scanning}> 스캔 시작</button>
            <button className="btn btn-outline" onClick={handleStopScan} disabled={!scanning}>⏹ 스캔 중지</button>
          </div>
          <div style={{ marginTop: '12px' }}>
            <div className="form-label">또는 코드 직접 입력</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="form-input"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleManualSearch(); }}
                placeholder="바코드/QR 코드를 입력하세요"
              />
              <button className="btn btn-primary" onClick={handleManualSearch}>검색</button>
            </div>
          </div>
        </div>

        {/* 스캔 결과 + 이력 */}
        <div>
          {scanResult && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-title"> 스캔 결과</div>
              {scanResult.notFound ? (
                <div className="alert alert-warning" style={{ margin: 0 }}>
                   코드 "{scanResult.code}"에 해당하는 품목을 찾지 못했습니다.<br />
                  <small>품목코드가 정확한지 확인해 주세요.</small>
                </div>
              ) : (
                <div style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: 700 }}>{scanResult.item.itemName}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>코드: {scanResult.item.itemCode} | 분류: {scanResult.item.category || '-'}</div>
                    </div>
                    <span className={`badge ${scanType === 'in' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '13px', padding: '4px 12px' }}>
                      {scanType === 'in' ? ' 입고' : ' 출고'}
                    </span>
                  </div>
                  <div className="stat-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: '12px' }}>
                    <div className="stat-card" style={{ padding: '10px 14px' }}>
                      <div className="stat-label">현재 재고</div>
                      <div className="stat-value" style={{ fontSize: '18px' }}>{(parseFloat(scanResult.item.quantity) || 0).toLocaleString('ko-KR')}</div>
                    </div>
                    <div className="stat-card" style={{ padding: '10px 14px' }}>
                      <div className="stat-label">단가</div>
                      <div className="stat-value" style={{ fontSize: '18px' }}>{scanResult.item.unitPrice ? '₩' + Math.round(parseFloat(scanResult.item.unitPrice)).toLocaleString('ko-KR') : '-'}</div>
                    </div>
                    <div className="stat-card" style={{ padding: '10px 14px' }}>
                      <div className="stat-label">거래처</div>
                      <div className="stat-value" style={{ fontSize: '14px' }}>{scanResult.item.vendor || '-'}</div>
                    </div>
                  </div>
                  <div className="form-row" style={{ marginBottom: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">수량 <span className="required">*</span></label>
                      <input
                        className="form-input" type="number" min="1"
                        value={scanQty} autoFocus
                        onChange={e => setScanQty(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRegister(); }}
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">비고</label>
                      <input className="form-input" value={scanNote} onChange={e => setScanNote(e.target.value)} placeholder="메모 (선택)" />
                    </div>
                  </div>
                  <button
                    className={`btn ${scanType === 'in' ? 'btn-success' : 'btn-danger'} btn-lg`}
                    style={{ width: '100%' }}
                    onClick={handleRegister}
                  >
                    {scanType === 'in' ? ' 입고' : ' 출고'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 최근 스캔 이력 */}
          <div className="card">
            <div className="card-title"> 최근 스캔 이력 <span className="card-subtitle">({scanHistory.length}건)</span></div>
            {scanHistory.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="icon" style={{ fontSize: '32px' }}></div>
                <div className="msg" style={{ fontSize: '13px' }}>스캔한 이력이 없습니다</div>
              </div>
            ) : (
              scanHistory.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <span style={{ fontSize: '16px' }}>{h.type === 'in' ? '' : ''}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{h.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{h.code} | {h.time}</div>
                  </div>
                  <span className={h.type === 'in' ? 'type-in' : 'type-out'} style={{ fontSize: '13px' }}>
                    {h.type === 'in' ? '+' : '-'}{h.qty}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <div className="alert alert-warning" style={{ marginTop: '12px' }}>
           등록된 품목이 없습니다. 먼저 재고 현황에서 품목을 등록하거나 파일을 업로드해 주세요.
          바코드 스캔 시 품목코드로 매칭됩니다.
        </div>
      )}

      {/* 확인 모달 */}
      {confirmPayload && (
        <ScanConfirmModal
          payload={confirmPayload}
          onConfirm={handleConfirm}
          onClose={() => setConfirmPayload(null)}
        />
      )}
    </div>
  );
}
