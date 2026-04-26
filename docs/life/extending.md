# Extending the Life pillar

This is for contributors adding new categories, calculators, news sources,
country guides, or anything else under Life.

---

## The category tile system

The LifePage dashboard renders a grid of category tiles. Today there are
three "first-class" areas (News, Finance, Travel) that have dedicated
page trees and services, plus 10 placeholder categories that share a
common `CategoryPage` template:

```
music · food · shop · sport · news · money · travel · health · places · learn
```

A placeholder category can grow into a first-class area when usage signal
justifies the investment. The promotion path is:

1. Add a service file: `server/services/category-<name>.ts` with the
   read-side queries + pure helpers for the area
2. Add a route file: `server/routes/<name>.ts` with HTTP handlers
3. Mount the route in `server/index.ts`
4. Add a migration: `<NNN>_<name>_pillar.sql` with the area's tables
5. Replace the placeholder route in `App.tsx` with the new dedicated pages
6. Update the marketing copy + this doc

Don't promote a category just because it's interesting — promote when the
shared `CategoryPage` template demonstrably can't carry the use case.

## Adding a news source

```sql
INSERT INTO news_sources (id, name, url, rss_url, country, language, bias_rating, factuality_score, category)
VALUES ('my-source', 'My Source', 'https://example.com', 'https://example.com/rss', 'us', 'en', 'center', 80, 'general')
ON CONFLICT DO NOTHING;
```

Required fields:

- **bias_rating** — one of: `far_left`, `left`, `center_left`, `center`,
  `center_right`, `right`, `far_right`. Use independent ratings (AllSides /
  Ad Fontes / Media Bias Fact Check) — never your own opinion.
- **factuality_score** — 0–100. Cite the rating source in code comment.
- **category** — `general` / `business` / `technology` / `science` / etc.

A future `.anton` news-pack format will let third-party packs ship curated
source bundles (e.g., "EU policy reporting pack", "Climate science pack").

## Adding a finance calculator

Calculators belong in `server/services/category-finance.ts` as pure
exported functions. Rules:

1. **Pure functions only** — no DB access, no I/O, no side effects.
   Easy to unit test, easy to reason about.
2. **Round to 2 decimal places** at the end (use
   `Math.round(x * 100) / 100`). Don't compound rounding through
   intermediate steps.
3. **Validate inputs at boundaries** — e.g., `withdrawalRate` for FIRE
   throws if outside (0, 0.10]. Better to error than to return a
   misleading number.
4. **Document the formula** — a one-line `@param` for each argument and
   a brief comment for the formula. Personal-finance math is famously
   easy to get subtly wrong.
5. **Default to no-advice posture** — calculators give numbers, not
   recommendations. Anything that says "you should…" belongs in the
   guidance markdown of a finance-goal template, not in the calculator.

## Adding a finance-goal template

Finance-goal templates live in `finance_goal_templates`. They are
read-only reference content that users can clone into their own
`finance_goals`. Add a new template via a migration:

```sql
INSERT INTO finance_goal_templates (id, goal_type, title, description, default_months, guidance_md)
VALUES ('tmpl_<name>', '<type>', '<title>', '<one-liner>', <months>, '<markdown>')
ON CONFLICT (id) DO NOTHING;
```

The `guidance_md` field is markdown; render it in the UI with the same
markdown renderer used elsewhere. Keep it under ~500 words — it's a
template, not an essay.

## Adding country intel

Country intel is mostly LLM-generated on first request and cached in
`travel_country_intel`. To pre-seed a country (e.g., for offline use or
faster first load):

1. Generate the content via the standard pipeline (POST
   `/api/travel/country/:code/generate`)
2. Capture the result
3. Add it to a seed migration with `ON CONFLICT (country_code) DO NOTHING`

Don't write country intel from scratch as a contributor — the generated
output goes through a structured prompt that ensures the seven-section
format (culture / safety / visa / currency / language / transport / food)
is consistent across countries. Prefer regenerating to hand-writing.

## Adding a category-news pack (roadmap)

Like Procure category packs, the eventual `.anton` news-pack format will
combine:

- Source list (pre-curated, with bias + factuality)
- Default user preferences (recommended topics, blocked sources)
- Bias-spectrum target (e.g., "EU centre" pack targets center_left to
  center_right with 80%+ factuality)

Loaded by a future `news-pack-loader.ts` (not yet written) at install
time. The reference pack to build first is **`pack_eu_centre_news_v1`** —
mainstream EU sources with consistent bias + factuality.

## Anti-patterns

- **Don't add a calculator that needs network access** — that's a route,
  not a calculator. Calculators are pure.
- **Don't write a news source's bias rating from scratch** — cite an
  independent media bias rater in code comment + commit message.
- **Don't add a finance feature that takes action** — Life pillar is
  read-only on external systems by design.
- **Don't reuse Work-pillar tables for Life data** — keep them separate.
  The data isolation is a feature, not an oversight.
