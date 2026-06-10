/**
 * service-pack-security.test.ts — Wave-3 3A.4 security test floor.
 *
 * The pure surfaces every Service Pack request passes through:
 *   • substitute / substituteUrl / substituteDeep — parameter substitution
 *     into selectors, URLs, and JSON bodies (URL params must be
 *     percent-encoded; body structure must survive injection-shaped values).
 *   • isUrlAllowed — the pack-scoped egress allowlist (host-confusion
 *     attacks: userinfo@, lookalike suffixes, IP literals, port tricks).
 *   • BODY_COMPOSERS gmail.rfc5322_send — CRLF in to/subject must never
 *     become extra RFC 5322 headers (Bcc smuggling).
 *   • extractGrowBlocks — fenced-JSON parsing of untrusted LLM output.
 */
import { describe, it, expect } from 'vitest';
import {
  substitute,
  substituteUrl,
  substituteDeep,
} from '../../../server/services/missions/service-pack-manager.js';
import {
  isUrlAllowed,
  BODY_COMPOSERS,
} from '../../../server/services/missions/executors/service-pack-api-executor.js';
import { extractGrowBlocks } from '../../../server/services/missions/mission-executor.js';

// ── substitute (selectors / values / doc templates) ─────────────────────────

describe('substitute', () => {
  it('replaces known params and blanks unknown ones (no placeholder leakage into requests)', () => {
    expect(substitute('q=${query}&x=${missing}', { query: 'amlr' })).toBe('q=amlr&x=');
  });

  it('passes undefined through (optional step fields stay optional)', () => {
    expect(substitute(undefined, { a: '1' })).toBeUndefined();
  });

  it('param values are inert — a value containing ${other} is NOT re-expanded', () => {
    expect(substitute('v=${a}', { a: '${b}', b: 'SECRET' })).toBe('v=${b}');
  });

  it('regex replacement tokens in values stay literal', () => {
    expect(substitute('v=${a}', { a: "$&$'$1" })).toBe("v=$&$'$1");
  });
});

// ── substituteUrl (percent-encoding anchor) ─────────────────────────────────

describe('substituteUrl', () => {
  it('percent-encodes params so & and = cannot splice extra query parameters', () => {
    expect(substituteUrl('https://api.x.com/v1?q=${q}', { q: 'a&admin=true' }))
      .toBe('https://api.x.com/v1?q=a%26admin%3Dtrue');
  });

  it('encodes path-traversal sequences in substituted segments', () => {
    expect(substituteUrl('https://api.x.com/users/${id}/posts', { id: '../../admin' }))
      .toBe('https://api.x.com/users/..%2F..%2Fadmin/posts');
  });

  it('encodes scheme/host-confusion characters (@, /, :) so a param cannot retarget the host', () => {
    expect(substituteUrl('https://api.x.com/u/${u}', { u: 'evil.com/@x' }))
      .toBe('https://api.x.com/u/evil.com%2F%40x');
    expect(substituteUrl('https://api.x.com/r?next=${next}', { next: 'https://evil.com' }))
      .toBe('https://api.x.com/r?next=https%3A%2F%2Fevil.com');
  });

  it('encodes CR/LF (no header injection through the request line)', () => {
    expect(substituteUrl('https://api.x.com/?q=${q}', { q: 'a\r\nHost: evil' }))
      .toBe('https://api.x.com/?q=a%0D%0AHost%3A%20evil');
  });
});

// ── substituteDeep (JSON body structural integrity) ─────────────────────────

describe('substituteDeep', () => {
  it('substitutes string leaves only — structure, numbers, booleans, null untouched', () => {
    const out = substituteDeep(
      { a: '${x}', n: 5, b: true, z: null, arr: ['${x}', 1], nested: { k: '${x}' } },
      { x: 'v' },
    );
    expect(out).toEqual({ a: 'v', n: 5, b: true, z: null, arr: ['v', 1], nested: { k: 'v' } });
  });

  it('JSON-injection-shaped values stay inside their string leaf (no new keys appear)', () => {
    const out = substituteDeep({ name: '${n}' }, { n: '","admin":true,"x":"' }) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(['name']);
    expect(out.name).toBe('","admin":true,"x":"');
    // Round-trip through JSON.stringify (what the executor sends) stays one field.
    expect(JSON.parse(JSON.stringify(out))).toEqual({ name: '","admin":true,"x":"' });
  });

  it('substitutes placeholder keys (Notion dynamic property names) without disturbing others', () => {
    const out = substituteDeep({ '${title_key}': [{ text: '${v}' }] }, { title_key: 'Name', v: 'Row' });
    expect(out).toEqual({ Name: [{ text: 'Row' }] });
  });
});

// ── isUrlAllowed (egress allowlist) ─────────────────────────────────────────

describe('isUrlAllowed', () => {
  const bases = ['https://gmail.googleapis.com', 'https://oauth2.googleapis.com'];

  it('allows the exact host and real subdomains', () => {
    expect(isUrlAllowed('https://gmail.googleapis.com/gmail/v1/users/me/messages', bases)).toBe(true);
    expect(isUrlAllowed('https://eu.gmail.googleapis.com/x', bases)).toBe(true);
  });

  it('blocks lookalike suffix hosts (evilgmail.googleapis.com.attacker.net)', () => {
    expect(isUrlAllowed('https://gmail.googleapis.com.attacker.net/x', bases)).toBe(false);
    expect(isUrlAllowed('https://evilgmail.googleapis.com.evil.com/x', bases)).toBe(false);
    expect(isUrlAllowed('https://notgmail.googleapis.com.io/x', bases)).toBe(false);
  });

  it('userinfo@ host confusion: credentials-in-URL cannot fake the allowed host', () => {
    expect(isUrlAllowed('https://gmail.googleapis.com@evil.com/steal', bases)).toBe(false);
    expect(isUrlAllowed('https://gmail.googleapis.com:pass@evil.com/', bases)).toBe(false);
  });

  it('IP literals and localhost are not the allowed host', () => {
    expect(isUrlAllowed('https://142.250.74.1/x', bases)).toBe(false);
    expect(isUrlAllowed('http://127.0.0.1:8080/x', bases)).toBe(false);
    expect(isUrlAllowed('http://[::1]/x', bases)).toBe(false);
    expect(isUrlAllowed('http://169.254.169.254/latest/meta-data/', bases)).toBe(false);
  });

  it('ports do not defeat host matching (hostname comparison ignores port)', () => {
    expect(isUrlAllowed('https://gmail.googleapis.com:8443/x', bases)).toBe(true);
    expect(isUrlAllowed('https://evil.com:443/gmail.googleapis.com', bases)).toBe(false);
  });

  it('only http(s) schemes pass — file:, ftp:, javascript: refused', () => {
    expect(isUrlAllowed('file:///etc/passwd', bases)).toBe(false);
    expect(isUrlAllowed('ftp://gmail.googleapis.com/x', bases)).toBe(false);
    expect(isUrlAllowed('javascript:alert(1)', bases)).toBe(false);
  });

  it('garbage URLs and invalid base entries fail closed', () => {
    expect(isUrlAllowed('not a url', bases)).toBe(false);
    expect(isUrlAllowed('https://x.com/', ['%%%not-a-base%%%'])).toBe(false);
    expect(isUrlAllowed('https://x.com/', [])).toBe(false);
  });
});

// ── gmail.rfc5322_send composer (header injection) ──────────────────────────

describe("BODY_COMPOSERS['gmail.rfc5322_send']", () => {
  const compose = BODY_COMPOSERS['gmail.rfc5322_send'];

  function decodeRaw(body: string): string {
    const { raw } = JSON.parse(body) as { raw: string };
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b64, 'base64').toString('utf-8');
  }

  it('composes a valid RFC 5322 message wrapped as { raw: base64url }', () => {
    const r = compose({ to: 'user@example.com', subject: 'Hello', body_text: 'Hi there' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const msg = decodeRaw(r.body);
      expect(msg).toContain('To: user@example.com');
      expect(msg).toContain('Subject: Hello');
      expect(msg.endsWith('Hi there')).toBe(true);
      // base64url alphabet only — no +, /, or = padding
      const { raw } = JSON.parse(r.body) as { raw: string };
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('HEADER INJECTION: CRLF in subject cannot create a Bcc header LINE (it folds into the subject text)', () => {
    const r = compose({ to: 'user@example.com', subject: 'Hi\r\nBcc: victim@example.com', body_text: 'x' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const msg = decodeRaw(r.body);
      const headerLines = msg.split('\r\n\r\n')[0].split('\r\n');
      // The injected text survives only INSIDE the Subject value — it never
      // becomes a header line of its own, which is what a mail server parses.
      expect(headerLines.some(l => l.startsWith('Bcc:'))).toBe(false);
      expect(headerLines.filter(l => l.startsWith('Subject:'))).toHaveLength(1);
      expect(headerLines).toHaveLength(4); // To, Subject, MIME-Version, Content-Type
    }
  });

  it('HEADER INJECTION: bare LF and CR variants in subject are neutralised too', () => {
    for (const subject of ['Hi\nX-Evil: 1', 'Hi\rX-Evil: 1', 'Hi\n\nbody-smuggle']) {
      const r = compose({ to: 'user@example.com', subject, body_text: 'x' });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const headerLines = decodeRaw(r.body).split('\r\n\r\n')[0].split('\r\n');
        expect(headerLines.some(l => l.startsWith('X-Evil'))).toBe(false);
        expect(headerLines).toHaveLength(4); // To, Subject, MIME-Version, Content-Type
      }
    }
  });

  it('HEADER INJECTION: a CRLF-bearing "to" fails validation outright (not a valid address)', () => {
    const r = compose({ to: 'user@example.com\r\nBcc: victim@example.com', subject: 'Hi', body_text: 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects missing/invalid recipients and missing subject', () => {
    expect(compose({ subject: 'Hi', body_text: 'x' }).ok).toBe(false);
    expect(compose({ to: 'not-an-email', subject: 'Hi', body_text: 'x' }).ok).toBe(false);
    expect(compose({ to: 'user@example.com', body_text: 'x' }).ok).toBe(false);
  });

  it('body_text may legitimately contain CRLF (it lives below the header separator)', () => {
    const r = compose({ to: 'user@example.com', subject: 'Hi', body_text: 'line1\r\nline2' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(decodeRaw(r.body)).toContain('line1\r\nline2');
  });
});

describe("BODY_COMPOSERS['notion.properties_patch']", () => {
  const compose = BODY_COMPOSERS['notion.properties_patch'];

  it('wraps a valid JSON object as { properties: … }', () => {
    const r = compose({ properties_json: '{"Status":{"select":{"name":"Done"}}}' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.parse(r.body)).toEqual({ properties: { Status: { select: { name: 'Done' } } } });
  });

  it('rejects invalid JSON, arrays, and missing input as clean step failures', () => {
    expect(compose({ properties_json: '{nope' }).ok).toBe(false);
    expect(compose({ properties_json: '[1,2]' }).ok).toBe(false);
    expect(compose({}).ok).toBe(false);
  });
});

// ── extractGrowBlocks (untrusted LLM output parsing) ────────────────────────

describe('extractGrowBlocks', () => {
  it('extracts well-formed fenced blocks of all three kinds', () => {
    const text = [
      'Prose before.',
      '```grow_lead\n{"firstName":"Ada","lastName":"L"}\n```',
      'middle',
      '```grow_signal\n{"signalType":"regulatory","title":"AMLR"}\n```',
    ].join('\n');
    const blocks = extractGrowBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: 'grow_lead', data: { firstName: 'Ada', lastName: 'L' } });
    expect(blocks[1].kind).toBe('grow_signal');
  });

  it('silently skips malformed JSON and non-object payloads (arrays, scalars)', () => {
    const text = [
      '```grow_lead\n{not json}\n```',
      '```grow_opportunity\n[1,2,3]\n```',
      '```grow_signal\n"just a string"\n```',
      '```grow_lead\n{"firstName":"OK"}\n```',
    ].join('\n');
    const blocks = extractGrowBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].data).toEqual({ firstName: 'OK' });
  });

  it('ignores unknown fence tags (no arbitrary block kinds reach the CRM bridge)', () => {
    expect(extractGrowBlocks('```grow_admin\n{"x":1}\n```\n```json\n{"y":2}\n```')).toEqual([]);
  });

  it('returns [] for plain prose', () => {
    expect(extractGrowBlocks('No blocks here.')).toEqual([]);
  });
});
