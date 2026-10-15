export const E2E_PORT = Number(process.env['E2E_PORT'] ?? 3217);
export const E2E_PASSWORD = 'e2e-password-1';
export const E2E_OVERLAY_KEY = 'e2e-overlay-key-0123456789';
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;
export const E2E_AUTH_FILE = 'e2e/.auth/state.json';
