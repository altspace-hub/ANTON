import { useState, useRef } from 'react';
import { Users2, Plus, X, Play, Square, Copy, Check, Download, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage } from '@/lib/api';
import type { ModelId, StreamEvent } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────

interface CouncilMember {
  id: string;
  role: string;
  model: ModelId;
}

type Phase = 'setup' | 'running' | 'done';
type OutputFormat = 'summary' | 'action-plan' | 'debate-transcript' | 'decision-memo' | 'consolidated-review';
type ConsensusMode = 'chair' | 'majority' | 'unanimity';

interface CouncilSetup {
  topic: string;
  members: CouncilMember[];
  chairModel: ModelId;
  rounds: number;
  webSearch: boolean;
  consensus: ConsensusMode;
  outputFormat: OutputFormat;
  chainMode: boolean; // peer-review-chain: pass prior outputs in same round
}

// ── Constants ─────────────────────────────────────────────────

const ROLE_PRESETS = [
  { id: 'devils-advocate', label: "Devil's Advocate", prompt: "Challenge every assumption. Argue the strongest opposing view. Be analytically relentless but not personal." },
  { id: 'defender', label: 'Defender', prompt: 'Build the strongest possible case for the proposal or argument. Identify evidence, logic, and precedent that supports it.' },
  { id: 'risk-expert', label: 'Risk Expert', prompt: 'Identify risks, failure modes, and mitigations. Think in likelihood x impact. What could go wrong and how can it be prevented?' },
  { id: 'legal-counsel', label: 'Legal Counsel', prompt: 'Review for legal, regulatory, and contractual implications. Flag liability, ambiguity, and compliance gaps.' },
  { id: 'optimist', label: 'Optimist', prompt: 'Identify opportunities, upsides, and confidence-builders. What are the best-case scenarios and how can they be realised?' },
  { id: 'pragmatist', label: 'Pragmatist', prompt: 'Focus on what is operationally feasible and actionable. What can actually be done, by whom, and when?' },
  { id: 'reviewer-1', label: 'Reviewer 1', prompt: 'Conduct a thorough peer review. Assess methodology, evidence, and soundness of conclusions.' },
  { id: 'reviewer-2', label: 'Reviewer 2', prompt: 'Conduct a thorough peer review. Build on prior reviews, fill gaps, and add your independent perspective.' },
  { id: 'reviewer-3', label: 'Reviewer 3', prompt: 'Conduct a thorough peer review. Consolidate insights from prior reviewers and add final recommendations.' },
  { id: 'attacker', label: 'Attacker', prompt: 'You are a red-team attacker. Find every vulnerability, exploit, and weakness in the plan. Think adversarially.' },
  { id: 'custom', label: 'Custom role…', prompt: '' },
] as const;

const ROLE_PROMPT_MAP: Record<string, string> = Object.fromEntries(
  ROLE_PRESETS.map((r) => [r.id, r.prompt])
);

const OUTPUT_FORMAT_LABELS: Record<OutputFormat, string> = {
  summary: 'Summary',
  'action-plan': 'Action Plan',
  'debate-transcript': 'Debate Transcript',
  'decision-memo': 'Decision Memo',
  'consolidated-review': 'Consolidated Review',
};

const OUTPUT_FORMAT_PROMPTS: Record<OutputFormat, string> = {
  summary: 'a concise executive summary covering the key perspectives, points of agreement, points of disagreement, and your synthesis recommendation.',
  'action-plan': 'a structured action plan with prioritised actions, owners, timelines, and rationale based on the council deliberation.',
  'debate-transcript': 'a structured debate transcript that fairly represents each position, then your chair synthesis.',
  'decision-memo': 'a formal decision memo: Background → Options Considered → Key Risks → Recommendation → Next Steps.',
  'consolidated-review': 'a consolidated peer review report synthesising all reviewers\' findings, highlighting consensus points, conflicts, and final recommendations.',
};

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-6': 'Opus',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-haiku-4-5-20251001': 'Haiku',
};

const MODEL_OPTIONS: { id: ModelId; label: string }[] = [
  { id: 'claude-opus-4-6', label: 'Opus' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku' },
];

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

const WEB_SEARCH_KS = {
  modes: {
    claudeKnowledge: { enabled: true, webSearchEnabled: true, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

// ── Council Presets ────────────────────────────────────────────

function applyRedTeamPreset(): Partial<CouncilSetup> {
  return {
    members: [
      { id: crypto.randomUUID(), role: 'attacker', model: 'claude-opus-4-6' },
      { id: crypto.randomUUID(), role: 'defender', model: 'claude-sonnet-4-6' },
    ],
    chairModel: 'claude-opus-4-6',
    rounds: 2,
    outputFormat: 'summary',
    consensus: 'chair',
    chainMode: false,
  };
}

function applyPeerReviewPreset(): Partial<CouncilSetup> {
  return {
    members: [
      { id: crypto.randomUUID(), role: 'reviewer-1', model: 'claude-sonnet-4-6' },
      { id: crypto.randomUUID(), role: 'reviewer-2', model: 'claude-sonnet-4-6' },
      { id: crypto.randomUUID(), role: 'reviewer-3', model: 'claude-sonnet-4-6' },
    ],
    chairModel: 'claude-opus-4-6',
    rounds: 1,
    outputFormat: 'consolidated-review',
    consensus: 'chair',
    chainMode: true,
  };
}

function applyDevilsCouncilPreset(): Partial<CouncilSetup> {
  return {
    members: [
      { id: crypto.randomUUID(), role: 'devils-advocate', model: 'claude-opus-4-6' },
      { id: crypto.randomUUID(), role: 'defender', model: 'claude-sonnet-4-6' },
      { id: crypto.randomUUID(), role: 'risk-expert', model: 'claude-sonnet-4-6' },
      { id: crypto.randomUUID(), role: 'pragmatist', model: 'claude-haiku-4-5-20251001' },
    ],
    chairModel: 'claude-opus-4-6',
    rounds: 3,
    outputFormat: 'decision-memo',
    consensus: 'chair',
    chainMode: false,
  };
}

// ── Default setup ──────────────────────────────────────────────

function defaultSetup(): CouncilSetup {
  return {
    topic: '',
    members: [
      { id: crypto.randomUUID(), role: 'devils-advocate', model: 'claude-opus-4-6' },
      { id: crypto.randomUUID(), role: 'defender', model: 'claude-sonnet-4-6' },
    ],
    chairModel: 'claude-opus-4-6',
    rounds: 2,
    webSearch: false,
    consensus: 'chair',
    outputFormat: 'summary',
    chainMode: false,
  };
}

// ── MemberCard ─────────────────────────────────────────────────

interface MemberCardProps {
  member: CouncilMember;
  onUpdate: (updated: CouncilMember) => void;
  onRemove: () => void;
  disabled: boolean;
}

function MemberCard({ member, onUpdate, onRemove, disabled }: MemberCardProps) {
  const [customRole, setCustomRole] = useState(
    ROLE_PRESETS.find((r) => r.id === member.role) ? '' : member.role
  );
  const isCustom = !ROLE_PRESETS.slice(0, -1).find((r) => r.id === member.role);

  return (
    <div className="relative rounded-xl border border-border bg-adv-card p-4 min-w-[180px]">
      <button
        onClick={onRemove}
        disabled={disabled}
        className="absolute right-2 top-2 rounded p-1 text-adv-gray-med hover:text-adv-red transition-colors disabled:opacity-40"
      >
        <X className="h-3 w-3" />
      </button>

      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-adv-gray-med">Role</label>
        <select
          value={isCustom ? 'custom' : member.role}
          onChange={(e) => {
            if (e.target.value === 'custom') {
              onUpdate({ ...member, role: customRole || 'Custom' });
            } else {
              onUpdate({ ...member, role: e.target.value });
            }
          }}
          disabled={disabled}
          className="w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none disabled:opacity-60"
        >
          {ROLE_PRESETS.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
        {isCustom && (
          <input
            type="text"
            value={customRole}
            onChange={(e) => {
              setCustomRole(e.target.value);
              onUpdate({ ...member, role: e.target.value });
            }}
            placeholder="Enter role name…"
            disabled={disabled}
            className="mt-1.5 w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none disabled:opacity-60"
          />
        )}
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-adv-gray-med">Model</label>
        <div className="flex gap-1.5 flex-wrap">
          {MODEL_OPTIONS.map((m) => (
            <button
              key={m.id}
              onClick={() => onUpdate({ ...member, model: m.id })}
              disabled={disabled}
              className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-60 ${
                member.model === m.id
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border text-adv-gray hover:border-adv-teal/40'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export default function AICouncilPage() {
  const [setup, setSetup] = useState<CouncilSetup>(defaultSetup);
  const [phase, setPhase] = useState<Phase>('setup');
  const [currentRound, setCurrentRound] = useState(0);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [memberStreams, setMemberStreams] = useState<Record<string, string>>({});
  const [roundHistory, setRoundHistory] = useState<string[]>([]);
  const [chairOutput, setChairOutput] = useState('');
  const [chairStreaming, setChairStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);

  const isRunning = phase === 'running';

  // ── Helpers ──────────────────────────────────────────────────

  const updateMember = (id: string, updated: CouncilMember) => {
    setSetup((prev) => ({
      ...prev,
      members: prev.members.map((m) => (m.id === id ? updated : m)),
    }));
  };

  const removeMember = (id: string) => {
    setSetup((prev) => ({
      ...prev,
      members: prev.members.filter((m) => m.id !== id),
    }));
  };

  const addMember = () => {
    if (setup.members.length >= 6) return;
    setSetup((prev) => ({
      ...prev,
      members: [
        ...prev.members,
        { id: crypto.randomUUID(), role: 'risk-expert', model: 'claude-sonnet-4-6' },
      ],
    }));
  };

  const applyPreset = (preset: Partial<CouncilSetup>) => {
    setSetup((prev) => ({ ...prev, ...preset }));
  };

  // ── Orchestration ─────────────────────────────────────────────

  const runCouncil = async () => {
    if (!setup.topic.trim() || setup.members.length < 1) return;

    setPhase('running');
    setMemberStreams({});
    setRoundHistory([]);
    setChairOutput('');
    setChairStreaming(false);
    setCurrentRound(0);

    let aborted = false;
    const abortController = { abort: () => { aborted = true; } };
    abortRef.current = abortController;

    const ks = setup.webSearch ? WEB_SEARCH_KS : EMPTY_KS;
    let allRoundsContext = '';

    try {
      for (let round = 1; round <= setup.rounds; round++) {
        if (aborted) break;
        setCurrentRound(round);
        const roundOutputs: string[] = [];

        for (const member of setup.members) {
          if (aborted) break;

          // In chain mode (peer-review), pass prior member outputs from this round
          const priorInRound = setup.chainMode && roundOutputs.length > 0
            ? `\n\n--- PREVIOUS REVIEWERS IN THIS ROUND ---\n${roundOutputs.join('\n\n')}`
            : '';

          const userMsg = allRoundsContext
            ? `${setup.topic}\n\n--- PREVIOUS ROUNDS ---\n${allRoundsContext}${priorInRound}`
            : `${setup.topic}${priorInRound}`;

          const rolePrompt = ROLE_PROMPT_MAP[member.role] ?? member.role;
          const sysPrompt = `You are ${member.role} in an AI Council deliberation. Round ${round} of ${setup.rounds}.

Your role: ${rolePrompt}

Be specific, analytical, and stay in your assigned role. Respond in 3-6 paragraphs. Use headings where helpful.`;

          setActiveMemberId(member.id);

          let text = '';
          setMemberStreams((prev) => ({ ...prev, [member.id]: '' }));

          const stream = streamMessage(
            {
              model: member.model,
              thinking: 'think',
              creativity: 'balanced',
              systemPrompt: sysPrompt,
              userMessage: userMsg,
              history: [],
              outputFormats: [],
              knowledgeSources: ks,
            }
          );

          for await (const ev of stream as AsyncGenerator<StreamEvent>) {
            if (aborted) break;
            if (ev.type === 'text_delta') {
              text += ev.content;
              setMemberStreams((prev) => ({ ...prev, [member.id]: text }));
            }
            if (ev.type === 'stream_end' || ev.type === 'error') break;
          }

          if (!aborted) {
            roundOutputs.push(`[${member.role} — ${MODEL_LABELS[member.model] ?? member.model}]\n${text}`);
          }
        }

        if (!aborted) {
          const roundBlock = `=== Round ${round} of ${setup.rounds} ===\n${roundOutputs.join('\n\n')}`;
          allRoundsContext += (allRoundsContext ? '\n\n' : '') + roundBlock;
          setRoundHistory((prev) => [...prev, roundBlock]);
        }
      }

      // Chair synthesis
      if (!aborted) {
        setActiveMemberId('chair');
        setChairStreaming(true);

        const chairSys = `You are the Chair of this AI Council. Your role is to synthesise the deliberation and produce: ${OUTPUT_FORMAT_PROMPTS[setup.outputFormat]}

Be decisive, structured, and clear. Your synthesis is the final deliverable.`;

        let chairText = '';
        const chairStream = streamMessage(
          {
            model: setup.chairModel,
            thinking: 'think_hard',
            creativity: 'balanced',
            systemPrompt: chairSys,
            userMessage: `TOPIC: ${setup.topic}\n\n${allRoundsContext}`,
            history: [],
            outputFormats: [],
            knowledgeSources: EMPTY_KS,
          }
        );

        for await (const ev of chairStream as AsyncGenerator<StreamEvent>) {
          if (aborted) break;
          if (ev.type === 'text_delta') {
            chairText += ev.content;
            setChairOutput(chairText);
          }
          if (ev.type === 'stream_end' || ev.type === 'error') break;
        }

        setChairStreaming(false);
        setActiveMemberId(null);
        if (!aborted) setPhase('done');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err);
      setChairStreaming(false);
      setActiveMemberId(null);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setChairStreaming(false);
    setActiveMemberId(null);
    if (phase === 'running') setPhase('done');
  };

  const handleReset = () => {
    abortRef.current?.abort();
    setPhase('setup');
    setCurrentRound(0);
    setMemberStreams({});
    setRoundHistory([]);
    setChairOutput('');
    setChairStreaming(false);
    setActiveMemberId(null);
  };

  const fullTranscript = [
    `# AI Council: ${setup.topic}`,
    '',
    ...roundHistory,
    chairOutput ? `\n## Chair Synthesis\n\n${chairOutput}` : '',
  ].filter(Boolean).join('\n\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(fullTranscript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([fullTranscript], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai-council.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render: Setup Phase ────────────────────────────────────────

  const renderSetup = () => (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
      {/* Topic */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-adv-off-white">
          Topic / Task
        </label>
        <textarea
          value={setup.topic}
          onChange={(e) => setSetup((prev) => ({ ...prev, topic: e.target.value }))}
          placeholder="Describe the document, decision, plan, or question for the council to deliberate on…"
          rows={4}
          className="w-full resize-y rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none"
        />
      </div>

      {/* Presets */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
          Quick Presets
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Red Team', fn: applyRedTeamPreset },
            { label: 'Peer Review Chain', fn: applyPeerReviewPreset },
            { label: "Devil's Council", fn: applyDevilsCouncilPreset },
          ].map(({ label, fn }) => (
            <button
              key={label}
              onClick={() => applyPreset(fn())}
              className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs font-medium text-adv-gray transition-colors hover:border-adv-teal/50 hover:text-adv-teal"
            >
              {label} ▶
            </button>
          ))}
        </div>
      </div>

      {/* Council Members */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-semibold text-adv-off-white">
            Council Members{' '}
            <span className="text-xs font-normal text-adv-gray-med">(2–6 members)</span>
          </label>
          <button
            onClick={addMember}
            disabled={setup.members.length >= 6}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-adv-gray transition-colors hover:border-adv-teal/50 hover:text-adv-teal disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add Member
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {setup.members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onUpdate={(updated) => updateMember(member.id, updated)}
              onRemove={() => removeMember(member.id)}
              disabled={false}
            />
          ))}
        </div>
      </div>

      {/* Council config row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Chair model */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
            Chair Model
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => setSetup((prev) => ({ ...prev, chairModel: m.id }))}
                className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                  setup.chairModel === m.id
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border text-adv-gray hover:border-adv-teal/40'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rounds */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
            Rounds
          </label>
          <div className="flex gap-1.5">
            {[1, 2, 3].map((r) => (
              <button
                key={r}
                onClick={() => setSetup((prev) => ({ ...prev, rounds: r }))}
                className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                  setup.rounds === r
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border text-adv-gray hover:border-adv-teal/40'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Web search */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
            Web Search
          </label>
          <div className="flex gap-1.5">
            {[
              { label: 'On', value: true },
              { label: 'Off', value: false },
            ].map(({ label, value }) => (
              <button
                key={label}
                onClick={() => setSetup((prev) => ({ ...prev, webSearch: value }))}
                className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
                  setup.webSearch === value
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border text-adv-gray hover:border-adv-teal/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Consensus */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
            Consensus
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {(
              [
                { label: 'Chair decides', value: 'chair' },
                { label: 'Majority', value: 'majority' },
                { label: 'Unanimity', value: 'unanimity' },
              ] as { label: string; value: ConsensusMode }[]
            ).map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setSetup((prev) => ({ ...prev, consensus: value }))}
                className={`rounded border px-2 py-1 text-[10px] font-medium transition-colors ${
                  setup.consensus === value
                    ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                    : 'border-border text-adv-gray hover:border-adv-teal/40'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Output format */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
          Output Format
        </label>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(OUTPUT_FORMAT_LABELS) as [OutputFormat, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSetup((prev) => ({ ...prev, outputFormat: id }))}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                setup.outputFormat === id
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chain mode toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSetup((prev) => ({ ...prev, chainMode: !prev.chainMode }))}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            setup.chainMode ? 'bg-adv-teal' : 'bg-adv-card border border-border'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
              setup.chainMode ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
        <div>
          <span className="text-sm font-medium text-adv-off-white">Chain Mode</span>
          <p className="text-xs text-adv-gray-med">Each member sees prior members' outputs in the same round (Peer Review Chain style)</p>
        </div>
      </div>

      {/* Start button */}
      <button
        onClick={runCouncil}
        disabled={!setup.topic.trim() || setup.members.length < 1}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-adv-teal px-4 py-3 text-sm font-semibold text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
        Start Council
      </button>
    </div>
  );

  // ── Render: Running / Done Phase ───────────────────────────────

  const renderDeliberation = () => (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      {/* Progress indicator */}
      {phase === 'running' && (
        <div className="flex items-center justify-between rounded-xl border border-adv-teal/30 bg-adv-teal-soft px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-adv-teal" />
            <span className="text-sm font-medium text-adv-teal">
              {activeMemberId === 'chair'
                ? 'Chair synthesising…'
                : currentRound > 0
                ? `Round ${currentRound} of ${setup.rounds}`
                : 'Starting…'}
            </span>
          </div>
          <button
            onClick={handleStop}
            className="flex items-center gap-1.5 rounded-lg bg-adv-red/10 px-3 py-1 text-xs font-medium text-adv-red hover:bg-adv-red/20 transition-colors"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        </div>
      )}

      {/* Member outputs grouped by round */}
      {Array.from({ length: Math.max(currentRound, roundHistory.length) }, (_, i) => i + 1).map((round) => (
        <div key={round}>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-wider text-adv-gray-med">
              Round {round} of {setup.rounds}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="space-y-3">
            {setup.members.map((member) => {
              const text = memberStreams[member.id] ?? '';
              const isActive = activeMemberId === member.id && phase === 'running' && currentRound === round;
              if (!text && !isActive) return null;

              return (
                <div
                  key={member.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isActive
                      ? 'border-adv-teal/50 bg-adv-teal-soft'
                      : 'border-border bg-adv-card'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${isActive ? 'animate-pulse bg-adv-teal' : 'bg-adv-gray-med'}`} />
                    <span className="text-xs font-semibold text-adv-off-white capitalize">
                      {member.role.replace(/-/g, ' ')}
                    </span>
                    <span className="text-[10px] text-adv-gray-med">
                      {MODEL_LABELS[member.model] ?? member.model}
                    </span>
                  </div>
                  {text ? (
                    <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      {isActive && <span className="animate-pulse text-adv-teal">▊</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-adv-gray-med text-xs">
                      <span className="animate-pulse">…</span>
                      <span>Thinking</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Chair synthesis */}
      {(chairOutput || chairStreaming) && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-wider text-adv-teal">
              Chair Synthesis ({MODEL_LABELS[setup.chairModel] ?? setup.chairModel}) — {OUTPUT_FORMAT_LABELS[setup.outputFormat]}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className={`rounded-xl border p-5 ${chairStreaming ? 'border-adv-teal/50 bg-adv-teal-soft' : 'border-adv-teal/20 bg-adv-card'}`}>
            <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{chairOutput}</ReactMarkdown>
              {chairStreaming && <span className="animate-pulse text-adv-teal">▊</span>}
            </div>
          </div>
        </div>
      )}

      {/* Actions when done */}
      {phase === 'done' && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-adv-card p-4">
          <span className="text-sm font-medium text-adv-off-white">Council complete</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:bg-adv-dark hover:text-adv-off-white transition-colors"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:bg-adv-dark hover:text-adv-off-white transition-colors"
            >
              <Download className="h-3 w-3" />
              .md
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              New Council
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Root render ────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
              <Users2 className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-adv-off-white">AI Council</h1>
              <p className="text-xs text-adv-gray">
                Multi-model deliberation — assemble a council, run structured rounds, let the Chair synthesise
              </p>
            </div>
          </div>
          {phase !== 'setup' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSetup((prev) => ({ ...prev }))}
                className="rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-gray flex items-center gap-1.5 hover:border-adv-teal/40 hover:text-adv-off-white transition-colors"
              >
                <ChevronDown className="h-3 w-3 -rotate-90" />
                Setup
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        {phase === 'setup' ? renderSetup() : renderDeliberation()}
      </div>
    </div>
  );
}
