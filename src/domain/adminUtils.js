import { supabase } from '../supabase-client.js';

export function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return fmtDate(iso);
}

export async function fetchAllUsers(attempt = 1) {
  try {
    const timeout = 20000;
    const timeoutP = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout));
    const { data, error } = await Promise.race([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      timeoutP,
    ]);
    if (error) {
      if (attempt < 3) { await new Promise(r => setTimeout(r, 1500 * attempt)); return fetchAllUsers(attempt + 1); }
      return [];
    }
    if (!Array.isArray(data) || data.length === 0) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); return fetchAllUsers(attempt + 1); }
      return [];
    }
    return data.map(u => ({ ...u, photoURL: u.photo_url, lastLogin: u.last_login_at, createdAt: u.created_at }));
  } catch {
    if (attempt < 3) { await new Promise(r => setTimeout(r, 1500 * attempt)); return fetchAllUsers(attempt + 1); }
    return [];
  }
}
