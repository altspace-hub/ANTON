import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Loader2,
  Sparkles,
  Check,
  RotateCcw,
  Save,
  ChevronRight,
  MessageSquare,
  Eye,
  Play,
} from 'lucide-react';
import { useWorkflowStore } from '@/stores/useWorkflowStore';
import type { WorkflowDefinition, WorkflowStep } from '@/lib/workflow-definitions';

// ── Types ────────────────────────────────────────────────────

type Phase = 'guide' | 'generate' | 'save';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── Constants ────────────────────────────────────────────────

const INITIAL_GREETING =
  "Hi! I'm here to help you build a workflow. Tell me: what's a repetitive task or multi-step process you'd like to automate? For example: reading regulatory updates, analysing documents, sending notifications, or running compliance checks.";

const WIZARD_PHASES: { id: Phase; label: string; icon: typeof MessageSquare }[] = [
  { id: 'guide', label: 'Guide', icon: MessageSquare },
  { id: 'generate', label: 'Generate', icon: Eye },
  { id: 'save', label: 'Save', icon: Save },
];

// ── Step type badge helper ───────────────────────────────────

function stepTypeBadge(type: string): string {
  const colors: Record<string, string> = {
    input: 'bg-blue-500/20 text-blue-400',
    claude: 'bg-adv-teal/20 text-adv-teal',
    export: 'bg-green-500/20 text-green-400',
    api_call: 'bg-yellow-500/20 text-yellow-400',
    database_query: 'bg-yellow-500/20 text-yellow-400',
    notification: 'bg-purple-500/20 text-purple-400',
    email_send: 'bg-purple-500/20 text-purple-400',
    wait: 'bg-gray-500/20 text-gray-400',
    checkpoint: 'bg-orange-500/20 text-orange-400',
  };
  return colors[type] ?? 'bg-gray-500/20 text-gray-400';
}

// ── Phase Stepper (sidebar) ──────────────────────────────────

function PhaseStepper({ current }: { current: Phase }) {
  const phaseIndex = WIZARD_PHASES.findIndex((p) => p.id === current);

  return (
    <div className="space-y-1">
      {WIZARD_PHASES.map((phase, idx) => {
        const Icon = phase.icon;
        const isActive = phase.id === current;
        const isDone = idx < phaseIndex;

        return (
          <div
            key={phase.id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
              isActive
                ? 'bg-adv-teal-dim border border-adv-teal/30'
                : isDone
                ? 'border border-transparent opacity-70'
                : 'border border-transparent opacity-40'
            }`}
          >
            {/* Step number / done indicator */}
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                isActive
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : isDone
                  ? 'border-adv-green/50 bg-adv-green/10 text-adv-green'
                  : 'border-adv-gray-med text-adv-gray-med'
              }`}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <div>
              <div
                className={`text-xs font-medium ${
                  isActive ? 'text-adv-teal' : isDone ? 'text-adv-gray' : 'text-adv-gray-med'
                }`}
              >
                {phase.label}
              </div>
              <div className="text-[10px] text-adv-gray-med">
                {phase.id === 'guide' && 'Describe your process'}
                {phase.id === 'generate' && 'Review AI-generated steps'}
                {phase.id === 'save' && 'Name and save'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function BuildYourOwnWorkflow() {
  const navigate = useNavigate();
  const { saveWorkflow } = useWorkflowStore();

  // Phase state
  const [phase, setPhase] = useState<Phase>('guide');

  // Chat state (Phase 1)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: INITIAL_GREETING },
  ]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Generated workflow (Phase 2)
  const [generatedWorkflow, setGeneratedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Save state (Phase 3)
  const [workflowName, setWorkflowName] = useState('');
  const [saved, setSaved] = useState(false);

  // Shared
  const [error, setError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to chat bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isLoading]);

  // ── Count user messages ──────────────────────────────────

  const userMessageCount = chatMessages.filter((m) => m.role === 'user').length;

  // Show "Generate Workflow" button when:
  // - 2+ user messages sent, OR
  // - last assistant message contains the phrase "Generate Workflow"
  const lastAssistantMessage = [...chatMessages].reverse().find((m) => m.role === 'assistant');
  const assistantSuggestsGenerate =
    lastAssistantMessage?.content.toLowerCase().includes('generate workflow') ?? false;
  const canGenerate =
    !isLoading && (userMessageCount >= 2 || assistantSuggestsGenerate);

  // ── Send chat message ────────────────────────────────────

  async function sendMessage() {
    const trimmed = userInput.trim();
    if (!trimmed || isLoading) return;

    setUserInput('');
    setError('');

    const updatedMessages: ChatMessage[] = [
      ...chatMessages,
      { role: 'user', content: trimmed },
    ];
    setChatMessages(updatedMessages);
    setIsLoading(true);

    try {
      const res = await fetch('/api/workflows/guide-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: chatMessages,
          userMessage: trimmed,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }

      const { response } = await res.json() as { response: string };
      setChatMessages([...updatedMessages, { role: 'assistant', content: response }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      // Revert optimistic user message on error
      setChatMessages(chatMessages);
      setUserInput(trimmed);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  // ── Generate workflow ────────────────────────────────────

  async function generateWorkflow() {
    setIsGenerating(true);
    setError('');
    setPhase('generate');

    try {
      const res = await fetch('/api/workflows/guide-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }

      const { workflowDefinition } = await res.json() as {
        workflowDefinition: WorkflowDefinition;
      };

      setGeneratedWorkflow(workflowDefinition);
      setWorkflowName(workflowDefinition.label ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workflow');
      setPhase('guide');
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Save workflow ────────────────────────────────────────

  function handleSave() {
    if (!generatedWorkflow) return;

    const toSave: WorkflowDefinition = {
      ...generatedWorkflow,
      id: `custom-${Date.now()}`,
      label: workflowName.trim() || generatedWorkflow.label,
      isCustom: true,
    };

    saveWorkflow(toSave);
    setSaved(true);
  }

  // ── Reset to start ───────────────────────────────────────

  function startOver() {
    setPhase('guide');
    setChatMessages([{ role: 'assistant', content: INITIAL_GREETING }]);
    setUserInput('');
    setGeneratedWorkflow(null);
    setWorkflowName('');
    setError('');
    setSaved(false);
  }

  // ── Unique step types for summary ───────────────────────

  function getUniqueStepTypes(steps: WorkflowStep[]): string[] {
    const seen = new Set<string>();
    return steps
      .map((s) => s.type)
      .filter((t) => {
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      });
  }

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────

  return (
    <div className="flex h-full gap-0">
      {/* ── Left Sidebar ────────────────────────────────── */}
      <div className="w-[300px] shrink-0 border-r border-border flex flex-col gap-6 px-5 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate('/workflows')}
          className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Workflows
        </button>

        {/* Title */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-adv-teal" />
            <h1 className="text-base font-semibold text-adv-white">Build a Workflow</h1>
          </div>
          <p className="text-xs text-adv-gray leading-relaxed">
            Describe your process, let AI design the steps, then save it as a reusable workflow.
          </p>
        </div>

        {/* Phase stepper */}
        <div>
          <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-adv-gray-med">
            Progress
          </div>
          <PhaseStepper current={phase} />
        </div>

        {/* Help text per phase */}
        <div className="mt-auto rounded-lg bg-adv-dark-2 border border-border p-3 text-xs text-adv-gray leading-relaxed">
          {phase === 'guide' && (
            <>
              <span className="text-adv-off-white font-medium block mb-1">Tips</span>
              Describe the problem, not the solution. The more context you give — document types, frequency, who reviews it — the better the workflow will be.
            </>
          )}
          {phase === 'generate' && (
            <>
              <span className="text-adv-off-white font-medium block mb-1">Review</span>
              Check that the steps match your expectations. If something is off, click "Start Over" to refine your description.
            </>
          )}
          {phase === 'save' && (
            <>
              <span className="text-adv-off-white font-medium block mb-1">Almost done</span>
              Give your workflow a clear name. It will appear under "Your Custom Workflows" on the Workflows page.
            </>
          )}
        </div>
      </div>

      {/* ── Main Panel ──────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Error banner */}
        {error && (
          <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-adv-red/30 bg-adv-red/10 px-4 py-2.5">
            <span className="text-xs text-adv-red flex-1">{error}</span>
            <button
              onClick={() => setError('')}
              className="text-adv-red/70 hover:text-adv-red transition-colors text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            PHASE 1: GUIDE — Chat interface
        ═══════════════════════════════════════════════ */}
        {phase === 'guide' && (
          <div className="flex flex-1 flex-col overflow-hidden px-6 pt-6 pb-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-adv-white">Describe your workflow</h2>
              <p className="text-sm text-adv-gray mt-0.5">
                Chat with the AI to describe the process you want to automate.
              </p>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1 mb-4">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      msg.role === 'user'
                        ? 'bg-adv-teal text-adv-dark'
                        : 'bg-adv-teal-dim text-adv-teal border border-adv-teal/30'
                    }`}
                  >
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  {/* Bubble */}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-adv-teal text-adv-dark'
                        : 'rounded-bl-sm bg-adv-card border border-border text-adv-off-white'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex items-end gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-adv-teal border border-adv-teal/30 text-xs font-semibold">
                    AI
                  </div>
                  <div className="rounded-2xl rounded-bl-sm bg-adv-card border border-border px-4 py-3 flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-adv-teal animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-adv-teal animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-adv-teal animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Generate button (shown when eligible) */}
            {canGenerate && (
              <div className="mb-3">
                <button
                  onClick={() => void generateWorkflow()}
                  disabled={isGenerating}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-adv-teal/40 bg-adv-teal-dim px-4 py-2.5 text-sm font-medium text-adv-teal hover:bg-adv-teal hover:text-adv-dark transition-colors disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating workflow...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Workflow from This Conversation
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="flex items-end gap-2.5 rounded-xl border border-border bg-adv-card p-2.5 focus-within:border-adv-teal transition-colors">
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your process... (Enter to send, Shift+Enter for new line)"
                disabled={isLoading}
                rows={3}
                className="flex-1 resize-none bg-transparent text-sm text-adv-off-white placeholder:text-adv-gray-med focus:outline-none disabled:opacity-50 leading-relaxed"
              />
              <button
                onClick={() => void sendMessage()}
                disabled={!userInput.trim() || isLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adv-teal text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            PHASE 2: GENERATE — Workflow preview
        ═══════════════════════════════════════════════ */}
        {phase === 'generate' && (
          <div className="flex flex-1 flex-col overflow-hidden px-6 pt-6 pb-4">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-adv-white">Review Generated Workflow</h2>
                <p className="text-sm text-adv-gray mt-0.5">
                  Check the steps below. If they look right, click "Looks Good" to continue.
                </p>
              </div>
              <button
                onClick={startOver}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start Over
              </button>
            </div>

            {/* Loading state */}
            {isGenerating && (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-adv-teal" />
                  <p className="text-sm text-adv-gray">Designing your workflow steps...</p>
                </div>
              </div>
            )}

            {/* Generated workflow display */}
            {!isGenerating && generatedWorkflow && (
              <div className="flex flex-1 flex-col overflow-hidden">
                {/* Workflow header */}
                <div className="mb-4 rounded-xl border border-adv-teal/20 bg-adv-teal-soft p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-adv-white">
                        {generatedWorkflow.label}
                      </h3>
                      {generatedWorkflow.description && (
                        <p className="mt-1 text-xs text-adv-gray leading-relaxed">
                          {generatedWorkflow.description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-adv-teal/20 px-2.5 py-0.5 text-[11px] font-medium text-adv-teal">
                      {generatedWorkflow.steps.length} steps
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-adv-gray-med">
                    {generatedWorkflow.estimatedTime && (
                      <span className="rounded bg-adv-dark px-2 py-0.5">
                        {generatedWorkflow.estimatedTime}
                      </span>
                    )}
                    {generatedWorkflow.tags?.slice(0, 4).map((tag) => (
                      <span key={tag} className="rounded bg-adv-dark px-2 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Steps list */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-4">
                  {generatedWorkflow.steps.map((step, idx) => (
                    <div
                      key={step.id}
                      className="flex items-start gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 hover:border-adv-teal/20 transition-colors"
                    >
                      {/* Step number */}
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-adv-dark border border-adv-gray-med text-[11px] text-adv-gray-med font-medium mt-0.5">
                        {idx + 1}
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-adv-off-white">
                            {step.label}
                          </span>
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${stepTypeBadge(step.type)}`}
                          >
                            {step.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {step.description && (
                          <p className="mt-0.5 text-xs text-adv-gray leading-relaxed">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-2 border-t border-border">
                  <button
                    onClick={() => setPhase('save')}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-adv-teal px-4 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    Looks Good — Continue to Save
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={startOver}
                    className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            PHASE 3: SAVE
        ═══════════════════════════════════════════════ */}
        {phase === 'save' && (
          <div className="flex flex-1 flex-col overflow-hidden px-6 pt-6 pb-4">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-adv-white">Save Your Workflow</h2>
                <p className="text-sm text-adv-gray mt-0.5">
                  Give it a name and save to your custom workflows library.
                </p>
              </div>
              {!saved && (
                <button
                  onClick={startOver}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Start Over
                </button>
              )}
            </div>

            {saved ? (
              /* Success state */
              <div className="flex flex-1 flex-col items-center justify-center gap-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-adv-green/15 border border-adv-green/30">
                  <Check className="h-8 w-8 text-adv-green" />
                </div>
                <div className="text-center">
                  <h3 className="text-base font-semibold text-adv-white">
                    Workflow Saved!
                  </h3>
                  <p className="mt-1 text-sm text-adv-gray">
                    "{workflowName || generatedWorkflow?.label}" is now available in your workflows.
                  </p>
                </div>
                <button
                  onClick={() => navigate('/workflows')}
                  className="flex items-center gap-2 rounded-xl bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                >
                  <Play className="h-4 w-4" />
                  Go to Workflows
                </button>
              </div>
            ) : (
              <div className="flex flex-1 flex-col gap-5 max-w-xl">
                {/* Name input */}
                <div>
                  <label className="block text-xs font-medium text-adv-off-white mb-1.5">
                    Workflow name
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="e.g., Weekly Regulatory Update Review"
                    className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none transition-colors"
                  />
                </div>

                {/* Workflow summary */}
                {generatedWorkflow && (
                  <div className="rounded-xl border border-border bg-adv-card p-4 space-y-3">
                    <div className="text-xs font-medium text-adv-off-white">Workflow Summary</div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-adv-gray-med">Steps</span>
                        <span className="rounded bg-adv-dark px-2 py-0.5 text-adv-off-white font-medium">
                          {generatedWorkflow.steps.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-adv-gray-med">Est. time</span>
                        <span className="text-adv-off-white">
                          {generatedWorkflow.estimatedTime || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Step type breakdown */}
                    <div>
                      <div className="mb-1.5 text-[10px] text-adv-gray-med uppercase tracking-wide">
                        Step types
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {getUniqueStepTypes(generatedWorkflow.steps).map((type) => (
                          <span
                            key={type}
                            className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${stepTypeBadge(type)}`}
                          >
                            {type.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Step names */}
                    <div>
                      <div className="mb-1.5 text-[10px] text-adv-gray-med uppercase tracking-wide">
                        Steps
                      </div>
                      <ol className="space-y-1">
                        {generatedWorkflow.steps.map((step, idx) => (
                          <li key={step.id} className="flex items-center gap-2 text-xs">
                            <span className="w-4 shrink-0 text-right text-adv-gray-med font-mono">
                              {idx + 1}.
                            </span>
                            <span className="text-adv-gray">{step.label}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleSave}
                    disabled={!workflowName.trim()}
                    className="flex items-center gap-2 rounded-xl bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4" />
                    Save Workflow
                  </button>
                  <button
                    onClick={() => setPhase('generate')}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
