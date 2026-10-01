/**
 * demo-model-choices.test.ts — the pure helpers behind the features opened to
 * public-demo visitors on 2026-10-01, where every model is an OpenRouter one
 * (compat:openrouter:…) and the demo offers three: GLM 5.3 (the default),
 * DeepSeek V4 Flash and Kimi K2.6.
 *
 *   - the second opinion ("Rerun with…", Review) starts on an offered model
 *     other than the one that wrote the answer (Kimi K2.6 reviews GLM 5.3);
 *   - an AI Council's members are spread over the offered models instead of
 *     all collapsing onto one;
 *   - the Brief runs on an offered model;
 *   - Settings › Double-check offers every model an endpoint allows;
 *   - a project scaffold missing a list never takes the page down;
 *   - pages name a model by its display name.
 *
 * Each has its negative control: an ordinary server (no offered list) keeps
 * the old behaviour.
 */
import { describe, it, expect } from 'vitest';
import { secondOpinionModel, demoRunModel, scoringSentence } from '../../src/lib/demo-model-names';
import { fitCouncilModels, nextCouncilModel } from '../../src/lib/council-models';
import { compatModelChoices } from '../../src/lib/compat-model-policy';
import { normaliseScaffold } from '../../src/lib/project-scaffold';
import { modelLabel, hasListPrice } from '../../src/lib/model-labels';
import { DEMO_OFF, parseDemoConfig } from '../../src/lib/demo-config';

const GLM = 'compat:openrouter:z-ai/glm-5.3';
const DEEPSEEK = 'compat:openrouter:deepseek/deepseek-v4-flash-0731';
const KIMI = 'compat:openrouter:moonshotai/kimi-k2.6';
const OFFERED = [GLM, DEEPSEEK, KIMI];

describe('secondOpinionModel', () => {
  it('starts a second opinion on an offered model other than the one that answered', () => {
    expect(secondOpinionModel(GLM, OFFERED)).toBe(KIMI);
    expect(secondOpinionModel(KIMI, OFFERED)).toBe(GLM);
    expect(secondOpinionModel(DEEPSEEK, OFFERED)).toBe(KIMI);
    for (const answer of OFFERED) expect(secondOpinionModel(answer, OFFERED)).not.toBe(answer);
  });

  it('prefers another maker, then the offered order, for models it has no rank for', () => {
    const a = 'compat:openrouter:z-ai/glm-6';
    const b = 'compat:openrouter:z-ai/glm-6-air';
    const c = 'compat:openrouter:qwen/qwen-4';
    expect(secondOpinionModel(a, [a, b, c])).toBe(c);
    expect(secondOpinionModel(a, [a, b])).toBe(b);
  });

  it('negative control: with nothing else offered (an ordinary server) there is no pick', () => {
    expect(secondOpinionModel(GLM, [])).toBeNull();
    expect(secondOpinionModel(GLM, [GLM])).toBeNull();
  });
});

describe('demoRunModel (the 5-minute Brief)', () => {
  const demo = parseDemoConfig({ demoMode: true, offeredModels: OFFERED, defaultModel: GLM });

  it('keeps an offered pick and moves anything else to the demo default', () => {
    expect(demoRunModel(demo, KIMI)).toBe(KIMI);
    expect(demoRunModel(demo, 'claude-opus-5-5')).toBe(GLM);
  });

  it('negative control: an ordinary server runs the pick as it is', () => {
    expect(demoRunModel(DEMO_OFF, 'claude-opus-5-5')).toBe('claude-opus-5-5');
  });
});

describe('scoringSentence', () => {
  it('names the scorer by its display name', () => {
    const cfg = parseDemoConfig({ demoMode: true, answersScored: true, scorerModel: KIMI });
    expect(scoringSentence(cfg)).toContain('the model Kimi K2.6 rates its quality (the Trust Score shown under the answer)');
    expect(scoringSentence(cfg)).toContain('the first 3,000 characters of the answer');
  });

  it('says nothing is scored when nothing is', () => {
    expect(scoringSentence(parseDemoConfig({ demoMode: true, answersScored: false }))).toBe('This demo does not score answers.');
  });
});

describe('fitCouncilModels (AI Council)', () => {
  const members = [
    { id: 'a', role: 'devils-advocate', model: 'claude-opus-5-5' },
    { id: 'b', role: 'defender', model: 'claude-sonnet-4-6' },
    { id: 'c', role: 'risk-expert', model: 'claude-sonnet-4-6' },
  ];

  it('spreads the members over the offered models, default first, and seats the chair on the default', () => {
    const fitted = fitCouncilModels(members, 'claude-opus-5-5', OFFERED, GLM);
    expect(fitted.members.map((m) => m.model)).toEqual([GLM, DEEPSEEK, KIMI]);
    expect(new Set(fitted.members.map((m) => m.model)).size).toBe(3);
    expect(fitted.chairModel).toBe(GLM);
    // The roles and ids are untouched.
    expect(fitted.members.map((m) => [m.id, m.role])).toEqual(members.map((m) => [m.id, m.role]));
  });

  it('keeps a member already on an offered model, and fills the others with the least-used ones', () => {
    const fitted = fitCouncilModels([{ id: 'a', model: KIMI }, { id: 'b', model: 'claude-opus-5-5' }], KIMI, OFFERED, GLM);
    expect(fitted.members.map((m) => m.model)).toEqual([KIMI, GLM]);
    expect(fitted.chairModel).toBe(KIMI);
  });

  it('a new member starts on the offered model used least', () => {
    expect(nextCouncilModel([{ model: GLM }, { model: DEEPSEEK }], OFFERED, 'claude-sonnet-4-6')).toBe(KIMI);
  });

  it('negative control: an ordinary server (no offered list) keeps the configured models', () => {
    const fitted = fitCouncilModels(members, 'claude-opus-5-5', [], null);
    expect(fitted.members.map((m) => m.model)).toEqual(members.map((m) => m.model));
    expect(fitted.chairModel).toBe('claude-opus-5-5');
    expect(nextCouncilModel(members, [], 'claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
  });
});

describe('compatModelChoices (Settings › Double-check)', () => {
  const openrouter = {
    slug: 'openrouter',
    displayName: 'OpenRouter',
    defaultModel: 'z-ai/glm-5.3',
    allowedModels: ['z-ai/glm-5.3', 'deepseek/deepseek-v4-flash-0731', 'moonshotai/kimi-k2.6', '  '],
  };

  it('offers every allowed model of an endpoint, the default first, each once', () => {
    expect(compatModelChoices([openrouter])).toEqual([
      { value: GLM, label: 'OpenRouter (z-ai/glm-5.3)' },
      { value: DEEPSEEK, label: 'OpenRouter (deepseek/deepseek-v4-flash-0731)' },
      { value: KIMI, label: 'OpenRouter (moonshotai/kimi-k2.6)' },
    ]);
  });

  it('negative control: an endpoint with no allow-list offers its default only, as before', () => {
    expect(compatModelChoices([{ slug: 'local', displayName: 'Local', defaultModel: 'llama-4' }]))
      .toEqual([{ value: 'compat:local:llama-4', label: 'Local (llama-4)' }]);
    expect(compatModelChoices([{ slug: 'none', displayName: 'None', defaultModel: null }])).toEqual([]);
  });
});

describe('normaliseScaffold (Projects › AI Scaffold)', () => {
  it('reads the full answer', () => {
    const s = normaliseScaffold({
      description: 'A review.',
      recommendedModules: [{ id: 'gap-analysis', reason: 'Finds gaps.' }],
      suggestedDeadlines: [{ title: 'Kick-off', dayOffset: 3 }],
      phases: [{ name: 'Scope', duration: '1 week', tasks: ['Interview', 7] }],
      successCriteria: ['Signed off'],
    });
    expect(s).toEqual({
      description: 'A review.',
      recommendedModules: [{ id: 'gap-analysis', reason: 'Finds gaps.' }],
      suggestedDeadlines: [{ title: 'Kick-off', dayOffset: 3 }],
      phases: [{ name: 'Scope', duration: '1 week', tasks: ['Interview'] }],
      successCriteria: ['Signed off'],
    });
  });

  it('never leaves a list missing: an answer without deadlines, and modules as bare ids, still reads', () => {
    const s = normaliseScaffold({ description: 'x', recommendedModules: ['gap-analysis', '', 4] });
    expect(s?.recommendedModules).toEqual([{ id: 'gap-analysis', reason: '' }]);
    expect(s?.suggestedDeadlines).toEqual([]);
    expect(s?.phases).toEqual([]);
    expect(s?.successCriteria).toEqual([]);
  });

  it('turns what is not an object into null', () => {
    for (const bad of [null, 'text', [1, 2], 7]) expect(normaliseScaffold(bad)).toBeNull();
  });
});

describe('modelLabel', () => {
  it('names a showcase model, a built-in one and an engine id', () => {
    expect(modelLabel(GLM)).toBe('GLM 5.3');
    expect(modelLabel(KIMI)).toBe('Kimi K2.6');
    expect(modelLabel('claude-opus-5-5')).toBe('Claude Opus 5.5');
    expect(modelLabel('sdk:claude-opus-5-5')).toBe('Claude Opus 5.5 (subscription)');
    expect(modelLabel(null)).toBe('unknown model');
  });

  it('knows which models have a list price (a compat model is priced per use)', () => {
    expect(hasListPrice('claude-opus-5-5')).toBe(true);
    expect(hasListPrice(GLM)).toBe(false);
  });
});
