/**
 * intelligence-health.test.ts — Wave 3.9 health endpoint composition.
 *
 * Mock probes: all-ok / embeddings-down / no-llm. The service must report
 * honest per-feature {status, reason} — no fake green.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import {
  computeIntelligenceHealth,
  resetIntelligenceHealthCache,
  type HealthProbes,
} from '../../server/services/intelligence-health.js';

function makeFakeDb(): DatabaseAdapter {
  return {
    dialect: 'sqlite' as DatabaseAdapter['dialect'],
    async get() { return undefined; },
    async all() { return []; },
    async run(): Promise<RunResult> { return { changes: 0, lastInsertRowid: 0 } as RunResult; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
}

const RECENT = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
const STALE = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

function probes(overrides: Partial<HealthProbes>): Partial<HealthProbes> {
  return {
    embedProbe: async () => ({ provider: 'openai', model: 'text-embedding-3-small', zero: false }),
    chromaProbe: async () => true,
    lastAtomAt: async () => RECENT,
    utilityProvider: () => 'anthropic',
    parseStats: async () => ({}),
    env: { ANTHROPIC_API_KEY: 'k', OPENAI_API_KEY: 'k' },
    ...overrides,
  };
}

beforeEach(() => resetIntelligenceHealthCache());

describe('computeIntelligenceHealth — composition', () => {
  it('all-ok: every feature green, overall ok', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({}));
    expect(health.overall).toBe('ok');
    expect(health.features.embeddings.status).toBe('ok');
    expect(health.features.atom_extraction.status).toBe('ok');
    expect(health.features.pack_rag.status).toBe('ok');
    expect(health.features.utility_llm.status).toBe('ok');
  });

  it('embeddings-down (zero vector, no embedding key): off + keyword-fallback copy', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      embedProbe: async () => ({ provider: 'openai', model: 'text-embedding-3-small', zero: true }),
      env: { ANTHROPIC_API_KEY: 'k' }, // no OPENAI_API_KEY
      chromaProbe: async () => false,
    }));
    expect(health.features.embeddings.status).toBe('off');
    expect(health.features.embeddings.reason).toBe(
      'embeddings unavailable (no embedding provider configured) — knowledge search falls back to keyword'
    );
    // Chroma down without OPENAI_API_KEY → pack RAG off, honest reason
    expect(health.features.pack_rag.status).toBe('off');
    expect(health.features.pack_rag.reason).toContain('OPENAI_API_KEY');
    expect(health.overall).toBe('off');
  });

  it('embeddings degraded (key present but provider returns zero vectors)', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      embedProbe: async () => ({ provider: 'openai', model: 'text-embedding-3-small', zero: true }),
    }));
    expect(health.features.embeddings.status).toBe('degraded');
    expect(health.features.embeddings.reason).toContain('zero vector');
    expect(health.overall).toBe('degraded');
  });

  it('no-llm: atom capture and utility AI off with honest reasons', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      env: {}, // no keys at all
      utilityProvider: () => 'anthropic',
      embedProbe: async () => ({ provider: 'openai', model: 'text-embedding-3-small', zero: true }),
      chromaProbe: async () => false,
      lastAtomAt: async () => null,
    }));
    expect(health.features.atom_extraction.status).toBe('off');
    expect(health.features.atom_extraction.reason).toContain('no LLM provider credentials');
    expect(health.features.utility_llm.status).toBe('off');
    expect(health.overall).toBe('off');
  });

  it('atoms stale (>7 days) with credentials present → degraded, not fake green', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      lastAtomAt: async () => STALE,
    }));
    expect(health.features.atom_extraction.status).toBe('degraded');
    expect(health.features.atom_extraction.reason).toContain('older than 7 days');
  });

  it('no atoms yet with credentials present → degraded "no atoms captured yet"', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      lastAtomAt: async () => null,
    }));
    expect(health.features.atom_extraction.status).toBe('degraded');
    expect(health.features.atom_extraction.reason).toContain('no knowledge atoms captured yet');
  });

  it('ollama utility provider counts as credentialed (keyless local)', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      env: {},
      utilityProvider: () => 'ollama',
      lastAtomAt: async () => RECENT,
    }));
    expect(health.features.utility_llm.status).toBe('ok');
    expect(health.features.atom_extraction.status).toBe('ok');
  });

  it('parse telemetry overlay: recent fail-dominant extraction model → degraded, not fake green', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      parseStats: async () => ({
        'atom-extractor': {
          'ollama:tinyllama': { ok: 1, fail: 9, last_error: 'Unexpected token', updated_at: RECENT },
        },
      }),
    }));
    expect(health.features.atom_extraction.status).toBe('degraded');
    expect(health.features.atom_extraction.reason).toContain('JSON parsing fails');
    expect(health.features.atom_extraction.reason).toContain('ollama:tinyllama');
  });

  it('parse telemetry overlay: healthy or stale counters leave atom capture ok', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      parseStats: async () => ({
        // Mostly succeeding — fine.
        'atom-extractor': {
          'claude-haiku-4-5-20251001': { ok: 50, fail: 2, last_error: null, updated_at: RECENT },
        },
        // Fail-dominant but STALE (model no longer in use) — must not flag.
        'relationship-detector': {
          'ollama:tinyllama': { ok: 0, fail: 12, last_error: 'truncated', updated_at: STALE },
        },
      }),
    }));
    expect(health.features.atom_extraction.status).toBe('ok');
  });

  it('chroma unreachable WITH an OpenAI key → degraded (not off)', async () => {
    const health = await computeIntelligenceHealth(makeFakeDb(), probes({
      chromaProbe: async () => false,
    }));
    expect(health.features.pack_rag.status).toBe('degraded');
    expect(health.features.pack_rag.reason).toContain('unreachable');
  });
});
