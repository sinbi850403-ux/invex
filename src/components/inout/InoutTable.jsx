/**
 * InoutTable.jsx - 입출고 테이블 컴포넌트
 */
import React from 'react';
import { SortTh } from './SortTh.jsx';
import { fmtNum as fmt, fmtWon as W, normalizeCurrency } from '../../utils/formatters.js';
import { formatDateStr as formatDate } from '../../domain/inoutExcelParser.js';

// ── 구분 배지 ──────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  return (
    <span style={{
      background: type === 'in' ? 'rgba(22,163,74,0.12)' : 'rgba(239,68,68,0.12)',
      color: type === 'in' ? '#16a34a' : '#ef4444',
      padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
    }}>
      {type === 'in' ? '입고' : '출고'}
    </span>
  );
}

/**
 * @param {{
 *   mode: 'in'|'out'|'all',
 *   sorted: object[],
 *   sort: {key: string, dir: string},
 *   onSort: (sortKey: string) => void,
 *   selectedIds: Set<string>,
 *   onSelectAll: () => void,
 *   onSelect: (id: string) => void,
 *   canDelete: boolean,
 *   resolveItem: (tx: object) => object,
 *   resolveWac: (tx: object, itemData: object) => number,
 *   onDelete: (tx: object) => void,
 *   inTotals: object|null,
 *   outTotals: object|null,
 *   tableRef: React.RefObject,
 * }} props
 */
export function InoutTable({
  mode,
  sorted,
  sort,
  onSort,
  selectedIds,
  onSelectAll,
  onSelect,
  canDelete,
  resolveItem,
  resolveWac,
  onDelete,
  inTotals,
  outTotals,
  tableRef,
}) {
  const isInMode  = mode === 'in';
  const isOutMode = mode === 'out';

  const allOnPageSelected = sorted.length > 0 && sorted.every(tx => selectedIds.has(tx.id));

  return (
    <div className="table-wrapper" style={{ border: 'none' }}>
      <table className="data-table inv-table" ref={tableRef}>
        <thead>
          {isOutMode ? (
            <tr>
              <th style={{ width: '40px', textAlign: 'center', textTransform: 'none' }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={onSelectAll} />
              </th>
              <th className="col-num" style={{ textTransform: 'none', fontSize: '13px' }}>#</th>
              <SortTh sortKey="category" sort={sort} onSort={onSort}>자산</SortTh>
              <SortTh sortKey="date" sort={sort} onSort={onSort}>출고일자</SortTh>
              <SortTh sortKey="vendor" sort={sort} onSort={onSort}>거래처</SortTh>
              <SortTh sortKey="itemCode" sort={sort} onSort={onSort}>상품코드</SortTh>
              <SortTh sortKey="itemName" className="col-fill" sort={sort} onSort={onSort}>품명</SortTh>
              <SortTh sortKey="color" sort={sort} onSort={onSort}>색상</SortTh>
              <SortTh sortKey="spec" sort={sort} onSort={onSort}>규격</SortTh>
              <SortTh sortKey="unit" sort={sort} onSort={onSort}>단위</SortTh>
              <SortTh sortKey="quantity" className="text-right" sort={sort} onSort={onSort}>출고수량</SortTh>
              {[
                { key: 'sellingPrice', label: '출고단가' },
                { key: 'outAmt',       label: '판매가'   },
                { key: 'outVat',       label: '부가세'   },
                { key: 'outTotal',     label: '출고합계' },
                { key: 'profit',       label: '이익액'   },
                { key: 'profitMargin', label: '이익률'   },
              ].map(({ key, label }) => (
                <SortTh key={key} sortKey={key} sort={sort} onSort={onSort} className="text-right" style={{
                  fontWeight: 700, fontSize: '11px', textTransform: 'none', whiteSpace: 'nowrap', minWidth: 72,
                }}>{label}</SortTh>
              ))}
              <th style={{ textTransform: 'none', fontSize: '13px' }}>관리</th>
            </tr>
          ) : (
            <tr>
              <th style={{ width: '40px', textAlign: 'center', textTransform: 'none' }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={onSelectAll} />
              </th>
              <th className="col-num" style={{ textTransform: 'none', fontSize: '13px' }}>#</th>
              {!isInMode && !isOutMode && <SortTh sortKey="type" sort={sort} onSort={onSort}>구분</SortTh>}
              {isInMode ? (
                <>
                  <SortTh sortKey="category" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>자산</SortTh>
                  <SortTh sortKey="date" sort={sort} onSort={onSort}>입고일자</SortTh>
                  <SortTh sortKey="vendor" sort={sort} onSort={onSort}>거래처</SortTh>
                  <SortTh sortKey="itemCode" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>상품코드</SortTh>
                  <SortTh sortKey="itemName" className="col-fill" sort={sort} onSort={onSort}>품명</SortTh>
                  <SortTh sortKey="color" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>색상</SortTh>
                  <SortTh sortKey="spec" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>규격</SortTh>
                  <SortTh sortKey="unit" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>단위</SortTh>
                  <SortTh sortKey="quantity" className="text-right" sort={sort} onSort={onSort}>입고수량</SortTh>
                  <SortTh sortKey="unitPrice" className="text-right" sort={sort} onSort={onSort}>매입원가</SortTh>
                  <SortTh sortKey="supply" className="text-right" sort={sort} onSort={onSort}>공급가액</SortTh>
                  <SortTh sortKey="vat" className="text-right" sort={sort} onSort={onSort}>부가세</SortTh>
                  <SortTh sortKey="totalPrice" className="text-right" sort={sort} onSort={onSort}>합계금액</SortTh>
                </>
              ) : (
                <>
                  <SortTh sortKey="date" sort={sort} onSort={onSort}>날짜</SortTh>
                  <SortTh sortKey="vendor" sort={sort} onSort={onSort}>거래처</SortTh>
                  <SortTh sortKey="itemName" className="col-fill" sort={sort} onSort={onSort}>품목명</SortTh>
                  <SortTh sortKey="color" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>색상</SortTh>
                  <SortTh sortKey="quantity" className="text-right" sort={sort} onSort={onSort} style={{ color: 'var(--danger)', fontWeight: 700 }}>수량</SortTh>
                  <SortTh sortKey="unitPrice" className="text-right" sort={sort} onSort={onSort}>원가</SortTh>
                  <SortTh sortKey="sellingPrice" className="text-right" sort={sort} onSort={onSort} style={{ color: 'var(--success)', fontWeight: 700 }}>판매가</SortTh>
                  <SortTh sortKey="supply" className="text-right" sort={sort} onSort={onSort} style={{ fontWeight: 700 }}>금액</SortTh>
                  <SortTh sortKey="note" sort={sort} onSort={onSort} style={{ color: 'var(--text-muted)' }}>비고</SortTh>
                </>
              )}
              <th style={{ textTransform: 'none', fontSize: '13px' }}>관리</th>
            </tr>
          )}
        </thead>
        <tbody>
          {sorted.map((tx, i) => {
            const rowNum    = i + 1;
            const qty       = parseFloat(tx.quantity) || 0;
            const itemData  = resolveItem(tx);
            const unitPrice = normalizeCurrency(tx.unitPrice || itemData.unitPrice);
            const supply    = Math.round(unitPrice * qty);
            const vat       = Math.ceil(supply * 0.1);
            const totalPrice = supply + vat;
            const salePrice  = normalizeCurrency(tx.sellingPrice || itemData.salePrice);
            const outAmt    = Math.round(salePrice * qty);
            const wac       = resolveWac(tx, itemData);
            const wacSupply = Math.round(wac * qty);
            const profit    = outAmt - wacSupply;
            const category  = tx.category || itemData.category || '';
            const itemCode  = tx.itemCode  || itemData.itemCode  || '';
            const spec      = tx.spec      || itemData.spec      || '';
            const unit      = tx.unit      || itemData.unit      || '';
            const isSelected = selectedIds.has(tx.id);

            return (
              <tr key={tx.id} className={isSelected ? 'selected' : ''}>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={isSelected} onChange={() => onSelect(tx.id)} />
                </td>
                <td className="col-num">{rowNum}</td>
                {!isInMode && !isOutMode && (
                  <td><TypeBadge type={tx.type} /></td>
                )}
                {isOutMode ? (
                  <>
                    <td style={{ fontSize: '12px' }}>{category || '-'}</td>
                    <td style={{ fontSize: '12px' }}>{formatDate(tx.date)}</td>
                    <td style={{ fontSize: '12px' }}>{tx.vendor || '-'}</td>
                    <td style={{ fontSize: '12px' }}>{itemCode || '-'}</td>
                    <td className="col-fill"><strong>{tx.itemName || '-'}</strong></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.color || itemData.color || '-'}</td>
                    <td style={{ fontSize: '12px' }}>{spec || '-'}</td>
                    <td style={{ fontSize: '12px' }}>{unit || '-'}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>
                      {qty ? qty.toLocaleString('ko-KR') : '-'}
                    </td>
                    {/* 판매 그룹 */}
                    <td className="text-right">{salePrice ? W(salePrice) : '-'}</td>
                    <td className="text-right">{outAmt ? W(outAmt) : '-'}</td>
                    <td className="text-right">{outAmt ? W(Math.round(outAmt * 0.1)) : '-'}</td>
                    <td className="text-right">{outAmt ? W(Math.round(outAmt * 1.1)) : '-'}</td>
                    {/* 이익액: wac>0이면 실제 이익(₩0 포함), wac=0이면 원가없음 표시 */}
                    <td className="text-right">
                      {outAmt > 0
                        ? wac > 0
                          ? <span style={{ color: profit >= 0 ? 'var(--success, #4caf50)' : 'var(--error, #f44336)', fontWeight: 600 }}>
                              {profit >= 0 ? W(profit) : `-${W(Math.abs(profit))}`}
                            </span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>원가없음</span>
                        : '-'}
                    </td>
                    <td className="text-right">
                      {outAmt > 0 && wac > 0
                        ? <span style={{ color: profit >= 0 ? 'var(--success, #4caf50)' : 'var(--error, #f44336)' }}>
                            {(profit / outAmt * 100).toFixed(1)}%
                          </span>
                        : '-'}
                    </td>
                  </>
                ) : isInMode ? (
                  <>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{category || '-'}</td>
                    <td style={{ fontSize: '13px' }}>{formatDate(tx.date)}</td>
                    <td style={{ fontSize: '13px' }}>{tx.vendor || '-'}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{itemCode || '-'}</td>
                    <td className="col-fill"><strong>{tx.itemName || '-'}</strong></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.color || itemData.color || '-'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{spec || '-'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{unit || '-'}</td>
                    <td className="text-right" style={{ fontWeight: 600, fontSize: '13px' }}>
                      +{qty ? qty.toLocaleString('ko-KR') : '-'}
                    </td>
                    <td className="text-right" style={{ fontSize: '13px' }}>{unitPrice ? W(unitPrice) : '-'}</td>
                    <td className="text-right" style={{ fontSize: '13px' }}>{supply ? W(supply) : '-'}</td>
                    <td className="text-right" style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{supply ? W(vat) : '-'}</td>
                    <td className="text-right" style={{ fontWeight: 700, fontSize: '13px' }}>{supply ? W(totalPrice) : '-'}</td>
                  </>
                ) : (
                  <>
                    <td style={{ fontSize: '12px' }}>{formatDate(tx.date)}</td>
                    <td style={{ fontSize: '12px' }}>{tx.vendor || '-'}</td>
                    <td className="col-fill">
                      <strong>{tx.itemName || '-'}</strong>
                      {itemCode && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>{itemCode}</span>}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.color || itemData.color || '-'}</td>
                    <td className="text-right">
                      <span style={{ color: tx.type === 'in' ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                        {tx.type === 'in' ? '+' : '-'}{fmt(qty)}
                      </span>
                    </td>
                    <td className="text-right">{unitPrice ? W(unitPrice) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                    <td className="text-right">{salePrice ? W(salePrice) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                    <td className="text-right" style={{ fontWeight: 600 }}>{supply ? W(supply) : <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{tx.note || ''}</td>
                  </>
                )}
                <td>
                  {canDelete && (
                    <button
                      className="btn btn-xs btn-outline"
                      style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={() => onDelete(tx)}
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {isInMode && inTotals && sorted.length > 0 && (() => {
          const S = { fontWeight: 700, padding: '8px 12px', borderTop: '2px solid var(--border-color,#333)' };
          return (
            <tfoot>
              <tr style={{ background: 'var(--bg-lighter)', fontWeight: 700 }}>
                <td colSpan={10} className="text-right" style={{ ...S, color: 'var(--text-muted)', fontSize: '12px' }}>
                  합계 ({sorted.length.toLocaleString()}건)
                </td>
                <td className="text-right" style={{ ...S, fontSize: '13px' }}>
                  +{inTotals.totQty.toLocaleString('ko-KR')}
                </td>
                <td className="text-right" style={S}>-</td>
                <td className="text-right" style={S}>{W(inTotals.totSupply)}</td>
                <td className="text-right" style={{ ...S, color: 'var(--text-muted)' }}>{W(inTotals.totVat)}</td>
                <td className="text-right" style={S}>{W(inTotals.totTotal)}</td>
                <td style={S}></td>
              </tr>
            </tfoot>
          );
        })()}
        {isOutMode && outTotals && sorted.length > 0 && (() => {
          const S = { fontWeight: 700, padding: '8px 12px', borderTop: '2px solid var(--border-color,#333)' };
          return (
            <tfoot>
              <tr style={{ background: 'var(--bg-lighter)', fontWeight: 700 }}>
                <td colSpan={11} className="text-right" style={{ ...S, color: 'var(--text-muted)', fontSize: '12px' }}>
                  합계 ({sorted.length.toLocaleString()}건)
                </td>
                <td className="text-right" style={{ ...S, fontWeight: 400 }}>-</td>
                <td className="text-right" style={S}>{W(outTotals.totOutAmt)}</td>
                <td className="text-right" style={S}>{W(outTotals.totVat)}</td>
                <td className="text-right" style={S}>{W(outTotals.totOutTotal)}</td>
                <td className="text-right" style={S}>{W(outTotals.totProfit)}</td>
                <td className="text-right" style={{ ...S, fontSize: '12px' }}>{outTotals.totProfitMargin}</td>
                <td style={S}></td>
              </tr>
            </tfoot>
          );
        })()}
      </table>
    </div>
  );
}

export default InoutTable;
