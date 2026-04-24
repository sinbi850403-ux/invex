/**
 * page-forecast.js - AI 수요 예측
 * 
 * 역할: 과거 출고 패턴을 분석하여 다음 달 예상 수요량을 품목별로 예측
 * 왜 필요? → "다음 달에 뭘 얼마나 준비해야 하지?"를 자동으로 답해주는 핵심 기능
 * 
 * 예측 알고리즘: 이동평균 + 추세선 (단순하지만 효과적)
 * - 최근 3개월 출고 데이터의 가중 이동평균
 * - 추세(증가/감소)를 반영하여 다음 달 예상
 */

import { getState } from './store.js';
import { showToast } from './toast.js';

export function renderForecastPage(container, navigateTo) {
  const state = getState();
  const transactions = state.transactions || [];
  const items = state.mappedData || [];

  const now = new Date();
  const nextMonth = now.getMonth() + 2; // 다음 달 (0-indexed + 1 + 1)
  const nextMonthLabel = nextMonth > 12 ? '1월' : `${nextMonth}월`;
  const nextYear = nextMonth > 12 ? now.getFullYear() + 1 : now.getFullYear();

  // 품목별 예측 생성
  const forecasts = [];

  // 출고가 있는 품목만 예측 대상
  const outItems = new Set(transactions.filter(tx => tx.type === 'out').map(tx => tx.itemName));

  outItems.forEach(itemName => {
    if (!itemName) return;

    // 최근 6개월 월별 출고량 수집
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

    // 가중 이동평균 (최근 월일수록 가중치 높음)
    const weights = [1, 1.5, 2, 2.5, 3, 4]; // 6개월 전 ~ 이번 달
    const weightSum = weights.reduce((s, w) => s + w, 0);
    const weightedAvg = monthlyOut.reduce((s, m, i) => s + m.qty * weights[i], 0) / weightSum;

    // 추세 계산 (최근 3개월 기울기)
    // 기울기 = (마지막 - 처음) / 구간수. 3개월이면 구간 수는 2 (length-1).
    // length로 나누면 33% 과소평가됨 → (length - 1) 사용.
    const recent3 = monthlyOut.slice(-3).map(m => m.qty);
    const trend = recent3.length >= 2
      ? (recent3[recent3.length - 1] - recent3[0]) / (recent3.length - 1)
      : 0;

    // 예측값 = 가중평균 + 추세
    const predicted = Math.max(0, Math.round(weightedAvg + trend));

    // 현재 재고
    const item = items.find(it => it.itemName === itemName);
    const currentStock = item ? (parseFloat(item.quantity) || 0) : 0;
    const needToOrder = Math.max(0, predicted - currentStock);

    // 신뢰도 (데이터가 많을수록 높음)
    const dataPoints = monthlyOut.filter(m => m.qty > 0).length;
    const confidence = dataPoints >= 5 ? 'high' : dataPoints >= 3 ? 'medium' : 'low';

    forecasts.push({
      itemName,
      monthlyOut,
      predicted,
      currentStock,
      needToOrder,
      confidence,
      trend: trend > 0.5 ? 'up' : trend < -0.5 ? 'down' : 'stable',
      avgMonthly: Math.round(monthlyOut.reduce((s, m) => s + m.qty, 0) / 6),
    });
  });

  // 예측량 높은 순 정렬
  forecasts.sort((a, b) => b.predicted - a.predicted);

  const confidenceLabels = {
    high: { text: '높음', color: 'var(--success)', icon: '' },
    medium: { text: '보통', color: '#d29922', icon: '' },
    low: { text: '낮음', color: 'var(--text-muted)', icon: '' },
  };

  const trendLabels = {
    up: { text: '증가', icon: '', color: 'var(--success)' },
    down: { text: '감소', icon: '', color: 'var(--danger)' },
    stable: { text: '안정', icon: '', color: 'var(--text-muted)' },
  };

  // 예상 총 발주 금액
  const totalOrderQty = forecasts.reduce((s, f) => s + f.needToOrder, 0);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">AI 수요 예측</h1>
        <div class="page-desc">${nextYear}년 ${nextMonthLabel} 예상 수요량을 분석합니다. (최근 6개월 출고 패턴 기반)</div>
      </div>
    </div>

    <!-- KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">예측 대상 품목</div>
        <div class="stat-value text-accent">${forecasts.length}개</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">발주 필요 품목</div>
        <div class="stat-value text-danger">${forecasts.filter(f => f.needToOrder > 0).length}개</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 예상 소비량</div>
        <div class="stat-value">${forecasts.reduce((s, f) => s + f.predicted, 0).toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">수요 증가 품목</div>
        <div class="stat-value" style="color:var(--success);">${forecasts.filter(f => f.trend === 'up').length}개</div>
      </div>
    </div>

    ${forecasts.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <div class="icon">🔮</div>
          <div class="msg">예측할 데이터가 아직 없습니다</div>
          <div class="sub">출고 이력이 쌓이면 자동으로 수요를 예측합니다.<br/>입출고 관리에서 출고를 기록해주세요.</div>
        </div>
      </div>
    ` : `
      <!-- 예측 테이블 -->
      <div class="card">
        <div class="card-title">🔮 ${nextYear}년 ${nextMonthLabel} 수요 예측
          <span class="card-subtitle">${forecasts.length}개 품목</span>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>품목명</th>
                <th>최근 6개월 추이</th>
                <th>월평균</th>
                <th>추세</th>
                <th class="text-right" style="color:var(--accent); font-weight:700;">예측 수량</th>
                <th class="text-right">현재고</th>
                <th class="text-right">발주 필요</th>
                <th>신뢰도</th>
              </tr>
            </thead>
            <tbody>
              ${forecasts.map(f => {
                const c = confidenceLabels[f.confidence];
                const t = trendLabels[f.trend];
                const maxQty = Math.max(...f.monthlyOut.map(m => m.qty), 1);

                return `
                  <tr>
                    <td><strong>${f.itemName}</strong></td>
                    <td style="min-width:140px;">
                      <div style="display:flex; align-items:end; gap:2px; height:30px;">
                        ${f.monthlyOut.map(m => `
                          <div title="${m.label}: ${m.qty}개" style="
                            flex:1; min-width:4px; background:var(--accent); opacity:0.7;
                            height:${Math.max(2, (m.qty / maxQty) * 28)}px; border-radius:2px 2px 0 0;
                          "></div>
                        `).join('')}
                      </div>
                      <div style="display:flex; justify-content:space-between; font-size:9px; color:var(--text-muted); margin-top:2px;">
                        <span>${f.monthlyOut[0]?.label}</span>
                        <span>${f.monthlyOut[f.monthlyOut.length - 1]?.label}</span>
                      </div>
                    </td>
                    <td class="text-right">${f.avgMonthly}</td>
                    <td>
                      <span style="color:${t.color}; font-size:12px; font-weight:600;">
                        ${t.icon} ${t.text}
                      </span>
                    </td>
                    <td class="text-right" style="font-size:16px; font-weight:700; color:var(--accent);">${f.predicted}</td>
                    <td class="text-right" style="font-weight:600; ${f.currentStock < f.predicted ? 'color:var(--danger);' : ''}">${f.currentStock}</td>
                    <td class="text-right" style="font-weight:700; ${f.needToOrder > 0 ? 'color:var(--danger);' : 'color:var(--success);'}">
                      ${f.needToOrder > 0 ? `+${f.needToOrder}` : '충분'}
                    </td>
                    <td>
                      <span style="font-size:11px;">${c.icon} ${c.text}</span>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 예측 설명 -->
      <div class="card" style="border-left:3px solid var(--accent);">
        <div class="card-title">💡 예측 알고리즘 설명</div>
        <div style="font-size:13px; color:var(--text-muted); line-height:1.8;">
          <ul style="margin:0; padding-left:16px;">
            <li><strong>가중 이동평균</strong>: 최근 6개월 출고량에 가중치를 부여 (최근일수록 높은 가중치)</li>
            <li><strong>추세 반영</strong>: 최근 3개월의 증가/감소 추세를 예측에 반영</li>
            <li><strong>신뢰도</strong>: 데이터가 5개월 이상이면 높음, 3개월 이상이면 보통, 미만이면 낮음</li>
            <li><strong>발주 필요</strong>: 예측 수량 > 현재고인 경우 차이만큼 발주 필요</li>
          </ul>
        </div>
      </div>
    `}
  `;
}
