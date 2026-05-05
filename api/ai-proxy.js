/**
 * api/ai-proxy.js — Vercel Serverless Function
 * OpenAI API 키를 서버사이드에서만 보유 (클라이언트 번들 노출 방지)
 *
 * 환경변수: OPENAI_API_KEY (VITE_ 접두사 없음 — 클라이언트 미노출)
 * Vercel Dashboard → Settings → Environment Variables 에서 설정
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://invex.io.kr';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API 키가 서버에 설정되지 않았습니다.' }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청입니다.' }), {
      status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  const { systemPrompt, userPrompt } = body;
  if (!systemPrompt || !userPrompt) {
    return new Response(JSON.stringify({ error: 'systemPrompt, userPrompt가 필요합니다.' }), {
      status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  // OpenAI 스트리밍 요청 프록시
  const upstream = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: 1024,
      temperature: 0.65,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    let msg = `OpenAI HTTP ${upstream.status}`;
    try { const e = await upstream.json(); msg = e.error?.message || msg; } catch { /* noop */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: upstream.status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  }

  // 스트리밍 응답 그대로 클라이언트에 전달
  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders(),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
