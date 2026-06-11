/**
 * citation-ledger.test.ts — ground-truth citation verification
 * (Core Experience Review 2026-06, item 1.4).
 *
 * Runs against the REAL data/frameworks/*.json fixtures (60 frameworks) so the
 * tests prove the local verification path works on shipped data. The EUR-Lex
 * remote path is exercised through an injected mock fetch — no network.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createCitationLedger, legislationCelex, caseLawCelex } from '../../server/services/citation-ledger.js';

const FRAMEWORKS_DIR = path.join(process.cwd(), 'data', 'frameworks');

function mockFetch(handler: (url: string) => { status: number; body?: string }): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const { status, body = '<html>EUR-Lex document</html>' } = handler(String(input));
    return new Response(body, { status });
  }) as unknown as typeof fetch;
}

/** fetch that always fails (network down) — remote checks must degrade to 'unresolved'. */
const failingFetch = (() => {
  return vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
})();

describe('citation-ledger — CELEX construction', () => {
  it('builds legislation CELEX for year-first references (Regulation (EU) 2024/1624)', () => {
    expect(legislationCelex(2024, 1624, 'R')).toBe('32024R1624');
  });

  it('builds legislation CELEX for number-first references (Council Reg (EU) 269/2014)', () => {
    expect(legislationCelex(269, 2014, 'R')).toBe('32014R0269');
  });

  it('builds case-law CELEX from two-digit years (Case C-617/10 → 62010CJ0617)', () => {
    expect(caseLawCelex(617, '10')).toBe('62010CJ0617');
  });

  it('maps old two-digit years to the 1900s (Case C-26/62 → 61962CJ0026)', () => {
    expect(caseLawCelex(26, '62')).toBe('61962CJ0026');
  });
});

describe('citation-ledger — verified_local against real framework fixtures', () => {
  it('verifies "AMLR Art.12" against data/frameworks/amlr-2024.json with the real article title', async () => {
    const amlr = JSON.parse(fs.readFileSync(path.join(FRAMEWORKS_DIR, 'amlr-2024.json'), 'utf-8')) as {
      name: string; articles: Array<{ id: string; title: string }>;
    };
    const expectedTitle = amlr.articles.find((a) => a.id === 'Art.12')!.title;

    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'AMLR Art.12' }]);
    expect(r.status).toBe('verified_local');
    expect(r.title).toBe(expectedTitle);
    expect(r.source).toContain('Regulation (EU) 2024/1624');
    expect(r.url).toContain('CELEX');
    // No remote call needed for local verification
    expect(failingFetch).not.toHaveBeenCalled();
  });

  it('verifies the full instrument reference "Regulation (EU) 2024/1624" locally', async () => {
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2024/1624' }]);
    expect(r.status).toBe('verified_local');
    expect(r.source).toContain('AMLR');
  });

  it('verifies "DORA Art.19" (incident reporting) locally', async () => {
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'DORA Art.19' }]);
    expect(r.status).toBe('verified_local');
    expect(r.title).toMatch(/incident/i);
  });
});

describe('citation-ledger — not_found (the dangerous one)', () => {
  it('flags "AMLR Art.999" as not_found (AMLR has 90 articles, full local coverage)', async () => {
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'AMLR Art.999' }]);
    expect(r.status).toBe('not_found');
    expect(r.detail).toContain('90');
  });

  it('does NOT claim not_found for partially covered frameworks (GDPR extract is sparse)', async () => {
    // gdpr-2016.json contains a 50-article selection of the 99-article regulation.
    // An article missing from the extract must be 'unresolved', never 'not_found'.
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'GDPR Art.42' }]);
    expect(['verified_local', 'unresolved']).toContain(r.status);
    if (r.status === 'unresolved') expect(r.detail).toMatch(/partial/i);
  });

  it('flags a non-existent EU regulation as not_found via the EUR-Lex 404 path', async () => {
    const fetchImpl = mockFetch(() => ({ status: 404 }));
    const ledger = createCitationLedger({ fetchImpl });
    const [r] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2019/9876' }]);
    expect(r.status).toBe('not_found');
    expect(r.detail).toContain('32019R9876');
  });

  it('detects EUR-Lex soft-404 pages ("document does not exist" with HTTP 200)', async () => {
    const fetchImpl = mockFetch(() => ({ status: 200, body: 'The requested document does not exist.' }));
    const ledger = createCitationLedger({ fetchImpl });
    const [r] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2019/9876' }]);
    expect(r.status).toBe('not_found');
  });
});

describe('citation-ledger — verified_remote (mocked EUR-Lex)', () => {
  it('verifies an EU regulation not held locally via EUR-Lex existence check', async () => {
    const fetchImpl = mockFetch(() => ({ status: 200 }));
    const ledger = createCitationLedger({ fetchImpl });
    const [r] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2015/847' }]);
    expect(r.status).toBe('verified_remote');
    expect(r.url).toContain('CELEX:32015R0847');
  });

  it('verifies CJEU case law "Case C-617/10" via the case-law CELEX', async () => {
    const calls: string[] = [];
    const fetchImpl = mockFetch((url) => { calls.push(url); return { status: 200 }; });
    const ledger = createCitationLedger({ fetchImpl });
    const [r] = await ledger.verifyCitations([{ ref: 'Case C-617/10 Åkerberg Fransson' }]);
    expect(r.status).toBe('verified_remote');
    expect(calls[0]).toContain('62010CJ0617');
  });

  it('caches remote results — second identical check does not re-fetch', async () => {
    const fetchImpl = mockFetch(() => ({ status: 200 }));
    const ledger = createCitationLedger({ fetchImpl });
    await ledger.verifyCitations([{ ref: 'Regulation (EU) 2015/847' }]);
    await ledger.verifyCitations([{ ref: 'Regulation (EU) 2015/847' }]);
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
  });
});

describe('citation-ledger — unresolved (honest non-answers)', () => {
  it('returns unresolved for national law with no local data (POCA)', async () => {
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'POCA 2002 s.330' }]);
    expect(r.status).toBe('unresolved');
    expect(failingFetch).not.toHaveBeenCalled;
  });

  it('returns unresolved for a framework acronym with no local data (CRR Art.92)', async () => {
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'CRR Art.92' }]);
    expect(r.status).toBe('unresolved');
  });

  it('degrades to unresolved (never throws, never blocks) when EUR-Lex is unreachable', async () => {
    const ledger = createCitationLedger({ fetchImpl: failingFetch });
    const [r] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2015/847' }]);
    expect(r.status).toBe('unresolved');
    expect(r.detail).toMatch(/failed|timed out/i);
  });

  it('does not cache unresolved results (transient failures stay retryable)', async () => {
    let fail = true;
    const fetchImpl = vi.fn(async () => {
      if (fail) throw new Error('down');
      return new Response('<html>ok</html>', { status: 200 });
    }) as unknown as typeof fetch;
    const ledger = createCitationLedger({ fetchImpl });
    const [r1] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2015/847' }]);
    expect(r1.status).toBe('unresolved');
    fail = false;
    const [r2] = await ledger.verifyCitations([{ ref: 'Regulation (EU) 2015/847' }]);
    expect(r2.status).toBe('verified_remote');
  });
});

describe('citation-ledger — batch behaviour', () => {
  it('preserves input order and mixes statuses', async () => {
    const fetchImpl = mockFetch(() => ({ status: 200 }));
    const ledger = createCitationLedger({ fetchImpl });
    const results = await ledger.verifyCitations([
      { ref: 'AMLR Art.12' },
      { ref: 'AMLR Art.999' },
      { ref: 'POCA 2002 s.330' },
    ]);
    expect(results.map((r) => r.status)).toEqual(['verified_local', 'not_found', 'unresolved']);
    expect(results.map((r) => r.citation)).toEqual(['AMLR Art.12', 'AMLR Art.999', 'POCA 2002 s.330']);
  });
});
