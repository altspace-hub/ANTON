/**
 * Unit tests for the portal walkthrough state machine (Wave-3 plan 3.7):
 *
 *   - PHASE_ORDER / nextPhase: the locked 8-phase progression
 *   - PHASE_SCHEMAS: per-phase zod validation (valid output accepted,
 *     malformed output rejected) — this is the gate between LLM output
 *     and persisted walkthrough state
 *   - advanceSession: schema rejection, double-advance refusal, normal
 *     transition (in-memory DatabaseAdapter stub — engine logic only)
 *   - finalizeSession prerequisites: missing session, non-active status,
 *     incomplete phases all refuse before any portal is created
 *
 * The DB stub only answers the session-row SELECT/UPDATE the engine issues;
 * no Postgres needed. The finalize success path (real inserts, keygen,
 * registry submission) is integration-level and out of scope here.
 */

import { describe, it, expect } from 'vitest';

import {
  PHASE_ORDER,
  PHASE_SCHEMAS,
  nextPhase,
  createWalkthroughEngine,
  type PhaseId,
} from '../../../server/services/portals/portal-walkthrough-engine.js';
import type { DatabaseAdapter, RunResult } from '../../../server/db/database.js';

// ── Phase machine ───────────────────────────────────────────────────────────

describe('PHASE_ORDER / nextPhase', () => {
  it('locks the 8-phase order per Spec §E.4', () => {
    expect(PHASE_ORDER).toEqual([
      'intent', 'identity', 'content_structure', 'content_generation',
      'capabilities', 'aesthetics', 'review', 'publish',
    ]);
  });

  it('advances each phase to its successor', () => {
    for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
      expect(nextPhase(PHASE_ORDER[i])).toBe(PHASE_ORDER[i + 1]);
    }
  });

  it('returns null after the terminal publish phase', () => {
    expect(nextPhase('publish')).toBeNull();
  });

  it('returns null for an unknown phase id', () => {
    expect(nextPhase('not-a-phase' as PhaseId)).toBeNull();
  });
});

// ── Per-phase schema fixtures ───────────────────────────────────────────────

const VALID_PHASE_OUTPUT: Record<PhaseId, unknown> = {
  intent: {
    audience: 'Local cake lovers',
    problem_solved: 'Ordering bespoke cakes is painful',
    visitor_actions: ['order a cake', 'ask a question'],
  },
  identity: {
    name: 'cake-shop',
    namespace: 'futurechain',
    display_title: 'The Cake Shop',
    category: 'commerce',
  },
  content_structure: {
    pages: [{ path: '/', title: 'Home', sort_order: 0 }],
  },
  content_generation: {
    pages: [{ path: '/', html: '<h1>{{title}}</h1>' }],
  },
  capabilities: {
    capabilities: [{
      id: 'order-cake',
      verb: 'order',
      title: 'Order a cake',
      description: 'Place a bespoke cake order.',
      aap_endpoint: 'orders',
    }],
  },
  aesthetics: { palette: 'warm', font_family: 'Inter' },
  review: { approved: true, quality_score: 8 },
  publish: { public_index: false, ready_to_register: true },
};

describe('PHASE_SCHEMAS accept well-formed phase output', () => {
  it.each(PHASE_ORDER)('%s schema accepts its valid fixture', (phase) => {
    const r = PHASE_SCHEMAS[phase].safeParse(VALID_PHASE_OUTPUT[phase]);
    expect(r.success).toBe(true);
  });
});

describe('PHASE_SCHEMAS reject malformed phase output', () => {
  it('intent: missing audience', () => {
    const r = PHASE_SCHEMAS.intent.safeParse({ problem_solved: 'x'.repeat(10), visitor_actions: ['a'] });
    expect(r.success).toBe(false);
  });

  it('intent: empty visitor_actions', () => {
    const r = PHASE_SCHEMAS.intent.safeParse({
      audience: 'people', problem_solved: 'things', visitor_actions: [],
    });
    expect(r.success).toBe(false);
  });

  it('identity: rejects uppercase / illegal portal name', () => {
    const r = PHASE_SCHEMAS.identity.safeParse({
      ...(VALID_PHASE_OUTPUT.identity as Record<string, unknown>),
      name: 'Cake_Shop!',
    });
    expect(r.success).toBe(false);
  });

  it('identity: rejects an invalid namespace (too short / bad charset)', () => {
    const r = PHASE_SCHEMAS.identity.safeParse({
      ...(VALID_PHASE_OUTPUT.identity as Record<string, unknown>),
      namespace: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('identity: rejects an unknown category', () => {
    const r = PHASE_SCHEMAS.identity.safeParse({
      ...(VALID_PHASE_OUTPUT.identity as Record<string, unknown>),
      category: 'galactic',
    });
    expect(r.success).toBe(false);
  });

  it('content_structure: rejects an empty pages array', () => {
    expect(PHASE_SCHEMAS.content_structure.safeParse({ pages: [] }).success).toBe(false);
  });

  it('content_generation: rejects a page with empty html', () => {
    const r = PHASE_SCHEMAS.content_generation.safeParse({ pages: [{ path: '/', html: '' }] });
    expect(r.success).toBe(false);
  });

  it('capabilities: rejects an unknown verb', () => {
    const r = PHASE_SCHEMAS.capabilities.safeParse({
      capabilities: [{
        id: 'cap', verb: 'teleport', title: 't', description: 'd', aap_endpoint: 'e',
      }],
    });
    expect(r.success).toBe(false);
  });

  it('capabilities: rejects an illegal capability id (uppercase)', () => {
    const r = PHASE_SCHEMAS.capabilities.safeParse({
      capabilities: [{
        id: 'BadId', verb: 'contact', title: 't', description: 'd', aap_endpoint: 'e',
      }],
    });
    expect(r.success).toBe(false);
  });

  it('aesthetics: rejects custom_css over the 20KB cap', () => {
    const r = PHASE_SCHEMAS.aesthetics.safeParse({ custom_css: 'a'.repeat(20_001) });
    expect(r.success).toBe(false);
  });

  it('review: rejects a quality_score above 10', () => {
    expect(PHASE_SCHEMAS.review.safeParse({ approved: true, quality_score: 11 }).success).toBe(false);
  });

  it('publish: ready_to_register must be literally true', () => {
    expect(PHASE_SCHEMAS.publish.safeParse({ ready_to_register: false }).success).toBe(false);
  });

  it('publish: external surface_mode requires external_primary_url', () => {
    const r = PHASE_SCHEMAS.publish.safeParse({
      ready_to_register: true, surface_mode: 'external',
    });
    expect(r.success).toBe(false);
    const ok = PHASE_SCHEMAS.publish.safeParse({
      ready_to_register: true, surface_mode: 'external',
      external_primary_url: 'https://example.com',
    });
    expect(ok.success).toBe(true);
  });
});

// ── Engine: advance + finalize prerequisites (DB stub) ──────────────────────

interface StubSessionRow {
  id: string;
  owner_id: string;
  template_id: string;
  current_phase: PhaseId;
  phases_completed: string;
  accumulated_state: string;
  depth: 'light' | 'standard' | 'deep';
  status: 'active' | 'finalized' | 'abandoned';
  portal_id: string | null;
  created_at: string;
  updated_at: string;
}

function sessionRow(overrides: Partial<StubSessionRow> = {}): StubSessionRow {
  const now = new Date().toISOString();
  return {
    id: 'sess-1',
    owner_id: 'solo',
    template_id: 'personal',
    current_phase: 'intent',
    phases_completed: '[]',
    accumulated_state: '{}',
    depth: 'standard',
    status: 'active',
    portal_id: null,
    created_at: now,
    updated_at: now,
  ...overrides,
  };
}

/** Minimal adapter: answers the session SELECT, swallows UPDATEs. */
function stubDb(row: StubSessionRow | undefined): DatabaseAdapter {
  const ok: RunResult = { changes: 1, lastInsertRowid: 0 };
  return {
    dialect: 'postgresql',
    async get<T>(sql: string): Promise<T | undefined> {
      if (sql.includes('FROM portal_walkthrough_sessions')) return row as T | undefined;
      return undefined;
    },
    async all<T>(): Promise<T[]> { return []; },
    async run(): Promise<RunResult> { return ok; },
    async exec(): Promise<void> { /* noop */ },
    async transaction<T>(fn: (db: DatabaseAdapter) => Promise<T>): Promise<T> {
      return fn(this);
    },
    async close(): Promise<void> { /* noop */ },
  };
}

describe('advanceSession (engine gate around PHASE_SCHEMAS)', () => {
  it('rejects phase output that fails the schema', async () => {
    const engine = createWalkthroughEngine(stubDb(sessionRow()));
    await expect(engine.advanceSession('sess-1', { wrong: 'shape' }))
      .rejects.toThrow(/failed validation/);
  });

  it('advances intent → identity on valid output', async () => {
    const engine = createWalkthroughEngine(stubDb(sessionRow()));
    const r = await engine.advanceSession('sess-1', VALID_PHASE_OUTPUT.intent);
    expect(r.newPhase).toBe('identity');
    expect(r.session.phasesCompleted).toEqual(['intent']);
    expect(r.session.accumulatedState.intent).toBeDefined();
  });

  it('returns newPhase null after the terminal publish phase', async () => {
    const row = sessionRow({
      current_phase: 'publish',
      phases_completed: JSON.stringify(PHASE_ORDER.slice(0, -1)),
    });
    const engine = createWalkthroughEngine(stubDb(row));
    const r = await engine.advanceSession('sess-1', VALID_PHASE_OUTPUT.publish);
    expect(r.newPhase).toBeNull();
    expect(r.session.phasesCompleted).toEqual(PHASE_ORDER);
  });

  it('refuses to re-advance an already-completed phase (no duplicate entries)', async () => {
    const row = sessionRow({
      current_phase: 'publish',
      phases_completed: JSON.stringify(PHASE_ORDER), // publish already recorded
    });
    const engine = createWalkthroughEngine(stubDb(row));
    await expect(engine.advanceSession('sess-1', VALID_PHASE_OUTPUT.publish))
      .rejects.toThrow(/already completed/);
  });

  it('refuses to advance a finalized session', async () => {
    const engine = createWalkthroughEngine(stubDb(sessionRow({ status: 'finalized' })));
    await expect(engine.advanceSession('sess-1', VALID_PHASE_OUTPUT.intent))
      .rejects.toThrow(/finalized/);
  });
});

describe('finalizeSession prerequisites', () => {
  it('throws for a missing session', async () => {
    const engine = createWalkthroughEngine(stubDb(undefined));
    await expect(engine.finalizeSession('nope')).rejects.toThrow(/not found/);
  });

  it('refuses a session that is already finalized', async () => {
    const engine = createWalkthroughEngine(stubDb(sessionRow({ status: 'finalized' })));
    await expect(engine.finalizeSession('sess-1')).rejects.toThrow(/already finalized/);
  });

  it('refuses an abandoned session', async () => {
    const engine = createWalkthroughEngine(stubDb(sessionRow({ status: 'abandoned' })));
    await expect(engine.finalizeSession('sess-1')).rejects.toThrow(/already abandoned/);
  });

  it('refuses to finalize with incomplete phases (3/8)', async () => {
    const row = sessionRow({
      current_phase: 'content_generation',
      phases_completed: JSON.stringify(PHASE_ORDER.slice(0, 3)),
    });
    const engine = createWalkthroughEngine(stubDb(row));
    await expect(engine.finalizeSession('sess-1')).rejects.toThrow(/3\/8 phases complete/);
  });

  it('generatePhasePrompt refuses non-active sessions', async () => {
    const engine = createWalkthroughEngine(stubDb(sessionRow({ status: 'abandoned' })));
    await expect(engine.generatePhasePrompt('sess-1')).rejects.toThrow(/abandoned/);
  });
});
