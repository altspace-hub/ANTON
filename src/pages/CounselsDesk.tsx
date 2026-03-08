/**
 * CounselsDesk.tsx
 * Persistent multi-tab legal research workspace for FCP lawyers and compliance counsel.
 * Supports 8 interaction modes, expert role switching, pinned findings, and auto-citation capture.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Scale, BookOpen, FlaskConical, GitCompare, Search, FileText,
  SearchCheck, Globe, Zap, Plus, X, Pin, Download, Trash2,
  ChevronDown, RefreshCw, Copy, CheckSquare, Languages,
} from 'lucide-react';
import { getAuthHeader, fetchWithAuth } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LegalMode {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  thinking: string;
}

interface ExpertRole {
  id: string;
  label: string;
  focus: string;
}

interface ResearchQuestion {
  id: string;
  title: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  status: 'idle' | 'streaming' | 'done';
}

interface PinnedFinding {
  id: string;
  text: string;
  source: string;
  pinnedAt: string;
}

interface Citation {
  id: string;
  ref: string;
  text: string;
  type: 'regulation' | 'directive' | 'guideline' | 'case-law' | 'other';
}

interface LegalSession {
  id: string;
  title: string;
  mode: string;
  expert_role: string;
  research_questions: string;
  pinned_findings: string;
  citations: string;
  active_knowledge_packs?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODES: LegalMode[] = [
  { id: 'deep-dive', label: 'Regulatory Deep-Dive', icon: BookOpen, description: 'Full article analysis: text, recitals, EBA Q&As, case law, supervisory practice', thinking: 'think_hard' },
  { id: 'hypothetical', label: 'Hypothetical / Test Case', icon: FlaskConical, description: 'Apply legal tests to a specific scenario — structured IRAC analysis', thinking: 'think_hard' },
  { id: 'comparison', label: 'Regulation Comparison', icon: GitCompare, description: 'Side-by-side: old vs new, EU vs UK vs US, AMLR vs AMLD6', thinking: 'think' },
  { id: 'case-law', label: 'Case Law Explorer', icon: Search, description: 'CJEU decisions, EBA Q&As, enforcement precedents on a topic', thinking: 'quick' },
  { id: 'opinion', label: 'Legal Opinion Draft', icon: FileText, description: 'Formal IRAC legal opinion suitable for client or board delivery', thinking: 'investigate' },
  { id: 'gap-spotter', label: 'Regulatory Gap Spotter', icon: SearchCheck, description: 'Given org profile → identify applicable obligations and gaps', thinking: 'investigate' },
  { id: 'comparative-jurisdiction', label: 'Comparative Jurisdiction', icon: Globe, description: 'Topic × jurisdiction matrix (EU / UK / US / Nordic)', thinking: 'think_hard' },
  { id: 'rapid-risk', label: 'Legal Risk Rapid', icon: Zap, description: 'Quick scenario → traffic-light risk + obligations + mitigations', thinking: 'quick' },
];

const EXPERT_ROLES: ExpertRole[] = [
  { id: 'eu-regulatory-lawyer', label: 'EU Regulatory Lawyer', focus: 'AMLR, AMLD6, AMLA, DORA, MiFID II, MAR' },
  { id: 'sanctions-lawyer', label: 'Sanctions Lawyer', focus: 'EU, OFAC, OFSI sanctions frameworks' },
  { id: 'abc-counsel', label: 'Anti-Bribery Counsel', focus: 'FCPA, UK Bribery Act, OECD Convention' },
  { id: 'nordic-compliance', label: 'Nordic Compliance Counsel', focus: 'SE, FI, DK, NO, IS AML/CFT legislation' },
  { id: 'financial-crime-barrister', label: 'Financial Crime Barrister', focus: 'Criminal law, POCA, LPP, court proceedings' },
  { id: 'regulatory-affairs', label: 'Regulatory Affairs Advisor', focus: 'EBA/ESMA RTS, ITS, Guidelines, Q&As' },
];

const MODE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'deep-dive': BookOpen, 'hypothetical': FlaskConical, 'comparison': GitCompare,
  'case-law': Search, 'opinion': FileText, 'gap-spotter': SearchCheck,
  'comparative-jurisdiction': Globe, 'rapid-risk': Zap,
};

// Default knowledge packs auto-activated for all Counsel's Desk sessions
const DEFAULT_PACK_IDS = ['amlr-2024', 'eu-sanctions', 'amla-amld6', 'wolfsberg-principles', 'abc-anti-bribery'];

const PRIORITY_PACKS: Array<{ id: string; label: string }> = [
  { id: 'amlr-2024', label: 'AMLR 2024' },
  { id: 'eu-sanctions', label: 'EU Sanctions' },
  { id: 'amla-amld6', label: 'AMLA / AMLD6' },
  { id: 'wolfsberg-principles', label: 'Wolfsberg Principles' },
  { id: 'abc-anti-bribery', label: 'ABC Pack' },
];

// Citation auto-capture patterns — require enough context to avoid false positives
const CITATION_PATTERNS = [
  { pattern: /Regulation \(EU\) \d{4}\/\d+(?:\s+of\s+[^,\n]{0,80})?/g, type: 'regulation' as const },
  { pattern: /Directive \(EU\) \d{4}\/\d+(?:\s+of\s+[^,\n]{0,80})?/g, type: 'directive' as const },
  // Only capture Art. with a framework qualifier (e.g. "AMLR Art.12" or "Art.12(3)(b)")
  { pattern: /(?:AMLR|DORA|AMLD|MiFID|MAR|GDPR|CRR|CRD)\s+Art\.\s*\d+(?:\(\d+\))?(?:\([a-z]\))?/g, type: 'regulation' as const },
  { pattern: /EBA\/[A-Z]+\/\d{4}\/\d+[^,\n]*/g, type: 'guideline' as const },
  { pattern: /EBA Guidelines on [^,\n]{10,80}/g, type: 'guideline' as const },
  { pattern: /Case C-\d+\/\d+[^,\n]*/g, type: 'case-law' as const },
  { pattern: /OFAC SDN[^,\n]{0,50}/g, type: 'other' as const },
];

function extractCitations(text: string): Citation[] {
  const found: Citation[] = [];
  const seen = new Set<string>();
  for (const { pattern, type } of CITATION_PATTERNS) {
    const matches = text.match(new RegExp(pattern.source, 'g')) || [];
    for (const match of matches) {
      const trimmed = match.trim();
      if (trimmed.length > 5 && !seen.has(trimmed)) {
        seen.add(trimmed);
        found.push({ id: `${Date.now()}-${Math.random()}`, ref: trimmed, text: trimmed, type });
      }
    }
  }
  return found;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ModeCard({ mode, selected, onClick }: { mode: LegalMode; selected: boolean; onClick: () => void }) {
  const Icon = mode.icon;
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 border transition-all ${selected
        ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
        : 'border-border bg-adv-card text-adv-gray hover:border-adv-teal/40 hover:text-adv-off-white'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-semibold">{mode.label}</span>
      </div>
      <p className="text-[11px] leading-relaxed opacity-80">{mode.description}</p>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CounselsDesk() {
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; mode: string; expert_role: string; updated_at: string }>>([]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<LegalSession | null>(null);
  const [questions, setQuestions] = useState<ResearchQuestion[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [pinnedFindings, setPinnedFindings] = useState<PinnedFinding[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [userInput, setUserInput] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  // ONBOARD-04: plain language mode — prepends a non-technical summary before full legal analysis
  const [plainLanguageMode, setPlainLanguageMode] = useState(false);
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selectedMode, setSelectedMode] = useState('deep-dive');
  const [selectedRole, setSelectedRole] = useState('eu-regulatory-lawyer');
  const [selectionText, setSelectionText] = useState('');
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [pinSource, setPinSource] = useState('');
  const [activeKnowledgePacks, setActiveKnowledgePacks] = useState<string[]>(DEFAULT_PACK_IDS);
  const outputRef = useRef<HTMLDivElement>(null);
  const modeSelectorRef = useRef<HTMLDivElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modeSelectorRef.current && !modeSelectorRef.current.contains(e.target as Node)) {
        setShowModeSelector(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setShowRoleDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Load session list ──────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch('/api/legal-research', { headers: getAuthHeader() });
      if (r.ok) setSessions(await r.json().then(d => d.sessions));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Pre-fill input from ?prefill= deep-link (e.g. from Gap Assessment "Research" button)
  useEffect(() => {
    const prefill = searchParams.get('prefill');
    if (prefill) setUserInput(prefill);
  }, [searchParams]);

  // ── Load session detail ────────────────────────────────────────────────────
  const loadSession = useCallback(async (id: string) => {
    setLoadingSession(true);
    try {
      const r = await fetch(`/api/legal-research/${id}`, { headers: getAuthHeader() });
      if (!r.ok) return;
      const { session } = await r.json();
      setActiveSession(session);
      let qs: ResearchQuestion[] = [];
      try { qs = JSON.parse(session.research_questions || '[]'); } catch { /* ignore */ }
      const firstQ = qs.length > 0 ? qs[0] : createNewQuestion();
      setQuestions(qs.length > 0 ? qs : [firstQ]);
      setActiveTabId(firstQ.id);
      try { setPinnedFindings(JSON.parse(session.pinned_findings || '[]')); } catch { /* ignore */ }
      try { setCitations(JSON.parse(session.citations || '[]')); } catch { /* ignore */ }
      try { setActiveKnowledgePacks(JSON.parse(session.active_knowledge_packs || JSON.stringify(DEFAULT_PACK_IDS))); } catch { setActiveKnowledgePacks(DEFAULT_PACK_IDS); }
    } catch { /* ignore */ } finally {
      setLoadingSession(false);
    }
  }, []);

  function createNewQuestion(): ResearchQuestion {
    return { id: `q-${Date.now()}`, title: 'New question', messages: [], status: 'idle' };
  }

  // ── Delete session ─────────────────────────────────────────────────────────
  const deleteSession = async (id: string) => {
    await fetchWithAuth(`/api/legal-research/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
    setDeletingSessionId(null);
    if (activeSession?.id === id) setActiveSession(null);
  };

  // ── Create new session ─────────────────────────────────────────────────────
  const createSession = async () => {
    if (!newTitle.trim()) return;
    try {
      const r = await fetchWithAuth('/api/legal-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, mode: selectedMode, expert_role: selectedRole, active_knowledge_packs: DEFAULT_PACK_IDS }),
      });
      if (!r.ok) return;
      const { session } = await r.json();
      setShowNewSession(false);
      setNewTitle('');
      await loadSessions();
      const firstQ = createNewQuestion();
      setQuestions([firstQ]);
      setActiveTabId(firstQ.id);
      setPinnedFindings([]);
      setCitations([]);
      setActiveKnowledgePacks(DEFAULT_PACK_IDS);
      setActiveSession(session);
    } catch { /* ignore */ }
  };

  // ── Persist questions/pins/citations to DB ─────────────────────────────────
  const persist = useCallback(async (updates: Partial<{
    research_questions: ResearchQuestion[];
    pinned_findings: PinnedFinding[];
    citations: Citation[];
    mode: string;
    expert_role: string;
    active_knowledge_packs: string[];
  }>) => {
    if (!activeSession) return;
    const body: Record<string, unknown> = {};
    if (updates.research_questions) body.research_questions = updates.research_questions;
    if (updates.pinned_findings) body.pinned_findings = updates.pinned_findings;
    if (updates.citations) body.citations = updates.citations;
    if (updates.mode) body.mode = updates.mode;
    if (updates.expert_role) body.expert_role = updates.expert_role;
    if (updates.active_knowledge_packs !== undefined) body.active_knowledge_packs = updates.active_knowledge_packs;
    try {
      await fetchWithAuth(`/api/legal-research/${activeSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* ignore */ }
  }, [activeSession]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!userInput.trim() || !activeSession || !activeTabId || isStreaming) return;
    const text = userInput.trim();
    setUserInput('');
    setIsStreaming(true);

    // Build message history for this question
    const qIdx = questions.findIndex(q => q.id === activeTabId);
    if (qIdx === -1) { setIsStreaming(false); return; }

    const updatedQuestion = { ...questions[qIdx] };
    if (updatedQuestion.messages.length === 0) {
      updatedQuestion.title = text.slice(0, 60) + (text.length > 60 ? '…' : '');
    }
    updatedQuestion.messages = [...updatedQuestion.messages, { role: 'user', content: text }];
    updatedQuestion.status = 'streaming';

    const newQs = [...questions];
    newQs[qIdx] = updatedQuestion;
    setQuestions(newQs);

    // SSE streaming
    try {
      const response = await fetchWithAuth(`/api/legal-research/${activeSession.id}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedQuestion.messages.map(m => ({ role: m.role, content: m.content })),
          webSearchEnabled,
          plainLanguageMode,
        }),
      });

      if (!response.ok || !response.body) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      // Add placeholder assistant message
      const withPlaceholder = [...newQs];
      withPlaceholder[qIdx] = {
        ...updatedQuestion,
        messages: [...updatedQuestion.messages, { role: 'assistant', content: '' }],
      };
      setQuestions(withPlaceholder);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              assistantContent += event.delta.text;
              setQuestions(prev => {
                const updated = [...prev];
                const idx = updated.findIndex(q => q.id === activeTabId);
                if (idx === -1) return prev;
                const msgs = [...updated[idx].messages];
                msgs[msgs.length - 1] = { role: 'assistant', content: assistantContent };
                updated[idx] = { ...updated[idx], messages: msgs };
                return updated;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }

      // Auto-capture citations
      const newCits = extractCitations(assistantContent);
      if (newCits.length > 0) {
        setCitations(prev => {
          const existing = new Set(prev.map(c => c.ref));
          const toAdd = newCits.filter(c => !existing.has(c.ref));
          const updated = [...prev, ...toAdd];
          persist({ citations: updated });
          return updated;
        });
      }

      // Finalise
      setQuestions(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(q => q.id === activeTabId);
        if (idx === -1) return prev;
        updated[idx] = { ...updated[idx], status: 'done' };
        persist({ research_questions: updated });
        return updated;
      });

    } catch (err) {
      console.error('[CounselsDesk] stream error:', err);
      setQuestions(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(q => q.id === activeTabId);
        if (idx === -1) return prev;
        const msgs = [...updated[idx].messages, { role: 'assistant' as const, content: `Error: ${String(err)}` }];
        updated[idx] = { ...updated[idx], messages: msgs, status: 'done' };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  // ── Pin selected text ──────────────────────────────────────────────────────
  const pinSelection = () => {
    const sel = window.getSelection()?.toString().trim();
    if (!sel || sel.length < 10) return;
    setSelectionText(sel);
    setShowPinPrompt(true);
  };

  const confirmPin = () => {
    const finding: PinnedFinding = {
      id: `pin-${Date.now()}`,
      text: selectionText,
      source: pinSource || 'Counsel\'s Desk',
      pinnedAt: new Date().toISOString(),
    };
    setPinnedFindings(prev => {
      const updated = [...prev, finding];
      persist({ pinned_findings: updated });
      return updated;
    });
    setShowPinPrompt(false);
    setPinSource('');
    setSelectionText('');
  };

  const removePin = (id: string) => {
    setPinnedFindings(prev => {
      const updated = prev.filter(p => p.id !== id);
      persist({ pinned_findings: updated });
      return updated;
    });
  };

  const removeCitation = (id: string) => {
    setCitations(prev => {
      const updated = prev.filter(c => c.id !== id);
      persist({ citations: updated });
      return updated;
    });
  };

  const togglePack = (packId: string) => {
    setActiveKnowledgePacks(prev => {
      const updated = prev.includes(packId) ? prev.filter(id => id !== packId) : [...prev, packId];
      persist({ active_knowledge_packs: updated });
      return updated;
    });
  };

  // ── Add new question tab ───────────────────────────────────────────────────
  const addTab = () => {
    const q = createNewQuestion();
    const updated = [...questions, q];
    setQuestions(updated);
    setActiveTabId(q.id);
    persist({ research_questions: updated });
  };

  const removeTab = (id: string) => {
    const updated = questions.filter(q => q.id !== id);
    if (updated.length === 0) {
      const q = createNewQuestion();
      setQuestions([q]);
      setActiveTabId(q.id);
      persist({ research_questions: [q] });
    } else {
      setQuestions(updated);
      if (activeTabId === id) setActiveTabId(updated[updated.length - 1].id);
      persist({ research_questions: updated });
    }
  };

  // ── Export bibliography ────────────────────────────────────────────────────
  const exportBibliography = () => {
    const text = citations.map((c, i) => `[${i + 1}] ${c.ref}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bibliography.txt';
    a.click();
  };

  const exportFindings = () => {
    const text = pinnedFindings.map(p => `• ${p.text}\n  Source: ${p.source}\n  Pinned: ${new Date(p.pinnedAt).toLocaleDateString()}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pinned-findings.txt';
    a.click();
  };

  const activeQuestion = questions.find(q => q.id === activeTabId);
  const activeMode = MODES.find(m => m.id === (activeSession?.mode || selectedMode));
  const ActiveModeIcon = activeMode ? MODE_ICON_MAP[activeMode.id] || Scale : Scale;
  const activeRole = EXPERT_ROLES.find(r => r.id === (activeSession?.expert_role || selectedRole));

  // ── Render ─────────────────────────────────────────────────────────────────

  // Session loading
  if (loadingSession) {
    return (
      <div className="flex h-full items-center justify-center bg-adv-dark">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-adv-teal" />
          <p className="text-sm text-adv-gray">Loading session…</p>
        </div>
      </div>
    );
  }

  // No session selected — show dashboard
  if (!activeSession) {
    return (
      <div className="flex flex-col h-full bg-adv-dark">
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal-dim">
                <Scale className="h-5 w-5 text-adv-teal" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-adv-off-white">Counsel's Desk</h1>
                <p className="text-xs text-adv-gray">Legal research workspace for FCP counsel</p>
              </div>
            </div>
            <button
              onClick={() => setShowNewSession(true)}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Research Session
            </button>
          </div>
        </div>

        {/* Mode selector for new session */}
        {showNewSession && (
          <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
            <h2 className="mb-1 text-sm font-semibold text-adv-off-white">New Research Session</h2>
            <p className="mb-4 text-xs text-adv-gray">Choose your mode and expert role, then enter a session title.</p>
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-adv-gray">Session title</label>
              <input
                className="w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                placeholder="e.g. AMLR Art.12 EDD Analysis — Nordea Q3 2027"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value.slice(0, 200))}
                maxLength={200}
                onKeyDown={e => e.key === 'Enter' && createSession()}
                autoFocus
              />
            </div>
            <div className="mb-4 grid grid-cols-4 gap-2">
              {MODES.map(m => (
                <ModeCard key={m.id} mode={m} selected={selectedMode === m.id} onClick={() => setSelectedMode(m.id)} />
              ))}
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-xs font-medium text-adv-gray">Expert role</label>
              <div className="flex flex-wrap gap-2">
                {EXPERT_ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRole(r.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${selectedRole === r.id ? 'border-adv-teal bg-adv-teal-dim text-adv-teal' : 'border-border bg-adv-card text-adv-gray hover:border-adv-teal/40'}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createSession} className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">Open Session</button>
              <button onClick={() => setShowNewSession(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {/* Session list */}
        <div className="flex-1 overflow-auto p-6">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Scale className="mb-4 h-12 w-12 text-adv-gray" />
              <h3 className="mb-2 text-base font-semibold text-adv-off-white">No research sessions yet</h3>
              <p className="mb-6 max-w-sm text-sm text-adv-gray">
                Open a new session to start structured legal research. Each session maintains a persistent thread,
                pinned findings, and auto-captured citations.
              </p>
              <button
                onClick={() => setShowNewSession(true)}
                className="flex items-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
              >
                <Plus className="h-4 w-4" /> New Research Session
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map(s => {
                const ModeIcon = MODE_ICON_MAP[s.mode] || Scale;
                const mode = MODES.find(m => m.id === s.mode);
                return (
                  <div key={s.id} className="relative group">
                    <button
                      onClick={() => loadSession(s.id)}
                      className="w-full text-left rounded-xl border border-border bg-adv-card p-4 hover:border-adv-teal/40 transition-all"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <ModeIcon className="h-4 w-4 text-adv-teal shrink-0" />
                        <span className="text-xs text-adv-teal font-medium">{mode?.label || s.mode}</span>
                      </div>
                      <h3 className="mb-1 text-sm font-semibold text-adv-off-white group-hover:text-adv-teal transition-colors line-clamp-2 pr-6">{s.title}</h3>
                      <p className="text-xs text-adv-gray">{EXPERT_ROLES.find(r => r.id === s.expert_role)?.label || s.expert_role}</p>
                      <p className="mt-2 text-[11px] text-adv-gray">{new Date(s.updated_at).toLocaleDateString()}</p>
                    </button>
                    {deletingSessionId === s.id ? (
                      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 rounded-b-xl bg-adv-dark-2/95 px-3 py-2 backdrop-blur-sm">
                        <span className="flex-1 text-[11px] text-red-400">Delete session?</span>
                        <button onClick={() => deleteSession(s.id)} className="rounded px-2 py-0.5 text-[11px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Yes</button>
                        <button onClick={() => setDeletingSessionId(null)} className="rounded px-2 py-0.5 text-[11px] text-adv-gray hover:text-adv-off-white transition-colors">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); setDeletingSessionId(s.id); }}
                        className="absolute right-2 top-2 hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-adv-gray hover:text-adv-red hover:bg-red-500/10 transition-colors"
                        title="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Active session view ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-adv-dark overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setActiveSession(null)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-adv-card text-adv-gray hover:text-adv-off-white transition-colors"
            title="Back to sessions"
          >
            <Scale className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-adv-off-white truncate">{activeSession.title}</h1>
          </div>

          {/* Mode selector */}
          <div className="relative" ref={modeSelectorRef}>
            <button
              onClick={() => setShowModeSelector(!showModeSelector)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal/40 transition-colors"
            >
              <ActiveModeIcon className="h-3.5 w-3.5 text-adv-teal" />
              {activeMode?.label || 'Mode'}
              <ChevronDown className="h-3 w-3 text-adv-gray" />
            </button>
            {showModeSelector && (
              <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-border bg-adv-dark-2 p-2 shadow-xl">
                {MODES.map(m => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={async () => {
                        setShowModeSelector(false);
                        setActiveSession(prev => prev ? { ...prev, mode: m.id } : prev);
                        await fetchWithAuth(`/api/legal-research/${activeSession.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ mode: m.id }),
                        });
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-left transition-colors ${activeSession.mode === m.id ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" /> {m.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expert role selector */}
          <div className="relative" ref={roleDropdownRef}>
            <button
              onClick={() => setShowRoleDropdown(!showRoleDropdown)}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-adv-card px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal/40 transition-colors"
            >
              {activeRole?.label || 'Role'}
              <ChevronDown className="h-3 w-3 text-adv-gray" />
            </button>
            {showRoleDropdown && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-border bg-adv-dark-2 p-2 shadow-xl">
                {EXPERT_ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={async () => {
                      setShowRoleDropdown(false);
                      setActiveSession(prev => prev ? { ...prev, expert_role: r.id } : prev);
                      await fetchWithAuth(`/api/legal-research/${activeSession.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ expert_role: r.id }),
                      });
                    }}
                    className={`block w-full text-left rounded-lg px-3 py-2 text-xs transition-colors ${activeSession.expert_role === r.id ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'}`}
                  >
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{r.focus}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: conversation area */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
          {/* Question tabs */}
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-adv-dark-2 px-3 py-2 overflow-x-auto">
            {questions.map((q, i) => (
              <div key={q.id} className="flex shrink-0 items-center">
                <button
                  onClick={() => setActiveTabId(q.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors max-w-[160px] ${activeTabId === q.id ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-gray hover:text-adv-off-white hover:bg-adv-card'}`}
                >
                  <span className="shrink-0 text-xs font-bold">Q{i + 1}</span>
                  <span className="truncate">{q.title.slice(0, 40)}</span>
                </button>
                {questions.length > 1 && (
                  <button onClick={() => removeTab(q.id)} className="ml-0.5 rounded p-0.5 text-adv-gray hover:text-adv-red transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addTab}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-adv-gray hover:border-adv-teal hover:text-adv-teal transition-colors"
              title="New question tab"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={outputRef} onMouseUp={pinSelection}>
            {activeQuestion?.messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ActiveModeIcon className="mb-3 h-10 w-10 text-adv-gray" />
                <h3 className="mb-1 text-sm font-semibold text-adv-off-white">{activeMode?.label}</h3>
                <p className="max-w-sm text-xs text-adv-gray">{activeMode?.description}</p>
                {activeMode?.id === 'deep-dive' && (
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {['Explain AMLR Art.12 EDD requirements', 'What is the PEP definition under AMLR Art.3?', 'DORA Art.19 incident reporting timelines'].map(s => (
                      <button key={s} onClick={() => setUserInput(s)} className="rounded-full border border-border bg-adv-card px-3 py-1 text-xs text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {activeQuestion?.messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-adv-teal">
                    <Scale className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-4 py-3 ${msg.role === 'user' ? 'bg-adv-teal text-adv-dark' : 'bg-adv-card border border-border'}`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none text-adv-off-white text-[13px] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || '▋'}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-card text-adv-gray text-xs font-bold">
                    U
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border bg-adv-dark-2 p-3">
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                placeholder={`Ask a ${activeMode?.label.toLowerCase() || 'legal'} question…`}
                value={userInput}
                onChange={e => setUserInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                disabled={isStreaming}
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={sendMessage}
                  disabled={isStreaming || !userInput.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-adv-teal text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
                  title="Send (Enter)"
                >
                  {isStreaming ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <button
                onClick={() => setWebSearchEnabled(!webSearchEnabled)}
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${webSearchEnabled ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}
              >
                <Search className="h-3 w-3" />
                Web search {webSearchEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setPlainLanguageMode(!plainLanguageMode)}
                title="Plain language mode: Claude will first give a plain-English summary for board members, then the full legal analysis"
                className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${plainLanguageMode ? 'bg-adv-blue/20 text-adv-blue' : 'text-adv-gray hover:text-adv-off-white'}`}
              >
                <Languages className="h-3 w-3" />
                Plain language {plainLanguageMode ? 'ON' : 'OFF'}
              </button>
              <span className="text-xs text-adv-gray">Select text → Pin finding</span>
            </div>
          </div>
        </div>

        {/* Right sidebar: pinned findings + citations */}
        <div className="flex w-72 shrink-0 flex-col overflow-hidden bg-adv-dark-2">
          {/* Pinned findings */}
          <div className="flex flex-1 flex-col overflow-hidden border-b border-border">
            <div className="flex shrink-0 items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Pin className="h-3.5 w-3.5 text-adv-gold" />
                <span className="text-xs font-semibold text-adv-off-white">Pinned Findings</span>
                <span className="rounded-full bg-adv-card px-1.5 py-0.5 text-xs text-adv-gray">{pinnedFindings.length}</span>
              </div>
              {pinnedFindings.length > 0 && (
                <button onClick={exportFindings} className="text-adv-gray hover:text-adv-teal transition-colors" title="Export findings">
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {pinnedFindings.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-adv-gray">Select text in the conversation and pin key findings here.</p>
              )}
              {pinnedFindings.map(p => (
                <div key={p.id} className="group rounded-lg border border-border bg-adv-card p-2.5">
                  <p className="text-xs text-adv-off-white leading-relaxed line-clamp-4">{p.text}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-xs text-adv-gray">{p.source}</span>
                    <button onClick={() => removePin(p.id)} className="hidden group-hover:block text-adv-gray hover:text-adv-red transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Citations */}
          <div className="flex flex-1 flex-col overflow-hidden border-b border-border">
            <div className="flex shrink-0 items-center justify-between px-3 py-2">
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-adv-blue" />
                <span className="text-xs font-semibold text-adv-off-white">Citations</span>
                <span className="rounded-full bg-adv-card px-1.5 py-0.5 text-xs text-adv-gray">{citations.length}</span>
              </div>
              {citations.length > 0 && (
                <button onClick={exportBibliography} className="text-adv-gray hover:text-adv-teal transition-colors" title="Export bibliography">
                  <Download className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {citations.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-adv-gray">Legal citations are auto-captured from Claude's responses.</p>
              )}
              {citations.map((c, i) => (
                <div key={c.id} className="group flex items-start gap-1.5">
                  <span className="mt-0.5 text-xs text-adv-gray font-mono w-5 shrink-0">[{i + 1}]</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-adv-off-white leading-snug break-words">{c.ref}</p>
                    <span className={`text-xs font-medium ${c.type === 'regulation' ? 'text-adv-teal' : c.type === 'case-law' ? 'text-adv-gold' : c.type === 'guideline' ? 'text-adv-blue' : 'text-adv-gray'}`}>
                      {c.type}
                    </span>
                  </div>
                  <button onClick={() => removeCitation(c.id)} className="hidden group-hover:block shrink-0 text-adv-gray hover:text-adv-red transition-colors mt-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Knowledge Packs */}
          <div className="shrink-0 border-border">
            <div className="flex items-center gap-1.5 px-3 py-2">
              <CheckSquare className="h-3.5 w-3.5 text-adv-teal" />
              <span className="text-xs font-semibold text-adv-off-white">Knowledge Packs</span>
              <span className="rounded-full bg-adv-card px-1.5 py-0.5 text-xs text-adv-gray">{activeKnowledgePacks.length}</span>
            </div>
            <div className="px-2 pb-2 space-y-1">
              {PRIORITY_PACKS.map(pack => {
                const isActive = activeKnowledgePacks.includes(pack.id);
                return (
                  <button
                    key={pack.id}
                    onClick={() => togglePack(pack.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors ${isActive ? 'bg-adv-teal-dim text-adv-teal' : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'}`}
                    title={isActive ? 'Click to deactivate' : 'Click to activate'}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isActive ? 'bg-adv-teal' : 'bg-adv-gray-med'}`} />
                    {pack.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Pin prompt modal */}
      {showPinPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onKeyDown={e => { if (e.key === 'Escape') { setShowPinPrompt(false); setPinSource(''); } }}
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-adv-dark-2 p-5 shadow-2xl">
            <h3 className="mb-1 text-sm font-semibold text-adv-off-white">Pin Finding</h3>
            <p className="mb-3 text-xs text-adv-gray line-clamp-3">"{selectionText}"</p>
            <input
              className="mb-3 w-full rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              placeholder="Source (e.g. AMLR Art.12, EBA Guidelines)"
              value={pinSource}
              onChange={e => setPinSource(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmPin(); if (e.key === 'Escape') { setShowPinPrompt(false); setPinSource(''); } }}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={confirmPin} className="flex-1 rounded-lg bg-adv-teal py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors">
                <Pin className="inline h-3.5 w-3.5 mr-1" /> Pin
              </button>
              <button onClick={() => { setShowPinPrompt(false); setPinSource(''); }} className="flex-1 rounded-lg border border-border py-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
