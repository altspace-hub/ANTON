/**
 * model-endpoint-form.test.ts — the OpenAI-compatible endpoint form in
 * Settings: the JSON fields (extra headers, extra request body), the output
 * ceiling, the allowed-models list and the OpenRouter showcase defaults.
 *
 * Public showcase (2026-09-25): an admin pins OpenRouter to the EU
 * zero-retention providers through the extra body and limits the endpoint to
 * one model. A typo in the JSON, or a body that names its own `model`, must be
 * stopped in the form, not sent.
 */
import { describe, it, expect } from 'vitest';
import {
  buildEndpointPayload,
  describeModelMeta,
  jsonForEditor,
  normaliseAllowedModels,
  openRouterAttributionHeaders,
  parseExtraBodyInput,
  parseExtraHeadersInput,
  parseMaxOutputTokensInput,
  parsePriceInput,
  OPENROUTER_EU_ZDR_EXTRA_BODY,
  type EndpointFormValues,
} from '../../src/lib/model-endpoint-form';

const form = (over: Partial<EndpointFormValues> = {}): EndpointFormValues => ({
  slug: 'openrouter',
  displayName: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: '',
  defaultModel: 'z-ai/glm-5.3-flash',
  contextWindow: '131072',
  notes: '',
  extraHeaders: '',
  extraBody: '',
  allowedModels: [],
  maxOutputTokens: '',
  inputPricePerMillion: '',
  outputPricePerMillion: '',
  ...over,
});

describe('extra request body', () => {
  it('accepts a JSON object; blank is {}', () => {
    expect(parseExtraBodyInput('{"provider":{"zdr":true}}')).toEqual({ ok: true, value: { provider: { zdr: true } } });
    expect(parseExtraBodyInput('   ')).toEqual({ ok: true, value: {} });
  });

  it('refuses broken JSON, arrays and scalars', () => {
    expect(parseExtraBodyInput('{"provider": ').ok).toBe(false);
    expect(parseExtraBodyInput('[1,2]').ok).toBe(false);
    expect(parseExtraBodyInput('"x"').ok).toBe(false);
    expect(parseExtraBodyInput('null').ok).toBe(false);
  });

  it('refuses the keys ANTON sets itself — model / models would route around the allowed-models list', () => {
    for (const key of ['model', 'models', 'messages', 'stream']) {
      const res = parseExtraBodyInput(JSON.stringify({ [key]: 'x' }));
      expect(res.ok, key).toBe(false);
      if (!res.ok) expect(res.error).toContain(`"${key}"`);
    }
  });
});

describe('extra headers', () => {
  it('accepts text-valued headers', () => {
    expect(parseExtraHeadersInput('{"HTTP-Referer":"https://a.example","X-OpenRouter-Title":"ANTON"}')).toEqual({
      ok: true,
      value: { 'HTTP-Referer': 'https://a.example', 'X-OpenRouter-Title': 'ANTON' },
    });
  });

  it('refuses a non-text value, a bad header name and an Authorization header (stored as plain text)', () => {
    expect(parseExtraHeadersInput('{"X-N": 3}').ok).toBe(false);
    expect(parseExtraHeadersInput('{"Bad Header": "x"}').ok).toBe(false);
    const auth = parseExtraHeadersInput('{"authorization": "Bearer sk-or-..."}');
    expect(auth.ok).toBe(false);
    if (!auth.ok) expect(auth.error).toMatch(/API key field/);
  });
});

describe('max output tokens', () => {
  it('blank is no ceiling; a whole number up to the server limit is kept; anything else is refused', () => {
    expect(parseMaxOutputTokensInput('')).toEqual({ ok: true, value: null });
    expect(parseMaxOutputTokensInput('16000')).toEqual({ ok: true, value: 16000 });
    expect(parseMaxOutputTokensInput('1000000')).toEqual({ ok: true, value: 1_000_000 });
    expect(parseMaxOutputTokensInput('1000001').ok).toBe(false);
    expect(parseMaxOutputTokensInput('0').ok).toBe(false);
    expect(parseMaxOutputTokensInput('-5').ok).toBe(false);
    expect(parseMaxOutputTokensInput('12.5').ok).toBe(false);
  });
});

describe('prices', () => {
  it('blank is no price; 0 or more is kept; a negative or non-number is refused', () => {
    expect(parsePriceInput('', 'Input price')).toEqual({ ok: true, value: null });
    expect(parsePriceInput('0.15', 'Input price')).toEqual({ ok: true, value: 0.15 });
    expect(parsePriceInput('0', 'Input price')).toEqual({ ok: true, value: 0 });
    expect(parsePriceInput('-1', 'Input price').ok).toBe(false);
    expect(parsePriceInput('cheap', 'Output price').ok).toBe(false);
  });
});

describe('request body for POST / PATCH', () => {
  it('a new endpoint carries the slug and every new field', () => {
    const res = buildEndpointPayload(
      form({
        apiKey: 'sk-or-test',
        extraBody: JSON.stringify(OPENROUTER_EU_ZDR_EXTRA_BODY),
        extraHeaders: '{"HTTP-Referer":"https://demo.example"}',
        allowedModels: [' z-ai/glm-5.3-flash ', 'z-ai/glm-5.3-flash', ''],
        maxOutputTokens: '16000',
        inputPricePerMillion: '0.15',
        outputPricePerMillion: '0.5',
      }),
      false,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      slug: 'openrouter',
      apiKey: 'sk-or-test',
      contextWindow: 131072,
      extraBody: { provider: { only: ['inceptron'], zdr: true, data_collection: 'deny' } },
      extraHeaders: { 'HTTP-Referer': 'https://demo.example' },
      allowedModels: ['z-ai/glm-5.3-flash'],
      maxOutputTokens: 16000,
      inputPricePerMillion: 0.15,
      outputPricePerMillion: 0.5,
    });
  });

  it('an edit leaves the slug to the path and the stored key alone, and sends emptied fields so they clear', () => {
    const res = buildEndpointPayload(form(), true);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).not.toHaveProperty('slug');
    expect(res.value).not.toHaveProperty('apiKey');
    expect(res.value).toMatchObject({
      allowedModels: [],
      extraBody: {},
      extraHeaders: {},
      maxOutputTokens: null,
      inputPricePerMillion: null,
      outputPricePerMillion: null,
    });
  });

  it('refuses the whole payload when one field is broken', () => {
    expect(buildEndpointPayload(form({ extraBody: '{oops' }), false).ok).toBe(false);
    expect(buildEndpointPayload(form({ extraHeaders: '[]' }), false).ok).toBe(false);
    expect(buildEndpointPayload(form({ maxOutputTokens: 'lots' }), false).ok).toBe(false);
    expect(buildEndpointPayload(form({ outputPricePerMillion: '-2' }), false).ok).toBe(false);
  });
});

describe('OpenRouter showcase defaults', () => {
  it('pins GLM to Inceptron alone, zero retention and no data collection (NextBit dropped 2026-09-26)', () => {
    expect(OPENROUTER_EU_ZDR_EXTRA_BODY).toEqual({
      provider: { only: ['inceptron'], zdr: true, data_collection: 'deny' },
    });
    // NextBit keeps request data up to 90 days and computes outside the EEA.
    expect(JSON.stringify(OPENROUTER_EU_ZDR_EXTRA_BODY)).not.toMatch(/nextbit/i);
  });

  it('attribution headers name the page origin and ANTON', () => {
    expect(openRouterAttributionHeaders('https://demo.example')).toEqual({
      'HTTP-Referer': 'https://demo.example',
      'X-OpenRouter-Title': 'ANTON by openEXPERT',
    });
  });
});

describe('small helpers', () => {
  it('normalises the allow-list', () => {
    expect(normaliseAllowedModels([' a ', 'b', 'a', ''])).toEqual(['a', 'b']);
  });

  it('shows {} as a blank editor and objects as indented JSON', () => {
    expect(jsonForEditor({})).toBe('');
    expect(jsonForEditor(undefined)).toBe('');
    expect(jsonForEditor({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('describes what the endpoint reported about a model', () => {
    expect(
      describeModelMeta({
        contextLength: 1_310_720,
        maxCompletionTokens: 131_072,
        inputModalities: ['text', 'image'],
        reasoning: { mandatory: true, supportedEfforts: ['low', 'high', 'max'], defaultEffort: 'max' },
      }),
    ).toBe('1.31M context · 131K max output · always reasons (low/high/max) · reads images');
    expect(describeModelMeta(undefined)).toBe('');
    expect(describeModelMeta({ contextLength: 32_768 })).toBe('33K context');
  });
});
