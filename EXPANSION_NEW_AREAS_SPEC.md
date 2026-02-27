# openEXPERT / ANTON — Expansion: New Areas & Modules Specification

> **Audience:** Claude Code
> **Purpose:** Detailed specification for every new area, every module within it, guided inputs, thinking levels, and cross-area links. This is the build list.
> **Companion files:** Read `EXPANSION_MASTER_SPEC.md` first for architecture context.

---

## TRACK A: NEW PROFESSIONAL AREAS

---

### A1. Tax & Transfer Pricing (NEW AREA)

**Why:** ~30M tax professionals globally. €2B+ consulting market. Currently ZERO coverage.

**Area ID:** `tax-transfer-pricing`
**Category:** Core Professional Services
**Model Tier:** sonnet (default), opus (complex international tax)
**Personas:** Tax Director, Transfer Pricing Specialist, International Tax Lawyer

**Modules (8):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Tax Compliance Health Check | Assess tax filing compliance status | think_hard | Entity type, jurisdictions, tax types |
| 2 | Transfer Pricing Documentation | Create TP documentation per OECD guidelines | investigate | Transaction types, related parties, methods |
| 3 | Tax Risk Assessment | Identify and score tax risks | think_hard | Business model, jurisdictions, transaction types |
| 4 | Tax Provision & Reporting | Corporate tax provision calculations and reporting | think | Reporting framework (IFRS/GAAP), jurisdictions |
| 5 | Cross-Border Transaction Advisor | Tax implications of cross-border transactions | investigate | Transaction type, source/destination countries |
| 6 | Tax Authority Audit Response | Prepare responses to tax authority inquiries | think_hard | Audit type, jurisdiction, issues raised |
| 7 | VAT/GST Compliance Review | Review indirect tax compliance | think | Business type, supply chain, jurisdictions |
| 8 | Tax Incentive & Relief Navigator | Identify available tax incentives | think | Industry, jurisdiction, investment type |

**Cross-area links:** Legal (tax disputes), Accounting (tax provision), Strategy (tax-efficient structuring), FCP (tax evasion as predicate offence)

---

### A2. Marketing & Digital Marketing (NEW AREA)

**Why:** ~15% of all knowledge workers. Universal business function. Zero coverage.

**Area ID:** `marketing`
**Category:** Business Operations
**Model Tier:** sonnet (default)
**Personas:** CMO, Digital Marketing Manager, Content Strategist

**Modules (8):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Marketing Strategy Builder | Create comprehensive marketing strategy | investigate | Business type, target audience, budget, goals |
| 2 | Digital Campaign Planner | Plan multi-channel digital campaigns | think_hard | Channels, budget, target audience, KPIs |
| 3 | SEO & Content Strategy | SEO audit and content planning | think | Website/domain, target keywords, competitors |
| 4 | Social Media Strategy | Social media presence strategy | think | Platforms, audience, brand voice, goals |
| 5 | Marketing Analytics & ROI | Analyse marketing performance and ROI | think_hard | Channels, metrics, budget, attribution model |
| 6 | Customer Journey Mapping | Map and optimise customer journeys | think | Business type, touchpoints, conversion goals |
| 7 | Email Marketing & Automation | Email campaign strategy and automation | think | List size, segments, goals, platform |
| 8 | Market Research & Competitive Analysis | Competitive landscape analysis | investigate | Industry, competitors, geographic scope |

**Cross-area links:** Branding (brand strategy), Sales (lead generation), Data (analytics), Strategy (go-to-market)

---

### A3. Sales & Business Development (NEW AREA)

**Why:** Universal business function. Every company needs sales.

**Area ID:** `sales`
**Category:** Business Operations
**Model Tier:** sonnet (default)
**Personas:** VP Sales, Business Development Manager, Account Executive

**Modules (6):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Sales Strategy & Pipeline Design | Build sales strategy and pipeline | think_hard | Business model, target market, deal size |
| 2 | Account Planning & Management | Strategic account plans | think | Account details, relationship history, objectives |
| 3 | Proposal & Pitch Builder | Create client proposals and pitches | think | Client needs, solution offered, budget range |
| 4 | Sales Enablement Content | Create sales collateral and battle cards | think | Product/service, competitors, objections |
| 5 | Negotiation Preparation | Prepare for sales negotiations | think_hard | Deal details, stakeholders, BATNA |
| 6 | CRM & Sales Process Optimization | Optimise sales processes and CRM usage | think | Current process, CRM platform, pain points |

---

### A4. Product Management (NEW AREA)

**Why:** Fastest-growing profession. Every tech company needs PMs. Zero coverage.

**Area ID:** `product-management`
**Category:** Business Operations
**Model Tier:** sonnet (default)
**Personas:** Head of Product, Product Manager, Product Owner

**Modules (6):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Product Strategy & Roadmap | Define product vision and roadmap | investigate | Product type, market, users, business goals |
| 2 | Feature Prioritisation Framework | Prioritise features using structured methods | think_hard | Feature backlog, constraints, scoring criteria |
| 3 | User Research & Persona Builder | Design research plans and user personas | think | Product type, target users, research questions |
| 4 | PRD & Requirements Writer | Write product requirements documents | think | Feature description, user stories, acceptance criteria |
| 5 | Product Analytics & Metrics | Define and analyse product metrics | think | Product type, lifecycle stage, current metrics |
| 6 | Go-to-Market Planning | Plan product launches and GTM strategy | think_hard | Product, market, channels, pricing |

---

### A5. Design (UX/UI/Service) (NEW AREA)

**Area ID:** `design`
**Category:** Business Operations
**Model Tier:** sonnet (default)
**Personas:** UX Director, UX Researcher, Service Designer

**Modules (5):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | UX Research Plan | Design user research methodology | think | Research goals, user types, methods, timeline |
| 2 | Usability Audit | Evaluate existing interface usability | think_hard | Product/URL, user tasks, accessibility requirements |
| 3 | Information Architecture | Design content structure and navigation | think | Content types, user tasks, site/app type |
| 4 | Service Design Blueprint | Map end-to-end service blueprints | investigate | Service type, touchpoints, stakeholders |
| 5 | Design System Foundation | Create foundational design system specs | think | Brand, platforms, component needs |

---

### A6. Data Privacy & Protection (NEW AREA)

**Why:** Dedicated DPOs required in every EU company. Growing globally. Distinct from Cyber.

**Area ID:** `data-privacy`
**Category:** Core Professional Services
**Model Tier:** sonnet (default), opus (complex cross-border transfers)
**Personas:** DPO, Privacy Counsel, Data Protection Consultant

**Modules (6):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | GDPR Compliance Assessment | Assess GDPR compliance maturity | investigate | Organisation type, data processing activities, jurisdictions |
| 2 | Data Protection Impact Assessment (DPIA) | Conduct DPIA for new processing | think_hard | Processing activity, data types, risks |
| 3 | Privacy Policy & Notice Drafter | Create privacy notices and policies | think | Organisation type, data collected, purposes |
| 4 | Data Subject Rights Handler | Manage DSR requests (access, deletion, etc.) | think | Request type, data systems, timeline |
| 5 | Cross-Border Data Transfer Assessment | Assess legality of international transfers | think_hard | Source/destination countries, transfer mechanisms |
| 6 | Data Breach Response Plan | Create and manage breach response plans | think_hard | Organisation type, data types, notification requirements |

---

### A7. Government & Public Administration (NEW AREA)

**Why:** ~30M government professionals globally. Huge untapped market.

**Area ID:** `government`
**Category:** Specialized Domains
**Model Tier:** sonnet (default)
**Personas:** Policy Analyst, Senior Civil Servant, Regulatory Officer

**Modules (6):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Policy Analysis & Brief Writer | Analyse policy options and write briefs | investigate | Policy area, stakeholders, constraints |
| 2 | Regulatory Impact Assessment | Assess impact of proposed regulations | think_hard | Proposed regulation, affected sectors, methodology |
| 3 | Public Consultation Response | Draft government consultation responses | think | Consultation topic, organisation position, key arguments |
| 4 | Grant Application Writer | Write government/NGO grant applications | think | Funding body, project description, budget |
| 5 | Stakeholder Engagement Plan | Plan public/stakeholder engagement | think | Policy area, stakeholder groups, channels |
| 6 | Government Digital Service Design | Design citizen-facing digital services | think | Service type, user needs, accessibility requirements |

---

## TRACK A (continued): DEEPEN EXISTING THIN AREAS

### A8. Cybersecurity Expansion (5→12 modules)

**Why:** DORA alone justifies. NIS2 mandatory. Currently dangerously thin.

**New modules to add (7):**

| # | Module | Purpose | Thinking |
|---|--------|---------|----------|
| 6 | DORA Compliance Assessment | EU Digital Operational Resilience Act gap analysis | investigate |
| 7 | NIS2 Compliance Assessment | Network and Information Security Directive compliance | investigate |
| 8 | Penetration Testing Scope & Plan | Define scope and methodology for pen tests | think_hard |
| 9 | Incident Response Plan Builder | Create/update incident response plans | think_hard |
| 10 | Third-Party / Supply Chain Security Assessment | Vendor security risk assessment | think |
| 11 | Security Awareness Training Content | Create phishing simulations and training | think |
| 12 | Cloud Security Architecture Review | Assess cloud security posture | think_hard |

---

### A9. Investment & Asset Management Expansion (4→10 modules)

**New modules to add (6):**

| # | Module | Purpose | Thinking |
|---|--------|---------|----------|
| 5 | Fund Due Diligence Report | Evaluate investment funds | investigate |
| 6 | Portfolio Risk Analytics | Analyse portfolio risk metrics (VaR, stress tests) | think_hard |
| 7 | ESG Investment Screening | Screen investments against ESG criteria | think |
| 8 | Investor Reporting & Factsheet | Create investor reports and fund factsheets | think |
| 9 | Regulatory Capital Assessment (Basel III/IV) | Calculate regulatory capital requirements | think_hard |
| 10 | Alternative Investment Due Diligence | Due diligence for PE/VC/Real Assets | investigate |

---

### A10. Client Consulting Expansion (5→10 modules)

**New modules to add (5):**

| # | Module | Purpose | Thinking |
|---|--------|---------|----------|
| 6 | Client Workshop Facilitator | Design and facilitate client workshops | think |
| 7 | Change Management Strategy | Create change management plans for client transformations | think_hard |
| 8 | Benchmarking & Best Practice Study | Conduct peer benchmarking analysis | investigate |
| 9 | Expert Testimony & Witness Prep | Prepare expert witness materials | investigate |
| 10 | Value Assessment & Benefits Tracker | Measure and report consulting engagement value | think |

---

### A11. Insurance & Actuarial Expansion (5→11 modules)

**New modules to add (6):**

| # | Module | Purpose | Thinking |
|---|--------|---------|----------|
| 6 | Solvency II Compliance Assessment | EU Solvency II regulatory assessment | investigate |
| 7 | IFRS 17 Implementation Guide | Insurance contract accounting standard | think_hard |
| 8 | Claims Analysis & Fraud Detection | Insurance claims pattern analysis | think_hard |
| 9 | Takaful Product Design | Sharia-compliant insurance products | think_hard |
| 10 | Takaful Regulatory Compliance | Islamic insurance regulatory framework | think |
| 11 | Reinsurance Program Review | Evaluate reinsurance arrangements | think_hard |

---

### A12. Healthcare & Life Sciences Expansion (5→12 modules)

**New modules to add (7):**

| # | Module | Purpose | Thinking |
|---|--------|---------|----------|
| 6 | Clinical Trial Design Advisor | Support clinical trial protocol design | investigate |
| 7 | Healthcare Regulatory Submission | Prepare regulatory submissions (FDA, EMA) | think_hard |
| 8 | Patient Safety & Quality Assessment | Assess patient safety programs | think_hard |
| 9 | Healthcare Data Governance | Health data privacy and governance | think |
| 10 | Pharmaceutical Market Access | Market access strategy for pharma products | investigate |
| 11 | Hospital Operations Optimisation | Operational efficiency assessment | think |
| 12 | Medical Device Compliance | CE marking, FDA 510(k), MDR compliance | think_hard |

---

### A13. Accounting & Finance Expansion (7→12 modules)

**New modules to add (5):**

| # | Module | Purpose | Thinking |
|---|--------|---------|----------|
| 8 | IFRS Transition Guide | Guide transition between accounting standards | think_hard |
| 9 | AAOIFI Standards Compliance | Islamic finance accounting (AAOIFI) | think_hard |
| 10 | Management Reporting & KPI Dashboard | Design management reporting frameworks | think |
| 11 | Internal Controls Assessment (SOX/J-SOX) | Evaluate internal controls over financial reporting | think_hard |
| 12 | Treasury & Cash Management | Treasury operations and cash flow management | think |

---

## TRACK B: REGIONAL / GLOBAL SOUTH AREAS

---

### B1. Islamic Finance & Banking (NEW AREA)

**Why:** $6 TRILLION industry. 85% of Saudi banking. ~40% of global banking in some of the world's wealthiest countries. CRITICAL GAP.

**Area ID:** `islamic-finance`
**Category:** Financial Inclusion
**Model Tier:** sonnet (default), opus (complex structuring)
**Personas:** Sharia Board Member, Islamic Finance Structurer, Sharia Compliance Officer

**Modules (10):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Sharia Compliance Assessment | Assess financial products/services for Sharia compliance | investigate | Product type, institution type, Sharia standard (AAOIFI/local) |
| 2 | Sukuk Structuring Guide | Structure Islamic bonds (sukuk) | think_hard | Sukuk type, amount, tenor, underlying assets |
| 3 | Islamic Product Review | Review Murabaha/Ijara/Musharakah/Tawarruq products | think_hard | Product type, counterparties, pricing mechanism |
| 4 | Sharia Board Governance Framework | Establish/review Sharia governance | think | Institution type, regulatory jurisdiction, board structure |
| 5 | Islamic Window Assessment | Assess conventional bank's Islamic window operations | investigate | Bank type, Islamic product range, governance |
| 6 | Waqf Asset Management | Manage Islamic endowment assets | think | Asset type, waqf purpose, beneficiaries |
| 7 | Zakat Compliance & Calculation | Calculate and manage zakat obligations | think | Entity type, asset types, jurisdiction |
| 8 | Islamic Treasury & Liquidity Management | Sharia-compliant treasury operations | think_hard | Institution type, liquidity instruments, Sharia constraints |
| 9 | Profit-Rate Benchmark Transition | Transition from IBOR to RFR for Islamic products | think_hard | Product types, current benchmark, Sharia board requirements |
| 10 | Green & Sustainable Sukuk Framework | Structure ESG-compliant sukuk | investigate | ESG criteria, underlying assets, use of proceeds |

**Cross-area links:** Banking (product structuring), Accounting (AAOIFI standards), Legal (Islamic contracts), FCP (Islamic finance AML), Insurance (Takaful), ESG (sustainable sukuk)

**Critical skills to attach:** AAOIFI Standards, IFSB Standards, SAMA Regulations, CBUAE Sharia Compliance

---

### B2. Mobile Money & Digital Finance (NEW AREA)

**Why:** 1.75B+ registered mobile money accounts. This IS the financial system for 1B+ people.

**Area ID:** `mobile-money`
**Category:** Financial Inclusion
**Model Tier:** sonnet (default)
**Personas:** Mobile Money Compliance Officer, Fintech Regulatory Navigator, Digital Finance Specialist

**Modules (7):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | Mobile Money Compliance Framework | Compliance framework for mobile money operators | investigate | Operator type, jurisdiction, services offered |
| 2 | E-Money Issuer Licensing Guide | Guide EMI licence application process | think_hard | Jurisdiction, business model, capital requirements |
| 3 | Agent Banking Oversight | Agent network due diligence and oversight | think | Agent network size, jurisdiction, services |
| 4 | Mobile Money AML/CFT | AML compliance for mobile money transactions | think_hard | Transaction types, volumes, risk indicators |
| 5 | Digital Lending Compliance | Regulatory compliance for digital credit products | think | Product type, jurisdiction, interest/fee structure |
| 6 | Fintech Regulatory Sandbox Application | Apply for regulatory sandbox programs | think | Innovation type, jurisdiction, sandbox program |
| 7 | Cross-Border Mobile Payments | Compliance for cross-border mobile transfers | think_hard | Corridors, currencies, regulatory frameworks |

---

### B3. Microfinance & Financial Inclusion (NEW AREA)

**Why:** 140M+ borrowers globally. Separate regulatory frameworks. Different expertise from commercial banking.

**Area ID:** `microfinance`
**Category:** Financial Inclusion
**Model Tier:** sonnet (default)
**Personas:** MFI Operations Director, Microfinance Risk Manager, Financial Inclusion Specialist

**Modules (6):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 1 | MFI Regulatory Compliance | Microfinance institution regulatory assessment | think | Institution type, jurisdiction, licence type |
| 2 | Group Lending Risk Assessment | Evaluate group/solidarity lending portfolios | think_hard | Portfolio size, group structure, geographic spread |
| 3 | Microfinance Credit Scoring | Develop/review credit scoring for micro-borrowers | think_hard | Data availability, borrower type, loan products |
| 4 | Financial Inclusion Strategy | Design financial inclusion programs | investigate | Target population, geographic scope, existing infrastructure |
| 5 | Social Performance Reporting | Measure and report social impact | think | Reporting framework (SPI4, USSPM), indicator set |
| 6 | Islamic Microfinance (Qard Hasan) Framework | Design Sharia-compliant microfinance programs | think | Product type, Sharia requirements, target beneficiaries |

---

### B4. FCP Expansion — Regional Module Packs

**Add to existing FCP area (Area 1):**

| # | Module | Purpose | Thinking | Key Guided Inputs |
|---|--------|---------|----------|-------------------|
| 24 | Hawala/IVTS Risk Assessment | Assess informal value transfer system risks | think_hard | Corridors, customer base, indicators |
| 25 | IVTS Detection & Investigation Guide | Investigate suspected hawala/IVTS activity | investigate | Case details, transaction patterns, geography |
| 26 | Informal Remittance Corridor Analysis | Analyse ML/TF risks in remittance corridors | think_hard | Sending/receiving countries, volumes, actors |
| 27 | Trade-Based Money Laundering Assessment | Assess TBML risks in trade finance | investigate | Trade corridors, commodities, documentation |
| 28 | Trade Finance Due Diligence | Due diligence on trade finance transactions | think_hard | Transaction type, counterparties, documentation |
| 29 | Cash-Intensive Business Risk Assessment | AML risk assessment for cash-heavy businesses | think_hard | Business type, cash ratios, jurisdiction |
| 30 | Remittance Compliance Framework | Compliance framework for MSBs/remittance companies | think | Service type, corridors, jurisdiction |
| 31 | Correspondent Banking Due Diligence | Assess correspondent banking relationships (developing country perspective) | investigate | Correspondent, respondent, corridor, risk factors |
| 32 | De-risking Impact Assessment | Assess impact of correspondent banking de-risking | think_hard | Affected corridors, alternative channels, financial inclusion impact |

**This brings FCP from 23→32 modules — cementing it as by far the deepest area globally.**

---

## TRACK C: BOTTOM-OF-PYRAMID AREAS

**General notes for all BoP areas:**
- Model tier: `haiku` recommended, `ollama-local` minimum
- Prompts must be simple, short, actionable
- Guided inputs: maximum 5 fields, prefer `select` over `text`
- All modules must include `jurisdiction` guided input
- Outputs under 300 words default
- Include "seek professional help when..." guidance
- Voice-friendly (TTS-readable)

---

### C1. Smallholder Farming Expert (NEW AREA)

**Area ID:** `smallholder-farming`
**Category:** Farming & Agriculture
**Model Tier:** haiku / ollama-local
**Personas:** Agricultural Extension Worker, Smallholder Farmer (experienced)
**Target users:** Smallholder farmers (<5 hectares) in Africa, South Asia, Southeast Asia
**Est. users:** 600M+ farming families

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Crop Planning & Rotation Advisor | What to plant this season | Region, soil type, previous crop, available water |
| 2 | Pest & Disease Identification Guide | Identify and treat crop problems | Crop type, symptoms, region (image input future) |
| 3 | Soil Health Assessment | Simple soil health guidance | Soil colour/texture, region, crop history |
| 4 | Water Management & Irrigation | Irrigation planning and water conservation | Water source, crop type, climate zone |
| 5 | Post-Harvest Loss Prevention | Storage and handling to prevent losses | Crop type, storage available, climate |
| 6 | Market Price Checker & Negotiation Guide | Get fair prices for produce | Crop, local market, quantity |
| 7 | Weather-Based Farming Decisions | Interpret weather for farming decisions | Location, crop stage, forecast |
| 8 | Government Subsidy Navigator | Find available farming subsidies/support | Country, farm size, crop type |

---

### C2. Livestock & Poultry Expert (NEW AREA)

**Area ID:** `livestock-poultry`
**Category:** Farming & Agriculture
**Model Tier:** haiku / ollama-local
**Target users:** Small-scale livestock keepers, poultry farmers, pastoralists

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Animal Health & Disease Guide | Identify symptoms, first response | Animal type, symptoms, region |
| 2 | Feeding & Nutrition Planner | Optimal feeding plans | Animal type, available feed, budget |
| 3 | Breeding & Herd Management | Breeding selection, herd records | Animal type, herd size, goals |
| 4 | Poultry Business Starter Kit | Start a poultry business | Budget, location, market |
| 5 | Dairy Production Optimizer | Improve milk yield | Breed, current yield, feeding |
| 6 | Veterinary Emergency First-Response | Urgent animal health guidance | Animal type, emergency type |
| 7 | Livestock Market Timing & Pricing | When and where to sell | Animal type, local market, season |
| 8 | Grazing & Pasture Management | Pasture rotation and management | Land size, animal count, climate |

---

### C3. Micro-Business Expert (NEW AREA)

**Area ID:** `micro-business`
**Category:** Small Business & Enterprise
**Model Tier:** haiku / ollama-local
**Target users:** Street vendors, market traders, kiosk owners, small shop keepers, tailors, mechanics
**Est. users:** 400M+ micro-businesses globally

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Simple Bookkeeping & Record Keeping | Track income and expenses | Business type, country |
| 2 | Pricing & Profit Calculator | Calculate true profit on products | Product type, costs, competition |
| 3 | Business Registration & Licensing Guide | How to register a business | Country, business type, location |
| 4 | Tax Compliance Simplified | Tax obligations in plain language | Country, business type, revenue range |
| 5 | Supplier Negotiation Helper | Get better deals from suppliers | Product type, current supplier, volume |
| 6 | Customer Relationship Basics | Build repeat customers | Business type, customer challenges |
| 7 | Inventory Management | Track stock, reduce waste | Business type, product types |
| 8 | Business Growth & Scaling Guide | When and how to expand | Current size, revenue, growth goal |

---

### C4. Personal Finance & Savings Expert (NEW AREA — BoP)

**Area ID:** `personal-finance-bop`
**Category:** Financial Inclusion
**Model Tier:** haiku / ollama-local
**Target users:** Low-income workers, informal economy participants, first-time bankers
**Est. users:** 2B+ underbanked population

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Budget Builder | Track income vs expenses | Income source(s), country |
| 2 | Savings Goal Planner | Set and track savings goals | Goal, timeline, current savings |
| 3 | Mobile Money Safety Guide | Protect mobile money accounts | Platform (M-Pesa, MTN, etc.), country |
| 4 | Debt Trap Warning System | Evaluate if a loan is safe | Loan terms, interest rate, income |
| 5 | Remittance Cost Comparison | Find cheapest way to send money | Sending/receiving country, amount |
| 6 | Micro-Insurance Guide | Understand and choose basic insurance | Country, risk type, budget |
| 7 | Zakat/Tithe Calculator | Calculate religious giving obligations | Country, asset types, faith tradition |
| 8 | Pension & Retirement Basics | Plan for old age on limited income | Country, age, income type |

---

### C5. Credit & Loan Navigator (NEW AREA — BoP)

**Area ID:** `credit-navigator`
**Category:** Financial Inclusion
**Model Tier:** haiku / ollama-local

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Loan Comparison Tool | Compare loan options honestly | Loan amounts, interest rates, terms |
| 2 | Microfinance Application Helper | Prepare microfinance applications | MFI name, loan purpose, country |
| 3 | Group Lending Guide | Understand group lending obligations | Group type, MFI, country |
| 4 | Collateral & Security Explainer | Understand what you're pledging | Collateral type, loan terms |
| 5 | Loan Default — Know Your Rights | What happens if you can't pay | Country, loan type, lender type |
| 6 | Business Plan for Loan Application | Simple business plan template | Business type, loan amount needed |
| 7 | Credit Score Builder | How to build creditworthiness | Country, current financial products |
| 8 | Predatory Lending Red Flag Checker | Identify dangerous loans | Loan terms, lender details |

---

### C6. Workers' Rights Expert (NEW AREA — BoP)

**Area ID:** `workers-rights`
**Category:** Rights & Governance
**Model Tier:** haiku (default), sonnet (complex legal)
**Target users:** Informal workers, domestic workers, factory workers, migrant workers, gig workers
**Est. users:** 1B+ informal workers

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Employment Rights Checker | Know your workplace rights | Country, employment type, issue |
| 2 | Minimum Wage Calculator | What you should be paid | Country, region, sector |
| 3 | Workplace Safety Know-Your-Rights | Safety standards and protections | Country, industry, hazard type |
| 4 | Wrongful Dismissal Response | Steps when unfairly fired | Country, employment type, circumstances |
| 5 | Migrant Worker Rights | Rights for foreign workers (incl. kafala) | Host country, origin country, work type |
| 6 | Domestic Worker Protection | Rights for household workers | Country, live-in/out, employer type |
| 7 | Gig Economy Worker Rights | Rights for platform/gig workers | Country, platform type, issue |
| 8 | Union & Collective Bargaining Basics | How unions work and your rights | Country, industry, current status |

---

### C7. Land & Property Rights Expert (NEW AREA — BoP)

**Area ID:** `land-rights`
**Category:** Rights & Governance
**Model Tier:** haiku (default), sonnet (complex disputes)

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Land Title Verification Guide | Check if land has clear title | Country, title type, location |
| 2 | Inheritance Rights Advisor | Understand inheritance laws (incl. Islamic/customary) | Country, faith/custom, family situation |
| 3 | Land Grab & Forced Eviction Response | What to do if land is being taken | Country, who is taking land, documentation |
| 4 | Boundary Dispute Resolution | Resolve neighbour boundary disputes | Country, dispute type, evidence |
| 5 | Women's Land Rights Advisor | Specific rights for women regarding land | Country, situation (widow/divorced/unmarried) |
| 6 | Community Land Registration | Register communal/ancestral land | Country, community type, land use |
| 7 | Tenant Rights & Fair Rent | Know your rights as a renter | Country, rental type, issue |
| 8 | Government Land Scheme Navigator | Find government land allocation programs | Country, eligibility, land use |

---

### C8. Artisan & Craft Business Expert (NEW AREA — BoP)

**Area ID:** `artisan-craft`
**Category:** Small Business & Enterprise
**Model Tier:** haiku / sonnet

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Product Costing & Pricing | Calculate true cost including time | Craft type, materials, time spent |
| 2 | Market Access & E-commerce Setup | Sell crafts online | Craft type, target market, digital skills |
| 3 | Quality Standards for Export | Meet export quality requirements | Product type, destination market |
| 4 | Branding & Storytelling for Artisans | Create compelling brand story | Craft tradition, materials, origin story |
| 5 | Cooperative Formation Guide | Form artisan cooperatives | Country, craft type, number of artisans |
| 6 | Fair Trade & Certification Navigator | Get fair trade certified | Product type, certification body |
| 7 | Packaging & Shipping Basics | Pack and ship products safely | Product type, destination, fragility |
| 8 | IP for Traditional Crafts | Protect traditional designs | Country, craft type, IP concern |

---

### C9. Food & Restaurant Micro-Business Expert (NEW AREA — BoP)

**Area ID:** `food-business`
**Category:** Small Business & Enterprise
**Model Tier:** haiku / ollama-local

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Food Safety & Hygiene Compliance | Basic food safety rules | Country, food type, business type |
| 2 | Menu Pricing & Cost Control | Price dishes for profit | Dish types, ingredient costs, competition |
| 3 | Food Licensing & Health Permits | Get food business permits | Country, business type, location |
| 4 | Bulk Buying & Supply Chain | Source ingredients efficiently | Business size, ingredient types |
| 5 | Waste Reduction & Portion Control | Minimise food waste | Business type, waste types |
| 6 | Catering Business Expansion | Scale to events/catering | Current business, target events |
| 7 | Food Preservation & Storage | Preserve food safely | Food type, available equipment, climate |
| 8 | Halal/Kosher/Dietary Compliance | Meet dietary requirements | Dietary standard, food types, certification |

---

### C10. Consumer Protection Expert (NEW AREA — BoP)

**Area ID:** `consumer-protection`
**Category:** Rights & Governance
**Model Tier:** haiku / ollama-local

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Product Quality Complaint Helper | Complain about defective products | Country, product type, seller type |
| 2 | Scam & Fraud Warning System | Identify and respond to scams | Country, scam type, amount lost |
| 3 | Mobile Money Dispute Resolution | Resolve mobile money problems | Country, provider, issue type |
| 4 | Government Service Complaint | Complain about government services | Country, service type, issue |
| 5 | Banking Rights & Fee Transparency | Understand bank fees and your rights | Country, bank type, issue |
| 6 | Utility Bill Dispute Helper | Challenge incorrect utility bills | Country, utility type, issue |
| 7 | Consumer Court/Tribunal Guide | Navigate consumer justice system | Country, claim type, amount |
| 8 | Digital Privacy & Data Rights | Protect personal data online | Country, platform type, concern |

---

### C11. Community Health Expert (NEW AREA — BoP)

**Area ID:** `community-health`
**Category:** Community Services
**Model Tier:** haiku / ollama-local
**SAFETY: All modules must include "seek professional medical help" referral. Never diagnose. Never prescribe.**

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Symptom Checker & Referral Guide | Assess urgency, direct to care | Symptoms, age, duration, country |
| 2 | Maternal & Child Health Advisor | Pregnancy and infant care guidance | Stage of pregnancy/child age, concern |
| 3 | Vaccination Schedule & Tracker | Know which vaccines when | Country, child age |
| 4 | Nutrition & Feeding Guide | Age-appropriate nutrition advice | Age, available foods, concerns |
| 5 | WASH Advisor | Water, sanitation, hygiene guidance | Water source, sanitation type, issue |
| 6 | Disease Prevention & First Aid | Basic prevention and first response | Condition type, available resources |
| 7 | Mental Health Awareness & Referral | Recognise signs, find help | Country, concern type |
| 8 | Medicine Dosage & Safety Guide | Understand medication instructions | Medicine name, patient age/weight |

---

### C12. Education & Literacy Expert (NEW AREA — BoP)

**Area ID:** `education-literacy`
**Category:** Community Services
**Model Tier:** haiku / ollama-local

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Adult Literacy Tutor | Practice reading and writing | Language, current level |
| 2 | Numeracy & Basic Maths Helper | Learn practical maths | Current level, use case (business/daily life) |
| 3 | Children's Homework Helper | Help children with schoolwork | Subject, grade level, topic |
| 4 | Scholarship & Funding Finder | Find education funding | Country, education level, field |
| 5 | Skills Training Navigator | Find vocational training | Country, desired skill, location |
| 6 | Digital Literacy Basics | Learn to use technology | Device type, current skill level |
| 7 | Language Learning Helper | Learn a new language | Target language, current level, purpose |
| 8 | Exam Preparation Guide | Prepare for important exams | Exam type, subject, timeline |

---

### C13. Government Services Navigator (NEW AREA — BoP)

**Area ID:** `government-services`
**Category:** Rights & Governance
**Model Tier:** haiku / ollama-local

**Modules (8):**

| # | Module | Purpose | Guided Inputs |
|---|--------|---------|---------------|
| 1 | Document & ID Application Helper | Get birth certificates, IDs, passports | Country, document type, situation |
| 2 | Government Subsidy Finder | Find available social programs | Country, family situation, income level |
| 3 | Permit & License Application Guide | Apply for permits/licences | Country, permit type, business type |
| 4 | Complaint Against Government Official | Report official misconduct | Country, complaint type, evidence |
| 5 | Voting Rights & Process Guide | How to register and vote | Country, situation |
| 6 | Social Protection Navigator | Access social safety nets | Country, need type, eligibility |
| 7 | Court Process Demystifier | Understand legal processes | Country, case type, your role |
| 8 | Corruption Reporting Guide | Where and how to report corruption | Country, corruption type, evidence |

---

## Summary Count

| Track | New Areas | New Modules | Deepened Areas | Added Modules |
|-------|-----------|-------------|----------------|---------------|
| A: Professional | 7 | 45 | 5 | 30 |
| B: Regional | 3 + FCP expansion | 32 | — | — |
| C: BoP | 13 | 104 | — | — |
| **TOTAL** | **23 new areas** | **211 new modules** | **5 deepened** | **30 added** |

**Grand total after expansion: ~64 areas, ~479 modules**
