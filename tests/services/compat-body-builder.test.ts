/**
 * compat-body-builder.test.ts — the one request body every compat:<slug>:<model>
 * call is built from (openaiCompatibleAdapter.buildCompatBody), and the
 * thinking-level → `reasoning` mapping it uses (thinking-map.compatReasoningParam).
 *
 * Before 2026-09-25 the body carried only model / messages / temperature /
 * max_tokens / response_format / tools: no OpenRouter provider pin, no
 * reasoning (GLM 5.3 Flash then reasons at its default, max, on every call),
 * no include_usage, no end-user id, and images went in as JSON-stringified
 * base64 text.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCompatBody,
  compatEndUserId,
  compatMaxTokens,
  toCompatMessages,
  CompatImageRefusedError,
  type OpenAICompatibleStreamParams,
} from '../../server/services/adapters/openaiCompatibleAdapter.js';
import { compatReasoningParam } from '../../server/services/thinking-map.js';
import { runWithRequestContext } from '../../server/lib/request-context.js';
import type { CompatModelMeta } from '../../server/services/compat-endpoint.js';

const GLM: CompatModelMeta = {
  contextLength: 1_310_720,
  maxCompletionTokens: 131_072,
  inputModalities: ['text'],
  reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'], defaultEffort: 'max' },
};
const LING_VL: CompatModelMeta = {
  maxCompletionTokens: 32_768,
  inputModalities: ['text', 'image'],
  reasoning: { mandatory: false },
};
const EU_PIN = { provider: { only: ['inceptron', 'nextbit'], allow_fallbacks: false, zdr: true, data_collection: 'deny' } };

function params(over: Partial<OpenAICompatibleStreamParams> = {}): OpenAICompatibleStreamParams {
  return {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'z-ai/glm-5.3-flash',
    system: 'sys',
    messages: [{ role: 'user', content: 'q' }],
    userId: null,
    ...over,
  };
}

describe('compatReasoningParam — thinking level → reasoning effort', () => {
  it('fits each level to the efforts GLM takes (low/high/max), never another word', () => {
    const r = GLM.reasoning;
    expect(compatReasoningParam('quick', r)).toEqual({ effort: 'low' });
    expect(compatReasoningParam('think', r)).toEqual({ effort: 'high' });
    expect(compatReasoningParam('think_hard', r)).toEqual({ effort: 'high' });
    expect(compatReasoningParam('investigate', r)).toEqual({ effort: 'max' });
    expect(compatReasoningParam('deep_investigate', r)).toEqual({ effort: 'max' });
  });

  it('switches optional reasoning off for quick, and uses the default ladder when no efforts are listed', () => {
    expect(compatReasoningParam('quick', LING_VL.reasoning)).toEqual({ enabled: false });
    expect(compatReasoningParam('think', LING_VL.reasoning)).toEqual({ effort: 'medium' });
    expect(compatReasoningParam('deep_investigate', LING_VL.reasoning)).toEqual({ effort: 'high' });
  });

  it('sends nothing for a model the endpoint does not say reasons', () => {
    expect(compatReasoningParam('deep_investigate', undefined)).toBeUndefined();
  });

  it('treats a call that names no level (a utility call) as quick, not at the model\'s default', () => {
    expect(compatReasoningParam(undefined, GLM.reasoning)).toEqual({ effort: 'low' });
    expect(compatReasoningParam(undefined, LING_VL.reasoning)).toEqual({ enabled: false });
  });
});

describe('buildCompatBody', () => {
  it('merges the endpoint extra body (OpenRouter EU/ZDR provider pin) into the request', () => {
    const body = buildCompatBody(params({ extraBody: EU_PIN }), true, true);
    expect(body.provider).toEqual(EU_PIN.provider);
  });

  it('keeps ANTON\'s own fields when the extra body names them', () => {
    const body = buildCompatBody(params({
      extraBody: { model: 'openai/gpt-6-astra', stream: false, messages: [], max_tokens: 999_999, tools: [{ type: 'function' }] },
      maxTokens: 1000,
    }), true, true);
    expect(body.model).toBe('z-ai/glm-5.3-flash');
    expect(body.stream).toBe(true);
    expect((body.messages as unknown[]).length).toBe(2);
    expect(body.max_tokens).toBe(1000);
    expect(body.tools).toBeUndefined();
  });

  it('never sends a stored extra-body key that picks another model (models, route, preset)', () => {
    // OpenRouter's `models` is a fallback list: passed through, it would answer
    // with models outside the endpoint's allowedModels on the owner's key.
    const body = buildCompatBody(params({
      extraBody: { ...EU_PIN, models: ['anthropic/claude-opus-5.5'], route: 'fallback', preset: 'expensive', prompt: 'x' },
    }), true, true);
    expect(body.models).toBeUndefined();
    expect(body.route).toBeUndefined();
    expect(body.preset).toBeUndefined();
    expect(body.prompt).toBeUndefined();
    expect(body.provider).toEqual(EU_PIN.provider);   // negative control: the rest of the extra body still goes
  });

  it('sends reasoning from the thinking level only when the model reasons, merged with an admin reasoning setting', () => {
    const withMeta = buildCompatBody(params({ modelMeta: GLM, thinkingLevel: 'quick', extraBody: { reasoning: { exclude: true } } }), true, true);
    expect(withMeta.reasoning).toEqual({ exclude: true, effort: 'low' });
    // Negative control: no meta → no reasoning field at all (today's behaviour).
    const without = buildCompatBody(params({ thinkingLevel: 'quick' }), true, true);
    expect(without.reasoning).toBeUndefined();
  });

  it('asks for usage on a stream and not on a plain call', () => {
    expect(buildCompatBody(params(), true, true).stream_options).toEqual({ include_usage: true });
    expect(buildCompatBody(params(), false, true).stream_options).toBeUndefined();
  });

  it('sends an HMAC of the user id as `user`, never the id itself', () => {
    const body = buildCompatBody(params({ userId: 'user-42' }), true, true);
    expect(body.user).toBe(compatEndUserId('user-42'));
    expect(String(body.user)).not.toContain('user-42');
    expect(compatEndUserId('user-42')).not.toBe(compatEndUserId('user-43'));
    // No user known → no field.
    expect(buildCompatBody(params({ userId: null }), true, true).user).toBeUndefined();
  });

  it('takes the user from the request context when the caller passed none', () => {
    const body = runWithRequestContext({ userId: 'ctx-user' }, () =>
      buildCompatBody(params({ userId: undefined }), true, true));
    expect(body.user).toBe(compatEndUserId('ctx-user'));
  });

  it('never sends tools — their tool_calls are not read back', () => {
    const body = buildCompatBody(params({ tools: [{ type: 'custom', name: 'lookup', input_schema: { type: 'object' } }] }), true, true);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it('clamps max_tokens to the endpoint ceiling, leaving room for reasoning below it', () => {
    // 8192 asked + 2048 for low reasoning = 10240 → under a 12k ceiling.
    expect(buildCompatBody(params({ modelMeta: GLM, thinkingLevel: 'quick', maxTokens: 8192, maxOutputTokens: 12_000 }), true, true).max_tokens).toBe(10_240);
    // Same ask, ceiling 9000 → 9000.
    expect(buildCompatBody(params({ modelMeta: GLM, thinkingLevel: 'quick', maxTokens: 8192, maxOutputTokens: 9000 }), true, true).max_tokens).toBe(9000);
    // The model's own ceiling applies too.
    expect(compatMaxTokens(64_000, { effort: 'high' }, null, 32_768)).toBe(32_768);
    // No reasoning → exactly what was asked.
    expect(compatMaxTokens(512, undefined, null, undefined)).toBe(512);
  });
});

describe('images on compat models', () => {
  const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const withImage = [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_B64 } },
      { type: 'text', text: 'What is in this picture?' },
    ],
  }];

  it('sends an image as an image_url data URL part (text first) to a model that reads images', () => {
    const [m] = toCompatMessages(withImage, { acceptsImages: true, model: 'inclusionai/ling-3.0-flash-vl' });
    expect(m.content).toEqual([
      { type: 'text', text: 'What is in this picture?' },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${PNG_B64}` } },
    ]);
  });

  it('refuses an image for a model that does not read images — never stringifies the base64 into the prompt', () => {
    expect(() => toCompatMessages(withImage, { acceptsImages: false, model: 'z-ai/glm-5.3-flash' })).toThrow(CompatImageRefusedError);
    expect(() => buildCompatBody(params({ messages: withImage, modelMeta: GLM }), true, true)).toThrow(/does not read images/);
  });

  it('flattens stored Claude content blocks to their text, dropping thinking blocks', () => {
    const [m] = toCompatMessages([{
      role: 'assistant',
      content: [{ type: 'thinking', thinking: 'secret', signature: 'sig' }, { type: 'text', text: 'Answer.' }],
    }], { acceptsImages: false, model: 'm' });
    expect(m).toEqual({ role: 'assistant', content: 'Answer.' });
  });
});
