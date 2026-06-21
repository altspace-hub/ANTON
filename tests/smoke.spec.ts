import { test, expect } from '@playwright/test';

/**
 * Smoke tests — the minimum "did the production stack actually come up" gate
 * for the E2E matrix (.github/workflows/e2e.yml). Before these run, CI
 * provisions a real PostgreSQL, builds the client, runs migrations, and starts
 * the production server (`tsx server/index.ts`) on :5173.
 *
 * They intentionally stay shallow and auth-free (DEPLOYMENT_MODE=solo): the job
 * is to prove the server boots against Postgres and the built SPA mounts
 * without a white screen — the class of regression (broken build, dead import,
 * failed migration, DB-less boot, blank bundle) that the 2000+ Vitest unit
 * tests structurally cannot see. Deeper critical-path specs (login → run a
 * module → export) can layer on top of this file later.
 *
 * Before this file existed, `playwright test` found 0 specs and exited 1, so
 * the E2E workflow was silently red on every push. A vacuous green is worse
 * than an honest smoke gate.
 */
test.describe('smoke', () => {
  test('GET /api/health → 200 ok (server + PostgreSQL are up)', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status(), 'health endpoint status').toBe(200);
    const body = await res.json();
    expect(body.status, 'health status field').toBe('ok');
    expect(body.database, 'database connectivity flag').toBe(true);
  });

  test('the app shell serves and React mounts (no white screen)', async ({ page }) => {
    const res = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(res?.status() ?? 0, 'root document status').toBeLessThan(400);
    await expect(page).toHaveTitle(/ANTON by openEXPERT/);
    // React mounts into <div id="root">. Wait for at least one child element to
    // attach + become visible — this fails loudly on a white-screen / broken
    // bundle regression instead of passing on an empty page.
    const firstChild = page.locator('#root > *').first();
    await firstChild.waitFor({ state: 'attached', timeout: 30_000 });
    await expect(firstChild).toBeVisible();
  });
});
