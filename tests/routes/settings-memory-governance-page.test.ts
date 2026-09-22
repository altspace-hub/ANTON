/**
 * settings-memory-governance-page.test.ts — the Settings page carries the
 * "Memory & governance" section and reaches the server through the two typed
 * api helpers (Wave 4b).
 *
 * The client build cannot be imported from vitest's node environment, so this
 * reads the two sources as text: the three labels the owner asked for must be
 * on the page, the page must call fetchMemoryGovernance / updateMemoryGovernance
 * (not a hand-rolled fetch), and api.ts must export both plus the
 * MemoryGovernance interface against the one route.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'src', 'pages', 'Settings.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'src', 'lib', 'api.ts'), 'utf8');

describe('Settings.tsx — Memory & governance section', () => {
  it('has the section title and the three control labels', () => {
    expect(page).toContain("'Memory & governance'");
    expect(page).toContain("'Memory injection into Work runs'");
    expect(page).toContain("'Require professional sign-off before export'");
    expect(page).toContain("'Extract structured data automatically after every run'");
  });

  it('offers the three injection modes, Auto explained', () => {
    expect(page).toContain("'Auto — inject once memory has earned its place'");
    expect(page).toMatch(/<option value="on">/);
    expect(page).toMatch(/<option value="off">/);
  });

  it('shows the gate reason verbatim under the select', () => {
    expect(page).toMatch(/memoryGovernance\.atomInjection\.reason/);
  });

  it('loads through fetchMemoryGovernance and saves through updateMemoryGovernance', () => {
    expect(page).toMatch(/import \{[^}]*\bfetchMemoryGovernance\b[^}]*\bupdateMemoryGovernance\b[^}]*\} from '@\/lib\/api'/);
    expect(page).toMatch(/await fetchMemoryGovernance\(\)/);
    expect(page).toMatch(/await updateMemoryGovernance\(patch\)/);
    // No hand-rolled request to the route from the page.
    expect(page).not.toContain("'/api/settings/memory-governance'");
  });

  it('the two toggles are switches with an accessible name', () => {
    const start = page.indexOf('Memory & governance (Wave 4b)');
    expect(start).toBeGreaterThan(-1);
    const end = page.indexOf('{/* Cost-effective mode (plan 2.17) */}', start);
    expect(end).toBeGreaterThan(start);
    const section = page.slice(start, end);
    expect(section.match(/role="switch"/g)).toHaveLength(2);
    expect(section).toContain('aria-labelledby="oversight-blocks-export-label"');
    expect(section).toContain('aria-labelledby="structured-extraction-auto-label"');
    expect(section).toContain('htmlFor="memory-injection-mode"');
  });
});

describe('api.ts — memory-governance helpers', () => {
  it('exports the interface and both helpers against the one route', () => {
    expect(api).toMatch(/export interface MemoryGovernance \{/);
    expect(api).toMatch(/export interface MemoryGovernancePatch \{/);
    expect(api).toMatch(/export async function fetchMemoryGovernance\(\): Promise<MemoryGovernance>/);
    expect(api).toMatch(/export async function updateMemoryGovernance\(patch: MemoryGovernancePatch\): Promise<MemoryGovernance>/);
    expect(api.match(/\$\{API_BASE\}\/settings\/memory-governance`/g)).toHaveLength(2);
  });

  it('the earlier atom-injection helpers the dashboard uses are still exported', () => {
    expect(api).toMatch(/export async function fetchAtomInjectionStatus\(\)/);
    expect(api).toMatch(/export async function setAtomInjectionMode\(/);
  });
});
