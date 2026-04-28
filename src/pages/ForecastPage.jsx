/**
 * ForecastPage.jsx - 수요 예측
 *
 * 최근 6개월 출고 데이터의 가중 이동평균 + 추세 반영
 */
import React, { useMemo } from 'react';
import { useStore } from '../hooks/useStore.js';

const CONFIDENCE_LABELS = {
  high:   { text: '높음', color: 'var(--success)', icon: '' },
  medium: { text: '보통', color: '#d29922',         icon: '' },
  low:    { text: '낮음', color: 'var(--text-muted)', icon: '' },
};
const TREND_LABELS = {
  up:     { text: '증가', icon: '', color: 'var(--success)' },
  down:   { text: '감소', icon: '', color: 'var(--danger)' },
  stable: { text: '안정', icon: '', color: 'var(--text-muted)' },
};

/** 미니 바차트 */
function SparkBar({ monthlyOut }) {
  const maxQty = Math.max(...monthlyOut.map(m => m.qty), 1);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'end', gap: '2px', height: '30px' }}>
        {monthlyOut.map((m, i) => (
          <div
            key={i}
            title={`${m.label}: ${m.qty}개`}
            style={{
              flex: 1, minWidth: '4px', background: 'var(--accent)', opacity: 0.7,
              height: `${Math.max(2, (m.qty / maxQty) * 28)}px`,
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
        <span>{monthlyOut[0]?.label}</span>
        <span>{monthlyOut[monthlyOut.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export default function ForecastPage() {
  const [state] = useStore();

  const { forecasts, nextMonthLabel, nextYear } = useMemo(() => {
    const transactions = state.transactions || [];
    const items = state.mappedData || [];

    const now = new Date();
    const nextMonthNum = now.getMonth() + 2;
    const nextMonthLabel = nextMonthNum > 12 ? '1월' : `${nextMonthNum}월`;
    const nextYear = nextMonthNum > 12 ? now.getFullYear() + 1 : now.getFullYear();

    const outItems = new Set(transactions.filter(tx => tx.type === 'out').map(tx => tx.itemName));
    const forecasts = [];

    outItems.forEach(itemName => {
      if (!itemName) return;

      const monthlyOut = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const qty = transactions
          .filter(tx => tx.type === 'out' && tx.itemName === itemName && (tx.date || '').startsWith(prefix))
          .reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
        monthlyOut.push({ month: d.getMonth() + 1, year: d.getFullYear(), qty, label: `${d.getMonth() + 1}월` });
      }

      const weights = [1, 1.5, 2, 2.5, 3, 4];
      const weightSum = weights.reduce((s, w) => s + w, 0);
      const weightedAvg = monthlyOut.reduce((s, m, i) => s + m.qty * weights[i], 0) / weightSum;

      const recent3 = monthlyOut.slice(-3).map(m => m.qty);
      const trend = recent3.length >= 2
        ? (recent3[recent3.length - 1] - recent3[0]) / (recent3.length - 1)
        : 0;

      const predicted = Math.max(0, Math.round(weightedAvg + trend));
      const item = items.find(it => it.itemName === itemName);
      const currentStock = item ? (parseFloat(item.quantity) || 0) : 0;
      const needToOrder = Math.max(0, predicted - currentStock);
      const dataPoints = monthlyOut.filter(m => m.qty > 0).length;
      const confidence = dataPoints >= 5 ? 'high' : dataPoints >= 3 ? 'medium' : 'low';

      forecasts.push({
        itemName, monthlyOut, predicted, currentStock, needToOrder, confidence,
        trend: trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : 'stable',
        avgMonthly: Math.round(monthlyOut.reduce((s, m) => s + m.qty, 0) / 6),
      });
    });

    forecasts.sort((a, b) => b.predicted - a.predicted);
    return { forecasts, nextMonthLabel, nextYear };
  }, [state.transactions, state.mappedData]);

  const totalPredicted = forecasts.reduce((s, f) => s + f.predicted, 0);
  const needOrderCount = forecasts.filter(f => f.needToOrder > 0).length;
  const trendUpCount = forecasts.filter(f => f.trend === 'up').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">수요 예측</h1>
          <div className="page-desc">{nextYear}년 {nextMonthLabel} 예상 수요량을 분석합니다. (최근 6개월 출고 패턴 기반)</div>
        </div>
      </div>

      {/* KPI */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">예측 대상 품목</div>
          <div className="stat-value text-accent">{forecasts.length}개</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">발주 필요 품목</div>
          <div className="stat-value text-danger">{needOrderCount}개</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">총 예상 소비량</div>
          <div className="stat-value">{totalPredicted.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">수요 증가 품목</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{trendUpCount}개</div>
        </div>
      </div>

      {forecasts.length === 0 ? (
        <div className="card" style={{ marginTop: '16px' }}>
          <div className="empty-state">
            <div className="icon"></div>
            <div className="msg">예측할 데이터가 아직 없습니다</div>
            <div className="sub">출고 이력이 쌓이면 자동으로 수요를 예측합니다.<br />입출고 관리에서 출고를 기록해주세요.</div>
          </div>
        </div>
      ) : (
        <>
          {/* 예측 테이블 */}
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="card-title">
               {nextYear}년 {nextMonthLabel} 수요 예측
              <span className="card-subtitle">{forecasts.length}개 품목</span>
            </div>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>품목명</th>
                    <th data-auto-sort-ignore="true">최근 6개월 추이</th>
                    <th>월평균</th>
                    <th>추세</th>
                    <th className="text-right" style={{ color: 'var(--accent)', fontWeight: '700' }}>예측 수량</th>
                    <th className="text-right">현재고</th>
                    <th className="text-right">발주 필요</th>
                    <th>신뢰도</th>
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map(f => {
                    const c = CONFIDENCE_LABELS[f.confidence];
                    const t = TREND_LABELS[f.trend];
                    return (
                      <tr key={f.itemName}>
                        <td><strong>{f.itemName}</strong></td>
                        <td style={{ minWidth: '140px' }}><SparkBar monthlyOut={f.monthlyOut} /></td>
                        <td className="text-right">{f.avgMonthly}</td>
                        <td>
                          <span style={{ color: t.color, fontSize: '12px', fontWeight: '600' }}>
                            {t.icon} {t.text}
                          </span>
                        </td>
                        <td className="text-right" style={{ fontSize: '16px', fontWeight: '700', color: 'var(--accent)' }}>{f.predicted}</td>
                        <td className="text-right" style={{ fontWeight: '600', color: f.currentStock < f.predicted ? 'var(--danger)' : undefined }}>{f.currentStock}</td>
                        <td className="text-right" style={{ fontWeight: '700', color: f.needToOrder > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {f.needToOrder > 0 ? `+${f.needToOrder}` : '충분'}
                        </td>
                        <td><span style={{ fontSize: '11px' }}>{c.icon} {c.text}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 알고리즘 설명 */}
          <div className="card" style={{ borderLeft: '3px solid var(--accent)' }}>
            <div className="card-title"> 예측 알고리즘 설명</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.8' }}>
              <ul style={{ margin: '0', paddingLeft: '16px' }}>
                <li><strong>가중 이동평균</strong>: 최근 6개월 출고량에 가중치를 부여 (최근일수록 높은 가중치)</li>
                <li><strong>추세 반영</strong>: 최근 3개월의 증가/감소 추세를 예측에 반영</li>
                <li><strong>신뢰도</strong>: 데이터가 5개월 이상이면 높음, 3개월 이상이면 보통, 미만이면 낮음</li>
                <li><strong>발주 필요</strong>: 예측 수량 &gt; 현재고인 경우 차이만큼 발주 필요</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
