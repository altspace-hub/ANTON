/**
 * content-security-policy.test.ts — the CSP header helmet sends
 * (server/lib/content-security-policy.ts, used by server/index.ts).
 *
 * On the public demo (DEMO_MODE=true) img-src holds no remote origin, so an
 * image in an AI answer cannot make a visitor's browser contact another host
 * (privacy memo D22 / H5). The negative control: an ordinary server still
 * loads remote images. Neither allows a Google Fonts host (G5). On the demo
 * connect-src is 'self' alone: no provider API host and no ws:/wss: to any
 * host (privacy verification 2026-09-26, problem 11).
 */
import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { contentSecurityPolicy } from 'helmet';
import { cspDirectives } from '../../server/lib/content-security-policy';

/** The Content-Security-Policy header helmet writes for these directives, as directive → sources. */
function cspHeader(demo: boolean): Map<string, string[]> {
  let header = '';
  const res = {
    setHeader: (name: string, value: string) => {
      if (name.toLowerCase() === 'content-security-policy') header = String(value);
    },
    removeHeader: () => undefined,
  };
  contentSecurityPolicy({ directives: cspDirectives(demo) })(
    {} as IncomingMessage,
    res as unknown as ServerResponse,
    () => undefined,
  );
  expect(header).not.toBe('');
  const map = new Map<string, string[]>();
  for (const part of header.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

const LOCAL_IMAGE_SOURCES = ["'self'", 'data:', 'blob:'];

describe('CSP img-src', () => {
  it('on the demo allows only the app\'s own images', () => {
    const img = cspHeader(true).get('img-src');
    expect(img).toBeDefined();
    const remote = (img ?? []).filter((source) => !LOCAL_IMAGE_SOURCES.includes(source));
    expect(remote).toEqual([]);
    // What the app itself needs: its files, QR codes (data:), upload previews (blob:).
    expect(img).toEqual(expect.arrayContaining(LOCAL_IMAGE_SOURCES));
  });

  it('outside the demo still allows remote https images', () => {
    expect(cspHeader(false).get('img-src')).toContain('https:');
  });
});

describe('CSP fonts', () => {
  for (const demo of [true, false]) {
    it(`${demo ? 'on the demo' : 'outside the demo'} allows fonts and styles from this origin only`, () => {
      const csp = cspHeader(demo);
      expect(csp.get('font-src')).toEqual(["'self'", 'data:']);
      expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
      expect([...csp.values()].flat().filter((source) => /fonts\.(googleapis|gstatic)\.com/.test(source))).toEqual([]);
    });
  }
});

describe('CSP connect-src', () => {
  it('on the demo lets the browser talk to this server only: no provider host, no ws:/wss: to any host', () => {
    // Problem 11 of the privacy verification (2026-09-26): nothing on the demo
    // loads from the provider APIs, and the demo refuses the only WebSocket users.
    expect(cspHeader(true).get('connect-src')).toEqual(["'self'"]);
  });

  it('outside the demo still allows WebSockets and the provider API hosts (negative control)', () => {
    const connect = cspHeader(false).get('connect-src') ?? [];
    expect(connect).toEqual(expect.arrayContaining(["'self'", 'ws:', 'wss:', 'https://api.anthropic.com', 'https://api.openai.com']));
  });
});
