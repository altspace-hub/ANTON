/**
 * settings-module-access-page.test.ts — the Settings page carries the
 * "Module access" card and the daily cap on subscription runs, and reaches
 * the server through the typed api helpers (Wave 6 track F).
 *
 * The client build cannot be imported from vitest's node environment, so
 * this reads the two sources as text: the labels must be on the page, the
 * page must call the helpers (not a hand-rolled fetch), the module-access
 * card must sit inside the team tab (team mode only), and api.ts must
 * export every helper against the right route.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'src', 'lib', 'api.ts'), 'utf8');

function section(start: string, end: string): string {
  const a = page.indexOf(start);
  expect(a, `missing marker: ${start}`).toBeGreaterThan(-1);
  const b = page.indexOf(end, a);
  expect(b, `missing marker: ${end}`).toBeGreaterThan(a);
  return page.slice(a, b);
}

describe('Settings.tsx — Module access card', () => {
  const card = section('Module access (Wave 6 track F)', '{/* Compliance Policy tab — admin only */}');

  it('has the title, the preview sentence, the empty state and the add-rule button', () => {
    expect(card).toContain("'Module access'");
    expect(card).toContain("'Analyst can run {{analyst}} of {{total}} modules; viewer {{viewer}} of {{total}}.'");
    expect(card).toContain("'No rules yet — every role can run every module.'");
    expect(card).toContain("'Add rule'");
    expect(card).toContain("'Remove rule'");
  });

  it('offers role, scope (area / module / everyone), effect and note controls with labels', () => {
    expect(card).toContain('htmlFor="module-access-role"');
    expect(card).toContain('htmlFor="module-access-scope"');
    expect(card).toContain('htmlFor="module-access-area"');
    expect(card).toContain('htmlFor="module-access-module"');
    expect(card).toContain('htmlFor="module-access-effect"');
    expect(card).toContain('htmlFor="module-access-note"');
    expect(card).toMatch(/<option value="viewer">/);
    expect(card).toMatch(/<option value="analyst">/);
    expect(card).not.toMatch(/<option value="admin">/);
    expect(card).toMatch(/<option value="area">/);
    expect(card).toMatch(/<option value="module">/);
    expect(card).toMatch(/<option value="all">/);
    expect(card).toMatch(/<option value="deny">/);
    expect(card).toMatch(/<option value="allow">/);
  });

  it('sits inside the team tab, which only renders for an admin in team mode', () => {
    const teamTab = page.indexOf("{activeTab === 'team' && isAdmin && (");
    const card = page.indexOf('Module access (Wave 6 track F)');
    const compliance = page.indexOf("{activeTab === 'compliance-policy' && isAdmin && (");
    expect(teamTab).toBeGreaterThan(-1);
    expect(card).toBeGreaterThan(teamTab);
    expect(compliance).toBeGreaterThan(card);
    expect(page).toMatch(/const isAdmin = authUser\?\.role === 'admin' && isTeamMode;/);
  });

  it('says it applies in team mode', () => {
    expect(card).toContain('Applies in team mode.');
  });

  it('loads rules and the preview through the helpers, adds and removes through them', () => {
    expect(page).toMatch(/import \{[^}]*\bfetchModuleAccessRules\b[^}]*\} from '@\/lib\/api'/);
    expect(page).toMatch(/import \{[^}]*\baddModuleAccessRule\b[^}]*\} from '@\/lib\/api'/);
    expect(page).toMatch(/import \{[^}]*\bremoveModuleAccessRule\b[^}]*\} from '@\/lib\/api'/);
    expect(page).toMatch(/import \{[^}]*\bfetchModuleAccessPreview\b[^}]*\} from '@\/lib\/api'/);
    expect(page).toMatch(/Promise\.all\(\[fetchModuleAccessRules\(\), fetchModuleAccessPreview\(\)\]\)/);
    expect(page).toMatch(/await addModuleAccessRule\(\{/);
    expect(page).toMatch(/await removeModuleAccessRule\(id\)/);
    expect(page).not.toContain("'/api/module-access");
  });

  it('is loaded when the team tab opens for an admin', () => {
    expect(page).toMatch(/if \(activeTab === 'team' && isAdmin\) \{\s*loadModuleAccess\(\);/);
  });

  it('every text in the card is at least 14px (text-sm), no text-xs', () => {
    expect(card).not.toContain('text-xs');
  });
});

describe('Settings.tsx — daily cap on subscription runs', () => {
  const block = section('Engine guards (Wave 6 track A2)', '{/* OpenAI */}');

  it('has the label, the "runs today" readout and an accessible name', () => {
    expect(block).toContain("'Daily cap on subscription runs'");
    expect(block).toContain("'{{count}} runs today'");
    expect(block).toContain('htmlFor="sdk-daily-run-cap"');
    expect(block).toContain('id="sdk-daily-run-cap"');
    expect(block).toContain('aria-describedby="sdk-runs-today"');
    expect(block).toMatch(/type="number"/);
    expect(block).toContain("'unlimited'");
  });

  it('saves on blur and on Enter, through updateEngineGuards, reverting on failure', () => {
    expect(block).toContain('onBlur={handleSaveEngineGuards}');
    expect(block).toMatch(/onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\) e\.currentTarget\.blur\(\); \}\}/);
    expect(page).toMatch(/import \{[^}]*\bfetchEngineGuards\b[^}]*\bupdateEngineGuards\b[^}]*\} from '@\/lib\/api'/);
    expect(page).toMatch(/await fetchEngineGuards\(\)/);
    expect(page).toMatch(/await updateEngineGuards\(\{ sdkDailyRunCap \}\)/);
    const save = section('async function handleSaveEngineGuards()', 'function handleSetThinking(');
    expect(save).toMatch(/catch \(err\) \{\s*revert\(\);/);
    expect(page).not.toContain("'/api/settings/engine-guards'");
  });

  it('is loaded on mount', () => {
    expect(page).toMatch(/loadMemoryGovernance\(\);\s*loadEngineGuards\(\);/);
  });

  it('empty means unlimited: the input is text state and blank maps to null', () => {
    const save = section('async function handleSaveEngineGuards()', 'function handleSetThinking(');
    expect(save).toMatch(/if \(trimmed === ''\) \{\s*sdkDailyRunCap = null;/);
  });

  it('refuses a cap below 1 before asking the server (which accepts an integer of at least 1)', () => {
    const save = section('async function handleSaveEngineGuards()', 'function handleSetThinking(');
    expect(save).toMatch(/if \(!Number\.isInteger\(n\) \|\| n < 1\) \{\s*revert\(\);/);
    expect(block).toContain('min={1}');
  });
});

describe('api.ts — module-access and engine-guards helpers', () => {
  it('exports the module-access helpers against the /module-access routes', () => {
    expect(api).toMatch(/export interface ModuleAccessRule \{/);
    expect(api).toMatch(/export interface NewModuleAccessRule \{/);
    expect(api).toMatch(/export interface ModuleAccessVerdict \{/);
    expect(api).toMatch(/export interface ModuleAccessPreview \{/);
    expect(api).toMatch(/export async function fetchModuleAccessRules\(\): Promise<ModuleAccessRule\[\]>/);
    expect(api).toMatch(/export async function addModuleAccessRule\(rule: NewModuleAccessRule\): Promise<ModuleAccessRule>/);
    expect(api).toMatch(/export async function removeModuleAccessRule\(id: string\): Promise<void>/);
    expect(api).toMatch(/export async function checkModuleAccess\(moduleId: string \| null, areaId\?: string \| null\): Promise<ModuleAccessVerdict>/);
    expect(api).toMatch(/export async function fetchModuleAccessPreview\(\): Promise<ModuleAccessPreview>/);
    expect(api.match(/\$\{API_BASE\}\/module-access\/rules`/g)).toHaveLength(2);
    expect(api).toContain('${API_BASE}/module-access/rules/${encodeURIComponent(id)}');
    expect(api).toContain('${API_BASE}/module-access/check');
    expect(api).toContain('${API_BASE}/module-access/preview');
  });

  // The engine-guards helpers belong to the engine-guards track; the page only
  // consumes them. Pin the contract the page relies on, and that there is
  // exactly one copy (a duplicate once crept in from two tracks).
  it('the engine-guards helpers the page consumes exist once, with the agreed shape', () => {
    expect(api.match(/export interface EngineGuards \{/g)).toHaveLength(1);
    const iface = api.slice(api.indexOf('export interface EngineGuards {'));
    const body = iface.slice(0, iface.indexOf('\n}'));
    expect(body).toMatch(/sdkDailyRunCap: number \| null;/);
    expect(body).toMatch(/sdkRunsToday: number;/);
    expect(api.match(/export async function fetchEngineGuards\(\): Promise<EngineGuards>/g)).toHaveLength(1);
    expect(api.match(/export async function updateEngineGuards\(patch: \{ sdkDailyRunCap: number \| null \}\): Promise<EngineGuards>/g)).toHaveLength(1);
    expect(api.match(/\$\{API_BASE\}\/settings\/engine-guards`/g)).toHaveLength(2);
  });
});
