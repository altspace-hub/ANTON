/**
 * engagement-demo-routes.ts — the Engagement Task API a public-demo visitor
 * needs, as entries for WORK_ROUTES in server/middleware/demo-mode.ts
 * (2026-10-02). Paths are under /api, `:x` is one segment, every entry exact.
 *
 * Read off the pages' calls (src/pages/Engagement*.tsx and
 * src/components/engagement/**). Deliberately left out, so they answer 404:
 *   - POST/DELETE /engagements/:x/rag-directory and POST …/rag-directory/reindex
 *     — a folder on the server is never a visitor's knowledge source (the
 *     routes refuse visitors themselves too);
 *   - PATCH /engagements/:x/project — projects are closed on the demo;
 *   - POST /engagements/:x/peer-benchmarks/web-search — the demo's models
 *     cannot search the web (the route refuses such a model with 409 anyway).
 *
 * Every route checks the caller in SQL (routes/engagements.ts): another
 * person's engagement, and any id from another engagement, answers 404.
 * tests/middleware/engagement-demo-routes.test.ts checks this list against
 * the router and, once WORK_ROUTES carries engagement entries, that they are
 * exactly these.
 */
import type { IRouter, NextFunction, Request, RequestHandler, Response } from 'express';

export const ENGAGEMENT_WORK_ROUTES: ReadonlyArray<readonly [methods: string, path: string]> = [
  // The list, a new engagement, and the visitor's own benchmark library
  ['GET,POST', '/engagements'],
  ['GET', '/engagements/peer-library'],
  ['GET,PATCH,DELETE', '/engagements/:x'],
  // Setup: the engagement letter, plan and good example (stored files; the upload quota applies)
  ['POST', '/engagements/:x/documents'],
  ['POST', '/engagements/:x/documents/:x/extract'],
  // Scope and client intelligence, by form or by interview
  ['POST', '/engagements/:x/scope-items'],
  ['PATCH', '/engagements/:x/scope-items/:x'],
  ['PUT', '/engagements/:x/client-intelligence'],
  ['POST', '/engagements/:x/intake/turn'],
  // Resources (stored files; the upload quota applies)
  ['POST', '/engagements/:x/resources'],
  ['PATCH', '/engagements/:x/resources/:x'],
  ['PATCH', '/engagements/:x/resource-categories'],
  // Workstreams and the team
  ['POST', '/engagements/:x/workstreams'],
  ['PATCH,DELETE', '/engagements/:x/workstreams/:x'],
  ['GET,POST', '/engagements/:x/team'],
  ['POST', '/engagements/:x/team/extract'],
  ['PATCH,DELETE', '/engagements/:x/team/:x'],
  // Execution and review
  ['POST', '/engagements/:x/execute'],
  ['GET', '/engagements/:x/execute/stream'],
  ['GET', '/engagements/:x/iterations'],
  ['PATCH', '/engagements/:x/iterations/:x'],
  ['POST', '/engagements/:x/iterations/:x/gap-analysis'],
  // Benchmarks from the visitor's own completed engagements
  ['GET', '/engagements/:x/peer-benchmarks'],
  ['POST', '/engagements/:x/peer-benchmarks/from-internal/:x'],
  ['DELETE', '/engagements/:x/peer-benchmarks/:x'],
  // Quality gate, completion, export, history
  ['POST', '/engagements/:x/quality-gate/run'],
  ['GET', '/engagements/:x/quality-gate/latest'],
  ['POST', '/engagements/:x/complete'],
  ['POST', '/engagements/:x/reopen'],
  ['POST', '/engagements/:x/export'],
  ['GET', '/engagements/:x/changelog'],
];

/** The engagement routes that call a model: behind the model-call limiter and the budget check as well (mountEngagementDemoLimits). */
export const ENGAGEMENT_MODEL_ROUTES: readonly string[] = [
  '/api/engagements/:id/documents/:docId/extract',
  '/api/engagements/:id/intake/turn',
  '/api/engagements/:id/execute',
  '/api/engagements/:id/iterations/:itId/gap-analysis',
  '/api/engagements/:id/team/extract',
  '/api/engagements/:id/peer-benchmarks/web-search',
  '/api/engagements/:id/quality-gate/run',
];

/** Where index.ts mounts the engagements router. */
export const ENGAGEMENT_API_BASE = '/api/engagements';

/** Methods that change nothing; every other one is a write. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The engagement writes that store a file, produce a download or call a model
 * (paths relative to ENGAGEMENT_API_BASE): one count of the demo write limit.
 * Every other write is a small edit, counted by the edit limit.
 */
const HEAVY_WRITE_PATHS: readonly RegExp[] = [
  /^\/?$/,                       // create
  /^\/[^/]+\/documents\/?$/,     // upload
  /^\/[^/]+\/resources\/?$/,     // upload or a 50,000-character note
  /^\/[^/]+\/export\/?$/,        // a generated file
  ...ENGAGEMENT_MODEL_ROUTES.map((route) => new RegExp(`^${route.slice(ENGAGEMENT_API_BASE.length).replace(/:[^/]+/g, '[^/]+')}/?$`)),
];

/** True when this engagement write (path relative to the mount) counts against the write limit, not the edit limit. */
export function isHeavyEngagementWrite(relativePath: string): boolean {
  return HEAVY_WRITE_PATHS.some((re) => re.test(relativePath));
}

export interface EngagementDemoLimits {
  /** createDemoWriteLimiter(): per demo visitor per 10 minutes; next() for everyone else. */
  demoWriteLimiter: RequestHandler;
  /** createDemoEditLimiter(): small edits per demo visitor per 10 minutes. */
  demoEditLimiter: RequestHandler;
  /** The per-address model-call limiter of /api/claude/message. */
  claudeLimiter: RequestHandler;
  /** The monthly-budget front check (each route also checks and charges itself). */
  modelBudget: RequestHandler;
}

/**
 * Mounts the limits on the engagement API, above its router (index.ts).
 *
 * Every request that changes something — any method but GET/HEAD/OPTIONS,
 * on any engagement path — is counted once. Create, the uploads, export and
 * the model steps count against the demo write limit (shared with the other
 * uploads and answer tools); every other write — scope items, workstreams,
 * the team, client intelligence, every PATCH and DELETE — against the edit
 * limit. Before 2026-10-02 those edits ran at the general per-user rate
 * (1,200 a minute, up to 256 KB each). One middleware for the whole prefix,
 * so a model step is counted once, not once here and again on its own path.
 *
 * The model steps (ENGAGEMENT_MODEL_ROUTES, exact paths) also pass the
 * model-call limiter and the budget check, as before.
 */
export function mountEngagementDemoLimits(app: IRouter, limits: EngagementDemoLimits): void {
  app.use(ENGAGEMENT_API_BASE, (req: Request, res: Response, next: NextFunction) => {
    if (READ_METHODS.has(req.method)) { next(); return; }
    if (isHeavyEngagementWrite(req.path)) limits.demoWriteLimiter(req, res, next);
    else limits.demoEditLimiter(req, res, next);
  });
  app.post([...ENGAGEMENT_MODEL_ROUTES], limits.claudeLimiter, limits.modelBudget);
}
