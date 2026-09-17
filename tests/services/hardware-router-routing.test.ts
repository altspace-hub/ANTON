/**
 * hardware-router-routing.test.ts — the hardware pillar's model calls follow
 * Settings (Wave 6, track I).
 *
 *   photo-id-service   Vision cannot ride the router (callChat carries text,
 *                      the sdk: engine is text-only), so it keeps the shared
 *                      API client behind resolveVisionModel: any model that is
 *                      not the Anthropic API with a key is refused with a clear
 *                      "needs an API-key Claude model for images" error BEFORE
 *                      a client is touched — no silent charge to a key the
 *                      user did not choose.
 *   extend-device      Text: callChat on the medium tier (was a literal Sonnet
 *                      4.6 on getClient), an explicit claude-* id re-tiered,
 *                      and a routed failure lands in the structured fallback.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DatabaseAdapter, RunResult } from '../../server/db/database.js';
import type { StreamChatConfig, ChatResult } from '../../server/services/provider-router.js';

const state = vi.hoisted(() => ({
  chat: [] as StreamChatConfig[],
  chatReply: null as null | ((cfg: StreamChatConfig) => Promise<ChatResult>),
  visionCreates: [] as Array<{ model: string }>,
  getClientCalls: 0,
}));

vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  return {
    ...actual,
    callChat: vi.fn(async (cfg: StreamChatConfig): Promise<ChatResult> => {
      state.chat.push(cfg);
      if (state.chatReply) return state.chatReply(cfg);
      return { text: '{"feasibility":"straightforward","summary":"Add a BME280 on I2C."}', thinking: '', inputTokens: 1, outputTokens: 1 };
    }),
  };
});

vi.mock('../../server/services/claude-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/claude-client.js')>();
  return {
    ...actual,
    getClient: () => {
      state.getClientCalls++;
      return {
        messages: {
          create: async (params: { model: string }) => {
            state.visionCreates.push({ model: params.model });
            return { content: [{ type: 'text', text: '{"best_match_part_number":"ESP32-WROOM-32E","confidence":"high","read_markings":["FCC ID: 2AC7Z-ESPWROOM32E"],"counterfeit_risk":"low","counterfeit_indicators_present":[],"counterfeit_indicators_absent":["solder rework"],"recommendation":"accept","rationale":"Markings match."}' }] };
          },
        },
      };
    },
  };
});

import { createPhotoIdService, resolveVisionModel, VISION_NEEDS_API_MODEL } from '../../server/services/photo-id-service.js';
import { createExtendDeviceService } from '../../server/services/extend-device-service.js';
import { ServiceError } from '../../server/lib/hardware-helpers.js';

const ENV_KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  state.chat.length = 0;
  state.chatReply = null;
  state.visionCreates.length = 0;
  state.getClientCalls = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function fakeDb(project?: Record<string, unknown>): DatabaseAdapter & { gets: string[] } {
  const gets: string[] = [];
  return {
    dialect: 'postgresql',
    gets,
    async get(sql: string) {
      gets.push(sql);
      if (project && sql.includes('FROM hardware_projects')) return project;
      if (sql.includes('FROM hw_fleet_devices')) return { n: 0 };
      return undefined;
    },
    async all() { return []; },
    async run(): Promise<RunResult> { return { changes: 1, lastInsertRowid: 0 }; },
    async exec() { /* noop */ },
    async transaction<T>(fn: (d: DatabaseAdapter) => Promise<T>): Promise<T> { return fn(this as unknown as DatabaseAdapter); },
    async close() { /* noop */ },
  } as unknown as DatabaseAdapter & { gets: string[] };
}

const PHOTO = { bytes: Buffer.from([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg' as const };

function refusal(fn: () => unknown): ServiceError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ServiceError) return err;
    throw err;
  }
  throw new Error('expected a refusal');
}

describe('photo identification — the vision gate', () => {
  it('refuses on the subscription-engine default even with an API key in the env, before touching a client', async () => {
    process.env.DEFAULT_MODEL = 'sdk:claude-opus-5';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    const err = refusal(() => resolveVisionModel());
    expect(err.statusCode).toBe(503);
    expect(err.message).toContain(VISION_NEEDS_API_MODEL);
    expect(err.message).toContain('sdk:claude-sonnet-5');

    const db = fakeDb();
    await expect(createPhotoIdService(db).identify({ family_id: 'esp32', photos: [PHOTO] }))
      .rejects.toThrow(VISION_NEEDS_API_MODEL);
    expect(state.getClientCalls).toBe(0);
    expect(db.gets).toEqual([]);
  });

  it('refuses an explicit sdk: model and a text-only provider', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(refusal(() => resolveVisionModel('sdk:claude-opus-5')).message).toContain('anthropic_sdk');
    delete process.env.ANTHROPIC_API_KEY;
    process.env.MISTRAL_API_KEY = 'mk-test';
    expect(refusal(() => resolveVisionModel()).message).toContain('mistral');
  });

  it('refuses a Claude API model when no key is configured', () => {
    expect(refusal(() => resolveVisionModel()).message).toMatch(/ANTHROPIC_API_KEY is not configured/);
  });

  it('runs on the medium tier the router resolves for an API-key install', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(resolveVisionModel()).toEqual({ model: 'claude-sonnet-4-6', provider: 'anthropic' });

    const result = await createPhotoIdService(fakeDb()).identify({ family_id: 'esp32', photos: [PHOTO] });
    expect(state.visionCreates).toEqual([{ model: 'claude-sonnet-4-6' }]);
    expect(result.best_match_part_number).toBe('ESP32-WROOM-32E');
    expect(result.confidence).toBe('high');
  });
});

describe('extend-device proposals', () => {
  const project = {
    id: 'proj-1', title: 'Greenhouse monitor', family_id: 'esp32', tier: 1, region: 'KE',
    working_language: 'en', safety_critical: false, medical_adjacent: false,
    metadata: '{}', hkp_id: null, status: 'building',
  };

  it('run through callChat on the medium tier — no literal model — on the subscription engine', async () => {
    process.env.DEFAULT_MODEL = 'sdk:claude-opus-5';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const db = fakeDb(project);

    const proposal = await createExtendDeviceService(db).generateProposal({
      project_id: 'proj-1', desired_change: 'Add a humidity sensor to the greenhouse monitor',
    });

    expect(state.chat).toHaveLength(1);
    expect(state.chat[0].model).toBeUndefined();
    expect(state.chat[0].tier).toBe('medium');
    expect(state.chat[0].db).toBe(db);
    expect(state.getClientCalls).toBe(0);
    expect(proposal.feasibility).toBe('straightforward');
    expect(proposal.parse_error).toBeUndefined();
  });

  it('re-tiers an explicit claude-* id to the configured engine', async () => {
    process.env.DEFAULT_MODEL = 'sdk:claude-opus-5';
    await createExtendDeviceService(fakeDb(project)).generateProposal({
      project_id: 'proj-1', desired_change: 'Add a humidity sensor to the greenhouse monitor', model: 'claude-opus-4-8',
    });
    expect(state.chat[0].model).toBe('sdk:claude-opus-5');
  });

  it('a routed failure returns the structured fallback naming the reason', async () => {
    state.chatReply = async () => { throw new Error('SDK engine is disabled'); };
    const proposal = await createExtendDeviceService(fakeDb(project)).generateProposal({
      project_id: 'proj-1', desired_change: 'Add a humidity sensor to the greenhouse monitor',
    });
    expect(proposal.parse_error).toBe('Proposal generator unavailable: SDK engine is disabled');
    expect(proposal.pin_assignment_delta).toEqual([]);
  });
});
