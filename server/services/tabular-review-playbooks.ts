/**
 * tabular-review-playbooks.ts — playbook definitions for Wave 1 + 2.
 *
 * A "playbook" is a column set: N questions to ask about each document
 * dropped into a run. Wave 1 shipped one (AMLR Obligation Mapping); Wave 2
 * adds NDA Review, Employment Contract Review, GDPR DPA Compliance, and
 * DORA Art. 30 ICT Third-Party Review. Wave 3 will move these to a
 * `tabular_review_playbooks` DB table so customers can build their own.
 *
 * Each playbook owns its own auditor role-framing (`systemPrompt`) and
 * document framing (`documentContext`). The executor renders each cell
 * with those, so an NDA reviewer thinks like a contracts lawyer, an
 * AMLR reviewer like a compliance auditor, etc. — without changing the
 * executor logic.
 */

export interface PlaybookColumn {
  /** Stable id used as `column_id` in tabular_review_cells. Pick once,
   *  never rename — runs snapshot the playbook but cells reference by id. */
  id: string;
  /** Short header text shown above the column in the grid. */
  header: string;
  /** Article / framework reference rendered into the cell prompt. */
  regulatoryRef: string;
  /** What the cell is asking. Rendered into the user message. */
  question: string;
  /** Acceptance hint — what "covered" looks like. Helps the LLM stay strict. */
  expects: string;
}

export interface Playbook {
  id: string;
  name: string;
  description: string;
  /** The default model for cells in this playbook. Per-column override
   *  arrives in Wave 3. */
  defaultModel: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-7';
  /** Knowledge pack(s) to ground every cell prompt in (Wave 3+; today
   *  recorded but not yet auto-injected). */
  knowledgePackIds: string[];
  /** Sets the auditor role for every cell. Different playbooks have
   *  different framings — compliance auditor vs contract lawyer vs
   *  employment counsel vs ICT-risk lawyer. */
  systemPrompt: string;
  /** Per-document framing line rendered at the top of each cell prompt
   *  — "you are reviewing an NDA / a policy / a DPA / ...". */
  documentContext: string;
  columns: PlaybookColumn[];
}

// ───────────────────────────────────────────────────────────────────────
// 1. AMLR Obligation Mapping  (Wave 1 — the prototype)
// ───────────────────────────────────────────────────────────────────────

export const AMLR_OBLIGATION_MAPPING: Playbook = {
  id: 'amlr-obligation-mapping',
  name: 'AMLR Obligation Mapping',
  description:
    'Maps a folder of policy/procedure documents against the core AMLR ' +
    '(Regulation (EU) 2024/1624) obligations. Each cell answers "is this ' +
    'covered" with a quoted passage from the document, a status, and a ' +
    'short rationale.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['amlr-2024'],
  systemPrompt:
    'You are an experienced AML/CFT compliance auditor. You assess corporate policy ' +
    'documents against the EU Anti-Money Laundering Regulation (AMLR, (EU) 2024/1624) ' +
    'with the discipline of a regulatory examiner: explicit > implicit, evidence > ' +
    'paraphrase, strict > lenient. You respond ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a corporate AML/CFT policy or procedure document against ' +
    'the AMLR (Regulation (EU) 2024/1624).',
  columns: [
    {
      id: 'art9-internal-policies',
      header: 'Art. 9 — Internal policies',
      regulatoryRef: 'AMLR Art. 9 (Chapter II)',
      question:
        'Does the document establish, document and keep up-to-date written internal AML/CFT ' +
        'policies, procedures and controls, with explicit board / senior-management approval?',
      expects:
        'A named policy statement, dated approval at board / senior-management level, and a ' +
        'review cadence. Generic "we comply with the law" language is NOT coverage.',
    },
    {
      id: 'art10-risk-based-approach',
      header: 'Art. 10 — Risk-based approach',
      regulatoryRef: 'AMLR Art. 10 (Chapter II)',
      question:
        'Does the document describe a risk-based approach: assessment of inherent ML/TF risk, ' +
        'documentation of risk factors (customer, country, product, channel), and proportional ' +
        'mitigation?',
      expects:
        'An explicit BWRA reference or risk-categorisation taxonomy. A bullet list of risk ' +
        'factors is necessary but not sufficient; mitigation linkage is required.',
    },
    {
      id: 'art11-compliance-officer',
      header: 'Art. 11 — Compliance officer',
      regulatoryRef: 'AMLR Art. 11 (Chapter II)',
      question:
        'Does the document designate an AML compliance officer / MLRO with sufficient seniority, ' +
        'independence and resources, and define their reporting line?',
      expects:
        'A named role with a board / senior-management reporting line. A title alone is not ' +
        'enough; independence and resourcing must be addressed.',
    },
    {
      id: 'art13-training',
      header: 'Art. 13 — Training',
      regulatoryRef: 'AMLR Art. 13 (Chapter II)',
      question:
        'Does the document mandate ongoing AML/CFT training, with role-specific content, ' +
        'completion tracking, and refresher cadence?',
      expects:
        'A stated frequency (annual at minimum), role-specific tailoring, and a tracking ' +
        'mechanism. "Staff are trained" alone is not coverage.',
    },
    {
      id: 'art20-cdd-trigger',
      header: 'Art. 20 — CDD triggers',
      regulatoryRef: 'AMLR Art. 20 (Chapter III)',
      question:
        'Does the document specify when Customer Due Diligence (CDD) is triggered: at onboarding, ' +
        'at occasional transaction thresholds, on suspicion, and on doubt about previously ' +
        'obtained identification?',
      expects:
        'All four triggers should be named explicitly. Missing the "doubt" trigger is a frequent ' +
        'gap — surface it.',
    },
    {
      id: 'art22-identification',
      header: 'Art. 22 — Identification',
      regulatoryRef: 'AMLR Art. 22 (Chapter III)',
      question:
        'Does the document describe customer identification and verification procedures with ' +
        'specific documentary requirements for natural persons, legal entities, and trusts?',
      expects:
        'Concrete document lists (passport / utility bill / corporate registry extract / trust ' +
        'deed). Generic "verify identity" language is not coverage.',
    },
    {
      id: 'art42-beneficial-owner',
      header: 'Art. 42 — Beneficial owner',
      regulatoryRef: 'AMLR Art. 42 (Chapter III)',
      question:
        'Does the document define the beneficial-ownership identification process, including the ' +
        'shareholding threshold, control-by-other-means analysis, and senior-managing-official ' +
        'fallback when no UBO can be identified?',
      expects:
        'The 25 % threshold, alternative control routes, and the senior-managing-official ' +
        'fallback should all be named.',
    },
    {
      id: 'art34-ongoing-monitoring',
      header: 'Art. 34 — Ongoing monitoring',
      regulatoryRef: 'AMLR Art. 34 (Chapter III)',
      question:
        'Does the document mandate ongoing monitoring of customer relationships, including ' +
        'transaction scrutiny against the customer profile and periodic KYC refresh by risk ' +
        'rating?',
      expects:
        'A periodic-refresh schedule keyed to customer risk rating, plus transaction-pattern ' +
        'review. A one-time onboarding check is not ongoing monitoring.',
    },
    {
      id: 'art37-edd-triggers',
      header: 'Art. 37 — EDD triggers',
      regulatoryRef: 'AMLR Art. 37 (Chapter III)',
      question:
        'Does the document specify Enhanced Due Diligence triggers: high-risk third countries, ' +
        'PEPs, complex/unusual transactions, correspondent relationships, and other higher-risk ' +
        'factors?',
      expects:
        'PEPs and high-risk-country triggers at minimum; correspondent-banking and ' +
        'unusual-transaction triggers strengthen coverage.',
    },
    {
      id: 'art46-peps',
      header: 'Art. 46 — PEP procedures',
      regulatoryRef: 'AMLR Art. 46 (Chapter III)',
      question:
        'Does the document describe PEP screening, senior-management approval for PEP ' +
        'relationships, source-of-wealth checks, and enhanced ongoing monitoring of PEP customers?',
      expects:
        'All four elements (screening, approval, source-of-wealth, ongoing monitoring). Naming a ' +
        'screening vendor without the procedural elements is not coverage.',
    },
    {
      id: 'art69-sar',
      header: 'Art. 69 — SAR reporting',
      regulatoryRef: 'AMLR Art. 69 (Chapter V)',
      question:
        'Does the document describe internal suspicious-activity escalation, the SAR filing ' +
        'process to the FIU, the tipping-off prohibition, and the staff-protection guarantee?',
      expects:
        'Internal escalation path, FIU filing mechanism, tipping-off prohibition, and ' +
        'whistleblower protection — all four should appear.',
    },
    {
      id: 'art77-record-retention',
      header: 'Art. 77 — Record retention',
      regulatoryRef: 'AMLR Art. 77 (Chapter VII)',
      question:
        'Does the document mandate retention of CDD records and transaction data for at least ' +
        'five years after the end of the business relationship or occasional transaction?',
      expects:
        'The "5 years" period must be stated explicitly. Retention against an unspecified ' +
        '"applicable law" is partial coverage at best.',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 2. NDA Review
// ───────────────────────────────────────────────────────────────────────

export const NDA_REVIEW: Playbook = {
  id: 'nda-review',
  name: 'NDA Review',
  description:
    'Reviews a folder of NDAs / confidentiality agreements against the standard ' +
    'commercial-contract clause checklist. Flags one-sided terms, missing carve-outs, ' +
    'and concerning provisions like residuals clauses or unlimited liability.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: [],
  systemPrompt:
    'You are an experienced commercial contracts lawyer reviewing non-disclosure agreements ' +
    '(NDAs). You assess each clause with the discipline of a transaction lawyer: explicit > ' +
    'implicit, evidence > paraphrase, strict > lenient. You flag one-sided terms and unusual ' +
    'provisions even when the document is otherwise standard. You respond ONLY with the ' +
    'requested JSON object.',
  documentContext:
    'You are reviewing a Non-Disclosure Agreement (NDA) or confidentiality clause.',
  columns: [
    {
      id: 'nda-mutuality',
      header: 'Mutuality',
      regulatoryRef: 'NDA — structure',
      question:
        'Is the NDA mutual (both parties have confidentiality obligations) or one-way ' +
        '(only one party disclosing)?',
      expects:
        'Status: "covered" if mutual, "partial" if mutual on the face but materially ' +
        'asymmetric in carve-outs/obligations, "missing" if one-way against your principal.',
    },
    {
      id: 'nda-definition-confidential',
      header: 'Definition of Confidential Info',
      regulatoryRef: 'NDA — Clause 1',
      question:
        'Is "Confidential Information" defined with reasonable breadth and the standard ' +
        'carve-outs (publicly available, already known, independently developed, lawfully ' +
        'obtained from third party, required by law)?',
      expects:
        'All five standard carve-outs should appear. "Covered" requires all; "partial" if ' +
        'one or two are missing; "missing" if the definition is silent on carve-outs.',
    },
    {
      id: 'nda-term',
      header: 'Term / Duration',
      regulatoryRef: 'NDA — Term',
      question:
        'What is the term of the confidentiality obligation, and does it survive termination? ' +
        'Is the survival period reasonable (typically 2–5 years for ordinary commercial info, ' +
        'longer for trade secrets)?',
      expects:
        'A stated term + a stated survival period. Unlimited / perpetual confidentiality for ' +
        'ordinary commercial information is "partial" (uncommercial); silence is "missing".',
    },
    {
      id: 'nda-permitted-disclosures',
      header: 'Permitted disclosures',
      regulatoryRef: 'NDA — Permitted Disclosures',
      question:
        'Does the NDA permit disclosure to employees / advisors on a need-to-know basis, ' +
        'and disclosure required by law / regulator / court order (with notice obligation)?',
      expects:
        'Both routes should appear. Notice obligation on legal compulsion is the marker of ' +
        'a well-drafted clause; its absence is "partial".',
    },
    {
      id: 'nda-use-restriction',
      header: 'Use restriction',
      regulatoryRef: 'NDA — Permitted Purpose',
      question:
        'Is use of Confidential Information restricted to a defined "Purpose" (e.g. ' +
        'evaluating a transaction)? Open-ended "any business purpose" language is concerning.',
      expects:
        'A specific Purpose defined; use limited to it. Open-ended use is "partial"; absence ' +
        'of any use restriction is "missing".',
    },
    {
      id: 'nda-return-destruction',
      header: 'Return / destruction',
      regulatoryRef: 'NDA — Return of Materials',
      question:
        'Is the recipient required to return or destroy Confidential Information on request or ' +
        'on termination, with a written confirmation/certification?',
      expects:
        'Return-or-destroy on request + certification. Silence on either side is "partial".',
    },
    {
      id: 'nda-residuals',
      header: 'Residuals clause',
      regulatoryRef: 'NDA — Residuals',
      question:
        'Does the NDA contain a "residuals" clause allowing the recipient to use information ' +
        'retained in the unaided memory of personnel? This is a red flag for the disclosing party.',
      expects:
        'For a balanced NDA: "missing" (no residuals clause) is GOOD; "covered" (clause is ' +
        'present and broadly drafted) is a RISK for the disclosing party. Flag it accordingly.',
    },
    {
      id: 'nda-injunctive-relief',
      header: 'Injunctive relief',
      regulatoryRef: 'NDA — Remedies',
      question:
        'Does the NDA acknowledge that breach causes irreparable harm and that the ' +
        'non-breaching party may seek injunctive relief in addition to damages?',
      expects:
        'Both elements: irreparable-harm acknowledgement + right to injunctive relief. ' +
        'Damages-only remedy is "partial".',
    },
    {
      id: 'nda-governing-law',
      header: 'Governing law',
      regulatoryRef: 'NDA — Governing Law',
      question:
        'What is the governing law and jurisdiction? Is the choice reasonable for the parties ' +
        '(neutral seat for cross-border, party home jurisdiction for domestic)?',
      expects:
        'A clearly stated governing law + exclusive or non-exclusive jurisdiction. Silence ' +
        'is "missing"; conflicting clauses are "partial".',
    },
    {
      id: 'nda-assignment',
      header: 'Assignment',
      regulatoryRef: 'NDA — Assignment',
      question:
        'Is assignment restricted? Can the NDA be assigned without consent to affiliates, ' +
        'successors, or acquirers of the business?',
      expects:
        'Standard: no assignment without consent, except to affiliates/successors. Free ' +
        'assignability is "partial" (risk).',
    },
    {
      id: 'nda-liability-cap',
      header: 'Liability cap',
      regulatoryRef: 'NDA — Liability',
      question:
        'Is there a cap or limitation on liability for breach of the NDA? Is wilful breach ' +
        'or breach of confidentiality carved out from the cap?',
      expects:
        'Either no cap (more common in NDAs), or a cap with wilful-breach carve-out. A capped ' +
        'liability with no carve-out for confidentiality breach is "partial".',
    },
    {
      id: 'nda-no-license',
      header: 'No licence / IP',
      regulatoryRef: 'NDA — IP',
      question:
        'Does the NDA expressly state that no licence to IP or other rights is granted by ' +
        'disclosure of Confidential Information?',
      expects:
        'A "no licence" or "no rights granted" sentence. Silence is "partial" — leaves room ' +
        'for implied-licence arguments.',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 3. Employment Contract Review
// ───────────────────────────────────────────────────────────────────────

export const EMPLOYMENT_CONTRACT_REVIEW: Playbook = {
  id: 'employment-contract-review',
  name: 'Employment Contract Review',
  description:
    'Reviews employment contracts against key statutory and contractual provisions, ' +
    'with EU + Nordic practice in mind. Flags non-compete enforceability red flags, ' +
    'missing statutory minimums, and one-sided restrictive covenants.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['employment-labor-law-eu'],
  systemPrompt:
    'You are an experienced employment lawyer reviewing employee contracts under EU + Nordic ' +
    'practice. You assess each clause with the discipline of a transaction + employment ' +
    'litigator combined: explicit > implicit, evidence > paraphrase, strict > lenient. You flag ' +
    'enforceability risks for restrictive covenants and missing statutory minimums. You ' +
    'respond ONLY with the requested JSON object.',
  documentContext:
    'You are reviewing an employment contract / employee agreement.',
  columns: [
    {
      id: 'empl-notice',
      header: 'Notice period',
      regulatoryRef: 'Employment — Notice',
      question:
        'Is the notice period clearly stated for both employer and employee, and is it at ' +
        'least the statutory minimum for the jurisdiction (typically 1–3 months, longer with ' +
        'tenure)?',
      expects:
        'Both sides stated; clearly meets statutory floor. Asymmetric notice (longer on the ' +
        'employee side) is "partial".',
    },
    {
      id: 'empl-probation',
      header: 'Probationary period',
      regulatoryRef: 'Employment — Probation',
      question:
        'Is there a probationary period? Is its length within the statutory maximum (typically ' +
        '3–6 months under EU Directive 2019/1152)?',
      expects:
        'Length stated, within statutory maximum, with reduced notice during probation. ' +
        'Longer than 6 months is "partial" or "missing" depending on jurisdiction.',
    },
    {
      id: 'empl-ip-assignment',
      header: 'IP assignment',
      regulatoryRef: 'Employment — IP',
      question:
        'Does the contract assign IP created by the employee in the course of employment to ' +
        'the employer, with adequate present-tense assignment language and waiver of moral ' +
        'rights where lawful?',
      expects:
        'Present-tense assignment ("hereby assigns") rather than promise to assign. Moral-rights ' +
        'waiver where permitted by jurisdiction. Future-IP-only clauses are "partial".',
    },
    {
      id: 'empl-non-compete',
      header: 'Non-compete',
      regulatoryRef: 'Employment — Restrictive Covenants',
      question:
        'Is there a non-compete? Is its scope (activity, geography, duration) reasonable, and ' +
        'is it paid (where required, e.g. Germany, Italy, France, Netherlands)?',
      expects:
        'Maximum 12 months in most EU jurisdictions; geographic scope must be tied to actual ' +
        'business; compensation required in several jurisdictions. Overbroad or unpaid clauses ' +
        'are "partial" (enforceability risk).',
    },
    {
      id: 'empl-non-solicit',
      header: 'Non-solicitation',
      regulatoryRef: 'Employment — Restrictive Covenants',
      question:
        'Is there a non-solicitation clause covering clients, prospects, employees, and ' +
        'contractors? Is the duration aligned with the non-compete?',
      expects:
        'Clients + employees as a minimum. Duration aligned with non-compete (typically 6–12 ' +
        'months). Unlimited duration is "partial".',
    },
    {
      id: 'empl-confidentiality',
      header: 'Confidentiality',
      regulatoryRef: 'Employment — Confidentiality',
      question:
        'Does the contract impose post-termination confidentiality obligations on the employee, ' +
        'with carve-outs for whistleblowing under EU Directive 2019/1937?',
      expects:
        'Post-termination confidentiality + explicit whistleblower carve-out. Missing the ' +
        'whistleblower carve-out is "partial".',
    },
    {
      id: 'empl-garden-leave',
      header: 'Garden leave',
      regulatoryRef: 'Employment — Garden Leave',
      question:
        'Does the contract include a garden-leave provision allowing the employer to require ' +
        'the employee to stay away during notice?',
      expects:
        'Express right to require garden leave, with continued pay. Silence is "missing" — ' +
        'garden leave is not automatic under most EU laws.',
    },
    {
      id: 'empl-severance',
      header: 'Severance / termination pay',
      regulatoryRef: 'Employment — Termination',
      question:
        'Are termination scenarios (with cause, without cause, redundancy) clearly distinguished, ' +
        'and is severance pay aligned with the jurisdiction\'s statutory floor?',
      expects:
        'Scenarios distinguished + statutory severance referenced or improved upon. ' +
        '"Termination at will" is uncommon in EU/Nordic — flag it as "partial".',
    },
    {
      id: 'empl-working-time',
      header: 'Working time / overtime',
      regulatoryRef: 'EU Working Time Directive 2003/88/EC',
      question:
        'Is working time consistent with the Working Time Directive (max 48 hrs/week incl. ' +
        'overtime, daily rest, weekly rest)? Is overtime addressed (paid, time off in lieu, or ' +
        'opt-out where permitted)?',
      expects:
        'Express 48 hr cap or compliant approach, overtime treatment stated. Silence on ' +
        'overtime is "partial".',
    },
    {
      id: 'empl-holiday',
      header: 'Holiday entitlement',
      regulatoryRef: 'EU Working Time Directive 2003/88/EC',
      question:
        'Is the annual holiday entitlement at least the statutory minimum (4 weeks under the ' +
        'WTD; 25 days in many EU/Nordic countries by national law)?',
      expects:
        '20 days (WTD floor) at absolute minimum; 25 days for full EU compliance with most ' +
        'national norms. Anything below 20 days is "missing".',
    },
    {
      id: 'empl-gdpr',
      header: 'GDPR / employee data',
      regulatoryRef: 'GDPR Art. 88 + national employment data rules',
      question:
        'Does the contract reference the employer\'s privacy notice for employee personal data ' +
        'processing, including monitoring, background checks, and international transfers?',
      expects:
        'Reference to a standalone privacy notice + lawful-basis statement (typically Art. ' +
        '6(1)(b) for contract performance, Art. 9 with consent/explicit basis for special-' +
        'category data). Missing is "partial".',
    },
    {
      id: 'empl-governing-law',
      header: 'Governing law / forum',
      regulatoryRef: 'Rome I + Brussels I Recast',
      question:
        'Is governing law and forum stated, and does it respect the employee\'s mandatory ' +
        'protections under the law of the place of habitual work (Rome I Art. 8)?',
      expects:
        'Governing law + jurisdiction stated. Choice of foreign law that overrides mandatory ' +
        'local protections is "partial" — the employee can still rely on local mandatory rules.',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 4. GDPR DPA Compliance (Art. 28)
// ───────────────────────────────────────────────────────────────────────

export const GDPR_DPA_COMPLIANCE: Playbook = {
  id: 'gdpr-dpa-compliance',
  name: 'GDPR DPA Compliance (Art. 28)',
  description:
    'Reviews Data Processing Agreements against GDPR Article 28 mandatory requirements ' +
    'plus security (Art. 32), breach notification (Art. 33–34), DPIAs (Art. 35), and ' +
    'international transfer mechanisms (Chapter V).',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['gdpr-ai-act'],
  systemPrompt:
    'You are an experienced data protection lawyer reviewing Data Processing Agreements ' +
    'against GDPR Article 28 and adjacent obligations (security, sub-processors, transfers, ' +
    'breach notification, audits). You assess each clause with the discipline of a regulatory ' +
    'examiner: explicit > implicit, evidence > paraphrase, strict > lenient. You respond ' +
    'ONLY with the requested JSON object.',
  documentContext:
    'You are reviewing a Data Processing Agreement (DPA) or processor-controller addendum.',
  columns: [
    {
      id: 'dpa-instructions',
      header: 'Art. 28(3)(a) — Documented instructions',
      regulatoryRef: 'GDPR Art. 28(3)(a)',
      question:
        'Does the DPA require the processor to act only on documented instructions from the ' +
        'controller, including for international transfers?',
      expects:
        'Express "only on documented instructions" wording + flag for international transfers. ' +
        'Silence on either is "partial".',
    },
    {
      id: 'dpa-confidentiality',
      header: 'Art. 28(3)(b) — Confidentiality',
      regulatoryRef: 'GDPR Art. 28(3)(b)',
      question:
        'Does the DPA require that personnel processing the data are bound by confidentiality ' +
        'or under an appropriate statutory obligation of confidentiality?',
      expects:
        'Express staff-confidentiality commitment. Generic "we keep things confidential" ' +
        'language is "partial".',
    },
    {
      id: 'dpa-security',
      header: 'Art. 32 — Security measures',
      regulatoryRef: 'GDPR Art. 32 (via Art. 28(3)(c))',
      question:
        'Does the DPA describe technical and organisational measures appropriate to the risk ' +
        '(pseudonymisation/encryption, integrity, availability, regular testing)?',
      expects:
        'A specific list or appendix of TOMs. A general "industry-standard security" reference ' +
        'is "partial".',
    },
    {
      id: 'dpa-subprocessors',
      header: 'Art. 28(2),(4) — Sub-processors',
      regulatoryRef: 'GDPR Art. 28(2) + 28(4)',
      question:
        'Does the DPA address sub-processor authorisation (general or specific written consent), ' +
        'with notice of changes and flow-down of the same data-protection obligations?',
      expects:
        'Authorisation regime + notice period + flow-down obligation. Missing any is "partial".',
    },
    {
      id: 'dpa-data-subject-rights',
      header: 'Art. 28(3)(e) — Data subject rights',
      regulatoryRef: 'GDPR Art. 28(3)(e)',
      question:
        'Does the DPA commit the processor to assist the controller in responding to data ' +
        'subject requests (access, rectification, erasure, restriction, portability, objection)?',
      expects:
        'Assistance commitment covering all six rights. Time-frame for assistance is a plus.',
    },
    {
      id: 'dpa-breach-notification',
      header: 'Art. 33(2) — Breach notification',
      regulatoryRef: 'GDPR Art. 33(2) (via Art. 28(3)(f))',
      question:
        'Does the DPA require the processor to notify the controller of personal data breaches ' +
        '"without undue delay" after becoming aware, with content sufficient to support the ' +
        'controller\'s 72-hour Art. 33(1) notification?',
      expects:
        '"Without undue delay" wording + content list (nature, categories, approximate numbers, ' +
        'mitigation). Fixed-hour notice (e.g. 24h, 48h) is acceptable; silence on content is ' +
        '"partial".',
    },
    {
      id: 'dpa-dpia-assistance',
      header: 'Art. 28(3)(f) — DPIA assistance',
      regulatoryRef: 'GDPR Art. 35 (via Art. 28(3)(f))',
      question:
        'Does the DPA require the processor to assist the controller with DPIAs and prior ' +
        'consultations with supervisory authorities?',
      expects:
        'Express DPIA + Art. 36 prior-consultation assistance. Silence is "missing".',
    },
    {
      id: 'dpa-return-deletion',
      header: 'Art. 28(3)(g) — Return / deletion',
      regulatoryRef: 'GDPR Art. 28(3)(g)',
      question:
        'Does the DPA require return or deletion of personal data at the end of the services, ' +
        'at controller\'s choice, with deletion certification?',
      expects:
        'Choice of return-or-delete + certification on request. One-way "delete only" is ' +
        '"partial"; silence on certification is "partial".',
    },
    {
      id: 'dpa-audit',
      header: 'Art. 28(3)(h) — Audit rights',
      regulatoryRef: 'GDPR Art. 28(3)(h)',
      question:
        'Does the DPA grant the controller audit rights (or a third-party auditor), including ' +
        'making available information necessary to demonstrate compliance?',
      expects:
        'Express audit right + information disclosure. Limiting audits to third-party certificates ' +
        '(SOC 2 / ISO 27001) without an audit right on cause is "partial".',
    },
    {
      id: 'dpa-international-transfers',
      header: 'Chapter V — International transfers',
      regulatoryRef: 'GDPR Chapter V (Art. 44–50)',
      question:
        'If personal data leaves the EEA, does the DPA identify the transfer mechanism ' +
        '(SCCs, BCRs, adequacy decision) and include a Transfer Impact Assessment commitment?',
      expects:
        'Mechanism named + TIA referenced. SCCs without TIA is "partial"; silence on transfers ' +
        'where they clearly occur is "missing".',
    },
    {
      id: 'dpa-liability',
      header: 'Liability allocation',
      regulatoryRef: 'GDPR Art. 82 + contract',
      question:
        'Does the DPA allocate liability for data protection breaches in a balanced way, ' +
        'including the processor\'s Art. 82 joint-and-several liability to data subjects?',
      expects:
        'Express allocation + reflection of Art. 82. A clause that disclaims processor ' +
        'liability for its own breaches is "missing" (unenforceable).',
    },
    {
      id: 'dpa-records',
      header: 'Art. 30(2) — Processor records',
      regulatoryRef: 'GDPR Art. 30(2)',
      question:
        'Does the processor commit to maintaining Art. 30(2) records of processing activities ' +
        'and to making them available to supervisory authorities on request?',
      expects:
        'Express Art. 30(2) records commitment. Silence is "missing".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 5. DORA Art. 30 — ICT Third-Party Risk
// ───────────────────────────────────────────────────────────────────────

export const DORA_ART30_REVIEW: Playbook = {
  id: 'dora-art30-review',
  name: 'DORA Art. 30 — ICT Third-Party Review',
  description:
    'Reviews ICT supplier / outsourcing / cloud / managed-services agreements against ' +
    'DORA Article 30 mandatory contractual provisions for ICT third-party arrangements. ' +
    'Each cell maps to a specific Art. 30 paragraph.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['dora-nis2'],
  systemPrompt:
    'You are an experienced ICT-risk and third-party-risk lawyer reviewing ICT supplier ' +
    'contracts under DORA (Digital Operational Resilience Act, (EU) 2022/2554). You assess ' +
    'each clause with the discipline of a financial regulator: explicit > implicit, evidence > ' +
    'paraphrase, strict > lenient. You distinguish requirements that apply to all ICT services ' +
    '(Art. 30(2)) from those that apply only to services supporting critical or important ' +
    'functions (Art. 30(3)). You respond ONLY with the requested JSON object.',
  documentContext:
    'You are reviewing an ICT supplier / outsourcing / cloud / managed-services agreement.',
  columns: [
    {
      id: 'dora-services-description',
      header: 'Art. 30(2)(a) — Service description',
      regulatoryRef: 'DORA Art. 30(2)(a)',
      question:
        'Does the contract contain a clear and complete description of all functions and ICT ' +
        'services to be provided, including whether sub-contracting is permitted?',
      expects:
        'A schedule / SoW with explicit service list + sub-contracting position. Vague ' +
        '"managed services" descriptions are "partial".',
    },
    {
      id: 'dora-locations',
      header: 'Art. 30(2)(b) — Service locations',
      regulatoryRef: 'DORA Art. 30(2)(b)',
      question:
        'Does the contract identify the countries / regions where services will be performed ' +
        'and where data will be processed, including for sub-contractors?',
      expects:
        'Country list (or region) for delivery + processing + sub-processor locations. ' +
        '"To be agreed" or unbounded is "partial".',
    },
    {
      id: 'dora-data-protection',
      header: 'Art. 30(2)(c) — Data protection',
      regulatoryRef: 'DORA Art. 30(2)(c)',
      question:
        'Does the contract include provisions on the availability, authenticity, integrity ' +
        'and confidentiality of data, including personal data?',
      expects:
        'All four (availability, authenticity, integrity, confidentiality) addressed. Missing ' +
        'any (especially authenticity) is "partial".',
    },
    {
      id: 'dora-data-access',
      header: 'Art. 30(2)(d) — Data access on termination',
      regulatoryRef: 'DORA Art. 30(2)(d)',
      question:
        'Does the contract guarantee access to, recovery of and return of personal and ' +
        'non-personal data in an easily accessible format on insolvency, resolution, ' +
        'discontinuance, or termination?',
      expects:
        'Access + recovery + return commitment, including in insolvency. Silence on insolvency ' +
        'is "partial".',
    },
    {
      id: 'dora-service-levels',
      header: 'Art. 30(2)(e) — Service levels',
      regulatoryRef: 'DORA Art. 30(2)(e)',
      question:
        'Does the contract include service level descriptions and quantitative / qualitative ' +
        'performance targets to allow effective monitoring?',
      expects:
        'Quantitative SLAs (uptime %, RTO/RPO, response time) + measurement + reporting cadence. ' +
        '"Best efforts" language is "partial".',
    },
    {
      id: 'dora-incident-support',
      header: 'Art. 30(2)(f) — Incident assistance',
      regulatoryRef: 'DORA Art. 30(2)(f)',
      question:
        'Does the contract oblige the ICT provider to provide assistance at no additional cost ' +
        'when an ICT-related incident occurs in the provider\'s services?',
      expects:
        '"At no additional cost" wording is the marker. "Reasonable assistance" without cost ' +
        'clarity is "partial".',
    },
    {
      id: 'dora-cooperate-authorities',
      header: 'Art. 30(2)(g) — Authority cooperation',
      regulatoryRef: 'DORA Art. 30(2)(g)',
      question:
        'Does the contract require the ICT provider to cooperate fully with the financial ' +
        'entity\'s competent authorities and resolution authorities?',
      expects:
        'Express cooperation duty named to competent + resolution authorities. Missing one ' +
        '(typically resolution authority) is "partial".',
    },
    {
      id: 'dora-termination-rights',
      header: 'Art. 30(2)(h) — Termination rights',
      regulatoryRef: 'DORA Art. 30(2)(h)',
      question:
        'Does the contract grant termination rights to the financial entity with adequate ' +
        'notice, including for breach, supervisory action, vulnerabilities, or material change?',
      expects:
        'Multiple termination triggers (breach, regulator-directed, material change, security ' +
        'failure). A single "for cause" trigger is "partial".',
    },
    {
      id: 'dora-exit-strategy',
      header: 'Art. 30(2)(i) — Exit strategy',
      regulatoryRef: 'DORA Art. 30(2)(i)',
      question:
        'Does the contract provide for an adequate transition period and transition / exit ' +
        'assistance after termination?',
      expects:
        'Stated exit period (typically 6–12 months) + assistance scope (data migration, ' +
        'knowledge transfer, parallel running). Silence is "missing".',
    },
    {
      id: 'dora-art30-3-audit',
      header: 'Art. 30(3)(e) — Audit rights (critical)',
      regulatoryRef: 'DORA Art. 30(3)(e) — applies to critical/important fns',
      question:
        'For ICT services supporting critical or important functions, does the contract grant ' +
        'unrestricted right of access, inspection and audit to the financial entity, third-party ' +
        'auditors, and competent authorities?',
      expects:
        'Three-tier audit right (FI + auditors + authorities). Limiting to third-party ' +
        'certifications only is "partial" for critical services.',
    },
    {
      id: 'dora-art30-3-security-testing',
      header: 'Art. 30(3)(d) — Security testing',
      regulatoryRef: 'DORA Art. 30(3)(d) — applies to critical/important fns',
      question:
        'For critical or important functions, does the contract include the right to ' +
        'participate in or conduct security testing, including penetration testing and TLPT?',
      expects:
        'Express right to perform / participate in security tests. Vendor-only testing is ' +
        '"partial" for critical services.',
    },
    {
      id: 'dora-art30-3-training',
      header: 'Art. 30(3)(f) — Training & awareness',
      regulatoryRef: 'DORA Art. 30(3)(f) — applies to critical/important fns',
      question:
        'For critical or important functions, does the contract require the ICT provider to ' +
        'have its staff trained on relevant security awareness programmes and digital ' +
        'operational resilience?',
      expects:
        'Express training-and-awareness obligation. Generic "competent staff" is "partial".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 6. UK ECCTA — Reasonable Procedures Mapping
// ───────────────────────────────────────────────────────────────────────

export const UK_ECCTA_REASONABLE_PROCEDURES: Playbook = {
  id: 'uk-eccta-reasonable-procedures',
  name: 'UK ECCTA — Reasonable Procedures Mapping',
  description:
    'Maps fraud-prevention policies and procedures against the six Home Office principles ' +
    'for the ECCTA 2023 s.199(4) "reasonable procedures" defence to the failure-to-prevent-' +
    'fraud offence (live 1 Sept 2025). Each cell asks whether a specific element of the ' +
    'defence is evidenced in the document, with a quoted passage as proof.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['uk-compliance-2025'],
  systemPrompt:
    'You are an experienced UK financial-crime / corporate-criminal lawyer reviewing a ' +
    'large organisation\'s fraud-prevention programme against the ECCTA 2023 s.199(4) ' +
    '"reasonable procedures" defence. The Home Office Nov 2024 statutory guidance sets out ' +
    'six principles (top-level commitment, risk assessment, proportionate procedures, due ' +
    'diligence, communication & training, monitoring & review). You assess each principle ' +
    'with the discipline of an SFO prosecutor + a defence reviewer combined: explicit > ' +
    'implicit, evidence > paraphrase, strict > lenient. Generic "we comply with applicable ' +
    'law" language is not coverage. You respond ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a corporate fraud-prevention policy, procedure or programme document ' +
    'against the UK ECCTA 2023 s.199(4) reasonable-procedures defence.',
  columns: [
    {
      id: 'eccta-p1a-board-statement',
      header: 'P1a — Board statement',
      regulatoryRef: 'ECCTA Principle 1 — Top-level commitment',
      question:
        'Does the document contain a written board / senior-management statement of zero ' +
        'tolerance for fraud, dated and approved at board / executive-committee level, ' +
        'communicated internally and externally?',
      expects:
        'A board-approved statement (dated; signed or minuted) + evidence of internal + ' +
        'external communication. Pre-printed mission-statement language is "partial"; ' +
        'silence is "missing".',
    },
    {
      id: 'eccta-p1b-named-owner',
      header: 'P1b — Named senior owner',
      regulatoryRef: 'ECCTA Principle 1 — Top-level commitment',
      question:
        'Does the document name a senior individual (SMF / executive committee member) ' +
        'accountable for fraud prevention, with a clear escalation path to the board?',
      expects:
        'A named role / SMF function holder + reporting line to board (or audit/risk ' +
        'committee). "Compliance owns it" without a board reporting line is "partial".',
    },
    {
      id: 'eccta-p2a-risk-register',
      header: 'P2a — Fraud risk register',
      regulatoryRef: 'ECCTA Principle 2 — Risk assessment',
      question:
        'Does the document evidence a documented fraud-risk register covering each ECCTA ' +
        'Schedule 13 base offence (FA 2006 ss.2, 3, 4, 11; false accounting; fraudulent ' +
        'trading; cheating the public revenue) as a candidate risk?',
      expects:
        'A risk register addressing the Schedule 13 offences explicitly. A generic "fraud ' +
        'risks" list without coverage of the Sched 13 offences is "partial".',
    },
    {
      id: 'eccta-p2b-refresh-cadence',
      header: 'P2b — Refresh cadence',
      regulatoryRef: 'ECCTA Principle 2 — Risk assessment',
      question:
        'Does the document specify a refresh cadence for the fraud risk assessment (annual ' +
        'at minimum) plus event-driven triggers (new business line, M&A, regulatory change, ' +
        'detected fraud incident)?',
      expects:
        'Annual cadence + named trigger events. Annual review without trigger events is ' +
        '"partial".',
    },
    {
      id: 'eccta-p3a-controls-mapped',
      header: 'P3a — Controls mapped to risks',
      regulatoryRef: 'ECCTA Principle 3 — Proportionate procedures',
      question:
        'Are specific prevention controls mapped to each identified fraud risk (one or more ' +
        'controls per risk), with the control owner identified?',
      expects:
        'Risk-to-control mapping table (or equivalent). A generic controls list not tied to ' +
        'risks is "partial".',
    },
    {
      id: 'eccta-p3b-financial-controls',
      header: 'P3b — Financial controls',
      regulatoryRef: 'ECCTA Principle 3 — Proportionate procedures',
      question:
        'Does the document address segregation of duties, approval thresholds, four-eyes ' +
        'review on payments / journal entries, and system-level controls for high-fraud-risk ' +
        'processes (vendor onboarding, customer refunds, expense claims)?',
      expects:
        'All four (segregation, approval thresholds, four-eyes, system controls) explicitly ' +
        'addressed for high-risk processes. Generic "we have controls" is "partial".',
    },
    {
      id: 'eccta-p4-associated-person-dd',
      header: 'P4 — Associated-person DD',
      regulatoryRef: 'ECCTA Principle 4 — Due diligence',
      question:
        'Does the document describe due-diligence procedures for associated persons (s.199(7): ' +
        'employees pre-hire, agents / intermediaries / JV partners pre-engagement), proportionate ' +
        'to fraud risk, with periodic refresh?',
      expects:
        'DD framework covering employees + agents/intermediaries/JV partners + refresh cadence. ' +
        'Employee-only DD is "partial"; silence on agents / intermediaries is "missing".',
    },
    {
      id: 'eccta-p5a-internal-training',
      header: 'P5a — Internal training',
      regulatoryRef: 'ECCTA Principle 5 — Communication & training',
      question:
        'Does the document mandate fraud-prevention training, with annual refresh, role-targeted ' +
        'modules for higher-risk roles (finance, procurement, sales, customer-facing), ' +
        'completion tracking, and induction modules for new joiners?',
      expects:
        'Annual cadence + role-targeted modules + completion tracking + induction. "Training ' +
        'available" without mandatory completion is "partial".',
    },
    {
      id: 'eccta-p5b-external-comms',
      header: 'P5b — External communication',
      regulatoryRef: 'ECCTA Principle 5 — Communication & training',
      question:
        'Are anti-fraud expectations communicated externally to associated persons (suppliers, ' +
        'agents, JV partners) — through contract clauses, codes of conduct, supplier handbooks, ' +
        'or joint training?',
      expects:
        'Contractual flow-down OR supplier code OR joint training — at least one route, ' +
        'documented. Silence is "missing".',
    },
    {
      id: 'eccta-p6a-monitoring-kpis',
      header: 'P6a — Monitoring KPIs',
      regulatoryRef: 'ECCTA Principle 6 — Monitoring & review',
      question:
        'Does the document define KPIs / metrics for fraud-prevention controls (e.g. control ' +
        'failures detected, audit findings, training completion rates), with internal audit ' +
        'coverage of the fraud-prevention programme?',
      expects:
        'Stated KPIs + internal-audit coverage cycle. KPIs without audit, or audit without KPIs, ' +
        'is "partial".',
    },
    {
      id: 'eccta-p6b-incident-learning',
      header: 'P6b — Incident learning loop',
      regulatoryRef: 'ECCTA Principle 6 — Monitoring & review',
      question:
        'Does the document describe a post-incident review process — when a fraud or near-miss ' +
        'is detected, root cause is analysed and procedures are updated to prevent recurrence?',
      expects:
        'Explicit post-incident review + feedback into procedure design. A pure "investigate and ' +
        'report" process without a procedure-update step is "partial".',
    },
    {
      id: 'eccta-reporting-whistleblower',
      header: 'Reporting & whistleblower',
      regulatoryRef: 'ECCTA Principle 1 / FCA SYSC 18',
      question:
        'Does the document establish confidential / anonymous reporting channels for suspected ' +
        'fraud, with whistleblower protection (no retaliation) and a clear reporting line up to ' +
        'the board / audit committee?',
      expects:
        'Confidential / anonymous channel + non-retaliation protection + board-level reporting ' +
        'line — all three. Missing any element is "partial".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 7. Swiss AMLA/LETA Readiness Mapping
// ───────────────────────────────────────────────────────────────────────

export const SWISS_AMLA_LETA_READINESS: Playbook = {
  id: 'swiss-amla-leta-readiness',
  name: 'Swiss AMLA/LETA — Readiness Mapping',
  description:
    'Maps a Swiss organisation\'s preparation against the two paired 2025/2026 reforms: ' +
    'the LETA federal UBO register (in-scope + reporting + verification) and the revised ' +
    'AMLA (extended adviser scope + tightened CDD documentation). Both adopted 26 Sept 2025 ' +
    'and expected to enter force mid-2026. Each cell asks whether a specific readiness ' +
    'element is evidenced in the document, with verbatim quoted evidence.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['swiss-compliance-2026'],
  systemPrompt:
    'You are an experienced Swiss financial-crime and corporate lawyer reviewing a firm\'s ' +
    'readiness for the 2026 LETA UBO-register regime and the revised AMLA. You assess each ' +
    'readiness element with the discipline of a FINMA examiner: explicit > implicit, ' +
    'evidence > paraphrase, strict > lenient. You distinguish obligations under LETA ' +
    '(reporting + verification + retention + access controls) from those under the revised ' +
    'AMLA (financial-intermediary scope + new adviser scope + CDD + SAR + organisational). ' +
    'You respond ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a Swiss organisation\'s implementation or readiness document for the ' +
    'LETA UBO-register regime and the revised AMLA (both expected in force mid-2026).',
  columns: [
    {
      id: 'ch-leta-scope',
      header: 'LETA — entity-scope determination',
      regulatoryRef: 'LETA Art. 2 (in-scope entities)',
      question:
        'Does the document evidence a documented scope assessment — which group entities ' +
        '(Swiss AGs, GmbHs, foundations, associations, trusts with Swiss link) are caught by ' +
        'LETA reporting, and which qualify for equivalence carve-outs (listed + regulated)?',
      expects:
        'A per-entity scope table + carve-out reasoning. A blanket "all Swiss subsidiaries are ' +
        'in scope" without entity-level analysis is "partial".',
    },
    {
      id: 'ch-leta-ubo-methodology',
      header: 'LETA — UBO identification methodology',
      regulatoryRef: 'LETA Art. 3 (definition of UBO)',
      question:
        'Does the document describe the UBO-identification methodology: ≥25% ownership / voting / ' +
        'profit-entitlement threshold; control by other means (board appointment, contractual); ' +
        'senior-managing-official fallback; trust-specific roles (settlor, trustee, protector, ' +
        'beneficiaries)?',
      expects:
        'All four elements (threshold + other-means + fallback + trust roles) addressed. ' +
        'Missing the fallback or trust roles is "partial".',
    },
    {
      id: 'ch-leta-verification',
      header: 'LETA — verification procedure',
      regulatoryRef: 'LETA Art. 8 (verification)',
      question:
        'Does the document specify the source documents required to verify UBO information ' +
        '(certified ID, corporate registry extracts, trust deeds, shareholder agreements) and ' +
        'prohibit reliance on undocumented self-declarations alone?',
      expects:
        'Concrete document list + explicit prohibition on declaration-only verification. ' +
        'Generic "verify with reliable sources" is "partial".',
    },
    {
      id: 'ch-leta-refresh',
      header: 'LETA — refresh + 30-day trigger',
      regulatoryRef: 'LETA Art. 5 (material-change refresh)',
      question:
        'Does the document mandate (a) refiling within 30 days of a material change (UBO ' +
        'change, threshold crossing, control change, dissolution) and (b) annual confirmation ' +
        'of accuracy regardless of change?',
      expects:
        'Both the 30-day material-change trigger AND the annual confirmation. Either alone ' +
        'is "partial".',
    },
    {
      id: 'ch-leta-retention',
      header: 'LETA — 10-year retention',
      regulatoryRef: 'LETA Art. 9 (document retention)',
      question:
        'Does the document mandate retention of supporting UBO documentation for at least ' +
        '10 years after the UBO ceases to qualify or the entity is dissolved, with access ' +
        'preserved for authorities, FIs and DNFBPs?',
      expects:
        'The 10-year retention period stated explicitly; access provisions referenced. ' +
        'Silence on the duration is "missing".',
    },
    {
      id: 'ch-amla-adviser-scope',
      header: 'AMLA revised — adviser scope assessment',
      regulatoryRef: 'AMLA Art. 2(1bis) (revised — new adviser scope)',
      question:
        'Has the firm assessed whether its activities (or those of any group function) fall ' +
        'within the new adviser scope: assisting with formation/management/administration of ' +
        'legal persons, real-estate / capital / asset transfers above thresholds, or M&A?',
      expects:
        'A documented scope assessment per practice area + jurisdiction. A generic "we are ' +
        'not advisers" without analysis of the specific activities is "missing".',
    },
    {
      id: 'ch-amla-adviser-cdd',
      header: 'AMLA — adviser CDD process',
      regulatoryRef: 'AMLA Art. 3-7 (CDD applied to advisers)',
      question:
        'For in-scope adviser activities, does the document set out the CDD process: identify ' +
        'contracting party, identify UBO, clarify background/purpose, document Form-A-equivalent, ' +
        'apply EDD for higher-risk situations?',
      expects:
        'All five CDD steps adapted for adviser engagements + Form-A-equivalent documentation. ' +
        'Lawyer-style "we keep client files" without CDD specifics is "partial".',
    },
    {
      id: 'ch-amla-adviser-sar',
      header: 'AMLA — adviser SAR procedure',
      regulatoryRef: 'AMLA Art. 9 (SAR to MROS) + Art. 10a (tipping-off)',
      question:
        'Does the document describe the SAR procedure for in-scope adviser activities: ' +
        'identifying well-founded suspicion, internal escalation, filing to MROS, asset blocking, ' +
        'tipping-off prohibition (including the legal-privilege carve-out limits)?',
      expects:
        'All five elements (suspicion, escalation, MROS filing, blocking, tipping-off). ' +
        'Missing the privilege-carve-out analysis is a frequent red flag — flag it.',
    },
    {
      id: 'ch-amla-bwra-refresh',
      header: 'AMLA — institution-wide risk assessment refresh',
      regulatoryRef: 'AMLA Art. 8 + AMLO-FINMA Art. 25',
      question:
        'Does the document evidence an updated institution-wide ML/TF risk assessment ' +
        'reflecting the new adviser scope (where applicable) and the LETA UBO-register interplay ' +
        '(register-data reliance + risks of over-reliance)?',
      expects:
        'Risk assessment dated within the last 12 months + addresses adviser scope (where ' +
        'relevant) + addresses LETA reliance. Generic risk assessment not refreshed is "partial".',
    },
    {
      id: 'ch-amla-training',
      header: 'AMLA — training updated',
      regulatoryRef: 'AMLO-FINMA Art. 24 (training)',
      question:
        'Does the training programme include role-targeted modules on: the new LETA filing + ' +
        'verification obligations; the revised AMLA adviser scope (where relevant); the ' +
        'tightened CDD documentation expectations; tipping-off + privilege carve-out limits?',
      expects:
        'All four topics + role-targeted delivery. Annual generic AML training without the ' +
        '2025/2026 reform content is "partial".',
    },
    {
      id: 'ch-leta-nfadp-interplay',
      header: 'nFADP — UBO data handling',
      regulatoryRef: 'nFADP Art. 7 + 12 (privacy by design + ROPA)',
      question:
        'Does the document address the personal-data dimensions of UBO processing: lawful basis ' +
        '(legal obligation under LETA + legitimate interest under AMLA), records of processing ' +
        '(ROPA entry), privacy-by-design (collect only what LETA requires), data subjects\' ' +
        'rights handling, retention alignment with the 10-year LETA period?',
      expects:
        'Lawful basis stated + ROPA entry + retention alignment. Missing the ROPA reference is ' +
        '"partial"; silence on lawful basis is "missing".',
    },
    {
      id: 'ch-governance-penalty',
      header: 'Governance + penalty exposure',
      regulatoryRef: 'LETA Art. 15 / AMLA Art. 37',
      question:
        'Does the document identify the accountable senior individual(s) for LETA + AMLA ' +
        'compliance, the escalation path to the board / audit committee, and the criminal + ' +
        'administrative penalty exposure (LETA: up to CHF 500,000; AMLA Art. 37 FINMA measures ' +
        '+ CC 305bis/305ter criminal liability) including director-personal liability?',
      expects:
        'Named senior individual + board escalation + named penalty exposure (LETA fine + AMLA ' +
        'sanctions). Missing the director-personal-liability angle is "partial".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 8. Ireland SEAR — Responsibility Map & SoR Mapping
// ───────────────────────────────────────────────────────────────────────

export const IRELAND_SEAR_RESPONSIBILITY_MAP: Playbook = {
  id: 'ireland-sear-responsibility-map',
  name: 'Ireland SEAR — Responsibility Map & SoR Mapping',
  description:
    'Maps a Management Responsibilities Map (MRM) and the associated Statements of ' +
    'Responsibilities (SoRs) against the SEAR / IAF Act 2023 requirements. Covers PCF + ' +
    'Inherent + Prescribed Responsibility allocation, the (I)NED extension live since 1 July ' +
    '2025, Common + Additional Conduct Standards, F&P certification, handover procedures, ' +
    'and the interplay with the Companies Act 2014 s.224 directors\' compliance statement.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['ireland-compliance-2026'],
  systemPrompt:
    'You are an experienced Irish financial-services lawyer reviewing a Management ' +
    'Responsibilities Map (MRM) + the related Statements of Responsibilities (SoRs) against ' +
    'the SEAR Regulations + IAF Act 2023 + CBI guidance. You assess each element with the ' +
    'discipline of a CBI on-site inspector: explicit > implicit, evidence > paraphrase, ' +
    'strict > lenient. You flag every Prescribed Responsibility that is unallocated, every ' +
    'PCF without a current SoR, and every Conduct Standard not reflected in the documentation. ' +
    'You respond ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a Management Responsibilities Map (MRM), Statement of Responsibilities ' +
    '(SoR), board / governance document or related SEAR-readiness document for an Irish ' +
    'regulated financial service provider.',
  columns: [
    {
      id: 'ie-pcf-identification',
      header: 'PCF identification + holder',
      regulatoryRef: 'SEAR Regs Pt II + F&P Regs',
      question:
        'Does the document identify each applicable PCF role (PCF-1 ED, PCF-2A NED, PCF-2B INED, ' +
        'PCF-3 Chair, PCF-8 CEO, PCF-11 CFO, PCF-12 Head of Compliance, PCF-14 Head of Risk, ' +
        'PCF-15 MLRO etc.) with the named individual currently holding the role + their CBI ' +
        'pre-approval status?',
      expects:
        'A complete PCF inventory + named holders + pre-approval status. Missing any PCF ' +
        'expected at the firm\'s authorisation level is "partial".',
    },
    {
      id: 'ie-sor-completeness',
      header: 'SoR completeness + currency',
      regulatoryRef: 'SEAR Regs Pt IV',
      question:
        'For each PCF, is there a Statement of Responsibilities that is signed by the ' +
        'individual, acknowledged by the firm, dated within the last 12 months (or following ' +
        'the most recent material change), and submitted to CBI within prescribed timeframes?',
      expects:
        'Signed + dated + acknowledged + current + filed-with-CBI. Missing any element is ' +
        '"partial"; missing SoRs entirely is "missing".',
    },
    {
      id: 'ie-inherent-resp',
      header: 'Inherent Responsibilities documented',
      regulatoryRef: 'SEAR Regs Sched 1',
      question:
        'For each PCF, does the SoR document the Inherent Responsibilities attaching to that ' +
        'role per CBI guidance (e.g. Chair leading board effectiveness; CEO implementing ' +
        'strategy; CFO integrity of financial information; Head of Compliance the compliance ' +
        'framework)?',
      expects:
        'Inherent Responsibilities listed verbatim or by clear cross-reference to CBI Sched 1. ' +
        'Summarising "leading the company" without role-specific Inherent Responsibilities is ' +
        '"partial".',
    },
    {
      id: 'ie-prescribed-resp-alloc',
      header: 'Prescribed Responsibilities allocated',
      regulatoryRef: 'SEAR Regs Sched 2 — PR1-PR10+',
      question:
        'Has every Prescribed Responsibility applicable to the firm been explicitly allocated ' +
        'to a named PCF holder in the MRM — risk-management framework, ICAAP/ILAAP, ' +
        'financial-crime systems, ICT/cyber resilience, regulatory-reporting integrity, ' +
        'business-continuity, whistleblowing, conduct + culture, outsourcing, and any ' +
        'firm-type-specific PRs?',
      expects:
        'Per-PR allocation table with named PCF holder. An unallocated PR is "missing"; ' +
        'multiple PRs concentrated on one holder without rationale is "partial".',
    },
    {
      id: 'ie-other-resp-alloc',
      header: 'Other (firm-specific) Responsibilities allocated',
      regulatoryRef: 'SEAR Regs Pt III(3)',
      question:
        'Does the MRM allocate material firm-specific responsibilities beyond the Prescribed + ' +
        'Inherent list — e.g. specific business lines, product responsibilities, geographic ' +
        'regions, regulatory programmes (DORA, AMLR readiness, CPC 2026 implementation)?',
      expects:
        'A material-firm-specific responsibilities section in the MRM with named owners. ' +
        'Absence at firms with material non-Prescribed activities is "partial".',
    },
    {
      id: 'ie-ined-scope',
      header: '(I)NED extension (PCF-2B)',
      regulatoryRef: 'SEAR Regs as amended; in force 1 Jul 2025',
      question:
        'Has the MRM been refreshed since 1 July 2025 to include (I)NEDs as PCF-2B with ' +
        'their Statements of Responsibilities (board committee chair allocations, senior ' +
        'independent director responsibilities, etc.) — and are F&P pre-approvals in place ' +
        'for the (I)NED cohort?',
      expects:
        'Post-1-July-2025 MRM version + (I)NED SoRs + (I)NED F&P pre-approvals. An MRM dated ' +
        'before 1 July 2025 without an updated version is "missing".',
    },
    {
      id: 'ie-common-cs',
      header: 'Common Conduct Standards embedded',
      regulatoryRef: 'Conduct Standards Regs Reg 5',
      question:
        'Are the five Common Conduct Standards (honesty + integrity; due skill, care + ' +
        'diligence; cooperation with the CBI; customers\' best interests + fair treatment; ' +
        'standards of market conduct) reflected in role descriptions, employment contracts, ' +
        'codes of conduct, training, and disciplinary policies for all CFs?',
      expects:
        'All five standards reflected across docs covering all CFs. Any standard missing or ' +
        'standards covering only PCFs (not all CFs) is "partial".',
    },
    {
      id: 'ie-additional-cs',
      header: 'Additional Conduct Standards reflected in SoRs',
      regulatoryRef: 'Conduct Standards Regs Reg 6',
      question:
        'Are the four Additional Conduct Standards (effective control; regulatory compliance; ' +
        'appropriate delegation + oversight; appropriate disclosure to CBI) reflected in each ' +
        'PCF\'s SoR — connecting their allocated responsibilities to the reasonable-steps ' +
        'test for the Duty of Responsibility?',
      expects:
        'Express ACS reflection per SoR + reasonable-steps language. Generic "senior manager ' +
        'responsibilities" without ACS mapping is "partial".',
    },
    {
      id: 'ie-fp-process',
      header: 'F&P pre-approval + ongoing certification',
      regulatoryRef: 'F&P Regs (CBR Act 2010 ss.20-22)',
      question:
        'Does the document evidence the F&P process: pre-approval submission (Individual ' +
        'Questionnaire) for every PCF; annual ongoing certification for every CF + PCF; ' +
        'material-change reporting; records retention; senior-level sign-off?',
      expects:
        'Pre-approval workflow + annual certification + material-change reporting + records. ' +
        'Missing the ongoing certification cadence is "partial".',
    },
    {
      id: 'ie-handover',
      header: 'Handover Procedures for PCF transitions',
      regulatoryRef: 'SEAR Regs Pt IV(4) + CBI Guidance',
      question:
        'Does the firm document Handover Procedures for PCF transitions — handover certificate ' +
        'or note covering material risks, ongoing investigations, open regulatory matters, ' +
        'pending board decisions, key relationships, with timely MRM + SoR updates and CBI ' +
        'filing?',
      expects:
        'A documented handover process + transition-period MRM/SoR refresh discipline. ' +
        'Silence on PCF transitions is "partial".',
    },
    {
      id: 'ie-board-oversight',
      header: 'Board oversight + breach reporting',
      regulatoryRef: 'SEAR Regs + Conduct Standards Regs + IAF Act 2023',
      question:
        'Does the document evidence board / risk-committee oversight of SEAR compliance — ' +
        'agenda items, annual attestation, MRM review schedule, Conduct Standards breach ' +
        'reporting to CBI within prescribed timeframes, and integration with the firm\'s ' +
        'whistleblowing channel (PR8)?',
      expects:
        'Board attestation + breach-reporting cadence + whistleblowing integration. Missing ' +
        'the CBI breach-reporting timeline is "partial".',
    },
    {
      id: 'ie-companies-act-interplay',
      header: 'Companies Act s.224 interplay',
      regulatoryRef: 'Companies Act 2014 ss.223-225',
      question:
        'Does the document reconcile the SEAR responsibility allocation with the Companies ' +
        'Act 2014 s.224 directors\' compliance statement + s.225 codified directors\' duties ' +
        'so that a single set of governance evidence supports both regimes?',
      expects:
        'Express cross-reference + a single governance architecture covering both. Silence on ' +
        'the s.224 / s.225 interplay is "partial"; a complete separation of the two regimes ' +
        'in the documentation is "missing" (inefficient + risky).',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 9. Luxembourg AIFMD II — ManCo Readiness Mapping
// ───────────────────────────────────────────────────────────────────────

export const LUXEMBOURG_AIFMD_II_READINESS: Playbook = {
  id: 'luxembourg-aifmd-ii-readiness',
  name: 'Luxembourg AIFMD II — ManCo Readiness Mapping',
  description:
    'Maps a Luxembourg IFM (UCITS ManCo / AIFM / Super ManCo) preparation against the AIFMD ' +
    'II reforms (Directive (EU) 2024/927 transposed by Bill 8628 in force 16 April 2026) and ' +
    'the CSSF Circular 25/901 IFM-reporting overhaul. Each cell asks whether a specific ' +
    'readiness element is evidenced in the document, with verbatim quoted evidence.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['luxembourg-compliance-2026'],
  systemPrompt:
    'You are an experienced Luxembourg funds + financial-services lawyer reviewing an IFM ' +
    '(UCITS Management Company / AIFM / Super ManCo) readiness document against AIFMD II ' +
    '(Directive (EU) 2024/927 + Lux Bill 8628 in force 16 April 2026) and CSSF Circular ' +
    '25/901 (consolidated IFM reporting, first cycle FY 2026). You assess each readiness ' +
    'element with the discipline of a CSSF on-site inspector: explicit > implicit, evidence ' +
    '> paraphrase, strict > lenient. You distinguish what every IFM must do (LMT selection + ' +
    'delegation review + substance + 25/901 reporting) from what only LO-AIF managers must do ' +
    '(leverage cap + retention + concentration + LO-specific risk-management). You respond ' +
    'ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a Luxembourg IFM\'s AIFMD II + CSSF Circular 25/901 readiness, ' +
    'governance, or implementation document.',
  columns: [
    {
      id: 'lu-scope-impact',
      header: 'Scope + impact assessment',
      regulatoryRef: 'AIFMD II + Bill 8628',
      question:
        'Does the document evidence a documented impact assessment of AIFMD II across the ' +
        'IFM\'s products: identification of LO-AIFs (if any), open-ended funds requiring LMT ' +
        'selection, retail-marketed AIFs, delegations to be revisited, conducting-officer + ' +
        'substance arrangements?',
      expects:
        'A product-by-product impact table referencing AIFMD II articles. Generic "we are ' +
        'preparing" language without specific impacts identified is "partial".',
    },
    {
      id: 'lu-lo-aif-framework',
      header: 'LO-AIF framework',
      regulatoryRef: 'AIFMD II Art. 15-15a — Loan-Originating AIFs',
      question:
        'For any LO-AIF managed, does the document evidence: the closed-ended 175% leverage ' +
        'cap (or open-ended 300%) computed on a commitment basis, the 20% NAV single-borrower ' +
        'concentration limit, the 5% retention obligation on transferred loans, and LO-AIF-' +
        'specific risk-management + liquidity policies?',
      expects:
        'All four elements (leverage, concentration, retention, policies). Marked "not_applicable" ' +
        'is acceptable if the IFM manages no LO-AIFs. Partial coverage at any IFM with LO-AIFs ' +
        'is "missing".',
    },
    {
      id: 'lu-lmt-selection',
      header: 'LMT selection — minimum two',
      regulatoryRef: 'AIFMD II Art. 16 + Annex V',
      question:
        'For each open-ended AIF + UCITS, does the document evidence selection of at least 2 ' +
        'Liquidity Management Tools from the AIFMD II / UCITS harmonised list (Annex V — ' +
        'gates / notice extension / fees / swing pricing / dual pricing / anti-dilution levy ' +
        '/ side pockets / suspension / redemption in kind)?',
      expects:
        'A per-fund LMT-selection table with at least 2 LMTs each. Selecting only suspension + ' +
        'in-kind redemption (the legal defaults) is "partial" — the spirit is active selection.',
    },
    {
      id: 'lu-lmt-activation',
      header: 'LMT activation governance',
      regulatoryRef: 'AIFMD II Art. 16 — activation procedure',
      question:
        'Does the document define LMT activation governance: triggers + criteria, approval ' +
        'authority (senior management for suspension + side pockets; portfolio function for ' +
        'others), investor disclosure mechanism, CSSF notification timing (immediate for ' +
        'suspension / side pockets), annual review of the framework?',
      expects:
        'All five elements (triggers, approval authority, disclosure, CSSF notification, ' +
        'annual review). Missing CSSF notification cadence is "partial".',
    },
    {
      id: 'lu-delegation-review',
      header: 'Delegation framework review',
      regulatoryRef: 'AIFMD II Art. 20',
      question:
        'Does the document evidence a comprehensive delegation review against AIFMD II: ' +
        'letter-box-entity self-assessment, full notification of delegation chain (function, ' +
        'delegate identity, jurisdiction, sub-delegations) to CSSF, oversight model, ' +
        'heightened scrutiny of out-of-EU portfolio + risk-management delegation?',
      expects:
        'A delegation register + letter-box self-assessment + CSSF notification plan. CSSF ' +
        'Circular 18/698 reference strengthens coverage. Silence on letter-box self-assessment ' +
        'is "partial".',
    },
    {
      id: 'lu-substance',
      header: 'Substance — conducting officers + governance',
      regulatoryRef: 'AIFMD II Art. 20 + Lux conducting-officer framework',
      question:
        'Does the document evidence sufficient Lux substance: at least 2 conducting officers ' +
        'resident in Luxembourg (or governing-body members committed full-time), allocation of ' +
        'functions across them, sufficient resources per function, documented decision-making ' +
        'at IFM level (not the parent / delegate)?',
      expects:
        'Named conducting officers + function allocation + resources stated + decision-making ' +
        'locus. Reference to CSSF Circular 18/698 reinforces. Silence on resources is "partial".',
    },
    {
      id: 'lu-cssf-25-901-reporting',
      header: 'CSSF Circular 25/901 reporting readiness',
      regulatoryRef: 'CSSF Circular 25/901',
      question:
        'Does the document evidence readiness for the consolidated CSSF 25/901 IFM report (first ' +
        'cycle FY 2026): data-collection for governance, delegation chain, AUM + leverage + ' +
        'LMT metrics, risk-management, ICT-risk (DORA), sustainability (SFDR), AML, with ' +
        'planned submission via CSSF eDesk within 4 months of year-end?',
      expects:
        'A data-collection plan covering all 25/901 Parts (II-VI) + the submission timeline. ' +
        'Missing any of the cross-functional integrations (ICT / SFDR / AML) is "partial".',
    },
    {
      id: 'lu-risk-management',
      header: 'Risk-management uplift',
      regulatoryRef: 'AIFMD II Art. 15 + AIFM Law Art. 14',
      question:
        'Does the document evidence the risk-management framework uplift required for LO-AIFs + ' +
        'open-ended funds: stress-testing programme (credit + liquidity scenarios for LO-AIFs, ' +
        'multi-redemption + drawdown for open-ended), reverse stress-testing for liquidity, ' +
        'independent risk-management function review, integration with LMT activation?',
      expects:
        'Stress-testing scope + reverse stress-testing + independent review + LMT integration. ' +
        'For non-LO IFMs the LO-specific elements are "not_applicable", but open-ended stress-' +
        'testing + reverse stress-testing remain required.',
    },
    {
      id: 'lu-depositary',
      header: 'Depositary arrangements updated',
      regulatoryRef: 'AIFMD II Art. 21 (depositary)',
      question:
        'Does the document evidence updates to depositary agreements + arrangements: ' +
        'cooperation + reporting obligations clarified, cash-flow monitoring scope, safekeeping ' +
        'of crypto-assets where AIFs hold them, depositary direct-to-CSSF reporting in case of ' +
        'AIFM failure?',
      expects:
        'Updated depositary agreement reference + cash-flow + crypto-safekeeping treatment + ' +
        'direct-reporting acknowledgement. Silence on crypto-safekeeping is "partial" only for ' +
        'IFMs holding crypto-assets; otherwise "not_applicable".',
    },
    {
      id: 'lu-retail-marketing',
      header: 'Retail AIF marketing readiness',
      regulatoryRef: 'AIFMD II Art. 30a',
      question:
        'Where the IFM markets AIFs to retail clients (typically via Part II UCIs), does the ' +
        'document evidence retail-appropriate disclosures (PRIIPS KID), suitability or ' +
        'appropriateness assessment, conduct-of-business standards alignment, host-state ' +
        'requirements where cross-border-marketed?',
      expects:
        'All four elements (KID, suitability/appropriateness, conduct standards, host-state). ' +
        'Marked "not_applicable" is acceptable if the IFM only markets to professional / ' +
        'well-informed investors.',
    },
    {
      id: 'lu-aml-integration',
      header: 'AML integration (RC/RR + RBE)',
      regulatoryRef: 'Lux AML Law 12 Nov 2004 + CSSF Reg 12-02 + RBE Law',
      question:
        'Does the document evidence ongoing AML readiness: RC + RR roles + CSSF assessment ' +
        'status, business-wide risk assessment refreshed within 12 months, RBE register ' +
        'filings for in-scope Lux entities + UBO-data quality, investor-due-diligence ' +
        'arrangements (incl. delegation to administrator) + delegated-DD oversight?',
      expects:
        'RC/RR + BWRA refresh + RBE filings + investor-DD-delegation oversight. Missing the ' +
        'delegated-DD oversight element is "partial".',
    },
    {
      id: 'lu-board-sign-off',
      header: 'Board sign-off + change management',
      regulatoryRef: 'AIFMD II + CSSF Circular 18/698 governance',
      question:
        'Does the document evidence board / governing-body sign-off of the AIFMD II + CSSF ' +
        '25/901 implementation programme: dated board minutes, named executive sponsor, key ' +
        'milestones + status, residual risks + mitigations, change-management for any board / ' +
        'committee composition changes triggered by substance requirements?',
      expects:
        'Board sign-off + named sponsor + milestone tracking + residual risks. Silence on ' +
        'residual risks + mitigations is "partial".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 10. NYDFS Part 500 — Cybersecurity Compliance Mapping
// ───────────────────────────────────────────────────────────────────────

export const NYDFS_PART_500_COMPLIANCE: Playbook = {
  id: 'nydfs-part-500-compliance',
  name: 'NYDFS Part 500 — Cybersecurity Compliance Mapping',
  description:
    'Maps a Covered Entity\'s cybersecurity-program documentation against 23 NYCRR Part 500 ' +
    'as amended by the November 2023 Second Amendment — with the final controls phase fully ' +
    'effective 1 November 2025 (privileged access management, EDR + centralised logging for ' +
    'Class A, universal MFA, asset management). The annual certification dual sign-off ' +
    'requirement (§500.17(b), due 15 April) makes this one of the highest-anxiety US ' +
    'regulatory exams of the year.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['nydfs-part-500-2026'],
  systemPrompt:
    'You are an experienced US cybersecurity + financial-services lawyer reviewing a Covered ' +
    'Entity\'s cybersecurity program against NYDFS 23 NYCRR Part 500 (as amended by the Nov ' +
    '2023 Second Amendment; final controls fully effective 1 Nov 2025). You assess each ' +
    'control with the discipline of an NYDFS Cybersecurity Division on-site examiner: ' +
    'explicit > implicit, evidence > paraphrase, strict > lenient. You distinguish what every ' +
    'Covered Entity must do from what only Class A Companies must do (PAM solution, EDR + ' +
    'centralised logging, continuous automated vuln scans, independent cyber audit). You ' +
    'flag every CISO-approved compensating-control reference that lacks a written CISO ' +
    'approval evidenced in the document. You respond ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a Covered Entity\'s cybersecurity program / policy / annual ' +
    'certification / governance document against NYDFS 23 NYCRR Part 500 as amended.',
  columns: [
    {
      id: 'us-ny500-program',
      header: '§500.2 Cybersecurity Program',
      regulatoryRef: '23 NYCRR §500.2',
      question:
        'Does the document establish a written cybersecurity program designed to perform the ' +
        'six core functions (identify, protect, detect, respond, recover, fulfill reporting), ' +
        'based on the Risk Assessment, and (for Class A Companies) reviewed by an independent ' +
        'cybersecurity audit annually?',
      expects:
        'A written program reference + Risk Assessment linkage + the six functions. For Class A: ' +
        'evidence of independent annual audit. Missing the audit at Class A is "missing".',
    },
    {
      id: 'us-ny500-policy',
      header: '§500.3 Cybersecurity Policy approved',
      regulatoryRef: '23 NYCRR §500.3',
      question:
        'Does the document evidence a written cybersecurity policy approved by the Senior ' +
        'Governing Body (or Senior Officer where none), reviewed at least annually, addressing ' +
        'the 14 enumerated topics (information security, data governance + classification, asset ' +
        'inventory + EOL, access controls, BCDR, network security, monitoring, application ' +
        'development, physical, customer data privacy, vendor management, risk assessment, ' +
        'incident response + notification)?',
      expects:
        'Board / SO approval + dated within last 12 months + coverage of all 14 topics. Missing ' +
        'any of the 14 topics is "partial".',
    },
    {
      id: 'us-ny500-ciso',
      header: '§500.4 CISO + Senior Governing Body oversight',
      regulatoryRef: '23 NYCRR §500.4',
      question:
        'Does the document identify a named CISO with sufficient authority + resources, ' +
        'documented annual written report to the Senior Governing Body covering the program + ' +
        'material risks + key cybersecurity events + remediation, and evidence that the Senior ' +
        'Governing Body / equivalent has sufficient understanding + exercises oversight?',
      expects:
        'Named CISO + annual SGB report + SGB oversight evidence. Missing the SGB-oversight ' +
        'angle (post-Second-Amendment requirement) is "partial".',
    },
    {
      id: 'us-ny500-risk-assessment',
      header: '§500.9 Risk Assessment current',
      regulatoryRef: '23 NYCRR §500.9',
      question:
        'Does the document evidence a written Risk Assessment refreshed within the last 12 ' +
        'months (or following material business / technology change), considering threats + ' +
        'impacts + mitigations + how the cybersecurity program addresses identified risks?',
      expects:
        'Dated within 12 months + threats + impacts + mitigations + program-design linkage. ' +
        'A risk-register without a Part 500 §500.9-style assessment is "partial".',
    },
    {
      id: 'us-ny500-mfa',
      header: '§500.12 MFA — universal',
      regulatoryRef: '23 NYCRR §500.12 (in force 1 May 2025)',
      question:
        'Does the document evidence MFA universally implemented for any individual accessing ' +
        'any Information System of the Covered Entity, including remote access + privileged ' +
        'accounts + third-party / cloud applications with Nonpublic Information — with written ' +
        'CISO approval of any compensating-control exceptions, reviewed at least annually?',
      expects:
        'Universal MFA + privileged-account MFA + remote-access MFA + third-party-app MFA + ' +
        'documented CISO exception approvals where applicable. Internal-network MFA exclusion ' +
        'without CISO-approved compensating controls is "missing".',
    },
    {
      id: 'us-ny500-asset-mgmt',
      header: '§500.13 Asset Management + data retention',
      regulatoryRef: '23 NYCRR §500.13 (in force 1 May 2025)',
      question:
        'Does the document evidence written policies + procedures producing + maintaining a ' +
        'complete asset inventory of Information Systems (owner, location, classification, ' +
        'support expiration, recovery time objective) AND policies for secure disposal of ' +
        'Nonpublic Information no longer necessary for business operations?',
      expects:
        'Both elements: asset inventory with all required attributes + secure-disposal policy. ' +
        'Asset inventory without owner / classification / EOL is "partial".',
    },
    {
      id: 'us-ny500-privileged-access',
      header: '§500.7 Privileged Access + PAM',
      regulatoryRef: '23 NYCRR §500.7 (Second Amendment in force 1 Nov 2025)',
      question:
        'Does the document evidence: privileged accounts limited to what is reasonably ' +
        'necessary; MFA on privileged accounts; restrictions on remote privileged access; ' +
        'session timeout; secure-password policy; annual review of access privileges? For ' +
        'Class A Companies: a PAM solution + automated blocking of commonly-used compromised ' +
        'passwords.',
      expects:
        'All six common-CE elements + (for Class A) PAM + compromised-password blocking. ' +
        'Missing PAM at Class A is "missing".',
    },
    {
      id: 'us-ny500-training-edr',
      header: '§500.14 Training + EDR + centralised logging',
      regulatoryRef: '23 NYCRR §500.14 (Class A: in force 1 Nov 2025)',
      question:
        'Does the document evidence: risk-based monitoring + filtering of web + email; annual ' +
        'cybersecurity awareness training including social-engineering + phishing simulations ' +
        '+ secure-development training where applicable? For Class A Companies: endpoint ' +
        'detection + response (EDR) solution + centralised logging + security monitoring ' +
        'solution with alerting.',
      expects:
        'Annual training + phishing sims + secure-dev (where apt) + (for Class A) EDR + ' +
        'centralised logging. Missing EDR at Class A is "missing"; missing phishing sims is ' +
        '"partial".',
    },
    {
      id: 'us-ny500-encryption',
      header: '§500.15 Encryption',
      regulatoryRef: '23 NYCRR §500.15',
      question:
        'Does the document evidence encryption of Nonpublic Information both in transit over ' +
        'external networks AND at rest — with any CISO-approved alternative compensating ' +
        'controls specifically justified in writing + reviewed at least annually (the broad ' +
        'pre-Second-Amendment "in lieu of encryption" carve-out is removed)?',
      expects:
        'Both encryption regimes + documented CISO approval of any specific compensating ' +
        'controls. Generic "we use industry-standard encryption" without scope is "partial".',
    },
    {
      id: 'us-ny500-ir-bcdr',
      header: '§500.16 Incident Response + BCDR',
      regulatoryRef: '23 NYCRR §500.16',
      question:
        'Does the document evidence a written incident response plan addressing internal ' +
        'response + roles + decision authority + external/internal communications + ' +
        'remediation + documentation + post-event evaluation, PLUS a separate written ' +
        'BCDR plan, BOTH tested at least annually (tabletop + technical) with senior management ' +
        '+ Senior Governing Body participation / awareness?',
      expects:
        'IR plan + separate BCDR plan + annual tabletop + technical testing + senior involvement. ' +
        'Combined IR/BCDR document without separation is "partial" (post-Second Amendment).',
    },
    {
      id: 'us-ny500-tpsp',
      header: '§500.11 TPSP Security Policy',
      regulatoryRef: '23 NYCRR §500.11',
      question:
        'Does the document evidence a written third-party service provider security policy ' +
        'covering: TPSP identification + risk assessment; minimum cybersecurity practices; due ' +
        'diligence; periodic risk-based reassessment; contractual representations on access ' +
        'controls + encryption + security-event notification + cybersecurity practices?',
      expects:
        'All four elements (ID/RA + min practices + DD + periodic reassessment) + contractual ' +
        'rep coverage. Missing the periodic reassessment is "partial".',
    },
    {
      id: 'us-ny500-cert-notices',
      header: '§500.17 Notices + Annual Certification dual sign-off',
      regulatoryRef: '23 NYCRR §500.17',
      question:
        'Does the document evidence: (a) procedures to provide NYDFS Superintendent with ' +
        'cybersecurity event notice within 72 hours of determination; (b) procedures for ' +
        'ransomware payment notice within 24 hours + 30-day written description (incl. OFAC ' +
        'sanctions diligence); (c) annual certification process by 15 April with DUAL sign-off ' +
        '(Senior Officer + highest-ranking executive) OR written acknowledgement of non-' +
        'compliance with remediation timeline?',
      expects:
        'All three notification regimes + dual sign-off mechanism. Missing the dual sign-off ' +
        '(post-Second-Amendment requirement) is "missing".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 11. Sanctions Compliance Program — OFAC + OFSI Mapping
// ───────────────────────────────────────────────────────────────────────

export const SANCTIONS_OFAC_OFSI_COMPLIANCE: Playbook = {
  id: 'sanctions-ofac-ofsi-compliance',
  name: 'Sanctions Compliance — OFAC + OFSI Mapping',
  description:
    'Maps a sanctions-compliance-program document against the cross-jurisdictional ' +
    'expectations: the OFAC Framework for Compliance Commitments (5 essential elements ' +
    'with 2024 NDAA 10-year SoL exposure), the OFSI General Guidance (2024 update) + ' +
    'reporting + CMP regime (6 penalties in 2025 vs 1 in 2024 + turnover-fines ' +
    'consultation), and the EU + UN baseline framework. Anchored on the program shape that ' +
    'satisfies both OFAC + OFSI examiners simultaneously.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['sanctions-ofac-ofsi-2026'],
  systemPrompt:
    'You are an experienced US + UK financial-sanctions lawyer reviewing a sanctions ' +
    'compliance program (SCP) against OFAC (Framework for Compliance Commitments, May 2019) ' +
    'and OFSI (General Guidance 2024 + CMP framework) expectations, with secondary reference ' +
    'to EU + UN baselines. You assess each control with the discipline of a dual OFAC/OFSI ' +
    'examiner: explicit > implicit, evidence > paraphrase, strict > lenient. You distinguish ' +
    'between strict-liability obligations (OFAC blocking + many OFSI regimes) and reasonable-' +
    'cause-to-suspect triggers (OFSI reporting + some OFSI breach categories), and you flag ' +
    'every gap that would expose the institution to the 10-year OFAC SoL or the prospective ' +
    'OFSI turnover-based fines. You respond ONLY with the requested JSON object.',
  documentContext:
    'You are auditing a sanctions compliance program / policy / risk assessment / annual ' +
    'attestation document against the cross-jurisdictional OFAC + OFSI + EU + UN sanctions ' +
    'framework.',
  columns: [
    {
      id: 'sanc-mgmt-commitment',
      header: 'OFAC EE1 — Management commitment',
      regulatoryRef: 'OFAC CFCC EE1',
      question:
        'Does the document evidence: senior-management (board / equivalent) approval of the ' +
        'SCP + a named sanctions compliance officer with sufficient authority, autonomy + ' +
        'resources + access to senior management, and an explicit culture-of-compliance ' +
        'statement that sanctions are not subordinated to business objectives?',
      expects:
        'Board/SO approval + named CO + autonomy + culture statement. Missing the autonomy / ' +
        'access-to-senior-management element is "partial".',
    },
    {
      id: 'sanc-risk-assessment',
      header: 'OFAC EE2 / OFSI Risk Assessment',
      regulatoryRef: 'OFAC CFCC EE2 + OFSI General Guidance 2024',
      question:
        'Does the document evidence a documented sanctions risk assessment covering customer / ' +
        'counterparty, product / service, geographic + delivery-channel + transaction-type ' +
        'dimensions, refreshed at least annually and on material change (new regime, designations, ' +
        'incidents, business change)?',
      expects:
        'All five risk dimensions + refresh cadence + trigger events. A generic AML risk ' +
        'assessment without sanctions-specific dimensions is "partial".',
    },
    {
      id: 'sanc-screening-onboarding',
      header: 'Onboarding screening — incl. OFAC 50% + OFSI control',
      regulatoryRef: 'OFAC CFCC EE3 + OFAC 50% Rule + OFSI Ownership/Control',
      question:
        'Does the document evidence onboarding screening of customers, beneficial owners + ' +
        'related parties against ALL applicable lists (OFAC SDN + Non-SDN + UK Consolidated + ' +
        'EU + UN), applying the OFAC 50% Rule (aggregated direct + indirect ownership) AND ' +
        'the OFSI ownership-or-control test (>50% OR board-appointment OR de facto control)?',
      expects:
        'All applicable list coverage + 50% Rule + control attribution. Missing OFSI\'s broader ' +
        '"control" test (going beyond shareholding) is "partial" — frequent gap in US-rooted ' +
        'programs.',
    },
    {
      id: 'sanc-screening-ongoing',
      header: 'Ongoing + transaction screening',
      regulatoryRef: 'OFAC CFCC EE3 + OFSI General Guidance 2024',
      question:
        'Does the document evidence ongoing re-screening of existing customer base on list ' +
        'updates (frequency proportionate to risk; real-time for tier-1) AND real-time ' +
        'transaction filtering at payment / instruction execution (payer / payee / intermediary / ' +
        'goods / vessel / commodity / crypto-address)?',
      expects:
        'Both ongoing-base screening + real-time transaction filtering. Frequency stated; alert ' +
        'workflow + decision authority + audit trail. Static one-time screening alone is ' +
        '"missing".',
    },
    {
      id: 'sanc-watchlist-coverage',
      header: 'Watchlist coverage + tuning',
      regulatoryRef: 'OFAC CFCC EE3 + OFSI screening expectations',
      question:
        'Does the document specify which sanctions lists are screened against (OFAC SDN + ' +
        'Non-SDN + sectoral; OFSI Consolidated; EU; UN; national designations of major ' +
        'jurisdictions of operation), the screening-technology matching logic (fuzzy + ' +
        'transliteration + alias + script-conversion), and the false-positive + false-negative ' +
        'tuning cadence?',
      expects:
        'Full list inventory + matching-logic detail + tuning cadence. Missing UN or EU coverage ' +
        'is "partial"; missing tuning cadence is "partial".',
    },
    {
      id: 'sanc-testing-audit',
      header: 'OFAC EE4 — Testing + audit',
      regulatoryRef: 'OFAC CFCC EE4',
      question:
        'Does the document evidence periodic independent testing + auditing of the SCP — ' +
        'covering governance, risk assessment, screening-system tuning + alert-workflow ' +
        'effectiveness, sample reperformance of compliance decisions, change-management + ' +
        'remediation tracking — by qualified internal-audit or external party?',
      expects:
        'Documented audit programme + cadence + scope + tracking of findings to closure. ' +
        'Compliance-self-testing only (no independent function) is "partial".',
    },
    {
      id: 'sanc-training',
      header: 'OFAC EE5 / OFSI training',
      regulatoryRef: 'OFAC CFCC EE5 + OFSI General Guidance',
      question:
        'Does the document evidence role-specific periodic sanctions training: front-line (red ' +
        'flags + escalation); compliance staff (current regimes + screening systems); senior ' +
        'management (governance + accountability + program status); board (overview + key ' +
        'risks)? Completion tracked + content updated for regime changes?',
      expects:
        'Role-specific content + cadence + tracking + content-refresh discipline. Generic ' +
        'annual training without role differentiation is "partial".',
    },
    {
      id: 'sanc-licensing',
      header: 'OFAC + OFSI licensing process',
      regulatoryRef: 'OFAC General + Specific Licences + OFSI Licensing',
      question:
        'Does the document describe the process for: (a) checking + relying on OFAC + OFSI ' +
        'general licences (incl. condition compliance + reporting); (b) applying for OFAC / ' +
        'OFSI specific licences when general licences do not cover the activity; (c) parallel ' +
        'licensing across both regimes where activity is cross-jurisdictional?',
      expects:
        'GL reliance procedure + condition tracking + SL application path + parallel-licensing ' +
        'awareness. Missing the parallel-licensing point is a frequent gap — flag it.',
    },
    {
      id: 'sanc-ransomware-crypto',
      header: 'Ransomware + crypto sanctions',
      regulatoryRef: 'OFAC Ransomware Advisory (Sept 2021) + crypto designations',
      question:
        'Does the document describe specific procedures for sanctions analysis before any ' +
        'ransomware payment (incl. OFAC SDN + 50% Rule + designated-address screening), AND ' +
        'crypto-sanctions screening of customer wallet addresses + transaction counterparties ' +
        'where the institution has crypto exposure?',
      expects:
        'Ransomware due-diligence procedure + IC3/OFAC notification path + crypto-address ' +
        'screening where applicable. Marked "not_applicable" only for institutions with zero ' +
        'crypto exposure + zero ransomware risk (rare).',
    },
    {
      id: 'sanc-secondary-sanctions',
      header: 'Secondary sanctions risk assessment',
      regulatoryRef: 'EO 14114 + CAATSA secondary sanctions',
      question:
        'Does the document evidence specific analysis of secondary-sanctions exposure (e.g. ' +
        'foreign-bank exposure under EO 14114 for transactions touching Russia\'s military-' +
        'industrial base; CAATSA risks for significant transactions with sanctioned Russian / ' +
        'Iranian persons), with controls calibrated to non-US persons\' direct sanctions risk?',
      expects:
        'Express secondary-sanctions analysis + targeted controls (correspondent-banking ' +
        'review, customer-onboarding flags). Generic "we comply with OFAC" without the ' +
        'foreign-person secondary-sanctions dimension is "partial".',
    },
    {
      id: 'sanc-ofsi-reporting',
      header: 'OFSI mandatory reporting obligation',
      regulatoryRef: 'OFSI Reporting (Russia Regs Sched 5 + parallel)',
      question:
        'Does the document evidence (a) recognition that the institution is a "relevant firm" ' +
        'subject to the OFSI reporting obligation, (b) procedures for reporting to OFSI as soon ' +
        'as practicable on knowledge or reasonable cause to suspect a designated person OR a ' +
        'sanctions offence, AND (c) annual frozen-funds reporting in October each year?',
      expects:
        'All three elements (relevant-firm scope + reasonable-cause trigger + annual frozen-' +
        'funds report). Missing the annual frozen-funds report is "partial".',
    },
    {
      id: 'sanc-incident-disclosure',
      header: 'Incident response + voluntary disclosure',
      regulatoryRef: 'OFAC VSD + OFSI Voluntary Disclosure mitigation',
      question:
        'Does the document define the process for: detecting an apparent sanctions violation; ' +
        'root-cause analysis; remediation; and (where appropriate) voluntary self-disclosure ' +
        'to OFAC (substantial mitigation up to ~50%) + OFSI (similar mitigation regime), with ' +
        'specific cross-jurisdictional coordination where the violation touches both regimes?',
      expects:
        'Full incident-to-disclosure workflow + dual VSD/voluntary-disclosure consideration + ' +
        'coordination. Missing the dual-disclosure coordination is "partial" — VSD timing in ' +
        'one regime can affect VSD eligibility in the other.',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// 12. Singapore MAS Notice 626 + DTSP Readiness Mapping
// ───────────────────────────────────────────────────────────────────────

export const SINGAPORE_MAS_626_DTSP_READINESS: Playbook = {
  id: 'singapore-mas-626-dtsp-readiness',
  name: 'Singapore MAS Notice 626 + DTSP — Readiness Mapping',
  description:
    'Maps an MAS-regulated firm\'s AML/CFT/PF programme against MAS Notice 626 as amended ' +
    'on 30 June 2025 (mandatory proliferation-financing risk assessment + STR streamlining + ' +
    'updated PEP + BO + training expectations), and for digital-token-services firms, against ' +
    'the FSMA Part 9 DTSP framework live since 30 June 2025. Anchored on the program shape ' +
    'an MAS on-site examiner expects.',
  defaultModel: 'claude-haiku-4-5-20251001',
  knowledgePackIds: ['singapore-compliance-2026'],
  systemPrompt:
    'You are an experienced Singapore financial-services + AML lawyer reviewing an AML/CFT ' +
    '(+ PF) compliance programme against MAS Notice 626 (as revised 30 June 2025) and, for ' +
    'digital-token-services firms, FSMA Part 9 DTSP (live 30 June 2025). You assess each ' +
    'control with the discipline of an MAS on-site examiner: explicit > implicit, evidence > ' +
    'paraphrase, strict > lenient. You distinguish between MAS Notice 626 obligations that ' +
    'apply to all banks (and aligned MAS notices for CMIs / insurers / PSPs / VCCs) from the ' +
    'narrower DTSP regime that applies to Singapore-domiciled outbound-only digital-token ' +
    'service providers. You flag any 2025 PF-risk-related gap explicitly. You respond ONLY ' +
    'with the requested JSON object.',
  documentContext:
    'You are auditing a Singapore-regulated FI\'s AML/CFT/PF programme + (for DTSP-relevant ' +
    'firms) DTSP readiness document against MAS Notice 626 (revised 30 June 2025) and FSMA ' +
    'Part 9.',
  columns: [
    {
      id: 'sg-mas626-pf-risk',
      header: 'PF risk assessment (NEW 2025)',
      regulatoryRef: 'MAS Notice 626 §5 + PF (in force 30 Jun 2025)',
      question:
        'Does the document evidence integration of Proliferation-Financing risk into the ' +
        'entity-wide risk assessment + customer risk profile as a distinct dimension — with ' +
        'PF-specific indicators (DPRK + Iran nexus, dual-use goods / sensitive technology, ' +
        'complex BO masking, UN-designated entities, sanctions-evasion typologies) + controls ' +
        'calibrated to assessed PF risk?',
      expects:
        'PF as a distinct risk dimension + specific PF indicators identified + controls ' +
        'calibrated. Pre-30-June-2025 risk assessment without PF integration is "missing".',
    },
    {
      id: 'sg-mas626-rba',
      header: 'Entity-wide risk-based approach',
      regulatoryRef: 'MAS Notice 626 §5',
      question:
        'Does the document evidence a documented entity-wide ML/TF/PF risk assessment covering ' +
        'customer, geographic, product/service/transaction, delivery-channel + new-technology ' +
        'risk factors, refreshed at least annually + on material change, senior-management ' +
        'approved?',
      expects:
        'All five risk dimensions + refresh cadence + SM approval. A generic AML risk assessment ' +
        'without PF dimension (post-30-June-2025) is "partial".',
    },
    {
      id: 'sg-mas626-cdd',
      header: 'CDD chain — incl. ACRA RORC reliance',
      regulatoryRef: 'MAS Notice 626 §6',
      question:
        'Does the document evidence the full CDD chain: customer identification + verification ' +
        '(reliable independent sources); beneficial owner identification + verification (25% ' +
        'threshold + senior-managing-official fallback; ACRA RORC reliance where appropriate); ' +
        'purpose + intended nature of relationship; ongoing monitoring (transaction scrutiny + ' +
        'record refresh)?',
      expects:
        'All four CDD elements + concrete source-document lists + ACRA RORC reliance procedure ' +
        '(where applicable). Generic "we verify identity" without source-document detail is "partial".',
    },
    {
      id: 'sg-mas626-edd-peps',
      header: 'EDD + PEPs (incl. Singapore Government PEPs)',
      regulatoryRef: 'MAS Notice 626 §8 (refreshed 2025)',
      question:
        'Does the document specify EDD triggers (foreign PEPs always, high-risk jurisdictions, ' +
        'complex / unusual / large transactions, correspondent banking, new technologies) AND ' +
        'address the 2025 refresh on Singapore Government PEPs (risk-sensitive assessment of ' +
        'domestic PEPs)? Senior-management approval for entry / continue?',
      expects:
        'All EDD triggers + Singapore Government PEP treatment + senior-management approval. ' +
        'Treating all Singapore Government PEPs identically to foreign PEPs (post-2025 refresh) ' +
        'or treating them all as low-risk is "partial".',
    },
    {
      id: 'sg-mas626-sow-sof',
      header: 'Source of wealth / source of funds',
      regulatoryRef: 'MAS Notice 626 §8 — SoW/SoF',
      question:
        'For higher-risk customers, does the document evidence Source of Wealth + Source of ' +
        'Funds verification with documented procedures, corroboration against independent ' +
        'evidence, refresh cadence on material change, and clear distinction between SoW + SoF?',
      expects:
        'Both SoW + SoF + corroboration + refresh discipline. Combining SoW + SoF without ' +
        'distinction is "partial" (MAS examiners separate them in inspections).',
    },
    {
      id: 'sg-mas626-str',
      header: 'STR filing — streamlined 2025 process',
      regulatoryRef: 'MAS Notice 626 §7 (refreshed 2025) + CDSA s.39',
      question:
        'Does the document evidence: STRO filing procedure (via STRONet); 2025-aligned trigger ' +
        'thresholds + structured content requirements; explicit PF reportability; tipping-off ' +
        'prohibition (CDSA s.48 + TSOFA s.12); emphasis on quality + timeliness; internal ' +
        'escalation path?',
      expects:
        'All five elements (STRONet filing + 2025 content + PF + tipping-off + escalation + ' +
        'quality). Missing the 2025 PF reportability dimension is "partial".',
    },
    {
      id: 'sg-mas626-sanctions',
      header: 'Sanctions + targeted financial measures',
      regulatoryRef: 'MAS Notice 626 §12',
      question:
        'Does the document evidence sanctions-screening program covering UN sanctions + ' +
        'Singapore targeted financial measures + relevant designated lists, with particular ' +
        'operational focus on DPRK + Iran, asset-freeze + reporting procedures + escalation to ' +
        'MAS / AGC?',
      expects:
        'UN + national + targeted measures coverage + DPRK/Iran operational focus + freeze + ' +
        'reporting procedures. Missing DPRK/Iran-specific operational detail is "partial".',
    },
    {
      id: 'sg-mas626-governance',
      header: 'Governance + AML compliance officer',
      regulatoryRef: 'MAS Notice 626 §§10-11',
      question:
        'Does the document evidence: senior-management-approved AML/CFT/PF policies + ' +
        'procedures; named AML compliance officer at senior-management level + alternate; ' +
        'independent audit + compliance-function review; transaction-monitoring + screening-' +
        'system calibration + tuning to the risk assessment?',
      expects:
        'All four elements + named individuals + tuning cadence. "AML responsibility is shared" ' +
        'without a named senior-management-level CO is "missing".',
    },
    {
      id: 'sg-mas626-training',
      header: 'AML/CFT/PF training programme (refreshed 2025)',
      regulatoryRef: 'MAS Notice 626 §15',
      question:
        'Does the training programme address: applicable laws + MAS Notice 626 + internal ' +
        'policies; current ML/TF/PF typologies + red flags including 2025 PF-specific scenarios; ' +
        'role-targeted modules; tipping-off prohibition; refresher cadence + completion ' +
        'tracking + training-effectiveness assessment?',
      expects:
        'All five elements + 2025 PF content + assessment of effectiveness. Generic annual ' +
        'training without role differentiation + PF content is "partial".',
    },
    {
      id: 'sg-mas626-records',
      header: 'Record retention — 5 years minimum',
      regulatoryRef: 'MAS Notice 626 §15',
      question:
        'Does the document evidence retention of CDD documentation + business correspondence + ' +
        'transaction records for at least 5 years after the end of the business relationship / ' +
        'completion of the occasional transaction, with longer retention on ongoing investigation ' +
        '/ supervisory request, accessible to STRO + MAS on request?',
      expects:
        'Stated 5-year minimum + extension trigger + accessibility procedure. Missing the ' +
        'extension trigger is "partial".',
    },
    {
      id: 'sg-dtsp-scope',
      header: 'DTSP scope assessment (FSMA Part 9)',
      regulatoryRef: 'FSMA Part 9 §136 (live 30 Jun 2025)',
      question:
        'For Singapore-incorporated entities providing digital-token services: does the ' +
        'document evidence a documented scope assessment for FSMA Part 9 DTSP — covering ' +
        'whether the firm provides in-scope DT services solely to persons outside Singapore ' +
        '(triggering DTSP licensing); the firm\'s current legal position (licensed / migrated / ' +
        'exited Singapore / never in scope); the basis for that determination?',
      expects:
        'Documented scope assessment + concluded position + basis. Marked "not_applicable" only ' +
        'for entities with zero digital-token-service exposure. Silence at any entity with DT ' +
        'activity is "missing".',
    },
    {
      id: 'sg-dtsp-licensing',
      header: 'DTSP licensing readiness',
      regulatoryRef: 'FSMA Part 9 §§138-140',
      question:
        'For in-scope DTSP firms: does the document evidence licence application / migration ' +
        'readiness covering: fit-and-proper directors + key officers + substantial shareholders; ' +
        'minimum capital; AML/CFT framework (MAS Notice PSN-equivalent); TRM-aligned technology ' +
        'risk; customer-asset custody segregation + insolvency-remote arrangements; conduct + ' +
        'business obligations?',
      expects:
        'All six elements for in-scope firms. Marked "not_applicable" for non-DTSP firms. ' +
        'Partial readiness on the narrow MAS approval bar is "partial".',
    },
  ],
};

// ───────────────────────────────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────────────────────────────

export const ALL_PLAYBOOKS: Playbook[] = [
  AMLR_OBLIGATION_MAPPING,
  NDA_REVIEW,
  EMPLOYMENT_CONTRACT_REVIEW,
  GDPR_DPA_COMPLIANCE,
  DORA_ART30_REVIEW,
  UK_ECCTA_REASONABLE_PROCEDURES,
  SWISS_AMLA_LETA_READINESS,
  IRELAND_SEAR_RESPONSIBILITY_MAP,
  LUXEMBOURG_AIFMD_II_READINESS,
  NYDFS_PART_500_COMPLIANCE,
  SANCTIONS_OFAC_OFSI_COMPLIANCE,
  SINGAPORE_MAS_626_DTSP_READINESS,
];

export function getPlaybook(id: string): Playbook | undefined {
  return ALL_PLAYBOOKS.find((p) => p.id === id);
}
