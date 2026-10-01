/**
 * council-models.ts — which model each AI Council member and the chair run
 * on. The page used to seed every member with a Claude id from a fixed list;
 * on a server that runs only OpenRouter models the server mapped each of them
 * to its one default, so every "member" was the same model and the transcript
 * named Claude for answers GLM wrote. On a demo the council now draws its
 * members from the models the demo offers, spread so that members differ.
 *
 * Pure functions; the page reads the offered list from /api/config.
 */

/** How often each pool model is already used by the members that keep theirs. */
function usage(models: readonly string[], pool: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>(pool.map((m) => [m, 0]));
  for (const m of models) if (counts.has(m)) counts.set(m, (counts.get(m) ?? 0) + 1);
  return counts;
}

/** The pool model used least so far (the first in pool order on a tie). */
function leastUsed(counts: Map<string, number>, pool: readonly string[]): string {
  let best = pool[0];
  for (const m of pool) if ((counts.get(m) ?? 0) < (counts.get(best) ?? 0)) best = m;
  return best;
}

/** The pool with the default model first, so the first member runs on it. */
function ordered(pool: readonly string[], defaultModel: string | null): string[] {
  return defaultModel && pool.includes(defaultModel) ? [defaultModel, ...pool.filter((m) => m !== defaultModel)] : [...pool];
}

/**
 * Members and chair fitted to the models a demo offers: a member already on an
 * offered model keeps it; any other is moved to the offered model used least
 * so far, so a council of three on three offered models has three different
 * models. The chair keeps an offered model, else takes the default. An empty
 * pool (an ordinary server) changes nothing.
 */
export function fitCouncilModels<T extends { model: string }>(
  members: readonly T[],
  chairModel: string,
  pool: readonly string[],
  defaultModel: string | null,
): { members: T[]; chairModel: string } {
  if (pool.length === 0) return { members: [...members], chairModel };
  const order = ordered(pool, defaultModel);
  const counts = usage(members.filter((m) => pool.includes(m.model)).map((m) => m.model), order);
  const fitted = members.map((m) => {
    if (pool.includes(m.model)) return m;
    const model = leastUsed(counts, order);
    counts.set(model, (counts.get(model) ?? 0) + 1);
    // The caller's model type is a union of ids; an offered id is one of them.
    return { ...m, model } as T;
  });
  const chair = pool.includes(chairModel) ? chairModel : order[0];
  return { members: fitted, chairModel: chair };
}

/** The model a newly added member starts on: the offered model used least, else the fallback. */
export function nextCouncilModel(members: readonly { model: string }[], pool: readonly string[], fallback: string): string {
  if (pool.length === 0) return fallback;
  return leastUsed(usage(members.map((m) => m.model), pool), pool);
}
