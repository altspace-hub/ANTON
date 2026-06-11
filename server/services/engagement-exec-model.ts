/**
 * engagement-exec-model.ts — model choice for engagement execution.
 *
 * (CORE_EXPERIENCE_REVIEW 2026-06, item 4.4.) Before this module the
 * engagement execute route hardcoded quick → Haiku, everything else →
 * Opus, ignoring both the per-session/user model work and the Settings
 * default model (default-model-store). Resolution order is now:
 *
 *   1. engagements.exec_model — the explicit per-engagement choice made
 *      in the Expert Config phase ("Auto" stores NULL).
 *   2. The product default (default-model-store: Settings > env
 *      DEFAULT_MODEL) — the same precedence every other server-side
 *      resolver follows.
 *   3. Legacy thinking-level mapping: quick → Haiku, else Opus
 *      (preserves pre-4.4 behaviour on untouched installs).
 *
 * The returned id is then passed through mapModelToProvider by the
 * caller so non-Anthropic installs route to their configured provider —
 * the standard multi-provider seam.
 */

const LEGACY_QUICK_MODEL = 'claude-haiku-4-5-20251001';
const LEGACY_DEEP_MODEL = 'claude-opus-4-8';

/**
 * Pure resolution of the pre-provider-routing model id.
 *
 * @param storedModel    engagements.exec_model (null/empty = Auto)
 * @param thinkingLevel  engagements.thinking_level
 * @param productDefault getEffectiveDefaultModel() at call time (may be undefined)
 */
export function resolveEngagementModelChoice(
  storedModel: string | null | undefined,
  thinkingLevel: string,
  productDefault: string | null | undefined,
): string {
  const explicit = typeof storedModel === 'string' ? storedModel.trim() : '';
  if (explicit) return explicit;
  const def = typeof productDefault === 'string' ? productDefault.trim() : '';
  if (def) return def;
  return thinkingLevel === 'quick' ? LEGACY_QUICK_MODEL : LEGACY_DEEP_MODEL;
}
