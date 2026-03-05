# ANTON Platform — Three New Tabs Specification

## News Tab · Finance Tab · Community Tab

**Version:** 0.1 (Initial Investigation & Design)
**Author:** Daniel Bardun + Claude (collaborative spec)
**Date:** March 2026
**Status:** Draft for review

---

## Overview: The Tab Architecture

ANTON currently centres on the **Work** tab (29 expert areas, 238+ modules) and **School** tab (education & learning). This specification adds three new top-level tabs that sit alongside Work and School in the main navigation:

| Tab | Core Purpose | Key Differentiator |
|-----|-------------|-------------------|
| **News** | Informed citizenship — understand *what's happening* and *whether to trust it* | AI-powered source analysis + truth verification |
| **Finance** | Financial literacy & market awareness — understand *how money works* | Education-first, not trading-first |
| **Community** | Human connection — collaborate, discuss, share | Encrypted P2P via .anton contact protocol |

These three tabs transform ANTON from a professional work tool into a **life platform** — the same AI coworker that helps you at work also helps you navigate information, money, and community. The consistent thread: ANTON doesn't just give you answers, it gives you the tools and context to make your own informed decisions.

---

# TAB 1: NEWS

## 1.1 Philosophy

The News tab is not another news aggregator. It's an **information intelligence tool** that helps users understand not just *what* is being reported, but *who* is reporting it, *why* they might be framing it that way, *where* the coverage skews, and *how much you should trust it*.

This builds directly on the existing Regulatory Radar infrastructure (RSS fetching, AI-powered scoring, source configuration, item lifecycle) but generalises it from regulatory publications to all news — and adds a critical layer of **source transparency and bias analysis** inspired by Ground News, plus a novel **truth verification engine** that extends ANTON's existing trust-through-process philosophy.

## 1.2 Core Components

### Component A: News Feed (Your Personalised News Stream)

**What it does:** Aggregates news from user-configured sources, organised by topic, region, and recency.

**Source architecture (extends existing `radar_sources` table):**

| Source Type | Examples | Fetch Method |
|-------------|----------|-------------|
| RSS feeds | Reuters, BBC, SVT, Politico, TechCrunch, local papers | XML parsing (existing) |
| Web scraping | News sites without RSS | Cheerio HTML parsing (existing) |
| Custom API | News APIs (NewsAPI, GNews, MediaStack) | JSON REST (existing) |
| User-submitted URLs | "Watch this source" | Manual addition |

**Personalisation:**
- Users select topics they care about (politics, technology, climate, local, finance, sports, health, etc.)
- Users select regions/countries for geographic focus
- Users can "follow" specific stories over time (story threading)
- AI learns what the user engages with and surfaces similar content (opt-in, transparent, adjustable)

**Key difference from generic aggregators:** Every single news item gets enriched with source metadata *before* it reaches the user. You never see a headline without context.

### Component B: Source Intelligence Layer (The Ground News Dimension)

This is where ANTON differentiates from every RSS reader. For every news story, ANTON provides:

**1. Bias Spectrum Analysis**
- Each source is rated on a political spectrum: Far Left → Left → Lean Left → Centre → Lean Right → Right → Far Right
- ANTON builds its own source database over time, seeded with publicly available bias assessments
- AI analyses the *language* of individual articles (loaded words, framing, omissions) — going beyond publication-level ratings to article-level analysis
- Visual "Bias Bar" showing coverage distribution across the spectrum for each story

**2. Geographic Origin Map**
- Where is this story being covered? Which countries' media are reporting on it?
- Interactive map showing coverage density by country
- Highlights when a story is *only* being covered in certain regions (geographic blind spots)

**3. Source Ownership & Funding Transparency**
- Who owns this publication? (corporate parent, PE fund, government, independent, etc.)
- Ownership categories: Independent, Corporate Media Conglomerate, PE-Owned, State-Funded, Non-Profit, Individual Owner
- Funding model: Subscription, Advertising, State-Funded, Donor-Funded, Mixed
- This metadata is stored in a `news_sources` table and enriched over time

**4. First Reporter / Timeline Analysis**
- Who broke this story first?
- Timeline of when each outlet published their version
- Identifies original reporting vs. aggregation/rewrites
- Highlights which outlets are doing primary journalism vs. commentary

**5. Coverage Blind Spots**
- Stories disproportionately covered by one side of the spectrum
- "Left blind spot" = stories mostly covered by right-leaning sources (and vice versa)
- Users get a weekly "Blind Spot Report" showing what their preferred sources *aren't* covering

**6. Factuality & Credibility Score**
- Per-source credibility rating (track record of corrections, sourcing practices, editorial standards)
- AI-generated confidence score for individual claims within articles
- Historical accuracy tracking: has this source been reliable on this topic before?

**Database additions:**

```sql
CREATE TABLE news_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  country TEXT,
  language TEXT,
  bias_rating TEXT CHECK(bias_rating IN ('far_left','left','lean_left','centre','lean_right','right','far_right','unrated')),
  bias_confidence REAL DEFAULT 0,  -- 0-1, how confident are we in this rating
  factuality_score REAL DEFAULT 0, -- 0-1, based on track record
  ownership_type TEXT CHECK(ownership_type IN ('independent','corporate_conglomerate','pe_owned','state_funded','nonprofit','individual','unknown')),
  owner_name TEXT,
  funding_model TEXT,
  founded_year INTEGER,
  wikipedia_url TEXT,
  metadata TEXT DEFAULT '{}',  -- JSON: social presence, correction policy, etc.
  last_updated TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE news_stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  topic_tags TEXT DEFAULT '[]',  -- JSON array
  first_seen_at TEXT NOT NULL,
  first_source_id TEXT REFERENCES news_sources(id),
  story_cluster_id TEXT,  -- groups related articles about the same event
  bias_distribution TEXT DEFAULT '{}',  -- JSON: {"left": 12, "centre": 8, "right": 3}
  geographic_distribution TEXT DEFAULT '{}',  -- JSON: {"US": 15, "UK": 8, "SE": 2}
  blind_spot_type TEXT CHECK(blind_spot_type IN ('left_blind','right_blind','geographic_blind','none')),
  ai_analysis TEXT,  -- JSON: AI-generated story analysis
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE news_articles (
  id TEXT PRIMARY KEY,
  story_id TEXT REFERENCES news_stories(id),
  source_id TEXT REFERENCES news_sources(id),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  article_bias_score REAL,  -- article-level AI bias analysis
  framing_analysis TEXT,  -- JSON: loaded words, omissions, framing
  is_original_reporting INTEGER DEFAULT 0,
  is_opinion INTEGER DEFAULT 0,
  content_snippet TEXT,
  status TEXT DEFAULT 'new' CHECK(status IN ('new','read','saved','dismissed','archived')),
  user_id TEXT DEFAULT 'default'
);
```

### Component C: Horizon Radar — News Edition

Extends the existing Regulatory Radar concept to general news monitoring:

- **Topic Subscriptions:** "Alert me to anything about EU AI regulation" / "Track all news about Swedish housing market" / "Follow developments in quantum computing"
- **Trend Detection:** AI identifies when a topic is accelerating in coverage — "This topic received 3x more coverage this week than average"
- **Sentiment Tracking:** How is coverage sentiment shifting over time? Increasingly positive/negative/neutral?
- **Cross-topic Connections:** AI identifies when seemingly unrelated stories are connected — "This supply chain disruption may be related to the policy change reported last week"

### Component D: Truth Verification Engine ("Is It True — Or Too Good to Be True?")

This is the most novel and potentially most impactful feature. It draws directly from ANTON's existing trust-through-process philosophy (transparency, auditability, human-in-the-loop) and applies it to information verification.

**What users can submit for verification:**
- URLs to articles, social media posts, or websites
- Screenshots / images (including memes, infographics, viral posts)
- Text (copy-pasted claims, forwarded messages, WhatsApp rumours)
- Audio/video transcripts
- "Something I heard" (free-text description of a claim)

**What ANTON does with it:**

**Phase 1: Claim Extraction**
- AI parses the input and identifies specific verifiable claims
- Each claim is extracted and presented separately
- Example: "This post contains 3 verifiable claims: (1) [X happened on Y date], (2) [Company Z said...], (3) [Statistics show...]"

**Phase 2: Source Tracing**
- For URLs: trace the original source, check if it's been modified/edited, look for the primary source
- For images: reverse image search, EXIF data analysis, AI manipulation detection (deepfake indicators)
- For claims: search for corroborating/contradicting sources across the news database
- For forwarded messages: pattern matching against known misinformation databases

**Phase 3: Multi-Dimensional Trust Scoring**

Each submitted item receives a **Trust Score Card** with dimensions:

| Dimension | What It Measures | Scale |
|-----------|-----------------|-------|
| **Source Credibility** | Track record of the publishing source | 0-100 |
| **Corroboration** | How many independent sources confirm this? | None / Few / Several / Widespread |
| **Recency** | Is this current or recycled old content presented as new? | Current / Dated / Recycled |
| **Manipulation Risk** | Signs of image/text/data manipulation | Low / Medium / High |
| **Scam Indicators** | Patterns matching known fraud/scam templates | Low / Medium / High / Critical |
| **Emotional Loading** | How much does this rely on emotional manipulation? | Low / Medium / High |
| **Overall Trust Score** | Weighted composite | 0-100 with traffic light (Green/Amber/Red) |

**Phase 4: Detailed Explanation**
- For every score dimension, ANTON explains *why* it scored that way
- Cites specific evidence: "This claim was first published by [source] on [date]. It has been confirmed by [Reuters, AP, BBC] but contradicted by [expert X, institution Y]"
- Identifies red flags: "This website was registered 3 days ago" / "This image appears in earlier contexts from 2019" / "This statistic does not match the cited report"
- Clear statement of what ANTON *cannot* verify and why

**Phase 5: Scam & Fraud Detection**
Specific patterns ANTON checks for:
- Known scam templates (investment scams, romance scams, phishing, fake charities)
- Too-good-to-be-true financial claims
- Urgency pressure tactics ("act now!", "limited time!")
- Identity spoofing (fake celebrity endorsements, fake government communications)
- URL analysis (typosquatting, suspicious domains, recently registered domains)
- Known fraud databases and blacklists

**Database additions:**

```sql
CREATE TABLE truth_checks (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  input_type TEXT NOT NULL CHECK(input_type IN ('url','image','text','audio','hearsay')),
  input_content TEXT NOT NULL,
  input_source TEXT,  -- where the user found it
  extracted_claims TEXT DEFAULT '[]',  -- JSON array of individual claims
  trust_score_overall REAL,
  trust_scores TEXT DEFAULT '{}',  -- JSON: per-dimension scores
  scam_indicators TEXT DEFAULT '[]',  -- JSON array of detected indicators
  ai_analysis TEXT,  -- full AI analysis
  evidence_sources TEXT DEFAULT '[]',  -- JSON: sources consulted
  verdict TEXT CHECK(verdict IN ('likely_true','probably_true','unverified','questionable','likely_false','scam_warning')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE known_scam_patterns (
  id TEXT PRIMARY KEY,
  pattern_type TEXT NOT NULL,  -- investment, romance, phishing, charity, etc.
  indicators TEXT NOT NULL,  -- JSON array of red flag patterns
  example_text TEXT,
  severity TEXT DEFAULT 'medium',
  source TEXT,  -- where this pattern was documented
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Relationship to existing Work modules:** The Truth Verification Engine draws methodology from Area 1 (FCP) fraud detection patterns, Area 9 (Cybersecurity) threat assessment, and Area 7 (Data & Analytics) data quality frameworks. In Work mode, professionals use structured risk assessments; in News mode, citizens use the same underlying rigour in a simplified, accessible interface.

### Component E: My News Bias Dashboard

A personal analytics page (inspired by Ground News Pro) showing:

- **Your Reading Bias:** Of the articles you've read, what's the bias distribution? Are you in an echo chamber?
- **Your Blind Spots:** Topics and perspectives you're consistently missing
- **Your Top Sources:** Which outlets do you rely on most? What are their bias/factuality profiles?
- **Diversity Score:** A single number showing how diverse your information diet is
- **Recommendations:** "You haven't read any centre-right perspectives on [topic] this week — here are 3 well-sourced articles"

## 1.3 What I Would Add (Claude's Input)

**Story Clustering & Threading:** Rather than showing individual articles, group them into "stories" — a single event covered by multiple outlets. This is how Ground News works and it's far more useful than a raw feed. Users see "EU AI Act Implementation — 23 sources" rather than 23 separate articles. The `story_cluster_id` in the schema above enables this. The clustering should be AI-powered: semantic similarity of headlines + entity extraction + temporal proximity.

**"Explain This Story" Module:** A button on any story cluster that generates a plain-language explainer: what happened, why it matters, what the key perspectives are, and what might happen next. Uses the full multi-source context. This is particularly valuable for complex or technical stories.

**Source Transparency for AI Analysis:** Since ANTON is using AI to rate bias and credibility, it must be transparent about this. Every AI judgement should show its reasoning. "I rated this article as lean-left because: (1) the headline uses loaded language [specific example], (2) the framing emphasises [perspective A] while omitting [perspective B], (3) the source selection favours [type of expert]." This is critical for credibility — an opaque bias rating is itself a form of bias.

**Temporal Context:** When a claim resurfaces (e.g., a debunked story reappears), ANTON should flag "This claim was previously fact-checked in [month/year] — here's what was found." Prevents zombie misinformation from going through the cycle again.

**Collaborative Verification:** In the Community tab (see below), users could flag suspicious content directly to the Truth Verification Engine, creating a crowd-sourced early warning system. "5 community members have flagged this story as potentially misleading."

**Multi-Language Support:** News is inherently multi-lingual. ANTON should be able to fetch and AI-translate news from non-English sources, particularly relevant for Nordic users who want coverage from Swedish, Norwegian, Danish, Finnish, and Icelandic media alongside English-language international sources. This aligns with the i18n-ready architecture principle.

**Regulatory connection:** For Work-tab users, News items that are relevant to their professional domain should be surfaceable in the Regulatory Radar. A news story about proposed financial regulation should automatically appear in the FCP radar for users who have that area active. This cross-tab intelligence makes ANTON more than the sum of its parts.

---

# TAB 2: FINANCE

## 2.1 Philosophy

The Finance tab is **education-first, not trading-first**. It's not Robinhood or eToro — it's the financially literate friend who helps you understand how money actually works. Think of it as a personal financial literacy tutor combined with an informed market observer.

The design principle: make complex financial concepts *understandable* through interactive tools, calculators, and AI-guided explanations — then, once the foundation is there, provide market monitoring that builds on that understanding.

## 2.2 Core Components

### Component A: Financial Literacy Engine (Learn & Understand)

A structured learning environment covering the financial topics that most people need but few understand well. Each topic area combines explanatory content, interactive calculators, and AI-guided Q&A.

**Topic Areas:**

**1. Home Economics & Personal Budgeting**
- Income vs. expenses breakdown tool
- Budget builder (50/30/20 rule, zero-based budgeting, envelope method)
- Expense categorisation and tracking concepts
- Savings rate calculator
- Emergency fund planning
- "Can I Afford This?" calculator — input a purchase, ANTON shows the real cost (opportunity cost, financing cost, impact on savings goals)
- Lifestyle inflation awareness

**2. Mortgages & Property Finance**
- How mortgages work — principal, interest, amortisation explained visually
- **Mortgage Calculator:** Input price, down payment, interest rate, term → see monthly payments, total interest paid, amortisation schedule
- Fixed vs. variable rate comparison tool
- Refinancing analysis: "Should I refinance?" calculator
- Swedish-specific: amorteringskrav (amortisation requirements), bolånetak (loan-to-value caps), ränteavdrag (interest deductions)
- Property affordability: "What can I afford?" based on income, debts, down payment
- First-time buyer guide

**3. Pensions & Retirement**
- How pension systems work (state pension, occupational pension, private pension)
- Swedish-specific: allmän pension, tjänstepension, privat pension, premiepension
- Pension projection calculator: "At your current rate, your estimated monthly pension at age 65 is..."
- Gap analysis: "You need X/month in retirement. Your current trajectory provides Y. The gap is Z."
- Pension optimization strategies
- International comparison: how different countries' pension systems work

**4. Savings & Investing Fundamentals**
- Save vs. invest decision framework
- Compound interest visualiser (interactive — drag sliders for rate, time, contribution)
- Risk/return spectrum explainer
- Asset class fundamentals: stocks, bonds, funds, ETFs, real estate, alternatives
- ISK vs. KF vs. depå (Swedish investment account types)
- Dollar cost averaging vs. lump sum analysis
- Emergency fund vs. investment allocation

**5. Debt & Lending**
- Good debt vs. bad debt framework
- Loan comparison calculator (input multiple loan offers, see true cost)
- Debt payoff strategies (snowball vs. avalanche, with calculator)
- Understanding interest rates: nominal vs. effective, APR vs. APY
- Credit scoring basics

**6. Tax Fundamentals**
- How income tax works (progressive taxation explained visually)
- Swedish tax system: kommunalskatt, statlig skatt, grundavdrag, jobbskatteavdrag
- Tax-advantaged savings (ISK, pension contributions, ROT/RUT)
- Self-employment/F-skatt basics
- Capital gains tax on investments and property
- Interactive: "Enter your income → see your effective tax rate and take-home pay"

**7. International Transactions & Currency**
- How international transfers work (SWIFT, SEPA, correspondent banking)
- Currency exchange: spot rates, spreads, hedging
- Transfer cost comparison: bank wire vs. Wise vs. Revolut vs. Western Union
- Travel money tips
- Importing/exporting payment considerations for small businesses

**8. Small Business Finance**
- Revenue vs. profit basics
- Cash flow management
- Business budgeting (different from personal budgeting)
- Invoice basics, payment terms, credit management
- Break-even analysis calculator
- Swedish: AB vs. EF, moms (VAT), F-skatt, arbetsgivaravgifter
- When to hire an accountant

**9. Insurance Literacy**
- What different insurance types cover and why they matter
- Hemförsäkring, bilförsäkring, livförsäkring, sjukförsäkring
- How to evaluate if you're over/under-insured
- Claim processes

**10. Financial Decision Framework**
- Major purchase decision tool
- Rent vs. buy analysis
- Lease vs. buy (cars)
- Subscription audit: "How much are you actually spending on subscriptions per year?"

**Implementation approach:** Each topic is a module-like structure using ANTON's existing seven-layer prompt architecture. The calculators are interactive React components embedded within the module's output area. The AI explains concepts conversationally, adjusting to the user's level of understanding (beginner → intermediate → advanced) using the Apprentice Model's skill-level tracking.

### Component B: Market Intelligence Dashboard (Watch & Understand)

Once users have the financial literacy foundation, the Market Intelligence Dashboard provides real-time awareness of what's happening in financial markets — not for day-trading, but for informed decision-making.

**Portfolio Watchlist:**
- Add companies/stocks/funds/indices you want to follow
- Each gets a dashboard card showing: current price, daily/weekly/monthly/YTD change, 52-week range, basic valuation metrics (P/E, dividend yield)
- Data sourced via financial data APIs (Yahoo Finance, Alpha Vantage, or similar free/affordable APIs)

**Market Context Panel:**
- Major index overview (S&P 500, NASDAQ, OMXS30, FTSE 100, etc.)
- Market mood indicator: AI-generated summary of what's driving markets today
- Sector performance heatmap
- Currency and commodity snapshot

**Peer Comparison:**
- For any company on your watchlist, see how it's performing vs. industry peers
- Relative valuation metrics
- Sector ranking

**Company Deep Dive (AI-Powered):**
Uses modules drawn from Area 5 (Banking & Finance), Area 10 (Investment & Asset Management), and Area 16 (Accounting & Finance):
- Earnings summary when quarterly results are released
- AI-generated plain-language explanation: "What do these numbers actually mean?"
- Key risk factors and opportunities
- Competitive positioning

**Horizon Radar — Finance Edition:**
Extends the news Horizon Radar specifically for financial news:
- Track news about companies on your watchlist
- Regulatory changes affecting your investments
- Macro-economic indicators (interest rate decisions, inflation data, employment figures)
- Earnings calendar for watched companies
- AI-scored relevance and impact (just like the regulatory radar)

**"What Would Happen If" Scenario Tool:**
- "What if interest rates go up 1%?" → Impact on your mortgage, bonds, stocks
- "What if inflation stays at 4%?" → Impact on purchasing power, savings value
- "What if I lose my job?" → How long would my emergency fund last?
- Uses the financial literacy calculators with scenario overlays

**Database additions:**

```sql
CREATE TABLE finance_watchlist (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  symbol TEXT NOT NULL,  -- ticker symbol
  exchange TEXT,  -- OMXS, NYSE, NASDAQ, etc.
  name TEXT NOT NULL,
  asset_type TEXT CHECK(asset_type IN ('stock','etf','fund','index','crypto','commodity','currency_pair')),
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT,
  alert_rules TEXT DEFAULT '[]'  -- JSON: price alerts, news alerts
);

CREATE TABLE finance_snapshots (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  price REAL,
  change_percent REAL,
  volume REAL,
  market_cap REAL,
  pe_ratio REAL,
  dividend_yield REAL,
  week_52_high REAL,
  week_52_low REAL,
  metadata TEXT DEFAULT '{}'  -- JSON: additional metrics
);

CREATE TABLE finance_learning_progress (
  id TEXT PRIMARY KEY,
  user_id TEXT DEFAULT 'default',
  topic_area TEXT NOT NULL,
  competency_level TEXT DEFAULT 'beginner' CHECK(competency_level IN ('beginner','intermediate','advanced')),
  modules_completed TEXT DEFAULT '[]',  -- JSON array
  calculator_usage_count INTEGER DEFAULT 0,
  last_accessed TEXT,
  notes TEXT
);
```

## 2.3 What I Would Add (Claude's Input)

**Jargon Translator:** Financial language is one of the biggest barriers to financial literacy. Every piece of content in the Finance tab should have a "Explain Like I'm New" toggle that replaces financial jargon with plain language. This should work on market news too: ANTON processes a Bloomberg-style headline and produces a version anyone can understand.

**Goal-Based Planning:** Rather than abstract education, anchor everything to the user's actual goals. "I want to buy an apartment in 3 years" → ANTON calculates savings targets, shows mortgage scenarios, tracks progress. "I want to retire at 60" → gap analysis, catch-up contribution calculations. Goals make the education concrete and motivating.

**Life Event Simulator:** Major financial decisions often cluster around life events. A module that walks through: "Getting married? Here's what changes financially." / "Having a baby? Here are the costs and benefits to plan for." / "Starting a business? Here's the financial roadmap." Swedish-specific: föräldrapenning, barnbidrag, etc.

**Inflation-Adjusted Everything:** Every calculator should have an "in today's money" toggle. People dramatically underestimate inflation's impact. Show both nominal and real values side by side.

**Data API Strategy:** For market data, I'd recommend starting with Yahoo Finance (free, good coverage, includes Nordic stocks) and Alpha Vantage (free tier for basic data). For Swedish-specific data (Riksbanken rates, SCB statistics), there are public APIs. Keep the data layer abstracted so providers can be swapped without changing the UI.

**NOT Financial Advice Guardrails:** This is critical. The Finance tab must never cross the line into personalised financial advice. Every calculator and analysis should include clear disclaimers. ANTON should say "Here are the factors to consider" rather than "You should do X." This is both legally prudent and philosophically aligned with ANTON's approach: give people the tools and information to make their own decisions, don't make decisions for them. The existing Context & Constraints system (Type B) should include financial advice disclaimers as a default constraint.

**Connection to Work tab:** For users who are financial professionals, the Finance tab's market data and analysis should be accessible from the Work tab's Investment & Asset Management area (Area 10) and Banking & Finance area (Area 5). A portfolio manager should be able to pull watchlist data into a client report. A startup founder should be able to pull financial projections into a pitch deck.

---

# TAB 3: COMMUNITY

## 3.1 Philosophy

The Community tab brings human connection into ANTON. Think of it as a peer-to-peer social layer with the values of early internet communities (forums, groups, genuine discussion) but with modern security and the unique advantage of ANTON's .anton format for identity and data exchange.

The design principles:
- **Privacy-first:** Encrypted by default, P2P connection model, no centralised social graph to mine
- **Opt-in everything:** Disabled by default (as you specified), every feature requires explicit activation
- **Real community, not engagement farming:** No algorithmic feed manipulation, no infinite scroll, no engagement metrics designed to addict
- **ANTON-native:** Uses .anton format for contacts, shares ANTON capabilities within communities (share modules, run collaborative sessions)

## 3.2 Core Components

### Component A: Identity & Connection Protocol (.anton Contact System)

This is the architectural foundation. Rather than traditional username/password accounts on a central server, ANTON uses a cryptographic identity model inspired by blockchain address systems.

**Identity Generation:**

When a user enables the Community tab, ANTON generates:

1. **A keypair:** Ed25519 public/private key pair
   - Private key: stored locally only, never leaves the device, encrypted at rest
   - Public key: forms the basis of the user's contact hash
2. **Contact Hash:** A human-readable-ish identifier derived from the public key
   - Format: `ANTON-XXXX-XXXX-XXXX-XXXX` (where X is alphanumeric)
   - Example: `ANTON-7K3M-R9F2-B4WN-Q8LP`
   - Shorter than a Bitcoin address, still unique enough for practical use
   - Optional: users can register a "vanity name" → `daniel.anton` that maps to their hash (stored in a lightweight directory, optional)
3. **Contact Card (.anton file):**
   - A `.anton` bundle (bundle type: `contact`) containing:
     - Public key
     - Contact hash
     - Display name (user-chosen)
     - Optional: avatar, bio, professional areas of interest
     - Optional: public module/skill portfolio (things you've published)
   - This is what you share with someone to become "friends"

**Connection Process (Mutual Consent):**

This is the critical security design. Connections require **mutual exchange** — both parties must have each other's contact hash.

```
Step 1: Alice exports her .anton contact file (or shares her hash)
Step 2: Alice sends it to Bob via any channel (email, Signal, in person, QR code)
Step 3: Bob imports Alice's contact file into ANTON
Step 4: Bob exports his .anton contact file to Alice
Step 5: Alice imports Bob's contact file
Step 6: Both ANTON instances detect the mutual exchange → connection established
Step 7: End-to-end encrypted channel is created using the exchanged public keys
```

**Why this matters:**
- No frivolous connections — you must actively exchange credentials
- No mass friend-request spam — you can't request a connection without already having someone's hash
- No centralised directory to scrape — connections are peer-to-peer
- No social graph stored on any server — your connections live in your local ANTON instance
- Familiar mental model: like exchanging business cards or phone numbers

**Group/Community Identity:**

Groups (classes, sports teams, forums, companies) work the same way but with a group keypair:

```
Step 1: Group creator generates a group identity
Step 2: Group gets its own hash: ANTON-GRP-XXXX-XXXX-XXXX
Step 3: Creator shares group .anton contact file with invited members
Step 4: Members import the group contact file
Step 5: Group creator imports each member's individual contact file
Step 6: Members can now see the group and its content
```

**Group roles:**
- **Owner:** Created the group, can add/remove admins, delete group
- **Admin:** Can approve new members, moderate content, manage settings
- **Member:** Can post, comment, participate
- **Observer:** Can read but not post (useful for announcement channels)

**Database schema:**

```sql
CREATE TABLE community_identity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,  -- encrypted with user's master key
  contact_hash TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_path TEXT,
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE community_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  contact_hash TEXT NOT NULL,
  contact_public_key TEXT NOT NULL,
  display_name TEXT,
  connection_type TEXT DEFAULT 'individual' CHECK(connection_type IN ('individual','group')),
  group_id TEXT,  -- if connection_type is group
  status TEXT DEFAULT 'active' CHECK(status IN ('active','blocked','removed')),
  connected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_interaction TEXT
);

CREATE TABLE community_groups (
  id TEXT PRIMARY KEY,
  group_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  group_type TEXT DEFAULT 'open' CHECK(group_type IN ('open','closed','secret')),
  public_key TEXT NOT NULL,
  private_key_encrypted TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  settings TEXT DEFAULT '{}',  -- JSON: moderation rules, posting permissions
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE community_group_members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES community_groups(id),
  member_hash TEXT NOT NULL,
  member_public_key TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK(role IN ('owner','admin','member','observer')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Component B: Messaging (Direct & Group)

**Direct Messages:**
- End-to-end encrypted using the exchanged public keys
- Messages stored locally on each participant's device (not on a central server)
- Support for text, images, files, and .anton file sharing
- Message history controlled by each user independently (you can delete your copy)
- Optional: ephemeral messages (auto-delete after X hours/days)

**Group Chat:**
- Encrypted with the group key
- All group members can read; posting follows role permissions
- Thread support (reply to specific messages)
- Pinned messages for important announcements
- @mentions for specific members

**Encryption approach:**
- Direct messages: X25519 Diffie-Hellman key exchange → AES-256-GCM encryption
- Group messages: group-level symmetric key, distributed to members via their individual public keys
- Forward secrecy: keys rotate periodically (new session keys derived)
- Local storage: all messages encrypted at rest on device

### Component C: Forums & Discussion Boards

Threaded discussion forums within groups, inspired by Reddit/early forums but without the engagement manipulation:

**Structure:**
- Each group can have multiple forums/channels
- Forums contain threads (topics)
- Threads contain posts and replies
- Threaded replies (nested, like Reddit)

**Features:**
- Markdown support for formatting
- File attachments (images, documents, .anton files)
- Upvote/downvote (optional per group — some communities may prefer no voting)
- Tagging and categorisation
- Search within group forums
- Moderation tools: pin, lock, remove, report

**No algorithmic manipulation:**
- Default sort is chronological (newest first) or by activity (most recent reply)
- Optional: "most upvoted" sort
- No hidden algorithmic boosting
- No "engagement" scoring
- No infinite scroll — paginated results

**Database additions:**

```sql
CREATE TABLE community_forums (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES community_groups(id),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  settings TEXT DEFAULT '{}',  -- JSON: voting enabled, posting rules
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE community_threads (
  id TEXT PRIMARY KEY,
  forum_id TEXT NOT NULL REFERENCES community_forums(id),
  author_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  is_locked INTEGER DEFAULT 0,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  last_reply_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE community_posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES community_threads(id),
  parent_post_id TEXT,  -- for nested replies
  author_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  is_removed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Component D: ANTON-Native Community Features

What makes this different from "yet another forum/chat app" — the integration with ANTON's core capabilities:

**1. Shared Modules & Skills**
- Share .anton module packages directly in community forums
- "Here's the module I built for GDPR data mapping — import it and try it"
- Version discussion: community members discuss and improve shared modules
- Rating and review system for shared packages (precursor to the full marketplace)

**2. Collaborative Sessions**
- Invite community members into shared ANTON sessions
- Study group: "Let's work through this case study together using the FCP area"
- Class setting: teacher shares a module, students work through it independently, discussion in forum
- Code review: share Coding Area outputs for peer review

**3. Community Challenges**
- Groups can create learning challenges: "Complete 5 modules in Area 1 this month"
- Progress tracking (opt-in)
- Leaderboards (opt-in, gamification for those who want it)

**4. Cross-Tab Integration**
- Share a News story into a community group for discussion
- Share a Finance analysis or market view for group discussion
- Share Work outputs (with appropriate redaction) for peer review

**5. Community-Sourced Truth Verification**
- Flag a news article as suspicious → community votes on trustworthiness
- Feeds into the Truth Verification Engine as additional signal
- Expert communities can provide domain-specific verification

### Component E: Security Architecture

Since this is the component most likely to face cybersecurity scrutiny, the security design must be exceptionally thorough:

**Disabled by Default:**
- Community tab is OFF in fresh ANTON installations
- Requires explicit activation in Settings → Community → Enable
- Clear explanation of what enabling it means: "This enables peer-to-peer communication features. No data is shared with any server by default."

**Local-First P2P Architecture:**
- Messages and forum content stored locally on each device
- P2P communication options:
  - **Option 1: Direct P2P** (LAN/VPN): devices connect directly (ideal for corporate/classroom)
  - **Option 2: Relay Server** (internet): messages pass through a relay server but are E2E encrypted (relay can't read content)
  - **Option 3: Hybrid**: direct when possible, relay when needed
- The relay server sees only encrypted blobs, sender/receiver hashes, and timestamps
- Users can self-host the relay server for maximum control

**Data Sovereignty:**
- All community data resides locally
- Export all your community data at any time
- Delete all community data at any time (right to erasure)
- No community data is sent to AI providers (messages are never included in LLM prompts unless the user explicitly asks ANTON to help draft a message)

**Moderation & Safety:**
- Group owners/admins have moderation tools
- Users can block/report other users
- Optional: AI-assisted content moderation within groups (scanning for harmful content, opt-in)
- Clear community guidelines framework (customisable per group)
- No anonymous posting by default (every post traceable to a contact hash within the group)

**Threat Model:**
| Threat | Mitigation |
|--------|-----------|
| Mass surveillance of messages | E2E encryption; relay server sees only ciphertext |
| Social graph analysis | No centralised connection database; connections are local |
| Impersonation | Cryptographic identity; connection requires mutual key exchange |
| Spam/abuse | Mutual consent for connections; group moderation tools |
| Data breach at relay | Relay stores no plaintext; messages are E2E encrypted |
| Device theft | Private keys encrypted at rest; requires master password |
| Rogue group admin | Members can leave; data deletion is per-user |

---

# CROSS-TAB ARCHITECTURE

## How the Three Tabs Interconnect

The real power emerges when these tabs work together:

**News → Finance:** A news story about an interest rate decision automatically surfaces in the Finance tab for users tracking mortgage rates. A company scandal in the news triggers an alert on the Finance watchlist.

**News → Community:** Share and discuss news stories in community groups. Community-sourced trust scores feed back into the Truth Verification Engine.

**Finance → Community:** Study groups for financial literacy. Shared watchlists within investment clubs. Discussion of market events.

**Work → News:** Regulatory news from the News tab feeds into the existing Regulatory Radar in Work mode. Professional news relevant to a user's active areas surfaces contextually.

**Work → Finance:** PE/VC modules (Area 10) can pull market data from the Finance tab. Financial analysis modules can reference watchlist companies. Financial advisor modules get richer context.

**Work → Community:** Share modules and get peer review. Professional communities (compliance officers, auditors, developers) share .anton packages. Collaborative Canvas connects to community for multi-organisation workflows.

**School → All Tabs:** Students can discuss coursework in Community. Financial literacy modules from Finance become School assignments. News literacy and truth verification become School exercises.

---

# IMPLEMENTATION CONSIDERATIONS

## Priority & Phasing

| Phase | Timeline | What Ships |
|-------|----------|-----------|
| **Phase 1** | Near-term | News Feed + Source Intelligence (builds on existing Radar) |
| **Phase 2** | Near-term | Finance Literacy Engine (calculators + education) |
| **Phase 3** | Medium-term | Truth Verification Engine |
| **Phase 4** | Medium-term | Finance Market Intelligence |
| **Phase 5** | Later | Community Identity & Messaging (needs security audit) |
| **Phase 6** | Later | Community Forums & ANTON-native features |

Rationale: News and Finance have lower security risk and build on existing infrastructure. Community requires the most careful security design and should undergo independent security review before launch.

## Data & API Dependencies

| Feature | External Dependency | Free Tier? | Alternative |
|---------|-------------------|-----------|------------|
| News feeds | RSS/web scraping | Yes (existing) | None needed |
| News APIs | NewsAPI / GNews | Limited free | Multiple alternatives |
| Source bias data | MBFC / Ad Fontes / AllSides | Partially | Build own database over time |
| Market data | Yahoo Finance API | Yes | Alpha Vantage, Twelve Data |
| Swedish market data | Avanza API / Nordnet | Unofficial | Screen scraping |
| Riksbank rates | Riksbanken API | Yes (public) | — |
| Currency exchange | ExchangeRate API | Yes (free tier) | Open Exchange Rates |
| Image reverse search | TinEye / Google Vision | Limited free | Local ML model |
| Domain age/WHOIS | WHOIS APIs | Limited free | Direct WHOIS queries |

## Security Audit Requirements (Community Tab)

Before enabling the Community tab even in beta:
1. Independent cryptographic review of the key exchange protocol
2. Penetration testing of the relay server
3. Review of the .anton contact file format for injection/exploitation vectors
4. Privacy impact assessment (GDPR compliance for P2P social features)
5. Review of moderation tools and abuse reporting mechanisms

## New Database Table Count

| Tab | New Tables | Extends Existing |
|-----|-----------|-----------------|
| News | 4 (news_sources, news_stories, news_articles, truth_checks + known_scam_patterns) | radar_sources, radar_items |
| Finance | 3 (finance_watchlist, finance_snapshots, finance_learning_progress) | Reuses module/session architecture |
| Community | 7 (community_identity, community_connections, community_groups, community_group_members, community_forums, community_threads, community_posts) | — |
| **Total** | **14 new tables** | 2 extended |

This brings the platform from 82 tables to approximately **96 tables**.

## Whitepaper Integration

These three tabs warrant a new Part in the whitepaper — likely **Part 13: Beyond Work — News, Finance & Community** — covering:
- The Life Platform vision
- News Tab specification (condensed)
- Finance Tab specification (condensed)
- Community Tab specification (condensed)
- Cross-tab intelligence architecture
- Security model for Community

This would add approximately 5,000-8,000 words to the whitepaper.

---

## Open Questions for Daniel

1. **News source database:** Should ANTON build its own source bias database from scratch (more work, more control, more credible), or should it initially rely on existing databases like MBFC (faster but dependency)? I lean toward building our own with AI-assisted analysis, seeded by publicly available data.

2. **Finance data freshness:** Real-time stock data requires paid APIs or websocket connections. Is delayed data (15-20 min) acceptable for the initial version? This keeps costs down and matches the "understanding, not trading" philosophy.

3. **Community relay server:** Should FutureChain AB operate a default relay server, or should the Community tab be purely self-hosted relay from day one? A default relay lowers the barrier but creates a centralised dependency that contradicts the philosophy.

4. **Community moderation liability:** If ANTON provides the social infrastructure, there are potential content moderation obligations (especially under the EU Digital Services Act). P2P architecture with E2E encryption creates a "we can't see it" defence, but this needs legal review.

5. **Scope vs. focus:** These three tabs significantly expand ANTON's scope. Should they ship as part of the core platform, or as optional "add-on" packs that users explicitly install? This affects the perception of ANTON — is it a professional AI platform that also does these things, or a life platform from the start?
