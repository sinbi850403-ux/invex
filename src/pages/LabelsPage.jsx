/**
 * LabelsPage.jsx - 바코드 라벨 인쇄
 */
import React, { useState, useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';

const SIZES = {
  small:  { w: 180, h: 100, fontSize: 10, codeSize: 50 },
  medium: { w: 240, h: 140, fontSize: 12, codeSize: 70 },
  large:  { w: 320, h: 190, fontSize: 14, codeSize: 90 },
};

function generateBarcodeLines(text, codeSize) {
  const chars = text.split('');
  const lines = [];
  for (let i = 0; i < 30; i++) {
    const charCode = (chars[i % chars.length] || 'A').charCodeAt(0);
    const w = (charCode % 3) + 1;
    const isBlack = i % 2 === 0;
    lines.push(
      <div key={i} style={{ width: `${w}px`, height: '100%', background: isBlack ? '#000' : '#fff' }} />
    );
  }
  return (
    <div style={{ display: 'flex', gap: '1px', alignItems: 'end', height: `${codeSize}px` }}>
      {lines}
    </div>
  );
}

function Label({ item, size }) {
  const code = item.itemCode || item.itemName.substring(0, 8);
  const price = parseFloat(item.unitPrice) || 0;
  const s = SIZES[size];
  return (
    <div style={{ width: s.w, height: s.h, border: '1px solid #333', borderRadius: '4px', padding: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontFamily: "'Noto Sans KR', sans-serif", background: '#fff' }}>
      <div style={{ fontSize: s.fontSize, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {item.itemName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'center' }}>
        {generateBarcodeLines(code, s.codeSize)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ fontSize: s.fontSize - 2, color: '#666' }}>{code}</div>
        {price > 0 && <div style={{ fontSize: s.fontSize, fontWeight: 700 }}>₩{price.toLocaleString('ko-KR')}</div>}
      </div>
    </div>
  );
}

function labelHtml(item, size) {
  const code = item.itemCode || item.itemName.substring(0, 8);
  const price = parseFloat(item.unitPrice) || 0;
  const s = SIZES[size];
  const chars = code.split('');
  let barcodeLines = '';
  for (let i = 0; i < 30; i++) {
    const charCode = (chars[i % chars.length] || 'A').charCodeAt(0);
    const w = (charCode % 3) + 1;
    const isBlack = i % 2 === 0;
    barcodeLines += `<div style="width:${w}px; height:100%; background:${isBlack ? '#000' : '#fff'};"></div>`;
  }
  return `<div style="width:${s.w}px; height:${s.h}px; border:1px solid #333; border-radius:4px; padding:6px; display:flex; flex-direction:column; justify-content:space-between; font-family:'Noto Sans KR',sans-serif; background:#fff;">
    <div style="font-size:${s.fontSize}px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.itemName}</div>
    <div style="display:flex; align-items:center; gap:6px; flex:1; justify-content:center;">
      <div style="display:flex; gap:1px; align-items:end; height:${s.codeSize}px;">${barcodeLines}</div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:end;">
      <div style="font-size:${s.fontSize - 2}px; color:#666;">${code}</div>
      ${price > 0 ? `<div style="font-size:${s.fontSize}px; font-weight:700;">₩${price.toLocaleString('ko-KR')}</div>` : ''}
    </div>
  </div>`;
}

export default function LabelsPage() {
  const [state] = useStore();
  const items = state.mappedData || [];

  const [selected, setSelected] = useState(new Set());
  const [labelSize, setLabelSize] = useState('small');
  const [copies, setCopies] = useState(1);

  const selectedItems = useMemo(
    () => items.filter((_, i) => selected.has(i)),
    [items, selected]
  );

  const toggleItem = (i) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const toggleAll = (checked) => {
    if (checked) setSelected(new Set(items.map((_, i) => i)));
    else setSelected(new Set());
  };

  const handlePrint = () => {
    if (selectedItems.length === 0) { showToast('인쇄할 품목을 선택해주세요.', 'warning'); return; }
    const copiesCount = parseInt(copies) || 1;
    const allLabels = [];
    for (let c = 0; c < copiesCount; c++) {
      selectedItems.forEach(item => allLabels.push(labelHtml(item, labelSize)));
    }
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>라벨 인쇄 - INVEX</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Noto Sans KR',sans-serif;padding:10px}.labels-wrap{display:flex;flex-wrap:wrap;gap:8px}@media print{.labels-wrap{gap:4px}}</style>
      </head><body><div class="labels-wrap">${allLabels.join('')}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    printWindow.document.close();
    showToast(`${selectedItems.length}개 × ${copiesCount}매 라벨 인쇄 시작`, 'success');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">라벨 인쇄</h1>
          <div className="page-desc">품목 라벨을 생성하고 인쇄합니다. 바코드/QR 코드 포함.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handlePrint}>🖨️ 선택 항목 인쇄</button>
        </div>
      </div>

      {/* 라벨 설정 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>라벨 크기:</label>
          {[['small', '소형 (50×30mm)'], ['medium', '중형 (70×40mm)'], ['large', '대형 (100×60mm)']].map(([val, label]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="radio" name="label-size" value={val} checked={labelSize === val} onChange={() => setLabelSize(val)} /> {label}
            </label>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
              인쇄 매수:
              <input className="form-input" type="number" value={copies} min="1" max="10" onChange={e => setCopies(e.target.value)} style={{ width: '60px', padding: '3px 6px' }} />
            </label>
          </div>
        </div>
      </div>

      {/* 품목 선택 */}
      <div className="card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div className="card-title" style={{ margin: 0 }}>🏷️ 라벨 출력 품목 선택</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={e => toggleAll(e.target.checked)} /> 전체 선택
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
          {items.map((item, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: '12px' }}>
              <input type="checkbox" checked={selected.has(i)} onChange={() => toggleItem(i)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.itemName}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{item.itemCode || '-'}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 미리보기 */}
      <div className="card">
        <div className="card-title">🔍 라벨 미리보기</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '8px' }}>
          {selectedItems.length === 0
            ? <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>위에서 품목을 선택하면 미리보기가 표시됩니다.</div>
            : selectedItems.map((item, i) => <Label key={i} item={item} size={labelSize} />)
          }
        </div>
      </div>
    </div>
  );
}
