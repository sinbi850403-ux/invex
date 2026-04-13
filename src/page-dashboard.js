/**
 * page-dashboard.js - 고급 분석 대시보드 페이지
 * ??븷: ABC 遺꾩꽍, ?ш퀬 ?뚯쟾?? ?붾퀎 異붿씠, ?섎텋遺 ??寃쎌쁺 ?섏궗寃곗젙 吏??
 * 왜 필요? → 단순 재고 목록이 아니라 "어떤 품목이 중요한지" 알 수 있어야 진짜 ERP
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';

/**
 * 고급 분석 대시보드 렌더링
 */
export function renderDashboardPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};

  if (items.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="title-icon">📈</span> 고급 분석</h1>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📈</div>
          <div class="msg">분석할 데이터가 없습니다.</div>
          <div class="sub">품목을 등록하면 ABC 분석과 회전율을 바로 확인할 수 있습니다.</div>
        </div>
      </div>
    `;
    return;
  }

  // === 분석 데이터 계산 ===
  const abcData = calcABCAnalysis(items);
  const turnoverData = calcTurnoverRate(items, transactions);
  const monthlyTrend = calcMonthlyTrend(transactions);
  const expiryAlerts = getExpiryAlerts(items);

  // ?듭떖 KPI
  const totalValue = items.reduce((s, r) => s + (parseFloat(r.totalPrice) || 0), 0);
  const totalItems = items.length;
  const avgTurnover = turnoverData.length > 0
    ? (turnoverData.reduce((s, t) => s + t.turnover, 0) / turnoverData.length).toFixed(1)
    : '0';
  const deadStockCount = turnoverData.filter(t => t.turnover === 0).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📈</span> 고급 분석</h1>
        <div class="page-desc">재고 데이터를 바탕으로 운영 판단에 필요한 핵심 지표를 보여줍니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-analysis">분석표 내보내기</button>
      </div>
    </div>

    <!-- KPI 移대뱶 -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">총 재고 가치</div>
        <div class="stat-value text-accent">${totalValue > 0 ? '₩' + Math.round(totalValue).toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">평균 회전율</div>
        <div class="stat-value">${avgTurnover}회</div>
        <div class="stat-change">최근 30일 기준</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">A등급 품목</div>
        <div class="stat-value text-success">${abcData.filter(d => d.grade === 'A').length}개</div>
        <div class="stat-change">가치 상위 80% 차지</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">비활성 재고</div>
        <div class="stat-value ${deadStockCount > 0 ? 'text-danger' : ''}">${deadStockCount}개</div>
        <div class="stat-change">30일간 출고 없음</div>
      </div>
    </div>

    <!-- ABC 遺꾩꽍 -->
    <div class="card">
      <div class="card-title">ABC 분석 <span class="card-subtitle">금액 기준 품목 등급 분류</span></div>
      <div style="display:flex; gap:12px; margin-bottom:16px;">
        <span class="badge badge-success" style="padding:6px 14px;">A등급: 상위 80%</span>
        <span class="badge badge-warning" style="padding:6px 14px;">B등급: 80~95%</span>
        <span class="badge badge-default" style="padding:6px 14px;">C등급: 나머지</span>
      </div>

      <!-- ABC 분석 -->
      <div style="display:flex; height:30px; border-radius:6px; overflow:hidden; margin-bottom:16px;">
        ${(() => {
          const aCount = abcData.filter(d => d.grade === 'A').length;
          const bCount = abcData.filter(d => d.grade === 'B').length;
          const cCount = abcData.filter(d => d.grade === 'C').length;
          const total = abcData.length || 1;
          return `
            <div style="width:${(aCount/total)*100}%; background:var(--success); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:600;">A: ${aCount}</div>
            <div style="width:${(bCount/total)*100}%; background:var(--warning); display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:600;">B: ${bCount}</div>
            <div style="width:${(cCount/total)*100}%; background:#94a3b8; display:flex; align-items:center; justify-content:center; color:#fff; font-size:12px; font-weight:600;">C: ${cCount}</div>
          `;
        })()}
      </div>

      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px;">순위</th>
              <th>등급</th>
              <th>품목명</th>
              <th>코드</th>
              <th class="text-right">수량</th>
              <th class="text-right">금액</th>
              <th class="text-right">누적비중</th>
            </tr>
          </thead>
          <tbody>
            ${abcData.slice(0, 20).map((d, i) => `
              <tr>
                <td style="text-align:center; font-weight:600; color:var(--text-muted);">
                  ${i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                </td>
                <td>
                  <span class="badge ${d.grade === 'A' ? 'badge-success' : d.grade === 'B' ? 'badge-warning' : 'badge-default'}">
                    ${d.grade}
                  </span>
                </td>
                <td><strong>${d.itemName}</strong></td>
                <td style="color:var(--text-muted);">${d.itemCode || '-'}</td>
                <td class="text-right">${parseFloat(d.quantity || 0).toLocaleString('ko-KR')}</td>
                <td class="text-right">${d.totalPrice > 0 ? '₩' + Math.round(d.totalPrice).toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right">
                  <div class="ratio-bar">
                    <div class="ratio-bar-track"><div class="ratio-bar-fill" style="width:${d.cumPercent}%;"></div></div>
                    <span class="ratio-bar-label">${d.cumPercent}%</span>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 재고 회전율 -->
    <div class="card">
      <div class="card-title">재고 회전율 <span class="card-subtitle">최근 30일 출고 기준</span></div>

      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>품목명</th>
              <th>코드</th>
              <th class="text-right">현재 재고</th>
              <th class="text-right">30일 출고량</th>
              <th class="text-right">회전율</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            ${turnoverData.slice(0, 20).map(d => `
              <tr>
                <td><strong>${d.itemName}</strong></td>
                <td style="color:var(--text-muted);">${d.itemCode || '-'}</td>
                <td class="text-right">${d.currentQty.toLocaleString('ko-KR')}</td>
                <td class="text-right">${d.outQty.toLocaleString('ko-KR')}</td>
                <td class="text-right"><strong>${d.turnover.toFixed(1)}</strong></td>
                <td>
                  ${d.turnover === 0
                    ? '<span class="badge badge-danger">비활성</span>'
                    : d.turnover < 1
                      ? '<span class="badge badge-warning">저회전</span>'
                      : '<span class="badge badge-success">정상</span>'
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- 재고 회전율 -->
    ${monthlyTrend.length > 0 ? `
    <div class="card">
      <div class="card-title">월별 입출고 추이</div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${monthlyTrend.map(m => {
          const maxVal = Math.max(...monthlyTrend.map(t => Math.max(t.inQty, t.outQty))) || 1;
          return `
            <div>
              <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:4px;">
                <strong>${m.month}</strong>
                <span>입고 <span class="type-in">${m.inQty.toLocaleString('ko-KR')}</span> | 출고 <span class="type-out">${m.outQty.toLocaleString('ko-KR')}</span></span>
              </div>
              <div style="display:flex; gap:4px;">
                <div style="height:12px; flex:1; background:var(--border-light); border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${(m.inQty/maxVal)*100}%; background:var(--success); border-radius:3px;"></div>
                </div>
                <div style="height:12px; flex:1; background:var(--border-light); border-radius:3px; overflow:hidden;">
                  <div style="height:100%; width:${(m.outQty/maxVal)*100}%; background:var(--danger); border-radius:3px;"></div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <!-- 재고 회전율 -->
    ${expiryAlerts.length > 0 ? `
    <div class="card" style="border-left: 3px solid var(--warning);">
      <div class="card-title" style="color:var(--warning);">유통기한 임박 품목 <span class="badge badge-warning">${expiryAlerts.length}건</span></div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th>품목명</th>
              <th>LOT</th>
              <th class="text-right">수량</th>
              <th>유통기한</th>
              <th>D-Day</th>
            </tr>
          </thead>
          <tbody>
            ${expiryAlerts.map(e => `
              <tr class="${e.daysLeft <= 0 ? 'row-danger' : e.daysLeft <= 7 ? 'row-warning' : ''}">
                <td><strong>${e.itemName}</strong></td>
                <td style="color:var(--text-muted);">${e.lotNumber || '-'}</td>
                <td class="text-right">${parseFloat(e.quantity || 0).toLocaleString('ko-KR')}</td>
                <td>${e.expiryDate}</td>
                <td>
                  ${e.daysLeft <= 0
                    ? '<span class="badge badge-danger">만료</span>'
                    : e.daysLeft <= 7
                      ? `<span class="badge badge-danger">D-${e.daysLeft}</span>`
                      : `<span class="badge badge-warning">D-${e.daysLeft}</span>`
                  }
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}
  `;

  // 분석 내보내기
  container.querySelector('#btn-export-analysis')?.addEventListener('click', () => {
    try {
      const exportData = abcData.map(d => ({
        '등급': d.grade,
        '품목명': d.itemName,
        '품목코드': d.itemCode || '',
        '수량': d.quantity,
        '금액': d.totalPrice,
        '누적비중(%)': d.cumPercent,
      }));
      downloadExcel(exportData, 'ABC분석');
      showToast('ABC 분석표를 내보냈습니다.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// === 분석 데이터 계산 ===

/**
 * ABC 遺꾩꽍 怨꾩궛
 * 왜 ABC? → 파레토 법칙(80/20)에 따라 핵심 품목 식별
 * A: 금액 상위 80%, B: 80~95%, C: 나머지
 */
function calcABCAnalysis(items) {
  const sorted = items
    .map(item => ({
      ...item,
      totalPrice: parseFloat(item.totalPrice) || (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
    }))
    .sort((a, b) => b.totalPrice - a.totalPrice);

  const grandTotal = sorted.reduce((s, r) => s + r.totalPrice, 0) || 1;
  let cumulative = 0;

  return sorted.map(item => {
    cumulative += item.totalPrice;
    const cumPercent = Math.round((cumulative / grandTotal) * 100);
    let grade = 'C';
    if (cumPercent <= 80) grade = 'A';
    else if (cumPercent <= 95) grade = 'B';

    return { ...item, cumPercent, grade };
  });
}

/**
 * 고급 분석 대시보드 렌더링
 * 회전율 = 기간 출고량 / 현재 재고량
 * ?믪쓣?섎줉 ???붾━???덈ぉ, 0?대㈃ 鍮꾪솢??Dead stock)
 */
function calcTurnoverRate(items, transactions) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

  // 최근 30일 출고량 집계
  const outMap = {};
  transactions
    .filter(tx => tx.type === 'out' && tx.date >= cutoff)
    .forEach(tx => {
      const key = tx.itemName;
      outMap[key] = (outMap[key] || 0) + (parseFloat(tx.quantity) || 0);
    });

  return items.map(item => {
    const currentQty = parseFloat(item.quantity) || 0;
    const outQty = outMap[item.itemName] || 0;
    const turnover = currentQty > 0 ? outQty / currentQty : 0;
    return {
      itemName: item.itemName,
      itemCode: item.itemCode || '',
      currentQty,
      outQty,
      turnover,
    };
  }).sort((a, b) => b.turnover - a.turnover);
}

/**
 * 고급 분석 대시보드 렌더링
 */
function calcMonthlyTrend(transactions) {
  if (transactions.length === 0) return [];

  const monthMap = {};
  transactions.forEach(tx => {
    const month = (tx.date || '').substring(0, 7);
    if (!month) return;
    if (!monthMap[month]) monthMap[month] = { month, inQty: 0, outQty: 0 };
    const qty = parseFloat(tx.quantity) || 0;
    if (tx.type === 'in') monthMap[month].inQty += qty;
    else monthMap[month].outQty += qty;
  });

  return Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
}

/**
 * 고급 분석 대시보드 렌더링
 * 30일 이내 만료되는 품목 목록
 */
function getExpiryAlerts(items) {
  const today = new Date();
  return items
    .filter(item => item.expiryDate)
    .map(item => {
      const expiry = new Date(item.expiryDate);
      const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
      return { ...item, daysLeft };
    })
    .filter(item => item.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

