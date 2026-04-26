# Extending Markets

> How to add a new data source, a new pattern detector, a new index, or a new computation template.

---

## Add a new data source

1. **Define the connector** under `server/services/` matching the source naming convention (`market-fmp.ts`, `market-news-rss.ts`, etc.).
2. **Register** in `market_data_sources` table — add a row with id, label, fetch frequency, credential reference (vault).
3. **Implement** the fetch + persist into `market_data_raw` (partitioned by quarter).
4. **Pause-flag respect** — every fetch path must check `MARKETS_FETCH_DISABLED` env and short-circuit if set.
5. **Test** under `tests/services/market-<source>.test.ts`.

---

## Add a new pattern detector

1. **Define** under `server/services/market-pattern-<name>.ts`.
2. **Pattern record shape** matches `market_pattern_detections` table (mig 051): pattern_type, pattern_subtype, title, description, severity, confidence, supporting_data, affected_workflows.
3. **Run cadence** — either on-demand (via `market-workflow-orchestrator`) or scheduled (via `market_schedule_runs` cron).
4. **Pause-flag respect** — LLM-spending detectors must check `MARKETS_THINKING_DISABLED`.

---

## Add a new ANTON 100 index variant

1. **Define** the index in `market_indexes` (mig 062).
2. **Holdings** in `market_index_holdings`.
3. **Rebalance rules** — seed initial weights; the rebalance engine takes over.
4. **NAV computation** runs automatically once the index is registered (NAV is a free phase, not paused by `MARKETS_THINKING_DISABLED`).

---

## Add a new computation template

39 Python templates ship under `server/computation-templates/markets/`. To add (e.g.) a custom factor score:

1. **Create** the Python script under `server/computation-templates/markets/<name>.py`.
2. **Register** in the computation registry (`market-computation.ts`).
3. **Outputs** cached to `data/computation-output/`.
4. **Surface** the new template in `MarketComputationPage`.

---

## Add a new consul council member

The 4 members in `server/services/market-consul-service.ts` are defined declaratively. To add a 5th:

1. **Write the prompt** at `server/prompts/market-consul-<role>.md`.
2. **Register** in `COUNCIL_MEMBERS` array.
3. The deliberation surface picks it up automatically.

The synthesis prompt at `server/prompts/market-consul-synthesis.md` doesn't need to change unless you want role-specific synthesis weighting.

---

## Anti-patterns

- **Don't bypass the pause flags.** Every cost-bearing or external-fetch path must respect `MARKETS_THINKING_DISABLED` / `MARKETS_FETCH_DISABLED`.
- **Don't write to partitioned tables outside the partition strategy.** Write to the parent table; PostgreSQL routes to the right partition.
- **Don't predict without attribution.** Every `market_predictions` row needs a corresponding `market_prediction_attribution` chain so calibration can credit/blame inputs.
- **Don't mark a thesis stale without a successor.** The thesis lifecycle (mig 155) tracks supersession explicitly.

---

*Maintained alongside `server/services/market-*.ts`. Refresh when a new data source / pattern / index / template / council member ships.*
