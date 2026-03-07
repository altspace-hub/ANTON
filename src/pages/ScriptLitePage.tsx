import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileCode, MessageSquare, Code, ArrowRight, Play, Download, Copy,
  Check, Send, RotateCcw, Loader2, AlertCircle, Pencil, Square,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import CodeViewer from '@/components/coding/CodeViewer';
import ExportAntonButton from '@/components/coding/ExportAntonButton';
import QualityScore from '@/components/coding/QualityScore';
import ConversationThread from '@/components/shared/ConversationThread';
import ThinkingControls from '@/components/shared/ThinkingControls';
import ModelSelector from '@/components/shared/ModelSelector';
import StatusIndicator from '@/components/shared/StatusIndicator';
import ExportBar from '@/components/shared/ExportBar';
import { useSessionStore } from '@/stores/useSessionStore';
import { useClaude } from '@/hooks/useClaude';
import { useExport } from '@/hooks/useExport';
import { fetchSession } from '@/lib/api';
import type { ThinkingLevel, ModelId, Message } from '@/lib/types';

type Stage = 'describe' | 'clarify' | 'output';

// ── System prompt for the clarification step ─────────────────────────────
const CLARIFY_SYSTEM_PROMPT = `You are an expert Python developer assisting a compliance professional who needs a Python script.

Your task: Ask 3-6 precise clarifying questions about the user's script requirements. These questions should help you write a better, more tailored script.

Rules:
- Ask ONLY numbered questions (1. ..., 2. ..., etc.)
- Each question on its own line
- Focus on: input format, output format, edge cases, error handling, specific libraries, performance needs
- Keep questions concise and non-technical where possible
- Do NOT write any code yet
- Do NOT include any preamble or conclusion — just the numbered questions
- If the user provided sample data, ask about edge cases specific to that data format`;

// ── System prompt for the script generation step ─────────────────────────
const GENERATE_SYSTEM_PROMPT = `You are an expert Python developer generating production-quality scripts for compliance professionals.

Guidelines:
- Write clean, well-documented Python 3.10+ code
- Include a docstring at the top explaining what the script does
- Use standard libraries where possible (pandas, pathlib, csv, json, sys, argparse)
- Include proper error handling and input validation
- Add type hints for function signatures
- Make the script runnable from the command line (include if __name__ == "__main__" block)
- Include clear comments explaining non-obvious logic
- Handle common edge cases (empty files, missing columns, encoding issues)
- Output progress messages where appropriate
- If using pandas, handle both CSV and Excel inputs gracefully

Structure your response as:
1. A brief explanation of the approach (2-3 sentences)
2. The complete Python script in a \`\`\`python code block
3. A "How to use" section with example command-line usage
4. A "Dependencies" section listing any pip packages needed (if any beyond stdlib)`;

// ── Parse numbered questions from Claude's response ──────────────────────
function parseQuestions(text: string): string[] {
  const lines = text.split('\n');
  const questions: string[] = [];
  let currentQ = '';
  let blankAfterQ = false; // Track single blank line (heading may be followed by body after blank)

  for (const rawLine of lines) {
    // Pre-strip leading bold markers: "**1. ..." → "1. ..."
    // Also handles "* **1. ..." or "- **1. ..."
    const line = rawLine.replace(/^(\s*(?:[-*]\s+)?)\*{1,2}(\d)/, '$1$2');

    // Match numbered patterns:
    //   1. Question text
    //   1. **Bold Title** Question text
    //   1) Question text
    //   1 - Question text
    //   - 1. Title: text  (bullet with number)
    const numberedMatch = line.match(/^\s*(?:[-*]\s+)?(\d+)[.)]\s+(.+)/) ||
                          line.match(/^\s*(\d+)\s*[-–—]\s+(.+)/);
    if (numberedMatch) {
      if (currentQ) questions.push(currentQ.trim());
      currentQ = numberedMatch[2].replace(/^\*\*/, '').replace(/\*\*\s*$/, '');
      blankAfterQ = false;
    } else if (currentQ && line.trim()) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('---')) {
        questions.push(currentQ.trim());
        currentQ = '';
        blankAfterQ = false;
      } else {
        currentQ += ' ' + trimmed;
        blankAfterQ = false;
      }
    } else if (!line.trim() && currentQ) {
      if (blankAfterQ) {
        // Second blank line in a row — finalize the question
        questions.push(currentQ.trim());
        currentQ = '';
        blankAfterQ = false;
      } else {
        // First blank line — don't finalize yet, body text may follow
        blankAfterQ = true;
      }
    }
  }
  if (currentQ) questions.push(currentQ.trim());

  return questions.map((q) =>
    q.replace(/\*\*/g, '')
     .replace(/\*([^*]+)\*/g, '$1')
     .replace(/\s{2,}/g, ' ')
     .trim(),
  ).filter((q) => q.length > 10);
}

// ── Extract python code blocks from Claude's response ────────────────────
function extractPythonScript(text: string): string {
  // Match ```python ... ``` blocks
  const regex = /```python\s*\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  // Return the longest block (usually the main script)
  if (blocks.length === 0) return '';
  return blocks.reduce((a, b) => (a.length >= b.length ? a : b));
}

// ── Extract explanation text (everything outside the code block) ──────────
function extractExplanation(text: string): string {
  // Remove code blocks and return the rest
  return text
    .replace(/```python\s*\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ScriptLitePage() {
  const [searchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');

  const [stage, setStage] = useState<Stage>('describe');
  const [description, setDescription] = useState('');
  const [dataSample, setDataSample] = useState('');
  const [constraints, setConstraints] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [clarifyDone, setClarifyDone] = useState(false);
  const [generateDone, setGenerateDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState(false);
  const [modifyInput, setModifyInput] = useState('');
  const [showModify, setShowModify] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [qualityScore, setQualityScore] = useState<{ score: number; dimensions?: Record<string, number> } | null>(null);
  const [scriptSessionId, setScriptSessionId] = useState<string | null>(null);

  const modifyInputRef = useRef<HTMLTextAreaElement>(null);
  const prevStreamingRef = useRef(false);

  // ── Zustand store setup ──────────────────────────────────────────────────
  const {
    thinking, model, systemPrompt, lastCachedTokens, lastCacheCreationTokens,
    setModule, setAreaId, setThinking, setCreativity, setPlainTextMode,
    setSystemPrompt, setModel, clearSession, restoreSession,
  } = useSessionStore();

  const {
    runMessage, stopStreaming, isStreaming, streamingText, streamingThinking,
    messages, lastInputTokens, lastOutputTokens,
  } = useClaude();

  const { doExport, isExporting } = useExport();

  // ── Initialize session on mount ──────────────────────────────────────────
  useEffect(() => {
    clearSession();
    setModule('script-lite');
    setAreaId('coding');
    setThinking('think');
    setCreativity('balanced');
    setPlainTextMode(false);

    // ── Resume from saved session if ?session= is present ──────────────
    if (sessionParam) {
      fetchSession(sessionParam).then((data) => {
        if (!data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restored: Message[] = ((data.messages as any[]) || []).map((m: any) => ({
          id: m.id as string,
          sessionId: (m.session_id as string) ?? data.id,
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          thinkingContent: (m.thinking_content as string | null) ?? undefined,
          tokenCount: (m.token_count as number | null) ?? undefined,
          createdAt: m.created_at as string,
        }));
        restoreSession(data.id as string, restored);

        // Restore config
        const cfg = typeof data.config === 'string'
          ? JSON.parse(data.config) : (data.config ?? {});
        if (cfg.model) setModel(cfg.model);
        if (cfg.thinking) setThinking(cfg.thinking);

        // Jump to output stage if there are assistant messages with code
        const hasAssistant = restored.some((m) => m.role === 'assistant');
        if (hasAssistant) {
          setStage('output');
          setGenerateDone(true);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Detect when streaming finishes to parse questions / script ───────────
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    if (wasStreaming && !isStreaming) {
      // Streaming just finished
      if (stage === 'clarify' && !clarifyDone) {
        // Parse questions from the assistant's last message
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant') {
          const qs = parseQuestions(lastMsg.content);
          if (qs.length > 0) {
            setParsedQuestions(qs);
            // Initialize answer fields
            const initialAnswers: Record<string, string> = {};
            qs.forEach((q) => { initialAnswers[q] = ''; });
            setAnswers(initialAnswers);
          }
          setClarifyDone(true);
        }
      } else if (stage === 'output' && !generateDone) {
        setGenerateDone(true);

        // Fire-and-forget quality score fetch
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === 'assistant' && lastMsg.content) {
          fetch('/api/coding/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify({ content: lastMsg.content, type: 'script-lite' }),
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (data && typeof data.score === 'number') {
                setQualityScore({ score: data.score, dimensions: data.dimensions });
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [isStreaming, stage, clarifyDone, generateDone, messages]);

  // ── Stage 1 -> Stage 2: Ask clarifying questions ─────────────────────────
  const handleGetQuestions = useCallback(async () => {
    if (!description.trim() || isStreaming) return;
    setError(null);
    setClarifyDone(false);
    setParsedQuestions([]);
    setAnswers({});

    // Set the clarification system prompt
    setSystemPrompt(CLARIFY_SYSTEM_PROMPT);
    setStage('clarify');

    // Build the user message
    let userMsg = `I need a Python script that does the following:\n\n${description.trim()}`;
    if (dataSample.trim()) {
      userMsg += `\n\nHere is a sample of my data:\n\`\`\`\n${dataSample.trim()}\n\`\`\``;
    }
    if (constraints.trim()) {
      userMsg += `\n\nConstraints/requirements:\n${constraints.trim()}`;
    }

    // Small delay to ensure system prompt is set before runMessage reads it
    await new Promise((r) => setTimeout(r, 50));
    runMessage(userMsg);
  }, [description, dataSample, constraints, isStreaming, setSystemPrompt, runMessage]);

  // ── Stage 2 -> Stage 3: Generate the script ──────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (isStreaming) return;
    setError(null);
    setGenerateDone(false);
    setQualityScore(null);

    // Generate a session ID for export purposes
    const sid = `script-lite-${Date.now()}`;
    setScriptSessionId(sid);

    // Switch system prompt to generation mode
    setSystemPrompt(GENERATE_SYSTEM_PROMPT);
    setStage('output');

    // Build user message with clarification answers
    let userMsg = 'Thank you for the questions. Here are my answers:\n\n';
    const answeredQuestions = Object.entries(answers).filter(([, a]) => a.trim());
    if (answeredQuestions.length > 0) {
      answeredQuestions.forEach(([q, a]) => {
        userMsg += `Q: ${q}\nA: ${a.trim()}\n\n`;
      });
    } else {
      userMsg += '(No specific answers provided -- use sensible defaults.)\n\n';
    }
    userMsg += 'Please generate the complete Python script now.';
    if (constraints.trim()) {
      userMsg += `\n\nReminder of constraints: ${constraints.trim()}`;
    }

    await new Promise((r) => setTimeout(r, 50));
    runMessage(userMsg);
  }, [isStreaming, answers, constraints, setSystemPrompt, runMessage]);

  // ── Modify: follow-up request in output stage ────────────────────────────
  const handleModify = useCallback(async () => {
    if (!modifyInput.trim() || isStreaming) return;
    setGenerateDone(false);
    setSystemPrompt(GENERATE_SYSTEM_PROMPT);

    await new Promise((r) => setTimeout(r, 50));
    runMessage(modifyInput.trim());
    setModifyInput('');
    setShowModify(false);
  }, [modifyInput, isStreaming, setSystemPrompt, runMessage]);

  // ── Copy script to clipboard ─────────────────────────────────────────────
  const generatedScript = useMemo(() => {
    if (stage !== 'output') return '';
    // Find the last assistant message
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    if (!lastAssistant) return '';
    return extractPythonScript(lastAssistant.content);
  }, [messages, stage]);

  const explanation = useMemo(() => {
    if (stage !== 'output') return '';
    const assistantMsgs = messages.filter((m) => m.role === 'assistant');
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    if (!lastAssistant) return '';
    return extractExplanation(lastAssistant.content);
  }, [messages, stage]);

  // Also try to extract script from streaming text while streaming
  const streamingScript = useMemo(() => {
    if (!isStreaming || stage !== 'output') return '';
    return extractPythonScript(streamingText);
  }, [isStreaming, streamingText, stage]);

  const handleCopyScript = useCallback(async () => {
    const scriptToCopy = generatedScript || streamingScript;
    if (!scriptToCopy) return;
    try {
      await navigator.clipboard.writeText(scriptToCopy);
      setCopyState(true);
      setTimeout(() => setCopyState(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [generatedScript, streamingScript]);

  // ── Download as .py file ─────────────────────────────────────────────────
  const handleDownloadPy = useCallback(() => {
    const scriptToDownload = generatedScript || streamingScript;
    if (!scriptToDownload) return;
    const blob = new Blob([scriptToDownload], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Generate a filename from the description
    const slug = description.trim().slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'script';
    a.download = `${slug}.py`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [generatedScript, streamingScript, description]);

  // ── Run Preview (stub) ───────────────────────────────────────────────────
  const handleRunPreview = useCallback(async () => {
    const scriptToPreview = generatedScript || streamingScript;
    if (!scriptToPreview) return;
    try {
      const token = localStorage.getItem('openexpert-token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/coding/script-lite/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify({ script: scriptToPreview, data_sample: dataSample }),
      });
      const data = await res.json();
      setPreviewResult(data.message || data.status || 'Preview complete');
    } catch {
      setPreviewResult('Preview endpoint unavailable');
    }
  }, [generatedScript, streamingScript, dataSample]);

  // ── Export handler ───────────────────────────────────────────────────────
  const handleExport = useCallback(
    (format: string) => {
      const allContent = messages
        .map((m) => `**${m.role === 'user' ? 'User' : 'Assistant'}:**\n\n${m.content}`)
        .join('\n\n---\n\n');
      const filename = description.trim().slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'script-lite';
      doExport(format, allContent, filename);
    },
    [messages, description, doExport],
  );

  // ── New Script: full reset ───────────────────────────────────────────────
  const handleNewScript = useCallback(() => {
    clearSession();
    setModule('script-lite');
    setAreaId('coding');
    setThinking('think');
    setCreativity('balanced');
    setPlainTextMode(false);
    setStage('describe');
    setDescription('');
    setDataSample('');
    setConstraints('');
    setParsedQuestions([]);
    setAnswers({});
    setClarifyDone(false);
    setGenerateDone(false);
    setError(null);
    setModifyInput('');
    setShowModify(false);
    setPreviewResult(null);
    setQualityScore(null);
    setScriptSessionId(null);
  }, [clearSession, setModule, setAreaId, setThinking, setCreativity, setPlainTextMode]);

  // ── Determine stage completion for progress indicator ────────────────────
  const stageOrder: Stage[] = ['describe', 'clarify', 'output'];
  const currentIdx = stageOrder.indexOf(stage);

  const hasScript = !!(generatedScript || streamingScript);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <CodingBreadcrumb items={[{ label: 'Script Lite' }]} />

      {/* Header */}
      <div>
        <h1 className="flex items-center gap-3 text-xl font-bold text-adv-white">
          <FileCode className="h-6 w-6 text-adv-green" />
          Script Lite
        </h1>
        <p className="mt-1 text-sm text-adv-gray">
          Generate Python scripts from natural language descriptions
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {[
          { id: 'describe' as Stage, label: 'Describe', num: 1 },
          { id: 'clarify' as Stage, label: 'Clarify', num: 2 },
          { id: 'output' as Stage, label: 'Output', num: 3 },
        ].map(({ id, label, num }, i) => {
          const idx = stageOrder.indexOf(id);
          const isActive = stage === id;
          const isCompleted = currentIdx > idx;
          return (
            <div key={id} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-adv-gray" />}
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-adv-teal text-adv-dark'
                    : isCompleted
                      ? 'bg-adv-green/10 text-adv-green'
                      : 'bg-adv-dark text-adv-gray'
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : null}
                {num}. {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-adv-red hover:text-adv-red/80">
            Dismiss
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Stage 1: Describe                                                  */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {stage === 'describe' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <label className="block text-sm font-medium text-adv-white">
              What should the script do?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Read a CSV of transactions, flag duplicates, and output a clean version..."
              className="mt-2 h-32 w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
          </div>

          <div className="rounded-xl border border-border bg-adv-card p-5">
            <label className="block text-sm font-medium text-adv-white">
              Sample data (optional)
            </label>
            <textarea
              value={dataSample}
              onChange={(e) => setDataSample(e.target.value)}
              placeholder="Paste a few rows of your data so the script can be tailored..."
              className="mt-2 h-24 w-full rounded-lg border border-border bg-adv-dark p-3 font-mono text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
          </div>

          <div className="rounded-xl border border-border bg-adv-card p-5">
            <label className="block text-sm font-medium text-adv-white">
              Constraints (optional)
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g., must use pandas, output as CSV, handle missing values..."
              className="mt-2 h-16 w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
            />
          </div>

          {/* Thinking + Model controls */}
          <div className="rounded-xl border border-border bg-adv-card p-5 space-y-4">
            <h3 className="text-sm font-medium text-adv-white">Analysis Settings</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs text-adv-gray">Thinking Depth</label>
                <ThinkingControls
                  value={thinking}
                  onChange={(v: ThinkingLevel) => setThinking(v)}
                />
              </div>
              <div>
                <label className="mb-2 block text-xs text-adv-gray">Model</label>
                <ModelSelector
                  value={model}
                  onChange={(v: ModelId) => setModel(v)}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleGetQuestions}
            disabled={!description.trim() || isStreaming}
            className="flex items-center gap-2 rounded-lg bg-adv-green px-6 py-2.5 text-sm font-semibold text-white hover:bg-adv-green/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStreaming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                Next: Get Questions
              </>
            )}
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Stage 2: Clarify                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {stage === 'clarify' && (
        <div className="space-y-4">
          {/* Streaming / Conversation Thread for the AI questions */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white mb-3">
              <MessageSquare className="h-4 w-4 text-adv-green" />
              AI Clarifying Questions
            </h3>
            <ConversationThread
              messages={messages}
              streamingText={streamingText}
              streamingThinking={streamingThinking}
              isStreaming={isStreaming}
              moduleId="script-lite"
            />
          </div>

          {/* Parsed questions as input fields — shown after streaming completes */}
          {clarifyDone && parsedQuestions.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
                <Pencil className="h-4 w-4 text-adv-teal" />
                Your Answers
              </h3>
              <p className="mt-1 text-xs text-adv-gray">
                Answer these to help generate a better script. Skipping is OK.
              </p>
              <div className="mt-4 space-y-3">
                {parsedQuestions.map((q, i) => (
                  <div key={i}>
                    <label className="text-xs font-medium text-adv-off-white">
                      {i + 1}. {q}
                    </label>
                    <input
                      type="text"
                      value={answers[q] || ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [q]: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                      placeholder="Your answer..."
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clarify stage had no questions — fallback */}
          {clarifyDone && parsedQuestions.length === 0 && (
            <div className="rounded-xl border border-adv-gold/30 bg-adv-gold/5 p-4 text-sm text-adv-gold">
              No specific questions were generated. You can proceed directly to script generation.
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setStage('describe');
                // We don't clear session here so the user can go back and forth
              }}
              disabled={isStreaming}
              className="rounded-lg bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors border border-border disabled:opacity-50"
            >
              Back
            </button>

            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-2 text-xs text-adv-red hover:bg-adv-red/20 transition-colors"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!clarifyDone}
                className="flex items-center gap-2 rounded-lg bg-adv-green px-6 py-2.5 text-sm font-semibold text-white hover:bg-adv-green/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Code className="h-4 w-4" />
                Generate Script
              </button>
            )}
          </div>

          {/* Status */}
          <StatusIndicator
            inputTokens={lastInputTokens}
            outputTokens={lastOutputTokens}
            cachedTokens={lastCachedTokens}
            cacheCreationTokens={lastCacheCreationTokens}
            model={model}
            isStreaming={isStreaming}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* Stage 3: Output                                                    */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {stage === 'output' && (
        <div className="space-y-4">
          {/* Conversation thread showing the full history */}
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white mb-3">
              <MessageSquare className="h-4 w-4 text-adv-teal" />
              Conversation
            </h3>
            <ConversationThread
              messages={messages}
              streamingText={streamingText}
              streamingThinking={streamingThinking}
              isStreaming={isStreaming}
              moduleId="script-lite"
            />
          </div>

          {/* Code Viewer — show extracted script */}
          {(hasScript || (isStreaming && streamingText)) && (
            <div>
              <CodeViewer
                code={generatedScript || streamingScript || '# Generating script...'}
                language="python"
                filename={
                  (description.trim().slice(0, 30).replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase() || 'script') + '.py'
                }
                maxHeight="600px"
              />
            </div>
          )}

          {/* Explanation text */}
          {generateDone && explanation && (
            <div className="rounded-xl border border-border bg-adv-dark-2 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-adv-gray mb-2">
                Explanation & Usage
              </h4>
              <div className="prose-output max-w-none text-sm text-adv-off-white whitespace-pre-wrap leading-relaxed">
                {explanation}
              </div>
            </div>
          )}

          {/* Preview result banner */}
          {previewResult && (
            <div className="flex items-center gap-2 rounded-lg border border-adv-blue/30 bg-adv-blue/10 px-4 py-3 text-sm text-adv-blue">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{previewResult}</span>
              <button
                onClick={() => setPreviewResult(null)}
                className="ml-auto text-adv-blue hover:text-adv-blue/80 text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopyScript}
              disabled={!hasScript}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copyState ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>

            <button
              onClick={handleDownloadPy}
              disabled={!hasScript}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card px-4 py-2 text-xs text-adv-off-white hover:bg-adv-dark transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-3.5 w-3.5" />
              Download .py
            </button>

            <button
              onClick={handleRunPreview}
              disabled={!hasScript || isStreaming}
              className="flex items-center gap-1.5 rounded-lg bg-adv-card px-4 py-2 text-xs text-adv-off-white hover:bg-adv-dark transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-3.5 w-3.5" />
              Run Preview
            </button>

            {isStreaming ? (
              <button
                onClick={stopStreaming}
                className="flex items-center gap-1.5 rounded-lg bg-adv-red/10 border border-adv-red/30 px-4 py-2 text-xs text-adv-red hover:bg-adv-red/20 transition-colors"
              >
                <Square className="h-3.5 w-3.5" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => {
                  setShowModify(true);
                  setTimeout(() => modifyInputRef.current?.focus(), 100);
                }}
                disabled={!generateDone}
                className="flex items-center gap-1.5 rounded-lg bg-adv-card px-4 py-2 text-xs text-adv-off-white hover:bg-adv-dark transition-colors border border-border disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Pencil className="h-3.5 w-3.5" />
                Modify
              </button>
            )}

            <button
              onClick={handleNewScript}
              className="ml-auto flex items-center gap-1.5 rounded-lg bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors border border-border"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Script
            </button>
          </div>

          {/* Modify input area */}
          {showModify && !isStreaming && (
            <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4 space-y-3">
              <h4 className="text-sm font-medium text-adv-teal">Request Modifications</h4>
              <textarea
                ref={modifyInputRef}
                value={modifyInput}
                onChange={(e) => setModifyInput(e.target.value)}
                placeholder="Describe what you want to change, e.g., 'Add error handling for missing columns' or 'Make it read from Excel instead of CSV'..."
                className="h-20 w-full rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleModify();
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleModify}
                  disabled={!modifyInput.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send Modification
                </button>
                <button
                  onClick={() => {
                    setShowModify(false);
                    setModifyInput('');
                  }}
                  className="rounded-lg bg-adv-dark px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors border border-border"
                >
                  Cancel
                </button>
                <span className="ml-auto self-center text-xs text-adv-gray">
                  Ctrl+Enter to send
                </span>
              </div>
            </div>
          )}

          {/* Quality Score */}
          {generateDone && qualityScore && (
            <QualityScore
              score={qualityScore.score}
              dimensions={qualityScore.dimensions}
            />
          )}

          {/* Export bar */}
          {generateDone && messages.length > 0 && (
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1">
                <ExportBar
                  content={messages.map((m) => `**${m.role === 'user' ? 'User' : 'Assistant'}:**\n\n${m.content}`).join('\n\n---\n\n')}
                  availableFormats={['md', 'docx']}
                  onExport={handleExport}
                  isExporting={isExporting}
                  moduleContext="Script Lite"
                />
              </div>
              {scriptSessionId && (
                <ExportAntonButton
                  type="script-lite"
                  id={scriptSessionId}
                />
              )}
            </div>
          )}

          {/* Status indicator */}
          <StatusIndicator
            inputTokens={lastInputTokens}
            outputTokens={lastOutputTokens}
            cachedTokens={lastCachedTokens}
            cacheCreationTokens={lastCacheCreationTokens}
            model={model}
            isStreaming={isStreaming}
          />
        </div>
      )}
    </div>
  );
}
