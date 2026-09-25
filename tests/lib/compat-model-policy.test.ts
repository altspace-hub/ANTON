/**
 * compat-model-policy.test.ts — what the model picker offers, and what a
 * compat: model (an OpenAI-compatible endpoint such as OpenRouter) is not
 * offered on the Work page.
 *
 * Public showcase (2026-09-25): the server enforces an endpoint's
 * allowedModels and the demo's offered models; the picker must not list what
 * the server refuses. Web search, the two revelation-chain levels and
 * multi-agent do not run on a compat model, so the page must not offer them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  compatModelNotAllowed,
  compatParts,
  compatPickerOptions,
  compatThinkingFallback,
  demoModelCorrection,
  endpointPickerModels,
  isCompatModelId,
  loadPublicModelConfig,
  multiAgentUnavailable,
  offeredPickerOptions,
  pickerRestrictedToOffered,
  readPublicModelConfig,
  resetPublicModelConfigCache,
  thinkingLevelUnavailable,
  webSearchUnavailable,
  type PickerCompatEndpoint,
} from '../../src/lib/compat-model-policy';
import type { ThinkingLevel } from '../../src/lib/types';

const GLM = 'compat:openrouter:z-ai/glm-5.3-flash';

const openrouter = (over: Partial<PickerCompatEndpoint> = {}): PickerCompatEndpoint => ({
  slug: 'openrouter',
  displayName: 'OpenRouter',
  defaultModel: 'z-ai/glm-5.3-flash',
  availableModels: ['z-ai/glm-5.3-flash', 'anthropic/claude-opus-5.5', 'inclusionai/ling-3.0-flash-vl'],
  enabled: true,
  ...over,
});

describe('compat ids', () => {
  it('splits slug and a model id that itself holds a slash or colon', () => {
    expect(compatParts(GLM)).toEqual({ slug: 'openrouter', model: 'z-ai/glm-5.3-flash' });
    expect(compatParts('compat:local:qwen3.5:9b')).toEqual({ slug: 'local', model: 'qwen3.5:9b' });
  });

  it('is null for anything that is not a well-formed compat id', () => {
    expect(compatParts('claude-opus-5-5')).toBeNull();
    expect(compatParts('compat:openrouter')).toBeNull();
    expect(compatParts('compat::x')).toBeNull();
    expect(isCompatModelId('sdk:claude-opus-5-5')).toBe(false);
    expect(isCompatModelId(undefined)).toBe(false);
  });
});

describe('endpoint allowed models in the picker', () => {
  it('offers only the allow-list when one is set', () => {
    const opts = compatPickerOptions([openrouter({ allowedModels: ['z-ai/glm-5.3-flash'] })]);
    expect(opts.map((o) => o.id)).toEqual([GLM]);
  });

  it('negative control: without an allow-list every discovered model is offered (today\'s behaviour)', () => {
    expect(compatPickerOptions([openrouter()])).toHaveLength(3);
    expect(compatPickerOptions([openrouter({ allowedModels: [] })])).toHaveLength(3);
  });

  it('falls back to the default model when nothing was discovered, and skips disabled endpoints', () => {
    expect(endpointPickerModels(openrouter({ availableModels: [] }))).toEqual(['z-ai/glm-5.3-flash']);
    expect(compatPickerOptions([openrouter({ enabled: false })])).toEqual([]);
  });

  it('names a selection the allow-list excludes, and only that', () => {
    const eps = [openrouter({ allowedModels: ['z-ai/glm-5.3-flash'] })];
    expect(compatModelNotAllowed('compat:openrouter:anthropic/claude-opus-5.5', eps)).toEqual({
      model: 'anthropic/claude-opus-5.5',
      endpointName: 'OpenRouter',
    });
    expect(compatModelNotAllowed(GLM, eps)).toBeNull();
    expect(compatModelNotAllowed('compat:openrouter:anthropic/claude-opus-5.5', [openrouter()])).toBeNull();
    expect(compatModelNotAllowed('claude-opus-5-5', eps)).toBeNull();
  });
});

describe('public demo: offered models only', () => {
  const demo = { demoMode: true, offeredModels: [GLM, 'compat:openrouter:inclusionai/ling-3.0-flash-vl'] };

  it('reads /api/config: demo fields only when demoMode is true', () => {
    expect(readPublicModelConfig({ deploymentMode: 'team', demoMode: true, offeredModels: [GLM, 7, ''] })).toEqual({
      demoMode: true,
      offeredModels: [GLM],
    });
    expect(readPublicModelConfig({ demoMode: false, offeredModels: [GLM] })).toEqual({ demoMode: false, offeredModels: [] });
    expect(readPublicModelConfig({ deploymentMode: 'solo' })).toEqual({ demoMode: false, offeredModels: [] });
    expect(readPublicModelConfig(null)).toEqual({ demoMode: false, offeredModels: [] });
  });

  it('moves a stale selection (the built-in default a new browser starts with) to the first offered model', () => {
    expect(demoModelCorrection('claude-opus-5-5', demo)).toBe(GLM);
    expect(demoModelCorrection('compat:openrouter:anthropic/claude-opus-5.5', demo)).toBe(GLM);
  });

  it('leaves an offered selection alone, and changes nothing outside a demo', () => {
    expect(demoModelCorrection('compat:openrouter:inclusionai/ling-3.0-flash-vl', demo)).toBeNull();
    expect(demoModelCorrection('claude-opus-5-5', { demoMode: false, offeredModels: [] })).toBeNull();
    expect(demoModelCorrection('claude-opus-5-5', null)).toBeNull();
    // A demo that names no models restricts nothing (the server default runs).
    expect(pickerRestrictedToOffered({ demoMode: true, offeredModels: [] })).toBe(false);
    expect(demoModelCorrection('claude-opus-5-5', { demoMode: true, offeredModels: [] })).toBeNull();
  });

  it('labels offered models: compat by bare model + endpoint name, built-in by its label', () => {
    const opts = offeredPickerOptions([GLM, 'claude-sonnet-5', 'compat:other:m1'], [openrouter()], [
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    ]);
    expect(opts).toEqual([
      { id: GLM, label: 'z-ai/glm-5.3-flash', detail: 'OpenRouter' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', detail: null },
      { id: 'compat:other:m1', label: 'm1', detail: 'other' },
    ]);
  });
});

describe('loadPublicModelConfig', () => {
  beforeEach(() => {
    resetPublicModelConfigCache();
    vi.restoreAllMocks();
  });

  it('fetches /api/config once and caches the answer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ demoMode: true, offeredModels: [GLM] }), { status: 200 }),
    );
    expect(await loadPublicModelConfig()).toEqual({ demoMode: true, offeredModels: [GLM] });
    expect(await loadPublicModelConfig()).toEqual({ demoMode: true, offeredModels: [GLM] });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('/api/config');
  });

  it('a failed fetch reads as "not a demo" and is retried next time', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'));
    expect(await loadPublicModelConfig()).toEqual({ demoMode: false, offeredModels: [] });
    spy.mockResolvedValueOnce(new Response(JSON.stringify({ demoMode: true, offeredModels: [GLM] }), { status: 200 }));
    expect(await loadPublicModelConfig()).toEqual({ demoMode: true, offeredModels: [GLM] });
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('what a compat model is not offered', () => {
  const all: ThinkingLevel[] = ['quick', 'think', 'think_hard', 'investigate', 'plan_first', 'deep_investigate'];

  it('the two revelation-chain levels are unavailable on compat and move to Think Hard', () => {
    expect(all.filter((l) => thinkingLevelUnavailable(l, GLM))).toEqual(['investigate', 'deep_investigate']);
    expect(compatThinkingFallback('deep_investigate', GLM)).toBe('think_hard');
    expect(compatThinkingFallback('investigate', GLM)).toBe('think_hard');
    expect(compatThinkingFallback('think', GLM)).toBeNull();
  });

  it('negative control: every level stays available on Claude, the subscription engine and Ollama', () => {
    for (const model of ['claude-opus-5-5', 'sdk:claude-opus-5-5', 'ollama:qwen3.5:9b', undefined]) {
      expect(all.filter((l) => thinkingLevelUnavailable(l, model))).toEqual([]);
      expect(compatThinkingFallback('deep_investigate', model)).toBeNull();
    }
  });

  it('web search and multi-agent are unavailable on compat only', () => {
    expect(webSearchUnavailable(GLM)).toBe(true);
    expect(multiAgentUnavailable(GLM)).toBe(true);
    expect(webSearchUnavailable('claude-opus-5-5')).toBe(false);
    expect(multiAgentUnavailable('claude-opus-5-5')).toBe(false);
  });
});
