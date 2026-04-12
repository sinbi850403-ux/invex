/**
 * Firebase Auth compatibility shim on top of Supabase auth.
 */

import { supabase } from './supabase-client.js';
import { getCurrentUser } from './firebase-auth.js';

export function getAuth() {
  return {
    currentUser: getCurrentUser(),
  };
}

export const EmailAuthProvider = {
  credential(email, password) {
    return { email, password };
  },
};

export async function reauthenticateWithCredential(_user, credential) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithPassword({
    email: credential?.email || '',
    password: credential?.password || '',
  });
  if (error) throw error;
  return true;
}

export async function updatePassword(_user, newPassword) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return true;
}

export async function deleteUser(_user) {
  // Supabase에서는 클라이언트에서 직접 사용자 삭제가 제한적이므로
  // 즉시 로그아웃 처리 + 오류 안내로 대체
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  throw new Error('계정 삭제는 관리자 처리 또는 서버 함수가 필요합니다.');
}

