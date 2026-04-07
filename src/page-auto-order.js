/**
 * page-auto-order.js - 자동 발주 추천
 * 
 * 역할: 안전재고 부족 품목을 감지하고, 과거 입고 이력 기반으로
 *       최적 거래처·수량·단가를 추천하여 1클릭 발주서 생성까지 연결
 * 왜 필요? → "오늘 뭘 주문해야 하지?"를 자동으로 알려주는 핵심 기능
 */

import { getState } from './store.js';
import { showToast } from './toast.js';

export function renderAutoOrderPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};
  const vendors = state.vendorMaster || [];

  // === 발주 추천 대상 품목 찾기 ===
  const recommendations = [];

  items.forEach(item => {
    const name = item.itemName;
    const currentQty = parseFloat(item.quantity) || 0;
    const minQty = safetyStock[name];

    // 안전재고가 설정되어 있고, 현재 재고가 부족한 경우
    if (minQty === undefined || currentQty > minQty) return;

    // 과거 입고 이력에서 최적 거래처·단가 추천
    const inHistory = transactions.filter(tx => tx.type === 'in' && tx.itemName === name);
    const bestVendor = findBestVendor(inHistory);
    const avgOrderQty = calcAvgOrderQty(inHistory);
    const recommendQty = Math.max(avgOrderQty, (minQty - currentQty) * 2); // 부족분의 2배 추천

    // 소진 예상일 계산
    const dailyUsage = calcDailyUsage(name, transactions);
    const daysUntilEmpty = dailyUsage > 0 ? Math.ceil(currentQty / dailyUsage) : null;

    recommendations.push({
      itemName: name,
      itemCode: item.itemCode || '-',
      category: item.category || '-',
      currentQty,
      minQty,
      shortage: minQty - currentQty,
      urgency: currentQty <= 0 ? 'critical' : currentQty <= minQty * 0.5 ? 'high' : 'medium',
      bestVendor: bestVendor.name,
      bestPrice: bestVendor.price,
      recommendQty: Math.ceil(recommendQty),
      estimatedCost: Math.ceil(recommendQty) * bestVendor.price,
      daysUntilEmpty,
      dailyUsage: Math.round(dailyUsage * 10) / 10,
      lastOrderDate: bestVendor.lastDate || '-',
    });
  });

  // 긴급도 순 정렬
  const urgencyOrder = { critical: 0, high: 1, medium: 2 };
  recommendations.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const urgencyLabels = {
    critical: { text: '긴급', color: 'var(--danger)', bg: 'rgba(248,81,73,0.15)', icon: '🔴' },
    high: { text: '주의', color: '#d29922', bg: 'rgba(210,153,34,0.15)', icon: '🟡' },
    medium: { text: '보통', color: 'var(--info, #58a6ff)', bg: 'rgba(88,166,255,0.15)', icon: '🔵' },
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">🤖</span> 자동 발주 추천</h1>
        <div class="page-desc">안전재고 부족 품목을 감지하여 최적의 발주 정보를 자동 추천합니다.</div>
      </div>
    </div>

    <!-- 요약 KPI -->
    <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));">
      <div class="stat-card">
        <div class="stat-label">발주 필요 품목</div>
        <div class="stat-value text-danger">${recommendations.length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">긴급 (재고 0)</div>
        <div class="stat-value" style="color:var(--danger);">${recommendations.filter(r => r.urgency === 'critical').length}건</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">예상 발주 금액</div>
        <div class="stat-value" style="font-size:18px;">₩${recommendations.reduce((s, r) => s + r.estimatedCost, 0).toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">추천 거래처 수</div>
        <div class="stat-value text-accent">${new Set(recommendations.map(r => r.bestVendor)).size}곳</div>
      </div>
    </div>

    ${recommendations.length === 0 ? `
      <div class="card">
        <div class="empty-state">
          <div class="icon">✅</div>
          <div class="msg">모든 재고가 충분합니다!</div>
          <div class="sub">안전재고를 설정하면 부족 시 자동으로 발주를 추천합니다.<br/>재고 현황 → 품목 편집에서 안전재고를 설정하세요.</div>
        </div>
      </div>
    ` : `
      <!-- 발주 추천 목록 -->
      <div class="card">
        <div class="card-title">📋 발주 추천 목록
          <span class="card-subtitle">${recommendations.length}건</span>
          <button class="btn btn-primary btn-sm" id="btn-create-all-orders" style="float:right;">📄 전체 발주서 생성</button>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th><input type="checkbox" id="check-all" /></th>
                <th>긴급도</th>
                <th>품목명</th>
                <th>현재고</th>
                <th>안전재고</th>
                <th>부족</th>
                <th>소진예상</th>
                <th>추천 거래처</th>
                <th>추천 수량</th>
                <th>예상 단가</th>
                <th>예상 금액</th>
              </tr>
            </thead>
            <tbody>
              ${recommendations.map((r, i) => {
                const u = urgencyLabels[r.urgency];
                return `
                  <tr>
                    <td><input type="checkbox" class="order-check" data-idx="${i}" /></td>
                    <td>
                      <span style="background:${u.bg}; color:${u.color}; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">
                        ${u.icon} ${u.text}
                      </span>
                    </td>
                    <td><strong>${r.itemName}</strong><br/><span style="font-size:11px; color:var(--text-muted);">${r.itemCode}</span></td>
                    <td class="text-right" style="color:${r.currentQty <= 0 ? 'var(--danger)' : 'var(--text-primary)'}; font-weight:600;">${r.currentQty}</td>
                    <td class="text-right">${r.minQty}</td>
                    <td class="text-right" style="color:var(--danger); font-weight:600;">-${r.shortage}</td>
                    <td style="font-size:12px;">
                      ${r.daysUntilEmpty !== null ? `<strong>D-${r.daysUntilEmpty}</strong><br/><span style="color:var(--text-muted);">${r.dailyUsage}개/일</span>` : '-'}
                    </td>
                    <td style="font-size:13px;">${r.bestVendor !== '(없음)' ? `<strong>${r.bestVendor}</strong><br/><span style="font-size:11px; color:var(--text-muted);">최근: ${r.lastOrderDate}</span>` : '<span style="color:var(--text-muted);">미지정</span>'}</td>
                    <td class="text-right" style="font-weight:600; color:var(--accent);">${r.recommendQty}</td>
                    <td class="text-right">₩${r.bestPrice.toLocaleString('ko-KR')}</td>
                    <td class="text-right" style="font-weight:600;">₩${r.estimatedCost.toLocaleString('ko-KR')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight:700;">
                <td colspan="8" style="text-align:right;">합계</td>
                <td class="text-right">${recommendations.reduce((s, r) => s + r.recommendQty, 0)}</td>
                <td></td>
                <td class="text-right">₩${recommendations.reduce((s, r) => s + r.estimatedCost, 0).toLocaleString('ko-KR')}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 추천 근거 -->
      <div class="card" style="border-left:3px solid var(--accent);">
        <div class="card-title">💡 추천 근거</div>
        <div style="font-size:13px; color:var(--text-muted); line-height:1.8;">
          <ul style="margin:0; padding-left:16px;">
            <li><strong>추천 거래처</strong>: 해당 품목의 최근 입고 이력에서 가장 자주 사용한 거래처</li>
            <li><strong>추천 수량</strong>: 과거 평균 발주 수량과 부족분의 2배 중 큰 값</li>
            <li><strong>예상 단가</strong>: 해당 거래처의 최근 입고 단가</li>
            <li><strong>소진예상</strong>: 최근 30일 출고량 기준 일평균 소비량으로 계산</li>
          </ul>
        </div>
      </div>
    `}
  `;

  // === 이벤트 ===
  // 전체 선택
  container.querySelector('#check-all')?.addEventListener('change', (e) => {
    container.querySelectorAll('.order-check').forEach(cb => { cb.checked = e.target.checked; });
  });

  // 전체 발주서 생성 → 문서 생성 페이지로 이동
  container.querySelector('#btn-create-all-orders')?.addEventListener('click', () => {
    showToast('발주서 생성 페이지로 이동합니다.', 'info');
    navigateTo('documents');
  });
}

// === 유틸리티 함수 ===

/**
 * 과거 입고 이력에서 최적 거래처 찾기
 * 기준: 가장 최근에 거래한 거래처 (같은 빈도면 최근 단가가 낮은 쪽)
 */
function findBestVendor(inHistory) {
  if (inHistory.length === 0) return { name: '(없음)', price: 0, lastDate: null };

  const vendorStats = {};
  inHistory.forEach(tx => {
    const v = tx.vendor || '(미지정)';
    if (!vendorStats[v]) vendorStats[v] = { count: 0, lastDate: '', lastPrice: 0 };
    vendorStats[v].count++;
    if ((tx.date || '') > vendorStats[v].lastDate) {
      vendorStats[v].lastDate = tx.date;
      vendorStats[v].lastPrice = parseFloat(tx.unitPrice) || 0;
    }
  });

  // 가장 많이 거래한 거래처
  const best = Object.entries(vendorStats).sort((a, b) => {
    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
    return b[1].lastDate.localeCompare(a[1].lastDate);
  })[0];

  return { name: best[0], price: best[1].lastPrice, lastDate: best[1].lastDate };
}

/**
 * 과거 평균 발주 수량 계산
 */
function calcAvgOrderQty(inHistory) {
  if (inHistory.length === 0) return 10; // 기본값
  const total = inHistory.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  return Math.ceil(total / inHistory.length);
}

/**
 * 일평균 소비량 계산 (최근 30일 출고 기준)
 */
function calcDailyUsage(itemName, transactions) {
  const ago30 = new Date();
  ago30.setDate(ago30.getDate() - 30);
  const ago30Str = ago30.toISOString().split('T')[0];

  const recentOut = transactions.filter(tx =>
    tx.type === 'out' && tx.itemName === itemName && (tx.date || '') >= ago30Str
  );

  const totalOut = recentOut.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
  return totalOut / 30;
}
