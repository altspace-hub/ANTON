# ANTON Risk Atlas — Addendum 1

**The Financial Crime Prevention Overlay: making Risk Atlas a first-class tool for AML/CFT, Sanctions, Fraud, ABC, Market Abuse, Tax Evasion Facilitation, and Export Controls — across financial *and* non-financial businesses of every size.**

Version: 0.1 (addendum to Risk Atlas Spec v0.1)
Status: Proposed — ready for Claude Code incorporation into the Phase-1 build
Supersedes: nothing (additive)
Reader: Claude Code and ANTON maintainers

---

## A1.0 Why this addendum exists

The base Risk Atlas spec treats financial crime as one industry pack among many. That is wrong. Financial crime exposure is a *cross-cutting domain* that applies to almost every business — and the regulatory perimeter for non-financial entities has just massively expanded:

- **AMLR 2024/1624** (applies from 10 July 2027) extends obliged-entity status to: real estate professionals including letting intermediaries for rentals ≥10,000 EUR/month; notaries, lawyers and legal professionals involved in financial or real estate transactions or managing client money; auditors, external accountants, tax advisors; trust and company service providers; CASPs; crowdfunding service providers; dealers in precious metals, stones, and other high-value goods as regular or principal activity; investment migration operators; non-financial mixed holding companies; traders in luxury goods (motor vehicles ≥250k EUR; watercraft/aircraft ≥7.5M EUR); professional football clubs and agents (from 2029).
- **Cash payment threshold** lowered to 10,000 EUR Union-wide for business payments, with identification required from 3,000 EUR.
- **UK Criminal Finances Act 2017** (failure to prevent facilitation of tax evasion) creates strict corporate liability for *any* UK business.
- **UK Bribery Act 2010 / US FCPA** apply to any business with UK or US nexus, including SMEs.
- **EU Market Abuse Regulation (MAR)** applies to any issuer of securities admitted to trading and many non-listed counterparties.
- **EU Sanctions regime** (Regulation 833/2014 and related) applies to *every* EU person and legal entity — a builder buying a crane from a sanctioned supplier is in breach.
- **Modern Slavery Act 2015** (UK) and the **EU Corporate Sustainability Due Diligence Directive (CSDDD)** impose supply chain obligations on mid-market companies.
- **NIS2** and cybersecurity regulations create fraud-adjacent obligations for critical sector operators.

The net effect: a building firm in Stockholm with 30 employees now has meaningful exposure across five or six financial crime domains, with no compliance function, no MLRO, no specialist tooling, and no budget for a Big-Four risk assessment. The same is true for a three-store supermarket chain, a boutique law firm, a real estate agency, a motor vehicle dealer, an NGO running cash-heavy humanitarian operations, a mid-sized construction subcontractor, a professional football club's commercial arm.

**These entities are ANTON's primary growth market for Risk Atlas.** Regulated banks are the prestige customer and the reference case; the underserved mass market is where volume lives. Risk Atlas needs to serve both from the same engine.

This addendum specifies how.

---

## A1.1 The Financial Crime Prevention Overlay — core concept

The base spec treats the industry pack as a single horizontal layer. This addendum introduces a second, *vertical* layer: the **FCP Overlay**.

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1: UNIVERSAL METHODOLOGY (seven-stage causal chain)   │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2: INDUSTRY PACK (horizontal — what industry you are) │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2b: FCP DOMAIN PACKS (vertical — which FCP domains   │  ◄── NEW
│  apply to you, regardless of industry)                       │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3: AI-GUIDED WORKSPACE                                │
└──────────────────────────────────────────────────────────────┘
```

An Atlas activates some combination of FCP domain packs based on the business's exposure profile. Domain packs compose with industry packs rather than replacing them. Exactly which domains are active is determined during setup by a short **FCP Scope Assessment**, itself an AI-guided module (`fcp-scope-assessor`).

### A1.1.1 The seven FCP domain packs (Phase-1 build)

Each is a new `.anton` bundle of type `risk-atlas-fcp-domain-pack`. A full ANTON install ships all seven as built-in domain packs; users activate only those relevant to their business.

| Domain pack ID | Covers | Key regulatory anchors | Triggered by |
|---|---|---|---|
| `fcp-amlcft` | Money laundering & terrorist financing | AMLR 2024/1624, AMLD6, FATF 40 Recs, Sweden LAM 2017:630, national transpositions | User is an AMLR obliged entity; any business handling significant cash; cross-border remittances; customer-facing businesses with PEP exposure |
| `fcp-sanctions` | Financial and trade sanctions, targeted financial measures | EU Reg 833/2014 + all sectoral regulations; OFAC (US nexus); HMT/OFSI (UK nexus); UN Consolidated List; national sanctions authorities | Any EU/UK/US person or entity — default-on for most businesses; always-on for international trade, real estate, high-value goods |
| `fcp-fraud` | External fraud (against the business); internal fraud (by employees); fraud facilitation (business inadvertently used in fraud) | UK Fraud Act 2006, EU Directive 2017/1371 (PIF Directive), national fraud statutes | All businesses — defaults on. Especially relevant: cash-handling, e-commerce, supplier-invoice-heavy, card-accepting |
| `fcp-abc` | Anti-bribery, anti-corruption, facilitation payments, hospitality & gifts, conflicts of interest | UK Bribery Act 2010, US FCPA, EU Anti-Corruption Directive (proposed), ISO 37001, Sapin II, national ABC laws | International operations, public-sector customers, tendering, high-corruption-index jurisdictions, regulated industries (construction, pharma, defence, extractives) |
| `fcp-market-abuse` | Insider dealing, market manipulation, unlawful disclosure, wash trading | EU MAR 596/2014, MAD II, national market abuse rules; CASP Market Abuse rules in MiCA | Listed issuers, CASPs, market makers, anyone with access to inside information on a listed/traded instrument, insider list maintainers |
| `fcp-tax-evasion-facilitation` | Facilitation of customer/supplier tax evasion; VAT fraud (MTIC, carousel); employment tax evasion | UK Criminal Finances Act 2017 (failure-to-prevent offence); Council Directive 2018/822 (DAC6); national facilitation offences | Any UK-nexus business (strict liability); cash-intensive sectors; supply-chain-heavy sectors; anyone with offshore element in transactions |
| `fcp-export-controls` | Dual-use goods, military goods, technology transfer, sanctions-adjacent controls | EU Reg 2021/821 (recast Dual-Use Regulation), Wassenaar Arrangement, national export authorities, ITAR/EAR for US nexus | Manufacturing, tech (especially AI, semiconductors, cryptography), defence, research institutions, any exporter |

**Optional eighth domain (Phase-2 scope, but architect for it now):**

| `fcp-modern-slavery` | Human trafficking, forced labour in supply chain | UK Modern Slavery Act 2015, CSDDD, national statutes | All mid-market+ businesses; supply-chain-heavy SMEs in construction, agriculture, fashion, services |

**Why separate packs per domain and not one mega-pack.** Separation matches how compliance practitioners think, how regulators inspect, how the evidence is organised, and how industry libraries differ. A sanctions expert is not an ABC expert; an AML manager is not an export-controls specialist. Composable domain packs preserve this professional distinction while letting a single board-level Atlas roll everything up.

### A1.1.2 Data model implications

The base spec's `atlas_threat_paths` table needs one addition:

```
ALTER TABLE atlas_threat_paths ADD COLUMN fcp_domain VARCHAR(32) NULL;
-- values: 'amlcft' | 'sanctions' | 'fraud' | 'abc' | 'market_abuse' |
--         'tax_evasion_facilitation' | 'export_controls' | 'modern_slavery' |
--         NULL (non-FCP path, e.g., operational, safety, strategic)
```

Threat paths can be tagged with one primary domain but participate in cross-domain path bundles (see A1.3). An Atlas may mix FCP paths with operational paths; the engine remains universal.

One new registry table:

```
CREATE TABLE atlas_fcp_scope (
  atlas_id INTEGER PRIMARY KEY REFERENCES risk_atlases(id),
  amlcft_active BOOLEAN NOT NULL DEFAULT FALSE,
  sanctions_active BOOLEAN NOT NULL DEFAULT TRUE,       -- default ON for EU users
  fraud_active BOOLEAN NOT NULL DEFAULT TRUE,           -- default ON always
  abc_active BOOLEAN NOT NULL DEFAULT FALSE,
  market_abuse_active BOOLEAN NOT NULL DEFAULT FALSE,
  tax_evasion_facilitation_active BOOLEAN NOT NULL DEFAULT FALSE,
  export_controls_active BOOLEAN NOT NULL DEFAULT FALSE,
  modern_slavery_active BOOLEAN NOT NULL DEFAULT FALSE,
  scope_rationale TEXT,                                  -- why each was turned on/off
  last_reviewed_at TIMESTAMP
);
```

The scope-assessor module writes this table; users can override its recommendations but the rationale must be captured.

### A1.1.3 Knowledge atom tagging

Extend the `atom_tags` vocabulary with FCP domain tags:

- `fcp:amlcft`, `fcp:sanctions`, `fcp:fraud`, `fcp:abc`, `fcp:market_abuse`, `fcp:tax_evasion_facilitation`, `fcp:export_controls`, `fcp:modern_slavery`

This lets Cross-Workflow Intelligence queries target specific domains ("show all recommendations across all my engagements tagged `fcp:sanctions`").

---

## A1.2 Universal FCP Core — the baseline every business gets

Independent of industry and selected domain packs, every FCP-relevant Atlas inherits a **Universal FCP Core** that covers the invariants:

- Ultimate beneficial ownership (UBO) identification as a cross-cutting exposure
- Sanctioned-party screening as a universal prevent control
- Cash-payment threshold awareness (10k EUR EU)
- PEP identification
- Record-keeping obligations
- Suspicion-raising culture (STR/SAR pathway — routed to national FIU)
- Governance: named compliance responsibility (even if one-person — owner, director)
- Training baseline

The Universal FCP Core ships as a built-in overlay activated whenever *any* FCP domain is active. Think of it as the AMLR Article 16 ("internal policies, procedures, controls" proportionate to size and risk) distilled into a minimal pattern that a 5-person business can actually implement.

Concretely: a building firm with no compliance officer but cross-border suppliers activates `fcp-sanctions` and `fcp-abc` domain packs plus the Universal FCP Core. The resulting Atlas has: the sanctions threat paths, the ABC threat paths, and *also* the baseline UBO/PEP/cash-threshold/STR paths from the Core. The owner becomes the named responsible person by default, with a 30-minute training requirement logged as a control.

---

## A1.3 Cross-domain threat paths — where real financial crime lives

Real financial crime rarely stays in one domain. The nastiest threat paths thread multiple domains:

| Cross-domain path example | Domains threaded |
|---|---|
| Sanctioned PEP uses a nominee in a high-corruption jurisdiction to acquire an EU company through a real estate transaction, paying the notary via a business-to-business transfer from a proxy bank | AML + Sanctions + ABC + Tax Evasion Facilitation |
| Subcontractor on a public infrastructure project is paid in cash, under-declares employment tax, and receives VAT rebates through fictitious invoicing | Fraud + Tax Evasion Facilitation + ABC (if kickback to main contractor) |
| CASP receives proceeds of a ransomware attack from a sanctioned jurisdiction, swaps to a stablecoin, and settles via a market-manipulation trade on a thin altcoin | Sanctions + AML + Market Abuse |
| Medical device exporter ships restricted dual-use equipment to a front company in a third country, invoicing via a letter-of-credit tied to a public procurement bribe | Export Controls + Sanctions + ABC |
| Real estate agent accepts a 100k EUR cash deposit from a buyer refusing identity verification, buyer turns out to be on sanctions list | AML + Sanctions (both breached) |

The Atlas data model supports this natively: threat paths can be linked into **cross-domain bundles** via a new association:

```
CREATE TABLE atlas_cross_domain_path_bundles (
  id SERIAL PRIMARY KEY,
  atlas_id INTEGER REFERENCES risk_atlases(id),
  bundle_name TEXT NOT NULL,
  description TEXT,
  primary_domain VARCHAR(32),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE atlas_cross_domain_path_bundle_members (
  bundle_id INTEGER REFERENCES atlas_cross_domain_path_bundles(id),
  threat_path_id INTEGER REFERENCES atlas_threat_paths(id),
  role_in_bundle VARCHAR(32),  -- 'entry', 'middle', 'exit', 'amplifier'
  PRIMARY KEY (bundle_id, threat_path_id)
);
```

At Stage 2 the AI proposes cross-domain bundles based on the activated domains and industry pack. The UI visualises bundles as *chains of chains* — a particularly strong demo asset.

---

## A1.4 Expanded Phase-1 industry pack catalogue

The base spec listed ten Phase-1 packs. The addendum adds and restructures:

**Financial-sector packs (unchanged from base spec):**

1. `fcp-casp-pack` — the CASP reference (Daniel's NordicCrypto example)
2. `fcp-bank-pack` — general obliged entity bank
3. `fcp-payment-institution-pack` — PI/EMI-specific (new)
4. `fcp-investment-firm-pack` — MiFID II investment firms (new)
5. `fcp-insurance-pack` — life insurers as obliged entities (new)

**Non-financial AMLR obliged-entity packs (new and high priority):**

6. `fcp-real-estate-agent-pack` — including letting-agent vertical
7. `fcp-notary-law-firm-pack` — legal professionals involved in real estate / client money management
8. `fcp-accounting-tax-advisor-pack` — auditors, external accountants, tax advisors
9. `fcp-trust-company-service-provider-pack` — TCSPs
10. `fcp-dealer-high-value-goods-pack` — precious metals, stones, high-value goods (generic)
11. `fcp-motor-vehicle-dealer-pack` — luxury vehicles ≥250k EUR
12. `fcp-yacht-aircraft-broker-pack` — watercraft/aircraft ≥7.5M EUR
13. `fcp-gambling-operator-pack` — online/land-based gambling (AMLD6)
14. `fcp-football-club-agent-pack` — football clubs and agents (applies from 2029; architect early)
15. `fcp-crowdfunding-pack` — crowdfunding service providers

**Broad-market sector packs (FCP-overlay enabled, not AMLR obliged by default):**

16. `sector-construction-trades-pack` — building firms, civil engineering, subcontractors
17. `sector-retail-supermarket-pack` — supermarkets, grocery chains, convenience
18. `sector-ecommerce-pack` — online retail, marketplace sellers
19. `sector-manufacturing-industrial-pack` — process industry, discrete manufacturing, defence-adjacent
20. `sector-professional-services-pack` — consulting, engineering services, creative agencies
21. `sector-hospitality-pack` — hotels, restaurants, bars, event venues
22. `sector-healthcare-clinic-pack` — private clinics, dental, specialist practice
23. `sector-nonprofit-ngo-pack` — charities, humanitarian organisations, faith-based
24. `sector-saas-tech-pack` — SaaS, platform, technology startup
25. `sector-sme-general-pack` — the default catch-all

**Each pack** declares which FCP domain packs it recommends activating by default, its typical exposure library, and its regulatory tie-ins. Example:

```json
// sector-construction-trades-pack/manifest.json excerpt
{
  "id": "sector-construction-trades-pack",
  "name": "Construction & Trades",
  "version": "1.0.0",
  "recommends_fcp_domains": [
    {"domain": "sanctions", "rationale": "Sourcing materials internationally; potential for sanctioned suppliers; working with sanctioned jurisdictions on client projects"},
    {"domain": "fraud", "rationale": "Subcontractor invoice fraud; materials theft; CEO-fraud / invoice-redirection fraud; insurance fraud"},
    {"domain": "abc", "rationale": "Public procurement; permit and zoning processes; heavy interaction with municipal/regional authorities; site inspections"},
    {"domain": "tax_evasion_facilitation", "rationale": "Cash-in-hand subcontractors; VAT fraud chains (MTIC/carousel); CIS (UK) or F-skatt (Sweden) evasion facilitation"},
    {"domain": "modern_slavery", "rationale": "Labour-intensive supply chain; foreign workers; seasonal peaks; vulnerability to trafficking"}
  ],
  "recommends_fcp_domains_optional": [
    {"domain": "amlcft", "rationale": "Only if accepting cash payments ≥10k EUR or if buyer is an obliged entity — rare but material"},
    {"domain": "export_controls", "rationale": "Only for specialised equipment or defence/infrastructure projects in sensitive jurisdictions"}
  ],
  "amlr_obliged": false,
  "typical_size_range": ["micro", "small", "medium"],
  "typical_jurisdictions": ["EU", "UK", "Nordics"]
}
```

---

## A1.5 Universal company-wide Risk Appetite at Stage 7

The base spec's Stage 7 is per-threat-path. This addendum requires a **Stage 7b: Company-wide Appetite Statement** that rolls up across all domains into a single board-approvable document.

### A1.5.1 Structure of the company-wide appetite

```
┌─────────────────────────────────────────────────────────────┐
│  COMPANY-WIDE RISK APPETITE STATEMENT                       │
│  [Entity name] — approved [date] — next review [date]       │
│                                                             │
│  OVERALL POSITION                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Paths outside appetite: N (must act within 6 mths)  │   │
│  │ Paths at boundary:      N (act within 12 mths)      │   │
│  │ Paths within appetite:  N (monitor)                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  BY FCP DOMAIN                                              │
│  AML/CFT:         within / boundary / outside               │
│  Sanctions:       within / boundary / outside               │
│  Fraud:           within / boundary / outside               │
│  ABC:             within / boundary / outside               │
│  Market Abuse:    n/a / within / boundary / outside          │
│  Tax Evasion F.:  within / boundary / outside               │
│  Export Controls: n/a / within / boundary / outside          │
│                                                             │
│  BY NON-FCP DIMENSION (if operational/safety/strategic paths│
│  exist in this Atlas)                                       │
│  Operational:     ...                                       │
│  Safety:          ...                                       │
│  Strategic:       ...                                       │
│                                                             │
│  APPROVED REMEDIATION PROGRAMME                             │
│  1. [Priority-1 item]   target [date]   owner [x]   cost [€]│
│  2. ...                                                     │
│                                                             │
│  ESCALATION TRIGGERS (company-wide)                         │
│  - Any path reaching residual 5 → immediate board           │
│  - Any sanctions hit on customer → same-day freeze+report   │
│  - Any regulator inspection finding → 5-day board brief     │
│  - Any major control failure evidence → 10-day rescore      │
│                                                             │
│  APPROVAL                                                   │
│  Approved by: [Board Chair / Owner / Sole Director]         │
│  Date: ____                                                 │
│  Signature: ____                                            │
└─────────────────────────────────────────────────────────────┘
```

For a small business with a single owner-director, the "Board Chair" field becomes "Owner" and the approval cadence reflects reality (annual self-attestation vs quarterly board meeting). The template adapts to scale.

### A1.5.2 Roll-up calculation rule

The per-domain appetite position follows a **worst-case rollup** (consistent with the max-of-three inherent rule):

- Domain position = worst appetite position of any threat path tagged with that domain
- Overall company position = worst appetite position across all paths

**Rationale.** A single "outside appetite" path in any domain puts the company in an "outside appetite" position overall, because the board cannot in good conscience claim the company is "within appetite" while one of its material risks is out of control. This is more conservative than an averaged position and is defensible to a regulator or auditor. Document this explicitly in the Risk Coach explainer.

Override: the board may explicitly accept a path as "tolerated non-compliance" with a named risk owner, a stated end-state, and a documented timeline. This becomes a flagged exception in the board pack — never hidden, always visible.

### A1.5.3 Stage 7b module

New module: `atlas-company-appetite-consolidator`

- Reads all Stage 7 per-path appetite statements
- Rolls up per FCP domain and per non-FCP dimension
- Produces the board-approvable one-page statement
- Generates the escalation trigger list (defaults + user additions)
- Outputs: docx board pack, pdf one-pager, `.anton` appetite bundle (shareable to a successor or auditor)

---

## A1.6 Worked examples — what this looks like in practice

These worked examples are canonical fixtures for test + demo. The scoring is plausible, not precise, and will be re-calibrated per industry pack during build.

### A1.6.1 Small building firm — Stockholm

**Business:** Byggfirma AB. 30 employees. Annual revenue SEK 65M (~EUR 5.7M). Mixed private and municipal projects. 40% subcontracted labour. Materials sourced domestically + from Baltic states + Germany. No cash-taking customers (invoices only), but subcontractors sometimes paid in Swish with informal arrangements. One owner-director, an office manager handling invoicing, no compliance function.

**Atlas setup:**
- Industry pack: `sector-construction-trades-pack`
- FCP domains activated by scope-assessor: `sanctions`, `fraud`, `abc`, `tax_evasion_facilitation`, `modern_slavery`
- FCP domains not activated: `amlcft` (not AMLR obliged, no cash handling ≥10k), `market_abuse` (not listed), `export_controls` (no dual-use)

**Selected threat paths (abbreviated):**

| ID | Path | Primary domain | Inherent | Residual after likely controls | Appetite |
|---|---|---|---|---|---|
| TP-1 | Sanctioned-supplier exposure via Baltic steel supplier fronting for a Russian mill | Sanctions | 4 | 3 | Boundary |
| TP-2 | Subcontractor invoice-fraud / ghost invoices | Fraud | 4 | 2 | Within |
| TP-3 | CEO-fraud / invoice-redirection via compromised email | Fraud | 3 | 2 | Within |
| TP-4 | Facilitation payment to expedite permit at municipality | ABC | 4 | 3 | Boundary |
| TP-5 | Kickback between project manager and main subcontractor | ABC | 3 | 2 | Within |
| TP-6 | Cash-in-hand subcontractor under-declaring employment tax (facilitation) | Tax Evasion Facilitation | 4 | 4 | **Outside** |
| TP-7 | VAT carousel via fictitious materials supplier | Tax Evasion Facilitation | 3 | 2 | Within |
| TP-8 | Forced labour in Baltic subcontractor crew | Modern Slavery | 3 | 3 | Boundary |
| TP-9 | Tender rigging with three-firm collusion | ABC | 3 | 3 | Boundary |
| TP-10 | Materials theft from site | Fraud | 3 | 2 | Within |

**Cross-domain bundle:** TP-1 + TP-6 + TP-8 (Baltic supply chain exposure) — sanctions + tax + modern slavery combine around a single procurement decision. The board pack presents this as a single story, not three separate items.

**Company-wide appetite statement:** OUTSIDE (because TP-6 is outside). Priority remediation: subcontractor onboarding checklist (ID, F-skatt verification, bank-account-only payments, written contract), cost negligible, target 90 days. After remediation, expected TP-6 residual drops to 2 and company position moves to Boundary.

**Time to first draft:** ~20 minutes in Draft mode with the owner answering ANTON's questions. The owner has never built a risk assessment before.

### A1.6.2 Real estate agency — Göteborg

**Business:** Mäklarhuset Väst. 12 mäklare (agents). AMLR obliged entity (real estate professional). Deals in residential and commercial. Occasional high-value sales (>5M SEK). Some international buyers. Typical deposit via bank, not cash — but one-off cash deposits happen.

**Atlas setup:**
- Industry pack: `fcp-real-estate-agent-pack`
- FCP domains activated: `amlcft` (mandatory — obliged entity), `sanctions`, `fraud`, `abc` (referral arrangements with banks, lenders)
- Universal FCP Core ON (mandatory when AMLR obliged)

**Selected threat paths:**

| ID | Path | Primary domain | Inherent | Residual | Appetite |
|---|---|---|---|---|---|
| TP-1 | Foreign buyer with opaque BO structure acquires EU property | AML | 5 | 4 | **Outside** |
| TP-2 | Sanctioned individual using nominee to acquire property | Sanctions | 4 | 3 | Boundary |
| TP-3 | Cash deposit at contract signing exceeding thresholds | AML | 4 | 2 | Within |
| TP-4 | Seller providing false title documentation (seller fraud) | Fraud | 3 | 2 | Within |
| TP-5 | Buyer-impersonation fraud intercepting deposit transfer | Fraud | 3 | 2 | Within |
| TP-6 | PEP buyer undisclosed | AML | 4 | 3 | Boundary |
| TP-7 | Kickback from mortgage broker for client referrals | ABC | 3 | 2 | Within |
| TP-8 | Source-of-funds not adequately evidenced on high-value sale | AML | 4 | 3 | Boundary |
| TP-9 | Letting arrangement ≥10k EUR/month rent: landlord is an obliged entity trigger | AML | 3 | 2 | Within |

**Key insight for this pack:** AMLR Article 20-23 CDD on counterparties in property transactions is the make-or-break control. The pack ships with pre-built CDD procedures and a Source of Funds checklist. Connects directly to the `amlr-gap-analysis` module for regulatory compliance assessment.

**Company-wide appetite:** OUTSIDE (because TP-1). Priority remediation: enhanced BO verification protocol for foreign legal entities, pre-contract Source of Funds documentation, sanctions screening at both buyer *and* beneficial owner level. Target: Q2 with external legal input.

### A1.6.3 Small supermarket chain — three stores, central Sweden

**Business:** Närbutikerna Mellansverige. 3 stores, 45 staff total. Annual revenue SEK 90M. Mix of FMCG, fresh, some alcohol (systembolaget partnership). Loyalty programme. Gift cards sold. Suppliers: Swedish wholesale + some direct from EU producers. No international beyond EU. Not AMLR obliged (not a trader in high-value goods).

**Atlas setup:**
- Industry pack: `sector-retail-supermarket-pack`
- FCP domains activated: `sanctions` (EU-wide obligation), `fraud` (multiple vectors), `abc` (supplier relationships), `tax_evasion_facilitation` (cash handling)
- FCP domains not activated: `amlcft`, `market_abuse`, `export_controls`, `modern_slavery` initially (revisit modern slavery if fresh imports grow)

**Selected threat paths:**

| ID | Path | Primary domain | Inherent | Residual | Appetite |
|---|---|---|---|---|---|
| TP-1 | Sourcing a product from a sanctioned-jurisdiction manufacturer via EU re-seller | Sanctions | 3 | 2 | Within |
| TP-2 | Gift-card money laundering / refund laundering | Fraud (cross to AML) | 3 | 2 | Within |
| TP-3 | Refund fraud via colluding cashier | Fraud | 3 | 2 | Within |
| TP-4 | Supplier kickback to buyer for preferential shelf placement | ABC | 3 | 2 | Within |
| TP-5 | Invoice fraud from fictitious supplier | Fraud | 3 | 2 | Within |
| TP-6 | Card-payment skimming / BIN attack | Fraud | 3 | 3 | Boundary |
| TP-7 | Cash-register under-ringing (employee theft) | Fraud | 3 | 2 | Within |
| TP-8 | Facilitating tax evasion via cash payments to delivery drivers | Tax Evasion Facilitation | 2 | 1 | Within |

**Cross-domain:** TP-2 (gift cards) bridges Fraud + AML typology even though the business is not AMLR obliged — worth flagging for board awareness even if no formal obligation.

**Company-wide appetite:** BOUNDARY. The gift card and card-skimming paths need enhanced controls (daily reconciliation + PCI attestation status annual check); delivered in 6 months.

**The point:** a shopkeeper with 45 staff gets a credible financial-crime risk picture in under 30 minutes, with actionable controls, and doesn't need to hire a consultant. This is where ANTON Risk Atlas outperforms the existing market by 2-3 orders of magnitude on cost.

---

## A1.7 Calculator calibrations per FCP domain

The deterministic residual calculator in the base spec stays the same (Strong −2, Adequate −1, Weak 0; max-of-three for inherent). What each domain pack contributes is the **severity benchmarks** that anchor the scoring.

Each domain pack ships a `severity-benchmarks.json` table:

```json
{
  "domain": "sanctions",
  "exposure_anchors": [
    {"description": "No international trade, EU-only customers, domestic suppliers only", "score": 1},
    {"description": "EU-only trade but suppliers sometimes source from outside EU", "score": 2},
    {"description": "Regular cross-border EU trade; occasional non-EU", "score": 3},
    {"description": "Frequent non-EU trade including near-sanctioned jurisdictions", "score": 4},
    {"description": "Regular trade with high-risk jurisdictions or sanctioned-adjacent sectors (oil, banking, defence)", "score": 5}
  ],
  "threat_credibility_anchors": [
    {"description": "Strong national sanctions environment, OFAC/OFSI active, enforcement history visible", "score": 4},
    {"description": "Active geopolitical tensions between relevant jurisdictions", "score": 5}
  ],
  "vulnerability_severity_anchors": [
    {"indicator": "No sanctions screening at onboarding", "severity": 5},
    {"indicator": "Sanctions screening at onboarding only, no ongoing screening", "severity": 4},
    {"indicator": "Ongoing screening of customers but not of beneficial owners", "severity": 4},
    {"indicator": "BO sanctions screening but weekly list update", "severity": 3},
    {"indicator": "Real-time list updates + BO screening + 50% ownership/control test", "severity": 1}
  ],
  "control_strength_anchors": [
    {"indicator": "Manual name-based search at onboarding", "strength": "weak"},
    {"indicator": "Automated list screening at onboarding + annual refresh", "strength": "adequate"},
    {"indicator": "Real-time screening at onboarding + ongoing + BO + 50% rule + weekend list feeds", "strength": "strong"}
  ]
}
```

ANTON surfaces the anchors in the UI as the user scores, so ordinal decisions are anchored in concrete descriptors rather than gut feel. This is the calibration-drift mitigation from the base spec.

**Domain-specific nuances** (not exhaustive — documented in each pack's methodology addendum):

- **AML/CFT:** exposure × threat × vulnerability scoring aligns with EBA Risk Factor Guidelines 2023; customer/geographic/product/channel/transaction factors are weighted per national risk assessment
- **Sanctions:** inherent risk rises sharply with any direct or indirect exposure to sanctioned jurisdictions; the 50% ownership/control aggregation rule is mandatory in the control layer
- **Fraud:** inherent risk modelled per vector (not aggregate) — card fraud and CEO fraud have different inherent baselines
- **ABC:** jurisdiction corruption index (Transparency International CPI) enters exposure score directly; public-sector customer presence amplifies threat credibility
- **Market Abuse:** the presence of an insider list and pre-clearance process becomes a fundamental prevent control; without these, vulnerability V is automatically ≥4
- **Tax Evasion Facilitation:** UK Criminal Finances Act 2017 strict-liability structure means the "reasonable prevention procedures" defence is the only mitigation; without documented procedures, residual cannot be below Boundary
- **Export Controls:** the BIS/ECCN/EUCL catalogue classification drives exposure; uncontrolled technology transfer is automatically inherent-5 because Wassenaar Arrangement penalties are severe

---

## A1.8 Integration with existing ANTON FCP modules

The Risk Atlas does not replace ANTON's existing 23 FCP modules. It orchestrates them, with the Atlas as the centre of gravity.

**Bidirectional integration:**

| Existing FCP module | Atlas integration |
|---|---|
| `business-wide-risk-assessment` | Superseded by the Atlas (one-click migration); old module remains for backwards compatibility with existing workflows |
| `amlr-gap-analysis` | Atlas state informs the gap analysis ("your BWRA is complete and shows TP-3 outside appetite — here is the AMLR article gap"); gap analysis findings flow back as proposed Atlas updates |
| `sanctions-compliance-assessment` | Becomes a drill-down on the `fcp-sanctions` domain paths in the Atlas; assessment findings update Atlas vulnerability and control entries |
| `kyc-cdd-framework-review` | Supplies evidence for Stage 5 prevent controls on customer-facing threat paths |
| `transaction-monitoring-assessment` | Supplies evidence for Stage 5 detect controls on AML/fraud paths |
| `aml-policy-writer` | Reads Atlas state and generates policy that actually reflects the firm's assessed risk (rather than a generic template) |
| `procedure-builder` | Same — procedures tailored to Atlas state |
| `board-report-generator` | Largely replaced by Atlas board pack export; alternative view for firms that want the narrative MLRO report format |
| `training-content-creator` | Reads Atlas state to generate risk-specific training (your training covers the threats you actually face) |
| `regulatory-change-scanner` | Integrated via Regulatory Radar → Atlas trigger engine |
| `str-sar-review-assistant` | Incidents logged against the Atlas link the SAR back to the relevant threat paths |
| `investigation-support` | Investigation findings flow into Atlas vulnerability updates |
| `peer-benchmarking` | Compare your Atlas state against anonymised pack-level averages |
| `control-testing-framework` | Stage 5 evidence comes from control testing results |
| Engagement modules (proposal builder, delivery planner, stakeholder interviews, etc.) | Unchanged — they serve the consulting-practice use case where Atlas is the deliverable |
| `data-readiness-assessment` | Remains the prerequisite check for AMLA-style data-point reporting; Atlas state feeds the data readiness prioritisation |

**Cascade for a new AMLR engagement** (a compliance consultant using ANTON):
1. Client Atlas created with relevant industry + FCP domain packs
2. `amlr-gap-analysis` run against the Atlas state → gap matrix
3. `data-readiness-assessment` run → data scorecard
4. `aml-policy-writer` produces policy reflecting Atlas risks
5. `procedure-builder` produces procedures for material Atlas vulnerabilities
6. `training-content-creator` produces training for material Atlas threats
7. Atlas board pack + gap analysis executive summary + policy + procedures + training = complete deliverable

This cascade is the reference workflow for FCP consulting using ANTON and should be pre-configured as an `.anton` Project Template bundle called "AMLR Readiness Programme".

---

## A1.9 Regulatory Radar domain feeds

The Radar already exists. This addendum specifies how it wires into domain-packed Atlases:

Each FCP domain pack declares a set of `radar_feed_tags`:

```json
// fcp-sanctions/manifest.json excerpt
{
  "radar_feed_tags": [
    "eu-sanctions",
    "ofsi-uk-sanctions",
    "ofac-us-sanctions",
    "un-consolidated-list",
    "eba-sanctions-guidelines",
    "national-sanctions-authority"
  ]
}
```

When the Radar ingests an item matching any of these tags, and any Atlas on the system has the corresponding domain active, that Atlas's trigger engine fires a review prompt. The prompt identifies:

- Which threat paths may be affected
- Which vulnerabilities may need re-assessment
- Which controls may need refresh
- A recommended review path through the Atlas

This turns the Radar from a general news feed into an *Atlas-relevant* alerting system. A building firm's owner sees: "The EU added 12 entities to the sanctions list today; three are in Baltic sheet-metal sector, which may affect your TP-1 path. Want to review?"

---

## A1.10 The one screen a small-business owner actually uses

Small-business users will not navigate eleven Atlas tabs. Design a **Small Business Dashboard** as an alternative landing mode (auto-activated for Atlases owned by a sole owner-director or for industry packs tagged small-business):

```
┌────────────────────────────────────────────────────────────┐
│  Your risks, right now                                     │
│                                                            │
│  🔴 1 thing outside your risk appetite                      │
│     Subcontractor cash payments — tax evasion facilitation  │
│     Fix by: 15 June 2026   Estimated cost: low             │
│     [ View fix ]   [ Mark as done ]                         │
│                                                            │
│  🟡 3 things at the boundary                                │
│     ► Sanctioned supplier check (sanctions)                │
│     ► Facilitation payments (ABC)                          │
│     ► Baltic labour supply chain (modern slavery)          │
│                                                            │
│  🟢 6 things within appetite                                │
│     [ See all ]                                            │
│                                                            │
│  Recent alerts                                             │
│  ► EU added 12 sanctions designations — check your TP-1    │
│  ► New guidance on F-skatt verification — see TP-6         │
│                                                            │
│  Next review                                               │
│  Your quarterly check-in is due 5 July 2026                │
│  Estimated time: 20 minutes                                │
│  [ Start now ]                                             │
│                                                            │
│  Board / Owner attestation                                 │
│  Last signed: 12 February 2026 by Anna Eriksson             │
│  [ Sign current state ]   [ Export board pack ]             │
└────────────────────────────────────────────────────────────┘
```

The full workspace remains available via a "Detailed view" toggle. The default small-business experience is one screen, traffic-light outputs, one action at a time.

---

## A1.11 Expanded acceptance criteria

In addition to the 16 criteria in the base spec, Phase-1 ship now requires:

17. An Atlas can activate any subset of the seven FCP domain packs at setup; the scope-assessor module records rationale for activation/deactivation of each.
18. The company-wide appetite consolidator produces a single board-approvable statement that reflects the worst-case rollup across all active domains.
19. At least seven FCP domain packs ship as built-in (AML/CFT, Sanctions, Fraud, ABC, Market Abuse, Tax Evasion Facilitation, Export Controls). Modern Slavery ships if build capacity permits; else Phase-2.
20. At least six non-financial industry packs ship (Real Estate Agent, Construction/Trades, Retail/Supermarket, Professional Services, Manufacturing, SME General). FCP-CASP and FCP-Bank also ship per base spec.
21. Cross-domain threat path bundles can be created and visualised.
22. The Small Business Dashboard is the default for Atlases where owner is a sole director or industry pack is tagged small-business.
23. Each domain pack ships its `severity-benchmarks.json` so scoring is anchored in concrete descriptors.
24. The AMLR Readiness Programme `.anton` Project Template pre-configures the full FCP cascade (Atlas + gap analysis + data readiness + policy + procedures + training) for an AMLR obliged entity.
25. A Swedish building firm worked-example fixture produces an Atlas in under 20 minutes of Draft mode interaction, with at least ten threat paths correctly scored and at least one cross-domain bundle proposed.
26. Regulatory Radar domain-tagged feeds fire trigger prompts into relevant Atlases, proven end-to-end.
27. The existing `business-wide-risk-assessment` FCP module is flagged as superseded and offers one-click migration to an Atlas with `fcp-bank-pack` or `fcp-casp-pack` pre-selected.
28. Universal FCP Core is automatically activated when any FCP domain is active and contributes to the Stage 1 exposure map and Stage 5 control library.

---

## A1.12 Build-order adjustments

Insert the following steps into the base spec's implementation order:

**After step 5 (Area 6 module upgrade):**
- 5b. **Build `fcp-scope-assessor` module** — the AI-guided scope assessor that recommends which FCP domain packs to activate based on a business description
- 5c. **Build `atlas-company-appetite-consolidator` module** — Stage 7b company-wide rollup

**After step 4 (SME general pack):**
- 4b. **Build the seven FCP domain packs** in parallel — each is a bundle with manifest, threat libraries, vulnerability libraries, control libraries, severity benchmarks, regulatory radar feed tags, glossary overlay
- 4c. **Build the Universal FCP Core overlay** — the cross-cutting baseline

**After step 14 (remaining Phase-1 industry packs):**
- 14b. **Add non-financial AMLR obliged-entity packs** — real estate agent, notary/law firm, accounting/tax advisor, dealer in high-value goods, motor vehicle dealer, gambling operator, crowdfunding
- 14c. **Add broad-market sector packs** — construction/trades, retail/supermarket, e-commerce, manufacturing, professional services, hospitality, healthcare clinic, non-profit/NGO

**New step between 16 and 17:**
- 16b. **Build the Small Business Dashboard** as an alternative workspace view for small-business Atlases
- 16c. **Wire cross-domain threat path bundles** into Stage 2 UI with visualisation

**New step after 17 (Compliance-as-Code rule references):**
- 17b. **Build the AMLR Readiness Programme Project Template** `.anton` bundle that pre-configures the FCP cascade for a new obliged entity engagement

This adds roughly 4-6 weeks to the Phase-1 timeline but converts Risk Atlas from "a risk tool with an FCP pack" to "the definitive FCP risk platform for obliged and non-obliged entities alike, and the entry point to ANTON's FCP area for every user type." That is a materially better market position.

---

## A1.13 The strategic payoff

Three reasons this addendum is the right move, not scope creep:

**1. It makes Risk Atlas *the* ANTON front door for FCP.** Every user with any FCP exposure — from a multi-billion-EUR bank to a three-store supermarket — now has the same entry point. The Atlas is where they start; the existing 23 FCP modules are where they go when the Atlas tells them what needs deeper work. This unifies ANTON's most developed area under a single coherent UX.

**2. It serves the AMLR 2027 moment.** July 2027 is a forcing function for every non-financial obliged entity across the EU. Real estate agents, luxury goods dealers, crowdfunding platforms, trust and company service providers — thousands of firms that have never had a compliance function are being dragged into obliged-entity status. They need a credible tool at a price they can afford. Risk Atlas with the right packs is that tool. Ship this before July 2027 and there is a 30-month window where ANTON is effectively alone in the accessible tier of this market.

**3. It compounds with every other ANTON capability.** The Regulatory Radar is more valuable when it feeds Atlases. The Knowledge Graph is more valuable when it maps real control-regulation-risk relationships. The Cross-Workflow Intelligence funnel is more valuable when it detects sector-wide patterns across hundreds of Atlases. The `.anton` Marketplace is more valuable when it carries paid certified domain packs. Beehive becomes more valuable when supply-chain members deliberate on shared sanctions/modern-slavery risk. Risk Atlas is the feature that makes every other ANTON capability more useful. That is what a flagship feature should do.

---

## A1.14 Pressure tests specific to the FCP extension

**MLRO at a mid-sized bank.** Likely: "My existing BWRA is 60 pages and covers what you're describing in six domains under AML alone. How do I migrate without losing detail?" → The per-path granularity is the detail. Ten to fifteen threat paths per domain typically captures what a 60-page BWRA covers, just more usefully structured. The migration converts the existing BWRA text into proposed Stage 1-3 entries that the MLRO can accept/edit/reject.

**Owner of a building firm.** Likely: "I didn't know I had sanctions exposure." → The scope-assessor is the key. It must credibly show *why* each domain is recommended, with concrete examples for the owner's industry. This is non-negotiable. If the scope-assessor fails, the whole addendum falls flat.

**Advisense senior consultant.** Likely: "Where does my methodology expertise go in all this? You've industrialised what I do for a living." → Into the certified domain packs. Certified packs monetise expertise at marketplace scale. One senior consultant can ship a bank-grade certified sanctions pack that is used by a thousand banks. That is a more lucrative model than billing hours — but only if the pack quality is the consultant's.

**Regulator.** Likely: "Show me how you ensure a small business doesn't misclassify itself out of obliged-entity status." → The scope-assessor's rationale field is mandatory. Every deactivation of a domain requires a recorded reason. For AMLR obliged-entity triggers (cash threshold, real estate involvement, high-value goods), the scope-assessor applies hard rules that the user cannot override without explicit attestation. The audit trail shows: user attested A, ANTON recommended B, user overrode with rationale C. The regulator gets full visibility.

**Competing GRC vendor.** Likely: "You've essentially built what ServiceNow GRC charges 200k EUR/year for at 1% of the price." → Yes. The difference is the open-source engine + certified-pack marketplace. Same logic as Red Hat vs proprietary Unix. The model is already proven in a harder industry.

---

## A1.15 Final note — the market this addendum unlocks

The base spec's Risk Atlas competes in the existing risk-management-tool market, which is a real but modest opportunity. This addendum's FCP overlay lets Risk Atlas compete in the **financial-crime-compliance-tool market**, which is orders of magnitude larger, expanding rapidly under AMLR 2027, and almost entirely underserved at the SME tier.

It also creates the distribution channel for the certified pack business. Every obliged-entity SME that installs Risk Atlas with, say, the certified real-estate-agent pack becomes a distribution footprint for subsequent paid packs (AMLR quarterly update pack, Swedish-specific regulatory pack, Scandinavian PEP screening pack). This is the Red Hat subscription flywheel translated to compliance.

Ship this with Phase 1. Not later. The AMLR July 2027 window is closing and non-financial obliged entities are starting to panic now. Risk Atlas with the FCP Overlay is the thing they need, at the price they can afford, with the AI guidance they don't have the staff to replace.

**End of Addendum 1. Ready for Claude Code incorporation.**

---

### Appendix A1-A: Quick reference — what activates which domain by default

| Business type | AML | Sanctions | Fraud | ABC | Market Abuse | Tax Evasion F. | Export Controls | Modern Slavery |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Bank | ● | ● | ● | ● | ○ | ○ | ○ | ○ |
| CASP | ● | ● | ● | ○ | ● | ○ | ○ | ○ |
| Payment Institution | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| Real Estate Agent | ● | ● | ● | ○ | ○ | ○ | ○ | ○ |
| Law Firm (client money / real estate) | ● | ● | ● | ● | ○ | ● | ○ | ○ |
| Accounting / Tax Advisor | ● | ● | ● | ● | ○ | ● | ○ | ○ |
| Trust and Company Service Provider | ● | ● | ● | ● | ○ | ● | ○ | ○ |
| Dealer in High-Value Goods | ● | ● | ● | ○ | ○ | ● | ○ | ○ |
| Luxury Vehicle/Yacht Dealer | ● | ● | ● | ○ | ○ | ● | ○ | ○ |
| Gambling Operator | ● | ● | ● | ○ | ○ | ● | ○ | ○ |
| Football Club / Agent | ● | ● | ● | ● | ○ | ● | ○ | ○ |
| Crowdfunding | ● | ● | ● | ○ | ● | ○ | ○ | ○ |
| Construction / Trades | ○ | ● | ● | ● | ○ | ● | ○ | ● |
| Retail / Supermarket | ○ | ● | ● | ● | ○ | ● | ○ | ○ |
| E-commerce | ○ | ● | ● | ● | ○ | ● | ○ | ○ |
| Manufacturing / Industrial | ○ | ● | ● | ● | ○ | ● | ● | ● |
| Professional Services (non-AMLR) | ○ | ● | ● | ● | ○ | ● | ○ | ○ |
| Hospitality | ○ | ● | ● | ● | ○ | ● | ○ | ● |
| Healthcare Clinic | ○ | ● | ● | ● | ○ | ● | ○ | ○ |
| Non-Profit / NGO | ● | ● | ● | ● | ○ | ○ | ○ | ● |
| SaaS / Tech Startup | ○ | ● | ● | ● | ○ | ○ | ● | ○ |
| Listed corporate (any sector) | ○ | ● | ● | ● | ● | ● | ○ | ○ |

● = activated by default  ○ = available, activate if scope-assessor recommends

This is a default table. The scope-assessor always overrides defaults based on the business's specific profile. A tiny hospitality business with zero cash over 10k EUR and no foreign suppliers will have some of these deactivated; a large one with a gambling licence will have more activated.

### Appendix A1-B: Regulatory citations for domain packs (non-exhaustive starter set)

**AML/CFT domain pack:**
- Regulation (EU) 2024/1624 (AMLR)
- Directive (EU) 2024/1640 (AMLD6)
- Regulation (EU) 2024/1620 (AMLA Regulation)
- Regulation (EU) 2023/1113 (Transfer of Funds Regulation)
- FATF 40 Recommendations (as updated)
- EBA Risk Factor Guidelines 2023
- National: Swedish LAM 2017:630; UK POCA 2002 / MLR 2017

**Sanctions domain pack:**
- Regulation (EU) 833/2014 (Russia) + sectoral regulations
- Regulation (EU) 269/2014 (restrictive measures)
- Regulation (EU) 2580/2001 (terrorism)
- UN Consolidated List
- OFAC SDN List (US nexus)
- OFSI Consolidated List (UK nexus)
- EBA Sanctions Guidelines 2024/14 and 2024/15

**Fraud domain pack:**
- Directive (EU) 2017/1371 (PIF Directive)
- UK Fraud Act 2006
- Directive (EU) 2019/713 (non-cash means of payment fraud)
- National fraud statutes

**ABC domain pack:**
- UK Bribery Act 2010
- US FCPA (if US nexus)
- OECD Anti-Bribery Convention
- ISO 37001 (Anti-bribery management systems)
- Council of Europe Criminal Law Convention on Corruption
- National: Swedish Penal Code Chapter 10; French Sapin II

**Market Abuse domain pack:**
- Regulation (EU) 596/2014 (MAR)
- Directive 2014/57/EU (MAD II)
- MiCA Title VI (market abuse in crypto-assets)

**Tax Evasion Facilitation domain pack:**
- UK Criminal Finances Act 2017
- Council Directive 2018/822 (DAC6)
- Council Directive 2011/64/EU (VAT fraud — MTIC)
- OECD Common Reporting Standard

**Export Controls domain pack:**
- Regulation (EU) 2021/821 (recast Dual-Use Regulation)
- Wassenaar Arrangement
- Missile Technology Control Regime
- US EAR (if US nexus), ITAR (defence)
- National export-control authorities

**Modern Slavery domain pack:**
- UK Modern Slavery Act 2015
- Directive (EU) 2024/1760 (CSDDD)
- California Transparency in Supply Chains Act (if US nexus)
- German Lieferkettensorgfaltspflichtengesetz
- ILO Conventions 29, 105, 138, 182

Each pack's regulatory list is version-tagged and updated through Regulatory Radar ingestion. Certified packs commit to quarterly maintenance of this list.

**— End of Addendum 1 —**
