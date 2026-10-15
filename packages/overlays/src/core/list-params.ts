/** Items of a list parameter are separated by "|" (a character that cannot appear in a handle). */
const SEPARATOR = '|';
const MAX_ITEMS = 20;
const MAX_ITEM_LENGTH = 200;

export function parseList(raw: string | null): string[] {
  return (raw ?? '')
    .split(SEPARATOR)
    .map((item) => item.trim().slice(0, MAX_ITEM_LENGTH))
    .filter((item) => item !== '')
    .slice(0, MAX_ITEMS);
}

export interface SocialProfile {
  readonly platform: string;
  readonly handle: string;
}

/** "youtube:@canal|kick:usuario" — the platform is the text before the first colon. */
export function parseProfiles(raw: string | null): SocialProfile[] {
  const profiles: SocialProfile[] = [];
  for (const item of parseList(raw)) {
    const colon = item.indexOf(':');
    if (colon <= 0) continue;
    const platform = item.slice(0, colon).trim();
    const handle = item.slice(colon + 1).trim();
    if (platform !== '' && handle !== '') profiles.push({ platform, handle });
  }
  return profiles;
}
