/**
 * prompt-versions.test.ts — Wave 1 (2026-09-16): prompts a run used are
 * content-addressed rows in system_prompts.
 *
 * Before this the table had 0 rows and audit_log.system_prompt_version_id was
 * NULL on all 7,094 rows. The contract: same text → same row; new text → the
 * next version number for that id; a database failure → null, never a throw.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensurePromptVersion,
  resetPromptVersionCacheForTests,
  sha256OfPrompt,
  FOUNDATION_PROMPT_ID,
} from '../../server/services/prompt-versions.js';
import type { DatabaseAdapter } from '../../server/db/database.js';

interface Row { id: string; module_id: string; version: number; content: string; content_hash: string; author: string }

function fakeDb(opts: { failInsert?: boolean } = {}) {
  const rows: Row[] = [];
  const db = {
    get: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('content_hash = ?')) {
        const [moduleId, hash] = params as [string, string];
        const r = rows.filter((x) => x.module_id === moduleId && x.content_hash === hash).pop();
        return r ? { id: r.id, version: r.version } : undefined;
      }
      if (sql.includes('MAX(version)')) {
        const [moduleId] = params as [string];
        const max = rows.filter((x) => x.module_id === moduleId).reduce((m, x) => Math.max(m, x.version), 0);
        // pg returns bigint aggregates as strings — the helper must coerce.
        return { max_version: String(max) };
      }
      return undefined;
    },
    run: async (sql: string, ...params: unknown[]) => {
      if (sql.startsWith('INSERT INTO system_prompts')) {
        if (opts.failInsert) throw new Error('insert boom');
        const [id, module_id, version, content, content_hash, author] = params as [string, string, number, string, string, string];
        rows.push({ id, module_id, version, content, content_hash, author });
      }
    },
    all: async () => [],
  } as unknown as DatabaseAdapter;
  return { db, rows };
}

beforeEach(() => resetPromptVersionCacheForTests());

describe('ensurePromptVersion', () => {
  it('inserts version 1 on first sight, resolves the same row afterwards', async () => {
    const { db, rows } = fakeDb();
    const first = await ensurePromptVersion(db, 'gap-analysis', 'You assess AML controls.');
    expect(first).toMatchObject({ moduleId: 'gap-analysis', version: 1, created: true, contentHash: sha256OfPrompt('You assess AML controls.') });
    expect(rows).toHaveLength(1);
    expect(rows[0].author).toBe('system');

    resetPromptVersionCacheForTests(); // force the DB lookup path, not the cache
    const again = await ensurePromptVersion(db, 'gap-analysis', 'You assess AML controls.  ');
    expect(again?.id).toBe(first!.id);
    expect(again?.created).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it('a changed text becomes the next version for that id; other ids are independent', async () => {
    const { db, rows } = fakeDb();
    await ensurePromptVersion(db, 'gap-analysis', 'v1 text');
    const v2 = await ensurePromptVersion(db, 'gap-analysis', 'v2 text', 'user-override');
    expect(v2?.version).toBe(2);
    expect(rows[1].author).toBe('user-override');
    const f = await ensurePromptVersion(db, FOUNDATION_PROMPT_ID, 'ground prompt');
    expect(f?.version).toBe(1);
    expect(rows).toHaveLength(3);
  });

  it('serves repeat calls from the cache without touching the database', async () => {
    const { db, rows } = fakeDb();
    const a = await ensurePromptVersion(db, 'm', 'same');
    const b = await ensurePromptVersion(db, 'm', 'same');
    expect(b?.id).toBe(a?.id);
    expect(rows).toHaveLength(1);
  });

  it('returns null on empty input or a database failure, and never throws', async () => {
    const { db } = fakeDb({ failInsert: true });
    expect(await ensurePromptVersion(db, 'm', '   ')).toBeNull();
    expect(await ensurePromptVersion(db, '', 'x')).toBeNull();
    expect(await ensurePromptVersion(db, 'm', 'will fail')).toBeNull();
  });
});
