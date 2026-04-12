/**
 * firebase-config.js (legacy compatibility)
 * Firebase is fully deprecated in this project.
 */

export const app = null;
export const auth = null;
export const db = null;
export const googleProvider = null;

// Keep "configured" true so legacy pages that gate by this value can keep working
// through compat shims without hard-failing UI.
export const isConfigured = true;

