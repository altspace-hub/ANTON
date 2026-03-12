import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Save,
  MessageSquare, BrainCircuit, Download, GripVertical, Play, Square,
  Globe, Database, FolderOpen, FolderInput, Terminal, Mail,
  GitBranch, Shuffle, RefreshCw, Zap, Clock, Workflow, Bell, Flag,
  Info, FileInput, Repeat, Merge, FileOutput,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWorkflowStore, createBlankStep, createBlankWorkflow } from '@/stores/useWorkflowStore';
import { streamMessage } from '@/lib/api';
import type { WorkflowDefinition, WorkflowStep, WorkflowStepType } from '@/lib/workflow-definitions';
import type { ThinkingLevel, CreativityLevel, StreamEvent } from '@/lib/types';
import { MODULES, AREAS } from '@/lib/constants';
import {
  ApiCallStep, DatabaseStep, FileReadStep, FileWriteStep, ScriptStep,
  EmailSendStep, DecisionStep, TransformStep, LoopStep, ParallelStep,
  WaitStep, SubWorkflowStep, NotificationStep, CheckpointStep,
  DataImportStep, DataTransformStep, DataMergeStep, DataExportStep,
} from '@/features/workflows/StepTypes';

interface StepTypeOption {
  type: WorkflowStepType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  category: string;
  connectionRequired?: string;
}

const STEP_TYPE_OPTIONS: StepTypeOption[] = [
  // ── Core ─────────────────────────────────────────────────────
  { type: 'input', label: 'User Input', icon: MessageSquare, description: 'Collect information from the user', category: 'Core' },
  { type: 'claude', label: 'Claude Analysis', icon: BrainCircuit, description: 'AI-powered analysis step', category: 'Core' },
  { type: 'export', label: 'Export', icon: Download, description: 'Export results to document', category: 'Core' },
  // ── External connections ──────────────────────────────────────
  { type: 'api_call', label: 'API Call', icon: Globe, description: 'Call an external API endpoint', category: 'External', connectionRequired: 'API' },
  { type: 'database_query', label: 'Database Query', icon: Database, description: 'Execute a SQL query', category: 'External', connectionRequired: 'Database' },
  { type: 'file_read', label: 'Read File', icon: FolderOpen, description: 'Read files from filesystem', category: 'External', connectionRequired: 'Filesystem' },
  { type: 'file_write', label: 'Write File', icon: FolderInput, description: 'Write output to filesystem', category: 'External', connectionRequired: 'Filesystem' },
  { type: 'script', label: 'Run Script', icon: Terminal, description: 'Run an approved script', category: 'External', connectionRequired: 'Script Library' },
  { type: 'email_send', label: 'Send Email', icon: Mail, description: 'Send email notification', category: 'External' },
  { type: 'notification', label: 'Notification', icon: Bell, description: 'Send Slack/Teams webhook', category: 'External' },
  // ── Flow control ──────────────────────────────────────────────
  { type: 'decision_gate', label: 'Decision Gate', icon: GitBranch, description: 'Conditional branching', category: 'Flow' },
  { type: 'transform', label: 'Transform', icon: Shuffle, description: 'Map/transform data between steps', category: 'Flow' },
  { type: 'loop', label: 'Loop', icon: RefreshCw, description: 'Execute steps for each item', category: 'Flow' },
  { type: 'parallel', label: 'Parallel', icon: Zap, description: 'Execute steps simultaneously', category: 'Flow' },
  { type: 'wait', label: 'Wait', icon: Clock, description: 'Pause for duration or condition', category: 'Flow' },
  { type: 'sub_workflow', label: 'Sub-workflow', icon: Workflow, description: 'Execute another workflow', category: 'Flow' },
  { type: 'checkpoint', label: 'Checkpoint', icon: Flag, description: 'Human review pause point', category: 'Flow' },
  // ── Data Operations ───────────────────────────────────────────
  { type: 'data_import', label: 'Import Data', icon: FileInput, description: 'Import data from files or databases', category: 'Data' },
  { type: 'data_transform', label: 'Transform Data', icon: Repeat, description: 'Transform columns and rows', category: 'Data' },
  { type: 'data_merge', label: 'Merge Data', icon: Merge, description: 'Join or union datasets', category: 'Data' },
  { type: 'data_export', label: 'Export Data', icon: FileOutput, description: 'Export data to files or databases', category: 'Data' },
];

const STEP_TYPE_CATEGORIES = ['Core', 'External', 'Data', 'Flow'];

const CATEGORY_OPTIONS = [
  { value: 'monitoring', label: 'Monitoring & Scanning' },
  { value: 'assessment', label: 'Assessment & Analysis' },
  { value: 'advisory', label: 'Advisory & Alerts' },
  { value: 'reporting', label: 'Reporting' },
  { value: 'comparison', label: 'Comparison & Benchmarking' },
  { value: 'custom', label: 'Custom' },
];

const THINKING_OPTIONS = ['quick', 'think', 'think_hard', 'investigate'];
const CREATIVITY_OPTIONS = ['strict', 'balanced', 'creative'];
const EXPORT_FORMAT_OPTIONS = ['docx', 'xlsx', 'pdf', 'md'];
const INPUT_FIELD_TYPES = ['text', 'textarea', 'select', 'file', 'url'];

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

export default function WorkflowBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { saveWorkflow, getWorkflow, customWorkflows } = useWorkflowStore();

  const [workflow, setWorkflow] = useState<WorkflowDefinition>(createBlankWorkflow());
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showStepTypePicker, setShowStepTypePicker] = useState(false);

  // Connections + Knowledge Library entries (for step configuration)
  const [connections, setConnections] = useState<{ id: string; label: string; type: string }[]>([]);
  const [approvedScripts, setApprovedScripts] = useState<{ id: string; label: string; parameters?: { name: string; description: string }[] }[]>([]);

  // Run All state
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [runningStepIdx, setRunningStepIdx] = useState<number | null>(null);
  const [stepOutputs, setStepOutputs] = useState<Record<string, string>>({});
  const [streamingStepId, setStreamingStepId] = useState<string | null>(null);
  const [streamingStepText, setStreamingStepText] = useState('');
  const abortControllerRef = { current: null as AbortController | null };

  // Load existing workflow if editing
  useEffect(() => {
    if (id) {
      const existing = getWorkflow(id);
      if (existing) {
        setWorkflow(existing);
      }
    }
  }, [id]);

  // Fetch connections + knowledge library entries for step dropdowns
  useEffect(() => {
    const load = async () => {
      try {
        const [connRes, klRes, scriptRes] = await Promise.all([
          fetch('/api/connections').then(r => r.ok ? r.json() : []),
          fetch('/api/knowledge-library').then(r => r.ok ? r.json() : []),
          fetch('/api/connections/scripts').then(r => r.ok ? r.json() : []),
        ]);
        const conns = (connRes as { id: string; display_name: string; type: string; status: string }[])
          .filter(c => c.status === 'active')
          .map(c => ({ id: c.id, label: c.display_name, type: c.type }));
        const klEntries = (klRes as { id: string; label: string; path: string; file_count?: number }[])
          .map(e => ({
            id: `kl:${e.id}`,
            label: `📚 ${e.label} (${e.file_count ?? 0} files)`,
            type: 'filesystem',
          }));
        setConnections([...conns, ...klEntries]);
        const scripts = (scriptRes as { id: string; display_name: string; parameters?: { name: string; description: string }[] }[])
          .map(s => ({ id: s.id, label: s.display_name, parameters: s.parameters }));
        setApprovedScripts(scripts);
      } catch {
        // Silently degrade — steps just show empty dropdowns
      }
    };
    load();
  }, []);

  const updateWorkflow = (updates: Partial<WorkflowDefinition>) => {
    setWorkflow((prev) => ({ ...prev, ...updates }));
    setSaved(false);
  };

  const addStep = (type: WorkflowStepType) => {
    const step = createBlankStep(type);
    updateWorkflow({ steps: [...workflow.steps, step] });
    setExpandedStep(step.id);
    setShowStepTypePicker(false);
  };

  const removeStep = (stepId: string) => {
    updateWorkflow({ steps: workflow.steps.filter((s) => s.id !== stepId) });
    if (expandedStep === stepId) setExpandedStep(null);
  };

  const moveStep = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= workflow.steps.length) return;
    const steps = [...workflow.steps];
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    updateWorkflow({ steps });
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    updateWorkflow({
      steps: workflow.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    });
  };

  const updateStepConfig = (stepId: string, configUpdates: Partial<WorkflowStep['config']>) => {
    updateWorkflow({
      steps: workflow.steps.map((s) =>
        s.id === stepId ? { ...s, config: { ...s.config, ...configUpdates } } : s
      ),
    });
  };

  const handleSave = () => {
    const toSave: WorkflowDefinition = {
      ...workflow,
      isCustom: true,
      tags: workflow.tags.includes('custom') ? workflow.tags : [...workflow.tags, 'custom'],
    };
    saveWorkflow(toSave);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const claudeSteps = workflow.steps.filter((s) => s.type === 'claude');

  const handleRunAll = async () => {
    if (isRunningAll) return;

    setIsRunningAll(true);
    setStepOutputs({});
    setStreamingStepText('');

    let previousOutput = '';
    const allOutputs: Record<string, string> = {};

    for (let idx = 0; idx < workflow.steps.length; idx++) {
      const step = workflow.steps[idx];
      if (step.type !== 'claude') continue;

      setRunningStepIdx(idx);
      setStreamingStepId(step.id);
      setStreamingStepText('');

      const systemPrompt = step.description
        ? `You are ANTON, performing step ${idx + 1} of a workflow: ${step.description}. Be thorough and professional.`
        : `You are ANTON, performing step ${idx + 1} of a multi-step workflow analysis. Be thorough and professional.`;

      const userMessage = previousOutput
        ? `${step.config.promptTemplate || step.description}\n\n[PREVIOUS STEP OUTPUT]\n${previousOutput}`
        : (step.config.promptTemplate || step.description || `Perform this analysis step: ${step.label}`);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let stepText = '';

      try {
        const stream = streamMessage(
          {
            model: 'claude-opus-4-6',
            thinking: (step.config.thinking || 'think_hard') as ThinkingLevel,
            creativity: (step.config.creativity || 'balanced') as CreativityLevel,
            systemPrompt,
            userMessage,
            history: [],
            outputFormats: [],
            knowledgeSources: EMPTY_KS,
          },
          controller.signal
        );

        for await (const event of stream as AsyncGenerator<StreamEvent>) {
          if (event.type === 'text_delta') {
            stepText += event.content;
            setStreamingStepText(stepText);
          }
          if (event.type === 'error' || event.type === 'stream_end') break;
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error(`Step ${idx + 1} error:`, err);
          stepText = `Error during step ${idx + 1}: ${(err as Error).message}`;
        } else {
          // Aborted — stop all
          break;
        }
      }

      allOutputs[step.id] = stepText;
      setStepOutputs({ ...allOutputs });
      previousOutput = stepText;
    }

    setStreamingStepId(null);
    setStreamingStepText('');
    setRunningStepIdx(null);
    setIsRunningAll(false);
  };

  const handleStopAll = () => {
    abortControllerRef.current?.abort();
    setStreamingStepId(null);
    setStreamingStepText('');
    setRunningStepIdx(null);
    setIsRunningAll(false);
  };

  const handleDownloadAll = () => {
    const parts: string[] = [`# Workflow: ${workflow.label}\n\nGenerated by Anton — openEXPERT\n`];
    workflow.steps.forEach((step, idx) => {
      if (step.type === 'claude' && stepOutputs[step.id]) {
        parts.push(`\n---\n\n## Step ${idx + 1}: ${step.label}\n\n${stepOutputs[step.id]}`);
      }
    });
    const content = parts.join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.label.replace(/\s+/g, '-').toLowerCase()}-all-outputs.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasOutputs = Object.keys(stepOutputs).length > 0;
  const showRunAll = claudeSteps.length >= 2;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflows')}
            className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back to workflows
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!workflow.label.trim() || workflow.steps.length === 0}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            saved
              ? 'bg-adv-green text-white'
              : 'bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          <Save className="h-4 w-4" />
          {saved ? 'Saved' : 'Save Workflow'}
        </button>
      </div>

      <h1 className="mb-6 text-xl font-bold text-adv-white">
        {id ? 'Edit Workflow' : 'Create Custom Workflow'}
      </h1>

      {/* Metadata */}
      <div className="mb-6 space-y-4 rounded-xl border border-border bg-adv-card p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-adv-off-white">Workflow name</label>
            <input
              type="text"
              value={workflow.label}
              onChange={(e) => updateWorkflow({ label: e.target.value, shortLabel: e.target.value.slice(0, 20) })}
              placeholder="e.g., Client Onboarding Review"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-adv-off-white">Category</label>
            <select
              value={workflow.category}
              onChange={(e) => updateWorkflow({ category: e.target.value as WorkflowDefinition['category'] })}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-off-white">Description</label>
          <textarea
            value={workflow.description}
            onChange={(e) => updateWorkflow({ description: e.target.value })}
            placeholder="Describe what this workflow does..."
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            rows={2}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-adv-off-white">Estimated time</label>
          <input
            type="text"
            value={workflow.estimatedTime}
            onChange={(e) => updateWorkflow({ estimatedTime: e.target.value })}
            placeholder="e.g., 5-10 min"
            className="w-48 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>
      </div>

      {/* Steps header + Run All button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-adv-white">Steps ({workflow.steps.length})</h2>
        <div className="flex items-center gap-2">
          {showRunAll && (
            <>
              {hasOutputs && !isRunningAll && (
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download All Outputs
                </button>
              )}
              {isRunningAll ? (
                <button
                  onClick={handleStopAll}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleRunAll}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark"
                >
                  <Play className="h-3.5 w-3.5" />
                  Run All Steps
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      {isRunningAll && runningStepIdx !== null && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-adv-teal/20 bg-adv-teal-soft px-4 py-2.5">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-adv-teal" />
          <span className="text-xs text-adv-teal">
            Running step {runningStepIdx + 1} of {workflow.steps.length}...
          </span>
        </div>
      )}

      <div className="space-y-3">
        {workflow.steps.map((step, idx) => {
          const isExpanded = expandedStep === step.id;
          const stepTypeDef = STEP_TYPE_OPTIONS.find((t) => t.type === step.type);
          const StepIcon = stepTypeDef?.icon || MessageSquare;
          const isCurrentlyStreaming = streamingStepId === step.id;
          const stepOutput = stepOutputs[step.id];
          const displayOutput = isCurrentlyStreaming ? streamingStepText : (stepOutput || '');

          return (
            <div
              key={step.id}
              className={`rounded-xl border bg-adv-card overflow-hidden transition-colors ${
                isCurrentlyStreaming ? 'border-adv-teal/40' : 'border-border'
              }`}
            >
              {/* Step header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-adv-dark-2/50 transition-colors"
                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
              >
                <GripVertical className="h-4 w-4 text-adv-gray shrink-0" />
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                  isCurrentlyStreaming ? 'bg-adv-teal/20 text-adv-teal animate-pulse' : 'bg-adv-teal/10 text-adv-teal'
                }`}>
                  <StepIcon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-adv-gray">Step {idx + 1}</span>
                    <span className="text-xs font-medium text-adv-off-white truncate">{step.label}</span>
                    <span className="rounded bg-adv-dark px-1.5 py-0.5 text-xs text-adv-gray">{step.type}</span>
                    {/* Connection required badge */}
                    {stepTypeDef?.connectionRequired && (
                      <span className="rounded border border-adv-blue/30 bg-adv-blue/10 px-1.5 py-0.5 text-xs text-adv-blue">
                        {stepTypeDef.connectionRequired}
                      </span>
                    )}
                    {/* Area badge — shown when a module is linked to this step */}
                    {step.config.areaId && (
                      <span className="rounded bg-adv-teal/10 px-1.5 py-0.5 text-xs font-medium text-adv-teal border border-adv-teal/20">
                        [{AREAS.find((a) => a.id === step.config.areaId)?.shortLabel ?? step.config.areaId}]
                        {step.config.moduleId && ` ${MODULES.find((m) => m.id === step.config.moduleId)?.shortLabel ?? step.config.moduleId}`}
                      </span>
                    )}
                    {isCurrentlyStreaming && (
                      <span className="text-xs text-adv-teal">running...</span>
                    )}
                    {stepOutput && !isCurrentlyStreaming && (
                      <span className="rounded bg-adv-green/10 px-1.5 py-0.5 text-xs text-adv-green">done</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }}
                    disabled={idx === 0}
                    className="p-1 text-adv-gray hover:text-adv-off-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }}
                    disabled={idx === workflow.steps.length - 1}
                    className="p-1 text-adv-gray hover:text-adv-off-white disabled:opacity-30 transition-colors"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStep(step.id); }}
                    className="p-1 text-adv-gray hover:text-adv-red transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Inline streaming output for claude steps */}
              {step.type === 'claude' && displayOutput && (
                <div className="border-t border-border/50 bg-adv-dark/40 px-4 py-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${isCurrentlyStreaming ? 'animate-pulse bg-adv-teal' : 'bg-adv-green'}`} />
                    <span className="text-xs font-medium text-adv-gray">
                      {isCurrentlyStreaming ? 'Anton is working...' : 'Output'}
                    </span>
                  </div>
                  <div className="prose prose-invert prose-xs max-w-none text-adv-off-white text-xs max-h-48 overflow-y-auto">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayOutput}</ReactMarkdown>
                    {isCurrentlyStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
                  </div>
                </div>
              )}

              {/* Step config (expanded) */}
              {isExpanded && (
                <div className="border-t border-border px-4 py-4 space-y-3">
                  {/* Step Type selector */}
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-adv-gray">Step Type</label>
                    <select
                      value={step.type}
                      onChange={(e) => {
                        const newType = e.target.value as WorkflowStepType;
                        const blank = createBlankStep(newType);
                        updateWorkflow({
                          steps: workflow.steps.map((s) =>
                            s.id === step.id ? { ...blank, id: step.id, label: step.label, description: step.description } : s
                          ),
                        });
                      }}
                      className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    >
                      {STEP_TYPE_CATEGORIES.map((cat) => (
                        <optgroup key={cat} label={`── ${cat} ──`}>
                          {STEP_TYPE_OPTIONS.filter((t) => t.category === cat).map((t) => (
                            <option key={t.type} value={t.type}>{t.label}{t.connectionRequired ? ` (needs ${t.connectionRequired})` : ''}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Available context variables info */}
                  {idx > 0 && (
                    <div className="rounded-lg border border-adv-teal/20 bg-adv-teal-soft px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Info className="h-3 w-3 text-adv-teal" />
                        <span className="text-xs font-medium text-adv-teal">Available context variables</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-adv-dark px-1.5 py-0.5 font-mono text-xs text-adv-gray">{'{{input.*}}'}</span>
                        {workflow.steps.slice(0, idx).map((prevStep, prevIdx) => (
                          <span key={prevStep.id} className="rounded bg-adv-dark px-1.5 py-0.5 font-mono text-xs text-adv-teal">
                            {`{{step_${prevIdx + 1}.*}}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Common fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-adv-gray">Label</label>
                      <input
                        type="text"
                        value={step.label}
                        onChange={(e) => updateStep(step.id, { label: e.target.value })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-adv-gray">Description</label>
                      <input
                        type="text"
                        value={step.description}
                        onChange={(e) => updateStep(step.id, { description: e.target.value })}
                        className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                      />
                    </div>
                  </div>

                  {/* Claude step config */}
                  {step.type === 'claude' && (
                    <div className="space-y-3">
                      {/* Area + Module selector */}
                      <div className="rounded-lg border border-border bg-adv-dark/50 p-3 space-y-2">
                        <label className="block text-[11px] font-medium text-adv-off-white">
                          Link to Module (optional)
                          <span className="ml-1.5 text-adv-gray font-normal">— use any module from any area to inherit its system prompt</span>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="mb-1 block text-xs text-adv-gray">Area</label>
                            <select
                              value={step.config.areaId || ''}
                              onChange={(e) => {
                                const areaId = e.target.value || undefined;
                                updateStepConfig(step.id, { areaId, moduleId: undefined });
                              }}
                              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                            >
                              <option value="">— All areas —</option>
                              {AREAS.map((area) => (
                                <option key={area.id} value={area.id}>{area.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-adv-gray">Module</label>
                            <select
                              value={step.config.moduleId || ''}
                              onChange={(e) => {
                                const moduleId = e.target.value || undefined;
                                // Auto-set areaId based on selected module
                                const foundArea = moduleId
                                  ? AREAS.find((a) => (a.moduleIds as readonly string[]).includes(moduleId))
                                  : undefined;
                                updateStepConfig(step.id, {
                                  moduleId,
                                  areaId: foundArea?.id ?? step.config.areaId,
                                });
                              }}
                              className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                            >
                              <option value="">— No module —</option>
                              {/* If an area is selected, show only that area's modules; otherwise show all */}
                              {(step.config.areaId
                                ? AREAS.find((a) => a.id === step.config.areaId)?.moduleIds ?? []
                                : AREAS.flatMap((a) => a.moduleIds)
                              ).map((moduleId) => {
                                const mod = MODULES.find((m) => m.id === moduleId);
                                if (!mod) return null;
                                const area = AREAS.find((a) => (a.moduleIds as readonly string[]).includes(moduleId));
                                return (
                                  <option key={moduleId} value={moduleId}>
                                    {step.config.areaId ? mod.shortLabel : `[${area?.shortLabel ?? '?'}] ${mod.shortLabel}`}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                        {step.config.moduleId && (
                          <p className="text-xs text-adv-gray">
                            {MODULES.find((m) => m.id === step.config.moduleId)?.description}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-adv-gray">Thinking level</label>
                          <select
                            value={step.config.thinking || 'think_hard'}
                            onChange={(e) => updateStepConfig(step.id, { thinking: e.target.value })}
                            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                          >
                            {THINKING_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-adv-gray">Creativity</label>
                          <select
                            value={step.config.creativity || 'balanced'}
                            onChange={(e) => updateStepConfig(step.id, { creativity: e.target.value })}
                            className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                          >
                            {CREATIVITY_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-adv-gray">
                          Prompt template
                          <span className="ml-1 text-adv-gray">Use {'{{fieldId}}'} to reference input values</span>
                        </label>
                        <textarea
                          value={step.config.promptTemplate || ''}
                          onChange={(e) => updateStepConfig(step.id, { promptTemplate: e.target.value })}
                          placeholder="Write the prompt for Claude..."
                          className="w-full rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
                          rows={6}
                        />
                      </div>
                    </div>
                  )}

                  {/* Input step config */}
                  {step.type === 'input' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-adv-gray">Input fields</label>
                        <button
                          onClick={() => {
                            const fields = step.config.inputFields || [];
                            updateStepConfig(step.id, {
                              inputFields: [
                                ...fields,
                                {
                                  id: `field${fields.length + 1}`,
                                  label: `Field ${fields.length + 1}`,
                                  type: 'text' as const,
                                  required: false,
                                  placeholder: '',
                                },
                              ],
                            });
                          }}
                          className="text-xs text-adv-teal hover:text-adv-teal-dark transition-colors"
                        >
                          + Add field
                        </button>
                      </div>
                      {(step.config.inputFields || []).map((field, fIdx) => (
                        <div key={field.id} className="flex items-start gap-2 rounded-lg border border-border bg-adv-dark p-2">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={field.id}
                              onChange={(e) => {
                                const fields = [...(step.config.inputFields || [])];
                                fields[fIdx] = { ...fields[fIdx], id: e.target.value };
                                updateStepConfig(step.id, { inputFields: fields });
                              }}
                              placeholder="Field ID"
                              className="rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
                            />
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => {
                                const fields = [...(step.config.inputFields || [])];
                                fields[fIdx] = { ...fields[fIdx], label: e.target.value };
                                updateStepConfig(step.id, { inputFields: fields });
                              }}
                              placeholder="Label"
                              className="rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => {
                                const fields = [...(step.config.inputFields || [])];
                                fields[fIdx] = { ...fields[fIdx], type: e.target.value as 'text' | 'textarea' | 'select' | 'file' | 'url' };
                                updateStepConfig(step.id, { inputFields: fields });
                              }}
                              className="rounded border border-border bg-adv-dark-2 px-2 py-1 text-[11px] text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                            >
                              {INPUT_FIELD_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => {
                              const fields = (step.config.inputFields || []).filter((_, i) => i !== fIdx);
                              updateStepConfig(step.id, { inputFields: fields });
                            }}
                            className="mt-1 text-adv-gray hover:text-adv-red transition-colors"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Export step config */}
                  {step.type === 'export' && (
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-adv-gray">Export format</label>
                      <select
                        value={step.config.exportFormat || 'docx'}
                        onChange={(e) => updateStepConfig(step.id, { exportFormat: e.target.value })}
                        className="w-48 rounded-lg border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                      >
                        {EXPORT_FORMAT_OPTIONS.map((f) => (
                          <option key={f} value={f}>.{f}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* ── New Step Type Components ────────────────────────────── */}

                  {step.type === 'api_call' && (
                    <ApiCallStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                    />
                  )}

                  {step.type === 'database_query' && (
                    <DatabaseStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                    />
                  )}

                  {step.type === 'file_read' && (
                    <FileReadStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                    />
                  )}

                  {step.type === 'file_write' && (
                    <FileWriteStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                      availableOutputs={workflow.steps.slice(0, idx).map((s, i) => ({
                        stepId: s.id,
                        label: `Step ${i + 1}: ${s.label}`,
                        variable: s.config.outputVariable,
                      }))}
                    />
                  )}

                  {step.type === 'script' && (
                    <ScriptStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                      scripts={approvedScripts}
                    />
                  )}

                  {step.type === 'email_send' && (
                    <EmailSendStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'decision_gate' && (
                    <DecisionStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      allSteps={workflow.steps.map((s) => ({ id: s.id, label: s.label }))}
                      currentStepIndex={idx}
                    />
                  )}

                  {step.type === 'transform' && (
                    <TransformStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'loop' && (
                    <LoopStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'parallel' && (
                    <ParallelStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'wait' && (
                    <WaitStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'sub_workflow' && (
                    <SubWorkflowStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      workflows={customWorkflows.map((w) => ({ id: w.id, label: w.label }))}
                    />
                  )}

                  {step.type === 'notification' && (
                    <NotificationStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                    />
                  )}

                  {step.type === 'checkpoint' && (
                    <CheckpointStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      availableContextFields={[
                        'input',
                        ...workflow.steps.slice(0, idx).map((_, i) => `step_${i + 1}`),
                      ]}
                    />
                  )}

                  {step.type === 'data_import' && (
                    <DataImportStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                    />
                  )}

                  {step.type === 'data_transform' && (
                    <DataTransformStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'data_merge' && (
                    <DataMergeStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                    />
                  )}

                  {step.type === 'data_export' && (
                    <DataExportStep
                      step={step}
                      onUpdate={(updates) => updateStepConfig(step.id, updates)}
                      connections={connections}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add step — expandable picker */}
      <div className="mt-4">
        {!showStepTypePicker ? (
          <button
            onClick={() => setShowStepTypePicker(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-xs text-adv-gray hover:border-adv-teal/30 hover:text-adv-teal transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Step
          </button>
        ) : (
          <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-adv-off-white">Choose Step Type</h3>
              <button onClick={() => setShowStepTypePicker(false)} className="text-xs text-adv-gray hover:text-adv-off-white">
                Cancel
              </button>
            </div>
            <div className="space-y-4">
              {STEP_TYPE_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">{cat}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                    {STEP_TYPE_OPTIONS.filter((t) => t.category === cat).map(({ type, label, icon: Icon, description, connectionRequired }) => (
                      <button
                        key={type}
                        onClick={() => addStep(type)}
                        className="flex flex-col items-start gap-1 rounded-lg border border-border bg-adv-dark p-2.5 text-left hover:border-adv-teal/30 hover:bg-adv-teal-soft transition-colors group"
                        title={description}
                      >
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-adv-teal" />
                          <span className="text-[11px] font-medium text-adv-off-white group-hover:text-adv-white">{label}</span>
                        </div>
                        {connectionRequired && (
                          <span className="text-xs text-adv-blue">needs {connectionRequired}</span>
                        )}
                        <span className="text-xs text-adv-gray leading-tight">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
