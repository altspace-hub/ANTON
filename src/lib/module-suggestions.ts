/**
 * module-suggestions.ts
 *
 * Returns 2-3 suggested follow-up modules based on the current module and
 * optionally the area the user is working in.
 */

export interface ModuleSuggestion {
  moduleId: string;
  label: string;
  reason: string;
}

// Hardcoded workflow suggestions per module
const MODULE_WORKFLOW_MAP: Record<string, ModuleSuggestion[]> = {
  // Gap analysis modules → policy document + action plan
  'gap-analysis': [
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Turn gap findings into a fully drafted policy or procedure.',
    },
    {
      moduleId: 'engagement-execution',
      label: 'Engagement Execution Engine',
      reason: 'Systematically work through each gap item as a scoped engagement deliverable.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Convert gap analysis results into a board-ready presentation.',
    },
  ],

  'engagement-execution': [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Run a structured gap assessment to feed into the engagement scope.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Package engagement findings into a polished client-ready presentation.',
    },
    {
      moduleId: 'engagement-proposal',
      label: 'Engagement Proposal Writer',
      reason: 'Draft a follow-on proposal based on findings from this engagement.',
    },
  ],

  // Risk assessment → gap analysis + board report
  'risk-assessment': [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Map identified risks directly to regulatory requirements and control gaps.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Present risk findings and recommended decisions to board or senior management.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Draft a Risk Appetite Statement or BWRA based on the assessment output.',
    },
  ],

  // Policy document → training material + review
  'document-creation': [
    {
      moduleId: 'training-content',
      label: 'Training Content',
      reason: 'Create staff training materials based on the new or updated policy.',
    },
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Verify the drafted document covers all regulatory requirements.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Summarise policy changes for board or committee approval.',
    },
  ],

  'training-content': [
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Ensure the underlying policies and procedures are up to date.',
    },
    {
      moduleId: 'risk-assessment',
      label: 'Risk Assessment',
      reason: 'Identify which risk areas require the most urgent training focus.',
    },
  ],

  'sanctions-advisory': [
    {
      moduleId: 'regulatory-monitor',
      label: 'Regulatory Monitor',
      reason: 'Stay current on sanctions regime updates and new designations.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Draft or update your Sanctions Policy based on advisory findings.',
    },
    {
      moduleId: 'investigation-support',
      label: 'Investigation Support',
      reason: 'Structure the analysis for a specific sanctions screening hit.',
    },
  ],

  'regulatory-monitor': [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Assess how the new regulatory development affects your current compliance posture.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Update policies and procedures to reflect the new requirements.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Brief senior management on the regulatory impact and required actions.',
    },
  ],

  'investigation-support': [
    {
      moduleId: 'sanctions-advisory',
      label: 'Sanctions Advisory',
      reason: 'Check if the subject of investigation has sanctions exposure.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Draft a Suspicious Activity Report or internal case memo.',
    },
    {
      moduleId: 'risk-assessment',
      label: 'Risk Assessment',
      reason: 'Review customer or product risk classification following investigation findings.',
    },
  ],

  'data-management': [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Link data readiness findings to specific AMLA/AMLR data requirements.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Create a Data Governance Framework or Data Management Policy.',
    },
  ],

  'engagement-proposal': [
    {
      moduleId: 'engagement-execution',
      label: 'Engagement Execution Engine',
      reason: 'Once the proposal is accepted, use this module to execute the engagement scope.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Prepare a credentials or kick-off presentation for the client.',
    },
  ],

  'model-validation': [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Check if validation findings create regulatory compliance gaps.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Draft a model validation report or model risk policy update.',
    },
  ],

  'management-presentation': [
    {
      moduleId: 'engagement-proposal',
      label: 'Engagement Proposal Writer',
      reason: 'Turn presentation insights into a formal engagement proposal.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Follow up with a detailed written report or policy document.',
    },
  ],
};

// Area-based fallback suggestions
const AREA_FALLBACK_MAP: Record<string, ModuleSuggestion[]> = {
  fcp: [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'A core starting point for any FCP compliance assessment.',
    },
    {
      moduleId: 'regulatory-monitor',
      label: 'Regulatory Monitor',
      reason: 'Stay on top of the latest FCP regulatory developments.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Create or update FCP policies and procedures.',
    },
  ],
  legal: [
    {
      moduleId: 'regulatory-interpretation',
      label: 'Regulatory Interpretation',
      reason: 'Translate legal text into practical compliance obligations.',
    },
    {
      moduleId: 'contract-review',
      label: 'Contract Review & Analysis',
      reason: 'Review contracts for regulatory and commercial risk.',
    },
  ],
  audit: [
    {
      moduleId: 'audit-planning',
      label: 'Audit Planning',
      reason: 'Structure the audit programme and risk-based scope.',
    },
    {
      moduleId: 'finding-writer',
      label: 'Finding Writer',
      reason: 'Draft clear, evidence-based audit findings.',
    },
  ],
  consulting: [
    {
      moduleId: 'engagement-proposal',
      label: 'Engagement Proposal Writer',
      reason: 'Develop a professional client proposal.',
    },
    {
      moduleId: 'management-presentation',
      label: 'Management Presentation',
      reason: 'Deliver findings in a polished, client-ready format.',
    },
  ],
  banking: [
    {
      moduleId: 'gap-analysis',
      label: 'AMLR Gap Analysis',
      reason: 'Assess compliance gaps in banking regulatory requirements.',
    },
    {
      moduleId: 'risk-assessment',
      label: 'Risk Assessment',
      reason: 'Evaluate credit, operational, and product risk.',
    },
  ],
  risk: [
    {
      moduleId: 'risk-assessment',
      label: 'Risk Assessment',
      reason: 'Run a structured risk assessment across key risk dimensions.',
    },
    {
      moduleId: 'document-creation',
      label: 'Document Creation',
      reason: 'Document risk appetite statements and frameworks.',
    },
  ],
  // NGO & Social Impact areas
  'community-health': [
    { moduleId: 'health-education', label: 'Health Education', reason: 'Create community health literacy materials to follow up on assessments.' },
    { moduleId: 'mental-health-support', label: 'Mental Health Support', reason: 'Address mental health needs identified during health assessments.' },
  ],
  'smallholder-farming': [
    { moduleId: 'crop-planning-advisor', label: 'Crop Planning', reason: 'Turn soil and water assessment findings into a seasonal crop plan.' },
    { moduleId: 'market-access-advisor', label: 'Market Access', reason: 'Connect improved yields to market and income opportunities.' },
  ],
  'livestock-poultry': [
    { moduleId: 'crop-planning-advisor', label: 'Crop Planning', reason: 'Integrate fodder crops into the farm plan for feed security.' },
    { moduleId: 'market-access-advisor', label: 'Market Access', reason: 'Find buyers for livestock products and improve pricing.' },
  ],
  'land-rights': [
    { moduleId: 'workers-rights-advisor', label: 'Workers\' Rights', reason: 'Combine land and labour rights support for agricultural workers.' },
    { moduleId: 'dispute-resolution-guide', label: 'Dispute Resolution', reason: 'Escalate unresolved land disputes through formal channels.' },
  ],
  'workers-rights': [
    { moduleId: 'land-rights-advisor', label: 'Land Rights', reason: 'Address land tenure issues faced by agricultural and rural workers.' },
    { moduleId: 'micro-business-advisor', label: 'Micro-Business', reason: 'Support transitions from informal employment to self-employment.' },
  ],
  'education-literacy': [
    { moduleId: 'digital-literacy-guide', label: 'Digital Literacy', reason: 'Build on literacy foundations with digital skills training.' },
    { moduleId: 'micro-business-advisor', label: 'Micro-Business', reason: 'Apply literacy and numeracy skills to starting or growing a business.' },
  ],
  'micro-business': [
    { moduleId: 'credit-navigator', label: 'Credit Navigator', reason: 'Find appropriate finance to start or grow the micro-business.' },
    { moduleId: 'market-access-advisor', label: 'Market Access', reason: 'Connect the business to customers and supply chains.' },
  ],
  'credit-navigator': [
    { moduleId: 'micro-business-advisor', label: 'Micro-Business', reason: 'Apply financing to business start-up or growth planning.' },
    { moduleId: 'financial-literacy', label: 'Financial Literacy', reason: 'Build the financial skills needed to manage credit responsibly.' },
  ],
  microfinance: [
    { moduleId: 'credit-navigator', label: 'Credit Navigator', reason: 'Help clients navigate loan options and understand their rights.' },
    { moduleId: 'micro-business-advisor', label: 'Micro-Business', reason: 'Support client micro-enterprise development alongside financing.' },
  ],
  // Trades & Service Workers
  trades: [
    { moduleId: 'invoice-generator', label: 'Invoice Generator', reason: 'Generate a professional invoice for the completed job.' },
    { moduleId: 'job-quote-builder', label: 'Job Quote Builder', reason: 'Write a professional quote for an upcoming job.' },
    { moduleId: 'customer-comms', label: 'Customer Message', reason: 'Write a quick message to your customer.' },
  ],
};

/**
 * Returns 2-3 suggested follow-up modules for the given module ID.
 *
 * @param moduleId  The ID of the module the user just used or is viewing.
 * @param areaId    Optional area ID (e.g. 'fcp', 'legal') for contextual fallback.
 * @returns         Array of 0-3 module suggestions with labels and reasons.
 */
export function getModuleSuggestions(
  moduleId: string,
  areaId?: string
): ModuleSuggestion[] {
  // 1. Direct module workflow mapping
  const directSuggestions = MODULE_WORKFLOW_MAP[moduleId];
  if (directSuggestions && directSuggestions.length > 0) {
    return directSuggestions.slice(0, 3);
  }

  // 2. Area-based fallback
  if (areaId) {
    const areaSuggestions = AREA_FALLBACK_MAP[areaId];
    if (areaSuggestions && areaSuggestions.length > 0) {
      // Filter out the current module from area suggestions
      return areaSuggestions.filter((s) => s.moduleId !== moduleId).slice(0, 3);
    }
  }

  // 3. Default: empty array
  return [];
}
