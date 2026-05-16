# FUTURECHAIN_TAX_RULES.md

**Crypto-Asset Tax Rules Matrix for Anton / Heimdall Module 19 (Tax & Reporting)**

| Field | Value |
|---|---|
| Document version | 0.1-draft |
| Last updated | 2026-05-12 |
| Maintained by | FutureChain AB |
| Status | **DRAFT — REQUIRES LEGAL REVIEW PER JURISDICTION BEFORE PRODUCTION USE** |
| Intended consumers | Anton local agent, Heimdall Module 19, FutureChain tax calculator |

---

## 1. Purpose

This document is the canonical source for jurisdiction-specific crypto-asset tax rules used by Anton (local AI agent) and Heimdall Module 19 to compute estimated tax positions on FTC transactions for end users.

It is structured so that each jurisdiction block follows the same schema, enabling the calculator to:

1. Take a user-declared tax residency
2. Apply that jurisdiction's classification, cost basis method, and rates
3. Output a per-transaction gain/loss and an annual K4-equivalent report
4. Flag edge cases that require professional review

**This is not tax advice.** Every output produced from this matrix must carry the disclaimer in §3.

---

## 2. Hard Rules for Implementation

1. **Never produce a definitive tax figure as a "tax bill."** Always frame outputs as *estimated tax liability based on declared residency and current published rules*.
2. **Always link the user to a qualified local tax adviser** for any figure above a configurable threshold (default: equivalent of €5,000 estimated annual liability).
3. **Always show the rule version** (`last_verified` date per jurisdiction) used in the calculation, so the user can see how stale the data is.
4. **Refuse to calculate** for any jurisdiction with `status: unsupported` or where the user's facts trigger a `review_required` flag.
5. **Anton must never advise on "how to reduce tax"** beyond surfacing rules that exist in this document (e.g., "Germany exempts holdings over 12 months — your current holding period is X"). It does not invent or suggest schemes.
6. **Re-verification cadence:** every jurisdiction must be re-checked at least once per quarter, and within 30 days of any known legislative change.

---

## 3. Mandatory Output Disclaimer

Every calculation output produced by Anton/Heimdall using this document must include the following text (translated to user's language):

> This estimate is based on FutureChain's interpretation of publicly available tax rules in [JURISDICTION] as of [LAST_VERIFIED_DATE]. It is not tax advice. Crypto tax rules change frequently and individual circumstances vary. Before filing any tax return based on these figures, consult a qualified tax adviser in your jurisdiction. FutureChain AB accepts no liability for filings made on the basis of this estimate.

---

## 4. Schema Definition

Every jurisdiction block uses the following fields. Anton parses on these field names — do not rename without updating the parser.

```yaml
jurisdiction_code: ISO_3166_alpha_2
jurisdiction_name: string
authority: string              # name of tax authority
authority_url: string          # canonical guidance URL

classification:
  asset_type: enum             # property | financial_asset | intangible_asset |
                               # security | foreign_currency | other_specific
  recognised_as_currency: bool # almost always false
  legal_status: enum           # legal | restricted | banned | grey_zone

taxable_events:
  buy_with_fiat: bool          # almost always false (cost basis event only)
  hold: bool                   # only true in wealth-tax jurisdictions (NL)
  swap_crypto_to_crypto: bool
  spend_on_goods_services: bool
  receive_as_payment: bool     # income tax side
  gift_to_non_spouse: bool
  lend_or_stake: enum          # taxable | not_taxable | depends_on_beneficial_ownership

cost_basis_method:
  permitted: list              # AVERAGE | FIFO | LIFO | HIFO | SPECIFIC_ID | SHARE_POOLING
  default: enum                # which one applies if user has no documentation
  optimization_allowed: bool   # can user pick HIFO etc to minimize?

rates:
  capital_gains:
    type: enum                 # flat | progressive | bracket_dependent
    rate_or_brackets: object   # specific structure varies
  income:
    applies_to: list           # mining | staking | airdrop_with_action | salary | etc
    rate_or_brackets: object

exemptions_and_reliefs:
  annual_exemption: number     # in local currency (0 if none)
  long_term_holding:
    enabled: bool
    period_days: integer       # e.g. 365
    treatment_after: enum      # tax_free | reduced_rate | unchanged
  emt_special_treatment:
    enabled: bool
    description: string
  de_minimis_per_transaction: number

loss_treatment:
  deductible: bool
  deductible_percentage: float # e.g. 0.70 = Sweden's 70% rule
  offset_against: list         # crypto_only | all_capital_gains | income | none
  carry_forward_years: integer # 0 = no carry forward; -1 = indefinite

ftc_specific_notes:
  spending_treatment: string   # how a payment-rail spend is classified
  emt_classification_impact: string
  preferred_classification_for_users: enum

reporting_framework:
  domestic_form: string        # e.g. K4 section D, Form 8949
  carf_dac8_in_force: bool
  effective_date: date
  
tax_year:
  type: enum                   # calendar | fiscal
  start_date: string           # if fiscal
  end_date: string

metadata:
  last_verified: date
  verification_source: list_of_urls
  confidence: enum             # high | medium | low | needs_review
  review_flags: list_of_strings
```

---

## 5. Calculation Engine Pseudocode

```
function compute_tax_position(user, transactions, jurisdiction_code):
    rules = load_jurisdiction(jurisdiction_code)
    
    if rules.status == 'unsupported':
        return refuse_with_referral(jurisdiction_code)
    
    # Build cost basis pool using jurisdiction's mandatory method
    pool = build_cost_basis(transactions, rules.cost_basis_method.default)
    
    results = []
    for tx in transactions:
        if is_taxable_event(tx, rules.taxable_events):
            if rules.exemptions.long_term_holding.enabled:
                holding_period = compute_holding_period(tx, pool)
                if holding_period >= rules.exemptions.long_term_holding.period_days:
                    apply_long_term_treatment(tx, rules)
                    continue
            
            gain_or_loss = compute_gain_loss(tx, pool, rules.cost_basis_method)
            tax_amount = apply_rate(gain_or_loss, rules.rates, user.income_bracket)
            results.append({tx, gain_or_loss, tax_amount, rule_applied})
    
    annual = aggregate(results)
    annual = apply_annual_exemption(annual, rules.exemptions.annual_exemption)
    annual = apply_loss_offset(annual, rules.loss_treatment)
    
    return {
        per_transaction: results,
        annual_summary: annual,
        disclaimer: rules.disclaimer,
        rule_version: rules.last_verified,
        review_required: should_refer_to_adviser(annual, user.preferences)
    }
```

---

## 6. Jurisdiction Matrix

### Legend

- ✅ **High confidence** — confirmed against authority guidance within last 90 days
- 🟡 **Medium confidence** — based on secondary sources, needs verification
- 🔴 **Low confidence / DRAFT** — placeholder, requires legal review before activation
- ⛔ **Unsupported** — refuse to calculate, refer to local adviser

---

### 6.1 European Union — Member States

> **EU-wide:** MiCA in force; DAC8 reporting from 1 Jan 2026; CARF aligned. Tax remains Member State competence.

---

#### 🇸🇪 Sweden (SE) ✅

| Field | Value |
|---|---|
| Authority | Skatteverket |
| Classification | Övrig tillgång (other property), IL kap. 52 |
| Recognised as currency | No |
| Spend on goods/services | Taxable disposal |
| Swap crypto-to-crypto | Taxable disposal |
| Cost basis method | **AVERAGE only (genomsnittsmetoden)** — no optimization |
| Capital gains rate | 30% flat |
| Annual exemption | None |
| Long-term holding relief | None |
| Loss treatment | 70% deductible against other capital gains |
| EMT special treatment | None published; FTC as EMT would *de facto* produce ~0 gain since price doesn't move vs SEK |
| Reporting form | K4 section D |
| DAC8 in force | Yes, from 2026-01-01 |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Most restrictive cost basis regime in the EU. Every spend is a taxable event. Mining as private individual taxed as hobby income; staking taxed as capital income (30%) per Skatteverket position.

**Review flags:** EMT classification not formally tested at Skatterättsnämnden — see förhandsbesked recommendation.

---

#### 🇩🇪 Germany (DE) ✅

| Field | Value |
|---|---|
| Authority | Bundeszentralamt für Steuern (BZSt) |
| Classification | Sonstige Wirtschaftsgüter (other economic goods), §23 EStG |
| Spend on goods/services | Taxable disposal (within 12 months) |
| Swap crypto-to-crypto | Taxable disposal (within 12 months) |
| Cost basis method | FIFO (default), specific identification permitted with records |
| **Long-term holding relief** | **HOLDING > 12 MONTHS = 0% (Spekulationsfrist)** |
| Capital gains rate (short-term) | Marginal income tax rate (up to 45% + Soli) |
| Annual exemption | €1,000 per year (raised from €600) |
| Loss treatment | Offsettable against other crypto gains |
| EMT special treatment | None published |
| Reporting | Anlage SO of income tax return |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Most pro-holding regime in the EU. A user who holds FTC > 365 days pays zero tax regardless of gain size. For payment use, the €1,000 de minimis covers occasional spend. Frequent payment use likely above threshold and taxable.

**Review flags:** Active proposal to extend the 12-month rule to 5 years for staked/lent assets — confirm current status quarterly.

---

#### 🇫🇷 France (FR) ✅

| Field | Value |
|---|---|
| Authority | Direction Générale des Finances Publiques (DGFiP) |
| Classification | Actifs numériques (CGI Art. 150 VH bis) |
| Spend on goods/services | Taxable (treated as disposal to fiat) |
| **Swap crypto-to-crypto** | **NOT TAXABLE until conversion to fiat (unique)** |
| Cost basis method | Weighted average (proportional method per portfolio) |
| Capital gains rate | 30% flat (PFU: 12.8% IR + 17.2% social) |
| Annual exemption | €305 of gross sales (very narrow) |
| Long-term holding relief | None |
| Loss treatment | Carry forward 10 years, crypto-only offset |
| Professional traders | Treated as BNC, progressive rates up to 45% + social |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** France's crypto-to-crypto non-taxation is unique in the EU. For a closed-loop FTC ecosystem (FTC ↔ other tokens) that defers fiat conversion, tax can be substantially deferred. Once converted to EUR (including merchant auto-swap), the disposal triggers.

---

#### 🇮🇹 Italy (IT) ✅

| Field | Value |
|---|---|
| Authority | Agenzia delle Entrate |
| Classification | Cripto-attività (Law 197/2022) |
| Spend on goods/services | Taxable disposal |
| Swap crypto-to-crypto | Taxable disposal |
| Cost basis method | LIFO permitted; weighted average alternative |
| Capital gains rate (2026) | **33%** (raised from 26% in 2024) |
| **EMT carve-out** | **26% for euro-denominated e-money tokens** |
| Annual exemption | €2,000 threshold (gains below not taxable) |
| Wealth tax | 0.2% on year-end crypto holdings |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Most strategically important data point in this matrix. **Italy is the first EU Member State to give MiCA-classified EMTs a tax discount.** If FTC is classified as EMT (1:1 SEK or EUR peg, full reserve), Italian users pay 26% instead of 33%. This is concrete validation of the EMT path.

---

#### 🇪🇸 Spain (ES) 🟡

| Field | Value |
|---|---|
| Authority | Agencia Tributaria (AEAT) |
| Classification | Capital asset, savings income |
| Spend on goods/services | Taxable disposal |
| Swap crypto-to-crypto | Taxable disposal |
| Cost basis method | FIFO mandatory |
| Capital gains rate | Progressive on savings base: 19% (≤€6k), 21% (≤€50k), 23% (≤€200k), 27% (≤€300k), **28% (>€300k)** |
| Annual exemption | None on crypto specifically |
| Reporting | Modelo 720 (foreign holdings), Modelo 721 (crypto) |
| Tax year | Calendar |
| Confidence | Medium (verify 2026 brackets) |

**Review flags:** Modelo 721 threshold and exact bracket cutoffs need verification.

---

#### 🇵🇹 Portugal (PT) ✅

| Field | Value |
|---|---|
| Authority | Autoridade Tributária e Aduaneira (AT) |
| Classification | Crypto-asset (post-2023 reform) |
| Spend on goods/services | Taxable if held < 365 days; **tax-free if > 365 days** |
| Swap crypto-to-crypto | Generally not taxed (same-category swaps) |
| **Long-term holding relief** | **HOLDING > 365 DAYS = 0%** |
| Capital gains rate (short-term) | 28% flat |
| Income tax (mining, etc.) | Progressive up to 48% |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Second-best holding regime in the EU after Germany. Same payment-rail dynamic: long-term holdings used in payment escape taxation entirely.

---

#### 🇨🇾 Cyprus (CY) ✅

| Field | Value |
|---|---|
| Authority | Cyprus Tax Department |
| Classification | Crypto-asset (new framework 2026) |
| Spend on goods/services | Taxable disposal |
| Swap crypto-to-crypto | Taxable disposal |
| Capital gains rate | **8% flat (from 2026-01-01)** |
| Annual exemption | TBD |
| Loss treatment | Crypto-only offset, same year only, no carry forward |
| Tax year | Calendar |
| Confidence | High (recent legislation) |

**FTC notes:** Lowest CGT rate in the EU for crypto. Attractive for active payment users. Strategic potential as FutureChain expansion hub.

---

#### 🇲🇹 Malta (MT) 🟡

| Field | Value |
|---|---|
| Authority | Commissioner for Revenue |
| Classification | Asset (long-term) or trading stock |
| Long-term holdings (individual) | **Tax-free** |
| Frequent trading | Up to 35% income tax (reducible to 0-5% under residency rules) |
| Cost basis method | FIFO default |
| Tax year | Calendar |
| Confidence | Medium |

---

#### 🇳🇱 Netherlands (NL) ✅

| Field | Value |
|---|---|
| Authority | Belastingdienst |
| Classification | Box 3 asset (wealth tax model — unique in EU) |
| **Taxation model** | **Tax on year-end holdings (deemed return), NOT on transactions** |
| Effective rate | ~1.97% deemed return × 36% = ~0.7% of holdings p.a. (varies) |
| Spend on goods/services | Not a separate taxable event (already covered by wealth tax) |
| Threshold | Tax-free wealth allowance (~€57,000 per person, 2025) |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Structurally different from every other EU jurisdiction. No per-transaction calculation needed; only year-end snapshot of FTC holdings × deemed return rate. Anton's NL implementation is *much simpler* than transaction-based jurisdictions.

---

#### 🇧🇪 Belgium (BE) 🟡

| Field | Value |
|---|---|
| Authority | SPF Finances |
| Classification | Movable property (depends on intent) |
| **Private investor (good father)** | **0% if "normal management of private assets"** |
| Speculative (occasional) | 33% as miscellaneous income |
| Professional | Progressive income tax up to 50% |
| Cost basis method | Per-transaction, intent-based assessment |
| Tax year | Calendar |
| Confidence | Medium (intent-based test is fact-specific) |

**Review flags:** The "good father" test is subjective. Anton should not assert 0% without confirming user's overall pattern with a Belgian adviser.

---

#### 🇩🇰 Denmark (DK) 🟡

| Field | Value |
|---|---|
| Authority | Skattestyrelsen |
| Classification | Speculation asset (default) |
| Capital gains | Taxed as personal income — up to **52.07%** |
| Losses | 27% deductible (less generous than gains rate) |
| Cost basis method | FIFO |
| Tax year | Calendar |
| Confidence | Medium |

**FTC notes:** One of the highest effective rates in the world. Active proposal to move toward 42% flat — verify current status.

---

#### 🇫🇮 Finland (FI) 🟡

| Field | Value |
|---|---|
| Authority | Vero (Tax Administration) |
| Capital gains rate | 30% (≤€30k), 34% (>€30k) |
| Annual exemption | None |
| Cost basis method | FIFO; deemed acquisition cost 20% (held >10y: 40%) |
| Loss treatment | 5-year carry forward, offset against other capital income |
| Confidence | Medium |

---

#### 🇦🇹 Austria (AT) 🟡

| Field | Value |
|---|---|
| Authority | BMF |
| Capital gains rate | 27.5% flat (post-March 2022 reform) |
| Cost basis method | FIFO; weighted average permitted |
| Crypto-to-crypto | Tax-deferred (rolled over) |
| Long-term relief | None (old 1-year rule abolished) |
| Confidence | Medium |

---

#### 🇮🇪 Ireland (IE) 🟡

| Field | Value |
|---|---|
| Authority | Revenue |
| Classification | Chargeable asset (CGT) |
| Capital gains rate | 33% |
| Annual exemption | €1,270 |
| Cost basis method | FIFO with 4-week rule |
| Confidence | Medium |

---

#### 🇵🇱 Poland (PL) 🟡

| Field | Value |
|---|---|
| Authority | Krajowa Administracja Skarbowa |
| Capital gains rate | 19% flat on disposal to fiat |
| Crypto-to-crypto | Not taxable |
| Cost basis method | Total expenses vs total revenues annually |
| Confidence | Medium |

---

#### 🇨🇿 Czech Republic (CZ) 🟡

| Field | Value |
|---|---|
| Capital gains rate | 15% (up to threshold), 23% above |
| Holding > 3 years | Tax-free (proposed/in implementation — verify) |
| Annual exemption | CZK 100,000 (~€4,000) gross income threshold |
| Confidence | Medium |

---

#### 🇸🇰 Slovakia (SK) 🔴

| Field | Value |
|---|---|
| Capital gains rate | 19% / 25% (income tax); short vs long |
| Holding > 1 year | Reduced rate (recent reform — verify) |
| Confidence | Low — verify before activation |

---

#### 🇭🇺 Hungary (HU) 🟡

| Field | Value |
|---|---|
| Capital gains rate | 15% flat |
| Crypto-to-crypto | Not separately taxed |
| Confidence | Medium |

---

#### 🇷🇴 Romania (RO) 🟡

| Field | Value |
|---|---|
| Capital gains rate | 10% (special crypto rate) |
| Annual threshold | RON 600 per transaction; RON 12,000 annual |
| Confidence | Medium |

---

#### 🇧🇬 Bulgaria (BG) 🟡

| Field | Value |
|---|---|
| Capital gains rate | 10% flat |
| Confidence | Medium |

---

#### 🇬🇷 Greece (GR) 🔴

| Field | Value |
|---|---|
| Capital gains rate | 15% (proposed framework; not yet fully enacted as of mid-2026) |
| Confidence | Low — Greek crypto tax framework still in development. Refer to adviser. |

---

#### 🇱🇺 Luxembourg (LU) 🟡

| Field | Value |
|---|---|
| Held > 6 months (speculative period) | Tax-free |
| Held < 6 months | Progressive income tax up to 42% |
| Confidence | Medium |

---

#### 🇱🇹 Lithuania (LT) 🔴
#### 🇱🇻 Latvia (LV) 🔴
#### 🇪🇪 Estonia (EE) 🔴
#### 🇸🇮 Slovenia (SI) 🔴
#### 🇭🇷 Croatia (HR) 🔴

**For all five Baltic / Balkan EU states above:** Confidence low. Tax frameworks evolved 2024-2026. Anton should refer users in these jurisdictions to a local tax adviser until verification completed.

---

### 6.2 Europe — Non-EU

---

#### 🇬🇧 United Kingdom (GB) ✅

| Field | Value |
|---|---|
| Authority | HM Revenue & Customs (HMRC) |
| Classification | Chargeable asset (similar to shares) |
| Spend on goods/services | Taxable disposal |
| Swap crypto-to-crypto | Taxable disposal (including to stablecoins) |
| Cost basis method | **Section 104 share pooling + same-day rule + 30-day "bed-and-breakfast" rule** |
| Capital gains rate | 18% (basic) / **24% (higher)** — from 30 Oct 2024 |
| Annual exemption | £3,000 |
| Income tax (mining, staking, paid work) | 20% / 40% / 45% |
| CARF in force | Yes, from 1 Jan 2026 |
| Reporting | Self Assessment, new dedicated crypto section from 2024-25 |
| Tax year | 6 April – 5 April |
| Confidence | High |

**FTC notes:** Share pooling has same effect as Sweden's average cost — no HIFO optimization. £3,000 annual allowance is a modest cushion for occasional payment use. Anton must handle the same-day and 30-day matching rules correctly (these are unusual and easy to miscalculate).

---

#### 🇨🇭 Switzerland (CH) ✅

| Field | Value |
|---|---|
| Authority | Federal Tax Administration (FTA / ESTV) + cantonal |
| **Private investor capital gains** | **Tax-free** |
| Wealth tax | Yes — annual wealth tax on year-end holdings (cantonal, 0.1-1%) |
| Professional trader | Income tax + social security |
| Income (mining, salary in crypto) | Income tax |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** One of the most attractive jurisdictions in the world for individual crypto holders. Wealth tax on holdings (similar conceptually to NL) but no per-transaction CGT. The "private investor" vs "professional trader" line is fact-specific.

---

#### 🇳🇴 Norway (NO) 🟡

| Field | Value |
|---|---|
| Capital gains rate | 22% (basic) + step-tax to 37.84% |
| Wealth tax | Yes (small percentage on holdings) |
| Confidence | Medium |

---

#### 🇮🇸 Iceland (IS) 🔴

| Field | Value |
|---|---|
| Capital gains rate | 22% |
| Confidence | Low — refer to adviser |

---

### 6.3 North America

---

#### 🇺🇸 United States (US) ✅

| Field | Value |
|---|---|
| Authority | Internal Revenue Service (IRS), Notice 2014-21 |
| Classification | **Property** |
| Spend on goods/services | Taxable disposal at fair market value |
| Swap crypto-to-crypto | Taxable disposal |
| Cost basis method | **FIFO default, but Specific ID permitted with documentation (HIFO, LIFO under Spec ID)** — allows real optimization |
| Short-term CGT (< 1 year) | Ordinary income rates: 10% / 12% / 22% / 24% / 32% / 35% / 37% |
| Long-term CGT (≥ 1 year) | Preferential: 0% / 15% / 20% |
| Net Investment Income Tax (NIIT) | Additional 3.8% on high earners |
| State tax | Variable (e.g. CA 13.3% top, TX/FL 0%) |
| Income (mining, staking, airdrop) | Ordinary income at FMV on receipt |
| Reporting | Form 8949 + Schedule D; Form 1099-DA from brokers (2025+); cost basis on 1099-DA from 2026 |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Most flexible jurisdiction for optimization. Active payment users on a stablecoin/EMT effectively realize ~0 gain on each spend (USDC model). Anton can offer HIFO selection here (which it cannot in EU jurisdictions).

**Review flags:** State tax matters at top brackets — Anton should ask for state of residence and apply state rate.

---

#### 🇨🇦 Canada (CA) ✅

| Field | Value |
|---|---|
| Authority | Canada Revenue Agency (CRA) |
| Classification | Commodity |
| **Inclusion rate** | **50% of gain included in taxable income** (raised to 66.67% above CAD 250k as of June 2024 — verify current) |
| Income tax brackets (federal + provincial) | Combined up to ~54% |
| Cost basis method | Adjusted Cost Base (ACB) — similar to weighted average |
| Spend on goods/services | Taxable disposal (treated as barter) |
| Tax year | Calendar |
| Confidence | High (verify 2026 inclusion rate) |

**Review flags:** 2024 capital gains inclusion rate change reversed/modified by subsequent government — confirm current law.

---

#### 🇲🇽 Mexico (MX) 🟡

| Field | Value |
|---|---|
| Authority | SAT |
| Classification | Asset (no specific crypto framework as of mid-2026) |
| Capital gains rate | Up to 35% as part of general income |
| Confidence | Medium |

---

### 6.4 Latin America (selected)

---

#### 🇧🇷 Brazil (BR) 🟡

| Field | Value |
|---|---|
| Authority | Receita Federal |
| Monthly exemption | BRL 35,000 in sales |
| Capital gains rate | Progressive: 15% (≤BRL 5M), 17.5%, 20%, 22.5% |
| Foreign holdings | Specific 15% on foreign-held crypto (Law 14.754) |
| Reporting | Monthly DARF if applicable, annual return |
| Confidence | Medium |

---

### 6.5 Asia-Pacific

---

#### 🇯🇵 Japan (JP) ✅

| Field | Value |
|---|---|
| Authority | National Tax Agency (NTA) |
| Classification | Crypto-asset under Payment Services Act |
| **Default treatment** | **Miscellaneous income — up to 55% (progressive)** |
| **2026 reform** | **20% flat tax on registered platforms (transitional — verify current status)** |
| Loss carryforward | Limited (3 years on registered platforms under new regime) |
| Spend on goods/services | Taxable disposal |
| Cost basis method | Moving average or total average |
| Tax year | Calendar |
| Confidence | High (but 2026 transition year — verify monthly) |

**FTC notes:** Historically one of the harshest regimes. The 2026 reform is significant — if Japan finalizes the 20% flat on registered platforms, it becomes competitive. Anton should distinguish "registered platform user" (20%) from default treatment (up to 55%).

---

#### 🇰🇷 South Korea (KR) 🟡

| Field | Value |
|---|---|
| Authority | National Tax Service (NTS) |
| Capital gains rate | 20% over KRW 2.5M annual threshold (~€1,700) |
| Implementation | **Delayed multiple times — verify current effective date** |
| Confidence | Medium |

---

#### 🇨🇳 China (CN) ⛔

| Field | Value |
|---|---|
| Status | **Crypto trading effectively banned (2021 PBOC notice)** |
| Anton should | Refuse calculation, refer user to specialist counsel |

**Implementation:** `status: unsupported`. Anton returns a polite refusal noting trading is restricted in the user's stated residency.

---

#### 🇭🇰 Hong Kong (HK) ✅

| Field | Value |
|---|---|
| Authority | Inland Revenue Department (IRD) |
| **Individual capital gains** | **No CGT on capital-nature crypto disposals** |
| Business income | 16.5% profits tax (frequent trading) |
| Capital vs revenue distinction | Badges of trade test |
| Confidence | High |

---

#### 🇸🇬 Singapore (SG) ✅

| Field | Value |
|---|---|
| Authority | IRAS |
| **Capital gains tax** | **None on individual capital crypto disposals** |
| Business income | Up to 22% (frequent trading, ICOs, mining as business) |
| GST | Crypto exempt since 2020 |
| Confidence | High |

**FTC notes:** Singapore and Hong Kong are the cleanest Asia-Pacific jurisdictions for individual payment-rail use. No per-transaction CGT to calculate.

---

#### 🇦🇺 Australia (AU) ✅

| Field | Value |
|---|---|
| Authority | Australian Taxation Office (ATO) |
| Classification | CGT asset (property) |
| Spend on goods/services | Taxable disposal; personal use asset exemption up to AUD 10,000 cost basis (narrow) |
| Long-term holding | **50% CGT discount if held > 12 months** |
| Cost basis method | FIFO default; specific ID permitted with records |
| Marginal rates | Up to 45% + 2% Medicare |
| Tax year | 1 July – 30 June |
| Confidence | High |

---

#### 🇳🇿 New Zealand (NZ) ✅

| Field | Value |
|---|---|
| Authority | Inland Revenue (IRD) |
| **No CGT regime** — but crypto income from disposal usually taxed as ordinary income if acquired with intent to sell |
| Income rates | Progressive up to 39% |
| Confidence | High |

**FTC notes:** NZ's "intent to sell" test means almost all crypto disposals end up taxable as income. Treat conservatively in Anton.

---

#### 🇮🇳 India (IN) ✅

| Field | Value |
|---|---|
| Authority | Income Tax Department |
| Classification | Virtual Digital Asset (VDA) |
| **Capital gains rate** | **30% flat — no deductions, no offset, no loss carry-forward** |
| **TDS** | **1% withheld at source on every transaction (Section 194S)** |
| Spend on goods/services | Taxable disposal |
| Cost basis | Acquisition cost only — no other deductions |
| Tax year | 1 April – 31 March |
| Confidence | High |

**FTC notes:** Most restrictive major-economy regime. 1% TDS on every transaction creates significant friction for payment use — every FTC spend involves a withholding. Anton must surface this clearly to Indian users.

---

### 6.6 Middle East

---

#### 🇦🇪 United Arab Emirates (AE) ✅

| Field | Value |
|---|---|
| Authority | Federal Tax Authority |
| **Personal income tax** | **None** |
| **Capital gains** | **None** |
| Corporate tax (from 2023) | 9% on profits > AED 375k (businesses) |
| VAT | 5% (with crypto VAT exemption clarified 2024) |
| Confidence | High |

**FTC notes:** Cleanest tax environment in the world for individual crypto use. No per-transaction calculation needed.

---

#### 🇸🇦 Saudi Arabia (SA) 🟡

| Field | Value |
|---|---|
| Personal income tax | None |
| Zakat | Applicable to Saudi/GCC nationals on net wealth |
| Crypto regulatory status | Grey zone — not banned but no formal framework |
| Confidence | Medium |

---

#### 🇮🇱 Israel (IL) 🟡

| Field | Value |
|---|---|
| Authority | Israel Tax Authority |
| Capital gains rate | 25% (private) / up to 33% (substantial holders) |
| Business income | Up to 50% |
| Confidence | Medium |

---

#### 🇹🇷 Turkey (TR) 🟡

| Field | Value |
|---|---|
| Authority | Revenue Administration |
| 2024-2025 framework | New crypto regulation enacted; tax framework still being finalized |
| Confidence | Medium — verify before activation |

---

#### 🇶🇦 Qatar (QA) 🔴
#### 🇧🇭 Bahrain (BH) 🔴

Both: Low confidence. Anton should refer users to local advisers.

---

### 6.7 Africa

---

#### 🇿🇦 South Africa (ZA) ✅

| Field | Value |
|---|---|
| Authority | SARS |
| Classification | Asset of intangible nature |
| **Investor (capital) — CGT** | **40% inclusion rate × marginal rate = effective max 18%** |
| **Trader (revenue) — income tax** | **Up to 45%** |
| Annual exclusion | ZAR 40,000 (capital gains) |
| Cost basis method | FIFO default; specific ID permitted with records |
| Bed-and-breakfast rule | Yes, 45 days before/after |
| CARF in force | Yes, from 1 March 2026 (first reports May 2027) |
| Tax year | 1 March – end February |
| Confidence | High |

**FTC notes:** The investor/trader distinction is the central question. Anton should ask users about transaction frequency and intent before calculating, and refer ambiguous cases to a tax adviser. The R40k annual exclusion makes occasional payment use very cheap.

---

#### 🇳🇬 Nigeria (NG) ✅

| Field | Value |
|---|---|
| Authority | Federal Inland Revenue Service (FIRS) + SEC |
| Legal framework | Investments and Securities Act 2025 + Nigeria Tax Administration Act 2025 |
| **Capital gains treatment** | **As personal income tax — up to 25%** (replaces old 10% CGT) |
| Tax-free threshold | ₦800,000 annual |
| Spend on goods/services | "Same tax treatment as transactions conducted in fiat" — explicit |
| VASP reporting | Mandatory from 2026; ₦10M + monthly fines for non-compliance |
| Tax year | Calendar |
| Confidence | High |

---

#### 🇰🇪 Kenya (KE) ✅

| Field | Value |
|---|---|
| Authority | Kenya Revenue Authority (KRA) |
| **2025 model (Finance Act)** | **10% excise duty on transaction fees** (replaces the abolished 3% Digital Asset Tax on gross value) |
| Income tax | Standard rates apply to crypto income |
| Structurally different | Tax on the service (fees), not on the gain |
| Tax year | Calendar |
| Confidence | High |

**FTC notes:** Kenya's fee-based model is structurally unique. Anton should compute the 10% excise on FutureChain/CASP fees, not on user gains. Simpler than capital-gains jurisdictions.

---

#### 🇬🇭 Ghana (GH) 🟡

| Field | Value |
|---|---|
| Authority | Ghana Revenue Authority |
| **Framework** | Virtual Asset Service Providers Bill 2025 (passed Dec 2025); tax framework being formalized |
| Confidence | Medium — refer to adviser for now |

---

#### 🇪🇬 Egypt (EG) 🔴
#### 🇲🇦 Morocco (MA) 🔴

Both: Crypto in grey/restricted zone. Refer to adviser.

---

### 6.8 Other Notable Jurisdictions

---

#### 🇸🇻 El Salvador (SV) ✅

| Field | Value |
|---|---|
| **Status** | **Bitcoin is legal tender — Bitcoin transactions exempt from capital gains** |
| Other crypto | Treated as foreign currency for tax purposes |
| Confidence | High (but unique status) |

---

#### 🇬🇪 Georgia (GE) ✅

| Field | Value |
|---|---|
| **Individual capital gains on crypto** | **0%** |
| Business activity | 15-20% corporate tax |
| Confidence | High |

---

#### 🇧🇲 Bermuda (BM) / 🇰🇾 Cayman Islands (KY) ✅

| Field | Value |
|---|---|
| Personal income tax | None |
| Capital gains | None |
| Confidence | High |

---

## 7. Cross-Cutting Logic

### 7.1 Tax Residency Determination

**Anton must not assume residency from IP address.** Users self-declare. The flow:

1. On first use, ask: "What country are you a tax resident of?"
2. Store this declaration with timestamp.
3. Re-confirm annually or whenever user's behavior pattern shifts substantially.
4. Multi-residency users (digital nomads, expats) must be referred to a tax adviser — Anton does not compute split-jurisdiction tax.

### 7.2 EMT vs Utility Token Toggle

If FTC is ultimately classified as an **E-Money Token** under MiCA:

- Italy explicitly applies 26% instead of 33% (Title II EMT carve-out)
- Sweden, France, Spain, etc. — argument that EMT = e-money = no realized gain (untested but logical; needs förhandsbesked / equivalent)
- US, UK — still treated as property/asset; no automatic carve-out
- The tax calculator should have a configurable `ftc_classification: utility_token | emt` flag that propagates correctly per jurisdiction

### 7.3 Merchant-Side Auto-Swap

When FutureChain partners (e.g. Safello) execute an FTC→fiat swap at receipt for a merchant:

- **The merchant** has a near-zero gain/loss on swap (held milliseconds). Effectively a fiat transaction. Anton's merchant-mode calculator returns zero in all jurisdictions.
- **The customer** still has a taxable disposal under the customer's own jurisdiction's rules. The merchant-side swap does not affect the customer's position.

### 7.4 Refund Tagging

If a refund is cryptographically tagged as `refund_of: <original_tx_hash>` within an agreed window (e.g. 14 days per Konsumentköplagen/EU Consumer Rights Directive):

- Anton's default behavior: treat as **cancellation of the original taxable event** (no realized gain on the original spend, no new acquisition on the refund).
- This treatment is **not legally settled in any jurisdiction yet**. Anton must surface this and recommend förhandsbesked/private ruling in jurisdictions where the user wants certainty.

### 7.5 Anton Agent Wallets

For payments executed by Anton on behalf of a human user:

- The beneficial owner is the human (captured in PACS.008 ultimate debtor field).
- All tax positions flow through to the human, in the human's jurisdiction.
- Anton must obtain explicit consent from the human before executing transactions that trigger gains above a configurable threshold.
- This treatment is logically defensible but **untested** — a Skatterättsnämnden förhandsbesked (or equivalent in other jurisdictions) is recommended before broad rollout.

### 7.6 Loss Harvesting (where legal)

Anton may surface, but never automatically execute, year-end loss-harvesting suggestions where:

- The user is in a jurisdiction that permits loss offset (most)
- The proposed action is solely the realization of an existing economic loss (not a wash sale)
- The user retains the decision

**Exclusions:**
- US: wash sale rules do **not** currently apply to crypto, but pending legislation may change this — re-verify quarterly.
- South Africa: explicit 45-day bed-and-breakfast rule — Anton must enforce this.
- UK: same-day and 30-day matching rules — Anton must enforce this.

### 7.7 Reporting Output

For every supported jurisdiction, Anton should produce:

- A per-transaction ledger with: date, asset, quantity, fiat value at transaction, cost basis at transaction, realized gain/loss, applicable rate, estimated tax
- An annual summary mapped to the jurisdiction's filing form (K4, Form 8949, Self Assessment, ITR12, etc.)
- A CARF/DAC8-equivalent dataset for pre-reconciliation against what the CASP reports

---

## 8. Implementation Notes for Claude Code

### 8.1 File Layout

```
/anton/tax/
  rules/
    se.yaml
    de.yaml
    fr.yaml
    ... (one file per jurisdiction)
  engine/
    cost_basis.rs       # implements AVERAGE, FIFO, HIFO, SPECIFIC_ID, SHARE_POOLING
    rate_application.rs # progressive vs flat, brackets
    holding_period.rs   # for jurisdictions with long-term relief
    loss_offset.rs
    reporting.rs        # per-jurisdiction output formats
  refs/
    FUTURECHAIN_TAX_RULES.md  # this document, canonical source
  tests/
    fixtures/           # sample transaction sets per jurisdiction
```

### 8.2 Build Order Recommendation

1. **Phase 1 — High confidence + high impact:** SE, DE, FR, IT, GB, US, ES, PT, NL, ZA, NG, JP, SG, AE, AU, CH
2. **Phase 2 — Medium confidence, secondary markets:** CY, MT, BE, IE, PL, CA, KR, IL, KE, BR
3. **Phase 3 — Low confidence, refer-out:** all remaining jurisdictions in this document
4. **Unsupported / refuse:** CN and any jurisdiction not listed at all

### 8.3 Refusal Pattern

For unsupported jurisdictions, Anton returns:

> Tax calculation for [JURISDICTION] is not currently supported in this version of Anton. Your transactions are still recorded and can be exported for use by a local tax adviser. We recommend consulting a qualified crypto tax specialist in [JURISDICTION] before filing.

Plus an exportable CSV of all transactions in the user's preferred format.

### 8.4 Test Coverage

Each activated jurisdiction must have:

- At least one round-trip test: buy → hold → spend → calculate → match expected output
- One long-hold test (where applicable): verify holding-period exemption triggers
- One loss-offset test: verify deductible percentage and offset scope
- One annual exemption test: verify de minimis correctly applied
- One DAC8/CARF export test: verify the structured output matches the regulator's required format

---

## 9. Review Protocol

### 9.1 Quarterly Re-verification

Every jurisdiction with `confidence: high` or `confidence: medium` must be re-verified every 90 days. The re-verification updates `last_verified` and `verification_source`.

### 9.2 Legislative Change Watch

For each jurisdiction, a watch list of triggers:

- Budget announcement dates
- Tax authority circular / position paper publications
- Major court rulings affecting crypto classification
- MiCA-related secondary legislation

Anton should subscribe to RSS / monitoring on the official sources listed in each jurisdiction block.

### 9.3 Sign-Off Required

Before any jurisdiction moves from `confidence: medium` to `confidence: high` (and is enabled for production use), the rules in that block must be reviewed by:

1. A qualified tax adviser licensed in the relevant jurisdiction
2. FutureChain compliance lead
3. Optionally, a private ruling / förhandsbesked / equivalent where the EMT-related questions are material

### 9.4 Change Log

| Date | Jurisdiction | Change | Reviewed by |
|---|---|---|---|
| 2026-05-12 | — | Initial draft | (pending) |

---

## 10. Open Questions for Legal Review

These are questions Anton cannot answer from this document and must surface for human/expert review:

1. **EMT classification of FTC** — If FTC is re-classified as MiCA EMT, what is the per-jurisdiction effect on user tax position? (Italy is clear; rest of EU is untested.)
2. **Refund-as-cancellation protocol** — Can a cryptographically tagged refund within a defined window be treated as a tax-event reversal in Sweden / Germany / UK / US?
3. **Agent-wallet tax flow** — Where a transaction is executed by Anton on behalf of a human, does the tax position flow to the human in all jurisdictions? Pursue förhandsbesked / private letter ruling.
4. **Merchant auto-swap treatment** — Is the millisecond FTC holding by a merchant in the swap flow a "disposal" for tax purposes, or a pass-through?
5. **Two-tier storage tax implications** — Does the off-chain PACS.008 message constitute a "record" sufficient for tax authority requirements in jurisdictions requiring transaction-level data?

---

## 11. Final Notes

This document is a **working draft** intended to guide implementation of Anton's tax calculation engine. Every figure, rate, and rule in it must be verified against current authority guidance in the relevant jurisdiction before it is used in production output to end users.

The matrix structure is designed to be parseable but the legal rules are not Anton's to interpret unilaterally. Where there is ambiguity, refer out. Where there is a private ruling opportunity worth taking, take it. The competitive moat of FutureChain is not avoiding tax — it is providing the highest-quality, most defensible, audit-trail-grade reporting infrastructure in the industry.

**End of document.**
