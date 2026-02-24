import { useState, useCallback, useRef, useEffect } from 'react';
import { MODULES } from '@/lib/constants';
import type { KnowledgeLibraryEntry } from '@/lib/types';
import {
  Upload,
  FileSpreadsheet,
  Settings,
  Play,
  ArrowRight,
  ArrowLeft,
  X,
  Plus,
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  Square,
  ChevronDown,
  ChevronRight,
  Zap,
  BarChart2,
  Cpu,
} from 'lucide-react';

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

interface BatchModel {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

const BATCH_MODELS: BatchModel[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Quick',
    subtitle: 'Haiku — fastest & cheapest',
    icon: <Zap className="h-4 w-4 text-adv-teal" />,
    inputCostPer1M: 0.8,
    outputCostPer1M: 4,
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Balanced',
    subtitle: 'Sonnet — quality analysis',
    icon: <BarChart2 className="h-4 w-4 text-adv-blue" />,
    inputCostPer1M: 3,
    outputCostPer1M: 15,
  },
  {
    id: 'claude-opus-4-6',
    label: 'Thorough',
    subtitle: 'Opus — best quality',
    icon: <Cpu className="h-4 w-4 text-adv-gold" />,
    inputCostPer1M: 15,
    outputCostPer1M: 75,
  },
];

type RowStatus = 'pending' | 'running' | 'done' | 'error';

interface RowResult {
  output?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  status: RowStatus;
  expanded?: boolean;
}

export default function BatchCreatePage() {
  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(BATCH_MODELS[0].id);

  const [isRunning, setIsRunning] = useState(false);
  const [rowResults, setRowResults] = useState<RowResult[]>([]);
  const [currentRow, setCurrentRow] = useState(-1);
  const [isDone, setIsDone] = useState(false);
  const [totalInputTokens, setTotalInputTokens] = useState(0);
  const [totalOutputTokens, setTotalOutputTokens] = useState(0);

  const [moduleSystemPrompt, setModuleSystemPrompt] = useState('');
  const [libraryEntries, setLibraryEntries] = useState<KnowledgeLibraryEntry[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [showLibrarySources, setShowLibrarySources] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const getAuthHeader = (): Record<string, string> => {
    const token = localStorage.getItem('openexpert-token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  useEffect(() => {
    if (!selectedModuleId) { setModuleSystemPrompt(''); return; }
    fetch(`/api/modules/${selectedModuleId}/prompt`, { credentials: 'include', headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then((d: { prompt: string } | null) => setModuleSystemPrompt(d?.prompt ?? ''))
      .catch(() => {});
  }, [selectedModuleId]);

  useEffect(() => {
    fetch('/api/knowledge-library', { credentials: 'include', headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setLibraryEntries)
      .catch(() => {});
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const p = parseCSV(text);
      setParsed(p);
      setRowResults(p.rows.map(() => ({ status: 'pending' })));
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.name.endsWith('.csv')) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const p = parseCSV(text);
      setParsed(p);
      setRowResults(p.rows.map(() => ({ status: 'pending' })));
    };
    reader.readAsText(file);
  }, []);

  const insertColumn = (col: string) => {
    setMessageTemplate((prev) => prev + `{{${col}}}`);
  };

  const handleClearFile = () => {
    setCsvFile(null);
    setParsed(null);
    setStep(1);
    resetRunState();
  };

  const resetRunState = () => {
    setIsRunning(false);
    setRowResults(parsed?.rows.map(() => ({ status: 'pending' })) ?? []);
    setCurrentRow(-1);
    setIsDone(false);
    setTotalInputTokens(0);
    setTotalOutputTokens(0);
  };

  const handleStopBatch = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const handleRunBatch = async () => {
    if (!parsed) return;

    setIsRunning(true);
    setIsDone(false);
    setCurrentRow(-1);
    setTotalInputTokens(0);
    setTotalOutputTokens(0);
    setRowResults(parsed.rows.map(() => ({ status: 'pending' })));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/batch/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rows: parsed.rows,
          headers: parsed.headers,
          template: messageTemplate,
          systemPrompt: systemPromptOverride.trim() || moduleSystemPrompt || undefined,
          model: selectedModelId,
          maxTokens: 2048,
          knowledgeLibraryIds: selectedLibraryIds,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error || 'Server error');
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine.slice(6)) as {
              type: string;
              rowIndex?: number;
              total?: number;
              output?: string;
              error?: string;
              inputTokens?: number;
              outputTokens?: number;
              successCount?: number;
              errorCount?: number;
              totalInputTokens?: number;
              totalOutputTokens?: number;
            };

            if (event.type === 'progress' && event.rowIndex !== undefined) {
              setCurrentRow(event.rowIndex);
              setRowResults((prev) => {
                const next = [...prev];
                next[event.rowIndex!] = { ...next[event.rowIndex!], status: 'running' };
                return next;
              });
            } else if (event.type === 'result' && event.rowIndex !== undefined) {
              setRowResults((prev) => {
                const next = [...prev];
                next[event.rowIndex!] = {
                  status: 'done',
                  output: event.output,
                  inputTokens: event.inputTokens,
                  outputTokens: event.outputTokens,
                };
                return next;
              });
            } else if (event.type === 'error' && event.rowIndex !== undefined) {
              setRowResults((prev) => {
                const next = [...prev];
                next[event.rowIndex!] = { status: 'error', error: event.error };
                return next;
              });
            } else if (event.type === 'done') {
              setTotalInputTokens(event.totalInputTokens ?? 0);
              setTotalOutputTokens(event.totalOutputTokens ?? 0);
              setIsDone(true);
              setIsRunning(false);
              setCurrentRow(-1);
            }
          } catch {
            // malformed SSE chunk — skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[batch] run error:', err);
      }
      setIsRunning(false);
    }
  };

  const toggleRowExpanded = (i: number) => {
    setRowResults((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], expanded: !next[i].expanded };
      return next;
    });
  };

  const handleDownloadCSV = () => {
    if (!parsed) return;
    const headerRow = [...parsed.headers, 'Output', 'Status', 'Input Tokens', 'Output Tokens'];
    const dataRows = parsed.rows.map((row, i) => {
      const result = rowResults[i];
      const output = result?.output ?? result?.error ?? '';
      const status = result?.status ?? 'pending';
      return [
        ...row,
        `"${output.replace(/"/g, '""')}"`,
        status,
        String(result?.inputTokens ?? ''),
        String(result?.outputTokens ?? ''),
      ];
    });
    const csv = [headerRow.join(','), ...dataRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalRows = parsed?.rows.length ?? 0;
  const selectedModule = MODULES.find((m) => m.id === selectedModuleId);
  const selectedModel = BATCH_MODELS.find((m) => m.id === selectedModelId)!;
  const canProceedStep1 = parsed && parsed.headers.length > 0 && totalRows > 0;
  const canProceedStep2 = selectedModuleId && messageTemplate.trim().length > 0;

  // Cost estimate (rough: ~300 chars/row input + ~1500 chars output, scaled by template)
  const avgInputChars = (messageTemplate.length + 200) * 1.2;
  const avgOutputChars = 1500;
  const estimatedInputTokens = totalRows * (avgInputChars / 4);
  const estimatedOutputTokens = totalRows * (avgOutputChars / 4);
  const estimatedCost =
    (estimatedInputTokens / 1_000_000) * selectedModel.inputCostPer1M +
    (estimatedOutputTokens / 1_000_000) * selectedModel.outputCostPer1M;

  const doneCount = rowResults.filter((r) => r.status === 'done').length;
  const errorCount = rowResults.filter((r) => r.status === 'error').length;

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal/10">
            <FileSpreadsheet className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-adv-white">Batch Create</h1>
            <p className="text-xs text-adv-gray">
              Upload a CSV, configure a prompt template, and run the same analysis for every row.
            </p>
          </div>
        </div>
      </div>

      {/* Step indicators */}
      <div className="mb-6 flex items-center gap-3">
        {[
          { n: 1, label: 'Upload CSV', icon: Upload },
          { n: 2, label: 'Configure', icon: Settings },
          { n: 3, label: 'Run', icon: Play },
        ].map(({ n, label, icon: Icon }) => (
          <div key={n} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (n < step && !isRunning) setStep(n);
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                n === step
                  ? 'border-adv-teal bg-adv-teal/10 text-adv-teal'
                  : n < step
                  ? 'cursor-pointer border-adv-teal/30 bg-adv-teal-dim text-adv-teal'
                  : 'cursor-default border-border bg-adv-dark text-adv-gray-med'
              }`}
            >
              {n < step ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {label}
            </button>
            {n < 3 && <ArrowRight className="h-3 w-3 text-adv-gray-med" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-auto">

        {/* ─── Step 1: Upload CSV ─── */}
        {step === 1 && (
          <div className="space-y-4">
            {!csvFile ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-adv-card py-16 transition-colors hover:border-adv-teal/50"
              >
                <Upload className="mb-3 h-8 w-8 text-adv-gray-med" />
                <p className="mb-1 text-sm font-medium text-adv-off-white">Drop a CSV file here</p>
                <p className="mb-4 text-xs text-adv-gray-med">or click to browse</p>
                <label className="cursor-pointer rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                  Choose File
                  <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
                </label>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-adv-card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-adv-teal" />
                    <span className="text-sm font-medium text-adv-off-white">{csvFile.name}</span>
                    <span className="text-xs text-adv-gray-med">
                      {parsed?.headers.length} columns · {totalRows} rows
                    </span>
                  </div>
                  <button
                    onClick={handleClearFile}
                    className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {parsed && parsed.headers.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-adv-dark">
                          {parsed.headers.map((h, i) => (
                            <th key={i} className="px-3 py-2 text-left font-medium text-adv-gray">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.rows.slice(0, 5).map((row, ri) => (
                          <tr key={ri} className="border-b border-border last:border-0">
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="max-w-[200px] truncate px-3 py-2 text-adv-off-white"
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {totalRows > 5 && (
                      <div className="border-t border-border bg-adv-dark px-3 py-1.5 text-[10px] text-adv-gray-med">
                        Showing 5 of {totalRows} rows
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── Step 2: Configure ─── */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Model selector */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="mb-1 text-sm font-semibold text-adv-white">Model</h3>
              <p className="mb-3 text-xs text-adv-gray">
                Choose speed vs. quality. Haiku is fastest and cheapest for large batches.
              </p>
              <div className="grid grid-cols-3 gap-3">
                {BATCH_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModelId(m.id)}
                    className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors ${
                      selectedModelId === m.id
                        ? 'border-adv-teal bg-adv-teal/10'
                        : 'border-border bg-adv-dark hover:border-adv-teal/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {m.icon}
                      <span className="text-sm font-medium text-adv-off-white">{m.label}</span>
                    </div>
                    <span className="text-[11px] text-adv-gray">{m.subtitle}</span>
                    <span className="text-[10px] text-adv-gray-med">
                      ${m.inputCostPer1M}/${m.outputCostPer1M} per 1M tokens
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Module selector */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="mb-1 text-sm font-semibold text-adv-white">Module (optional)</h3>
              <p className="mb-3 text-xs text-adv-gray">
                Select a module to use its system prompt as the base, or write your own below.
              </p>
              <select
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
              >
                <option value="">-- None (use custom system prompt) --</option>
                {MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {selectedModule && (
                <p className="mt-2 text-xs text-adv-gray">{selectedModule.description}</p>
              )}
            </div>

            {/* Message template */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="mb-1 text-sm font-semibold text-adv-white">Message Template</h3>
              <p className="mb-3 text-xs text-adv-gray">
                Write your prompt. Use{' '}
                <code className="rounded bg-adv-dark px-1 py-0.5 font-mono text-adv-teal">
                  {'{{column_name}}'}
                </code>{' '}
                to insert values from each row.
              </p>
              {parsed && parsed.headers.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-adv-gray-med">
                    Click to insert column
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.headers.map((col) => (
                      <button
                        key={col}
                        onClick={() => insertColumn(col)}
                        className="flex items-center gap-1 rounded border border-adv-teal/30 bg-adv-teal-dim px-2 py-1 text-[11px] font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder={`e.g. Analyze the AML policy for {{company_name}} in {{jurisdiction}}. Focus on {{risk_area}}.`}
                className="w-full resize-none rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
                rows={5}
              />
            </div>

            {/* System prompt override (collapsed by default) */}
            <div className="rounded-xl border border-border bg-adv-card">
              <button
                onClick={() => setShowSystemPrompt((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-adv-off-white"
              >
                <span>Custom System Prompt (optional)</span>
                {showSystemPrompt ? (
                  <ChevronDown className="h-4 w-4 text-adv-gray" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-adv-gray" />
                )}
              </button>
              {showSystemPrompt && (
                <div className="border-t border-border px-5 pb-4 pt-3">
                  <p className="mb-2 text-xs text-adv-gray">
                    Override the system prompt for all rows. Leave blank to use the selected module's
                    prompt or a default FCP expert prompt.
                  </p>
                  <textarea
                    value={systemPromptOverride}
                    onChange={(e) => setSystemPromptOverride(e.target.value)}
                    placeholder="You are a compliance expert specialised in..."
                    className="w-full resize-none rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
                    rows={4}
                  />
                  {selectedModuleId && !systemPromptOverride.trim() && moduleSystemPrompt && (
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-xs px-2 py-0.5 bg-adv-teal/20 text-adv-teal rounded-full border border-adv-teal/30">
                        Using {MODULES.find(m => m.id === selectedModuleId)?.label ?? selectedModuleId} system prompt
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Knowledge Sources (optional) */}
            <div className="rounded-xl border border-border bg-adv-card px-5 py-3">
              <button
                type="button"
                onClick={() => setShowLibrarySources(prev => !prev)}
                className="flex items-center gap-2 text-sm text-adv-gray hover:text-adv-off-white"
              >
                <span>{showLibrarySources ? '\u25BC' : '\u25B6'}</span>
                Knowledge Sources (optional)
                {selectedLibraryIds.length > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-adv-teal/20 text-adv-teal rounded-full">
                    {selectedLibraryIds.length} selected
                  </span>
                )}
              </button>
              {showLibrarySources && (
                <div className="mt-2 space-y-2">
                  {libraryEntries.length === 0 ? (
                    <p className="text-xs text-adv-gray">No knowledge corpora registered. Add them in Settings &rarr; Knowledge Library.</p>
                  ) : (
                    libraryEntries.map(entry => (
                      <label key={entry.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedLibraryIds.includes(entry.id)}
                          onChange={e => setSelectedLibraryIds(prev =>
                            e.target.checked ? [...prev, entry.id] : prev.filter(id => id !== entry.id)
                          )}
                          className="accent-adv-teal"
                        />
                        <span className="text-sm text-adv-off-white">{entry.label}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-adv-card rounded text-adv-gray">{entry.category}</span>
                        {entry.file_count != null && (
                          <span className="text-xs text-adv-gray">{entry.file_count} files</span>
                        )}
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Cost estimate */}
            {messageTemplate.trim() && totalRows > 0 && (
              <div className="rounded-lg border border-border bg-adv-dark px-4 py-2.5 text-xs text-adv-gray">
                <span className="font-medium text-adv-off-white">Estimated cost: </span>~$
                {estimatedCost.toFixed(3)} · ~
                {Math.round(estimatedInputTokens / 1000)}k input + ~
                {Math.round(estimatedOutputTokens / 1000)}k output tokens across {totalRows} rows
              </div>
            )}
          </div>
        )}

        {/* ─── Step 3: Run ─── */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Summary card */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-adv-white">Batch Summary</h3>
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="rounded-lg border border-border bg-adv-dark px-3 py-3">
                  <div className="text-lg font-bold text-adv-teal">{totalRows}</div>
                  <div className="text-[10px] uppercase tracking-wider text-adv-gray-med">Rows</div>
                </div>
                <div className="rounded-lg border border-border bg-adv-dark px-3 py-3">
                  <div className="flex items-center justify-center gap-1 text-base font-bold text-adv-off-white">
                    {selectedModel.icon}
                    <span>{selectedModel.label}</span>
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-adv-gray-med">Model</div>
                </div>
                <div className="rounded-lg border border-border bg-adv-dark px-3 py-3">
                  <div className="text-lg font-bold text-adv-off-white">
                    ~${estimatedCost.toFixed(2)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-adv-gray-med">
                    Est. Cost
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-adv-dark px-3 py-3">
                  <div className="text-lg font-bold text-adv-off-white">
                    ~{Math.round((estimatedInputTokens + estimatedOutputTokens) / 1000)}k
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-adv-gray-med">
                    Tokens
                  </div>
                </div>
              </div>
            </div>

            {/* Run controls */}
            <div className="rounded-xl border border-border bg-adv-card p-5">
              {/* Not started */}
              {!isRunning && !isDone && (
                <div className="flex flex-col items-center gap-4 py-4">
                  <p className="text-sm text-adv-gray">
                    Ready to process{' '}
                    <span className="font-medium text-adv-off-white">{totalRows}</span> rows with{' '}
                    <span className="font-medium text-adv-off-white">{selectedModel.subtitle}</span>.
                  </p>
                  <button
                    onClick={() => void handleRunBatch()}
                    className="flex items-center gap-2 rounded-lg bg-adv-teal px-6 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Run Batch ({totalRows} items)
                  </button>
                </div>
              )}

              {/* Running */}
              {isRunning && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-adv-gray">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-adv-teal" />
                      Processing row {currentRow + 1} of {totalRows}...
                    </span>
                    <span>
                      {doneCount + errorCount} / {totalRows}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-adv-dark">
                    <div
                      className="h-full rounded-full bg-adv-teal transition-all duration-300"
                      style={{
                        width: `${totalRows > 0 ? ((doneCount + errorCount) / totalRows) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={handleStopBatch}
                      className="flex items-center gap-1.5 rounded-lg border border-adv-red/40 bg-adv-red/10 px-3 py-1.5 text-xs font-medium text-adv-red hover:bg-adv-red/20 transition-colors"
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {/* Done */}
              {isDone && !isRunning && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-adv-green">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {doneCount} succeeded
                      </span>
                      {errorCount > 0 && (
                        <span className="flex items-center gap-1 text-adv-red">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {errorCount} failed
                        </span>
                      )}
                      <span className="text-adv-gray-med">
                        {totalInputTokens.toLocaleString()} in + {totalOutputTokens.toLocaleString()}{' '}
                        out tokens
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={resetRunState}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
                      >
                        Run Again
                      </button>
                      <button
                        onClick={handleDownloadCSV}
                        className="flex items-center gap-1.5 rounded-lg border border-adv-teal bg-adv-teal/10 px-4 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download CSV
                      </button>
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-adv-dark">
                    <div className="h-full w-full rounded-full bg-adv-teal" />
                  </div>
                </div>
              )}
            </div>

            {/* Results table */}
            {(isRunning || isDone || rowResults.some((r) => r.status !== 'pending')) && parsed && (
              <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
                <div className="border-b border-border bg-adv-dark px-4 py-2.5 text-[10px] font-medium uppercase tracking-wider text-adv-gray-med">
                  Results
                </div>
                <div className="divide-y divide-border">
                  {parsed.rows.map((row, ri) => {
                    const result = rowResults[ri] ?? { status: 'pending' };
                    return (
                      <div key={ri} className="text-xs">
                        <div
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-adv-dark/50 cursor-pointer"
                          onClick={() => result.status === 'done' && toggleRowExpanded(ri)}
                        >
                          {/* Row number */}
                          <span className="w-5 shrink-0 text-right text-adv-gray-med">
                            {ri + 1}
                          </span>

                          {/* First 2 columns as identifiers */}
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {row.slice(0, 2).map((cell, ci) => (
                              <span
                                key={ci}
                                className="max-w-[180px] truncate text-adv-off-white"
                                title={cell}
                              >
                                {cell}
                              </span>
                            ))}
                          </div>

                          {/* Token count (done rows) */}
                          {result.status === 'done' && (
                            <span className="shrink-0 text-adv-gray-med">
                              {result.outputTokens?.toLocaleString()} tok
                            </span>
                          )}

                          {/* Status badge */}
                          <div className="shrink-0">
                            {result.status === 'pending' && (
                              <span className="text-adv-gray-med">Pending</span>
                            )}
                            {result.status === 'running' && (
                              <span className="flex items-center gap-1 text-adv-teal">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Running
                              </span>
                            )}
                            {result.status === 'done' && (
                              <span className="flex items-center gap-1 text-adv-green">
                                <CheckCircle2 className="h-3 w-3" />
                                Done
                              </span>
                            )}
                            {result.status === 'error' && (
                              <span className="flex items-center gap-1 text-adv-red">
                                <AlertCircle className="h-3 w-3" />
                                Error
                              </span>
                            )}
                          </div>

                          {/* Expand chevron for done rows */}
                          {result.status === 'done' && (
                            <span className="shrink-0 text-adv-gray-med">
                              {result.expanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </span>
                          )}
                        </div>

                        {/* Expanded output */}
                        {result.expanded && result.output && (
                          <div className="border-t border-border bg-adv-dark/40 px-4 py-3">
                            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-adv-off-white">
                              {result.output}
                            </pre>
                          </div>
                        )}

                        {/* Error message */}
                        {result.status === 'error' && result.error && (
                          <div className="border-t border-border bg-adv-red/5 px-4 py-2 text-adv-red">
                            {result.error}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {step <= 2 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 ? !canProceedStep1 : !canProceedStep2}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {step === 3 && (
        <div className="mt-6 flex items-center justify-start">
          <button
            onClick={() => {
              if (!isRunning) setStep(2);
            }}
            disabled={isRunning}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Configure
          </button>
        </div>
      )}
    </div>
  );
}
