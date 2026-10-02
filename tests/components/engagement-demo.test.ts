/**
 * engagement-demo.test.ts — the Engagement Task pages on a public demo
 * (src/components/engagement/engagement-demo.ts):
 *
 *   - a visitor is held to the demo's models: an unpinned engagement starts on
 *     the demo's default when it is offered, else on the first offered model;
 *     an admin and an ordinary server are not restricted (negative controls);
 *   - a refusal shows the server's own sentence (with the budget's reason),
 *     never the raw JSON body;
 *   - a stored resource URL becomes a link only when it is http(s): a
 *     javascript: or data: URL would run in the browser of whoever opens the
 *     engagement, an admin included.
 */
import { describe, it, expect } from 'vitest';
import { engagementDemoFor, responseErrorMessage, safeHttpUrl, errorText } from '../../src/components/engagement/engagement-demo';
import { DEMO_OFF, type DemoConfig } from '../../src/lib/demo-config';

const demo = (over: Partial<DemoConfig> = {}): DemoConfig => ({
  ...DEMO_OFF,
  demoMode: true,
  offeredModels: ['compat:openrouter:z-ai/glm-5.3', 'compat:openrouter:moonshotai/kimi-k2.6'],
  defaultModel: 'compat:openrouter:z-ai/glm-5.3',
  ...over,
});

describe('engagementDemoFor', () => {
  it('holds a visitor to the demo\'s models, starting on its default', () => {
    expect(engagementDemoFor(demo(), 'analyst')).toEqual({
      restricted: true,
      offeredModels: ['compat:openrouter:z-ai/glm-5.3', 'compat:openrouter:moonshotai/kimi-k2.6'],
      demoModel: 'compat:openrouter:z-ai/glm-5.3',
    });
  });

  it('starts on the first offered model when the default is not offered', () => {
    expect(engagementDemoFor(demo({ defaultModel: 'claude-opus-5-5' }), 'viewer').demoModel).toBe('compat:openrouter:z-ai/glm-5.3');
  });

  it('negative controls: an admin on the demo and anyone on an ordinary server are not restricted', () => {
    expect(engagementDemoFor(demo(), 'admin')).toEqual({ restricted: false, offeredModels: [], demoModel: '' });
    expect(engagementDemoFor(DEMO_OFF, 'analyst').restricted).toBe(false);
  });
});

describe('responseErrorMessage', () => {
  const res = (status: number, body: string) => new Response(body, { status });

  it('shows the server\'s sentence, with the budget\'s reason', async () => {
    expect(await responseErrorMessage(res(409, JSON.stringify({ error: 'This engagement needs web search.', code: 'WEB_SEARCH_UNAVAILABLE' }))))
      .toBe('This engagement needs web search.');
    expect(await responseErrorMessage(res(429, JSON.stringify({ error: 'Budget limit exceeded', reason: 'Monthly budget exceeded (600/100 tokens)' }))))
      .toBe('Budget limit exceeded: Monthly budget exceeded (600/100 tokens)');
  });

  it('never shows an HTML page or a JSON body without a sentence', async () => {
    expect(await responseErrorMessage(res(502, '<html><body>Bad gateway</body></html>'))).toBe('Request failed (502)');
    expect(await responseErrorMessage(res(500, JSON.stringify({ detail: 'x' })))).toBe('Request failed (500)');
  });

  it('errorText drops the "Error: " prefix', () => {
    expect(errorText(new Error('Upload failed'))).toBe('Upload failed');
    expect(errorText('plain')).toBe('plain');
  });
});

describe('safeHttpUrl', () => {
  it('links http(s) only', () => {
    expect(safeHttpUrl('https://eur-lex.europa.eu/eli/reg/2024/1624/oj')?.hostname).toBe('eur-lex.europa.eu');
    expect(safeHttpUrl('http://example.org/x')?.protocol).toBe('http:');
    expect(safeHttpUrl('javascript:alert(document.cookie)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});
