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
// Registry
// ───────────────────────────────────────────────────────────────────────

export const ALL_PLAYBOOKS: Playbook[] = [
  AMLR_OBLIGATION_MAPPING,
  NDA_REVIEW,
  EMPLOYMENT_CONTRACT_REVIEW,
  GDPR_DPA_COMPLIANCE,
  DORA_ART30_REVIEW,
  UK_ECCTA_REASONABLE_PROCEDURES,
];

export function getPlaybook(id: string): Playbook | undefined {
  return ALL_PLAYBOOKS.find((p) => p.id === id);
}
