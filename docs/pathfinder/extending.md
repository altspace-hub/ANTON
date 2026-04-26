# Extending Pathfinder

> How to add a new Pathfinder mode, a new ranking signal, or a new intent-mapping rule.

---

## Add a new Pathfinder mode

A mode is a thin layer over the same intent → 12-verb mapping, scoped to a specific capability source. To add (e.g.) `mission-discovery`:

1. **Define** the mode id (`mission-discovery`).
2. **Identify** the capability source — for missions, `mission_templates` table.
3. **Implement** the mode's discovery in `pathfinder-engine.ts` — what verbs does the source naturally support? Which slots map to its query parameters?
4. **Surface** the mode in the visitor UI (`PathfinderVisitorPage`) as a tab / filter.
5. **Document** the mode in [`README.md`](README.md).

The 12-verb taxonomy is closed — new modes use existing verbs, they don't introduce new ones.

---

## Add a new ranking signal

Currently ranking uses: verb match, slot fit, recency, trust-graph distance. To add (e.g.) "popularity" (most-invoked-by-peers):

1. **Source** the signal — `pathfinder_result_feedback` already records invocation outcomes.
2. **Compute** in `pathfinder-engine.ts` ranking pass.
3. **Weight** the new signal in the composite — start small (5–10%) until you've calibrated.
4. **Test** that the new signal doesn't drown out the strong primary signal (verb match).

---

## Add a new intent-mapping rule

The intent → verb mapping in `smart-actions-analyzer.ts` is currently rule-based. To improve a specific intent:

1. Add the rule (regex / keyword / semantic class) to the analyzer.
2. Test against the existing intent corpus (no regression on existing intents).
3. Log the mapping decision so users can see why their query mapped to a particular verb.

A future iteration could replace the rule-based analyzer with an LLM-driven mapper — the architecture supports that drop-in.

---

## Anti-patterns

- **Don't bypass capability-descriptor verification.** Every candidate must have a valid signature; unsigned descriptors don't enter ranking.
- **Don't expand the verb taxonomy** without going through the [`/docs/portals/capability-descriptor.md`](../portals/capability-descriptor.md) extension process.
- **Don't cache descriptors indefinitely.** Pathfinder respects descriptor TTL — peer descriptors that have expired must be re-fetched.

---

*Maintained alongside `server/services/pathfinder-engine.ts`. Refresh when a new mode or ranking signal ships.*
