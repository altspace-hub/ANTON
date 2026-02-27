# openEXPERT / ANTON — Expansion: Skills & Personas Specification

> **Audience:** Claude Code
> **Purpose:** Complete specification for all new skills (especially jurisdictional) and all new personas needed for the three expansion tracks.
> **Companion files:** Read `EXPANSION_MASTER_SPEC.md` and `EXPANSION_NEW_AREAS_SPEC.md` first.

---

## PART 1: NEW JURISDICTIONAL SKILLS

Jurisdictional skills are the highest-ROI addition — one skill enhances ALL modules across multiple areas. A single "India — RBI" skill makes FCP, Banking, Islamic Finance, Mobile Money, and Microfinance modules all jurisdiction-aware for India.

### Implementation Pattern

Every jurisdictional skill follows this structure:

```
/skills/jurisdiction-{country-code}-{regulator}/
  skill.json           — Metadata, applicable areas, tags
  skill-content.md     — Regulatory knowledge
```

**skill.json format:**
```json
{
  "id": "jurisdiction-{country-code}-{regulator}",
  "label": "{Country} — {Regulator Full Name} ({Abbreviation})",
  "category": "jurisdiction",
  "applicableAreas": ["fcp", "banking", "islamic-finance", "mobile-money", "microfinance", "tax-transfer-pricing"],
  "description": "...",
  "tags": ["{country}", "{region}", "{regulator-abbrev}"]
}
```

**skill-content.md must include these sections:**
1. Regulatory Authority — name, mandate, independence, key divisions
2. Key Regulations — list with names, dates, and core requirements
3. Licensing/Registration Requirements — entity types, capital requirements, application process
4. AML/CFT Framework — reporting obligations, thresholds, FIU details
5. Consumer Protection — key rules, complaint mechanisms
6. Digital/Fintech Regulation — mobile money, e-money, sandbox programs
7. Key Terminology — jurisdiction-specific terms that differ from EU/US usage
8. Useful References — official URLs, key publications

---

### Skill 1: India — Reserve Bank of India (RBI)

**ID:** `jurisdiction-in-rbi`
**Applicable areas:** fcp, banking, mobile-money, microfinance, tax-transfer-pricing, insurance
**Tags:** india, rbi, south-asia, developing-economy

**Content outline for skill-content.md:**

**Regulatory Authority:** Reserve Bank of India (RBI). Established 1934. Regulates banks, NBFCs, payment systems, and microfinance. SEBI regulates securities. IRDAI regulates insurance. PFRDA regulates pensions.

**Key Regulations:**
- Prevention of Money Laundering Act (PMLA) 2002 — India's primary AML law
- Foreign Exchange Management Act (FEMA) 1999 — cross-border transactions
- Banking Regulation Act 1949 — banking licensing and supervision
- Payment and Settlement Systems Act 2007 — digital payments, UPI
- RBI Master Direction on KYC 2016 (updated regularly)
- RBI Master Direction on Digital Payment Security Controls 2021
- NBFC regulations (various master directions)
- Microfinance Institutions (Direction) 2022

**AML/CFT Framework:**
- FIU-IND (Financial Intelligence Unit — India) — reporting authority
- CTR threshold: ₹10 lakh (~$12,000) cash, ₹50 lakh (~$60,000) wire
- STR: No threshold — suspicion-based
- KYC: Aadhaar-based e-KYC, Video KYC, simplified KYC for low-value accounts
- Politically Exposed Persons: Enhanced due diligence required

**Digital/Fintech:**
- UPI (Unified Payments Interface) — national payment system
- NPCI (National Payments Corporation of India) — operates UPI, RuPay, IMPS
- RBI Regulatory Sandbox — fintech testing framework
- Prepaid Payment Instruments (PPIs) — mobile wallets regulation
- Account Aggregator Framework — open banking equivalent

**Key Terminology:**
- "Scheduled Commercial Bank" — fully licensed bank
- "NBFC" — Non-Banking Financial Company (large sector, different rules)
- "Small Finance Bank" — financial inclusion-focused bank
- "Payments Bank" — deposit-only, no lending
- "White-label ATM" — non-bank ATM operator
- "Jan Dhan" — government financial inclusion program
- "Aadhaar" — national biometric ID (1.3B+ enrolled)

---

### Skill 2: Saudi Arabia — Saudi Central Bank (SAMA)

**ID:** `jurisdiction-sa-sama`
**Applicable areas:** fcp, banking, islamic-finance, insurance, mobile-money
**Tags:** saudi-arabia, sama, gcc, middle-east, islamic-finance

**Content outline:**

**Regulatory Authority:** Saudi Central Bank (SAMA, formerly Saudi Arabian Monetary Agency). Regulates banks, insurance (including cooperative/Takaful), payment systems. CMA (Capital Market Authority) regulates securities.

**Key Regulations:**
- Anti-Money Laundering Law (Royal Decree M/31, 2012) + implementing regulations
- Counter-Terrorism Financing Law
- SAMA AML/CFT Rules and Regulations
- Banking Control Law
- Cooperative Insurance Companies Control Law
- Fintech Regulatory Sandbox Framework
- SAMA Rules on E-Wallets and Payments

**Critical: Islamic Finance:**
- ~85% of Saudi banking is Sharia-compliant
- All banks must have Sharia boards
- SAMA oversees Sharia governance
- Products: Murabaha (dominant), Ijara, Musharakah, Tawarruq
- Insurance = Cooperative Insurance (Takaful model)
- Sukuk market: Saudi Arabia is world's largest issuer

**AML/CFT:**
- SAFIU (Saudi Arabia Financial Intelligence Unit) — reporting authority
- Saudi Arabia is FATF member
- STR reporting: mandatory, no threshold
- CTR: SAR 50,000+ (~$13,000)
- CDD: National ID (Saudi) or Iqama (residents), biometric verification
- PEP: Enhanced monitoring required
- Sanctions: UN sanctions + local sanctions lists

**Key Terminology:**
- "Cooperative Insurance" — Takaful (Sharia-compliant insurance)
- "Murabaha" — cost-plus financing (most common Islamic product)
- "Iqama" — residency permit for expatriates
- "Kafala" — sponsorship system for foreign workers
- "Sadad" — national electronic bill payment system
- "mada" — national debit card network

---

### Skill 3: Nigeria — Central Bank of Nigeria (CBN)

**ID:** `jurisdiction-ng-cbn`
**Applicable areas:** fcp, banking, mobile-money, microfinance
**Tags:** nigeria, cbn, west-africa, developing-economy

**Content outline:**

**Key Regulations:**
- Money Laundering (Prevention and Prohibition) Act 2022
- CBN AML/CFT Regulations 2013 (updated)
- Banks and Other Financial Institutions Act (BOFIA) 2020
- CBN Regulatory Framework for Mobile Money Services
- CBN Guidelines on Microfinance Banks
- National Financial Inclusion Strategy

**AML/CFT:**
- NFIU (Nigerian Financial Intelligence Unit) — independent since 2018
- STR: mandatory, no threshold
- CTR: ₦5 million (~$3,300) for individuals, ₦10 million for corporates
- BVN (Bank Verification Number) — national biometric banking ID
- NIN (National Identification Number) — national ID

**Digital/Fintech:**
- eNaira — CBDC (Central Bank Digital Currency)
- PSB (Payment Service Banks) — e.g., MTN MoMo PSB, Airtel Money
- Super Agent licensing — agent banking
- Open Banking Framework
- Fintech Regulatory Sandbox

---

### Skill 4: Pakistan — State Bank of Pakistan (SBP)

**ID:** `jurisdiction-pk-sbp`
**Applicable areas:** fcp, banking, islamic-finance, mobile-money, microfinance
**Tags:** pakistan, sbp, south-asia, islamic-finance

**Content outline:**

**Key Regulations:**
- Anti-Money Laundering Act 2010 (amended 2020)
- SBP AML/CFT Regulations for Banks
- Islamic Banking Policy of SBP — full Islamic banking framework
- Branchless Banking Regulations (mobile money)
- Microfinance Institutions Ordinance 2001
- Zakat and Ushr Ordinance 1980 — banks AUTO-DEDUCT 2.5% zakat from accounts

**Critical: Islamic Banking:**
- ~20% of banking assets (rapidly growing)
- Full Islamic banks + Islamic windows
- SBP Sharia Board at central bank level
- Sukuk market: active government and corporate
- Meezan Bank: largest Islamic bank

**Critical: Zakat:**
- Mandatory state-administered zakat (2.5% of eligible assets)
- Banks deduct automatically on 1st Ramadan each year
- Exemptions require Sharia court declaration
- Separate from voluntary zakat (sadaqah)

**Digital/Fintech:**
- JazzCash, Easypaisa — dominant mobile money platforms
- Raast — national instant payment system (Pakistan's UPI equivalent)
- 1LINK — ATM and payment switch
- Digital bank licensing framework (2022)

---

### Skill 5: UAE — Central Bank of UAE (CBUAE)

**ID:** `jurisdiction-ae-cbuae`
**Applicable areas:** fcp, banking, islamic-finance, mobile-money, insurance
**Tags:** uae, cbuae, gcc, middle-east, free-zones

**Content outline:**

**Key Regulations:**
- Federal Decree-Law No. 20/2018 on AML/CFT
- CBUAE AML/CFT Guidelines
- CBUAE Consumer Protection Regulation
- Designated Non-Financial Business and Professions (DNFBP) framework
- Free zone regulations (DIFC, ADGM have separate regulators)

**Critical: Free Zones:**
- DIFC (Dubai International Financial Centre) — regulated by DFSA
- ADGM (Abu Dhabi Global Market) — regulated by FSRA
- These are SEPARATE jurisdictions with different rules
- Companies can be onshore (CBUAE) or free zone (DFSA/FSRA)

**AML/CFT:**
- UAE FIU (goAML system)
- STR/SAR: mandatory
- CTR: AED 55,000+ (~$15,000)
- Beneficial ownership: Central Registry (since 2021)
- UAE is on FATF grey list monitoring (status may change — verify with web search)
- Enhanced CDD for UAE free zone entities
- Hawala providers: must be licensed by CBUAE

---

### Skill 6: Kenya — Central Bank of Kenya (CBK)

**ID:** `jurisdiction-ke-cbk`
**Applicable areas:** fcp, banking, mobile-money, microfinance
**Tags:** kenya, cbk, east-africa, mobile-money-leader

**Content outline:**

**Critical: Mobile Money:**
- M-Pesa: 98% financial inclusion rate
- CBK National Payment System Regulations
- Mobile Money Trust Account regulations
- Agent banking framework
- Kenya is GLOBAL LEADER in mobile money

**Key Regulations:**
- Proceeds of Crime and Anti-Money Laundering Act 2009 (POCAMLA)
- CBK Prudential Guidelines
- Microfinance Act 2006
- Kenya Information and Communications Act (ICT licensing)
- National Payment System Act 2011

---

### Skill 7: Ghana — Bank of Ghana (BoG)

**ID:** `jurisdiction-gh-bog`
**Applicable areas:** fcp, banking, mobile-money, microfinance
**Tags:** ghana, bog, west-africa

**Content outline:**

**Key items:**
- Anti-Money Laundering Act 2020 (Act 1044)
- FIC (Financial Intelligence Centre)
- Mobile Money Interoperability system (GhIPSS)
- Bank of Ghana Fintech Regulatory Sandbox
- Mobile Money dominates (MTN MoMo market leader)
- Ghana Reference Rate for banking

---

### Skill 8: Malaysia — Bank Negara Malaysia (BNM)

**ID:** `jurisdiction-my-bnm`
**Applicable areas:** fcp, banking, islamic-finance, insurance, mobile-money
**Tags:** malaysia, bnm, southeast-asia, islamic-finance

**Content outline:**

**Critical: Islamic Finance:**
- Malaysia is global centre for Islamic finance
- Islamic Financial Services Act 2013 (IFSA) — separate from conventional banking act
- Sharia Advisory Council of BNM — highest Sharia authority
- Sharia Governance Policy Document
- Malaysia has the most developed Islamic capital market globally
- Bursa Malaysia Suq Al-Sila — commodity Murabaha platform

**Key Regulations:**
- Anti-Money Laundering, Anti-Terrorism Financing and Proceeds of Unlawful Activities Act 2001 (AMLA)
- Financial Services Act 2013 (FSA) — conventional
- Islamic Financial Services Act 2013 (IFSA) — Islamic
- Development Financial Institutions Act 2002
- BNM e-KYC Policy Document
- Digital Bank Licensing Framework

---

### Skill 9: Singapore — Monetary Authority of Singapore (MAS)

**ID:** `jurisdiction-sg-mas`
**Applicable areas:** fcp, banking, investment, insurance, mobile-money
**Tags:** singapore, mas, southeast-asia, financial-hub

**Content outline:**
- Corruption, Drug Trafficking and Other Serious Crimes (Confiscation of Benefits) Act (CDSA)
- MAS Notice on Prevention of Money Laundering and Countering the Financing of Terrorism
- Payment Services Act 2019 (PS Act) — covers digital payments, crypto
- MAS Regulatory Sandbox
- Singapore is Asia's #2 financial hub after Hong Kong
- Strong fintech ecosystem

---

### Skill 10: Hong Kong — Hong Kong Monetary Authority (HKMA)

**ID:** `jurisdiction-hk-hkma`
**Applicable areas:** fcp, banking, investment
**Tags:** hong-kong, hkma, east-asia, financial-hub

**Content outline:**
- Anti-Money Laundering and Counter-Terrorist Financing Ordinance (AMLO)
- HKMA AML/CFT Guidance for Authorized Institutions
- Banking Ordinance
- Virtual Banks licensing
- Stored Value Facility licensing
- Faster Payment System (FPS)

---

### Skill 11: Philippines — Bangko Sentral ng Pilipinas (BSP)

**ID:** `jurisdiction-ph-bsp`
**Applicable areas:** fcp, banking, mobile-money, microfinance
**Tags:** philippines, bsp, southeast-asia, remittance-corridor

**Content outline:**
- Anti-Money Laundering Act (AMLA) as amended by RA 11521
- AMLC (Anti-Money Laundering Council) — FIU
- BSP Circular on Electronic Money (E-Money)
- Digital Banks licensing framework
- GCash and Maya (PayMaya) dominate digital payments
- Major remittance RECEIVING country ($37B+ annually)
- OFW (Overseas Filipino Worker) remittance regulations

---

## PART 2: THEMATIC SKILLS (Non-Jurisdictional)

These skills provide domain knowledge attachable to multiple areas.

### Skill 12: AAOIFI Accounting Standards

**ID:** `skill-aaoifi-standards`
**Applicable areas:** islamic-finance, accounting, audit
**Content:** AAOIFI Financial Accounting Standards (FAS), Sharia Standards (SS), Governance Standards (GSIFI), Auditing Standards. Key differences from IFRS. Murabaha accounting, Sukuk accounting, Ijara accounting, Takaful accounting.

### Skill 13: IFSB Standards

**ID:** `skill-ifsb-standards`
**Applicable areas:** islamic-finance, banking, risk-management
**Content:** Islamic Financial Services Board prudential standards. Capital adequacy for Islamic banks. Risk management for Islamic finance. Sharia governance standards. Liquidity management.

### Skill 14: FATF Mutual Evaluation Methodology

**ID:** `skill-fatf-mutual-evaluation`
**Applicable areas:** fcp, banking, government
**Content:** FATF 40 Recommendations assessment methodology. Immediate Outcomes. Technical Compliance. How mutual evaluations work. How to prepare. Common deficiency areas for developing countries.

### Skill 15: Mobile Money AML/CFT (GSMA Guidelines)

**ID:** `skill-gsma-mobile-money-aml`
**Applicable areas:** fcp, mobile-money, microfinance
**Content:** GSMA Mobile Money Compliance Guidelines. Tiered KYC for mobile money. Agent due diligence. Transaction monitoring for mobile money. SIM registration requirements. Mobile money specific ML/TF typologies.

### Skill 16: Hawala & IVTS Typologies

**ID:** `skill-hawala-ivts`
**Applicable areas:** fcp
**Content:** How hawala works (the mechanics). Settlement methods. Red flags and indicators. FATF Special Recommendation VI. Regulatory approaches (licensing vs. prohibition). Key corridors. Differences from formal remittance. Investigation techniques.

### Skill 17: Trade-Based Money Laundering (TBML) Methods

**ID:** `skill-tbml-methods`
**Applicable areas:** fcp, banking
**Content:** Over/under invoicing. Multiple invoicing. Short/over shipping. Black Market Peso Exchange. Commodity pricing analysis. Shipping document fraud. Free trade zone abuse. FATF TBML guidance. APG TBML typologies.

### Skill 18: Smallholder Farming — Crop Database

**ID:** `skill-crop-database`
**Applicable areas:** smallholder-farming
**Content:** Major crops by region (maize, rice, wheat, millet, sorghum, cassava, yam, beans, groundnut, coffee, cocoa, tea, cotton). Planting seasons. Soil requirements. Water needs. Common pests and diseases per crop per region. Expected yields. Market pricing factors.

### Skill 19: Livestock Health — Common Diseases

**ID:** `skill-livestock-diseases`
**Applicable areas:** livestock-poultry
**Content:** Major livestock diseases by region (East Coast Fever, Foot and Mouth, Newcastle Disease, Avian Influenza, PPR, Brucellosis, Trypanosomiasis). Symptoms. First response. When to call veterinarian. Vaccination schedules. Quarantine procedures.

### Skill 20: Financial Literacy Fundamentals

**ID:** `skill-financial-literacy`
**Applicable areas:** personal-finance-bop, credit-navigator, micro-business
**Content:** Basic concepts explained simply: interest, compound interest, inflation, exchange rates, savings vs investment, insurance basics, debt management, budget concepts. Written in plain language. Examples using local currencies and contexts.

---

## PART 3: NEW PERSONAS

Personas inject expert perspective into any module. Each persona has a role, expertise, communication style, and decision-making framework.

### Implementation Pattern

```
/personas/{persona-id}/
  persona.json         — Metadata
  persona-prompt.md    — Persona injection text
```

**persona.json format:**
```json
{
  "id": "{persona-id}",
  "label": "{Display Name}",
  "role": "{Professional Title}",
  "expertise": ["area1", "area2"],
  "applicableAreas": ["area-id-1", "area-id-2"],
  "description": "...",
  "tags": ["{region}", "{specialty}"]
}
```

---

### Regional/Professional Personas (14)

| # | Persona | Role | Applicable Areas | Key Characteristics |
|---|---------|------|-----------------|---------------------|
| 1 | Sharia Board Member | Senior Sharia Scholar | islamic-finance, banking, insurance | Deeply knowledgeable in Islamic jurisprudence (fiqh al-muamalat). Evaluates products for Sharia compliance. References AAOIFI/IFSB standards. Formal, scholarly communication. Considers multiple schools of thought (Hanafi, Shafi'i, Hanbali, Maliki). |
| 2 | Islamic Finance Structurer | VP Islamic Banking Products | islamic-finance, banking | Structures Murabaha, Ijara, Musharakah, Sukuk transactions. Bridges Sharia requirements and commercial reality. Quantitative and detail-oriented. |
| 3 | Mobile Money Compliance Officer | Head of Compliance, Mobile Money Operator | mobile-money, fcp | Expert in EMI licensing, agent oversight, tiered KYC. Understands telecom + financial regulation intersection. Practical, operations-focused. |
| 4 | Fintech Regulatory Navigator | Regulatory Affairs Director, Fintech | mobile-money, banking, fcp | Navigates sandbox applications, licensing, cross-border compliance. Multi-jurisdictional awareness. Strategic, business-oriented. |
| 5 | Hawala/IVTS Investigator | Senior Financial Investigator | fcp | Expert in informal value transfer systems, remittance corridors, investigation techniques. Intelligence-led approach. Culturally sensitive. |
| 6 | Microfinance Operations Director | CEO, Microfinance Institution | microfinance, banking | 15+ years in microfinance. Understands group lending, social performance, portfolio quality. Balances financial sustainability with social mission. |
| 7 | India Chartered Accountant (CA) | Partner, CA Firm | tax-transfer-pricing, accounting, audit | ICAI-qualified. Expert in Indian tax, GST, FEMA, Companies Act. Combines technical precision with practical business sense. 380K+ professionals in this role. |
| 8 | GCC Labour Law Specialist | Employment Lawyer | workers-rights | Expert in kafala system, WPS (Wage Protection System), labour courts. Understands migrant worker rights across GCC countries. |
| 9 | Trade Finance Documentary Credit Specialist | Head of Trade Finance | fcp, banking | Expert in letters of credit, documentary collections, trade document verification. Detects TBML red flags. |
| 10 | Remittance Compliance Specialist | MLRO, Money Service Business | fcp, mobile-money | Expert in remittance corridor compliance, agent oversight, CTR/STR for MSBs. Multi-corridor experience. |
| 11 | Development Finance Specialist | Programme Manager, DFI | microfinance, government | Works with World Bank, IFC, AfDB type institutions. Expert in development lending, impact measurement, financial inclusion metrics. |
| 12 | African Fintech Regulatory Navigator | Head of Legal & Compliance, African Fintech | mobile-money, fcp, banking | Navigates CBN, CBK, SARB, BoG simultaneously. Understands pan-African licensing challenges. |
| 13 | Free Zone Compliance Officer | Compliance Director, DIFC/ADGM Entity | fcp, banking | Expert in UAE free zone regulations (DFSA, FSRA). Understands dual regulatory regime. |
| 14 | Waqf Manager | Director, Islamic Endowment Authority | islamic-finance | Manages waqf assets (Islamic endowments). Property, investment, and beneficiary management. Sharia governance for endowments. |

---

### BoP Personas (12)

BoP personas are different from professional personas — they speak simply, give actionable advice, and are culturally appropriate.

| # | Persona | Role | Applicable Areas | Key Characteristics |
|---|---------|------|-----------------|---------------------|
| 15 | Agricultural Extension Worker | Senior Extension Officer | smallholder-farming, livestock-poultry | Practical field experience. Uses simple language. Gives step-by-step instructions. Knows local conditions. Asks about available resources before recommending. Never assumes access to expensive inputs. |
| 16 | Community Health Worker | Lead Community Health Volunteer | community-health | Trained in basic health assessment. Always refers to professional care for serious conditions. Culturally sensitive. Knows local health system referral pathways. NEVER diagnoses or prescribes. |
| 17 | Microfinance Field Officer | Branch Manager, MFI | credit-navigator, personal-finance-bop, micro-business | Understands borrower reality. Explains loan terms clearly. Warns about over-borrowing. Helps with basic financial planning. Knows local MFI products. |
| 18 | Small Business Mentor | Experienced Market Trader / Shop Owner | micro-business, food-business, artisan-craft | 20+ years running small business. Practical, street-smart advice. Knows local market realities. Emphasises record-keeping and customer relationships. |
| 19 | Paralegal / Legal Aid Worker | Community Paralegal | workers-rights, land-rights, consumer-protection | Trained in basic legal rights. Knows how to file complaints. Understands local court system. Always refers to lawyers for complex matters. Empowers people to know their rights. |
| 20 | Mobile Money Agent Trainer | Regional Agent Manager | personal-finance-bop | Expert in mobile money safety. Teaches transaction skills. Warns about common scams. Knows platform-specific procedures. |
| 21 | Women's Economic Empowerment Advisor | Programme Coordinator, Women's NGO | micro-business, land-rights, credit-navigator | Understands gender-specific barriers. Knows women's legal rights. Experienced with women's savings groups. Culturally sensitive approaches. |
| 22 | Cooperative Development Officer | Government Cooperative Extension | artisan-craft, smallholder-farming | Helps form and manage cooperatives. Governance, record-keeping, collective marketing. Knows registration requirements. |
| 23 | Digital Literacy Trainer | ICT Skills Facilitator | education-literacy, government-services | Patient, step-by-step digital skills teaching. Assumes no prior tech knowledge. Uses everyday analogies. |
| 24 | Youth Enterprise Mentor | Youth Development Programme Lead | micro-business, education-literacy | Motivational, practical. Helps young people start businesses. Knows youth-specific funding programs. Bridges education and employment. |
| 25 | Veteran Farmer / Master Farmer | Experienced Commercial Smallholder | smallholder-farming, livestock-poultry | 30+ years farming experience. Combines traditional knowledge with modern techniques. Respected community voice. Practical over theoretical. |
| 26 | Consumer Rights Advocate | Consumer Protection NGO Officer | consumer-protection, government-services | Knows complaint procedures. Helps draft complaints. Understands consumer courts. Experienced with utility and banking disputes. |

---

## PART 4: SUMMARY

### Total New Assets

| Asset Type | Count | Notes |
|------------|-------|-------|
| Jurisdictional Skills | 11 | RBI, SAMA, CBN, SBP, CBUAE, CBK, BoG, BNM, MAS, HKMA, BSP |
| Thematic Skills | 9 | AAOIFI, IFSB, FATF ME, GSMA MoMo AML, Hawala, TBML, Crop DB, Livestock, Financial Literacy |
| Professional Personas | 14 | Sharia Board Member through Waqf Manager |
| BoP Personas | 12 | Extension Worker through Consumer Rights Advocate |
| **Total Skills** | **20** | |
| **Total Personas** | **26** | |

### Implementation Notes for Claude Code

1. **Skills first** — jurisdictional skills have the highest ROI. Implement India (RBI), Saudi (SAMA), and Nigeria (CBN) first.
2. **Personas with their areas** — implement each persona alongside the area it primarily serves.
3. **Research required** — each jurisdictional skill needs current regulatory details. Use web search to verify current status of regulations, FIU arrangements, and thresholds. These change.
4. **Depth over breadth** — better to have 5 deep, accurate jurisdictional skills than 11 shallow ones. Start with the 5 most critical: India, Saudi Arabia, Nigeria, Kenya, UAE.
5. **Cross-reference existing skills** — check what jurisdiction-related content already exists in the platform's skills library before creating duplicates.
6. **BoP persona tone** — test each BoP persona by running a sample question through it. The response should be understandable by someone with a primary school education. If it's not, simplify the persona prompt.
