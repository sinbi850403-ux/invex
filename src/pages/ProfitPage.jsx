import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.js';
import { downloadExcel, downloadExcelSheets } from '../excel.js';
import { generateTransactionPDF } from '../pdf-generator.js';
import { showToast } from '../toast.js';
import { renderProfitTrendChart, renderVendorProfitChart } from '../charts.js';
import { jsPDF } from 'jspdf';
import { applyKoreanFont } from '../pdf-font.js';
import {
  PROFIT_MONTHS, toNumber, sumBy, toDateKey, addDays, isValidDateKey,
  fmtMoney, fmtSigned, fmtPct, fmtSignedPct, getTone,
  readLS, writeLS,
  buildItemRows, buildPeriodSummary, buildMonthlySeries, buildVendorSummary,
  summarizeByCategory, getCurrentMonthSummary, normalizeMonthlyMap, buildMonthlyPlannerData,
} from '../domain/profitCompute.js';

export default function ProfitPage() {
  const [state] = useStore();
  const navigate = useNavigate();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  // Period state
  const initPeriod = () => {
    const p = readLS('invex_profit_period_v1');
    const fb = toDateKey(addDays(now, -30));
    const ft = toDateKey(now);
    return { from: isValidDateKey(p.from) ? p.from : fb, to: isValidDateKey(p.to) ? p.to : ft };
  };
  const [period, setPeriod] = useState(initPeriod);

  // View state
  const initView = () => { const v = readLS('invex_profit_view_v1'); return { tab: v.tab === 'vendors' ? 'vendors' : 'items', vendorSort: v.vendorSort || 'profit', vendorLimit: Number(v.vendorLimit) || 8, vendorKeyword: String(v.vendorKeyword || ''), vendorLossOnly: v.vendorLossOnly === true, vendorType: v.vendorType || 'all' }; };
  const [view, setView] = useState(initView);

  // Planner state
  const initPlanner = () => {
    const p = readLS('invex_profit_monthly_planner_v1');
    return { year: Number(p.year) || curYear, month: PROFIT_MONTHS.includes(Number(p.month)) ? Number(p.month) : curMonth, salesPlan: normalizeMonthlyMap(p.salesPlan), costPlan: normalizeMonthlyMap(p.costPlan), sgnaPlan: normalizeMonthlyMap(p.sgnaPlan), sgnaActual: normalizeMonthlyMap(p.sgnaActual) };
  };
  const [planner, setPlanner] = useState(initPlanner);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  // Chart refs
  const trendChartRef = useRef(null);
  const vendorChartRef = useRef(null);

  const savePeriod = useCallback((next) => { writeLS('invex_profit_period_v1', next); setPeriod(next); }, []);
  const saveView = useCallback((next) => { const cur = readLS('invex_profit_view_v1'); const merged = { ...cur, ...next }; writeLS('invex_profit_view_v1', merged); setView(v => ({ ...v, ...next })); }, []);
  const savePlanner = useCallback((next) => { const cur = readLS('invex_profit_monthly_planner_v1'); const merged = { ...cur, ...next }; writeLS('invex_profit_monthly_planner_v1', merged); setPlanner(p => ({ ...p, ...next })); }, []);

  // Compute item rows
  // transactions 전달 → 아이템 마스터 원가/판매가가 비어있을 때 트랜잭션 집계값으로 폴백
  const rows = useMemo(() => buildItemRows(items, transactions), [items, transactions]);
  const sortedByProfit = useMemo(() => [...rows].sort((a, b) => b.profit - a.profit), [rows]);
  const topProfit = useMemo(() => sortedByProfit.slice(0, 5), [sortedByProfit]);
  const riskRows = useMemo(() => [...rows].filter(r => r.hasSalePrice).sort((a, b) => a.operatingProfitRate - b.operatingProfitRate).slice(0, 5), [rows]);
  const categorySummary = useMemo(() => summarizeByCategory(rows).slice(0, 5), [rows]);

  const totalGrossSales = useMemo(() => sumBy(rows, r => r.grossSalesAmount), [rows]);
  const totalDiscount = useMemo(() => sumBy(rows, r => r.discountAmount), [rows]);
  const totalSgnaExpense = useMemo(() => sumBy(rows, r => r.sgnaExpense), [rows]);
  const totalCost = useMemo(() => sumBy(rows, r => r.totalCost), [rows]);
  const totalRevenue = useMemo(() => sumBy(rows, r => r.totalRevenue), [rows]);
  const totalGrossProfit = totalRevenue - totalCost;
  const totalProfit = totalGrossProfit - totalSgnaExpense;
  const avgProfitRate = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
  const totalCostRatio = totalRevenue > 0 ? (totalCost / totalRevenue) * 100 : 0;
  const totalOperatingProfitRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const salePriceCount = useMemo(() => rows.filter(r => r.hasSalePrice).length, [rows]);
  const salePriceRate = rows.length > 0 ? (salePriceCount / rows.length) * 100 : 0;
  const lowMarginCount = useMemo(() => rows.filter(r => r.hasSalePrice && r.operatingProfitRate < 10).length, [rows]);
  const lossCount = useMemo(() => rows.filter(r => r.profit < 0).length, [rows]);

  // Period computations
  const periodTransactions = useMemo(() => transactions.filter(tx => { const d = String(tx.date || ''); return d >= period.from && d <= period.to; }), [transactions, period]);
  const periodSummary = useMemo(() => buildPeriodSummary(periodTransactions, items), [periodTransactions, items]);
  const monthlySeries = useMemo(() => buildMonthlySeries(periodTransactions, items), [periodTransactions, items]);
  const monthlySummary = useMemo(() => getCurrentMonthSummary(transactions), [transactions]);

  // Vendor computations
  const vendorTransactions = useMemo(() => view.vendorType === 'all' ? periodTransactions : periodTransactions.filter(tx => tx.type === view.vendorType), [periodTransactions, view.vendorType]);
  const vendorSummary = useMemo(() => buildVendorSummary(vendorTransactions, items), [vendorTransactions, items]);
  const vendorFiltered = useMemo(() => {
    let list = [...vendorSummary];
    if (view.vendorSort === 'out') list.sort((a, b) => b.totalOut - a.totalOut);
    else if (view.vendorSort === 'in') list.sort((a, b) => b.totalIn - a.totalIn);
    else list.sort((a, b) => b.profit - a.profit);
    if (view.vendorKeyword) { const lk = view.vendorKeyword.toLowerCase(); list = list.filter(r => r.name.toLowerCase().includes(lk)); }
    if (view.vendorLossOnly) list = list.filter(r => r.profit < 0);
    return list;
  }, [vendorSummary, view.vendorSort, view.vendorKeyword, view.vendorLossOnly]);
  const vendorChartRows = vendorFiltered.slice(0, view.vendorLimit);

  // Monthly planner
  const monthlyPlanner = useMemo(() => buildMonthlyPlannerData(transactions, items, planner.year, { salesPlan: planner.salesPlan, costPlan: planner.costPlan, sgnaPlan: planner.sgnaPlan, sgnaActual: planner.sgnaActual }), [transactions, items, planner]);
  const plannerSnapshot = useMemo(() => {
    const m = PROFIT_MONTHS.includes(planner.month) ? planner.month : 1;
    const plan = {}; const actual = {}; const diff = {};
    ['sales','cost','sgna','grossProfit','operatingProfit','operatingProfitRate'].forEach(k => { const pv = toNumber(monthlyPlanner.plan[k]?.[m]); const av = toNumber(monthlyPlanner.actual[k]?.[m]); plan[k] = pv; actual[k] = av; diff[k] = av - pv; });
    return { month: m, plan, actual, diff };
  }, [monthlyPlanner, planner.month]);

  // Chart effects
  useEffect(() => {
    if (trendChartRef.current) renderProfitTrendChart(trendChartRef.current, monthlySeries);
  }, [monthlySeries]);
  useEffect(() => {
    if (vendorChartRef.current) renderVendorProfitChart(vendorChartRef.current, vendorChartRows);
  }, [vendorChartRows]);

  // Period range shortcuts
  const setRange = (value) => {
    const t = toDateKey(now);
    let f;
    if (value === 'month') f = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1));
    else f = toDateKey(addDays(now, -(Number(value) - 1)));
    savePeriod({ from: f, to: t });
  };

  // Planner update
  const updatePlannerMap = (key, month, value) => {
    const nextMap = { ...planner[key], [String(month)]: toNumber(value) };
    savePlanner({ [key]: nextMap });
  };

  // Export
  const handleExport = async (type) => {
    setExportOpen(false);
    const periodLabel = `${period.from}_${period.to}`;
    try {
      if (type === 'summary') {
        downloadExcel([{ 기간: `${period.from}~${period.to}`, '기간 매입 합계': periodSummary.totalIn, '기간 매출 합계': periodSummary.totalOut, '기간 손익': periodSummary.profit, 매출금액: totalRevenue, 매출원가: totalCost, 매출총이익: totalGrossProfit, 영업이익: totalProfit, '매출총이익률(%)': +avgProfitRate.toFixed(2), '영업이익율(%)': +totalOperatingProfitRate.toFixed(2) }], `손익요약_${periodLabel}`);
        showToast('손익 요약 엑셀을 내보냈습니다.', 'success');
      } else if (type === 'items') {
        if (!sortedByProfit.length) { showToast('내보낼 품목 손익 데이터가 없습니다.', 'warning'); return; }
        downloadExcel(sortedByProfit.map(r => ({ 품목명: r.name, 분류: r.category, 수량: r.quantity, 원가: r.unitCost, 판매가: r.salePrice, 매출금액: r.totalRevenue, 매출원가: r.totalCost, 매출총이익: r.grossProfit, 영업이익: r.operatingProfit, '매출총이익률(%)': +r.profitRate.toFixed(2), '영업이익율(%)': +r.operatingProfitRate.toFixed(2) })), `품목손익_${periodLabel}`);
        showToast('품목 손익 엑셀을 내보냈습니다.', 'success');
      } else if (type === 'vendors') {
        if (!vendorFiltered.length) { showToast('내보낼 거래처 손익 데이터가 없습니다.', 'warning'); return; }
        downloadExcel(vendorFiltered.map(r => ({ 거래처: r.name, '거래 수': r.count, 매입: r.totalIn, 매출: r.totalOut, 손익: r.profit, '이익률(%)': +r.profitRate.toFixed(2), '마진율(%)': +r.marginRate.toFixed(2), '최근 거래일': r.lastDate || '-' })), `거래처손익_${periodLabel}`);
        showToast('거래처 손익 엑셀을 내보냈습니다.', 'success');
      } else if (type === 'transactions') {
        if (!periodTransactions.length) { showToast('기간 내 거래가 없어 PDF를 만들 수 없습니다.', 'warning'); return; }
        generateTransactionPDF(periodTransactions, '손익 분석 거래', `${period.from}~${period.to}`);
      } else if (type === 'charts-xlsx') {
        await downloadExcelSheets([{ name: '기간손익', rows: monthlySeries.map(r => ({ 기간: r.label, 매입: r.totalIn, 매출: r.totalOut, 손익: r.profit })) }, { name: '거래처손익', rows: vendorFiltered.map(r => ({ 거래처: r.name, 매입: r.totalIn, 매출: r.totalOut, 손익: r.profit })) }], `손익차트_${periodLabel}`);
      } else if (type === 'charts-pdf') {
        const tc = trendChartRef.current; const vc = vendorChartRef.current;
        if (!tc || !vc) { showToast('차트를 찾을 수 없습니다.', 'warning'); return; }
        const doc = new jsPDF('p', 'pt', 'a4'); await applyKoreanFont(doc);
        const margin = 40; const pw = doc.internal.pageSize.getWidth(); let y = 50;
        doc.setFontSize(14); doc.text(`손익 분석 차트 (${period.from}~${period.to})`, margin, 30);
        [[tc, '기간 손익 흐름'], [vc, '거래처 손익 TOP']].forEach(([canvas, title]) => {
          const img = canvas.toDataURL('image/png', 1); const w = pw - margin * 2; const h = Math.max(160, w * (canvas.height / canvas.width || 0.6));
          doc.setFontSize(11); doc.text(title, margin, y); y += 16; doc.addImage(img, 'PNG', margin, y, w, h); y += h + 24;
        });
        doc.save(`손익차트_${periodLabel}.pdf`);
      }
    } catch (err) { showToast(err.message || '내보내기에 실패했습니다.', 'error'); }
  };

  const downloadChartPng = (ref, name) => {
    if (!ref.current) { showToast('차트를 찾을 수 없습니다.', 'warning'); return; }
    try { const a = document.createElement('a'); a.href = ref.current.toDataURL('image/png'); a.download = `${name}.png`; a.click(); } catch { showToast('저장 실패', 'error'); }
  };

  // Planner row renderer
  const PlannerRow = ({ label, metric, editablePlan, editableActual, planKey, actualKey, percent, snapshot, full }) => {
    const months = full ? PROFIT_MONTHS : null;
    if (!full) {
      const pv = toNumber(snapshot.plan[metric]); const av = toNumber(snapshot.actual[metric]); const dv = toNumber(snapshot.diff[metric]);
      const m = snapshot.month;
      return (
        <tr>
          <td style={{ fontWeight: 700 }}>{label}</td>
          <td className="text-right">
            {editablePlan
              ? <input type="number" className="form-input" style={{ width: '120px', padding: '4px 8px', height: '32px', textAlign: 'right' }} defaultValue={Math.round(pv)} onBlur={e => updatePlannerMap(planKey, m, e.target.value)} />
              : <span>{percent ? fmtPct(pv) : fmtMoney(pv)}</span>}
          </td>
          <td className="text-right">
            {editableActual
              ? <input type="number" className="form-input" style={{ width: '120px', padding: '4px 8px', height: '32px', textAlign: 'right' }} defaultValue={Math.round(av)} onBlur={e => updatePlannerMap(actualKey, m, e.target.value)} />
              : <span>{percent ? fmtPct(av) : fmtMoney(av)}</span>}
          </td>
          <td className="text-right" style={{ fontWeight: 700, color: dv > 0 ? 'var(--success)' : dv < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{percent ? fmtSignedPct(dv) : fmtSigned(dv)}</td>
        </tr>
      );
    }
    return (
      <tr>
        <td style={{ fontWeight: 700 }}>{label}</td>
        {PROFIT_MONTHS.map(m => {
          const pv = toNumber(monthlyPlanner.plan[metric]?.[m]); const av = toNumber(monthlyPlanner.actual[metric]?.[m]); const dv = av - pv;
          return (
            <React.Fragment key={m}>
              <td className="text-right">{editablePlan ? <input type="number" className="form-input" style={{ width: '88px', padding: '4px 6px', height: '30px', textAlign: 'right' }} defaultValue={Math.round(pv)} onBlur={e => updatePlannerMap(planKey, m, e.target.value)} /> : <span>{percent ? fmtPct(pv) : fmtMoney(pv)}</span>}</td>
              <td className="text-right">{editableActual ? <input type="number" className="form-input" style={{ width: '88px', padding: '4px 6px', height: '30px', textAlign: 'right' }} defaultValue={Math.round(av)} onBlur={e => updatePlannerMap(actualKey, m, e.target.value)} /> : <span>{percent ? fmtPct(av) : fmtMoney(av)}</span>}</td>
              <td className="text-right" style={{ fontWeight: 700, color: dv > 0 ? 'var(--success)' : dv < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>{percent ? fmtSignedPct(dv) : fmtSigned(dv)}</td>
            </React.Fragment>
          );
        })}
      </tr>
    );
  };

  const PLANNER_ROWS = [
    { label: '매출금액', metric: 'sales', editablePlan: true, planKey: 'salesPlan' },
    { label: '매출원가', metric: 'cost', editablePlan: true, planKey: 'costPlan' },
    { label: '매출총이익', metric: 'grossProfit' },
    { label: '판관비', metric: 'sgna', editablePlan: true, editableActual: true, planKey: 'sgnaPlan', actualKey: 'sgnaActual' },
    { label: '영업이익', metric: 'operatingProfit' },
    { label: '영업이익율', metric: 'operatingProfitRate', percent: true },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title"> 손익 분석</h1>
          <div className="page-desc">재고 기준 예상 손익과 기간 거래 손익을 한 화면에서 확인합니다.</div>
        </div>
        <div className="page-actions" style={{ gap: '8px' }}>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-outline" onClick={() => setExportOpen(v => !v)}>내보내기 ▾</button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px', zIndex: 50, minWidth: '160px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                {[['summary','손익 요약 엑셀'],['items','품목 손익 엑셀'],['vendors','거래처 손익 엑셀'],['transactions','기간 거래 PDF'],['charts-xlsx','차트 데이터 엑셀'],['charts-pdf','차트 PDF']].map(([t,l]) => (
                  <button key={t} className="btn btn-ghost btn-sm" style={{ width: '100%', textAlign: 'left' }} onClick={() => handleExport(t)}>{l}</button>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-outline" onClick={() => navigate('/inventory')}>재고 화면으로 이동</button>
        </div>
      </div>

      {/* 기간 필터 */}
      <div className="card card-compact" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0 }}>기간</label>
            <input className="form-input" type="date" value={period.from} onChange={e => savePeriod({ ...period, from: e.target.value })} />
            <span style={{ color: 'var(--text-muted)' }}>~</span>
            <input className="form-input" type="date" value={period.to} onChange={e => savePeriod({ ...period, to: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[['7','최근 7일'],['30','최근 30일'],['90','최근 90일'],['month','이번 달']].map(([v, l]) => (
              <button key={v} className="btn btn-outline btn-sm" onClick={() => setRange(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '18px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <div>기간 매입 합계 <strong>{fmtSigned(periodSummary.totalIn)}</strong></div>
          <div>기간 매출 합계 <strong>{fmtSigned(periodSummary.totalOut)}</strong></div>
          <div>기간 손익 <strong style={{ color: periodSummary.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtSigned(periodSummary.profit)}</strong></div>
        </div>
      </div>

      {/* 차트 그리드 */}
      <div className="profit-chart-grid">
        <div className="card">
          <div className="chart-control-row">
            <div><div className="card-title">기간 손익 흐름</div><div className="chart-help-text">기간 내 매입/매출/손익 흐름을 확인합니다.</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => downloadChartPng(trendChartRef, `손익흐름_${period.from}_${period.to}`)}>차트 PNG</button>
          </div>
          <div className="chart-canvas-lg"><canvas ref={trendChartRef} id="profit-trend-chart"></canvas></div>
        </div>
        <div className="card">
          <div className="chart-control-row">
            <div><div className="card-title">거래처 손익 TOP</div><div className="chart-help-text">기간 내 손익 기준 상위 거래처입니다.</div></div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => downloadChartPng(vendorChartRef, `거래처손익_${period.from}_${period.to}`)}>차트 PNG</button>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>정렬</span>
              <select className="filter-select" value={view.vendorSort} onChange={e => saveView({ vendorSort: e.target.value })}>
                <option value="profit">손익</option><option value="out">매출</option><option value="in">매입</option>
              </select>
              <select className="filter-select" value={view.vendorLimit} onChange={e => saveView({ vendorLimit: Number(e.target.value) })}>
                <option value={5}>5곳</option><option value={8}>8곳</option><option value={12}>12곳</option>
              </select>
            </div>
          </div>
          <div className="chart-canvas-lg"><canvas ref={vendorChartRef} id="profit-vendor-chart"></canvas></div>
        </div>
      </div>

      {/* 판매가 입력률 경고 */}
      {salePriceRate < 70 && (
        <div className="alert alert-warning">
           판매가 입력률이 <strong>{fmtPct(salePriceRate)}</strong>입니다. 정확한 손익 분석을 위해 재고 화면에서 판매가를 보완해 주세요.
        </div>
      )}

      {/* KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card"><div className="stat-label">매출금액</div><div className="stat-value text-accent">{fmtMoney(totalRevenue)}</div><div className="stat-change">총판매 {fmtMoney(totalGrossSales)} - 할인 {fmtMoney(totalDiscount)}</div></div>
        <div className="stat-card"><div className="stat-label">매출원가</div><div className="stat-value">{fmtMoney(totalCost)}</div></div>
        <div className="stat-card"><div className="stat-label">매출총이익</div><div className={`stat-value ${totalGrossProfit >= 0 ? 'text-success' : 'text-danger'}`}>{fmtSigned(totalGrossProfit)}</div></div>
        <div className="stat-card"><div className="stat-label">영업이익</div><div className={`stat-value ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>{fmtSigned(totalProfit)}</div><div className="stat-change">판관비 {fmtMoney(totalSgnaExpense)} 반영</div></div>
        <div className="stat-card"><div className="stat-label">매출총이익률</div><div className={`stat-value ${avgProfitRate >= 0 ? 'text-success' : 'text-danger'}`}>{fmtPct(avgProfitRate)}</div></div>
        <div className="stat-card"><div className="stat-label">매출원가율</div><div className={`stat-value ${totalCostRatio <= 80 ? 'text-success' : 'text-danger'}`}>{fmtPct(totalCostRatio)}</div></div>
        <div className="stat-card"><div className="stat-label">영업이익율</div><div className={`stat-value ${totalOperatingProfitRate >= 0 ? 'text-success' : 'text-danger'}`}>{fmtPct(totalOperatingProfitRate)}</div></div>
        <div className="stat-card"><div className="stat-label">판매가 입력률</div><div className={`stat-value ${salePriceRate >= 70 ? 'text-success' : 'text-warning'}`}>{fmtPct(salePriceRate)}</div><div className="stat-change">{salePriceCount}/{rows.length}품목</div></div>
        <div className="stat-card"><div className="stat-label">주의 품목</div><div className={`stat-value ${lowMarginCount + lossCount > 0 ? 'text-danger' : 'text-success'}`}>{lowMarginCount + lossCount}건</div><div className="stat-change">저마진 {lowMarginCount}건 · 손실 {lossCount}건</div></div>
      </div>

      {/* 계산식 보기 */}
      <details className="card card-compact" style={{ marginTop: '12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}> 계산식 보기 (이익률/원가율 기준)</summary>
        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>매출금액 = (판매단가 × 수량) - 할인금액</div>
          <div>매출원가 = 원가단가 × 수량</div>
          <div>매출총이익 = 매출금액 - 매출원가</div>
          <div>매출총이익률 = 매출총이익 / 매출금액 × 100</div>
          <div>영업이익 = 매출총이익 - 판관비</div>
          <div>영업이익율 = 영업이익 / 매출금액 × 100</div>
        </div>
      </details>

      {/* 월별 플래너 */}
      <div className="card card-compact" style={{ marginTop: '12px' }}>
        <div className="card-title" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span>월별 계획/실적/차이 (영업이익 자동 계산)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>기준연도</span>
            <select className="filter-select" value={planner.year} onChange={e => savePlanner({ year: Number(e.target.value) || curYear })}>
              {[planner.year - 1, planner.year, planner.year + 1].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="filter-select" value={planner.month} onChange={e => savePlanner({ month: Number(e.target.value) || 1 })}>
              {PROFIT_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
        </div>

        {/* 스냅샷 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '10px' }}>
          {[['매출총이익', 'grossProfit', false], ['영업이익', 'operatingProfit', false], ['영업이익율', 'operatingProfitRate', true]].map(([label, metric, pct]) => (
            <div key={metric} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>{label} ({planner.month}월)</div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>실적 {pct ? fmtPct(plannerSnapshot.actual[metric]) : fmtMoney(plannerSnapshot.actual[metric])}</span>
                <span style={{ fontSize: '12px', color: plannerSnapshot.diff[metric] >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pct ? fmtSignedPct(plannerSnapshot.diff[metric]) : fmtSigned(plannerSnapshot.diff[metric])}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 컴팩트 테이블 */}
        <div className="table-wrapper" style={{ border: 'none', overflow: 'auto' }}>
          <table className="data-table" style={{ minWidth: '720px' }}>
            <thead><tr><th>구분</th><th className="text-right">계획</th><th className="text-right">실적</th><th className="text-right">차이</th></tr></thead>
            <tbody>
              {PLANNER_ROWS.map(r => <PlannerRow key={r.label} {...r} snapshot={plannerSnapshot} full={false} />)}
            </tbody>
          </table>
        </div>

        {/* 전체 12개월 */}
        <details style={{ marginTop: '10px' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '12px' }}>전체 12개월 표 펼치기</summary>
          <div className="table-wrapper" style={{ border: 'none', overflow: 'auto', marginTop: '8px' }}>
            <table className="data-table" style={{ minWidth: '1500px' }}>
              <thead>
                <tr>
                  <th rowSpan={2}>구분</th>
                  {PROFIT_MONTHS.map(m => <th key={m} colSpan={3} className="text-center">{m}월</th>)}
                </tr>
                <tr>
                  {PROFIT_MONTHS.map(m => <React.Fragment key={m}><th className="text-right">계획</th><th className="text-right">실적</th><th className="text-right">차이</th></React.Fragment>)}
                </tr>
              </thead>
              <tbody>
                {PLANNER_ROWS.map(r => <PlannerRow key={r.label} {...r} snapshot={plannerSnapshot} full={true} />)}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* 탭 */}
      <div className="tabs">
        <button className={`tab-btn ${view.tab === 'items' ? 'active' : ''}`} onClick={() => saveView({ tab: 'items' })}>품목 손익</button>
        <button className={`tab-btn ${view.tab === 'vendors' ? 'active' : ''}`} onClick={() => saveView({ tab: 'vendors' })}>거래처 손익</button>
      </div>

      {/* 품목 손익 탭 */}
      {view.tab === 'items' && (
        <>
          <div className="card" style={{ paddingBottom: '8px' }}>
            <div className="card-title">한눈에 보는 핵심 포인트</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
              {[
                { title: '수익 상위 품목 TOP 5', data: topProfit, render: (r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: i < topProfit.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>영업이익율 {fmtPct(r.operatingProfitRate)} · {r.quantity.toLocaleString('ko-KR')}개</div></div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--success)' }}>{fmtSigned(r.profit)}</div>
                  </div>
                )},
                { title: '주의 필요 품목 TOP 5', data: riskRows, empty: '판매가가 입력된 품목이 없습니다.', render: (r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: i < riskRows.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>개당 {fmtSigned(r.salePrice - r.unitCost)}</div></div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: r.operatingProfitRate < 10 ? 'var(--danger)' : 'var(--warning)' }}>{fmtPct(r.operatingProfitRate)}</div>
                  </div>
                )},
                { title: '카테고리 수익 TOP 5', data: categorySummary, render: (r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', borderBottom: i < categorySummary.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.count}품목 · 이익률 {fmtPct(r.rate)}</div></div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: r.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtSigned(r.profit)}</div>
                  </div>
                )},
              ].map(section => (
                <div key={section.title} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>{section.title}</div>
                  {section.data.length === 0 ? <div style={{ padding: '10px 0', fontSize: '12px', color: 'var(--text-muted)' }}>{section.empty || '데이터가 없습니다.'}</div> : section.data.map((r, i) => section.render(r, i))}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">품목별 손익 상세 <span className="card-subtitle">{rows.length.toLocaleString('ko-KR')}개 품목</span></div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr><th>#</th><th className="col-fill">품목명</th><th>분류</th><th className="text-right">수량</th><th className="text-right">원가</th><th className="text-right">판매가</th><th className="text-right">개당 이익</th><th className="text-right">매출총이익</th><th className="text-right">영업이익</th><th className="text-right">매출총이익률</th><th className="text-right">매출원가율</th><th className="text-right">영업이익율</th><th className="text-center">상태</th></tr>
                </thead>
                <tbody>
                  {sortedByProfit.length === 0 ? (
                    <tr><td colSpan={13} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>손익을 계산할 재고 데이터가 없습니다.</td></tr>
                  ) : sortedByProfit.map((row, idx) => {
                    const ppu = row.salePrice - row.unitCost;
                    return (
                      <tr key={idx} className={row.profit < 0 ? 'row-danger' : row.operatingProfitRate < 10 ? 'row-warning' : ''}>
                        <td className="col-num">{idx + 1}</td>
                        <td className="col-fill"><strong>{row.name}</strong>{row.code && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.code}</div>}</td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.category}</td>
                        <td className="text-right">{row.quantity.toLocaleString('ko-KR')}</td>
                        <td className="text-right">{fmtMoney(row.unitCost)}</td>
                        <td className="text-right">{fmtMoney(row.salePrice)}{!row.hasSalePrice && <span style={{ fontSize: '10px', color: 'var(--warning)', marginLeft: '4px' }}>추정</span>}</td>
                        <td className={`text-right ${ppu >= 0 ? 'type-in' : 'type-out'}`}>{fmtSigned(ppu)}</td>
                        <td className={`text-right ${row.grossProfit >= 0 ? 'type-in' : 'type-out'}`}>{fmtSigned(row.grossProfit)}</td>
                        <td className={`text-right ${row.operatingProfit >= 0 ? 'type-in' : 'type-out'}`}>{fmtSigned(row.operatingProfit)}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: row.profitRate >= 10 ? 'var(--success)' : 'var(--warning)' }}>{fmtPct(row.profitRate)}</td>
                        <td className="text-right" style={{ color: row.costRatio <= 80 ? 'var(--success)' : 'var(--danger)' }}>{fmtPct(row.costRatio)}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: getTone(row.operatingProfitRate) }}>{fmtPct(row.operatingProfitRate)}</td>
                        <td className="text-center"><span className={`badge ${row.profit < 0 ? 'badge-danger' : row.operatingProfitRate < 10 ? 'badge-warning' : 'badge-success'}`}>{row.profit < 0 ? '손실' : row.operatingProfitRate < 10 ? '주의' : '양호'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 거래처 손익 탭 */}
      {view.tab === 'vendors' && (
        <>
          <div className="card card-compact" style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
              <input className="form-input" placeholder="거래처 검색" value={view.vendorKeyword} onChange={e => saveView({ vendorKeyword: e.target.value })} />
              <select className="filter-select" value={view.vendorType} onChange={e => saveView({ vendorType: e.target.value })}>
                <option value="all">전체 거래</option><option value="in">매입만</option><option value="out">매출만</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px' }}>
                <input type="checkbox" checked={view.vendorLossOnly} onChange={e => saveView({ vendorLossOnly: e.target.checked })} /> 손실 거래처만
              </label>
              <button className="btn btn-ghost btn-sm" onClick={() => saveView({ vendorKeyword: '', vendorLossOnly: false, vendorType: 'all' })}>필터 초기화</button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">거래처별 손익 상세</div>
            <div className="table-wrapper" style={{ border: 'none' }}>
              <table className="data-table">
                <thead><tr><th>#</th><th className="col-fill">거래처</th><th className="text-right">거래 수</th><th className="text-right">매입</th><th className="text-right">매출</th><th className="text-right">손익</th><th className="text-right">이익률</th><th className="text-right">마진율</th><th className="text-right">최근 거래</th></tr></thead>
                <tbody>
                  {vendorFiltered.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '28px 0' }}>기간 내 거래처 손익 데이터가 없습니다.</td></tr>
                  ) : vendorFiltered.map((row, idx) => (
                    <tr key={idx}>
                      <td className="col-num">{idx + 1}</td>
                      <td className="col-fill">{row.name}</td>
                      <td className="text-right">{row.count.toLocaleString('ko-KR')}</td>
                      <td className="text-right">{fmtMoney(row.totalIn)}</td>
                      <td className="text-right">{fmtMoney(row.totalOut)}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: row.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtSigned(row.profit)}</td>
                      <td className="text-right">{fmtPct(row.profitRate)}</td>
                      <td className="text-right">{fmtPct(row.marginRate)}</td>
                      <td className="text-right">{row.lastDate || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* 이번 달 요약 */}
      <div className="card card-compact" style={{ marginBottom: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>이번 달 입·출고 손익 (거래기준)</div>
            <div style={{ marginTop: '6px', fontSize: '13px', lineHeight: 1.7 }}>
              <div>매입: <strong>{fmtMoney(monthlySummary.totalIn)}</strong></div>
              <div>매출: <strong>{fmtMoney(monthlySummary.totalOut)}</strong></div>
              <div>거래 손익: <strong style={{ color: monthlySummary.profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtSigned(monthlySummary.profit)}</strong></div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>해석 기준</div>
            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              <div>기간 손익은 거래 내역 기준, 품목 손익은 현재 재고 기준으로 계산됩니다.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
