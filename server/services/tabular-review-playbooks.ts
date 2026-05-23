/**
 * tabular-review-playbooks.ts — playbook definitions for Wave 1.
 *
 * A "playbook" is a column set: N questions to ask about each document
 * dropped into a run. Wave 1 ships ONE playbook (AMLR Obligation Mapping)
 * as a hardcoded constant. Wave 2 moves these to a `tabular_review_playbooks`
 * DB table so customers can build their own.
 *
 * The column-prompt strategy: each column has a `question` (rendered in the
 * grid header), a `regulatoryRef` (cited in the prompt for grounding), and
 * a `prompt` template that the executor renders with the document text +
 * the regulatory context. Default model is Haiku 4.5 — these are factual
 * "is X covered in this policy doc" calls, not deep legal reasoning, and
 * cheap+fast beats slow+expensive at 12 cols × 20 docs = 240 cells.
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
   *  arrives in Wave 2. */
  defaultModel: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-7';
  /** Knowledge pack(s) to ground every cell prompt in. */
  knowledgePackIds: string[];
  columns: PlaybookColumn[];
}

/**
 * AMLR Obligation Mapping — Wave 1 MVP playbook.
 *
 * 12 columns sampled across AMLR Chapters II–VII (Articles 9-78). Each
 * column asks the same question of every uploaded policy/procedure doc:
 * "is this obligation addressed?" with strict evidence requirements.
 *
 * Article references map straight to `data/frameworks/amlr-2024.json`.
 */
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

export const ALL_PLAYBOOKS: Playbook[] = [AMLR_OBLIGATION_MAPPING];

export function getPlaybook(id: string): Playbook | undefined {
  return ALL_PLAYBOOKS.find((p) => p.id === id);
}
