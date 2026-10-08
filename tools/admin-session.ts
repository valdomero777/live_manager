import { API_PREFIX } from '@tiklive/contracts';

export const BASE_URL = process.env['TIKLIVE_URL'] ?? 'http://localhost:3000';

/**
 * Logs in with the dashboard password from TIKLIVE_PASSWORD and returns the session cookie
 * that the CLI tools send with their requests.
 */
export async function adminCookie(): Promise<string> {
  const password = process.env['TIKLIVE_PASSWORD'];
  if (!password) {
    throw new Error(
      'Falta la contraseña del panel. En PowerShell: $env:TIKLIVE_PASSWORD = "tu-contraseña"',
    );
  }
  const res = await fetch(`${BASE_URL}${API_PREFIX}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok)
    throw new Error(`No se pudo iniciar sesión (HTTP ${res.status}): ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('El servidor no devolvió la cookie de sesión');
  return cookie;
}
