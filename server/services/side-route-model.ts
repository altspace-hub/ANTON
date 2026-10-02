/**
 * side-route-model.ts — the model a side route runs for its caller, and how
 * its failure is told (public showcase, 2026-10-01).
 *
 * The answer tools beside a Work run (explain-for, a review) call a model of
 * their own. On a demo a visitor may run only the models the demo offers
 * (DEMO_OFFERED_MODELS), the rule the Work route applies (claude.ts): the
 * picker shows only those, but a route runs whatever id it is sent, on any
 * key the server holds. Admins, and every caller outside demo mode, keep the
 * model they ask for.
 */
import { isDemoMode, demoOfferedModels } from '../middleware/demo-mode.js';
import { getEffectiveDefaultModel } from './default-model-store.js';
import { mapModelToProvider } from './provider-router.js';
import { isSpendCapError } from './llm-spend.js';
import { CompatEndpointError } from './compat-endpoint.js';

/** A model id as a request may name one: a non-empty string of at most 200 characters. */
function requestedModelId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && v.length <= 200 ? v : null;
}

/**
 * The model to run. A demo visitor (a non-admin with DEMO_MODE=true) gets the
 * requested model only when the demo offers it, else the server default when
 * that is offered (or nothing is listed), else the first offered model.
 * Everyone else gets the requested model, or `fallback`; a bare Claude id
 * follows the configured engine (mapModelToProvider), as every specialty
 * route's does.
 */
export function sideRouteModel(
  req: { user?: { role?: string } },
  requested: unknown,
  fallback: string,
): string {
  const asked = requestedModelId(requested);
  if (isDemoMode() && req.user?.role !== 'admin') {
    const offered = demoOfferedModels();
    if (asked && offered.includes(asked)) return asked;
    const def = getEffectiveDefaultModel();
    if (def && (offered.length === 0 || offered.includes(def))) return def;
    return offered[0] ?? mapModelToProvider(fallback);
  }
  return mapModelToProvider(asked ?? fallback);
}

/**
 * The HTTP status for a model call that failed before anything was streamed:
 * 402 at a daily spend cap, the endpoint's own status for a refused compat
 * model, else 500. Pair it with publicErrorMessage(err).
 */
export function modelCallErrorStatus(err: unknown): number {
  if (isSpendCapError(err)) return 402;
  if (err instanceof CompatEndpointError) return err.status;
  return 500;
}
