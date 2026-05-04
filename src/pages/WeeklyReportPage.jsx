/**
 * WeeklyReportPage.jsx - 주간 경영 보고서
 */
import React, { useMemo, useState, useCallback } from 'react';
import { useStore } from '../hooks/useStore.js';
import { getSalePrice } from '../price-utils.js';
import { generateWeeklyAIReportStream, MODEL } from '../ai-report.js';

// === 유틸리티 ===
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function filterByDateRange(txList, start, end) {
  return txList.filter(tx => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    return d >= start && d < end;
  });
}

function calcTotal(txList, type) {
  return txList
    .filter(tx => tx.type === type)
    .reduce((s, tx) => {
      const qty = parseFloat(tx.quantity) || 0;
      const price = type === 'out'
        ? getSalePrice(tx)
        : (parseFloat(tx.unitPrice) || 0);
      return s + qty * price;
    }, 0);
}

function calcChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 순위 배지 */
function RankBadge({ rank, type }) {
  const isTop = rank < 3;
  const bg = isTop
    ? type === 'out' ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)'
    : 'var(--bg-secondary)';
  const color = isTop ? '#fff' : 'var(--text-muted)';
  return (
    <span style={{
      width: '24px', height: '24px', borderRadius: '50%',
      background: bg, color, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: '700', flexShrink: 0,
    }}>
      {rank + 1}
    </span>
  );
}

/** 마크다운 굵은글씨/헤딩 간단 렌더 */
function renderAIText(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return <div key={i} style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', marginTop: '14px', marginBottom: '4px' }}>{line.replace('## ', '')}</div>;
    }
    if (line.startsWith('- ') || line.match(/^\d+\. /)) {
      return <div key={i} style={{ paddingLeft: '12px', fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>{line}</div>;
    }
    if (line.trim() === '') return <div key={i} style={{ height: '6px' }} />;
    return <div key={i} style={{ fontSize: '13px', lineHeight: '1.8', color: 'var(--text-secondary)' }}>{line}</div>;
  });
}

export default function WeeklyReportPage() {
  const [state] = useStore();
  const [aiReport, setAiReport] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiGeneratedAt, setAiGeneratedAt] = useState(null); // 생성 완료 시각

  const {
    thisWeekSales, thisWeekPurchase,
    salesChange, purchaseChange,
    thisWeekTx, lowStockItems,
    topOutItems, topInItems,
    weekLabel,
  } = useMemo(() => {
    const transactions = state.transactions || [];
    const items = state.mappedData || [];
    const safetyStock = state.safetyStock || {};

    const now = new Date();
    const thisWeekStart = getMonday(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekTx = filterByDateRange(transactions, thisWeekStart, now);
    const lastWeekTx = filterByDateRange(transactions, lastWeekStart, thisWeekStart);

    const thisWeekSales = calcTotal(thisWeekTx, 'out');
    const thisWeekPurchase = calcTotal(thisWeekTx, 'in');
    const lastWeekSales = calcTotal(lastWeekTx, 'out');
    const lastWeekPurchase = calcTotal(lastWeekTx, 'in');
    const salesChange = calcChange(thisWeekSales, lastWeekSales);
    const purchaseChange = calcChange(thisWeekPurchase, lastWeekPurchase);

    const lowStockItems = items.filter(it => {
      const min = safetyStock[it.itemName];
      return min !== undefined && (parseFloat(it.quantity) || 0) <= min;
    });

    const outByItem = {};
    thisWeekTx.filter(tx => tx.type === 'out').forEach(tx => {
      const name = tx.itemName || '-';
      outByItem[name] = (outByItem[name] || 0) + (parseFloat(tx.quantity) || 0);
    });
    const topOutItems = Object.entries(outByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const inByItem = {};
    thisWeekTx.filter(tx => tx.type === 'in').forEach(tx => {
      const name = tx.itemName || '-';
      inByItem[name] = (inByItem[name] || 0) + (parseFloat(tx.quantity) || 0);
    });
    const topInItems = Object.entries(inByItem).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const weekLabel = `${formatDate(thisWeekStart)} ~ ${formatDate(now)}`;

    return { thisWeekSales, thisWeekPurchase, salesChange, purchaseChange, thisWeekTx, lowStockItems, topOutItems, topInItems, weekLabel };
  }, [state.transactions, state.mappedData, state.safetyStock]);

  const handleAIReport = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    setAiReport('');
    setAiGeneratedAt(null);
    try {
      // 이상 탐지 데이터 수집
      const items = state.mappedData || [];
      const anomalies = [];
      items.forEach(item => {
        const cost = parseFloat(item.unitCost || item.unitPrice || 0);
        const sale = parseFloat(item.salePrice || 0);
        if (cost > 0 && sale > 0 && (sale - cost) / sale * 100 < 10) {
          anomalies.push(`마진율 이상: ${item.itemName} (마진 ${Math.round((sale - cost) / sale * 100)}%)`);
        }
      });
      if (salesChange < -30) anomalies.push(`매출 급감: 전주 대비 ${Math.abs(salesChange)}% 감소`);
      if (lowStockItems.length > 3) anomalies.push(`재고 부족 ${lowStockItems.length}개 품목`);

      // 스트리밍: 토큰 수신 시마다 상태 업데이트 → 타이핑 효과
      await generateWeeklyAIReportStream(
        {
          weekLabel, thisWeekSales, thisWeekPurchase,
          salesChange, purchaseChange,
          txCount: thisWeekTx.length,
          lowStockCount: lowStockItems.length,
          topOutItems, topInItems, anomalies,
        },
        (chunk) => {
          setAiLoading(false); // 첫 토큰 도착 시 로딩 스피너 제거
          setAiReport(prev => prev + chunk);
        }
      );
      setAiGeneratedAt(new Date()); // 완료 시각 기록
    } catch (e) {
      setAiError(e.message || 'AI 리포트 생성 중 오류가 발생했습니다.');
    } finally {
      setAiLoading(false);
    }
  }, [weekLabel, thisWeekSales, thisWeekPurchase, salesChange, purchaseChange, thisWeekTx, lowStockItems, topOutItems, topInItems, state.mappedData]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">주간 경영 보고서</h1>
          <div className="page-desc">{weekLabel}</div>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-primary"
            onClick={handleAIReport}
            disabled={aiLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {aiLoading ? (
              <><span style={{ fontSize: '14px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> AI 분석 중...</>
            ) : (
              <> AI 경영 분석</>
            )}
          </button>
        </div>
      </div>

      {/* 주간 KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">이번 주 매출</div>
          <div className="stat-value text-success">₩{thisWeekSales.toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: salesChange >= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
            {salesChange >= 0 ? '▲' : '▼'} 전주 대비 {Math.abs(salesChange)}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번 주 매입</div>
          <div className="stat-value" style={{ color: '#58a6ff' }}>₩{thisWeekPurchase.toLocaleString()}</div>
          <div style={{ fontSize: '11px', color: purchaseChange <= 0 ? 'var(--success)' : 'var(--danger)', marginTop: '4px' }}>
            {purchaseChange >= 0 ? '▲' : '▼'} 전주 대비 {Math.abs(purchaseChange)}%
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">이번 주 거래 건수</div>
          <div className="stat-value text-accent">{thisWeekTx.length}건</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">재고 부족 경고</div>
          <div className={`stat-value${lowStockItems.length > 0 ? ' text-danger' : ''}`}>
            {lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음'}
          </div>
        </div>
      </div>

      {/* TOP 5 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
        <div className="card">
          <div className="card-title"> 이번 주 출고 TOP 5</div>
          {topOutItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>이번 주 출고 내역이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topOutItems.map(([name, qty], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RankBadge rank={i} type="out" />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '600' }}>{name}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent)' }}>{qty}개</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title"> 이번 주 입고 TOP 5</div>
          {topInItems.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '12px' }}>이번 주 입고 내역이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topInItems.map(([name, qty], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <RankBadge rank={i} type="in" />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: '600' }}>{name}</span>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--success)' }}>{qty}개</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 재고 부족 알림 */}
      {lowStockItems.length > 0 && (
        <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid var(--danger)' }}>
          <div className="card-title"> 재고 부족 품목 ({lowStockItems.length}건)</div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="col-fill">품목명</th>
                  <th className="text-right">현재고</th>
                  <th className="text-right">안전재고</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {lowStockItems.slice(0, 10).map(it => {
                  const qty = parseFloat(it.quantity) || 0;
                  const min = state.safetyStock?.[it.itemName];
                  return (
                    <tr key={it.itemName}>
                      <td className="col-fill"><strong>{it.itemName}</strong></td>
                      <td className="text-right" style={{ color: 'var(--danger)', fontWeight: '700' }}>{qty}</td>
                      <td className="text-right">{min}</td>
                      <td style={{ color: 'var(--danger)', fontSize: '12px' }}>
                        {qty === 0 ? ' 재고 없음' : ' 부족'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 인사이트 */}
      <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid var(--accent)' }}>
        <div className="card-title"> 이번 주 인사이트</div>
        <ul style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '2', margin: '0', paddingLeft: '16px' }}>
          {thisWeekTx.length === 0 && <li>이번 주에 등록된 거래가 없습니다. 입출고를 기록해보세요!</li>}
          {salesChange > 20 && <li style={{ color: 'var(--success)' }}> 이번 주 매출이 전주 대비 크게 증가했습니다!</li>}
          {salesChange < -20 && <li style={{ color: 'var(--danger)' }}> 이번 주 매출이 전주 대비 크게 감소했습니다. 원인을 확인해보세요.</li>}
          {lowStockItems.length > 0
            ? <li style={{ color: 'var(--danger)' }}> {lowStockItems.length}개 품목의 재고가 부족합니다. 발주를 검토하세요.</li>
            : <li style={{ color: 'var(--success)' }}> 재고 부족 품목이 없습니다.</li>
          }
          {topOutItems.length > 0 && (
            <li> 이번 주 가장 많이 출고된 품목: <strong>{topOutItems[0][0]}</strong> ({topOutItems[0][1]}개)</li>
          )}
        </ul>
      </div>

      {/* AI 경영 분석 리포트 */}
      {(aiLoading || aiReport || aiError) && (
        <div className="card" style={{ marginTop: '16px', borderLeft: '3px solid #8b5cf6', background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(139,92,246,0.05) 100%)' }}>
          {/* 헤더: AI 배지 + 제목 + (완료 시) 모델/시각 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
            <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <span style={{ background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#fff', fontWeight: '700', letterSpacing: '0.5px' }}>AI</span>
              AI 경영 분석 리포트
              {/* 스트리밍 중 깜빡이는 점 */}
              {aiReport && !aiGeneratedAt && (
                <span style={{ display: 'inline-flex', gap: '3px', marginLeft: '4px' }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: '5px', height: '5px', borderRadius: '50%',
                      background: '#8b5cf6',
                      animation: `aiDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </span>
              )}
            </div>
            {/* 완료 배지: 모델명 + 생성 시각 */}
            {aiGeneratedAt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <span style={{
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)',
                  borderRadius: '4px', padding: '2px 7px', fontWeight: '600', color: '#8b5cf6',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                  </svg>
                  {MODEL}
                </span>
                <span>
                  {aiGeneratedAt.getHours().toString().padStart(2,'0')}:{aiGeneratedAt.getMinutes().toString().padStart(2,'0')} 생성
                </span>
              </div>
            )}
          </div>

          {aiLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>
              <span style={{ fontSize: '18px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              GPT-4o-mini가 경영 데이터를 분석하고 있습니다...
            </div>
          )}
          {aiError && (
            <div style={{ color: 'var(--danger)', fontSize: '13px', padding: '8px 0' }}>
              {aiError}
            </div>
          )}
          {aiReport && (
            <div style={{ padding: '4px 0' }}>
              {renderAIText(aiReport)}
              {/* 스트리밍 중 커서 */}
              {!aiGeneratedAt && (
                <span style={{
                  display: 'inline-block', width: '2px', height: '14px',
                  background: '#8b5cf6', marginLeft: '2px', verticalAlign: 'middle',
                  animation: 'aiCursor 0.8s step-end infinite',
                }} />
              )}
            </div>
          )}
        </div>
      )}

      {/* AI 스트리밍 애니메이션 CSS */}
      <style>{`
        @keyframes aiDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes aiCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
