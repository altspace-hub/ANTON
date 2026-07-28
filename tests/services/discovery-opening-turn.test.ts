/**
 * discovery-opening-turn.test.ts — the first thing a new Discovery user ever sees.
 *
 * Two bugs met here, and both were invisible from the outside because the CONTENT of
 * a turn is only visible in what we hand the provider:
 *
 *  1. The `turnCount === 0` branch of getPhasePrompt — the warm opening ("what's your
 *     role, and what kind of organization do you work in?") — was DEAD CODE. The
 *     opening turn was driven by a synthetic `__START_DISCOVERY__` user message that
 *     was pushed into the history BEFORE the phase prompt was built, so the count was
 *     already 1 and the session opened on the turn-1 instruction instead: "reflect
 *     back what you learned from their first answer" — an answer nobody had given.
 *  2. That same sentinel was in the messages array, so the model literally received
 *     `__START_DISCOVERY__` as the user's opening words. The route scrubbed it from
 *     the stored history AFTERWARDS, which hid the bug from every state-level test.
 *
 * So these tests assert on what is SENT (system prompt + messages), not on the stored
 * state. A state-level assertion cannot see either bug.
 *
 * The turn-2 case is here for a specific reason: the obvious "fix" — move the phase
 * prompt above the push — also makes turn 1 work, and then silently re-opens the
 * session on turn 2 as well. turnCount counts the user answers INCLUDING the current
 * one; only the synthetic turn must be excluded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';

/** Everything the engine hands the provider, in order. */
const sent: Array<{ system: string; messages: Array<{ role: string; content: string }> }> = [];

vi.mock('../../server/services/provider-router.js', () => ({
  callChat: async (args: { system: string; messages: Array<{ role: string; content: string }> }) => {
    sent.push({ system: args.system, messages: args.messages });
    return { text: 'assistant reply', inputTokens: 10, outputTokens: 20 };
  },
  mapModelToProvider: (m: string) => m,
}));
vi.mock('../../server/services/utility-model.js', () => ({
  getRoutedUtilityModel: async () => 'utility-model',
}));

/** The opening anchor question, verbatim from the turnCount===0 phase prompt. */
const ANCHOR_Q1 = "What's your role, and what kind of organization do you work in?";
/** The turn-1 instruction — must NOT appear on the opening turn. */
const TURN_1_INSTRUCTION = 'The user just told you their role/organization';

/**
 * In-memory stand-in for `discovery_sessions`; records every state write.
 *
 * `run` yields to the event loop before it does anything. That is what makes the
 * "the save is awaited" test below non-vacuous: a real database write is not
 * instantaneous, so a fire-and-forget `updateSessionState(...)` has NOT landed by the
 * time the caller returns. A synchronous fake would record the write either way and
 * the assertion would pass against the bug.
 */
function fakeStore(): DatabaseAdapter & { writes: string[] } {
  const rows = new Map<string, Record<string, unknown>>();
  const writes: string[] = [];
  const db = {
    dialect: 'postgres',
    writes,
    async get(sql: string, ...p: unknown[]) {
      if (/FROM discovery_sessions WHERE id = \?/.test(sql)) return rows.get(p[0] as string);
      return undefined;
    },
    async all() { return []; },
    async run(sql: string, ...p: unknown[]): Promise<RunResult> {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (/INSERT INTO discovery_sessions/.test(sql)) {
        const [id, user_id, tier, state] = p as string[];
        rows.set(id, { id, user_id, tier, state, status: 'active', output_id: null });
      } else if (/UPDATE discovery_sessions\s+SET state = \?/.test(sql)) {
        const [state, id] = p as string[];
        const row = rows.get(id);
        if (row) row.state = state;
        writes.push(state);
      }
      return { changes: 1, lastInsertRowid: 0 } as RunResult;
    },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(db as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  };
  return db as unknown as DatabaseAdapter & { writes: string[] };
}

async function newEngine() {
  const { createDiscoveryEngine } = await import('../../server/services/discovery-engine.js');
  const db = fakeStore();
  // The engine only uses `anthropic` as an "is a provider configured" flag; every
  // actual call goes through the mocked provider-router.
  const engine = await createDiscoveryEngine(db, {} as never);
  return { db, engine };
}

beforeEach(() => { sent.length = 0; });

describe('the opening Discovery turn', () => {
  it('asks the warm opening question — the turnCount===0 branch is reachable', async () => {
    const { engine } = await newEngine();
    const session = await engine.createSession('standard', 'user-1');

    await engine.startConversation(session.id);

    expect(sent).toHaveLength(1);
    expect(sent[0].system).toContain(ANCHOR_Q1);
    // …and NOT the turn-1 instruction, which is what it used to send instead.
    expect(sent[0].system).not.toContain(TURN_1_INSTRUCTION);
  });

  it('never sends the __START_DISCOVERY__ sentinel to the model', async () => {
    const { engine } = await newEngine();
    const session = await engine.createSession('standard', 'user-1');

    await engine.startConversation(session.id);

    // Guard against a vacuous pass: there IS a user message, it just is not the token.
    const messages = sent[0].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content.trim().length).toBeGreaterThan(0);
    expect(messages[0].content).not.toContain('__START_DISCOVERY__');
    expect(JSON.stringify(messages)).not.toContain('__START');
  });

  it('keeps the synthetic turn out of the stored conversation history', async () => {
    const { engine } = await newEngine();
    const session = await engine.createSession('standard', 'user-1');

    const { state } = await engine.startConversation(session.id);

    expect(state.conversationHistory.filter(m => m.role === 'user')).toHaveLength(0);
    expect(state.conversationHistory.filter(m => m.role === 'assistant')).toHaveLength(1);
  });

  it('does NOT re-open the session on turn 2 — the user\'s first real answer gets the turn-1 prompt', async () => {
    const { engine } = await newEngine();
    const session = await engine.createSession('standard', 'user-1');

    await engine.startConversation(session.id);
    await engine.processUserResponse(session.id, 'I am a compliance analyst at a mid-size bank');

    expect(sent).toHaveLength(2);
    expect(sent[1].system).toContain(TURN_1_INSTRUCTION);
    expect(sent[1].system).not.toContain(ANCHOR_Q1);
    // The real answer reaches the model verbatim.
    expect(sent[1].messages.at(-1)).toEqual({ role: 'user', content: 'I am a compliance analyst at a mid-size bank' });
  });

  it('startConversation replays the existing opening instead of re-billing a turn', async () => {
    const { engine } = await newEngine();
    const session = await engine.createSession('standard', 'user-1');

    const first = await engine.startConversation(session.id);
    const second = await engine.startConversation(session.id);

    expect(second.response).toBe(first.response);
    expect(sent).toHaveLength(1);   // no second provider call
  });

  it('has persisted the turn by the time it returns (the save is awaited)', async () => {
    // The save was fire-and-forget: the route could answer before the write landed,
    // and a failing write became an unhandled rejection instead of a 500.
    const { db, engine } = await newEngine();
    const session = await engine.createSession('standard', 'user-1');

    await engine.processUserResponse(session.id, 'hello');

    const writes = (db as unknown as { writes: string[] }).writes;
    expect(writes).toHaveLength(1);
    const persisted = await engine.getSession(session.id);
    expect(persisted!.state.conversationHistory).toHaveLength(2);   // user + assistant
  });
});
