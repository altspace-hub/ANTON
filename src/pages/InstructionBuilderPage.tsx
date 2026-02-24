import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle,
  Download, RefreshCw, Send, Loader2, Copy, Package, ChevronDown, ChevronUp,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';

type PageState = 'landing' | 'discovery' | 'architecture' | 'review' | 'export';

interface IBProject {
  id: string;
  name: string;
  description: string;
  status: string;
  target_tool: string;
  vision_goals: string | null;
  discovery_notes: string | null;
  architecture_proposal: string | null;
  review_cycle_count: number;
  instruction_files?: InstructionFile[];
}

interface InstructionFile {
  id: string;
  filename: string;
  file_type: string;
  target_tool: string;
  content: string;
  review_status: string;
}

interface ExpertReview {
  id: string;
  reviewer: string;
  reviewerPersonaId: string;
  reviewType: string;
  verdict: string;
  content: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const TOOLS = [
  { id: 'claude-code', name: 'Claude Code', file: 'CLAUDE.md', color: 'text-adv-teal', bg: 'bg-adv-teal-dim' },
  { id: 'codex', name: 'OpenAI Codex CLI', file: 'INSTRUCTIONS.md', color: 'text-adv-blue', bg: 'bg-adv-blue/10' },
  { id: 'mistral-code', name: 'Mistral Code', file: 'PROJECT.md', color: 'text-adv-gold', bg: 'bg-adv-gold/10' },
];

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('openexpert-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function InstructionBuilderPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('landing');
  const [project, setProject] = useState<IBProject | null>(null);
  const [existingProjects, setExistingProjects] = useState<IBProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Landing state
  const [projectName, setProjectName] = useState('');
  const [selectedTool, setSelectedTool] = useState('claude-code');

  // Discovery state
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');

  // Architecture state
  const [architectureProposal, setArchitectureProposal] = useState('');

  // Review state
  const [reviews, setReviews] = useState<ExpertReview[]>([]);

  // Export state
  const [instructionFiles, setInstructionFiles] = useState<InstructionFile[]>([]);
  const [activeFileTab, setActiveFileTab] = useState(0);

  // Load existing projects on mount
  useEffect(() => {
    fetch('/api/coding/instruction-builder/projects', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setExistingProjects)
      .catch(() => {});
  }, []);

  const createProject = useCallback(async () => {
    if (!projectName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/coding/instruction-builder/projects', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ name: projectName, target_tool: selectedTool }),
      });
      if (!resp.ok) throw new Error('Failed to create project');
      const proj = await resp.json();
      setProject(proj);
      setPageState('discovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }, [projectName, selectedTool]);

  const loadProject = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/coding/instruction-builder/projects/${id}`, { headers: getHeaders() });
      if (!resp.ok) throw new Error('Failed to load project');
      const proj = await resp.json();
      setProject(proj);
      setInstructionFiles(proj.instruction_files || []);

      // Navigate to appropriate state based on project status
      if (proj.status === 'completed' || proj.status === 'generated') {
        setPageState('export');
      } else if (proj.status === 'review') {
        setPageState('review');
      } else if (proj.status === 'architecture') {
        setArchitectureProposal(proj.architecture_proposal || '');
        setPageState('architecture');
      } else {
        setPageState('discovery');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, []);

  const sendDiscoveryMessage = useCallback(async () => {
    if (!userInput.trim() || !project) return;
    const msg = userInput.trim();
    setUserInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      const resp = await fetch(`/api/coding/instruction-builder/projects/${project.id}/discovery`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ userMessage: msg, history: messages }),
      });
      if (!resp.ok) throw new Error('Discovery request failed');
      const data = await resp.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setLoading(false);
    }
  }, [userInput, project, messages]);

  const generateArchitecture = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/coding/instruction-builder/projects/${project.id}/architecture`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!resp.ok) throw new Error('Architecture generation failed');
      const data = await resp.json();
      setArchitectureProposal(data.proposal);
      setPageState('architecture');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Architecture generation failed');
    } finally {
      setLoading(false);
    }
  }, [project]);

  const requestExpertReview = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/coding/instruction-builder/projects/${project.id}/review`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!resp.ok) throw new Error('Expert review failed');
      const data = await resp.json();
      setReviews(data.reviews);
      setPageState('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Expert review failed');
    } finally {
      setLoading(false);
    }
  }, [project]);

  const generateInstructions = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/coding/instruction-builder/projects/${project.id}/generate`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!resp.ok) throw new Error('Instruction generation failed');
      const data = await resp.json();
      setInstructionFiles(data.allFiles || []);
      setPageState('export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Instruction generation failed');
    } finally {
      setLoading(false);
    }
  }, [project]);

  const downloadFile = useCallback((filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const downloadAllAsZip = useCallback(async () => {
    // Simple approach: download each file individually
    for (const file of instructionFiles) {
      downloadFile(file.filename, file.content);
    }
  }, [instructionFiles, downloadFile]);

  // ── Render ────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <CodingBreadcrumb items={[
        { label: 'Coding', href: '/coding' },
        { label: 'Instruction Builder' },
      ]} />

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/coding')} className="rounded-lg p-1.5 text-adv-gray hover:bg-adv-card hover:text-adv-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-adv-white">
            <FileText className="h-7 w-7 text-adv-teal" />
            AI Code Instruction Builder
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Plan a project with expert guidance, then export instruction files for your AI coding tool
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 rounded-xl bg-adv-card p-3">
        {(['landing', 'discovery', 'architecture', 'review', 'export'] as PageState[]).map((step, idx) => {
          const labels = ['Setup', 'Discovery', 'Architecture', 'Review', 'Export'];
          const isActive = step === pageState;
          const isPast = ['landing', 'discovery', 'architecture', 'review', 'export'].indexOf(pageState) > idx;
          return (
            <div key={step} className="flex items-center gap-2">
              {idx > 0 && <div className={`h-px w-8 ${isPast ? 'bg-adv-teal' : 'bg-adv-gray-med'}`} />}
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isActive ? 'bg-adv-teal text-adv-dark' :
                isPast ? 'bg-adv-teal-dim text-adv-teal' :
                'bg-adv-dark text-adv-gray'
              }`}>
                {isPast && <CheckCircle2 className="h-3 w-3" />}
                {labels[idx]}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg bg-adv-red/10 border border-adv-red/30 p-3 text-sm text-adv-red flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* ── LANDING ── */}
      {pageState === 'landing' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-adv-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-adv-white">New Project</h2>

            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-1">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="e.g., AML Compliance Dashboard"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-2">Target AI Coding Tool</label>
              <div className="grid grid-cols-3 gap-3">
                {TOOLS.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setSelectedTool(tool.id)}
                    className={`rounded-lg border-2 p-3 text-left transition-all ${
                      selectedTool === tool.id
                        ? `border-adv-teal ${tool.bg}`
                        : 'border-border bg-adv-dark hover:border-adv-gray-med'
                    }`}
                  >
                    <div className={`text-sm font-semibold ${selectedTool === tool.id ? tool.color : 'text-adv-off-white'}`}>
                      {tool.name}
                    </div>
                    <div className="text-xs text-adv-gray mt-0.5">Generates {tool.file}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={createProject}
              disabled={!projectName.trim() || loading}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Start Discovery
            </button>
          </div>

          {existingProjects.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-6 space-y-3">
              <h2 className="text-lg font-semibold text-adv-white">Continue Existing Project</h2>
              <div className="space-y-2">
                {existingProjects.map(proj => (
                  <button
                    key={proj.id}
                    onClick={() => loadProject(proj.id)}
                    className="w-full rounded-lg bg-adv-dark p-3 text-left hover:bg-adv-dark-2 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-adv-white">{proj.name}</span>
                      <span className="rounded-full bg-adv-teal-dim px-2 py-0.5 text-[10px] text-adv-teal">
                        {proj.status}
                      </span>
                    </div>
                    <div className="text-xs text-adv-gray mt-0.5">
                      {TOOLS.find(t => t.id === proj.target_tool)?.name || proj.target_tool}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── DISCOVERY ── */}
      {pageState === 'discovery' && (
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-4">
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h2 className="text-lg font-semibold text-adv-white mb-3">Discovery Conversation</h2>

              <div className="space-y-3 max-h-[500px] overflow-y-auto mb-4">
                {messages.length === 0 && (
                  <p className="text-sm text-adv-gray italic">
                    Start by describing your project. ANTON will guide you through a structured discovery process.
                  </p>
                )}
                {messages.map((msg, idx) => (
                  <div key={idx} className={`rounded-lg p-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-adv-teal-dim text-adv-white ml-12'
                      : 'bg-adv-dark text-adv-off-white mr-12'
                  }`}>
                    <div className="text-[10px] text-adv-gray mb-1">{msg.role === 'user' ? 'You' : 'ANTON'}</div>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-adv-gray">
                    <Loader2 className="h-4 w-4 animate-spin" /> ANTON is thinking...
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={e => setUserInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendDiscoveryMessage()}
                  placeholder="Describe your project or answer ANTON's questions..."
                  className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
                  disabled={loading}
                />
                <button
                  onClick={sendDiscoveryMessage}
                  disabled={!userInput.trim() || loading}
                  className="rounded-lg bg-adv-teal p-2 text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>

            <button
              onClick={generateArchitecture}
              disabled={loading || messages.length < 2}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Proceed to Architecture
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-adv-card p-4">
              <h3 className="text-sm font-semibold text-adv-white mb-2">Project Context</h3>
              <div className="text-xs text-adv-gray space-y-1">
                <div><span className="text-adv-off-white">Name:</span> {project?.name}</div>
                <div><span className="text-adv-off-white">Tool:</span> {TOOLS.find(t => t.id === project?.target_tool)?.name}</div>
                <div><span className="text-adv-off-white">Messages:</span> {messages.length}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ARCHITECTURE ── */}
      {pageState === 'architecture' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <h2 className="text-lg font-semibold text-adv-white mb-3">Architecture Proposal</h2>
            <div className="prose prose-invert max-w-none text-sm text-adv-off-white whitespace-pre-wrap bg-adv-dark rounded-lg p-4 max-h-[600px] overflow-y-auto">
              {architectureProposal || 'Generating architecture proposal...'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPageState('discovery')}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Discovery
            </button>
            <button
              onClick={requestExpertReview}
              disabled={loading || !architectureProposal}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Request Expert Review
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW ── */}
      {pageState === 'review' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-adv-white">Expert Panel Review</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {reviews.map(review => (
              <ExpertReviewCard key={review.id} review={review} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPageState('architecture')}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Architecture
            </button>
            <button
              onClick={generateInstructions}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate Instruction Files
            </button>
          </div>
        </div>
      )}

      {/* ── EXPORT ── */}
      {pageState === 'export' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-adv-white">Generated Instruction Files</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAllAsZip}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark"
                >
                  <Download className="h-3.5 w-3.5" /> Download All
                </button>
              </div>
            </div>

            {/* File tabs */}
            <div className="flex gap-1 mb-3 border-b border-border overflow-x-auto">
              {instructionFiles.map((file, idx) => (
                <button
                  key={file.id}
                  onClick={() => setActiveFileTab(idx)}
                  className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeFileTab === idx
                      ? 'border-adv-teal text-adv-teal'
                      : 'border-transparent text-adv-gray hover:text-adv-off-white'
                  }`}
                >
                  {file.filename}
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${
                    file.file_type === 'primary' ? 'bg-adv-teal-dim text-adv-teal' : 'bg-adv-dark text-adv-gray'
                  }`}>
                    {file.file_type}
                  </span>
                </button>
              ))}
            </div>

            {/* File content */}
            {instructionFiles[activeFileTab] && (
              <div className="relative">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(instructionFiles[activeFileTab].content);
                  }}
                  className="absolute top-2 right-2 rounded-lg bg-adv-card p-1.5 text-adv-gray hover:text-adv-white z-10"
                  title="Copy to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => downloadFile(instructionFiles[activeFileTab].filename, instructionFiles[activeFileTab].content)}
                  className="absolute top-2 right-10 rounded-lg bg-adv-card p-1.5 text-adv-gray hover:text-adv-white z-10"
                  title="Download file"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <pre className="rounded-lg bg-adv-dark p-4 text-xs text-adv-off-white overflow-auto max-h-[500px] whitespace-pre-wrap font-mono">
                  {instructionFiles[activeFileTab].content}
                </pre>
              </div>
            )}

            {instructionFiles.length === 0 && (
              <div className="text-center py-8 text-adv-gray text-sm">
                No instruction files generated yet. Complete the review step first.
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPageState('review')}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-white"
            >
              <RefreshCw className="h-4 w-4" /> Review & Refine
            </button>
            <button
              onClick={() => navigate('/coding')}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark"
            >
              <CheckCircle2 className="h-4 w-4" /> Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Expert Review Card Component ──────────────────────────

function ExpertReviewCard({ review }: { review: ExpertReview }) {
  const [expanded, setExpanded] = useState(false);

  const verdictColors: Record<string, string> = {
    endorse: 'bg-adv-green/10 text-adv-green border-adv-green/30',
    flag: 'bg-adv-gold/10 text-adv-gold border-adv-gold/30',
    dissent: 'bg-adv-red/10 text-adv-red border-adv-red/30',
  };

  const verdictIcons: Record<string, string> = {
    endorse: '✓',
    flag: '⚠',
    dissent: '✗',
  };

  return (
    <div className={`rounded-xl border p-4 ${verdictColors[review.verdict] || 'border-border bg-adv-card'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold">{review.reviewer}</span>
        <span className="text-xs font-bold">{verdictIcons[review.verdict]} {review.verdict.toUpperCase()}</span>
      </div>
      <div className="text-xs opacity-60 mb-2">{review.reviewType} review</div>
      <div className={`text-xs whitespace-pre-wrap ${expanded ? '' : 'line-clamp-6'}`}>
        {review.content}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-[10px] opacity-60 hover:opacity-100"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
