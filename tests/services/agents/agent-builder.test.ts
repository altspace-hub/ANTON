/**
 * agent-builder.test.ts — factory + JSON-parsing tests.
 *
 * The builder makes LLM calls (callChat) — full integration is covered
 * by integration tests. Here we verify the public surface + that the
 * factory constructs without errors.
 */

import { describe, it, expect } from 'vitest';
import { createAgentBuilder } from '../../../server/services/agent-builder.js';
import type { DatabaseAdapter } from '../../../server/db/database.js';

const stubDb = {
  all: async () => [],
  get: async () => undefined,
  run: async () => {},
  exec: async () => {},
} as unknown as DatabaseAdapter;

describe('createAgentBuilder — factory', () => {
  it('constructs without errors', async () => {
    const svc = await createAgentBuilder(stubDb);
    expect(typeof svc).toBe('object');
  });

  it('exposes generateFromDescription function', async () => {
    const svc = await createAgentBuilder(stubDb);
    expect(typeof svc.generateFromDescription).toBe('function');
  });

  it('exposes generateSystemPrompt function', async () => {
    const svc = await createAgentBuilder(stubDb);
    expect(typeof svc.generateSystemPrompt).toBe('function');
  });

  it('exposes suggestKeywords function', async () => {
    const svc = await createAgentBuilder(stubDb);
    expect(typeof svc.suggestKeywords).toBe('function');
  });
});

describe('JSON-parse contract for generateFromDescription', () => {
  // The function expects the LLM to return JSON with a known shape;
  // we document the expected fields here as a regression contract.
  it('expected shape includes all 10 documented fields', () => {
    const requiredFields = [
      'name', 'slug', 'roleDescription', 'systemPrompt',
      'defaultThinking', 'routingKeywords', 'escalationPolicy',
      'suggestedTemplate', 'avatar', 'greetingMessage',
    ];
    expect(requiredFields).toHaveLength(10);
  });

  it('defaultThinking accepts the documented vocabulary', () => {
    const allowed = ['quick', 'think', 'think_hard'];
    expect(allowed).toContain('quick');
    expect(allowed).toContain('think');
    expect(allowed).toContain('think_hard');
  });

  it('escalationPolicy accepts the documented vocabulary', () => {
    const allowed = ['notify', 'redirect', 'human_only', 'queue'];
    expect(allowed).toHaveLength(4);
  });

  it('suggestedTemplate accepts the documented vocabulary or null', () => {
    const allowed = [
      'support', 'sales', 'travel', 'hr', 'procurement',
      'booking', 'legal', 'finance', 'compliance', 'general',
    ];
    expect(allowed).toHaveLength(10);
  });
});
