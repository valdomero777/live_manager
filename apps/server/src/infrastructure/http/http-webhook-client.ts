import { lookup } from 'node:dns';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { WebhookClient, WebhookRequest } from '../../application/ports/webhook-client.js';
import {
  isHostAllowed,
  isNonPublicAddress,
  mayUsePrivateAddress,
  type WebhookPolicy,
} from '../../domain/webhook/network-guard.js';

export const WEBHOOK_TIMEOUT_MS = 3_000;
export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Webhook client with SSRF protection: only listed hosts, addresses checked at connection time
 * (so a DNS answer cannot change between check and use), no redirects, 3 s timeout, response
 * capped at 64 KB.
 */
export class HttpWebhookClient implements WebhookClient {
  constructor(private readonly policy: WebhookPolicy) {}

  isAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        isHostAllowed(this.policy, parsed.hostname)
      );
    } catch {
      return false;
    }
  }

  send({ url, method, body }: WebhookRequest): Promise<void> {
    if (!this.isAllowed(url)) return Promise.reject(new Error('destination not allowed'));
    const target = new URL(url);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const privateOk = mayUsePrivateAddress(this.policy, target.hostname);
    return new Promise((resolve, reject) => {
      const req = request(
        target,
        {
          method,
          lookup: publicOnlyLookup(privateOk),
          timeout: WEBHOOK_TIMEOUT_MS,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            'user-agent': 'tiklive-webhook',
          },
        },
        (res) => readResponse(res, req, resolve, reject),
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
      req.end(body);
    });
  }
}

/** DNS lookup that refuses non-public answers unless the host is exempt; used at connect time. */
function publicOnlyLookup(privateOk: boolean): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, options, (error, address, family) => {
      const first = Array.isArray(address) ? address[0]?.address : address;
      if (!error && first && !privateOk && isNonPublicAddress(first)) {
        callback(new Error(`${hostname} resolves to a non-public address`), '', 4);
        return;
      }
      (callback as (...args: unknown[]) => void)(error, address, family);
    });
  };
}

/** Succeeds on 2xx; the body is only counted (and capped), never kept. */
function readResponse(
  res: IncomingMessage,
  req: ClientRequest,
  resolve: () => void,
  reject: (error: Error) => void,
): void {
  let received = 0;
  res.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (received > WEBHOOK_MAX_RESPONSE_BYTES) req.destroy(new Error('response too large'));
  });
  res.on('end', () => {
    const status = res.statusCode ?? 0;
    if (status >= 200 && status < 300) resolve();
    else reject(new Error(`HTTP ${status}`));
  });
  res.on('error', reject);
}
