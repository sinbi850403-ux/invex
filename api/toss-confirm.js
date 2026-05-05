/**
 * api/toss-confirm.js — Vercel Edge Function
 * Toss Payments 결제 승인 서버사이드 검증 프록시
 *
 * 필수 환경변수 (Vercel Dashboard → Settings → Environment Variables):
 *   TOSS_SECRET_KEY          — 토스페이먼츠 시크릿 키 (sk_live_xxx 또는 sk_test_xxx)
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service_role 키 (Dashboard → Settings → API)
 *   SUPABASE_URL             — https://ztulmihauytvzlgfbgsd.supabase.co
 *   SUPABASE_JWT_SECRET      — Supabase JWT Secret (ai-proxy.js와 공유)
 *   ALLOWED_ORIGIN           — 허용 오리진 (기본값: https://invex.io.kr)
 *
 * 처리 순서:
 *   1. Supabase JWT 검증 → userId 추출
 *   2. 요청 body 파싱 및 planId / amount 유효성 검증
 *   3. Toss /v1/payments/confirm 호출
 *   4. 승인 성공 시 Supabase Admin API로 profiles.plan 업데이트
 *   5. 성공 응답 반환
 */

const TOSS_CONFIRM_ENDPOINT = 'https://api.tosspayments.com/v1/payments/confirm';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://invex.io.kr';

/** 요금제별 허용 금액 (원) */
const PLAN_AMOUNTS = {
  pro: 29000,
  enterprise: 59000,
};

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
    console.error('[toss-confirm] SUPABASE_JWT_SECRET 환경변수 미설정');
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
  const userId = payload.sub; // Supabase user UUID

  // ── 2. 환경변수 확인 ────────────────────────────────────────────────────
  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  if (!tossSecretKey) {
    console.error('[toss-confirm] TOSS_SECRET_KEY 환경변수 미설정');
    return jsonError(500, '결제 서버 설정 오류');
  }

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseServiceRoleKey || !supabaseUrl) {
    console.error('[toss-confirm] SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_URL 환경변수 미설정');
    return jsonError(500, '서버 설정 오류');
  }

  // ── 3. 요청 본문 파싱 ────────────────────────────────────────────────────
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, '잘못된 요청입니다. JSON 형식을 확인하세요.');
  }

  const { paymentKey, orderId, amount, planId } = body;

  if (!paymentKey || !orderId || amount === undefined || amount === null || !planId) {
    return jsonError(400, 'paymentKey, orderId, amount, planId가 모두 필요합니다.');
  }

  // ── 4. planId 유효성 검증 ────────────────────────────────────────────────
  if (!Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, planId)) {
    return jsonError(400, `유효하지 않은 planId입니다. (허용: ${Object.keys(PLAN_AMOUNTS).join(', ')})`);
  }

  // ── 5. amount 유효성 검증 ────────────────────────────────────────────────
  const expectedAmount = PLAN_AMOUNTS[planId];
  if (Number(amount) !== expectedAmount) {
    console.warn(`[toss-confirm] amount 불일치: userId=${userId} planId=${planId} expected=${expectedAmount} received=${amount}`);
    return jsonError(400, `결제 금액이 올바르지 않습니다. (${planId}: ${expectedAmount}원)`);
  }

  // ── 6. Toss Payments 승인 API 호출 ───────────────────────────────────────
  // Authorization: Basic base64(secretKey + ':')
  const tossAuthHeader = 'Basic ' + btoa(tossSecretKey + ':');

  let tossResponse;
  try {
    tossResponse = await fetch(TOSS_CONFIRM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: tossAuthHeader,
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });
  } catch (fetchErr) {
    console.error('[toss-confirm] Toss API 네트워크 오류:', fetchErr);
    return jsonError(502, '결제 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  let tossData;
  try {
    tossData = await tossResponse.json();
  } catch {
    return jsonError(502, 'Toss 응답을 파싱할 수 없습니다.');
  }

  if (!tossResponse.ok) {
    // Toss 에러 응답 그대로 클라이언트에 전달
    const tossErrorMsg = tossData?.message || tossData?.code || `Toss HTTP ${tossResponse.status}`;
    console.warn(`[toss-confirm] Toss 승인 실패: userId=${userId} code=${tossData?.code} msg=${tossData?.message}`);
    return jsonError(tossResponse.status >= 500 ? 502 : 400, tossErrorMsg);
  }

  // ── 7. Supabase Admin API로 profiles.plan 업데이트 ───────────────────────
  const profileUpdateUrl = `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`;

  let profileResponse;
  try {
    profileResponse = await fetch(profileUpdateUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        plan: planId,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch (patchErr) {
    console.error('[toss-confirm] Supabase profiles 업데이트 네트워크 오류:', patchErr);
    // Toss 승인은 완료됐으나 DB 업데이트 실패 — 클라이언트에 알려서 수동 처리 유도
    return jsonError(500, '결제는 승인되었으나 플랜 업데이트 중 오류가 발생했습니다. 고객센터에 문의해 주세요.');
  }

  if (!profileResponse.ok) {
    const profileErr = await profileResponse.text().catch(() => '');
    console.error(`[toss-confirm] Supabase profiles 업데이트 실패: status=${profileResponse.status} body=${profileErr}`);
    return jsonError(500, '결제는 승인되었으나 플랜 업데이트에 실패했습니다. 고객센터에 문의해 주세요.');
  }

  console.info(`[toss-confirm] 결제 승인 완료: userId=${userId} planId=${planId} orderId=${orderId} amount=${amount}`);

  // ── 8. 성공 응답 ─────────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ success: true, plan: planId, orderId }),
    {
      status: 200,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    },
  );
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
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

/**
 * Supabase JWT 검증 (Web Crypto API — Edge 런타임 호환)
 * ai-proxy.js와 동일한 구현
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
