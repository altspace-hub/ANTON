/**
 * relay-terminals.ts — publish + fetch terminal authorization certs via
 * the ANTON relay registry (relay.futurechain.eu/v1), for the owner's
 * chain-wide "all my tills" dashboard.
 *
 * Publishing is best-effort (a failed publish never blocks the local QR
 * hand-off). Fetching re-verifies EVERY cert client-side — signature,
 * companyAddr-derives-from-companyPub, and that it's for the company we
 * asked about — so we never trust the relay's grouping. The relay only
 * stores signature-valid certs; the client filters anything else.
 */
import { httpFetch } from './native-http';
import { verifyTerminalCert, encodeTerminalCert, type TerminalCert } from './terminal-cert';

/** Default relay registry base. (A future Settings field can override.) */
export const RELAY_BASE = 'https://relay.futurechain.eu/v1';

/** POST a signed cert to the relay. Returns true on 2xx, false otherwise.
 *  Never throws — callers treat publishing as fire-and-forget. */
export async function publishTerminalCert(cert: TerminalCert, base = RELAY_BASE): Promise<boolean> {
  try {
    const res = await httpFetch(base.replace(/\/+$/, '') + '/terminals/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cert }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Fetch + fully verify a company's authorized tills. Returns only certs
 *  that verify (sig + companyAddr derives from companyPub) AND are for the
 *  requested company. Never throws — returns [] on any failure. */
export async function fetchCompanyTerminals(companyAddr: string, base = RELAY_BASE): Promise<TerminalCert[]> {
  try {
    const res = await httpFetch(
      base.replace(/\/+$/, '') + '/terminals/' + encodeURIComponent(companyAddr),
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { terminals?: unknown[] };
    const list = Array.isArray(data.terminals) ? data.terminals : [];
    const out: TerminalCert[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      const cert = raw as TerminalCert;
      if (!cert || typeof cert !== 'object') continue;
      // Trust nothing from the relay until WE verify it.
      if (!verifyTerminalCert(cert)) continue;
      if (cert.companyAddr !== companyAddr) continue;        // must be for the asked company
      const key = cert.terminalPub.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cert);
    }
    return out;
  } catch {
    return [];
  }
}

/** Re-export so callers can build the QR/string form if needed. */
export { encodeTerminalCert };
