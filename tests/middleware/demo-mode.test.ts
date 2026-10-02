/**
 * demo-mode.test.ts — DEMO_MODE (public showcase, 2026-09-25): the switch,
 * the background jobs it forces off, the /api/config fields and the route
 * allowlist a non-admin visitor lives inside.
 *
 * The allowlist is driven through a real Express app: the middleware sits
 * where index.ts mounts it (after the user is known), and every route behind
 * it answers 200, so a 404 can only come from the allowlist. Every refusal
 * has a negative control — the same request outside demo mode, or from an
 * admin, gets through.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isDemoMode, demoModeStartupProblem, applyDemoModeOverrides, DEMO_FORCED_FLAGS,
  demoPublicConfig, demoEnabledPillars, demoSignupPolicy, demoAccountTtlDays,
  demoRouteAllowed, demoRouteRules, createDemoAllowlistMiddleware, demoModeWarnings,
  DEMO_TERMS_VERSION, DEFAULT_DEMO_HIDDEN_AREAS, DEFAULT_DEMO_HIDDEN_MODULES,
  demoPostAnswerCalls, demoQualityScoreOn, demoStructuredExtractionOn, qualityScorerModelEnv, WORK_ROUTES,
} from '../../server/middleware/demo-mode.js';
import { ENGAGEMENT_WORK_ROUTES } from '../../server/services/engagement-demo-routes.js';

const ENV_KEYS = [
  'DEMO_MODE', 'DEPLOYMENT_MODE', 'DEMO_ENABLED_PILLARS', 'DEMO_EXTRA_ROUTES', 'DEMO_OFFERED_MODELS',
  'DEMO_SIGNUP_CODE', 'DEMO_SIGNUP_OPEN', 'DEMO_ACCOUNT_TTL_DAYS',
];
const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
});

describe('the DEMO_MODE switch', () => {
  it('is on only for DEMO_MODE=true', () => {
    expect(isDemoMode({ DEMO_MODE: 'true' })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: ' TRUE ' })).toBe(true);
    expect(isDemoMode({ DEMO_MODE: 'false' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '1' })).toBe(false);
    expect(isDemoMode({})).toBe(false);
  });

  it('refuses to start a demo outside team mode (every solo visitor would be an admin)', () => {
    expect(demoModeStartupProblem({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'solo' })).toMatch(/requires DEPLOYMENT_MODE=team/);
    expect(demoModeStartupProblem({ DEMO_MODE: 'true' })).toMatch(/requires DEPLOYMENT_MODE=team/);
    expect(demoModeStartupProblem({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team', LLM_USER_HASH_SECRET: 'h'.repeat(64) })).toBeNull();
    expect(demoModeStartupProblem({ DEPLOYMENT_MODE: 'solo' })).toBeNull();
  });

  it('refuses to start with a spend cap it cannot read, naming the variable and not its value', () => {
    const team = { DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team', LLM_USER_HASH_SECRET: 'h'.repeat(64) };
    const comma = demoModeStartupProblem({ ...team, LLM_USER_DAILY_SPEND_CAP_USD: '0,25' });
    expect(comma).toMatch(/FATAL: LLM_USER_DAILY_SPEND_CAP_USD/);
    expect(comma).not.toContain('0,25');
    expect(demoModeStartupProblem({ ...team, LLM_DAILY_SPEND_CAP_USD: '$3' })).toMatch(/FATAL: LLM_DAILY_SPEND_CAP_USD/);
    // 0 means "no cap": it starts, with a warning.
    expect(demoModeStartupProblem({ ...team, LLM_DAILY_SPEND_CAP_USD: '0' })).toBeNull();
    expect(demoModeWarnings({ ...team, LLM_DAILY_SPEND_CAP_USD: '0' }).some((w) => w.startsWith('LLM_DAILY_SPEND_CAP_USD'))).toBe(true);
    // Negative control: readable caps start with no cap warning.
    const ok = { ...team, LLM_DAILY_SPEND_CAP_USD: '3', LLM_USER_DAILY_SPEND_CAP_USD: '0.25' };
    expect(demoModeStartupProblem(ok)).toBeNull();
    expect(demoModeWarnings(ok).some((w) => w.includes('SPEND_CAP'))).toBe(false);
  });

  it('forces Markets, the missions runner, the memory sweep and radar automation off, whatever the .env says', () => {
    const env: Record<string, string | undefined> = {
      DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team',
      MARKETS_SCHEDULE_DISABLED: 'false', MISSIONS_RUNNER_DISABLED: 'false', RADAR_AUTOMATION_DISABLED: 'true',
    };
    const changed = applyDemoModeOverrides(env);
    for (const [name, value] of Object.entries(DEMO_FORCED_FLAGS)) expect(env[name]).toBe(value);
    expect(changed.sort()).toEqual(['MARKETS_SCHEDULE_DISABLED', 'MEMORY_SWEEP_DISABLED', 'MISSIONS_RUNNER_DISABLED']);
    expect(Object.keys(DEMO_FORCED_FLAGS).sort()).toEqual(
      ['MARKETS_SCHEDULE_DISABLED', 'MEMORY_SWEEP_DISABLED', 'MISSIONS_RUNNER_DISABLED', 'RADAR_AUTOMATION_DISABLED'],
    );
  });

  it('changes nothing outside demo mode', () => {
    const env: Record<string, string | undefined> = { MARKETS_SCHEDULE_DISABLED: 'false' };
    expect(applyDemoModeOverrides(env)).toEqual([]);
    expect(env).toEqual({ MARKETS_SCHEDULE_DISABLED: 'false' });
  });

  it('index.ts applies the overrides before the first scheduler reads its flag, and refuses a solo demo', () => {
    const src = readFileSync(join(__dirname, '../../server/index.ts'), 'utf8');
    const overrides = src.indexOf('applyDemoModeOverrides()');
    const startup = src.indexOf('demoModeStartupProblem()');
    expect(startup).toBeGreaterThan(0);
    expect(overrides).toBeGreaterThan(0);
    // The radar boot block reads its flag through isRadarAutomationDisabled() (radar-fetcher.ts).
    for (const reader of ['startMemorySweep(db)', "process.env.MISSIONS_RUNNER_DISABLED === 'true'", 'process.env.MARKETS_SCHEDULE_DISABLED', 'if (isRadarAutomationDisabled())']) {
      const at = src.indexOf(reader);
      expect(at, reader).toBeGreaterThan(overrides);
    }
  });

  it('warns about a key or engine that would reach Claude, and about missing spend caps', () => {
    const w = demoModeWarnings({ DEMO_MODE: 'true', ANTHROPIC_API_KEY: 'sk-x', SDK_ENGINE_ENABLED: 'true', DEMO_ENABLED_PILLARS: 'work,bogus' });
    expect(w.join('\n')).toMatch(/ANTHROPIC_API_KEY/);
    expect(w.join('\n')).toMatch(/SDK_ENGINE_ENABLED/);
    expect(w.join('\n')).toMatch(/LLM_DAILY_SPEND_CAP_USD/);
    expect(w.join('\n')).toMatch(/"bogus"/);
    // No value is ever echoed.
    expect(w.join('\n')).not.toContain('sk-x');
    expect(demoModeWarnings({ ANTHROPIC_API_KEY: 'sk-x' })).toEqual([]);
  });
});

describe('/api/config demo fields', () => {
  it('is { demoMode: false } and nothing else outside demo mode', () => {
    expect(demoPublicConfig({ DEPLOYMENT_MODE: 'team', DEMO_OFFERED_MODELS: 'x', DEMO_SIGNUP_CODE: 'c' })).toEqual({ demoMode: false });
  });

  it('carries the offered models, pillars, sign-up state, retention and privacy path in demo mode', () => {
    const cfg = demoPublicConfig({
      DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team',
      DEMO_OFFERED_MODELS: ' compat:openrouter:z-ai/glm-5.3-flash , compat:openrouter:z-ai/glm-5.3-flash,compat:openrouter:inclusionai/ling-3.0-flash-vl',
      DEMO_ENABLED_PILLARS: 'Pathfinder, markets',
      DEMO_SIGNUP_CODE: 'swordfish',
      DEMO_ACCOUNT_TTL_DAYS: '14',
    });
    expect(cfg).toEqual({
      demoMode: true,
      offeredModels: ['compat:openrouter:z-ai/glm-5.3-flash', 'compat:openrouter:inclusionai/ling-3.0-flash-vl'],
      enabledPillars: ['work', 'pathfinder', 'markets'],
      signupOpen: true,
      signupCodeRequired: true,
      signupWithEmail: false,
      retentionDays: 14,
      privacyPath: '/privacy',
      termsPath: '/terms',
      termsVersion: DEMO_TERMS_VERSION,
      operatorName: '',
      answersScored: false,
      scorerModel: null,
      // Neither hidden list is set: the built-in ones apply (demo-hidden-defaults.test.ts).
      hiddenAreas: [...DEFAULT_DEMO_HIDDEN_AREAS],
      hiddenModules: [...DEFAULT_DEMO_HIDDEN_MODULES],
    });
    // The code itself is never published.
    expect(JSON.stringify(cfg)).not.toContain('swordfish');
  });

  it('answersScored follows DEMO_POST_ANSWER_CALLS: "scored" and "all" make a quality score', () => {
    const scored = (v?: string) => {
      const cfg = demoPublicConfig({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team', ...(v === undefined ? {} : { DEMO_POST_ANSWER_CALLS: v }) });
      return cfg.demoMode ? cfg.answersScored : null;
    };
    expect(scored()).toBe(false);
    expect(scored('conclusion')).toBe(false);
    expect(scored('none')).toBe(false);
    expect(scored('scored')).toBe(true);
    expect(scored(' Scored ')).toBe(true);
    expect(scored('all')).toBe(true);
  });

  it('"scored" turns the quality score on and the structured extraction off; "all" both; outside a demo both', () => {
    const DEMO = { DEMO_MODE: 'true' };
    expect(demoPostAnswerCalls({ ...DEMO, DEMO_POST_ANSWER_CALLS: 'scored' })).toBe('scored');
    expect(demoQualityScoreOn({ ...DEMO, DEMO_POST_ANSWER_CALLS: 'scored' })).toBe(true);
    expect(demoStructuredExtractionOn({ ...DEMO, DEMO_POST_ANSWER_CALLS: 'scored' })).toBe(false);
    expect(demoQualityScoreOn({ ...DEMO, DEMO_POST_ANSWER_CALLS: 'all' })).toBe(true);
    expect(demoStructuredExtractionOn({ ...DEMO, DEMO_POST_ANSWER_CALLS: 'all' })).toBe(true);
    for (const v of [undefined, 'conclusion', 'none', 'bogus']) {
      const env = { ...DEMO, ...(v === undefined ? {} : { DEMO_POST_ANSWER_CALLS: v }) };
      expect(demoQualityScoreOn(env), String(v)).toBe(false);
      expect(demoStructuredExtractionOn(env), String(v)).toBe(false);
    }
    // Negative control: every other install scores and extracts, whatever the variable says.
    expect(demoQualityScoreOn({ DEMO_POST_ANSWER_CALLS: 'none' })).toBe(true);
    expect(demoStructuredExtractionOn({ DEMO_POST_ANSWER_CALLS: 'scored' })).toBe(true);
  });

  it('scorerModel names the scorer only while answers are scored: the one index.ts resolves, else QUALITY_SCORER_MODEL', () => {
    const SCORER = 'compat:openrouter:deepseek/deepseek-v4-flash-0731';
    const cfg = (env: Record<string, string>, opts?: { scorerModel?: string | null }) => {
      const c = demoPublicConfig({ DEMO_MODE: 'true', DEPLOYMENT_MODE: 'team', ...env }, opts);
      return c.demoMode ? c.scorerModel : 'not a demo';
    };
    expect(cfg({ DEMO_POST_ANSWER_CALLS: 'scored', QUALITY_SCORER_MODEL: ` ${SCORER} ` })).toBe(SCORER);
    expect(cfg({ DEMO_POST_ANSWER_CALLS: 'scored' }, { scorerModel: 'compat:openrouter:z-ai/glm-5.3' })).toBe('compat:openrouter:z-ai/glm-5.3');
    expect(cfg({ DEMO_POST_ANSWER_CALLS: 'scored' })).toBeNull();
    // Not scored: no scorer is named, whatever is configured.
    expect(cfg({ QUALITY_SCORER_MODEL: SCORER }, { scorerModel: SCORER })).toBeNull();
    expect(cfg({ DEMO_POST_ANSWER_CALLS: 'none', QUALITY_SCORER_MODEL: SCORER })).toBeNull();
    expect(qualityScorerModelEnv({})).toBeNull();
    expect(qualityScorerModelEnv({ QUALITY_SCORER_MODEL: '   ' })).toBeNull();
  });

  it('warns when a scored demo sends answers to a scorer outside the compat endpoint', () => {
    const base = { DEMO_MODE: 'true', DEMO_POST_ANSWER_CALLS: 'scored' };
    expect(demoModeWarnings({ ...base, QUALITY_SCORER_MODEL: 'claude-haiku-4-5' }).join('\n')).toMatch(/QUALITY_SCORER_MODEL/);
    expect(demoModeWarnings({ ...base, QUALITY_SCORER_MODEL: 'compat:openrouter:moonshotai/kimi-k2.6' }).join('\n')).not.toMatch(/QUALITY_SCORER_MODEL/);
  });

  it('sign-up: a code opens it; no code is closed unless DEMO_SIGNUP_OPEN=true', () => {
    expect(demoSignupPolicy({ DEMO_SIGNUP_CODE: ' abc ' })).toEqual({ open: true, code: 'abc' });
    expect(demoSignupPolicy({})).toEqual({ open: false, code: null });
    expect(demoSignupPolicy({ DEMO_SIGNUP_OPEN: 'true' })).toEqual({ open: true, code: null });
    expect(demoSignupPolicy({ DEMO_SIGNUP_CODE: '   ', DEMO_SIGNUP_OPEN: 'false' })).toEqual({ open: false, code: null });
  });

  it('work is always enabled; unknown pillars are ignored; the TTL is clamped', () => {
    expect(demoEnabledPillars({})).toEqual(['work']);
    expect(demoEnabledPillars({ DEMO_ENABLED_PILLARS: 'nonsense,school' })).toEqual(['work', 'school']);
    expect(demoAccountTtlDays({})).toBe(30);
    expect(demoAccountTtlDays({ DEMO_ACCOUNT_TTL_DAYS: '0' })).toBe(1);
    expect(demoAccountTtlDays({ DEMO_ACCOUNT_TTL_DAYS: 'x' })).toBe(30);
  });
});

describe('the route allowlist (pure)', () => {
  const rules = demoRouteRules({ DEMO_MODE: 'true' });
  const allowed = (m: string, p: string) => demoRouteAllowed(m, p, rules);

  it('lets a visitor run a module and handle its own sessions, uploads and exports', () => {
    for (const [m, p] of [
      ['POST', '/claude/message'], ['GET', '/claude/models'], ['GET', '/modules/aml-gap-analysis'],
      ['GET', '/modules/aml-gap-analysis/prompt'], ['GET', '/sessions'], ['POST', '/sessions'],
      ['GET', '/sessions/abc'], ['PATCH', '/sessions/abc'], ['DELETE', '/sessions/abc'],
      ['POST', '/files/upload'], ['POST', '/export'], ['GET', '/settings/default-model'],
      ['GET', '/csrf-token'], ['GET', '/health'], ['HEAD', '/health'], ['GET', '/run-artifacts/by-parent/message/m1'],
      ['GET', '/sessions/'], ['GET', '/SESSIONS/abc'], ['GET', '/sessions/abc/messages/m1/artifacts'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(true);
    }
  });

  it('refuses everything else, including writes to what it may read', () => {
    for (const [m, p] of [
      ['GET', '/agents'], ['POST', '/agents/x/connectors'], ['POST', '/data/import'], ['GET', '/markets/theses'],
      ['PUT', '/custom-modules/x'], ['POST', '/sessions/abc/share'],
      ['POST', '/settings/default-model'], ['POST', '/settings/model-endpoints'], ['GET', '/settings/custom-models'],
      ['PUT', '/profile'], ['GET', '/files/upload/extra'], ['GET', '/pathfinder/threads'], ['POST', '/renderers/run/x'],
      ['DELETE', '/rerun'], ['GET', '/admin/users'], ['POST', '/radar/settings'], ['GET', '/sessionsX'],
      ['GET', '//agents'], ['POST', '/claude/deliberate'], ['POST', '/auth/mfa/enable'],
      ['DELETE', '/sessions/abc/messages/m1/artifacts'], ['GET', '/sessions/abc/messages/m1/artifacts/x'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(false);
    }
  });

  it('an enabled pillar adds its API prefix — and only then', () => {
    expect(allowed('GET', '/pathfinder/threads')).toBe(false);
    const withPathfinder = demoRouteRules({ DEMO_MODE: 'true', DEMO_ENABLED_PILLARS: 'pathfinder' });
    expect(demoRouteAllowed('GET', '/pathfinder/threads', withPathfinder)).toBe(true);
    expect(demoRouteAllowed('POST', '/pathfinder/search', withPathfinder)).toBe(true);
    expect(demoRouteAllowed('GET', '/pathfinderx', withPathfinder)).toBe(false);
    expect(demoRouteAllowed('GET', '/markets/theses', withPathfinder)).toBe(false);
  });

  it('DEMO_EXTRA_ROUTES adds prefixes, optionally for one method', () => {
    const extra = demoRouteRules({ DEMO_MODE: 'true', DEMO_EXTRA_ROUTES: '/evidence-packs, POST:/folders, not-a-path, GET|POST:/quality/' });
    expect(allowed('GET', '/evidence-packs')).toBe(false);
    expect(demoRouteAllowed('GET', '/evidence-packs', extra)).toBe(true);
    expect(demoRouteAllowed('POST', '/evidence-packs/x/build', extra)).toBe(true);
    expect(demoRouteAllowed('POST', '/folders', extra)).toBe(true);
    expect(demoRouteAllowed('POST', '/folders/f1/scan', extra)).toBe(true);
    expect(demoRouteAllowed('GET', '/folders', extra)).toBe(false);
    expect(demoRouteAllowed('GET', '/quality/leaderboard', extra)).toBe(true);
    expect(demoRouteAllowed('DELETE', '/quality/x', extra)).toBe(false);
    expect(demoRouteAllowed('GET', '/evidence-packsX', extra)).toBe(false);
  });

  it('opens the Work tools of 2026-10-01 — each exactly, never its siblings', () => {
    // Opened: My Work, Explain for, the citation check, Review, Rerun with,
    // Transform, Find the right module, the AI Council's ledger, Build Module.
    for (const [m, p] of [
      ['GET', '/work-timeline'],
      ['POST', '/claude/explain-for'], ['POST', '/claude/verify-citations'],
      ['GET', '/reviews/modes'], ['POST', '/reviews'],
      ['POST', '/rerun'], ['GET', '/rerun/quality/m1'],
      ['GET', '/renderers/applicable'], ['POST', '/renderers/run'], ['GET', '/renderers/artifacts/42'], ['GET', '/sessions/s1/artifacts'],
      ['POST', '/modules/smart-search'],
      ['POST', '/council/s1/dissent-ledger'],
      ['POST', '/custom-modules'], ['PATCH', '/custom-modules/custom-1'], ['DELETE', '/custom-modules/custom-1'],
      ['POST', '/custom-modules/guide-message'], ['POST', '/custom-modules/guide-generate'], ['POST', '/custom-modules/test-run'],
      ['POST', '/ai-assist/module-prompt'], ['POST', '/ai-assist/module-inputs'],
      ['POST', '/versions/module/custom-1'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(true);
    }
    // Negative controls: the siblings a prefix would have opened, and the
    // features that stay admin-only (C8).
    for (const [m, p] of [
      ['POST', '/work-timeline'], ['GET', '/work-timeline/x'],
      ['POST', '/claude/deliberate'], ['POST', '/claude/explain-for/x'],
      ['POST', '/reviews/orchestrate'], ['GET', '/reviews'], ['GET', '/reviews/x'], ['DELETE', '/reviews'],
      ['GET', '/rerun'], ['GET', '/rerun/quality'], ['GET', '/rerun/quality/m1/x'],
      ['GET', '/renderers'], ['GET', '/renderers/board-deck'], ['POST', '/renderers/applicable'], ['DELETE', '/renderers/artifacts/42'],
      ['POST', '/sessions/s1/artifacts'],
      ['POST', '/modules/community'],
      ['GET', '/council/s1/dissent-ledger'], ['POST', '/council/s1'],
      ['POST', '/custom-modules/x/share'], ['PUT', '/custom-modules/custom-1'],
      ['POST', '/ai-assist/skill-draft'], ['POST', '/ai-assist/module-prompt/x'],
      ['POST', '/versions/output/x/y'], ['POST', '/versions/session/s1'], ['DELETE', '/versions/module/custom-1'],
      ['POST', '/pathfinder/search'], ['GET', '/coding/projects'], ['GET', '/intelligence/dashboard'],
      ['GET', '/orchestrator/status'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(false);
    }
  });

  it('opens the features of 2026-10-02 — each exactly, never its siblings', () => {
    // Opened: Engagement Tasks, Projects, the Knowledge Base, the Task Agent,
    // Discover, read-only Orchestration / Intelligence / Horizon Radar, and
    // the (unsigned) download of a built module.
    for (const [m, p] of [
      ['GET', '/engagements'], ['POST', '/engagements'], ['GET', '/engagements/e1'], ['PATCH', '/engagements/e1'],
      ['DELETE', '/engagements/e1'], ['POST', '/engagements/e1/execute'], ['GET', '/engagements/e1/execute/stream'],
      ['POST', '/engagements/e1/quality-gate/run'], ['POST', '/engagements/e1/export'], ['GET', '/engagements/peer-library'],
      ['GET', '/projects'], ['POST', '/projects'], ['GET', '/projects/p1'], ['PATCH', '/projects/p1'], ['DELETE', '/projects/p1'],
      ['GET', '/projects/p1/stats'], ['GET', '/projects/p1/files'], ['POST', '/projects/p1/files'],
      ['GET', '/projects/p1/files/f1/download'], ['DELETE', '/projects/p1/files/f1'],
      ['GET', '/projects/p1/notes'], ['POST', '/projects/p1/notes'], ['DELETE', '/projects/p1/notes/n1'],
      ['PATCH', '/sessions/s1/project'], ['POST', '/ai-assist/project-scaffold'],
      ['GET', '/collections'], ['POST', '/collections'], ['DELETE', '/collections/c1'], ['GET', '/collections/c1/documents'],
      ['POST', '/documents/upload'], ['GET', '/documents/collection/c1'], ['DELETE', '/documents/d1'],
      ['GET', '/task-agent/capabilities'], ['GET', '/task-agent/stats'], ['GET', '/task-agent/tasks'], ['POST', '/task-agent/tasks'],
      ['GET', '/task-agent/tasks/t1'], ['DELETE', '/task-agent/tasks/t1'], ['POST', '/task-agent/tasks/t1/message'],
      ['POST', '/task-agent/tasks/t1/select-approach'], ['POST', '/task-agent/tasks/t1/intake-ready'],
      ['POST', '/task-agent/tasks/t1/execute-step'], ['GET', '/task-agent/tasks/t1/execute-step/stream'],
      ['POST', '/task-agent/tasks/t1/upload'], ['DELETE', '/task-agent/tasks/t1/upload/f1'], ['PUT', '/task-agent/tasks/t1/knowledge-packs'],
      ['GET', '/discovery/sessions'], ['POST', '/discovery/sessions'], ['GET', '/discovery/sessions/d1'], ['DELETE', '/discovery/sessions/d1'],
      ['GET', '/discovery/sessions/d1/start'], ['POST', '/discovery/sessions/d1/respond'], ['GET', '/discovery/sessions/d1/insights'],
      ['POST', '/discovery/sessions/d1/generate'], ['GET', '/discovery/sessions/d1/output'], ['POST', '/discovery/sessions/d1/export'],
      ['PATCH', '/discovery/sessions/d1/upgrade'], ['POST', '/discovery/sessions/d1/pack'], ['POST', '/discovery/sessions/d1/followup'],
      ['GET', '/discovery/packs'],
      ['GET', '/org-context'], ['GET', '/insights'], ['GET', '/insights/unread-count'], ['GET', '/continuity/profiles'],
      ['GET', '/intelligence/summary'], ['GET', '/intelligence/distribution'], ['GET', '/intelligence/top-entities'],
      ['GET', '/intelligence/insights'], ['GET', '/intelligence/export'], ['GET', '/intelligence/temporal/atoms-per-day'],
      ['GET', '/intelligence/temporal/entity-activity'], ['GET', '/intelligence/temporal/quality-trend'],
      ['GET', '/knowledge-graph/entities'],
      ['GET', '/radar/summary'], ['GET', '/radar/items'], ['GET', '/radar/sources'], ['GET', '/radar/scan-status'],
      ['POST', '/exchange/export/custom-1'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(true);
    }
    // Negative controls: the siblings a prefix would have opened, the
    // features' admin and sharing routes, and Coding and the App Gateway.
    for (const [m, p] of [
      // Engagement Tasks: the host-folder index, project linking, web search
      ['POST', '/engagements/e1/rag-directory'], ['DELETE', '/engagements/e1/rag-directory'],
      ['POST', '/engagements/e1/rag-directory/reindex'], ['PATCH', '/engagements/e1/project'],
      ['POST', '/engagements/e1/peer-benchmarks/web-search'], ['PUT', '/engagements/e1'],
      // Projects: sharing, and the invitation flow
      ['GET', '/projects/p1/members'], ['POST', '/projects/p1/members'], ['PATCH', '/projects/p1/members/m1'],
      ['DELETE', '/projects/p1/members/m1'], ['GET', '/projects/p1/invitations'], ['POST', '/projects/p1/invitations'],
      ['DELETE', '/projects/p1/invitations/i1'], ['GET', '/projects/invitations/accept/tok'], ['PUT', '/projects/p1'],
      ['GET', '/projects/p1/files/f1'], ['PATCH', '/sessions/s1/project/x'],
      // The Knowledge Base: edits, queries, maintenance, host folders
      ['PUT', '/collections/c1'], ['GET', '/collections/c1'], ['POST', '/collections/c1/query'], ['GET', '/collections/health/check'],
      ['POST', '/knowledge/reembed'], ['POST', '/knowledge/reindex-stuck'], ['POST', '/documents/upload-multiple'],
      ['GET', '/documents/d1'], ['POST', '/documents/d1/reindex'], ['GET', '/documents/collection/c1/stats'],
      ['GET', '/rag/folders'], ['GET', '/folders/registered'], ['POST', '/embeddings/search/atoms'], ['POST', '/embeddings/similar'],
      // The Task Agent: missions, completion with a score, PATCH, admin intake
      ['POST', '/task-agent/tasks/t1/execute-as-mission'], ['POST', '/task-agent/tasks/t1/sync-mission'],
      ['POST', '/task-agent/tasks/t1/complete'], ['PATCH', '/task-agent/tasks/t1'], ['GET', '/task-agent/tasks/t1/execute-step/status'],
      ['POST', '/task-agent/backfill-atoms'], ['POST', '/task-agent/ingest'],
      // Discover: state writes, status, follow-ups, single packs
      ['PUT', '/discovery/sessions/d1'], ['PATCH', '/discovery/sessions/d1/status'], ['GET', '/discovery/followups/pending'],
      ['PUT', '/discovery/followups/f1'], ['GET', '/discovery/packs/healthcare'], ['PATCH', '/discovery/sessions/d1'],
      // Orchestration, Intelligence, Radar, Exchange: writes, switches, triage, imports, signing
      ['PUT', '/org-context'], ['GET', '/org-context/history'], ['PATCH', '/insights/i1/read'], ['POST', '/insights/generate'],
      ['GET', '/continuity/profiles/cp1'], ['POST', '/continuity/profiles'], ['GET', '/intelligence/atom-ab'],
      ['POST', '/intelligence/atom-injection/mode'], ['GET', '/intelligence/temporal/patterns-per-week'], ['GET', '/patterns'],
      ['POST', '/ai-assist/intelligence-brief'], ['GET', '/knowledge-graph/entities/org/acme'], ['POST', '/knowledge-graph/build'],
      ['PUT', '/radar/items/r1/status'], ['POST', '/radar/scan'], ['GET', '/radar/settings'], ['POST', '/radar/sources'],
      ['POST', '/exchange/import'], ['POST', '/exchange/validate'], ['GET', '/exchange/signing-identity'],
      ['POST', '/exchange/export-bundle/market-index'], ['POST', '/exchange/export-run'], ['POST', '/exchange/export/a/b'],
      // Coding and the App Gateway stay with admins
      ['GET', '/coding/projects'], ['POST', '/coding/studio/p1/run'], ['GET', '/app/radar/items'], ['GET', '/app-gateway/devices'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(false);
    }
  });

  it('takes the Engagement Task entries from services/engagement-demo-routes.ts, unchanged', () => {
    const inWork = WORK_ROUTES.filter(([, p]) => p.startsWith('/engagements')).map(([m, p]) => `${m} ${p}`);
    expect(inWork).toEqual(ENGAGEMENT_WORK_ROUTES.map(([m, p]) => `${m} ${p}`));
  });

  it('covers the calls the opened Work tools make, read from src/', () => {
    // If one of these moves, the tool 404s on the demo again.
    const read = (f: string) => readFileSync(join(__dirname, '../../src', f), 'utf8');
    expect(read('components/shared/TransformPanel.tsx')).toContain('/api/renderers/applicable?session_id=');
    expect(read('components/shared/TransformPanel.tsx')).toContain('/api/renderers/run');
    expect(read('components/shared/TransformPanel.tsx')).toContain('/artifacts`');
    expect(read('pages/AICouncilPage.tsx')).toContain('/dissent-ledger`');
    expect(read('pages/BuildYourOwnModule.tsx')).toContain('/api/custom-modules/guide-generate');
    expect(read('lib/api.ts')).toContain('`${API_BASE}/reviews`');
    expect(read('lib/api.ts')).toContain('`${API_BASE}/reviews/modes`');
    // The features of 2026-10-02.
    expect(read('pages/AntonTaskAgentPage.tsx')).toContain('/api/task-agent/tasks');
    expect(read('pages/DiscoverPage.tsx')).toContain('/api/discovery/sessions');
    expect(read('pages/KnowledgeBasePage.tsx')).toContain('/api/collections');
    expect(read('pages/RadarPage.tsx')).toContain('/api/radar/items');
    expect(read('pages/ExchangePage.tsx')).toContain('`${API_BASE}/exchange/export/${moduleId}');
    expect(read('pages/OrchestrationDashboard.tsx')).toContain('/api/insights');
    expect(read('pages/IntelligenceDashboard.tsx')).toContain('/api/intelligence/summary');
  });

  it('covers the calls the Work page makes when it loads and runs', () => {
    // The page's own requests, read from src/: if one of these moves, the demo breaks.
    const api = readFileSync(join(__dirname, '../../src/lib/api.ts'), 'utf8');
    expect(api).toContain('`${API_BASE}/claude/message`');
    expect(api).toContain('`${API_BASE}/files/upload`');
    for (const [m, p] of [
      ['POST', '/claude/message'], ['POST', '/files/upload'], ['GET', '/user-module-defaults/aml'],
      ['POST', '/user-module-defaults/aml/used'], ['GET', '/knowledge-library'], ['GET', '/knowledge-packs'],
      ['GET', '/skills'], ['GET', '/custom-modules'], ['GET', '/profile'], ['GET', '/sessions/stats'],
      ['GET', '/intelligence/atom-injection'], ['GET', '/settings/model-endpoints'], ['GET', '/auth/me/budget'],
      ['POST', '/sessions/s1/title/generate'], ['POST', '/quality/feedback'], ['GET', '/templates'],
    ] as const) {
      expect(allowed(m, p), `${m} ${p}`).toBe(true);
    }
  });
});

describe('the allowlist middleware (mounted as in index.ts)', () => {
  let server: Server;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const role = req.header('x-test-role');
      if (role) (req as Request & { user?: { id: string; username: string; role: string } }).user = { id: `u-${role}`, username: role, role };
      next();
    });
    app.use('/api', createDemoAllowlistMiddleware());
    app.all('/api/*', (_req, res) => { res.status(200).json({ reached: true }); });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', () => resolve()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server?.close(() => resolve())); });

  const call = (method: string, path: string, role?: string) =>
    fetch(`${base}/api${path}`, { method, headers: role ? { 'x-test-role': role } : {} });

  it('answers 404 to a visitor outside the Work routes — and lets the same request through outside demo mode', async () => {
    process.env.DEMO_MODE = 'true';
    const refused = await call('POST', '/data/import', 'analyst');
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: 'Not available in this demo' });
    expect((await call('GET', '/agents', 'viewer')).status).toBe(404);

    delete process.env.DEMO_MODE;
    expect((await call('POST', '/data/import', 'analyst')).status).toBe(200);
  });

  it('lets a visitor reach the Work routes', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('POST', '/claude/message', 'analyst')).status).toBe(200);
    expect((await call('GET', '/sessions', 'analyst')).status).toBe(200);
  });

  it('lets a visitor reach each opened Work tool, and keeps a sibling of each at 404', async () => {
    process.env.DEMO_MODE = 'true';
    for (const [m, p, sibling] of [
      ['GET', '/work-timeline', '/work-timeline/all'],
      ['POST', '/claude/explain-for', '/claude/deliberate'],
      ['POST', '/claude/verify-citations', '/claude/message-sync'],
      ['POST', '/reviews', '/reviews/orchestrate'],
      ['POST', '/rerun', '/rerun/import'],
      ['POST', '/renderers/run', '/renderers/run/all'],
      ['POST', '/modules/smart-search', '/modules/community'],
      ['POST', '/council/s1/dissent-ledger', '/council/s1/members'],
      ['POST', '/custom-modules/test-run', '/custom-modules/x/share'],
      ['POST', '/ai-assist/module-inputs', '/ai-assist/skill-draft'],
      // Opened 2026-10-02
      ['POST', '/engagements/e1/execute', '/engagements/e1/rag-directory'],
      ['GET', '/projects/p1', '/projects/p1/members'],
      ['POST', '/projects/p1/notes', '/projects/p1/invitations'],
      ['POST', '/documents/upload', '/documents/upload-multiple'],
      ['GET', '/collections', '/collections/health/check'],
      ['POST', '/task-agent/tasks/t1/execute-step', '/task-agent/tasks/t1/execute-as-mission'],
      ['GET', '/discovery/sessions/d1/start', '/discovery/followups/pending'],
      ['GET', '/radar/items', '/radar/settings'],
      ['GET', '/continuity/profiles', '/continuity/profiles/cp1'],
      ['POST', '/exchange/export/custom-1', '/exchange/import'],
    ] as const) {
      expect((await call(m, p, 'analyst')).status, `${m} ${p}`).toBe(200);
      expect((await call(m, sibling, 'analyst')).status, `${m} ${sibling}`).toBe(404);
      // Negative control: an admin reaches the sibling too.
      expect((await call(m, sibling, 'admin')).status, `admin ${m} ${sibling}`).toBe(200);
    }
  });

  it('never restricts an admin — the owner runs the instance through the same server', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('POST', '/data/import', 'admin')).status).toBe(200);
    expect((await call('GET', '/admin/users', 'admin')).status).toBe(200);
  });

  it('refuses a request with no user even on a Work route', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('GET', '/sessions')).status).toBe(404);
  });

  it('follows a change of DEMO_ENABLED_PILLARS / DEMO_EXTRA_ROUTES', async () => {
    process.env.DEMO_MODE = 'true';
    expect((await call('GET', '/pathfinder/threads', 'analyst')).status).toBe(404);
    process.env.DEMO_ENABLED_PILLARS = 'pathfinder';
    expect((await call('GET', '/pathfinder/threads', 'analyst')).status).toBe(200);
    delete process.env.DEMO_ENABLED_PILLARS;
    expect((await call('GET', '/evidence-packs', 'analyst')).status).toBe(404);
    process.env.DEMO_EXTRA_ROUTES = '/evidence-packs';
    expect((await call('GET', '/evidence-packs', 'analyst')).status).toBe(200);
  });

  it('index.ts mounts it after the auth middleware and before every authenticated route', () => {
    const src = readFileSync(join(__dirname, '../../server/index.ts'), 'utf8');
    const auth = src.indexOf("app.use('/api', authMiddleware);");
    const demo = src.indexOf("app.use('/api', createDemoAllowlistMiddleware());");
    expect(auth).toBeGreaterThan(0);
    expect(demo).toBeGreaterThan(auth);
    // No route that answers requests sits between the two (a middleware such
    // as the request context may). Routes are mounted with a create*Routes /
    // create*Router factory, a router variable, or app.get / app.post.
    const between = src.slice(auth + "app.use('/api', authMiddleware);".length, demo);
    expect(between).not.toMatch(/app\.(get|post|put|patch|delete)\(/);
    expect(between).not.toMatch(/create\w*(Routes|Router)\(/);
    expect(demo).toBeLessThan(src.indexOf("app.get('/api/csrf-token'"));
    expect(demo).toBeLessThan(src.indexOf("app.use('/api', claudeRouter);"));
  });
});
