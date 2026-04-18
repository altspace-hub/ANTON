import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Cpu, AlertTriangle, Loader2, ChevronRight, CheckCircle2,
  Stethoscope, FlaskConical, Activity, Sparkles, Lightbulb,
  Camera, ThumbsUp, ThumbsDown, Minus, RotateCw, BookOpen, Shield,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';
import VoiceSymptomCapture from '@/components/hardware/VoiceSymptomCapture';
import PhotoModuleId from '@/components/hardware/PhotoModuleId';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectMini {
  id: string; title: string; family_id: string; path: string; tier: number;
  region: string | null; working_language: string; hkp_id: string | null;
  current_phase_id: string | null;
  phases: Array<{ id: string; phase_key: string; phase_index: number; display_label: string; status: string }>;
}

interface CandidateCase {
  case_id: string; title: string; severity: string | null; authoritative: boolean;
  match_score: number; matched_keywords: string[]; matched_symptoms: string[];
  case_data: {
    symptoms?: Array<{ symptom?: string; description?: string }>;
    probable_causes?: Array<{ cause?: string; description?: string; confidence?: number }>;
    resolutions?: Array<{ resolution_id?: string; description?: string; preferred?: boolean }>;
    diagnostic_questions?: string[];
    related_cases?: string[];
  };
}

type DiagnoseStep = 'symptom_capture' | 'hypothesis' | 'measurement' | 'resolution' | 'contribution';

const STEPS: Array<{ key: DiagnoseStep; label: string; icon: typeof Stethoscope }> = [
  { key: 'symptom_capture', label: 'Symptom capture', icon: Stethoscope },
  { key: 'hypothesis',      label: 'Hypothesis',      icon: FlaskConical },
  { key: 'measurement',     label: 'Measurement',     icon: Activity },
  { key: 'resolution',      label: 'Resolution',      icon: CheckCircle2 },
  { key: 'contribution',    label: 'Contribute',      icon: Sparkles },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HardwareDiagnosePage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [project, setProject] = useState<ProjectMini | null>(null);
  const [step, setStep] = useState<DiagnoseStep>('symptom_capture');
  const [error, setError] = useState<string | null>(null);

  // Symptom capture
  const [symptoms, setSymptoms] = useState('');
  const [matching, setMatching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateCase[] | null>(null);

  // Hypothesis / measurement / resolution focus
  const [focusCase, setFocusCase] = useState<CandidateCase | null>(null);
  const [chosenResolutionId, setChosenResolutionId] = useState<string | null>(null);

  // Reasoning trail (visible throughout)
  const [trail, setTrail] = useState<Array<{ ts: string; phase: DiagnoseStep; text: string }>>([]);

  // Outcome logging state
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [outcomeShareConsent, setOutcomeShareConsent] = useState(false);
  const [logging, setLogging] = useState<null | 'pending' | 'done'>(null);

  // Contribution form state
  const [contribOpen, setContribOpen] = useState(false);
  const [contribStatus, setContribStatus] = useState<null | 'pending' | 'done' | string>(null);

  const loadProject = async () => {
    if (!id) return;
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${id}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed to load project');
      setProject(json.project as ProjectMini);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  useEffect(() => { loadProject(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id]);

  // Redirect to develop workspace if path != diagnose
  useEffect(() => {
    if (project && project.path !== 'diagnose') {
      nav(`/hardware/projects/${project.id}`, { replace: true });
    }
  }, [project, nav]);

  const appendTrail = (phase: DiagnoseStep, text: string) =>
    setTrail(t => [...t, { ts: new Date().toISOString(), phase, text }]);

  const matchSymptoms = async () => {
    if (!project || !symptoms.trim()) return;
    setMatching(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${project.id}/diagnose/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: symptoms.trim(), limit: 5 }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Match failed');
      setCandidates(json.candidates as CandidateCase[]);
      appendTrail('symptom_capture', `Captured symptom: "${symptoms.trim()}". Matcher returned ${json.candidates.length} candidate(s).`);
      setStep('hypothesis');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setMatching(false);
    }
  };

  const chooseHypothesis = (c: CandidateCase) => {
    setFocusCase(c);
    appendTrail('hypothesis', `Selected hypothesis: ${c.case_id} (match score ${c.match_score}).`);
    setStep('measurement');
  };

  const recordMeasurement = (note: string) => {
    if (!focusCase) return;
    appendTrail('measurement', `Measurement recorded for ${focusCase.case_id}: ${note}`);
    setStep('resolution');
  };

  const logOutcome = async (outcome: 'worked' | 'made_worse' | 'no_effect' | 'partial') => {
    if (!project || !focusCase || !chosenResolutionId) return;
    setLogging('pending');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/projects/${project.id}/diagnose/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: focusCase.case_id,
          resolution_id: chosenResolutionId,
          outcome,
          context_notes: outcomeNotes.trim() || null,
          consent_for_sharing: outcomeShareConsent,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Outcome log failed');
      appendTrail('resolution', `Logged outcome for ${focusCase.case_id} resolution ${chosenResolutionId}: ${outcome}.`);
      setLogging('done');
      setStep('contribution');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setLogging(null);
    }
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-adv-dark text-adv-off-white flex items-center justify-center">
        {error
          ? <div className="text-red-400 text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</div>
          : <Loader2 className="w-6 h-6 animate-spin text-adv-teal" />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6">
      <div className="max-w-7xl mx-auto">
        <button onClick={() => nav('/hardware')} className="text-adv-teal flex items-center gap-1 mb-3 text-sm hover:underline">
          <ArrowLeft className="w-4 h-4" />Hardware Build
        </button>

        <header className="mb-4">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cpu className="w-6 h-6 text-adv-teal" />
            {project.title}
          </h1>
          <div className="text-xs text-adv-gray flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">diagnose</span>
            <span>family: {project.family_id}</span>
            <span>tier {project.tier}</span>
            <span>language: {project.working_language}</span>
            <span>HKP: {project.hkp_id ?? 'none'}</span>
          </div>
        </header>

        {/* Stepper */}
        <nav className="flex items-center justify-between mb-4 text-xs">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.key;
            const stepIdx = STEPS.findIndex(x => x.key === step);
            const isDone = i < stepIdx;
            return (
              <button
                key={s.key}
                onClick={() => setStep(s.key)}
                className={`flex items-center gap-1 ${isActive ? 'text-adv-teal' : isDone ? 'text-emerald-400' : 'text-adv-gray'}`}
              >
                {isDone ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                <span className="hidden sm:inline">{i + 1}. {s.label}</span>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 mx-1 text-adv-gray" />}
              </button>
            );
          })}
        </nav>

        {error && (
          <div className="mb-3 p-2 rounded border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-start justify-between gap-2">
            <span className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" />{error}</span>
            <button onClick={() => setError(null)} className="text-xs hover:underline">dismiss</button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <main className="lg:col-span-2 space-y-4">
            {step === 'symptom_capture' && (
              <SymptomCaptureCard
                value={symptoms}
                onChange={setSymptoms}
                workingLanguage={project.working_language}
                hkpId={project.hkp_id}
                familyId={project.family_id}
                onSubmit={matchSymptoms}
                running={matching}
              />
            )}

            {step === 'hypothesis' && (
              <HypothesisCard
                candidates={candidates ?? []}
                onChoose={chooseHypothesis}
                onBack={() => setStep('symptom_capture')}
              />
            )}

            {step === 'measurement' && focusCase && (
              <MeasurementCard
                focus={focusCase}
                onMeasured={recordMeasurement}
                onBack={() => setStep('hypothesis')}
              />
            )}

            {step === 'resolution' && focusCase && (
              <ResolutionCard
                focus={focusCase}
                chosenResolutionId={chosenResolutionId}
                onChoose={setChosenResolutionId}
                outcomeNotes={outcomeNotes}
                onNotesChange={setOutcomeNotes}
                shareConsent={outcomeShareConsent}
                onShareConsentChange={setOutcomeShareConsent}
                onLog={logOutcome}
                logging={logging}
                onBack={() => setStep('measurement')}
              />
            )}

            {step === 'contribution' && (
              <ContributionCard
                project={project}
                seed={{
                  symptoms,
                  focusCaseId: focusCase?.case_id ?? null,
                }}
                open={contribOpen}
                onToggleOpen={() => setContribOpen(o => !o)}
                status={contribStatus}
                onStatusChange={setContribStatus}
                onClose={() => nav('/hardware')}
              />
            )}
          </main>

          <aside className="lg:col-span-1 space-y-4">
            <ReasoningTrail trail={trail} />
            <FocusCard focus={focusCase} />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SymptomCaptureCard({ value, onChange, workingLanguage, hkpId, familyId, onSubmit, running }: {
  value: string; onChange: (s: string) => void; workingLanguage: string;
  hkpId: string | null; familyId: string;
  onSubmit: () => void; running: boolean;
}) {
  return (
    <section className="space-y-4">
      <div className="p-4 rounded border border-adv-gray/20 bg-adv-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray flex items-center gap-2 mb-2">
          <Stethoscope className="w-4 h-4" />
          Symptom capture
        </h2>
        <p className="text-xs text-adv-gray mb-3">
          Describe what the device does, what changed, and what you have already tried. Voice is on by default in supported browsers — use it freely; the textarea stays editable.
        </p>
        <VoiceSymptomCapture
          value={value}
          onChange={onChange}
          workingLanguage={workingLanguage}
          onSubmit={onSubmit}
        />
        <button
          onClick={onSubmit}
          disabled={!value.trim() || running}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 font-medium text-sm"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          Find matching diagnostic cases
        </button>
      </div>

      <div className="p-4 rounded border border-adv-gray/20 bg-adv-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray flex items-center gap-2 mb-2">
          <Camera className="w-4 h-4" />
          Optional — identify the actual module
        </h2>
        <p className="text-xs text-adv-gray mb-3">
          If you suspect a counterfeit or mis-listed module, photo-id first. The vision pass surfaces missing FCC IDs, off-centre logos, and tinning quality before any diagnosis can proceed reliably.
        </p>
        <PhotoModuleId familyId={familyId} hkpId={hkpId} />
      </div>
    </section>
  );
}

function HypothesisCard({ candidates, onChoose, onBack }: {
  candidates: CandidateCase[]; onChoose: (c: CandidateCase) => void; onBack: () => void;
}) {
  return (
    <section className="p-4 rounded border border-adv-gray/20 bg-adv-card">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray flex items-center gap-2">
          <FlaskConical className="w-4 h-4" />
          Top hypotheses
        </h2>
        <button onClick={onBack} className="text-xs text-adv-gray hover:text-adv-teal flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />refine symptom
        </button>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-adv-gray py-4 text-center">
          No matching diagnostic cases. Add more detail or submit a new contribution at the end of this flow.
        </p>
      ) : (
        <ul className="space-y-2">
          {candidates.map(c => (
            <li key={c.case_id} className="border border-adv-gray/20 rounded p-3 hover:border-adv-teal/40 transition">
              <button onClick={() => onChoose(c)} className="text-left w-full">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div>
                    <div className="text-xs text-adv-gray">{c.case_id}</div>
                    <div className="font-medium">{c.title}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.severity && (
                      <span className={`text-xs px-2 py-0.5 rounded border ${severityClass(c.severity)}`}>{c.severity}</span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded border bg-adv-teal/10 text-adv-teal border-adv-teal/30">{c.match_score}/100</span>
                  </div>
                </div>
                {c.matched_symptoms[0] && (
                  <p className="text-xs text-adv-gray italic">"{c.matched_symptoms[0]}"</p>
                )}
                <div className="text-xs text-adv-gray mt-1">keywords: <span className="text-adv-off-white">{c.matched_keywords.slice(0, 5).join(', ')}</span></div>
                {c.case_data.probable_causes?.[0]?.cause && (
                  <div className="text-xs text-adv-gray mt-1">most likely cause: {c.case_data.probable_causes[0].cause}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MeasurementCard({ focus, onMeasured, onBack }: {
  focus: CandidateCase; onMeasured: (note: string) => void; onBack: () => void;
}) {
  const [note, setNote] = useState('');
  const questions = focus.case_data.diagnostic_questions ?? [];
  const probableCauses = focus.case_data.probable_causes ?? [];

  return (
    <section className="p-4 rounded border border-adv-gray/20 bg-adv-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Measurement
        </h2>
        <button onClick={onBack} className="text-xs text-adv-gray hover:text-adv-teal flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />change hypothesis
        </button>
      </div>

      <div className="text-xs text-adv-gray">Investigating: <span className="text-adv-off-white">{focus.case_id}</span></div>

      {probableCauses.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-adv-gray mb-1">Probable causes (ranked by confidence)</h3>
          <ul className="text-sm space-y-1">
            {probableCauses.map((c, i) => (
              <li key={i} className="border border-adv-gray/20 rounded p-2 bg-adv-dark/50">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 mt-0.5 text-adv-teal" />
                  <div>
                    <div>{c.cause ?? c.description}</div>
                    {c.confidence !== undefined && (
                      <div className="text-xs text-adv-gray mt-0.5">confidence {Math.round(c.confidence * 100)}%</div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-adv-gray mb-1">Cheap measurements to try first</h3>
          <ul className="text-sm space-y-0.5 list-disc list-inside text-adv-gray">
            {questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
      )}

      <div>
        <label className="block text-xs text-adv-gray mb-1">Record what you measured / observed</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="e.g., Measured 3V3 on the test point — drops to 2.45 V during WiFi.begin(). Replaced the USB cable; reset stopped."
          className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm"
        />
      </div>

      <button
        onClick={() => onMeasured(note.trim() || '(no measurement note recorded)')}
        className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark text-sm font-medium"
      >
        Continue to resolution →
      </button>
    </section>
  );
}

function ResolutionCard({
  focus, chosenResolutionId, onChoose, outcomeNotes, onNotesChange,
  shareConsent, onShareConsentChange, onLog, logging, onBack,
}: {
  focus: CandidateCase;
  chosenResolutionId: string | null;
  onChoose: (id: string) => void;
  outcomeNotes: string;
  onNotesChange: (s: string) => void;
  shareConsent: boolean;
  onShareConsentChange: (b: boolean) => void;
  onLog: (o: 'worked' | 'made_worse' | 'no_effect' | 'partial') => void;
  logging: null | 'pending' | 'done';
  onBack: () => void;
}) {
  const resolutions = focus.case_data.resolutions ?? [];

  return (
    <section className="p-4 rounded border border-adv-gray/20 bg-adv-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Resolution
        </h2>
        <button onClick={onBack} className="text-xs text-adv-gray hover:text-adv-teal flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" />back to measurement
        </button>
      </div>

      {resolutions.length === 0 ? (
        <p className="text-sm text-adv-gray">This case has no recorded resolutions.</p>
      ) : (
        <ul className="space-y-2">
          {resolutions.map((r) => {
            const id = r.resolution_id ?? '';
            const isChosen = id === chosenResolutionId;
            return (
              <li key={id}>
                <button
                  onClick={() => onChoose(id)}
                  className={`text-left w-full p-3 rounded border ${isChosen ? 'border-adv-teal bg-adv-teal/5' : 'border-adv-gray/20 hover:border-adv-teal/40'}`}
                >
                  <div className="flex items-start gap-2">
                    {r.preferred && <Sparkles className="w-4 h-4 text-amber-400 mt-0.5" />}
                    <div className="flex-1">
                      <div className="text-xs text-adv-gray">{id}{r.preferred ? ' · preferred' : ''}</div>
                      <div className="text-sm">{r.description}</div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {chosenResolutionId && (
        <>
          <div>
            <label className="block text-xs text-adv-gray mb-1">Outcome notes (optional)</label>
            <textarea
              value={outcomeNotes}
              onChange={e => onNotesChange(e.target.value)}
              rows={2}
              placeholder="What happened when you tried this resolution?"
              className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm"
            />
          </div>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={shareConsent} onChange={e => onShareConsentChange(e.target.checked)} className="mt-0.5" />
            <span>I consent to share this outcome with the community knowledge base.</span>
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <OutcomeButton label="Worked" icon={ThumbsUp} kind="emerald" onClick={() => onLog('worked')} disabled={logging === 'pending'} />
            <OutcomeButton label="Partial" icon={Minus} kind="amber" onClick={() => onLog('partial')} disabled={logging === 'pending'} />
            <OutcomeButton label="No effect" icon={RotateCw} kind="gray" onClick={() => onLog('no_effect')} disabled={logging === 'pending'} />
            <OutcomeButton label="Made worse" icon={ThumbsDown} kind="red" onClick={() => onLog('made_worse')} disabled={logging === 'pending'} />
          </div>
        </>
      )}
    </section>
  );
}

function OutcomeButton({ label, icon: Icon, kind, onClick, disabled }: {
  label: string; icon: typeof ThumbsUp; kind: 'emerald' | 'amber' | 'gray' | 'red';
  onClick: () => void; disabled: boolean;
}) {
  const styles = {
    emerald: 'border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400',
    amber:   'border-amber-500/30 hover:bg-amber-500/10 text-amber-400',
    gray:    'border-adv-gray/30 hover:bg-adv-card text-adv-gray',
    red:     'border-red-500/30 hover:bg-red-500/10 text-red-400',
  }[kind];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1 px-2 py-2 rounded border text-xs ${styles} disabled:opacity-50`}
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}

function ContributionCard({
  project, seed, open, onToggleOpen, status, onStatusChange, onClose,
}: {
  project: ProjectMini;
  seed: { symptoms: string; focusCaseId: string | null };
  open: boolean;
  onToggleOpen: () => void;
  status: null | 'pending' | 'done' | string;
  onStatusChange: (s: null | 'pending' | 'done' | string) => void;
  onClose: () => void;
}) {
  const [caseId, setCaseId] = useState(`esp32-user-${Date.now().toString(36).slice(-6)}`);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<'low' | 'moderate' | 'high' | 'critical'>('moderate');
  const [symptomText, setSymptomText] = useState(seed.symptoms);
  const [causeText, setCauseText] = useState('');
  const [resolutionText, setResolutionText] = useState('');

  const submit = async () => {
    onStatusChange('pending');
    try {
      const res = await fetchWithAuth(`${API_BASE}/hardware/diagnostic-cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80),
          family_id: project.family_id,
          hkp_id: project.hkp_id,
          title: title.trim(),
          severity,
          symptoms: [{ symptom: symptomText.trim() }],
          probable_causes: [{ cause: causeText.trim() }],
          resolutions: [{ description: resolutionText.trim(), preferred: true }],
          related_cases: seed.focusCaseId ? [seed.focusCaseId] : [],
          consent_for_sharing: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Contribution failed');
      onStatusChange('done');
    } catch (e) {
      onStatusChange(e instanceof Error ? e.message : 'Contribution failed');
    }
  };

  return (
    <section className="p-4 rounded border border-adv-gray/20 bg-adv-card space-y-3">
      <div className="flex items-start gap-2">
        <Sparkles className="w-5 h-5 text-amber-400 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-adv-gray">Contribute back</h2>
          <p className="text-xs text-adv-gray mt-1">
            Outcome logged. If your symptom did not match an existing case, contribute it as a new diagnostic case so the next user gets a faster diagnosis.
          </p>
        </div>
      </div>

      {status === 'done' ? (
        <div className="p-2 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Case contributed. Thank you.
          <button onClick={onClose} className="ml-auto text-xs hover:underline">Back to projects</button>
        </div>
      ) : (
        <>
          <button
            onClick={onToggleOpen}
            className="text-xs text-adv-teal hover:underline"
          >
            {open ? 'Hide contribution form' : 'Contribute a new case'}
          </button>
          {open && (
            <div className="space-y-2 pt-2 border-t border-adv-gray/20">
              <Field label="Case ID (lowercase, hyphens)">
                <input value={caseId} onChange={e => setCaseId(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
              </Field>
              <Field label="Short title">
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
              </Field>
              <Field label="Severity">
                <select value={severity} onChange={e => setSeverity(e.target.value as typeof severity)} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm">
                  <option value="low">low</option>
                  <option value="moderate">moderate</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
              </Field>
              <Field label="Symptom">
                <textarea value={symptomText} onChange={e => setSymptomText(e.target.value)} rows={2} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
              </Field>
              <Field label="Probable cause">
                <textarea value={causeText} onChange={e => setCauseText(e.target.value)} rows={2} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
              </Field>
              <Field label="Resolution that worked">
                <textarea value={resolutionText} onChange={e => setResolutionText(e.target.value)} rows={2} className="w-full bg-adv-card border border-adv-gray/30 rounded p-2 text-sm" />
              </Field>
              <button
                onClick={submit}
                disabled={!title.trim() || !symptomText.trim() || !causeText.trim() || !resolutionText.trim() || status === 'pending'}
                className="w-full px-3 py-2 rounded bg-adv-teal text-adv-dark hover:bg-adv-teal-dark text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {status === 'pending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Submit contribution
              </button>
              {typeof status === 'string' && status !== 'pending' && status !== 'done' && (
                <div className="text-xs text-red-400">{status}</div>
              )}
              <p className="text-xs text-adv-gray">
                Contributions land as <code>authoritative=false</code> with you signed as the contributor. The community can review + ratify later. Tier 2/3 users should reference an HKP claim path or external evidence inline in the cause / resolution text.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-adv-gray mb-1">{label}</label>
      {children}
    </div>
  );
}

function ReasoningTrail({ trail }: { trail: Array<{ ts: string; phase: DiagnoseStep; text: string }> }) {
  return (
    <section className="p-3 rounded border border-adv-gray/20 bg-adv-card">
      <h3 className="text-xs uppercase tracking-wide text-adv-gray flex items-center gap-1 mb-2">
        <BookOpen className="w-3 h-3" /> Reasoning trail
      </h3>
      {trail.length === 0 ? (
        <p className="text-xs text-adv-gray italic">Trail builds up as you work the case. It signs and persists once you log an outcome.</p>
      ) : (
        <ol className="space-y-1 text-xs">
          {trail.map((t, i) => (
            <li key={i} className="border-l-2 border-adv-teal/40 pl-2">
              <div className="text-adv-gray">{new Date(t.ts).toLocaleTimeString()} · {t.phase}</div>
              <div className="text-adv-off-white">{t.text}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FocusCard({ focus }: { focus: CandidateCase | null }) {
  if (!focus) return null;
  return (
    <section className="p-3 rounded border border-adv-teal/30 bg-adv-teal/5">
      <h3 className="text-xs uppercase tracking-wide text-adv-gray flex items-center gap-1 mb-2">
        <Shield className="w-3 h-3" /> Focused case
      </h3>
      <div className="text-xs text-adv-gray">{focus.case_id}</div>
      <div className="text-sm font-medium">{focus.title}</div>
      {focus.case_data.related_cases && focus.case_data.related_cases.length > 0 && (
        <div className="mt-2 text-xs text-adv-gray">
          Related: {focus.case_data.related_cases.join(', ')}
        </div>
      )}
    </section>
  );
}

function severityClass(sev: string): string {
  if (sev === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (sev === 'high')     return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (sev === 'moderate' || sev === 'medium') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
}
