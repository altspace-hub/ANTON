import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MODULES, AREAS } from '@/lib/constants';
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Building2,
  Scale,
  Briefcase,
  Users,
  ClipboardCheck,
  Cpu,
  TrendingUp,
  Rocket,
  MoreHorizontal,
} from 'lucide-react';

// ─── Industry quick-start paths ─────────────────────────────────────────────

interface Industry {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Module IDs that are especially relevant for this industry */
  relevantModuleIds: string[];
}

const INDUSTRIES: Industry[] = [
  {
    id: 'banking-finance',
    label: 'Banking & Finance',
    icon: <Building2 className="h-4 w-4" />,
    relevantModuleIds: [
      'gap-analysis', 'sanctions-advisory', 'regulatory-monitor',
      'risk-assessment', 'data-management', 'investigation-support',
      'model-validation', 'document-creation',
    ],
  },
  {
    id: 'legal-compliance',
    label: 'Legal & Compliance',
    icon: <Scale className="h-4 w-4" />,
    relevantModuleIds: [
      'regulatory-interpretation', 'contract-review', 'compliance-framework',
      'regulatory-change-impact', 'gdpr-privacy', 'legal-brief',
      'gap-analysis', 'document-creation',
    ],
  },
  {
    id: 'consulting',
    label: 'Consulting',
    icon: <Briefcase className="h-4 w-4" />,
    relevantModuleIds: [
      'engagement-proposal', 'engagement-execution', 'management-presentation',
      'proposal-generator', 'stakeholder-mapping', 'client-presentation',
      'gap-analysis', 'risk-assessment',
    ],
  },
  {
    id: 'hr-people',
    label: 'HR & People',
    icon: <Users className="h-4 w-4" />,
    relevantModuleIds: [
      'job-description', 'interview-framework', 'performance-review',
      'hr-policy', 'ld-planning', 'training-content',
      'change-management', 'resource-planning',
    ],
  },
  {
    id: 'audit-assurance',
    label: 'Audit & Assurance',
    icon: <ClipboardCheck className="h-4 w-4" />,
    relevantModuleIds: [
      'audit-planning', 'control-testing', 'finding-writer',
      'audit-report', 'sox-isae', 'regulatory-exam-prep',
      'gap-analysis', 'risk-assessment',
    ],
  },
  {
    id: 'technology',
    label: 'Technology',
    icon: <Cpu className="h-4 w-4" />,
    relevantModuleIds: [
      'code-review', 'architecture-review', 'technical-spec',
      'api-design', 'tech-debt-assessment', 'dora-compliance',
      'ict-risk-management', 'data-governance',
    ],
  },
  {
    id: 'strategy-ops',
    label: 'Strategy & Ops',
    icon: <TrendingUp className="h-4 w-4" />,
    relevantModuleIds: [
      'business-case', 'strategic-analysis', 'market-entry',
      'competitive-analysis', 'project-planning', 'status-reporting',
      'resource-planning', 'scenario-analysis',
    ],
  },
  {
    id: 'startups',
    label: 'Startups',
    icon: <Rocket className="h-4 w-4" />,
    relevantModuleIds: [
      'business-plan', 'pitch-deck', 'funding-strategy',
      'mvp-scoping', 'cofounder-agreements', 'business-case',
      'market-entry', 'engagement-proposal',
    ],
  },
  {
    id: 'other',
    label: 'Other',
    icon: <MoreHorizontal className="h-4 w-4" />,
    relevantModuleIds: [],
  },
];

const CATEGORIES = [
  { id: 'strategy', label: 'Strategy' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'document', label: 'Document' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'risk', label: 'Risk' },
  { id: 'communication', label: 'Communication' },
  { id: 'research', label: 'Research' },
  { id: 'personal', label: 'Personal' },
  { id: 'technical', label: 'Technical' },
];

const OUTPUT_TYPES = [
  { id: 'document-policy', label: 'Document / Policy' },
  { id: 'data-analysis', label: 'Data Analysis' },
  { id: 'quick-answer', label: 'Quick Answer' },
  { id: 'spreadsheet-matrix', label: 'Spreadsheet / Matrix' },
  { id: 'presentation', label: 'Presentation' },
  { id: 'training-material', label: 'Training Material' },
];

const ROLES = [
  { id: 'compliance-professional', label: 'Compliance Professional' },
  { id: 'consultant', label: 'Consultant' },
  { id: 'lawyer', label: 'Lawyer' },
  { id: 'auditor', label: 'Auditor' },
  { id: 'student', label: 'Student' },
  { id: 'business-owner', label: 'Business Owner' },
  { id: 'executive', label: 'Executive' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'software-engineer', label: 'Software Engineer' },
  { id: 'hr-professional', label: 'HR Professional' },
];

// Keyword sets for category alignment scoring
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  strategy: ['strategy', 'strategic', 'planning', 'roadmap', 'business case', 'market', 'competitive', 'positioning'],
  analysis: ['analysis', 'assess', 'evaluate', 'review', 'compare', 'audit', 'gap', 'scoring', 'maturity'],
  document: ['document', 'policy', 'procedure', 'draft', 'create', 'write', 'template', 'framework', 'brief'],
  compliance: ['compliance', 'regulation', 'regulatory', 'aml', 'kyc', 'cdd', 'sanctions', 'gdpr', 'dora', 'mifid'],
  risk: ['risk', 'threat', 'vulnerability', 'control', 'mitigation', 'residual', 'inherent', 'appetite'],
  communication: ['presentation', 'report', 'briefing', 'training', 'stakeholder', 'board', 'executive summary'],
  research: ['research', 'investigate', 'monitor', 'intelligence', 'trend', 'development', 'new regulation'],
  personal: ['career', 'interview', 'cv', 'resume', 'learning', 'development', 'certification'],
  technical: ['data', 'model', 'system', 'architecture', 'integration', 'api', 'database', 'analytics', 'ict'],
};

// Output type alignment scoring
const OUTPUT_MODULE_ALIGNMENT: Record<string, string[]> = {
  'document-policy': ['document-creation', 'compliance-framework', 'policy-document', 'legal-brief', 'ict-risk-management', 'data-governance'],
  'data-analysis': ['gap-analysis', 'data-management', 'data-quality', 'financial-statement', 'analytics-design', 'model-validation'],
  'quick-answer': ['regulatory-monitor', 'regulatory-interpretation', 'sanctions-advisory', 'payment-services'],
  'spreadsheet-matrix': ['gap-analysis', 'risk-assessment', 'enterprise-risk', 'data-quality', 'control-testing', 'sox-isae'],
  'presentation': ['management-presentation', 'client-presentation', 'status-reporting', 'stakeholder-mapping'],
  'training-material': ['training-content', 'change-management'],
};

// Role alignment scoring
const ROLE_MODULE_ALIGNMENT: Record<string, string[]> = {
  'compliance-professional': ['gap-analysis', 'compliance-framework', 'regulatory-monitor', 'dora-compliance', 'fund-compliance'],
  consultant: ['engagement-proposal', 'engagement-execution', 'proposal-generator', 'engagement-delivery', 'client-presentation'],
  lawyer: ['regulatory-interpretation', 'contract-review', 'legal-brief', 'gdpr-privacy'],
  auditor: ['audit-planning', 'control-testing', 'finding-writer', 'audit-report', 'sox-isae', 'regulatory-exam-prep'],
  student: ['training-content', 'regulatory-monitor'],
  'business-owner': ['business-case', 'strategic-analysis', 'market-entry', 'product-compliance'],
  executive: ['risk-appetite', 'enterprise-risk', 'scenario-analysis', 'business-case', 'esg-strategy'],
  researcher: ['regulatory-interpretation', 'regulatory-change-impact', 'double-materiality', 'climate-risk'],
  'software-engineer': ['data-quality', 'data-governance', 'analytics-design', 'data-strategy', 'ict-risk-management'],
  'hr-professional': ['training-content', 'change-management', 'resource-planning'],
};

interface ScoredModule {
  module: typeof MODULES[number];
  score: number;
  areaLabel: string;
  areaColor: string;
}

function scoreModules(
  description: string,
  selectedCategories: string[],
  selectedOutputs: string[],
  selectedRoles: string[]
): ScoredModule[] {
  const descLower = description.toLowerCase();

  return MODULES.map((mod) => {
    let score = 0;
    const modDescLower = mod.description.toLowerCase();
    const modLabelLower = mod.label.toLowerCase();

    // +3 for keyword match in module description against user description
    const descWords = descLower.split(/\s+/).filter((w) => w.length > 3);
    for (const word of descWords) {
      if (modDescLower.includes(word) || modLabelLower.includes(word)) {
        score += 3;
      }
    }

    // +2 for category alignment
    for (const cat of selectedCategories) {
      const keywords = CATEGORY_KEYWORDS[cat] || [];
      for (const kw of keywords) {
        if (modDescLower.includes(kw) || modLabelLower.includes(kw)) {
          score += 2;
          break;
        }
      }
    }

    // +2 for output type alignment
    for (const output of selectedOutputs) {
      const alignedModules = OUTPUT_MODULE_ALIGNMENT[output] || [];
      if (alignedModules.includes(mod.id)) {
        score += 2;
      }
    }

    // +1 for role alignment
    for (const role of selectedRoles) {
      const alignedModules = ROLE_MODULE_ALIGNMENT[role] || [];
      if (alignedModules.includes(mod.id)) {
        score += 1;
      }
    }

    // Find area
    const area = AREAS.find((a) => (a.moduleIds as readonly string[]).includes(mod.id));

    return {
      module: mod,
      score,
      areaLabel: area?.label || 'General',
      areaColor: area?.color || 'adv-gray',
    };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export default function GuideMePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedOutputs, setSelectedOutputs] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);

  function handleIndustrySelect(industryId: string) {
    const next = selectedIndustry === industryId ? null : industryId;
    setSelectedIndustry(next);
    const industry = INDUSTRIES.find((i) => i.id === industryId);
    console.log('[GuideMePage] Industry selected:', next, '| Relevant modules:', industry?.relevantModuleIds ?? []);
  }

  const toggleChip = (id: string, list: string[], setList: (v: string[]) => void) => {
    setList(list.includes(id) ? list.filter((c) => c !== id) : [...list, id]);
  };

  const canProceed =
    (step === 1 && (description.trim().length > 0 || selectedCategories.length > 0)) ||
    (step === 2 && selectedOutputs.length > 0) ||
    (step === 3 && selectedRoles.length > 0);

  const results = step === 4 ? scoreModules(description, selectedCategories, selectedOutputs, selectedRoles) : [];

  const colorMap: Record<string, string> = {
    'adv-teal': 'bg-adv-teal/20 text-adv-teal border-adv-teal/30',
    'adv-blue': 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',
    'adv-gold': 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',
    'adv-green': 'bg-adv-green/20 text-adv-green border-adv-green/30',
    'adv-red': 'bg-adv-red/20 text-adv-red border-adv-red/30',
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col py-6">
      {/* Header */}
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-adv-teal/10">
          <Compass className="h-6 w-6 text-adv-teal" />
        </div>
        <h1 className="text-xl font-bold text-adv-white">Guide Me</h1>
        <p className="mt-1 text-sm text-adv-gray">
          Answer a few questions and we will recommend the best module for your task.
        </p>
      </div>

      {/* Industry quick-start section */}
      {step === 1 && (
        <div className="mb-6 rounded-xl border border-border bg-adv-dark-2 p-4">
          <p className="mb-3 text-xs font-medium text-adv-gray">
            Quick start — select your industry (optional)
          </p>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((industry) => (
              <button
                key={industry.id}
                onClick={() => handleIndustrySelect(industry.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedIndustry === industry.id
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {industry.icon}
                {industry.label}
              </button>
            ))}
          </div>
          {selectedIndustry && selectedIndustry !== 'other' && (
            <p className="mt-3 text-xs text-adv-teal">
              Showing modules relevant to{' '}
              <span className="font-semibold">
                {INDUSTRIES.find((i) => i.id === selectedIndustry)?.label}
              </span>
              . The wizard below will refine recommendations further.
            </p>
          )}
        </div>
      )}

      {/* Progress indicator */}
      {step <= 3 && (
        <div className="mb-6 flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  s < step
                    ? 'bg-adv-teal text-adv-dark'
                    : s === step
                    ? 'border-2 border-adv-teal bg-adv-teal/10 text-adv-teal'
                    : 'border border-border bg-adv-dark text-adv-gray'
                }`}
              >
                {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`h-0.5 w-12 rounded ${
                    s < step ? 'bg-adv-teal' : 'bg-border'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-auto">
        {step === 1 && (
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <h2 className="mb-1 text-base font-semibold text-adv-white">
              Step 1: What do you need help with?
            </h2>
            <p className="mb-4 text-sm text-adv-gray">
              Describe your task in your own words, then optionally select relevant categories.
            </p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. I need to assess our bank's AML policies against the new EU regulation..."
              className="mb-4 w-full resize-none rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
              rows={4}
            />
            <p className="mb-2 text-xs font-medium text-adv-gray">Categories (optional, multi-select)</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => toggleChip(cat.id, selectedCategories, setSelectedCategories)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedCategories.includes(cat.id)
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                      : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <h2 className="mb-1 text-base font-semibold text-adv-white">
              Step 2: What type of output do you need?
            </h2>
            <p className="mb-4 text-sm text-adv-gray">
              Select one or more output types you are looking for.
            </p>
            <div className="flex flex-wrap gap-2">
              {OUTPUT_TYPES.map((ot) => (
                <button
                  key={ot.id}
                  onClick={() => toggleChip(ot.id, selectedOutputs, setSelectedOutputs)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    selectedOutputs.includes(ot.id)
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                      : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                  }`}
                >
                  {ot.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-xl border border-border bg-adv-card p-6">
            <h2 className="mb-1 text-base font-semibold text-adv-white">
              Step 3: What best describes you?
            </h2>
            <p className="mb-4 text-sm text-adv-gray">
              Select your role to help us tailor recommendations.
            </p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((role) => (
                <button
                  key={role.id}
                  onClick={() => toggleChip(role.id, selectedRoles, setSelectedRoles)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    selectedRoles.includes(role.id)
                      ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                      : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-center">
              <Sparkles className="h-5 w-5 text-adv-teal" />
              <h2 className="text-base font-semibold text-adv-white">
                Recommended Modules
              </h2>
            </div>
            <p className="text-sm text-adv-gray">
              Based on your answers, these modules are the best fit for your task.
            </p>
            {results.map((r, idx) => (
              <div
                key={r.module.id}
                className="rounded-xl border border-border bg-adv-card p-5 transition-colors hover:border-adv-teal/40"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-teal/10 text-sm font-bold text-adv-teal">
                      {idx + 1}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-adv-white">{r.module.label}</h3>
                      <span
                        className={`mt-0.5 inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${
                          colorMap[r.areaColor] || 'bg-adv-gray/20 text-adv-gray border-adv-gray/30'
                        }`}
                      >
                        {r.areaLabel}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-adv-gray">Score: {r.score}</span>
                </div>
                <p className="mb-3 text-sm text-adv-gray">{r.module.description}</p>
                <button
                  onClick={() => navigate(`/module/${r.module.id}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                >
                  Open This Module
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                setStep(1);
                setDescription('');
                setSelectedCategories([]);
                setSelectedOutputs([]);
                setSelectedRoles([]);
              }}
              className="mt-2 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Start over
            </button>
          </div>
        )}
      </div>

      {/* Navigation buttons */}
      {step <= 3 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 3 ? 'Show Recommendations' : 'Next'}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
