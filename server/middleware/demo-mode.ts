/**
 * demo-mode.ts — DEMO_MODE: ANTON as a public showcase (2026-09-25).
 *
 * With DEMO_MODE=true (team mode only) strangers sign up with an invite code
 * and try the Work modules on the owner's model budget. Everything the demo
 * changes is decided here, from the environment, read lazily (this module is
 * imported before index.ts finishes setting DEPLOYMENT_MODE):
 *
 *   - the route allowlist: a non-admin gets 404 for every /api route outside
 *     what the Work page needs (WORK_ROUTES), the enabled pillars' prefixes
 *     and DEMO_EXTRA_ROUTES. Admins are never restricted — the owner runs the
 *     instance through the same server;
 *   - background work that spends or learns: Markets, the missions runner, the
 *     memory sweep and radar automation are forced off, whatever else is set;
 *   - sign-up: who may create an account, how long it lives, its budget, and
 *     the version of the demo terms it must accept (DEMO_TERMS_VERSION);
 *   - the modules kept off the demo (DEMO_HIDDEN_AREAS / DEMO_HIDDEN_MODULES,
 *     built-in lists when unset; demoModuleHidden), which the run route and
 *     the module listings apply;
 *   - the OpenRouter providers a request may go to (DEMO_ALLOWED_PROVIDERS);
 *   - the public /api/config fields the web client reads.
 *
 * Nothing here touches the database. The sign-up route is in routes/auth.ts
 * and the daily deletion of expired accounts in services/demo-retention.ts.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { parseSpendCap, invalidSpendCapMessage, SPEND_CAP_VARS } from '../services/llm-spend-cap-env.js';

type Env = Record<string, string | undefined>;

// ── The flag ──────────────────────────────────────────────────────────────────

export function isDemoMode(env: Env = process.env): boolean {
  return String(env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';
}

/** A reason to refuse to start, or null. A demo in solo mode would make every visitor an admin. */
export function demoModeStartupProblem(env: Env = process.env): string | null {
  if (!isDemoMode(env)) return null;
  if (env.DEPLOYMENT_MODE !== 'team') {
    return '[demo] FATAL: DEMO_MODE=true requires DEPLOYMENT_MODE=team. In solo mode every visitor is an administrator.';
  }
  // A cap that cannot be read ("0,25", "$3") would silently be no cap at all.
  for (const name of SPEND_CAP_VARS) {
    if (parseSpendCap(env[name]).invalid) return `[demo] FATAL: ${invalidSpendCapMessage(name)}.`;
  }
  // The `user` id sent to OpenRouter with every call is an HMAC of the
  // visitor's account id (openaiCompatibleAdapter.ts). On a demo it has its
  // own key: outside demo mode it falls back on JWT_SECRET, which signs every
  // session (privacy review M3 / D11). Names only, never a value.
  const hashSecret = (env.LLM_USER_HASH_SECRET ?? '').trim();
  const generate = 'Generate one with: openssl rand -hex 32';
  if (!hashSecret) {
    return `[demo] FATAL: LLM_USER_HASH_SECRET is not set. It keys the pseudonymous id sent to OpenRouter and must differ from JWT_SECRET. ${generate}`;
  }
  if (hashSecret === (env.JWT_SECRET ?? '').trim()) {
    return `[demo] FATAL: LLM_USER_HASH_SECRET is the same as JWT_SECRET. Give it its own value. ${generate}`;
  }
  if (/^<.*>$/.test(hashSecret)) {
    return `[demo] FATAL: LLM_USER_HASH_SECRET is still the <...> placeholder from .env.demo.example. ${generate}`;
  }
  if (hashSecret.length < 32) {
    return `[demo] FATAL: LLM_USER_HASH_SECRET is shorter than 32 characters. ${generate}`;
  }
  return null;
}

/** Things an operator should know about a demo configuration. Names only — never a value. */
export function demoModeWarnings(env: Env = process.env): string[] {
  if (!isDemoMode(env)) return [];
  const warnings: string[] = [];
  if (env.ANTHROPIC_API_KEY) warnings.push('ANTHROPIC_API_KEY is set: visitors\' runs can reach Claude on that key. The showcase runs on OpenRouter only.');
  if (String(env.SDK_ENGINE_ENABLED ?? '').toLowerCase() === 'true') warnings.push('SDK_ENGINE_ENABLED=true: the subscription engine (this machine\'s Claude login) is on for a public server.');
  if (!env.DEMO_SIGNUP_CODE && String(env.DEMO_SIGNUP_OPEN ?? '').toLowerCase() === 'true') warnings.push('DEMO_SIGNUP_OPEN=true with no DEMO_SIGNUP_CODE: anyone on the internet can make an account, and the privacy notice and the demo terms, which say sign-up needs an invite code, are then untrue.');
  if (demoOfferedModels(env).length === 0) warnings.push('DEMO_OFFERED_MODELS is empty: the model picker has nothing to offer visitors.');
  if (parseSpendCap(env.LLM_DAILY_SPEND_CAP_USD).value === null) warnings.push('LLM_DAILY_SPEND_CAP_USD is not set (or 0): nothing in ANTON caps a day\'s model spend (the OpenRouter key limit still does).');
  if (parseSpendCap(env.LLM_USER_DAILY_SPEND_CAP_USD).value === null) warnings.push('LLM_USER_DAILY_SPEND_CAP_USD is not set (or 0): one visitor can use the whole day\'s budget.');
  for (const key of ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'MISTRAL_API_KEY', 'AZURE_OPENAI_API_KEY'] as const) {
    if (env[key]) warnings.push(`${key} is set: a visitor's run can reach that provider on your key if one of its models is offered.`);
  }
  if (String(env.CODEX_ENGINE_ENABLED ?? '').toLowerCase() === 'true') warnings.push('CODEX_ENGINE_ENABLED=true: the ChatGPT subscription engine is on for a public server.');
  for (const name of unknownPillarNames(env)) warnings.push(`DEMO_ENABLED_PILLARS names "${name}", which is not a pillar — ignored.`);
  for (const entry of invalidExtraRoutes(env)) warnings.push(`DEMO_EXTRA_ROUTES entry "${entry}" is not a /path (optionally METHOD:/path) — ignored.`);
  if (!demoOperatorName(env)) warnings.push('DEMO_OPERATOR_NAME is not set: the pages cannot say who operates the demo, which the law requires before it opens to the public.');
  if (demoHiddenAreas(env).length === 0 && demoHiddenModules(env).length === 0) {
    warnings.push('DEMO_HIDDEN_AREAS and DEMO_HIDDEN_MODULES are both "none": visitors can run the health, HR, credit, CV and investigation modules, which invite data the demo must not receive.');
  } else {
    // An explicit list replaces the built-in one; the privacy notice promises
    // every recommended module is off the demo.
    for (const [name, effective, recommended] of [
      ['DEMO_HIDDEN_AREAS', demoHiddenAreas(env), DEFAULT_DEMO_HIDDEN_AREAS],
      ['DEMO_HIDDEN_MODULES', demoHiddenModules(env), DEFAULT_DEMO_HIDDEN_MODULES],
    ] as const) {
      const left = recommended.filter((id) => !effective.includes(id));
      if (left.length > 0) warnings.push(`${name} leaves out ${left.join(', ')}: the privacy notice says the demo does not offer them.`);
    }
  }
  return warnings;
}

/**
 * The background schedulers a demo must not run, whatever else the .env says:
 * Markets (fetches and model calls), the missions runner (unattended model
 * calls), the memory sweep (learning from visitors' runs) and radar
 * automation (scheduled model scoring).
 */
export const DEMO_FORCED_FLAGS: Readonly<Record<string, string>> = {
  MARKETS_SCHEDULE_DISABLED: 'true',
  MISSIONS_RUNNER_DISABLED: 'true',
  MEMORY_SWEEP_DISABLED: 'true',
  RADAR_AUTOMATION_DISABLED: 'true',
};

/**
 * Sets DEMO_FORCED_FLAGS on env in demo mode. Returns the names it changed.
 * Called once at boot, before any scheduler reads its flag.
 */
export function applyDemoModeOverrides(env: Env = process.env): string[] {
  if (!isDemoMode(env)) return [];
  const changed: string[] = [];
  for (const [name, value] of Object.entries(DEMO_FORCED_FLAGS)) {
    if (env[name] !== value) {
      env[name] = value;
      changed.push(name);
    }
  }
  return changed;
}

// ── Configuration ─────────────────────────────────────────────────────────────

/** The app-mode pillars the web client knows (useSettingsStore AppMode). */
export const DEMO_PILLARS = [
  'work', 'school', 'life', 'pathfinder', 'markets', 'community',
  'payments', 'portals', 'missions', 'procure', 'civic', 'grow',
] as const;
export type DemoPillar = typeof DEMO_PILLARS[number];

function isPillar(value: string): value is DemoPillar {
  return (DEMO_PILLARS as readonly string[]).includes(value);
}

function listEnv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

function intEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (value === undefined || value.trim() === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** DEMO_ENABLED_PILLARS (comma-separated). Work is always on: it is the demo. */
export function demoEnabledPillars(env: Env = process.env): DemoPillar[] {
  const named = listEnv(env.DEMO_ENABLED_PILLARS).map((s) => s.toLowerCase()).filter(isPillar);
  return ['work', ...DEMO_PILLARS.filter((p) => p !== 'work' && named.includes(p))];
}

function unknownPillarNames(env: Env): string[] {
  return listEnv(env.DEMO_ENABLED_PILLARS).filter((s) => !isPillar(s.toLowerCase()));
}

/** DEMO_OFFERED_MODELS: the full model ids the picker offers visitors. */
/**
 * The model calls a demo makes after each answer, besides the answer itself:
 * 'all' (quality score, structured extraction, session conclusion — what every
 * other install does), 'conclusion' (the default: only the session conclusion,
 * which the page shows) or 'none'. A live run on 2026-09-25 showed why: the
 * three calls fire together right after the answer, each can cost more than the
 * answer, and on a provider pin with no fallback all three were refused 429.
 * The Transform panel the extraction feeds is not open to visitors anyway.
 * Outside demo mode this is always 'all'.
 */
export type DemoPostAnswerCalls = 'all' | 'conclusion' | 'none';
export function demoPostAnswerCalls(env: Env = process.env): DemoPostAnswerCalls {
  if (!isDemoMode(env)) return 'all';
  const v = String(env.DEMO_POST_ANSWER_CALLS ?? '').trim().toLowerCase();
  return v === 'all' || v === 'none' ? v : 'conclusion';
}

export function demoOfferedModels(env: Env = process.env): string[] {
  return [...new Set(listEnv(env.DEMO_OFFERED_MODELS))];
}

/**
 * DEMO_ALLOWED_PROVIDERS: the OpenRouter providers a demo's requests may go
 * to (comma-separated, lower-cased), default "inceptron". Every entry of the
 * endpoint's provider.only must be one of them, or the call is refused before
 * anything is sent (assertDemoPrivacyPin in services/compat-endpoint.ts): the
 * privacy notice names the provider, and its transfer assessment covers that
 * one only. An endpoint saved from an older preset (["inceptron","nextbit"])
 * would otherwise pass.
 */
export const DEFAULT_DEMO_ALLOWED_PROVIDERS: readonly string[] = ['inceptron'];
export function demoAllowedProviders(env: Env = process.env): string[] {
  const named = [...new Set(listEnv(env.DEMO_ALLOWED_PROVIDERS).map((s) => s.toLowerCase()))];
  return named.length > 0 ? named : [...DEFAULT_DEMO_ALLOWED_PROVIDERS];
}

/** How long a demo account lives. DEMO_ACCOUNT_TTL_DAYS, 1–365, default 30. */
export function demoAccountTtlDays(env: Env = process.env): number {
  return intEnv(env.DEMO_ACCOUNT_TTL_DAYS, 30, 1, 365);
}

/** Monthly token budget of a new demo account. DEMO_USER_MONTHLY_TOKENS, default 500 000; 0 = unlimited. */
export function demoUserMonthlyTokens(env: Env = process.env): number {
  return intEnv(env.DEMO_USER_MONTHLY_TOKENS, 500_000, 0, 1_000_000_000);
}

/** Demo accounts created per rolling day, instance-wide. DEMO_MAX_SIGNUPS_PER_DAY, default 100; 0 = no cap. */
export function demoMaxSignupsPerDay(env: Env = process.env): number {
  return intEnv(env.DEMO_MAX_SIGNUPS_PER_DAY, 100, 0, 1_000_000);
}

/** Sign-up attempts per IP per hour, counted whether they succeed or not. DEMO_SIGNUPS_PER_IP_PER_HOUR, default 3. */
export function demoSignupsPerIpPerHour(env: Env = process.env): number {
  return intEnv(env.DEMO_SIGNUPS_PER_IP_PER_HOUR, 3, 1, 1000);
}

export interface UploadQuota {
  /** Bytes one account may keep in uploads; 0 = no cap. */
  maxBytes: number;
  /** Files one account may keep; 0 = no cap. */
  maxFiles: number;
}

/**
 * What one demo account may store through POST /files/upload:
 * DEMO_USER_UPLOAD_MB (default 50) and DEMO_USER_UPLOAD_FILES (default 50),
 * 0 = no cap. Uploads, exports and PostgreSQL share the VM's disk; without a
 * cap one visitor could fill it and take the demo down for everyone.
 */
export function demoUserUploadQuota(env: Env = process.env): UploadQuota {
  return {
    maxBytes: intEnv(env.DEMO_USER_UPLOAD_MB, 50, 0, 1_000_000) * 1024 * 1024,
    maxFiles: intEnv(env.DEMO_USER_UPLOAD_FILES, 50, 0, 1_000_000),
  };
}

/** Uploads, exports and version saves per account per 10 minutes. DEMO_USER_WRITES_PER_10_MIN, default 30. */
export function demoUserWritesPer10Min(env: Env = process.env): number {
  return intEnv(env.DEMO_USER_WRITES_PER_10_MIN, 30, 1, 100_000);
}

export interface DemoSignupPolicy {
  /** Anyone may try to sign up (with the code, when one is set). */
  open: boolean;
  /** The invite code to match, or null when sign-up needs none. */
  code: string | null;
}

/**
 * DEMO_SIGNUP_CODE set: sign-up is open to whoever has the code. Unset:
 * closed, unless DEMO_SIGNUP_OPEN=true opens it to everyone.
 */
export function demoSignupPolicy(env: Env = process.env): DemoSignupPolicy {
  const code = (env.DEMO_SIGNUP_CODE ?? '').trim();
  if (code) return { open: true, code };
  return { open: String(env.DEMO_SIGNUP_OPEN ?? '').trim().toLowerCase() === 'true', code: null };
}

/**
 * The version of the demo terms (the /terms page) a visitor accepts at
 * sign-up. POST /api/auth/demo-signup refuses any other version and stores
 * this one with the time of acceptance (migration 291). Change it whenever
 * the terms text changes: a browser still showing the old terms is then
 * refused and asked to reload.
 */
export const DEMO_TERMS_VERSION = '2026-09-26';

/**
 * DEMO_OPERATOR_NAME: the legal name of whoever runs the demo, for the
 * "Operated by …" line (lag 2002:562 8 §). Empty when unset — the page then
 * shows no such line.
 */
export function demoOperatorName(env: Env = process.env): string {
  return (env.DEMO_OPERATOR_NAME ?? '').trim().slice(0, 200);
}

export interface DemoPublicConfig {
  demoMode: true;
  offeredModels: string[];
  enabledPillars: DemoPillar[];
  signupOpen: boolean;
  signupCodeRequired: boolean;
  retentionDays: number;
  privacyPath: '/privacy';
  /** The demo terms page; sign-up sends termsVersion back. */
  termsPath: '/terms';
  termsVersion: string;
  /** DEMO_OPERATOR_NAME, or '' when unset. */
  operatorName: string;
  /** False unless DEMO_POST_ANSWER_CALLS=all: no quality score is made after an answer. */
  answersScored: boolean;
  /**
   * The area and module ids kept off the demo for visitors (demoHiddenAreas /
   * demoHiddenModules: the effective lists, the built-in ones when the .env
   * sets none). The web client leaves them out of its catalogue; the server
   * refuses a run of one and leaves them out of its listings either way.
   */
  hiddenAreas: string[];
  hiddenModules: string[];
}

/** The /api/config fields: { demoMode: false } unless DEMO_MODE=true. Nothing secret — never the code. */
export function demoPublicConfig(env: Env = process.env): DemoPublicConfig | { demoMode: false } {
  if (!isDemoMode(env)) return { demoMode: false };
  const signup = demoSignupPolicy(env);
  return {
    demoMode: true,
    offeredModels: demoOfferedModels(env),
    enabledPillars: demoEnabledPillars(env),
    signupOpen: signup.open,
    signupCodeRequired: signup.code !== null,
    retentionDays: demoAccountTtlDays(env),
    privacyPath: '/privacy',
    termsPath: '/terms',
    termsVersion: DEMO_TERMS_VERSION,
    operatorName: demoOperatorName(env),
    answersScored: demoPostAnswerCalls(env) === 'all',
    hiddenAreas: demoHiddenAreas(env),
    hiddenModules: demoHiddenModules(env),
  };
}

// ── Hidden modules ────────────────────────────────────────────────────────────

/**
 * The areas and modules a demo keeps from visitors when the .env names none:
 * the ones the privacy notice says the demo does not offer (health, HR,
 * workers' rights, criminal law and investigations, credit risk, CV writing).
 * They invite health, employment, credit or criminal-offence data. The
 * notice's claim must hold without configuration, so an unset list means
 * these; "none" turns a list off. .env.demo.example repeats them, and a test
 * keeps the two equal. Module ids are bare (the folder name under
 * server/areas/<area>/modules/), as a run sends them.
 */
export const DEFAULT_DEMO_HIDDEN_AREAS: readonly string[] = ['healthcare', 'community-health', 'hr', 'workers-rights'];
export const DEFAULT_DEMO_HIDDEN_MODULES: readonly string[] = [
  // Credit risk and credit scoring
  'credit-risk', 'fintech-credit-risk-assessment', 'microfinance-credit-scoring', 'credit-score-builder',
  // CV writing
  'cv-writer',
  // Employment and social-protection (benefits, disability) questions
  'employment-rights', 'social-protection-navigator',
  // HR talent modules (candidate assessment and recruitment). Their prompts
  // live in server/prompts, not under server/areas/hr, so the hr area alone
  // does not reach them on the server.
  'talent-discovery', 'talent-ad-generator', 'talent-ad-generation', 'talent-assessment', 'talent-aspiration',
  // Criminal law and investigations: court cases, alerts, suspicious-activity
  // reports, screening hits and sanctions cases are about named people
  'court-process-demystifier', 'alert-investigation', 'investigation-support', 'ivts-detection-investigation',
  'blockchain-investigation', 'investigative-research', 'sar-quality-check', 'daily-screening-review',
  'sanctions-advisory',
];

/**
 * One hidden list from the .env: unset or blank → the built-in list; "none"
 * (any case) → no list; otherwise the ids given, trimmed, lower-cased and
 * without repeats. A value with no id in it (",") counts as blank.
 */
function hiddenList(value: string | undefined, builtIn: readonly string[]): string[] {
  const raw = (value ?? '').trim();
  if (raw.toLowerCase() === 'none') return [];
  const named = [...new Set(listEnv(raw).map((s) => s.toLowerCase()))];
  return named.length > 0 ? named : [...builtIn];
}

/**
 * The area ids kept off the demo: DEMO_HIDDEN_AREAS (comma-separated, e.g.
 * healthcare,hr), DEFAULT_DEMO_HIDDEN_AREAS when unset, none for "none".
 * Empty outside demo mode, where nothing is hidden.
 */
export function demoHiddenAreas(env: Env = process.env): string[] {
  if (!isDemoMode(env)) return [];
  return hiddenList(env.DEMO_HIDDEN_AREAS, DEFAULT_DEMO_HIDDEN_AREAS);
}

/**
 * The module ids kept off the demo: DEMO_HIDDEN_MODULES (comma-separated, e.g.
 * credit-risk,cv-writer), DEFAULT_DEMO_HIDDEN_MODULES when unset, none for
 * "none". Empty outside demo mode, where nothing is hidden.
 */
export function demoHiddenModules(env: Env = process.env): string[] {
  if (!isDemoMode(env)) return [];
  return hiddenList(env.DEMO_HIDDEN_MODULES, DEFAULT_DEMO_HIDDEN_MODULES);
}

/**
 * Whether a module is kept off the demo: its id is in DEMO_HIDDEN_MODULES or
 * its area's id is in DEMO_HIDDEN_AREAS. Always false outside demo mode.
 *
 * It does not look at the caller. Apply it to non-admins only — the run route
 * refuses a hidden module (claude.ts) and the module listing leaves hidden
 * ones out (modules.ts); an admin, as everywhere on the demo, sees everything.
 * These modules invite health, employment, credit or criminal-offence data,
 * which the demo must not receive (privacy review H3, 2026-09-26).
 */
export function demoModuleHidden(
  moduleId: string | null | undefined,
  areaId: string | null | undefined,
  env: Env = process.env,
): boolean {
  if (!isDemoMode(env)) return false;
  const mod = (moduleId ?? '').trim().toLowerCase();
  const area = (areaId ?? '').trim().toLowerCase();
  return (mod !== '' && demoHiddenModules(env).includes(mod))
    || (area !== '' && demoHiddenAreas(env).includes(area));
}

// ── The route allowlist ───────────────────────────────────────────────────────

/**
 * What the Work page needs, read off its API calls (ModulePage and the
 * shell around it: layout, header, sidebar, stores). Paths are under /api.
 * `:x` is one path segment; a trailing `/*` also matches everything below.
 * Anything not here answers 404 to a non-admin. Deliberately left out, for
 * DEMO_EXTRA_ROUTES to add when the owner wants them: the Transform panel
 * (/renderers), rerun, deliberation, explain-for, citation checks, reviews,
 * collections and RAG, EUR-Lex, evidence packs, exchange, projects, public
 * share links, custom-module and profile writes, and the custom model slots
 * (GET /settings/custom-models can carry a per-slot key).
 */
export const WORK_ROUTES: ReadonlyArray<readonly [methods: string, path: string]> = [
  // The shell
  ['GET', '/health'],
  ['GET', '/csrf-token'],
  ['GET', '/auth/me'],
  ['GET', '/auth/me/budget'],
  ['GET', '/profile'],
  ['GET', '/settings/default-model'],
  ['GET', '/settings/model-endpoints'],
  ['GET', '/settings/sdk-engine'],
  ['GET', '/settings/codex-engine'],
  ['GET', '/settings/memory-governance'],
  ['GET', '/settings/engine-guards'],
  // The module catalogue
  ['GET', '/areas/*'],
  ['GET', '/modules'],
  ['GET', '/modules/community'],
  ['GET', '/modules/:x'],
  ['GET', '/modules/:x/prompt'],
  ['GET', '/personas/*'],
  ['GET', '/custom-modules'],
  ['GET', '/custom-modules/:x'],
  ['GET', '/skills'],
  ['GET', '/skills/:x'],
  ['GET', '/knowledge-library'],
  ['GET', '/knowledge-packs/*'],
  ['GET', '/intelligence/atom-injection'],
  ['GET', '/user-module-defaults/:x'],
  ['POST', '/user-module-defaults/:x/used'],
  // A run
  ['GET', '/claude/models'],
  ['POST', '/claude/message'],
  ['POST', '/claude/preview-prompt'],
  ['POST', '/files/upload'],
  ['GET', '/files/:x'],
  // Sessions (the caller's own; the routes scope them)
  ['GET,POST', '/sessions'],
  ['GET', '/sessions/stats'],
  ['GET,PATCH,DELETE', '/sessions/:x'],
  ['POST', '/sessions/:x/title/generate'],
  ['PATCH', '/sessions/:x/review-status'],
  ['GET', '/sessions/:x/snapshots'],
  ['GET', '/sessions/:x/snapshots/latest'],
  ['POST', '/sessions/:x/snapshots/auto'],
  ['GET', '/sessions/:x/resume-context'],
  ['GET', '/run-artifacts/*'],
  // The Provenance panel's run record (the route scopes it to the caller's session)
  ['GET', '/sessions/:x/messages/:x/artifacts'],
  // After the answer: rating, sign-off, versions, export
  ['GET', '/quality/by-session/:x'],
  ['POST', '/quality/feedback'],
  ['POST', '/quality/output-verdict'],
  ['GET', '/quality/output-verdict/:x'],
  ['GET', '/embeddings/feedback/:x'],
  ['POST', '/embeddings/feedback'],
  ['POST', '/embeddings/feedback/bulk'],
  ['GET', '/oversight/modules'],
  // Read only: the sign-off form asks for the reviewer's name, and visitors
  // are told never to give a real one (privacy review H1). The page hides the
  // form for them; an admin can still sign off.
  ['GET', '/oversight/reviews'],
  ['GET', '/oversight/sessions/:x/review'],
  ['GET', '/versions/diff'],
  ['GET,POST', '/versions/output/:x'],
  ['GET', '/versions/output/:x/:x'],
  ['GET', '/templates'],
  ['POST', '/export'],
  ['POST', '/export/with-template'],
  ['POST', '/export/trust-certificate'],
];

/** The API prefixes an enabled pillar adds. Work's are WORK_ROUTES. */
export const PILLAR_ROUTE_PREFIXES: Readonly<Record<Exclude<DemoPillar, 'work'>, readonly string[]>> = {
  school: ['/school'],
  life: ['/news', '/finance', '/travel'],
  pathfinder: ['/pathfinder'],
  markets: ['/markets'],
  community: ['/community'],
  payments: ['/futurechain'],
  portals: ['/portals'],
  missions: ['/missions', '/mission-templates'],
  procure: ['/procure'],
  civic: ['/civic'],
  grow: ['/grow'],
};

export interface RouteRule {
  /** Upper-case methods, or null for any. */
  methods: Set<string> | null;
  pattern: RegExp;
}

const escapeRegex = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** '/sessions/:x/title' → one segment per ':x'; a trailing '/*' (or prefix=true) also matches below. */
function compilePath(path: string, prefix = false): RegExp {
  let p = path.replace(/\/+$/, '');
  let below = prefix;
  if (p.endsWith('/*')) { p = p.slice(0, -2); below = true; }
  const body = p.split('/').map((seg) => (seg.startsWith(':') ? '[^/]+' : escapeRegex(seg))).join('/');
  // Express matches routes case-insensitively and with an optional trailing slash.
  return new RegExp(`^${body}${below ? '(?:/.*)?' : ''}/?$`, 'i');
}

function methodSet(methods: string): Set<string> | null {
  const list = methods.split(/[,|]/).map((m) => m.trim().toUpperCase()).filter(Boolean);
  return list.length === 0 || list.includes('*') ? null : new Set(list);
}

const EXTRA_ROUTE_RE = /^(?:([A-Za-z|]+):)?(\/[A-Za-z0-9_\-./:*]*)$/;

function invalidExtraRoutes(env: Env): string[] {
  return listEnv(env.DEMO_EXTRA_ROUTES).filter((e) => !EXTRA_ROUTE_RE.test(e));
}

/** DEMO_EXTRA_ROUTES: comma-separated prefixes, each optionally METHOD: or METHOD|METHOD:. */
function extraRouteRules(env: Env): RouteRule[] {
  const rules: RouteRule[] = [];
  for (const entry of listEnv(env.DEMO_EXTRA_ROUTES)) {
    const m = EXTRA_ROUTE_RE.exec(entry);
    if (!m) continue;
    rules.push({ methods: m[1] ? methodSet(m[1]) : null, pattern: compilePath(m[2], true) });
  }
  return rules;
}

const WORK_RULES: RouteRule[] = WORK_ROUTES.map(([methods, path]) => ({ methods: methodSet(methods), pattern: compilePath(path) }));

/** Every rule in force for this environment. Rebuilt per call: the env is read lazily, and the lists are short. */
export function demoRouteRules(env: Env = process.env): RouteRule[] {
  const pillarRules = demoEnabledPillars(env)
    .filter((p): p is Exclude<DemoPillar, 'work'> => p !== 'work')
    .flatMap((p) => PILLAR_ROUTE_PREFIXES[p].map((prefix) => ({ methods: null, pattern: compilePath(prefix, true) })));
  return [...WORK_RULES, ...pillarRules, ...extraRouteRules(env)];
}

/**
 * A path no rule may match: an encoded '/' or '\', a literal '\', or a '.' or
 * '..' segment (plain or %2e-encoded). The rules test the raw path, but Express
 * decodes a parameter, so '/modules/..%2F..%2FCLAUDE/prompt' matched
 * '/modules/:x/prompt' and the route was handed '../../CLAUDE' (2026-09-25).
 * No Work route has an id with a slash or a dot segment in it.
 */
export function hasEncodedSeparatorOrDotSegment(path: string): boolean {
  if (/%2f|%5c|\\/i.test(path)) return true;
  return path.split('/').some((seg) => {
    const s = seg.replace(/%2e/gi, '.');
    return s === '.' || s === '..';
  });
}

/** Whether a non-admin may call METHOD path (path under /api, e.g. '/sessions/abc'). */
export function demoRouteAllowed(method: string, path: string, rules: RouteRule[] = demoRouteRules()): boolean {
  if (hasEncodedSeparatorOrDotSegment(path)) return false;
  const m = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  return rules.some((r) => (r.methods === null || r.methods.has(m)) && r.pattern.test(path));
}

/**
 * Mounted on /api right after the auth middleware. Outside demo mode it does
 * nothing. In demo mode an admin passes; everyone else gets the Work routes
 * and the enabled pillars, and a 404 — the same answer as a route that does
 * not exist — for the rest.
 */
export function createDemoAllowlistMiddleware(): RequestHandler {
  let cached: { key: string; rules: RouteRule[] } | null = null;
  return function demoAllowlist(req: Request, res: Response, next: NextFunction): void {
    if (!isDemoMode()) { next(); return; }
    if (req.user?.role === 'admin') { next(); return; }
    const key = `${process.env.DEMO_ENABLED_PILLARS ?? ''}|${process.env.DEMO_EXTRA_ROUTES ?? ''}`;
    if (!cached || cached.key !== key) cached = { key, rules: demoRouteRules() };
    if (req.user && demoRouteAllowed(req.method, req.path, cached.rules)) { next(); return; }
    res.status(404).json({ error: 'Not available in this demo' });
  };
}

// ── Sign-up throttle ──────────────────────────────────────────────────────────

/**
 * Per-IP limit on POST /api/auth/demo-signup. Every attempt counts — a
 * success makes an account that spends budget, a failure is a guess at the
 * code. Behind a proxy req.ip needs TRUST_PROXY (index.ts).
 */
export function createDemoSignupLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: demoSignupsPerIpPerHour(),
    validate: false,
    keyGenerator: (req: Request) => (req.ip ?? 'unknown').replace(/^::ffff:/i, ''),
    message: { error: 'Too many sign-up attempts from this address. Try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

// ── Write throttle ────────────────────────────────────────────────────────────

/**
 * Per-account limit on the routes that store bytes (uploads, exports, version
 * saves), for index.ts to mount after the auth middleware. Counts only a
 * non-admin in demo mode; everyone else passes untouched. The general
 * per-user limiter allows 1,200 requests a minute, which is a disk-filling
 * rate for 10 MB uploads.
 */
export function createDemoWriteLimiter(): RequestHandler {
  return rateLimit({
    windowMs: 10 * 60 * 1000,
    max: () => demoUserWritesPer10Min(),
    validate: false,
    skip: (req: Request) => !isDemoMode() || !req.user || req.user.role === 'admin',
    keyGenerator: (req: Request) => `demo-write:${req.user?.id ?? 'anonymous'}`,
    message: { error: 'Too many uploads or exports from this demo account. Try again in a few minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
