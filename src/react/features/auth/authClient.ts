import {
  getAuthSnapshot,
  loginWithEmailPassword,
  loginWithGoogleAccount,
  registerWithEmail,
  sendPasswordReset,
  signOut,
  subscribeAuth,
} from '../../../auth/service.js';

export { getAuthSnapshot, loginWithEmailPassword, registerWithEmail, sendPasswordReset, signOut };

export function subscribeToAuth(listener: Parameters<typeof subscribeAuth>[0]) {
  return subscribeAuth(listener);
}

export async function loginWithGoogleForReact() {
  return loginWithGoogleAccount({
    redirectTo: `${window.location.origin}/react.html#/auth`,
  });
}
