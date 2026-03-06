# Regulatory Knowledge Pack Content Generation — Priority Areas & Methodology

> **Audience:** Claude Code
> **Purpose:** Systematic generation of draft knowledge pack content (entities, relationships, aliases) for ANTON's highest-priority expert areas. This document tells you which areas to prioritise, which regulations and frameworks to map for each, how to break them down into entities, how to discover and classify cross-references, and how to output the results in the correct JSON format.
> **Prerequisite:** Read `REGULATORY_KNOWLEDGE_PACK_SPEC.md` first — it defines the JSON schema, entity types, relationship types, and validation rules. This document assumes you know the output format.
> **Approach:** For each regulation, fetch the full text from EUR-Lex or the authoritative source, parse it systematically, and generate draft JSON. The output will be reviewed and refined by domain experts (the Advisense team), but your job is to produce a high-quality first draft that captures 80–90% of the structure and connections.

---

## 1. Priority Tiers — Which Areas Get Packs First

Not all 29 areas benefit equally from knowledge packs. Areas that are heavily regulated — where articles cross-reference each other, where multiple legal instruments interact, and where citation accuracy matters — benefit the most. Areas that are framework-based or methodology-driven (like Project Management or Personal Development) get less value from a structured legal graph.

### Tier 1: HIGH PRIORITY — Build These First

These areas have dense regulatory frameworks where cross-reference mapping directly improves output quality.

| Priority | Area | Area ID | Key Regulations | Estimated Pack Size |
|----------|------|---------|-----------------|-------------------|
| 1 | Financial Crime Prevention | `fcp` | AMLR, AMLD6, AMLA Reg, 4AMLD, FATF | ~200 entities, ~700 relationships |
| 2 | Legal & Regulatory | `legal` | Cross-cutting — references all regulatory packs | ~80 entities, ~300 relationships |
| 3 | Banking & Finance | `banking` | CRR/CRD, PSD2/PSD3, EMD2, MiFID II | ~180 entities, ~500 relationships |
| 4 | ESG & Sustainability | `esg` | CSRD, EU Taxonomy, SFDR, CSDDD | ~150 entities, ~450 relationships |
| 5 | Cybersecurity | `cyber` | DORA, NIS2, GDPR (security provisions) | ~120 entities, ~350 relationships |

### Tier 2: MEDIUM PRIORITY — Build After Tier 1

| Priority | Area | Area ID | Key Regulations | Estimated Pack Size |
|----------|------|---------|-----------------|-------------------|
| 6 | Risk Management | `risk` | Basel III, EBA Guidelines, SREP | ~100 entities, ~300 relationships |
| 7 | Data & Analytics | `data-analytics` | GDPR, AI Act, Data Act, Data Governance Act | ~140 entities, ~400 relationships |
| 8 | Audit & Assurance | `audit` | ISA Standards, IIA Standards, SOX (cross-border) | ~90 entities, ~250 relationships |
| 9 | Insurance & Actuarial | `insurance` | Solvency II, IDD, EIOPA Guidelines | ~110 entities, ~300 relationships |
| 10 | Investment & Asset Mgmt | `investment` | MiFID II/MiFIR, AIFMD, UCITS, EMIR | ~150 entities, ~450 relationships |
| 11 | Accounting & Finance | `accounting` | IFRS, IAS, EU Accounting Directive | ~100 entities, ~250 relationships |

### Tier 3: LOWER PRIORITY — Build When Demand Arises

| Area | Area ID | Why Lower Priority |
|------|---------|-------------------|
| Procurement & Supply Chain | `procurement` | Framework-driven, less article-level cross-referencing |
| Healthcare & Life Sciences | `healthcare` | Jurisdiction-specific, hard to generalise at EU level |
| Manufacturing & Operations | `manufacturing` | Standards-based (ISO), not regulatory cross-reference dense |
| HR & People | `hr` | Employment law is national, not EU-harmonised (except posted workers) |
| Real Estate & Property | `real-estate` | Primarily national law |
| Consumer Legal | `consumer-legal` | Primarily national consumer protection |
| Education & Teaching | `education` | Curriculum-based, not regulatory |
| Personal Development | `personal-dev` | No regulatory framework |
| Nonprofit & Social Impact | `nonprofit` | Varies by jurisdiction |
| Branding & Creative | `branding` | IP/trademark law could benefit, but low priority |
| Communication & PR | `comms-pr` | No dense regulatory framework |
| Startups & Entrepreneurship | `startups` | Cross-cutting, benefits from other packs existing |
| Academic Research | `academic` | Research ethics frameworks, but not cross-reference dense |
| Project Management | `project-mgmt` | Methodology-based (PRINCE2, PMP), not legal |
| Strategy & Planning | `strategy` | No regulatory framework |
| Operations & Process | `ops` | ISO standards could benefit, lower priority |
| Software Engineering | `software-eng` | AI Act is the main regulatory piece (covered in Data & Analytics) |

---

## 2. Methodology — How to Break Down a Regulation

For each regulation in the priority list, follow this systematic process. The AMLR example below serves as the template for all subsequent regulations.

### Step 1: Fetch the Regulation Text

Use the EUR-Lex HTML version. These have structured anchors per article.

```
Fetch: https://eur-lex.europa.eu/eli/reg/2024/1624/oj
```

If the HTML is too large for a single fetch, work chapter by chapter. EUR-Lex HTML typically has clear chapter/section/article structure in the DOM.

**For non-EU instruments** (FATF, Basel, ISA), use the authoritative source:
- FATF Recommendations: https://www.fatf-gafi.org/en/recommendations.html
- Basel Framework: https://www.bis.org/basel_framework/
- ISA Standards: https://www.iaasb.org/standards

### Step 2: Extract the Structural Hierarchy

Every regulation has a hierarchy. Map it first:

```
Regulation
  └── Part / Title
       └── Chapter
            └── Section
                 └── Article
                      └── Paragraph
                           └── Sub-paragraph / Point
```

**Output:** Create a skeleton of entities — one per article, with metadata capturing the hierarchy:

```json
{
  "ref_id": "amlr-art-8",
  "entity_type": "regulation",
  "name": "AMLR Article 8 — Business-Wide Risk Assessment",
  "canonical_name": "AMLR Article 8",
  "description": "[to be filled from article text]",
  "metadata": {
    "regulation": "AMLR 2024/1624",
    "article_number": "8",
    "title": "Business-Wide Risk Assessment",
    "chapter": "II",
    "chapter_title": "Risk-Based Approach",
    "section": null,
    "eur_lex_url": "https://eur-lex.europa.eu/eli/reg/2024/1624/oj#art_8"
  }
}
```

**Do this for every article in the regulation.** Don't skip articles — even procedural ones (commencement, repeal, transposition) matter for the relationship map.

### Step 3: Write Entity Descriptions

For each article entity, write a 1–3 sentence description that captures WHAT the article does — not the full text, but a practitioner-level summary.

**Source:** Read the article text. Distil the core obligation, right, or mechanism.

**Quality standard:**
- A compliance professional reading only the description should understand the article's purpose
- Include key obligations (what must be done)
- Include key actors (who must do it)
- Mention trigger conditions if applicable (when it applies)

**Example:**
- Good: "Requires obliged entities to carry out a documented business-wide risk assessment of ML/TF risks, considering risk factors in Annexes II and III, and to make it available to competent authorities on request."
- Bad: "About risk assessment." (too vague)
- Bad: [Full text of the article copied verbatim] (too long, not a description)

### Step 4: Scan for Cross-References

This is the highest-value step. Go through each article and find every reference to another legal provision.

**What to search for in the regulation text:**

| Search Pattern | What It Signals | Likely Relationship Type |
|----------------|----------------|------------------------|
| "referred to in Article X" | Internal cross-reference | `references` |
| "in accordance with Article X" | Compliance dependency | `requires` or `references` |
| "pursuant to Article X" | Delegation or authority | `requires` |
| "without prejudice to Article X" | Carve-out / parallel provision | `references` |
| "subject to Article X" | Conditional applicability | `depends_on` |
| "for the purposes of Article X" | Definitional link | `references` |
| "as defined in Article X" | Definitional dependency | `references` |
| "within the meaning of Article X" | Definitional dependency | `references` |
| "notwithstanding Article X" | Override | `supersedes` or `contradicts` |
| "Directive (EU) XXXX/XXXX" | External instrument reference | `references` or `supersedes` |
| "Regulation (EU) XXXX/XXXX" | External instrument reference | `references` or `supersedes` |
| "shall develop draft regulatory technical standards" | RTS delegation | `requires` (article → RTS) |
| "shall develop draft implementing technical standards" | ITS delegation | `requires` (article → ITS) |
| "shall issue guidelines" | Guidelines delegation | `requires` (article → guidelines) |
| "shall repeal" / "is repealed" | Repeal | `supersedes` |
| "shall replace" / "is replaced by" | Replacement | `supersedes` |
| "shall amend" / "is amended" | Amendment | `supersedes` (partial) |

**For each hit, record:**

```json
{
  "from_ref": "[article where the reference appears]",
  "to_ref": "[article or instrument being referenced]",
  "relationship_type": "[type from table above]",
  "description": "[what the connection means in plain language]",
  "strength": 4.0,
  "metadata": {
    "paragraph": "[specific paragraph, e.g. '8(3)']",
    "cross_reference_type": "internal|external",
    "obligation_level": "mandatory|recommended|optional"
  }
}
```

### Step 5: Extract Non-Article Entities

Beyond articles, every regulation implies processes, bodies, concepts, and documents that should also be entities:

**Processes** (entity_type: `process`):
- What procedures does the regulation require? (BWRA, CDD, EDD, SAR filing, TM, beneficial ownership verification)
- Create one entity per distinct process
- Link to the articles that require them

**Bodies / Organisations** (entity_type: `organization`):
- What institutions does the regulation reference? (AMLA, EBA, FATF, FIUs, European Commission, national competent authorities)
- What are their roles in the regulatory framework?
- Link to articles that define their powers or responsibilities

**Key Concepts** (entity_type: `risk` or `document` as appropriate):
- Risk categories defined by the regulation (ML risk, TF risk, sanctions risk, PEP risk)
- Referenced documents (FATF Recommendations, EU SNRA, national risk assessments)
- Annexes (which are separate entities that articles reference)

**RTS / ITS / Guidelines** (entity_type: `regulation`):
- Every delegated or implementing act referenced or mandated by the regulation
- Include even if they don't exist yet (mark status as `draft` or `planned`)
- These are crucial because they represent future regulatory obligations

### Step 6: Map Cross-Area Connections

Some relationships cross ANTON area boundaries. These are especially valuable because they help users discover that a regulation they're working on in one area has implications in another.

**Example cross-area connections for AMLR:**

| From (FCP) | To (Other Area) | Relationship | ANTON Area |
|------------|----------------|-------------|------------|
| AMLR data processing provisions | GDPR Article 6 (legal basis) | `references` | Data & Analytics |
| AMLR Article 7 (SNRA) | National Risk Assessment process | `requires` | Risk Management |
| AMLR internal controls provisions | Internal Audit Standards (ISA 315) | `references` | Audit & Assurance |
| AMLR IT systems requirements | DORA operational resilience | `references` | Cybersecurity |
| AMLR beneficial ownership registers | Company law / transparency directives | `references` | Legal & Regulatory |
| AMLR crypto asset provisions | MiCA Regulation | `references` | Banking & Finance |

**Record these as relationships with a `cross_area` flag in metadata:**

```json
{
  "from_ref": "amlr-art-55",
  "to_ref": "gdpr-art-6",
  "relationship_type": "references",
  "description": "AMLR data processing must comply with GDPR legal basis requirements.",
  "strength": 4.0,
  "metadata": {
    "cross_reference_type": "external",
    "cross_area": true,
    "from_area": "fcp",
    "to_area": "data-analytics"
  }
}
```

**Important:** Cross-area entities (e.g., GDPR Article 6) will exist in their own area pack as well. Use the same `ref_id` naming convention so they can be merged when both packs are activated. For example, if the FCP pack references `gdpr-art-6` and the Data & Analytics pack also has `gdpr-art-6`, they should use the same ref_id so the activation merge logic links them.

### Step 7: Generate Aliases

For every entity, generate the common ways practitioners refer to it:

**Pattern for article aliases:**
- Full: "AMLR Article 8" (canonical)
- Short: "Art. 8 AMLR", "AMLR Art. 8"
- With title: "Article 8 BWRA", "AMLR Article 8 BWRA"
- Formal: "Regulation 2024/1624 Article 8", "Regulation (EU) 2024/1624 Article 8"
- Numeric: "AMLR 8" (some practitioners drop the word "Article")

**Pattern for instrument aliases:**
- Acronym: "AMLR", "4AMLD", "AMLD6"
- Full title: "Anti-Money Laundering Regulation"
- EU reference: "Regulation (EU) 2024/1624"
- Common shorthand: "the AML Regulation", "new AML rules"

**Pattern for body aliases:**
- Acronym: "AMLA"
- Full name: "Anti-Money Laundering Authority"
- With location: "AMLA Frankfurt"
- Formal: "EU Anti-Money Laundering Authority"

### Step 8: Validate and Output

Run these checks before outputting:

1. Every `ref_id` is unique across the entire pack
2. Every `from_ref` and `to_ref` in relationships resolves to an entity
3. Every `ref_id` in aliases resolves to an entity
4. Every entity has a non-empty description
5. No duplicate relationships (same from/to/type triple)
6. Relationship types are from the allowed set

Output the three JSON files: `entities.json`, `relationships.json`, `aliases.json`

Also output a `manifest.json` using this template:

```json
{
  "bundle_type": "regulatory-knowledge-pack",
  "name": "[Pack Name]",
  "slug": "[pack-slug]",
  "version": "1.0.0-draft",
  "description": "[What this pack covers]",
  "domain": "[Domain]",
  "area_ids": ["[area-id-1]", "[area-id-2]"],
  "author": "ANTON / Claude Code (draft — requires expert review)",
  "source_url": "[Primary EUR-Lex or source URL]",
  "license": "CC-BY-4.0",
  "published_at": null,
  "entity_count": 0,
  "relationship_count": 0,
  "anton_version_min": "1.0.0"
}
```

Mark `version` as `1.0.0-draft` and `author` as requiring expert review. Entity and relationship counts are computed after generation.

---

## 3. Pack 1: AMLR & AML/CFT Framework (Area: FCP)

This is the first and most important pack. The Advisense team works with this regulation daily.

### Instruments to Map

| Instrument | EUR-Lex URI | Priority | Role in Pack |
|-----------|-------------|----------|-------------|
| **AMLR** (Regulation 2024/1624) | `https://eur-lex.europa.eu/eli/reg/2024/1624/oj` | PRIMARY | Core regulation — map every article |
| **AMLD6** (Directive 2024/1640) | `https://eur-lex.europa.eu/eli/dir/2024/1640/oj` | HIGH | Complementary directive — map key articles on supervision, sanctions, FIUs |
| **AMLA Regulation** (Regulation 2024/1620) | `https://eur-lex.europa.eu/eli/reg/2024/1620/oj` | HIGH | AMLA powers and structure — map key articles |
| **4AMLD** (Directive 2015/849) | `https://eur-lex.europa.eu/eli/dir/2015/849/oj` | MEDIUM | Predecessor — map articles that AMLR supersedes |
| **5AMLD** (Directive 2018/843) | `https://eur-lex.europa.eu/eli/dir/2018/843/oj` | LOW | Amendment to 4AMLD — map key changes |
| **6AMLD** (Directive 2018/1673) | `https://eur-lex.europa.eu/eli/dir/2018/1673/oj` | MEDIUM | Criminal law harmonisation — map predicate offences |
| FATF Recommendations | fatf-gafi.org | MEDIUM | Global standard — map key recommendations referenced by AMLR |

### AMLR Chapter Structure (Map Every Article)

Based on the regulation's structure, here is the expected chapter breakdown. Fetch the actual text to confirm and fill in article titles:

**Chapter I — General Provisions (Articles 1–6)**
- Subject matter, scope, definitions, obliged entities
- High density of definitional cross-references (Article 2 definitions are referenced throughout)

**Chapter II — Risk-Based Approach (Articles 7–12)**
- SNRA, BWRA, risk variables, risk categorisation
- Core of the regulatory framework — heavy cross-referencing
- RTS delegation: risk variables (Art 13), BWRA methodology

**Chapter III — Customer Due Diligence (Articles 13–29)**
- CDD measures, identification/verification, beneficial ownership, PEPs, EDD, simplified DD
- Largest chapter — most internal cross-references
- Multiple RTS delegations: CDD information, remote identification, PEP criteria
- Links to beneficial ownership registers (Chapter VI)

**Chapter IV — Reporting & Information (Articles 30–39)**
- Transaction monitoring, suspicious transaction reports, FIU cooperation
- Links to AMLD6 FIU provisions
- Links to AMLA coordination role

**Chapter V — Specific Provisions (Articles 40–50)**
- Crypto assets, correspondent relationships, high-value goods, cash payments
- Cross-references to MiCA (crypto)
- RTS delegations for specific sectors

**Chapter VI — Beneficial Ownership (Articles 51–60)**
- Registers, access, cross-border interconnection
- Links to Company Law Directive
- Links to AMLA central register role

**Chapter VII — Group Policies (Articles 61–65)**
- Group-wide AML policies, third-country branches/subsidiaries
- RTS: group-wide policies (Art 16.4)

**Chapter VIII — Supervision (Articles 66–80)**
- Supervisory powers, cooperation, AMLA role
- Heavy cross-references to AMLA Regulation
- Links to AMLD6 supervisory provisions

**Chapter IX — Sanctions & Measures (Articles 81–90)**
- Administrative sanctions, penalties, publication
- Links to AMLD6 criminal sanctions

**Chapter X — Final Provisions (Articles 91–100)**
- Repeal, transitional, entry into force
- Explicit supersession of 4AMLD provisions — map every repeal

### Non-Article Entities to Create

**Processes:**

| ref_id | name | description |
|--------|------|-------------|
| `process-bwra` | Business-Wide Risk Assessment | Enterprise-level ML/TF risk identification and assessment process |
| `process-cdd` | Customer Due Diligence | Standard identity verification and risk assessment for customers |
| `process-edd` | Enhanced Due Diligence | Additional measures for high-risk customers and situations |
| `process-sdd` | Simplified Due Diligence | Reduced measures for verified low-risk situations |
| `process-tm` | Transaction Monitoring | Ongoing monitoring of customer transactions for suspicious activity |
| `process-sar` | Suspicious Activity Reporting | Filing of suspicious transaction/activity reports to FIU |
| `process-bo-verification` | Beneficial Ownership Verification | Identification and verification of ultimate beneficial owners |
| `process-pep-screening` | PEP Screening | Screening customers against politically exposed persons lists |
| `process-sanctions-screening` | Sanctions Screening | Screening against EU and international sanctions lists |
| `process-risk-categorisation` | Customer Risk Categorisation | Assigning risk ratings to customers based on risk factors |
| `process-ongoing-monitoring` | Ongoing Customer Monitoring | Continuous review of customer relationships and transactions |
| `process-record-keeping` | Record Keeping | Retention of CDD and transaction records per regulatory requirements |

**Organisations:**

| ref_id | name | entity_type |
|--------|------|-------------|
| `org-amla` | AMLA — Anti-Money Laundering Authority | organization |
| `org-eba` | European Banking Authority (legacy AML role) | organization |
| `org-fatf` | Financial Action Task Force | organization |
| `org-ec` | European Commission | organization |
| `org-fiu-generic` | Financial Intelligence Units (EU) | organization |
| `org-esa` | European Supervisory Authorities | organization |

**Key Concepts / Risk Categories:**

| ref_id | name | entity_type |
|--------|------|-------------|
| `concept-rba` | Risk-Based Approach | process |
| `concept-pep` | Politically Exposed Person (PEP) | risk |
| `concept-hrtc` | High-Risk Third Countries | geography |
| `concept-bo` | Beneficial Owner | process |
| `concept-ml-risk` | Money Laundering Risk | risk |
| `concept-tf-risk` | Terrorist Financing Risk | risk |
| `concept-pf-risk` | Proliferation Financing Risk | risk |

**RTS / ITS (from AMLA Single Programming Document):**

| ref_id | name | status |
|--------|------|--------|
| `rts-risk-variables` | RTS on Customer Risk Variables (AMLR Art 13) | draft |
| `rts-group-policies` | RTS on Group-Wide Policies (AMLR Art 16.4) | consultation |
| `rts-high-risk-sectors` | RTS on High-Risk Sectors (AMLR Art 19.9) | consultation |
| `rts-cdd-information` | RTS on CDD Information (AMLR Art 28.1) | consultation |
| `rts-remote-id` | RTS on Remote Customer Identification | draft |
| `rts-central-register` | RTS on Central BO Register | planned |
| `its-reporting-format` | ITS on Supervisory Reporting Format | planned |
| `rts-data-points` | RTS on AMLA Data Points for Regulatory Reporting | draft |

### Cross-Area Connections to Map

| From Entity | To Entity | Type | To Area |
|------------|-----------|------|---------|
| AMLR data processing articles | GDPR relevant articles | `references` | `data-analytics` |
| AMLR IT system requirements | DORA operational resilience | `references` | `cyber` |
| AMLR crypto provisions | MiCA Regulation | `references` | `banking` |
| AMLR internal governance | CRD governance requirements | `references` | `banking` |
| AMLR audit/control requirements | ISA audit standards | `references` | `audit` |
| AMLR supervisory stress testing | EBA SREP framework | `references` | `risk` |
| AMLR ESG-related risk factors | CSRD reporting requirements | `references` | `esg` |

---

## 4. Pack 2: DORA & Cyber Resilience (Area: Cybersecurity)

### Instruments to Map

| Instrument | EUR-Lex URI | Priority |
|-----------|-------------|----------|
| **DORA** (Regulation 2022/2554) | `https://eur-lex.europa.eu/eli/reg/2022/2554/oj` | PRIMARY |
| **NIS2** (Directive 2022/2555) | `https://eur-lex.europa.eu/eli/dir/2022/2555/oj` | HIGH |
| GDPR security provisions (Art 32) | `https://eur-lex.europa.eu/eli/reg/2016/679/oj` | MEDIUM |
| EBA ICT Risk Guidelines | eba.europa.eu | MEDIUM |

### Key Structure — DORA

| Chapter | Articles | Focus |
|---------|----------|-------|
| I — General | 1–4 | Scope, definitions, proportionality |
| II — ICT Risk Management | 5–16 | ICT risk framework, governance, systems, learning |
| III — ICT Incident Management | 17–23 | Classification, reporting, notification |
| IV — Digital Operational Resilience Testing | 24–27 | Basic testing, TLPT, requirements |
| V — Third-Party Risk | 28–44 | Oversight framework, concentration risk, critical providers |
| VI — Information Sharing | 45 | Cyber threat intelligence sharing |
| VII — Competent Authorities | 46–56 | Supervision, cooperation, penalties |

### Non-Article Entities

Processes: ICT risk management framework, incident classification, TLPT (threat-led penetration testing), third-party risk assessment, ICT change management, business continuity planning, ICT audit

Organisations: ESAs (EBA, EIOPA, ESMA), ENISA, Critical ICT Third-Party Provider Oversight Forum

### Cross-Area Connections

| From | To | Type | To Area |
|------|-----|------|---------|
| DORA ICT governance | CRD governance (internal controls) | `references` | `banking` |
| DORA third-party risk | Outsourcing provisions (EBA Guidelines) | `references` | `risk` |
| DORA incident reporting | NIS2 incident reporting | `references` | `cyber` (internal) |
| DORA data protection in incidents | GDPR breach notification (Art 33-34) | `references` | `data-analytics` |
| DORA audit requirements | ISA 315 (IT audit) | `references` | `audit` |
| DORA — FI-specific | AMLR IT system requirements | `references` | `fcp` |

---

## 5. Pack 3: ESG & Sustainability Framework (Area: ESG)

### Instruments to Map

| Instrument | EUR-Lex URI | Priority |
|-----------|-------------|----------|
| **CSRD** (Directive 2022/2464) | `https://eur-lex.europa.eu/eli/dir/2022/2464/oj` | PRIMARY |
| **EU Taxonomy** (Regulation 2020/852) | `https://eur-lex.europa.eu/eli/reg/2020/852/oj` | HIGH |
| **SFDR** (Regulation 2019/2088) | `https://eur-lex.europa.eu/eli/reg/2019/2088/oj` | HIGH |
| **CSDDD** (Directive 2024/1760) | `https://eur-lex.europa.eu/eli/dir/2024/1760/oj` | HIGH |
| ESRS (European Sustainability Reporting Standards) | EFRAG | MEDIUM |

### Non-Article Entities

Processes: double materiality assessment, taxonomy alignment assessment, sustainability due diligence, PAI calculation, ESG data collection, sustainability reporting, assurance of sustainability information

Organisations: EFRAG, European Commission (delegated acts), national competent authorities

Concepts: double materiality, taxonomy-eligible activities, taxonomy-aligned activities, principal adverse impacts (PAI), do no significant harm (DNSH), minimum safeguards, transition plans

### Cross-Area Connections

| From | To | Type | To Area |
|------|-----|------|---------|
| CSRD reporting | Audit Directive (assurance) | `references` | `audit` |
| CSDDD due diligence | AMLR due diligence (overlap for FIs) | `references` | `fcp` |
| EU Taxonomy disclosures | CRR Pillar 3 (green asset ratio) | `references` | `banking` |
| SFDR product disclosures | MiFID II suitability (ESG preferences) | `references` | `investment` |
| CSRD data requirements | GDPR (employee data in social metrics) | `references` | `data-analytics` |

---

## 6. Pack 4: GDPR & Data Protection (Area: Data & Analytics)

### Instruments to Map

| Instrument | EUR-Lex URI | Priority |
|-----------|-------------|----------|
| **GDPR** (Regulation 2016/679) | `https://eur-lex.europa.eu/eli/reg/2016/679/oj` | PRIMARY |
| **AI Act** (Regulation 2024/1689) | `https://eur-lex.europa.eu/eli/reg/2024/1689/oj` | HIGH |
| Data Act (Regulation 2023/2854) | `https://eur-lex.europa.eu/eli/reg/2023/2854/oj` | MEDIUM |
| Data Governance Act (Regulation 2022/868) | `https://eur-lex.europa.eu/eli/reg/2022/868/oj` | MEDIUM |

### Non-Article Entities

Processes: DPIA, records of processing, data breach notification, data subject access request, legitimate interest assessment, consent management, international transfer assessment

Organisations: EDPB, national DPAs, AI Office

Concepts: personal data, special category data, data controller, data processor, legal basis, purpose limitation, data minimisation, storage limitation, high-risk AI system, prohibited AI practices

### Cross-Area Connections

| From | To | Type | To Area |
|------|-----|------|---------|
| GDPR data processing | AMLR data processing (legal basis for AML) | `references` | `fcp` |
| AI Act requirements | DORA ICT governance | `references` | `cyber` |
| GDPR security (Art 32) | DORA/NIS2 security measures | `references` | `cyber` |
| GDPR employee data | Employment law frameworks | `references` | `hr` |
| AI Act transparency | CSRD AI disclosure requirements | `references` | `esg` |

---

## 7. Pack 5: Banking Prudential Framework (Area: Banking & Finance)

### Instruments to Map

| Instrument | EUR-Lex URI | Priority |
|-----------|-------------|----------|
| **CRR** (Regulation 575/2013, as amended) | `https://eur-lex.europa.eu/eli/reg/2013/575/oj` | PRIMARY (key articles only — this is enormous) |
| **CRD** (Directive 2013/36/EU, as amended) | `https://eur-lex.europa.eu/eli/dir/2013/36/oj` | HIGH |
| **PSD2** (Directive 2015/2366) | `https://eur-lex.europa.eu/eli/dir/2015/2366/oj` | MEDIUM |
| **MiCA** (Regulation 2023/1114) | `https://eur-lex.europa.eu/eli/reg/2023/1114/oj` | HIGH |
| **MiFID II** (Directive 2014/65/EU) | `https://eur-lex.europa.eu/eli/dir/2014/65/oj` | MEDIUM |

**Note on CRR:** This regulation is ~700 articles. Do NOT map every article. Focus on:
- Part One: General Provisions (scope, definitions)
- Part Two: Own Funds (key capital articles)
- Part Three: Capital Requirements (credit risk, market risk, operational risk — key articles only)
- Part Seven: Disclosure (Pillar 3 — key articles)
- Part Eight: Delegated acts and RTS references

For the full CRR, prioritise articles that other regulations cross-reference.

### Cross-Area Connections

| From | To | Type | To Area |
|------|-----|------|---------|
| CRD governance | AMLR internal governance | `references` | `fcp` |
| CRR Pillar 3 ESG | EU Taxonomy / CSRD | `references` | `esg` |
| PSD2 security | DORA ICT requirements | `references` | `cyber` |
| MiCA crypto provisions | AMLR crypto CDD | `references` | `fcp` |
| MiFID II suitability | SFDR product disclosures | `references` | `esg` |
| CRD fit and proper | AMLR MLRO requirements | `references` | `fcp` |

---

## 8. Execution Order and Output Structure

### For Each Pack, Produce:

```
data/knowledge-packs/{pack-slug}/
  ├── manifest.json
  ├── entities.json
  ├── relationships.json
  ├── aliases.json
  └── README.md
```

### Execution Order

1. **AMLR pack first** — this is the flagship, most urgent, and most complex
2. **DORA pack second** — high demand from cyber/IT teams, manageable size
3. **ESG pack third** — growing regulatory pressure, multiple interconnected instruments
4. **GDPR/AI Act pack fourth** — foundational, cross-referenced by almost everything else
5. **Banking prudential pack fifth** — largest scope, do key articles only

### Quality Gates Between Packs

After completing each pack:
1. Run validation (all ref_ids resolve, no duplicates, types valid)
2. Count entities and relationships — update manifest
3. Check cross-area ref_ids for consistency (e.g., `gdpr-art-6` must use the same ref_id in both the FCP pack and the Data & Analytics pack)
4. Generate a summary report: entity count by type, relationship count by type, top-10 most-connected entities

---

## 9. Cross-Pack Consistency Rules

When the same entity appears in multiple packs (e.g., GDPR Article 6 is referenced by both the FCP pack and the Data & Analytics pack), the following rules ensure clean merging:

### ref_id Naming Convention (Global)

Use a consistent global naming scheme so the same entity always gets the same ref_id regardless of which pack includes it:

| Instrument | ref_id Prefix | Example |
|-----------|--------------|---------|
| AMLR 2024/1624 | `amlr-` | `amlr-art-8` |
| AMLD6 2024/1640 | `amld6-` | `amld6-art-12` |
| AMLA Reg 2024/1620 | `amla-reg-` | `amla-reg-art-5` |
| 4AMLD 2015/849 | `4amld-` | `4amld-art-8` |
| 6AMLD 2018/1673 | `6amld-` | `6amld-art-3` |
| GDPR 2016/679 | `gdpr-` | `gdpr-art-6` |
| AI Act 2024/1689 | `ai-act-` | `ai-act-art-6` |
| DORA 2022/2554 | `dora-` | `dora-art-5` |
| NIS2 2022/2555 | `nis2-` | `nis2-art-21` |
| CSRD 2022/2464 | `csrd-` | `csrd-art-19a` |
| EU Taxonomy 2020/852 | `taxonomy-` | `taxonomy-art-3` |
| SFDR 2019/2088 | `sfdr-` | `sfdr-art-6` |
| CSDDD 2024/1760 | `csddd-` | `csddd-art-5` |
| CRR 575/2013 | `crr-` | `crr-art-92` |
| CRD 2013/36 | `crd-` | `crd-art-73` |
| PSD2 2015/2366 | `psd2-` | `psd2-art-97` |
| MiCA 2023/1114 | `mica-` | `mica-art-62` |
| MiFID II 2014/65 | `mifid2-` | `mifid2-art-25` |
| FATF Recommendations | `fatf-rec-` | `fatf-rec-1` |
| Processes | `process-` | `process-bwra` |
| Organisations | `org-` | `org-amla` |
| Concepts | `concept-` | `concept-rba` |
| Risks | `risk-` | `risk-ml-cash-intensive` |

### Shared Entity Rule

When Pack A references an entity that is the core subject of Pack B:
- Pack A includes the entity with basic metadata (just name, canonical_name, description, ref_id)
- Pack B includes the full entity with detailed metadata
- Both use the same ref_id
- When both packs are activated, the activation merge logic links them (not duplicates)

**Example:** The FCP pack references `gdpr-art-6` as a simple entity. The Data & Analytics pack has `gdpr-art-6` as a fully detailed entity with paragraph-level metadata. When both are active, the detailed version wins (merge prefers the richer record).

---

## 10. Practical Notes for Claude Code

### Handling Large Regulations

Some regulations (CRR, GDPR, MiFID II) are very large. Strategies:

1. **Fetch chapter by chapter** if the full HTML is too large
2. **Focus on articles that are cross-referenced** — an article that nothing references and that references nothing is low value for the graph (still include it, but description can be shorter)
3. **Use the table of contents** to build the skeleton first, then fill in descriptions and cross-references per article

### Handling Amendments

EU regulations are frequently amended. Use the **consolidated version** from EUR-Lex when available (the URL includes `/2024-07-09` or similar date for the consolidated text). This gives you the current state including all amendments, which is what practitioners work with.

### Handling Languages

All content should be in **English** (the EUR-Lex English version). Even though the Advisense team works in Swedish, the knowledge graph should use English for maximum portability. Swedish aliases can be added separately (e.g., "Penningtvättsförordningen" as an alias for AMLR).

### When In Doubt About Relationship Type

If a cross-reference doesn't clearly fit one relationship type, use `references` as the default. It's the most general type and can be refined later by domain experts. Better to capture the connection with a generic type than to miss it entirely.

### Description Quality Over Quantity

A 2-sentence description that accurately captures the article's purpose is vastly more valuable than a 5-sentence description that paraphrases the legal text. Practitioners reading the knowledge graph want to quickly understand "what does this article do?" — not re-read the regulation.

### Output File Size

Each pack should be a manageable size:
- entities.json: typically 50–300 KB
- relationships.json: typically 100–500 KB  
- aliases.json: typically 30–150 KB

If a pack exceeds these sizes significantly, consider splitting it (e.g., CRR could be "CRR Capital Requirements" and "CRR Disclosure" as separate packs).

---

## 11. Summary — What Claude Code Produces

For each Tier 1 pack:

| Deliverable | Format | Location |
|------------|--------|----------|
| entities.json | JSON array | `data/knowledge-packs/{slug}/entities.json` |
| relationships.json | JSON array | `data/knowledge-packs/{slug}/relationships.json` |
| aliases.json | JSON array | `data/knowledge-packs/{slug}/aliases.json` |
| manifest.json | JSON object | `data/knowledge-packs/{slug}/manifest.json` |
| README.md | Markdown | `data/knowledge-packs/{slug}/README.md` |
| validation_report.txt | Text | `data/knowledge-packs/{slug}/validation_report.txt` |

The README should document:
- What the pack covers
- Source URLs for all mapped instruments
- Entity count by type
- Relationship count by type
- Known limitations or gaps
- Date of last update
- Instructions for expert reviewers (what to check)

**All output is draft quality.** Mark everything clearly as requiring expert review. The Advisense team will validate cross-references against the actual regulation text, refine descriptions, add domain-specific aliases, and promote from `1.0.0-draft` to `1.0.0` when satisfied.
