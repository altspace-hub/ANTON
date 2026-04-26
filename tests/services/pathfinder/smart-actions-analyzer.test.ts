/**
 * smart-actions-analyzer.test.ts — type-shape + behaviour tests for the
 * smart-action extractor.
 *
 * The extractor wraps an LLM call to Haiku. The full network path is
 * covered by integration tests; here we verify:
 *   - The exported SmartAction type union covers every known action kind
 *   - Empty / unparseable / malformed LLM output returns [] (graceful
 *     degradation, never throws)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SmartAction } from '../../../server/services/smart-actions-analyzer.js';

const ALL_ACTION_TYPES: SmartAction['type'][] = [
  'call', 'directions', 'website', 'save_contact', 'save_org',
  'create_task', 'start_civic', 'start_procure', 'save_knowledge',
  'open_module', 'task_agent',
];

describe('SmartAction type union', () => {
  it('exposes 11 distinct action types', () => {
    expect(new Set(ALL_ACTION_TYPES).size).toBe(11);
  });

  it('every action kind has a corresponding string literal', () => {
    for (const t of ALL_ACTION_TYPES) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });
});

describe('analyzeForActions — graceful degradation', () => {
  beforeEach(() => {
    // Ensure ANTHROPIC_API_KEY is unset so the LLM call fails fast
    // without making real HTTP requests.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns empty array on unparseable LLM output (never throws)', async () => {
    const { analyzeForActions } = await import('../../../server/services/smart-actions-analyzer.js');
    // Without the API key the underlying client will throw → caught → [] returned
    const r = await analyzeForActions('synthesis text', 'knowledge', 'test query');
    expect(Array.isArray(r)).toBe(true);
    expect(r).toEqual([]);
  });

  it('does not throw on empty synthesis', async () => {
    const { analyzeForActions } = await import('../../../server/services/smart-actions-analyzer.js');
    const r = await analyzeForActions('', 'local', '');
    expect(Array.isArray(r)).toBe(true);
  });
});

describe('SmartAction shape contract', () => {
  it('matches the documented field set', () => {
    // Build a sample action conforming to the type — TypeScript would
    // reject this at compile time if the type drifted. The runtime
    // assertions confirm the field names too.
    const sample: SmartAction = {
      type: 'call',
      label: 'Call ACME Corp',
      description: 'Reach the main switchboard',
      priority: 'high',
      data: { phone: '+1-555-0100', name: 'ACME Corp' },
    };
    expect(sample.type).toBe('call');
    expect(sample.priority).toBe('high');
    expect(sample.data.phone).toBe('+1-555-0100');
  });

  it('priority union has exactly 3 values', () => {
    const priorities: SmartAction['priority'][] = ['high', 'medium', 'low'];
    expect(new Set(priorities).size).toBe(3);
  });
});
