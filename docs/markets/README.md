# Markets

> ANTON's financial-intelligence pillar, instrumented for learning. **The canonical proof-of-Layer-2** in the six-layer vision: knowledge atoms → patterns → predictions → calibration → consul performance → signal-weight tuning, all in a closed feedback loop driven by daily market data.

---

## Quick map

| If you want to… | Read |
|---|---|
| Strategic positioning | (no separate marketing doc — see architecture diagram below) |
| Architecture overview | [`/docs/architecture/future/f-50-markets-pillar.md`](../architecture/future/f-50-markets-pillar.md) |
| Closed-loop methodology | This file (below) |
| Extend Markets | [`extending.md`](extending.md) |

---

## Service surface (30 services in `server/services/market-*`)

### Data ingest
`market-data` · `market-bundle-importer` · FMP / news / RSS connectors

### Atoms + entities
`market-atom-extractor` · `market-atom-service` · `market-entity-extractor` · `market-entity-resolver`

### Patterns
`market-pattern-detector` · `market-pattern-service` · `market-pattern-feedback`

### Theses + why-chains
`market-thesis-service` · `market-why-chain-service` · `market-narrative-generator`

### Predictions + calibration
`market-prediction-service` · `market-prediction-attribution` · `market-confidence-calibration` · `market-conditional-accuracy` · `market-meta-learning` · `market-rci-service`

### Indexes (ANTON 100)
`market-index-service` · `market-nav-engine` · `market-rebalance-engine`

### Backtests
`market-backtest-service` · `market-backtest-engine`

### Workflows + scheduling
`market-workflow-orchestrator` · `market-event-trigger` · `market-schedule`

### Consul
`market-consul-performance` · `market-consul-service` (post-E.4)

### Computation
`market-computation` (39 Python templates in `server/computation-templates/markets/`)

---

## Schema

18 dedicated migrations (049–067 + 154–157), 58 `market_*` tables. Time-partitioned tables for high-volume entities (`market_atoms_*` quarterly, `market_data_raw_*` quarterly, `market_index_nav_*` half-yearly, `market_patterns_*` half-yearly). See [`/docs/architecture/20-database-schema.md`](../architecture/20-database-schema.md) for the full catalogue.

---

## The closed loop

The most important diagram in Markets is the closed feedback loop:

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

Each loop is a daily learning cycle. The deterministic engine (NAV, predictions, attribution) keeps the maths reproducible; the LLM only writes rationale.

This is what makes Markets the canonical Layer-2 ("Intelligent ANTON") proof case in the [Six-Layer Vision](../architecture/04-six-layer-vision.md).

---

## Operational pause flags (April 2026)

Per `memory/project_markets_effectiveness_pause.md`, the closed-loop audit found 21% prediction accuracy + inverted calibration + 1 rebalance ever. Three pause flags installed:

| Flag | Pauses |
|---|---|
| `MARKETS_THINKING_DISABLED=true` | Every LLM-spending phase. Free phases (NAV, prices, prediction checkpoints, event triggers, MV refreshes) keep running. |
| `MARKETS_FETCH_DISABLED=true` | Every external markets data fetch (FMP, news, RSS). |
| `RADAR_AUTOMATION_DISABLED=true` | Radar auto-scan + scheduled radar cron. Manual UI scans still work. |

These exist so cost-bearing or risk-bearing flows can be paused while closed-loop effectiveness is being addressed. Status of the pillar's effectiveness is therefore **🟢 (under improvement)** even though the **code is ✅**.

---

## ANTON 100

The curated 100-symbol universe in `market_indexes` (mig `062_markets_anton100_indexes.sql`). Each ANTON 100 index has holdings + rebalance history + NAV partitions.

---

## Consul Council (post-E.4)

A multi-persona deliberation surface at `/markets/consul`. 4 council members (Macro Strategist · Sector Analyst · Risk Assessor · Contrarian) plus a synthesis pass. Each deliberation persists as a `revelation_chain` (reuses IRE persistence — no new trail format). See `server/services/market-consul-service.ts`.

---

## Where to start

- **Try it:** `/markets` (landing) · `/markets/indexes` · `/markets/theses` · `/markets/predictions` · `/markets/consul`
- **Code:** `server/services/market-*.ts` (30 services)
- **Architecture:** [`/docs/architecture/future/f-50-markets-pillar.md`](../architecture/future/f-50-markets-pillar.md)
- **Closed-loop reasoning:** memory `project_markets_effectiveness_pause.md`
- **Extending:** [`extending.md`](extending.md)

---

*Refresh when ANTON 100 universe changes, when a new prediction-source is added, when calibration approach shifts, or when pause flags lift.*
