import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Search, Clock, ArrowRight, Trash2, Pencil, Check, X,
  SearchCheck, FileText, Shield, Radar, GraduationCap, Database, BarChart3,
  Handshake, Rocket, Presentation, FlaskConical,
  FileSearch, FileCheck, GitCompare, Lock, ScrollText,
  ClipboardList, TestTube, FileWarning, ClipboardCheck,
  Send, Network, RefreshCw, Briefcase,
  TrendingDown, CreditCard, BarChart2, Building, PackageCheck, Building2,
  AlertTriangle, Gauge, Settings, GitBranch, Share2, Scale,
  ShieldCheck, ScanSearch, Siren, DatabaseZap, Layers, AlertCircle, FileBarChart,
  CircleDot, Thermometer, Leaf, TrendingUp, Compass, MapPin, Crosshair,
  LineChart, PieChart, FolderKanban, Users,
  ChevronDown, StickyNote, MessageSquare,
} from 'lucide-react';
import { MODULES, MODELS } from '@/lib/constants';
import { fetchSessions, deleteSession, updateSessionTitle, updateSessionNote, fetchProjects, assignSessionToProject, fetchWithAuth } from '@/lib/api';
import type { Session } from '@/lib/types';

// Wave 4.3 — one row of the unified work timeline (GET /api/work-timeline)
interface TimelineItem {
  type: 'session' | 'engagement' | 'workflow_run' | 'workflow_execution' | 'discovery';
  id: string;
  title: string | null;
  subtitle: string | null;
  status: string | null;
  cost: number | null;
  updated_at: string;
  resumeUrl: string;
}

type TimelineChip = 'all' | 'session' | 'engagement' | 'workflow' | 'discovery';

const TIMELINE_CHIP_TYPES: Record<Exclude<TimelineChip, 'all'>, string> = {
  session: 'session',
  engagement: 'engagement',
  workflow: 'workflow_run,workflow_execution',
  discovery: 'discovery',
};

// Wave 3.2 "Search past work" — a hybrid-search hit inside a past output
interface PastWorkHit {
  content_id: string;
  snippet: string;
  source: 'bm25' | 'vector' | 'both';
  metadata: {
    session_id?: string | null;
    title?: string | null;
    module_id?: string | null;
    created_at?: string | null;
  };
}

function sessionLink(moduleId: string | null | undefined, sessionId: string, messageId?: string): string {
  const base =
    // 'engagement' = 4.4 bridged sessions — no module page exists for them;
    // the generic session surface (PromptPage restores any session id) is the
    // right viewer.
    moduleId === 'open-chat' || moduleId === 'engagement' || !moduleId
      ? `/prompt?session=${sessionId}`
      : moduleId === 'ai-council'
      ? `/council?session=${sessionId}`
      : `/module/${moduleId}?session=${sessionId}`;
  return messageId ? `${base}#msg-${messageId}` : base;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  SearchCheck, FileText, Shield, Radar, GraduationCap, Database, BarChart3,
  Search, Handshake, Rocket, Presentation, FlaskConical,
  FileSearch, FileCheck, GitCompare, Lock, ScrollText, Scale,
  ClipboardList, TestTube, FileWarning, ClipboardCheck,
  Send, Network, RefreshCw, Briefcase,
  TrendingDown, CreditCard, BarChart2, Building, PackageCheck, Building2,
  AlertTriangle, Gauge, Settings, GitBranch, Share2,
  ShieldCheck, ScanSearch, Siren, DatabaseZap, Layers, AlertCircle, FileBarChart,
  CircleDot, Thermometer, Leaf, TrendingUp, Compass, MapPin, Crosshair,
  LineChart, PieChart, FolderKanban, Users,
};

const colorAccentMap: Record<string, string> = {
  'adv-teal':  'border-l-adv-teal',
  'adv-blue':  'border-l-adv-blue',
  'adv-gold':  'border-l-adv-gold',
  'adv-green': 'border-l-adv-green',
  'adv-red':   'border-l-adv-red',
};

const iconBgMap: Record<string, string> = {
  'adv-teal':  'bg-adv-teal/10 text-adv-teal',
  'adv-blue':  'bg-adv-blue/10 text-adv-blue',
  'adv-gold':  'bg-adv-gold/10 text-adv-gold',
  'adv-green': 'bg-adv-green/10 text-adv-green',
  'adv-red':   'bg-adv-red/10 text-adv-red',
};

function useFormatRelativeTime() {
  const { t } = useTranslation();
  return function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays });
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };
}

function formatSessionCost(session: Session): string | null {
  const tokens = session.total_tokens;
  if (!tokens || tokens === 0) return null;
  let modelId: string | undefined;
  try {
    const cfg = typeof session.config === 'string' ? JSON.parse(session.config) : session.config;
    modelId = cfg?.model;
  } catch { /* ignore */ }
  const modelInfo = MODELS.find((m) => m.id === modelId);
  const costPer1M = modelInfo ? modelInfo.outputCostPer1M : 75;
  const cost = (tokens / 1_000_000) * costPer1M;
  const tokenStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : `${tokens}`;
  const costStr = cost < 0.01 ? '<$0.01' : `~$${cost.toFixed(2)}`;
  return `${tokenStr} tok · ${costStr}`;
}

type TimeFilter = 'all' | 'today' | 'week' | 'month';
type SortMode = 'recent' | 'most-used';

export default function MyWorkPage() {
  const { t } = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
  // Wave 4.3: Timeline (all work types, one feed) is the default view;
  // the original session list stays available under "Sessions".
  const [view, setView] = useState<'timeline' | 'sessions'>('timeline');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const PAGE_SIZE = 20;

  // Inline editing
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const noteInputRef = useRef<HTMLInputElement>(null);

  // Project assignment
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(() => {});
  }, []);

  // Close project dropdown when clicking outside
  useEffect(() => {
    if (!assigningProjectId) return;
    const handleClick = () => setAssigningProjectId(null);
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
  }, [assigningProjectId]);

  async function handleAssignProject(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    e.stopPropagation();
    setAssigningProjectId(assigningProjectId === sessionId ? null : sessionId);
  }

  async function doAssign(e: React.MouseEvent, sessionId: string, projectId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    await assignSessionToProject(sessionId, projectId);
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, project_id: projectId } : s));
    setAssigningProjectId(null);
  }

  // Debounced search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [search]);

  // Wave 3.2 "Search past work" — hybrid search (vector + keyword fallback)
  // INSIDE past outputs, not just titles/notes. Results link into the session.
  const [pastWorkHits, setPastWorkHits] = useState<PastWorkHit[]>([]);
  const [pastWorkLoading, setPastWorkLoading] = useState(false);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q.length < 3) { setPastWorkHits([]); return; }
    let cancelled = false;
    setPastWorkLoading(true);
    fetchWithAuth('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, contentTypes: ['session_output'], topK: 8 }),
    })
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: { results?: PastWorkHit[] }) => {
        if (!cancelled) setPastWorkHits(Array.isArray(data.results) ? data.results : []);
      })
      .catch(() => { if (!cancelled) setPastWorkHits([]); })
      .finally(() => { if (!cancelled) setPastWorkLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  const loadSessions = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const results: Session[] = await fetchSessions(moduleFilter || undefined, {
        search: debouncedSearch || undefined,
        hasOutput: true,
        limit: PAGE_SIZE,
        offset: currentOffset,
      });
      if (reset) {
        setSessions(results);
        setOffset(PAGE_SIZE);
      } else {
        setSessions((prev) => [...prev, ...results]);
        setOffset(currentOffset + PAGE_SIZE);
      }
      setHasMore(results.length === PAGE_SIZE);
    } catch {
      if (reset) setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, moduleFilter, offset]);

  // Reload when filters change
  useEffect(() => {
    setOffset(0);
    loadSessions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, moduleFilter]);

  // Filter and sort locally for time and sort mode
  const filtered = sessions.filter((s) => {
    if (timeFilter === 'all') return true;
    const d = new Date(s.updated_at || s.created_at);
    const now = Date.now();
    if (timeFilter === 'today') return now - d.getTime() < 86400000;
    if (timeFilter === 'week') return now - d.getTime() < 7 * 86400000;
    if (timeFilter === 'month') return now - d.getTime() < 30 * 86400000;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortMode === 'most-used') return (b.message_count ?? 0) - (a.message_count ?? 0);
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });

  // Collect unique module IDs from loaded sessions for the filter dropdown
  const usedModuleIds = [...new Set(sessions.map((s) => s.module_id))];

  // Delete
  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  // Rename
  function startRename(e: React.MouseEvent, session: Session) {
    e.preventDefault();
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameValue(session.title);
  }

  async function commitRename(sessionId: string) {
    const title = renameValue.trim();
    if (title) {
      await updateSessionTitle(sessionId, title);
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, title } : s));
    }
    setRenamingId(null);
  }

  function handleRenameKey(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(sessionId); }
    if (e.key === 'Escape') setRenamingId(null);
  }

  // Note editing
  function startNoteEdit(e: React.MouseEvent, session: Session) {
    e.preventDefault();
    e.stopPropagation();
    setEditingNoteId(session.id);
    setNoteValue(session.note || '');
    setTimeout(() => noteInputRef.current?.focus(), 50);
  }

  async function commitNote(sessionId: string) {
    await updateSessionNote(sessionId, noteValue);
    setSessions((prev) =>
      prev.map((s) => s.id === sessionId ? { ...s, note: noteValue.trim() || undefined } : s)
    );
    setEditingNoteId(null);
  }

  function handleNoteKey(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter') { e.preventDefault(); commitNote(sessionId); }
    if (e.key === 'Escape') setEditingNoteId(null);
  }

  const timeButtons: { value: TimeFilter; label: string }[] = [
    { value: 'all', label: t('myWork.filterAll') },
    { value: 'today', label: t('myWork.filterToday') },
    { value: 'week', label: t('myWork.filterThisWeek') },
    { value: 'month', label: t('myWork.filterThisMonth') },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-adv-white">{t('myWork.title')}</h1>
        <p className="mt-1 text-sm text-adv-gray">{t('myWork.subtitle')}</p>
      </div>

      {/* View toggle: Timeline (4.3 unified feed) ⇄ Sessions (original list) */}
      <div className="mb-5 inline-flex rounded-lg border border-border bg-adv-card overflow-hidden">
        {([['timeline', 'Timeline'], ['sessions', 'Sessions']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-1.5 text-xs transition-colors ${
              view === v
                ? 'bg-adv-teal-dim text-adv-teal font-medium'
                : 'text-adv-gray hover:text-adv-off-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'timeline' && <TimelineFeed formatRelativeTime={formatRelativeTime} />}

      {view === 'sessions' && (<>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('myWork.searchPlaceholder')}
          className="w-full rounded-xl border border-border bg-adv-card py-2.5 pl-9 pr-9 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters row */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Module filter */}
        <div className="relative">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="appearance-none rounded-lg border border-border bg-adv-card py-1.5 pl-3 pr-8 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="">{t('myWork.allModules')}</option>
            {usedModuleIds.map((mid) => {
              const mod = MODULES.find((m) => m.id === mid);
              return (
                <option key={mid} value={mid}>
                  {mod?.shortLabel || mid}
                </option>
              );
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-adv-gray" />
        </div>

        {/* Time filter */}
        <div className="flex rounded-lg border border-border bg-adv-card overflow-hidden">
          {timeButtons.map((tb) => (
            <button
              key={tb.value}
              onClick={() => setTimeFilter(tb.value)}
              className={`px-3 py-1.5 text-xs transition-colors ${
                timeFilter === tb.value
                  ? 'bg-adv-teal-dim text-adv-teal font-medium'
                  : 'text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="ml-auto relative">
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="appearance-none rounded-lg border border-border bg-adv-card py-1.5 pl-3 pr-8 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            <option value="recent">{t('myWork.sortMostRecent')}</option>
            <option value="most-used">{t('myWork.sortMostUsed')}</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-adv-gray" />
        </div>
      </div>

      {/* Matches inside past outputs (Wave 3.2 — "what did we conclude about X in March?") */}
      {debouncedSearch.trim().length >= 3 && (pastWorkLoading || pastWorkHits.length > 0) && (
        <div className="mb-6 rounded-xl border border-adv-teal/20 bg-adv-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-adv-teal" />
            <span className="text-xs font-semibold text-adv-off-white">Matches inside past outputs</span>
            {pastWorkLoading ? (
              <span className="text-[11px] text-adv-gray">searching…</span>
            ) : (
              <span className="rounded-full bg-adv-teal/15 px-2 py-0.5 text-[10px] font-medium text-adv-teal">
                {pastWorkHits.length}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {pastWorkHits.map((hit) => {
              const sid = hit.metadata.session_id;
              if (!sid) return null;
              const mod = MODULES.find((m) => m.id === hit.metadata.module_id);
              return (
                <Link
                  key={hit.content_id}
                  to={sessionLink(hit.metadata.module_id, sid, hit.content_id)}
                  className="block rounded-lg border border-border bg-adv-dark px-3 py-2 transition-colors hover:border-adv-teal/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-adv-off-white">
                      {hit.metadata.title || mod?.shortLabel || hit.metadata.module_id || 'Untitled session'}
                    </span>
                    <span className="shrink-0 text-[10px] text-adv-gray">
                      {mod?.shortLabel || hit.metadata.module_id || ''}
                      {hit.metadata.created_at
                        ? ` · ${formatRelativeTime(hit.metadata.created_at)}`
                        : ''}
                    </span>
                  </div>
                  {hit.snippet && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-adv-gray">{hit.snippet}</p>
                  )}
                </Link>
              );
            })}
            {!pastWorkLoading && pastWorkHits.length === 0 && (
              <p className="text-[11px] text-adv-gray">No matches inside past outputs.</p>
            )}
          </div>
        </div>
      )}

      {/* Session list */}
      {sorted.length === 0 && !loading ? (
        <div className="rounded-xl border border-border bg-adv-card p-12 text-center">
          <MessageSquare className="mx-auto mb-3 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">
            {debouncedSearch || moduleFilter || timeFilter !== 'all'
              ? t('myWork.noSessionsMatch')
              : t('myWork.noSessionsYet')}
          </p>
          {(debouncedSearch || moduleFilter || timeFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setModuleFilter(''); setTimeFilter('all'); }}
              className="mt-2 text-xs text-adv-teal hover:underline"
            >
              {t('myWork.clearAllFilters')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((session) => {
            const mod = MODULES.find((m) => m.id === session.module_id);
            const Icon = mod ? (iconMap[mod.icon] || Clock) : Clock;
            const accentClass = mod ? (colorAccentMap[mod.color] || 'border-l-adv-teal') : 'border-l-adv-teal';
            const iconBgClass = mod ? (iconBgMap[mod.color] || 'bg-adv-teal/10 text-adv-teal') : 'bg-adv-teal/10 text-adv-teal';
            const costStr = formatSessionCost(session);

            return (
              <Link
                key={session.id}
                to={sessionLink(session.module_id, session.id)}
                className={`group relative flex items-start gap-4 rounded-xl border border-border border-l-2 ${accentClass} bg-adv-card p-4 transition-all hover:border-adv-teal/30 hover:shadow-lg`}
              >
                {/* Icon */}
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}>
                  <Icon className="h-4 w-4" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  {/* Title row */}
                  <div className="flex items-start justify-between gap-2">
                    {renamingId === session.id ? (
                      <div className="flex items-center gap-1 flex-1" onClick={(e) => e.preventDefault()}>
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => handleRenameKey(e, session.id)}
                          onBlur={() => commitRename(session.id)}
                          className="min-w-0 flex-1 rounded border border-adv-teal bg-adv-dark px-1.5 py-0.5 text-sm text-adv-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                        />
                        <button onClick={(e) => { e.preventDefault(); commitRename(session.id); }} className="text-adv-teal hover:text-adv-teal-dark">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.preventDefault(); setRenamingId(null); }} className="text-adv-gray hover:text-adv-red">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="truncate text-sm font-semibold text-adv-off-white group-hover:text-adv-teal transition-colors">
                        {session.title}
                      </h3>
                    )}
                    <span className="shrink-0 text-xs text-adv-gray">
                      {formatRelativeTime(session.updated_at || session.created_at)}
                    </span>
                  </div>

                  {/* Meta row */}
                  <p className="mt-0.5 text-xs text-adv-gray">
                    {mod?.shortLabel || session.module_id}
                    {costStr && <> · {costStr}</>}
                    {session.message_count ? <> · {session.message_count} {t('myWork.messages')}</> : null}
                  </p>

                  {/* Note */}
                  <div className="mt-1.5">
                    {editingNoteId === session.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                        <StickyNote className="h-3 w-3 shrink-0 text-adv-gold" />
                        <input
                          ref={noteInputRef}
                          value={noteValue}
                          onChange={(e) => setNoteValue(e.target.value)}
                          onKeyDown={(e) => handleNoteKey(e, session.id)}
                          onBlur={() => commitNote(session.id)}
                          placeholder={t('myWork.addNote')}
                          className="min-w-0 flex-1 rounded border border-adv-gold/50 bg-adv-dark px-1.5 py-0.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                        />
                        <button onClick={(e) => { e.preventDefault(); commitNote(session.id); }} className="text-adv-gold hover:text-adv-gold/80">
                          <Check className="h-3 w-3" />
                        </button>
                        <button onClick={(e) => { e.preventDefault(); setEditingNoteId(null); }} className="text-adv-gray hover:text-adv-red">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : session.note ? (
                      <button
                        onClick={(e) => startNoteEdit(e, session)}
                        className="flex items-center gap-1 text-xs text-adv-gold/70 hover:text-adv-gold transition-colors"
                      >
                        <StickyNote className="h-3 w-3 shrink-0" />
                        <span className="truncate">{session.note}</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => startNoteEdit(e, session)}
                        className="flex items-center gap-1 text-xs text-adv-gray/50 opacity-0 group-hover:opacity-100 hover:text-adv-gold transition-all"
                      >
                        <StickyNote className="h-3 w-3 shrink-0" />
                        {t('myWork.addNote')}
                      </button>
                    )}
                  </div>

                  {/* Project badge */}
                  {(() => {
                    const proj = session.project_id ? projects.find((p) => p.id === session.project_id) : null;
                    return (
                      <div className="mt-1.5 relative">
                        {proj ? (
                          <button
                            onClick={(e) => handleAssignProject(e, session.id)}
                            className="flex items-center gap-1 rounded-full bg-adv-teal-dim px-2 py-0.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
                          >
                            <FolderKanban className="h-3 w-3" />
                            {proj.name}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => handleAssignProject(e, session.id)}
                            className="flex items-center gap-1 text-xs text-adv-gray/50 opacity-0 group-hover:opacity-100 hover:text-adv-teal transition-all"
                          >
                            <FolderKanban className="h-3 w-3" />
                            {t('myWork.addToProject')}
                          </button>
                        )}
                        {assigningProjectId === session.id && (
                          <div
                            className="absolute left-0 top-full z-10 mt-1 w-48 rounded-lg border border-border bg-adv-card py-1 shadow-xl"
                            onClick={(e) => e.preventDefault()}
                          >
                            {session.project_id && (
                              <button
                                onClick={(e) => doAssign(e, session.id, null)}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-adv-red hover:bg-adv-red/10 transition-colors"
                              >
                                {t('myWork.removeFromProject')}
                              </button>
                            )}
                            {projects.map((p) => (
                              <button
                                key={p.id}
                                onClick={(e) => doAssign(e, session.id, p.id)}
                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                                  session.project_id === p.id
                                    ? 'text-adv-teal bg-adv-teal-dim'
                                    : 'text-adv-off-white hover:bg-adv-dark'
                                }`}
                              >
                                <FolderKanban className="h-3 w-3 shrink-0" />
                                {p.name}
                              </button>
                            ))}
                            {projects.length === 0 && (
                              <p className="px-3 py-2 text-xs text-adv-gray">{t('myWork.noProjects')}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Preview */}
                  {session.last_message_preview && (
                    <p className="mt-1 truncate text-xs text-adv-gray/60 italic">
                      {session.last_message_preview}
                    </p>
                  )}
                </div>

                {/* Hover actions */}
                {renamingId !== session.id && editingNoteId !== session.id && (
                  <div className="absolute right-3 top-9 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => startRename(e, session)}
                      className="rounded p-1 text-adv-gray hover:text-adv-teal transition-colors"
                      title={t('myWork.actionRename')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors"
                      title={t('myWork.actionDelete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && sorted.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => loadSessions(false)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm text-adv-gray hover:text-adv-teal hover:border-adv-teal/30 transition-colors disabled:opacity-50"
          >
            {loading ? t('common.loading') : t('myWork.loadMore')}
            {!loading && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {loading && sessions.length === 0 && (
        <div className="mt-8 text-center text-sm text-adv-gray">{t('myWork.loadingSessions')}</div>
      )}
      </>)}
    </div>
  );
}

// ── Wave 4.3: unified work timeline ──────────────────────────────────────────

const TIMELINE_TYPE_META: Record<TimelineItem['type'], { label: string; icon: React.ComponentType<{ className?: string }>; chipClass: string }> = {
  session:            { label: 'Session',    icon: MessageSquare, chipClass: 'bg-adv-teal/10 text-adv-teal' },
  engagement:         { label: 'Engagement', icon: Briefcase,     chipClass: 'bg-adv-blue/10 text-adv-blue' },
  workflow_run:       { label: 'Workflow',   icon: GitBranch,     chipClass: 'bg-adv-gold/10 text-adv-gold' },
  workflow_execution: { label: 'Workflow',   icon: GitBranch,     chipClass: 'bg-adv-gold/10 text-adv-gold' },
  discovery:          { label: 'Discovery',  icon: Compass,       chipClass: 'bg-adv-green/10 text-adv-green' },
};

function timelineStatusClass(status: string): string {
  if (status === 'awaiting_approval') return 'bg-adv-gold/15 text-adv-gold border border-adv-gold/40 font-semibold';
  if (['running', 'executing', 'pending', 'active'].includes(status)) return 'bg-adv-blue/10 text-adv-blue border border-adv-blue/20';
  if (status === 'paused') return 'bg-adv-gold/10 text-adv-gold border border-adv-gold/20';
  if (['failed', 'aborted', 'cancelled', 'abandoned'].includes(status)) return 'bg-adv-red/10 text-adv-red border border-adv-red/20';
  if (['completed', 'approved', 'reviewed'].includes(status)) return 'bg-adv-green/10 text-adv-green border border-adv-green/20';
  return 'bg-adv-dark text-adv-gray border border-border';
}

function TimelineFeed({ formatRelativeTime }: { formatRelativeTime: (d: string) => string }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [chip, setChip] = useState<TimelineChip>('all');

  const load = useCallback(async (before: string | null, replace: boolean) => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (before) params.set('before', before);
      if (chip !== 'all') params.set('types', TIMELINE_CHIP_TYPES[chip]);
      const r = await fetchWithAuth(`/api/work-timeline?${params.toString()}`);
      if (!r.ok) throw new Error('timeline fetch failed');
      const data: { items: TimelineItem[]; nextBefore: string | null } = await r.json();
      setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
      setNextBefore(data.nextBefore);
    } catch {
      setError(true);
      if (replace) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [chip]);

  useEffect(() => {
    load(null, true);
  }, [load]);

  const chips: { value: TimelineChip; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'session', label: 'Sessions' },
    { value: 'engagement', label: 'Engagements' },
    { value: 'workflow', label: 'Workflows' },
    { value: 'discovery', label: 'Discovery' },
  ];

  return (
    <div>
      {/* Type chips */}
      <div className="mb-5 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.value}
            onClick={() => setChip(c.value)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              chip === c.value
                ? 'border-adv-teal bg-adv-teal-dim text-adv-teal font-medium'
                : 'border-border text-adv-gray hover:text-adv-off-white hover:border-adv-teal/30'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {items.length === 0 && !loading ? (
        <div className="rounded-xl border border-border bg-adv-card p-12 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">
            {error
              ? 'Could not load the timeline. Try again later.'
              : chip === 'all'
              ? 'No work yet. Module runs, engagements, workflows and discovery sessions will appear here as you work.'
              : 'Nothing of this type yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const meta = TIMELINE_TYPE_META[item.type];
            const Icon = meta.icon;
            // Sessions carry the module id as subtitle — show its short label.
            const subtitle =
              item.type === 'session' && item.subtitle
                ? MODULES.find((m) => m.id === item.subtitle)?.shortLabel || item.subtitle
                : item.subtitle;
            const costStr =
              item.cost && item.cost > 0
                ? item.cost < 0.01 ? '<$0.01' : `~$${item.cost.toFixed(2)}`
                : null;
            return (
              <Link
                key={`${item.type}-${item.id}`}
                to={item.resumeUrl}
                className="group flex items-start gap-4 rounded-xl border border-border bg-adv-card p-4 transition-all hover:border-adv-teal/30 hover:shadow-lg"
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.chipClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold text-adv-off-white group-hover:text-adv-teal transition-colors">
                      {item.title || 'Untitled'}
                    </h3>
                    <span className="shrink-0 text-xs text-adv-gray">{formatRelativeTime(item.updated_at)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.chipClass}`}>{meta.label}</span>
                    {item.status && (
                      <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${timelineStatusClass(item.status)}`}>
                        {item.status === 'awaiting_approval' && <AlertTriangle className="h-3 w-3" />}
                        {item.status === 'awaiting_approval' ? 'Awaiting approval' : item.status.replace(/_/g, ' ')}
                      </span>
                    )}
                    {subtitle && <span className="truncate text-xs text-adv-gray">{subtitle}</span>}
                    {costStr && <span className="text-xs text-adv-gray">· {costStr}</span>}
                  </div>
                </div>
                <ArrowRight className="mt-2 h-3.5 w-3.5 shrink-0 text-adv-gray opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {nextBefore && items.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => load(nextBefore, false)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-adv-card px-4 py-2 text-sm text-adv-gray hover:text-adv-teal hover:border-adv-teal/30 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
            {!loading && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="mt-8 text-center text-sm text-adv-gray">Loading…</div>
      )}
    </div>
  );
}
