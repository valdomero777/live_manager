import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpWebhookClient } from './http-webhook-client.js';

let server: Server | undefined;
afterEach(() => new Promise<void>((done) => (server ? server.close(() => done()) : done())));

async function listen(handler: (req: IncomingMessage, body: string) => number | void) {
  const received: { method: string | undefined; body: string }[] = [];
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      received.push({ method: req.method, body });
      res.statusCode = handler(req, body) ?? 200;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, received };
}

const policy = (allowed: string[], priv: string[] = []) => ({
  allowedHosts: new Set(allowed),
  privateHosts: new Set(priv),
});

describe('HttpWebhookClient', () => {
  it('given a host that is not listed, then it is refused without connecting', async () => {
    const { port, received } = await listen(() => undefined);
    const client = new HttpWebhookClient(policy(['example.com']));
    const url = `http://127.0.0.1:${port}/`;
    expect(client.isAllowed(url)).toBe(false);
    await expect(client.send({ url, method: 'POST', body: '{}' })).rejects.toThrow(/not allowed/);
    expect(received).toEqual([]);
  });

  it('given a listed loopback host that is not marked private, then the address check blocks it', async () => {
    const { port, received } = await listen(() => undefined);
    const client = new HttpWebhookClient(policy(['localhost']));
    await expect(
      client.send({ url: `http://localhost:${port}/`, method: 'POST', body: '{}' }),
    ).rejects.toThrow(/non-public/);
    expect(received).toEqual([]);
  });

  it('given a host listed as private, then it posts the body', async () => {
    const { port, received } = await listen(() => undefined);
    const client = new HttpWebhookClient(policy(['localhost'], ['localhost']));
    await client.send({ url: `http://localhost:${port}/hook`, method: 'PUT', body: '{"a":1}' });
    expect(received).toEqual([{ method: 'PUT', body: '{"a":1}' }]);
  });

  it('given a non-2xx answer, then it rejects', async () => {
    const { port } = await listen(() => 500);
    const client = new HttpWebhookClient(policy(['localhost'], ['localhost']));
    await expect(
      client.send({ url: `http://localhost:${port}/`, method: 'POST', body: '{}' }),
    ).rejects.toThrow('HTTP 500');
  });

  it('given a redirect, then it is not followed', async () => {
    const { port, received } = await listen((req) => (req.url === '/' ? 302 : 200));
    const client = new HttpWebhookClient(policy(['localhost'], ['localhost']));
    await expect(
      client.send({ url: `http://localhost:${port}/`, method: 'POST', body: '{}' }),
    ).rejects.toThrow('HTTP 302');
    expect(received).toHaveLength(1);
  });
});
