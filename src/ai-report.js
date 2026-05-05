/**
 * ai-report.js — AI 경영 분석 리포트 생성
 * Vercel Edge Function(/api/ai-proxy)을 통해 OpenAI 호출 — 키 클라이언트 미노출
 * @version 2.2.0
 */

import { supabase } from './supabase-client.js';

// 클라이언트는 /api/ai-proxy 만 호출. OpenAI 키는 서버(api/ai-proxy.js)에서만 보유.
// ai-proxy는 Supabase JWT 검증 필수 — 로그인 세션이 없으면 401
const PROXY_ENDPOINT = '/api/ai-proxy';
export const MODEL = 'gpt-4o-mini';

// ─────────────────────────────────────────────
// 범용 스트리밍 AI 호출 — 어떤 페이지에서도 사용 가능
// ─────────────────────────────────────────────
/**
 * @param {string} systemPrompt - 역할/톤 지정
 * @param {string} userPrompt   - 분석할 데이터 + 요청
 * @param {(chunk: string) => void} onChunk - 토큰 수신 콜백
 */
export async function callAIStream(systemPrompt, userPrompt, onChunk) {
  // Supabase 세션 토큰을 Authorization 헤더로 전달 (서버에서 JWT 검증)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('AI 분석을 사용하려면 로그인이 필요합니다.');

  const res = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const err = await res.json(); msg = err.error || msg; } catch { /* noop */ }
    throw new Error(`AI 분석 실패: ${msg}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed || trimmed === '[DONE]') continue;
      try {
        const json = JSON.parse(trimmed);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch { /* skip malformed */ }
    }
  }
}

// ─────────────────────────────────────────────
// 페이지별 프롬프트 빌더
// ─────────────────────────────────────────────

const SYSTEM_BASE = '당신은 중소기업 경영 분석 전문가입니다. 주어진 데이터를 바탕으로 실용적인 경영 인사이트를 한국어로 제공합니다. 간결하고 실행 가능한 조언을 해주세요.';

/** 재고현황 페이지 */
export function buildInventoryPrompt(data) {
  const {
    totalItems, totalValue, lowStockCount, zeroStockCount,
    topValueItems = [], categoryStats = [], deadStockCount = 0,
  } = data;
  const fmt = (n) => '₩' + Number(n).toLocaleString('ko-KR');
  const topList = topValueItems.slice(0, 5).map(([name, val], i) => `  ${i + 1}. ${name} (${fmt(val)})`).join('\n') || '  (없음)';
  const catList = categoryStats.slice(0, 5).map(([cat, cnt]) => `  - ${cat}: ${cnt}개`).join('\n') || '  (없음)';

  const systemPrompt = SYSTEM_BASE + ' 재고 관리 및 유통 최적화 전문가로서 분석해주세요.';
  const userPrompt = `
아래 재고 현황을 분석하고 개선 방안을 제시해주세요.

[재고 현황]
- 총 품목 수: ${totalItems}개
- 총 재고 금액: ${fmt(totalValue)}
- 재고 부족 품목: ${lowStockCount}개
- 재고 0 품목: ${zeroStockCount}개
- 장기 미판매(체류) 재고: ${deadStockCount}개

[고가 재고 TOP 5]
${topList}

[카테고리별 품목 수]
${catList}

다음 형식으로 분석해주세요:

## 재고 현황 진단
(2~3문장 요약)

## 주요 리스크
- (리스크 1)
- (리스크 2)

## 개선 권고사항
1. (구체적 액션 1)
2. (구체적 액션 2)
3. (구체적 액션 3)
`.trim();
  return { systemPrompt, userPrompt };
}

/** HR 대시보드 페이지 */
export function buildHRPrompt(data) {
  const {
    activeCount, resignedCount, totalGross, totalNet,
    depts = [], absentCount, lateCount, earlyLeaveCount,
    pendingLeaveCount, monthLabel,
  } = data;
  const fmt = (n) => '₩' + Number(n).toLocaleString('ko-KR');
  const deptList = depts.slice(0, 5).map(([d, c]) => `  - ${d}: ${c}명`).join('\n') || '  (없음)';

  const systemPrompt = SYSTEM_BASE + ' 인사·노무 관리 전문가로서 분석해주세요.';
  const userPrompt = `
아래 ${monthLabel} HR 현황을 분석해주세요.

[인원 현황]
- 재직 인원: ${activeCount}명
- 퇴직 인원: ${resignedCount}명

[부서별 인원]
${deptList}

[이번달 급여]
- 총 지급액(Gross): ${fmt(totalGross)}
- 총 실지급액(Net): ${fmt(totalNet)}

[이번달 근태 이슈]
- 결근: ${absentCount}건
- 지각: ${lateCount}건
- 조퇴: ${earlyLeaveCount}건
- 승인 대기 휴가: ${pendingLeaveCount}건

다음 형식으로 분석해주세요:

## 인사 현황 요약
(2~3문장)

## 주요 이슈
- (이슈 1)
- (이슈 2)

## 인사 관리 권고사항
1. (권고 1)
2. (권고 2)
3. (권고 3)
`.trim();
  return { systemPrompt, userPrompt };
}

/** 급여 페이지 */
export function buildPayrollPrompt(data) {
  const {
    year, month, totalGross, totalNet, totalDeduct,
    totalEmployer, empCount, draftCount, confirmedCount,
    avgGross,
  } = data;
  const fmt = (n) => '₩' + Number(n).toLocaleString('ko-KR');

  const systemPrompt = SYSTEM_BASE + ' 급여 관리 및 인건비 최적화 전문가로서 분석해주세요.';
  const userPrompt = `
아래 ${year}년 ${month}월 급여 현황을 분석해주세요.

[급여 집계]
- 대상 직원: ${empCount}명 (확정 ${confirmedCount}명 / 초안 ${draftCount}명)
- 총 지급액(Gross): ${fmt(totalGross)}
- 총 공제액: ${fmt(totalDeduct)}
- 총 실지급액(Net): ${fmt(totalNet)}
- 회사부담 4대보험: ${fmt(totalEmployer)}
- 평균 급여: ${fmt(avgGross)}

다음 형식으로 분석해주세요:

## 급여 현황 요약
(2~3문장)

## 인건비 분석
- (분석 1)
- (분석 2)

## 급여 관리 권고사항
1. (권고 1)
2. (권고 2)
3. (권고 3)
`.trim();
  return { systemPrompt, userPrompt };
}

/** 홈 대시보드 */
export function buildDashboardPrompt(data) {
  const {
    totalItems, lowStockCount, recentSales, recentPurchase,
    salesChange, purchaseChange, topSellItems = [],
    pendingOrderCount,
  } = data;
  const fmt = (n) => '₩' + Number(n).toLocaleString('ko-KR');
  const pct = (n) => `${n >= 0 ? '+' : ''}${n}%`;
  const topList = topSellItems.slice(0, 3).map(([name, qty], i) => `  ${i + 1}. ${name} (${qty}개)`).join('\n') || '  (없음)';

  const systemPrompt = SYSTEM_BASE;
  const userPrompt = `
아래 경영 현황을 종합 분석해주세요.

[재고 현황]
- 총 품목: ${totalItems}개
- 재고 부족 경고: ${lowStockCount}개

[최근 30일 실적]
- 매출: ${fmt(recentSales)} (전월 대비 ${pct(salesChange)})
- 매입: ${fmt(recentPurchase)} (전월 대비 ${pct(purchaseChange)})
- 발주 대기: ${pendingOrderCount}건

[최근 30일 출고 TOP 3]
${topList}

다음 형식으로 분석해주세요:

## 경영 현황 요약
(2~3문장)

## 핵심 발견사항
- (발견 1)
- (발견 2)
- (발견 3)

## 이번 주 액션 아이템
1. (액션 1)
2. (액션 2)
3. (액션 3)
`.trim();
  return { systemPrompt, userPrompt };
}

/**
 * 주간 경영 데이터로 AI 리포트 생성
 * @param {{
 *   weekLabel: string,
 *   thisWeekSales: number,
 *   thisWeekPurchase: number,
 *   salesChange: number,
 *   purchaseChange: number,
 *   txCount: number,
 *   lowStockCount: number,
 *   topOutItems: [string, number][],
 *   topInItems: [string, number][],
 *   anomalies: string[],
 * }} data
 * @returns {Promise<string>}
 */
export async function generateWeeklyAIReport(data) {
  if (!API_KEY) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다. .env의 VITE_OPENAI_API_KEY를 확인하세요.');
  }

  const prompt = buildPrompt(data);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            '당신은 중소기업 경영 분석 전문가입니다. 주어진 데이터를 바탕으로 실용적인 경영 인사이트를 한국어로 제공합니다. 간결하고 실행 가능한 조언을 해주세요.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.65,
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message || msg;
    } catch { /* noop */ }
    throw new Error(`AI 리포트 생성 실패: ${msg}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '(응답 없음)';
}

/**
 * 스트리밍 방식으로 AI 리포트 생성 — 토큰 수신 시마다 onChunk 콜백 호출
 * @param {object} data - generateWeeklyAIReport와 동일한 입력 데이터
 * @param {(chunk: string) => void} onChunk - 새 토큰 수신 시 호출
 * @returns {Promise<void>}
 */
export async function generateWeeklyAIReportStream(data, onChunk) {
  if (!API_KEY) {
    throw new Error('OpenAI API 키가 설정되지 않았습니다. .env의 VITE_OPENAI_API_KEY를 확인하세요.');
  }

  const prompt = buildPrompt(data);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            '당신은 중소기업 경영 분석 전문가입니다. 주어진 데이터를 바탕으로 실용적인 경영 인사이트를 한국어로 제공합니다. 간결하고 실행 가능한 조언을 해주세요.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
      temperature: 0.65,
      stream: true,
    }),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const err = await res.json();
      msg = err.error?.message || msg;
    } catch { /* noop */ }
    throw new Error(`AI 리포트 생성 실패: ${msg}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed || trimmed === '[DONE]') continue;
      try {
        const json = JSON.parse(trimmed);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch { /* skip malformed chunks */ }
    }
  }
}

function buildPrompt(data) {
  const {
    weekLabel, thisWeekSales, thisWeekPurchase,
    salesChange, purchaseChange, txCount,
    lowStockCount, topOutItems, topInItems, anomalies,
  } = data;

  const fmt = (n) => `₩${Number(n).toLocaleString('ko-KR')}`;
  const pct = (n) => `${n >= 0 ? '+' : ''}${n}%`;

  const outList = (topOutItems || []).slice(0, 3)
    .map(([n, q], i) => `  ${i + 1}. ${n} (${q}개)`).join('\n') || '  (없음)';
  const inList = (topInItems || []).slice(0, 3)
    .map(([n, q], i) => `  ${i + 1}. ${n} (${q}개)`).join('\n') || '  (없음)';
  const anomalyList = (anomalies || []).length > 0
    ? anomalies.map(a => `  - ${a}`).join('\n')
    : '  (이상 없음)';

  return `
아래 ${weekLabel} 주간 경영 데이터를 분석하고 경영 리포트를 작성해주세요.

[주간 실적]
- 이번 주 매출: ${fmt(thisWeekSales)} (전주 대비 ${pct(salesChange)})
- 이번 주 매입: ${fmt(thisWeekPurchase)} (전주 대비 ${pct(purchaseChange)})
- 거래 건수: ${txCount}건
- 재고 부족 품목: ${lowStockCount}건

[이번 주 출고 TOP 3]
${outList}

[이번 주 입고 TOP 3]
${inList}

[이상 탐지]
${anomalyList}

다음 형식으로 한국어로 작성해주세요 (마크다운 사용):

## 이번 주 경영 요약
(2~3문장으로 전반적인 상황 요약)

## 주요 발견사항
- (발견사항 1)
- (발견사항 2)
- (발견사항 3)

## 다음 주 액션 아이템
1. (구체적 권고사항 1)
2. (구체적 권고사항 2)
3. (구체적 권고사항 3)
`.trim();
}
