import { isIP } from 'node:net';

/**
 * Webhook destination policy (spec 18, SSRF). A host must be listed to be called at all; of the
 * listed hosts, only those also in `privateHosts` may resolve to loopback or LAN addresses.
 */
export interface WebhookPolicy {
  readonly allowedHosts: ReadonlySet<string>;
  readonly privateHosts: ReadonlySet<string>;
}

export const EMPTY_WEBHOOK_POLICY: WebhookPolicy = {
  allowedHosts: new Set(),
  privateHosts: new Set(),
};

/** "A.com, b.com " -> Set { "a.com", "b.com" } */
export function parseHostList(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  );
}

/** URL hostnames wrap IPv6 literals in brackets; the lists hold them bare. */
export function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

export function isHostAllowed(policy: WebhookPolicy, hostname: string): boolean {
  return policy.allowedHosts.has(normalizeHost(hostname));
}

export function mayUsePrivateAddress(policy: WebhookPolicy, hostname: string): boolean {
  return policy.privateHosts.has(normalizeHost(hostname));
}

/** [first octet, second-octet min, second-octet max] of every non-public IPv4 block. */
const BLOCKED_IPV4: readonly (readonly [number, number, number])[] = [
  [0, 0, 255], // "this" network
  [10, 0, 255],
  [127, 0, 255],
  [100, 64, 127], // carrier-grade NAT
  [169, 254, 254], // link-local, cloud metadata
  [172, 16, 31],
  [192, 168, 168],
  [192, 0, 0], // IETF protocol assignments
  [198, 18, 19], // benchmarking
];

function ipv4Blocked(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number);
  if (a >= 224) return true; // multicast and reserved
  return BLOCKED_IPV4.some(([first, min, max]) => a === first && b >= min && b <= max);
}

function ipv6Blocked(address: string): boolean {
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1]) return ipv4Blocked(mapped[1]);
  if (lower === '::' || lower === '::1') return true;
  const first = parseInt(lower.split(':')[0] || '0', 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 // multicast
  );
}

/** True for loopback, private, link-local, metadata and other non-public addresses. */
export function isNonPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4Blocked(address);
  if (family === 6) return ipv6Blocked(address);
  return true; // not an IP: never trust it
}
