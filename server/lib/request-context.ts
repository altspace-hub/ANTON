/**
 * request-context.ts — who a model call is being made for.
 *
 * About sixty router call sites (renderers, verify citations, engagements, the
 * task agent, …) call callChat / streamChat with no user in the config. The
 * spend ledger and the per-user daily cap still need to know whose request a
 * priced call belongs to, and OpenRouter wants an end-user id per call so one
 * abusive visitor cannot get the whole account blocked. Threading a user id
 * through every call site would touch all of them; instead the request carries
 * it in AsyncLocalStorage, set once right after authentication.
 *
 * Background jobs (schedulers, sweeps, queues started outside a request) have
 * no context: currentRequestContext() returns undefined and their spend is
 * recorded with no user.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  userId?: string;
  role?: string;
  sessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The context of the request this code runs for, or undefined outside one. */
export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Run fn with ctx as the current request context (tests, and non-Express entry points). */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

function sessionIdOf(req: Request): string | undefined {
  const body = req.body as { sessionId?: unknown } | undefined;
  if (body && typeof body.sessionId === 'string' && body.sessionId) return body.sessionId;
  const q = req.query?.sessionId;
  return typeof q === 'string' && q ? q : undefined;
}

/**
 * Express middleware: mount right after authMiddleware so req.user is set.
 * Everything the request's handlers do — including work they start and await —
 * sees the context.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: { id?: unknown; role?: unknown } }).user;
  const ctx: RequestContext = {
    userId: typeof user?.id === 'string' && user.id ? user.id : undefined,
    role: typeof user?.role === 'string' && user.role ? user.role : undefined,
    sessionId: sessionIdOf(req),
  };
  storage.run(ctx, () => next());
}
