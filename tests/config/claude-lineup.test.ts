/**
 * claude-lineup.test.ts — the API-path Claude lineup is one place.
 *
 * When Haiku 5.5 ships it replaces Haiku 4.5 as the utility model and the
 * Double-check (second-opinion) default. That move must be one line in
 * server/config/claude-lineup.ts plus the registry entries — so this file
 * fails when (a) a lineup id is missing from the registries, (b) a consumer
 * stops reading the lineup, or (c) a server file names the small-tier model
 * itself instead of reading CLAUDE_SMALL.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CLAUDE_LINEUP, CLAUDE_SMALL } from '../../server/config/claude-lineup.js';
import { MODEL_CAPABILITIES } from '../../server/config/model-capabilities.js';
import { MODEL_REGISTRY } from '../../server/types/modelAdapter.js';
import { TIER_MAP, mapModelToProvider } from '../../server/services/provider-router.js';
import { DEFAULT_UTILITY_MODEL } from '../../server/services/utility-model.js';
import { DEFAULT_VERIFIER_MODEL } from '../../server/services/verifier-model.js';
import { mapDepthToModel } from '../../server/services/portals/portal-llm-suggest.js';
import { resolveEngagementModelChoice } from '../../server/services/engagement-exec-model.js';

const SERVER_DIR = join(__dirname, '..', '..', 'server');

/** Files that may name the small-tier id literally: the registries that
 *  describe every model, the lineup itself, and type/validation lists that
 *  enumerate the models a legacy route accepts (they describe what exists,
 *  not which model a tier runs). */
const ALLOWED = new Set([
  'config/claude-lineup.ts',
  'config/model-capabilities.ts',
  'types/modelAdapter.ts',
  'services/claude-client.ts',
  'services/unified-llm-client.ts',
  'services/tabular-review-playbooks.ts',
  'routes/claude.ts',
  'mcp/openexpert-mcp.ts',
]);

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function filesNaming(id: string): string[] {
  return tsFiles(SERVER_DIR)
    .filter((f) => readFileSync(f, 'utf8').includes(`'${id}'`))
    .map((f) => relative(SERVER_DIR, f).split(sep).join('/'));
}

describe('Claude lineup', () => {
  it('every lineup id is a registered Anthropic model', () => {
    for (const id of Object.values(CLAUDE_LINEUP)) {
      expect(MODEL_CAPABILITIES[id]?.provider, id).toBe('anthropic');
      expect(MODEL_REGISTRY[id]?.provider, id).toBe('anthropic');
    }
  });

  it('the tier map, the utility default and the Double-check default read the lineup', () => {
    expect(TIER_MAP.anthropic).toEqual(CLAUDE_LINEUP);
    expect(DEFAULT_UTILITY_MODEL).toBe(CLAUDE_SMALL);
    expect(DEFAULT_VERIFIER_MODEL).toBe(CLAUDE_SMALL);
    expect(mapDepthToModel('simple')).toBe(CLAUDE_SMALL);
    expect(resolveEngagementModelChoice(null, 'quick', null)).toBe(CLAUDE_SMALL);
  });

  it('no server file names the small-tier model outside the registries and legacy type lists', () => {
    const offenders = filesNaming(CLAUDE_SMALL).filter((f) => !ALLOWED.has(f));
    expect(offenders, `read CLAUDE_SMALL from server/config/claude-lineup.ts instead: ${offenders.join(', ')}`).toEqual([]);
  });

  it('negative control — the scan does find the id where it is written', () => {
    // A scan that finds nothing passes the test above for the wrong reason.
    expect(filesNaming(CLAUDE_SMALL)).toContain('config/model-capabilities.ts');
    expect(filesNaming(CLAUDE_SMALL)).toContain('config/claude-lineup.ts');
  });
});

describe('an unlisted Claude id takes its family tier', () => {
  const KEYS = ['ANTHROPIC_API_KEY', 'MISTRAL_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DEFAULT_MODEL'] as const;
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    process.env.MISTRAL_API_KEY = 'test-key';
  });
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it('Haiku 5.5 maps to the small tier and Opus 5.5 to the large one (was: both medium)', () => {
    expect(mapModelToProvider('claude-haiku-5-5')).toBe('mistral-small-latest');
    expect(mapModelToProvider('claude-opus-5-5')).toBe('mistral-large-latest');
    expect(mapModelToProvider('claude-sonnet-5-5')).toBe('mistral-medium-latest');
  });
});
