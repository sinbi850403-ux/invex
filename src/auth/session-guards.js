/**
 * Session guard helpers for auth hydration and profile bootstrap flows.
 */

export function hasSessionAccessToken(session) {
  return Boolean(String(session?.access_token || '').trim());
}

export function shouldAttemptProfileLoad(user, session) {
  const uid = String(user?.uid || '').trim();
  const sessionUserId = String(session?.user?.id || '').trim();
  if (!uid || !sessionUserId) return false;
  if (uid !== sessionUserId) return false;
  return hasSessionAccessToken(session);
}

