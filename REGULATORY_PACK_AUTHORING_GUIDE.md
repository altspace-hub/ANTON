# Regulatory Knowledge Pack — Authoring Guide

## How to Download Regulations and Build Cross-Reference Maps for ANTON Knowledge Packs

> **Audience:** Daniel, Max, Petra, and the Advisense FCP team (or any domain expert authoring a knowledge pack)
> **Purpose:** Step-by-step guide for creating the content that goes inside a Regulatory Knowledge Pack — how to source the regulations, how to structure the cross-references, and how to produce the JSON files that ANTON imports.
> **What this is NOT:** This is not the technical implementation spec (that's the separate Claude Code brief). This is the content authoring process.

---

## 1. Overview: What You're Building

A knowledge pack is a structured dataset that tells ANTON's knowledge graph how a regulatory framework is organised internally and how it connects to other legal instruments. For AMLR, this means mapping every article, every internal cross-reference, every link to predecessor directives, the AMLA oversight structure, and the RTS/ITS hierarchy.

The end product is three JSON files and a README:

| File | What it contains | Example |
|------|-----------------|---------|
| `entities.json` | Every article, directive, body, process, and key concept as a named entity | "AMLR Article 8 — Business-Wide Risk Assessment" |
| `relationships.json` | Every connection between entities — what requires what, what supersedes what, what references what | "AMLR Article 8 `requires` BWRA process" |
| `aliases.json` | Alternative names practitioners use for the same thing | "Art. 8 AMLR", "AMLR Art. 8", "Article 8 BWRA" |
| `manifest.json` | Pack metadata (name, version, author, etc.) | Auto-generated from a template |

The effort for the first AMLR pack is estimated at 2–4 days of focused work by someone who knows the regulation. Subsequent packs will be faster because the process and tooling will be established.

---

## 2. Source Materials — Where to Get the Regulations

### 2.1 Primary: EUR-Lex

EUR-Lex is the authoritative source for all EU legislation. Every regulation, directive, and delegated/implementing act has a stable URI.

**AMLR (Regulation 2024/1624):**
- Full text: https://eur-lex.europa.eu/eli/reg/2024/1624/oj
- Use the HTML version (not PDF) — it has structured article anchors that make cross-referencing easier
- The table of contents on the left sidebar gives you the chapter/section/article hierarchy

**AMLD6 (Directive 2024/1640):**
- Full text: https://eur-lex.europa.eu/eli/dir/2024/1640/oj

**AMLA Regulation (Regulation 2024/1620):**
- Full text: https://eur-lex.europa.eu/eli/reg/2024/1620/oj

**4AMLD (Directive 2015/849):**
- Full text: https://eur-lex.europa.eu/eli/dir/2015/849/oj
- Consolidated version (with amendments): https://eur-lex.europa.eu/eli/dir/2015/849/2024-07-09

**5AMLD (Directive 2018/843):**
- Full text: https://eur-lex.europa.eu/eli/dir/2018/843/oj

**Key tip:** EUR-Lex HTML versions have anchor IDs per article (e.g., `#art_8`). Save these URLs in your entity metadata — they become clickable references in the knowledge graph.

### 2.2 AMLA Official Sources

AMLA publishes draft RTS, ITS, guidelines, and consultation papers:
- AMLA website: https://www.amla.europa.eu/
- Single Programming Document (SPD): Lists all planned regulatory deliverables with timelines
- Consultation papers: Published for each draft RTS/ITS

**For the knowledge pack:** Include RTS/ITS as entities even when they're still in draft or consultation phase. Mark their status in the metadata (`draft`, `consultation`, `final`, `published`). This gives users a forward-looking view of the regulatory pipeline.

### 2.3 EBA Legacy Materials

Many AMLR provisions build on or replace EBA guidelines:
- EBA AML/CFT guidelines: https://www.eba.europa.eu/regulation-and-policy/anti-money-laundering-and-countering-financing-terrorism
- EBA Risk Factors Guidelines (EBA/GL/2021/02)
- EBA Remote Customer Onboarding Guidelines

**For the knowledge pack:** Include key EBA guidelines as entities with `supersedes` or `references` relationships to show what's changing under the new framework.

### 2.4 Downloading for Offline Work

For systematic work, download the HTML versions of the key regulations and save them locally. The HTML structure is well-formed and can be searched with Ctrl+F for cross-reference patterns.

**What to download for the AMLR pack:**
1. AMLR 2024/1624 (full HTML)
2. AMLD6 2024/1640 (full HTML)
3. AMLA Regulation 2024/1620 (full HTML)
4. 4AMLD 2015/849 consolidated (full HTML)
5. AMLA Single Programming Document (PDF — latest version)
6. The AMLA data points draft guidance (you already have this in the project)

---

## 3. The Authoring Process — Step by Step

### Step 1: Build the Article Inventory (Entities)

Go through the regulation article by article and create one entity per article. This is the most mechanical part — it's essentially a structured table of contents.

**Start with a spreadsheet.** Use a simple structure:

| ref_id | entity_type | name | canonical_name | chapter | article_number | title | description |
|--------|-------------|------|----------------|---------|----------------|-------|-------------|
| amlr-art-1 | regulation | AMLR Article 1 — Subject Matter | AMLR Article 1 | I | 1 | Subject Matter | Establishes the scope of the regulation... |
| amlr-art-2 | regulation | AMLR Article 2 — Definitions | AMLR Article 2 | I | 2 | Definitions | Defines key terms used throughout... |
| amlr-art-3 | regulation | AMLR Article 3 — Obliged Entities | AMLR Article 3 | I | 3 | Obliged Entities | Lists the categories of entities subject to... |

**Do this for:**
- Every AMLR article (there are approximately 100 articles across 10 chapters)
- Key provisions in AMLD6 that complement AMLR (supervisory powers, sanctioning)
- AMLA Regulation key articles (establishment, powers, direct supervision, FIU coordination)
- 4AMLD articles that AMLR explicitly supersedes or references
- Each planned RTS and ITS (from the AMLA Single Programming Document)

**Also create entities for non-article things:**
- Key processes: BWRA, CDD, EDD, SAR filing, Transaction Monitoring, Beneficial Ownership verification
- Key bodies: AMLA, EBA (legacy role), FATF, FIUs (generic), European Commission
- Key concepts: Risk-Based Approach, Politically Exposed Persons, High-Risk Third Countries, Beneficial Owner
- Key documents: FATF Recommendations, FATF Methodology, EU Supranational Risk Assessment

**Expected entity count for a comprehensive AMLR pack:** 150–250 entities.

### Step 2: Map the Cross-References (Relationships)

This is the intellectually demanding part. Go through each article and identify every connection to other entities. There are several patterns to look for:

**Pattern 1: Explicit internal cross-references**

AMLR articles frequently reference other AMLR articles. Look for phrases like "referred to in Article X", "in accordance with Article Y", "as provided for in Article Z".

Example: AMLR Article 8(3) says risk assessment must consider risk variables "referred to in Article 13". This becomes:

```
from: amlr-art-8  →  to: amlr-art-13  |  type: references  |  description: "BWRA must consider risk variables from Article 13"
```

**Pattern 2: References to other EU instruments**

AMLR references predecessor directives and other EU legislation. Look for phrases like "Directive (EU) 2015/849", "Regulation (EU) 2024/1620", "Directive 2013/36/EU" (CRD).

Example: AMLR references 4AMLD provisions it replaces. This becomes:

```
from: amlr-art-8  →  to: 4amld-art-8  |  type: supersedes  |  description: "Replaces 4AMLD BWRA provisions"
```

**Pattern 3: Requirement chains**

Articles establish requirements that connect to processes, controls, or outcomes.

Example: Article 8 requires obliged entities to conduct a BWRA. This becomes:

```
from: amlr-art-8  →  to: process-bwra  |  type: requires  |  description: "Obliged entities must carry out BWRA"
```

**Pattern 4: Delegation to AMLA/EBA for RTS/ITS**

Many AMLR articles delegate detail to technical standards. Look for phrases like "AMLA shall develop draft regulatory technical standards", "in accordance with technical standards adopted pursuant to".

Example: Article 13 delegates risk variable specification to an RTS. This becomes:

```
from: amlr-art-13  →  to: rts-risk-variables  |  type: requires  |  description: "AMLA to develop RTS specifying risk variables"
from: amla  →  to: rts-risk-variables  |  type: owns  |  description: "AMLA responsible for drafting this RTS"
```

**Pattern 5: Supervisory structure**

AMLA directly supervises some entities, indirectly supervises others. Map these relationships.

```
from: amla  →  to: amlr-art-8  |  type: requires  |  description: "AMLA may require specific BWRA approaches for directly supervised entities"
```

**How to work through this systematically:**

1. Open the AMLR HTML in your browser
2. Go article by article, starting from Article 1
3. For each article, search the text for: "Article", "Directive", "Regulation", "referred to", "in accordance with", "pursuant to", "without prejudice to", "subject to"
4. Each hit is a potential relationship. Record it in your spreadsheet.
5. Also note the relationship type: does this article `require` something, `reference` something, `supersede` something?

**Expected relationship count for a comprehensive AMLR pack:** 400–800 relationships.

### Step 3: Collect Aliases

For each entity, think about how practitioners actually refer to it in practice. This is important because when someone runs a workflow and writes "Art. 8" or "the BWRA article", the alias system needs to match it to the pack entity.

**Common alias patterns:**

For articles:
- "AMLR Article 8" / "Art. 8 AMLR" / "AMLR Art. 8" / "Regulation 2024/1624 Article 8" / "Article 8 BWRA"

For directives:
- "4AMLD" / "4th Anti-Money Laundering Directive" / "Fourth AML Directive" / "Directive 2015/849" / "AMLD4"

For bodies:
- "AMLA" / "Anti-Money Laundering Authority" / "EU AML Authority"

For processes:
- "BWRA" / "Business-Wide Risk Assessment" / "Entity-Wide Risk Assessment" / "Institutional Risk Assessment"

**Tip:** Think about how Max, Petra, Jonas, and the Advisense team actually refer to these things in conversation and in deliverables. Those are your aliases.

**Expected alias count:** 300–500 aliases (2–4 per entity on average).

### Step 4: Convert Spreadsheet to JSON

Once the spreadsheet is complete, convert each sheet to the JSON format specified in the technical spec.

**Option A: Manual conversion**

If the spreadsheet is clean and well-structured, a simple script or even ANTON itself can convert it:
- Export each sheet as CSV
- Use a conversion script (Python or Node.js) to transform CSV → JSON matching the schema
- We will provide a converter script (see Section 5)

**Option B: Use ANTON to help**

Upload the spreadsheet to ANTON with the Coding Area or a data transformation module. Ask it to convert to the knowledge pack JSON format. Provide the schema from the technical spec as context.

**Option C: Author directly in JSON**

For smaller packs or updates, editing JSON directly is fine. Use a JSON editor with schema validation (VS Code with the JSON schema file).

### Step 5: Validate and Package

1. Run the validation checks listed in the technical spec (all ref_ids unique, all relationship refs resolve, all entity types valid)
2. Create the manifest.json from the template
3. Package everything into a `.anton` ZIP file
4. Test by importing into ANTON

---

## 4. Recommended Spreadsheet Structure

Use a Google Sheet or Excel workbook with these sheets:

### Sheet 1: "Entities"

| Column | Description | Example |
|--------|-------------|---------|
| ref_id | Unique ID (lowercase, hyphens) | `amlr-art-8` |
| entity_type | One of: regulation, control, risk, person, system, product, geography, organization, process, document | `regulation` |
| name | Full display name | `AMLR Article 8 — Business-Wide Risk Assessment` |
| canonical_name | Short reference name | `AMLR Article 8` |
| description | What this entity is/does (1–3 sentences) | `Requires obliged entities to carry out a business-wide risk assessment...` |
| regulation | Parent regulation | `AMLR 2024/1624` |
| article_number | Article number (if applicable) | `8` |
| chapter | Chapter name/number | `II — Risk-Based Approach` |
| eur_lex_url | Link to EUR-Lex (if applicable) | `https://eur-lex.europa.eu/eli/reg/2024/1624/oj#art_8` |
| status | Current status | `in_force` / `draft` / `consultation` / `superseded` |
| notes | Authoring notes (not exported) | `Check if paragraph 3 references Art 13 or Art 14` |

### Sheet 2: "Relationships"

| Column | Description | Example |
|--------|-------------|---------|
| from_ref | ref_id of source entity | `amlr-art-8` |
| to_ref | ref_id of target entity | `process-bwra` |
| relationship_type | Type of connection | `requires` |
| description | What this connection means | `Article 8 requires obliged entities to conduct BWRA` |
| strength | Confidence/importance (1.0–5.0) | `5.0` |
| paragraph | Specific paragraph reference | `8(1)` |
| obligation_level | mandatory / recommended / optional | `mandatory` |
| notes | Authoring notes (not exported) | `Verify exact paragraph reference` |

### Sheet 3: "Aliases"

| Column | Description | Example |
|--------|-------------|---------|
| ref_id | Entity this alias belongs to | `amlr-art-8` |
| alias | Alternative name | `Art. 8 AMLR` |

(One row per alias — an entity with 4 aliases has 4 rows.)

### Sheet 4: "Relationship Types Reference"

This is a reference sheet for the authoring team — what relationship types to use and when:

| Type | When to Use | Direction Convention |
|------|-------------|---------------------|
| `requires` | A mandates or necessitates B | Regulation → Process/Control |
| `references` | A mentions or points to B | Article → Article |
| `supersedes` | A replaces B | New regulation → Old regulation |
| `implements` | A puts B into practice | Control/Process → Regulation |
| `depends_on` | A cannot function without B | Process → System/Data |
| `supports` | A provides evidence or backing for B | Document → Process |
| `contradicts` | A conflicts with B | Regulation → Regulation |
| `part_of` | A is a component of B | Article → Chapter |
| `owns` | A is responsible for producing/managing B | Organization → RTS/Document |
| `mitigates` | A reduces the likelihood or impact of B | Control → Risk |

### Sheet 5: "Entity Types Reference"

| Type | When to Use | Examples |
|------|-------------|---------|
| `regulation` | Any legal instrument, article, or regulatory provision | AMLR Article 8, 4AMLD, RTS on risk variables |
| `process` | A procedure or workflow that organisations perform | BWRA, CDD, EDD, SAR filing |
| `control` | A specific safeguard or check | Transaction monitoring rule TM-001, PEP screening |
| `risk` | A threat or vulnerability | ML risk from cash-intensive business, TF risk from cross-border payments |
| `organization` | An institution or body | AMLA, EBA, FATF, specific FIU |
| `document` | A specific publication or report | FATF Recommendations, EU SNRA, EBA Risk Factors Guidelines |
| `person` | A role or named individual | MLRO, Compliance Officer, Board member |
| `system` | A technology platform or tool | Transaction monitoring system, KYC platform |
| `product` | A financial product or service | Wire transfers, correspondent banking, crypto custody |
| `geography` | A jurisdiction or region | High-Risk Third Countries list, EU member states |
| `client` | A specific institution (only if pack is institution-specific) | Usually not used in regulatory packs |

---

## 5. Conversion Tool

A simple conversion script that transforms the spreadsheet into the JSON pack format. This can be built by the team or by Claude Code as a utility.

### What the Converter Does

1. Reads the Excel/CSV spreadsheet
2. Validates all ref_ids are unique
3. Validates all relationship from_ref/to_ref exist in entities
4. Validates all alias ref_ids exist in entities
5. Generates entities.json, relationships.json, aliases.json
6. Generates manifest.json from a template + computed counts
7. Creates the `.anton` ZIP bundle

### Input

An Excel workbook (.xlsx) with the sheets described in Section 4.

### Output

A ready-to-import `.anton` bundle.

### Implementation Notes

This could be:
- A Python script using `openpyxl` (simplest)
- A Node.js script using the existing `exceljs` dependency
- An ANTON module itself (use the Coding Area Script Lite tier to run a conversion script)
- A standalone web tool (React single-page app that reads Excel and produces ZIP)

**Recommendation:** Build it as a Python script first (simple, fast to iterate). If the team ends up authoring many packs, upgrade to a nicer UI later.

---

## 6. AMLR Pack — Authoring Roadmap

### Phase 1: Core AMLR Articles (Day 1)

Focus on the articles that matter most for the Advisense team's daily work:

**Chapter II — Risk-Based Approach (Articles 7–12)**
- These are the foundation of every gap analysis
- High density of cross-references
- Priority: Map every internal cross-reference and every link to 4AMLD

**Chapter III — Customer Due Diligence (Articles 13–29)**
- CDD, EDD, simplified DD, PEPs, beneficial ownership
- Heavy cross-referencing between articles
- Links to RTS on customer identification, risk variables

**Chapter IV — Transaction Monitoring & Suspicious Reporting (Articles 30–39)**
- TM, SAR/STR filing, cooperation with FIUs
- Links to AMLA coordination role

**Target:** ~80 entities, ~250 relationships

### Phase 2: Complete AMLR + Key Links (Day 2)

**Remaining AMLR chapters:**
- Chapter I — General Provisions (Articles 1–6)
- Chapter V — Specific provisions (crypto, correspondent banking)
- Chapter VI — Beneficial ownership registers
- Chapter VII — Group policies
- Chapter VIII — Supervision
- Chapter IX — Sanctions
- Chapter X — Final provisions

**Cross-instrument links:**
- 4AMLD articles that AMLR supersedes (with specific mapping)
- AMLD6 articles that complement AMLR (supervisory powers)
- Key EBA guidelines being replaced

**Target:** ~150 entities, ~500 relationships

### Phase 3: RTS/ITS Hierarchy + AMLA Structure (Day 3)

**AMLA deliverables:**
- Every RTS and ITS listed in the Single Programming Document
- Timeline metadata (consultation phase, expected publication)
- Which AMLR article delegates to which RTS

**AMLA organisational structure:**
- Direct supervision powers
- Indirect supervision coordination
- FIU support and coordination role

**Processes and controls:**
- Standard compliance processes (BWRA, CDD, EDD, SAR, TM)
- How they connect to specific articles
- Key risk categories

**Target:** ~200 entities, ~700 relationships

### Phase 4: Quality Review (Day 4)

**Review and validate:**
- Cross-check every relationship against the actual regulation text
- Verify EUR-Lex URLs are correct and link to the right articles
- Check aliases against how the team actually refers to things
- Run the validation script
- Test import into ANTON
- Visualise in the knowledge graph — do the connections make sense?

**Peer review:**
- Have a second team member (Max or Petra) spot-check 20–30 relationships
- Focus on: Are the relationship types correct? Are there obvious missing connections?

---

## 7. Tips From Experience

### Cross-Reference Hunting

The most efficient way to find cross-references in EUR-Lex HTML:

1. Use browser search (Ctrl+F) for "Article" — every instance is a potential cross-reference
2. Also search for: "referred to in", "in accordance with", "pursuant to", "without prejudice to", "subject to", "for the purposes of", "as defined in", "within the meaning of"
3. When you find a cross-reference, note: which article you're in (from_ref), which article is referenced (to_ref), and what the nature of the reference is (relationship_type)

### Relationship Type Decisions

Some cross-references are ambiguous. Rules of thumb:
- If Article A says "obliged entities shall..." do something defined in Article B → `requires`
- If Article A says "as referred to in Article B" or "within the meaning of Article B" → `references`
- If Article A explicitly replaces provisions from an older directive → `supersedes`
- If Article A says AMLA shall develop technical standards → `owns` (AMLA → RTS) + `requires` (Article → RTS)

### Strength Scoring

For pack-authored relationships, use this scale:
- **5.0** — Explicit, unambiguous legal requirement ("shall", "must")
- **4.0** — Clear reference or connection ("referred to in", "in accordance with")
- **3.0** — Implied connection (articles that logically depend on each other but don't explicitly cross-reference)
- **2.0** — Contextual relationship (articles in the same chapter covering related topics)
- **1.0** — Weak/tangential connection

Most pack relationships should be 4.0 or 5.0 since you're mapping explicit legal text.

### Naming Conventions

**ref_id format:** `{instrument}-{type}-{number}`
- Articles: `amlr-art-8`, `4amld-art-8`, `amla-reg-art-12`
- RTS/ITS: `rts-risk-variables`, `its-reporting-format`
- Processes: `process-bwra`, `process-cdd`, `process-edd`
- Bodies: `org-amla`, `org-eba`, `org-fatf`
- Risks: `risk-ml-cash-intensive`, `risk-tf-cross-border`

**canonical_name format:** Keep it short and recognisable
- "AMLR Article 8" (not "Regulation (EU) 2024/1624 of the European Parliament and of the Council Article 8")
- "4AMLD" (not "Directive (EU) 2015/849")
- "AMLA" (not "Anti-Money Laundering Authority")

The long-form names go in the `aliases` — that's what they're for.

### Description Writing

Keep descriptions factual and concise (1–3 sentences). Focus on what the entity IS or DOES, not on interpretation or analysis. The description appears in the knowledge graph UI when you hover over a node.

Good: "Requires obliged entities to carry out a business-wide risk assessment identifying ML/TF risks, considering risk factors in Annexes II and III."

Too long: "Article 8 is one of the most important provisions in AMLR because it establishes the foundation for the risk-based approach. It requires..."

Too short: "BWRA article."

---

## 8. Future Packs — What Else Could Be Built

Once the AMLR pack exists and the infrastructure is proven, the same process can produce packs for:

| Pack | Audience | Estimated Size |
|------|----------|---------------|
| GDPR (Regulation 2016/679) | Data protection officers | ~150 entities, ~400 relationships |
| MiFID II / MiFIR | Securities compliance | ~200 entities, ~600 relationships |
| DORA (Digital Operational Resilience) | IT/Cyber compliance | ~100 entities, ~300 relationships |
| PSD2 / PSD3 | Payment services | ~120 entities, ~350 relationships |
| Basel III / CRR/CRD | Prudential regulation | ~250 entities, ~800 relationships |
| Swedish National AML Regulations | Swedish market (Finansinspektionen FFFS) | ~80 entities, ~200 relationships |
| FATF Recommendations | Global AML standard | ~60 entities, ~150 relationships |
| Sanctions Frameworks (EU/US/UK) | Sanctions compliance | ~100 entities, ~300 relationships |

Each of these follows the same process: article inventory → cross-reference mapping → alias collection → JSON conversion → validation → import.

The community can also contribute packs — that's the open-source multiplier. An Italian compliance team builds the Italian national transposition pack. A law firm builds the MiFID II pack. The Advisense team maintains the Nordic AML packs. These become shareable through the `.anton` format and eventually tradeable in the marketplace.

---

## 9. Quality Checklist — Before Submitting a Pack

Before marking a pack as ready for import, verify:

- [ ] Every article in the regulation has an entity (no gaps in article numbering)
- [ ] Every entity has a meaningful description (not just the title)
- [ ] All ref_ids are unique and follow naming conventions
- [ ] All relationship from_ref and to_ref resolve to valid entities
- [ ] Relationship types are used consistently (check the reference sheet)
- [ ] Every entity has at least 2–3 aliases
- [ ] EUR-Lex URLs are correct and resolve to the right article
- [ ] Cross-references have been verified against the actual regulation text (not from memory)
- [ ] The manifest.json has correct metadata (version, author, area_ids)
- [ ] The validation script passes with zero errors
- [ ] The pack has been test-imported into ANTON and visualised in the knowledge graph
- [ ] A second person has spot-checked at least 20 relationships for accuracy
