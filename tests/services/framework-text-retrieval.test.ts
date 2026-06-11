/**
 * framework-text-retrieval.test.ts — shared grounding-text retrieval
 * (Core Experience Review 2026-06, item 1.3).
 *
 * Validates: relevance selection from real data/frameworks fixtures, the
 * token-budget cap, source attribution, the honest null when nothing matches,
 * and knowledge-pack entity text via a fake DB adapter.
 */
import { describe, it, expect } from 'vitest';
import type { DatabaseAdapter } from '../../server/db/database.js';
import { retrieveGroundingText } from '../../server/services/framework-text-retrieval.js';

describe('framework-text-retrieval — relevance', () => {
  it('selects the explicitly cited article when the framework is named (AMLR Art.34 EDD)', async () => {
    const r = await retrieveGroundingText({
      query: 'What is the scope of enhanced due diligence under AMLR Art.34?',
    });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('Art.34');
    // Source attribution: framework name + official reference in the section header
    expect(r!.text).toContain('Regulation (EU) 2024/1624');
    expect(r!.text).toContain("local framework dataset 'amlr-2024'");
    expect(r!.sources.some((s) => s.frameworkId === 'amlr-2024' && s.articleId === 'Art.34')).toBe(true);
  });

  it('matches DORA incident-reporting articles from a topical question', async () => {
    const r = await retrieveGroundingText({
      query: 'DORA incident reporting timelines for major ICT-related incidents',
    });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('Regulation (EU) 2022/2554');
    expect(r!.sources.every((s) => s.frameworkId === 'dora-2022' || s.frameworkId.startsWith('pack:'))).toBe(true);
  });

  it('uses active pack ids as a (weaker) scope when the framework is not named', async () => {
    const r = await retrieveGroundingText({
      query: 'enhanced due diligence for cross-border correspondent relationships',
      packIds: ['amlr-2024'],
    });
    expect(r).not.toBeNull();
    expect(r!.sources.some((s) => s.frameworkId === 'amlr-2024')).toBe(true);
  });
});

describe('framework-text-retrieval — honesty (no fake grounding)', () => {
  it('returns null when nothing relevant matches', async () => {
    const r = await retrieveGroundingText({
      query: 'how do I bake a sourdough bread loaf at home with a dutch oven',
    });
    expect(r).toBeNull();
  });

  it('returns null for an empty query', async () => {
    expect(await retrieveGroundingText({ query: '   ' })).toBeNull();
  });

  it('returns null for a topic ANTON has no local data for (UK POCA tipping-off)', async () => {
    const r = await retrieveGroundingText({ query: 'POCA tipping-off offence defence solicitors' });
    expect(r).toBeNull();
  });
});

describe('framework-text-retrieval — token budget', () => {
  it('caps the grounding text close to the requested budget', async () => {
    const broad = 'AMLR customer due diligence beneficial ownership reporting obligations enhanced due diligence PEP correspondent crypto-asset';
    const small = await retrieveGroundingText({ query: broad, tokenBudget: 300 });
    const large = await retrieveGroundingText({ query: broad, tokenBudget: 3000 });
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    // The intro/header block (~350 chars) sits outside the article budget; allow it as slack.
    expect(small!.text.length).toBeLessThanOrEqual(300 * 4 + 800);
    expect(small!.text.length).toBeLessThan(large!.text.length);
    expect(small!.sources.length).toBeLessThanOrEqual(large!.sources.length);
  });

  it('reports approxTokens consistent with the text length', async () => {
    const r = await retrieveGroundingText({ query: 'AMLR Art.12 awareness of requirements training' });
    expect(r).not.toBeNull();
    expect(r!.approxTokens).toBe(Math.ceil(r!.text.length / 4));
  });
});

describe('framework-text-retrieval — knowledge-pack entity text', () => {
  function fakeDb(): DatabaseAdapter {
    const packs = [{ id: 'eu-sanctions', display_name: 'EU Sanctions' }];
    const entities = [
      {
        canonical_name: 'Sberbank of Russia',
        metadata: JSON.stringify({ description: 'Designated entity under EU Russia sanctions; asset freeze applies.' }),
        pack_id: 'eu-sanctions',
      },
      {
        canonical_name: 'Totally Unrelated Bakery',
        metadata: JSON.stringify({ description: 'A bakery.' }),
        pack_id: 'eu-sanctions',
      },
    ];
    return {
      dialect: 'postgresql',
      async get() { return undefined; },
      async all(sql: string) {
        if (sql.includes('FROM knowledge_packs')) return packs as never[];
        if (sql.includes('FROM entity_nodes')) return entities as never[];
        return [];
      },
      async run() { return { changes: 0, lastInsertRowid: 0 }; },
      async exec() { /* noop */ },
      async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
      async close() { /* noop */ },
    } as unknown as DatabaseAdapter;
  }

  it('includes matching pack entity text with pack attribution', async () => {
    const r = await retrieveGroundingText({
      query: 'Is Sberbank subject to EU Russia sanctions asset freeze?',
      packIds: ['eu-sanctions'],
      db: fakeDb(),
    });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('Sberbank of Russia');
    expect(r!.text).toContain('Knowledge pack: EU Sanctions');
    expect(r!.text).not.toContain('Totally Unrelated Bakery');
  });

  it('framework-only result still works when entity tables are unavailable', async () => {
    const brokenDb = {
      dialect: 'postgresql',
      async get() { return undefined; },
      async all() { throw new Error('relation does not exist'); },
      async run() { return { changes: 0, lastInsertRowid: 0 }; },
      async exec() { /* noop */ },
      async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
      async close() { /* noop */ },
    } as unknown as DatabaseAdapter;
    const r = await retrieveGroundingText({
      query: 'AMLR Art.12 awareness of requirements',
      packIds: ['amlr-2024'],
      db: brokenDb,
    });
    expect(r).not.toBeNull();
    expect(r!.text).toContain('Art.12');
  });
});
