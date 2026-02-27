export interface BenchmarkComponent {
  id: string;
  name: string;
  keywords: string[];
  required: boolean;
}

export interface BenchmarkResult {
  moduleType: string;
  score: number;
  totalComponents: number;
  foundComponents: number;
  missing: string[];
  found: string[];
  suggestions: string[];
}

const MODULE_BENCHMARKS: Record<string, BenchmarkComponent[]> = {
  'gap-analysis': [
    {
      id: 'exec-summary',
      name: 'Executive Summary',
      keywords: ['executive summary', 'overview', 'key findings'],
      required: true,
    },
    {
      id: 'methodology',
      name: 'Methodology',
      keywords: ['methodology', 'approach', 'how we'],
      required: true,
    },
    {
      id: 'regulatory-scope',
      name: 'Regulatory Scope',
      keywords: ['article', 'regulation', 'directive', 'requirement'],
      required: true,
    },
    {
      id: 'gap-inventory',
      name: 'Gap Inventory',
      keywords: ['gap', 'finding', 'deficiency'],
      required: true,
    },
    {
      id: 'risk-rating',
      name: 'Risk Rating',
      keywords: ['risk rating', 'severity', 'critical', 'high', 'medium', 'low'],
      required: true,
    },
    {
      id: 'remediation',
      name: 'Remediation Priorities',
      keywords: ['remediation', 'action', 'recommendation'],
      required: true,
    },
    {
      id: 'timeline',
      name: 'Timeline',
      keywords: ['timeline', 'deadline', 'Q1', 'Q2', 'month', 'week'],
      required: false,
    },
    {
      id: 'resources',
      name: 'Resource Estimation',
      keywords: ['resource', 'budget', 'FTE', 'cost', 'effort'],
      required: false,
    },
    {
      id: 'citations',
      name: 'Regulatory Citations',
      keywords: ['article', 'section', 'regulation', 'directive'],
      required: true,
    },
    {
      id: 'version',
      name: 'Version Information',
      keywords: ['version', 'date', 'prepared by', 'reviewed by'],
      required: false,
    },
  ],

  'document-creation': [
    {
      id: 'purpose',
      name: 'Purpose & Scope',
      keywords: ['purpose', 'scope', 'objective', 'applies to'],
      required: true,
    },
    {
      id: 'definitions',
      name: 'Definitions',
      keywords: ['definition', 'means', 'refers to', 'glossary'],
      required: false,
    },
    {
      id: 'responsibilities',
      name: 'Roles & Responsibilities',
      keywords: ['responsible', 'accountability', 'role', 'owner', 'RACI'],
      required: true,
    },
    {
      id: 'procedures',
      name: 'Procedures',
      keywords: ['procedure', 'process', 'step', 'shall', 'must'],
      required: true,
    },
    {
      id: 'escalation',
      name: 'Escalation Path',
      keywords: ['escalation', 'escalate', 'report to', 'notify'],
      required: true,
    },
    {
      id: 'review-cycle',
      name: 'Review Cycle',
      keywords: ['review', 'annual', 'periodic', 'updated', 'approved'],
      required: true,
    },
    {
      id: 'version',
      name: 'Version Control',
      keywords: ['version', 'approved by', 'effective date', 'revision'],
      required: false,
    },
  ],

  'sanctions-advisory': [
    {
      id: 'regime-overview',
      name: 'Sanctions Regime Overview',
      keywords: ['sanctions', 'regime', 'OFAC', 'EU', 'UN', 'HMT'],
      required: true,
    },
    {
      id: 'legal-basis',
      name: 'Legal Basis',
      keywords: ['regulation', 'legal', 'authority', 'statute', 'order'],
      required: true,
    },
    {
      id: 'designated-parties',
      name: 'Designated Parties',
      keywords: ['designated', 'listed', 'SDN', 'asset freeze', 'entity'],
      required: true,
    },
    {
      id: 'risk-exposure',
      name: 'Risk Exposure Assessment',
      keywords: ['exposure', 'risk', 'customer', 'counterparty', 'jurisdiction'],
      required: true,
    },
    {
      id: 'controls',
      name: 'Controls & Mitigations',
      keywords: ['control', 'screening', 'filter', 'block', 'mitigation'],
      required: true,
    },
    {
      id: 'reporting',
      name: 'Reporting Obligations',
      keywords: ['report', 'notify', 'disclose', 'OFSI', 'OFAC', 'obligation'],
      required: false,
    },
  ],

  'risk-assessment': [
    {
      id: 'methodology',
      name: 'Risk Methodology',
      keywords: ['methodology', 'approach', 'framework', 'risk-based'],
      required: true,
    },
    {
      id: 'risk-categories',
      name: 'Risk Categories',
      keywords: ['customer risk', 'product risk', 'channel risk', 'geographic risk', 'category'],
      required: true,
    },
    {
      id: 'inherent-risk',
      name: 'Inherent Risk',
      keywords: ['inherent risk', 'gross risk', 'before controls', 'raw risk'],
      required: true,
    },
    {
      id: 'residual-risk',
      name: 'Residual Risk',
      keywords: ['residual risk', 'net risk', 'after controls'],
      required: true,
    },
    {
      id: 'risk-appetite',
      name: 'Risk Appetite',
      keywords: ['risk appetite', 'tolerance', 'threshold', 'acceptable risk'],
      required: true,
    },
    {
      id: 'mitigating-controls',
      name: 'Mitigating Controls',
      keywords: ['control', 'mitigation', 'safeguard', 'measure'],
      required: true,
    },
    {
      id: 'ratings',
      name: 'Risk Ratings',
      keywords: ['high', 'medium', 'low', 'rating', 'score', 'RAG'],
      required: true,
    },
    {
      id: 'monitoring',
      name: 'Ongoing Monitoring',
      keywords: ['monitoring', 'review', 'ongoing', 'periodic'],
      required: false,
    },
  ],

  'default': [
    {
      id: 'exec-summary',
      name: 'Executive Summary',
      keywords: ['executive summary', 'management summary', 'summary', 'highlights', 'key takeaway', 'key takeaways'],
      required: false,
    },
    {
      id: 'intro',
      name: 'Introduction / Background',
      keywords: ['introduction', 'background', 'context', 'overview', 'purpose', 'scope', 'objective', 'rationale'],
      required: true,
    },
    {
      id: 'analysis',
      name: 'Analysis / Assessment',
      keywords: ['analysis', 'assessment', 'evaluation', 'review', 'finding', 'findings', 'current state', 'gap'],
      required: true,
    },
    {
      id: 'recommendations',
      name: 'Recommendations / Actions',
      keywords: ['recommendation', 'recommendations', 'action item', 'action plan', 'next step', 'next steps', 'proposed action', 'mitigation', 'remediation', 'suggest', 'should'],
      required: true,
    },
    {
      id: 'conclusion',
      name: 'Conclusion',
      keywords: ['conclusion', 'conclusions', 'closing remarks', 'final thoughts', 'in summary', 'to summarize', 'in conclusion', 'overall assessment', 'key takeaway'],
      required: true,
    },
    {
      id: 'implementation',
      name: 'Implementation / Roadmap',
      keywords: ['implementation', 'roadmap', 'timeline', 'workstream', 'milestone', 'phase', 'approach', 'methodology'],
      required: false,
    },
  ],
};

function componentFound(content: string, component: BenchmarkComponent): boolean {
  const lower = content.toLowerCase();
  return component.keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

export function benchmarkOutput(content: string, moduleId?: string): BenchmarkResult {
  const key = moduleId && MODULE_BENCHMARKS[moduleId] ? moduleId : 'default';
  const components = MODULE_BENCHMARKS[key];

  const found: string[] = [];
  const missing: string[] = [];
  const suggestions: string[] = [];

  for (const component of components) {
    if (componentFound(content, component)) {
      found.push(component.name);
    } else {
      missing.push(component.name);
      if (component.required) {
        suggestions.push(`Add ${component.name} — required for a complete ${key.replace('-', ' ')} output`);
      }
    }
  }

  const requiredComponents = components.filter((c) => c.required);
  const requiredFound = requiredComponents.filter((c) => componentFound(content, c)).length;
  const requiredScore = requiredComponents.length > 0
    ? requiredFound / requiredComponents.length
    : 1;

  const optionalComponents = components.filter((c) => !c.required);
  const optionalFound = optionalComponents.filter((c) => componentFound(content, c)).length;
  const optionalScore = optionalComponents.length > 0
    ? optionalFound / optionalComponents.length
    : 1;

  // Weighted: required = 80%, optional = 20%
  const score = Math.round((requiredScore * 0.8 + optionalScore * 0.2) * 100);

  return {
    moduleType: key,
    score,
    totalComponents: components.length,
    foundComponents: found.length,
    missing,
    found,
    suggestions,
  };
}
