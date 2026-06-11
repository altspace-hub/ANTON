/**
 * run-artifact-writer.test.ts — Wave 1 item 1.6 (Core Experience Review
 * 2026-06): persist the assembled prompt + pinned source manifest per run.
 *
 * Uses an in-memory fake DatabaseAdapter (same pattern as apprentice.test.ts /
 * default-model-store.test.ts) that records the exact INSERT issued by
 * writeRunArtifact — no Postgres needed.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  writeRunArtifact,
  buildLayerSummary,
  sha256Hex,
  truncateToBytes,
  MAX_STORED_PROMPT_BYTES,
} from '../../server/services/run-artifact-writer.js';

// ── In-memory fake adapter (records run() calls) ────────────────────────────

function makeFakeDb(opts?: { failRun?: boolean }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const db: DatabaseAdapter = {
    dialect: 'postgresql' as DatabaseAdapter['dialect'],
    async get<T>(): Promise<T | undefined> { return undefined; },
    async all<T>(): Promise<T[]> { return []; },
    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      if (opts?.failRun) throw new Error('relation "run_artifacts" does not exist');
      calls.push({ sql, params });
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
  } as unknown as DatabaseAdapter;
  return { db, calls };
}

describe('sha256Hex — prompt hash stability', () => {
  it('matches the known sha256 test vector for "hello"', () => {
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('is deterministic — identical prompt always yields the identical hash', () => {
    const prompt = '## LAYER 1\nFoundation text\n\n## LAYER 6\nKnowledge docs';
    expect(sha256Hex(prompt)).toBe(sha256Hex(prompt));
    expect(sha256Hex(prompt)).toBe(
      crypto.createHash('sha256').update(prompt, 'utf8').digest('hex')
    );
  });

  it('changes when a single character of the prompt changes', () => {
    expect(sha256Hex('prompt a')).not.toBe(sha256Hex('prompt b'));
  });
});

describe('buildLayerSummary', () => {
  it('emits name + char count + sha256 per non-empty layer and skips blanks', () => {
    const summary = buildLayerSummary({
      layer2a_org_context: '## ORG\nAcme Bank',
      layer2b_knowledge_pack: '',
      layer6_atoms: '   ',
      business_context: '## MY WAY\nrates',
    });
    expect(summary.map((s) => s.layer)).toEqual(['layer2a_org_context', 'business_context']);
    const org = summary[0];
    expect(org.chars).toBe('## ORG\nAcme Bank'.length);
    expect(org.sha256).toBe(sha256Hex('## ORG\nAcme Bank'));
  });

  it('returns [] when every layer is empty', () => {
    expect(buildLayerSummary({ a: '', b: undefined, c: null })).toEqual([]);
  });
});

describe('writeRunArtifact — write shape', () => {
  it('inserts one run_artifacts row with FK, hash, layer summary and source manifest', async () => {
    const { db, calls } = makeFakeDb();
    const prompt = 'You are ANTON. ## AREA CONTEXT\nFCP.';
    const layerSummary = buildLayerSummary({ composed_full: prompt });
    const sourceManifest = [
      { type: 'local_file', name: 'AMLR.txt', path: 'C:/docs/AMLR.txt', sha256: sha256Hex('doc'), charCount: 3, contentHashed: true },
      { type: 'builtin', name: 'Claude built-in knowledge', contentHashed: false },
    ];

    const ok = await writeRunArtifact(db, {
      messageId: 'msg-1',
      sessionId: 'sess-1',
      composedPrompt: prompt,
      layerSummary,
      sourceManifest,
    });

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0];
    expect(sql).toContain('INSERT INTO run_artifacts');
    expect(sql).toContain('ON CONFLICT (message_id) DO NOTHING');

    const [id, messageId, sessionId, stored, sha, chars, truncated, layerJson, manifestJson, createdAt] = params;
    expect(typeof id).toBe('string');
    expect(messageId).toBe('msg-1');
    expect(sessionId).toBe('sess-1');
    expect(stored).toBe(prompt);
    expect(sha).toBe(sha256Hex(prompt));
    expect(chars).toBe(prompt.length);
    expect(truncated).toBe(false);
    expect(JSON.parse(layerJson as string)).toEqual(layerSummary);
    expect(JSON.parse(manifestJson as string)).toEqual(sourceManifest);
    expect(typeof createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(createdAt as string))).toBe(false);
  });

  it('caps stored prompt at 2 MB, sets truncated, and hashes the FULL prompt', async () => {
    const { db, calls } = makeFakeDb();
    const big = 'A'.repeat(MAX_STORED_PROMPT_BYTES + 50_000);

    const ok = await writeRunArtifact(db, {
      messageId: 'msg-2',
      sessionId: null,
      composedPrompt: big,
    });

    expect(ok).toBe(true);
    const [, , sessionId, stored, sha, chars, truncated] = calls[0].params;
    expect(sessionId).toBeNull();
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(stored as string, 'utf8')).toBeLessThanOrEqual(MAX_STORED_PROMPT_BYTES);
    // The sha pins the FULL prompt, not the truncated copy
    expect(sha).toBe(sha256Hex(big));
    expect(chars).toBe(big.length);
  });

  it('never throws when the insert fails — logs and returns false', async () => {
    const { db } = makeFakeDb({ failRun: true });
    await expect(
      writeRunArtifact(db, { messageId: 'msg-3', sessionId: 's', composedPrompt: 'p' })
    ).resolves.toBe(false);
  });
});

describe('truncateToBytes', () => {
  it('returns the string unchanged when within budget', () => {
    expect(truncateToBytes('abc', 10)).toBe('abc');
  });

  it('respects the byte cap with multi-byte characters and never splits a code point', () => {
    const s = 'é'.repeat(100); // 2 bytes each
    const out = truncateToBytes(s, 51);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(51);
    // Valid UTF-8 round-trip (no replacement chars from a split code point)
    expect(Buffer.from(out, 'utf8').toString('utf8')).toBe(out);
    expect(out).toMatch(/^é+$/);
  });
});
