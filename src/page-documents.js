/**
 * page-documents.js - 臾몄꽌 ?먮룞?앹꽦 ?섏씠吏
 * ??븷: 諛쒖＜?? 寃ъ쟻?? 嫄곕옒紐낆꽭?쒕? ?먮룞 ?앹꽦?섍퀬 PDF濡??ㅼ슫濡쒕뱶
 * ???꾩슂? ???뚭퇋紐??낆껜?먯꽌 媛???쒓컙 留롮씠 ?곕뒗 ?낅Т瑜??먮룞??
 */

import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

// jsPDF??autoTable ?뚮윭洹몄씤 ?곌껐 (ESM ?섍꼍?먯꽌 ?꾩닔)
applyPlugin(jsPDF);
import { getState } from './store.js';
import { showToast } from './toast.js';
import { applyKoreanFont, getKoreanFontStyle } from './pdf-font.js';
import { renderGuidedPanel, renderInsightHero } from './ux-toolkit.js';

/**
 * 臾몄꽌 ?먮룞?앹꽦 ?섏씠吏 ?뚮뜑留?
 */
export function renderDocumentsPage(container, navigateTo) {
  const state = getState();
  const items = state.mappedData || [];
  const safetyStock = state.safetyStock || {};

  // ?덉쟾?ш퀬 遺議??덈ぉ (諛쒖＜ 異붿쿇)
  const lowStockItems = items.filter(d => {
    const min = safetyStock[d.itemName];
    return min !== undefined && (parseFloat(d.quantity) || 0) <= min;
  });

  // 嫄곕옒泥?紐⑸줉
  const vendors = [...new Set(items.map(i => i.vendor).filter(Boolean))].sort();
  const recentTransactionCount = (state.transactions || []).filter(tx => {
    const txDate = String(tx.date || '');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return txDate >= cutoff.toISOString().split('T')[0];
  }).length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title"><span class="title-icon">?뱞</span> 臾몄꽌 ?먮룞?앹꽦</h1>
        <div class="page-desc">諛쒖＜?? 寃ъ쟻?? 嫄곕옒紐낆꽭?쒕? ?먮룞?쇰줈 ?앹꽦?섍퀬 PDF濡??ㅼ슫濡쒕뱶?⑸땲??</div>
      </div>
    </div>

    ${renderInsightHero({
      eyebrow: '문서 작업 센터',
      title: '필요한 문서를 고르고, 추천 항목을 확인한 뒤 바로 PDF로 만들 수 있습니다.',
      desc: '부족 재고, 연결된 거래처, 최근 거래 기록을 먼저 보여줘서 어떤 문서를 먼저 만들어야 하는지 한눈에 판단할 수 있습니다.',
      tone: lowStockItems.length > 0 ? 'warning' : 'info',
      metrics: [
        {
          label: '발주 추천 품목',
          value: lowStockItems.length > 0 ? `${lowStockItems.length}건` : '없음',
          note: '안전재고 이하 품목 기준 추천입니다.',
          stateClass: lowStockItems.length > 0 ? 'text-danger' : 'text-success',
        },
        {
          label: '연결 거래처',
          value: `${vendors.length}곳`,
          note: '문서 수신처로 바로 사용할 수 있는 거래처 수입니다.',
        },
        {
          label: '최근 30일 거래',
          value: `${recentTransactionCount}건`,
          note: '거래명세서 작성에 활용할 수 있는 최근 거래 기록입니다.',
        },
      ],
      bullets: [
        lowStockItems.length > 0 ? `발주서는 부족 품목 ${lowStockItems.length}건을 기본 추천으로 채워줍니다.` : '현재 부족 품목이 없어도 발주서는 수동으로 작성할 수 있습니다.',
        vendors.length === 0 ? '거래처가 아직 없으면 문서는 만들 수 있지만, 받는 쪽 정보가 비어 있을 수 있습니다.' : '거래처가 연결되어 있어 문서 작성 속도가 빨라집니다.',
        '문서마다 필요한 정보만 먼저 보이고, 추가 입력은 아래 편집 영역에서 이어서 채울 수 있습니다.',
      ],
    })}

    ${renderGuidedPanel({
      eyebrow: '문서 작성 흐름',
      title: '처음이어도 세 단계만 따라가면 바로 만들 수 있습니다.',
      desc: '문서 종류 선택, 기본 정보 입력, PDF 생성 순서로 정리했습니다.',
      badge: '초보자 안내',
      tone: 'info',
      steps: [
        { kicker: 'STEP 1', title: '문서 종류 선택', desc: '발주서, 견적서, 거래명세서 중 지금 필요한 문서를 먼저 고릅니다.' },
        { kicker: 'STEP 2', title: '받는 곳 정보와 품목 확인', desc: '거래처, 날짜, 품목만 채워도 기본 문서를 바로 만들 수 있습니다.' },
        { kicker: 'STEP 3', title: 'PDF 생성 후 전달', desc: '작성한 내용이 즉시 반영된 PDF를 내려받아 바로 전달할 수 있습니다.' },
      ],
    })}

    <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="card doc-type-card active" data-doc="purchase" style="cursor:pointer;">
        <div style="font-size:28px; margin-bottom:8px;">🧾</div>
        <div style="font-weight:600; margin-bottom:4px;">발주서</div>
        <div style="font-size:12px; color:var(--text-muted);">부족 품목을 기준으로 자동 추천합니다.</div>
        ${lowStockItems.length > 0 ? `<span class="badge badge-danger" style="margin-top:6px;">${lowStockItems.length}건 부족</span>` : ''}
      </div>
      <div class="card doc-type-card" data-doc="quote" style="cursor:pointer;">
        <div style="font-size:28px; margin-bottom:8px;">📄</div>
        <div style="font-weight:600; margin-bottom:4px;">견적서</div>
        <div style="font-size:12px; color:var(--text-muted);">품목을 선택해 바로 금액을 계산합니다.</div>
      </div>
      <div class="card doc-type-card" data-doc="statement" style="cursor:pointer;">
        <div style="font-size:28px; margin-bottom:8px;">📋</div>
        <div style="font-weight:600; margin-bottom:4px;">거래명세서</div>
        <div style="font-size:12px; color:var(--text-muted);">입출고 기록을 기준으로 문서를 만듭니다.</div>
      </div>
    </div>

    <!-- 臾몄꽌 ?묒꽦 ?곸뿭 -->
    <div class="card" id="doc-editor">
      <div id="doc-content"></div>
    </div>
  `;

  // 臾몄꽌 ?좏삎 ?좏깮 ?대깽??
  let currentDocType = 'purchase';
  container.querySelectorAll('.doc-type-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.doc-type-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentDocType = card.dataset.doc;
      renderDocEditor(currentDocType);
    });
  });

  // 珥덇린 ?뚮뜑留?
  renderDocEditor('purchase');

  /**
   * 臾몄꽌 ?몄쭛湲??뚮뜑留?
   */
  function renderDocEditor(type) {
    const docContent = container.querySelector('#doc-content');

    if (type === 'purchase') {
      renderPurchaseOrder(docContent, items, lowStockItems, vendors, safetyStock);
    } else if (type === 'quote') {
      renderQuote(docContent, items);
    } else if (type === 'statement') {
      renderStatement(docContent, items, state.transactions || []);
    }
  }
}

/**
 * 諛쒖＜???묒꽦 UI
 * ????援ъ“? ???덉쟾?ш퀬 遺議??덈ぉ???먮룞?쇰줈 異붿쿇 + 嫄곕옒泥섎퀎 洹몃９??
 */
function renderPurchaseOrder(el, items, lowStockItems, vendors, safetyStock) {
  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = `
    <div class="card-title">?뱥 諛쒖＜???묒꽦</div>

    ${lowStockItems.length > 0 ? `
      <div class="alert alert-warning" style="margin-bottom:16px;">
        ?좑툘 ?덉쟾?ш퀬 遺議??덈ぉ??<strong>${lowStockItems.length}嫄?/strong> ?덉뒿?덈떎. ?먮룞?쇰줈 異붿쿇?⑸땲??
      </div>
    ` : ''}

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">諛쒖＜?쇱옄</label>
        <input class="form-input" type="date" id="po-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="form-label">嫄곕옒泥??좏깮</label>
        <select class="form-select" id="po-vendor">
          <option value="">?꾩껜 嫄곕옒泥?/option>
          ${vendors.map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">諛쒖＜ ?뚯궗紐?/label>
        <input class="form-input" id="po-company" placeholder="우리 회사명" />
      </div>
      <div class="form-group">
        <label class="form-label">?대떦??/label>
        <input class="form-input" id="po-manager" placeholder="?대떦?먮챸" />
      </div>
    </div>

    <!-- 諛쒖＜ ?덈ぉ ?뚯씠釉?-->
    <div class="table-wrapper" style="margin-bottom:16px;">
      <table class="data-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="po-check-all" checked /></th>
            <th>?덈ぉ紐?/th>
            <th>?덈ぉ肄붾뱶</th>
            <th>嫄곕옒泥?/th>
            <th class="text-right">?꾩옱 ?ш퀬</th>
            <th class="text-right">?덉쟾?ш퀬</th>
            <th class="text-right">諛쒖＜ ?섎웾</th>
            <th class="text-right">?④?</th>
          </tr>
        </thead>
        <tbody id="po-items-body">
          ${(lowStockItems.length > 0 ? lowStockItems : items.slice(0, 10)).map((item, i) => {
            const currentQty = parseFloat(item.quantity) || 0;
            const minQty = safetyStock[item.itemName] || 0;
            // 遺議깅텇 + ?ъ쑀遺??덉쟾?ш퀬??50%)?쇰줈 諛쒖＜ ?섎웾 異붿쿇
            const orderQty = Math.max(1, Math.ceil((minQty - currentQty) + (minQty * 0.5)));
            return `
              <tr>
                <td><input type="checkbox" class="po-item-check" data-idx="${i}" checked /></td>
                <td><strong>${item.itemName}</strong></td>
                <td style="color:var(--text-muted);">${item.itemCode || '-'}</td>
                <td>${item.vendor || '-'}</td>
                <td class="text-right ${currentQty <= minQty ? 'type-out' : ''}">${currentQty.toLocaleString('ko-KR')}</td>
                <td class="text-right">${minQty || '-'}</td>
                <td class="text-right"><input type="number" class="form-input po-order-qty" data-idx="${i}" value="${orderQty}" min="1" style="width:80px; padding:4px 6px; text-align:right;" /></td>
                <td class="text-right">${item.unitPrice ? '₩' + Math.round(parseFloat(item.unitPrice)).toLocaleString('ko-KR') : '-'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="form-group" style="margin-bottom:16px;">
      <label class="form-label">鍮꾧퀬</label>
      <input class="form-input" id="po-note" placeholder="異붽? 硫붾え (?좏깮)" />
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-primary btn-lg" id="btn-generate-po">?뱞 諛쒖＜??PDF ?앹꽦</button>
    </div>
  `;

  // ?꾩껜 ?좏깮/?댁젣
  el.querySelector('#po-check-all').addEventListener('change', (e) => {
    el.querySelectorAll('.po-item-check').forEach(cb => { cb.checked = e.target.checked; });
  });

  // PDF ?앹꽦
  el.querySelector('#btn-generate-po').addEventListener('click', () => {
    const sourceItems = lowStockItems.length > 0 ? lowStockItems : items.slice(0, 10);
    const selectedItems = [];
    el.querySelectorAll('.po-item-check:checked').forEach(cb => {
      const idx = parseInt(cb.dataset.idx);
      const qtyInput = el.querySelector(`.po-order-qty[data-idx="${idx}"]`);
      const orderQty = parseFloat(qtyInput?.value) || 1;
      selectedItems.push({ ...sourceItems[idx], orderQty });
    });

    if (selectedItems.length === 0) {
      showToast('諛쒖＜???덈ぉ???좏깮??二쇱꽭??', 'warning');
      return;
    }

    const info = {
      date: el.querySelector('#po-date').value,
      vendor: el.querySelector('#po-vendor').value || '전체 거래처',
      company: el.querySelector('#po-company').value || 'INVEX 사용자',
      manager: el.querySelector('#po-manager').value || '',
      note: el.querySelector('#po-note').value || '',
    };

    generatePurchaseOrderPDF(selectedItems, info);
  });
}

/**
 * 寃ъ쟻???묒꽦 UI
 */
function renderQuote(el, items) {
  const today = new Date().toISOString().split('T')[0];

  el.innerHTML = `
    <div class="card-title">?뮥 寃ъ쟻???묒꽦</div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">寃ъ쟻?쇱옄</label>
        <input class="form-input" type="date" id="qt-date" value="${today}" />
      </div>
      <div class="form-group">
        <label class="form-label">嫄곕옒泥??섏떊)</label>
        <input class="form-input" id="qt-to" placeholder="寃ъ쟻 諛쏆쓣 ?낆껜紐? />
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">諛쒖떊 ?뚯궗紐?/label>
        <input class="form-input" id="qt-from" placeholder="?곕━ ?뚯궗紐? />
      </div>
      <div class="form-group">
        <label class="form-label">?좏슚湲곌컙</label>
        <input class="form-input" id="qt-valid" placeholder="?? 寃ъ쟻?쇰줈遺??30?? value="寃ъ쟻?쇰줈遺??30?? />
      </div>
    </div>

    <!-- ?덈ぉ ?좏깮 -->
    <div class="form-group" style="margin-bottom:8px;">
      <label class="form-label">?덈ぉ 異붽?</label>
      <div style="display:flex; gap:8px;">
        <select class="form-select" id="qt-item-select" style="flex:1;">
          <option value="">-- ?덈ぉ ?좏깮 --</option>
          ${items.map((item, i) => `<option value="${i}">${item.itemName} (${item.itemCode || '-'}) - ₩${Math.round(parseFloat(item.unitPrice || 0)).toLocaleString('ko-KR')}</option>`).join('')}
        </select>
        <button class="btn btn-primary" id="btn-qt-add-item">+ 異붽?</button>
      </div>
    </div>

    <div class="table-wrapper" style="margin-bottom:16px;">
      <table class="data-table">
        <thead>
          <tr>
            <th>?덈ぉ紐?/th>
            <th>肄붾뱶</th>
            <th class="text-right">?섎웾</th>
            <th class="text-right">?④?</th>
            <th class="text-right">湲덉븸</th>
            <th style="width:40px;">??젣</th>
          </tr>
        </thead>
        <tbody id="qt-items-body">
          <tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">?덈ぉ??異붽???二쇱꽭??/td></tr>
        </tbody>
        <tfoot>
          <tr style="font-weight:700; background:var(--bg-card);">
            <td colspan="4" class="text-right">?⑷퀎</td>
            <td class="text-right" id="qt-total">??</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-primary btn-lg" id="btn-generate-qt">?뮥 寃ъ쟻??PDF ?앹꽦</button>
    </div>
  `;

  const quoteItems = [];

  // ?덈ぉ 異붽?
  el.querySelector('#btn-qt-add-item').addEventListener('click', () => {
    const select = el.querySelector('#qt-item-select');
    const idx = parseInt(select.value);
    if (isNaN(idx)) { showToast('?덈ぉ???좏깮??二쇱꽭??', 'warning'); return; }

    const item = items[idx];
    quoteItems.push({ ...item, qty: 1 });
    select.value = '';
    renderQuoteTable();
  });

  function renderQuoteTable() {
    const tbody = el.querySelector('#qt-items-body');
    if (quoteItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">?덈ぉ??異붽???二쇱꽭??/td></tr>';
      el.querySelector('#qt-total').textContent = '??';
      return;
    }

    tbody.innerHTML = quoteItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      const subtotal = price * item.qty;
      return `
        <tr>
          <td><strong>${item.itemName}</strong></td>
          <td style="color:var(--text-muted);">${item.itemCode || '-'}</td>
          <td class="text-right"><input type="number" class="form-input qt-qty" data-idx="${i}" value="${item.qty}" min="1" style="width:60px; padding:3px 6px; text-align:right;" /></td>
          <td class="text-right">??{price.toLocaleString('ko-KR')}</td>
          <td class="text-right">??{subtotal.toLocaleString('ko-KR')}</td>
          <td class="text-center"><button class="btn-icon btn-icon-danger qt-del" data-idx="${i}">?뿊截?/button></td>
        </tr>
      `;
    }).join('');

    // ?⑷퀎 怨꾩궛
    const total = quoteItems.reduce((s, item) => s + ((parseFloat(item.unitPrice) || 0) * item.qty), 0);
    el.querySelector('#qt-total').textContent = '₩' + total.toLocaleString('ko-KR');

    // ?섎웾 蹂寃??대깽??
    el.querySelectorAll('.qt-qty').forEach(input => {
      input.addEventListener('change', () => {
        quoteItems[parseInt(input.dataset.idx)].qty = parseInt(input.value) || 1;
        renderQuoteTable();
      });
    });

    // ??젣 ?대깽??
    el.querySelectorAll('.qt-del').forEach(btn => {
      btn.addEventListener('click', () => {
        quoteItems.splice(parseInt(btn.dataset.idx), 1);
        renderQuoteTable();
      });
    });
  }

  // PDF ?앹꽦
  el.querySelector('#btn-generate-qt').addEventListener('click', () => {
    if (quoteItems.length === 0) {
      showToast('寃ъ쟻 ?덈ぉ??異붽???二쇱꽭??', 'warning');
      return;
    }
    const info = {
      date: el.querySelector('#qt-date').value,
      to: el.querySelector('#qt-to').value || '거래처',
      from: el.querySelector('#qt-from').value || 'INVEX 사용자',
      valid: el.querySelector('#qt-valid').value || '',
    };
    generateQuotePDF(quoteItems, info);
  });
}

/**
 * 嫄곕옒紐낆꽭???묒꽦 UI
 */
function renderStatement(el, items, transactions) {
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const fromDate = monthAgo.toISOString().split('T')[0];

  el.innerHTML = `
    <div class="card-title">?뱷 嫄곕옒紐낆꽭???묒꽦</div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">湲곌컙 (?쒖옉)</label>
        <input class="form-input" type="date" id="st-from" value="${fromDate}" />
      </div>
      <div class="form-group">
        <label class="form-label">湲곌컙 (醫낅즺)</label>
        <input class="form-input" type="date" id="st-to" value="${today}" />
      </div>
    </div>

    <div class="form-row" style="margin-bottom:16px;">
      <div class="form-group">
        <label class="form-label">怨듦툒??(?곕━ ?뚯궗)</label>
        <input class="form-input" id="st-supplier" placeholder="우리 회사명" />
      </div>
      <div class="form-group">
        <label class="form-label">怨듦툒諛쏅뒗??/label>
        <input class="form-input" id="st-receiver" placeholder="嫄곕옒泥섎챸" />
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <strong>?대떦 湲곌컙 嫄곕옒 嫄댁닔: </strong>
      <span id="st-count" class="badge badge-info">${transactions.length}嫄?/span>
    </div>

    <div style="display:flex; gap:8px; justify-content:flex-end;">
      <button class="btn btn-primary btn-lg" id="btn-generate-st">?뱷 嫄곕옒紐낆꽭??PDF ?앹꽦</button>
    </div>
  `;

  el.querySelector('#btn-generate-st').addEventListener('click', () => {
    const from = el.querySelector('#st-from').value;
    const to = el.querySelector('#st-to').value;
    const filteredTx = transactions.filter(tx => tx.date >= from && tx.date <= to);

    if (filteredTx.length === 0) {
      showToast('?대떦 湲곌컙??嫄곕옒 湲곕줉???놁뒿?덈떎.', 'warning');
      return;
    }

    const info = {
      from,
      to,
      supplier: el.querySelector('#st-supplier').value || 'INVEX 사용자',
      receiver: el.querySelector('#st-receiver').value || '거래처',
    };
    generateStatementPDF(filteredTx, info);
  });

  // ?좎쭨 蹂寃???嫄댁닔 ?낅뜲?댄듃
  ['#st-from', '#st-to'].forEach(sel => {
    el.querySelector(sel).addEventListener('change', () => {
      const from = el.querySelector('#st-from').value;
      const to = el.querySelector('#st-to').value;
      const count = transactions.filter(tx => tx.date >= from && tx.date <= to).length;
      el.querySelector('#st-count').textContent = `${count}건`;
    });
  });
}

// === PDF ?앹꽦 ?⑥닔??===

/**
 * 諛쒖＜??PDF ?앹꽦
 * ??jsPDF? ???몃? ?쒕쾭 ?놁씠 釉뚮씪?곗??먯꽌 諛붾줈 PDF瑜?留뚮뱾 ???덉뼱??蹂댁븞?깅룄 ?믪쓬
 */
async function generatePurchaseOrderPDF(selectedItems, info) {
  try {
    showToast('PDF ?앹꽦 以?.. (?고듃 濡쒕뵫)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);

    // ?ㅻ뜑
    doc.setFontSize(20);
    doc.text('발주서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`諛쒖＜?쇱옄: ${info.date}`, 15, 35);
    doc.text(`諛쒖＜?뚯궗: ${info.company}`, 15, 42);
    doc.text(`?대떦?? ${info.manager}`, 15, 49);
    doc.text(`嫄곕옒泥? ${info.vendor}`, 15, 56);

    // ?뚯씠釉?
    const tableData = selectedItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      const subtotal = price * item.orderQty;
      return [i + 1, item.itemName, item.itemCode || '-', item.orderQty, '₩' + price.toLocaleString(), '₩' + subtotal.toLocaleString()];
    });

    const total = selectedItems.reduce((s, item) => s + ((parseFloat(item.unitPrice) || 0) * item.orderQty), 0);

    doc.autoTable({
      startY: 65,
      head: [['No', '품목명', '코드', '수량', '단가', '금액']],
      body: tableData,
      foot: [['', '', '', '', '합계', '₩' + total.toLocaleString()]],
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], ...fontStyle },
      bodyStyles: { ...fontStyle },
      footStyles: { fillColor: [240, 242, 245], textColor: [0, 0, 0], fontStyle: 'bold', ...fontStyle },
      styles: { ...fontStyle },
    });

    if (info.note) {
      const finalY = doc.lastAutoTable.finalY || 120;
      doc.setFontSize(9);
      doc.text(`鍮꾧퀬: ${info.note}`, 15, finalY + 15);
    }

    doc.save(`諛쒖＜??${info.date}.pdf`);
    showToast('諛쒖＜??PDF瑜??ㅼ슫濡쒕뱶?덉뒿?덈떎.', 'success');
  } catch (err) {
    showToast('PDF ?앹꽦 ?ㅽ뙣: ' + err.message, 'error');
  }
}

/**
 * 寃ъ쟻??PDF ?앹꽦
 */
async function generateQuotePDF(quoteItems, info) {
  try {
    showToast('PDF ?앹꽦 以?.. (?고듃 濡쒕뵫)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);

    doc.setFontSize(20);
    doc.text('견적서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`寃ъ쟻?쇱옄: ${info.date}`, 15, 35);
    doc.text(`?섏떊: ${info.to}`, 15, 42);
    doc.text(`諛쒖떊: ${info.from}`, 15, 49);
    doc.text(`?좏슚湲곌컙: ${info.valid}`, 15, 56);

    const tableData = quoteItems.map((item, i) => {
      const price = parseFloat(item.unitPrice) || 0;
      const subtotal = price * item.qty;
      return [i + 1, item.itemName, item.itemCode || '-', item.qty, '₩' + price.toLocaleString(), '₩' + subtotal.toLocaleString()];
    });

    const total = quoteItems.reduce((s, item) => s + ((parseFloat(item.unitPrice) || 0) * item.qty), 0);

    doc.autoTable({
      startY: 65,
      head: [['No', '품목명', '코드', '수량', '단가', '금액']],
      body: tableData,
      foot: [['', '', '', '', '합계', '₩' + total.toLocaleString()]],
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74], ...fontStyle },
      bodyStyles: { ...fontStyle },
      footStyles: { fillColor: [240, 242, 245], textColor: [0, 0, 0], fontStyle: 'bold', ...fontStyle },
      styles: { ...fontStyle },
    });

    doc.save(`寃ъ쟻??${info.date}.pdf`);
    showToast('寃ъ쟻??PDF瑜??ㅼ슫濡쒕뱶?덉뒿?덈떎.', 'success');
  } catch (err) {
    showToast('PDF ?앹꽦 ?ㅽ뙣: ' + err.message, 'error');
  }
}

/**
 * 嫄곕옒紐낆꽭??PDF ?앹꽦
 */
async function generateStatementPDF(transactions, info) {
  try {
    showToast('PDF ?앹꽦 以?.. (?고듃 濡쒕뵫)', 'info', 2000);
    const doc = new jsPDF();
    const fontStyle = getKoreanFontStyle();
    await applyKoreanFont(doc);

    doc.setFontSize(20);
    doc.text('거래명세서', 105, 20, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`湲곌컙: ${info.from} ~ ${info.to}`, 15, 35);
    doc.text(`怨듦툒?? ${info.supplier}`, 15, 42);
    doc.text(`怨듦툒諛쏅뒗?? ${info.receiver}`, 15, 49);

    const tableData = transactions.map((tx, i) => [
      i + 1,
      tx.date,
      tx.type === 'in' ? '?낃퀬' : '異쒓퀬',
      tx.itemName,
      tx.itemCode || '-',
      tx.quantity,
      '₩' + Math.round(parseFloat(tx.unitPrice) || 0).toLocaleString(),
      '₩' + Math.round((parseFloat(tx.unitPrice) || 0) * (parseFloat(tx.quantity) || 0)).toLocaleString(),
    ]);

    doc.autoTable({
      startY: 58,
      head: [['No', '일자', '구분', '품목명', '코드', '수량', '단가', '금액']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [100, 100, 100], ...fontStyle },
      bodyStyles: { ...fontStyle },
      styles: { ...fontStyle },
      columnStyles: {
        2: { cellWidth: 15 },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
      },
    });

    doc.save(`嫄곕옒紐낆꽭??${info.from}_${info.to}.pdf`);
    showToast('嫄곕옒紐낆꽭??PDF瑜??ㅼ슫濡쒕뱶?덉뒿?덈떎.', 'success');
  } catch (err) {
    showToast('PDF ?앹꽦 ?ㅽ뙣: ' + err.message, 'error');
  }
}

