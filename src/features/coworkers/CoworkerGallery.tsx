import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Shield, ClipboardList, TrendingUp, FolderKanban, MessageSquare,
  Cpu, Package, Users, Plus, Clock, Tag, ChevronRight, Search,
} from 'lucide-react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import type { WorkflowStep } from '@/lib/workflow-definitions';

// ── Coworker template type ──────────────────────────────────

export interface CoworkerInputParameter {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  default?: string;
}

export interface CoworkerStepConfig {
  areaId?: string;
  moduleId?: string;
  thinking?: string;
  creativity?: string;
  promptTemplate?: string;
  outputFormat?: string;
  checkpointMessage?: string;
  checkpointContext?: string;
  inputFields?: CoworkerInputParameter[];
  dependsOn?: string[];
}

export interface CoworkerStep {
  id: string;
  label: string;
  description: string;
  index: number;
  type: 'claude' | 'checkpoint' | 'export' | 'input';
  config: CoworkerStepConfig;
}

export interface CoworkerTemplate {
  id: string;
  name: string;
  description: string;
  role_identity: string;
  icon: string;
  color: string;
  tags: string[];
  estimated_duration: string;
  execution_mode: string;
  is_template: boolean;
  required_connections: string[];
  input_parameters: CoworkerInputParameter[];
  steps: CoworkerStep[];
}

// ── Static template registry ────────────────────────────────
// Templates are loaded from config/coworkers/*.json at build/runtime.
// For the gallery, we define the manifest here; full JSON is loaded
// on demand when a user selects a template.

interface CoworkerMeta {
  id: string;
  name: string;
  description: string;
  role_identity: string;
  icon: string;
  color: string;
  tags: string[];
  estimated_duration: string;
  configFile: string;
}

const COWORKER_TEMPLATES: CoworkerMeta[] = [
  {
    id: 'coworker-fcp-investigator',
    name: 'FCP Alert Investigator',
    description: 'End-to-end transaction monitoring alert triage workflow. Investigates alerts, supports human review decisions, and generates audit-quality investigation reports.',
    role_identity: 'FCP Investigator',
    icon: 'Shield',
    color: 'adv-red',
    tags: ['fcp', 'investigations', 'aml', 'transaction-monitoring'],
    estimated_duration: '15-30 minutes',
    configFile: 'fcp-investigator',
  },
  {
    id: 'coworker-middle-manager',
    name: 'Weekly Status Reporter',
    description: 'Prepares weekly team status reports from notes and KPI data. Drafts, captures review edits, then formats the final version for distribution.',
    role_identity: 'Team Manager',
    icon: 'ClipboardList',
    color: 'adv-blue',
    tags: ['management', 'reporting', 'weekly', 'team'],
    estimated_duration: '10-20 minutes',
    configFile: 'middle-manager',
  },
  {
    id: 'coworker-sales-manager',
    name: 'Pipeline & Forecast Reviewer',
    description: 'Analyses sales pipeline health, generates competitive intelligence for key deals, and produces a forecast summary with recommendations.',
    role_identity: 'Sales Manager',
    icon: 'TrendingUp',
    color: 'adv-green',
    tags: ['sales', 'pipeline', 'forecast', 'competitive-intelligence'],
    estimated_duration: '20-35 minutes',
    configFile: 'sales-manager',
  },
  {
    id: 'coworker-project-lead',
    name: 'Daily Standup Prep',
    description: 'Prepares structured sprint standup material from notes and blockers. Reviews sprint progress, flags risks, and generates retrospective prep.',
    role_identity: 'Project Lead',
    icon: 'FolderKanban',
    color: 'adv-teal',
    tags: ['project-management', 'agile', 'standup', 'sprint'],
    estimated_duration: '10-15 minutes',
    configFile: 'project-lead',
  },
  {
    id: 'coworker-customer-support',
    name: 'Support Ticket Triage',
    description: 'Categorises and prioritises incoming support tickets, drafts response templates for common issues, and flags complex cases for human review.',
    role_identity: 'Customer Support Lead',
    icon: 'MessageSquare',
    color: 'adv-blue',
    tags: ['customer-support', 'triage', 'tickets', 'responses'],
    estimated_duration: '10-20 minutes',
    configFile: 'customer-support',
  },
  {
    id: 'coworker-tech-ops',
    name: 'Morning Systems Health Check',
    description: 'Daily health check for tech operations teams. Reviews overnight incidents, produces a platform status report, and identifies items needing immediate attention.',
    role_identity: 'Tech Ops / Platform Engineer',
    icon: 'Cpu',
    color: 'adv-teal',
    tags: ['tech-ops', 'monitoring', 'incidents', 'platform', 'devops'],
    estimated_duration: '10-15 minutes',
    configFile: 'tech-ops',
  },
  {
    id: 'coworker-ecommerce-manager',
    name: 'Product Sourcing & Planning',
    description: 'Supports product managers with competitive intelligence on competing products, evaluates potential supplier partnerships, and produces a sourcing decision memo.',
    role_identity: 'E-commerce / Product Manager',
    icon: 'Package',
    color: 'adv-gold',
    tags: ['ecommerce', 'sourcing', 'product-management', 'competitive-intelligence'],
    estimated_duration: '20-30 minutes',
    configFile: 'ecommerce-manager',
  },
  {
    id: 'coworker-hr-recruitment',
    name: 'Recruitment Pipeline Manager',
    description: 'Screens CVs against role requirements, generates tailored interview questions for shortlisted candidates, and captures structured hiring decisions.',
    role_identity: 'HR / Talent Acquisition',
    icon: 'Users',
    color: 'adv-blue',
    tags: ['hr', 'recruitment', 'cv-screening', 'interviews', 'talent'],
    estimated_duration: '20-40 minutes',
    configFile: 'hr-recruitment',
  },
];

// ── Filter tags ──────────────────────────────────────────────

const ALL_FILTER_TAGS = [
  { id: 'all', label: 'All' },
  { id: 'fcp', label: 'FCP' },
  { id: 'management', label: 'Management' },
  { id: 'sales', label: 'Sales' },
  { id: 'tech-ops', label: 'Tech' },
  { id: 'hr', label: 'HR' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'project-management', label: 'Projects' },
  { id: 'customer-support', label: 'Support' },
];

// ── Icon map ─────────────────────────────────────────────────

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Shield, ClipboardList, TrendingUp, FolderKanban, MessageSquare, Cpu, Package, Users, Bot,
};

// ── Color map ────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  'adv-red':   { bg: 'bg-adv-red/10',  text: 'text-adv-red',   border: 'border-adv-red/30',  badge: 'bg-adv-red/20 text-adv-red' },
  'adv-blue':  { bg: 'bg-adv-blue/10', text: 'text-adv-blue',  border: 'border-adv-blue/30', badge: 'bg-adv-blue/20 text-adv-blue' },
  'adv-green': { bg: 'bg-adv-green/10',text: 'text-adv-green', border: 'border-adv-green/30',badge: 'bg-adv-green/20 text-adv-green' },
  'adv-teal':  { bg: 'bg-adv-teal-dim',text: 'text-adv-teal',  border: 'border-adv-teal/30', badge: 'bg-adv-teal-dim text-adv-teal' },
  'adv-gold':  { bg: 'bg-adv-gold/10', text: 'text-adv-gold',  border: 'border-adv-gold/30', badge: 'bg-adv-gold/20 text-adv-gold' },
};

const defaultColor = { bg: 'bg-adv-card', text: 'text-adv-gray', border: 'border-border', badge: 'bg-adv-card text-adv-gray' };

// ── Coworker step definitions per template ──────────────────

const COWORKER_STEP_DEFINITIONS: Record<string, Array<{id: string; type: string; label: string; description: string; config: Record<string, unknown>}>> = {
  'fcp-investigator': [
    { id: 'step-1', type: 'input', label: 'Alert Details', description: 'Provide the alert or case details for investigation', config: {} },
    { id: 'step-2', type: 'claude', label: 'Triage Analysis + Red Flags', description: 'AI analyses the alert and identifies red flags', config: {} },
    { id: 'step-3', type: 'checkpoint', label: 'Investigator Review', description: 'Investigator reviews AI triage and confirms direction', config: {} },
    { id: 'step-4', type: 'claude', label: 'Draft SAR / Closure Memo', description: 'AI drafts the SAR or closure memo', config: {} },
    { id: 'step-5', type: 'export', label: 'Export Document', description: 'Export final document as DOCX or PDF', config: {} },
  ],
  'middle-manager': [
    { id: 'step-1', type: 'input', label: 'Updates, Blockers & Metrics', description: "Enter this week's updates, blockers, and key metrics", config: {} },
    { id: 'step-2', type: 'claude', label: 'Stakeholder Status Report', description: 'AI generates a polished status report for stakeholders', config: {} },
    { id: 'step-3', type: 'export', label: 'Export Report', description: 'Export as DOCX or share link', config: {} },
  ],
  'sales-manager': [
    { id: 'step-1', type: 'input', label: 'Pipeline / Deal Data', description: 'Provide pipeline or deal data for review', config: {} },
    { id: 'step-2', type: 'claude', label: 'Risk Analysis + Actions', description: 'AI analyses risk and recommends next actions', config: {} },
    { id: 'step-3', type: 'checkpoint', label: 'Manager Review', description: 'Manager reviews AI analysis before export', config: {} },
    { id: 'step-4', type: 'export', label: 'Export Analysis', description: 'Export final risk analysis', config: {} },
  ],
  'project-lead': [
    { id: 'step-1', type: 'input', label: 'Status, Risks & Blockers', description: 'Enter project status, risks, and blockers', config: {} },
    { id: 'step-2', type: 'claude', label: 'Status Report', description: 'AI generates project status report', config: {} },
    { id: 'step-3', type: 'claude', label: 'Risk Register Update', description: 'AI updates the risk register based on new information', config: {} },
    { id: 'step-4', type: 'checkpoint', label: 'Project Lead Review', description: 'Review AI outputs before distribution', config: {} },
    { id: 'step-5', type: 'export', label: 'Export Documents', description: 'Export status report and risk register', config: {} },
  ],
  'customer-support': [
    { id: 'step-1', type: 'input', label: 'Complaint / Query', description: 'Enter the customer complaint or query details', config: {} },
    { id: 'step-2', type: 'claude', label: 'Resolution Draft', description: 'AI drafts a professional resolution response', config: {} },
    { id: 'step-3', type: 'checkpoint', label: 'Agent Review', description: 'Support agent reviews and approves the response', config: {} },
    { id: 'step-4', type: 'export', label: 'Send / Export', description: 'Export or send the approved response', config: {} },
  ],
  'tech-ops': [
    { id: 'step-1', type: 'input', label: 'Incident Description', description: 'Describe the incident or technical issue', config: {} },
    { id: 'step-2', type: 'claude', label: 'Root Cause + Actions', description: 'AI analyses root cause and recommends remediation actions', config: {} },
    { id: 'step-3', type: 'checkpoint', label: 'Ops Approval', description: 'Operations team reviews before implementing changes', config: {} },
    { id: 'step-4', type: 'export', label: 'Export Incident Report', description: 'Export incident report and action plan', config: {} },
  ],
  'ecommerce-manager': [
    { id: 'step-1', type: 'input', label: 'Sales & Campaign Metrics', description: 'Enter recent sales data and campaign performance metrics', config: {} },
    { id: 'step-2', type: 'claude', label: 'Performance Analysis + Recommendations', description: 'AI analyses performance and recommends optimisations', config: {} },
    { id: 'step-3', type: 'export', label: 'Export Analysis', description: 'Export performance report and recommendations', config: {} },
  ],
  'hr-recruitment': [
    { id: 'step-1', type: 'input', label: 'Job Description + CV', description: 'Upload or paste the job description and candidate CV', config: {} },
    { id: 'step-2', type: 'claude', label: 'Candidate Evaluation', description: 'AI evaluates candidate fit against job requirements', config: {} },
    { id: 'step-3', type: 'checkpoint', label: 'HR Review', description: 'HR team reviews AI evaluation before proceeding', config: {} },
    { id: 'step-4', type: 'export', label: 'Export Evaluation', description: 'Export candidate evaluation report', config: {} },
  ],
};

const DEFAULT_COWORKER_STEPS = [
  { id: 'step-1', type: 'input', label: 'Provide Input', description: 'Enter your information or data', config: {} },
  { id: 'step-2', type: 'claude', label: 'AI Analysis', description: 'AI analyses and processes the input', config: {} },
  { id: 'step-3', type: 'export', label: 'Export Result', description: 'Export the AI output', config: {} },
];

// ── Component ────────────────────────────────────────────────

export default function CoworkerGallery() {
  const navigate = useNavigate();
  const [activeTag, setActiveTag] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCoworker, setSelectedCoworker] = useState<CoworkerMeta | null>(null);

  const filtered = COWORKER_TEMPLATES.filter((t) => {
    const matchesTag = activeTag === 'all' || t.tags.includes(activeTag);
    const matchesSearch =
      searchQuery.trim() === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.role_identity.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTag && matchesSearch;
  });

  const handleUseCoworker = (template: CoworkerMeta) => {
    setSelectedCoworker(template);
  };

  const handleCreateCustom = () => {
    navigate('/workflows/builder');
  };

  if (selectedCoworker) {
    return (
      <CoworkerCustomizer
        template={selectedCoworker}
        onBack={() => setSelectedCoworker(null)}
      />
    );
  }

  return (
    <div className="min-h-full bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal/20">
                <Bot className="h-5 w-5 text-adv-teal" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-adv-white">Coworker Gallery</h1>
                <p className="text-sm text-adv-gray">Pre-built AI workflow templates for common role-based tasks</p>
              </div>
            </div>
            <button
              onClick={handleCreateCustom}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
            >
              <Plus className="h-4 w-4" />
              Create Custom
            </button>
          </div>

          {/* Search */}
          <div className="mt-4 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray-med" />
              <input
                type="text"
                placeholder="Search coworkers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-card py-2 pl-9 pr-4 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>
          </div>

          {/* Tag filters */}
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_FILTER_TAGS.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setActiveTag(tag.id)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeTag === tag.id
                    ? 'bg-adv-teal text-adv-dark'
                    : 'bg-adv-card text-adv-gray hover:text-adv-off-white'
                }`}
              >
                {tag.id !== 'all' && <Tag className="h-3 w-3" />}
                {tag.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gallery grid */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bot className="h-12 w-12 text-adv-gray-med mb-3" />
            <p className="text-adv-gray">No coworkers match your search.</p>
            <button
              onClick={() => { setActiveTag('all'); setSearchQuery(''); }}
              className="mt-2 text-sm text-adv-teal hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((template) => {
              const colors = colorMap[template.color] || defaultColor;
              const Icon = iconMap[template.icon] || Bot;
              return (
                <div
                  key={template.id}
                  className={`flex flex-col rounded-xl border ${colors.border} bg-adv-card p-5 transition-shadow hover:shadow-lg`}
                >
                  {/* Card header */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bg}`}>
                      <Icon className={`h-5 w-5 ${colors.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-adv-white leading-tight">{template.name}</h3>
                      <p className={`text-xs mt-0.5 ${colors.text}`}>{template.role_identity}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-adv-gray flex-1 leading-relaxed mb-4">
                    {template.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-4">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.badge}`}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Duration + CTA */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-adv-gray-med">
                      <Clock className="h-3 w-3" />
                      {template.estimated_duration}
                    </div>
                    <button
                      onClick={() => handleUseCoworker(template)}
                      className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${colors.bg} ${colors.text} hover:opacity-80`}
                    >
                      Use this
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Info footer */}
        <div className="mt-8 rounded-lg border border-border bg-adv-card p-4 text-sm text-adv-gray">
          <strong className="text-adv-off-white">What is a Coworker?</strong> A pre-built multi-step workflow template
          designed around a specific role. Each Coworker combines AI analysis steps with human review checkpoints,
          ensuring you stay in control while ANTON handles the structured work. You can customise any template or
          build your own from scratch.
        </div>
      </div>
    </div>
  );
}

// ── CoworkerCustomizer ────────────────────────────────────────

interface CoworkerCustomizerProps {
  template: CoworkerMeta;
  onBack: () => void;
}

function CoworkerCustomizer({ template, onBack }: CoworkerCustomizerProps) {
  const navigate = useNavigate();
  const { saveWorkflow } = useWorkflowStore();
  const colors = colorMap[template.color] || defaultColor;
  const Icon = iconMap[template.icon] || Bot;

  const [workflowName, setWorkflowName] = useState(`My ${template.name}`);
  const [saved, setSaved] = useState(false);

  const templateSteps = COWORKER_STEP_DEFINITIONS[template.configFile] ?? DEFAULT_COWORKER_STEPS;

  const handleSaveAsWorkflow = () => {
    const rawSteps = COWORKER_STEP_DEFINITIONS[template.configFile] ?? DEFAULT_COWORKER_STEPS;
    const steps: WorkflowStep[] = rawSteps.map((s) => ({
      id: s.id,
      label: s.label,
      description: s.description,
      type: s.type as WorkflowStep['type'],
      config: s.config,
    }));

    saveWorkflow({
      id: `coworker-${template.configFile}-${Date.now()}`,
      label: workflowName,
      shortLabel: workflowName.length > 16 ? workflowName.slice(0, 14) + '…' : workflowName,
      icon: template.icon,
      description: template.description,
      category: 'custom',
      estimatedTime: template.estimated_duration,
      steps,
      tags: [...template.tags, 'coworker'],
      isCustom: true,
    });

    setSaved(true);
    setTimeout(() => navigate('/workflows'), 1200);
  };

  // Step type badges
  const stepTypeBadge = (type: string) => {
    switch (type) {
      case 'claude':      return { label: 'AI Step', className: 'bg-adv-teal/20 text-adv-teal border border-adv-teal/30' };
      case 'checkpoint':  return { label: 'Human Gate', className: 'bg-adv-gold/20 text-adv-gold border border-adv-gold/30' };
      case 'input':       return { label: 'Input', className: 'bg-adv-card text-adv-gray border border-adv-gray/30' };
      case 'export':      return { label: 'Export', className: 'bg-adv-blue/20 text-adv-blue border border-adv-blue/30' };
      default:            return { label: type, className: 'bg-adv-card text-adv-gray border border-adv-gray/30' };
    }
  };

  return (
    <div className="min-h-full bg-adv-dark">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={onBack}
            className="mb-3 flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <ChevronRight className="h-3 w-3 rotate-180" />
            Back to Gallery
          </button>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}>
              <Icon className={`h-5 w-5 ${colors.text}`} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-white">{template.name}</h1>
              <p className={`text-sm ${colors.text}`}>{template.role_identity}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">

        {/* Workflow name */}
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-adv-white">Name Your Workflow</h2>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark py-2 px-3 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            placeholder="My workflow name..."
          />
        </div>

        {/* Workflow steps */}
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-adv-white">Workflow Steps</h2>
          <p className="mb-4 text-xs text-adv-gray">
            This coworker runs {templateSteps.length} steps. AI steps are handled by ANTON automatically.
            Human gate steps pause for your review before continuing.
          </p>
          <div className="space-y-3">
            {templateSteps.map((step, index) => {
              const badge = stepTypeBadge(step.type);
              return (
                <div key={step.id} className="flex items-start gap-3">
                  {/* Step number */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-dark text-xs font-bold text-adv-gray-med">
                    {index + 1}
                  </div>
                  {/* Step card */}
                  <div className="flex-1 rounded-lg border border-border bg-adv-dark p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-adv-off-white">{step.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-adv-gray">{step.description}</p>
                  </div>
                  {/* Connector */}
                  {index < templateSteps.length - 1 && (
                    <div className="absolute ml-3.5 mt-7 h-3 w-px bg-border" style={{ marginLeft: '13px' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Required connections */}
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-adv-white">Connections</h2>
          <div className="flex items-center gap-2 rounded-lg bg-adv-dark p-3">
            <div className="h-2 w-2 rounded-full bg-adv-green" />
            <span className="text-sm text-adv-off-white">ANTON (Claude AI)</span>
            <span className="ml-auto text-xs text-adv-green">Configured</span>
          </div>
          <p className="mt-2 text-xs text-adv-gray-med">
            This coworker uses ANTON's built-in AI. No additional connections required.
          </p>
        </div>

        {/* Description */}
        <div className="rounded-xl border border-border bg-adv-card p-5">
          <h2 className="mb-2 text-sm font-semibold text-adv-white">About This Coworker</h2>
          <p className="text-sm text-adv-gray">{template.description}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-adv-gray-med">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {template.estimated_duration}
            </span>
            <span>{templateSteps.filter(s => s.type === 'claude').length} AI steps</span>
            <span>{templateSteps.filter(s => s.type === 'checkpoint').length} human gates</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAsWorkflow}
              disabled={saved || !workflowName.trim()}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {saved ? 'Saved! Redirecting…' : 'Save as My Workflow'}
            </button>
            <button
              onClick={onBack}
              className="rounded-lg border border-border px-5 py-2.5 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
