import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users2, Plus, X, Play, Square, Copy, Check, Download, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamMessage, createSession, fetchSession } from '@/lib/api';
import type { ClaudeRunConfig, ModelId, StreamEvent } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────

interface CouncilMember {
  id: string;
  role: string;
  model: ModelId;
}

type Phase = 'setup' | 'running' | 'done';
type OutputFormat = 'summary' | 'action-plan' | 'debate-transcript' | 'decision-memo' | 'consolidated-review';
type ConsensusMode = 'chair' | 'majority' | 'unanimity';
type VotePosition = 'agree' | 'disagree' | 'abstain';

interface CouncilVote {
  memberId: string;
  role: string;
  model: string;
  position: VotePosition;
  reason: string;
}

interface VoteTally {
  agree: number;
  disagree: number;
  abstain: number;
  outcome: string;
  notUnanimous: boolean;
}

/** Persisted council session loaded read-only via ?session=<id> */
interface ArchivedCouncil {
  title: string;
  messages: { role: string; content: string }[];
}

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

/** module_id under which council runs are persisted as sessions (shows up in My Work). */
const COUNCIL_MODULE_ID = 'ai-council';

function roleLabel(role: string): string {
  return ROLE_PRESETS.find((r) => r.id === role)?.label ?? role;
}

// ── Final-vote helpers (deterministic — the tally is computed in code) ─────

/** Extract a strict-JSON vote from a model response. Unparseable → abstain. */
function parseVote(text: string): { position: VotePosition; reason: string } {
  const match = text.match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as Record<string, unknown>;
      const pos = String(obj.position ?? '').trim().toLowerCase();
      if (pos === 'agree' || pos === 'disagree' || pos === 'abstain') {
        const reason = String(obj.oneLineReason ?? obj.reason ?? '').slice(0, 300);
        return { position: pos, reason };
      }
    } catch {
      // fall through to abstain
    }
  }
  return { position: 'abstain', reason: 'Vote could not be parsed — counted as abstain.' };
}

function tallyVotes(votes: CouncilVote[], mode: ConsensusMode): VoteTally {
  const agree = votes.filter((v) => v.position === 'agree').length;
  const disagree = votes.filter((v) => v.position === 'disagree').length;
  const abstain = votes.filter((v) => v.position === 'abstain').length;
  const notUnanimous = mode === 'unanimity' && disagree > 0;

  let outcome: string;
  if (mode === 'unanimity') {
    if (disagree > 0) outcome = 'NOT UNANIMOUS — consensus requirement not met';
    else if (agree > 0 && abstain === 0) outcome = 'UNANIMOUS AGREEMENT';
    else if (agree > 0) outcome = `Unanimous among voting members (${abstain} abstained)`;
    else outcome = 'No position — all members abstained';
  } else {
    if (agree > disagree) outcome = 'MAJORITY AGREE';
    else if (disagree > agree) outcome = 'MAJORITY DISAGREE';
    else outcome = 'NO MAJORITY — tied vote';
  }
  return { agree, disagree, abstain, outcome, notUnanimous };
}

/** Markdown vote section — used in the chair input, the export, and the persisted session. */
function voteSectionMd(votes: CouncilVote[], tally: VoteTally, mode: ConsensusMode): string {
  const lines = [
    `## Final Vote — ${mode === 'majority' ? 'Majority rule' : 'Unanimity rule'}`,
    '',
    '| Member | Model | Vote | Reason |',
    '|---|---|---|---|',
    ...votes.map((v) => `| ${roleLabel(v.role)} | ${MODEL_LABELS[v.model] ?? v.model} | **${v.position.toUpperCase()}** | ${v.reason.replace(/\|/g, '/')} |`),
    '',
    `**Tally (deterministic):** ${tally.agree} agree · ${tally.disagree} disagree · ${tally.abstain} abstain → **${tally.outcome}**`,
  ];
  if (tally.notUnanimous) {
    lines.push('', '> ⚠️ **NOT UNANIMOUS** — the unanimity consensus rule was selected but at least one member disagreed.');
  }
  return lines.join('\n');
}

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
  'claude-opus-4-8':           'Claude Opus 4.8',
  'claude-sonnet-4-6':         'Claude Sonnet 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-4o':                    'GPT-4o',
  'gpt-4o-mini':               'GPT-4o mini',
  'gemini-2.0-flash':          'Gemini 2.0 Flash',
  'mistral-large-latest':      'Mistral Large',
};

/** Flat list for the model <select> — value is the model ID (except ollama which is a prefix) */
const MODEL_GROUPS: { groupLabel: string; models: { id: string; label: string }[] }[] = [
  {
    groupLabel: 'Anthropic — Claude',
    models: [
      { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8 (best quality)' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 (balanced)' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fast)' },
    ],
  },
  {
    groupLabel: 'OpenAI — GPT',
    models: [
      { id: 'gpt-4o',      label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini (fast)' },
    ],
  },
  {
    groupLabel: 'Google — Gemini',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    ],
  },
  {
    groupLabel: 'Mistral',
    models: [
      { id: 'mistral-large-latest', label: 'Mistral Large' },
    ],
  },
  {
    groupLabel: 'Ollama — Local',
    models: [
      { id: '__ollama__', label: 'Ollama (local model)…' },
    ],
  },
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
      { id: crypto.randomUUID(), role: 'attacker', model: 'claude-opus-4-8' },
      { id: crypto.randomUUID(), role: 'defender', model: 'claude-sonnet-4-6' },
    ],
    chairModel: 'claude-opus-4-8',
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
    chairModel: 'claude-opus-4-8',
    rounds: 1,
    outputFormat: 'consolidated-review',
    consensus: 'chair',
    chainMode: true,
  };
}

function applyDevilsCouncilPreset(): Partial<CouncilSetup> {
  return {
    members: [
      { id: crypto.randomUUID(), role: 'devils-advocate', model: 'claude-opus-4-8' },
      { id: crypto.randomUUID(), role: 'defender', model: 'claude-sonnet-4-6' },
      { id: crypto.randomUUID(), role: 'risk-expert', model: 'claude-sonnet-4-6' },
      { id: crypto.randomUUID(), role: 'pragmatist', model: 'claude-haiku-4-5-20251001' },
    ],
    chairModel: 'claude-opus-4-8',
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
      { id: crypto.randomUUID(), role: 'devils-advocate', model: 'claude-opus-4-8' },
      { id: crypto.randomUUID(), role: 'defender', model: 'claude-sonnet-4-6' },
    ],
    chairModel: 'claude-opus-4-8',
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
  const isOllama = String(member.model).startsWith('ollama:');
  const [ollamaModel, setOllamaModel] = useState(isOllama ? String(member.model).replace('ollama:', '') : '');

  // Select value: '__ollama__' when model starts with 'ollama:', else the model id
  const selectValue = isOllama ? '__ollama__' : String(member.model);

  function handleModelChange(val: string) {
    if (val === '__ollama__') {
      onUpdate({ ...member, model: `ollama:${ollamaModel || 'llama3.2'}` as ModelId });
    } else {
      onUpdate({ ...member, model: val as ModelId });
    }
  }

  return (
    <div className="relative rounded-xl border border-border bg-adv-card p-4 min-w-[200px]">
      <button
        onClick={onRemove}
        disabled={disabled}
        className="absolute right-2 top-2 rounded p-1 text-adv-gray hover:text-adv-red transition-colors disabled:opacity-40"
      >
        <X className="h-3 w-3" />
      </button>

      <div className="mb-3">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-adv-gray">Role</label>
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
          className="w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-60"
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
            className="mt-1.5 w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-60"
          />
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-adv-gray">Model</label>
        <select
          value={selectValue}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-60"
        >
          {MODEL_GROUPS.map((g) => (
            <optgroup key={g.groupLabel} label={g.groupLabel}>
              {g.models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {isOllama && (
          <input
            type="text"
            value={ollamaModel}
            onChange={(e) => {
              setOllamaModel(e.target.value);
              onUpdate({ ...member, model: `ollama:${e.target.value}` as ModelId });
            }}
            placeholder="e.g. llama3.2, mistral, gemma3"
            disabled={disabled}
            className="mt-1.5 w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 disabled:opacity-60"
          />
        )}
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

  // Final-vote round (consensus = majority / unanimity)
  const [votes, setVotes] = useState<CouncilVote[]>([]);
  const [voteTally, setVoteTally] = useState<VoteTally | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  // Consensus mode of the run being displayed (frozen at run start)
  const runConsensusRef = useRef<ConsensusMode>('chair');

  // Persisted session for the current run (module_id = 'ai-council')
  const sessionIdRef = useRef<string | null>(null);

  // Read-only view of a past council loaded from My Work (?session=<id>)
  const [searchParams, setSearchParams] = useSearchParams();
  const archivedSessionId = searchParams.get('session');
  const [archived, setArchived] = useState<ArchivedCouncil | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!archivedSessionId) {
      setArchived(null);
      setArchiveError(null);
      return;
    }
    (async () => {
      try {
        const session = await fetchSession(archivedSessionId) as
          | (ArchivedCouncil & { messages?: { role: string; content: string }[] })
          | null;
        if (cancelled) return;
        if (!session) {
          setArchiveError('Council session not found.');
          return;
        }
        setArchived({ title: session.title, messages: session.messages ?? [] });
      } catch {
        if (!cancelled) setArchiveError('Failed to load council session.');
      }
    })();
    return () => { cancelled = true; };
  }, [archivedSessionId]);

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
    setVotes([]);
    setVoteTally(null);
    setIsVoting(false);
    runConsensusRef.current = setup.consensus;
    sessionIdRef.current = null;

    let aborted = false;
    const abortController = { abort: () => { aborted = true; } };
    abortRef.current = abortController;

    const ks = setup.webSearch ? WEB_SEARCH_KS : EMPTY_KS;
    let allRoundsContext = '';

    // Persist this council run as a session so it appears in My Work and
    // survives navigation. The chair exchange (full deliberation record →
    // synthesis) is stored via the standard /claude/message persistence path.
    try {
      const created = await createSession({
        moduleId: COUNCIL_MODULE_ID,
        title: `Council: ${setup.topic.trim().slice(0, 80)}`,
        config: {
          topic: setup.topic,
          members: setup.members.map((m) => ({ role: m.role, model: m.model })),
          chairModel: setup.chairModel,
          rounds: setup.rounds,
          consensus: setup.consensus,
          outputFormat: setup.outputFormat,
          chainMode: setup.chainMode,
          webSearch: setup.webSearch,
        },
      }) as { id?: string };
      sessionIdRef.current = created?.id ?? null;
    } catch {
      // Persistence is best-effort — the council still runs without it.
      sessionIdRef.current = null;
    }

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
            roundOutputs.push(`### ${roleLabel(member.role)} — ${MODEL_LABELS[member.model] ?? member.model}\n\n${text}`);
          }
        }

        if (!aborted) {
          const roundBlock = `## Round ${round} of ${setup.rounds}\n\n${roundOutputs.join('\n\n')}`;
          allRoundsContext += (allRoundsContext ? '\n\n' : '') + roundBlock;
          setRoundHistory((prev) => [...prev, roundBlock]);
        }
      }

      // ── Final vote round (consensus = majority / unanimity) ───────
      // Each member casts a structured JSON vote; the tally is computed in
      // code (deterministic) — the LLMs only supply positions and reasons.
      let voteMd = '';
      let finalTally: VoteTally | null = null;
      if (!aborted && setup.consensus !== 'chair') {
        setIsVoting(true);
        const collected: CouncilVote[] = [];

        for (const member of setup.members) {
          if (aborted) break;
          setActiveMemberId(member.id);

          const voteSys = `You are ${roleLabel(member.role)} in an AI Council. The deliberation is complete. Cast your formal FINAL VOTE under the "${setup.consensus}" consensus rule.

"agree" = based on the full deliberation, you endorse the proposal / dominant recommendation that emerged.
"disagree" = you oppose it.
"abstain" = you cannot take a position.

Respond with ONLY strict JSON — no markdown fences, no extra text:
{"position": "agree" | "disagree" | "abstain", "oneLineReason": "one short sentence"}`;

          let voteText = '';
          const voteStream = streamMessage(
            {
              model: member.model,
              thinking: 'quick',
              creativity: 'strict',
              systemPrompt: voteSys,
              userMessage: `TOPIC: ${setup.topic}\n\n${allRoundsContext}\n\nCast your vote now.`,
              history: [],
              outputFormats: [],
              knowledgeSources: EMPTY_KS,
            } satisfies ClaudeRunConfig
          );
          for await (const ev of voteStream as AsyncGenerator<StreamEvent>) {
            if (aborted) break;
            if (ev.type === 'text_delta') voteText += ev.content;
            if (ev.type === 'stream_end' || ev.type === 'error') break;
          }
          if (aborted) break;

          const parsed = parseVote(voteText);
          const vote: CouncilVote = {
            memberId: member.id,
            role: member.role,
            model: String(member.model),
            position: parsed.position,
            reason: parsed.reason,
          };
          collected.push(vote);
          setVotes([...collected]);
        }

        setIsVoting(false);
        if (!aborted && collected.length > 0) {
          finalTally = tallyVotes(collected, setup.consensus);
          setVoteTally(finalTally);
          voteMd = voteSectionMd(collected, finalTally, setup.consensus);
        }
      }

      // Chair synthesis
      if (!aborted) {
        setActiveMemberId('chair');
        setChairStreaming(true);

        const voteChairInstructions = finalTally
          ? `\n\nA formal final vote was held under the "${setup.consensus}" consensus rule. The deterministic tally below is authoritative — do NOT recount or alter it: ${finalTally.agree} agree · ${finalTally.disagree} disagree · ${finalTally.abstain} abstain → ${finalTally.outcome}.
Reproduce the Final Vote table from the deliberation record in your synthesis and reflect the voted outcome in your recommendation.${finalTally.notUnanimous ? '\nIMPORTANT: The council was NOT UNANIMOUS under the unanimity rule. State this prominently at the very top of your synthesis.' : ''}`
          : '';

        const chairSys = `You are the Chair of this AI Council. Your role is to synthesise the deliberation and produce: ${OUTPUT_FORMAT_PROMPTS[setup.outputFormat]}

Be decisive, structured, and clear. Your synthesis is the final deliverable.${voteChairInstructions}`;

        // The chair's user message doubles as the persisted deliberation record
        // (member responses with name/model headers + vote table).
        const deliberationRecord = [
          `# AI Council: ${setup.topic}`,
          allRoundsContext,
          voteMd,
        ].filter(Boolean).join('\n\n');

        let chairText = '';
        const chairStream = streamMessage(
          {
            model: setup.chairModel,
            thinking: 'think_hard',
            creativity: 'balanced',
            systemPrompt: chairSys,
            userMessage: deliberationRecord,
            history: [],
            outputFormats: [],
            knowledgeSources: EMPTY_KS,
            moduleId: COUNCIL_MODULE_ID,
            sessionId: sessionIdRef.current ?? undefined,
          } satisfies ClaudeRunConfig
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
      setIsVoting(false);
      setActiveMemberId(null);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setChairStreaming(false);
    setIsVoting(false);
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
    setVotes([]);
    setVoteTally(null);
    setIsVoting(false);
    sessionIdRef.current = null;
    if (archivedSessionId) setSearchParams({}, { replace: true });
  };

  const fullTranscript = [
    `# AI Council: ${setup.topic}`,
    '',
    ...roundHistory,
    votes.length > 0 && voteTally ? voteSectionMd(votes, voteTally, runConsensusRef.current) : '',
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
          className="w-full resize-y rounded-xl border border-border bg-adv-card px-4 py-3 text-sm text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      {/* Presets */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
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
            <span className="text-xs font-normal text-adv-gray">(2–6 members)</span>
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
            Chair Model
          </label>
          <select
            value={setup.chairModel}
            onChange={(e) => setSetup((prev) => ({ ...prev, chairModel: e.target.value as ModelId }))}
            className="w-full rounded-lg border border-border bg-adv-dark px-2 py-1.5 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            {MODEL_GROUPS.map((g) => (
              <optgroup key={g.groupLabel} label={g.groupLabel}>
                {g.models.filter(m => m.id !== '__ollama__').map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Rounds */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
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
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
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
                className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${
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
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-adv-gray">
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
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 ${
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
          <p className="text-xs text-adv-gray">Each member sees prior members' outputs in the same round (Peer Review Chain style)</p>
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
                : isVoting
                ? `Final vote in progress… (${votes.length}/${setup.members.length} votes cast)`
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
            <span className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
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
                    <span className="text-xs text-adv-gray">
                      {MODEL_LABELS[member.model] ?? member.model}
                    </span>
                  </div>
                  {text ? (
                    <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      {isActive && <span className="animate-pulse text-adv-teal">▊</span>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-adv-gray text-xs">
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

      {/* Final vote (consensus = majority / unanimity) */}
      {(votes.length > 0 || isVoting) && (
        <div>
          <div className="mb-3 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold uppercase tracking-wider text-adv-gray">
              Final Vote — {runConsensusRef.current === 'unanimity' ? 'Unanimity rule' : 'Majority rule'}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {voteTally?.notUnanimous && (
            <div className="mb-3 rounded-xl border border-adv-red/50 bg-adv-red/10 px-4 py-3">
              <span className="text-sm font-bold text-adv-red">⚠ NOT UNANIMOUS</span>
              <p className="mt-0.5 text-xs text-adv-off-white">
                The unanimity consensus rule was selected, but {voteTally.disagree} member{voteTally.disagree > 1 ? 's' : ''} disagreed.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-adv-card p-4">
            <div className="space-y-2">
              {votes.map((v) => (
                <div key={v.memberId} className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex w-20 shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold uppercase ${
                    v.position === 'agree'
                      ? 'bg-adv-green/15 text-adv-green'
                      : v.position === 'disagree'
                      ? 'bg-adv-red/15 text-adv-red'
                      : 'bg-adv-gray-med/20 text-adv-gray'
                  }`}>
                    {v.position}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-adv-off-white">{roleLabel(v.role)}</span>
                    <span className="ml-2 text-xs text-adv-gray">{MODEL_LABELS[v.model] ?? v.model}</span>
                    {v.reason && <p className="text-xs text-adv-gray">{v.reason}</p>}
                  </div>
                </div>
              ))}
              {isVoting && (
                <div className="flex items-center gap-2 text-xs text-adv-gray">
                  <span className="animate-pulse">…</span>
                  <span>Collecting votes</span>
                </div>
              )}
            </div>

            {voteTally && (
              <div className="mt-3 border-t border-border pt-3 text-xs text-adv-off-white">
                <span className="font-semibold">Tally:</span>{' '}
                {voteTally.agree} agree · {voteTally.disagree} disagree · {voteTally.abstain} abstain
                {' — '}
                <span className={`font-bold ${voteTally.notUnanimous ? 'text-adv-red' : 'text-adv-teal'}`}>
                  {voteTally.outcome}
                </span>
                <span className="ml-2 text-adv-gray">(tallied deterministically in code)</span>
              </div>
            )}
          </div>
        </div>
      )}

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
          <div>
            <span className="text-sm font-medium text-adv-off-white">Council complete</span>
            {sessionIdRef.current && chairOutput && (
              <p className="text-xs text-adv-gray">Saved to My Work</p>
            )}
          </div>
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

  // ── Render: Archived council (read-only, loaded via ?session=) ──

  const renderArchived = () => {
    const handleArchiveDownload = () => {
      if (!archived) return;
      const md = archived.messages
        .map((m) => (m.role === 'assistant' ? `## Chair Synthesis\n\n${m.content}` : m.content))
        .join('\n\n');
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-council.md';
      a.click();
      URL.revokeObjectURL(url);
    };

    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
        {archiveError ? (
          <div className="rounded-xl border border-adv-red/40 bg-adv-red/10 px-4 py-3 text-sm text-adv-red">
            {archiveError}
          </div>
        ) : !archived ? (
          <div className="flex items-center gap-2 text-sm text-adv-gray">
            <span className="animate-pulse">…</span> Loading saved council
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-adv-card p-4">
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-adv-off-white">{archived.title}</span>
                <p className="text-xs text-adv-gray">Saved council session (read-only)</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleArchiveDownload}
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

            {archived.messages.length === 0 && (
              <div className="rounded-xl border border-border bg-adv-card px-4 py-3 text-xs text-adv-gray">
                No transcript was saved for this run — the council was stopped before the chair synthesis.
              </div>
            )}

            {archived.messages.map((m, i) => (
              <div key={i} className={`rounded-xl border p-5 ${m.role === 'assistant' ? 'border-adv-teal/20' : 'border-border'} bg-adv-card`}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">
                  {m.role === 'assistant' ? 'Chair Synthesis' : 'Deliberation Record'}
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-adv-off-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    );
  };

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
        {archivedSessionId ? renderArchived() : phase === 'setup' ? renderSetup() : renderDeliberation()}
      </div>
    </div>
  );
}
