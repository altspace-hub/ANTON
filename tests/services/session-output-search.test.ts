/**
 * session-output-search.test.ts — Wave 3.2 "Embed session outputs + search
 * past work" (CORE_EXPERIENCE_REVIEW 2026-06).
 *
 * Two halves:
 *  1. Write path: embedSessionOutput stores ONE embeddings row per assistant
 *     message via the (mocked) embedding adapter, with the honest cap —
 *     ~8k-char head embedded, full-content sha256 + truncated flag in
 *     metadata. No live embedding API is called.
 *  2. Read path (the Markets lesson — a validation FIXTURE, not vibes):
 *     10 known outputs are seeded as plain assistant messages; paraphrase
 *     queries must retrieve the right output in the top-5 of
 *     hybridSearch(contentTypes: ['session_output']). The mocked adapter
 *     returns a ZERO vector for short texts (queries), silencing the vector
 *     path entirely — so this proves the KEYWORD FALLBACK alone meets the
 *     bar (installs without any embedding provider still get search).
 *
 * Requires DATABASE_URL (env or .env); skips otherwise.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock ONLY getEmbeddingAdapter; keep cosine/serialize/isZeroVector real
// (the SQLite vector store imports those from the same module).
vi.mock('../../server/services/embedding-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/embedding-adapter.js')>();
  const DIMS = 8;
  const pseudoVector = (text: string): number[] => {
    const v = new Array(DIMS).fill(0);
    for (let i = 0; i < text.length; i++) v[i % DIMS] += text.charCodeAt(i) % 13;
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  };
  const embed = async (text: string): Promise<number[]> =>
    // Long texts (stored outputs) get a deterministic non-zero vector;
    // short texts (search queries) get the zero sentinel → vector path silent.
    text && text.length >= 400 ? pseudoVector(text) : new Array(DIMS).fill(0);
  return {
    ...actual,
    getEmbeddingAdapter: () => ({
      provider: 'openai' as const,
      model: 'mock-embed-8',
      dimensions: DIMS,
      embed,
      embedBatch: async (texts: string[]) => Promise.all(texts.map(embed)),
    }),
  };
});

function resolveDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8');
    const m = env.match(/^DATABASE_URL=(.+)$/m);
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const DATABASE_URL = resolveDatabaseUrl();
const describeOrSkip = DATABASE_URL ? describe : describe.skip;

const FILLER =
  ' The working group reviewed the supporting evidence in detail, agreed ownership and timelines, ' +
  'and recorded the decision in the engagement log for the next quarterly compliance review cycle.';

/** 10 known outputs + the paraphrase queries that must find them. */
const FIXTURES: Array<{ key: string; content: string }> = [
  { key: 'tm-thresholds', content: 'We concluded that transaction monitoring thresholds should be recalibrated quarterly: the SEK 150,000 single-transfer alert threshold stays, but the velocity rule moves from 5 to 8 transfers per day after the false-positive analysis.' },
  { key: 'ubo-sweden', content: 'Decision on beneficial ownership: every Swedish counterparty must be verified against the Bolagsverket beneficial ownership register before onboarding, with a 25 percent ownership threshold and annual re-verification.' },
  { key: 'gdpr-payroll', content: 'For GDPR purposes the payroll records retention schedule was set to seven years after employment ends, matching the bookkeeping act, with pseudonymisation applied after year two.' },
  { key: 'vendor-cloud', content: 'The vendor due diligence questionnaire for cloud providers now includes sub-processor disclosure, data residency guarantees inside the EEA, and an exit-plan clause with 90-day data return.' },
  { key: 'sanctions-fuzzy', content: 'Sanctions screening conclusion: fuzzy matching sensitivity is tuned to 85 percent similarity with transliteration normalisation enabled; below that the analyst review queue overflowed with noise.' },
  { key: 'travel-rule', content: 'The crypto travel rule implementation plan phases originator data collection first, beneficiary VASP lookups second, and full FATF-compliant payloads by Q3.' },
  { key: 'pep-refresh', content: 'PEP screening refresh frequency was agreed at monthly for high-risk customers and annually for the standard book, using the commercial watchlist delta feed.' },
  { key: 'dora-outsourcing', content: 'Under DORA the outsourcing register must flag critical or important functions separately; we concluded the core banking platform, the payment gateway and the SOC provider qualify as critical.' },
  { key: 'aml-training', content: 'The AML training programme rollout schedule targets all client-facing staff by June, with role-specific modules for onboarding teams and an annual refresher with a pass mark of 80 percent.' },
  { key: 'invoice-fraud', content: 'Fraud detection conclusion: invoice redirection scams are countered by a callback verification rule whenever a supplier changes bank account details, plus a four-eyes check above SEK 50,000.' },
];

/** Paraphrases — share content words with the target, not exact phrasing. */
const QUERIES: Array<{ query: string; expectKey: string }> = [
  { query: 'what did we conclude about calibrating transaction monitoring thresholds', expectKey: 'tm-thresholds' },
  { query: 'verifying beneficial ownership of Swedish counterparties in the register', expectKey: 'ubo-sweden' },
  { query: 'how long do we retain payroll records under GDPR', expectKey: 'gdpr-payroll' },
  { query: 'tuning fuzzy matching sensitivity for sanctions screening', expectKey: 'sanctions-fuzzy' },
  { query: 'which functions count as critical in the DORA outsourcing register', expectKey: 'dora-outsourcing' },
];

describeOrSkip('session_output: embed write path + paraphrase retrieval fixture', () => {
  let db: import('../../server/db/database.js').DatabaseAdapter;
  let embedder: typeof import('../../server/services/session-output-embedder.js');
  let hybrid: typeof import('../../server/services/hybrid-search.js');
  let artifactWriter: typeof import('../../server/services/run-artifact-writer.js');

  const sessionIds: string[] = [];
  const messageIdByKey = new Map<string, string>();
  const embedSessionId = randomUUID();
  const embedMessageId = randomUUID();
  const shortMessageId = randomUUID();
  const longContent = 'Conclusion paragraph. ' + 'lorem ipsum dolor sit amet '.repeat(400); // > 8k chars

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL! });
    embedder = await import('../../server/services/session-output-embedder.js');
    hybrid = await import('../../server/services/hybrid-search.js');
    artifactWriter = await import('../../server/services/run-artifact-writer.js');

    // Seed the 10 known outputs as plain sessions + assistant messages
    // (deliberately NOT embedded — the keyword fallback must carry them).
    const now = Date.now();
    for (let i = 0; i < FIXTURES.length; i++) {
      const f = FIXTURES[i];
      const sessionId = randomUUID();
      const messageId = randomUUID();
      sessionIds.push(sessionId);
      messageIdByKey.set(f.key, messageId);
      const t = new Date(now - i * 1000).toISOString();
      await db.run(
        `INSERT INTO sessions (id, module_id, title, config, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, ?)`,
        sessionId, 'gap-analysis', `Fixture ${f.key}`, t, t);
      await db.run(
        `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)`,
        messageId, sessionId, f.content + FILLER, t);
    }

    // Session for the embed write-path test.
    sessionIds.push(embedSessionId);
    await db.run(
      `INSERT INTO sessions (id, module_id, title, config) VALUES (?, 'risk-assessment', 'Embed write path', '{}')`,
      embedSessionId);
    await db.run(
      `INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, 'assistant', ?)`,
      embedMessageId, embedSessionId, longContent);
  }, 60_000);

  afterAll(async () => {
    try {
      await db.run(
        `DELETE FROM embeddings WHERE content_type = 'session_output' AND content_id IN (?, ?)`,
        embedMessageId, shortMessageId);
      for (const id of sessionIds) {
        await db.run('DELETE FROM sessions WHERE id = ?', id); // messages cascade
      }
    } finally {
      await db.close();
    }
  });

  // ── 1. Write path (mocked adapter — no live LLM/embedding call) ──────────

  it('embeds a completed output as session_output with honest cap metadata', async () => {
    const ok = await embedder.embedSessionOutput(db, {
      messageId: embedMessageId,
      sessionId: embedSessionId,
      content: longContent,
      moduleId: 'risk-assessment',
      areaId: 'risk',
    });
    expect(ok).toBe(true);

    const row = await db.get(
      `SELECT content_text, embedding_model, metadata FROM embeddings
       WHERE content_type = 'session_output' AND content_id = ?`,
      embedMessageId) as { content_text: string; embedding_model: string; metadata: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.embedding_model).toBe('mock-embed-8'); // the MOCK ran, not a provider
    // Only the head is embedded…
    expect(row!.content_text.length).toBe(embedder.SESSION_OUTPUT_EMBED_HEAD_CHARS);

    const meta = JSON.parse(row!.metadata) as Record<string, unknown>;
    expect(meta.session_id).toBe(embedSessionId);
    expect(meta.title).toBe('Embed write path');
    expect(meta.module_id).toBe('risk-assessment');
    expect(meta.area_id).toBe('risk');
    expect(meta.truncated).toBe(true);
    expect(meta.full_chars).toBe(longContent.length);
    // …but the sha pins the FULL content.
    expect(meta.full_sha256).toBe(artifactWriter.sha256Hex(longContent));
  });

  it('skips outputs below the minimum length', async () => {
    const ok = await embedder.embedSessionOutput(db, {
      messageId: shortMessageId,
      sessionId: embedSessionId,
      content: 'Too short to carry a conclusion.',
    });
    expect(ok).toBe(false);
    const row = await db.get(
      `SELECT id FROM embeddings WHERE content_type = 'session_output' AND content_id = ?`,
      shortMessageId);
    expect(row).toBeFalsy();
  });

  // ── 2. Retrieval fixture — paraphrase → top-5 via keyword fallback ───────

  for (const { query, expectKey } of QUERIES) {
    it(`paraphrase retrieval: "${query}" → ${expectKey} in top-5`, async () => {
      const results = await hybrid.hybridSearch(db, {
        query,
        contentTypes: ['session_output'],
        topK: 5,
      });
      const ids = results.map((r) => r.content_id);
      expect(ids).toContain(messageIdByKey.get(expectKey));
      // Result carries the metadata needed to link into the session.
      const hit = results.find((r) => r.content_id === messageIdByKey.get(expectKey))!;
      expect(hit.content_type).toBe('session_output');
      expect(hit.metadata.session_id).toBeTruthy();
      expect(hit.metadata.module_id).toBe('gap-analysis');
      expect(String(hit.metadata.title)).toContain('Fixture');
      expect(hit.snippet.length).toBeGreaterThan(0);
    });
  }

  it('respects the contentTypes filter (no session outputs when filtered out)', async () => {
    const results = await hybrid.hybridSearch(db, {
      query: 'transaction monitoring thresholds recalibrated quarterly',
      contentTypes: ['checkpoint'],
      topK: 5,
    });
    expect(results.every((r) => r.content_type !== 'session_output')).toBe(true);
  });
});
