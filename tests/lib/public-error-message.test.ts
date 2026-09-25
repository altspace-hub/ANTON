/**
 * public-error-message.test.ts — errors written for the person reach them in
 * production; everything else stays behind safeError().
 *
 * safeError() answers "An error occurred" in production. That is right for an
 * arbitrary error, but on the public demo it also hid "Today's AI budget for
 * this demo is used up" and "this model is not offered here". Those errors now
 * carry a `publicMessage`; publicErrorMessage() shows it, and a provider
 * failure is named without the endpoint URL or the provider's own error text.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { publicErrorMessage, safeError } from '../../server/lib/error-response.js';
import { SpendCapError } from '../../server/services/llm-spend.js';
import { CompatEndpointError } from '../../server/services/compat-endpoint.js';
import { CompatUpstreamError, COMPAT_BUDGET_EXHAUSTED_MESSAGE } from '../../server/services/adapters/openaiCompatibleAdapter.js';
import { CodingProjectCapError } from '../../server/services/coding-workspace.js';

const savedEnv = process.env.NODE_ENV;
beforeEach(() => { process.env.NODE_ENV = 'production'; });
afterEach(() => { process.env.NODE_ENV = savedEnv; });

describe('publicErrorMessage in production', () => {
  it('shows the sentences written for the visitor', () => {
    expect(publicErrorMessage(new SpendCapError('user', 'You have used today\'s AI budget.'))).toBe('You have used today\'s AI budget.');
    expect(publicErrorMessage(new CompatEndpointError('Model x is not offered here.'))).toBe('Model x is not offered here.');
    expect(publicErrorMessage(new CodingProjectCapError('You already have 20 projects.'))).toBe('You already have 20 projects.');
    expect(publicErrorMessage(new CompatUpstreamError(COMPAT_BUDGET_EXHAUSTED_MESSAGE, 'COMPAT_BUDGET_EXHAUSTED', 402)))
      .toBe(COMPAT_BUDGET_EXHAUSTED_MESSAGE);
  });

  it('names a provider failure without its URL or the provider\'s own text', () => {
    const err = new CompatUpstreamError(
      'OpenAI-compatible endpoint error (https://internal.example/v1): 500 — {"trace":"secret-stack"}',
      'COMPAT_HTTP_ERROR', 500,
    );
    const shown = publicErrorMessage(err);
    expect(shown).toContain('HTTP 500');
    expect(shown).not.toContain('internal.example');
    expect(shown).not.toContain('secret-stack');
  });

  it('keeps an internal endpoint error internal', () => {
    const err = new CompatEndpointError('Database adapter required … (setRouterDb was not called at boot)', 'This AI model is not available on this server right now.');
    expect(publicErrorMessage(err)).not.toContain('setRouterDb');
  });

  it('negative control: any other error is still generic, exactly as safeError', () => {
    const err = new Error('relation "users" does not exist at /srv/anton/server/db.ts:12');
    expect(publicErrorMessage(err)).toBe('An error occurred');
    expect(publicErrorMessage(err)).toBe(safeError(err));
  });
});
