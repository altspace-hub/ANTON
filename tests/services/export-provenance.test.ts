/**
 * export-provenance.test.ts — Wave 3 (2026-09-16): every exported deliverable
 * carries a provenance appendix built from the run record on the server.
 *
 * Before this, an export named module/model/session from browser-supplied
 * metadata and carried no output hash, prompt hash, source hashes, skipped
 * sources, quality score or sign-off, although every one of those existed in
 * the database.
 */
import { describe, it, expect } from 'vitest';
import { buildProvenanceFacts, renderProvenanceAppendix, buildProvenanceAppendix, sha256Hex } from '../../server/services/export-provenance.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

const CONTENT = '# Gap analysis\n\nFindings…';

const MESSAGE = {
  id: 'msg-1',
  model_id: 'sdk:claude-opus-5',
  created_at: '2026-09-16T10:00:00.000Z',
  content: CONTENT,
  config_snapshot: JSON.stringify({
    model: 'sdk:claude-opus-5',
    engine: 'anthropic_sdk',
    effort: 'xhigh',
    thinking: 'investigate',
    modelServed: 'claude-opus-5-20260601',
    costBasis: 'plan',
    modulePromptVersion: 3,
    modulePromptSha256: 'a'.repeat(64),
    foundationVersionId: 'f1',
    guardrailApplied: true,
    provenanceContract: true,
    contextUsed: {
      lens: { moduleId: 'gap-analysis', areaId: 'fcp' },
      packs: [{ name: 'AMLR 2024', version: '1.2.0', entries: 23 }],
      frameworks: ['AMLR 2024 — Anti-Money Laundering Regulation'],
      frameworkArticles: 14,
      atomChars: 800,
      ragChunks: 0,
      webSearch: true,
      skippedCount: 1,
      skippedTokens: 12_000,
    },
  }),
};

const ARTIFACT = {
  prompt_sha256: 'b'.repeat(64),
  prompt_chars: 646571,
  truncated: false,
  layer_summary: [{ layer: 'layer2_foundation', chars: 4495, sha256: 'c'.repeat(64) }],
  source_manifest: [
    { type: 'uploaded_file', name: 'policy.pdf', sha256: 'd'.repeat(64), charCount: 38425, retrievedAt: '2026-09-16T09:59:00.000Z', contentHashed: true },
    { type: 'framework_article', name: 'AMLR 2024 Art. 20 — Customer due diligence', sha256: 'e'.repeat(64), charCount: 640, contentHashed: true },
    { type: 'builtin', name: 'Claude built-in knowledge', contentHashed: false },
    { type: 'url', name: 'https://example.org/big', contentHashed: false, note: 'skipped — context budget reached' },
  ],
};

function fakeDb(opts: { artifact?: boolean; review?: Record<string, unknown> | null; quality?: boolean; messages?: Array<typeof MESSAGE> } = {}) {
  const messages = opts.messages ?? [MESSAGE];
  const calls: string[] = [];
  const db = {
    get: async (sql: string, ...params: unknown[]) => {
      calls.push(sql);
      if (sql.includes('FROM messages')) {
        if (sql.includes('WHERE id = ?')) return messages.find((m) => m.id === params[0]);
        return [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      }
      if (sql.includes('FROM run_artifacts')) return opts.artifact === false ? undefined : ARTIFACT;
      if (sql.includes('FROM quality_scores')) return opts.quality === false ? undefined : { overall_score: 7.8, model_used: 'sdk:claude-sonnet-5', created_at: '2026-09-16T10:01:00.000Z' };
      if (sql.includes('FROM human_oversight_reviews')) return opts.review === null ? undefined : (opts.review ?? { verdict: 'approved', reviewer_name: 'Anna', reviewer_role: 'MLRO', created_at: '2026-09-16T11:00:00.000Z', message_id: 'msg-1' });
      if (sql.includes('FROM sessions')) return { structured_status: 'failed', structured_error: 'timeout after 45s' };
      return undefined;
    },
    all: async () => [],
    run: async () => undefined,
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

describe('buildProvenanceFacts', () => {
  it('reads the run record for the exported message and hashes the exported content', async () => {
    const { db } = fakeDb();
    const f = await buildProvenanceFacts(db, { sessionId: 's1', messageId: 'msg-1', exportedContent: CONTENT, exportVersion: 2, exportContentHash: 'abcd1234' });
    expect(f).not.toBeNull();
    expect(f!.runId).toBe('msg-1');
    expect(f!.engine).toBe('anthropic_sdk');
    expect(f!.modelServed).toBe('claude-opus-5-20260601');
    expect(f!.effort).toBe('xhigh');
    expect(f!.moduleId).toBe('gap-analysis');
    expect(f!.modulePromptVersion).toBe(3);
    expect(f!.promptSha256).toBe('b'.repeat(64));
    expect(f!.outputSha256Exported).toBe(sha256Hex(CONTENT));
    expect(f!.outputMatchesStored).toBe(true);
    expect(f!.sources).toHaveLength(4);
    expect(f!.packs[0]).toMatchObject({ name: 'AMLR 2024', version: '1.2.0', entries: 23 });
    expect(f!.frameworkArticles).toBe(14);
    expect(f!.skippedCount).toBe(1);
    expect(f!.quality).toMatchObject({ score: 7.8, model: 'sdk:claude-sonnet-5' });
    expect(f!.review).toMatchObject({ verdict: 'approved', reviewerName: 'Anna', boundToRun: true });
    expect(f!.structuredStatus).toBe('failed');
    expect(f!.structuredError).toBe('timeout after 45s');
    expect(f!.exportVersion).toBe(2);
  });

  it('prefers the named message over the latest one, and falls back to the latest', async () => {
    const older = { ...MESSAGE, id: 'msg-0', created_at: '2026-09-15T10:00:00.000Z' };
    const { db } = fakeDb({ messages: [older, MESSAGE] });
    expect((await buildProvenanceFacts(db, { sessionId: 's1', messageId: 'msg-0', exportedContent: CONTENT }))!.runId).toBe('msg-0');
    expect((await buildProvenanceFacts(db, { sessionId: 's1', exportedContent: CONTENT }))!.runId).toBe('msg-1');
    expect((await buildProvenanceFacts(db, { sessionId: 's1', messageId: 'nope', exportedContent: CONTENT }))!.runId).toBe('msg-1');
  });

  it('flags an export whose content no longer matches the stored answer', async () => {
    const { db } = fakeDb();
    const f = await buildProvenanceFacts(db, { sessionId: 's1', messageId: 'msg-1', exportedContent: CONTENT + '\n\nedited' });
    expect(f!.outputMatchesStored).toBe(false);
  });

  it('degrades, never fails, when the run record is missing', async () => {
    const { db } = fakeDb({ artifact: false, quality: false, review: null });
    const f = await buildProvenanceFacts(db, { sessionId: 's1', messageId: 'msg-1', exportedContent: CONTENT });
    expect(f!.promptSha256).toBeNull();
    expect(f!.sources).toEqual([]);
    expect(f!.quality).toBeNull();
    expect(f!.review).toBeNull();
  });

  it('returns null when the session has no assistant message', async () => {
    const { db } = fakeDb({ messages: [] });
    expect(await buildProvenanceFacts(db, { sessionId: 's1', exportedContent: CONTENT })).toBeNull();
  });
});

describe('renderProvenanceAppendix', () => {
  it('renders the run, engine, model, module, hashes, knowledge, budget, quality, sign-off and export rows', async () => {
    const { db } = fakeDb();
    const { markdown } = (await buildProvenanceAppendix(db, { sessionId: 's1', messageId: 'msg-1', exportedContent: CONTENT, exportVersion: 2, exportContentHash: 'abcd1234' }))!;
    expect(markdown).toContain('## Provenance');
    expect(markdown).toContain('| Run | msg-1 · 2026-09-16T10:00:00.000Z |');
    expect(markdown).toContain('Claude subscription · thinking investigate · effort xhigh · plan usage');
    expect(markdown).toContain('requested sdk:claude-opus-5 · served claude-opus-5-20260601');
    expect(markdown).toContain('gap-analysis · prompt v3 (aaaaaaaaaaaa…) · compliance guardrail applied · provenance contract applied');
    expect(markdown).toContain(`sha256 ${'b'.repeat(16)}… · 646,571 chars`);
    expect(markdown).toContain('matches the stored answer');
    expect(markdown).toContain('1 knowledge pack (AMLR 2024 v1.2.0 · 23)');
    expect(markdown).toContain('1 framework · 14 articles');
    expect(markdown).toContain('web search available to the model');
    expect(markdown).toContain('1 source skipped for context budget (~12,000 tokens not sent)');
    expect(markdown).toContain('7.8/10 (scored by sdk:claude-sonnet-5)');
    expect(markdown).toContain('failed — timeout after 45s');
    expect(markdown).toContain('approved by Anna (MLRO) on 2026-09-16 · bound to this run');
    expect(markdown).toContain('| Export | v2 · content hash abcd1234 |');
  });

  it('lists hashed sources in a table and everything else under "Not verified"', async () => {
    const { db } = fakeDb();
    const { markdown } = (await buildProvenanceAppendix(db, { sessionId: 's1', messageId: 'msg-1', exportedContent: CONTENT }))!;
    expect(markdown).toContain('### Sources');
    expect(markdown).toContain(`| 1 | Uploaded document | policy.pdf | 38,425 | 2026-09-16 | ${'d'.repeat(16)}… |`);
    expect(markdown).toContain('| 2 | Framework article | AMLR 2024 Art. 20 — Customer due diligence |');
    expect(markdown).toContain('### Not verified');
    expect(markdown).toContain('- Model built-in knowledge: Claude built-in knowledge — no source text to hash');
    expect(markdown).toContain('- Online reference: https://example.org/big — skipped — context budget reached');
  });

  it('says so when nothing is unverified and no sign-off exists', async () => {
    const { db } = fakeDb({ review: null });
    const facts = (await buildProvenanceFacts(db, { sessionId: 's1', messageId: 'msg-1', exportedContent: CONTENT }))!;
    facts.sources = facts.sources.filter((s) => s.contentHashed);
    const md = renderProvenanceAppendix(facts);
    expect(md).toContain('Every source listed above is pinned by hash');
    expect(md).toContain('| Human sign-off | none recorded |');
  });

  it('escapes pipes and newlines so the table survives', () => {
    const md = renderProvenanceAppendix({
      sessionId: 's', runId: 'r', createdAt: null, engine: null, modelRequested: 'm|x', modelServed: null, thinking: null, effort: null, costBasis: null,
      moduleId: null, modulePromptVersion: null, modulePromptSha256: null, foundationVersionId: null, guardrailApplied: null, provenanceContract: null,
      promptSha256: null, promptChars: null, promptTruncated: false, outputSha256Stored: null, outputSha256Exported: 'f'.repeat(64), outputMatchesStored: null,
      sources: [{ type: 'url', name: 'a|b\nc', contentHashed: false }], layers: [], packs: [], frameworks: [], frameworkArticles: 0, atomChars: 0, ragChunks: 0,
      webSearch: false, skippedCount: 0, skippedTokens: 0, structuredStatus: null, structuredError: null, quality: null, review: null, exportVersion: null, exportContentHash: 'ffff',
    });
    expect(md).toContain('requested m\\|x');
    expect(md).toContain('a\\|b c');
  });
});
