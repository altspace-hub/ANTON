/**
 * engagement-run-policy.ts — what a model call made by an Engagement Task may
 * do, and for whom (public showcase, 2026-10-02).
 *
 * The engagement routes (routes/engagements.ts) call a model on their own —
 * document extraction, the intake interview, the execution, the gap lenses,
 * the team extraction, the peer-benchmark search and the quality gate — not
 * through /api/claude/message, so none of the Work route's rules reached them:
 *
 *   - which model may run: on a demo (DEMO_MODE=true) a visitor — any
 *     non-admin — runs only the models DEMO_OFFERED_MODELS lists (with no
 *     list, only compat: models), as the Work route and the rerun decide. An
 *     engagement pinned to another model is refused; "Auto" and the utility
 *     calls fall back to the demo's default, else its first offered model;
 *   - web search: only the Anthropic API (the web_search tool) and the Claude
 *     subscription engine (WebSearch / WebFetch) search the web. Every other
 *     provider — an OpenRouter compat: model, Ollama, OpenAI, Mistral — drops
 *     the tool, and the answer would come back without sources and without
 *     saying so. A step that would search refuses instead, with a sentence the
 *     person can act on (modelSearchesWeb, webSearchRefusal);
 *   - the monthly token budget (users.monthly_token_budget): checked before a
 *     call and charged after it, in team mode, as every other model route does.
 *
 * Admins and ordinary servers keep every model and engine; the budget applies
 * to every team user, as on the Work route.
 */
import type { DatabaseAdapter } from '../db/database.js';
import { isDemoMode, demoOfferedModels } from '../middleware/demo-mode.js';
import { checkBudgetBeforeApiCall, chargeMonthlyUsage } from './budget-manager.js';
import { getRoutedUtilityModel } from './utility-model.js';
import { mapModelToProvider } from './provider-router.js';
import { getEffectiveDefaultModel } from './default-model-store.js';
import { resolveEngagementModelChoice } from './engagement-exec-model.js';

/** The part of an Express request these rules read. */
export interface EngagementCaller {
  user?: { id?: string; role?: string } | null;
}

/** The engagement fields the model choice reads. */
export interface EngagementModelFields {
  exec_model?: unknown;
  thinking_level?: unknown;
}

/** True for a non-admin on a public demo: held to the demo's models and features. */
export function isDemoVisitor(req: EngagementCaller): boolean {
  return isDemoMode() && req.user?.role !== 'admin';
}

/**
 * Whether a demo visitor may run this model in an engagement: DEMO_OFFERED_MODELS,
 * or with no list any compat: model. Never a subscription engine (sdk:,
 * codex:), even when offered: on the Claude engine an engagement execution is
 * the agentic runner, with tools that read across the instance (expert
 * modules, knowledge packs) for up to 40 minutes.
 */
export function demoVisitorMayRun(model: string): boolean {
  if (model.startsWith('sdk:') || model.startsWith('codex:')) return false;
  const offered = demoOfferedModels();
  return offered.length > 0 ? offered.includes(model) : model.startsWith('compat:');
}

/** The refusal the Work route gives a visitor for a model the demo does not offer. */
export const MODEL_NOT_OFFERED_MESSAGE = 'This model is not offered in this demo. Pick one of the models in the model menu.';

/**
 * A model call refused before anything is sent. `publicMessage` is written for
 * the person (publicErrorMessage shows it in production too); `status` and
 * `code` are what the route answers.
 */
export class EngagementCallRefusal extends Error {
  readonly status: number;
  readonly code: string;
  readonly publicMessage: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'EngagementCallRefusal';
    this.status = status;
    this.code = code;
    this.publicMessage = message;
  }
}

export function isEngagementCallRefusal(err: unknown): err is EngagementCallRefusal {
  return err instanceof EngagementCallRefusal;
}

/** The model a visitor's unpinned call runs on: the demo's default when offered, else the first offered model. */
function visitorFallbackModel(): string | null {
  const def = (getEffectiveDefaultModel() ?? '').trim();
  if (def && demoVisitorMayRun(def)) return def;
  return demoOfferedModels()[0] ?? null;
}

/**
 * The model an engagement's own work runs on (the execution and the intake):
 * its pinned exec_model, else the product default, else the legacy
 * thinking-level mapping, through the provider routing. For a demo visitor a
 * pinned model the demo does not offer is refused (MODEL_NOT_OFFERED); an
 * unpinned one falls back to the demo's default.
 */
export function engagementExecModel(
  req: EngagementCaller,
  engagement: EngagementModelFields,
  thinkingLevel?: string,
): string {
  const level = thinkingLevel ?? String(engagement.thinking_level || 'think_hard');
  const pinned = typeof engagement.exec_model === 'string' ? engagement.exec_model.trim() : '';
  // The pinned id itself is judged, as the Work route judges the id it is
  // sent: provider routing would quietly turn a pinned claude- id into the
  // demo's default, and the page would go on naming a model the demo does
  // not run.
  if (pinned && isDemoVisitor(req) && !demoVisitorMayRun(pinned)) {
    throw new EngagementCallRefusal(403, 'MODEL_NOT_OFFERED', MODEL_NOT_OFFERED_MESSAGE);
  }
  const resolved = mapModelToProvider(resolveEngagementModelChoice(pinned || null, level, getEffectiveDefaultModel() ?? null));
  if (!isDemoVisitor(req) || demoVisitorMayRun(resolved)) return resolved;
  if (pinned) throw new EngagementCallRefusal(403, 'MODEL_NOT_OFFERED', MODEL_NOT_OFFERED_MESSAGE);
  const fallback = visitorFallbackModel();
  if (fallback) return fallback;
  throw new EngagementCallRefusal(403, 'MODEL_NOT_OFFERED', 'No model is offered in this demo.');
}

/**
 * The model of an engagement's utility calls (extraction, gap lenses, team
 * extraction, quality gate): the routed utility model. A demo visitor gets it
 * only when the demo offers it, else the demo's default.
 */
export async function engagementUtilityModel(db: DatabaseAdapter, req: EngagementCaller): Promise<string> {
  const utility = await getRoutedUtilityModel(db);
  if (!isDemoVisitor(req) || demoVisitorMayRun(utility)) return utility;
  const fallback = visitorFallbackModel();
  if (fallback) return fallback;
  throw new EngagementCallRefusal(403, 'MODEL_NOT_OFFERED', 'No model is offered in this demo.');
}

/**
 * Whether a call on this model actually searches the web when ANTON's
 * web_search tool is attached: the Anthropic API (a bare claude- id after
 * provider routing) and the Claude subscription engine (sdk:, which grants
 * WebSearch + WebFetch for it). compat:, ollama:, azure:, codex: and the other
 * API providers drop it or cannot run it.
 */
export function modelSearchesWeb(model: string): boolean {
  const m = model.trim();
  return m.startsWith('claude-') || m.startsWith('sdk:');
}

/**
 * The refusal for a step that needs web search on a model that cannot search.
 * `remedy` says what the person can change, e.g. "Switch web search off under
 * Resources → Knowledge Sources".
 */
export function webSearchRefusal(model: string, what: string, remedy: string): EngagementCallRefusal {
  return new EngagementCallRefusal(
    409,
    'WEB_SEARCH_UNAVAILABLE',
    `${what} needs web search, but the model "${model}" cannot search the web, so the answer would have no web sources. ${remedy}`,
  );
}

/** A rough token count of what will be sent (about three characters a token, as the budget middleware estimates). */
export function estimateTokens(...texts: Array<string | null | undefined>): number {
  const chars = texts.reduce((n, t) => n + (t ? t.length : 0), 0);
  return Math.ceil(chars / 3);
}

/**
 * Why the caller's monthly token budget does not cover a call of about
 * `estimatedTokens`, or null when it does. Team mode only (solo and the solo
 * user are not counted, as chargeMonthlyUsage); an account with no budget set
 * is unlimited.
 */
export async function engagementBudgetRefusal(
  db: DatabaseAdapter,
  req: EngagementCaller,
  estimatedTokens: number,
): Promise<string | null> {
  if (process.env.DEPLOYMENT_MODE !== 'team') return null;
  const userId = req.user?.id;
  if (!userId || userId === 'solo') return null;
  const check = await checkBudgetBeforeApiCall(db, userId, Math.max(0, Math.ceil(estimatedTokens)));
  return check.allowed ? null : (check.reason ?? 'Monthly budget exceeded');
}

/** The answer a route sends for a budget refusal: the budget middleware's shape, with a code. */
export function budgetRefusalBody(reason: string): { error: string; reason: string; code: 'BUDGET_EXCEEDED' } {
  return { error: 'Budget limit exceeded', reason, code: 'BUDGET_EXCEEDED' };
}

/** Adds one call's tokens to the caller's monthly usage (team mode). Never throws. */
export async function chargeEngagementCall(
  db: DatabaseAdapter,
  req: EngagementCaller,
  usage: { inputTokens?: number | null; outputTokens?: number | null } | null | undefined,
): Promise<void> {
  if (!usage) return;
  await chargeMonthlyUsage(db, req.user ?? null, usage.inputTokens ?? 0, usage.outputTokens ?? 0);
}
