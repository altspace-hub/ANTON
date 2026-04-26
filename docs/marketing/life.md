# Life pillar — your personal-side intelligence layer

> **Audience:** the same person who uses ANTON for their professional work,
> but in their off-hours: managing news intake, personal finances, travel,
> and the everyday-life domains that don't belong in a work context.

---

## Why ANTON has a Life pillar

ANTON's Work pillar is built around the assumption that you're applying expert
judgement to a professional domain — compliance, consulting, legal, finance,
healthcare, etc. The Life pillar exists because **the same person also has a
personal life**, and many of the same primitives — structured AI conversations,
calculators, watchlists, knowledge sources, calibrated reasoning — are useful
there too.

Crucially: **the data stays separate**. Life-pillar data lives in different
tables (`finance_*`, `travel_*`, `news_*`, `life_*`) from your Work-pillar
engagements. Switching pillars switches context cleanly.

## What's inside

The Life pillar today covers three first-class areas plus a category-tile
landing for ten more:

### News (6 pages)

A multi-source news aggregator with **bias tracking** baked in, not bolted on:

- **Sources** — curated list of 14 default sources (Reuters, BBC, SVT, DN,
  SvD, NRK, Guardian, AP, Economist, FT, Bloomberg, TechCrunch, Wired,
  Nature) with bias rating + factuality score per source
- **Stories** — clustered articles across sources; each cluster shows a
  **source-diversity score** so you can see at a glance whether the
  story is one perspective or many
- **Truth check** — paste a claim, get a fact-check verdict
  (true / mostly_true / mixed / mostly_false / false / unverifiable) with
  reasoning, red flags, and corroborating factors
- **My bias** — over time, ANTON tracks the bias profile of what you read
  and shows you whether you're drifting toward an echo chamber

### Finance (6 pages)

Personal finance tools that are honest about what they are: structured
calculators + tracking, **not** financial advice:

- **Calculators** — compound interest, FIRE number, mortgage payment,
  debt-payoff (avalanche + snowball), required monthly contribution
- **Watchlist** — tickers + target prices + notes
- **Goals** — typed goals (savings / purchase / retirement / debt-payoff /
  emergency-fund / investment / custom) with projection vs target
- **Learn** — guided learning units on personal-finance fundamentals
- **Market** — read-only price + change views (no trading; that's a
  separate concern)
- **Templates** — three anchor templates ship with the install:
  3-month emergency fund, 3-year house deposit, 30-year retirement

### Travel (5 pages)

Trip planning that scales from a weekend to a 3-month trip:

- **Trips** — title / destination / dates / budget / status
- **Itinerary** — per-day items (activity / meal / transport / lodging /
  event / other) with cost rollups + budget variance
- **Country guide** — culture / safety / visa / currency / language /
  transport / food / scam alerts / best months / budget estimate
  per country
- **Explore** — discover destinations matching your interests + climate +
  budget + duration
- **Packing list** — climate-aware bag-size suggestion + items

### Other categories (10 placeholder tiles)

Music, food, shop, sport, news, money, travel, health, places, learn —
these share a common `CategoryPage` template today and will grow into
dedicated areas as user demand surfaces. The pillar architecture makes
adding a new category cheap.

## What stays out

Life pillar deliberately does **not**:

- Connect to your bank or brokerage (no PSD2 / Plaid / Yodlee). Tracking
  is manual; this is by design — privacy + simplicity
- Make trades, place bets, send money, or take any action with
  externally-visible consequences
- Replace your accountant, financial planner, lawyer, or doctor

## Where it fits in ANTON

- **Pathfinder** — the action bar adapts when you're in Life mode (ask
  "what's a fair price for this used car?" and Pathfinder uses Life
  primitives, not Work ones)
- **Knowledge layers** — your personal documents (bank statements,
  travel insurance docs) can be loaded as a private knowledge folder
  for Life-mode prompts only
- **Markets** — the Finance area's market page reuses the Markets pillar's
  price feed; Life finance is a thin wrapper, not a separate data plane
- **Companion app** — Life mode gets the same approval / capture / voice
  primitives as Work mode (a quick voice "what's the news on X" or a
  share-target capture from the news app on your phone)

## How to start

1. Toggle the App Mode to **Life** (top-right pillar selector).
2. Open one of News / Finance / Travel from the Life dashboard.
3. The seeded content (news sources, finance goal templates) gives you
   working examples to learn from and adapt.

---

> **Status:** Life pillar is at v0.7.5 — News, Finance, Travel are the
> first-class areas; the 10 category placeholders share a template until
> we have enough usage signal to invest in dedicated builds. The pillar's
> shared infrastructure (knowledge resolver, prompt builder, calculator
> primitives) is mature; the per-area depth is the next investment.
