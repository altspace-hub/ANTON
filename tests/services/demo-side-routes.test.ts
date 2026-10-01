/**
 * demo-side-routes.test.ts — the pieces the answer tools share on a server
 * whose only engine is an OpenAI-compatible endpoint (public showcase,
 * 2026-10-01):
 *
 *   - hasAnyModelEngine: the gate that replaced the Claude-only and key-only
 *     ones (explain-for, citations, reviews, deliberation, the module builder);
 *   - sideRouteModel: the model a side route runs for a demo visitor (offered
 *     models only) and for everyone else;
 *   - parseCitationVerdicts: the citation check reads the object JSON mode
 *     returns as well as a bare array;
 *   - agentModel: a specialised agent saved with a Claude id follows the
 *     configured engine.
 *
 * Environment only — no database. The persisted default model is never loaded
 * here, so DEFAULT_MODEL in the environment is the configured default.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { hasAnyModelEngine, hasClaudeEngine } from '../../server/services/claude-engine-availability.js';
import { sideRouteModel } from '../../server/services/side-route-model.js';
import { parseCitationVerdicts } from '../../server/services/citation-verifier.js';
import { agentModel } from '../../server/services/agent-processor.js';

const KEYS = [
  'ANTHROPIC_API_KEY', 'SDK_ENGINE_ENABLED', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY',
  'DEFAULT_MODEL', 'DEMO_MODE', 'DEMO_OFFERED_MODELS',
] as const;
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
function clean(): void {
  for (const k of KEYS) delete process.env[k];
}
afterEach(() => {
  for (const k of KEYS) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
});

const GLM = 'compat:openrouter:z-ai/glm-5.3';
const KIMI = 'compat:openrouter:moonshotai/kimi-k2.6';
const DEEPSEEK = 'compat:openrouter:deepseek/deepseek-v4-flash-0731';

describe('hasAnyModelEngine', () => {
  it('is true on a server whose only engine is an OpenAI-compatible endpoint, where hasClaudeEngine is false', () => {
    clean();
    process.env.DEFAULT_MODEL = GLM;
    expect(hasClaudeEngine()).toBe(false);
    expect(hasAnyModelEngine()).toBe(true);
  });

  it('is true for Ollama as the default and for a provider key', () => {
    clean();
    process.env.DEFAULT_MODEL = 'ollama:llama3.2';
    expect(hasAnyModelEngine()).toBe(true);
    clean();
    process.env.MISTRAL_API_KEY = 'm';
    expect(hasAnyModelEngine()).toBe(true);
  });

  it('negative control: false with no engine, no default and no key', () => {
    clean();
    expect(hasAnyModelEngine()).toBe(false);
  });
});

describe('sideRouteModel', () => {
  const visitor = { user: { role: 'analyst' } };
  const admin = { user: { role: 'admin' } };

  it('gives a demo visitor the model asked for only when the demo offers it, else the default', () => {
    clean();
    process.env.DEMO_MODE = 'true';
    process.env.DEFAULT_MODEL = GLM;
    process.env.DEMO_OFFERED_MODELS = `${GLM},${KIMI}`;
    expect(sideRouteModel(visitor, KIMI, 'claude-opus-5-5')).toBe(KIMI);
    expect(sideRouteModel(visitor, DEEPSEEK, 'claude-opus-5-5')).toBe(GLM);
    expect(sideRouteModel(visitor, 'claude-opus-5-5', 'claude-opus-5-5')).toBe(GLM);
    expect(sideRouteModel(visitor, undefined, 'claude-opus-5-5')).toBe(GLM);
    expect(sideRouteModel(visitor, 42, 'claude-opus-5-5')).toBe(GLM);
  });

  it('falls back to the first offered model when the default is not offered', () => {
    clean();
    process.env.DEMO_MODE = 'true';
    process.env.DEFAULT_MODEL = DEEPSEEK;
    process.env.DEMO_OFFERED_MODELS = `${KIMI},${GLM}`;
    expect(sideRouteModel(visitor, 'compat:openrouter:other', 'claude-opus-5-5')).toBe(KIMI);
  });

  it('negative control: an admin, and everyone outside a demo, get the model asked for; a Claude id follows the engine', () => {
    clean();
    process.env.DEMO_MODE = 'true';
    process.env.DEFAULT_MODEL = GLM;
    process.env.DEMO_OFFERED_MODELS = `${GLM},${KIMI}`;
    expect(sideRouteModel(admin, DEEPSEEK, 'claude-opus-5-5')).toBe(DEEPSEEK);
    delete process.env.DEMO_MODE;
    expect(sideRouteModel(visitor, DEEPSEEK, 'claude-opus-5-5')).toBe(DEEPSEEK);
    // No model asked for: the fallback, mapped onto the configured compat engine.
    expect(sideRouteModel(visitor, undefined, 'claude-sonnet-4-6')).toBe(GLM);
  });
});

describe('parseCitationVerdicts', () => {
  const verdict = { citation: 'Article 3', verified: true, comment: 'ok', sourceMatch: 'ai_knowledge' };

  it('reads the {"citations": [...]} object, a bare array, a fenced reply and prose around the JSON', () => {
    expect(parseCitationVerdicts(JSON.stringify({ citations: [verdict] }))).toEqual([verdict]);
    expect(parseCitationVerdicts(JSON.stringify([verdict]))).toEqual([verdict]);
    expect(parseCitationVerdicts('```json\n' + JSON.stringify({ citations: [verdict] }) + '\n```')).toEqual([verdict]);
    expect(parseCitationVerdicts('Here you go: ' + JSON.stringify({ citations: [verdict] }) + ' Done.')).toEqual([verdict]);
    // A provider that names the list otherwise.
    expect(parseCitationVerdicts(JSON.stringify({ results: [verdict] }))).toEqual([verdict]);
  });

  it('negative control: null for a reply with no list', () => {
    expect(parseCitationVerdicts('I cannot verify these.')).toBeNull();
    expect(parseCitationVerdicts(JSON.stringify({ summary: 'none' }))).toBeNull();
  });
});

describe('agentModel', () => {
  it('maps a Claude id onto the configured compat engine, keeps any other id, and leaves none as none', () => {
    clean();
    process.env.DEFAULT_MODEL = GLM;
    expect(agentModel('claude-sonnet-4-6')).toBe(GLM);
    expect(agentModel(KIMI)).toBe(KIMI);
    expect(agentModel(null)).toBeUndefined();
    expect(agentModel('  ')).toBeUndefined();
  });

  it('negative control: with an Anthropic key a Claude id stays a Claude id', () => {
    clean();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(agentModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });
});
