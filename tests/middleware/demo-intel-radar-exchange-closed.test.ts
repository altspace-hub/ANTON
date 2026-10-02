/**
 * demo-intel-radar-exchange-closed.test.ts — what a public-demo visitor must
 * never reach on the Orchestration, Intelligence, Radar and Exchange pages
 * (2026-10-02), whatever exact entries WORK_ROUTES gains for their reads.
 *
 * The pages are opened to visitors read-only: their own sessions, insights
 * and continuity profiles, the views over their own and the shared knowledge,
 * the radar feed, and the download of a module they built. Every route below
 * changes shared state, spends without a budget check, learns, or reads
 * another person's row by id; a broad prefix (`/radar`, `/continuity`,
 * `/exchange/export`) would open it. Each must stay closed with the default
 * demo configuration. (The routes refuse most of them themselves as well:
 * see radar-admin-gate, exchange-demo-export and orchestration-owner-scope.)
 *
 * Negative control: the same rules answer true for Work routes a visitor has,
 * so a "false" here is the rule, not a matcher that refuses everything. (An
 * admin is never restricted; demo-mode.test.ts covers the middleware.)
 */
import { describe, it, expect } from 'vitest';
import { demoRouteAllowed, demoRouteRules } from '../../server/middleware/demo-mode.js';

const rules = demoRouteRules({ DEMO_MODE: 'true' });

const MUST_STAY_CLOSED: ReadonlyArray<readonly [string, string]> = [
  // Orchestration
  ['GET', '/continuity/profiles/cp_1'],
  ['PUT', '/continuity/profiles/cp_1'],
  ['DELETE', '/continuity/profiles/cp_1'],
  ['POST', '/continuity/profiles'],
  ['GET', '/continuity/context-prompt'],
  ['PATCH', '/insights/pi_1/read'],
  ['PATCH', '/insights/pi_1/dismiss'],
  ['POST', '/insights/generate'],
  ['POST', '/insights'],
  ['PUT', '/org-context'],
  ['GET', '/org-context/history'],
  ['GET', '/triggers/metrics/summary'],
  // Intelligence
  ['POST', '/intelligence/atom-ab/toggle'],
  ['POST', '/intelligence/atom-injection/mode'],
  ['GET', '/patterns'],
  ['PUT', '/patterns/p_1/status'],
  ['POST', '/ai-assist/intelligence-brief'],
  ['POST', '/ai-assist/pattern-analyse'],
  ['POST', '/memory/checkpoints'],
  ['PUT', '/memory/checkpoints/cd_1/feedback'],
  ['POST', '/knowledge-graph/build'],
  ['POST', '/knowledge-graph/entities/merge'],
  // Radar
  ['PUT', '/radar/items/ri_1/status'],
  ['POST', '/radar/items'],
  ['POST', '/radar/items/ri_1/score'],
  ['POST', '/radar/scan'],
  ['POST', '/radar/scan/src_1'],
  ['POST', '/radar/stop'],
  ['POST', '/radar/sources'],
  ['PUT', '/radar/sources/src_1'],
  ['DELETE', '/radar/sources/src_1'],
  ['PUT', '/radar/settings'],
  // Exchange
  ['POST', '/exchange/import'],
  ['POST', '/exchange/validate'],
  ['POST', '/exchange/import-run'],
  ['POST', '/exchange/import-bundle/market-index'],
  ['POST', '/exchange/export-run'],
  ['POST', '/exchange/export-bundle/review-panel'],
  ['POST', '/exchange/export/a/b'],
];

describe('demo visitors: the write, spend and learning routes behind the four pages stay closed', () => {
  for (const [method, path] of MUST_STAY_CLOSED) {
    it(`${method} ${path}`, () => {
      expect(demoRouteAllowed(method, path, rules)).toBe(false);
    });
  }

  it('negative control: the allowlist still answers true for a Work route a visitor has', () => {
    expect(demoRouteAllowed('GET', '/sessions', rules)).toBe(true);
    expect(demoRouteAllowed('GET', '/intelligence/atom-injection', rules)).toBe(true);
  });
});
