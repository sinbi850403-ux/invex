/**
 * backend-config.js
 * Compatibility flags for older pages that still use the bridge layer.
 */

export const app = null;
export const auth = null;
export const db = null;
export const googleProvider = null;

// Keep "configured" true so legacy pages that gate by this value can keep working
// through compat shims without hard-failing UI.
export const isConfigured = true;

