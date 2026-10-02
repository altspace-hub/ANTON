/**
 * discovery-state-update.test.ts — the [STATE_UPDATE] a Discover turn ends
 * with is recorded wherever the model puts the JSON, and the person never
 * sees it.
 *
 * Before (2026-10-02): the update was read from the marker's own line only.
 * GLM, DeepSeek and Kimi — the public showcase's models — put it on the lines
 * below, pretty-printed or fenced, so nothing was recorded (the interview's
 * profile, activities and progress stayed empty) and the JSON was shown to
 * the visitor and kept in conversationHistory, where every later turn sent it
 * back to the model. The canonical one-line form must keep working.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

let reply = '';
vi.mock('../../server/services/provider-router.js', () => ({
  callChat: vi.fn(async () => ({ text: reply, thinking: '', inputTokens: 1, outputTokens: 1 })),
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'compat:openrouter:z-ai/glm-5.3' }));

import { createDiscoveryEngine } from '../../server/services/discovery-engine.js';

const FENCE = '```';
const PROSE = 'Thanks! What do you do on a typical Monday?';

/** In-memory discovery_sessions: the state each turn stores. */
function fakeStore(): DatabaseAdapter & { stored: string[] } {
  const rows = new Map<string, Record<string, unknown>>();
  const stored: string[] = [];
  const db = {
    dialect: 'postgresql',
    stored,
    async get(sql: string, ...p: unknown[]) {
      return /FROM discovery_sessions WHERE id = \?/.test(sql) ? rows.get(String(p[0])) : undefined;
    },
    async all() { return []; },
    async run(sql: string, ...p: unknown[]): Promise<RunResult> {
      if (/INSERT INTO discovery_sessions/.test(sql)) {
        const [id, user_id, tier, state] = p as string[];
        rows.set(id, { id, user_id, tier, state, status: 'active', output_id: null });
      } else if (/UPDATE discovery_sessions\s+SET state = \?/.test(sql)) {
        const [state, id] = p as string[];
        const row = rows.get(id);
        if (row) row.state = state;
        stored.push(state);
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return db as unknown as DatabaseAdapter & { stored: string[] };
}

/** One answered turn on a fresh session, the model replying `text`. */
async function turn(text: string) {
  reply = text;
  const db = fakeStore();
  const engine = await createDiscoveryEngine(db);
  const session = await engine.createSession('standard', 'visitor-1');
  const out = await engine.processUserResponse(session.id, 'I am a compliance analyst at a mid-size bank.', { demoVisitor: true });
  const persisted = JSON.parse(db.stored.at(-1)!) as { userProfile: { role?: string }; currentPhaseProgress: number; completedPhases: string[]; phase: string; conversationHistory: Array<{ role: string; content: string }> };
  return { out, persisted };
}

beforeEach(() => { reply = ''; });

describe('the [STATE_UPDATE] of a Discover turn', () => {
  it('records the canonical one-line form and shows only the prose', async () => {
    const { out, persisted } = await turn(`${PROSE}\n[STATE_UPDATE]:{"userProfile":{"role":"compliance analyst","industry":"banking"},"currentPhaseProgress":20}`);
    expect(out.state.userProfile.role).toBe('compliance analyst');
    expect(persisted.currentPhaseProgress).toBe(20);
    expect(out.response).toBe(PROSE);
  });

  it('records a pretty-printed, fenced update on the lines below the marker (the GLM shape) and keeps it out of the reply and the history', async () => {
    const { out, persisted } = await turn(`${PROSE}\n[STATE_UPDATE]:\n${FENCE}json\n{\n  "userProfile": {"role": "compliance analyst", "industry": "banking"},\n  "currentPhaseProgress": 20\n}\n${FENCE}`);
    expect(out.state.userProfile.role).toBe('compliance analyst');
    expect(persisted.userProfile.role).toBe('compliance analyst');
    expect(persisted.currentPhaseProgress).toBe(20);
    expect(out.response).toBe(PROSE);
    const assistant = persisted.conversationHistory.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n');
    expect(assistant).toBe(PROSE);
    expect(assistant).not.toContain('userProfile');
    expect(assistant).not.toContain(FENCE);
  });

  it('drops a fence opened before the marker, and reads a [PHASE_COMPLETE] that follows the JSON', async () => {
    const { out, persisted } = await turn(`${PROSE}\n\n${FENCE}json\n[STATE_UPDATE]: {"userProfile": {"role": "compliance analyst"}}\n${FENCE}\n[PHASE_COMPLETE:context]`);
    expect(out.state.userProfile.role).toBe('compliance analyst');
    expect(persisted.completedPhases).toContain('context');
    expect(persisted.phase).not.toBe('context');
    expect(out.phaseChanged).toBe(true);
    expect(out.response).toBe(PROSE);
  });

  it('keeps a reply with its own code block intact, and records nothing from an update that cannot be read', async () => {
    const withCode = `${PROSE}\n${FENCE}\nstep 1\n${FENCE}`;
    const { out, persisted } = await turn(`${withCode}\n[STATE_UPDATE]:\n{"userProfile": {"role": "compliance ana`);
    expect(out.response).toBe(withCode);
    expect(out.state.userProfile.role).toBeFalsy();
    expect(persisted.currentPhaseProgress).toBe(0);
  });

  it('a reply without a marker is shown whole (negative control)', async () => {
    const { out } = await turn(PROSE);
    expect(out.response).toBe(PROSE);
    expect(out.state.userProfile.role).toBeFalsy();
  });
});
