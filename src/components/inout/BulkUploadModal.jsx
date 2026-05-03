import React, { useState, useRef, useEffect } from 'react';
import { showToast } from '../../toast.js';
import { downloadExcelSheets, readExcelFile } from '../../excel.js';
import { addTransactionsBulk } from '../../store.js';
import { buildColMap, parseExcelRows } from '../../domain/inoutExcelParser.js';
import { fmtNum as fmt, fmtWon as W } from '../../utils/formatters.js';
import * as db from '../../db.js';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function BulkUploadModal({ items, modeDefault, onClose, onSuccess }) {
  const [previewRows, setPreviewRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const modalTitle = modeDefault === 'in' ? '엑셀 일괄 입고 등록'
    : modeDefault === 'out' ? '엑셀 일괄 출고 등록'
    : '엑셀 일괄 입출고 등록';

  const handleDownloadTemplate = () => {
    const today = todayStr();
    let rows, sheetName, fileName;
    if (modeDefault === 'out') {
      rows = [
        ['자산', '출고일자', '거래처', '창고', '상품코드', '품명', '색상', '규격', '단위', '출고수량', '출고단가', '비고'],
        ['전자기기', today, '강남점', '본사 창고', 'SM-S925', '갤럭시 S25', '블랙', '256GB', 'EA', 10, 1500000, ''],
      ];
      sheetName = '출고_양식'; fileName = '출고_일괄등록_양식';
    } else {
      rows = [
        ['자산', '입고일자', '거래처', '창고', '상품코드', '품명', '색상', '규격', '단위', '입고수량', '매입원가', '비고'],
        ['전자기기', today, '(주)삼성전자', '본사 창고', 'SM-S925', '갤럭시 S25', '블랙', '256GB', 'EA', 100, 1200000, ''],
      ];
      sheetName = '입고_양식'; fileName = '입고_일괄등록_양식';
    }
    downloadExcelSheets([{ name: sheetName, rows }], fileName);
    showToast(`${modeDefault === 'out' ? '출고' : '입고'} 양식을 내려받았습니다.`, 'success');
  };

  const processFile = async (file) => {
    setLoading(true); setError(''); setPreviewRows(null);
    try {
      const { sheets, sheetNames } = await readExcelFile(file);
      const sheetData = sheets[sheetNames[0]];
      if (!sheetData || sheetData.length < 2) {
        setError('데이터 행이 없습니다.'); setLoading(false); return;
      }
      const headers = sheetData[0].map(h => String(h ?? '').trim());
      const colMap = buildColMap(headers, modeDefault);
      if (colMap.itemName === -1 && colMap.itemCode === -1) {
        setError('품명 또는 상품코드 컬럼을 찾을 수 없습니다.'); setLoading(false); return;
      }
      if (colMap.quantity === -1) {
        setError('수량 컬럼을 찾을 수 없습니다.'); setLoading(false); return;
      }
      const rows = parseExcelRows(sheetData, colMap, modeDefault, items);
      if (!rows.length) { setError('유효한 데이터가 없습니다.'); setLoading(false); return; }
      setPreviewRows(rows);
    } catch (err) {
      setError(`파일 처리 중 오류: ${err.message}`);
    }
    setLoading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleConfirm = async () => {
    if (!previewRows) return;
    setLoading(true);
    try {
      // 1. 없는 거래처 자동 생성
      const vendorNames = [...new Set(previewRows.map(r => r.vendor).filter(Boolean))];
      if (vendorNames.length) {
        try {
          await db.vendors.upsertBulk(vendorNames.map(name => ({ name })));
        } catch (err) {
          console.warn('[BulkUploadModal] vendor auto-create skipped (permission/policy):', err);
        }
      }

      // 2. 없는 상품 자동 생성
      const norm = (v) => String(v ?? '').trim().toLowerCase();
      const itemKey = (name, code) => {
        const c = norm(code);
        if (c) return `code:${c}`;
        const n = norm(name);
        return n ? `name:${n}` : '';
      };
      const itemMap = new Map();
      (items || []).forEach((it) => {
        const k = itemKey(it.itemName, it.itemCode);
        if (k) itemMap.set(k, it.id);
      });

      const candidateItems = previewRows
        .map((r) => ({ itemName: r.itemName, itemCode: r.itemCode, unit: r.unit || 'EA', category: r.category || '' }))
        .filter((r) => r.itemName || r.itemCode);

      const LARGE_UPLOAD_ITEM_CREATE_THRESHOLD = 200;
      let itemCreateDisabled = candidateItems.length > LARGE_UPLOAD_ITEM_CREATE_THRESHOLD;
      if (itemCreateDisabled) {
        console.warn(
          `[BulkUploadModal] large upload detected (${candidateItems.length}), skip item auto-create for speed`
        );
      }
      for (const c of candidateItems) {
        if (itemCreateDisabled) break;
        const k = itemKey(c.itemName, c.itemCode);
        if (!k || itemMap.has(k)) continue;
        try {
          const newItem = await db.items.create({
            itemName: c.itemName || c.itemCode,
            itemCode: c.itemCode || '',
            category: c.category || '',
            unit: c.unit || 'EA',
          });
          if (newItem?.id) {
            itemMap.set(k, newItem.id);
          }
        } catch (err) {
          // 중복 생성 시 무시하고 기존 항목 사용
          if (err.message?.includes('duplicate')) {
            console.warn(`[BulkUploadModal] 상품 중복: ${c.itemName || c.itemCode}`);
          } else {
            itemCreateDisabled = true;
            console.warn('[BulkUploadModal] item create blocked, stop item auto-create:', err);
            break;
          }
        }
      }

      // 3. 데이터 DB 저장 + 메모리 저장
      const txsToSave = previewRows.map(r => {
        const qty = parseFloat(r.quantity) || 0;
        const unitPrice = parseFloat(r.unitPrice) || 0;
        const sellingPrice = parseFloat(r.sellingPrice) || 0;
        const supplyValue = Math.round(unitPrice * qty);
        const vat = Math.ceil(supplyValue * 0.1);
        return {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : (() => {
                const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues)
                  ? Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2,'0')).join('')
                  : Math.random().toString(36).slice(2, 9);
                return `${Date.now().toString(36)}-${rnd}`;
              })(),
          type: r.type, vendor: r.vendor, itemName: r.itemName, itemCode: r.itemCode,
          quantity: qty, unitPrice, sellingPrice,
          supplyValue, vat, totalAmount: supplyValue + vat,
          actualSellingPrice: sellingPrice,
          date: r.date, warehouse: r.warehouse || '본사 창고', note: r.note,
          spec: r.spec, unit: r.unit, color: r.color, category: r.category,
        };
      });

      // DB에 저장
      await db.transactions.bulkCreate(txsToSave);

      // 메모리에도 동기화 (UI 즉시 반영)
      addTransactionsBulk(txsToSave);
      const inCount = previewRows.filter(r => r.type === 'in').length;
      const outCount = previewRows.filter(r => r.type === 'out').length;
      showToast(`일괄 등록 완료: 총 ${previewRows.length}건 (입고 ${inCount}, 출고 ${outCount})`, 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(`등록 중 오류: ${err.message}`, 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h3 className="modal-title"> {modalTitle}</h3>
          <button className="modal-close" onClick={onClose}></button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: '0', fontSize: '13px' }}>
            <strong>사용 방법</strong><br />
            1. 아래에서 샘플 양식을 내려받습니다.<br />
            2. 양식에 입고/출고 데이터를 입력합니다. (창고는 선택사항 — 비워두면 "본사 창고"로 자동 할당)<br />
            3. 저장한 엑셀 파일을 끌어놓거나 선택하면 미리보기 후 한 번에 등록할 수 있습니다.
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />

          <button className="btn btn-outline" onClick={handleDownloadTemplate} style={{ marginBottom: '0' }}>
             엑셀 양식 다운로드
          </button>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />

          {/* 드롭존 */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '8px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>엑셀 파일을 끌어오거나 클릭해서 선택해 주세요</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>지원 형식: .xlsx, .xls</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {loading && <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>분석 중...</div>}
          {error && <div className="alert alert-danger" style={{ marginTop: '12px' }}>{error}</div>}

          {/* 미리보기 */}
          {previewRows && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ marginBottom: '8px', fontSize: '13px' }}>
                <strong>분석 결과</strong>
                <span style={{ marginLeft: '8px', color: 'var(--success)' }}>입고 {previewRows.filter(r => r.type === 'in').length}건</span>
                <span style={{ marginLeft: '8px', color: 'var(--danger)' }}>출고 {previewRows.filter(r => r.type === 'out').length}건</span>
                {previewRows.filter(r => !r.matched).length > 0 && (
                  <span style={{ marginLeft: '8px', color: 'var(--warning)' }}>미매칭 {previewRows.filter(r => !r.matched).length}건</span>
                )}
              </div>
              <div className="table-wrapper" style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '12px' }}>
                <table className="data-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>구분</th><th>거래처</th><th>품목명</th>
                      <th className="text-right">수량</th><th className="text-right">원가</th>
                      <th>날짜</th><th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <span style={{
                            background: r.type === 'in' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
                            color: r.type === 'in' ? '#16a34a' : '#ef4444',
                            padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                          }}>
                            {r.type === 'in' ? '입고' : '출고'}
                          </span>
                        </td>
                        <td>{r.vendor || '-'}</td>
                        <td>{r.itemName}</td>
                        <td className="text-right">{fmt(r.quantity)}</td>
                        <td className="text-right">{r.unitPrice ? W(r.unitPrice) : '-'}</td>
                        <td>{r.date}</td>
                        <td>
                          {r.matched
                            ? <span style={{ color: 'var(--success)', fontSize: '11px' }}>매칭</span>
                            : <span style={{ color: 'var(--warning)', fontSize: '11px' }}>신규</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn btn-outline" onClick={() => setPreviewRows(null)}>취소</button>
                <button className="btn btn-primary" onClick={handleConfirm}>총 {previewRows.length}건 등록</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


