/**
 * SummaryPage.jsx - 요약 보고
 */
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { showToast } from '../toast.js';
import { downloadExcel } from '../excel.js';

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#ca8a04'];

/** CSS conic-gradient 도넛 차트 */
function DonutChart({ categories, totalPrice }) {
  if (totalPrice <= 0) {
    return (
      <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
        데이터 없음
      </div>
    );
  }

  let cumulative = 0;
  const segments = categories.map((cat, i) => {
    const ratio = cat.price / totalPrice;
    const start = cumulative;
    cumulative += ratio;
    return `${CHART_COLORS[i % CHART_COLORS.length]} ${(start * 360).toFixed(1)}deg ${(cumulative * 360).toFixed(1)}deg`;
  });

  const totalLabel = totalPrice >= 100000000
    ? `₩${(totalPrice / 100000000).toFixed(1)}억`
    : totalPrice >= 10000
      ? `₩${Math.round(totalPrice / 10000).toLocaleString('ko-KR')}만`
      : `₩${Math.round(totalPrice).toLocaleString('ko-KR')}`;

  return (
    <div style={{ width: '140px', height: '140px', borderRadius: '50%', background: `conic-gradient(${segments.join(', ')})`, position: 'relative' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>총 금액</div>
        <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)' }}>{totalLabel}</div>
      </div>
    </div>
  );
}

/** 요약 계산 */
function buildSummary(data, transactions, safetyStock) {
  const totalQty = data.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalPrice = data.reduce((s, r) => s + (parseFloat(r.totalPrice) || 0), 0);

  const catMap = {};
  data.forEach(row => {
    const cat = row.category || '';
    if (!catMap[cat]) catMap[cat] = { name: cat, count: 0, qty: 0, price: 0 };
    catMap[cat].count++;
    catMap[cat].qty += parseFloat(row.quantity) || 0;
    catMap[cat].price += parseFloat(row.totalPrice) || 0;
  });
  const categories = Object.values(catMap)
    .sort((a, b) => b.qty - a.qty)
    .map(c => ({ ...c, ratio: data.length > 0 ? Math.round((c.count / data.length) * 100) : 0 }));

  const whMap = {};
  data.forEach(row => {
    const wh = row.warehouse || ''; if (!wh) return;
    if (!whMap[wh]) whMap[wh] = { name: wh, count: 0, qty: 0, price: 0 };
    whMap[wh].count++;
    whMap[wh].qty += parseFloat(row.quantity) || 0;
    whMap[wh].price += parseFloat(row.totalPrice) || 0;
  });
  const warehouses = Object.values(whMap).sort((a, b) => b.qty - a.qty);

  const vendorMap = {};
  data.forEach(row => {
    const v = row.vendor || ''; if (!v) return;
    if (!vendorMap[v]) vendorMap[v] = { name: v, count: 0, qty: 0, price: 0 };
    vendorMap[v].count++;
    vendorMap[v].qty += parseFloat(row.quantity) || 0;
    vendorMap[v].price += parseFloat(row.totalPrice) || 0;
  });
  const vendors = Object.values(vendorMap).sort((a, b) => b.qty - a.qty);

  const topByQty = [...data]
    .sort((a, b) => (parseFloat(b.quantity) || 0) - (parseFloat(a.quantity) || 0))
    .slice(0, 10);

  const warnings = data
    .filter(d => { const min = safetyStock[d.itemName]; return min !== undefined && (parseFloat(d.quantity) || 0) <= min; })
    .map(d => ({ name: d.itemName, qty: parseFloat(d.quantity) || 0, min: safetyStock[d.itemName] }))
    .sort((a, b) => a.qty - b.qty);

  const dailyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayTx = transactions.filter(tx => tx.date === dateStr);
    const inTx = dayTx.filter(tx => tx.type === 'in');
    const outTx = dayTx.filter(tx => tx.type === 'out');
    const inQty = inTx.reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
    const outQty = outTx.reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
    if (inTx.length > 0 || outTx.length > 0) {
      dailyTrend.push({ date: dateStr, inCount: inTx.length, inQty, outCount: outTx.length, outQty, net: inQty - outQty });
    }
  }

  return { totalQty, totalPrice, categories, warehouses, vendors, topByQty, warnings, dailyTrend };
}

const MEDAL = ['', '', ''];

export default function SummaryPage() {
  const navigate = useNavigate();
  const [state] = useStore();

  const { data, transactions, safetyStock, fileName, summary } = useMemo(() => {
    const data = state.mappedData || [];
    const transactions = state.transactions || [];
    const safetyStock = state.safetyStock || {};
    const fileName = state.fileName || '요약보고';
    const summary = buildSummary(data, transactions, safetyStock);
    return { data, transactions, safetyStock, fileName, summary };
  }, [state.mappedData, state.transactions, state.safetyStock, state.fileName]);

  const hasData = data.length > 0 || transactions.length > 0;

  const handleExport = () => {
    try {
      const exportData = summary.categories.map(cat => ({
        '분류': cat.name || '(미분류)',
        '품목 수': cat.count,
        '총 수량': cat.qty,
        '총 금액': cat.price,
        '비율(%)': cat.ratio,
      }));
      const baseName = fileName.replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_요약보고`);
      showToast('보고서를 내보냈습니다.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!hasData) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">요약 보고</h1></div>
        <div className="card">
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">아직 보고할 데이터가 없습니다.</div>
            <div className="sub">파일을 업로드하거나 품목을 등록하면 요약 보고가 자동으로 생성됩니다.</div>
            <br />
            <button className="btn btn-primary" onClick={() => navigate('/upload')}>파일 업로드하기</button>
          </div>
        </div>
      </div>
    );
  }

  const maxQty = Math.max(...summary.categories.map(c => c.qty), 1);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">요약 보고</h1>
          <div className="page-desc">재고 현황과 입출고 통계를 한눈에 확인합니다.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-outline" onClick={handleExport}>요약 보고서 내보내기</button>
          <button className="btn btn-outline" onClick={() => window.print()}>인쇄</button>
        </div>
      </div>

      {/* 핵심 지표 */}
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-label">전체 품목</div><div className="stat-value text-accent">{data.length}</div></div>
        <div className="stat-card"><div className="stat-label">총 수량</div><div className="stat-value">{summary.totalQty.toLocaleString('ko-KR')}</div></div>
        <div className="stat-card"><div className="stat-label">총 재고 금액</div><div className="stat-value text-success">{summary.totalPrice > 0 ? `₩${Math.round(summary.totalPrice).toLocaleString('ko-KR')}` : '-'}</div></div>
        <div className="stat-card"><div className="stat-label">분류 수</div><div className="stat-value">{summary.categories.length}</div></div>
      </div>

      {/* 재고 부족 경고 */}
      {summary.warnings.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--danger)' }}>
          <div className="card-title" style={{ color: 'var(--danger)' }}>
            재고 부족 경고 <span className="badge badge-danger" style={{ marginLeft: '8px' }}>{summary.warnings.length}건</span>
          </div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead>
                <tr><th className="col-fill">품목명</th><th className="text-right">현재 수량</th><th className="text-right">안전재고</th><th>상태</th></tr>
              </thead>
              <tbody>
                {summary.warnings.map(w => (
                  <tr key={w.name} className={w.qty === 0 ? 'row-danger' : 'row-warning'}>
                    <td className="col-fill"><strong>{w.name}</strong></td>
                    <td className="text-right">{w.qty.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{w.min.toLocaleString('ko-KR')}</td>
                    <td>{w.qty === 0 ? <span className="badge badge-danger">재고 없음</span> : <span className="badge badge-warning">부족</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 분류 차트 */}
      {summary.categories.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div className="card">
            <div className="card-title">분류별 금액 비중</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '8px 0' }}>
              <DonutChart categories={summary.categories} totalPrice={summary.totalPrice} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {summary.categories.map((cat, i) => {
                  const pct = summary.totalPrice > 0 ? Math.round((cat.price / summary.totalPrice) * 100) : 0;
                  return (
                    <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{cat.name || '(미분류)'}</span>
                      <strong>{pct}%</strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">분류별 수량 분포</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}>
              {summary.categories.map((cat, i) => {
                const barWidth = Math.max(2, (cat.qty / maxQty) * 100);
                return (
                  <div key={cat.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '3px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{cat.name || '(미분류)'}</span>
                      <strong>{cat.qty.toLocaleString('ko-KR')}</strong>
                    </div>
                    <div style={{ height: '8px', background: 'var(--border-light)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: '4px', transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 분류별 현황 */}
      {summary.categories.length > 0 && (
        <div className="card">
          <div className="card-title">분류별 현황</div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead><tr><th>분류</th><th className="text-right">품목 수</th><th className="text-right">총 수량</th><th className="text-right">총 금액</th><th style={{ width: '200px' }}>비율</th></tr></thead>
              <tbody>
                {summary.categories.map(cat => (
                  <tr key={cat.name}>
                    <td><strong>{cat.name || '(미분류)'}</strong></td>
                    <td className="text-right">{cat.count}</td>
                    <td className="text-right">{cat.qty.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{cat.price > 0 ? `₩${Math.round(cat.price).toLocaleString('ko-KR')}` : '-'}</td>
                    <td>
                      <div className="ratio-bar">
                        <div className="ratio-bar-track"><div className="ratio-bar-fill" style={{ width: `${cat.ratio}%` }} /></div>
                        <span className="ratio-bar-label">{cat.ratio}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 창고별 */}
      {summary.warehouses.length > 0 && (
        <div className="card">
          <div className="card-title">창고/위치별 현황</div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead><tr><th>창고/위치</th><th className="text-right">품목 수</th><th className="text-right">총 수량</th><th className="text-right">총 금액</th></tr></thead>
              <tbody>
                {summary.warehouses.map(wh => (
                  <tr key={wh.name}>
                    <td><strong>{wh.name || '(미지정)'}</strong></td>
                    <td className="text-right">{wh.count}</td>
                    <td className="text-right">{wh.qty.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{wh.price > 0 ? `₩${Math.round(wh.price).toLocaleString('ko-KR')}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 거래처별 */}
      {summary.vendors.length > 0 && (
        <div className="card">
          <div className="card-title">거래처별 현황</div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead><tr><th className="col-fill">거래처</th><th className="text-right">품목 수</th><th className="text-right">총 수량</th><th className="text-right">총 금액</th></tr></thead>
              <tbody>
                {summary.vendors.map(v => (
                  <tr key={v.name}>
                    <td className="col-fill"><strong>{v.name || '(미지정)'}</strong></td>
                    <td className="text-right">{v.count}</td>
                    <td className="text-right">{v.qty.toLocaleString('ko-KR')}</td>
                    <td className="text-right">{v.price > 0 ? `₩${Math.round(v.price).toLocaleString('ko-KR')}` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 최근 7일 추이 */}
      {transactions.length > 0 && summary.dailyTrend.length > 0 && (
        <div className="card">
          <div className="card-title">최근 입출고 동향 <span className="card-subtitle">(최근 7일)</span></div>
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table className="data-table">
              <thead><tr><th>날짜</th><th className="text-right">입고 건수</th><th className="text-right">입고 수량</th><th className="text-right">출고 건수</th><th className="text-right">출고 수량</th><th className="text-right">순증감</th></tr></thead>
              <tbody>
                {summary.dailyTrend.map(day => (
                  <tr key={day.date}>
                    <td><strong>{day.date}</strong></td>
                    <td className="text-right type-in">{day.inCount}</td>
                    <td className="text-right type-in">+{day.inQty.toLocaleString('ko-KR')}</td>
                    <td className="text-right type-out">{day.outCount}</td>
                    <td className="text-right type-out">-{day.outQty.toLocaleString('ko-KR')}</td>
                    <td className={`text-right ${day.net >= 0 ? 'type-in' : 'type-out'}`}>
                      {day.net >= 0 ? '+' : ''}{day.net.toLocaleString('ko-KR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 수량 TOP 10 */}
      <div className="card">
        <div className="card-title">수량 상위 10개 품목</div>
        <div className="table-wrapper" style={{ border: 'none' }}>
          <table className="data-table">
            <thead><tr><th style={{ width: '40px' }}>순위</th><th className="col-fill">품목명</th><th>분류</th><th className="text-right">수량</th><th className="text-right">단가</th><th className="text-right">금액</th></tr></thead>
            <tbody>
              {summary.topByQty.map((item, i) => (
                <tr key={item.itemName || i}>
                  <td style={{ textAlign: 'center', fontWeight: '700', color: 'var(--text-muted)' }}>
                    {i < 3 ? MEDAL[i] : i + 1}
                  </td>
                  <td className="col-fill"><strong>{item.itemName || '-'}</strong></td>
                  <td style={{ color: 'var(--text-muted)' }}>{item.category || '-'}</td>
                  <td className="text-right">{parseFloat(item.quantity || 0).toLocaleString('ko-KR')}</td>
                  <td className="text-right">{item.unitPrice ? `₩${Math.round(parseFloat(item.unitPrice)).toLocaleString('ko-KR')}` : '-'}</td>
                  <td className="text-right">{item.totalPrice ? `₩${Math.round(parseFloat(item.totalPrice)).toLocaleString('ko-KR')}` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
