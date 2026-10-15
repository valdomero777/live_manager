/**
 * Turns what the user typed ("abc.trycloudflare.com", "https://abc.trycloudflare.com/panel")
 * into an origin ("https://abc.trycloudflare.com"). Anything that is not a plain host or an
 * http(s) address gives undefined, so a typo never ends up inside a copied overlay link.
 */
export function normalizePublicUrl(raw: string): string | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    const isWeb = url.protocol === 'https:' || url.protocol === 'http:';
    const isHost = url.hostname.includes('.') || url.hostname === 'localhost';
    return isWeb && isHost ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
