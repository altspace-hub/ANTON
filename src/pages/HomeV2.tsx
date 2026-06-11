/**
 * HomeV2 — Web UX v2 home, port of Dashboard's content with new design.
 *
 * Routes at /home-v2 alongside the existing Dashboard at /. After the
 * v1/v2 review (April 2026, Daniel) the layout was extended to include
 * everything the current Dashboard surfaces:
 *
 *   • Anton title + APCI tagline + 5-Minute Brief CTA
 *   • Regulatory deadlines pill strip
 *   • 5 KPI stat cards
 *   • Editorial brief
 *   • Continue Your Work (recent sessions)
 *   • Pathfinder quick search
 *   • My Custom Modules
 *   • FIND THE RIGHT MODULE (SmartModuleSearch — server-side AI ranking)
 *   • Modules grouped by area (tonal icon tiles)
 *   • Right rail toggles Activity ↔ Agent — collapse button at the
 *     BOTTOM (matches the left-nav convention)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Inbox, Sparkles, Shield, Compass, Users, Radar as RadarIcon,
  CheckSquare, BookOpen, Search, Star, ChevronLeft, ChevronRight,
  Briefcase, Zap, Clock, TrendingUp, MessageSquare,
  LayoutGrid, Plus, Sparkle,
  // Module icons (subset — fallback to Briefcase otherwise)
  SearchCheck, FileText, GraduationCap, Database, BarChart3,
  Handshake, Rocket, Presentation, FlaskConical, Scale,
  ShieldCheck, AlertTriangle, Settings as SettingsIcon, Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MODULES, AREAS } from '@/lib/constants';
import {
  fetchSessions, fetchSessionStats, fetchCustomModules,
  type CustomModuleData,
} from '@/lib/api';
import { fetchSearchHistory } from '@/lib/pathfinder-api';
import type { Session } from '@/lib/types';
import { Section, Btn } from '@/components/web-ui';
import SmartModuleSearch from '@/components/shared/SmartModuleSearch';

type RightMode = 'digest' | 'agent';
type FeedTone = 'accent' | 'gold' | 'red' | 'green' | 'blue';

const RAIL_COLLAPSED_KEY = 'anton-home-v2-rail-collapsed';
const DEADLINES_KEY = 'anton-deadlines';
const FAVORITES_KEY = 'anton-favorites';

// ── Module icon resolver — small subset, fallback to Briefcase ──────────
const ICON_MAP: Record<string, LucideIcon> = {
  SearchCheck, FileText, Shield, ShieldCheck, RadarIcon, GraduationCap,
  Database, BarChart3, Search, Handshake, Rocket, Presentation, FlaskConical,
  Scale, AlertTriangle, Layers, Briefcase, Compass, BookOpen, Users,
  Settings: SettingsIcon, Zap, Sparkles, Sparkle, Inbox, MessageSquare,
  LayoutGrid, Star, Radar: RadarIcon, CheckSquare,
};
function moduleIcon(name: string | undefined): LucideIcon {
  if (!name) return Briefcase;
  return ICON_MAP[name] ?? Briefcase;
}

// Area → tonal palette key
type AreaTone = 'accent' | 'gold' | 'red' | 'green' | 'blue' | 'plum';
const AREA_TONE: Record<string, AreaTone> = {
  fcp: 'accent', legal: 'blue', audit: 'gold', consulting: 'green',
  banking: 'blue', risk: 'red', healthcare: 'green', insurance: 'blue',
  pe: 'plum', ngo: 'green', creative: 'plum', education: 'gold',
  ops: 'accent', tech: 'blue',
};
const TONE_BG: Record<AreaTone, string> = {
  accent: 'var(--color-accent-soft)',
  gold:   'var(--color-gold-soft)',
  red:    'var(--color-red-soft)',
  green:  'var(--color-green-soft)',
  blue:   'var(--color-blue-soft)',
  plum:   '#EEE3F5',
};
const TONE_FG: Record<AreaTone, string> = {
  accent: 'var(--color-adv-teal)',
  gold:   'var(--color-gold)',
  red:    'var(--color-red)',
  green:  'var(--color-green)',
  blue:   'var(--color-blue)',
  plum:   '#6A3E8F',
};
const TONE_BORDER: Record<AreaTone, string> = {
  accent: 'var(--color-accent-dim)',
  gold:   'var(--color-gold-dim)',
  red:    'var(--color-red-dim)',
  green:  'var(--color-green-dim)',
  blue:   'var(--color-blue-dim)',
  plum:   '#E0D0ED',
};

interface RegulatoryDeadline {
  id: string;
  label: string;
  date: string;
}
const DEFAULT_DEADLINES: RegulatoryDeadline[] = [
  { id: 'amld6-2026', label: 'AMLD6 transposition', date: '2026-07-10' },
  { id: 'amlr-2027',  label: 'AMLR applies',        date: '2027-07-10' },
  { id: 'dora-2025',  label: 'DORA applies',        date: '2025-01-17' },
];
function loadDeadlines(): RegulatoryDeadline[] {
  try {
    const stored = localStorage.getItem(DEADLINES_KEY);
    if (stored) return JSON.parse(stored) as RegulatoryDeadline[];
  } catch { /* ignore */ }
  return DEFAULT_DEADLINES;
}
function daysUntil(iso: string): number {
  const d = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((d - now) / 86400000));
}

// ── Activity feed — real data: recent sessions + Pathfinder searches ─────
interface FeedItem {
  key: string;
  when: string; // ISO timestamp
  icon: LucideIcon;
  tone: FeedTone;
  title: string;
  sub: string;
  route: string;
}
interface RecentSearchRecord {
  id: string;
  query: string;
  depth: string;
  created_at: string;
}
function formatFeedTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yst';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const FEED_BG: Record<FeedTone, string> = {
  accent: 'var(--color-accent-soft)',
  gold:   'var(--color-gold-soft)',
  red:    'var(--color-red-soft)',
  green:  'var(--color-green-soft)',
  blue:   'var(--color-blue-soft)',
};
const FEED_FG: Record<FeedTone, string> = {
  accent: 'var(--color-adv-teal)',
  gold:   'var(--color-gold)',
  red:    'var(--color-red)',
  green:  'var(--color-green)',
  blue:   'var(--color-blue)',
};
const FEED_BORDER: Record<FeedTone, string> = {
  accent: 'var(--color-accent-dim)',
  gold:   'var(--color-gold-dim)',
  red:    'var(--color-red-dim)',
  green:  'var(--color-green-dim)',
  blue:   'var(--color-blue-dim)',
};

export default function HomeV2(): JSX.Element {
  const navigate = useNavigate();

  // ── Data ────────────────────────────────────────────────────
  const [stats, setStats] = useState<{
    totalSessions: number; totalMessages: number; totalOutputTokens: number;
    thisWeekSessions: number; thisMonthSessions: number;
  } | null>(null);
  const [continueWork, setContinueWork] = useState<Session[]>([]);
  const [customModules, setCustomModules] = useState<CustomModuleData[]>([]);
  const [feedSessions, setFeedSessions] = useState<Array<{ id: string; title: string; module_id: string; created_at: string }>>([]);
  const [recentSearches, setRecentSearches] = useState<RecentSearchRecord[]>([]);
  const deadlines = useMemo(() => loadDeadlines(), []);

  useEffect(() => {
    fetchSessionStats().then((s) => {
      setStats({
        totalSessions: s.totalSessions, totalMessages: s.totalMessages,
        totalOutputTokens: s.totalOutputTokens,
        thisWeekSessions: s.thisWeekSessions, thisMonthSessions: s.thisMonthSessions,
      });
      setFeedSessions(Array.isArray(s.recentSessions) ? s.recentSessions : []);
    }).catch(() => { /* silent */ });
    fetchSessions(undefined, { hasOutput: true, limit: 4 })
      .then(setContinueWork).catch(() => { /* silent */ });
    fetchCustomModules().then(setCustomModules).catch(() => { /* silent */ });
    fetchSearchHistory(8)
      .then((r) => setRecentSearches(
        (Array.isArray(r.searches) ? r.searches : [])
          .filter((s): s is RecentSearchRecord & Record<string, unknown> =>
            typeof s.id === 'string' && typeof s.query === 'string' && typeof s.created_at === 'string')
          .map((s) => ({ id: s.id, query: s.query, depth: typeof s.depth === 'string' ? s.depth : 'quick', created_at: s.created_at })),
      ))
      .catch(() => { /* silent */ });
  }, []);

  // Real activity feed — recent module sessions + Pathfinder searches,
  // newest first. No fabricated entries: empty state when there's nothing.
  const activityFeed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...feedSessions.map((s): FeedItem => ({
        key: `session-${s.id}`,
        when: s.created_at,
        icon: MessageSquare,
        tone: 'accent',
        title: s.title || '(untitled session)',
        sub: (s.module_id || 'session').replace(/-/g, ' '),
        route: `/module/${s.module_id}?session=${s.id}`,
      })),
      ...recentSearches.map((s): FeedItem => ({
        key: `search-${s.id}`,
        when: s.created_at,
        icon: Compass,
        tone: 'blue',
        title: s.query,
        sub: `Pathfinder search · ${s.depth}`,
        route: `/pathfinder?searchId=${s.id}`,
      })),
    ];
    return items
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 8);
  }, [feedSessions, recentSearches]);

  // ── UI state ────────────────────────────────────────────────
  const [rightMode, setRightMode] = useState<RightMode>('digest');
  const [pathQuery, setPathQuery] = useState('');
  const [moduleQuery, setModuleQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]') as string[]); }
    catch { return new Set(); }
  });

  // Right-rail collapse — persisted
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(RAIL_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(RAIL_COLLAPSED_KEY, railCollapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [railCollapsed]);

  function toggleFav(id: string) {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  // Module search across all modules; falls back to area-grouped catalog
  const filteredAreas = useMemo(() => {
    if (!moduleQuery.trim()) return null;
    const q = moduleQuery.toLowerCase();
    return MODULES.filter(m => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)).slice(0, 24);
  }, [moduleQuery]);

  const railWidth = railCollapsed ? '40px' : '380px';

  return (
    <div
      className="grid h-full min-h-0"
      style={{
        gridTemplateColumns: `1fr ${railWidth}`,
        background: 'var(--color-bg)',
        transition: 'grid-template-columns 180ms ease',
      }}
    >
      {/* ════════════ Main column ════════════ */}
      <div className="overflow-y-auto px-9 py-7">

        {/* ── Top: Anton title + APCI tagline + 5-Minute Brief ── */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h1
                className="text-[var(--color-text)]"
                style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}
              >
                Anton
              </h1>
              <span className="text-[12px] text-[var(--color-text-muted)]">by openEXPERT</span>
            </div>
            <p
              className="mt-1.5 text-[var(--color-text-body)]"
              style={{ fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}
            >
              Powered by APCI — Artificial Professional Context Intelligence. Every session builds on what came before, so your AI gets genuinely better at the work you need it to do.
            </p>
          </div>
          <Btn
            variant="accent"
            size="md"
            icon={<Zap size={13} strokeWidth={1.5} />}
            onClick={() => navigate('/brief')}
          >
            5-Minute Brief
          </Btn>
        </div>

        {/* ── Regulatory deadlines strip ──────────────────────── */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {deadlines.map(dl => {
            const days = daysUntil(dl.date);
            const tone: AreaTone = days < 90 ? 'red' : days < 365 ? 'gold' : 'accent';
            return (
              <div
                key={dl.id}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <Clock size={11} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
                <span className="text-[var(--color-text-body)]">{dl.label}:</span>
                <span className="font-semibold" style={{ color: TONE_FG[tone] }}>{days} days</span>
              </div>
            );
          })}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] text-[var(--color-text-muted)]"
            style={{
              background: 'transparent',
              border: '1px dashed var(--color-border)',
            }}
          >
            <Plus size={11} strokeWidth={1.5} /> Add deadline
          </button>
        </div>

        {/* ── 5 KPI stat cards ───────────────────────────────── */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Sessions"      value={stats?.totalSessions ?? '—'}      icon={LayoutGrid} tone="accent" />
          <KpiCard label="AI Responses"  value={stats?.totalMessages ?? '—'}      icon={MessageSquare} tone="accent" />
          <KpiCard label="Output Tokens" value={stats ? stats.totalOutputTokens.toLocaleString() : '—'} icon={Zap} tone="accent" />
          <KpiCard label="This week"     value={stats?.thisWeekSessions ?? '—'}   icon={Clock} tone="accent" />
          <KpiCard label="This month"    value={stats?.thisMonthSessions ?? '—'}  icon={TrendingUp} tone="accent" />
        </div>

        {/* ── Editorial brief ────────────────────────────────── */}
        <div className="mb-6">
          <Section className="mb-3">
            Today's brief · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Section>
          <h2
            className="text-[var(--color-text)]"
            style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.4px', lineHeight: 1.25, maxWidth: 720, marginBottom: 10 }}
          >
            {continueWork.length > 0
              ? 'Pick up where you left off — your recent work is one click away.'
              : 'Start your first session — pick a module below or ask Pathfinder.'}
          </h2>
          <p
            className="text-[var(--color-text-body)]"
            style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}
          >
            {MODULES.length} expert modules across {AREAS.length} areas are ready to run, and
            Pathfinder answers research questions with sourced, multi-phase reasoning.
            Your recent sessions and searches appear in the Activity rail on the right.
          </p>
        </div>

        {/* ── Continue Your Work ─────────────────────────────── */}
        {continueWork.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-end justify-between">
              <Section className="inline-flex items-center gap-1.5">
                <Clock size={12} strokeWidth={1.5} /> Continue Your Work
              </Section>
              <button
                onClick={() => navigate('/my-work')}
                className="text-[11.5px] font-semibold text-[var(--color-adv-teal)] hover:underline"
              >
                View All →
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {continueWork.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => navigate(`/module/${s.module_id}?session=${s.id}`)}
                  className="flex flex-col items-start gap-2 rounded-[var(--radius-r2)] p-3 text-left"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                    <Clock size={11} strokeWidth={1.5} />
                    <span className="capitalize">{(s.module_id || 'session').replace(/-/g, ' ')}</span>
                  </div>
                  <div
                    className="line-clamp-2 text-[13px] font-semibold text-[var(--color-text)]"
                    style={{ lineHeight: 1.3 }}
                  >
                    {s.title || '(untitled session)'}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--color-text-faint)]">
                    {new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    {s.total_tokens ? ` · ${(s.total_tokens / 1000).toFixed(1)}k tok` : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Pathfinder bar ─────────────────────────────────── */}
        <div className="mb-6">
          <div className="mb-3 flex items-end justify-between">
            <Section className="inline-flex items-center gap-1.5">
              <Compass size={12} strokeWidth={1.5} /> Pathfinder · search that thinks
            </Section>
            <button
              onClick={() => navigate('/pathfinder')}
              className="text-[11.5px] font-semibold text-[var(--color-adv-teal)] hover:underline"
            >
              Open full search →
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pathQuery.trim()) navigate(`/pathfinder?q=${encodeURIComponent(pathQuery.trim())}`);
            }}
            className="flex items-center gap-2 px-3 py-2"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-r2)',
            }}
          >
            <Search size={16} strokeWidth={1.5} className="text-[var(--color-text-muted)]" />
            <input
              value={pathQuery}
              onChange={(e) => setPathQuery(e.target.value)}
              placeholder="Search that thinks before it answers…"
              className="flex-1 bg-transparent text-[14px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
            />
            <Btn type="submit" variant="primary" size="sm">Search</Btn>
          </form>
          <p className="mt-2 text-center text-[11px] text-[var(--color-text-faint)]">
            Your search. Your data. No ads. No agenda.
          </p>
        </div>

        {/* ── My Custom Modules ──────────────────────────────── */}
        {customModules.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-end justify-between">
              <Section className="inline-flex items-center gap-1.5">
                <Sparkles size={12} strokeWidth={1.5} /> My Custom Modules
                <span className="ml-1 text-[var(--color-text-muted)]">{customModules.length}</span>
              </Section>
              <button
                onClick={() => navigate('/build-module')}
                className="text-[11.5px] font-semibold text-[var(--color-adv-teal)] hover:underline"
              >
                Build new →
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {customModules.slice(0, 4).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => navigate(`/module/${m.id}`)}
                  className="flex flex-col items-start gap-2 rounded-[var(--radius-r2)] p-3 text-left"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-md"
                    style={{
                      background: 'var(--color-accent-soft)',
                      color: 'var(--color-adv-teal)',
                      border: '1px solid var(--color-accent-dim)',
                    }}
                  >
                    <Sparkle size={13} strokeWidth={1.5} />
                  </div>
                  <div className="line-clamp-1 text-[13px] font-semibold text-[var(--color-text)]">
                    {m.name}
                  </div>
                  <div
                    className="line-clamp-2 text-[11px] text-[var(--color-text-muted)]"
                    style={{ lineHeight: 1.4 }}
                  >
                    {m.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── FIND THE RIGHT MODULE — real AI search (server-side
               full-catalog ranking via /api/modules/smart-search) ── */}
        <SmartModuleSearch />

        {/* ── Module catalog (search or grouped by area) ─────── */}
        <div className="mb-6">
          <input
            value={moduleQuery}
            onChange={(e) => setModuleQuery(e.target.value)}
            placeholder="Search modules — e.g. GDPR, stress testing, contract review…"
            className="mb-4 w-full rounded-[var(--radius-r2)] px-3.5 py-2.5 text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:outline-none"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          />
          {filteredAreas
            ? (
              <>
                <Section className="mb-3">
                  Search · {filteredAreas.length} match{filteredAreas.length === 1 ? '' : 'es'}
                </Section>
                <ModuleGrid
                  modules={filteredAreas}
                  tone="accent"
                  favorites={favorites}
                  onPick={(id) => navigate(`/module/${id}`)}
                  onFav={toggleFav}
                />
              </>
            )
            : (
              <>
                {AREAS.map(area => {
                  const tone = AREA_TONE[area.id] ?? 'accent';
                  const list = area.moduleIds
                    .map(id => MODULES.find(m => m.id === id))
                    .filter((m): m is NonNullable<typeof m> => Boolean(m));
                  if (list.length === 0) return null;
                  return (
                    <div key={area.id} className="mb-6">
                      <div className="mb-3">
                        <span
                          className="font-mono font-bold uppercase"
                          style={{ fontSize: 12, color: TONE_FG[tone], letterSpacing: '0.4px' }}
                        >
                          {area.label}
                        </span>
                        <span className="ml-2 text-[11.5px] text-[var(--color-text-muted)]">
                          {list.length} modules
                        </span>
                      </div>
                      <ModuleGrid
                        modules={list.slice(0, 8)}
                        tone={tone}
                        favorites={favorites}
                        onPick={(id) => navigate(`/module/${id}`)}
                        onFav={toggleFav}
                      />
                      {list.length > 8 && (
                        <div className="mt-2 text-[11.5px] text-[var(--color-text-muted)]">
                          +{list.length - 8} more in this area · use the search above to find them
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
        </div>

        <div className="h-12" />
      </div>

      {/* ════════════ Right rail (collapse handle at BOTTOM) ════════════ */}
      <div
        className="relative flex min-h-0 flex-col"
        style={{
          background: 'var(--color-rail)',
          borderLeft: '1px solid var(--color-border-soft)',
          overflow: 'hidden',
        }}
      >
        {!railCollapsed && (
          <>
            <div
              className="flex items-center gap-2 px-4 pt-3.5 pb-2.5"
              style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-soft)' }}
            >
              <div
                className="flex flex-1 gap-[3px] rounded-md p-[3px]"
                style={{ background: 'var(--color-surface-muted)' }}
              >
                {([
                  ['digest', 'Activity', Inbox],
                  ['agent',  'Agent status', Sparkles],
                ] as const).map(([id, label, Icon]) => {
                  const active = rightMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRightMode(id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded text-[12px]"
                      style={{
                        padding: '5px 10px',
                        fontWeight: active ? 600 : 500,
                        background: active ? 'var(--color-surface)' : 'transparent',
                        color:      active ? 'var(--color-text)'    : 'var(--color-text-muted)',
                        boxShadow:  active ? '0 1px 2px rgba(0,0,0,.06)' : 'none',
                      }}
                    >
                      <Icon size={12} strokeWidth={1.5} color={active ? 'var(--color-adv-teal)' : 'var(--color-text-muted)'} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3.5 pb-12 pt-3.5">
              {rightMode === 'digest' ? (
                <DigestList items={activityFeed} onOpen={(route) => navigate(route)} />
              ) : (
                <AgentList />
              )}
            </div>
          </>
        )}

        {railCollapsed && (
          <div className="flex flex-col items-center gap-3 pt-3.5">
            <button
              type="button"
              onClick={() => { setRailCollapsed(false); setRightMode('digest'); }}
              aria-label="Activity"
              className="rounded-md p-1.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Inbox size={16} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => { setRailCollapsed(false); setRightMode('agent'); }}
              aria-label="Agent status"
              className="rounded-md p-1.5"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <Sparkles size={16} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Collapse handle at the BOTTOM (matches left-nav convention) */}
        <button
          type="button"
          onClick={() => setRailCollapsed(c => !c)}
          aria-label={railCollapsed ? 'Expand right panel' : 'Collapse right panel'}
          className="absolute z-10 flex items-center justify-center"
          style={{
            bottom: 12, left: railCollapsed ? 6 : 12,
            width: railCollapsed ? 26 : 32, height: 26,
            borderRadius: 6,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            transition: 'all 180ms ease',
          }}
        >
          {railCollapsed
            ? <ChevronLeft  size={14} strokeWidth={1.5} />
            : <ChevronRight size={14} strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, tone }: {
  label: string; value: string | number; icon: LucideIcon; tone: AreaTone;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-r2)',
      }}
    >
      <div
        className="flex flex-shrink-0 items-center justify-center rounded-md"
        style={{
          width: 30, height: 30,
          background: TONE_BG[tone],
          color: TONE_FG[tone],
          border: `1px solid ${TONE_BORDER[tone]}`,
        }}
      >
        <Icon size={14} strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <div
          className="text-[var(--color-text)]"
          style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.3px', lineHeight: 1.1 }}
        >
          {value}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{label}</div>
      </div>
    </div>
  );
}

function ModuleGrid({
  modules, tone, favorites, onPick, onFav,
}: {
  modules: typeof MODULES;
  tone: AreaTone;
  favorites: Set<string>;
  onPick: (id: string) => void;
  onFav: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {modules.map(m => {
        const Icon = moduleIcon(m.icon);
        const isFav = favorites.has(m.id);
        return (
          <div
            key={m.id}
            className="flex items-start gap-2.5 rounded-[var(--radius-r2)] p-3"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              className="flex flex-shrink-0 items-center justify-center rounded-md"
              style={{
                width: 28, height: 28,
                background: TONE_BG[tone],
                color: TONE_FG[tone],
                border: `1px solid ${TONE_BORDER[tone]}`,
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
            </div>
            <button
              type="button"
              onClick={() => onPick(m.id)}
              className="flex-1 text-left"
            >
              <div
                className="text-[13px] font-semibold text-[var(--color-text)]"
                style={{ lineHeight: 1.3 }}
              >
                {m.label}
              </div>
              <div
                className="mt-1 line-clamp-3 text-[11px] text-[var(--color-text-muted)]"
                style={{ lineHeight: 1.4 }}
              >
                {m.description}
              </div>
            </button>
            <button
              type="button"
              onClick={() => onFav(m.id)}
              className="flex-shrink-0"
              aria-label={isFav ? 'Unfavourite' : 'Favourite'}
            >
              <Star
                size={13}
                strokeWidth={1.5}
                className={isFav ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]'}
                fill={isFav ? 'var(--color-gold)' : 'transparent'}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DigestList({ items, onOpen }: {
  items: FeedItem[];
  onOpen: (route: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="px-1 py-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
        Your recent activity will appear here — module sessions and Pathfinder
        searches show up as you work.
      </div>
    );
  }
  return (
    <>
      {items.map((f, i) => {
        const Icon = f.icon;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onOpen(f.route)}
            className="flex w-full gap-2.5 py-2.5 text-left"
            style={{ borderTop: i === 0 ? 'none' : '1px solid var(--color-border-soft)' }}
          >
            <div
              className="flex flex-shrink-0 items-center justify-center rounded-md"
              style={{
                width: 26, height: 26,
                background: FEED_BG[f.tone],
                color: FEED_FG[f.tone],
                border: `1px solid ${FEED_BORDER[f.tone]}`,
              }}
            >
              <Icon size={13} strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-baseline justify-between gap-2">
                <div
                  className="truncate text-[var(--color-text)]"
                  style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}
                >
                  {f.title}
                </div>
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-faint)]">{formatFeedTime(f.when)}</span>
              </div>
              <div className="truncate text-[11px] leading-snug capitalize text-[var(--color-text-muted)]">{f.sub}</div>
            </div>
          </button>
        );
      })}
    </>
  );
}

function AgentList() {
  const navigate = useNavigate();
  return (
    <div
      className="px-3 py-3"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-r2)',
      }}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Sparkles size={13} strokeWidth={1.5} className="text-[var(--color-adv-teal)]" />
        <span className="text-[12.5px] font-semibold text-[var(--color-text)]">No agents running</span>
      </div>
      <p className="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">
        Background agent activity will appear here. Queue work for the Task Agent
        or set up a specialized agent to get started.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Btn variant="primary" size="sm" onClick={() => navigate('/task-agent')}>Task Agent</Btn>
        <Btn variant="primary" size="sm" onClick={() => navigate('/agents')}>Specialized Agents</Btn>
      </div>
    </div>
  );
}
