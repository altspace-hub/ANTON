/**
 * advice-boundary-areas.ts — the rights/consumer areas, in ONE place.
 *
 * Two things have to agree about which areas are "someone acting on a deadline or
 * on their own money, without a professional behind them":
 *
 *   - the server prompt layer (`RIGHTS_GUARDRAIL_AREAS` in
 *     server/services/prompt-builder.ts, re-exported from here), and
 *   - the disclaimer banner on ModulePage.
 *
 * They were allowed to drift once already: the medical banner covers `healthcare`
 * and `community-health` while the prompt-side guardrail covered neither, and the
 * six-area `GUARDRAIL_AREAS` set covered neither of those nor any rights area. A
 * shared set is the cheapest way to stop a new area getting the prompt layer and
 * not the banner, or the reverse.
 *
 * This file lives under src/lib because the server already imports from there
 * (see the `expert-roles.js` import in prompt-builder.ts) and the browser cannot
 * import from server/.
 *
 * Bind on the AREA ID, which is what `area.json` declares and what module-loader
 * stamps onto every module — not on the directory name. `consumer-rights` is the
 * id declared by `server/areas/consumer-protection/area.json`; that mismatch is
 * deliberate and long-standing.
 */

export const RIGHTS_ADVICE_AREAS: ReadonlySet<string> = new Set([
  /** Tenancy disputes, employment rights, personal contracts, small claims. */
  'consumer-legal',
  /** Directory: server/areas/consumer-protection. Product complaints, scams,
   *  mobile-money disputes, banking rights, utility bills. */
  'consumer-rights',
  /** Unpaid wages, wrongful dismissal, workplace safety, migrant and domestic workers. */
  'workers-rights',
  /** Eviction and land-grab response, inheritance, tenancy, women's land rights. */
  'land-rights',
  /** IDs and permits, subsidies, complaints against officials, courts, voting. */
  'government-services',
  /** Loan comparison, predatory-lending checks, default rights, group lending. */
  'credit-navigator',
  /** Budgets, debt, pensions, savings, tax — an individual's own money. */
  'personal-finance',
]);
