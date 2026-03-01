import type { OutputFormat } from './types';

export const OUTPUT_FORMATS: OutputFormat[] = [
  // ── STRATEGIC ──────────────────────────────────────────────
  {
    id: 'executive-summary',
    label: 'Executive Summary',
    icon: 'FileText',
    description: '1-2 page board-ready summary: key findings, risks, recommended decisions',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '1-2 pages',
    audience: 'Board, C-suite',
    promptInstruction: `## OUTPUT FORMAT: EXECUTIVE SUMMARY
Produce a concise, board-ready executive summary (1-2 pages).

Structure:
1. **Purpose** — Why this analysis was conducted (1-2 sentences)
2. **Key Findings** — 3-5 bullet points, each with severity indicator (Critical/High/Medium/Low)
3. **Risk Assessment** — Overall risk level with brief justification
4. **Recommended Actions** — 3-5 prioritized recommendations with owner suggestions
5. **Timeline** — High-level implementation timeline
6. **Resource Implications** — Brief cost/effort indication

Style: Professional, decisive language. No jargon. Every sentence must add value. Use bold for emphasis.`,
  },
  {
    id: 'decision-memo',
    label: 'Decision Memo',
    icon: 'ClipboardCheck',
    description: 'Options analysis with pros/cons, risk assessment, clear recommendation',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '2-4 pages',
    audience: 'Decision-makers',
    promptInstruction: `## OUTPUT FORMAT: DECISION MEMO
Produce a structured decision memorandum.

Structure:
1. **Decision Required** — Clear statement of what decision is needed
2. **Background** — Context (3-5 sentences)
3. **Options Analysis** — For each option: Description, Pros, Cons, Risk level, Cost/effort
4. **Recommendation** — Clear recommendation with rationale
5. **Implementation** — Next steps if recommendation is approved
6. **Risks of Inaction** — What happens if no decision is made`,
  },
  {
    id: 'risk-appetite-statement',
    label: 'Risk Appetite Statement',
    icon: 'ShieldAlert',
    description: 'Formal ML/TF risk appetite with tolerance levels and boundaries',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '3-5 pages',
    audience: 'Board, Risk Committee',
    promptInstruction: `## OUTPUT FORMAT: RISK APPETITE STATEMENT
Produce a formal ML/TF Risk Appetite Statement.

Structure:
1. **Statement of Risk Appetite** — Overarching statement
2. **Risk Categories** — For each ML/TF risk category: appetite level (No appetite / Low / Moderate / High), tolerance thresholds, boundary conditions
3. **Key Risk Indicators** — Measurable KRIs with thresholds
4. **Escalation Framework** — When and how to escalate breaches
5. **Review and Governance** — Review frequency, approval authority`,
  },

  {
    id: 'legal-brief',
    label: 'Legal Brief',
    icon: 'Scale',
    description: 'Formal legal memorandum structure: issue, rule, analysis, conclusion (IRAC)',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '3-8 pages',
    audience: 'Legal counsel, Compliance',
    promptInstruction: `Structure your response as a formal Legal Brief using IRAC methodology:
# LEGAL BRIEF

**Matter:** [Case/matter reference]
**Date:** [Current date]
**Prepared by:** ANTON AI Legal Analysis

## ISSUE(S)
State each legal question precisely.

## APPLICABLE LAW & RULES
Cite specific regulations, directives, articles, case law. Full citations required.

## ANALYSIS
Apply each rule to the facts methodically. Address counterarguments. Note jurisdictional variations.

## CONCLUSION
Clear, definitive conclusions per issue. Confidence level (High/Medium/Low). Caveats.

## RECOMMENDED ACTIONS
Specific next steps with rationale.

*Note: This analysis is for informational purposes. Consult qualified legal counsel for legal advice.*`,
  },
  {
    id: 'board-pack',
    label: 'Board Pack',
    icon: 'Briefcase',
    description: 'Board-ready paper: background, key issues, options, recommendation, decision required',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '2-5 pages',
    audience: 'Board of Directors',
    promptInstruction: `Structure your response as a Board Paper:
# BOARD PAPER — CONFIDENTIAL

**To:** Board of Directors
**From:** [Author/Function]
**Date:** [Date]
**Agenda Item:** [Number]
**Classification:** Confidential

## PURPOSE
One sentence: what this paper asks the Board to do.

## BACKGROUND (max 1 page)
Context necessary for the decision. No history lesson — only what's needed.

## KEY ISSUES
3-5 bullet points. The material matters requiring board attention.

## OPTIONS CONSIDERED
| Option | Description | Pros | Cons | Risk |
|---|---|---|---|---|
[2-3 options]

## RECOMMENDATION
Clear recommendation with rationale. Why this option vs. alternatives.

## FINANCIAL IMPLICATIONS
Cost, savings, investment required. Budget line.

## RISK ASSESSMENT
Top 3 risks if approved. Top 3 risks if not approved.

## DECISION REQUIRED
"The Board is asked to: [specific resolution]"

**Appendices** (if any): [List]`,
  },
  {
    id: 'investment-memo',
    label: 'Investment Memo',
    icon: 'TrendingUp',
    description: 'Investment committee memo: thesis, market, financials, risks, recommendation',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-10 pages',
    audience: 'Investment committee, Partners',
    promptInstruction: `Structure your response as an Investment Memorandum:
# INVESTMENT MEMORANDUM — CONFIDENTIAL

**Company/Asset:** [Name]
**Date:** [Date]
**Prepared by:** ANTON AI Investment Analysis

## INVESTMENT THESIS (2-3 sentences)
Why this is a compelling investment. Core value drivers.

## COMPANY/ASSET OVERVIEW
Business model, products/services, revenue model, stage, geography.

## MARKET ANALYSIS
TAM/SAM/SOM. Growth drivers. Competitive dynamics. Market timing.

## FINANCIAL SUMMARY
| Metric | Current | Year 1 | Year 3 | Year 5 |
|---|---|---|---|---|
[Revenue, EBITDA, Cash, etc.]

Key assumptions. Valuation methodology. Entry price vs. intrinsic value.

## MANAGEMENT TEAM
Key people, track record, gaps.

## COMPETITIVE LANDSCAPE
Direct/indirect competitors. Moat analysis. Differentiation.

## RISKS & MITIGANTS
| Risk | Probability | Impact | Mitigant |
|---|---|---|---|
[Top 5 risks]

## RECOMMENDATION
Buy/Pass/Monitor with conviction level. Suggested terms/structure.

## DUE DILIGENCE CHECKLIST
Outstanding items before final decision.`,
  },

  // ── ANALYTICAL ─────────────────────────────────────────────
  {
    id: 'detailed-findings',
    label: 'Detailed Findings Report',
    icon: 'FileSearch',
    description: 'Comprehensive findings with evidence, citations, severity, interconnections',
    category: 'analytical',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-15 pages',
    audience: 'Compliance, Auditors',
    promptInstruction: `## OUTPUT FORMAT: DETAILED FINDINGS REPORT
Produce a comprehensive findings report.

For each finding:
1. **Finding ID** — Sequential (F-001, F-002...)
2. **Title** — Descriptive title
3. **Severity** — Critical / High / Medium / Low with color indicator
4. **Regulatory Reference** — Article/section number and text
5. **Current State** — What exists today (with evidence)
6. **Gap/Issue** — What is missing or non-compliant
7. **Risk Implication** — What could happen if not addressed
8. **Recommendation** — Specific remediation steps
9. **Effort Estimate** — Low/Medium/High
10. **Dependencies** — Links to other findings

End with: Summary table of all findings by severity, interconnection map.`,
  },
  {
    id: 'regulatory-comparison',
    label: 'Regulatory Comparison',
    icon: 'GitCompare',
    description: 'Side-by-side current vs. new requirements with delta analysis',
    category: 'analytical',
    exportFormats: ['docx', 'xlsx'],
    estimatedLength: '5-20 pages',
    audience: 'Compliance, Legal',
    promptInstruction: `## OUTPUT FORMAT: REGULATORY COMPARISON
Produce a structured side-by-side regulatory comparison table for compliance and legal teams. Audience: compliance officers and legal counsel who need to assess implementation impact of new or amended rules.

For each requirement area, produce a table with these exact columns:
| Req ID | Topic Area | Current Requirement (Article/Text) | New/Updated Requirement (Article/Text) | Delta Type | Key Change | Compliance Impact | Action Required | Priority |

Delta Type values (use exactly):
- NEW — requirement did not exist before
- STRENGTHENED — existing requirement expanded in scope, threshold lowered, or obligation increased
- WEAKENED — scope reduced or obligation relaxed
- CLARIFIED — same obligation, editorial or interpretive change only
- REMOVED — requirement no longer applies
- UNCHANGED — no material change (include briefly for completeness)

Group rows by topic area with bold subheadings (e.g., Customer Due Diligence, Transaction Monitoring, Governance, Reporting, Data Management, Sanctions).

After the main table include:
1. **Delta Summary Statistics** — Count of NEW / STRENGTHENED / WEAKENED / CLARIFIED / REMOVED requirements
2. **Critical Path Items** — Top 5 changes requiring immediate action with rationale
3. **Implementation Sequencing** — Suggested order to address changes considering dependencies
4. **Open Questions** — Areas where the new text is ambiguous or requires regulatory clarification

Quality bar: Every row must cite specific article/section numbers for both current and new text. Do not paraphrase — quote the operative obligation precisely. Flag where a single new article replaces multiple old requirements.`,
  },
  {
    id: 'impact-assessment',
    label: 'Impact Assessment',
    icon: 'Activity',
    description: 'Operational, technical, people, financial, timeline impact dimensions',
    category: 'analytical',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '3-8 pages',
    audience: 'Project sponsors, COO',
    promptInstruction: `## OUTPUT FORMAT: IMPACT ASSESSMENT
Produce a multi-dimensional impact assessment.

Dimensions:
1. **Regulatory Impact** — Compliance obligations, deadlines, penalties
2. **Operational Impact** — Process changes, workflow modifications
3. **Technology Impact** — System changes, data requirements, integrations
4. **People Impact** — Training needs, role changes, hiring
5. **Financial Impact** — Implementation costs, ongoing costs, savings
6. **Timeline Impact** — Key milestones, critical path, dependencies

For each dimension: Current state, Required changes, Effort (H/M/L), Priority, Dependencies.
End with: Overall impact summary matrix and recommended sequencing.`,
  },

  {
    id: 'audit-report',
    label: 'Audit Report',
    icon: 'ClipboardCheck',
    description: 'Formal audit report: scope, methodology, findings, risk ratings, management actions',
    category: 'analytical',
    exportFormats: ['docx', 'xlsx', 'pdf'],
    estimatedLength: '5-15 pages',
    audience: 'Audit committee, Senior management',
    promptInstruction: `Structure your response as a formal Audit Report:
# INTERNAL AUDIT REPORT

**Audit Ref:** [Reference]  **Period:** [Dates]  **Status:** DRAFT

## EXECUTIVE SUMMARY
Key findings (🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low). Overall audit opinion.

## SCOPE & OBJECTIVES
What was reviewed, what was out of scope, audit methodology.

## FINDINGS
For each finding:
### Finding [N]: [Title]
- **Risk Rating:** 🔴/🟠/🟡/🟢
- **Observation:** What was found
- **Criteria:** What should be happening (regulatory/policy reference)
- **Root Cause:** Why it's happening
- **Impact:** Potential consequences
- **Recommendation:** Specific remediation action
- **Management Response:** [Space for management to complete]
- **Target Date:** [Space for date]

## CONCLUSION
Overall control environment assessment. Trend vs. prior periods.`,
  },
  {
    id: 'pentest-report',
    label: 'Pentest Report',
    icon: 'Shield',
    description: 'Security assessment report: executive summary, methodology, vulnerabilities (CVSS), remediation',
    category: 'analytical',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '10-30 pages',
    audience: 'CTO, Security team, Board',
    promptInstruction: `Structure your response as a Penetration Test Report:
# PENETRATION TEST REPORT — CONFIDENTIAL

**Assessment Type:** [Type]  **Date:** [Date]  **Classification:** CONFIDENTIAL

## EXECUTIVE SUMMARY
Scope, overall risk posture, critical findings count, remediation priority.

## METHODOLOGY
Testing approach, tools used, attack scenarios, rules of engagement.

## FINDINGS SUMMARY TABLE
| ID | Vulnerability | CVSS Score | Severity | Status |
|---|---|---|---|---|
[Populate table]

## DETAILED FINDINGS
For each vulnerability:
### [VUL-XXX]: [Vulnerability Title]
- **Severity:** Critical/High/Medium/Low/Informational
- **CVSS v3 Score:** X.X ([Vector])
- **Affected Component:**
- **Description:** Technical detail
- **Evidence/PoC:** Steps to reproduce
- **Impact:** Business impact
- **Remediation:** Specific fix with code example if applicable
- **References:** CVE, CWE, OWASP

## REMEDIATION ROADMAP
Prioritised fix list with effort estimates.`,
  },
  {
    id: 'clinical-trial-summary',
    label: 'Clinical Trial Summary',
    icon: 'Activity',
    description: 'Clinical study summary: protocol, endpoints, results, safety, regulatory implications',
    category: 'analytical',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-12 pages',
    audience: 'Medical affairs, Regulatory, Investment',
    promptInstruction: `Structure your response as a Clinical Trial Summary:
# CLINICAL TRIAL SUMMARY

**Study Title:** [Title]
**Protocol Number:** [Number]
**Phase:** [I/II/III/IV]

## STUDY OVERVIEW
Indication, hypothesis, sponsor, duration, regulatory framework.

## STUDY DESIGN
Design type, randomisation, blinding, comparator. Patient population (inclusion/exclusion).

## ENDPOINTS
- **Primary:** [Primary endpoint with statistical threshold]
- **Secondary:** [List]
- **Exploratory:** [List]

## RESULTS

### Primary Endpoint
[Result with statistical significance: p-value, confidence intervals, effect size]

### Secondary Endpoints
[Table of results]

### Subgroup Analyses
[Key subgroups and differential effects]

## SAFETY PROFILE
AE overview (TEAEs, SAEs, discontinuations). Notable safety signals.

## REGULATORY IMPLICATIONS
Impact on labelling, approval pathway, comparator position. EMA/FDA alignment.

## CONCLUSIONS & NEXT STEPS
Clinical significance vs. statistical significance. Phase IV considerations.`,
  },

  // ── OPERATIONAL ────────────────────────────────────────────
  {
    id: 'project-plan',
    label: 'Implementation Project Plan',
    icon: 'GanttChart',
    description: 'Phased roadmap with workstreams, milestones, dependencies, resources',
    category: 'operational',
    exportFormats: ['docx', 'xlsx'],
    estimatedLength: '5-10 pages',
    audience: 'Project managers',
    promptInstruction: `## OUTPUT FORMAT: IMPLEMENTATION PROJECT PLAN
Produce a phased implementation plan.

Structure:
1. **Project Overview** — Scope, objectives, success criteria
2. **Phases** — For each phase: name, duration, objectives, deliverables, resources needed
3. **Workstreams** — Parallel work tracks with owners
4. **Milestones** — Key dates and decision gates
5. **Dependencies** — Between workstreams and with external factors
6. **Resource Requirements** — FTE, skills, external support
7. **Risks & Mitigations** — Top project risks
8. **Governance** — Reporting, escalation, decision-making`,
  },
  {
    id: 'action-plan',
    label: 'Action Plan',
    icon: 'ListTodo',
    description: 'Prioritized actions with owners, deadlines, dependencies, effort',
    category: 'operational',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '2-5 pages',
    audience: 'Action owners',
    promptInstruction: `## OUTPUT FORMAT: ACTION PLAN
Produce a prioritized action plan as a structured table.

For each action:
| # | Action | Priority | Owner (Role) | Deadline | Effort | Dependencies | Status |

Priority: P1 (Critical) / P2 (High) / P3 (Medium) / P4 (Low)
Effort: Days/weeks estimate
Group by priority. Include summary counts.`,
  },
  {
    id: 'mitigation-plan',
    label: 'Mitigation / Remediation Plan',
    icon: 'Wrench',
    description: 'Per-finding: remediation steps, effort, timeline, verification criteria',
    category: 'operational',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '3-10 pages',
    audience: 'Remediation owners',
    promptInstruction: `## OUTPUT FORMAT: MITIGATION / REMEDIATION PLAN
Produce a remediation plan linked to findings.

For each finding/gap:
1. **Finding Reference** — ID and title
2. **Root Cause** — Why the gap exists
3. **Remediation Steps** — Numbered, specific actions
4. **Owner** — Role responsible
5. **Timeline** — Start date, milestones, completion
6. **Effort** — FTE days/cost
7. **Verification Criteria** — How to confirm remediation is complete
8. **Residual Risk** — Risk remaining after remediation`,
  },
  {
    id: 'policy-document',
    label: 'Policy / Procedure Document',
    icon: 'FileCheck',
    description: 'Formal governance document with version control, roles, escalation',
    category: 'operational',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-30 pages',
    audience: 'All staff',
    promptInstruction: `## OUTPUT FORMAT: POLICY / PROCEDURE DOCUMENT
Produce a formal governance document.

Structure:
1. **Document Control** — Version, author, approver, review date, classification
2. **Purpose & Scope** — What this document covers and who it applies to
3. **Definitions** — Key terms
4. **Regulatory Framework** — Applicable regulations and guidelines
5. **Policy Statements / Procedures** — Numbered sections with clear requirements
6. **Roles & Responsibilities** — RACI or responsibility descriptions
7. **Escalation Procedures** — When, how, to whom
8. **Reporting** — Internal and external reporting requirements
9. **Training** — Training requirements and frequency
10. **Review & Update** — Review cycle and triggers for ad-hoc review
11. **Appendices** — Templates, forms, reference tables`,
  },
  {
    id: 'scope-tracker',
    label: 'Scope Tracker',
    icon: 'ClipboardList',
    description: 'Engagement scope tracking with status per deliverable, finding counts, and next actions',
    category: 'operational',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '2-8 pages',
    audience: 'Project managers, Engagement leads',
    promptInstruction: `## OUTPUT FORMAT: SCOPE TRACKER
Produce an engagement scope tracking table.

Columns:
| Scope Item # | Deliverable | Status | Findings (Critical/High/Med/Low) | Information Gaps | Next Actions | Owner | Due Date |

Status values: Complete / In Progress / Requires More Info / Not Started / Blocked

Include:
- Summary statistics: X items complete, Y in progress, Z blocked
- Finding count totals by severity across all scope items
- Information gaps requiring client input (numbered list)
- Cross-cutting themes identified across multiple scope items
- Recommended priority order for remaining items`,
  },
  {
    id: 'raci-matrix',
    label: 'RACI Matrix',
    icon: 'Table',
    description: 'Responsibility assignment: Responsible, Accountable, Consulted, Informed',
    category: 'operational',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '1-3 pages',
    audience: 'Governance',
    promptInstruction: `## OUTPUT FORMAT: RACI MATRIX
Produce a RACI responsibility assignment matrix.

Format as table:
| Activity / Process | Role 1 | Role 2 | Role 3 | ... |

Where cells contain: R (Responsible), A (Accountable), C (Consulted), I (Informed), or blank.

Rules: Exactly one A per row. At least one R per row.
Group activities by process area. Include role definitions.`,
  },

  // ── SCORING & ASSESSMENT ───────────────────────────────────
  {
    id: 'gap-scoring-matrix',
    label: 'Gap Scoring Matrix',
    icon: 'BarChart',
    description: 'RAG-rated scoring per requirement: ID, article, current state, score, priority',
    category: 'scoring',
    exportFormats: ['xlsx'],
    estimatedLength: '1-5 pages',
    audience: 'Project team',
    promptInstruction: `## OUTPUT FORMAT: GAP SCORING MATRIX
Produce a detailed gap scoring matrix as a table.

Columns:
| Req ID | Article/Section | Requirement Summary | Current State | Compliance Score | Gap Description | Priority | Effort | Owner |

Compliance Score: Use RAG rating:
- 🟢 Green (3) — Fully compliant
- 🟡 Yellow (2) — Partially compliant, minor gaps
- 🟠 Orange (1) — Significant gaps, major work needed
- 🔴 Red (0) — Non-compliant or not addressed

Sort by: Score ascending (worst first), then by priority.
Include: Summary statistics (% per RAG level), total score, average score.`,
  },
  {
    id: 'maturity-assessment',
    label: 'Maturity Assessment',
    icon: 'TrendingUp',
    description: '5-level maturity scoring across AML dimensions with evidence',
    category: 'scoring',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '5-10 pages',
    audience: 'Board, Compliance',
    promptInstruction: `## OUTPUT FORMAT: MATURITY ASSESSMENT
Produce a maturity assessment across AML/CFT dimensions.

Maturity Levels:
1 — Initial (ad hoc, reactive)
2 — Developing (basic processes, inconsistent)
3 — Defined (documented, consistent)
4 — Managed (measured, monitored)
5 — Optimizing (continuous improvement, leading practice)

For each dimension:
| Dimension | Current Level | Target Level | Gap | Evidence | Key Actions |

Dimensions: Governance, Risk Assessment, CDD/KYC, Transaction Monitoring, Sanctions Screening, SAR/STR, Training, Quality Assurance, Data Management, Technology.`,
  },
  {
    id: 'data-readiness-scorecard',
    label: 'Data Readiness Scorecard',
    icon: 'Database',
    description: 'Per data point: readiness, source system, owner, effort',
    category: 'scoring',
    exportFormats: ['xlsx'],
    estimatedLength: '2-5 pages',
    audience: 'Data teams, IT',
    promptInstruction: `## OUTPUT FORMAT: DATA READINESS SCORECARD
Produce a detailed data readiness scorecard for data engineering and IT teams assessing whether data assets meet regulatory or project requirements. This deliverable will drive IT prioritisation and remediation planning.

Main scorecard table — one row per data point:
| # | Data Point | Business Definition | Regulatory/Project Requirement | Source System | Data Owner (Role) | Current Availability | Data Quality Score | Quality Issues | Gap Description | Remediation Effort | Remediation Complexity | Priority |

Column guidance:
- **Current Availability**: 🟢 Fully available and fit for purpose / 🟡 Partially available (incomplete, outdated, or inconsistent) / 🔴 Not available (does not exist or cannot be sourced)
- **Data Quality Score**: Rate 1–5 where 5 = excellent (complete, accurate, timely, consistent) and 1 = unusable (missing, unreliable, no lineage)
- **Quality Issues**: List specific defects — e.g., missing values (X%), duplicate records, stale refresh cycle, inconsistent formats, no audit trail
- **Remediation Effort**: Small (< 5 days) / Medium (1–4 weeks) / Large (1–3 months) / Strategic (> 3 months, requires architecture change)
- **Remediation Complexity**: Low (config change or ETL fix) / Medium (new data pipeline) / High (source system change or new integration) / Critical (requires vendor or regulatory engagement)
- **Priority**: P1 Blocker / P2 High / P3 Medium / P4 Low

Group rows by data category with bold subheadings (e.g., Customer Identity, Beneficial Ownership, Transaction Data, Product/Account Data, Counterparty Data, Sanctions/PEP Data, Risk Scores).

After the main table include:
1. **Readiness Dashboard** — Count and % per availability RAG rating; average quality score per category
2. **Critical Gaps** — Data points rated 🔴 or Quality Score ≤ 2, with regulatory consequence if not resolved
3. **Quick Wins** — Data points that are 🟡 with Small/Low remediation effort that can be resolved within 30 days
4. **Strategic Dependencies** — Large/Strategic items requiring architecture decisions or third-party engagement
5. **Recommended Remediation Sequence** — Phased roadmap prioritising regulatory deadlines and dependency order

Do NOT include placeholder rows. If a data point's source system or owner is unknown, flag it explicitly as "Unknown — to be determined" and mark as P1 Blocker.`,
  },

  // ── COMMUNICATION ──────────────────────────────────────────
  {
    id: 'quick-briefing',
    label: 'Quick Briefing',
    icon: 'Newspaper',
    description: '1-page: What happened, So what, Now what',
    category: 'communication',
    exportFormats: ['md', 'pdf'],
    estimatedLength: '1 page',
    audience: 'Busy stakeholders',
    promptInstruction: `## OUTPUT FORMAT: QUICK BRIEFING
Produce a 1-page briefing using the "What → So What → Now What" framework.

1. **What happened?** — Factual summary of the development/finding (3-5 sentences)
2. **So what?** — Why it matters, who is affected, what are the risks (3-5 sentences)
3. **Now what?** — Recommended next steps, timeline, who needs to act (3-5 bullet points)

Keep it to ONE page. No fluff. Every word must earn its place.`,
  },
  {
    id: 'problem-solution',
    label: 'Problem → Solution',
    icon: 'ArrowRightLeft',
    description: 'Per issue: problem, root cause, solution, who, when, verification',
    category: 'communication',
    exportFormats: ['md', 'docx'],
    estimatedLength: '2-5 pages',
    audience: 'Action owners',
    promptInstruction: `## OUTPUT FORMAT: PROBLEM → SOLUTION
For each issue identified, provide a structured problem-solution pair.

Format per issue:
### Issue N: [Title]
- **Problem:** What is wrong
- **Root Cause:** Why it is wrong
- **Impact:** What happens if not fixed
- **Solution:** Specific steps to fix
- **Owner:** Who should fix it
- **Timeline:** When it should be fixed
- **Verification:** How to confirm it is fixed`,
  },
  {
    id: 'stakeholder-presentation',
    label: 'Presentation Outline',
    icon: 'Presentation',
    description: 'Slide-by-slide outline with speaker notes and key messages',
    category: 'communication',
    exportFormats: ['md', 'docx'],
    estimatedLength: '3-8 pages',
    audience: 'Presenters',
    promptInstruction: `## OUTPUT FORMAT: PRESENTATION OUTLINE
Produce a detailed slide-by-slide presentation outline that a presenter can use directly to build their deck. This is not a summary of the topic — it is a structured content brief for each slide. Audience: the presenter preparing the deck, not the audience watching it. Clarity and precision for the presenter is the priority.

For each slide use this exact structure:

---
**SLIDE [N] — [SLIDE TITLE]**
**Slide type:** [Title / Agenda / Section divider / Content / Data/chart / Two-column / Quote / Summary / Call-to-action]
**Key message:** One sentence — what the audience must remember from this slide. This is the headline the slide should communicate, not a description of what's on it.
**On-slide content:**
- [Bullet point or content item — keep to max 5 bullets, each max 8 words]
- [Use "→ [chart: describe data]" for visuals, "→ [table: describe structure]" for tables]
**Speaker notes:** What the presenter should say aloud — 3–5 sentences. Include context, nuance, and what's NOT on the slide. Write in first person as if the presenter is speaking.
**Transition:** One sentence on how this slide connects to the next.
---

Required slide sequence:
1. TITLE SLIDE — event, date, presenter name/role, client name (if applicable)
2. AGENDA — numbered list of sections (4–6 items)
3. EXECUTIVE SUMMARY — the 3 things the audience must know before the detail (use strong declarative statements, not questions)
[Content slides — organised by logical narrative arc, not chronological order]
[N-1]. CONCLUSIONS & RECOMMENDATIONS — clear, directive, owned statements
[N]. NEXT STEPS — specific actions, owners, and deadlines in a simple table
[N+1]. Q&A — with 3–5 anticipated questions and model answers (for speaker prep)
APPENDIX — label any backup slides the presenter might need but won't show in main flow

Narrative guidance: Structure the presentation as a story — Problem → Stakes → Analysis → Solution → Action. Each section should answer the question the previous section raises. Avoid slide dumps of data; every slide should advance the argument.

Quality bar: If the topic does not have enough substance to fill the requested number of slides, say so and suggest a tighter deck. Do NOT pad with generic slides. Every slide must earn its place. Speaker notes should contain something genuinely useful that is not already on the slide.`,
  },
  {
    id: 'training-material',
    label: 'Training Material',
    icon: 'GraduationCap',
    description: 'Learning content with objectives, cases, red flags, knowledge checks',
    category: 'communication',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-15 pages',
    audience: 'Training participants',
    promptInstruction: `## OUTPUT FORMAT: TRAINING MATERIAL
Produce a complete, ready-to-deliver training module. Audience: front-line staff, relationship managers, compliance teams, or board members depending on the topic. The material must be immediately usable — not a summary of the topic, but a structured learning experience.

Required sections in this order:

**1. MODULE OVERVIEW**
- Title, target audience, delivery format (e-learning / classroom / self-study), estimated duration
- Prerequisites: what participants should already know
- Compliance relevance: which regulation or policy this training satisfies

**2. LEARNING OBJECTIVES** (use "By the end of this module, participants will be able to…" format)
- 3–5 measurable objectives using action verbs (identify, explain, apply, distinguish, report)

**3. REGULATORY CONTEXT**
- Applicable rules, obligations, and why this training is mandatory
- Cite specific articles/sections
- "What happens if we get this wrong?" — regulatory, reputational, and operational consequences

**4. CORE CONTENT** (the main teaching sections)
For each concept: clear explanation → why it matters → real-world application
Use headers, short paragraphs, callout boxes for key definitions, and numbered steps for processes.
Avoid dense blocks of text — this is training material, not a policy document.

**5. RED FLAGS & INDICATORS**
Bullet-point list of specific warning signs the audience must recognise in their role. Organise by scenario type. Be concrete — use realistic examples not abstract descriptions.

**6. CASE STUDIES** (2–3 scenarios)
For each:
- **Background:** Realistic scenario (2–3 sentences)
- **The situation:** What happened that requires action
- **Discussion questions:** 2–3 questions to prompt group discussion or reflection
- **Model answer:** What the correct response is and why
- **Lesson:** The single most important takeaway from this case

**7. KNOWLEDGE CHECK**
8–12 questions mixing:
- Multiple choice (4 options, one clearly correct, distractors based on common misconceptions)
- True/False with explanation
- Scenario-based: "What would you do if…?"
For each question: provide the correct answer and a brief explanation of why.

**8. KEY TAKEAWAYS**
5 bullet points maximum. The non-negotiables every participant must leave knowing.

**9. FURTHER RESOURCES**
2–4 links or references for deeper learning (regulatory guidance, internal policy, e-learning modules).

Tone: Engaging, direct, and practical. Avoid jargon unless it is defined immediately. Write at the level of the target audience — board content is different from front-line staff content. Do NOT write this as an academic essay or policy brief.`,
  },
  {
    id: 'client-proposal',
    label: 'Engagement Proposal',
    icon: 'Handshake',
    description: 'Client proposal: understanding, approach, scope, timeline, differentiators',
    category: 'communication',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-10 pages',
    audience: 'Sales, Clients',
    promptInstruction: `## OUTPUT FORMAT: ENGAGEMENT PROPOSAL
Produce a professional client engagement proposal for financial crime prevention or compliance consulting services. Audience: decision-makers at the client organisation (CCO, COO, CFO, or Procurement). The proposal must feel tailored — not a template — and must demonstrate deep understanding of the client's situation before selling anything.

Structure:

**1. COVER PAGE CONTENT**
Proposal title, client name, date, reference number, prepared by (openEXPERT), and classification (Confidential).

**2. EXECUTIVE SUMMARY** (max 1 page)
Lead with the client's problem, not our solution. In 3–4 sentences articulate: what challenge the client faces, what the regulatory or business consequence of inaction is, and what outcome this engagement will deliver. Close with a single sentence on why openEXPERT is the right partner.

**3. OUR UNDERSTANDING OF YOUR SITUATION**
Demonstrate that we understand the client's context — their institution type, regulatory environment, the specific challenge they face, and the constraints they operate under (time, resources, political, technical). Reference any specific information provided. This section should make the client think: "They get it." Do NOT use generic industry boilerplate.

**4. PROPOSED APPROACH & METHODOLOGY**
Describe the analytical framework, methodology, and tools we will use. Explain why this approach is best suited to their situation (not just our standard method). Break into phases with clear objectives per phase. For each phase state: what we do, what the client needs to provide, and what we deliver.

**5. SCOPE OF WORK**
Explicit table:
| Deliverable | Description | Format | Owner | Phase |

Followed by clear In Scope / Out of Scope bullet lists. This section protects both parties — be precise.

**6. TEAM & EXPERTISE**
Proposed team roles (not necessarily named individuals unless specified). For each role: responsibility on this engagement and 2–3 sentences on directly relevant experience. Include a "Why this matters for you" sentence connecting team expertise to the client's specific challenge.

**7. TIMELINE & MILESTONES**
Phase-by-phase table:
| Phase | Duration | Key Activities | Milestones | Client Input Required |

Include: kickoff, interim checkpoints, draft deliverable review, final delivery, and any regulatory deadline the engagement must meet.

**8. INVESTMENT**
[PLACEHOLDER — Fee structure to be completed by engagement lead]
Note: Include assumptions that underpin the estimate (number of interviews, document volume, travel requirements, workshops, etc.) so the client understands what drives cost. Optionally present two fee options: a full scope and a phased/reduced scope.

**9. WHY openEXPERT**
3–4 specific differentiators relevant to this engagement. Back each with concrete evidence (experience, methodologies, regulatory relationships, delivery track record). Do NOT use generic consulting clichés. This should feel like evidence, not marketing.

**10. NEXT STEPS**
Clear, time-bound actions: what we need from the client, when we need it, and who from openEXPERT to contact to proceed. Specify the decision deadline if one exists.

**APPENDICES** (as needed)
- Relevant engagement references (anonymised)
- openEXPERT team profiles
- Sample deliverable format

Quality bar: Every section must feel specific to the client. If you do not have enough information about the client to be specific, flag clearly what information is needed before the proposal can be finalised. Do NOT produce generic consulting filler.`,
  },
  {
    id: 'proposal-response',
    label: 'Proposal / RFP Response',
    icon: 'FileSignature',
    description: 'Structured RFP response with compliance matrix, methodology, team, timeline, and case studies',
    category: 'communication',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '10-25 pages',
    audience: 'Prospective clients, Procurement',
    promptInstruction: `## OUTPUT FORMAT: PROPOSAL / RFP RESPONSE
Produce a structured proposal or RFP response document.

Structure:
1. **Cover Letter** — Personalised letter expressing interest and key differentiators (1 page)
2. **Compliance Matrix** — Table mapping each RFP requirement to our response: | RFP Ref | Requirement | Response | Evidence |
3. **Executive Summary** — Our understanding of the client's needs and proposed value (1 page)
4. **Methodology** — Detailed approach, frameworks, tools, and quality assurance
5. **Team Composition** — Proposed team with roles, relevant experience, and availability
6. **Timeline & Milestones** — Phased delivery plan with key dates and decision gates
7. **Case Studies** — 2-3 relevant engagement summaries: challenge, approach, outcome
8. **Why Us** — Differentiators: relevant expertise, regulatory relationships, technology partnerships, implementation track record
9. **Commercial Terms** — Fee structure (placeholder), payment schedule, assumptions
10. **Appendices** — CVs, certifications, references, relevant publications`,
  },
  {
    id: 'management-presentation',
    label: 'Management Presentation',
    icon: 'Presentation',
    description: 'Structured slide-by-slide content for PowerPoint with speaker notes and RAG tables',
    category: 'communication',
    exportFormats: ['pptx', 'md', 'docx'],
    estimatedLength: '8-35 slides',
    audience: 'Board, Executive Committee, Steering Groups',
    promptInstruction: `## OUTPUT FORMAT: MANAGEMENT PRESENTATION
Produce structured slide-by-slide content in a parseable format. Each slide must follow this exact format:

## SLIDE N: TITLE
Type: [title|agenda|content|table|chart-bar|chart-pie|two-column|quote|section-divider]
Title: [slide title text]
Subtitle: [optional subtitle]
Body:
- [bullet point content]
- [bullet point content]
Headers: [col1 | col2 | col3] (for table type only)
Row: [val1 | val2 | val3] (for table type, repeat for each row)
Data: [label:value, label:value] (for chart types only)
Notes: [speaker notes — what the presenter should say, 2-4 sentences]

Slide type guidance:
- **title**: Opening slide with title + subtitle
- **agenda**: Numbered agenda items
- **content**: Bullet points with key messages
- **table**: Structured data with Headers/Row format. Use RED/AMBER/GREEN for RAG values.
- **chart-bar/chart-pie**: Data visualisation with Data field
- **two-column**: Left/Right content split using "Left:" and "Right:" labels
- **quote**: Key quote or statistic with attribution
- **section-divider**: Section break with section title

Always include: Title slide, Agenda, Executive Summary, Key Findings, Recommendations, Next Steps.
Ensure speaker notes provide context beyond what's on the slide.`,
  },

  // ── PLANNING ───────────────────────────────────────────────
  {
    id: 'compliance-calendar',
    label: 'Compliance Calendar',
    icon: 'Calendar',
    description: 'Chronological deadlines, milestones, consultation periods',
    category: 'planning',
    exportFormats: ['xlsx', 'md'],
    estimatedLength: '1-3 pages',
    audience: 'Project team',
    promptInstruction: `## OUTPUT FORMAT: COMPLIANCE CALENDAR
Produce a comprehensive chronological compliance calendar for project teams and compliance functions tracking regulatory and implementation deadlines. This is an operational planning tool — it must be accurate, specific, and immediately actionable.

Main calendar table — sort strictly chronologically (earliest first):
| # | Date / Deadline | Year | Quarter | Event / Milestone | Category | Binding? | Jurisdiction | Action Required | Responsible Role | Status | Notes / Dependencies |

Column guidance:
- **Date / Deadline**: Use specific dates (DD MMM YYYY) where known. For consultation periods use "From: [date] — To: [date]". Use "TBC — estimated [Q/Year]" only when official date is not yet published.
- **Category**: Use exactly one of — Regulatory Deadline / Transposition Deadline / Application Date / Consultation Period / EBA/ESMA/ECB Publication / Supervisory Reporting / Internal Milestone / Review & Approval / Training Deadline / Board/Committee Date
- **Binding?**: Yes (legal obligation) / Soft (supervisory expectation/guidance) / Internal (self-imposed milestone)
- **Jurisdiction**: EU / National (specify country) / Global / Institution-specific
- **Responsible Role**: Job title or function, not a named individual
- **Status**: Not started / In progress / At risk / Complete / Overdue / Deferred

After the main table include:

**NEAR-TERM PRIORITY LIST** — Events in the next 90 days requiring immediate action (pull from table, add urgency context)

**CRITICAL PATH ITEMS** — Events where missing the deadline triggers regulatory, financial, or reputational consequence — describe the consequence for each

**CONSULTATION PERIODS OPEN NOW** — Regulatory consultations currently accepting responses, with submission deadline and topic summary

**CALENDAR GAPS & UNCERTAINTIES** — Dates not yet officially confirmed, publication dates pending, or items where the team must monitor for updates

**MONITORING APPROACH** — How and how often to update this calendar (who owns it, trigger events for ad-hoc updates, source monitoring list)

Quality bar: Cite the source of each date (regulation article, official publication, supervisory announcement). Do not include placeholder or invented dates — flag unknowns explicitly. If the scope covers multiple jurisdictions, use jurisdiction subheadings within each time period.`,
  },
  {
    id: 'monitoring-plan',
    label: 'Compliance Monitoring Plan',
    icon: 'Eye',
    description: 'Annual programme: activities, frequencies, methods, escalation triggers',
    category: 'planning',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '3-8 pages',
    audience: '2nd line',
    promptInstruction: `## OUTPUT FORMAT: COMPLIANCE MONITORING PLAN
Produce a formal second-line compliance monitoring programme for the annual planning cycle. Audience: Head of Compliance, CCO, and internal auditors. This must meet the standard expected in a supervisory inspection of a financial institution's compliance function.

**SECTION 1: PROGRAMME OVERVIEW**
- Scope statement: which regulations, processes, business lines, and entity types this programme covers
- Regulatory basis: which supervisory guidelines or internal policy mandate this monitoring programme (cite specific articles)
- Monitoring philosophy: risk-based approach rationale — how risk assessment drives prioritisation
- Programme owner and governance: who approves, reviews, and escalates findings

**SECTION 2: MONITORING ACTIVITY REGISTER**
Main table — one row per monitoring activity:
| # | Activity Name | Monitoring Type | Scope / Population | Regulatory Basis | Risk Rating | Frequency | Method | Sample Size / Coverage | KPIs / Metrics Measured | Escalation Trigger | Output / Report | Owner (Role) | Q1 | Q2 | Q3 | Q4 |

Column guidance:
- **Monitoring Type**: Ongoing (continuous/automated) / Periodic Review (scheduled, manual) / Thematic Review (deep-dive on specific risk area) / Transaction Testing / File Review / System/Control Testing / Interview-Based / Ad-Hoc (triggered by event)
- **Method**: Automated system query / Manual sampling / Data analytics / Document review / Mystery shopping / Staff interview / Control self-assessment / System walkthrough
- **Sample Size / Coverage**: Specify % of population or absolute number. State selection methodology (random / risk-stratified / judgement-based).
- **Escalation Trigger**: Specific quantitative threshold or qualitative condition that triggers escalation (e.g., "Error rate > 5%", "3+ Critical findings in quarter", "New regulatory guidance published")
- **Q1/Q2/Q3/Q4**: Mark with Scheduled (S), In Progress (P), or Complete (C)

Group rows by monitoring type with bold subheadings.

**SECTION 3: ANNUAL SCHEDULE**
Quarter-by-quarter summary: which activities are scheduled in which quarter, resource allocation per quarter (FTE days), and any regulatory reporting deadlines driving the schedule.

**SECTION 4: RESOURCE REQUIREMENTS**
FTE needs by role (Senior Compliance / Compliance Analyst / Data Analyst / External Support), total monitoring days per year, technology requirements (data access, sampling tools, reporting systems).

**SECTION 5: REPORTING FRAMEWORK**
How findings are reported, to whom, at what frequency:
| Report Name | Audience | Frequency | Content | Sign-off Required |

**SECTION 6: ESCALATION & ISSUE MANAGEMENT**
Rating scale for issues (Critical / High / Medium / Low), time-to-escalate requirements per rating, management action tracking process, and linkage to remediation plan.

**SECTION 7: PROGRAMME REVIEW**
Annual review trigger, mid-year rebalancing process, how emerging risks (new regulation, supervisory focus areas, internal incidents) are incorporated into the programme.

Quality bar: This plan must be audit-ready. Every activity must have a clear regulatory basis cited. Escalation triggers must be measurable. Do not include vague activities like "monitor AML processes" — be specific about what is monitored, how, and what good looks like.`,
  },
  {
    id: 'budget-resource-estimate',
    label: 'Budget & Resource Estimate',
    icon: 'Calculator',
    description: 'FTE needs, technology costs, external support, training investment',
    category: 'planning',
    exportFormats: ['xlsx', 'docx'],
    estimatedLength: '2-5 pages',
    audience: 'CFO, Sponsors',
    promptInstruction: `## OUTPUT FORMAT: BUDGET & RESOURCE ESTIMATE
Produce a structured budget and resource estimate for a compliance or financial crime prevention programme. Audience: CFO, programme sponsors, and budget holders who need to understand cost drivers, make build-vs-buy decisions, and phase investment over time. All figures are estimates — flag confidence levels and ranges where relevant.

**SECTION 1: ESTIMATE SUMMARY**
One-page summary table:
| Cost Category | One-Time (Implementation) | Annual Run-Rate | 3-Year Total | Confidence Level |

Confidence Levels: High (well-scoped, known rates) / Medium (some assumptions) / Low (rough order of magnitude, scope TBC)
Bottom-line total with range (low / base / high scenario).

**SECTION 2: INTERNAL RESOURCE REQUIREMENTS**
Table: FTE by role for implementation phase AND steady-state:
| Role | Seniority | Existing / New Hire | FTE % During Implementation | FTE % Steady-State | Fully Loaded Cost Rate (€/day) | Implementation Cost | Annual Steady-State Cost | Notes |

Include: Compliance, Technology/IT, Operations, Legal, Risk, Data, Project Management, Change Management. Flag roles where market availability is constrained or where specialist skills may be hard to hire.

**SECTION 3: EXTERNAL SUPPORT**
Table:
| Service Type | Provider Type | Scope | Duration | Day Rate (€) | Total Days | Total Cost | Assumptions |

Service types: Strategic advisory / Regulatory legal counsel / Technical implementation / Programme management / Training delivery / Independent review / Regulatory liaison

**SECTION 4: TECHNOLOGY & SYSTEMS**
Table:
| System / Tool | Purpose | Build vs Buy | Vendor (if known) | Licence Model | Year 1 Cost | Annual Cost | Implementation Cost | Dependencies |

Include: Transaction monitoring, Sanctions screening, KYC/CDD platform, Case management, Reporting, Data infrastructure, Integration/API work. Separate licence costs from implementation/configuration costs.

**SECTION 5: TRAINING INVESTMENT**
Table:
| Training Programme | Target Audience | Participants | Delivery Format | Development Cost | Delivery Cost per Run | Annual Runs | Annual Total |

**SECTION 6: PHASING OPTIONS**
Present 2–3 phasing scenarios:
- **Minimum Viable Compliance** — What is the minimum spend to meet hard regulatory deadlines?
- **Base Case** — Full programme delivered over [X] months
- **Accelerated** — What additional investment is needed to compress the timeline?

For each scenario: total cost, timeline, and key trade-offs.

**SECTION 7: KEY ASSUMPTIONS & EXCLUSIONS**
Numbered list of assumptions underpinning this estimate. Separate Inclusions from Exclusions explicitly. Flag the top 3 risks that could materially increase cost (with % impact estimate).

**SECTION 8: BUDGET RISKS**
| Risk | Probability | Impact on Budget | Mitigation |

Quality bar: Every line item must have a source for the estimate (market rate, supplier quote, internal benchmark, analogous project). Do not invent precise figures — use ranges and flag assumptions. This estimate must be defensible to a CFO who will challenge every line.`,
  },

  // ── EXPANDED FORMATS (Phase 4 — broader user base) ────────────────────────

  // ── Strategic (new) ────────────────────────────────────────────────────────
  {
    id: 'sharia-compliance-opinion',
    label: 'Islamic Compliance Opinion',
    icon: 'Scale',
    description: 'Formal Islamic compliance opinion: transaction structure, prohibition analysis, conditions, approval/rejection',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '2-5 pages',
    audience: 'Sharia board, Islamic finance clients',
    promptInstruction: `## OUTPUT FORMAT: ISLAMIC COMPLIANCE OPINION
Produce a formal Islamic compliance opinion suitable for Sharia supervisory board review.

Structure:
1. **Matter Reference** — Product/transaction name, date, institution
2. **Summary Opinion** — APPROVED / CONDITIONALLY APPROVED / NOT APPROVED (with one-paragraph rationale)
3. **Transaction Structure** — Plain-language description of the proposed structure with all cash flows and contractual relationships
4. **Sharia Analysis**
   - Applicable instrument(s) and their conditions (Murabaha, Ijara, Musharakah, Sukuk, etc.)
   - Core prohibitions assessment: Riba (interest) — present/absent/managed; Gharar (excessive uncertainty) — present/absent/managed; Maysir (speculation) — present/absent/managed; Haram sector exposure — confirm absence
   - Applicable AAOIFI/IFSB standards (cite standard number and title)
   - Jurisprudential basis and school of thought where material differences exist
5. **Conditions and Requirements** — Any structural changes, documentation requirements, or monitoring conditions required for approval
6. **Dissenting Views** — Note any significant differences of opinion among scholars on this structure
7. **Conclusion** — Final ruling with conditions (if any)

Style: Formal, precise, cite specific AAOIFI/IFSB standards and classical fiqh sources where relevant. Distinguish between binding conditions and best-practice recommendations.`,
  },
  {
    id: 'transfer-pricing-memo',
    label: 'Transfer Pricing Memo',
    icon: 'Receipt',
    description: 'TP documentation memo: functional analysis, method selection, benchmarking, arm\'s-length conclusion',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-15 pages',
    audience: 'Tax director, CFO, tax authorities',
    promptInstruction: `## OUTPUT FORMAT: TRANSFER PRICING MEMORANDUM
Produce a transfer pricing documentation memorandum meeting OECD BEPS Action 13 Master File / Local File standards.

Structure:
1. **Executive Summary** — Transaction type, parties, method selected, arm's-length conclusion (1 page)
2. **Transaction Overview** — Description of the controlled transaction: what is transferred (goods/services/IP/financing), between which entities, over what period, at what stated price
3. **Functional Analysis**
   - Functions performed by each party (tabular: Function | Entity A | Entity B)
   - Assets owned and contributed by each party
   - Risks assumed by each party (economic vs. contractual risk allocation per BEPS Actions 8-10)
   - Conclusion on functional characterisation of each entity (full-risk entrepreneur / limited-risk manufacturer / stripped routine distributor / etc.)
4. **Comparability Analysis** — Industry and market conditions relevant to pricing; relevant comparability factors per OECD Guidelines Chapter III
5. **Transfer Pricing Method**
   - Methods considered: CUP / Cost Plus / TNMM / RPM / PSM
   - Method selected with reasons (why most appropriate; why alternatives rejected)
6. **Benchmarking Analysis**
   - Search strategy and rejection criteria
   - Comparable set (anonymised identifiers acceptable)
   - Arm's-length range and interquartile range
   - Position of tested party's result within range
7. **Conclusion** — Whether the transaction price is within the arm's-length range; any adjustment required
8. **Audit Risk Assessment** — Likelihood of challenge, documentation strength, recommended reserves

Style: Precise, OECD Guidelines-compliant language. Cite specific OECD paragraphs. Flag any positions that deviate from consensus practice.`,
  },
  {
    id: 'policy-brief',
    label: 'Policy Brief',
    icon: 'FileStack',
    description: 'Evidence-based policy brief: problem, evidence, options, recommendation for government/NGO decision-makers',
    category: 'strategic',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '2-4 pages',
    audience: 'Ministers, senior officials, NGO leadership',
    promptInstruction: `## OUTPUT FORMAT: POLICY BRIEF
Produce a concise, evidence-based policy brief for government, NGO, or development organisation decision-makers. Maximum 4 pages — decision-makers have 10 minutes.

Structure:
1. **Issue Statement** — What is the problem and why does it matter now? (2-3 sentences)
2. **Background and Evidence** — Key facts, data, and context. Cite sources. Distinguish established evidence from emerging evidence. (Half page)
3. **Current Policy / Status Quo** — What is currently in place and what are its limitations?
4. **Options Analysis** — For each option (minimum 2, including do-nothing):
   - Description
   - Evidence of effectiveness (where available)
   - Benefits and risks
   - Cost and feasibility
   - Who is affected (including distributional effects on vulnerable groups)
5. **Recommended Option** — Clear recommendation with rationale. Lead with the recommendation, then defend it.
6. **Implementation Considerations** — Key steps, timeline, dependencies, stakeholders to engage
7. **Monitoring and Evaluation** — How success will be measured; key indicators; review timeline

Style: Lead with the recommendation. Use plain, direct language. Avoid jargon. Quantify benefits and costs where possible. Decision-makers need to act on this, not study it.`,
  },

  // ── Analytical (new) ─────────────────────────────────────────────────────
  {
    id: 'privacy-impact-assessment',
    label: 'Privacy Impact Assessment (DPIA)',
    icon: 'ShieldCheck',
    description: 'GDPR Article 35 DPIA: processing description, necessity, risk assessment, mitigations, DPO sign-off',
    category: 'analytical',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '5-12 pages',
    audience: 'DPO, Legal, IT, Supervisory authorities',
    promptInstruction: `## OUTPUT FORMAT: DATA PROTECTION IMPACT ASSESSMENT (DPIA)
Produce a GDPR Article 35-compliant Data Protection Impact Assessment.

Structure:
1. **Processing Description**
   - Purpose and legal basis (GDPR Article 6 and Article 9 if special categories)
   - Categories of personal data processed
   - Data subjects affected and approximate numbers
   - Data flows: collection → storage → processing → sharing → retention → deletion
   - Technology and systems involved
   - Data processors and third parties (with data transfer mechanism if outside EEA)

2. **Necessity and Proportionality Assessment**
   - Is this processing necessary for the stated purpose? Could less data achieve the same result?
   - Is the legal basis correctly identified and documented?
   - Are retention periods defined and justified?
   - Are data subject rights (access, erasure, portability, objection) achievable in this design?

3. **Risk Assessment**
   Table: | Risk | Likelihood (1-5) | Impact (1-5) | Risk Score | Risk Owner |
   Risk categories to assess: Unauthorised access / Data breach / Function creep / Profiling harm / Automated decision-making / Discrimination / Reputational harm / Regulatory non-compliance

4. **Risk Mitigation Measures**
   For each significant risk: mitigation measure → residual risk level → implementation owner → target date

5. **Residual Risk Conclusion**
   Overall residual risk: LOW / MEDIUM / HIGH
   If HIGH: supervisory authority consultation required (GDPR Article 36)

6. **Consultation**
   - DPO advice and date of consultation
   - Data subject consultation (if undertaken)
   - Any other stakeholders consulted

7. **Sign-off** — Controller representative, DPO, date, next review date

Style: GDPR-compliant language. Cite specific GDPR articles. Reference EDPB guidelines on DPIA where relevant. This document must be audit-ready.`,
  },

  // ── Operational (new) ────────────────────────────────────────────────────
  {
    id: 'campaign-brief',
    label: 'Campaign Brief',
    icon: 'Megaphone',
    description: 'Marketing/communications campaign brief: objective, audience, message, channels, KPIs, creative direction',
    category: 'operational',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '2-4 pages',
    audience: 'Marketing team, creative agency, comms team',
    promptInstruction: `## OUTPUT FORMAT: CAMPAIGN BRIEF
Produce a complete campaign brief for a marketing, communications, or behaviour-change campaign.

Structure:
1. **Campaign Overview** — Name, campaign type (awareness / acquisition / retention / advocacy / behaviour change), duration, budget range (if known)

2. **Objective** — Primary campaign objective (single, measurable). Secondary objectives if any.
   State as: "By [date], achieve [metric] by [% / absolute number] among [audience]"

3. **Target Audience**
   - Primary audience: demographics, psychographics, behaviour, attitudes
   - Secondary audience (if any)
   - What does the audience currently think/feel/do? What do we want them to think/feel/do?
   - Audience insight: what tension, aspiration, or pain point does this campaign address?

4. **Key Message**
   - Single core message (one sentence — the thing you'd want the audience to remember)
   - Supporting messages (max 3)
   - Tone of voice and personality

5. **Channel Strategy**
   For each channel: rationale, role in the campaign (awareness / engagement / conversion), budget allocation %, KPI

6. **Creative Direction**
   - Visual and messaging guidelines
   - What to avoid (off-brand, sensitive areas, competitor comparisons)
   - Mandatory brand elements

7. **KPIs and Measurement**
   Table: | KPI | Baseline | Target | Measurement Method | Reporting Frequency |

8. **Timeline and Milestones** — Key dates: brief approval, creative development, review, go-live, campaign end, evaluation

9. **Approval and Stakeholders** — Who must approve at each stage

Style: Clear, actionable, inspiring. Creative teams must be able to work from this immediately. Avoid vague objectives — every target must be measurable.`,
  },
  {
    id: 'product-requirements-doc',
    label: 'Product Requirements Doc (PRD)',
    icon: 'ClipboardList',
    description: 'Product Requirements Document: problem, user stories, acceptance criteria, technical constraints, success metrics',
    category: 'operational',
    exportFormats: ['docx', 'md'],
    estimatedLength: '4-10 pages',
    audience: 'Product team, engineers, designers',
    promptInstruction: `## OUTPUT FORMAT: PRODUCT REQUIREMENTS DOCUMENT (PRD)
Produce a complete Product Requirements Document.

Structure:
1. **Overview**
   - Problem statement: what user problem are we solving?
   - Why now: what has changed to make this the right time?
   - Out of scope: explicitly state what this PRD does NOT cover

2. **User Research Summary** — Key insights from user research supporting this initiative (or assumptions if research is pending)

3. **Goals and Success Metrics**
   Table: | Goal | Metric | Baseline | Target | Measurement Method |
   Separate: business goals / user goals / technical goals

4. **User Stories**
   For each story: As a [user type], I want to [action], so that [outcome]
   Acceptance criteria for each story (Given / When / Then format)
   Priority: P0 (must have for launch) / P1 (should have) / P2 (nice to have)

5. **Functional Requirements** — Detailed feature specifications grouped by user journey / feature area

6. **Non-Functional Requirements**
   - Performance: response times, load capacity
   - Security: data handling, authentication, authorisation
   - Accessibility: WCAG level
   - Compliance: GDPR, relevant regulations
   - Supported platforms and browsers

7. **Design Requirements** — Key UX principles, design system references, specific UI constraints

8. **Technical Constraints and Dependencies** — Existing systems to integrate with, technical debt constraints, infrastructure requirements

9. **Open Questions** — Unresolved decisions that must be made before development (with owner and due date)

10. **Launch Plan** — Rollout strategy (full launch / phased / A/B), go/no-go criteria, rollback plan

Style: Precise, unambiguous. Every requirement must be testable. Avoid "the system should be fast" — define "fast" specifically. Engineers should be able to estimate from this document.`,
  },

  // ── Communication (new) ──────────────────────────────────────────────────
  {
    id: 'plain-language-guide',
    label: 'Plain Language Guide',
    icon: 'BookOpen',
    description: 'Simple, clear guide for non-expert audiences: short sentences, no jargon, visual structure, real examples',
    category: 'communication',
    exportFormats: ['docx', 'pdf', 'md'],
    estimatedLength: '1-3 pages',
    audience: 'General public, low-literacy, first-time users',
    promptInstruction: `## OUTPUT FORMAT: PLAIN LANGUAGE GUIDE
Produce a plain language guide that any adult can understand, regardless of education level or prior knowledge.

Plain language rules to follow STRICTLY:
- Maximum sentence length: 20 words. Break longer sentences ruthlessly.
- Short paragraphs: maximum 3 sentences each.
- Use everyday words. If a simple word works, use it. Never use a complex word when a simple one will do.
- Define every technical term immediately after using it (in brackets if needed). Better: avoid the technical term entirely.
- Active voice always. "The bank will contact you" not "you will be contacted by the bank."
- Lead with the action. What does the reader need to DO? Put that first.
- Use "you" and "we" to make it personal.
- Use examples from real life that the target audience will recognise.
- Use numbered steps for processes — one action per step.
- Use headers to break the guide into clearly labelled sections (3-5 sections maximum).

Structure:
1. **What this guide is about** — One sentence. What problem does it solve?
2. **What you need to know** — Key facts, in order of importance
3. **What to do** — Step-by-step actions the reader should take
4. **What happens next** — What to expect after they act
5. **Where to get help** — Who to contact if they have questions

After drafting, review: Could a 14-year-old understand every sentence? If not, simplify further. Remove any sentence that does not directly help the reader take action.`,
  },
  {
    id: 'faq-document',
    label: 'FAQ Document',
    icon: 'HelpCircle',
    description: 'Frequently asked questions: plain-language answers, grouped by theme, designed for self-service',
    category: 'communication',
    exportFormats: ['docx', 'md', 'pdf'],
    estimatedLength: '2-6 pages',
    audience: 'Any — customers, staff, stakeholders',
    promptInstruction: `## OUTPUT FORMAT: FAQ DOCUMENT
Produce a well-structured Frequently Asked Questions document.

Approach:
- Think about what real users actually ask — not what the organisation wants them to ask. Start from the reader's perspective.
- Group questions by theme with clear headers (4-6 themes maximum).
- Put the most common / most important questions first within each theme.
- Each answer must be self-contained — the reader should not need to cross-reference other questions.
- Answers: direct and concise. State the answer first, then explain if needed. No more than 100 words per answer.
- Use plain language. Explain any unavoidable technical terms in the answer itself.
- End each answer with what the reader should do next (if applicable).

Structure:
For each theme, use this format:

## [Theme Name]

**Q: [Question as the user would actually ask it?]**
A: [Direct answer. Plain language. Action-oriented. Max 100 words.]

Minimum 12 questions total. Maximum 5 questions per theme.

After drafting, add at the end:
**Still have questions?** [Contact instructions or next steps]

Quality check: Every question must be phrased exactly as a real user would phrase it. Every answer must be immediately useful without reading any other section.`,
  },
  {
    id: 'press-release',
    label: 'Press Release / News Article',
    icon: 'Newspaper',
    description: 'News-format press release or article: inverted pyramid, headline, quotes, boilerplate',
    category: 'communication',
    exportFormats: ['docx', 'md', 'pdf'],
    estimatedLength: '1-2 pages',
    audience: 'Journalists, media, public',
    promptInstruction: `## OUTPUT FORMAT: PRESS RELEASE / NEWS ARTICLE
Produce a professional press release or news article using inverted pyramid structure.

Structure:
**[PRESS RELEASE / FOR IMMEDIATE RELEASE]**
**[Date]**

**HEADLINE** — Newsworthy, active voice, 8-12 words. What happened? Why does it matter?

**SUBHEADLINE** — Supporting context (optional, 10-15 words)

**DATELINE — Lead paragraph (1-2 sentences):** The most important information: who, what, when, where, why. If a journalist published only this paragraph, readers would still have the essential story.

**Second paragraph:** Key facts and context that support the lead. Quantify impact where possible.

**Quote paragraph:** A direct quote from the most relevant spokesperson, with full name and title. Quote must sound human, not like a press release. It should add perspective, not repeat facts.

**Body paragraphs:** Supporting detail in descending order of importance. Background context. Additional facts. Secondary quotes if relevant.

**[BOILERPLATE: ABOUT [ORGANISATION]]** — 2-3 sentence standard description

**Media contact:** Name, title, email, phone

Rules:
- Every paragraph must be able to stand alone if the editor cuts from the bottom.
- Active voice throughout.
- No jargon — if you use technical language, explain it immediately.
- Lead with the news, not the organisation's pride in its achievement.
- Numbers: spell out one to ten, use numerals for 11+. Use % not "percent".`,
  },
  {
    id: 'field-guide',
    label: 'Field Guide / Reference Card',
    icon: 'BookMarked',
    description: 'Quick-reference card for field workers, agents, or users: checklists, decision trees, "what to do if" tables',
    category: 'communication',
    exportFormats: ['docx', 'pdf'],
    estimatedLength: '1-2 pages',
    audience: 'Field workers, agents, front-line staff, rural users',
    promptInstruction: `## OUTPUT FORMAT: FIELD GUIDE / REFERENCE CARD
Produce a compact, practical reference guide for use in the field — by agents, community workers, traders, or any user who needs quick answers while doing a task.

Design principles:
- Everything must fit on 1-2 pages. Be ruthlessly selective: include only what someone needs in the moment.
- Use tables, checklists, and decision trees — not prose paragraphs.
- Every section answers one practical question: "What do I do when...?"
- Assume limited time. The user glances at this while doing something else.
- Use simple numbers and symbols (✓, ✗, !, →) to replace words wherever possible.

Structure (adapt to the topic):

## QUICK CHECKLIST — [Main task]
☐ Step 1 — [action]
☐ Step 2 — [action]
☐ Step 3 — [action]

## WHAT TO DO IF...
| Situation | Action | Who to call |
|---|---|---|
| [problem 1] | [response] | [contact] |

## AMOUNTS / LIMITS (if applicable)
| Item | Limit / Amount |
|---|---|

## RED FLAGS — STOP AND CHECK
⚠ [Warning sign 1]
⚠ [Warning sign 2]

## CONTACTS
[Role] — [Number/method]
[Role] — [Number/method]

After drafting: Can this be printed on one double-sided A5 sheet and used without internet? If not, cut further.`,
  },

  // ── Operational (new continued) ──────────────────────────────────────────
  {
    id: 'step-by-step-guide',
    label: 'Step-by-Step Guide',
    icon: 'ListOrdered',
    description: 'Numbered procedural guide: one action per step, decision points, what to do if something goes wrong',
    category: 'communication',
    exportFormats: ['docx', 'md', 'pdf'],
    estimatedLength: '2-5 pages',
    audience: 'Any — users, staff, community members',
    promptInstruction: `## OUTPUT FORMAT: STEP-BY-STEP GUIDE
Produce a clear procedural guide with numbered steps.

Rules:
- One action per step. Never combine two actions in one step.
- Steps are numbered, not bulleted. The sequence matters.
- Each step tells the reader exactly: what to do, how to know they did it correctly, and what to do next.
- Use screenshots, diagrams, or ASCII illustrations where they would help (describe them in [brackets]).
- Include decision points as clear branches: "If [X happens], go to Step 7. If [Y happens], go to Step 12."
- Include troubleshooting: "If this step doesn't work, try..." after steps where problems are common.
- Use plain language throughout. Test every step: could someone do this from the description alone, without help?

Structure:
**Before you start:** What you need / Prerequisites / Materials required

**Steps:**
1. [Do this specific thing] → ✓ You'll know this worked when [observable result]
2. [Next action]
   ⚠ Common mistake: [What people get wrong here and how to avoid it]
3. [Next action]
   ↳ If [problem], do [alternative action]

**What to do if something goes wrong:** [Top 3 problems and solutions]

**You're done when:** [Clear completion criteria]

**Next steps / Related guides:** [What to do after completing this]`,
  },
];

// ── Helper functions ───────────────────────────────────────

export function getFormatsByCategory(): Record<string, OutputFormat[]> {
  const grouped: Record<string, OutputFormat[]> = {};
  for (const fmt of OUTPUT_FORMATS) {
    if (!grouped[fmt.category]) grouped[fmt.category] = [];
    grouped[fmt.category].push(fmt);
  }
  return grouped;
}

export function getFormatById(id: string): OutputFormat | undefined {
  return OUTPUT_FORMATS.find((f) => f.id === id);
}

export function buildOutputInstruction(selectedIds: string[]): string {
  if (selectedIds.length === 0) return '';
  const formats = selectedIds.map((id) => OUTPUT_FORMATS.find((f) => f.id === id)).filter(Boolean) as OutputFormat[];
  if (formats.length === 0) return '';
  if (formats.length === 1) return formats[0].promptInstruction;

  return `## MULTIPLE DELIVERABLES REQUESTED
Produce ${formats.length} distinct deliverables. Each must stand alone as a complete document.
Use clear "# DELIVERABLE N: TITLE" headers between them.

${formats.map((f, i) => `### DELIVERABLE ${i + 1}: ${f.label.toUpperCase()}\n${f.promptInstruction}`).join('\n\n---\n\n')}`;
}

export function getRecommendedExportFormats(selectedIds: string[]): string[] {
  const formats = selectedIds.map((id) => OUTPUT_FORMATS.find((f) => f.id === id)).filter(Boolean) as OutputFormat[];
  const allExports = new Set<string>();
  for (const f of formats) {
    for (const e of f.exportFormats) allExports.add(e);
  }
  return [...allExports];
}

const CATEGORY_LABELS: Record<string, string> = {
  strategic: 'Strategic',
  analytical: 'Analysis',
  operational: 'Operational',
  scoring: 'Scoring',
  communication: 'Communication',
  planning: 'Planning',
};

export { CATEGORY_LABELS };
