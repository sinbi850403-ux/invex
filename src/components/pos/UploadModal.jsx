import React, { useState, useRef } from 'react';
import { readExcelFile } from '../../excel.js';
import { POS_FIELDS, autoMapPOS, downloadPosTemplate, fmt } from '../../domain/posConfig.js';

export function UploadModal({ onClose, onConfirm }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  async function processFile(file) {
    setPreview('loading');
    try {
      const { sheets, sheetNames } = await readExcelFile(file);
      const sheetData = sheets[sheetNames[0]];
      if (!sheetData || sheetData.length < 2) { setPreview({ error: '데이터가 없거나 헤더만 있습니다.' }); return; }
      const headers = sheetData[0].map(h => String(h || '').trim());
      const mapping = autoMapPOS(headers);
      const rows = [];
      for (let i = 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        if (!row || row.length === 0) continue;
        if (!row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) continue;
        const record = {};
        POS_FIELDS.forEach(field => {
          const colIdx = mapping[field.key];
          if (colIdx !== undefined && colIdx < row.length) {
            let val = row[colIdx];
            if (field.key === 'saleDate' && typeof val === 'number' && val > 10000) {
              val = new Date((val - 25569) * 86400 * 1000).toISOString().split('T')[0];
            }
            record[field.key] = val !== null && val !== undefined ? String(val).trim() : '';
          }
        });
        if (record.totalSales || record.salesAmount || record.cardAmount) rows.push(record);
      }
      if (rows.length === 0) { setPreview({ error: '유효한 매출 데이터가 없습니다. 헤더를 확인해 주세요.' }); return; }
      const totalSales = rows.reduce((s, r) => s + (parseFloat(r.totalSales) || parseFloat(r.salesAmount) || 0), 0);
      setPreview({ rows, mappedCount: Object.keys(mapping).length, headers, mapping, totalSales });
    } catch (err) {
      setPreview({ error: '파일 처리 중 오류: ' + err.message });
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 800 }}>
        <div className="modal-header">
          <h3 className="modal-title"> POS 매출 데이터 업로드</h3>
          <button className="modal-close" onClick={onClose} />
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: 16, fontSize: 12 }}>
            <strong> 사용 방법:</strong><br />
            ① 아래 '양식 다운로드'로 POS 엑셀 양식을 받으세요<br />
            ② POS 시스템 데이터를 업로드하세요<br />
            ③ 매핑 결과를 확인하고 '등록' 버튼을 누르세요
          </div>
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-outline" onClick={downloadPosTemplate}> POS 양식 다운로드</button>
          </div>
          <div
            style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: 40, textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}></div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>POS 엑셀 파일을 여기에 드래그하거나 클릭</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>.xlsx, .xls 파일 지원</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files[0]; if (f) processFile(f); }} />
          </div>

          {preview === 'loading' && (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>⏳ 파일 분석 중...</div>
          )}
          {preview && preview.error && (
            <div className="alert alert-warning" style={{ marginTop: 12 }}>{preview.error}</div>
          )}
          {preview && preview.rows && (
            <div style={{ marginTop: 16 }}>
              <div className="alert alert-success" style={{ marginBottom: 12 }}>
                 <strong>{preview.rows.length}건</strong> 인식 완료 |
                매핑된 필드: <strong>{preview.mappedCount}/{preview.headers.length}</strong> |
                총 매출: <strong>{fmt(preview.totalSales)}</strong>
              </div>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: 13 }}> 자동 매핑 결과:</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {POS_FIELDS.map(field => {
                    const idx = preview.mapping[field.key];
                    if (idx === undefined) return null;
                    return <span key={field.key} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'var(--accent)', color: '#fff' }}>{preview.headers[idx]} → {field.label}</span>;
                  })}
                </div>
              </div>
              <div className="table-wrapper" style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
                <table className="data-table" style={{ fontSize: 11 }}>
                  <thead><tr><th>일자</th><th>매장</th><th>구분</th><th className="text-right">총매출</th><th className="text-right">카드</th><th className="text-right">현금</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        <td>{r.saleDate || '-'}</td>
                        <td>{r.storeName || '-'}</td>
                        <td>{r.category || '-'}</td>
                        <td className="text-right">{parseFloat(r.totalSales) ? fmt(parseFloat(r.totalSales)) : (parseFloat(r.salesAmount) ? fmt(parseFloat(r.salesAmount)) : '-')}</td>
                        <td className="text-right">{parseFloat(r.cardAmount) ? fmt(parseFloat(r.cardAmount)) : '-'}</td>
                        <td className="text-right">{parseFloat(r.cashAmount) ? fmt(parseFloat(r.cashAmount)) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 10 && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>... 외 {preview.rows.length - 10}건</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setPreview(null)}>취소</button>
                <button className="btn btn-primary" onClick={() => onConfirm(preview.rows)}> {preview.rows.length}건 등록</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
