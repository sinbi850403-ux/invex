/**
 * ai-report.js — AI 경영 분석 리포트 생성
 * OpenAI gpt-4o-mini 기반, 주간 경영 데이터 → 자연어 인사이트
 */

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY ?? '';
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';

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
      max_tokens: 900,
      temperature: 0.6,
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
