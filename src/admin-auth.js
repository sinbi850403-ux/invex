import { getCurrentUser } from './auth.js';

const ADMIN_EMAILS = [
  'sinbi0214@naver.com',
  'sinbi850403@gmail.com',
  'admin@invex.io.kr',
];

export function isAdmin() {
  const user = getCurrentUser();
  if (!user) return false;
  return ADMIN_EMAILS.includes(user.email);
}
