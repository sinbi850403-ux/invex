import { isSuperAdminEmail } from '../admin-emails.js';

const VALID_ROLES = new Set(['viewer', 'staff', 'manager', 'admin']);

export function resolveProfileRole(role, email) {
  if (isSuperAdminEmail(email)) return 'admin';
  if (VALID_ROLES.has(role)) return role;
  return 'viewer';
}

export function getFallbackProfile(user) {
  return {
    uid: user?.uid || null,
    email: user?.email || null,
    name: user?.displayName || '사용자',
    photoURL: user?.photoURL || null,
    role: resolveProfileRole(null, user?.email),
    plan: 'free',
  };
}

export function createBootstrapProfile(user) {
  return {
    id: user.uid,
    email: user.email,
    name: user.displayName,
    photo_url: user.photoURL,
    plan: 'free',
    created_at: new Date().toISOString(),
  };
}

export function mapProfileData(data, fallback) {
  return {
    uid: data.id,
    email: data.email || fallback.email,
    name: data.name || fallback.name,
    photoURL: data.photo_url || fallback.photoURL,
    role: resolveProfileRole(data.role, data.email || fallback.email),
    plan: data.plan || 'free',
    createdAt: data.created_at,
    lastLogin: new Date().toISOString(),
    beginnerMode: data.beginner_mode,
    dashboardMode: data.dashboard_mode,
  };
}
