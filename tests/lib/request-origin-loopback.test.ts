/**
 * request-origin-loopback.test.ts — "is this caller on this machine?" cannot
 * be answered by a header the caller wrote (public showcase review,
 * 2026-09-25, finding L9).
 *
 * isLoopbackRequest() read req.ip alone. With TRUST_PROXY a hop count (1) or
 * `true`, Express trusts whatever socket connects as the proxy, so a remote
 * client reaching port 3001 directly (ANTON_LAN_BIND, a published docker
 * port) sent `X-Forwarded-For: 127.0.0.1`, req.ip became 127.0.0.1, and /mcp
 * without MCP_SECRET and /metrics were served to the network. It now needs
 * the socket on this machine as well.
 *
 * req is built on Express's own request prototype, so req.ip is exactly what
 * Express computes for that socket, header and TRUST_PROXY value.
 *
 * Negative controls: a direct local request is still local; a visitor
 * forwarded by a same-host proxy is still not.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import { isLoopbackRequest } from '../../server/lib/request-origin.js';

type TestRequest = { ip?: string; socket: { remoteAddress?: string } };

/** A request as Express sees it: its socket address and X-Forwarded-For, under a TRUST_PROXY setting. */
function expressRequest(trustProxy: number | boolean | string, socketAddress: string, forwardedFor?: string): TestRequest {
  const app = express();
  app.set('trust proxy', trustProxy);
  const socket = { remoteAddress: socketAddress };
  const req = Object.create(app.request) as TestRequest & { app: unknown; headers: Record<string, string>; connection: unknown };
  req.app = app;
  req.headers = forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};
  req.socket = socket;
  req.connection = socket;
  return req;
}

describe('isLoopbackRequest', () => {
  for (const trust of [1, true] as const) {
    it(`TRUST_PROXY=${String(trust)}: a remote socket forging X-Forwarded-For: 127.0.0.1 is not local`, () => {
      const req = expressRequest(trust, '203.0.113.7', '127.0.0.1');
      // Express is fooled: this is what the old check read.
      expect(req.ip).toBe('127.0.0.1');
      expect(isLoopbackRequest(req)).toBe(false);
      expect(isLoopbackRequest(expressRequest(trust, '::ffff:203.0.113.7', '::1'))).toBe(false);
    });

    it(`TRUST_PROXY=${String(trust)}: negative control — a direct local request is local`, () => {
      expect(isLoopbackRequest(expressRequest(trust, '127.0.0.1'))).toBe(true);
      expect(isLoopbackRequest(expressRequest(trust, '::1'))).toBe(true);
    });

    it(`TRUST_PROXY=${String(trust)}: negative control — a visitor forwarded by a same-host proxy is not`, () => {
      expect(isLoopbackRequest(expressRequest(trust, '127.0.0.1', '203.0.113.7'))).toBe(false);
    });
  }

  it('TRUST_PROXY=loopback (the default): the forged header was never believed, and still is not', () => {
    const req = expressRequest('loopback', '203.0.113.7', '127.0.0.1');
    expect(req.ip).toBe('203.0.113.7');
    expect(isLoopbackRequest(req)).toBe(false);
    expect(isLoopbackRequest(expressRequest('loopback', '127.0.0.1'))).toBe(true);
  });

  it('a request with no socket address is not local', () => {
    expect(isLoopbackRequest({ ip: '127.0.0.1', socket: {} })).toBe(false);
    expect(isLoopbackRequest({ ip: '127.0.0.1' })).toBe(false);
  });
});
