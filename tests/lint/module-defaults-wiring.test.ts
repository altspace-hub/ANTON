/**
 * module-defaults-wiring.test.ts — the module page applies the person's
 * last-used settings, attaches the jurisdiction pack as a removable chip, and
 * the hook records each successful module run (Wave 6 track H, 2026-09-17).
 *
 * Static guards over the three client files, in the style of
 * resume-panel-mount.test.ts: the page and the hook are React code the unit
 * runner cannot mount, so the wiring is pinned at source level.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Line endings normalised: with core.autocrlf=true a Windows checkout has CRLF,
// and the patterns below match literal newline sequences.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const page = read('src/pages/ModulePage.tsx');
const hook = read('src/hooks/useClaude.ts');
const api = read('src/lib/api.ts');

describe('src/lib/api.ts — the two helpers hit the mounted routes', () => {
  it('fetchModuleDefaults GETs /user-module-defaults/:moduleId and never throws', () => {
    const fn = /export async function fetchModuleDefaults\(moduleId: string\)[\s\S]*?\n\}/.exec(api)?.[0] ?? '';
    expect(fn).toMatch(/fetchWithAuth\(`\$\{API_BASE\}\/user-module-defaults\/\$\{encodeURIComponent\(moduleId\)\}`\)/);
    expect(fn).toMatch(/catch \{[\s\S]*return null;/);
  });

  it('recordModuleUse POSTs /user-module-defaults/:moduleId/used with the run config', () => {
    const fn = /export async function recordModuleUse\(moduleId: string, use: ModuleUseRecord\)[\s\S]*?\n\}/.exec(api)?.[0] ?? '';
    expect(fn).toMatch(/\/user-module-defaults\/\$\{encodeURIComponent\(moduleId\)\}\/used`/);
    expect(fn).toMatch(/method: 'POST'/);
    expect(fn).toMatch(/body: JSON\.stringify\(use\)/);
    expect(api).toMatch(/export interface ModuleUseRecord \{\s*outputFormats: string\[\];\s*thinking: string;\s*creativity: string;\s*guidedInputs: Record<string, unknown>;/);
  });
});

describe('src/pages/ModulePage.tsx — the profile drives the defaults', () => {
  it('imports fetchModuleDefaults and fetches on module open, keyed on the same trigger as the init effect', () => {
    expect(page).toMatch(/import \{[^}]*fetchModuleDefaults[^}]*\} from '@\/lib\/api';/);
    const effect = /fetchModuleDefaults\(moduleId\)\.then\(\(res\) => \{[\s\S]*?\n  \}, \[moduleId, sessionParam, isDynamicModule\]\);/.exec(page)?.[0];
    expect(effect).toBeDefined();
    // a resumed session is left alone
    const before = page.slice(0, page.indexOf('fetchModuleDefaults(moduleId).then'));
    expect(before.slice(-600)).toMatch(/if \(sessionParam\) return;/);
  });

  it('applies last-used formats / thinking / creativity only while the user has not touched them', () => {
    const effect = /fetchModuleDefaults\(moduleId\)\.then\(\(res\) => \{[\s\S]*?\n    \}\);/.exec(page)?.[0] ?? '';
    expect(effect).toMatch(/if \(defaults && !userTouchedConfigRef\.current\) \{/);
    expect(effect).toMatch(/setSelectedOutputFormats\(defaults\.outputFormats\)/);
    expect(effect).toMatch(/if \(isThinkingLevel\(defaults\.thinking\)\) setThinking\(defaults\.thinking\)/);
    expect(effect).toMatch(/if \(isCreativityLevel\(defaults\.creativity\)\) setCreativity\(defaults\.creativity\)/);
    expect(effect).toMatch(/setLastSettingsApplied\(true\)/);
    // every user-driven change of the three marks the config touched and hides the note
    expect(page).toMatch(/const markConfigTouched = \(\) => \{\s*userTouchedConfigRef\.current = true;\s*setLastSettingsApplied\(false\);/);
    expect(page).toMatch(/<ThinkingControls value=\{thinking\} onChange=\{\(level\) => \{ markConfigTouched\(\); setThinking\(level\); \}\}/);
    expect(page).toMatch(/onCreativityChange=\{\(level\) => \{ markConfigTouched\(\); setCreativity\(level\); \}\}/);
    expect(page).toMatch(/<OutputFormatSelector selected=\{selectedOutputFormats\} onChange=\{\(formats\) => \{ markConfigTouched\(\); setSelectedOutputFormats\(formats\); \}\}/);
  });

  it('shows the quiet one-line note, 14px, as a status region, right above the format selector', () => {
    const note = /\{lastSettingsApplied && \(\s*<p className="[^"]*text-sm[^"]*" role="status" aria-live="polite">\s*Using your last settings for this module — change them anytime\s*<\/p>\s*\)\}\s*<OutputFormatSelector/;
    expect(page).toMatch(note);
  });

  it('prefills only guided fields that are still empty, reading the live store', () => {
    const effect = /fetchModuleDefaults\(moduleId\)\.then\(\(res\) => \{[\s\S]*?\n    \}\);/.exec(page)?.[0] ?? '';
    expect(effect).toMatch(/const currentInputs = useConfigStore\.getState\(\)\.moduleInputs;/);
    expect(effect).toMatch(/for \(const \[fieldId, value\] of Object\.entries\(prefill\)\) \{\s*if \(!isEmptyGuidedValue\(currentInputs\[fieldId\]\)\) continue;/);
    expect(effect).toMatch(/if \(changed\) setModuleInputs\(filled\);/);
    expect(page).toMatch(/const isEmptyGuidedValue = \(v: unknown\): boolean =>\s*v === undefined \|\| v === null \|\| v === '' \|\| \(Array\.isArray\(v\) && v\.length === 0\);/);
  });

  it('attaches the jurisdiction pack once, unless already selected or dismissed this session', () => {
    const effect = /fetchModuleDefaults\(moduleId\)\.then\(\(res\) => \{[\s\S]*?\n    \}\);/.exec(page)?.[0] ?? '';
    expect(effect).toMatch(/if \(jurisdictionSkill && !jurisdictionPackDismissedRef\.current\) \{/);
    expect(effect).toMatch(/if \(!currentSkills\.includes\(jurisdictionSkill\.id\)\) setSelectedSkills\(\[\.\.\.currentSkills, jurisdictionSkill\.id\]\);/);
    expect(effect).toMatch(/setJurisdictionPack\(jurisdictionSkill\);/);
    // the effect does not depend on selectedSkills, so removing the pack never re-adds it
    expect(effect).not.toMatch(/\[moduleId, sessionParam, isDynamicModule, selectedSkills\]/);
    // both refs reset when the module changes
    const head = page.slice(page.indexOf('useEffect(() => {\n    if ((!module && isDynamicModule !== true) || !moduleId) return;\n    userTouchedConfigRef'));
    expect(head).toMatch(/userTouchedConfigRef\.current = false;\s*jurisdictionPackDismissedRef\.current = false;/);
  });

  it('renders the removable "Jurisdiction pack: <name>" chip with an aria-label, and removal dismisses for the session', () => {
    const chip = /\{jurisdictionPack && selectedSkills\.includes\(jurisdictionPack\.id\) && \([\s\S]*?<SkillAttacher/.exec(page)?.[0] ?? '';
    expect(chip).toContain('Jurisdiction pack: {jurisdictionPack.name}');
    expect(chip).toMatch(/aria-label=\{`Remove jurisdiction pack \$\{jurisdictionPack\.name\}`\}/);
    expect(chip).toMatch(/text-sm/);
    expect(chip).toMatch(/jurisdictionPackDismissedRef\.current = true;\s*setSelectedSkills\(selectedSkills\.filter\(\(id\) => id !== jurisdictionPack\.id\)\);\s*setJurisdictionPack\(null\);/);
    expect(page.match(/Jurisdiction pack: \{jurisdictionPack\.name\}/g)?.length).toBe(1);
  });
});

describe('src/hooks/useClaude.ts — a successful module run is recorded', () => {
  it('imports recordModuleUse and fires it after a run that produced an answer, with the config as sent', () => {
    expect(hook).toMatch(/import \{[^}]*recordModuleUse[^}]*\} from '@\/lib\/api';/);
    const tail = /const succeeded = !failed && responseText\.length > 0;[\s\S]*?return succeeded;/.exec(hook)?.[0] ?? '';
    expect(tail).toMatch(/if \(succeeded && moduleId && moduleId !== 'open-chat' && !lens\) \{\s*void recordModuleUse\(moduleId, \{\s*outputFormats: selectedOutputFormats,\s*thinking: thinkingOverride \?\? thinking,\s*creativity,\s*guidedInputs: moduleInputs,\s*\}\);/);
    // fire-and-forget: never awaited, never in the return value
    expect(tail).not.toMatch(/await recordModuleUse/);
  });

  it('negative control: a failed turn, open chat and a lens run record nothing', () => {
    const tail = /const succeeded = !failed && responseText\.length > 0;[\s\S]*?return succeeded;/.exec(hook)?.[0] ?? '';
    // PromptPage sets moduleId to 'open-chat'; a bare `moduleId` guard would record every chat turn
    expect(read('src/pages/PromptPage.tsx')).toMatch(/setModule\('open-chat'\)/);
    expect(tail).not.toMatch(/if \(succeeded && moduleId\) \{/);
    expect(tail).not.toMatch(/recordModuleUse\(lens/);
    expect(hook.match(/recordModuleUse\(/g)?.length).toBe(1);
  });
});

describe('src/pages/ModulePage.tsx — the auto-attached pack does not crowd out the module suggestions', () => {
  it('the "Suggested for this module" banner ignores the jurisdiction pack, and Apply keeps it', () => {
    expect(page).toMatch(/suggestedSkills\.length > 0 && selectedSkills\.filter\(\(id\) => id !== jurisdictionPack\?\.id\)\.length === 0 && \(/);
    expect(page).toMatch(/onClick=\{\(\) => setSelectedSkills\(\[\.\.\.new Set\(\[\.\.\.selectedSkills, \.\.\.suggestedSkills\]\)\]\)\}/);
    // negative control: the old gate (any selected skill hides the banner) and the replacing Apply are gone
    expect(page).not.toMatch(/\(!selectedSkills \|\| selectedSkills\.length === 0\)/);
    expect(page).not.toMatch(/onClick=\{\(\) => setSelectedSkills\(suggestedSkills\)\}/);
  });
});
