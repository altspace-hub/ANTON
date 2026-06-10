# Markets — One-Pager

> **What it is:** ANTON's financial-intelligence research pillar, instrumented for learning. The canonical Layer-2 testbed in the six-layer vision: a closed feedback loop where atoms become patterns become theses become predictions, scored against daily NAV ground truth.
> **Who it's for:** investment managers, sell-side analysts, financial-crime intelligence teams, anyone who needs a defensible AI-driven view on markets.
> **What makes it different:** **deterministic engine + LLM-rationale + a public scorecard**. Math is reproducible, prose is generated, and every prediction is recorded and scored against real outcomes — the scorecard is public, including when it is wrong.

---

## The pitch

The first wave of "AI for finance" tools is mostly chatbots reading SEC filings. They:

- Generate confident prose with no probability calibration
- Have no closed feedback loop — the AI doesn't know if last month's prediction was right
- Hide the reasoning chain behind opaque vector retrievals
- Don't surface inputs ("show me the atoms") or outcomes ("show me the realized accuracy bucket")

ANTON's Markets pillar is shaped around a different commitment: **every prediction is recorded with a deadline and scored against what actually happened — and the scorecard is public, including when it is wrong**. The loop is wired so that verdicts can recalibrate signal weights; whether that recalibration actually improves accuracy is itself measured, not assumed (see "Honest about effectiveness" below).

The closed loop:

```
ingest → atoms → patterns → theses → predictions → daily NAV
                                          ↓
                                  prediction feedback
                                          ↓
                              calibration + conditional accuracy
                                          ↓
                              consul performance scoring
                                          ↓
                              signal-weight + symbol-override tuning
                                          ↓
                                       (loops back)
```

This is what makes Markets the canonical Layer-2 ("Intelligent ANTON") testbed in the [Six-Layer Vision](../architecture/04-six-layer-vision.md). Not "AI for markets" — **a research tool that keeps an honest, inspectable scorecard of its own predictions**.

---

## What you can do today

| Surface | Purpose |
|---|---|
| `/markets` | Pillar landing |
| `/markets/indexes` | ANTON 100 — curated 100-symbol universe |
| `/markets/theses` | Investment theses with supporting why-chains |
| `/markets/predictions` | Forecasts + horizons + confidence buckets |
| `/markets/patterns` | Detected market patterns (regime shifts, correlations, divergences) |
| `/markets/investigation` | Open investigations on symbols / sectors / patterns |
| `/markets/rci` | Regime-Conditional Index — predictions weighted by regime detection |
| `/markets/backtests` | Backtest engine — run a thesis against history |
| `/markets/why-chains` | Per-thesis causal chain |
| `/markets/learning` | Calibration + accuracy diagnostics |
| `/markets/consul` | 4-member deliberation council (Macro Strategist, Sector Analyst, Risk Assessor, Contrarian) + synthesis |
| `/markets/event-calendar` | Scheduled market events (FOMC, earnings, etc.) |

23 pages. 30 services. 18 migrations. 58 dedicated tables. 39 Python computation templates.

---

## ANTON 100

The curated 100-symbol universe defines the playground. NAV partitions tracked half-yearly. Rebalancing follows declarative weight rules in `market_index_rebalances`. Every NAV update is a free phase (not paused by `MARKETS_THINKING_DISABLED`) so the universe stays current even when LLM-spending features are paused for cost or accuracy reasons.

---

## Consul Council

A multi-persona deliberation surface (post-E.4) at `/markets/consul`. 4 council members each contribute against a thesis or pattern; a synthesis pass produces the final position. Each deliberation persists as a `revelation_chain` (reuses IRE persistence — no new trail format).

This is what makes Markets *deliberative* rather than merely automated. The council disagreements are themselves a signal — recorded, attributable, audit-traceable.

---

## Honest about effectiveness

Per memory `project_markets_effectiveness_pause.md`, the April 2026 closed-loop audit found 21% prediction accuracy + inverted calibration + 1 rebalance ever. Three pause flags installed:

- `MARKETS_THINKING_DISABLED=true` — pauses every LLM-spending phase
- `MARKETS_FETCH_DISABLED=true` — pauses external data fetches (FMP, news, RSS)
- `RADAR_AUTOMATION_DISABLED=true` — disables radar auto-scan + scheduled cron

The pillar's **code is ✅ built**; its **production effectiveness is 🟢 under validation** (live accuracy is not yet better than chance — the loop is *instrumented* to learn, not yet *proven* to). This honesty is the point: a system that claims to learn but hides its accuracy isn't trustworthy.

---

## Why this matters strategically

Most AI-for-finance startups will fail because the calibration question becomes asked in year 2: "show me the realized accuracy of last year's predictions." If the answer is "we don't track that" or "they're directionally right", the buyer leaves.

Markets is built around the calibration question being asked from day one. `market_confidence_calibration` (mig 052), `market_conditional_accuracy` (mig 052), `market_consul_performance` (mig 052), `market_signal_weight_adjustments` (mig 154) — these tables exist because answering "how good have we been" is the product, not a feature.

When the pause flags lift, the answer becomes provable.

---

## Where to look

- **Try it:** `/markets` (landing) · `/markets/consul` (deliberation)
- **Code:** `server/services/market-*.ts` (30 services), `server/computation-templates/markets/` (39 Python templates)
- **Docs:** [`/docs/markets/`](../markets/) — README + extending
- **Architecture:** [`/docs/architecture/future/f-50-markets-pillar.md`](../architecture/future/f-50-markets-pillar.md)
- **Schema:** [`/docs/architecture/20-database-schema.md`](../architecture/20-database-schema.md) (Markets table catalogue at the bottom)
- **Effectiveness audit:** memory `project_markets_effectiveness_pause.md`

---

*Refresh when pause flags lift, when ANTON 100 universe changes materially, or when the closed-loop methodology evolves.*
