/**
 * compat-model-policy.ts — what the model picker may offer, and what a
 * `compat:<slug>:<model>` model (an OpenAI-compatible endpoint such as
 * OpenRouter) cannot do in ANTON.
 *
 * Pure helpers, shared by the model picker, the thinking-level control, the
 * web-search toggle and the multi-agent panel, so the four surfaces tell the
 * same story. The server enforces the same rules (the endpoint's
 * allowedModels, the demo's offered models); these only keep the page from
 * offering what the server would refuse or silently skip.
 */
import type { ModelId, ThinkingLevel } from './types';

// ── compat: ids ─────────────────────────────────────────────────────────────

export function isCompatModelId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('compat:');
}

/** `compat:openrouter:z-ai/glm-5.3-flash` → { slug: 'openrouter', model: 'z-ai/glm-5.3-flash' }. */
export function compatParts(id: string): { slug: string; model: string } | null {
  if (!isCompatModelId(id)) return null;
  const rest = id.slice('compat:'.length);
  const colon = rest.indexOf(':');
  if (colon <= 0 || colon === rest.length - 1) return null;
  return { slug: rest.slice(0, colon), model: rest.slice(colon + 1) };
}

// ── Picker options from the endpoints list ─────────────────────────────────

/** The fields of GET /api/settings/model-endpoints the picker reads. */
export interface PickerCompatEndpoint {
  slug: string;
  displayName: string;
  defaultModel: string | null;
  availableModels: string[];
  /** Non-empty = only these bare model ids may run on the endpoint. */
  allowedModels?: string[];
  enabled: boolean;
}

export interface CompatPickerOption {
  id: ModelId;
  model: string;
  endpointName: string;
}

/**
 * The bare model ids an endpoint offers: its allow-list when an admin set one
 * (the server refuses anything else), else what the health check discovered,
 * else its default model.
 */
export function endpointPickerModels(ep: PickerCompatEndpoint): string[] {
  const allowed = (ep.allowedModels ?? []).filter((m) => m.trim().length > 0);
  if (allowed.length > 0) return allowed;
  const available = ep.availableModels ?? [];
  if (available.length > 0) return available;
  return ep.defaultModel ? [ep.defaultModel] : [];
}

export function compatPickerOptions(endpoints: PickerCompatEndpoint[]): CompatPickerOption[] {
  return endpoints
    .filter((ep) => ep.enabled)
    .flatMap((ep) =>
      endpointPickerModels(ep).map((m) => ({
        id: `compat:${ep.slug}:${m}` as ModelId,
        model: m,
        endpointName: ep.displayName,
      })),
    );
}

/**
 * When the selected id is a compat model its endpoint's allow-list excludes,
 * name it — the server will refuse the run. Null when it is allowed, or when
 * the endpoint is not known to this page.
 */
export function compatModelNotAllowed(
  value: string,
  endpoints: PickerCompatEndpoint[],
): { model: string; endpointName: string } | null {
  const parts = compatParts(value);
  if (!parts) return null;
  const ep = endpoints.find((e) => e.slug === parts.slug);
  const allowed = (ep?.allowedModels ?? []).filter((m) => m.trim().length > 0);
  if (!ep || allowed.length === 0 || allowed.includes(parts.model)) return null;
  return { model: parts.model, endpointName: ep.displayName };
}

// ── Demo mode (public /api/config) ─────────────────────────────────────────

export interface PublicModelConfig {
  demoMode: boolean;
  /** Full model ids a demo offers, e.g. compat:openrouter:z-ai/glm-5.3-flash. */
  offeredModels: string[];
}

const NOT_DEMO: PublicModelConfig = { demoMode: false, offeredModels: [] };

/** Reads the two fields the picker needs from GET /api/config; anything else = not a demo. */
export function readPublicModelConfig(data: unknown): PublicModelConfig {
  if (!data || typeof data !== 'object') return NOT_DEMO;
  const rec = data as Record<string, unknown>;
  if (rec.demoMode !== true) return NOT_DEMO;
  const offered = Array.isArray(rec.offeredModels)
    ? rec.offeredModels.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : [];
  return { demoMode: true, offeredModels: offered };
}

let publicConfigPromise: Promise<PublicModelConfig> | null = null;

/** GET /api/config once per page load (public, no auth). A failed fetch is not cached. */
export function loadPublicModelConfig(): Promise<PublicModelConfig> {
  if (!publicConfigPromise) {
    publicConfigPromise = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => readPublicModelConfig(data))
      .catch(() => {
        publicConfigPromise = null;
        return NOT_DEMO;
      });
  }
  return publicConfigPromise;
}

/** Tests only. */
export function resetPublicModelConfigCache(): void {
  publicConfigPromise = null;
}

/** True when the picker must show the demo's offered models and nothing else. */
export function pickerRestrictedToOffered(config: PublicModelConfig | null): boolean {
  return !!config && config.demoMode && config.offeredModels.length > 0;
}

/**
 * On a demo, a selection outside the offered list (a stale default such as the
 * built-in Claude id every new browser starts with, or a restored session) is
 * replaced by the first offered model. Null = leave the selection alone.
 */
export function demoModelCorrection(value: string, config: PublicModelConfig | null): ModelId | null {
  if (!config || !pickerRestrictedToOffered(config)) return null;
  if (config.offeredModels.includes(value)) return null;
  return config.offeredModels[0] as ModelId;
}

export interface OfferedPickerOption {
  id: ModelId;
  label: string;
  /** The endpoint's display name for a compat model. */
  detail: string | null;
}

export function offeredPickerOptions(
  offered: string[],
  endpoints: PickerCompatEndpoint[],
  builtIns: ReadonlyArray<{ id: string; label: string }>,
): OfferedPickerOption[] {
  return offered.map((id) => {
    const parts = compatParts(id);
    if (parts) {
      const ep = endpoints.find((e) => e.slug === parts.slug);
      return { id: id as ModelId, label: parts.model, detail: ep?.displayName ?? parts.slug };
    }
    const builtIn = builtIns.find((m) => m.id === id);
    return { id: id as ModelId, label: builtIn?.label ?? id, detail: null };
  });
}

// ── What a compat model cannot do ──────────────────────────────────────────

/**
 * The two levels that run as multi-step revelation chains (Investigate, Deep).
 * The chain runs on Claude engines only; on a compat model the server sends
 * one call instead, so the page does not offer them there.
 */
export const COMPAT_UNAVAILABLE_THINKING_LEVELS: ReadonlySet<ThinkingLevel> = new Set<ThinkingLevel>([
  'investigate',
  'deep_investigate',
]);

/** The level a compat run moves to when it holds one of the chain levels. */
export const COMPAT_THINKING_FALLBACK: ThinkingLevel = 'think_hard';

export function thinkingLevelUnavailable(level: ThinkingLevel, model: string | null | undefined): boolean {
  return isCompatModelId(model) && COMPAT_UNAVAILABLE_THINKING_LEVELS.has(level);
}

/** The level to switch to, or null when the current one can run on this model. */
export function compatThinkingFallback(level: ThinkingLevel, model: string | null | undefined): ThinkingLevel | null {
  return thinkingLevelUnavailable(level, model) ? COMPAT_THINKING_FALLBACK : null;
}

/** ANTON's web search is Claude's server tool; a compat endpoint gets no search. */
export function webSearchUnavailable(model: string | null | undefined): boolean {
  return isCompatModelId(model);
}

/** Multi-agent mode runs parallel Claude instances; a compat run is one call. */
export function multiAgentUnavailable(model: string | null | undefined): boolean {
  return isCompatModelId(model);
}

/** A short name for the model in an explanation: the bare model of a compat id. */
export function modelShortName(model: string): string {
  return compatParts(model)?.model ?? model;
}
