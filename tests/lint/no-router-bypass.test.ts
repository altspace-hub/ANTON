/**
 * no-router-bypass.test.ts — every model call goes through the router (Wave 6, track I).
 *
 * CLAUDE.md: "Every LLM call site follows the Settings default … Never construct
 * an Anthropic client in a new route: go through streamChat / callChat." Sites
 * that build their own client, call the API-bound `callSync`, pick
 * `getAnthropicUtilityModel`, or dispatch a literal `claude-*` id bill the
 * metered API key silently whenever ANTHROPIC_API_KEY is present — whatever
 * the user chose in Settings — and fail outright on a key-less install.
 *
 * This guard scans server/**\/*.ts line by line (comment lines skipped) for:
 *   get-client      getClient(
 *   new-anthropic   new Anthropic(  /  new (await import('@anthropic-ai/sdk')).default(
 *   call-sync       callSync(
 *   anthropic-util  getAnthropicUtilityModel( / getAnthropicUtilityModelSync(
 *   literal-model   model: 'claude-…'  /  model = 'claude-…'  /  modelId: 'claude-…'
 *
 * The files that ARE the router or the engines are not scanned (EXCLUDED).
 * Everything else that still matches must be named in ALLOW_LIST with the rule
 * and the reason — so the list is the inventory of what is left to port, and an
 * entry is deleted when its file is ported. A stale entry (the file no longer
 * matches) is reported as a warning rather than a failure: other tracks port
 * listed files in parallel and must not be blocked by this list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep } from 'path';

type Rule = 'get-client' | 'new-anthropic' | 'call-sync' | 'anthropic-util' | 'literal-model';

interface AllowEntry {
  file: string;
  rules: Rule[];
  reason: string;
}

/**
 * The remaining exceptions. Paths are repo-relative with forward slashes.
 * Delete an entry when its file is ported.
 */
export const ALLOW_LIST: AllowEntry[] = [
  {
    file: 'server/services/photo-id-service.ts',
    rules: ['get-client'],
    reason: 'Vision. callChat messages carry text only and the sdk: engine is text-only, so the photo call keeps the shared API client — behind resolveVisionModel, which refuses with "needs an API-key Claude model for images" unless the resolved model is the Anthropic API with a key.',
  },
  {
    file: 'server/routes/claude.ts',
    rules: ['new-anthropic', 'call-sync'],
    reason: 'The module-run route (another track owns it): a dynamic Anthropic import for one legacy branch and a callSync site, not yet ported.',
  },
  {
    file: 'server/routes/civic.ts',
    rules: ['literal-model'],
    reason: 'streamToResponse with a literal Sonnet 4.5 id — API-bound streaming, not yet ported to streamChat.',
  },
  {
    file: 'server/routes/grow.ts',
    rules: ['literal-model'],
    reason: 'streamToResponse with a literal Sonnet 4.5 id — API-bound streaming, not yet ported to streamChat.',
  },
  {
    file: 'server/routes/procure.ts',
    rules: ['literal-model'],
    reason: 'streamToResponse with a literal Sonnet 4.5 id — API-bound streaming, not yet ported to streamChat.',
  },
  {
    file: 'server/routes/school.ts',
    rules: ['literal-model'],
    reason: 'Pupil-facing chat/marking calls with literal Sonnet ids (streamToResponse and streamChat) — not yet ported to tiers.',
  },
  {
    file: 'server/routes/batch.ts',
    rules: ['literal-model'],
    reason: 'Request-body default model id; the first route maps it through mapModelToProvider at dispatch, the second does not yet.',
  },
  {
    file: 'server/mcp/openexpert-mcp.ts',
    rules: ['literal-model'],
    reason: 'MCP stdio server default model (Sonnet 4.5) — separate process, not yet resolved from Settings tiers.',
  },
  {
    file: 'server/services/deliberation-engine.ts',
    rules: ['literal-model'],
    reason: 'Panel tier configuration (Opus / Sonnet / Haiku roles), mapped through mapModelToProvider at dispatch.',
  },
  {
    file: 'server/services/multi-agent-orchestrator.ts',
    rules: ['literal-model'],
    reason: 'Agent tier configuration (Haiku roles), mapped through mapModelToProvider at dispatch.',
  },
  {
    file: 'server/services/token-estimator.ts',
    rules: ['literal-model'],
    reason: 'False positive: `model in MODEL_CAPABILITIES ? model : \'claude-sonnet-4-6\'` is a pricing-table fallback key, never dispatched.',
  },
];

/** The router, the engines and the boot wiring — the places that are allowed to hold a client. */
const EXCLUDED: RegExp[] = [
  /^server\/services\/claude-client\.ts$/,
  /^server\/services\/claude-sdk-client\.ts$/,
  /^server\/services\/provider-router\.ts$/,
  /^server\/services\/unified-llm-client[^/]*\.ts$/,
  /^server\/services\/model-adapter\.ts$/,
  /^server\/services\/chroma-client\.ts$/,
  // Constructs the client it passes to the legacy routes it mounts.
  /^server\/index\.ts$/,
];

const RULES: Array<{ rule: Rule; re: RegExp }> = [
  { rule: 'get-client', re: /\bgetClient\s*\(/ },
  { rule: 'new-anthropic', re: /new\s+Anthropic\s*\(|new\s*\(\s*await\s+import\(\s*['"]@anthropic-ai\/sdk['"]\s*\)\s*\)\.default\s*\(/ },
  { rule: 'call-sync', re: /\bcallSync\s*\(/ },
  { rule: 'anthropic-util', re: /\bgetAnthropicUtilityModel(?:Sync)?\s*\(/ },
  { rule: 'literal-model', re: /\b(?:model|modelId)\s*[:=]\s*['"`]claude-/ },
];

/** Where the helpers are defined rather than called. */
const DEFINITION = /\bfunction\s+(?:getClient|callSync|getAnthropicUtilityModel(?:Sync)?)\s*\(/;
const COMMENT_LINE = /^\s*(?:\/\/|\*|\/\*)/;

export interface Violation {
  file: string;
  line: number;
  rule: Rule;
  text: string;
}

export function scanSource(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.replace(/\r\n/g, '\n').split('\n').forEach((text, i) => {
    if (COMMENT_LINE.test(text) || DEFINITION.test(text)) return;
    for (const { rule, re } of RULES) {
      if (re.test(text)) out.push({ file, line: i + 1, rule, text: text.trim() });
    }
  });
  return out;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') && !d.name.endsWith('.d.ts') ? [join(dir, d.name)] : [],
  );
}

function repoPath(abs: string): string {
  return relative(process.cwd(), abs).split(sep).join('/');
}

function scanServer(): Violation[] {
  return walk(join(process.cwd(), 'server'))
    .map((abs) => ({ abs, file: repoPath(abs) }))
    .filter(({ file }) => !EXCLUDED.some((re) => re.test(file)))
    .flatMap(({ abs, file }) => scanSource(file, readFileSync(abs, 'utf8')));
}

function isAllowed(v: Violation): boolean {
  return ALLOW_LIST.some((a) => a.file === v.file && a.rules.includes(v.rule));
}

describe('the scanner itself', () => {
  // A guard whose rules never fire passes for the wrong reason.
  it.each([
    ['get-client', 'const anthropic = getClient();'],
    ['new-anthropic', 'const client = new Anthropic({ apiKey });'],
    ['new-anthropic', "const c = new (await import('@anthropic-ai/sdk')).default({ apiKey: k });"],
    ['call-sync', 'const r = await callSync({ model, thinking, system, messages });'],
    ['anthropic-util', 'model: await getAnthropicUtilityModel(db),'],
    ['anthropic-util', 'const m = getAnthropicUtilityModelSync();'],
    ['literal-model', "model: 'claude-sonnet-4-6',"],
    ['literal-model', "const model = 'claude-sonnet-4-5-20250929';"],
    ['literal-model', "{ modelId: 'claude-haiku-4-5-20251001', role: 'x' }"],
  ] as Array<[Rule, string]>)('flags %s in: %s', (rule, line) => {
    expect(scanSource('fixture.ts', line).map((v) => v.rule)).toContain(rule);
  });

  it.each([
    ['a comment line', '// getClient() used to be called here'],
    ['a JSDoc line', " * model: 'claude-sonnet-4-6' was the old default"],
    ['a helper definition', 'export async function callSync(config: SyncCallConfig) {'],
    ['a routed call', "const r = await callChat({ tier: 'medium', system, messages, db });"],
    ['a tool name', "if (project.target_tool === 'claude-code') {"],
    ['a mapped tier id', "model: mapModelToProvider(options.model),"],
  ])('does not flag %s', (_label, line) => {
    expect(scanSource('fixture.ts', line)).toEqual([]);
  });
});

describe('no router bypass in server code', () => {
  const violations = scanServer();

  it('every model call outside the router goes through callChat / streamChat, or is an allow-listed exception', () => {
    const offenders = violations
      .filter((v) => !isAllowed(v))
      .map((v) => `${v.file}:${v.line}  [${v.rule}]  ${v.text}`);
    expect(offenders).toEqual([]);
  });

  it('every allow-list entry names a reason and a real server file', () => {
    const files = new Set(walk(join(process.cwd(), 'server')).map(repoPath));
    for (const entry of ALLOW_LIST) {
      expect(entry.reason.length, entry.file).toBeGreaterThan(20);
      expect(entry.rules.length, entry.file).toBeGreaterThan(0);
      expect(files.has(entry.file), `${entry.file} does not exist`).toBe(true);
    }
  });

  it('reports allow-list entries that no longer match (delete them)', () => {
    const stale = ALLOW_LIST.flatMap((a) => a.rules
      .filter((rule) => !violations.some((v) => v.file === a.file && v.rule === rule))
      .map((rule) => `${a.file} [${rule}]`));
    if (stale.length > 0) {
      console.warn(`[no-router-bypass] stale allow-list entries — the file was ported, delete the entry: ${stale.join(', ')}`);
    }
    expect(Array.isArray(stale)).toBe(true);
  });
});
