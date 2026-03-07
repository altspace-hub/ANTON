// ═══════════════════════════════════════════════════════════
// Anton FCP Workflow System
// Pre-built multi-step automated workflows for compliance consultants
// ═══════════════════════════════════════════════════════════

export type WorkflowStepType =
  | 'claude'
  | 'input'
  | 'conditional'
  | 'export'
  | 'api_call'
  | 'database_query'
  | 'file_read'
  | 'file_write'
  | 'script'
  | 'email_send'
  | 'decision_gate'
  | 'transform'
  | 'loop'
  | 'parallel'
  | 'wait'
  | 'sub_workflow'
  | 'notification'
  | 'checkpoint'
  | 'data_import'
  | 'data_transform'
  | 'data_merge'
  | 'data_export'
  | 'messaging_notification';

export interface DecisionCondition {
  leftOperand: string;   // e.g. "{{step_3.risk_score}}"
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'exists';
  rightOperand: string;  // literal or "{{step_2.field}}"
}

export interface FieldMapping {
  sourcePath: string;       // e.g. "{{step_1.customer_id}}"
  destinationField: string; // e.g. "customerId"
  expression?: string;      // optional JS-like transform expression
}

export interface LoopChildStep {
  id: string;
  label: string;
  type: WorkflowStepType;
  config: Partial<WorkflowStep['config']>;
}

export interface ParallelGroup {
  id: string;
  label: string;
  steps: Array<{ id: string; label: string; type: WorkflowStepType; config: Partial<WorkflowStep['config']> }>;
}

export interface WorkflowStep {
  id: string;
  label: string;
  description: string;
  type: WorkflowStepType;
  config: {
    // ── Original fields ──────────────────────────────────────
    promptTemplate?: string;
    thinking?: string;
    creativity?: string;
    outputFormat?: string;
    moduleId?: string;
    areaId?: string;
    inputFields?: Array<{ id: string; label: string; type: 'text' | 'textarea' | 'select' | 'file' | 'url'; options?: string[]; required?: boolean; placeholder?: string }>;
    condition?: string;
    exportFormat?: string;
    dependsOn?: string[];

    // ── api_call ──────────────────────────────────────────────
    connectionId?: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    endpointPath?: string;
    requestBodyTemplate?: string;
    headers?: Record<string, string>;
    body?: string | Record<string, unknown>;
    async?: boolean; // Fire-and-forget mode
    timeout_ms?: number;
    outputVariable?: string;

    // ── database_query ────────────────────────────────────────
    queryTemplate?: string;
    parameters?: unknown[];
    maxRows?: number;

    // ── file_read ────────────────────────────────────────────
    pathPattern?: string;
    fileFilter?: string;

    // ── file_write ───────────────────────────────────────────
    outputPath?: string;
    contentSource?: string;

    // ── script ───────────────────────────────────────────────
    scriptId?: string;
    parameterMapping?: Record<string, string>;

    // ── email_send ────────────────────────────────────────────
    toTemplate?: string;
    subjectTemplate?: string;
    bodyTemplate?: string;

    // ── decision_gate ─────────────────────────────────────────
    decisionCondition?: DecisionCondition;
    onFalseSkipToStepId?: string;   // step ID to jump to when condition is false

    // ── transform ────────────────────────────────────────────
    fieldMappings?: FieldMapping[];

    // ── loop ─────────────────────────────────────────────────
    inputListPath?: string;          // e.g. "{{step_2.transactions}}"
    loopSteps?: LoopChildStep[];
    maxIterations?: number;

    // ── parallel ─────────────────────────────────────────────
    parallelGroups?: ParallelGroup[];

    // ── wait ─────────────────────────────────────────────────
    waitSeconds?: number;
    waitCondition?: string;
    maxWaitSeconds?: number;

    // ── sub_workflow ──────────────────────────────────────────
    subWorkflowId?: string;
    subWorkflowInputMapping?: Record<string, string>;

    // ── notification ──────────────────────────────────────────
    webhookUrl?: string;
    messageTemplate?: string;

    // ── messaging_notification ────────────────────────────────
    // connectionId reused from api_call; plus:
    titleTemplate?: string;   // message title with {{variable}} substitution
    linkUrl?: string;          // link back to session/workflow (supports {{variables}})
    level?: 'info' | 'success' | 'warning' | 'error';

    // ── checkpoint ───────────────────────────────────────────
    checkpointMessage?: string;
    checkpointContext?: string;   // which context fields to show in review panel

    // ── data_import ───────────────────────────────────────────
    importSource?: 'file' | 'database' | 'api' | 'saved_dataset';
    savedDatasetId?: string;
    saveDataset?: boolean;
    datasetName?: string;
    datasetScope?: string;
    filePath?: string;
    fileType?: 'csv' | 'excel' | 'json';
    sheetName?: string;
    delimiter?: string;
    hasHeader?: boolean;
    dataConnectionId?: string;
    importQuery?: string;
    preview?: boolean;

    // ── data_transform ────────────────────────────────────────
    inputDatasetId?: string;
    transformOperations?: Array<{
      type: string;
      [key: string]: any;
    }>;

    // ── data_merge ────────────────────────────────────────────
    leftDatasetId?: string;
    rightDatasetId?: string;
    mergeType?: 'join' | 'union' | 'concat';
    joinType?: 'inner' | 'left' | 'right' | 'full';
    leftKey?: string;
    rightKey?: string;
    columnMapping?: Record<string, string>;
    deduplicateBy?: string[];
    deduplicateStrategy?: 'keep_first' | 'keep_last' | 'merge_values';

    // ── on_complete_trigger — fire when this step finishes ────
    // Triggers another workflow run when this step completes successfully.
    onCompleteTrigger?: {
      type: 'start_workflow';
      workflowId: string;      // target workflow to start
      label?: string;          // human-readable label for the trigger
      // Map context variables from this run to the new run's trigger variables
      // e.g. { "targetWorkflowInput": "{{step_2.output}}" }
      variables?: Record<string, string>;
    };

    // ── data_export ───────────────────────────────────────────
    exportDatasetId?: string;
    exportDestination?: 'file' | 'database' | 'api';
    exportFilePath?: string;
    exportFileType?: 'csv' | 'excel' | 'json';
    exportTableName?: string;
    exportInsertMode?: 'insert' | 'upsert' | 'replace';
    overwrite?: boolean;
  };
}

export interface WorkflowDefinition {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  category: 'monitoring' | 'assessment' | 'advisory' | 'reporting' | 'comparison' | 'custom';
  estimatedTime: string;
  steps: WorkflowStep[];
  defaultSchedule?: string;
  tags: string[];
  isCustom?: boolean;
}

// ── WORKFLOW DEFINITIONS ───────────────────────────────────

export const WORKFLOWS: WorkflowDefinition[] = [
  // ── 1. Regulatory Change Impact Tracker ──────────────────
  {
    id: 'regulatory-change-tracker',
    label: 'Regulatory Change Impact Tracker',
    shortLabel: 'Reg Change Tracker',
    icon: 'Bell',
    description: 'Monitor new regulations (AMLR, AMLD6, EBA Guidelines, FATF standards) and automatically assess their impact on your clients. Produces a structured impact memo with action items.',
    category: 'monitoring',
    estimatedTime: '3-5 min per regulation',
    tags: ['regulatory', 'monitoring', 'impact', 'continuous'],
    steps: [
      {
        id: 'input-regulation',
        label: 'Provide Regulatory Development',
        description: 'Paste the regulation text, URL, or describe the development',
        type: 'input',
        config: {
          inputFields: [
            { id: 'source', label: 'Source', type: 'select', options: ['EBA', 'ESMA', 'ECB', 'FATF', 'European Commission', 'FI (Sweden)', 'Finanstilsynet (Norway)', 'Finanssivalvonta (Finland)', 'Finanstilsynet (Denmark)', 'FCA (UK)', 'Other'], required: true },
            { id: 'regulationText', label: 'Regulation text or description', type: 'textarea', required: true, placeholder: 'Paste the regulation text, a URL, or describe the regulatory development...' },
            { id: 'clientContext', label: 'Client context', type: 'textarea', placeholder: 'Entity type, jurisdiction, business lines affected...' },
          ],
        },
      },
      {
        id: 'analyze-regulation',
        label: 'Analyze Regulatory Change',
        description: 'Claude analyzes the regulation and identifies key requirements, deadlines, and scope',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'strict',
          promptTemplate: `Analyze this regulatory development from {{source}}:

{{regulationText}}

Produce a structured analysis:
1. **Summary** — What is this regulation about? (3-5 sentences)
2. **Key Requirements** — Numbered list of specific obligations
3. **Who is affected** — Entity types, jurisdictions, business lines
4. **Timeline** — Effective dates, transition periods, key milestones
5. **Penalties / Enforcement** — Consequences of non-compliance
6. **Cross-references** — Links to related regulations or guidelines`,
          dependsOn: ['input-regulation'],
        },
      },
      {
        id: 'assess-impact',
        label: 'Assess Client Impact',
        description: 'Map requirements against client context to identify specific impacts',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'balanced',
          outputFormat: 'impact-assessment',
          promptTemplate: `Based on the regulatory analysis above, and considering this client context:

{{clientContext}}

Produce a client-specific impact assessment:
1. **Operational Impact** — What processes need to change?
2. **Policy Impact** — Which policies/procedures need updating?
3. **Technology Impact** — System changes, data requirements
4. **People Impact** — Training, roles, hiring
5. **Financial Impact** — Implementation costs, ongoing costs
6. **Priority Actions** — Top 5 things to do first, with timeline

Rate each area: 🔴 Major change needed / 🟡 Moderate changes / 🟢 Minor or no change`,
          dependsOn: ['analyze-regulation'],
        },
      },
      {
        id: 'generate-memo',
        label: 'Generate Client Memo',
        description: 'Produce a ready-to-send thought memo for the client',
        type: 'claude',
        config: {
          thinking: 'think',
          creativity: 'balanced',
          outputFormat: 'quick-briefing',
          promptTemplate: `Based on the full analysis above, produce a 1-page client advisory memo using this structure:

**REGULATORY ADVISORY — {{source}}**
Date: [today]

**What happened:** [1 paragraph summary]

**What it means for you:** [specific impacts for this client type]

**What you should do:** [3-5 prioritized action items with timeline]

**How we can help:** [brief description of how Anton's team can support]

**Deadline awareness:** [key dates to track]

Keep it professional, concise, and actionable. This goes directly to the client's compliance team.`,
          dependsOn: ['assess-impact'],
        },
      },
      {
        id: 'export-memo',
        label: 'Export Memo',
        description: 'Export the advisory memo as a document',
        type: 'export',
        config: { exportFormat: 'docx', dependsOn: ['generate-memo'] },
      },
    ],
  },

  // ── 2. Client Risk Re-assessment ─────────────────────────
  {
    id: 'client-risk-reassessment',
    label: 'Client Risk Re-assessment Against New Regulation',
    shortLabel: 'Risk Re-assessment',
    icon: 'RefreshCcw',
    description: 'When regulation changes, automatically re-assess a client\'s ML/TF risk profile. Compares current risk assessment against new requirements and flags areas needing attention.',
    category: 'assessment',
    estimatedTime: '5-8 min',
    tags: ['risk', 'continuous', 'client', 'regulation'],
    steps: [
      {
        id: 'input-context',
        label: 'Provide Context',
        description: 'Client info and the regulatory change driving the re-assessment',
        type: 'input',
        config: {
          inputFields: [
            { id: 'clientName', label: 'Client / Entity name', type: 'text', required: true, placeholder: 'e.g., Nordic Savings Bank' },
            { id: 'entityType', label: 'Entity type', type: 'select', options: ['Credit Institution', 'Payment Institution', 'E-Money Institution', 'Investment Firm', 'Insurance Company', 'Crypto-Asset Service Provider', 'Other'], required: true },
            { id: 'jurisdiction', label: 'Jurisdiction', type: 'select', options: ['Sweden', 'Finland', 'Norway', 'Denmark', 'Iceland', 'EU-wide', 'Multi-jurisdiction'], required: true },
            { id: 'currentRiskProfile', label: 'Current risk profile summary', type: 'textarea', required: true, placeholder: 'Describe current risk assessment: customer segments, high-risk areas, existing controls...' },
            { id: 'regulatoryChange', label: 'Regulatory change triggering re-assessment', type: 'textarea', required: true, placeholder: 'What new regulation or guidance is driving this re-assessment?' },
            { id: 'existingDocs', label: 'Existing risk assessment document', type: 'file' },
          ],
        },
      },
      {
        id: 'map-changes',
        label: 'Map Regulatory Changes to Risk Factors',
        description: 'Identify which risk factors and controls are affected by the new regulation',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'strict',
          promptTemplate: `For {{clientName}} ({{entityType}}, {{jurisdiction}}):

Current risk profile:
{{currentRiskProfile}}

New regulatory development:
{{regulatoryChange}}

Map the regulatory changes to specific risk factors:
1. **New Risk Factors** — Risk factors introduced by the new regulation that aren't in the current assessment
2. **Changed Risk Factors** — Existing risk factors where the assessment methodology or thresholds change
3. **New Control Requirements** — Controls that are now required but may not exist
4. **Changed Control Requirements** — Existing controls that need enhancement
5. **Unchanged Areas** — Confirm areas that are NOT affected (for completeness)

For each item, cite the specific regulatory article/requirement.`,
          dependsOn: ['input-context'],
        },
      },
      {
        id: 'score-gaps',
        label: 'Score Gaps & Produce Updated Risk Matrix',
        description: 'RAG-score each area and produce an updated risk assessment matrix',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'strict',
          outputFormat: 'gap-scoring-matrix',
          promptTemplate: `Based on the mapping above, produce an updated risk assessment matrix for {{clientName}}.

For each risk factor/control area:
| Area | Current State | New Requirement | Gap | Severity | Priority | Remediation Effort |

Severity: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
Priority: P1-P4

Also produce:
- Overall risk rating change (Before → After)
- Summary of critical gaps requiring immediate attention
- Timeline for bringing all areas into compliance`,
          dependsOn: ['map-changes'],
        },
      },
      {
        id: 'action-plan',
        label: 'Generate Remediation Action Plan',
        description: 'Produce a prioritized action plan with owners and timelines',
        type: 'claude',
        config: {
          thinking: 'think',
          creativity: 'balanced',
          outputFormat: 'action-plan',
          promptTemplate: `Based on the gap analysis above, produce a remediation action plan for {{clientName}}.

| # | Action | Priority | Owner (Role) | Timeline | Effort | Dependencies |

Group by:
1. **Immediate** (< 1 month) — Critical gaps, quick wins
2. **Short-term** (1-3 months) — High priority changes
3. **Medium-term** (3-6 months) — Moderate changes
4. **Long-term** (6-12 months) — Strategic improvements

Include resource estimates (FTE days) per action.`,
          dependsOn: ['score-gaps'],
        },
      },
      {
        id: 'export',
        label: 'Export Results',
        description: 'Export the full re-assessment package',
        type: 'export',
        config: { exportFormat: 'xlsx', dependsOn: ['action-plan'] },
      },
    ],
  },

  // ── 3. Policy & Procedure Update Scanner ─────────────────
  {
    id: 'policy-update-scanner',
    label: 'Policy & Procedure Update Scanner',
    shortLabel: 'Policy Scanner',
    icon: 'FileScan',
    description: 'Upload a client\'s existing policies and procedures, point to a new regulation, and automatically identify every section that needs updating. Get specific redline suggestions.',
    category: 'assessment',
    estimatedTime: '5-10 min per policy',
    tags: ['policy', 'update', 'regulation', 'gap'],
    steps: [
      {
        id: 'input-docs',
        label: 'Provide Documents & Regulation',
        description: 'Upload the existing policy and specify the new regulation',
        type: 'input',
        config: {
          inputFields: [
            { id: 'policyDoc', label: 'Existing policy/procedure document', type: 'file', required: true },
            { id: 'policyName', label: 'Policy name', type: 'text', required: true, placeholder: 'e.g., AML/CFT Policy v3.2' },
            { id: 'regulation', label: 'New regulation requiring changes', type: 'textarea', required: true, placeholder: 'Describe the new regulation or paste its text...' },
            { id: 'regulationUrl', label: 'Regulation URL (optional)', type: 'url', placeholder: 'https://...' },
          ],
        },
      },
      {
        id: 'scan-policy',
        label: 'Scan Policy Against New Requirements',
        description: 'Analyze every section of the policy against the new regulation',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'strict',
          promptTemplate: `Analyze the policy document "{{policyName}}" against this new regulation:

{{regulation}}

For EVERY section of the policy, assess:
1. Does this section need updating? (Yes/No/Partially)
2. If yes: What specific changes are needed?
3. What new regulation article drives this change?
4. Severity of the gap (🔴 Non-compliant / 🟡 Partially compliant / 🟢 Compliant)

Produce a section-by-section analysis table:
| Policy Section | Current Content Summary | Regulation Ref | Status | Changes Needed |

Be exhaustive — check every section.`,
          dependsOn: ['input-docs'],
        },
      },
      {
        id: 'draft-updates',
        label: 'Draft Specific Updates',
        description: 'For each section needing changes, draft the specific updated text',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'balanced',
          promptTemplate: `Based on the gap analysis above, for each section that needs updating, provide:

### Section [X]: [Section Title]

**Current text:** [summarize what's there now]

**Issue:** [what's missing or non-compliant]

**Suggested update:** [draft the specific new/revised text that should replace or supplement the current content]

**Regulatory basis:** [cite the specific article]

Also identify any entirely new sections that need to be added to the policy.`,
          dependsOn: ['scan-policy'],
        },
      },
      {
        id: 'export',
        label: 'Export Update Report',
        description: 'Export the full policy update report',
        type: 'export',
        config: { exportFormat: 'docx', dependsOn: ['draft-updates'] },
      },
    ],
  },

  // ── 4. Supervisory Decision / Ruling Analyzer ────────────
  {
    id: 'ruling-analyzer',
    label: 'Supervisory Ruling Analyzer & Client Alert',
    shortLabel: 'Ruling Analyzer',
    icon: 'Gavel',
    description: 'When FI, EBA, or other supervisors publish new rulings, decisions, or sanctions, quickly analyze the ruling and generate a client-ready advisory alert with lessons learned.',
    category: 'advisory',
    estimatedTime: '3-5 min per ruling',
    tags: ['ruling', 'FI', 'EBA', 'advisory', 'client alert'],
    steps: [
      {
        id: 'input-ruling',
        label: 'Provide the Ruling',
        description: 'Paste the ruling text or provide a URL',
        type: 'input',
        config: {
          inputFields: [
            { id: 'authority', label: 'Supervisory authority', type: 'select', options: ['FI (Finansinspektionen)', 'EBA', 'ESMA', 'ECB/SSM', 'Finanstilsynet (NO)', 'Finanssivalvonta (FI)', 'Finanstilsynet (DK)', 'FCA', 'BaFin', 'Other'], required: true },
            { id: 'rulingText', label: 'Ruling text or summary', type: 'textarea', required: true, placeholder: 'Paste the ruling/decision text, press release, or describe the supervisory action...' },
            { id: 'rulingUrl', label: 'URL to ruling (optional)', type: 'url' },
            { id: 'targetAudience', label: 'Target audience for the alert', type: 'select', options: ['All clients', 'Banking clients', 'Payment institutions', 'Investment firms', 'Crypto/fintech clients', 'Specific client'] },
          ],
        },
      },
      {
        id: 'analyze-ruling',
        label: 'Analyze the Ruling',
        description: 'Deep analysis of the ruling: facts, findings, regulatory basis, significance',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'strict',
          promptTemplate: `Analyze this supervisory ruling/decision from {{authority}}:

{{rulingText}}

Produce a structured analysis:
1. **The Case** — What happened? Who was involved? What were the facts?
2. **Regulatory Findings** — What violations were identified? Under which articles?
3. **Sanction/Outcome** — What was the penalty, remediation order, or other consequence?
4. **Key Takeaways** — What should obliged entities learn from this?
5. **Precedent Value** — Is this a new interpretation? Does it set expectations?
6. **Industry Impact** — Who should pay attention to this? Why?`,
          dependsOn: ['input-ruling'],
        },
      },
      {
        id: 'generate-alert',
        label: 'Generate Client Alert',
        description: 'Create a professional client advisory alert',
        type: 'claude',
        config: {
          thinking: 'think',
          creativity: 'balanced',
          promptTemplate: `Based on the analysis above, generate a client advisory alert for {{targetAudience}}.

Format:
**SUPERVISORY ALERT — {{authority}}**
Date: [today]

**In brief:** [2-3 sentence summary]

**What happened:** [factual summary — 1 paragraph]

**Why it matters:** [implications for clients — 2-3 key points]

**Self-assessment questions:**
Ask 5 specific questions clients should ask themselves:
1. Do we have [specific control/process]?
2. Is our [specific area] compliant with [specific requirement]?
...

**Recommended actions:**
Prioritized list of what clients should do in response.

**Further reading:** [references]

Keep it concise, actionable, and professional. Ready to send.`,
          dependsOn: ['analyze-ruling'],
        },
      },
      {
        id: 'export',
        label: 'Export Alert',
        description: 'Export the client alert',
        type: 'export',
        config: { exportFormat: 'pdf', dependsOn: ['generate-alert'] },
      },
    ],
  },

  // ── 5. Peer Comparison Engine ────────────────────────────
  {
    id: 'peer-comparison',
    label: 'Peer Comparison — Policy & Practice Benchmarking',
    shortLabel: 'Peer Comparison',
    icon: 'GitCompareArrows',
    description: 'Compare a client\'s policies, procedures, or practices against peers in the same sector and business line. Identify where they lead, lag, or align with industry standards.',
    category: 'comparison',
    estimatedTime: '5-8 min',
    tags: ['peer', 'comparison', 'benchmarking', 'sector'],
    steps: [
      {
        id: 'input-comparison',
        label: 'Define Comparison Scope',
        description: 'Provide client docs and comparison criteria',
        type: 'input',
        config: {
          inputFields: [
            { id: 'clientDoc', label: 'Client document to benchmark', type: 'file', required: true },
            { id: 'sector', label: 'Sector / business line', type: 'select', options: ['Retail Banking', 'Corporate Banking', 'Private Banking', 'Payment Services', 'E-Money', 'Investment Services', 'Insurance', 'Crypto/Digital Assets', 'FinTech'], required: true },
            { id: 'jurisdiction', label: 'Jurisdiction', type: 'select', options: ['Sweden', 'Finland', 'Norway', 'Denmark', 'Nordics', 'EU', 'UK', 'Global'], required: true },
            { id: 'comparisonAreas', label: 'Focus areas for comparison', type: 'textarea', placeholder: 'e.g., CDD depth, TM thresholds, PEP handling, sanctions screening, governance structure...' },
            { id: 'peerDocs', label: 'Peer documents (optional)', type: 'file' },
          ],
        },
      },
      {
        id: 'benchmark-analysis',
        label: 'Benchmark Against Industry Practice',
        description: 'Compare client practices against known industry standards and best practices',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'balanced',
          promptTemplate: `Benchmark this client document against industry best practice for {{sector}} in {{jurisdiction}}.

Focus areas: {{comparisonAreas}}

For each compliance area, assess:
| Area | Client Approach | Industry Best Practice | Rating | Gap/Lead |

Rating: ⭐⭐⭐ Leading / ⭐⭐ Aligned / ⭐ Lagging / ⚠️ Below minimum

Draw on your knowledge of:
- Regulatory expectations for this sector
- EBA guidelines and supervisory expectations
- Industry standards and FATF recommendations
- Common practices at comparable institutions

Be specific about what "best practice" means — don't just say "should improve."`,
          dependsOn: ['input-comparison'],
        },
      },
      {
        id: 'recommendations',
        label: 'Generate Improvement Recommendations',
        description: 'Specific, prioritized recommendations to close gaps and match peers',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'balanced',
          outputFormat: 'action-plan',
          promptTemplate: `Based on the benchmarking analysis above, produce prioritized improvement recommendations:

For each area where the client is "Lagging" or "Below minimum":
1. **What to change** — Specific actions
2. **Target state** — What "good" looks like
3. **Priority** — P1 (regulatory minimum) / P2 (industry standard) / P3 (best practice)
4. **Quick wins** — Changes that can be made immediately
5. **Effort** — Low / Medium / High

Also highlight areas where the client is leading — these are strengths to preserve and communicate.`,
          dependsOn: ['benchmark-analysis'],
        },
      },
      {
        id: 'export',
        label: 'Export Benchmark Report',
        description: 'Export the full benchmarking report',
        type: 'export',
        config: { exportFormat: 'docx', dependsOn: ['recommendations'] },
      },
    ],
  },

  // ── 6. Continuous Monitoring Dashboard Feed ──────────────
  {
    id: 'monitoring-feed',
    label: 'Regulatory Monitoring Feed',
    shortLabel: 'Monitoring Feed',
    icon: 'Rss',
    description: 'Generate a weekly/monthly regulatory monitoring digest. Scans for new developments across AML/CFT, sanctions, and related areas using web search, then produces a structured summary.',
    category: 'monitoring',
    estimatedTime: '3-5 min',
    tags: ['monitoring', 'weekly', 'digest', 'web search'],
    steps: [
      {
        id: 'input-scope',
        label: 'Define Monitoring Scope',
        description: 'What regulatory areas and jurisdictions to monitor',
        type: 'input',
        config: {
          inputFields: [
            { id: 'jurisdictions', label: 'Jurisdictions', type: 'textarea', required: true, placeholder: 'e.g., EU, Sweden, Finland, Norway, Denmark' },
            { id: 'topics', label: 'Topics to monitor', type: 'textarea', required: true, placeholder: 'e.g., AML/CFT regulation, sanctions, crypto regulation, EBA guidelines, FATF...' },
            { id: 'period', label: 'Monitoring period', type: 'select', options: ['Last week', 'Last 2 weeks', 'Last month', 'Last quarter'], required: true },
            { id: 'audience', label: 'Audience for the digest', type: 'select', options: ['Internal team', 'Senior management', 'All clients', 'Specific client group'] },
          ],
        },
      },
      {
        id: 'scan-developments',
        label: 'Scan for Developments',
        description: 'Use web search to find recent regulatory developments',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'balanced',
          promptTemplate: `Search for and compile recent regulatory developments in the {{period}} for:
Jurisdictions: {{jurisdictions}}
Topics: {{topics}}

For each development found, provide:
1. **Title** — Clear headline
2. **Source** — Authority/institution
3. **Date** — Publication date
4. **Summary** — 2-3 sentence summary
5. **Relevance** — Who should care? (🔴 All / 🟡 Sector-specific / 🟢 For awareness)
6. **Action needed** — Yes (with deadline) / Monitoring only
7. **Source URL** — If available

Organize chronologically. Flag anything with upcoming deadlines.`,
          dependsOn: ['input-scope'],
        },
      },
      {
        id: 'produce-digest',
        label: 'Produce Monitoring Digest',
        description: 'Format findings into a professional digest document',
        type: 'claude',
        config: {
          thinking: 'think',
          creativity: 'balanced',
          promptTemplate: `Based on the developments scanned above, produce a professional regulatory monitoring digest for {{audience}}.

**REGULATORY MONITORING DIGEST**
Period: {{period}}
Scope: {{jurisdictions}} — {{topics}}

Structure:
1. **Executive Summary** — Top 3-5 developments to watch
2. **Developments Requiring Action** — Items with deadlines or compliance requirements
3. **Developments for Awareness** — Important but no immediate action needed
4. **Upcoming Consultations & Deadlines** — Calendar of upcoming dates
5. **Sector-Specific Highlights** — Grouped by banking, payments, investment, etc.

End with: "Next monitoring cycle: [date]"`,
          dependsOn: ['scan-developments'],
        },
      },
      {
        id: 'export',
        label: 'Export Digest',
        description: 'Export the monitoring digest',
        type: 'export',
        config: { exportFormat: 'pdf', dependsOn: ['produce-digest'] },
      },
    ],
  },

  // ── 7. Sanctions Regime Change Alerter ───────────────────
  {
    id: 'sanctions-change-alert',
    label: 'Sanctions Regime Change Alerter',
    shortLabel: 'Sanctions Alert',
    icon: 'ShieldAlert',
    description: 'When a sanctions regime changes (new designations, de-listings, sectoral measures), analyze the change and produce an operational alert for screening teams and compliance officers.',
    category: 'advisory',
    estimatedTime: '3-5 min',
    tags: ['sanctions', 'screening', 'alert', 'operational'],
    steps: [
      {
        id: 'input-change',
        label: 'Describe Sanctions Change',
        description: 'What changed in which sanctions regime',
        type: 'input',
        config: {
          inputFields: [
            { id: 'regime', label: 'Sanctions regime', type: 'select', options: ['EU Restrictive Measures', 'US/OFAC', 'UN Security Council', 'UK (OFSI)', 'Multiple regimes', 'Other'], required: true },
            { id: 'changeType', label: 'Type of change', type: 'select', options: ['New designations', 'De-listings', 'Sectoral measures', 'Country-wide measures', 'Licensing changes', 'Wind-down period', 'Regime expansion'], required: true },
            { id: 'changeDetails', label: 'Details of the change', type: 'textarea', required: true, placeholder: 'Describe the specific sanctions change, affected parties, and effective date...' },
            { id: 'clientExposure', label: 'Potential client exposure', type: 'textarea', placeholder: 'Any known exposure: customer relationships, correspondent banking, geographic risk...' },
          ],
        },
      },
      {
        id: 'analyze-change',
        label: 'Analyze Sanctions Change',
        description: 'Determine scope, implications, and operational impact',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'strict',
          promptTemplate: `Analyze this sanctions change in the {{regime}} regime:
Type: {{changeType}}
Details: {{changeDetails}}
Client exposure: {{clientExposure}}

Produce:
1. **Change Summary** — What specifically changed, effective date
2. **Legal Basis** — Regulation/executive order/resolution number
3. **Screening Impact** — What needs to be added/removed from screening lists
4. **Transaction Monitoring Impact** — Any new patterns to monitor
5. **Customer Impact** — Affected customer segments, geographic exposure
6. **Correspondent Banking Impact** — Any implications for respondent banks
7. **Reporting Obligations** — New reporting requirements
8. **Timeline** — Implementation urgency, wind-down periods`,
          dependsOn: ['input-change'],
        },
      },
      {
        id: 'operational-alert',
        label: 'Generate Operational Alert',
        description: 'Create an actionable alert for screening and compliance teams',
        type: 'claude',
        config: {
          thinking: 'think',
          creativity: 'strict',
          promptTemplate: `Generate an operational sanctions alert:

**SANCTIONS ALERT — IMMEDIATE ACTION REQUIRED**
Regime: {{regime}}
Change Type: {{changeType}}
Effective: [date from analysis]

**Action Items for Screening Team:**
☐ [Specific screening actions needed]

**Action Items for Compliance:**
☐ [Specific compliance actions needed]

**Action Items for Business Lines:**
☐ [Business-facing actions]

**Customer Communications Required:**
☐ [If any customers need to be notified]

**Escalation:** Report to [specific role] within [timeframe]

Keep it operationally focused — this goes to people who need to act NOW.`,
          dependsOn: ['analyze-change'],
        },
      },
      {
        id: 'export',
        label: 'Export Alert',
        description: 'Export the sanctions alert',
        type: 'export',
        config: { exportFormat: 'pdf', dependsOn: ['operational-alert'] },
      },
    ],
  },

  // ── 8. BWRA Annual Refresh ───────────────────────────────
  {
    id: 'bwra-refresh',
    label: 'Business-Wide Risk Assessment Refresh',
    shortLabel: 'BWRA Refresh',
    icon: 'BarChart3',
    description: 'Support the annual BWRA update. Compare last year\'s assessment against current risk landscape, new regulations, and changed business profile to identify what needs updating.',
    category: 'assessment',
    estimatedTime: '8-15 min',
    tags: ['BWRA', 'risk assessment', 'annual', 'refresh'],
    steps: [
      {
        id: 'input-bwra',
        label: 'Provide Current BWRA & Context',
        description: 'Upload current BWRA and describe changes since last assessment',
        type: 'input',
        config: {
          inputFields: [
            { id: 'currentBwra', label: 'Current BWRA document', type: 'file', required: true },
            { id: 'entityName', label: 'Entity name', type: 'text', required: true },
            { id: 'assessmentDate', label: 'Date of current BWRA', type: 'text', placeholder: 'e.g., March 2025' },
            { id: 'businessChanges', label: 'Business changes since last BWRA', type: 'textarea', placeholder: 'New products, markets, customer segments, structural changes, M&A...' },
            { id: 'incidentHistory', label: 'Incidents/findings since last BWRA', type: 'textarea', placeholder: 'SAR volumes, audit findings, regulatory feedback, sanctions hits...' },
            { id: 'regulatoryChanges', label: 'Key regulatory changes since last BWRA', type: 'textarea', placeholder: 'New regulations, guidelines, supervisory expectations...' },
          ],
        },
      },
      {
        id: 'gap-analysis',
        label: 'Identify BWRA Gaps',
        description: 'Analyze what has changed and what sections need updating',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'strict',
          promptTemplate: `Review the current BWRA for {{entityName}} (dated {{assessmentDate}}) and identify all areas that need updating based on:

Business changes: {{businessChanges}}
Incidents/findings: {{incidentHistory}}
Regulatory changes: {{regulatoryChanges}}

For each BWRA section, assess:
| Section | Current Assessment | Changes Since | Update Needed | Priority |

Categories of change:
- **Risk factors** — New or changed inherent risk factors
- **Controls** — New, changed, or removed controls
- **Risk ratings** — Ratings that may need adjustment
- **Methodology** — Assessment methodology updates required by new regulation
- **Scope** — New products/services/customers to add
- **Data** — Updated data/statistics needed`,
          dependsOn: ['input-bwra'],
        },
      },
      {
        id: 'draft-updates',
        label: 'Draft Updated Risk Assessments',
        description: 'For each area needing change, draft updated risk assessment text',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'balanced',
          outputFormat: 'maturity-assessment',
          promptTemplate: `For each BWRA section identified as needing updates, draft the revised assessment.

For each updated section:
### [Section Title]
**Previous inherent risk:** [Low/Medium/High]
**Updated inherent risk:** [Low/Medium/High] — [rationale]
**Previous control effectiveness:** [1-5]
**Updated control effectiveness:** [1-5] — [rationale]
**Previous residual risk:** [Low/Medium/High]
**Updated residual risk:** [Low/Medium/High]
**Key changes:** [what drove the change]
**Evidence:** [data points, incidents, regulatory references]

Produce an overall risk summary comparing previous vs. updated profile.`,
          dependsOn: ['gap-analysis'],
        },
      },
      {
        id: 'export',
        label: 'Export BWRA Update Package',
        description: 'Export the full BWRA refresh analysis',
        type: 'export',
        config: { exportFormat: 'docx', dependsOn: ['draft-updates'] },
      },
    ],
  },

  // ── 9. Due Diligence Package Builder ─────────────────────
  {
    id: 'dd-package-builder',
    label: 'Due Diligence Package Builder',
    shortLabel: 'DD Package',
    icon: 'PackageCheck',
    description: 'Build a structured due diligence package for a new client, correspondent bank, or business relationship. Combines multiple research and analysis steps into a complete DD file.',
    category: 'assessment',
    estimatedTime: '5-10 min',
    tags: ['due diligence', 'CDD', 'EDD', 'KYC'],
    steps: [
      {
        id: 'input-subject',
        label: 'Define DD Subject',
        description: 'Who or what is being assessed',
        type: 'input',
        config: {
          inputFields: [
            { id: 'subjectName', label: 'Subject name', type: 'text', required: true, placeholder: 'Entity or person name' },
            { id: 'subjectType', label: 'Subject type', type: 'select', options: ['Corporate client', 'Individual client (PEP)', 'Individual client (High Net Worth)', 'Correspondent bank', 'Agent/intermediary', 'Supplier/vendor', 'Other'], required: true },
            { id: 'ddLevel', label: 'Due diligence level', type: 'select', options: ['Simplified DD', 'Standard CDD', 'Enhanced DD (EDD)', 'Correspondent banking DD'], required: true },
            { id: 'jurisdiction', label: 'Jurisdiction of subject', type: 'text', placeholder: 'Country/countries of operation' },
            { id: 'knownInfo', label: 'Known information about the subject', type: 'textarea', placeholder: 'Business description, ownership structure, relationship purpose...' },
            { id: 'concerns', label: 'Specific concerns or red flags (optional)', type: 'textarea', placeholder: 'Any known risk factors, adverse media, PEP connections...' },
          ],
        },
      },
      {
        id: 'research',
        label: 'Structured Research',
        description: 'Research the subject using available information and web search',
        type: 'claude',
        config: {
          thinking: 'investigate',
          creativity: 'strict',
          promptTemplate: `Conduct structured due diligence research on {{subjectName}} ({{subjectType}}, {{jurisdiction}}).
DD Level: {{ddLevel}}
Known information: {{knownInfo}}
Concerns: {{concerns}}

Research and document:
1. **Entity Overview** — What does this entity do? Size, history, reputation
2. **Ownership & Control** — Beneficial ownership, corporate structure, UBOs
3. **Jurisdiction Risk** — Country/geographic risk factors
4. **Regulatory Status** — Licensed? Supervised? By whom?
5. **Adverse Information** — Any sanctions, litigation, adverse media, enforcement actions
6. **PEP Connections** — Any politically exposed persons in ownership/management
7. **Business Rationale** — Does the proposed relationship make commercial sense?
8. **Red Flags** — Any indicators of concern

Note: For any information that could not be verified, explicitly state "REQUIRES MANUAL VERIFICATION."`,
          dependsOn: ['input-subject'],
        },
      },
      {
        id: 'risk-assessment',
        label: 'Risk Assessment & Recommendation',
        description: 'Assess the risk and provide a recommendation',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'strict',
          promptTemplate: `Based on the research above, produce a DD risk assessment for {{subjectName}}:

**RISK ASSESSMENT**
| Risk Factor | Assessment | Rating |
(Jurisdiction, Product, Customer type, Transaction patterns, Ownership complexity, PEP, Adverse media)

**Overall Risk Rating:** [Low / Medium / High / Unacceptable]

**Recommendation:** [Accept / Accept with conditions / Reject / Escalate for decision]

**Conditions (if applicable):**
- Ongoing monitoring frequency
- Enhanced measures required
- Additional documentation needed
- Approval level required

**Outstanding items requiring manual verification:**
[List all items that need human follow-up]

IMPORTANT: This assessment supports but does not replace human decision-making.`,
          dependsOn: ['research'],
        },
      },
      {
        id: 'export',
        label: 'Export DD Package',
        description: 'Export the complete DD file',
        type: 'export',
        config: { exportFormat: 'docx', dependsOn: ['risk-assessment'] },
      },
    ],
  },

  // ── 10. Multi-Client Compliance Status Report ────────────
  {
    id: 'compliance-status-report',
    label: 'Multi-Client Compliance Status Report',
    shortLabel: 'Status Report',
    icon: 'ClipboardList',
    description: 'Generate a structured compliance status report across multiple clients or projects. Useful for internal management reporting, board reporting, or partner updates.',
    category: 'reporting',
    estimatedTime: '5-8 min',
    tags: ['reporting', 'status', 'management', 'multi-client'],
    steps: [
      {
        id: 'input-scope',
        label: 'Define Report Scope',
        description: 'Which clients/projects and what aspects to report on',
        type: 'input',
        config: {
          inputFields: [
            { id: 'reportTitle', label: 'Report title', type: 'text', required: true, placeholder: 'e.g., Q1 2026 Compliance Advisory Status Report' },
            { id: 'reportPeriod', label: 'Reporting period', type: 'text', required: true, placeholder: 'e.g., January - March 2026' },
            { id: 'clientUpdates', label: 'Client/project updates', type: 'textarea', required: true, placeholder: 'For each client/project, describe:\n- Client name\n- Engagement scope\n- Progress/status\n- Key milestones\n- Issues/risks\n- Next steps' },
            { id: 'keyHighlights', label: 'Key highlights to include', type: 'textarea', placeholder: 'Major achievements, wins, concerns, market developments...' },
            { id: 'audience', label: 'Report audience', type: 'select', options: ['Internal management', 'Board of directors', 'Partners', 'Client governance committee'], required: true },
          ],
        },
      },
      {
        id: 'structure-report',
        label: 'Structure & Analyze',
        description: 'Organize updates into a structured report with analysis',
        type: 'claude',
        config: {
          thinking: 'think_hard',
          creativity: 'balanced',
          promptTemplate: `Produce a structured compliance status report:

Title: {{reportTitle}}
Period: {{reportPeriod}}
Audience: {{audience}}

Client/project updates:
{{clientUpdates}}

Key highlights:
{{keyHighlights}}

Structure:
1. **Executive Overview** — High-level status summary, key metrics
2. **Client/Project Status** — For each client:
   - Status: 🟢 On track / 🟡 At risk / 🔴 Requires attention
   - Progress summary
   - Key deliverables completed
   - Open issues/risks
   - Next milestones
3. **Market & Regulatory Developments** — Relevant external developments
4. **Risk & Issue Log** — Cross-client risks and issues
5. **Resource Utilization** — Team capacity and allocation
6. **Forward Look** — Key activities for next period
7. **Decisions Required** — Any decisions needed from the audience`,
          dependsOn: ['input-scope'],
        },
      },
      {
        id: 'export',
        label: 'Export Report',
        description: 'Export the status report',
        type: 'export',
        config: { exportFormat: 'docx', dependsOn: ['structure-report'] },
      },
    ],
  },
];

// ── Helper functions ───────────────────────────────────────

export function getWorkflowById(id: string): WorkflowDefinition | undefined {
  return WORKFLOWS.find(w => w.id === id);
}

export function getWorkflowsByCategory(): Record<string, WorkflowDefinition[]> {
  const grouped: Record<string, WorkflowDefinition[]> = {};
  for (const wf of WORKFLOWS) {
    if (!grouped[wf.category]) grouped[wf.category] = [];
    grouped[wf.category].push(wf);
  }
  return grouped;
}

export const WORKFLOW_CATEGORY_LABELS: Record<string, string> = {
  monitoring: 'Monitoring & Scanning',
  assessment: 'Assessment & Analysis',
  advisory: 'Advisory & Alerts',
  reporting: 'Reporting',
  comparison: 'Comparison & Benchmarking',
};
