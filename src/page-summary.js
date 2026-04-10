/**
 * page-summary.js - ?붿빟 蹂닿퀬 ?섏씠吏
 * ?ㅻТ 湲곕뒫: 遺꾨쪟蹂?李쎄퀬蹂?湲곌컙蹂?吏묎퀎, ?낆텧怨?異붿씠, ?ш퀬 遺議?寃쎄퀬 紐⑸줉
 */

import { getState } from './store.js';
import { showToast } from './toast.js';
import { downloadExcel } from './excel.js';
import { renderInsightHero } from './ux-toolkit.js';

/**
 * ?붿빟 蹂닿퀬 ?섏씠吏 ?뚮뜑留?
 */
export function renderSummaryPage(container, navigateTo) {
  const state = getState();
  const data = state.mappedData || [];
  const transactions = state.transactions || [];
  const safetyStock = state.safetyStock || {};

  if (data.length === 0 && transactions.length === 0) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><span class="title-icon">📊</span> 요약 보고</h1>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="icon">📊</div>
          <div class="msg">아직 보고할 데이터가 없습니다.</div>
          <div class="sub">파일을 업로드하거나 품목을 등록하면 요약 보고가 자동으로 생성됩니다.</div>
          <br/>
          <button class="btn btn-primary" id="btn-go-upload">파일 업로드하기</button>
        </div>
      </div>
    `;
    container.querySelector('#btn-go-upload')?.addEventListener('click', () => navigateTo('upload'));
    return;
  }

  const summary = buildSummary(data, transactions, safetyStock);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">📊</span> 요약 보고</h1>
        <div class="page-desc">재고 현황과 입출고 통계를 한눈에 확인합니다.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-outline" id="btn-export-summary">요약 보고서 내보내기</button>
        <button class="btn btn-outline" id="btn-print">인쇄</button>
      </div>
    </div>

    ${renderInsightHero({
      eyebrow: '보고 한눈 요약',
      title: '표를 읽기 전에 핵심 숫자와 우선 확인 항목부터 보여줍니다.',
      desc: '총 재고, 부족 품목, 가장 큰 분류, 최근 흐름을 먼저 정리해서 누구나 페이지 맨 위에서 상황을 파악할 수 있게 구성했습니다.',
      tone: summary.warnings.length > 0 ? 'warning' : 'success',
      metrics: [
        { label: '부족 품목', value: summary.warnings.length > 0 ? `${summary.warnings.length}건` : '없음', note: '안전재고 기준 이하 품목 수입니다.', stateClass: summary.warnings.length > 0 ? 'text-danger' : 'text-success' },
        { label: '가장 큰 분류', value: summary.categories[0]?.name || '미분류', note: summary.categories[0] ? `${summary.categories[0].qty.toLocaleString('ko-KR')}개 보유` : '분류 데이터가 아직 없습니다.' },
        { label: '최근 7일 순증감', value: `${(summary.dailyTrend || []).reduce((acc, day) => acc + day.net, 0).toLocaleString('ko-KR')}`, note: '최근 7일 입출고 순증감입니다.' },
        { label: '연결 거래처', value: `${summary.vendors.length}곳`, note: '보고서에 잡히는 거래처 수입니다.' },
      ],
      bullets: [
        summary.warnings.length > 0 ? `부족 품목 ${summary.warnings.length}건은 발주 또는 보충 여부를 먼저 판단하세요.` : '지금은 부족 품목이 없어 운영 상태가 안정적입니다.',
        summary.categories[0] ? `${summary.categories[0].name || '미분류'} 분류가 현재 가장 큰 비중을 차지하고 있습니다.` : '분류를 채우면 보고 정확도가 더 좋아집니다.',
        transactions.length > 0 ? '아래 표는 모두 헤더 클릭 정렬이 가능하므로 원하는 기준으로 바로 다시 볼 수 있습니다.' : '거래 기록이 쌓이면 최근 흐름과 순증감 표가 더 풍부해집니다.',
      ],
    })}

    <!-- ?듭떖 吏??-->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">전체 품목</div>
        <div class="stat-value text-accent">${data.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 수량</div>
        <div class="stat-value">${summary.totalQty.toLocaleString('ko-KR')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">총 재고 금액</div>
        <div class="stat-value text-success">${summary.totalPrice > 0 ? '₩' + Math.round(summary.totalPrice).toLocaleString('ko-KR') : '-'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">분류 수</div>
        <div class="stat-value">${summary.categories.length}</div>
      </div>
    </div>

    <!-- ?ш퀬 遺議?寃쎄퀬 -->
    ${summary.warnings.length > 0 ? `
      <div class="card" style="border-left: 3px solid var(--danger);">
        <div class="card-title" style="color:var(--danger);">
          재고 부족 경고 <span class="badge badge-danger" style="margin-left:8px;">${summary.warnings.length}건</span>
        </div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>품목명</th>
                <th class="text-right">현재 수량</th>
                <th class="text-right">안전재고</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              ${summary.warnings.map(w => `
                <tr class="${w.qty === 0 ? 'row-danger' : 'row-warning'}">
                  <td><strong>${w.name}</strong></td>
                  <td class="text-right">${w.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${w.min.toLocaleString('ko-KR')}</td>
                  <td>
                    ${w.qty === 0
                      ? '<span class="badge badge-danger">재고 없음</span>'
                      : '<span class="badge badge-warning">부족</span>'
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- 遺꾨쪟蹂??쒓컖 李⑦듃 -->
    ${summary.categories.length > 1 ? `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
        <!-- ?꾨꽋 李⑦듃: 遺꾨쪟蹂?湲덉븸 鍮꾩쑉 -->
        <div class="card">
          <div class="card-title">분류별 금액 비중</div>
          <div style="display:flex; align-items:center; gap:24px; padding:8px 0;">
            <div id="donut-chart" style="position:relative; width:140px; height:140px; flex-shrink:0;">
              ${buildDonutChart(summary.categories, summary.totalPrice)}
            </div>
            <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
              ${summary.categories.map((cat, i) => {
                const colors = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#ca8a04'];
                const pct = summary.totalPrice > 0 ? Math.round((cat.price / summary.totalPrice) * 100) : 0;
                return `<div style="display:flex; align-items:center; gap:8px; font-size:13px;">
                  <span style="width:10px; height:10px; border-radius:2px; background:${colors[i % colors.length]}; flex-shrink:0;"></span>
                  <span style="flex:1; color:var(--text-secondary);">${cat.name || '(미분류)'}</span>
                  <strong>${pct}%</strong>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- ?섑룊 諛?李⑦듃: 遺꾨쪟蹂??섎웾 -->
        <div class="card">
          <div class="card-title">분류별 수량 분포</div>
          <div style="display:flex; flex-direction:column; gap:10px; padding:8px 0;">
            ${summary.categories.map((cat, i) => {
              const colors = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#ca8a04'];
              const maxQty = Math.max(...summary.categories.map(c => c.qty));
              const barWidth = maxQty > 0 ? Math.max(2, (cat.qty / maxQty) * 100) : 0;
              return `<div>
                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
                  <span style="color:var(--text-secondary);">${cat.name || '(미분류)'}</span>
                  <strong>${cat.qty.toLocaleString('ko-KR')}</strong>
                </div>
                <div style="height:8px; background:var(--border-light); border-radius:4px; overflow:hidden;">
                  <div style="height:100%; width:${barWidth}%; background:${colors[i % colors.length]}; border-radius:4px; transition:width 0.5s ease;"></div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    ` : ''}

    <!-- 遺꾨쪟蹂??꾪솴 -->
    ${summary.categories.length > 0 ? `
      <div class="card">
        <div class="card-title">분류별 현황</div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>분류</th>
                <th class="text-right">품목 수</th>
                <th class="text-right">총 수량</th>
                <th class="text-right">총 금액</th>
                <th style="width:200px;">비율</th>
              </tr>
            </thead>
            <tbody>
              ${summary.categories.map(cat => `
                <tr>
                  <td><strong>${cat.name || '(미분류)'}</strong></td>
                  <td class="text-right">${cat.count}</td>
                  <td class="text-right">${cat.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${cat.price > 0 ? '₩' + Math.round(cat.price).toLocaleString('ko-KR') : '-'}</td>
                  <td>
                    <div class="ratio-bar">
                      <div class="ratio-bar-track">
                        <div class="ratio-bar-fill" style="width:${cat.ratio}%;"></div>
                      </div>
                      <span class="ratio-bar-label">${cat.ratio}%</span>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- 李쎄퀬/?꾩튂蹂?-->
    ${summary.warehouses.length > 0 ? `
      <div class="card">
        <div class="card-title">창고/위치별 현황</div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>창고/위치</th>
                <th class="text-right">품목 수</th>
                <th class="text-right">총 수량</th>
                <th class="text-right">총 금액</th>
              </tr>
            </thead>
            <tbody>
              ${summary.warehouses.map(wh => `
                <tr>
                  <td><strong>${wh.name || '(미지정)'}</strong></td>
                  <td class="text-right">${wh.count}</td>
                  <td class="text-right">${wh.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${wh.price > 0 ? '₩' + Math.round(wh.price).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- 嫄곕옒泥섎퀎 ?꾪솴 -->
    ${summary.vendors.length > 0 ? `
      <div class="card">
        <div class="card-title">거래처별 현황</div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>거래처</th>
                <th class="text-right">품목 수</th>
                <th class="text-right">총 수량</th>
                <th class="text-right">총 금액</th>
              </tr>
            </thead>
            <tbody>
              ${summary.vendors.map(v => `
                <tr>
                  <td><strong>${v.name || '(미지정)'}</strong></td>
                  <td class="text-right">${v.count}</td>
                  <td class="text-right">${v.qty.toLocaleString('ko-KR')}</td>
                  <td class="text-right">${v.price > 0 ? '₩' + Math.round(v.price).toLocaleString('ko-KR') : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- ?낆텧怨?理쒓렐 ?숉뼢 -->
    ${transactions.length > 0 ? `
      <div class="card">
        <div class="card-title">최근 입출고 동향 <span class="card-subtitle">(최근 7일)</span></div>
        <div class="table-wrapper" style="border:none;">
          <table class="data-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th class="text-right">입고 건수</th>
                <th class="text-right">입고 수량</th>
                <th class="text-right">출고 건수</th>
                <th class="text-right">출고 수량</th>
                <th class="text-right">순증감</th>
              </tr>
            </thead>
            <tbody>
              ${summary.dailyTrend.map(day => `
                <tr>
                  <td><strong>${day.date}</strong></td>
                  <td class="text-right type-in">${day.inCount}</td>
                  <td class="text-right type-in">+${day.inQty.toLocaleString('ko-KR')}</td>
                  <td class="text-right type-out">${day.outCount}</td>
                  <td class="text-right type-out">-${day.outQty.toLocaleString('ko-KR')}</td>
                  <td class="text-right ${day.net >= 0 ? 'type-in' : 'type-out'}">
                    ${day.net >= 0 ? '+' : ''}${day.net.toLocaleString('ko-KR')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    ` : ''}

    <!-- ?섎웾 ?곸쐞 ?덈ぉ -->
    <div class="card">
      <div class="card-title">수량 상위 10개 품목</div>
      <div class="table-wrapper" style="border:none;">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:40px;">순위</th>
              <th>품목명</th>
              <th>분류</th>
              <th class="text-right">수량</th>
              <th class="text-right">단가</th>
              <th class="text-right">금액</th>
            </tr>
          </thead>
          <tbody>
            ${summary.topByQty.map((item, i) => `
              <tr>
                <td style="text-align:center; font-weight:700; color:var(--text-muted);">
                  ${i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                </td>
                <td><strong>${item.itemName || '-'}</strong></td>
                <td style="color:var(--text-muted);">${item.category || '-'}</td>
                <td class="text-right">${parseFloat(item.quantity || 0).toLocaleString('ko-KR')}</td>
                <td class="text-right">${item.unitPrice ? '₩' + Math.round(parseFloat(item.unitPrice)).toLocaleString('ko-KR') : '-'}</td>
                <td class="text-right">${item.totalPrice ? '₩' + Math.round(parseFloat(item.totalPrice)).toLocaleString('ko-KR') : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // --- ?대깽??---
  container.querySelector('#btn-export-summary')?.addEventListener('click', () => {
    try {
      const exportData = summary.categories.map(cat => ({
        '분류': cat.name || '(미분류)',
        '품목 수': cat.count,
        '총 수량': cat.qty,
        '총 금액': cat.price,
        '비율(%)': cat.ratio,
      }));
      const baseName = (state.fileName || '요약보고').replace(/\.[^.]+$/, '');
      downloadExcel(exportData, `${baseName}_요약보고`);
      showToast('보고서를 내보냈습니다.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  container.querySelector('#btn-print')?.addEventListener('click', () => {
    window.print();
  });
}

/**
 * ?붿빟 ?곗씠??怨꾩궛
 */
function buildSummary(data, transactions, safetyStock) {
  const totalQty = data.reduce((s, r) => s + (parseFloat(r.quantity) || 0), 0);
  const totalPrice = data.reduce((s, r) => s + (parseFloat(r.totalPrice) || 0), 0);

  // 遺꾨쪟蹂?
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
    .map(c => ({
      ...c,
      ratio: data.length > 0 ? Math.round((c.count / data.length) * 100) : 0,
    }));

  // 李쎄퀬蹂?
  const whMap = {};
  data.forEach(row => {
    const wh = row.warehouse || '';
    if (!wh) return;
    if (!whMap[wh]) whMap[wh] = { name: wh, count: 0, qty: 0, price: 0 };
    whMap[wh].count++;
    whMap[wh].qty += parseFloat(row.quantity) || 0;
    whMap[wh].price += parseFloat(row.totalPrice) || 0;
  });
  const warehouses = Object.values(whMap).sort((a, b) => b.qty - a.qty);

  // 嫄곕옒泥섎퀎 吏묎퀎
  const vendorMap = {};
  data.forEach(row => {
    const v = row.vendor || '';
    if (!v) return;
    if (!vendorMap[v]) vendorMap[v] = { name: v, count: 0, qty: 0, price: 0 };
    vendorMap[v].count++;
    vendorMap[v].qty += parseFloat(row.quantity) || 0;
    vendorMap[v].price += parseFloat(row.totalPrice) || 0;
  });
  const vendors = Object.values(vendorMap).sort((a, b) => b.qty - a.qty);

  // ?섎웾 ?곸쐞 10
  const topByQty = [...data]
    .sort((a, b) => (parseFloat(b.quantity) || 0) - (parseFloat(a.quantity) || 0))
    .slice(0, 10);

  // ?ш퀬 寃쎄퀬
  const warnings = data
    .filter(d => {
      const min = safetyStock[d.itemName];
      return min !== undefined && (parseFloat(d.quantity) || 0) <= min;
    })
    .map(d => ({
      name: d.itemName,
      qty: parseFloat(d.quantity) || 0,
      min: safetyStock[d.itemName],
    }))
    .sort((a, b) => a.qty - b.qty);

  // 理쒓렐 7???낆텧怨?異붿씠
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
      dailyTrend.push({
        date: dateStr,
        inCount: inTx.length,
        inQty,
        outCount: outTx.length,
        outQty,
        net: inQty - outQty,
      });
    }
  }

  return { totalQty, totalPrice, categories, warehouses, vendors, topByQty, warnings, dailyTrend };
}

/**
 * CSS conic-gradient 湲곕컲 ?꾨꽋 李⑦듃 ?앹꽦
 * ??CSS? ???몃? 李⑦듃 ?쇱씠釉뚮윭由??놁씠???쒓컖???④낵瑜??????덉뼱??踰덈뱾 ?ш린瑜?以꾩엫
 */
function buildDonutChart(categories, totalPrice) {
  const colors = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#ca8a04'];

  if (totalPrice <= 0) {
    return `<div style="width:140px; height:140px; border-radius:50%; background:#e5e7eb; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-size:12px;">데이터 없음</div>`;
  }

  // conic-gradient ?멸렇癒쇳듃 怨꾩궛
  let cumulative = 0;
  const segments = categories.map((cat, i) => {
    const ratio = cat.price / totalPrice;
    const start = cumulative;
    cumulative += ratio;
    return `${colors[i % colors.length]} ${(start * 360).toFixed(1)}deg ${(cumulative * 360).toFixed(1)}deg`;
  });

  const gradient = `conic-gradient(${segments.join(', ')})`;

  return `
    <div style="
      width: 140px; height: 140px;
      border-radius: 50%;
      background: ${gradient};
      position: relative;
    ">
      <div style="
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 80px; height: 80px;
        border-radius: 50%;
        background: var(--bg-card);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      ">
        <div style="font-size:10px; color:var(--text-muted);">珥?湲덉븸</div>
        <div style="font-size:11px; font-weight:700; color:var(--text-primary);">
          ${totalPrice >= 100000000
            ? '₩' + (totalPrice / 100000000).toFixed(1) + '억'
            : totalPrice >= 10000
              ? '₩' + Math.round(totalPrice / 10000).toLocaleString('ko-KR') + '만'
              : '₩' + Math.round(totalPrice).toLocaleString('ko-KR')
          }
        </div>
      </div>
    </div>
  `;
}

