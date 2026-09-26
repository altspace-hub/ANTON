/**
 * claude-lineup.ts — the Claude model each tier resolves to on the API path.
 *
 * One place to move when Anthropic ships a model. The large / medium / small
 * tiers (provider-router TIER_MAP), the utility model default (and through it
 * the Double-check verifier default), mission tier defaults, the portal depth
 * map, the auto-quoter and the batch default all read these constants rather
 * than naming a model themselves — so when Haiku 5.5 ships, moving the small
 * tier (the default second-opinion model) is: add it to MODEL_CAPABILITIES
 * (server/config/model-capabilities.ts) and REGISTRY_SUPPLEMENT
 * (server/types/modelAdapter.ts), then change CLAUDE_SMALL below. Sonnet 5.5
 * is the same move on CLAUDE_MEDIUM.
 *
 * tests/config/claude-lineup.test.ts fails when a lineup id is not in the
 * capability table, and when a server file names the small-tier model itself.
 *
 * The subscription engine (sdk: ids) is not governed here: its large tier is
 * the Settings default and its medium/small tiers are provider-router's
 * TIER_MAP.anthropic_sdk.
 *
 * A pure leaf — no imports — so config, services and routes can all read it.
 */

/** Long, hard reasoning; planning. Opus 5.5 since 2026-09-23 (owner): newer
 *  than Opus 4.8 and cheaper ($4/$20 against $5/$25). */
export const CLAUDE_LARGE = 'claude-opus-5-5';

/** Day-to-day module work; mission execution. */
export const CLAUDE_MEDIUM = 'claude-sonnet-4-6';

/** Utility calls (extraction, scoring, naming) and the Double-check second
 *  opinion. Haiku 5.5 replaces Haiku 4.5 here when it is released. */
export const CLAUDE_SMALL = 'claude-haiku-4-5-20251001';

export const CLAUDE_LINEUP = { large: CLAUDE_LARGE, medium: CLAUDE_MEDIUM, small: CLAUDE_SMALL } as const;
