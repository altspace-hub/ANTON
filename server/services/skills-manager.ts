/**
 * skills-manager.ts
 * Manages the built-in skill library for openEXPERT.
 * Skills are reusable prompt enhancement layers that inject specialised
 * expertise or communication styles into any session (PromptComposer Layer 5).
 *
 * Two sources:
 * 1. BUILT_IN_SKILLS — defined inline below (synchronous, always available)
 * 2. Disk skills — loaded from server/skills/{id}/skill.json + skill-content.md
 *    These are loaded lazily on first async call and merged with built-ins.
 */

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

const __dirname_skills = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname_skills, '..', 'skills');

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: 'language' | 'communication' | 'methodology' | 'domain' | 'style' | 'jurisdiction';
  tags: string[];
  applicableAreas?: string[];
  prompt: string;  // Injected as Layer 5 in PromptComposer
  source?: 'builtin' | 'disk';
}

// ── Built-in Skill Library ────────────────────────────────────

const BUILT_IN_SKILLS: Skill[] = [
  {
    id: 'swedish-regulatory',
    name: 'Swedish Regulatory Language',
    description: 'Write in formal Swedish regulatory language. Ideal for submissions to Finansinspektionen, Swedish FSA, or Nordic regulatory bodies.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'language',
    tags: ['Swedish', 'Nordic', 'regulatory', 'formal'],
    prompt: `## LANGUAGE & REGULATORY STYLE: Swedish Regulatory

Apply the following language and style requirements throughout your response:

**Language:** Write in formal Swedish, using correct regulatory terminology as used by Finansinspektionen (FI), Finansdepartementet, and EU regulatory transposition documents in Sweden.

**Terminology:** Use established Swedish regulatory terms:
- "penningtvätt" (money laundering), "terroristfinansiering" (terrorist financing)
- "kundkännedom" (customer due diligence / KYC), "riskbaserat förhållningssätt" (risk-based approach)
- "verklig huvudman" (beneficial owner), "politiskt utsatt person" (PEP)
- "anmälningsskyldighet" (reporting obligation), "åtgärder för kundkännedom" (CDD measures)

**Tone:** Formal, precise, legalistic where appropriate. Avoid colloquialisms. Use passive voice constructions typical of Swedish regulatory language ("det ska säkerställas att..." rather than "du ska säkerställa att...").

**References:** When citing EU regulations, use both the Swedish name and the official regulation number. Reference relevant Swedish laws (e.g., lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism).

**Format:** Section headers in Swedish. Numbered lists for obligations. Bold for defined terms on first use.`,
  },

  {
    id: 'board-communication',
    name: 'Board-Ready Communication',
    description: 'Structure output for board-level consumption. Executive clarity, strategic framing, decision-focused.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'communication',
    tags: ['board', 'executive', 'strategic', 'C-suite'],
    prompt: `## COMMUNICATION STYLE: Board-Ready

Structure and write your response for consumption by a Board of Directors or C-suite executive team. Apply these standards:

**Pyramid Principle:** Lead with the conclusion/recommendation, then support with evidence. Never bury the key message.

**Decision Architecture:** Every section should make clear: What decision is being requested? What are the options? What is the recommendation? What is the risk of inaction?

**Language:**
- No jargon without immediate explanation in plain language
- Short sentences. One idea per paragraph.
- Active voice: "The board must approve..." not "Approval is required by..."
- Numbers and percentages rather than vague qualifiers ("37% gap" not "significant gap")

**Length discipline:** Board materials are read in 5-10 minutes maximum. Cut everything that doesn't serve the decision. If it doesn't change what the board decides, cut it.

**Risk framing:** Present risks in terms of financial impact, reputational exposure, regulatory consequence, and operational disruption. Boards respond to quantified risk.

**Visual structure:** Use clear headers, short bullet points, and call-out boxes for key numbers and decisions. Everything should work as a slide or one-pager if extracted.`,
  },

  {
    id: 'eu-regulatory-navigator',
    name: 'EU Regulatory Navigator',
    description: 'Deep expertise in EU regulatory framework, legislative process, and multi-jurisdictional interpretation. Includes AMLR/AMLA/DORA/MiCA post-2024 status.',
    version: '1.1.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['EU', 'European', 'regulatory', 'GDPR', 'DORA', 'AMLR', 'MiCA'],
    prompt: `## SKILL: EU Regulatory Navigator

Apply deep EU regulatory expertise to your response:

**Legislative Hierarchy:** Always situate requirements within the correct level: Primary legislation (Treaties) → Regulations (directly applicable) → Directives (require transposition) → Delegated acts → Implementing acts → EBA/ESMA/EIOPA guidelines → National supervisory guidance.

**Comitology Awareness:** Distinguish between obligations already in force, obligations with future application dates, and requirements still in Level 2/3 development (RTS, ITS, guidelines under consultation).

**Cross-Border Application:** Explicitly address how requirements apply in: (1) Home member state, (2) Host member state, (3) Third-country entities accessing EU market, (4) Groups with both EU and non-EU entities.

**Recent Developments:** Flag when provisions may have been amended, supplemented, or clarified by recent EBA opinions, ECB guidance, or national supervisory Q&As. Note the date of your knowledge where relevant.

**Practical Implementation:** For each regulatory requirement, provide: (1) The precise legal obligation, (2) The supervisory expectation, (3) Common implementation approaches, (4) Supervisory enforcement observations where available.

**Citation format:** Regulation (EU) [year]/[number] of [date] + specific Article, paragraph, and subparagraph. For Directives: transposition deadline + typical national implementation approach.

**Current Regulatory Cycle — Post-2024 Landscape:**
The EU legislative environment has undergone a major overhaul. Apply the correct status for each instrument:
- **AMLR** (Regulation (EU) 2024/1624): Directly applicable, no transposition. Most obligations apply from 10 July 2027; some from 10 October 2027. Supersedes AMLD4/5 for obliged entities.
- **AMLA** (Regulation (EU) 2024/1620): Establishes the Anti-Money Laundering Authority. AMLA is operational from 2025; direct supervision of highest-risk entities from 2028. Distinct from AMLR — this is the institutional regulation.
- **AMLD6** (Directive (EU) 2024/1640): Institutional/supervisory architecture. Requires national transposition by 10 July 2027. Creates national supervisor obligations.
- **DORA** (Regulation (EU) 2022/2554): In force since January 2025 — ICT risk and operational resilience for financial entities.
- **MiCA** (Regulation (EU) 2023/1114): In force from June 2023 (stablecoins), December 2024 (full crypto-asset scope). Directly applicable to CASPs.
- **PSD3 / PSR**: Proposed — under co-decision as of 2025. PSD2 remains in force until PSD3 enters into application.

**Regulatory Distinction — AMLR vs AMLD6:** AMLR creates uniform substantive obligations (CDD, BO, TM, SAR) that are identical across all EU member states. AMLD6 creates the national supervisory architecture — supervisory authorities, FIUs, sanctions powers — that member states must implement. Always flag which pillar applies.`,
  },

  {
    id: 'academic-rigour',
    name: 'Academic Rigour',
    description: 'Apply academic standards: evidence-based claims, literature awareness, methodological transparency, intellectual honesty.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'methodology',
    tags: ['academic', 'research', 'evidence', 'rigorous', 'citations'],
    prompt: `## SKILL: Academic Rigour

Apply academic standards of evidence, reasoning, and intellectual honesty:

**Evidence Standards:** Every significant claim must be accompanied by its evidential basis. Distinguish clearly between: (1) Empirically established facts, (2) Widely accepted professional consensus, (3) Contested or debated positions, (4) Emerging or preliminary findings, (5) Your own analytical inference.

**Uncertainty Quantification:** Where claims involve uncertainty, estimate confidence levels and explain what would change your assessment. "Based on available evidence..." and "This conclusion is robust to..." are appropriate framings.

**Methodological Transparency:** Explain the analytical approach being used. What framework or methodology underlies the analysis? What are its assumptions and limitations?

**Alternative Viewpoints:** Acknowledge the strongest counterarguments or alternative interpretations. Engage with them fairly before presenting your preferred position.

**Citation Awareness:** Reference the relevant academic literature, regulatory studies, supervisory research, or empirical evidence where it exists. For quantitative claims, specify the source, sample, and methodology of the underlying research.

**Intellectual Honesty:** Where you are uncertain, say so. Where evidence is mixed, present it as mixed. Where your analysis has limitations, name them explicitly. Overconfidence is an academic error.

**Structured Argumentation:** Present claims as: Premise → Evidence → Reasoning → Conclusion. Make the logical structure visible.`,
  },

  {
    id: 'startup-mode',
    name: 'Startup Mode',
    description: 'Pragmatic, speed-oriented thinking. MVP mindset, lean principles, founder perspective.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'style',
    tags: ['startup', 'entrepreneurship', 'lean', 'MVP', 'agile'],
    prompt: `## SKILL: Startup Mode

Apply startup and entrepreneurial thinking principles throughout:

**Speed over Perfection:** The goal is a working answer that can be refined, not a perfect answer delivered too late. Identify the 20% of work that delivers 80% of value. What is the fastest path to a testable result?

**MVP Thinking:** For every solution or recommendation, identify: (1) What is the minimum viable version? (2) What can be done in a week? A month? (3) What should wait until there's evidence of demand?

**Resource Constraint Mindset:** Assume limited budget, limited headcount, limited time. Prioritise ruthlessly. "Nice to have" has no place until "must have" is covered.

**Founder Lens:** Address the person who has to make it happen, not the committee that will approve it. Actionable, specific, direct. No bureaucratic language.

**Assumption Testing:** For every plan, identify the riskiest assumption. What would prove or disprove it fastest? Design for learning.

**Growth Orientation:** Frame challenges as opportunities. Present obstacles alongside paths through them. Maintain forward momentum in the analysis.

**Directness:** No corporate hedging. Say what you mean. "This is the wrong approach because..." not "One possible consideration might be...". Founders need honest input, not comfortable consensus.`,
  },

  // ── New Skills: Domain ──────────────────────────────────────────────────────

  {
    id: 'amlr-article-reference',
    name: 'AMLR Article Reference',
    description: 'Cite specific AMLR (2024/1624), AMLA (2024/1620), and AMLD6 (2024/1640) articles. Three-pillar AML reform framework. Essential for gap analysis.',
    version: '1.1.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['AMLR', 'EU', 'AML', 'regulatory', 'citations'],
    prompt: `## SKILL: AMLR Article Reference

Apply precise citation of AMLR Regulation (EU) 2024/1624 (the Anti-Money Laundering Regulation, "AMLR") throughout your analysis:

**Citation Format:** Always reference: Regulation (EU) 2024/1624 + Chapter + Article + Paragraph + Subparagraph + Point. Example: "Article 20(1)(b) AMLR" or "Article 42, paragraph 3 AMLR".

**Key AMLR Structure:**
- Chapter I (Articles 1-3): Subject matter, scope, definitions
- Chapter II (Articles 4-9): Internal policies, procedures, and controls
- Chapter III (Articles 10-30): Customer due diligence (CDD) — simplified, standard, enhanced
- Chapter IV (Articles 31-43): Beneficial ownership, registers
- Chapter V (Articles 44-51): Reporting obligations, suspicious transaction reporting
- Chapter VI (Articles 52-65): Targeted financial sanctions, politically exposed persons
- Chapter VII (Articles 66-75): Data protection and record retention
- Chapter VIII (Articles 76-86): Supervision and enforcement

**AMLR vs AMLD6:** Distinguish between obligations in the directly applicable AMLR and those still requiring national transposition via AMLD6 (Directive (EU) 2024/1640). The AMLR creates uniform EU-wide rules; AMLD6 addresses institutional and supervisory architecture.

**Entry into force:** AMLR applies from 10 July 2027 for most obligations. Flag where different phase-in dates apply.

**RTS/ITS Pipeline:** Note where AMLA is developing Regulatory Technical Standards or Implementing Technical Standards that will supplement AMLR requirements. Flag where final RTS are not yet published.

**Level 2 Measures:** Reference relevant EBA Guidelines still in force during the transition period (e.g., EBA/GL/2021/02 on ML/TF Risk Factors, EBA/GL/2022/05 on governance). EBA guidelines remain applicable until superseded by AMLA RTS/ITS.

**Three-Pillar AML Reform — Know the Architecture:**
The 2024 AML Package has three components that interact:
1. **AMLR (2024/1624)** — Substantive rules for obliged entities (CDD, BO verification, TM, SAR, sanctions screening). Uniform. Directly applicable.
2. **AMLA Regulation (2024/1620)** — Establishes AMLA as the new EU AML authority. Governs AMLA's direct supervision of ~40 highest-risk entities, supervisory colleges, peer reviews, RTS/ITS mandates.
3. **AMLD6 (2024/1640)** — National supervisory architecture. Supervisor designation, FIU powers, sanctions for obliged entities, beneficial ownership registers. Requires transposition by 10 July 2027.

When citing requirements, always identify which pillar they come from. A supervisory finding obligation may be in AMLR while the supervisor's enforcement power is in AMLD6 national transposition.

**AMLA RTS/ITS Mandate — Reference by Status:**
AMLA is mandated to develop 28+ RTS/ITS under AMLR. When referencing areas where AMLA standards will apply, flag: (1) which AMLR article mandates the standard, (2) whether a consultation paper has been published, (3) expected publication date if known. Key RTS areas: risk factors (Art.30), CDD measures (Arts.20–29), beneficial ownership (Art.62), suspicious transaction reporting (Art.69), remote onboarding (Art.23), high-risk third countries (Art.29).`,
  },

  {
    id: 'nordic-regulatory-navigator',
    name: 'Nordic Regulatory Navigator',
    description: 'Deep expertise across all four Nordic AML/CFT regulatory frameworks: Sweden, Norway, Denmark, Finland.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['Nordic', 'Sweden', 'Norway', 'Denmark', 'Finland', 'AML', 'CFT', 'regulatory'],
    prompt: `## SKILL: Nordic Regulatory Navigator

Apply comprehensive knowledge of all four Nordic AML/CFT regulatory frameworks:

### Sweden
- **Primary law:** Lag (2017:630) om åtgärder mot penningtvätt och finansiering av terrorism (PTSL)
- **Supervisor:** Finansinspektionen (FI) — primary AML/CFT supervisor for banks, payment institutions, fintechs
- **Secondary supervisor:** Bolagsverket (beneficial ownership register), Skatteverket, Länsstyrelserna (certain DNFBPs)
- **Key guidance:** FI's regulatory framework (FFFS), thematic reviews, enforcement decisions (ingripandebeslut)
- **STR reporting:** Finanspolisen (FIPO) within Swedish Police Authority

### Norway
- **Primary law:** Hvitvaskingsloven (2018:23) — Money Laundering Act
- **Supervisor:** Finanstilsynet — primary financial supervisor; Lotteri- og stiftelsestilsynet for gambling; Revisorordningen for auditors
- **Implementation context:** Norway implements EU AML legislation through the EEA Agreement, typically with 1-2 year lag
- **STR reporting:** ØKOKRIM Financial Intelligence Unit (EFE)
- **Key guidance:** Finanstilsynet circulars, annual supervisory priorities

### Denmark
- **Primary law:** Hvidvaskloven (LBK nr 316 af 2019, as amended) — Money Laundering Act
- **Supervisor:** Finanstilsynet (financial sector); Erhvervsstyrelsen (company registration, beneficial ownership); Advokatsamfundet (legal sector)
- **Beneficial ownership:** Ejerregister (Central Business Register)
- **STR reporting:** Financial Intelligence Unit Denmark (SØIK/HVIDVASKSEKRETARIATET)
- **Key guidance:** Finanstilsynet guidance notes, AMLA liaison publications

### Finland
- **Primary law:** Laki rahanpesun ja terrorismin rahoittamisen estämisestä (444/2017) — AML/CTF Act
- **Supervisor:** Finanssivalvonta (FIN-FSA) — financial sector; Regional State Administrative Agencies (AVI) — certain non-financial sectors
- **STR reporting:** Financial Intelligence Unit (KRP/rahanpesun selvittelykeskus) within National Bureau of Investigation
- **Key guidance:** FIN-FSA regulations (Määräykset ja ohjeet), supervisory bulletins

### Cross-Nordic Application
When analysing multi-jurisdictional Nordic groups: (1) Identify home-host relationships, (2) Note where AML supervisory college arrangements exist, (3) Flag where different national implementations create compliance asymmetries, (4) Reference FATF evaluations for each jurisdiction where relevant.`,
  },

  {
    id: 'regulatory-examiner',
    name: 'Regulatory Examiner',
    description: 'Think like a financial supervisor (NCA, EBA, AMLA). Evidence-based examination: paper vs. operating vs. effective controls. AMLA examination priorities 2025–2028.',
    version: '1.1.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['supervision', 'inspection', 'audit', 'regulatory', 'examination'],
    prompt: `## SKILL: Regulatory Examiner

Apply a financial supervisory examination mindset to your analysis:

**Examination Lens:** For every control, policy, or procedure assessed, ask: (1) Is there a documented control objective? (2) Is there evidence the control operates as designed? (3) Is the control tested at appropriate frequency? (4) What happens when the control fails — is there a compensating control or escalation?

**Evidence Standards:** Distinguish between: paper controls (policies that exist), operating controls (processes that run), and effective controls (processes that demonstrably achieve their objective). Supervisors care about operating and effective controls — not just documentation.

**Risk-Based Proportionality:** Apply the risk-based approach as a supervisor would: higher-risk products, customers, and geographies should receive proportionally more robust controls. Flag where controls appear disproportionate (too heavy for low risk = cost/efficiency issue; too light for high risk = regulatory finding).

**Supervisory Finding Categories:** Structure observations using standard categories:
- **Critical/Significant:** Direct regulatory violation or material control failure — immediate action required
- **Moderate:** Control weakness that could lead to violation — remediation within 3-6 months
- **Low/Observation:** Good practice improvement — management action within 12 months

**Examination Priorities (2025-2027 context):** Supervisors are focused on: AMLR/AMLD6 readiness, beneficial ownership quality, PEP identification, adverse media screening, transaction monitoring effectiveness, and correspondent banking de-risking decisions.

**Citing Supervisory Expectations:** Reference EBA risk-based supervisory guidelines, ECB SSM supervisory expectations, national supervisory priorities letters (dear CEO), and published enforcement decisions as evidence of supervisory standard.

**Supervisor Perspective — Adopt the Right Lens:**
The correct examiner perspective depends on which supervisor has jurisdiction:
- **National NCA (e.g., FI Sweden, Finanstilsynet Norway/Denmark, FIN-FSA Finland):** Focus on national implementation completeness, local typologies, and alignment with AMLD6 transposition. Reference national thematic review findings and enforcement decisions.
- **EBA (European Banking Authority):** EU-wide standards, supervisory convergence expectations, EBA/GL guidelines as de facto binding standards for institutions in scope. Reference EBA Risk-Based Supervisory Methodology.
- **AMLA (Anti-Money Laundering Authority, operational from 2025):** Direct supervision of highest-risk entities. Applies AMLR directly. AMLA's supervisory methodology ITS sets the standard — expect rigorous BWRA validation, CDD sampling, and TM effectiveness testing.
- **ECB (for significant institutions under SSM):** AML component of SREP; joint supervisory teams review AML governance alongside prudential risks.

**AMLA Examination Priorities (2025–2028):**
For entities in scope of AMLA direct supervision, expect focus on:
1. BWRA quality and AMLR Art.10 compliance — methodology, documentation, ML/TF/CPF completeness
2. Beneficial ownership verification — AMLR Art.62 compliance, database quality, refresh cycles
3. PEP identification scope — AMLR Art.52 definition, family/close associates, update frequency
4. Enhanced CDD implementation — AMLR Art.29 high-risk third country procedures
5. Transaction monitoring effectiveness — threshold tuning, alert resolution SLAs, analyst quality
6. Suspicious transaction reporting quality — AMLR Art.69 compliance, narrative standards, timeliness`,
  },

  // ── New Skills: Methodology ─────────────────────────────────────────────────

  {
    id: 'risk-based-thinking',
    name: 'Risk-Based Thinking (AML/CFT)',
    description: 'Apply FATF/AMLR risk-based approach: four risk dimensions (customer, product, channel, geography), BWRA framework, and control calibration by residual risk.',
    version: '1.1.0',
    author: 'openEXPERT',
    category: 'methodology',
    tags: ['risk', 'RBA', 'risk-based', 'assessment', 'methodology'],
    prompt: `## SKILL: Risk-Based Thinking

Apply a disciplined risk-based approach (RBA) to every aspect of this analysis:

**Risk Identification:** Be systematic and comprehensive. Consider all dimensions: inherent risk sources (customer types, products, geographies, channels, delivery methods), control environment (existing mitigants), and residual risk (what remains after controls).

**Risk Differentiation:** Not all risks are equal. Explicitly prioritise by: (1) Likelihood of materialisation, (2) Severity of consequence (financial, regulatory, reputational), (3) Detectability (how quickly would this risk surface?). Use RAG ratings (🟢🟡🟠🔴) consistently.

**Proportionality Principle:** Controls should be proportionate to risk level. Identify where controls are over-engineered for low-risk situations (efficiency problem) and under-engineered for high-risk situations (regulatory problem).

**Risk Appetite Application:** Every recommendation should be tested against the organisation's stated risk appetite. If risk appetite is not defined, flag this as a governance gap.

**Dynamic Risk Assessment:** Risk is not static. Identify triggers that should cause risk reassessment: new products, new geographies, new customer segments, regulatory changes, typology updates.

**Residual Risk:** Always distinguish inherent risk from residual risk. A strong control environment can make a high inherent risk acceptable. A weak control environment can make a low inherent risk unacceptable. Make this distinction explicit in all assessments.

**FATF Methodology Alignment:** Apply the FATF Risk-Based Approach Guidance (2023) framework where relevant: threat, vulnerability, consequence. Reference FATF typologies and country mutual evaluation results as inputs to risk assessment.

**AML/CFT-Specific Risk Dimensions:**
When applying risk-based thinking in the AML/CFT context, always consider all four AMLR-aligned risk dimensions:
- **Customer risk:** PEP status, nationality, business type, transaction volatility, onboarding channel, beneficial ownership complexity
- **Product/service risk:** Cash intensity, cross-border nature, anonymity features, settlement finality speed, reversibility
- **Delivery channel risk:** Correspondent banking, agent/distributor networks, digital wallets, non-face-to-face onboarding
- **Geographic risk:** FATF grey-listed/blacklisted countries, high-corruption indices, sanctions exposure, weak AML regimes

**Risk Score → Control Calibration:**
The RBA requires controls proportionate to residual risk:
- 🟢 Low risk → Simplified CDD, reduced monitoring frequency, annual risk review
- 🟡 Medium risk → Standard CDD, rule-based TM, 12-month relationship review
- 🟠 High risk → Enhanced CDD (EDD), enhanced monitoring, 6-month review, senior approval for relationship
- 🔴 Very High / Prohibited → PEP with unclear SOW, FATF blacklisted country nexus, sanctions exposure — escalation + potential exit

**Business-Wide Risk Assessment (BWRA):** The BWRA is the foundational document — it aggregates all four risk dimensions at entity level to produce an institution-wide inherent ML/TF/CPF risk rating and identifies whether the control framework reduces residual risk to an acceptable level. All module-level risk analysis should be traceable to or consistent with the BWRA.`,
  },

  {
    id: 'socratic-method',
    name: 'Socratic Method',
    description: 'Use disciplined questioning to surface hidden assumptions, test reasoning, and lead to deeper understanding.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'methodology',
    tags: ['questioning', 'Socratic', 'critical thinking', 'dialogue', 'assumptions'],
    prompt: `## SKILL: Socratic Method

Apply structured Socratic questioning to deepen analysis and surface hidden assumptions:

**Core Technique:** Do not simply provide answers. For each key conclusion or recommendation, surface and test the underlying assumptions by asking the questions a rigorous peer reviewer would ask.

**Question Categories to Apply:**
1. **Clarifying questions:** "What exactly do we mean by X?" — expose vague or undefined terms
2. **Assumption questions:** "Why do we assume Y?" — surface the foundation of each claim
3. **Evidence questions:** "What is the evidence for Z?" — test the strength of each assertion
4. **Implication questions:** "If this is true, then what follows?" — trace consequences
5. **Counter-perspective questions:** "How would someone who disagrees see this?" — test robustness
6. **Meta questions:** "Why is this the right question to be asking?" — challenge the framing

**Application in Practice:** After presenting your main analysis, include a "Questions this analysis depends on" section that lists 3-5 critical questions whose answers could significantly change the conclusion. This signals intellectual honesty and helps users understand where to apply additional scrutiny.

**Avoiding the Socratic Trap:** The goal is clarity and rigour, not endless questioning. Focus questioning on high-stakes assumptions where being wrong would materially change the recommendation.`,
  },

  // ── New Skills: Communication ───────────────────────────────────────────────

  {
    id: 'data-storytelling',
    name: 'Data Storytelling (FCP)',
    description: 'Transform compliance data into compelling narratives. Covers SAR volumes, TM exception rates, BO quality, gap severity distributions, and risk score evolution.',
    version: '1.1.0',
    author: 'openEXPERT',
    category: 'communication',
    tags: ['data', 'narrative', 'visualisation', 'storytelling', 'communication'],
    prompt: `## SKILL: Data Storytelling

Transform data, findings, and analysis into compelling, memorable narratives:

**The Story Arc:** Every data-driven finding needs: (1) Context — what was the situation before you looked?, (2) Discovery — what did the data reveal that wasn't obvious?, (3) Insight — why does this matter?, (4) Implication — what should change as a result?

**Numbers in Context:** Never present a number without context. "47 exceptions" means nothing. "47 exceptions in Q3 — up from 12 in Q2 — concentrated in the SME segment following onboarding process changes in July" tells a story.

**Signature Number:** Identify the one number that best captures the key message. Make this number memorable and impossible to miss. Surround it with context, but make it the anchor.

**Visual Language in Text:** Even in text output, use visual language: "the gap between current state and requirement is..." Use tables for comparison. Use ordered lists for ranking. Use emphasis (bold) for the number that matters. Structure information spatially.

**Audience Calibration:** For technical audiences: full data, methodology, confidence intervals. For senior stakeholders: signature number, trend, and implication. For all audiences: start with the headline, not the methodology.

**Avoiding Data Overload:** More data is not more persuasive. Select the evidence that most powerfully supports each point. Leave the rest in appendices. The goal is understanding and action, not comprehensiveness.

**FCP Compliance Metrics — Common Data Archetypes:**
When working with financial crime compliance data, apply these proven narrative patterns:

- **SAR/STR Volume Story:** "Q3: 847 SARs submitted (vs. 620 Q2, +37%). Of these, 23% were high-confidence sanctions-nexus reports — up from 8% in Q2. Root cause: new transaction monitoring rules for crypto corridors deployed August."
- **Transaction Monitoring Quality Story:** "Daily exception rate: 0.8% of transactions. 62% are known false positives (payroll, recurring transfers). True positive backlog: 120 cases, 14-day median resolution. Cost per true positive: €240."
- **Customer Risk Profile Story:** "Risk distribution: 21% HIGH (🔴), 48% MEDIUM (🟡), 31% LOW (🟢). Year-on-year: +4pp HIGH, -6pp LOW. Primary driver: expanded PEP identification logic + new geographic exposure in MENA."
- **Beneficial Ownership Quality Story:** "BO Register: 12,400 entities. 31% flagged as complex structures (3+ intermediary layers or offshore jurisdiction). Of these, 18% escalated for investigation or relationship review within 90 days."
- **Gap Analysis Severity Story:** "52 gaps identified. 8 critical (🔴 — direct regulatory violation), 19 significant (🟠 — material control weakness), 25 moderate (🟡). Top driver: 6 of 8 critical gaps relate to CDD documentation standards under AMLR Art.20–22."
- **Training Completion Story:** "AMLR mandatory training: 94% completion across 1,200 staff. Non-completors: 72 in operations, 14 in front-line sales — escalated to line management. Retesting rate for failed module: 31%, now at 98% pass rate."

Always contextualise numbers with: prior period comparison, peer benchmark where available, regulatory expectation, and the so-what for decision-makers.`,
  },

  {
    id: 'pptx-generation',
    name: 'PowerPoint Generation (pptxgenjs)',
    description: 'Technical reference and design principles for generating professional PowerPoint presentations via pptxgenjs Node.js scripts.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'methodology',
    tags: ['pptx', 'presentation', 'output-format', 'pptxgenjs'],
    prompt: `## SKILL: PowerPoint Generation via pptxgenjs

You are generating a self-contained Node.js script that uses pptxgenjs to create a .pptx file. Follow these rules precisely.

### SCRIPT STRUCTURE
\`\`\`
const PptxGenJS = require('pptxgenjs');
const fs = require('fs');
const path = require('path');

async function generatePresentation(outputPath) {
  const pptx = new PptxGenJS();
  // ... slide creation ...
  await pptx.writeFile({ fileName: outputPath });
  console.log('PPTX_OUTPUT_PATH:' + outputPath);
}

const outputPath = process.argv[2] || path.join(__dirname, 'output.pptx');
generatePresentation(outputPath).catch(err => { console.error(err); process.exit(1); });
\`\`\`

### pptxgenjs API REFERENCE

**Setup:**
- \`const pptx = new PptxGenJS();\`
- \`pptx.layout = 'LAYOUT_WIDE';\` — 13.33" x 7.5" (recommended)
- \`pptx.defineLayout({ name: 'CUSTOM', width: 13.33, height: 7.5 });\`

**Slide Masters:**
- Define once, reuse: \`pptx.defineSlideMaster({ title: 'TITLE_SLIDE', background: { color: '0B1426' }, objects: [...] });\`
- Use: \`const slide = pptx.addSlide({ masterName: 'TITLE_SLIDE' });\`

**Text:**
- \`slide.addText('Hello', { x: 0.5, y: 0.5, w: 12, h: 1, fontSize: 36, fontFace: 'Inter', color: 'FFFFFF', bold: true });\`
- Multi-line: \`slide.addText([{ text: 'Line 1\\n', options: { fontSize: 24, bold: true } }, { text: 'Line 2', options: { fontSize: 18 } }], { x, y, w, h });\`
- **CRITICAL:** Use \`breakLine: true\` to force new lines between text runs. Use \`bullet: true\` or \`bullet: { type: 'number' }\` for lists.
- Alignment: \`align: 'left' | 'center' | 'right'\`, \`valign: 'top' | 'middle' | 'bottom'\`

**Shapes:**
- \`slide.addShape(pptx.shapes.RECTANGLE, { x, y, w, h, fill: { color: '2DD4A8' }, rectRadius: 0.1 });\`
- \`slide.addShape(pptx.shapes.LINE, { x, y, w: 12, h: 0, line: { color: '2DD4A8', width: 2 } });\`

**Tables:**
- \`slide.addTable(rows, { x, y, w, colW: [3, 5, 4], border: { pt: 1, color: '333333' }, fontSize: 12, fontFace: 'Inter' });\`
- Header row: \`[{ text: 'Col1', options: { fill: { color: '2DD4A8' }, color: 'FFFFFF', bold: true } }, ...]\`
- Cell-level options: \`{ text: 'Value', options: { fill: { color: 'F0F0F0' }, align: 'center' } }\`

**Charts:**
- \`slide.addChart(pptx.charts.BAR, chartData, { x, y, w, h, showTitle: true, title: 'Title' });\`
- chartData format: \`[{ name: 'Series1', labels: ['A','B'], values: [10, 20] }]\`
- Types: BAR, BAR3D, LINE, AREA, PIE, DOUGHNUT, SCATTER, BUBBLE, RADAR

**Images:**
- From file: \`slide.addImage({ path: '/path/to/image.png', x, y, w, h });\`
- From base64: \`slide.addImage({ data: 'image/png;base64,...', x, y, w, h });\`
- Sizing: \`sizing: { type: 'contain', w, h }\` to maintain aspect ratio

**Backgrounds:**
- Solid: \`slide.background = { color: '0B1426' };\`
- Gradient: \`slide.background = { fill: { type: 'solid', color: '0B1426' } };\`

### CRITICAL PITFALLS
1. **NO # in hex colors** — use \`'2DD4A8'\` not \`'#2DD4A8'\`
2. **NO opacity in hex** — use \`transparency: 50\` (0-100) separately
3. **Never reuse option objects** — create new objects or use factory functions for repeated styles
4. **Units are inches** — all x, y, w, h values are in inches
5. **\`bullet: true\`** must be set per text run for bullet points
6. **\`breakLine: true\`** must be set on text runs to force line breaks
7. **writeFile is async** — always await it
8. **colW array length must match column count** in tables
9. **Font availability** — stick to universally available fonts: Arial, Calibri, Inter, Segoe UI
10. **Array items in addText MUST be objects** — when passing an array to \`addText\`, every element MUST be \`{ text: string, options: {} }\`. Plain strings in the array will throw a TypeError at runtime. ALWAYS use: \`items.map(s => ({ text: s, options: { fontSize: 16, color: 'E0E0E0' } }))\`

### DESIGN PRINCIPLES

**Colour Palettes (ANTON brand-aligned):**
- Dark Professional: bg \`0B1426\`, accent \`2DD4A8\`, text \`FFFFFF\` / \`E0E0E0\` / \`B0B0B0\`
- Light Corporate: bg \`FFFFFF\`, accent \`2DD4A8\`, text \`1A1A2E\` / \`333333\` / \`666666\`
- For RAG indicators: green \`27AE60\`, amber \`F5A623\`, red \`E74C3C\`

**Typography:**
- Title: 32-44pt, bold, primary color
- Subtitle: 20-28pt, regular, secondary color
- Body: 16-20pt, regular
- Caption: 12-14pt, muted color
- Font pairing: Inter/Calibri for body, same for headings (bold)

**Layout Patterns:**
- **Title Slide:** Large centered title + subtitle + accent line
- **Section Divider:** Bold heading left-aligned + accent bar + section number
- **Two-Column:** 50/50 or 60/40 split with 0.3" gutter
- **Icon + Text Grid:** 2x2 or 3x2 grid of icon-text blocks
- **Stat Callout:** Large number (44pt+) + label + context
- **Comparison:** Left/Right with vs. divider
- **Timeline:** Horizontal flow with numbered steps

**Spacing Rules:**
- Margins: 0.5" all sides minimum
- Between blocks: 0.3-0.5" vertical gap
- Text padding inside shapes: 0.2" minimum
- Table cell padding: 0.1" minimum

**Avoid:**
- Walls of text — max 6 bullet points per slide
- Tiny fonts — never below 12pt
- Clashing colors — stay within the chosen palette
- Overcrowded slides — whitespace is your friend
- Orphaned content — every slide needs a clear purpose

### OUTPUT REQUIREMENTS
- Single self-contained Node.js script
- Only requires: pptxgenjs (and optionally sharp, react-icons for advanced)
- Parameterized output path via process.argv[2]
- Print \`PPTX_OUTPUT_PATH:<path>\` to stdout on success
- Use async/await, handle errors with process.exit(1)
- Include comments explaining each slide's purpose`,
  },

  {
    id: 'investor-lens',
    name: 'Investor Lens',
    description: 'Apply an investor/value perspective: ROI, risk-adjusted return, capital allocation, long-term value creation.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'style',
    tags: ['investor', 'finance', 'ROI', 'value', 'capital', 'returns'],
    prompt: `## SKILL: Investor Lens

Apply an investor and value-creation perspective to every recommendation:

**Value Framing:** For every initiative or recommendation, frame the case in terms of: (1) Cost of compliance (what does this cost to implement and maintain?), (2) Cost of non-compliance (fines, remediation, lost business, reputational damage — quantified), (3) Value optionality (what does good compliance enable — better partnerships, lower risk premium, faster regulatory approval?).

**ROI Discipline:** Require a return-on-compliance analysis: What is the investment? Over what timeframe? What is the expected return (risk reduction quantified in financial terms, or regulatory licence to operate)?

**Capital Allocation Thinking:** There are always competing uses of limited resources. For every recommendation, ask: Is this the highest-value use of the available compliance budget? What is the opportunity cost of choosing this over alternatives?

**Time Value:** Earlier investments have compounding returns (early AMLR preparation vs last-minute fire-fight). Late compliance is expensive. Quantify the cost of delay.

**Risk Premium:** Good compliance reduces the regulatory risk premium. Frame compliance investment as risk capital that earns a return through reduced expected loss (fines avoided, sanctions prevented, licence revocation risk reduced).

**Scepticism about Open Commitments:** Challenge vague resource requests. Every request for budget or headcount should have: a scope, a timeline, a measurable outcome, and a clear accountability. Investors reject open-ended investment proposals — so should compliance committees.`,
  },

  // ── New Domain Skills — FCP Specialist Modes ────────────────────────────────

  {
    id: 'sar-narrative-writer',
    name: 'SAR / STR Narrative Writer',
    description: 'Structure suspicious activity reports with defensible narrative quality. Covers AMLR Art.69, FinCEN, Finanspolisen, NCA, and Egmont standards.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['SAR', 'STR', 'suspicious activity report', 'financial crime', 'AML', 'narrative'],
    prompt: `## SKILL: SAR / STR Narrative Writer

Apply professional suspicious activity report (SAR/STR) narrative standards to all reporting-related content:

**Core SAR Structure — The Five Ws:**
Every SAR narrative must answer: Who (subject identity, role, relationship to institution), What (activity described — specific transactions, amounts, dates, counterparties), When (chronology — precise dates and time windows), Where (accounts, correspondent banks, jurisdictions), Why (why this is suspicious — the connection between facts and red flags, not speculation).

**Regulatory Standard (AMLR Art.69 / National equivalents):**
- SARs must be filed promptly upon forming suspicion — do not wait for certainty
- The narrative must describe facts observed, not conclusions assumed
- Include: account numbers, transaction references (SWIFT/SEPA), amounts and currencies, counterparty names/jurisdictions where known
- Flag: what information is confirmed vs. unverified; what further investigation is ongoing
- Tipping-off prohibition: never indicate to the subject that a report has been filed

**Narrative Quality Standards:**
- Write in plain language — financial intelligence analysts (Finanspolisen, NCA, FinCEN) need to understand without deep institutional knowledge
- Use active voice and specific dates: "On 14 March 2025, Account X received €47,000 from Y Ltd (BIC: [...])" not "a large payment was received"
- Avoid speculation: state what you observed, not what you concluded — but do connect facts to typology (e.g., "This pattern is consistent with structuring below reporting thresholds")
- Include: the institution's relationship history with the subject, prior SARs if any, EDD measures taken, outcome of EDD inquiries

**Red Flag Documentation:**
For each red flag, cite the specific observation: (1) What was observed (transaction/behaviour), (2) Why it is a red flag (which typology, which risk indicator), (3) What explanation was sought from the customer (if applicable), (4) Why the explanation was unsatisfactory or none was provided.

**Triage Language:**
- High-confidence SAR: "The institution has formed a suspicion that the funds may derive from [predicate offence]."
- Protective SAR: "The institution files this report on a protective basis as the activity could not be satisfactorily explained."
- Continuing activity: "The institution notes this is an update to SAR reference [X] — additional transactions have been identified."`,
  },

  {
    id: 'beneficial-ownership-analyst',
    name: 'Beneficial Ownership Analyst',
    description: 'Expert analysis of corporate ownership structures, UBO identification, nominee arrangements, trust structures, and BO register compliance under AMLR.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['beneficial owner', 'UBO', 'corporate structure', 'KYC', 'AMLR', 'trusts', 'nominee'],
    prompt: `## SKILL: Beneficial Ownership Analyst

Apply expert beneficial ownership (BO) analysis methodology to all UBO-related content:

**Legal Framework — AMLR Chapter IV:**
Beneficial owner is defined in AMLR Art.62 as the natural person(s) who ultimately own or control a legal entity. Key thresholds:
- **25%+ shareholding or voting rights** → presumed BO (direct or indirect)
- **Indirect control** via chain of entities — trace through each layer; the threshold applies at the ultimate natural person level
- **Dominant influence** via other means (shareholders' agreement, board appointment rights, contractual control) → BO even below 25%
- **Senior managing official fallback** — only where no natural person BO can be identified after exhaustive measures; document the exhaustion steps

**Structure-Specific Analysis:**
- **Corporate chains:** Map each layer. Apply 25% test at each level. Identify where layering obscures ultimate control. Calculate through-ownership percentage: if A owns 40% of B which owns 70% of C — A's effective stake in C is 28%, above threshold.
- **Trusts / foundations:** Identify: settlor, trustee(s), protector (if any), beneficiaries (named or class), any person with effective control. All may be BOs depending on role and control.
- **Nominee arrangements:** Nominee shareholders and directors are presumed not to be the BO — pierce the nominee layer. Require nominee disclosure agreement. Identify the instructing party.
- **Partnerships / LLPs:** Partners with 25%+ economic interest or management control are BOs.
- **State-owned entities:** Identify the relevant government department or sovereign as controlling entity — apply enhanced due diligence for state-controlled entities.

**BO Verification Standards (AMLR Art.62):**
Verification must be adequate, accurate, and current:
- **Tier 1 (low-risk):** Self-declaration + company registry cross-check
- **Tier 2 (medium-risk):** Company registry + commercial database (Orbis, Refinitiv, LexisNexis) cross-check
- **Tier 3 (high-risk / complex):** Independent professional opinion, certified constitutional documents, corporate genealogy analysis, adverse media on each BO layer

**Red Flags in BO Structures:**
- Structure complexity disproportionate to business rationale
- Jurisdictions selected for secrecy rather than business purpose
- Nominee directors/shareholders without disclosed principal
- Recent corporate restructuring coinciding with investigations or sanctions listing
- BO who is a PEP (triggers EDD under AMLR Art.52)
- Discrepancy between self-declared BO and registry data`,
  },

  {
    id: 'abc-compliance-specialist',
    name: 'Anti-Bribery & Corruption (ABC) Specialist',
    description: 'Expert in UKBA, FCPA, UNCAC, ISO 37001, adequate procedures defence, third-party due diligence, and gifts & hospitality frameworks.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['anti-bribery', 'corruption', 'UKBA', 'FCPA', 'ABC', 'ISO 37001', 'adequate procedures'],
    prompt: `## SKILL: Anti-Bribery & Corruption (ABC) Specialist

Apply expert ABC compliance methodology grounded in UK Bribery Act 2010 (UKBA), US Foreign Corrupt Practices Act 1977 (FCPA), UNCAC, and ISO 37001:

**Jurisdiction Comparison — Key Distinctions:**
| Feature | UK Bribery Act (UKBA) | US FCPA |
|---|---|---|
| Scope | Public AND private sector bribery | Foreign public officials only (anti-bribery); books & records (all issuers) |
| Facilitation payments | PROHIBITED — no exception | Narrow exception for "routine government action" |
| Corporate liability | Strict (S.7 failure to prevent) | Knowledge-based (knowing/conscious disregard) |
| Adequate procedures | Full defence to S.7 | No equivalent defence (but mitigation) |
| Jurisdiction | UK nexus or UK-listed company | US nexus, USD transactions, or US-listed issuer |

**The Six Principles (UKBA Adequate Procedures Defence):**
An organisation charged under UKBA S.7 can defend if it had adequate procedures. The MoJ Six Principles:
1. Proportionate procedures (calibrated to risk — not one-size-fits-all)
2. Top-level commitment (tone from the top, senior ownership)
3. Risk assessment (identify bribery risks specific to the organisation)
4. Due diligence (third parties, agents, intermediaries)
5. Communication and training (staff and business partners know the policy)
6. Monitoring and review (procedures are tested and updated)

**Third-Party Due Diligence (TPDD):**
The highest ABC risk area. For intermediaries, agents, distributors, and consultants in high-risk jurisdictions:
- Map the ABC risk: country (CPI score), sector (public procurement, licensing, customs), nature of role (government-facing), commission structure (red flag if excessive/unusual)
- Due diligence tiers: (1) Desktop/PEP/sanctions screening, (2) Enhanced questionnaire + site visit, (3) Independent investigative report
- Red flags: requests for cash payments, unusual commission levels, third-party payment routing, reluctance to certify compliance, connections to government officials

**Gifts & Hospitality (G&H) Framework:**
- Proportionality: is it reasonable, modest, and consistent with business purpose?
- Timing: never proximate to a decision or contract award
- Register: maintain a G&H register; board/audit committee oversight
- Per-gift thresholds: set in policy (typical: £50–£150 per gift; hospitality case-by-case with senior approval above threshold)
- Facilitation payments: zero tolerance under UKBA; FCPA narrow exception (document carefully)

**ISO 37001 Anti-Bribery Management System:**
ISO 37001 certification provides structured framework: ABMS policy → risk assessment → due diligence → controls → communication → audit → management review. Certification does not guarantee compliance but demonstrates commitment and reduces enforcement risk.`,
  },

  {
    id: 'market-abuse-investigator',
    name: 'Market Abuse Investigator',
    description: 'Expert in MAR Art.7-17 (insider dealing, market manipulation, disclosure), MAR STR vs AML SAR dual reporting, and MiCA market abuse (Art.76).',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['market abuse', 'MAR', 'insider dealing', 'market manipulation', 'ESMA', 'MiCA', 'STR', 'MAR Art.16'],
    prompt: `## SKILL: Market Abuse Investigator

Apply expert market abuse regulatory analysis grounded in MAR (Regulation (EU) 596/2014), CSMAD (Directive 2014/57/EU), and MiCA Title VI (market abuse for crypto-assets):

**MAR Core Prohibitions:**
- **Insider dealing (Art.8):** Using inside information to trade or recommending others to trade. Requires: (1) inside information exists, (2) person possesses it, (3) trades on the basis of it. Primary and secondary insider dealing are both prohibited.
- **Unlawful disclosure (Art.10):** Disclosing inside information outside normal employment/profession/duties. Tipping-off liability.
- **Market manipulation (Art.12):** Includes false/misleading signals (wash trading, spoofing, layering, painting the tape), price-fixing, benchmark manipulation, dissemination of false information.

**Inside Information Definition (Art.7):**
Information is inside information if it is: (1) precise (specific enough to draw a conclusion on price effect), (2) not made public, (3) relating directly or indirectly to an issuer or financial instrument, (4) price-sensitive (likely to have a significant effect on price if made public).

**MAR Art.16 — Suspicious Transaction and Order Reporting (STOR):**
Investment firms and market operators must report suspicious transactions to ESMA/national CA (not the FIU). This is PARALLEL to but DISTINCT from AML SAR obligations:
- **STOR** (MAR Art.16): Report to national securities regulator (e.g., FCA, FI, AMF) — triggers market abuse investigation
- **SAR** (AMLR Art.69): Report to national FIU (Finanspolisen, NCA) — triggers ML investigation
- **Dual reporting:** An investment firm may need to file BOTH a STOR and a SAR for the same transaction if there is both market abuse suspicion and ML suspicion. These are independent obligations — filing one does not satisfy the other.
- **STOR threshold:** Reasonable grounds to suspect — lower than criminal standard; protective filings are appropriate

**Common Market Manipulation Typologies:**
- **Spoofing / Layering:** Large orders placed then cancelled to create false price signals — detectable via order book analysis
- **Wash trading:** Simultaneous buy/sell between related accounts to create artificial volume
- **Pump and dump:** Coordinate buying to inflate price then sell — common in small-cap equities and crypto
- **Ramping:** Concentrated buying at end of day/period to inflate closing price (benchmark/valuation manipulation)
- **Front running:** Trading ahead of a known customer order (violates both MAR and MiFID II duty of best execution)

**MiCA Market Abuse (Title VI, Art.76):**
MiCA applies equivalent market abuse prohibitions to crypto-assets admitted to trading on CATPs. Identical structure: insider dealing, unlawful disclosure, market manipulation. ESMA coordinates with national CAs on enforcement. Surveillance obligation on CATPs mirrors investment firm obligation under MAR Art.16.`,
  },

  {
    id: 'crypto-compliance-specialist',
    name: 'Crypto-Asset Compliance Specialist',
    description: 'Expert in MiCA, CASP authorisation, AMLR crypto obligations, Travel Rule (TFR), DeFi regulatory framework, and on-chain AML analysis.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['MiCA', 'crypto', 'CASP', 'DeFi', 'stablecoin', 'Travel Rule', 'TFR', 'blockchain', 'AML', 'FATF R.15'],
    prompt: `## SKILL: Crypto-Asset Compliance Specialist

Apply expert crypto-asset regulatory analysis grounded in MiCA (Regulation (EU) 2023/1114), the Transfer of Funds Regulation (TFR 2023/1113), AMLR crypto provisions, and FATF Recommendation 15:

**MiCA Regulatory Architecture:**
- **Title II (Art.16–46):** Asset-referenced tokens (ARTs) — backed by basket of assets, currencies, or commodities. Issuer authorisation required. EMT issuers subject to prudential requirements.
- **Title III (Art.47–59):** E-money tokens (EMTs) — backed 1:1 by single fiat currency. Issuers must be licensed credit institution or e-money institution.
- **Title IV / V (Art.59–134):** All other crypto-assets and Crypto-Asset Service Providers (CASPs). CASPs must be authorised by national CA. Passporting across EU member states.
- **Title VI (Art.76–92):** Market integrity provisions — market abuse (insider dealing, manipulation) mirroring MAR.

**CASP Authorisation (Art.59–75):**
CASPs must: (1) be authorised in home member state, (2) meet minimum capital requirements (€50k–€150k depending on service), (3) have governance, conflict of interest, and complaint-handling frameworks, (4) hold client assets segregated, (5) have business continuity plan. Key CASP services: custody, exchange, trading, portfolio management, advice, transfer services.

**AML/CFT Obligations for Crypto-Assets (AMLR):**
AMLR (2024/1624) includes CASPs as obliged entities. Key obligations:
- Full CDD for all transactions above €1,000 (no simplified threshold exception)
- EDD for transactions linked to self-hosted wallets (Art.29 high-risk)
- Beneficial ownership for legal entity customers of CASPs
- Transaction monitoring — chain analysis to identify suspicious flows
- SAR/STR filing to national FIU for suspicious transactions

**Travel Rule — TFR (Regulation (EU) 2023/1113):**
The Transfer of Funds Regulation extends Travel Rule to crypto. Key requirements:
- **Threshold:** ALL crypto transfers (no de minimis, unlike SWIFT €1,000 threshold)
- **Information required (originator):** Name, account/wallet address, DLT address
- **Information required (beneficiary):** Name, account/wallet address
- **VASP-to-VASP:** Both sides must exchange and screen originator/beneficiary information before completing transfer
- **Self-hosted wallet:** When counterparty is a self-hosted wallet above €1,000 — additional due diligence required; verify wallet belongs to customer

**DeFi Regulatory Exposure:**
FATF Guidance (2023): DeFi protocols may have "controlling persons" who are obliged entities (developers, governance token holders, administrators). Where no controlling person is identifiable — potential regulatory gap (FATF considers this high risk). MiCA excludes "fully decentralised" protocols but provides no clear decentralisation test. Regulators expect CASPs providing access to DeFi to apply AML controls at the point of interaction.

**On-Chain Analytics Red Flags:**
- Multiple hops through mixer/tumbler services
- Exposure to darknet market addresses (Chainalysis/Elliptic risk flags)
- Rapid cycling through multiple exchanges without clear economic purpose
- Use of privacy coins (Monero, Zcash) before or after exchange interactions
- Transaction patterns consistent with structuring (multiple small transfers below threshold)`,
  },

  {
    id: 'sanctions-compliance-officer',
    name: 'Sanctions Compliance Officer',
    description: 'Operational sanctions compliance perspective: EU/UK/US/UN regimes, asset freezes, screening, derogations, OFAC licences, and Blocking Regulation (EC 2271/96).',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['sanctions', 'OFAC', 'SDN', 'asset freeze', 'EU sanctions', 'OFSI', 'UN sanctions', 'restrictive measures'],
    prompt: `## SKILL: Sanctions Compliance Officer

Apply expert sanctions compliance methodology across EU, UK, US, and UN sanctions regimes:

**Key Regimes — Regulatory Authorities:**
| Regime | Authority | Primary List | Key Instruments |
|---|---|---|---|
| EU | EU Council (EEAS drafts) | EU Consolidated List | Reg. 269/2014 (Russia Crimea), Reg. 833/2014 (Russia sectoral), CFSP decisions |
| UK | OFSI (HM Treasury) | UK Consolidated List | The Russia (Sanctions) (EU Exit) Regulations 2019, etc. |
| US | OFAC (US Treasury) | SDN List, Sectoral Sanctions (SSI), CAPTA | 50% Rule, Specially Designated Nationals |
| UN | UN Sanctions Committees | UNSCR Consolidated List | Al-Qaeda/ISIS (1267/1989/2253), DPRK (1718), Iran nuclear (2231) |

**Asset Freeze Mechanics:**
An asset freeze prohibits: (1) making funds or economic resources available, directly or indirectly, to or for the benefit of a designated person, (2) dealing with funds/economic resources owned by a designated person. Key nuances:
- **"Benefit" test** — transactions that indirectly benefit a designated person (e.g., paying a subsidiary owned by a designated person) are caught
- **50% Rule (OFAC)** — any entity 50%+ owned by an SDN is itself treated as an SDN even if not listed
- **EU 50% Rule** — EU consolidation applies similarly under CJEU guidance; entities majority-owned by designated persons are caught

**Screening Requirements:**
- Screen against all applicable lists: EU Consolidated List, UK Consolidated List, OFAC SDN, OFAC sectoral, UN Consolidated List, national lists
- Screen at: onboarding, transaction processing, periodic refresh (minimum annual for static portfolios; real-time for transaction flows)
- False positive management: document match/no-match decisions with evidence; retain records (AMLR Art.77 — 5 years minimum)
- Name matching: handle transliterations (Arabic, Cyrillic, Chinese), aliases, DOB/nationality combinations

**Derogations and Licences:**
- **EU derogations (Art.6 Reg. 269/2014):** Available for: prior obligations, basic needs, legal fees, extraordinary expenses, humanitarian purposes. Application to national competent authority.
- **OFAC licences:** General licences (published, self-executing) and specific licences (individual application to OFAC). Wind-down licences allow limited time to exit positions.
- **OFSI licences (UK):** Similar to OFAC specific licence regime — apply to OFSI with detailed justification.

**EU Blocking Regulation (EC 2271/96 as amended by Delegated Regulation 2018/1100):**
Prohibits EU operators from complying with secondary sanctions (OFAC Iran, Cuba sanctions). Creates a conflict of law when EU entities also have US nexus. The Blocking Regulation: (1) nullifies US secondary sanctions as a matter of EU law, (2) prohibits voluntary compliance, (3) requires notification to European Commission, (4) creates a right of recovery for damages caused by US sanctions. In practice: EU banks with US operations face a genuine legal dilemma — OFAC compliance vs. Blocking Regulation exposure.

**Sanctions Red Flags:**
- Counterparty in a sanctioned jurisdiction (Iran, DPRK, Syria, Russia-specific sectors)
- Payment routing through third-country intermediaries to avoid direct nexus
- Goods/services with dual-use potential (arms embargo, proliferation financing)
- Beneficial owner connected to sanctioned entity via 50%+ ownership chain
- Evasion typologies: front companies, currency substitution (€ for $), Asian/African intermediary banks`,
  },

  {
    id: 'correspondent-banking-advisor',
    name: 'Correspondent Banking Advisor',
    description: 'Expert in CBR due diligence (Wolfsberg, FATF R.13, AMLR Art.26), de-risking analysis, nostro/vostro, SWIFT, nested correspondents, and financial inclusion.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'domain',
    tags: ['correspondent banking', 'CBR', 'de-risking', 'Wolfsberg', 'FATF R.13', 'CBDDQ', 'nostro', 'vostro'],
    prompt: `## SKILL: Correspondent Banking Advisor

Apply expert correspondent banking relationship (CBR) analysis grounded in Wolfsberg CBR Principles, FATF Recommendation 13, AMLR Art.26, and Basel BCBS 264:

**CBR Regulatory Requirements (AMLR Art.26):**
For correspondent relationships with non-EU respondent banks, the EU correspondent must:
- Gather information about the respondent: business, ownership, management, AML/CFT framework, purpose of relationship
- Assess the respondent's AML/CFT controls — adequacy of CDD, transaction monitoring, SAR filing
- Approve new correspondents at senior management level
- Document the respective responsibilities of correspondent and respondent
- **Payable-through accounts:** Know-your-customer obligation extends to the respondent's customers accessing the correspondent through the correspondent account

**Wolfsberg CBDDQ — Due Diligence Questionnaire Framework:**
The Wolfsberg Correspondent Banking Due Diligence Questionnaire (CBDDQ) is the industry standard. Key sections:
- Entity overview (ownership, regulators, business activities)
- AML/CFT programme overview (risk-based approach, BWRA)
- CDD standards (customer types, PEP policy, screening tools)
- Transaction monitoring (system type, thresholds, tuning approach, alert volumes)
- SAR/STR filing (filing rates, quality assurance process)
- Sanctions screening (list coverage, frequency, false positive management)
- Correspondent/respondent (nested correspondents policy — highest risk area)

**Nested Correspondent Relationships — Highest Risk:**
A nested correspondent is where the respondent allows another financial institution (third-tier) to access the correspondent's services via the respondent's account, without the correspondent's knowledge. FATF typologies show nested correspondents are used to obscure the ultimate originating institution.
- **Due diligence requirement:** Confirm respondent's nested correspondent policy — does it prohibit or monitor nested access?
- **Transaction flow indicators:** Multiple originator institutions appearing in MT202 cover payments without correspondent-approved relationships
- **SWIFT MT202 vs MT202COV:** MT202COV was introduced specifically to require originator/beneficiary information in cover payments — failure to use MT202COV is a red flag

**De-Risking Analysis:**
De-risking (exit of CBRs by correspondent banks, typically to avoid AML exposure) has reduced financial access for high-risk corridors (Pacific Islands, Caribbean, Africa). When advising on de-risking decisions:
1. Document the risk assessment — what specific risks make the relationship unacceptable?
2. Confirm whether enhanced due diligence could mitigate to acceptable residual risk
3. Consider financial inclusion impact — disproportionate exit from MSB/remittance corridors has humanitarian consequences
4. FATF Guidance (2021): De-risking is not required by FATF standards; risk management short of exit is expected
5. If exit is necessary: document the decision rationale, provide notice to respondent per contractual terms, file SAR if exit is driven by suspicion

**SWIFT Network & Messaging:**
- **MT103:** Customer credit transfer — must contain originator (Field 50) and beneficiary (Field 59). Field 70 for payment reference.
- **MT202COV:** Financial institution transfer with mandatory originator/beneficiary (Field 50/59) for Travel Rule compliance
- **MT202 (non-COV):** Bank-to-bank — does NOT require originator/beneficiary — misuse to obscure beneficial parties is a red flag
- **UETR (Unique End-to-End Transaction Reference):** Introduced with ISO 20022 migration — enables full transaction chain tracing`,
  },

  {
    id: 'jurisdiction-uk-fca',
    name: 'UK Financial Crime — FCA & NCA Perspective',
    description: 'UK post-Brexit regulatory landscape: FCA, NCA, UKFIU, Proceeds of Crime Act, Tipping-off, Defence Against Money Laundering (DAML), and SFO enforcement.',
    version: '1.0.0',
    author: 'openEXPERT',
    category: 'jurisdiction',
    tags: ['UK', 'FCA', 'NCA', 'POCA', 'DAML', 'money laundering', 'SFO', 'UKFIU', 'post-Brexit'],
    prompt: `## SKILL: UK Financial Crime — FCA & NCA Perspective

Apply expert knowledge of the UK financial crime regulatory framework, post-Brexit legislation, and FCA/NCA enforcement practice:

**Primary UK Legislation:**
- **Proceeds of Crime Act 2002 (POCA):** Principal UK money laundering statute. Key offences: S.327 (concealing/disguising/converting criminal property), S.328 (arrangements facilitating ML), S.329 (acquisition/use/possession of criminal property). Corporate criminal liability under S.330 (failure to disclose — regulated sector). Civil recovery and confiscation under Parts 5 and 6.
- **Terrorism Act 2000 (TACT):** Terrorist financing offences. S.18 (assisting): arranging or providing funds for terrorism. S.19: failure to disclose.
- **Money Laundering Regulations 2017 (MLRs 2017) as amended:** Transposition of AMLD4/5. FCA is primary supervisor for financial sector. Obligations: CDD, EDD, PEP identification, risk assessment, SAR filing to UKFIU (NCA).
- **UK Bribery Act 2010 (UKBA):** S.1 (active bribery), S.2 (passive bribery), S.6 (bribery of foreign public officials), S.7 (failure of commercial organisations to prevent bribery). Enforced by SFO, CPS.
- **Sanctions and Anti-Money Laundering Act 2018 (SAMLA):** Post-Brexit sanctions powers. OFSI administers UK sanctions list.

**Regulatory Supervisors (Post-Brexit):**
- **FCA (Financial Conduct Authority):** AML supervisor for banks, investment firms, payment institutions, e-money institutions, crypto-asset firms (FCA registered), consumer credit. Focus areas: transaction monitoring quality, SARs culture, crypto onboarding.
- **PRA (Prudential Regulation Authority):** Systemic banks and insurers — prudential oversight intersects with ML/TF risk.
- **NCA (National Crime Agency):** UK financial intelligence function (UKFIU). Receives all SARs — approximately 900,000 SARs/year. Coordinates with law enforcement on ML/TF cases.
- **SFO (Serious Fraud Office):** Investigates and prosecutes serious fraud, bribery, and corruption. DPA power under Crime and Courts Act 2013. Major FCPA enforcement mirror cases.
- **HMRC:** AML supervisor for MSBs, estate agents, accountants, legal professionals.

**DAML (Defence Against Money Laundering):**
Under POCA S.335-336, a reporting entity can seek a Defence Against Money Laundering from the UKFIU:
- File a SAR before proceeding with a suspicious transaction
- UKFIU has 7 working days to grant or refuse consent (or 31 days for moratorium if refused)
- If UKFIU does not refuse within 7 days → deemed consent → transaction can proceed
- Filing a DAML SAR protects the institution from the S.327-329 offences if transaction turns out to involve criminal property

**Tipping-Off (POCA S.333A):**
It is a criminal offence to disclose to a customer (or any person) that a SAR has been filed or is being considered. Key nuances:
- Applies in the regulated sector
- Does not prevent sharing information within a group for the purpose of determining whether to file a SAR
- Professional legal privilege: legal advisers may have a separate tipping-off framework for privileged communications
- In practice: staff must be trained to continue a transaction/conversation normally after deciding to file without tipping off

**FCA AML Enforcement Priorities (2024–2027):**
- Crypto-asset firm AML compliance (registered firms under FCA Reg.)
- Sanctions screening quality post-Ukraine conflict escalation
- Transaction monitoring effectiveness — FCA's "Dear CEO" letters highlight systemic weaknesses
- Politically exposed persons — calibration of PEP risk and EDD quality
- De-risking and fair access to banking (FCA financial inclusion mandate)`,
  },
];

let _cachedSkills: Skill[] | null = null;

export function getBuiltInSkills(): Skill[] {
  if (_cachedSkills) return _cachedSkills;
  _cachedSkills = BUILT_IN_SKILLS;
  return _cachedSkills;
}

export function getSkillById(id: string): Skill | undefined {
  return getBuiltInSkills().find((s) => s.id === id);
}

/**
 * Resolve selected skill IDs into a combined Layer 5 prompt injection.
 * Called by PromptComposer Layer 5.
 */
export function resolveSkills(skillIds: string[]): string {
  if (!skillIds || skillIds.length === 0) return '';
  const skills = skillIds
    .map((id) => getSkillById(id))
    .filter(Boolean) as Skill[];
  if (skills.length === 0) return '';
  if (skills.length === 1) return skills[0].prompt;
  return skills.map((s) => s.prompt).join('\n\n---\n\n');
}

/**
 * Returns skill IDs that should be auto-attached based on the selected output formats.
 * Called by the prompt assembly layer before resolveSkills().
 */
export function getAutoAttachSkillIds(outputFormats: string[]): string[] {
  const autoAttach: string[] = [];

  // Presentation formats → PowerPoint generation
  if (outputFormats.some(f => f === 'pptx' || f === 'stakeholder-presentation')) {
    autoAttach.push('pptx-generation');
  }

  // Board/executive formats → board-ready communication style
  if (outputFormats.some(f =>
    f === 'executive-summary' || f === 'decision-memo' || f === 'risk-appetite-statement'
  )) {
    autoAttach.push('board-communication');
  }

  // Scoring/assessment formats → risk-based thinking
  if (outputFormats.some(f =>
    f === 'gap-scoring-matrix' || f === 'maturity-assessment' || f === 'data-readiness-scorecard'
  )) {
    autoAttach.push('risk-based-thinking');
  }

  // Data-heavy formats → data storytelling
  if (outputFormats.some(f =>
    f === 'impact-assessment' || f === 'regulatory-comparison' || f === 'detailed-findings'
  )) {
    autoAttach.push('data-storytelling');
  }

  // De-duplicate in case multiple formats triggered the same skill
  return [...new Set(autoAttach)];
}

// ── Disk-based skills ─────────────────────────────────────────
// Loaded from server/skills/{id}/skill.json + skill-content.md
// Merged with built-ins on first async request (disk overrides built-in on ID clash).

let _diskSkillsCache: Skill[] | null = null;

async function loadDiskSkills(): Promise<Skill[]> {
  if (_diskSkillsCache) return _diskSkillsCache;

  const diskSkills: Skill[] = [];

  if (!await fs.pathExists(SKILLS_DIR)) {
    _diskSkillsCache = [];
    return diskSkills;
  }

  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(SKILLS_DIR, entry.name);
    const configPath = path.join(skillDir, 'skill.json');
    const contentPath = path.join(skillDir, 'skill-content.md');

    if (!await fs.pathExists(configPath)) continue;

    try {
      const raw = await fs.readJson(configPath) as {
        id: string;
        label?: string;
        name?: string;
        description?: string;
        category?: string;
        tags?: string[];
        applicableAreas?: string[];
        version?: string;
        author?: string;
      };

      const prompt = await fs.pathExists(contentPath)
        ? (await fs.readFile(contentPath, 'utf-8')).trim()
        : '';

      diskSkills.push({
        id: raw.id,
        name: raw.label ?? raw.name ?? raw.id,
        description: raw.description ?? '',
        version: raw.version ?? '1.0.0',
        author: raw.author ?? 'openEXPERT',
        category: (raw.category as Skill['category']) ?? 'domain',
        tags: raw.tags ?? [],
        applicableAreas: raw.applicableAreas,
        prompt,
        source: 'disk',
      });
    } catch (err) {
      console.error(`[skills-manager] Failed to load disk skill at ${skillDir}:`, err);
    }
  }

  _diskSkillsCache = diskSkills;
  console.log(`[skills-manager] Loaded ${diskSkills.length} disk skill(s) from ${SKILLS_DIR}`);
  return diskSkills;
}

/**
 * Returns all skills — built-ins merged with disk skills.
 * Disk skills override built-ins with the same ID.
 */
export async function getAllSkillsAsync(): Promise<Skill[]> {
  const disk = await loadDiskSkills();
  const diskIds = new Set(disk.map((s) => s.id));
  const builtins = getBuiltInSkills().map((s) => ({ ...s, source: 'builtin' as const }));
  return [...builtins.filter((s) => !diskIds.has(s.id)), ...disk];
}

/**
 * Get a skill by ID — checks disk skills first, then built-ins.
 */
export async function getSkillByIdAsync(id: string): Promise<Skill | undefined> {
  const all = await getAllSkillsAsync();
  return all.find((s) => s.id === id);
}

/**
 * Resolve skill IDs including disk skills.
 */
export async function resolveSkillsAsync(skillIds: string[]): Promise<string> {
  if (!skillIds || skillIds.length === 0) return '';
  const all = await getAllSkillsAsync();
  const index = new Map(all.map((s) => [s.id, s]));
  const skills = skillIds.map((id) => index.get(id)).filter(Boolean) as Skill[];
  if (skills.length === 0) return '';
  if (skills.length === 1) return skills[0].prompt;
  return skills.map((s) => s.prompt).join('\n\n---\n\n');
}

export function invalidateSkillCache(): void {
  _diskSkillsCache = null;
  _cachedSkills = null;
}
