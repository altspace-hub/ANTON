# Life pillar — contributor README

This is the contributor-facing reference for the Life pillar (News /
Finance / Travel + 10 category placeholders). For the operator-facing
overview, see [`docs/marketing/life.md`](../marketing/life.md).

---

## Module layout

```
server/
├── routes/
│   ├── news.ts                    HTTP layer for News area (sources / stories / articles / truth-check)
│   ├── finance.ts                 HTTP layer for Finance area (watchlist / goals / calculators / market)
│   └── travel.ts                  HTTP layer for Travel area (trips / itinerary / country-intel / explore)
├── services/
│   ├── category-news.ts           Read-side queries + diversity-score helper
│   ├── category-finance.ts        Pure calculators + watchlist + goal projections
│   └── category-travel.ts         Trip queries + budget rollups + duration / packing helpers
└── db/migrations-pg/
    └── 172_life_pillar_consolidated.sql   Promotes lazy CREATE TABLE → real PG schema + seeds 3 finance-goal templates

src/pages/
├── LifePage.tsx                   Pillar landing — category tile grid
├── news/                          6 pages (NewsPage / Feed / StoryDetail / TruthCheck / Sources / MyBias)
├── finance/                       6 pages (FinancePage / Learn / Calculators / Market / Watchlist / Goals)
├── travel/                        5 pages (TravelPage / Trips / Planner / CountryGuide / Explore)
└── CategoryPage.tsx               Shared template for the 10 placeholder categories
```

## The split: routes vs services

Each Life-pillar area follows the same pattern:

- **Route file** stays thin — HTTP concerns, request validation, body
  shaping, LLM calls (because LLMs need provider-router + Anthropic
  client). Mutation handlers live here.
- **Service file** contains read-side queries + pure helpers (calculators,
  rollups, scoring). No HTTP, no LLM. Importable from anywhere; trivially
  unit-testable without spinning up Express.

When adding new functionality:

- **Pure logic (calculator, scorer, projection)** → service file.
- **HTTP handler that calls LLM** → route file (the LLM is a service-layer
  concern but the route owns request shape + auth).
- **DB query that returns a list/get** → service file.

## Data model

All Life-pillar tables are defined in
`server/db/migrations-pg/172_life_pillar_consolidated.sql`. The migration
is idempotent and uses `CREATE TABLE IF NOT EXISTS` so it is safe to run
on top of the lazy schema that route files have been creating since the
pillar's first version.

### News tables

- `news_sources` — curated source list with bias_rating + factuality_score
- `news_stories` — clustered articles (each cluster is a "story")
- `news_articles` — individual articles, FK to source + optional FK to story
- `truth_checks` — fact-check verdicts on user-supplied claims
- `news_user_preferences` — per-user reading prefs + bias profile

### Finance tables

- `finance_watchlist` — tracked tickers with target prices + notes
- `finance_snapshots` — historical price snapshots (for chart rendering)
- `finance_learning_progress` — guided learning unit completion
- `finance_goals` — typed personal-finance goals
- `finance_goal_templates` — read-only seeded templates (3 anchors:
  emergency fund, house deposit, retirement)

### Travel tables

- `travel_trips` — trip header (destination / dates / budget)
- `travel_itinerary_items` — per-day trip items
- `travel_country_intel` — generated country guides (cached, regenerated
  on demand or on a TTL)
- `travel_packing_lists` — climate-aware packing lists

### Cross-area

- `life_category_preferences` — per-user pin / order / config for each of
  the 10+ category tiles on the LifePage dashboard

## REST endpoints

All under `/api`. The route prefix matches the area name:

- `GET/POST/DELETE /api/news/*` — see `server/routes/news.ts`
- `GET/POST/DELETE /api/finance/*` — see `server/routes/finance.ts`
- `GET/POST/DELETE /api/travel/*` — see `server/routes/travel.ts`

Mutations are auth-gated by the standard `requireAuth` middleware
(deployment-mode dependent — solo mode is open, team mode requires JWT).

## Tests

The pure helpers in the service files are designed to be unit-tested
without DB. Examples to add (none exist yet):

- `category-news.test.ts` — diversity-score over various rating sets
- `category-finance.test.ts` — compound interest, FIRE number, mortgage
  payment, avalanche/snowball ordering, required monthly contribution
- `category-travel.test.ts` — trip duration, budget rollup, variance,
  packing-bag suggestion

Adding tests is the single highest-ROI improvement to the pillar's
maturity score (Test dimension is currently 0.00).
