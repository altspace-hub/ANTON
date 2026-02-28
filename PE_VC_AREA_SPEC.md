# openEXPERT / ANTON — Private Equity & Venture Capital Area: Full Specification

> **Audience:** Claude Code
> **Purpose:** Full briefing on a new area — "Private Equity & Venture Capital" — covering the entire investment lifecycle from sourcing through exit, plus an Innovation & Market Radar adapted from the existing Regulatory Radar architecture.
> **Priority:** HIGH — this area has dual strategic value. First, it serves a massive professional market (PE/VC firms spend millions on tools and analysts doing work ANTON can accelerate). Second, when Daniel pitches openEXPERT to VC firms, they see their own workflow reflected in the platform — which is the most compelling demo possible.
> **First step for Claude Code:** Read this document fully, then scan the codebase. Key things to understand: the Regulatory Radar implementation (`server/services/regulatory-radar.ts`, `RadarPage.tsx`, radar database tables), the existing Investment & Asset Management area (Area 10, 4 modules), the Risk Management area (Area 6), the Banking & Finance area (Area 5), and the Strategy area (Area 12). The PE/VC area builds on and cross-links to all of these, but is fundamentally different — these are investors, not operators.

---

## 1. Why This Area Matters

### The Strategic Play

When a VC partner reads the openEXPERT whitepaper and sees an area called "Private Equity & Venture Capital" with modules covering deal sourcing, due diligence, IC memos, portfolio monitoring, and exit planning — they're not reading about someone else's tool. They're reading about **their Monday morning**. 

That recognition — "wait, this describes what *I* do" — is worth more than any pitch deck. The platform stops being abstract technology and becomes a concrete answer to problems they experience daily: too many deals to screen, too little time for deep diligence, IC memos that take a week, portfolio companies that surprise them, exits that are poorly timed.

### The Market Reality

A typical VC firm (seed/Series A, 5-10 investment professionals) processes:
- 2,000-5,000 inbound deals per year
- 200-500 get a first look (10-25%)
- 50-100 get a meeting
- 15-30 get to diligence
- 5-10 get funded

That's a **99.5% rejection rate** — but every rejection still requires reading, assessing, and deciding. An associate spending 30 minutes per initial screen × 3,000 deals = **1,500 hours/year** just on first-pass screening. ANTON can do the initial screen in 2 minutes with better consistency.

A PE firm (growth/buyout) processes fewer deals but goes deeper:
- 500-1,000 opportunities per year
- 50-100 get preliminary analysis
- 15-25 get to due diligence
- 3-8 get funded
- Due diligence takes 200-400 hours per deal

PE diligence is where the real cost is. A team of 3 spending 300 hours on diligence at fully-loaded analyst cost of $150-300/hour = $135,000-270,000 per deal in labour alone. If ANTON can cut diligence prep time by 40%, that's $50,000-100,000 saved per deal.

### PE vs. VC: Same Area, Different Modes

PE and VC are related but distinct. The modules serve both, but with different defaults:

| Dimension | Venture Capital | Private Equity |
|-----------|----------------|----------------|
| Stage | Pre-revenue to Series B | Growth to buyout |
| Volume | High deal flow, fast screening | Lower volume, deep analysis |
| Key metrics | TAM, MRR, burn rate, founder quality | EBITDA, margins, cash flow, management team |
| Diligence depth | Lighter, founder-focused | Heavy, operational and financial |
| Value creation | Board seats, network, hiring | Operational improvement, M&A, leverage |
| Exit | IPO, M&A, secondary | IPO, strategic sale, secondary buyout |
| Holding period | 7-10 years | 3-7 years |
| Valuation approach | Comparable transactions, milestone-based | DCF, LBO model, comparable multiples |

Every module in this area has a guided input for **investment style** (VC Early Stage / VC Growth / PE Growth / PE Buyout / PE Turnaround) that adjusts the analysis framework, metrics, and depth.

---

## 2. Area Definition

### Area Configuration

```
Area ID: pe-vc
Area Number: 34
Label: Private Equity & Venture Capital
Short Label: PE/VC
Icon: TrendingUp (or Rocket for VC emphasis, or Briefcase for PE)
Color: Deep navy or dark purple — signals "serious money, sophisticated users"
```

### Area Context (`area-context.md`)

```markdown
# Private Equity & Venture Capital

This area serves investment professionals across the PE/VC spectrum — 
from seed-stage VC associates screening thousands of startups to 
PE partners planning billion-dollar buyouts. The modules cover the 
complete investment lifecycle: sourcing, screening, diligence, 
valuation, investment committee, portfolio management, value creation, 
and exit.

## Who Uses This Area

- VC associates and analysts (deal screening, market research)
- VC partners (IC preparation, portfolio oversight, fundraising)
- PE associates and VP-level (financial modelling, diligence, IC memos)
- PE partners and managing directors (deal strategy, portfolio value creation, exit timing)
- Fund-of-funds analysts (GP evaluation, portfolio construction)
- Family offices (direct investment screening, co-investment analysis)
- Corporate venture / M&A teams (strategic investment evaluation)
- Placement agents and fund administrators

## The Investment Lifecycle

1. SOURCING — Finding deals (proactive and reactive)
2. SCREENING — Fast initial assessment (fit, quality, timing)
3. DEEP DIVE — Detailed research on promising opportunities
4. DUE DILIGENCE — Comprehensive analysis before investment
5. VALUATION — What is it worth? What should we pay?
6. INVESTMENT COMMITTEE — Preparing and presenting the case
7. POST-INVESTMENT — Portfolio monitoring and value creation
8. EXIT — Timing, preparation, and execution

## Key Frameworks

- Porter's Five Forces (competitive analysis)
- TAM/SAM/SOM (market sizing)
- Unit economics (LTV/CAC, payback period, margin expansion)
- LBO modelling (for PE buyouts)
- DCF / Comparable / Precedent transactions (valuation)
- 100-day plan (post-acquisition value creation)
- J-curve and DPI/TVPI/IRR (fund performance)

## Integration with Other Areas

- Area 5 (Banking & Finance) → financial analysis depth
- Area 6 (Risk Management) → risk frameworks for investment decisions
- Area 10 (Investment & Asset Management) → portfolio theory, asset allocation
- Area 12 (Strategy & Planning) → strategic analysis frameworks
- Area 2 (Legal & Regulatory) → transaction structuring, regulatory considerations
- Area 7 (Data & Analytics) → data-driven deal analysis
- Area 16 (Accounting & Finance) → financial statement analysis
```

### Personas

**Persona 1: The VC Partner**
```json
{
  "id": "vc-partner",
  "name": "Venture Capital Partner",
  "role": "Experienced VC partner with 15+ years and 50+ investments across multiple funds",
  "expertise": [
    "Pattern recognition across thousands of companies",
    "Founder assessment and team dynamics",
    "Market timing and sector thesis development",
    "Portfolio construction and fund strategy",
    "Board governance and strategic guidance"
  ],
  "tone": "Direct, pattern-driven, intellectually curious. Asks the questions that cut to the heart of whether a business will work. Thinks in frameworks but knows when to trust gut. Respects founders but doesn't sugarcoat.",
  "perspective": "Has seen hundreds of pitch decks that all claim to be 'the Uber of X'. Knows that execution matters more than ideas, that team matters more than product at early stage, and that market timing is the most underrated factor. Sceptical of projections but open to vision."
}
```

**Persona 2: The PE Deal Professional**
```json
{
  "id": "pe-professional",
  "name": "Private Equity Deal Professional",
  "role": "PE principal with deep experience in buyouts, growth equity, and operational transformation",
  "expertise": [
    "Financial modelling and LBO structuring",
    "Operational due diligence",
    "Management team assessment",
    "Value creation planning (100-day plans, margin improvement)",
    "Exit planning and process management"
  ],
  "tone": "Analytical, structured, numbers-driven but understands that spreadsheets don't run companies. Thinks in terms of 'what can we change to create value' rather than just 'what does it look like today'. Comfortable with complexity.",
  "perspective": "Knows that the best PE returns come from operational improvement, not financial engineering. Focuses on management quality, market position defensibility, and realistic value creation levers. Has seen deals die in diligence and knows what red flags actually matter."
}
```

**Persona 3: The Market Intelligence Analyst**
```json
{
  "id": "market-intelligence",
  "name": "Market Intelligence Analyst",
  "role": "Research analyst specialising in technology trends, emerging markets, and competitive landscapes",
  "expertise": [
    "Technology trend analysis and adoption curves",
    "Competitive landscape mapping",
    "Market sizing (bottom-up and top-down)",
    "Emerging sector identification",
    "Company and founder background research"
  ],
  "tone": "Thorough, data-driven, sceptical of hype. Distinguishes between 'interesting technology' and 'investable opportunity'. Reads beyond the headline to understand second-order effects.",
  "perspective": "Tracks Gartner hype cycles, understands that most 'revolutionary' technologies take 10 years to reach mainstream adoption, and knows that the first mover rarely wins — the best executor does."
}
```

---

## 3. The Modules (12 Modules)

### Module 1: Deal Screening & First Look

**ID:** `deal-screening`
**Icon:** `Filter`
**Purpose:** Rapid initial assessment of an investment opportunity — should we spend more time on this?
**Default Model:** Sonnet 4.5 (fast, cost-effective for high-volume screening)
**Thinking:** `think`
**Creativity:** `strict`
**Target Cost:** $0.15-0.40 per screen

**The problem it solves:**
Associates spend 30-60 minutes per initial deal screen. Most deals are rejected at this stage. This module takes a pitch deck summary, company description, or forwarded email and produces a structured first-look assessment in 2-3 minutes.

**System Prompt Essence:**
You are a senior investment professional doing an initial screen of an investment opportunity. Produce a rapid assessment covering: what the company does (one sentence), market opportunity (credible TAM?), competitive position (who else is doing this?), team quality signals (background, relevant experience), traction indicators (revenue, users, growth rate), investment fit (stage, sector, geography match for the user's fund), red flags (anything that would kill the deal immediately), and a clear recommendation (Pass / Explore Further / Priority). Be direct and efficient — this is a first look, not a deep dive.

For VC screens: weight founder quality and market size heavily.
For PE screens: weight financial performance and operational metrics heavily.

**Guided Inputs:**
```json
[
  {"id": "investment_style", "label": "Your investment focus", "type": "select",
   "options": ["VC Early Stage (Pre-seed to Series A)", 
               "VC Growth (Series B+)", 
               "PE Growth Equity",
               "PE Buyout", 
               "PE Turnaround/Special Situations",
               "Corporate Venture / Strategic",
               "Fund-of-Funds"],
   "required": true},
  {"id": "deal_source", "label": "How did this deal come in?", "type": "select",
   "options": ["Pitch deck received", "Warm intro / referral", 
               "Outbound (we found them)", "Broker / advisor", 
               "Portfolio company connection", "Conference / event"],
   "required": false},
  {"id": "company_info", "label": "What do you know about the company? (paste deck summary, description, URL, or forwarded email)", 
   "type": "textarea", "required": true},
  {"id": "sector_focus", "label": "Your sector focus (if any)", "type": "text",
   "required": false, "placeholder": "e.g., B2B SaaS, Fintech, Climate, Healthcare"},
  {"id": "stage_focus", "label": "Your typical check size", "type": "select",
   "options": ["<$500K", "$500K-$2M", "$2M-$10M", "$10M-$50M", "$50M-$200M", "$200M+"],
   "required": false},
  {"id": "geography_focus", "label": "Geographic focus", "type": "text",
   "required": false, "placeholder": "e.g., Nordics, Europe, Global"}
]
```

**Output Formats:** One-page screen memo, RAG-rated scorecard (Red/Amber/Green per dimension), pass/explore recommendation

**Key Feature: Batch Mode Integration**
This module should work with the existing Batch Create capability — upload a CSV of 50 companies (name, description, URL) and get 50 screening memos back. This is the high-volume use case that saves hundreds of hours per year.

---

### Module 2: Market & Competitive Intelligence

**ID:** `market-intelligence`
**Icon:** `Globe`
**Purpose:** Deep market research — sizing, trends, competitive landscape, and sector thesis development
**Default Model:** Opus 4.6 (deep reasoning required for market analysis)
**Thinking:** `think_hard`
**Creativity:** `balanced`
**Target Cost:** $1.00-3.00 per analysis

**The problem it solves:**
Market research for investment decisions requires synthesising multiple data sources, building bottom-up market models, mapping competitive landscapes, and identifying non-obvious trends. Associates spend days on this; ANTON can produce a solid first draft in 30 minutes.

**Guided Inputs:**
```json
[
  {"id": "research_type", "label": "What do you need?", "type": "select",
   "options": [
     "Market sizing (TAM/SAM/SOM)",
     "Competitive landscape map",
     "Sector thesis / trend analysis",
     "Company deep dive (specific company)",
     "Technology assessment (specific tech)",
     "Geographic market comparison"
   ], "required": true},
  {"id": "sector", "label": "Sector / market", "type": "text", "required": true,
   "placeholder": "e.g., European embedded finance, Nordic proptech"},
  {"id": "specific_company", "label": "Specific company (if applicable)", 
   "type": "text", "required": false},
  {"id": "investment_context", "label": "Investment context", "type": "select",
   "options": ["Evaluating a specific deal", "Building sector thesis", 
               "Portfolio company strategic review", "Fundraising / LP reporting",
               "General intelligence"],
   "required": true},
  {"id": "depth", "label": "Depth needed", "type": "select",
   "options": ["Quick overview (1-2 pages)", "Standard analysis (3-5 pages)", 
               "Deep dive (10+ pages)"],
   "required": true}
]
```

**Output Formats:** Market overview report, competitive landscape map (table), TAM/SAM/SOM model, trend analysis, company profile

**Web Search Integration:** This module should default to enabling web search — market intelligence requires current data.

---

### Module 3: Due Diligence Workbench

**ID:** `due-diligence`
**Icon:** `SearchCheck`
**Purpose:** Structure and accelerate due diligence — from initial request list to findings synthesis
**Default Model:** Opus 4.6 (deep analysis, accuracy critical)
**Thinking:** `investigate`
**Creativity:** `strict`
**Target Cost:** $2.00-5.00 per diligence module

**The problem it solves:**
Due diligence is the most labour-intensive phase of any deal. The module doesn't replace diligence — it structures it, generates request lists, analyses uploaded materials, identifies gaps, flags risks, and synthesises findings.

**System Prompt Essence:**
You are a due diligence professional supporting a thorough investigation of a potential investment. Your job is to help structure the diligence process, identify what information is needed, analyse materials provided, flag risks and inconsistencies, and synthesise findings into clear, actionable summaries. You are thorough but efficient — focus on what actually matters for the investment decision, not just box-checking.

For VC diligence: focus on product-market fit evidence, founder reference themes, unit economics trajectory, and technology differentiation.
For PE diligence: focus on quality of earnings, working capital normalisation, customer concentration, management team depth, and operational improvement opportunity.

**Guided Inputs:**
```json
[
  {"id": "diligence_phase", "label": "What phase are you in?", "type": "select",
   "options": [
     "Planning (need a diligence request list)",
     "Commercial DD (market, customers, competition)",
     "Financial DD (analysing financials uploaded)",
     "Operational DD (processes, team, technology)",
     "Legal DD (contracts, IP, regulatory)",
     "ESG DD (environmental, social, governance)",
     "Findings synthesis (pulling it all together)",
     "Red flag check (quick risk scan)"
   ], "required": true},
  {"id": "investment_style", "label": "Investment type", "type": "select",
   "options": ["VC Early Stage", "VC Growth", "PE Growth", "PE Buyout", "PE Turnaround"],
   "required": true},
  {"id": "company_description", "label": "Target company description", 
   "type": "textarea", "required": true},
  {"id": "deal_size", "label": "Approximate deal size", "type": "text", 
   "required": false, "placeholder": "e.g., €15M Series B, $200M buyout"},
  {"id": "key_concerns", "label": "Any specific concerns to investigate?",
   "type": "textarea", "required": false,
   "placeholder": "e.g., Customer concentration, founder vesting, regulatory risk"}
]
```

**Output Formats:** Diligence request list (categorised), findings memo, risk register, gap analysis, executive summary

**Knowledge Source Integration:** Users will upload data room documents. The module should work with local folder knowledge source pointed at the data room. ANTON reads the documents and cross-references against the diligence request list.

---

### Module 4: Financial Analysis & Modelling Assistant

**ID:** `financial-analysis`
**Icon:** `Calculator`
**Purpose:** Analyse financial statements, build models, stress-test assumptions, and identify value drivers
**Default Model:** Opus 4.6 (accuracy critical for financial work)
**Thinking:** `think_hard`
**Creativity:** `strict`
**Target Cost:** $1.50-4.00

**The problem it solves:**
Every deal requires financial analysis. For VC: unit economics, burn rate analysis, revenue projection sensitivity. For PE: quality of earnings, EBITDA bridge, working capital analysis, LBO returns. This module doesn't replace a spreadsheet model but helps build the narrative around the numbers, identifies the assumptions that matter most, and flags inconsistencies.

**Guided Inputs:**
```json
[
  {"id": "analysis_type", "label": "What analysis do you need?", "type": "select",
   "options": [
     "Unit economics breakdown (VC)",
     "Revenue model analysis and projections",
     "Quality of earnings analysis (PE)",
     "Working capital and cash flow analysis",
     "LBO returns analysis (PE buyout)",
     "Comparable company / transaction analysis",
     "Sensitivity analysis (what breaks the model?)",
     "Financial statement red flags",
     "Management case vs. our case comparison"
   ], "required": true},
  {"id": "financials_provided", "label": "What financial data do you have?", "type": "select",
   "options": ["Full P&L and balance sheet", "Summary financials / deck",
               "Key metrics only (ARR, growth, margins)", "Nothing yet — help me structure what to ask for"],
   "required": true},
  {"id": "financial_data", "label": "Paste or describe the key numbers",
   "type": "textarea", "required": false},
  {"id": "investment_style", "label": "Investment type", "type": "select",
   "options": ["VC Early", "VC Growth", "PE Growth", "PE Buyout"],
   "required": true}
]
```

**Output Formats:** Financial analysis memo, metric dashboard summary, sensitivity table, assumption register, red flags list

---

### Module 5: Valuation Framework

**ID:** `valuation-framework`
**Icon:** `Scale`
**Purpose:** Structure and execute valuation analysis using appropriate methodologies for stage and type
**Default Model:** Opus 4.6
**Thinking:** `think_hard`
**Creativity:** `strict`
**Target Cost:** $1.50-4.00

**The problem it solves:**
Valuation is where art meets science. Early-stage VC valuations are largely based on comparable deals and market sentiment. Late-stage VC and PE valuations require multiple methodologies (DCF, comparables, precedent transactions, LBO analysis) that should triangulate. This module helps structure the valuation approach, apply the right frameworks, and stress-test the resulting range.

**Guided Inputs:**
```json
[
  {"id": "valuation_context", "label": "What's the valuation for?", "type": "select",
   "options": [
     "New investment (what should we pay?)",
     "Portfolio mark-to-market (quarterly valuation)",
     "Exit preparation (what's it worth now?)",
     "Fundraising (fund NAV for LP reporting)",
     "Secondary transaction"
   ], "required": true},
  {"id": "methodology", "label": "Preferred methodology", "type": "multi_select",
   "options": [
     "Comparable public companies", "Precedent transactions",
     "DCF (discounted cash flow)", "LBO analysis (PE)",
     "Revenue multiple (VC)", "Scorecard method (early VC)",
     "Let ANTON recommend based on stage"
   ], "required": true},
  {"id": "company_stage", "label": "Company stage", "type": "select",
   "options": ["Pre-revenue", "Early revenue (<$1M ARR)", "Growth ($1-10M ARR)",
               "Scale ($10-50M ARR)", "Mature ($50M+ revenue)", "Profitable/Cash-generating"],
   "required": true},
  {"id": "financial_data", "label": "Key financial data (revenue, growth, margins, EBITDA)",
   "type": "textarea", "required": true},
  {"id": "comparable_guidance", "label": "Any comparable companies or recent transactions you're aware of?",
   "type": "textarea", "required": false}
]
```

**Output Formats:** Valuation summary (range with methodology triangulation), comparable analysis table, sensitivity matrix, investment return scenario analysis

---

### Module 6: Investment Committee Memo

**ID:** `ic-memo`
**Icon:** `FileText`
**Purpose:** Generate structured IC memos that present the investment case, risks, and recommendation
**Default Model:** Opus 4.6 (this is the most important document in any deal)
**Thinking:** `investigate`
**Creativity:** `balanced` (needs to be compelling but honest)
**Target Cost:** $3.00-8.00

**The problem it solves:**
The IC memo is the single most important document in a deal. It takes 20-40 hours to write well. It synthesises everything: market, company, financials, diligence findings, valuation, terms, risks, and recommendation. This module can produce a solid first draft that captures 80% of the content, which the deal team then refines.

**System Prompt Essence:**
You are preparing an investment committee memorandum for a professional investment firm. The memo must be balanced, honest, and complete. It should present the strongest possible case for the investment AND the strongest possible case against it. The IC will make their own decision — your job is to give them everything they need. Do not be a cheerleader. If there are material risks, present them clearly. If the valuation is aggressive, say so.

Structure varies by firm, but typically includes: executive summary and recommendation, company overview, market opportunity, competitive position, management team assessment, financial analysis, valuation and terms, key risks and mitigants, ESG considerations, and proposed next steps.

**Guided Inputs:**
```json
[
  {"id": "memo_type", "label": "What kind of IC paper?", "type": "select",
   "options": [
     "Full IC memo (new investment recommendation)",
     "Follow-on investment memo",
     "IC update / progress report",
     "Exit recommendation memo",
     "Preliminary IC teaser (seeking approval to proceed to diligence)"
   ], "required": true},
  {"id": "recommendation", "label": "Your recommendation", "type": "select",
   "options": ["Invest (strong conviction)", "Invest (with conditions)", 
               "Further diligence needed", "Pass", "Presenting both sides — IC to decide"],
   "required": true},
  {"id": "deal_summary", "label": "Deal summary (company, what they do, stage, amount, valuation)",
   "type": "textarea", "required": true},
  {"id": "key_strengths", "label": "Why should we invest? (top 3-5 reasons)",
   "type": "textarea", "required": true},
  {"id": "key_risks", "label": "Key risks and concerns (top 3-5)",
   "type": "textarea", "required": true},
  {"id": "financials_summary", "label": "Key financial metrics",
   "type": "textarea", "required": false},
  {"id": "investment_style", "label": "Fund type", "type": "select",
   "options": ["VC Early", "VC Growth", "PE Growth", "PE Buyout", "PE Turnaround"],
   "required": true}
]
```

**Output Formats:** Full IC memo (structured document, 8-15 pages), executive summary (1-page), risk matrix, terms summary

**"My Way of Working" Integration:** IC memos are the highest-value target for the "My Way of Working" capability. Every firm has their own IC memo format, section order, and style. If the user uploads 2-3 previous IC memos as examples, ANTON learns the firm's format and produces memos that look like they came from the firm, not from AI.

---

### Module 7: Portfolio Monitoring Dashboard

**ID:** `portfolio-monitoring`
**Icon:** `LayoutDashboard`
**Purpose:** Track portfolio company performance, generate board pack summaries, flag concerns early
**Default Model:** Sonnet 4.5 (regular use, needs to be cost-effective)
**Thinking:** `think`
**Creativity:** `strict`
**Target Cost:** $0.30-1.00 per company update

**The problem it solves:**
Portfolio monitoring is continuous but often neglected until something goes wrong. This module helps track key metrics, generate board pack summaries from raw data, identify trends and flag concerns before they become crises, and prepare for board meetings.

**Guided Inputs:**
```json
[
  {"id": "monitoring_task", "label": "What do you need?", "type": "select",
   "options": [
     "Monthly/quarterly update analysis (paste company's numbers)",
     "Board meeting preparation",
     "Portfolio-wide performance summary",
     "Early warning flag review",
     "Follow-on investment assessment",
     "Benchmark against comparable companies"
   ], "required": true},
  {"id": "company_name", "label": "Portfolio company", "type": "text", "required": true},
  {"id": "metrics_data", "label": "Latest metrics (paste from report or email)",
   "type": "textarea", "required": true},
  {"id": "previous_metrics", "label": "Previous period metrics (for comparison)",
   "type": "textarea", "required": false},
  {"id": "concerns", "label": "Any specific concerns?",
   "type": "textarea", "required": false}
]
```

**Output Formats:** Performance summary, trend analysis, board talking points, early warning assessment, action items

**Workflow Integration:** This module works naturally as a scheduled workflow — every month, run portfolio monitoring for each company, aggregate into a portfolio summary. The existing workflow engine supports this.

---

### Module 8: Value Creation Planner

**ID:** `value-creation`
**Icon:** `Rocket`
**Purpose:** Develop and track value creation plans — the playbook for growing portfolio companies
**Default Model:** Opus 4.6
**Thinking:** `think_hard`
**Creativity:** `balanced`
**Target Cost:** $2.00-5.00

**The problem it solves:**
PE firms (and increasingly VC firms) win by making companies better, not just picking winners. The 100-day plan, margin improvement initiatives, revenue growth strategies, add-on acquisition screening — all need structured planning and tracking.

**Guided Inputs:**
```json
[
  {"id": "planning_phase", "label": "Where are you in the value creation cycle?", "type": "select",
   "options": [
     "Pre-close: Building the 100-day plan",
     "First 100 days: Executing quick wins",
     "Ongoing: Reviewing and updating value creation plan",
     "Preparing for exit: Demonstrating value created",
     "Add-on acquisition: Evaluating bolt-on targets"
   ], "required": true},
  {"id": "company_description", "label": "Portfolio company description",
   "type": "textarea", "required": true},
  {"id": "value_levers", "label": "Which value levers are you exploring?", "type": "multi_select",
   "options": [
     "Revenue growth (new products, markets, channels)",
     "Margin improvement (cost reduction, pricing, efficiency)",
     "Working capital optimization",
     "Management team upgrade",
     "Technology / digital transformation",
     "Add-on acquisitions (buy-and-build)",
     "Geographic expansion",
     "ESG improvement",
     "Governance and reporting improvement"
   ], "required": true},
  {"id": "current_performance", "label": "Current key metrics (revenue, EBITDA, margins, growth)",
   "type": "textarea", "required": false}
]
```

**Output Formats:** Value creation plan (structured with initiatives, owners, timelines, KPIs), 100-day plan, improvement opportunity assessment, add-on acquisition criteria

---

### Module 9: Exit Planning & Preparation

**ID:** `exit-planning`
**Icon:** `DoorOpen`
**Purpose:** Plan and prepare for portfolio company exits — timing, positioning, process, and materials
**Default Model:** Opus 4.6
**Thinking:** `think_hard`
**Creativity:** `balanced`
**Target Cost:** $2.00-5.00

**The problem it solves:**
Exit preparation often starts too late. The best exits are planned 12-18 months ahead: positioning the company narrative, cleaning up financials, building the management team, timing market windows. This module helps structure exit planning, prepare materials, and run the exit process.

**Guided Inputs:**
```json
[
  {"id": "exit_phase", "label": "Where are you in the exit process?", "type": "select",
   "options": [
     "Early planning (12-18 months out)",
     "Preparation (6-12 months out)",
     "Active process (preparing materials)",
     "Running the process (managing buyers)",
     "Post-LOI / pre-close"
   ], "required": true},
  {"id": "exit_route", "label": "Expected exit route", "type": "select",
   "options": ["Trade sale (strategic buyer)", "Secondary buyout (PE to PE)",
               "IPO", "Management buyout", "Not sure yet — exploring options"],
   "required": true},
  {"id": "company_description", "label": "Company overview and current performance",
   "type": "textarea", "required": true},
  {"id": "investment_summary", "label": "Our investment (entry date, entry valuation, total invested)",
   "type": "textarea", "required": false},
  {"id": "exit_task", "label": "What specifically do you need?", "type": "select",
   "options": [
     "Exit readiness assessment",
     "Vendor due diligence preparation",
     "Information memorandum / CIM draft",
     "Management presentation preparation",
     "Buyer universe identification",
     "Return analysis at different exit valuations"
   ], "required": true}
]
```

**Output Formats:** Exit readiness checklist, CIM outline/draft, buyer universe map, return waterfall analysis, timeline/process plan

---

### Module 10: Fund Performance & LP Reporting

**ID:** `fund-reporting`
**Icon:** `PieChart`
**Purpose:** Generate LP reports, calculate fund metrics, prepare for annual meetings and fundraising
**Default Model:** Sonnet 4.5
**Thinking:** `think`
**Creativity:** `strict`
**Target Cost:** $0.50-1.50

**The problem it solves:**
LP reporting is a recurring obligation that consumes significant time: quarterly updates, annual reports, fundraising presentations, AGM materials. Most of the content is structural and repetitive — ANTON can generate first drafts from portfolio data.

**Guided Inputs:**
```json
[
  {"id": "report_type", "label": "What report do you need?", "type": "select",
   "options": [
     "Quarterly LP letter / update",
     "Annual fund report",
     "Fundraising presentation (new fund)",
     "AGM materials",
     "Portfolio company summary for LPs",
     "Fund performance analysis (IRR, TVPI, DPI)"
   ], "required": true},
  {"id": "fund_info", "label": "Fund details (name, vintage, size, strategy, number of investments)",
   "type": "textarea", "required": true},
  {"id": "period", "label": "Reporting period", "type": "text", "required": true,
   "placeholder": "e.g., Q4 2025, FY 2025"},
  {"id": "performance_data", "label": "Key fund metrics (NAV, invested, distributed, unrealised)",
   "type": "textarea", "required": false},
  {"id": "highlights", "label": "Key highlights / lowlights to cover",
   "type": "textarea", "required": false}
]
```

**Output Formats:** LP letter (narrative), fund performance table, portfolio summary, fundraising deck outline

---

### Module 11: Term Sheet & Deal Structure Advisor

**ID:** `deal-structure`
**Icon:** `Handshake`
**Purpose:** Analyse, draft, and negotiate term sheets and deal structures
**Default Model:** Opus 4.6
**Thinking:** `think_hard`
**Creativity:** `strict`
**Target Cost:** $1.00-3.00

**The problem it solves:**
Term sheets are deceptively complex. Liquidation preferences, anti-dilution provisions, board composition, drag-along/tag-along, ratchets, earn-outs — each clause shifts value between parties. This module helps analyse received term sheets, draft term proposals, and understand the implications of different structures.

**Guided Inputs:**
```json
[
  {"id": "task", "label": "What do you need?", "type": "select",
   "options": [
     "Analyse a term sheet I received",
     "Draft a term sheet (I'm the investor)",
     "Compare two competing term sheets",
     "Explain specific terms and their implications",
     "Model the impact of terms on returns (liquidation preferences, participation)",
     "Negotiate — suggest counter-proposals"
   ], "required": true},
  {"id": "deal_type", "label": "Deal type", "type": "select",
   "options": ["VC equity round", "Convertible note / SAFE", "Growth equity",
               "PE majority buyout", "PE minority investment", "Secondary transaction"],
   "required": true},
  {"id": "term_sheet_text", "label": "Paste the term sheet or key terms",
   "type": "textarea", "required": false},
  {"id": "your_position", "label": "Your role", "type": "select",
   "options": ["Investor (buying)", "Company / founder (selling)", "Advisor / co-investor"],
   "required": true}
]
```

**Output Formats:** Term sheet analysis (clause-by-clause), term sheet draft, comparison matrix, negotiation position paper, returns impact analysis

**Safety Note:** Include disclaimer: "This analysis is for informational purposes. Engage legal counsel before executing any investment transaction."

---

### Module 12: Founder & Management Assessment

**ID:** `team-assessment`
**Icon:** `Users`
**Purpose:** Structured assessment of founders (VC) and management teams (PE) — the most important and most subjective part of any investment
**Default Model:** Opus 4.6
**Thinking:** `think_hard`
**Creativity:** `balanced` (needs nuanced judgment, not just checklists)
**Target Cost:** $1.00-3.00

**The problem it solves:**
"We invest in people" is what every investor says, but few have a structured framework for actually assessing people. This module provides frameworks for assessing founders (VC) and management teams (PE) based on structured reference checks, interview observations, and background research.

**Guided Inputs:**
```json
[
  {"id": "assessment_type", "label": "What are you assessing?", "type": "select",
   "options": [
     "Founder assessment (VC — will this person build a big company?)",
     "Management team assessment (PE — can this team execute the value creation plan?)",
     "CEO search / leadership gap analysis",
     "Reference check synthesis (compile reference notes into themes)",
     "Board composition review"
   ], "required": true},
  {"id": "person_info", "label": "Who are you assessing? (name, role, background)",
   "type": "textarea", "required": true},
  {"id": "interview_notes", "label": "Your notes from meetings / interviews",
   "type": "textarea", "required": false},
  {"id": "reference_notes", "label": "Notes from reference calls",
   "type": "textarea", "required": false},
  {"id": "concerns", "label": "Any specific concerns or areas to probe?",
   "type": "textarea", "required": false}
]
```

**Output Formats:** Assessment memo (structured by competency area), reference theme synthesis, leadership gap analysis, recommendation

---

## 4. Standalone Feature: Innovation & Market Radar

### The Concept

An adaptation of the existing Regulatory Radar, but instead of tracking regulations, it tracks:
- **Emerging technologies** (new AI models, breakthrough research, platform shifts)
- **Sector developments** (market consolidation, new entrants, category creation)
- **Company signals** (funding rounds, key hires, product launches, pivots)
- **Macro trends** (regulatory changes affecting sectors, geopolitical shifts, consumer behaviour shifts)
- **Exit signals** (IPO filings, M&A activity, secondary market pricing)

### Architecture: Adapt, Don't Rebuild

The Regulatory Radar already has the right architecture. The Innovation Radar uses the same:
- `radar_items` table (change `item_type` to include: `technology`, `sector`, `company_signal`, `funding_round`, `exit_event`, `macro_trend`, `patent`, `research_paper`)
- `radar_subscriptions` table (change subscription types to: `sector`, `technology`, `company`, `keyword`, `geography`, `stage`)
- `regulatory_changes` → `market_changes` (same structure, different semantics)
- `radar_alerts` (unchanged)
- `radar_actions` (unchanged)

### Source Configuration

**Default Sources (seeded — replace regulatory sources with investment sources):**

| Source | Type | What It Tracks |
|--------|------|----------------|
| Crunchbase / PitchBook (via web search) | Funding announcements | New rounds, valuations, investors |
| TechCrunch / The Information | Sector news | Product launches, pivots, shutdowns |
| arXiv / Papers With Code | Research papers | Breakthrough AI/ML/science publications |
| Patent offices (via web search) | Patent filings | Technology protection signals |
| SEC / Companies House filings | Regulatory filings | IPO filings (S-1/F-1), significant transactions |
| Hacker News / Product Hunt | Community signals | What developers and early adopters are excited about |
| Industry-specific sources (configurable) | Sector intelligence | User adds sources relevant to their thesis areas |

### Subscription Model

Users configure what they care about:

```
My Radar Subscriptions:
├── Sectors: "European fintech", "B2B SaaS", "Climate tech"
├── Technologies: "LLM applications", "quantum computing", "synthetic biology"  
├── Companies: "Stripe", "Klarna", "specific portfolio companies"
├── Keywords: "embedded finance", "carbon credits", "digital identity"
├── Geography: "Nordics", "DACH", "UK"
├── Stages: "Series B+", "Pre-IPO"
└── Alert frequency: Daily digest
```

### Relevance Scoring

Same approach as Regulatory Radar, but investment-oriented:

```
Relevance = f(sector_match, stage_match, geography_match, 
              recency, signal_strength, portfolio_relevance)

Where:
- sector_match: Does this match the user's thesis areas?
- stage_match: Is this the right stage for their fund?
- geography_match: Is this in their investment geography?
- recency: How fresh is this signal?
- signal_strength: Funding announcement > blog post > rumour
- portfolio_relevance: Does this affect a portfolio company?
```

### Dashboard Integration

```
┌────────────────────────────────────────────────────────────┐
│ 📡 Innovation & Market Radar         [5 High] [View All →] │
├────────────────────────────────────────────────────────────┤
│ 🔴 Stripe launches embedded lending product                │
│    Sector: Fintech · Impact: Portfolio competitor          │
│    Relevance: 94% · Source: TechCrunch, Feb 27            │
│    [Read] [Add to Deal Pipeline] [Alert Team] [Dismiss]   │
│                                                            │
│ 🔴 Nordic SaaS company raises €40M Series C               │
│    Sector: B2B SaaS · Stage: Growth · Geo: Stockholm      │
│    Relevance: 91% · Source: Crunchbase                    │
│    [Screen Deal] [View Company] [Dismiss]                 │
│                                                            │
│ 🟡 New EU AI Act enforcement guidance published            │
│    Impact: Affects portfolio AI companies                  │
│    Relevance: 82% · Source: EUR-Lex                       │
│    [Read] [Alert Portfolio Companies] [Dismiss]           │
│                                                            │
│ 🟢 Research: Breakthrough in protein folding efficiency    │
│    Sector: Biotech · Technology: ML/Biology                │
│    Relevance: 71% · Source: arXiv                         │
│    [Read] [Add to Thesis Research] [Dismiss]              │
└────────────────────────────────────────────────────────────┘
```

### Key Actions (Different from Regulatory Radar)

| Regulatory Radar Action | Innovation Radar Equivalent |
|------------------------|---------------------------|
| "Add Deadline" | "Add to Deal Pipeline" |
| "Run Impact Analysis" | "Screen Deal" (routes to Module 1) |
| "Create Project" | "Start Diligence" (routes to Module 3) |
| "Assign to Team" | "Alert Team" |
| "Subscribe to Updates" | "Track Company" |

### One-Click Deal Pipeline Integration

When the radar surfaces an interesting company:
1. Click "Screen Deal" → routes directly to Module 1 (Deal Screening) with company info pre-filled
2. If screening says "Explore Further" → one click to "Start Deep Dive" (Module 2)
3. If deep dive is promising → one click to "Begin Diligence" (Module 3)

The radar becomes the top of the deal funnel.

---

## 5. Standalone Workflow: Full Deal Pipeline

### Pre-Built Workflow Template

```
Step 1: Innovation Radar → surfaces opportunity
    ↓ [User clicks "Screen Deal"]
Step 2: Deal Screening (Module 1) → rapid first look
    ↓ [Output: "Explore Further"]
    ↓ [CHECKPOINT: Partner approval to proceed]
Step 3: Market Intelligence (Module 2) → sector and competitive context
Step 4: Financial Analysis (Module 4) → initial financial review
    ↓ [CHECKPOINT: IC teaser approval]
Step 5: Due Diligence (Module 3) → full DD workbench
Step 6: Valuation (Module 5) → what's it worth?
Step 7: Team Assessment (Module 12) → founder/management review
    ↓ [CHECKPOINT: Deal team go/no-go]
Step 8: IC Memo (Module 6) → full investment committee paper
Step 9: Term Sheet (Module 11) → structure and negotiate
    ↓ [CHECKPOINT: IC approval]
Step 10: Value Creation Plan (Module 8) → 100-day plan
    → Ongoing: Portfolio Monitoring (Module 7, scheduled monthly)
    → Eventually: Exit Planning (Module 9)
```

This workflow template is customisable — firms can add/remove steps, change checkpoints, and assign different team members to different stages.

---

## 6. "My Way of Working" Integration

### IC Memo Templates Are Gold

Every PE/VC firm has their own IC memo format. Some start with the recommendation. Some start with the company description. Some have a 1-page executive summary, some have 2 pages. Some use RAG-rated risk matrices, some use narrative risk discussion.

When the user uploads 2-3 previous IC memos, ANTON learns:
- Section order and naming
- Depth per section
- Risk presentation style
- Financial summary format
- Tone (some firms are more aggressive in their language, some more cautious)
- Specific sections unique to their process (e.g., "ESG Assessment" or "Operating Partner View")

After learning, every IC memo produced by ANTON matches the firm's format perfectly. A partner reading the memo doesn't think "this looks AI-generated" — they think "this looks like one of our memos."

### Deal Screening Templates

Similarly, some firms have 1-page screening templates, some have 3-page "first look" memos. The format varies, but the learning principle is the same.

---

## 7. Implementation Priority

**Phase 1 (Highest value, builds the pipeline):**
1. Deal Screening (Module 1) — high volume, immediate time savings, batch mode
2. Innovation & Market Radar — top of funnel, demonstrates platform sophistication
3. Market Intelligence (Module 2) — essential for every deal

**Phase 2 (Core deal execution):**
4. Due Diligence Workbench (Module 3) — the labour-intensive stage
5. IC Memo (Module 6) — the most important document
6. Financial Analysis (Module 4) — every deal needs this

**Phase 3 (Complete lifecycle):**
7. Valuation Framework (Module 5)
8. Founder/Management Assessment (Module 12)
9. Term Sheet Advisor (Module 11)

**Phase 4 (Portfolio and fund):**
10. Portfolio Monitoring (Module 7) — scheduled monthly workflow
11. Value Creation Planner (Module 8)
12. Exit Planning (Module 9)
13. Fund Reporting (Module 10)

---

## 8. The Meta-Strategic Value

### When You Pitch This to a VC

The pitch is not "we built an AI tool for VCs." The pitch is:

**"Open the whitepaper to Section 20. Find Area 34. That's your workflow — from the radar that found this deal, to the screening module that would have flagged openEXPERT as interesting, to the diligence workbench you'd use to evaluate us, to the IC memo you'd write to present us to your partners. We built your job into our platform. And here's the thing — we built 33 other areas just like it. That's what openEXPERT does."**

The VC isn't just evaluating a product. They're experiencing it from the inside. The radar found them a deal (openEXPERT itself). The screening module assessed it. The diligence workbench structured their evaluation. The IC memo presents the case. They're living the product while evaluating it.

This is the single most powerful demo possible: "Your own workflow is one of our 34 expert areas. And your portfolio companies? They have areas too — the fintech uses our FCP area, the SaaS company uses our Software Engineering area, the healthcare startup uses our Healthcare area. One platform, every professional in the portfolio."

### When a PE Firm Sees This

PE firms care about operational improvement across their portfolio. If every portfolio company uses openEXPERT for their domain (compliance, engineering, operations, finance), and the PE firm uses it for deal management and portfolio monitoring — the institutional knowledge stays in the platform. Cross-portfolio pattern detection becomes possible: "Three of your portfolio companies are struggling with the same GDPR implementation challenge — here's what the one that solved it did."

That's the Knowledge Graph and Cross-Workflow Intelligence (Sections 10-11 of the whitepaper) applied to a PE portfolio. It's not just a tool — it's portfolio-wide intelligence.

---

## 9. Whitepaper Placement

This area integrates into the whitepaper at these points:

1. **Section 2 (Who This Is For):** Add "2.7 Private Equity & Venture Capital Firms" — investment professionals, fund managers, portfolio teams.

2. **Section 20 (Expert Areas Overview):** Add Area 34 row. Note that this area reuses and extends the Regulatory Radar architecture for market intelligence.

3. **Section 22 (Cross-Area Use Cases):** Add "Use Case: VC Deal Pipeline — From Radar Signal to IC Memo" — the most compelling end-to-end workflow story for investors. Show how the Innovation Radar surfaces a deal, screening evaluates it, diligence analyses it, and the IC memo presents it.

4. **Section 16 (Time Intelligence & Regulatory Radar):** Add a note that the Radar architecture is generalised — Regulatory Radar for compliance teams, Innovation Radar for investment teams. Same engine, different sources and actions. This strengthens the platform story.

5. **Section 31 (Roadmap):** Mention PE/VC as a priority expansion area with particular strategic importance for fundraising and ecosystem development.

6. **Section 32 (FAQ):** Add: "Q: We're a VC firm — why should we care about a compliance tool? A: openEXPERT isn't a compliance tool. It's a professional AI platform with 34+ expert areas — including one designed specifically for your investment workflow. From deal screening to IC memos to portfolio monitoring, your job is built in."

---

**End of specification. Build this area with the sophistication that PE/VC professionals expect. They are among the most demanding users of analytical tools — the output quality must be institutional-grade. And remember the meta-play: every VC who evaluates openEXPERT should have the experience of seeing their own workflow in the product.**
