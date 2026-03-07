import { useState, useRef, useCallback } from 'react';
import {
  TrendingUp,
  Sparkles,
  Copy,
  Download,
  Square,
  Image,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { streamMessage } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────

type ChartType = 'bar' | 'line' | 'area' | 'pie';

interface ChartConfig {
  type: ChartType;
  title: string;
  xKey?: string;
  yKey?: string;
  dataKey?: string;
  nameKey?: string;
  data: Record<string, unknown>[];
  color: string;
}

interface ParsedInsights {
  charts: ChartConfig[];
  summary: string;
}

// ── System Prompt ────────────────────────────────────────────

const DATA_INSIGHTS_SYSTEM_PROMPT = `You are a data visualization expert. The user will provide you with data and a question.

Analyze the data and respond with a JSON object followed by a narrative explanation.

Your response MUST start with a JSON block in this exact format:
\`\`\`json
{
  "charts": [
    {
      "type": "bar",
      "title": "Chart title",
      "xKey": "keyName",
      "yKey": "keyName",
      "data": [{"keyName": "label", "keyName": 42}],
      "color": "#2DD4A8"
    }
  ],
  "summary": "2-3 sentence narrative summary of key findings"
}
\`\`\`

For pie charts use this format:
\`\`\`json
{
  "charts": [
    {
      "type": "pie",
      "title": "Chart title",
      "dataKey": "value",
      "nameKey": "name",
      "data": [{"name": "Category A", "value": 42}],
      "color": "#2DD4A8"
    }
  ],
  "summary": "..."
}
\`\`\`

After the JSON block, provide a detailed narrative analysis in markdown.

Rules:
- Include 1-3 charts maximum
- Data arrays should have 3-50 points maximum
- Use descriptive titles
- Clean and normalize the data (remove nulls, format numbers)
- For time series, sort chronologically
- Color suggestions: trends=#2DD4A8 (teal), warnings=#F5A623 (gold), categories=#3498DB (blue), risks=#E74C3C (red)
- The type field must be one of: bar, line, area, pie`;

// ── Helpers ──────────────────────────────────────────────────

function extractChartData(text: string): ParsedInsights | null {
  // Try fenced json block first (flexible whitespace)
  const fencedMatch = text.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1]) as ParsedInsights;
    } catch {
      // fall through to raw JSON attempt
    }
  }
  // Try finding a raw JSON object with "charts" key
  const rawMatch = text.match(/\{[\s\S]*"charts"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (rawMatch) {
    try {
      return JSON.parse(rawMatch[0]) as ParsedInsights;
    } catch {
      return null;
    }
  }
  return null;
}

function stripJsonBlock(text: string): string {
  return text.replace(/```json\n[\s\S]*?\n```\n?/, '').trim();
}

function csvFromData(charts: ChartConfig[]): string {
  if (charts.length === 0) return '';
  const chart = charts[0];
  if (!chart.data || chart.data.length === 0) return '';
  const keys = Object.keys(chart.data[0]);
  const header = keys.join(',');
  const rows = chart.data.map((row) => keys.map((k) => String(row[k] ?? '')).join(','));
  return [header, ...rows].join('\n');
}

// ── Custom Tooltip ────────────────────────────────────────────

interface TooltipPayload {
  name?: string;
  value?: number | string;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{ background: '#152238', border: '1px solid #2DD4A8', borderRadius: 6, padding: '8px 12px' }}
    >
      {label && <p style={{ color: '#B0B0B0', fontSize: 12, marginBottom: 4 }}>{String(label)}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#2DD4A8', fontSize: 13, margin: 0 }}>
          {p.name ? `${p.name}: ` : ''}{String(p.value ?? '')}
        </p>
      ))}
    </div>
  );
}

// ── PIE colors ───────────────────────────────────────────────

const PIE_COLORS = ['#2DD4A8', '#3498DB', '#F5A623', '#E74C3C', '#27AE60', '#9B59B6', '#1ABC9C', '#E67E22'];

// ── Chart renderer ────────────────────────────────────────────

function RenderChart({ chart }: { chart: ChartConfig }) {
  const xKey = chart.xKey ?? 'x';
  const yKey = chart.yKey ?? 'y';

  switch (chart.type) {
    case 'area':
      return (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chart.data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id={`grad-${chart.title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chart.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#152238" />
            <XAxis dataKey={xKey} tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={yKey}
              stroke={chart.color}
              strokeWidth={2}
              fill={`url(#grad-${chart.title})`}
              dot={false}
              activeDot={{ r: 4, fill: chart.color, stroke: '#0B1426', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      );

    case 'line':
      return (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chart.data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#152238" />
            <XAxis dataKey={xKey} tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke={chart.color}
              strokeWidth={2}
              dot={{ r: 3, fill: chart.color }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      );

    case 'pie': {
      const dataKey = chart.dataKey ?? 'value';
      const nameKey = chart.nameKey ?? 'name';
      return (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chart.data}
              dataKey={dataKey}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label={({ name, percent }: { name?: string; percent?: number }) =>
                `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
              }
              labelLine={false}
            >
              {chart.data.map((_entry, index) => (
                <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value: string) => (
                <span style={{ color: '#B0B0B0', fontSize: 12 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    case 'bar':
    default:
      return (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chart.data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#152238" />
            <XAxis dataKey={xKey} tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#707070', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey={yKey} fill={chart.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      );
  }
}

// ── Chart download helper ────────────────────────────────────

function downloadChartAsPng(container: HTMLDivElement, title: string) {
  const svg = container.querySelector('svg');
  if (!svg) return;

  const scale = 2; // 2x for crisp exports
  const svgRect = svg.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = svgRect.width * scale;
  canvas.height = svgRect.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // White background
  ctx.fillStyle = '#0B1426';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);

  const svgData = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  const img = new window.Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.png`;
    a.click();
  };
  img.src = url;
}

function ChartCard({ chart }: { chart: ChartConfig }) {
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <div className="rounded-xl border border-border bg-adv-card p-5 shadow-lg">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-adv-off-white">{chart.title}</h3>
        <button
          onClick={() => chartRef.current && downloadChartAsPng(chartRef.current, chart.title)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
          title="Download as PNG"
        >
          <Image className="h-3.5 w-3.5" />
          PNG
        </button>
      </div>
      <div ref={chartRef}>
        <RenderChart chart={chart} />
      </div>
    </div>
  );
}

// ── Example chips ─────────────────────────────────────────────

const EXAMPLE_CHIPS = [
  'Show trends over time',
  'Compare by category',
  'Highlight outliers',
  'Show distribution',
  'Timeline view',
];

// ── Main page ─────────────────────────────────────────────────

export default function DataInsightsPage() {
  const [transparencyLevel, setTransparencyLevel] = useState<0 | 1 | 2>(0);
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [pastedData, setPastedData] = useState('');
  const [question, setQuestion] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [parsedCharts, setParsedCharts] = useState<ChartConfig[]>([]);
  const [narrative, setNarrative] = useState('');
  const [summary, setSummary] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedContent, setUploadedContent] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    setErrorMsg('');

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      // Binary files — upload to server for text extraction
      try {
        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('openexpert-token');
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) throw new Error('Upload failed');
        const result = await res.json() as { extractedText?: string };
        if (result.extractedText) {
          setUploadedContent(result.extractedText);
        } else {
          setErrorMsg('Could not extract text from this Excel file.');
        }
      } catch (err) {
        console.error('[data-insights] xlsx upload error:', err);
        setErrorMsg('Failed to process Excel file. Try converting to CSV first.');
      }
    } else {
      // Text files (csv, txt) — read locally
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedContent(String(ev.target?.result ?? ''));
      };
      reader.readAsText(file);
    }
  };

  const effectiveData = activeTab === 'paste' ? pastedData : uploadedContent;

  const handleRun = async () => {
    if (isRunning) return;
    if (!effectiveData.trim()) {
      setErrorMsg('Please paste or upload data first.');
      return;
    }
    if (!question.trim()) {
      setErrorMsg('Please describe what you would like to see.');
      return;
    }

    setErrorMsg('');
    setIsRunning(true);
    setStreamingText('');
    setParsedCharts([]);
    setNarrative('');
    setSummary('');

    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage = `## Data\n\`\`\`\n${effectiveData.trim()}\n\`\`\`\n\n## Question\n${question.trim()}`;

    let fullText = '';

    try {
      // Try Sonnet first (fast, cheap, great for data viz). Fall back to Opus on failure.
      const modelsToTry = ['claude-sonnet-4-5-20250929', 'claude-opus-4-6'] as const;
      let streamError = '';
      let usedModel = '';

      for (const tryModel of modelsToTry) {
        fullText = '';
        streamError = '';
        usedModel = tryModel;

        const stream = streamMessage(
          {
            model: tryModel,
            thinking: 'think',
            creativity: 'balanced',
            systemPrompt: DATA_INSIGHTS_SYSTEM_PROMPT,
            userMessage,
            history: [],
            outputFormats: [],
            knowledgeSources: {
              modes: {
                claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
                onlineReference: { enabled: false, urls: [], fetchDepth: 'summary' },
                localFolder: { enabled: false, folderPaths: [], fileFilter: [], recursive: false },
                combinedMode: { enabled: false, priority: 'merged', instructions: '' },
              },
            },
            selectedPersonas: [],
            selectedSkills: [],
            multiPerspective: false,
            metaCognitiveEnabled: false,
            transparencyLevel,
          },
          controller.signal
        );

        for await (const event of stream) {
          if (event.type === 'text_delta') {
            fullText += event.content;
            setStreamingText(fullText);
          } else if (event.type === 'error') {
            streamError = (event as { type: 'error'; message: string }).message || 'Unknown error';
            break;
          } else if (event.type === 'stream_end') {
            // Fallback: extract text from contentBlocks if streaming produced no text_delta events
            if (!fullText.trim()) {
              const endEvent = event as { type: 'stream_end'; contentBlocks?: Array<{ type: string; content: string }> };
              const textBlocks = endEvent.contentBlocks?.filter((b) => b.type === 'text') ?? [];
              fullText = textBlocks.map((b) => b.content).join('\n');
            }
            break;
          }
        }

        // If we got text, stop trying models
        if (fullText.trim()) break;

        // If overloaded, try next model
        if (streamError.includes('overloaded') || streamError.includes('Overloaded')) {
          console.log(`[data-insights] ${tryModel} overloaded, trying next model...`);
          setStreamingText('Model busy, trying alternative...');
          continue;
        }

        // Other errors — don't retry
        if (streamError) break;
      }

      if (streamError && !fullText.trim()) {
        // Parse the error for a cleaner message
        let cleanError = streamError;
        try {
          const parsed = JSON.parse(streamError);
          cleanError = parsed?.error?.message || parsed?.message || streamError;
        } catch {
          // use raw string
        }
        if (cleanError.includes('overloaded') || cleanError.includes('Overloaded')) {
          setErrorMsg('The AI models are currently overloaded. Please wait a moment and try again.');
        } else {
          setErrorMsg(`API error: ${cleanError}`);
        }
      } else {
        const parsed = extractChartData(fullText);
        if (parsed && parsed.charts && parsed.charts.length > 0) {
          setParsedCharts(parsed.charts);
          setSummary(parsed.summary ?? '');
          setNarrative(stripJsonBlock(fullText));
        } else if (fullText.trim()) {
          // Claude responded but no charts — show narrative with info message
          setNarrative(fullText);
          setErrorMsg('No charts were generated. Claude provided a text analysis instead. Try rephrasing your question (e.g. "show a bar chart of...").');
        } else {
          setErrorMsg('No response received. Check that your API key is configured and the server is running.');
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = (err as Error).message || 'Unknown error';
        setErrorMsg(`Request failed: ${msg}`);
      }
    } finally {
      setStreamingText('');
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleCopyData = () => {
    navigator.clipboard.writeText(effectiveData).catch(() => {});
  };

  const handleDownloadCSV = () => {
    const csv = csvFromData(parsedCharts);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart-data.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasOutput = parsedCharts.length > 0 || narrative;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-blue/10">
          <TrendingUp className="h-5 w-5 text-adv-blue" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-adv-off-white">Data Insights</h1>
          <p className="text-sm text-adv-gray">Transform your data into visual intelligence</p>
        </div>
      </div>

      {/* Input section */}
      <div className="rounded-xl border border-border bg-adv-card p-5 shadow-lg">
        {/* Tab bar */}
        <div className="mb-4 flex gap-2 border-b border-border pb-3">
          <button
            onClick={() => setActiveTab('paste')}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'paste'
                ? 'bg-adv-teal-dim text-adv-teal'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Paste Data
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'bg-adv-teal-dim text-adv-teal'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            Upload File
          </button>
        </div>

        {activeTab === 'paste' ? (
          <textarea
            value={pastedData}
            onChange={(e) => setPastedData(e.target.value)}
            placeholder="Paste CSV, table, or structured data here...&#10;&#10;Example:&#10;Month,SAR Count,Value (EUR)&#10;Jan 2024,12,450000&#10;Feb 2024,18,820000"
            rows={8}
            className="w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-4 py-3 font-mono text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-adv-dark-2 px-6 py-10 text-center">
            <input
              type="file"
              accept=".csv,.xlsx,.txt"
              onChange={handleFileUpload}
              className="hidden"
              id="data-file-input"
            />
            <label
              htmlFor="data-file-input"
              className="cursor-pointer rounded-lg border border-adv-teal px-4 py-2 text-sm text-adv-teal transition-colors hover:bg-adv-teal-dim"
            >
              Choose file
            </label>
            <p className="mt-2 text-xs text-adv-gray">Accepts .csv, .xlsx, .txt</p>
            {uploadedFileName && (
              <div className="mt-3">
                <p className="text-sm text-adv-off-white">
                  Loaded: <span className="font-semibold">{uploadedFileName}</span>
                  {uploadedContent && (
                    <span className="ml-2 text-xs text-adv-gray">
                      ({uploadedContent.split('\n').length} rows, {Math.round(uploadedContent.length / 1024)}KB)
                    </span>
                  )}
                </p>
                {uploadedContent && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded border border-border bg-adv-dark p-2 text-xs text-adv-gray font-mono">
                    {uploadedContent.split('\n').slice(0, 5).join('\n')}
                    {uploadedContent.split('\n').length > 5 && '\n...'}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* Question input */}
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
            What would you like to see?
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Show trends over time, compare by category..."
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            onKeyDown={(e) => { if (e.key === 'Enter') { void handleRun(); } }}
          />

          {/* Example chips */}
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setQuestion(chip)}
                className="rounded-full border border-border bg-adv-dark-2 px-3 py-1 text-xs text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {/* Transparency toggle */}
        <div className="mt-3 space-y-1">
          <div className="text-[11px] text-adv-gray">Transparency</div>
          <div className="flex gap-1.5">
            {([
              { level: 0 as const, label: 'Off' },
              { level: 1 as const, label: 'Summary' },
              { level: 2 as const, label: 'Detailed' },
            ]).map(({ level, label }) => (
              <button
                key={level}
                type="button"
                onClick={() => setTransparencyLevel(level)}
                className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  transparencyLevel === level
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border bg-adv-dark text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Model note */}
        <p className="mt-3 text-xs text-adv-gray">
          Anton will analyze your data and generate interactive charts using Claude Opus 4.6.
        </p>

        {/* Error */}
        {errorMsg && (
          <p className="mt-2 rounded bg-adv-red/10 px-3 py-2 text-sm text-adv-red">{errorMsg}</p>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex gap-3">
          {isRunning ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 rounded-lg bg-adv-red px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-600"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={() => { void handleRun(); }}
              className="flex items-center gap-2 rounded-lg bg-adv-blue px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              <Sparkles className="h-4 w-4" />
              Generate Insights
            </button>
          )}
        </div>
      </div>

      {/* Streaming indicator */}
      {isRunning && (
        <div className="rounded-xl border border-adv-teal-dim bg-adv-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-adv-teal" />
            <span className="text-xs text-adv-teal">Anton is analyzing your data...</span>
          </div>
          {streamingText && (
            <div className="max-h-32 overflow-hidden text-xs text-adv-gray font-mono">
              {streamingText.slice(-300)}
            </div>
          )}
        </div>
      )}

      {/* Output section */}
      {hasOutput && (
        <div className="space-y-6">
          {/* Summary */}
          {summary && (
            <div className="rounded-xl border border-adv-blue/30 bg-adv-blue/5 p-5">
              <p className="text-sm font-medium text-adv-off-white leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Charts */}
          {parsedCharts.map((chart, i) => (
            <ChartCard key={i} chart={chart} />
          ))}

          {/* Narrative */}
          {narrative && (
            <div className="rounded-xl border border-border bg-adv-card p-5 shadow-lg">
              <h3 className="mb-4 text-sm font-semibold text-adv-off-white">Narrative Analysis</h3>
              <div className="prose prose-sm prose-invert max-w-none text-adv-off-white">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{narrative}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="flex gap-3">
            <button
              onClick={handleCopyData}
              className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
            >
              <Copy className="h-4 w-4" />
              Copy raw data
            </button>
            {parsedCharts.length > 0 && (
              <button
                onClick={handleDownloadCSV}
                className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm text-adv-gray transition-colors hover:text-adv-off-white"
              >
                <Download className="h-4 w-4" />
                Download chart data (.csv)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
