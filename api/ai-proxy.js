/**
 * api/ai-proxy.js — Vercel Edge Function
 * OpenAI API 키를 서버사이드에서만 보유 (클라이언트 번들 노출 방지)
 *
 * 필수 환경변수 (Vercel Dashboard → Settings → Environment Variables):
 *   OPENAI_API_KEY      — OpenAI API 키 (VITE_ 접두사 없음 — 클라이언트 미노출)
 *   SUPABASE_JWT_SECRET — Supabase JWT Secret (Dashboard → Settings → API → JWT Secret)
 *   ALLOWED_ORIGIN      — 허용 오리진 (기본값: https://invex.io.kr)
 *
 * 보안:
 *   - Supabase JWT 검증: 로그인한 사용자만 호출 가능
 *   - 프롬프트 길이 제한: systemPrompt 1,000자 / userPrompt 4,000자
 *   - CORS: ALLOWED_ORIGIN 명시적 지정
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://invex.io.kr';

// 프롬프트 길이 제한 (API 키 소진 공격 방지)
const MAX_SYSTEM_PROMPT = 1_000;
const MAX_USER_PROMPT   = 4_000;

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
  }

  // ── 1. Supabase JWT 인증 ──────────────────────────────────────────────────
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) {
    console.error('[ai-proxy] SUPABASE_JWT_SECRET 환경변수 미설정');
    return jsonError(500, '서버 설정 오류');
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return jsonError(401, '인증이 필요합니다. Authorization 헤더를 확인하세요.');
  }

  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return jsonError(401, '유효하지 않거나 만료된 토큰입니다.');
  }
  // payload.sub = Supabase user UUID

  // ── 2. OpenAI API 키 확인 ────────────────────────────────────────────────
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError(500, 'OpenAI API 키가 서버에 설정되지 않았습니다.');
  }

  // ── 3. 요청 본문 파싱 ────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, '잘못된 요청입니다. JSON 형식을 확인하세요.');
  }

  const { systemPrompt, userPrompt } = body;
  if (!systemPrompt || !userPrompt) {
    return jsonError(400, 'systemPrompt와 userPrompt가 필요합니다.');
  }

  // ── 4. 프롬프트 길이 제한 ─────────────────────────────────────────────────
  if (systemPrompt.length > MAX_SYSTEM_PROMPT) {
    return jsonError(400, `systemPrompt는 ${MAX_SYSTEM_PROMPT}자를 초과할 수 없습니다.`);
  }
  if (userPrompt.length > MAX_USER_PROMPT) {
    return jsonError(400, `userPrompt는 ${MAX_USER_PROMPT}자를 초과할 수 없습니다.`);
  }

  // ── 5. OpenAI 스트리밍 프록시 ─────────────────────────────────────────────
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
    return jsonError(upstream.status, msg);
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

// ── 유틸 ──────────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

/**
 * Supabase JWT 검증 (Web Crypto API — Edge 런타임 호환)
 * @param {string} token  — Bearer 토큰 (접두사 제거 후)
 * @param {string} secret — SUPABASE_JWT_SECRET
 * @returns {object|null} — JWT payload 또는 null (검증 실패)
 */
async function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const data = `${header}.${payload}`;

    // HMAC-SHA256 서명 검증
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const sigBytes = base64urlDecode(signature);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(data),
    );
    if (!valid) return null;

    // 페이로드 디코딩
    const decoded = JSON.parse(
      new TextDecoder().decode(base64urlDecode(payload)),
    );

    // 만료 검증
    if (decoded.exp && Math.floor(Date.now() / 1000) > decoded.exp) return null;

    return decoded;
  } catch {
    return null;
  }
}

function base64urlDecode(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
