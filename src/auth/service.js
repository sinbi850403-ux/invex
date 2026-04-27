import {
  getCurrentUser,
  getUserProfileData,
  initAuth,
  loginWithEmail,
  loginWithGoogle,
  logout,
  resetPassword,
  signupWithEmail,
} from '../auth.js';

export function getAuthSnapshot() {
  return {
    user: getCurrentUser(),
    profile: getUserProfileData(),
  };
}

export function subscribeAuth(listener) {
  return initAuth(listener);
}

export async function loginWithEmailPassword(email, password) {
  return loginWithEmail(email, password);
}

export async function loginWithGoogleAccount(options = {}) {
  return loginWithGoogle(options);
}

export async function registerWithEmail(email, password, name) {
  return signupWithEmail(email, password, name);
}

export async function sendPasswordReset(email) {
  return resetPassword(email);
}

export async function signOut() {
  return logout();
}
