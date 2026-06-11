/**
 * AntonTaskAgentPage.tsx
 *
 * ANTON as a coworker — conversational task intake, approach proposal, and execution tracking.
 * Users describe a task; ANTON proposes 2-3 concrete approaches from its self-knowledge DB;
 * human picks one; ANTON executes or guides through execution.
 *
 * Sources: manual chat, Jira webhook, Slack /anton command, standup.
 */

import { useState, useEffect, useRef, useCallback, Component } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Bot, Plus, Send, Loader2, CheckCircle2, Clock, AlertCircle,
  ChevronRight, LayoutList, Zap, Target, Layers, ArrowRight,
  Trash2, Tag, Calendar, ExternalLink, RefreshCw, X, ListTodo,
  ChevronDown, Play, Copy, ChevronsRight, Paperclip, BookOpen,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';
import { useExport } from '@/hooks/useExport';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  source: string;
  source_ref?: string;
  priority: string;
  tags: string[];
  due_date?: string;
  created_at: string;
  updated_at: string;
  chosen_approach_id?: string;
  completed_at?: string;
}

interface ExecutionStep {
  step: number;
  name: string;
  capability_id?: string;
  description?: string;
}

interface ExecutionResult {
  step: number;
  name: string;
  output: string;
  at: string;
  quality_score?: number | null;
  retry_count?: number;
  thinking_level?: string;
  thinking?: string;
  description?: string;
}

/** Wave 5.1 — compact status of the mission executing this task. */
interface LinkedMissionSummary {
  id: string;
  status: string;
  title: string;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  current_task_title: string | null;
  awaiting_human: boolean;
  progress_pct: number;
}

interface TaskDetail extends Task {
  conversation: ConversationMessage[];
  proposals: Proposal[];
  clarifying_questions: ClarifyingQuestion[];
  clarifying_answers: string[];
  execution_run_ids: string[];
  execution_summary?: string;
  intake_answers: Record<string, string>;
  execution_results: ExecutionResult[];
  current_step: number;
  intake_ready: number;
  task_files: Array<{ id: string; name: string; size: number; uploaded_at: string }>;
  active_knowledge_packs: string[];
  execution_steps: ExecutionStep[];
  linked_mission_id?: string | null;
  linked_mission?: LinkedMissionSummary | null;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface Proposal {
  approach_id: string;
  name: string;
  summary: string;
  rationale: string;
  effort: 'quick' | 'medium' | 'deep';
  outcome: string;
}

interface ClarifyingQuestion {
  id: string;
  question: string;
  required: boolean;
}

interface Capability {
  id: string;
  capability_type: string;
  name: string;
  description: string;
  area: string;
  use_cases: string;
  effort_estimate: string;
  route?: string;
}

interface Stats {
  total: number;
  open: number;
  byStatus: Array<{ status: string; count: number }>;
  recent: Task[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  intake:              { label: 'Intake',        color: 'text-adv-gray bg-adv-dark-2 border-adv-gray/30', icon: <Clock className="h-3 w-3" /> },
  proposing:           { label: 'Proposing',     color: 'text-adv-blue bg-adv-blue/10 border-adv-blue/30', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  awaiting_selection:  { label: 'Pick Approach', color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30', icon: <Target className="h-3 w-3" /> },
  clarifying:          { label: 'Clarifying',    color: 'text-adv-gold bg-adv-gold/10 border-adv-gold/30', icon: <AlertCircle className="h-3 w-3" /> },
  executing:           { label: 'Executing',     color: 'text-adv-teal bg-adv-teal-dim border-adv-teal/30', icon: <Zap className="h-3 w-3" /> },
  completed:           { label: 'Completed',     color: 'text-adv-green bg-adv-green/10 border-adv-green/30', icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled:           { label: 'Cancelled',     color: 'text-adv-gray bg-adv-dark-2 border-adv-gray-med/30', icon: <X className="h-3 w-3" /> },
  failed:              { label: 'Failed',        color: 'text-adv-red bg-adv-red/10 border-adv-red/30', icon: <AlertCircle className="h-3 w-3" /> },
};

const EFFORT_CONFIG: Record<string, { label: string; color: string }> = {
  quick:  { label: 'Quick',  color: 'text-adv-green' },
  medium: { label: 'Medium', color: 'text-adv-gold' },
  deep:   { label: 'Deep',   color: 'text-adv-red' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-adv-gray', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Strip XML-like tags used by ANTON's structured outputs */
function stripStructuredBlocks(text: string): string {
  return text
    .replace(/<approaches>[\s\S]*?<\/approaches>/g, '')
    .replace(/<clarifying>[\s\S]*?<\/clarifying>/g, '')
    .replace(/<execution>[\s\S]*?<\/execution>/g, '')
    .replace(/<intake_complete>[\s\S]*?<\/intake_complete>/g, '')
    .trim();
}

const STRUCTURED_TAGS = ['<clarifying>', '<approaches>', '<execution>', '<intake_complete>'];

/** Extract plain text portion of ANTON's response */
function getDisplayText(content: string): string {
  const stripped = stripStructuredBlocks(content);
  // If the response was ONLY structured tags, don't fall back to showing raw XML
  if (!stripped && STRUCTURED_TAGS.some((tag) => content.includes(tag))) {
    return '';
  }
  return stripped || content;
}

// ─── Conversation Bubble ──────────────────────────────────────────────────────

function ConversationBubble({ msg }: { msg: ConversationMessage }) {
  const isUser = msg.role === 'user';
  const displayText = isUser ? msg.content : getDisplayText(msg.content);

  // Don't render empty bubbles (e.g. assistant responses that were only structured tags)
  if (!isUser && !displayText) return null;

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-full text-sm font-semibold ${
        isUser ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card border border-adv-teal/30 text-adv-teal'
      }`}>
        {isUser ? 'U' : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-adv-teal text-adv-dark rounded-tr-none'
          : 'bg-adv-card border border-border text-adv-off-white rounded-tl-none'
      }`}>
        <div className="whitespace-pre-wrap">{displayText}</div>
      </div>
    </div>
  );
}

// ─── Proposal Cards ────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  index,
  onSelect,
  selected,
}: {
  proposal: Proposal;
  index: number;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  const effortCfg = EFFORT_CONFIG[proposal.effort] ?? EFFORT_CONFIG.medium;
  return (
    <button
      onClick={() => onSelect(proposal.approach_id)}
      className={`w-full text-left rounded-xl border p-4 transition-all hover:border-adv-teal/50 hover:bg-adv-teal-soft ${
        selected
          ? 'border-adv-teal bg-adv-teal-soft shadow-lg shadow-adv-teal/10'
          : 'border-border bg-adv-card'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            selected ? 'bg-adv-teal text-adv-dark' : 'bg-adv-dark-2 text-adv-gray'
          }`}>
            {index + 1}
          </span>
          <span className="text-sm font-semibold text-adv-white">{proposal.name}</span>
        </div>
        <span className={`shrink-0 text-xs font-medium ${effortCfg.color}`}>
          {effortCfg.label}
        </span>
      </div>

      <p className="mt-2 text-xs text-adv-teal">{proposal.summary}</p>
      <p className="mt-1.5 text-xs text-adv-gray">{proposal.rationale}</p>

      {proposal.outcome && (
        <div className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-adv-dark-2 px-3 py-2">
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-adv-green" />
          <p className="text-xs text-adv-off-white">{proposal.outcome}</p>
        </div>
      )}

      {selected && (
        <div className="mt-2 flex items-center justify-end gap-1 text-xs text-adv-teal">
          <span>Confirm this approach</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      )}
    </button>
  );
}

// ─── Execution Result Panel ───────────────────────────────────────────────────

function StepResultCard({
  result,
  onExport,
  isExporting,
  defaultExpanded = false,
}: {
  result: ExecutionResult;
  onExport: (format: string, content: string, filename: string) => void;
  isExporting: boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'output' | 'thinking'>('output');

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  const hasThinking = !!result.thinking && result.thinking.length > 0;
  const qualityColor = result.quality_score != null
    ? result.quality_score >= 8.5 ? 'text-adv-green' : result.quality_score >= 7 ? 'text-adv-gold' : 'text-adv-red'
    : '';
  const thinkingBadge = result.thinking_level && result.thinking_level !== 'standard'
    ? result.thinking_level === 'investigate' ? 'Deep' : 'Extended'
    : null;
  const stepFilename = `step-${result.step + 1}-${result.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;

  return (
    <div className="border-b border-border">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-3 bg-adv-teal-soft px-5 py-3 text-left hover:bg-adv-teal-soft/80 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="h-4 w-4 text-adv-green shrink-0" />
          <span className="text-sm font-semibold text-adv-white truncate">
            Step {result.step + 1}: {result.name}
          </span>
          {result.quality_score != null && (
            <span className={`ml-1 rounded-full bg-adv-dark/40 px-2 py-0.5 text-[10px] font-bold ${qualityColor}`}>
              {result.quality_score.toFixed(1)}/10
            </span>
          )}
          {thinkingBadge && (
            <span className="rounded-full bg-adv-blue/20 px-2 py-0.5 text-[10px] font-medium text-adv-blue">
              {thinkingBadge} reasoning
            </span>
          )}
          {result.retry_count != null && result.retry_count > 0 && (
            <span className="rounded-full bg-adv-gold/20 px-2 py-0.5 text-[10px] font-medium text-adv-gold">
              {result.retry_count} {result.retry_count === 1 ? 'retry' : 'retries'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-adv-gray">
            {new Date(result.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <ChevronDown className={`h-4 w-4 text-adv-gray transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Step description / purpose note */}
      {expanded && result.description && (
        <div className="bg-adv-card/50 border-b border-border/50 px-5 py-2">
          <p className="text-xs text-adv-gray italic">
            <span className="font-medium text-adv-off-white">Purpose:</span> {result.description}
          </p>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div>
          {/* Tab bar + action buttons */}
          <div className="flex items-center justify-between border-b border-border/50 bg-adv-dark-2 px-5">
            <div className="flex">
              <button
                onClick={() => setActiveTab('output')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === 'output'
                    ? 'border-adv-teal text-adv-teal'
                    : 'border-transparent text-adv-gray hover:text-adv-off-white'
                }`}
              >
                Output
              </button>
              {hasThinking && (
                <button
                  onClick={() => setActiveTab('thinking')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'thinking'
                      ? 'border-adv-blue text-adv-blue'
                      : 'border-transparent text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  Reasoning
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 py-1">
              <button
                onClick={() => copyToClipboard(activeTab === 'thinking' && result.thinking ? result.thinking : result.output)}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="h-3 w-3" />
              </button>
              {['md', 'docx', 'pdf'].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => onExport(fmt, result.output, stepFilename)}
                  disabled={isExporting}
                  className="rounded px-2 py-1 text-[10px] font-semibold uppercase text-adv-gray hover:text-adv-teal hover:bg-adv-card transition-colors disabled:opacity-40"
                  title={`Download as .${fmt}`}
                >
                  .{fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Content area */}
          <div className="max-h-[500px] overflow-y-auto p-5">
            {activeTab === 'output' ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-adv-off-white">
                {result.output}
              </pre>
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-adv-gray">
                {result.thinking}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExecutionResultPanel({
  results,
  streamingStepName,
  streamingText,
  streamingThinking,
  isStreaming,
  onExport,
  isExporting,
}: {
  results: ExecutionResult[];
  streamingStepName?: string;
  streamingText: string;
  streamingThinking?: string;
  isStreaming: boolean;
  onExport: (format: string, content: string, filename: string) => void;
  isExporting: boolean;
}) {
  return (
    <div className="border-t border-adv-teal/20 bg-adv-dark">
      {/* Completed step results — collapsed by default, latest expanded */}
      {results.map((result, idx) => (
        <StepResultCard
          key={result.step}
          result={result}
          onExport={onExport}
          isExporting={isExporting}
          defaultExpanded={idx === results.length - 1 && !isStreaming}
        />
      ))}

      {/* Streaming: current step in progress */}
      {isStreaming && (
        <div className="border-b border-border">
          <div className="flex items-center gap-2 bg-adv-teal-dim px-5 py-3">
            <Loader2 className="h-4 w-4 text-adv-teal animate-spin shrink-0" />
            <span className="text-sm font-semibold text-adv-teal">
              {streamingStepName ? `Executing: ${streamingStepName}` : 'ANTON is working...'}
            </span>
          </div>
          {/* Thinking indicator */}
          {streamingThinking && (
            <div className="border-b border-border/30 bg-adv-dark-2 px-5 py-2">
              <div className="flex items-center gap-1.5 text-xs text-adv-gray mb-1">
                <Layers className="h-3 w-3 animate-pulse" />
                <span className="italic">Reasoning...</span>
              </div>
              <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-adv-gray/70">
                {streamingThinking.slice(-500)}
              </pre>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-adv-off-white">
              {streamingText}
              <span className="inline-block w-2 h-4 bg-adv-teal/60 animate-pulse ml-0.5 align-middle" />
            </pre>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Linked Mission Panel (Wave 5.1 — Task Agent ↔ Missions bridge) ──────────

const MISSION_STATUS_STYLE: Record<string, string> = {
  active:    'text-adv-teal bg-adv-teal-dim border-adv-teal/30',
  review:    'text-adv-gold bg-adv-gold/10 border-adv-gold/30',
  paused:    'text-adv-gold bg-adv-gold/10 border-adv-gold/30',
  briefed:   'text-adv-blue bg-adv-blue/10 border-adv-blue/30',
  completed: 'text-adv-green bg-adv-green/10 border-adv-green/30',
  aborted:   'text-adv-red bg-adv-red/10 border-adv-red/30',
};

function LinkedMissionPanel({
  mission,
  syncing,
  onOpenMission,
}: {
  mission: LinkedMissionSummary;
  syncing: boolean;
  onOpenMission: () => void;
}) {
  const style = MISSION_STATUS_STYLE[mission.status] ?? 'text-adv-gray bg-adv-dark-2 border-adv-gray/30';
  const isRunning = mission.status === 'active';
  return (
    <div className="mx-1 rounded-xl border border-adv-blue/30 bg-adv-blue/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-adv-blue" />
            : mission.status === 'completed'
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-adv-green" />
              : <Zap className="h-4 w-4 shrink-0 text-adv-blue" />}
          <span className="text-sm font-semibold text-adv-white truncate">Executing as Mission</span>
          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${style}`}>
            {mission.status}
          </span>
          {syncing && <span className="text-xs text-adv-gray">syncing…</span>}
        </div>
        <button
          onClick={onOpenMission}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-adv-blue/40 px-3 py-1.5 text-xs font-medium text-adv-blue hover:bg-adv-blue/10 transition-colors"
        >
          Open mission
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-adv-gray">
          <span>
            {mission.completed_tasks}/{mission.total_tasks} mission tasks
            {mission.failed_tasks > 0 && <span className="text-adv-red"> · {mission.failed_tasks} failed</span>}
          </span>
          <span>{mission.progress_pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-adv-dark-2">
          <div
            className={`h-full rounded-full transition-all ${mission.status === 'aborted' ? 'bg-adv-red' : 'bg-adv-teal'}`}
            style={{ width: `${mission.progress_pct}%` }}
          />
        </div>
      </div>

      {mission.current_task_title && mission.status !== 'completed' && (
        <p className="mt-2 text-xs text-adv-gray truncate">
          <span className="font-medium text-adv-off-white">Current:</span> {mission.current_task_title}
        </p>
      )}
      {mission.awaiting_human && mission.status !== 'completed' && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-adv-gold">
          <AlertCircle className="h-3 w-3 shrink-0" />
          Waiting for your review — open the mission to approve the checkpoint.
        </p>
      )}
    </div>
  );
}

// ─── New Task Modal ────────────────────────────────────────────────────────────

function NewTaskModal({
  onClose,
  onCreated,
  prefilledTitle = '',
  prefilledDescription = '',
}: {
  onClose: () => void;
  onCreated: (task: Task) => void;
  prefilledTitle?: string;
  prefilledDescription?: string;
}) {
  const [title, setTitle] = useState(prefilledTitle);
  const [description, setDescription] = useState(prefilledDescription);
  const [priority, setPriority] = useState('normal');
  const [source, setSource] = useState('manual');
  const [sourceRef, setSourceRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function submit() {
    if (!title.trim() || !description.trim()) { setError('Title and description are required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWithAuth('/api/task-agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority, source, source_ref: sourceRef || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create task');
      onCreated(data.task);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-adv-dark-2 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-adv-teal" />
            <h2 className="text-base font-semibold text-adv-white">New Task for ANTON</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-adv-gray hover:text-adv-off-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-adv-gray">Task Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. AMLR gap analysis for Nordea"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-adv-gray">What needs to happen?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the task in plain language — context, client, constraints, deadline. ANTON will propose the best approach from its toolbox."
              rows={4}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
          </div>

          {/* Advanced options — collapsed by default */}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            {showAdvanced ? 'Hide' : 'Advanced'} options
          </button>

          {showAdvanced && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-gray">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-gray">Received from</label>
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  >
                    <option value="manual">Manual / Chat</option>
                    <option value="jira">Jira</option>
                    <option value="slack">Slack</option>
                    <option value="standup">Standup</option>
                    <option value="email">Email</option>
                  </select>
                </div>
              </div>
              {source !== 'manual' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-adv-gray">
                    {source === 'jira' ? 'Jira Ticket ID' : source === 'slack' ? 'Slack Thread URL' : 'Reference'}
                  </label>
                  <input
                    value={sourceRef}
                    onChange={(e) => setSourceRef(e.target.value)}
                    placeholder={source === 'jira' ? 'FCP-1234' : 'Reference...'}
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                  />
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-adv-red">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Chat Panel ───────────────────────────────────────────────────────────

function TaskChatPanel({ taskId, onStatusChange }: { taskId: string; onStatusChange: () => void }) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);
  const [confirmingApproach, setConfirmingApproach] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoStarted, setAutoStarted] = useState(false);
  // Execution state
  const [executingStep, setExecutingStep] = useState(false);
  const [executingStepName, setExecutingStepName] = useState('');
  const [executingStepText, setExecutingStepText] = useState('');
  const [executingStepThinking, setExecutingStepThinking] = useState('');
  // Mission bridge state (Wave 5.1)
  const [launchingMission, setLaunchingMission] = useState(false);
  const [syncingMission, setSyncingMission] = useState(false);
  const missionSyncRequested = useRef(false);
  const { doExport, isExporting } = useExport();
  // Attachment state
  const [uploadingFile, setUploadingFile] = useState(false);
  const [knowledgePacks, setKnowledgePacks] = useState<Array<{ id: string; display_name: string; regulatory_area: string | null; status: string }>>([]);
  const [showPackSelector, setShowPackSelector] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const loadTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/task-agent/tasks/${taskId}`, { headers: getAuthHeader() });
      if (res.ok) { const data = await res.json(); setTask(data); }
    } finally { setLoading(false); }
  }, [taskId]);

  useEffect(() => { loadTask(); }, [loadTask]);

  // Auto-send first message when a brand-new intake task loads — kicks off ANTON's approach proposals
  useEffect(() => {
    if (!task || autoStarted || loading) return;
    if (task.status === 'intake' && (task.conversation?.length ?? 0) === 0) {
      setAutoStarted(true);
      sendFirstMessage(task.description);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, task?.status, loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [task?.conversation, streamText]);

  async function sendFirstMessage(content: string) {
    if (!content.trim() || streaming) return;
    setStreaming(true);
    setStreamText('');
    setSendError(null);
    try {
      const res = await fetchWithAuth(`/api/task-agent/tasks/${taskId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok || !res.body) throw new Error('Stream failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'text' || parsed.type === 'text_delta') { accumulated += (parsed.text ?? parsed.content ?? ''); setStreamText(accumulated); }
            else if (parsed.type === 'done') { await loadTask(); onStatusChange(); }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      console.error('Auto-start failed:', err);
      setSendError('ANTON could not start automatically. Type your message below to begin.');
    } finally {
      setStreaming(false);
      setStreamText('');
    }
  }

  async function sendMessage() {
    if (!input.trim() || streaming || !task) return;
    const msg = input.trim();
    setInput('');
    setStreaming(true);
    setStreamText('');
    setSendError(null);

    // Optimistically add user message
    setTask((prev) => prev ? {
      ...prev,
      conversation: [...prev.conversation, { role: 'user', content: msg }],
    } : prev);

    try {
      const res = await fetchWithAuth(`/api/task-agent/tasks/${task.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg }),
      });

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.type === 'text' || parsed.type === 'text_delta') {
              accumulated += (parsed.text ?? parsed.content ?? '');
              setStreamText(accumulated);
            } else if (parsed.type === 'done') {
              await loadTask();
              onStatusChange();
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      console.error('Message send failed:', err);
      setSendError('Failed to send message. Please try again.');
      // Revert optimistic user message
      await loadTask();
    } finally {
      setStreaming(false);
      setStreamText('');
    }
  }

  async function confirmApproach() {
    if (!selectedProposal || !task || confirmingApproach) return;
    setConfirmingApproach(true);
    try {
      const res = await fetchWithAuth(`/api/task-agent/tasks/${task.id}/select-approach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approach_id: selectedProposal }),
      });
      const data = await res.json();
      if (res.ok) {
        await loadTask();
        onStatusChange();
        // Trigger ANTON's intake phase — stream so user sees questions immediately
        const approachName = (data.approach as { name?: string })?.name ?? 'the selected approach';
        const intakeMsg = `Approach confirmed: "${approachName}". Ask me for the specific information you need. I've already described the task — ask only for what's still missing.`;

        // Add user message to conversation optimistically
        setTask((prev) => prev ? {
          ...prev,
          conversation: [...prev.conversation, { role: 'user', content: intakeMsg }],
        } : prev);

        setStreaming(true);
        setStreamText('');

        try {
          const streamRes = await fetchWithAuth(`/api/task-agent/tasks/${task.id}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: intakeMsg }),
          });

          if (streamRes.ok && streamRes.body) {
            const reader = streamRes.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (!raw) continue;
                try {
                  const parsed = JSON.parse(raw);
                  if (parsed.type === 'text' || parsed.type === 'text_delta') {
                    accumulated += (parsed.text ?? parsed.content ?? '');
                    setStreamText(accumulated);
                  } else if (parsed.type === 'done') {
                    await loadTask();
                    onStatusChange();
                  }
                } catch { /* skip */ }
              }
            }
          }
        } finally {
          setStreaming(false);
          setStreamText('');
        }
      }
    } finally {
      setConfirmingApproach(false);
    }
  }

  async function runStep() {
    if (!task || executingStep) return;
    const stepIdx = task.current_step;
    const stepDef = task.execution_steps?.[stepIdx];
    const stepName = stepDef ? `Step ${stepIdx + 1}: ${stepDef.name}` : `Step ${stepIdx + 1}`;
    setExecutingStep(true);
    setExecutingStepName(stepName);
    setExecutingStepText('');
    setExecutingStepThinking('');

    try {
      const res = await fetchWithAuth(`/api/task-agent/tasks/${task.id}/execute-step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Execution failed' }));
        setSendError((err as { error?: string }).error ?? 'Execution failed');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let accThinking = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw) as { type: string; text?: string; content?: string; hasMoreSteps?: boolean };
            if ((parsed.type === 'text' || parsed.type === 'text_delta') && (parsed.text || parsed.content)) {
              accumulated += (parsed.text ?? parsed.content ?? '');
              setExecutingStepText(accumulated);
            } else if ((parsed.type === 'thinking' || parsed.type === 'thinking_delta') && (parsed.text || parsed.content)) {
              accThinking += (parsed.text ?? parsed.content ?? '');
              setExecutingStepThinking(accThinking);
            } else if (parsed.type === 'quality_retry') {
              // Reset text on retry — new attempt starts fresh
              accumulated = '';
              setExecutingStepText('');
            } else if (parsed.type === 'done') {
              await loadTask();
              onStatusChange();
            } else if (parsed.type === 'error') {
              setSendError('Execution error. Please try again.');
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setSendError('Execution failed. Please try again.');
      console.error('[execute-step]', err);
    } finally {
      setExecutingStep(false);
      setExecutingStepText('');
      setExecutingStepName('');
      setExecutingStepThinking('');
    }
  }

  // ── Mission bridge (Wave 5.1) ──────────────────────────────────────────
  // "Run as Mission": compiles the confirmed approach + intake into a
  // mission run. The mission's background runner executes; we poll status.
  async function runAsMission() {
    if (!task || launchingMission || executingStep) return;
    setLaunchingMission(true);
    setSendError(null);
    try {
      const res = await fetchWithAuth(`/api/task-agent/tasks/${task.id}/execute-as-mission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError((data as { error?: string }).error ?? 'Failed to start mission');
        return;
      }
      await loadTask();
      onStatusChange();
    } catch {
      setSendError('Failed to start mission. Please try again.');
    } finally {
      setLaunchingMission(false);
    }
  }

  const syncMission = useCallback(async () => {
    if (missionSyncRequested.current) return;
    missionSyncRequested.current = true;
    setSyncingMission(true);
    try {
      await fetchWithAuth(`/api/task-agent/tasks/${taskId}/sync-mission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      await loadTask();
      onStatusChange();
    } catch { /* next poll retries via loadTask */ }
    finally {
      setSyncingMission(false);
      missionSyncRequested.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, loadTask]);

  // Poll the linked mission while it runs; sync the deliverable when done.
  useEffect(() => {
    if (!task?.linked_mission_id) return;
    if (task.status === 'completed' || task.status === 'failed') return;
    const lm = task.linked_mission;
    if (lm && (lm.status === 'completed' || lm.status === 'aborted')) {
      void syncMission();
      return;
    }
    const interval = setInterval(() => { void loadTask(); }, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.linked_mission_id, task?.linked_mission?.status, task?.status]);

  // Load knowledge packs when pack selector is opened
  async function openPackSelector() {
    setShowPackSelector(true);
    if (knowledgePacks.length === 0) {
      try {
        const res = await fetch('/api/knowledge-packs', { headers: getAuthHeader() });
        if (res.ok) {
          const data = await res.json() as { packs?: Array<{ id: string; display_name: string; regulatory_area: string | null; status: string }> };
          setKnowledgePacks(data.packs ?? []);
        }
      } catch { /* ignore */ }
    }
  }

  async function togglePack(packId: string) {
    if (!task) return;
    const current = task.active_knowledge_packs ?? [];
    const next = current.includes(packId) ? current.filter((id) => id !== packId) : [...current, packId];
    await fetchWithAuth(`/api/task-agent/tasks/${task.id}/knowledge-packs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_ids: next }),
    });
    await loadTask();
  }

  async function uploadFile(file: File) {
    if (!task) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetchWithAuth(`/api/task-agent/tasks/${task.id}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        await loadTask();
      } else {
        const err = await res.json().catch(() => ({ error: 'Upload failed' })) as { error?: string };
        setSendError(err.error ?? 'Upload failed');
      }
    } catch {
      setSendError('Upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  }

  async function removeFile(fileId: string) {
    if (!task) return;
    await fetchWithAuth(`/api/task-agent/tasks/${task.id}/upload/${fileId}`, {
      method: 'DELETE',
    });
    await loadTask();
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-adv-gray">
        Task not found.
      </div>
    );
  }

  const showProposals = task.proposals?.length > 0 &&
    (task.status === 'awaiting_selection');

  return (
    <div className="flex h-full flex-col">
      {/* Task header */}
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-adv-white">{task.title}</h2>
            <p className="mt-0.5 text-xs text-adv-gray line-clamp-2">{task.description}</p>
          </div>
          <StatusBadge status={task.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-adv-gray">
          <span className="capitalize">{task.source}</span>
          {task.source_ref && <span className="font-mono">{task.source_ref}</span>}
          <span>·</span>
          <span>{formatRelative(task.created_at)}</span>
          {task.priority !== 'normal' && (
            <>
              <span>·</span>
              <span className={task.priority === 'urgent' ? 'text-adv-red font-medium' : task.priority === 'high' ? 'text-adv-gold' : 'text-adv-gray'}>
                {task.priority}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {(task.conversation?.length ?? 0) === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bot className="h-10 w-10 text-adv-teal/40 mb-3" />
            <p className="text-sm text-adv-gray max-w-xs">
              Add more context below and ANTON will propose the best approach for your task.
            </p>
          </div>
        )}

        {task.conversation?.map((msg, i) => (
          <ConversationBubble key={i} msg={msg} />
        ))}

        {streaming && streamText && (
          <div className="flex gap-3">
            <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-adv-card border border-adv-teal/30">
              <Bot className="h-4 w-4 text-adv-teal" />
            </div>
            <div className="max-w-[80%] rounded-xl rounded-tl-none border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white">
              <div className="whitespace-pre-wrap">{getDisplayText(streamText)}</div>
              <div className="mt-1 h-1 w-4 animate-pulse rounded bg-adv-teal/40" />
            </div>
          </div>
        )}

        {/* Intake complete — ready to run first step */}
        {task.intake_ready === 1 && (task.execution_results?.length ?? 0) === 0 && !executingStep && !task.linked_mission_id && (
          <div className="mx-1 rounded-xl border border-adv-teal/30 bg-adv-teal-soft px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-adv-teal" />
                <span className="text-sm font-semibold text-adv-teal">
                  All information gathered — ready to execute Step 1{task.execution_steps?.[0]?.name ? `: ${task.execution_steps[0].name}` : ''}
                </span>
              </div>
              <button
                onClick={runStep}
                disabled={launchingMission}
                className="flex items-center gap-2 rounded-xl bg-adv-teal px-4 py-2 text-sm font-bold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                Run Step 1
              </button>
            </div>
            {/* Wave 5.1 — alternative execution path: compile into a mission */}
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-adv-teal/15 pt-3">
              <p className="text-xs text-adv-gray">
                Or hand all {task.execution_steps?.length ?? 0} steps to Mission Control — runs in the background with review checkpoints between steps.
              </p>
              <button
                onClick={runAsMission}
                disabled={launchingMission}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-adv-blue/40 px-3 py-1.5 text-xs font-medium text-adv-blue hover:bg-adv-blue/10 transition-colors disabled:opacity-60"
              >
                {launchingMission ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Run as Mission
              </button>
            </div>
          </div>
        )}

        {/* Linked mission status (Wave 5.1) */}
        {task.linked_mission_id && task.linked_mission && (
          <LinkedMissionPanel
            mission={task.linked_mission}
            syncing={syncingMission}
            onOpenMission={() => navigate(`/missions/${task.linked_mission_id}`)}
          />
        )}

        {/* Intake complete — ready to run next step (after some steps done) */}
        {task.intake_ready === 1 && (task.execution_results?.length ?? 0) > 0 && !executingStep && !task.linked_mission_id && (
          <div className="mx-1 rounded-xl border border-adv-gold/30 bg-adv-gold/5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ChevronsRight className="h-4 w-4 text-adv-gold" />
                <span className="text-sm font-semibold text-adv-gold">
                  Step {task.current_step} complete — ready for Step {task.current_step + 1}{task.execution_steps?.[task.current_step]?.name ? `: ${task.execution_steps[task.current_step].name}` : ''}
                </span>
              </div>
              <button
                onClick={runStep}
                className="flex items-center gap-2 rounded-xl bg-adv-gold px-4 py-2 text-sm font-bold text-adv-dark hover:opacity-90"
              >
                <Play className="h-4 w-4" />
                Run Step {task.current_step + 1}
              </button>
            </div>
          </div>
        )}

        {streaming && !streamText && (
          <div className="flex gap-3">
            <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full bg-adv-card border border-adv-teal/30">
              <Bot className="h-4 w-4 text-adv-teal animate-pulse" />
            </div>
            <div className="rounded-xl rounded-tl-none border border-border bg-adv-card px-4 py-3">
              <div className="flex gap-1">
                {[0,1,2].map((i) => (
                  <div key={i} className="h-1.5 w-1.5 rounded-full bg-adv-teal/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Proposals */}
      {showProposals && (
        <div className="border-t border-border bg-adv-dark-2 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-semibold text-adv-white">ANTON's Proposed Approaches</span>
            </div>
            {selectedProposal && task.status === 'awaiting_selection' && (
              <button
                onClick={confirmApproach}
                disabled={confirmingApproach}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-60"
              >
                {confirmingApproach ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                Confirm Approach
              </button>
            )}
          </div>
          <div className="space-y-2">
            {task.proposals.map((p, i) => (
              <ProposalCard
                key={p.approach_id}
                proposal={p}
                index={i}
                onSelect={setSelectedProposal}
                selected={selectedProposal === p.approach_id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Execution Results Panel */}
      {((task.execution_results?.length ?? 0) > 0 || executingStep) && (
        <ExecutionResultPanel
          results={(task.execution_results ?? []).map((r, i) => ({
            ...r,
            description: task.execution_steps?.[r.step]?.description,
          }))}
          streamingStepName={executingStepName}
          streamingText={executingStepText}
          streamingThinking={executingStepThinking}
          isStreaming={executingStep}
          onExport={(fmt, content, filename) => doExport(fmt, content, { filename, title: task.title })}
          isExporting={isExporting}
        />
      )}

      {/* Composer hidden while a mission executes — the mission detail page
          (checkpoint approve/reject feedback) is the steering surface. */}
      {!['completed', 'cancelled', 'failed'].includes(task.status) && task.linked_mission_id && (
        <div className="border-t border-border bg-adv-dark-2 px-5 py-3 text-center text-xs text-adv-gray">
          This task is executing as a mission. Review and steer it from the{' '}
          <button onClick={() => navigate(`/missions/${task.linked_mission_id}`)} className="text-adv-blue underline hover:text-adv-teal">
            mission page
          </button>.
        </div>
      )}

      {/* Input */}
      {!['completed', 'cancelled', 'failed'].includes(task.status) && !task.linked_mission_id && (
        <div className="border-t border-border px-4 py-3">
          {sendError && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-adv-red/10 px-3 py-2 text-xs text-adv-red">
              <span>{sendError}</span>
              <button onClick={() => setSendError(null)} className="ml-2 hover:text-red-300">✕</button>
            </div>
          )}

          {/* Attachment toolbar */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {/* File upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-2.5 py-1.5 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors disabled:opacity-60"
              title="Attach document (PDF, DOCX, TXT, XLSX)"
            >
              {uploadingFile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
              Attach doc
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv"
              onChange={(e) => { if (e.target.files?.[0]) { uploadFile(e.target.files[0]); e.target.value = ''; } }}
            />

            {/* Knowledge pack selector */}
            <div className="relative">
              <button
                onClick={() => showPackSelector ? setShowPackSelector(false) : openPackSelector()}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-2.5 py-1.5 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
              >
                <BookOpen className="h-3 w-3" />
                Knowledge packs
                {(task.active_knowledge_packs?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-adv-teal px-1.5 text-adv-dark font-bold">
                    {(task.active_knowledge_packs?.length ?? 0)}
                  </span>
                )}
              </button>
              {showPackSelector && (
                <div className="absolute bottom-full left-0 mb-1 z-30 min-w-64 rounded-xl border border-border bg-adv-dark-2 shadow-xl">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-semibold text-adv-white">Regulatory Knowledge Packs</span>
                    <button onClick={() => setShowPackSelector(false)} className="text-adv-gray hover:text-adv-white">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {knowledgePacks.length === 0 ? (
                      <p className="px-3 py-4 text-xs text-adv-gray">No knowledge packs installed. Install packs via Knowledge Base.</p>
                    ) : (
                      knowledgePacks.map((pack) => {
                        const isActive = (task.active_knowledge_packs ?? []).includes(pack.id);
                        const isInstalled = pack.status === 'active' || pack.status === 'installed';
                        return (
                          <button
                            key={pack.id}
                            onClick={() => togglePack(pack.id)}
                            disabled={!isInstalled}
                            className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                              isActive ? 'bg-adv-teal/10 text-adv-teal' : 'text-adv-off-white hover:bg-adv-card'
                            } disabled:opacity-40`}
                          >
                            <div>
                              <p className="text-xs font-medium">{pack.display_name}</p>
                              {pack.regulatory_area && <p className="text-xs text-adv-gray">{pack.regulatory_area}</p>}
                            </div>
                            <div className={`h-3.5 w-3.5 rounded border-2 shrink-0 ${isActive ? 'border-adv-teal bg-adv-teal' : 'border-adv-gray'}`} />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Attached file chips */}
            {task.task_files.map((f) => (
              <span key={f.id} className="flex items-center gap-1 rounded-full border border-adv-blue/30 bg-adv-blue/10 px-2.5 py-1 text-xs text-adv-blue">
                <Paperclip className="h-2.5 w-2.5" />
                {f.name}
                <button onClick={() => removeFile(f.id)} className="ml-0.5 hover:text-adv-red">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}

            {/* Active pack chips */}
            {(task.active_knowledge_packs ?? []).map((id) => {
              const pack = knowledgePacks.find((p) => p.id === id);
              return (
                <span key={id} className="flex items-center gap-1 rounded-full border border-adv-teal/30 bg-adv-teal/10 px-2.5 py-1 text-xs text-adv-teal">
                  <BookOpen className="h-2.5 w-2.5" />
                  {pack?.display_name ?? id}
                  <button onClick={() => togglePack(id)} className="ml-0.5 hover:text-adv-red">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>

          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={
                task.status === 'awaiting_selection'
                  ? 'Tell ANTON to proceed with one of the approaches above, or ask a question...'
                  : task.status === 'clarifying' && task.intake_ready === 0
                  ? 'Answer ANTON\'s questions so it can execute the task...'
                  : 'Message ANTON about this task...'
              }
              rows={2}
              disabled={streaming}
              className="flex-1 resize-none rounded-xl border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-60"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              className="flex h-full items-center justify-center rounded-xl bg-adv-teal px-3 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40"
              title="Send (Enter)"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {['completed', 'cancelled', 'failed'].includes(task.status) && (
        <div className="border-t border-border bg-adv-dark-2 px-5 py-3 text-center text-xs text-adv-gray">
          Task {task.status}
          {task.execution_summary && <p className="mt-1 text-adv-off-white">{task.execution_summary}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

class TaskAgentErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  override render() {
    if (this.state.error) {
      return (
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 p-8 text-center">
          <AlertCircle className="h-10 w-10 text-adv-red" />
          <div>
            <p className="text-base font-semibold text-adv-white">ANTON Task Agent encountered an error</p>
            <p className="mt-1 text-sm text-adv-gray">{this.state.error.message}</p>
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark"
          >
            <RefreshCw className="h-4 w-4" />
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

function AntonTaskAgentPageInner() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newModalPrefill, setNewModalPrefill] = useState<{ title: string; description: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  // Pick up ?task=ID from URL
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (taskId) setSelectedTaskId(taskId);
  }, [searchParams]);

  // Prefill from Pathfinder's "task_agent" smart action — consume the
  // sessionStorage handoff once and open the prefilled New Task modal.
  useEffect(() => {
    const raw = sessionStorage.getItem('task-agent-prefill');
    if (!raw) return;
    sessionStorage.removeItem('task-agent-prefill');
    try {
      const prefill = JSON.parse(raw) as { title?: string; description?: string; steps?: string };
      const description = [prefill.description, prefill.steps ? `Steps:\n${prefill.steps}` : '']
        .filter(Boolean).join('\n\n');
      setNewModalPrefill({ title: prefill.title ?? '', description });
      setShowNewModal(true);
    } catch { /* malformed prefill — ignore */ }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, statsRes, capsRes] = await Promise.all([
        fetch(`/api/task-agent/tasks?limit=50${filterStatus ? `&status=${filterStatus}` : ''}`, { headers: getAuthHeader() }),
        fetch('/api/task-agent/stats', { headers: getAuthHeader() }),
        fetch('/api/task-agent/capabilities', { headers: getAuthHeader() }),
      ]);
      if (tasksRes.ok) { const d = await tasksRes.json(); setTasks(d.tasks); }
      if (statsRes.ok) { setStats(await statsRes.json()); }
      if (capsRes.ok) { const d = await capsRes.json(); setCapabilities(d.capabilities); }
    } finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  function selectTask(id: string) {
    setSelectedTaskId(id);
    setSearchParams({ task: id });
  }

  function openModal(prefill?: { title: string; description: string }) {
    setNewModalPrefill(prefill ?? null);
    setShowNewModal(true);
  }

  function handleCreated(task: Task) {
    setShowNewModal(false);
    setNewModalPrefill(null);
    setTasks((prev) => [task, ...prev]);
    selectTask(task.id);
  }

  async function deleteTask(id: string) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    await fetchWithAuth(`/api/task-agent/tasks/${id}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);
  }

  const openCount = stats?.open ?? 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left: Task Queue ──────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border bg-adv-dark-2">
        {/* Header */}
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-adv-teal" />
              <span className="text-sm font-semibold text-adv-white">ANTON Task Agent</span>
              {openCount > 0 && (
                <span className="rounded-full bg-adv-teal px-1.5 py-0.5 text-xs font-bold text-adv-dark">
                  {openCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={loadData} title="Refresh" className="rounded p-1.5 text-adv-gray hover:text-adv-teal transition-colors">
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => openModal()}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-2.5 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark"
              >
                <Plus className="h-3.5 w-3.5" />
                New Task
              </button>
            </div>
          </div>

          {/* Stats row */}
          {stats && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Total', value: stats.total, color: 'text-adv-off-white' },
                { label: 'Open', value: stats.open, color: 'text-adv-gold' },
                { label: 'Done', value: stats.byStatus.find((s) => s.status === 'completed')?.count ?? 0, color: 'text-adv-green' },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-adv-dark px-2 py-1.5 text-center">
                  <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-adv-gray">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="mt-3 w-full rounded-lg border border-border bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="">All tasks</option>
            <option value="intake">Intake</option>
            <option value="awaiting_selection">Awaiting Selection</option>
            <option value="clarifying">Clarifying</option>
            <option value="executing">Executing</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Task list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-adv-teal" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <LayoutList className="h-8 w-8 text-adv-gray/30 mb-2" />
              <p className="text-xs text-adv-gray">No tasks yet.</p>
              <p className="mt-1 text-xs text-adv-gray">Click "New Task" to tell ANTON what needs to be done.</p>
            </div>
          ) : (
            tasks.map((task) => (
              <button
                key={task.id}
                onClick={() => selectTask(task.id)}
                className={`group w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-adv-dark ${
                  selectedTaskId === task.id ? 'bg-adv-dark border-l-2 border-l-adv-teal' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-adv-off-white">{task.title}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 rounded p-0.5 text-adv-gray hover:text-adv-red transition-all"
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  {task.priority !== 'normal' && (
                    <span className={`text-xs ${task.priority === 'urgent' ? 'text-adv-red' : task.priority === 'high' ? 'text-adv-gold' : 'text-adv-gray'}`}>
                      {task.priority}
                    </span>
                  )}
                  {task.source !== 'manual' && (
                    <span className="text-xs text-adv-gray capitalize">{task.source}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-adv-gray">{formatRelative(task.created_at)}</p>
                {task.tags?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {task.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="rounded bg-adv-dark-2 px-1.5 py-0.5 text-xs text-adv-gray">{tag}</span>
                    ))}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: Chat Panel ──────────────────────────────────── */}
      <div className="flex flex-1 flex-col bg-adv-dark overflow-hidden">
        {selectedTaskId ? (
          <TaskChatPanel
            key={selectedTaskId}
            taskId={selectedTaskId}
            onStatusChange={loadData}
          />
        ) : (
          <div className="flex h-full flex-col overflow-y-auto">
            {/* Header */}
            <div className="border-b border-border px-8 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim border border-adv-teal/20">
                    <Bot className="h-5 w-5 text-adv-teal" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-adv-white">What would you like ANTON to help with?</h2>
                    <p className="text-xs text-adv-gray mt-0.5">Pick a capability below, or describe a custom task</p>
                  </div>
                </div>
                <button
                  onClick={() => openModal()}
                  className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Custom task
                </button>
              </div>
            </div>

            {/* Capabilities grid */}
            <div className="flex-1 p-8">
              {capabilities.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-adv-gray">
                  {loading ? <Loader2 className="h-5 w-5 animate-spin text-adv-teal" /> : 'No capabilities loaded — server may need a restart.'}
                </div>
              ) : (
                <>
                  {/* Group capabilities by type */}
                  {(['module', 'tool', 'interaction', 'workflow'] as const).map((type) => {
                    const caps = capabilities.filter((c) => c.capability_type === type);
                    if (!caps.length) return null;
                    const typeLabel: Record<string, string> = {
                      module: 'FCP Modules',
                      tool: 'Specialist Tools',
                      interaction: 'Interaction Modes',
                      workflow: 'Workflows',
                    };
                    return (
                      <div key={type} className="mb-8">
                        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-adv-gray">
                          {typeLabel[type]}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                          {caps.map((cap) => {
                            const useCases: string[] = (() => {
                              try { return JSON.parse(cap.use_cases); } catch { return []; }
                            })();
                            const effortColor = cap.effort_estimate === 'quick' ? 'text-adv-green' : cap.effort_estimate === 'deep' ? 'text-adv-gold' : 'text-adv-blue';
                            return (
                              <button
                                key={cap.id}
                                onClick={() => openModal({
                                  title: cap.name,
                                  description: `I need to use ${cap.name}.\n\nContext: `,
                                })}
                                className="group rounded-xl border border-border bg-adv-card p-4 text-left transition-all hover:border-adv-teal/40 hover:bg-adv-card/80"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium text-adv-off-white group-hover:text-adv-white leading-snug">
                                    {cap.name}
                                  </p>
                                  <span className={`shrink-0 text-xs font-medium ${effortColor}`}>
                                    {cap.effort_estimate}
                                  </span>
                                </div>
                                <p className="mt-1.5 text-xs text-adv-gray leading-relaxed line-clamp-2">
                                  {cap.description}
                                </p>
                                {useCases.length > 0 && (
                                  <div className="mt-2.5 flex flex-wrap gap-1">
                                    {useCases.slice(0, 2).map((uc) => (
                                      <span key={uc} className="rounded-full bg-adv-dark px-2 py-0.5 text-xs text-adv-gray">
                                        {uc}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <p className="mt-3 text-xs font-medium text-adv-teal opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                  Start a task <ArrowRight className="h-3 w-3" />
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* New task modal */}
      {showNewModal && (
        <NewTaskModal
          onClose={() => { setShowNewModal(false); setNewModalPrefill(null); }}
          onCreated={handleCreated}
          prefilledTitle={newModalPrefill?.title}
          prefilledDescription={newModalPrefill?.description}
        />
      )}
    </div>
  );
}

export default function AntonTaskAgentPage() {
  return (
    <TaskAgentErrorBoundary>
      <AntonTaskAgentPageInner />
    </TaskAgentErrorBoundary>
  );
}
