/**
 * provenance.test.ts — Wave 1 (2026-09-16): the pure helpers behind the
 * Provenance panel. The panel only renders what these return, so the
 * contract lives here: the caveat parser finds the model's own "Sources,
 * assumptions and what was not checked" section (and its older cousins), the
 * layer label map names every key routes/claude.ts writes — old and new —
 * without hiding unknown ones, and the transparency level sets what opens by
 * default without ever capping what can be opened.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCaveatSections, isCaveatHeading, layerLabel, LAYER_LABELS, atomArmFromLayerKey,
  defaultExpansion, PROVENANCE_SECTION_ORDER, engineLabel, costLabel, normalizeCostBasis,
  shortHash, normalizeTransparencyLevel, summaryLine,
} from '../../src/lib/provenance';

describe('parseCaveatSections — the model\'s own caveats', () => {
  it('finds the new contract section and stops at the next heading of the same level', () => {
    const md = [
      '## Findings', 'Body of findings.', '',
      '## Sources, assumptions and what was not checked',
      '1. **Sources used** — AMLR Art. 16.',
      '2. **Assumptions** — the entity is in scope.',
      '3. **Not checked** — national transposition.',
      '4. **Confidence** — medium.',
      '',
      '## Appendix', 'Should not be captured.',
    ].join('\n');
    const out = parseCaveatSections(md);
    expect(out).toHaveLength(1);
    expect(out[0].heading).toBe('Sources, assumptions and what was not checked');
    expect(out[0].body).toContain('Sources used');
    expect(out[0].body).toContain('Confidence');
    expect(out[0].body).not.toContain('Appendix');
    expect(out[0].body).not.toContain('Should not be captured');
  });

  it('does not report a caveat heading nested inside a section already captured', () => {
    const md = [
      '## Sources, assumptions and what was not checked',
      '### Sources used', 'AMLR.',
      '### Not checked', 'Transposition.',
      '## Next steps', 'Do things.',
    ].join('\n');
    const out = parseCaveatSections(md);
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain('### Sources used');
    expect(out[0].body).toContain('Transposition.');
  });

  it('recognises the older section names at any ATX level, case-insensitively', () => {
    const md = [
      '# Report', 'Intro.',
      '### ASSUMPTION REGISTER', '- A1', '',
      '### Uncertainty & Caveats', '- U1', '',
      '### Sources used', '- S1', '',
      '### Recommendations', 'R1',
    ].join('\n');
    const out = parseCaveatSections(md);
    expect(out.map((s) => s.heading)).toEqual(['ASSUMPTION REGISTER', 'Uncertainty & Caveats', 'Sources used']);
    expect(out[1].body).toBe('- U1');
    expect(out[2].body).toBe('- S1');
  });

  it('a deeper caveat heading under a captured section stays part of that section (not reported twice)', () => {
    const md = ['### Uncertainty & Caveats', '- U1', '', '#### Sources used', '- S1', '', '### Recommendations', 'R1'].join('\n');
    const out = parseCaveatSections(md);
    expect(out.map((s) => s.heading)).toEqual(['Uncertainty & Caveats']);
    expect(out[0].body).toContain('#### Sources used');
    expect(out[0].body).not.toContain('R1');
  });

  it('treats a whole-line bold label as a heading and strips a trailing colon', () => {
    const md = ['Some text.', '', '**Not checked:**', 'Local case law.', '', '**Next steps**', 'Nothing.'].join('\n');
    const out = parseCaveatSections(md);
    expect(out).toHaveLength(1);
    expect(out[0].heading).toBe('Not checked');
    expect(out[0].body).toBe('Local case law.');
  });

  it('ignores headings inside fenced code and returns [] for empty or caveat-free text', () => {
    const md = ['## Findings', '```', '## Not checked', 'this is code', '```', 'Done.'].join('\n');
    expect(parseCaveatSections(md)).toEqual([]);
    expect(parseCaveatSections('')).toEqual([]);
    expect(parseCaveatSections('## Findings\nAll good.')).toEqual([]);
  });

  it('keeps an empty body when the heading is present but nothing was written under it', () => {
    const out = parseCaveatSections('## Sources used\n\n## Findings\nx');
    expect(out).toEqual([{ heading: 'Sources used', body: '' }]);
  });

  it('isCaveatHeading accepts and/& variants and rejects ordinary headings', () => {
    expect(isCaveatHeading('Sources, assumptions & what was not checked')).toBe(true);
    expect(isCaveatHeading('What was not checked')).toBe(true);
    expect(isCaveatHeading('Limitations')).toBe(true);
    expect(isCaveatHeading('Executive Summary')).toBe(false);
    expect(isCaveatHeading('Sources of funds')).toBe(false);
  });
});

describe('layerLabel — friendly names, nothing hidden', () => {
  it('labels the current assembly keys', () => {
    expect(layerLabel('composed_full')).toMatch(/whole string/i);
    expect(layerLabel('layer2_foundation')).toBe('Layer 2 · Foundation');
    expect(layerLabel('layer4_module_prompt')).toBe('Layer 4 · Module prompt');
    expect(layerLabel('layer7_provenance_contract')).toBe('Layer 7 · Provenance contract');
    expect(layerLabel('layer9_reference_documents')).toBe('Layer 9 · Reference documents');
  });

  it('still labels the pre-2026-09-16 keys older run records carry', () => {
    for (const k of ['composed_static_layers_1_3_cached', 'layer6_atoms', 'goals_values', 'business_context', 'layer6_knowledge_system_additions', 'layer6_reference_documents']) {
      expect(layerLabel(k)).not.toBe(k);
    }
  });

  it('passes an unknown key through untouched so a new server layer still renders', () => {
    expect(layerLabel('layer42_something_new')).toBe('layer42_something_new');
  });

  it('turns the A/B arm tag into a labelled arm', () => {
    expect(atomArmFromLayerKey('atom_ab_arm_holdout')).toBe('holdout');
    expect(atomArmFromLayerKey('layer2e_atoms')).toBeNull();
    expect(layerLabel('atom_ab_arm_injected')).toBe('Memory A/B arm · injected');
  });

  it('covers every key the coordinator listed on 2026-09-16', () => {
    const listed = [
      'composed_full', 'composed_static_cached', 'composed_dynamic', 'layer2_foundation', 'layer2a_org_context',
      'layer2b_knowledge_pack', 'layer2c_roaring', 'layer2d_dowjones', 'layer2e_atoms', 'layer3_area_context',
      'layer4_module_prompt', 'layer4c_guardrail', 'layer4a_resume_context', 'layer4b_project_context',
      'layer4_5_goals_values', 'layer0_profile', 'layer1_creativity', 'layer1_tone', 'layer1_emoji',
      'layer1_communications', 'layer1_output_language', 'layer5_personas', 'layer6_skills', 'layer6b_output_format',
      'layer7_provenance_contract', 'layer7a_multi_perspective', 'layer7b_structured_reasoning',
      'layer7c_structure_reference', 'layer7e_reference_output', 'layer7d_transparency', 'layer7_plan_first',
      'layer7_5_business_context', 'layer8_knowledge_additions', 'layer9_reference_documents',
    ];
    for (const k of listed) expect(LAYER_LABELS[k], k).toBeTruthy();
  });
});

describe('defaultExpansion — depth follows the transparency level, never a ceiling', () => {
  it('level 0 opens nothing (summary line only)', () => {
    expect(Object.values(defaultExpansion(0)).every((v) => v === false)).toBe(true);
  });

  it('level 1 opens Engine, Sources, Memory and the caveats — not Layers or the exact prompt', () => {
    expect(defaultExpansion(1)).toEqual({ engine: true, sources: true, memory: true, caveats: true, layers: false, prompt: false });
  });

  it('level 2 opens everything', () => {
    expect(Object.values(defaultExpansion(2)).every((v) => v === true)).toBe(true);
  });

  it('every section is a key at every level (so the user can always open it)', () => {
    for (const l of [0, 1, 2] as const) {
      expect(Object.keys(defaultExpansion(l)).sort()).toEqual([...PROVENANCE_SECTION_ORDER].sort());
    }
  });

  it('normalises a missing or odd level to 0', () => {
    expect(normalizeTransparencyLevel(undefined)).toBe(0);
    expect(normalizeTransparencyLevel('2')).toBe(0);
    expect(normalizeTransparencyLevel(2)).toBe(2);
  });
});

describe('engine / cost / summary labels', () => {
  it('names the engines and passes unknown ids through', () => {
    expect(engineLabel('anthropic_sdk')).toBe('Claude subscription');
    expect(engineLabel('openai_codex')).toBe('Codex subscription');
    expect(engineLabel('anthropic')).toBe('Anthropic API');
    expect(engineLabel('mistral')).toBe('mistral');
    expect(engineLabel(undefined)).toBe('Not recorded');
  });

  it('never reads a NULL cost as free', () => {
    expect(costLabel('plan', null)).toMatch(/plan usage/i);
    expect(costLabel('unknown', null)).toMatch(/unknown pricing/i);
    expect(costLabel('free', null)).toMatch(/free/i);
    expect(costLabel('list', 0.0123)).toBe('$0.0123 (list price)');
    expect(costLabel('list', null)).toMatch(/not recorded/i);
    expect(costLabel(null, null)).toBe('Not recorded');
    expect(normalizeCostBasis('plan')).toBe('plan');
    expect(normalizeCostBasis('gratis')).toBeNull();
  });

  it('shortens hashes and builds the summary line', () => {
    expect(shortHash('abcdef0123456789abcdef')).toBe('abcdef012345…');
    expect(shortHash(undefined)).toBe('—');
    expect(summaryLine({ engine: 'anthropic_sdk', sourceCount: 3, layerCount: 9 })).toBe('Claude subscription · 3 sources · 9 layers');
    expect(summaryLine({ engine: 'anthropic', sourceCount: 1, layerCount: null })).toBe('Anthropic API · 1 source');
  });
});
