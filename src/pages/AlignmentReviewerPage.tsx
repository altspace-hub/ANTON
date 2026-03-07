import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Target, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle,
  Download, Send, Loader2, Copy, FolderOpen, FileText,
  ChevronDown, ChevronUp, TrendingUp, RefreshCw,
} from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';

type PageState = 'landing' | 'goals' | 'analysis' | 'expert-review' | 'steering' | 'history';

interface AlignmentReview {
  id: string;
  project_name: string;
  review_date: string;
  status: string;
  project_state_summary: string | null;
  goals_reference: string | null;
  alignment_report: string | null;
  overall_status: string | null;
  instruction_builder_project_id: string | null;
  target_tool: string | null;
  dimensions?: DimensionResult[];
  steering_instructions?: SteeringFile[];
}

interface DimensionResult {
  id: string;
  dimension_name: string;
  status: 'green' | 'amber' | 'red';
  findings: string;
  recommendations: string | null;
  reviewer_persona: string;
}

interface SteeringFile {
  id: string;
  target_tool: string;
  instruction_type: string;
  filename: string;
  content: string;
  review_status: string;
}

interface IBProject {
  id: string;
  name: string;
  target_tool: string;
}

const TRAFFIC_COLORS = {
  green: { bg: 'bg-adv-green/10', border: 'border-adv-green/30', text: 'text-adv-green', dot: 'bg-adv-green' },
  amber: { bg: 'bg-adv-gold/10', border: 'border-adv-gold/30', text: 'text-adv-gold', dot: 'bg-adv-gold' },
  red: { bg: 'bg-adv-red/10', border: 'border-adv-red/30', text: 'text-adv-red', dot: 'bg-adv-red' },
};

const DIMENSION_LABELS: Record<string, string> = {
  'feature-completeness': 'Feature Completeness',
  'architecture': 'Architecture',
  'domain-compliance': 'Domain Compliance',
  'tech-health': 'Technical Health',
  'security': 'Security Posture',
  'goal-drift': 'Goal Drift',
};

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('openexpert-token');
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function AlignmentReviewerPage() {
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>('landing');
  const [review, setReview] = useState<AlignmentReview | null>(null);
  const [existingReviews, setExistingReviews] = useState<AlignmentReview[]>([]);
  const [ibProjects, setIBProjects] = useState<IBProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Landing state
  const [projectName, setProjectName] = useState('');
  const [directoryPath, setDirectoryPath] = useState('');

  // Goals state
  const [goalsText, setGoalsText] = useState('');
  const [selectedIBProject, setSelectedIBProject] = useState<string>('');

  // Analysis state
  const [dimensions, setDimensions] = useState<DimensionResult[]>([]);
  const [overallStatus, setOverallStatus] = useState<string>('');

  // Steering state
  const [steeringFiles, setSteeringFiles] = useState<SteeringFile[]>([]);
  const [activeFileTab, setActiveFileTab] = useState(0);
  const [targetTool, setTargetTool] = useState('claude-code');

  // Load existing reviews and IB projects
  useEffect(() => {
    fetch('/api/coding/alignment-reviews', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setExistingReviews)
      .catch(() => {});

    fetch('/api/coding/instruction-builder/projects', { headers: getHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setIBProjects)
      .catch(() => {});
  }, []);

  const createAndIngest = useCallback(async () => {
    if (!projectName.trim() || !directoryPath.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // Create review
      const createResp = await fetch('/api/coding/alignment-reviews', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ project_name: projectName }),
      });
      if (!createResp.ok) throw new Error('Failed to create review');
      const rev = await createResp.json();

      // Ingest project
      const ingestResp = await fetch(`/api/coding/alignment-reviews/${rev.id}/ingest`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ source_type: 'local-directory', path: directoryPath }),
      });
      if (!ingestResp.ok) throw new Error('Failed to ingest project');

      setReview(rev);
      setPageState('goals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create review');
    } finally {
      setLoading(false);
    }
  }, [projectName, directoryPath]);

  const loadReview = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/coding/alignment-reviews/${id}`, { headers: getHeaders() });
      if (!resp.ok) throw new Error('Failed to load review');
      const rev = await resp.json();
      setReview(rev);
      setDimensions(rev.dimensions || []);
      setSteeringFiles(rev.steering_instructions || []);

      if (rev.alignment_report) {
        const report = JSON.parse(rev.alignment_report);
        setOverallStatus(report.overall_status || '');
      }

      // Navigate to appropriate state
      if (rev.status === 'steering-generated') setPageState('steering');
      else if (rev.status === 'reviewed') setPageState('analysis');
      else if (rev.status === 'goals-set' || rev.status === 'analysing') setPageState('goals');
      else setPageState('goals');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, []);

  const setGoals = useCallback(async () => {
    if (!review) return;
    setLoading(true);
    setError(null);
    try {
      const body: any = {};
      if (selectedIBProject) {
        body.instruction_builder_project_id = selectedIBProject;
      } else if (goalsText.trim()) {
        body.goals = goalsText;
      } else {
        setError('Please provide goals or select an Instruction Builder project');
        setLoading(false);
        return;
      }

      const resp = await fetch(`/api/coding/alignment-reviews/${review.id}/goals`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error('Failed to set goals');

      // Run analysis
      const analyseResp = await fetch(`/api/coding/alignment-reviews/${review.id}/analyse`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!analyseResp.ok) throw new Error('Analysis failed');
      const report = await analyseResp.json();

      setDimensions(report.dimensions || []);
      setOverallStatus(report.overall_status || '');
      setPageState('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [review, selectedIBProject, goalsText]);

  const generateSteering = useCallback(async () => {
    if (!review) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/coding/alignment-reviews/${review.id}/generate-steering`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ target_tool: targetTool }),
      });
      if (!resp.ok) throw new Error('Steering generation failed');
      const data = await resp.json();
      setSteeringFiles(data.files || []);
      setPageState('steering');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Steering generation failed');
    } finally {
      setLoading(false);
    }
  }, [review, targetTool]);

  const downloadFile = useCallback((filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <CodingBreadcrumb items={[
        { label: 'Coding', href: '/coding' },
        { label: 'Alignment Reviewer' },
      ]} />

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/coding')} className="rounded-lg p-1.5 text-adv-gray hover:bg-adv-card hover:text-adv-white">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-adv-white">
            <Target className="h-7 w-7 text-adv-teal" />
            Project Alignment Reviewer
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Review an existing project against its goals — get traffic-light assessment and steering instructions
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 rounded-xl bg-adv-card p-3">
        {(['landing', 'goals', 'analysis', 'steering'] as PageState[]).map((step, idx) => {
          const labels = ['Ingest', 'Goals', 'Analysis', 'Steering'];
          const steps: PageState[] = ['landing', 'goals', 'analysis', 'steering'];
          const isActive = step === pageState;
          const isPast = steps.indexOf(pageState) > idx;
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
            <h2 className="text-lg font-semibold text-adv-white">Ingest Project</h2>

            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-1">Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="e.g., My React App"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-1">
                <FolderOpen className="inline h-4 w-4 mr-1" />
                Local Directory Path
              </label>
              <input
                type="text"
                value={directoryPath}
                onChange={e => setDirectoryPath(e.target.value)}
                placeholder="e.g., C:\Projects\my-app or /home/user/projects/my-app"
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 font-mono"
              />
              <p className="text-xs text-adv-gray mt-1">
                The project directory will be scanned for structure, dependencies, and key files
              </p>
            </div>

            <button
              onClick={createAndIngest}
              disabled={!projectName.trim() || !directoryPath.trim() || loading}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Ingest & Set Goals
            </button>
          </div>

          {existingReviews.length > 0 && (
            <div className="rounded-xl border border-border bg-adv-card p-6 space-y-3">
              <h2 className="text-lg font-semibold text-adv-white">Previous Reviews</h2>
              <div className="space-y-2">
                {existingReviews.map(rev => (
                  <button
                    key={rev.id}
                    onClick={() => loadReview(rev.id)}
                    className="w-full rounded-lg bg-adv-dark p-3 text-left hover:bg-adv-dark-2 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-adv-white">{rev.project_name}</span>
                      <div className="flex items-center gap-2">
                        {rev.overall_status && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            rev.overall_status === 'on-track' ? 'bg-adv-green/10 text-adv-green' :
                            rev.overall_status === 'off-track' ? 'bg-adv-red/10 text-adv-red' :
                            'bg-adv-gold/10 text-adv-gold'
                          }`}>
                            {rev.overall_status}
                          </span>
                        )}
                        <span className="rounded-full bg-adv-teal-dim px-2 py-0.5 text-xs text-adv-teal">
                          {rev.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-adv-gray mt-0.5">
                      {new Date(rev.review_date || rev.id).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── GOALS ── */}
      {pageState === 'goals' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-adv-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-adv-white">Set Goals Reference</h2>
            <p className="text-sm text-adv-gray">
              Define what the project should achieve. You can load goals from an Instruction Builder project or enter them manually.
            </p>

            {ibProjects.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-adv-off-white mb-1">Load from Instruction Builder Project</label>
                <select
                  value={selectedIBProject}
                  onChange={e => setSelectedIBProject(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                >
                  <option value="">— Select a project —</option>
                  {ibProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.target_tool})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="text-center text-xs text-adv-gray">— or —</div>

            <div>
              <label className="block text-sm font-medium text-adv-off-white mb-1">Manual Goals</label>
              <textarea
                value={goalsText}
                onChange={e => setGoalsText(e.target.value)}
                placeholder="Describe the project goals, features, architecture decisions, and success criteria..."
                rows={8}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                disabled={!!selectedIBProject}
              />
            </div>

            <button
              onClick={setGoals}
              disabled={loading || (!selectedIBProject && !goalsText.trim())}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              {loading ? 'Analysing (this may take a minute)...' : 'Run Alignment Analysis'}
            </button>
          </div>
        </div>
      )}

      {/* ── ANALYSIS ── */}
      {pageState === 'analysis' && (
        <div className="space-y-4">
          {/* Overall Status Banner */}
          <div className={`rounded-xl border p-4 text-center ${
            overallStatus === 'on-track' ? 'bg-adv-green/10 border-adv-green/30' :
            overallStatus === 'off-track' ? 'bg-adv-red/10 border-adv-red/30' :
            'bg-adv-gold/10 border-adv-gold/30'
          }`}>
            <div className={`text-lg font-bold ${
              overallStatus === 'on-track' ? 'text-adv-green' :
              overallStatus === 'off-track' ? 'text-adv-red' :
              'text-adv-gold'
            }`}>
              {overallStatus === 'on-track' ? '✓ On Track' :
               overallStatus === 'off-track' ? '✗ Off Track' :
               '⚠ Partially Aligned'}
            </div>
            <div className="text-xs text-adv-gray mt-1">
              {dimensions.filter(d => d.status === 'green').length} green, {' '}
              {dimensions.filter(d => d.status === 'amber').length} amber, {' '}
              {dimensions.filter(d => d.status === 'red').length} red
            </div>
          </div>

          {/* Dimension Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {dimensions.map(dim => (
              <TrafficLightCard key={dim.id} dimension={dim} />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPageState('goals')}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-white"
            >
              <ArrowLeft className="h-4 w-4" /> Adjust Goals
            </button>

            <div className="flex items-center gap-2">
              <select
                value={targetTool}
                onChange={e => setTargetTool(e.target.value)}
                className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-white"
              >
                <option value="claude-code">Claude Code</option>
                <option value="codex">Codex CLI</option>
                <option value="mistral-code">Mistral Code</option>
              </select>
              <button
                onClick={generateSteering}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generate Steering Instructions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEERING ── */}
      {pageState === 'steering' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-adv-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-adv-white">Steering Instructions</h2>
              <button
                onClick={() => steeringFiles.forEach(f => downloadFile(f.filename, f.content))}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark"
              >
                <Download className="h-3.5 w-3.5" /> Download All
              </button>
            </div>

            {/* File tabs */}
            <div className="flex gap-1 mb-3 border-b border-border overflow-x-auto">
              {steeringFiles.map((file, idx) => (
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
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    file.instruction_type === 'correction' ? 'bg-adv-red/10 text-adv-red' :
                    file.instruction_type === 'refactoring' ? 'bg-adv-gold/10 text-adv-gold' :
                    'bg-adv-teal-dim text-adv-teal'
                  }`}>
                    {file.instruction_type}
                  </span>
                </button>
              ))}
            </div>

            {/* File content */}
            {steeringFiles[activeFileTab] && (
              <div className="relative">
                <button
                  onClick={() => navigator.clipboard.writeText(steeringFiles[activeFileTab].content)}
                  className="absolute top-2 right-2 rounded-lg bg-adv-card p-1.5 text-adv-gray hover:text-adv-white z-10"
                  title="Copy to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <pre className="rounded-lg bg-adv-dark p-4 text-xs text-adv-off-white overflow-auto max-h-[500px] whitespace-pre-wrap font-mono">
                  {steeringFiles[activeFileTab].content}
                </pre>
              </div>
            )}

            {steeringFiles.length === 0 && (
              <div className="text-center py-8 text-adv-gray text-sm">
                No steering instructions generated yet.
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPageState('analysis')}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-white"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Analysis
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

// ── Traffic Light Card Component ──────────────────────────

function TrafficLightCard({ dimension }: { dimension: DimensionResult }) {
  const [expanded, setExpanded] = useState(false);
  const colors = TRAFFIC_COLORS[dimension.status];
  const label = DIMENSION_LABELS[dimension.dimension_name] || dimension.dimension_name;

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition-all`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-3 w-3 rounded-full ${colors.dot}`} />
        <span className={`text-sm font-semibold ${colors.text}`}>{label}</span>
      </div>
      <div className="text-xs text-adv-gray mb-2">{dimension.reviewer_persona}</div>
      <div className={`text-xs whitespace-pre-wrap ${expanded ? '' : 'line-clamp-4'}`}>
        {dimension.findings}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}
