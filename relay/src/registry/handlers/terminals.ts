/**
 * terminals.ts — per-business terminal authorization registry.
 *
 *   POST /v1/terminals/publish        — store a signed terminal cert
 *   GET  /v1/terminals/:companyAddr   — list a company's authorized tills
 *
 * A terminal cert is self-authorizing (signed by the company money key),
 * so there is no KYC and no review — unlike portal submissions. The relay
 * verifies only the Ed25519 SIGNATURE before storing (keeps junk out); the
 * fetching client re-verifies fully (incl. that companyAddr derives from
 * companyPub) so it never trusts the relay's grouping. See
 * src/business/services/terminal-cert.ts + relay verify.ts.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { RegistryDb } from '../db.js';
import { json } from '../routes.js';
import { verifyTerminalCertSig } from '../verify.js';

async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 16 * 1024,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > maxBytes) { aborted = true; resolve({ ok: false, error: `body exceeds ${maxBytes} bytes` }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf-8')) }); }
      catch { resolve({ ok: false, error: 'body is not valid JSON' }); }
    });
    req.on('error', () => { if (!aborted) resolve({ ok: false, error: 'request stream error' }); });
  });
}

interface CertShape {
  v: number; companyPub: string; companyAddr: string;
  terminalPub: string; label: string; issuedAt: number; sig: string;
}

function asCert(v: unknown): CertShape | null {
  const c = (v && typeof v === 'object' && 'cert' in (v as Record<string, unknown>))
    ? (v as Record<string, unknown>).cert
    : v;
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.companyPub !== 'string' || !/^[0-9a-f]{64}$/i.test(o.companyPub)) return null;
  if (typeof o.terminalPub !== 'string' || !/^[0-9a-f]{64}$/i.test(o.terminalPub)) return null;
  if (typeof o.sig !== 'string' || !/^[0-9a-f]{128}$/i.test(o.sig)) return null;
  if (typeof o.companyAddr !== 'string' || !/^fc_[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(o.companyAddr)) return null;
  if (typeof o.label !== 'string') return null;
  if (typeof o.issuedAt !== 'number' || !Number.isFinite(o.issuedAt)) return null;
  return o as unknown as CertShape;
}

export async function handlePublishTerminal(
  req: IncomingMessage, res: ServerResponse, db: RegistryDb, log: Logger,
): Promise<void> {
  const body = await readJsonBody(req);
  if (!body.ok) { json(res, 400, { error: 'invalid_body', message: body.error }); return; }
  const cert = asCert(body.value);
  if (!cert) { json(res, 400, { error: 'invalid_cert', message: 'malformed terminal cert' }); return; }
  if (!(await verifyTerminalCertSig(cert as unknown as Record<string, unknown>))) {
    json(res, 400, { error: 'invalid_signature', message: 'cert signature does not verify against companyPub' });
    return;
  }
  try {
    await db.query(
      `INSERT INTO terminal_certs (company_addr, terminal_pub, company_pub, label, issued_at, cert_json)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (company_addr, terminal_pub) DO UPDATE
         SET company_pub = EXCLUDED.company_pub, label = EXCLUDED.label,
             issued_at = EXCLUDED.issued_at, cert_json = EXCLUDED.cert_json,
             published_at = now()`,
      [
        cert.companyAddr, cert.terminalPub.toLowerCase(), cert.companyPub.toLowerCase(),
        cert.label.slice(0, 80), Math.floor(cert.issuedAt), JSON.stringify(cert),
      ],
    );
    json(res, 201, { ok: true, companyAddr: cert.companyAddr, terminalPub: cert.terminalPub.toLowerCase() });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'terminal publish failed');
    json(res, 500, { error: 'internal_error', message: 'failed to store terminal cert' });
  }
}

export async function handleListTerminals(
  _req: IncomingMessage, res: ServerResponse, db: RegistryDb, log: Logger, companyAddr: string,
): Promise<void> {
  if (!/^fc_[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(companyAddr)) {
    json(res, 400, { error: 'invalid_address', message: 'companyAddr must be an fc_ address' });
    return;
  }
  try {
    const rows = await db.query<{ cert_json: unknown }>(
      `SELECT cert_json FROM terminal_certs WHERE company_addr = $1 ORDER BY published_at DESC LIMIT 500`,
      [companyAddr],
    );
    json(res, 200, { companyAddr, terminals: rows.rows.map((r) => r.cert_json) });
  } catch (err) {
    log.error({ err: (err as Error).message }, 'terminal list failed');
    json(res, 500, { error: 'internal_error', message: 'failed to list terminals' });
  }
}
