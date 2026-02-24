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
    description: 'Deep expertise in EU regulatory framework, legislative process, and multi-jurisdictional interpretation.',
    version: '1.0.0',
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

**Citation format:** Regulation (EU) [year]/[number] of [date] + specific Article, paragraph, and subparagraph. For Directives: transposition deadline + typical national implementation approach.`,
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
    description: 'Cite specific AMLR (Regulation 2024/1624) articles, paragraphs, and recitals. Essential for gap analysis and regulatory mapping work.',
    version: '1.0.0',
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

**Level 2 Measures:** Reference relevant EBA Guidelines still in force during the transition period (e.g., EBA/GL/2020/06 on CDD, EBA/GL/2021/02 on beneficial ownership).`,
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
    description: 'Think like a financial supervisor: what evidence would satisfy an on-site inspection? What would trigger findings?',
    version: '1.0.0',
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

**Citing Supervisory Expectations:** Reference EBA risk-based supervisory guidelines, ECB SSM supervisory expectations, national supervisory priorities letters (dear CEO), and published enforcement decisions as evidence of supervisory standard.`,
  },

  // ── New Skills: Methodology ─────────────────────────────────────────────────

  {
    id: 'risk-based-thinking',
    name: 'Risk-Based Thinking',
    description: 'Apply formal risk-based approach methodology: identify, assess, mitigate, and monitor. Not all risks are equal.',
    version: '1.0.0',
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

**FATF Methodology Alignment:** Apply the FATF Risk-Based Approach Guidance (2023) framework where relevant: threat, vulnerability, consequence. Reference FATF typologies and country mutual evaluation results as inputs to risk assessment.`,
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
    name: 'Data Storytelling',
    description: 'Transform data and findings into compelling narratives. Numbers don\'t speak for themselves — stories do.',
    version: '1.0.0',
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

**Avoiding Data Overload:** More data is not more persuasive. Select the evidence that most powerfully supports each point. Leave the rest in appendices. The goal is understanding and action, not comprehensiveness.`,
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
  if (outputFormats.some(f => f === 'pptx' || f === 'stakeholder-presentation')) {
    autoAttach.push('pptx-generation');
  }
  return autoAttach;
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
