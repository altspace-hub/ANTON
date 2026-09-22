/**
 * app-module-pins.ts — what the companion app's home screen pins, and which
 * intent chips it offers (Wave 6 track B, 2026-09-18).
 *
 * Until this file existed, both were module-scope constants: four financial-
 * crime modules (`sanctions-advisory`, `gap-analysis`, `document-creation`,
 * `regulatory-monitor`) and four compliance-consultant chips ("Draft something
 * / Review a contract / Explain a regulation / Run a scan"), served identically
 * to every phone paired to every ANTON. The companion app is not a compliance
 * product — migration 094's own header states the model: *"Organisations run
 * ANTON; people they serve connect via a lightweight companion app."* The app
 * user is who the org **serves**.
 *
 * Three signals for that are already in the database, so nothing new is stored:
 *
 *   1. `app_sessions.resolved_module_id` — written whenever a session is opened
 *      with a moduleId. Grouped by `connected_user_id`, it is literally "what
 *      this person opens on their phone".
 *   2. `org_intent_categories` — the per-org routing config an admin fills in
 *      (`default_module_id`, `allowed_modules`, `name`, `priority`). An
 *      explicit statement of what this deployment is for.
 *   3. `org_profiles.org_type` — school / ngo / sports_club / consulting /
 *      consulting_firm / company / community / government / healthcare / other.
 *
 * The ladder ends at today's four. An org with no usage, no intent categories
 * and an unmapped org_type sees exactly what it sees now, so re-pinning is
 * additive rather than destructive; a consulting deployment keeps the financial-
 * crime set by explicit mapping rather than by accident.
 *
 * Everything here is pure — the route does the querying.
 */

export const PIN_COUNT = 4;
export const CHIP_COUNT = 4;

/** Hard caps so an org-supplied category name cannot deform the chip row. */
const CHIP_MAX_CHARS = 40;

/** What the home screen pinned for everyone before this file. The last rung. */
export const LEGACY_PINS: readonly string[] = [
  'sanctions-advisory', 'gap-analysis', 'document-creation', 'regulatory-monitor',
];

/** The chips that shipped with the Evolution design. Also the last rung. */
export const LEGACY_CHIPS: readonly string[] = [
  'Draft something', 'Review a contract', 'Explain a regulation', 'Run a scan',
];

/**
 * Starter pins per `org_profiles.org_type`, for the types where the served
 * population is implied by the type itself. A type that is absent (company,
 * sports_club, other) falls through to LEGACY_PINS rather than to a set
 * invented for it. Every id here is asserted against the catalogue by
 * `tests/services/app-module-pins.test.ts`.
 */
export const ORG_TYPE_PINS: Readonly<Record<string, readonly string[]>> = {
  ngo: ['symptom-assessment', 'government-subsidy-finder', 'budget-builder', 'employment-rights-checker'],
  community: ['symptom-assessment', 'budget-builder', 'business-registration-guide', 'scam-fraud-warning'],
  school: ['homework-helper', 'exam-preparation-guide', 'numeracy-maths-helper', 'digital-literacy-basics'],
  healthcare: ['symptom-assessment', 'maternal-child-health', 'medicine-dosage-safety', 'disease-prevention-first-aid'],
  government: ['document-id-application', 'government-subsidy-finder', 'permit-license-guide', 'social-protection-navigator'],
  consulting: LEGACY_PINS,
  consulting_firm: LEGACY_PINS,
};

/** Intent chips per org_type, on the same rules as ORG_TYPE_PINS. */
export const ORG_TYPE_CHIPS: Readonly<Record<string, readonly string[]>> = {
  ngo: ['Ask a health question', 'Money and saving', 'Know my rights', 'Government support'],
  community: ['Ask a health question', 'Money and saving', 'Know my rights', 'Government support'],
  school: ['Help with homework', 'Explain this topic', 'Prepare for an exam', 'Practise a language'],
  healthcare: ['Check a symptom', 'Medicine questions', 'Caring for a child', 'Preventing illness'],
  government: ['Get a document', 'Support I qualify for', 'Apply for a permit', 'Make a complaint'],
  consulting: LEGACY_CHIPS,
  consulting_firm: LEGACY_CHIPS,
};

/** The signals the route gathers, strongest first. */
export interface PinSignals {
  /** Modules this connected user has opened in this org, most-used first. */
  personal?: readonly string[];
  /** Modules the org's own active intent categories route to, by priority. */
  configured?: readonly string[];
  /** Modules this org's users open most, across all of them. */
  orgPopular?: readonly string[];
  /** `org_profiles.org_type`. */
  orgType?: string | null;
}

function take(out: string[], candidates: readonly string[], isKnown: (id: string) => boolean, limit: number): void {
  for (const id of candidates) {
    if (out.length >= limit) return;
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (!trimmed || out.includes(trimmed) || !isKnown(trimmed)) continue;
    out.push(trimmed);
  }
}

/**
 * The module ids to pin, in order. Walks the ladder — this person's own use,
 * then the org's configuration, then the org's aggregate use, then the
 * org-type starter set, then today's four — stopping at `limit`. Anything the
 * catalogue cannot serve is skipped, so a retired id never ships a dead tile.
 */
export function resolvePinnedModuleIds(
  signals: PinSignals,
  isKnown: (id: string) => boolean,
  limit: number = PIN_COUNT,
): string[] {
  const out: string[] = [];
  take(out, signals.personal ?? [], isKnown, limit);
  take(out, signals.configured ?? [], isKnown, limit);
  take(out, signals.orgPopular ?? [], isKnown, limit);
  take(out, ORG_TYPE_PINS[signals.orgType ?? ''] ?? [], isKnown, limit);
  take(out, LEGACY_PINS, isKnown, limit);
  return out;
}

/**
 * The intent chips to offer. The org's own active intent-category names come
 * first — an admin who has configured "Report a repair" has said what this
 * deployment is for far more directly than any heuristic can.
 */
export function resolveIntentChips(
  categoryNames: readonly string[],
  orgType?: string | null,
  limit: number = CHIP_COUNT,
): string[] {
  const out: string[] = [];
  const push = (candidates: readonly string[]): void => {
    for (const raw of candidates) {
      if (out.length >= limit) return;
      if (typeof raw !== 'string') continue;
      const label = raw.trim().replace(/\s+/g, ' ').slice(0, CHIP_MAX_CHARS);
      if (!label || out.some((c) => c.toLowerCase() === label.toLowerCase())) continue;
      out.push(label);
    }
  };
  push(categoryNames);
  push(ORG_TYPE_CHIPS[orgType ?? ''] ?? []);
  push(LEGACY_CHIPS);
  return out;
}

/**
 * The module ids an `org_intent_categories` row routes to: its default module
 * first, then whatever its allowlist names. `allowed_modules` is JSONB, which
 * reaches the adapter as a parsed array on PG and as text on a driver that
 * does not parse — both are accepted, anything else yields nothing.
 */
export function intentCategoryModuleIds(row: {
  default_module_id?: string | null;
  allowed_modules?: unknown;
}): string[] {
  const out: string[] = [];
  if (typeof row.default_module_id === 'string' && row.default_module_id.trim()) {
    out.push(row.default_module_id.trim());
  }
  let allowed: unknown = row.allowed_modules;
  if (typeof allowed === 'string') {
    try { allowed = JSON.parse(allowed); } catch { allowed = null; }
  }
  if (Array.isArray(allowed)) {
    for (const id of allowed) {
      if (typeof id === 'string' && id.trim() && !out.includes(id.trim())) out.push(id.trim());
    }
  }
  return out;
}
