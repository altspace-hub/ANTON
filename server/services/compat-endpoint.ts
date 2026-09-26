/**
 * compat-endpoint.ts — the one resolver for compat:<slug>:<model> model ids.
 *
 * provider-router, unified-llm-client and the Work route (routes/claude.ts) each
 * carried their own copy of "split the id, look the slug up, take the key". None
 * of them checked which model was named, so anyone could run any model an
 * endpoint offers on the owner's key (on OpenRouter that is several hundred, up
 * to about 3,000 times the price of the showcase model). They all resolve here
 * now, and the endpoint's allowed_models list (migration 288) is enforced here,
 * before anything is dispatched. On a public demo, so is the OpenRouter privacy
 * pin (assertDemoPrivacyPin, at the end of this file).
 *
 * The database is registered once at boot (setRouterDb). About sixty
 * callChat / streamChat call sites pass no `db`, and a compat default made
 * every one of them throw "Database adapter required …"; they now use the
 * registered one.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { resolveCustomEndpoint, type ResolvedEndpoint } from './custom-endpoint-resolver.js';
import { isDemoMode, demoAllowedProviders } from '../middleware/demo-mode.js';

// ── The database the routers fall back on ──────────────────────

let routerDb: DatabaseAdapter | null = null;

/** Register the database the routers use when a call site passes none (server boot). */
export function setRouterDb(db: DatabaseAdapter | null): void {
  routerDb = db;
}

export function getRouterDb(): DatabaseAdapter | null {
  return routerDb;
}

// ── Model metadata (filled by the health check from GET /models) ──

export interface CompatReasoningMeta {
  /** True when the model cannot switch reasoning off (GLM 5.3 Flash). */
  mandatory?: boolean;
  /** The reasoning.effort values the model accepts, e.g. ['low','high','max']. */
  supportedEfforts?: string[];
  defaultEffort?: string;
}

/** USD per million tokens, as the endpoint's /models listed it for the model. */
export interface CompatModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface CompatModelMeta {
  contextLength?: number;
  maxCompletionTokens?: number;
  inputModalities?: string[];
  /** Present when the model reasons; absent = send no reasoning field. */
  reasoning?: CompatReasoningMeta;
  supportedParameters?: string[];
  /**
   * The model's list price (OpenRouter's pricing.prompt / pricing.completion).
   * Prices a call the endpoint did not report a cost for — above all one that
   * was cut short, which never gets a usage chunk — when the admin set no
   * prices on the endpoint.
   */
  pricing?: CompatModelPricing;
}

function positiveInt(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function nonNegative(v: unknown): number | undefined {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** A stored { inputPerMillion, outputPerMillion } pair, both numbers ≥ 0. */
function normalizePricing(raw: unknown): CompatModelPricing | undefined {
  const o = asObject(raw);
  const input = nonNegative(o?.inputPerMillion);
  const output = nonNegative(o?.outputPerMillion);
  return input !== undefined && output !== undefined ? { inputPerMillion: input, outputPerMillion: output } : undefined;
}

/**
 * OpenRouter's pricing object: USD per token, as strings ("0.000000165").
 * A negative price (-1 marks a router with no fixed price) is no price.
 */
function pricingFromListing(raw: unknown): CompatModelPricing | undefined {
  const o = asObject(raw);
  const prompt = nonNegative(o?.prompt);
  const completion = nonNegative(o?.completion);
  if (prompt === undefined || completion === undefined) return undefined;
  // Per token → per million, rounded off the float noise of the multiplication.
  const perMillion = (x: number) => Math.round(x * 1_000_000 * 1e9) / 1e9;
  return { inputPerMillion: perMillion(prompt), outputPerMillion: perMillion(completion) };
}

function stringList(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string' && x.length > 0).map((x) => x.toLowerCase());
  return out.length > 0 ? out : undefined;
}

function asObject(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Coerce a stored model_meta entry (already in CompatModelMeta shape) — unknown keys dropped. */
export function normalizeModelMeta(raw: unknown): CompatModelMeta | undefined {
  const o = asObject(raw);
  if (!o) return undefined;
  const meta: CompatModelMeta = {};
  const contextLength = positiveInt(o.contextLength);
  if (contextLength) meta.contextLength = contextLength;
  const maxCompletionTokens = positiveInt(o.maxCompletionTokens);
  if (maxCompletionTokens) meta.maxCompletionTokens = maxCompletionTokens;
  const inputModalities = stringList(o.inputModalities);
  if (inputModalities) meta.inputModalities = inputModalities;
  const supportedParameters = stringList(o.supportedParameters);
  if (supportedParameters) meta.supportedParameters = supportedParameters;
  const r = asObject(o.reasoning);
  if (r) {
    const reasoning: CompatReasoningMeta = {};
    if (typeof r.mandatory === 'boolean') reasoning.mandatory = r.mandatory;
    const efforts = stringList(r.supportedEfforts);
    if (efforts) reasoning.supportedEfforts = efforts;
    if (typeof r.defaultEffort === 'string' && r.defaultEffort) reasoning.defaultEffort = r.defaultEffort.toLowerCase();
    meta.reasoning = reasoning;
  }
  const pricing = normalizePricing(o.pricing);
  if (pricing) meta.pricing = pricing;
  return meta;
}

/**
 * One entry of an OpenAI-compatible GET /models listing → CompatModelMeta.
 * OpenRouter reports context_length, top_provider.max_completion_tokens,
 * architecture.input_modalities, a reasoning object and supported_parameters;
 * a plain OpenAI-style listing reports none of them, which leaves the meta
 * empty (no reasoning field sent, no images accepted).
 */
export function metaFromListingEntry(entry: unknown): CompatModelMeta {
  const o = asObject(entry) ?? {};
  const meta: CompatModelMeta = {};
  const top = asObject(o.top_provider);
  // The smaller of the model's window and its top provider's: OpenRouter's
  // model-level context_length is the largest any provider serves (qwen3-32b
  // lists 131072 while its top provider serves 40960), so taking it alone
  // budgeted documents for a window the request never got.
  const windows = [positiveInt(o.context_length), positiveInt(top?.context_length)].filter((n): n is number => n !== undefined);
  if (windows.length > 0) meta.contextLength = Math.min(...windows);
  const maxCompletionTokens = positiveInt(top?.max_completion_tokens) ?? positiveInt(o.max_completion_tokens);
  if (maxCompletionTokens) meta.maxCompletionTokens = maxCompletionTokens;
  const arch = asObject(o.architecture);
  const inputModalities = stringList(arch?.input_modalities) ?? stringList(o.input_modalities);
  if (inputModalities) meta.inputModalities = inputModalities;
  const supportedParameters = stringList(o.supported_parameters);
  if (supportedParameters) meta.supportedParameters = supportedParameters;
  const r = asObject(o.reasoning);
  if (r) {
    const reasoning: CompatReasoningMeta = {};
    if (typeof r.mandatory === 'boolean') reasoning.mandatory = r.mandatory;
    const efforts = stringList(r.supported_efforts) ?? stringList(r.efforts) ?? stringList(r.supported_reasoning_efforts);
    if (efforts) reasoning.supportedEfforts = efforts;
    const def = r.default_effort ?? r.defaultEffort;
    if (typeof def === 'string' && def) reasoning.defaultEffort = def.toLowerCase();
    meta.reasoning = reasoning;
  } else if (supportedParameters?.includes('reasoning')) {
    // Takes a reasoning setting but says nothing more: optional reasoning.
    meta.reasoning = { mandatory: false };
  }
  const pricing = pricingFromListing(o.pricing);
  if (pricing) meta.pricing = pricing;
  return meta;
}

/** A GET /models response → the model ids and each one's metadata. */
export function parseModelsListing(data: unknown): { ids: string[]; meta: Record<string, CompatModelMeta> } {
  const list = asObject(data)?.data;
  const ids: string[] = [];
  const meta: Record<string, CompatModelMeta> = {};
  if (!Array.isArray(list)) return { ids, meta };
  for (const entry of list) {
    const id = asObject(entry)?.id;
    if (typeof id !== 'string' || !id) continue;
    ids.push(id);
    const m = metaFromListingEntry(entry);
    if (Object.keys(m).length > 0) meta[id] = m;
  }
  return { ids, meta };
}

export function modelAcceptsImages(meta: CompatModelMeta | undefined): boolean {
  return !!meta?.inputModalities?.includes('image');
}

// ── Resolution ───────────────────────────────────────────────────

/** An id that names no usable endpoint (bad form, unknown slug, no database). */
export class CompatEndpointError extends Error {
  readonly code: string = 'COMPAT_ENDPOINT';
  readonly status: number = 400;
  /** What the person may be told (publicErrorMessage); defaults to the message. */
  readonly publicMessage: string;
  constructor(message: string, publicMessage: string = message) {
    super(message);
    this.name = 'CompatEndpointError';
    this.publicMessage = publicMessage;
  }
}

/** A model the endpoint's allowed_models list does not name. */
export class CompatModelNotAllowedError extends CompatEndpointError {
  override readonly code = 'MODEL_NOT_ALLOWED';
  override readonly status = 403;
  constructor(readonly model: string, readonly slug: string) {
    super(`The model "${model}" is not offered on this server. Pick one of the models offered in the model menu.`);
    this.name = 'CompatModelNotAllowedError';
  }
}

export function parseCompatModelId(modelId: string): { slug: string; model: string } {
  const parts = modelId.split(':');
  const slug = parts[1];
  const model = parts.slice(2).join(':');
  if (parts[0] !== 'compat' || !slug || !model) {
    throw new CompatEndpointError(`Invalid compat model id: ${modelId} (expected compat:<slug>:<model>)`);
  }
  return { slug, model };
}

/** True when the endpoint lets this bare model run (an empty list lets any model run). */
export function isModelAllowedOnEndpoint(endpoint: Pick<ResolvedEndpoint, 'allowedModels'>, model: string): boolean {
  return endpoint.allowedModels.length === 0 || endpoint.allowedModels.includes(model);
}

export interface EndpointPricingPair {
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface ResolvedCompatModel {
  /** The full id, compat:<slug>:<model>. */
  modelId: string;
  slug: string;
  /** The bare model id the endpoint expects. */
  model: string;
  endpoint: ResolvedEndpoint;
  meta: CompatModelMeta | undefined;
  /** Admin prices when both are set; null otherwise. */
  pricing: EndpointPricingPair | null;
}

/**
 * Resolve a compat:<slug>:<model> id to its endpoint, refusing a model the
 * endpoint does not allow and, on a demo, an OpenRouter endpoint without the
 * privacy pin. `db` falls back on the registered router database.
 */
export async function resolveCompatModel(modelId: string, db?: DatabaseAdapter): Promise<ResolvedCompatModel> {
  const { slug, model } = parseCompatModelId(modelId);
  const target = db ?? routerDb;
  if (!target) {
    throw new CompatEndpointError(
      'Database adapter required to resolve a compat: model endpoint (setRouterDb was not called at boot)',
      'This AI model is not available on this server right now.',
    );
  }
  const endpoint = await resolveCustomEndpoint(target, slug);
  if (!endpoint) {
    throw new CompatEndpointError(`No enabled custom model endpoint with slug "${slug}". Add one in Settings → Local & cost-effective models.`);
  }
  if (!isModelAllowedOnEndpoint(endpoint, model)) {
    throw new CompatModelNotAllowedError(model, slug);
  }
  // A demo sends nothing to OpenRouter without the privacy pin. Here, the Work
  // route refuses the run before anything is saved; the adapter checks again
  // for a caller that did not come through this resolver.
  assertDemoPrivacyPin({ slug, baseUrl: endpoint.baseUrl, extraBody: endpoint.extraBody });
  const pricing = endpoint.inputPricePerMillion !== null && endpoint.outputPricePerMillion !== null
    ? { inputPerMillion: endpoint.inputPricePerMillion, outputPerMillion: endpoint.outputPricePerMillion }
    : null;
  return {
    modelId,
    slug,
    model,
    endpoint,
    meta: normalizeModelMeta(endpoint.modelMeta[model]),
    pricing,
  };
}

// ── The demo's privacy pin (OpenRouter) ─────────────────────────

/** True when the base URL is OpenRouter's API (openrouter.ai or a subdomain of it). */
export function isOpenRouterBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}

/** The name missingPrivacyPinSettings gives a provider.only that reaches past the allowed providers. */
export const PROVIDER_ONLY_OUTSIDE_ALLOWED = 'provider.only (a provider not in DEMO_ALLOWED_PROVIDERS)';

/**
 * What an OpenRouter extra body leaves out of the privacy pin a public demo
 * sends with every request: provider.zdr = true (zero-data-retention
 * endpoints only), provider.data_collection = 'deny' (no provider that stores
 * or trains on prompts) and a non-empty provider.only (the named providers and
 * no other). With allowedProviders, every entry of provider.only must also be
 * one of them (case-insensitive): a pin to a provider the privacy notice does
 * not name is not the pin it promises. Setting names only, never values;
 * empty = the pin is complete.
 */
export function missingPrivacyPinSettings(
  extraBody: Record<string, unknown> | null | undefined,
  allowedProviders?: readonly string[] | null,
): string[] {
  const provider = asObject(extraBody?.provider);
  const only = provider?.only;
  const missing: string[] = [];
  if (provider?.zdr !== true) missing.push('provider.zdr');
  if (provider?.data_collection !== 'deny') missing.push('provider.data_collection');
  if (!Array.isArray(only) || only.length === 0 || !only.every((p) => typeof p === 'string' && p.trim() !== '')) {
    missing.push('provider.only');
  } else if (allowedProviders) {
    const allowed = new Set(allowedProviders.map((p) => p.trim().toLowerCase()));
    if (!only.every((p) => allowed.has(String(p).trim().toLowerCase()))) missing.push(PROVIDER_ONLY_OUTSIDE_ALLOWED);
  }
  return missing;
}

export const DEMO_PRIVACY_PIN_MESSAGE =
  'The AI service is switched off on this demo because its privacy settings are incomplete. Nothing was sent. Please try again later.';

/** A demo call to OpenRouter refused because the endpoint's extra body lacks the privacy pin. */
export class CompatPrivacyPinError extends CompatEndpointError {
  override readonly code = 'DEMO_PRIVACY_PIN_MISSING';
  override readonly status = 503;
  constructor(readonly slug: string | null, readonly missing: readonly string[]) {
    super(
      `refused a call to the OpenRouter endpoint ${slug ? `"${slug}"` : '(slug unknown)'}: its extra body lacks ${missing.join(', ')}. Nothing was sent.`,
      DEMO_PRIVACY_PIN_MESSAGE,
    );
    this.name = 'CompatPrivacyPinError';
  }
}

/**
 * In demo mode, refuse a call to an OpenRouter endpoint whose extra body lacks
 * the privacy pin, before anything is sent (privacy review H9). The privacy
 * notice says every request asks for zero retention and no data collection
 * and goes only to the pinned provider; that rests on an extra body an admin
 * saved, and an edited or lost one would send visitors' prompts to any
 * provider. provider.only must name DEMO_ALLOWED_PROVIDERS only (default
 * "inceptron"), so an endpoint saved from an older preset that also names
 * another provider is refused too. The log line names the slug and the missing
 * settings, never the URL, the key, the body or a provider. Outside demo mode,
 * or for another endpoint, nothing is checked.
 */
export function assertDemoPrivacyPin(
  endpoint: { slug: string | null; baseUrl: string; extraBody?: Record<string, unknown> | null },
  env: Record<string, string | undefined> = process.env,
): void {
  if (!isDemoMode(env) || !isOpenRouterBaseUrl(endpoint.baseUrl)) return;
  const missing = missingPrivacyPinSettings(endpoint.extraBody, demoAllowedProviders(env));
  if (missing.length === 0) return;
  const err = new CompatPrivacyPinError(endpoint.slug, missing);
  console.warn(`[demo] ${err.message}`);
  throw err;
}

