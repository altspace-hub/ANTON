/**
 * current-date.ts — the one place that tells a model what day it is.
 *
 * 2026-09-22. No prompt ANTON sent carried the current date. The API engine never
 * added one, and the subscription engine passes each prompt as a plain `systemPrompt`
 * string, which REPLACES Claude Code's default prompt — including the environment
 * block that normally carries the date. Every call left the model to infer "now" from
 * its training, which for a model trained to mid-2026 is BEFORE the dates much of the
 * catalogue turns on: Directive (EU) 2024/825 applies from 27 September 2026, and the
 * Cyber Resilience Act reporting duty became mandatory on 11 September 2026.
 *
 * Two users of this module:
 *   - prompt-composer.ts places it as a named layer — first in the dynamic half — so
 *     a module run shows it in the preview and the run record;
 *   - provider-router.ts appends it to every other call's system prompt, so the gap
 *     assessor, agents, Pathfinder, missions, School mode and the utility calls get
 *     it without each one remembering to.
 *
 * `hasCurrentDate` is how the second defers to the first: a system prompt that
 * already carries the heading is left alone, so no call ever states the date twice.
 */

export const CURRENT_DATE_HEADING = '## CURRENT DATE';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * The block itself.
 *
 * LOCAL date, not UTC. ANTON is local-first: the server's clock is the user's clock.
 * At 00:30 on 27 September in Stockholm it is still 26 September in UTC, and
 * `toISOString()` would put the user on the wrong side of exactly the kind of line
 * this exists for.
 *
 * Weekday included because deadline arithmetic needs it — "within 72 hours", "by the
 * next business day" — and fixed tables rather than toLocaleDateString(), whose output
 * depends on the ICU build the server happens to ship with.
 */
export function currentDateBlock(now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return [
    CURRENT_DATE_HEADING,
    `Today is ${WEEKDAYS[now.getDay()]} ${d} ${MONTHS[m]} ${y} (${iso}).`,
    '',
    'Treat this as the date of this request. Where a rule, obligation or deadline turns on a '
      + 'date — a regime that applies from a given day, a transposition deadline, a reporting '
      + 'clock — compare it against today, not against when your training ended. Something '
      + 'your training records as upcoming may already be in force, and something it records '
      + 'as current may have been replaced.',
  ].join('\n');
}

/** True when a prompt already states the date, so it must not be stated twice. */
export function hasCurrentDate(text: string | undefined | null): boolean {
  return typeof text === 'string' && text.includes(CURRENT_DATE_HEADING);
}

/**
 * The system prompt with the date appended — at the END, never the start.
 *
 * The end is what keeps caching intact. The subscription engine sends a system prompt
 * as one string and caches its prefix, so a date at the front would change the prefix
 * every midnight; on the API engine this text is the uncached block whenever a static
 * block is sent beside it. Appending leaves every cached byte where it was.
 */
export function appendCurrentDate(system: string, now: Date = new Date()): string {
  if (hasCurrentDate(system)) return system;
  const block = currentDateBlock(now);
  const trimmed = (system ?? '').trimEnd();
  return trimmed ? `${trimmed}\n\n---\n\n${block}` : block;
}

/**
 * A call config with the date added to its `system` prompt, for the two routers.
 *
 * ANTON has two dispatch layers, not one: provider-router.ts (callChat / streamChat)
 * and unified-llm-client.ts (streamToResponse / sendRequest / streamToHandler), the
 * second serving the Civic, Grow and Procure pillars, the companion app, the intent
 * router and smart actions. Both apply this at their entry points, so a path cannot
 * reach a model without the date by choosing the other router.
 *
 * Left unchanged when the caller opts out (`currentDate: false`, for byte-exact
 * replay), or when EITHER half already states the date — a composed Work run carries
 * it in its dynamic part. The date goes into `system`, the uncached half, and never
 * into `staticSystemPrompt`, so a cached block is never touched.
 */
export function withCurrentDate<T extends { system: string; staticSystemPrompt?: string; currentDate?: boolean }>(
  config: T,
  now: Date = new Date(),
): T {
  if (config.currentDate === false) return config;
  if (hasCurrentDate(config.system) || hasCurrentDate(config.staticSystemPrompt)) return config;
  return { ...config, system: appendCurrentDate(config.system ?? '', now) };
}
