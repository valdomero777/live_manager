/**
 * The browser reports audio.src as an absolute URL; AudioService state is compared against it, so
 * every sound component normalizes URLs the same way. Malformed input is returned unchanged.
 */
export function absoluteSoundUrl(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}
