import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, MessageSquare, FolderGit2, Users, Loader2, FileCheck2 } from 'lucide-react';
import CodingBreadcrumb from '@/components/coding/CodingBreadcrumb';
import PanelVerdictPanel, { type PanelVerdict } from '@/components/coding/PanelVerdictPanel';
import { fetchWithAuth } from '@/lib/api';
import type { StudioMode } from './CodingLandingPage';

// ANTON Studio — kickoff shell.
// P2 adds the real, minimal core-team panel surface: run the single-model
// 7-expert panel at a gate over an artifact, and render the CODE-COMPUTED
// PanelVerdict (per-expert chips + concerns + synthesis + a prominent BLOCKING
// banner when a mandatory role dissented). Full Studio UX is P5.

const GATES = ['start', 'build', 'testing', 'finish'] as const;
const MODES = ['fast', 'balanced', 'thorough'] as const;
type Gate = (typeof GATES)[number];
type Mode = (typeof MODES)[number];

export default function CodingStudioPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawMode = params.get('mode');
  const studioMode: StudioMode = rawMode === 'ask' ? 'ask' : 'project';
  const projectIdFromUrl = params.get('project') ?? '';
  // When the kickoff workshop seeds a project it hands the charter off here with
  // ?project=<id>&from=workshop — surface a confirmation so the gate at 'start'
  // is the obvious next step.
  const fromWorkshop = params.get('from') === 'workshop';

  const [projectId, setProjectId] = useState(projectIdFromUrl);
  const [gate, setGate] = useState<Gate>('start');
  const [panelMode, setPanelMode] = useState<Mode>('fast');
  const [artifact, setArtifact] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<PanelVerdict | null>(null);

  async function runPanel() {
    if (!projectId.trim() || !artifact.trim()) {
      setError('A coding project id and an artifact to review are both required.');
      return;
    }
    setRunning(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetchWithAuth(`/api/core-team/${encodeURIComponent(projectId.trim())}/panel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate, mode: panelMode, artifact }),
      });
      const json = (await res.json()) as { verdict?: PanelVerdict; error?: string };
      if (!res.ok || !json.verdict) {
        setError(json.error ? String(json.error) : `Panel run failed (HTTP ${res.status}).`);
        return;
      }
      setVerdict(json.verdict);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Panel run failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <CodingBreadcrumb items={[{ label: 'Studio' }]} />

      <div className="rounded-2xl border-2 border-adv-teal bg-adv-card p-6 shadow-lg shadow-adv-teal/10">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-adv-teal-dim p-3">
            <Sparkles className="h-7 w-7 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-adv-white">ANTON Studio</h1>
            <p className="text-xs text-adv-gray">
              The guided studio — workshop, scoped workspace, and project learning — is being
              assembled phase by phase. The 7-expert core-team gate is live below.
            </p>
          </div>
          <div className="ml-auto inline-flex items-center gap-2 rounded-full bg-adv-dark px-3 py-1.5 text-xs font-medium text-adv-off-white">
            {studioMode === 'ask' ? (
              <><MessageSquare className="h-4 w-4 text-adv-teal" /> Ask</>
            ) : (
              <><FolderGit2 className="h-4 w-4 text-adv-teal" /> Project</>
            )}
          </div>
        </div>
      </div>

      {fromWorkshop && projectId && (
        <div className="flex items-start gap-3 rounded-2xl border border-adv-green/40 bg-adv-green/5 p-4">
          <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-adv-green" />
          <div className="text-sm text-adv-off-white">
            <p className="font-semibold text-adv-green">Charter created — Studio project seeded.</p>
            <p className="mt-0.5 text-xs text-adv-gray">
              Your kickoff workshop produced a Project Charter and seeded this Studio project. Run the
              core-team review at the <span className="font-medium text-adv-off-white">start</span> gate
              below to begin.
            </p>
          </div>
        </div>
      )}

      {/* Core-team panel runner */}
      <div className="rounded-2xl border border-border bg-adv-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-adv-teal" />
          <h2 className="text-sm font-semibold text-adv-off-white">Core-team review</h2>
        </div>
        <p className="mb-4 text-xs text-adv-gray">
          One model role-plays all seven experts independently. The panel verdict and whether the
          gate is blocked are computed in code from the expert verdicts — never by the model. A
          dissent from a mandatory role for the gate blocks advancement.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Project id</span>
            <input
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="coding project id"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Gate</span>
            <select
              value={gate}
              onChange={(e) => setGate(e.target.value as Gate)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white"
            >
              {GATES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Mode</span>
            <select
              value={panelMode}
              onChange={(e) => setPanelMode(e.target.value as Mode)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white"
            >
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-adv-gray">Artifact to review</span>
          <textarea
            value={artifact}
            onChange={(e) => setArtifact(e.target.value)}
            rows={6}
            placeholder="Paste the plan, architecture summary, diff, or test results to put in front of the core team…"
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white"
          />
        </label>

        {error && <p className="mt-2 text-xs text-adv-red">{error}</p>}

        <button
          onClick={runPanel}
          disabled={running}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? <><Loader2 className="h-4 w-4 animate-spin" /> Convening the panel…</> : <><Users className="h-4 w-4" /> Run core-team review</>}
        </button>
      </div>

      {verdict && <PanelVerdictPanel verdict={verdict} />}

      <div>
        <button
          onClick={() => navigate('/coding')}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-dark px-4 py-2 text-sm font-medium text-adv-off-white transition-colors hover:text-adv-teal"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Coding
        </button>
      </div>
    </div>
  );
}
