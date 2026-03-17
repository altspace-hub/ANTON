import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import {
  // FCP icons
  SearchCheck, FileText, Shield, Radar, GraduationCap, Database, BarChart3,
  Search, Handshake, Rocket, Presentation, FlaskConical,
  // Legal icons
  FileSearch, FileCheck, GitCompare, Lock, ScrollText,
  // Audit icons
  ClipboardList, TestTube, FileWarning, ClipboardCheck,
  // Consulting icons
  Send, Network, RefreshCw, Briefcase,
  // Banking icons
  TrendingDown, CreditCard, BarChart2, Building, PackageCheck, Building2,
  // Risk icons
  AlertTriangle, Gauge, Settings, GitBranch, Share2, Scale,
  // Wave 2 icons — Cyber
  ShieldCheck, ScanSearch, Siren,
  // Wave 2 icons — Data & Analytics
  DatabaseZap, Layers, AlertCircle, FileBarChart,
  // Wave 2 icons — ESG
  CircleDot, Thermometer, Leaf,
  // Wave 2 icons — Strategy
  TrendingUp, Compass, MapPin, Crosshair,
  // Wave 2 icons — Investment & Project Mgmt
  LineChart, PieChart, FolderKanban, Users,
  // Wave 3 icons — Healthcare, NGO, Creative, Blockchain, PE/VC, etc.
  Activity, Stethoscope, Heart, HeartPulse, Hospital, Baby,
  Globe, Blocks, Clapperboard, BookOpen, Landmark, Sprout,
  Pen, Wheat, Droplets, Bug, Scissors, Pill, Syringe, Brain,
  // UI icons
  ArrowRight, ChevronRight, Clock, LayoutGrid, MessageSquare, Zap, Trash2, Pencil, Check, X, X as XIcon,
  Star, Puzzle, Plus,
} from 'lucide-react';
import { MODULES, MODELS, AREAS } from '@/lib/constants';
import MorningBrief from '@/features/time-intelligence/MorningBrief';
import TeamWorkloadView from '@/features/workflows/TeamWorkloadView';
import RadarWidget from '@/features/radar/RadarWidget';
import PathfinderBar from '@/components/pathfinder/PathfinderBar';
import SmartModuleSearch from '@/components/shared/SmartModuleSearch';
import { STARTER_PACKS } from '@/lib/starter-packs';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { fetchSessions, fetchSessionStats, deleteSession, updateSessionTitle, fetchCommunityModules, fetchCustomModules, fetchProfile, type CustomModuleData } from '@/lib/api';
import type { Session } from '@/lib/types';

const FAVORITES_KEY = 'openexpert-favorite-modules';
const STARTER_PACKS_HIDDEN_KEY = 'openexpert-starter-packs-hidden';
const DEADLINES_KEY = 'openexpert-regulatory-deadlines';

interface RegulatoryDeadline {
  id: string;
  label: string;
  date: string; // ISO date string YYYY-MM-DD
  link: string;
}

const DEFAULT_DEADLINES: RegulatoryDeadline[] = [
  { id: 'dora-2025',  label: 'DORA applies',        date: '2025-01-17', link: '/module/gap-analysis' },
  { id: 'amld6-2026', label: 'AMLD6 transposition', date: '2026-07-10', link: '/module/gap-analysis' },
  { id: 'amlr-2027',  label: 'AMLR applies',        date: '2027-07-10', link: '/module/gap-analysis' },
];

function loadDeadlines(): RegulatoryDeadline[] {
  try {
    const stored = localStorage.getItem(DEADLINES_KEY);
    if (stored) return JSON.parse(stored) as RegulatoryDeadline[];
  } catch { /* ignore */ }
  return DEFAULT_DEADLINES;
}

function saveDeadlines(deadlines: RegulatoryDeadline[]) {
  localStorage.setItem(DEADLINES_KEY, JSON.stringify(deadlines));
}

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<string>) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  // Wave 1
  SearchCheck, FileText, Shield, Radar, GraduationCap, Database, BarChart3,
  Search, Handshake, Rocket, Presentation, FlaskConical,
  FileSearch, FileCheck, GitCompare, Lock, ScrollText, Scale,
  ClipboardList, TestTube, FileWarning, ClipboardCheck,
  Send, Network, RefreshCw, Briefcase,
  TrendingDown, CreditCard, BarChart2, Building, PackageCheck, Building2,
  AlertTriangle, Gauge, Settings, GitBranch, Share2,
  // Wave 2
  ShieldCheck, ScanSearch, Siren,
  DatabaseZap, Layers, AlertCircle, FileBarChart,
  CircleDot, Thermometer, Leaf,
  TrendingUp, Compass, MapPin, Crosshair,
  LineChart, PieChart, FolderKanban, Users,
  // Wave 3
  Activity, Stethoscope, Heart, HeartPulse, Hospital, Baby,
  Globe, Blocks, Clapperboard, BookOpen, Landmark, Sprout,
  Pen, Wheat, Droplets, Bug, Scissors, Pill, Syringe, Brain,
};

const colorMap: Record<string, string> = {
  'adv-teal':  'bg-adv-teal/10 text-adv-teal border-adv-teal/20',
  'adv-blue':  'bg-adv-blue/10 text-adv-blue border-adv-blue/20',
  'adv-gold':  'bg-adv-gold/10 text-adv-gold border-adv-gold/20',
  'adv-green': 'bg-adv-green/10 text-adv-green border-adv-green/20',
  'adv-red':   'bg-adv-red/10 text-adv-red border-adv-red/20',
};

const areaHeaderColor: Record<string, string> = {
  fcp:            'text-adv-teal',
  legal:          'text-adv-blue',
  audit:          'text-adv-gold',
  consulting:     'text-adv-green',
  banking:        'text-adv-blue',
  risk:           'text-adv-red',
  cyber:          'text-adv-teal',
  esg:            'text-adv-green',
  'data-analytics': 'text-adv-blue',
  investment:     'text-adv-teal',
  'project-mgmt': 'text-adv-green',
  strategy:       'text-adv-gold',
  blockchain:     'text-adv-teal',
  healthcare:     'text-adv-blue',
  'creative-production': 'text-adv-gold',
  humanitarian:   'text-adv-green',
  'pe-vc':        'text-adv-teal',
  insurance:      'text-adv-blue',
  'payments-dora': 'text-adv-teal',
  'community-health': 'text-adv-green',
  'smallholder-farming': 'text-adv-green',
};

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

type SessionStats = {
  totalSessions: number;
  totalMessages: number;
  totalOutputTokens: number;
  topModules: Array<{ moduleId: string; count: number }>;
  thisWeekSessions?: number;
  thisMonthSessions?: number;
  recentSessions?: Array<{ id: string; title: string; module_id: string; created_at: string; tokens: number }>;
};

export default function Dashboard() {
  const { t } = useTranslation();
  const formatRelativeTime = useFormatRelativeTime();
  const { checkHealth, health } = useSettingsStore();
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [continueWorkSessions, setContinueWorkSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [moduleSearch, setModuleSearch] = useState('');
  const [communityModules, setCommunityModules] = useState<CustomModuleData[]>([]);
  const [myCustomModules, setMyCustomModules] = useState<CustomModuleData[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);
  const [hourlyRate, setHourlyRate] = useState<number>(250);
  const [userProfile, setUserProfile] = useState<Record<string, string | null>>({});
  const [starterPacksHidden, setStarterPacksHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STARTER_PACKS_HIDDEN_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const navigate = useNavigate();
  const [deadlines, setDeadlines] = useState<RegulatoryDeadline[]>(loadDeadlines);
  const [addingDeadline, setAddingDeadline] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [dlForm, setDlForm] = useState({ label: '', date: '', link: '' });
  const [scheduledNotifications, setScheduledNotifications] = useState<Array<{
    id: string; title: string; message?: string; link?: string; created_at: string;
  }>>([]);

  useEffect(() => {
    checkHealth();
    fetchSessions()
      .then((sessions) => setRecentSessions(sessions.slice(0, 6)))
      .catch(() => setRecentSessions([]));
    fetchSessions(undefined, { hasOutput: true, limit: 4 })
      .then((sessions) => setContinueWorkSessions(sessions))
      .catch(() => setContinueWorkSessions([]));
    fetchSessionStats()
      .then(setStats)
      .catch(() => setStats(null));
    fetchCommunityModules()
      .then(setCommunityModules)
      .catch(() => setCommunityModules([]));
    fetchCustomModules()
      .then(setMyCustomModules)
      .catch(() => setMyCustomModules([]));
    fetchProfile()
      .then((data) => {
        const rate = typeof data.hourly_rate_eur === 'number' ? data.hourly_rate_eur : Number(data.hourly_rate_eur) || 250;
        setHourlyRate(rate);
        setUserProfile(data);
      })
      .catch(() => {});
  }, [checkHealth]);

  useEffect(() => {
    const fetchScheduledNotifs = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch('/api/notifications', { headers });
        if (res.ok) {
          const data = await res.json();
          const arr = Array.isArray(data) ? data : [];
          const scheduled = arr.filter((n: any) =>
            (n.type === 'scheduled_workflow' || n.type === 'radar_scan') && !n.read_at
          );
          setScheduledNotifications(scheduled);
        }
      } catch { /* ignore */ }
    };
    fetchScheduledNotifs();
  }, []);

  // Score a starter pack against the user's profile. Higher = better match.
  function scorePackForProfile(pack: typeof STARTER_PACKS[0]): number {
    if (!userProfile || Object.keys(userProfile).length === 0) return 0;
    let score = 0;
    const role = (userProfile.role || userProfile.role_title || '').toLowerCase();
    const industry = (userProfile.industry || '').toLowerCase();
    const jurisdiction = (userProfile.jurisdiction || '').toLowerCase();
    const level = (userProfile.experience_level || '').toLowerCase();
    const focusAreas = (userProfile.focus_areas || userProfile.current_focus || '').toLowerCase();

    const haystack = [pack.targetUser, ...pack.tags, pack.name, pack.description]
      .join(' ').toLowerCase();

    // Role match
    const roleKeywords = role.split(/[\s,/]+/).filter(Boolean);
    for (const kw of roleKeywords) {
      if (kw.length > 3 && haystack.includes(kw)) score += 3;
    }
    // Industry match
    const industryKeywords = industry.split(/[\s,/]+/).filter(Boolean);
    for (const kw of industryKeywords) {
      if (kw.length > 3 && haystack.includes(kw)) score += 2;
    }
    // Jurisdiction/region match
    if (jurisdiction && haystack.includes(jurisdiction)) score += 2;
    if (jurisdiction.includes('nordic') || jurisdiction.includes('sweden') || jurisdiction.includes('finland') || jurisdiction.includes('denmark') || jurisdiction.includes('norway')) {
      if (haystack.includes('nordic')) score += 2;
    }
    // Focus area match
    const focusKeywords = focusAreas.split(/[\s,/]+/).filter(Boolean);
    for (const kw of focusKeywords) {
      if (kw.length > 3 && haystack.includes(kw)) score += 1;
    }
    // Junior/senior level alignment
    if (level.includes('junior') || level.includes('entry')) {
      if (pack.tags.some(t => ['starter', 'intro', 'basic', 'foundation'].includes(t.toLowerCase()))) score += 1;
    }
    return score;
  }

  const rankedPacks = [...STARTER_PACKS].sort((a, b) => scorePackForProfile(b) - scorePackForProfile(a));
  const hasProfile = Object.values(userProfile).some(v => v && String(v).trim().length > 0);

  function toggleStarterPacks() {
    setStarterPacksHidden((prev) => {
      const next = !prev;
      try { localStorage.setItem(STARTER_PACKS_HIDDEN_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const toggleFavorite = useCallback((moduleId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  async function handleDeleteSession(e: React.MouseEvent, sessionId: string) {
    e.preventDefault();
    e.stopPropagation();
    await deleteSession(sessionId);
    setRecentSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

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
      setRecentSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, title } : s))
      );
    }
    setRenamingId(null);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, sessionId: string) {
    if (e.key === 'Enter') { e.preventDefault(); commitRename(sessionId); }
    if (e.key === 'Escape') setRenamingId(null);
  }

  // Favourites row — resolve modules in the order they were starred
  const favoriteModules = [...favorites]
    .map((id) => MODULES.find((m) => m.id === id))
    .filter(Boolean) as typeof MODULES;

  // Search filtering
  const query = moduleSearch.trim().toLowerCase();
  const filteredModules = query
    ? MODULES.filter(
        (m) =>
          m.label.toLowerCase().includes(query) ||
          m.shortLabel.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      )
    : null; // null = show all grouped by area

  return (
    <div className="mx-auto max-w-6xl">
      {/* API key warning — shown on first run before key is configured */}
      {health !== null && health.status === 'ok' && health.apiKeyConfigured === false && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-adv-red/40 bg-adv-red/10 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-adv-red" />
          <div>
            <p className="text-sm font-semibold text-adv-red">{t('dashboard.apiKeyNotConfigured')}</p>
            <p className="mt-1 text-xs text-adv-off-white">
              Add your key to the{' '}
              <code className="rounded bg-adv-dark px-1 py-0.5 font-mono text-adv-teal">.env</code>{' '}
              file as{' '}
              <code className="rounded bg-adv-dark px-1 py-0.5 font-mono text-adv-teal">ANTHROPIC_API_KEY=sk-ant-...</code>{' '}
              and restart the server. No AI features will work until this is set.{' '}
              <Link to="/settings" className="text-adv-teal hover:underline">Open Settings</Link>
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-adv-white">{t('dashboard.title')} <span className="text-sm font-normal text-adv-gray">{t('dashboard.byLine')}</span></h1>
          <p className="mt-1 text-sm text-adv-gray">
            {t('dashboard.subtitle')}
          </p>
        </div>
        {/* UX-03: 5-Minute Brief fast path */}
        <Link
          to="/module/regulatory-monitor?preset=quick-brief"
          className="flex shrink-0 items-center gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/10 px-3 py-2 text-xs font-medium text-adv-gold transition-colors hover:bg-adv-gold/20"
          title="One-click Sonnet + Quick thinking + Quick Briefing output — ideal for time-constrained executives"
        >
          <Zap className="h-3.5 w-3.5" />
          5-Minute Brief
        </Link>
      </div>

      {/* Scheduled Job Results Widget */}
      {scheduledNotifications.length > 0 && (
        <div className="mb-6 rounded-xl border border-adv-gold/30 bg-adv-gold/5 px-5 py-4">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-adv-gold mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-adv-gold">
                {scheduledNotifications.length} scheduled job{scheduledNotifications.length !== 1 ? 's' : ''} completed since your last visit
              </p>
              <ul className="mt-2 space-y-1">
                {scheduledNotifications.slice(0, 3).map(n => (
                  <li key={n.id} className="text-xs text-adv-off-white flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-adv-gold flex-shrink-0" />
                    {n.title}
                    {n.message && <span className="text-adv-gray"> — {n.message}</span>}
                  </li>
                ))}
                {scheduledNotifications.length > 3 && (
                  <li className="text-xs text-adv-gray">
                    +{scheduledNotifications.length - 3} more
                  </li>
                )}
              </ul>
            </div>
            <button
              onClick={() => {
                const firstWithLink = scheduledNotifications.find(n => n.link);
                if (firstWithLink?.link) navigate(firstWithLink.link);
                else navigate('/workflows');
              }}
              className="text-xs font-medium text-adv-gold hover:text-adv-off-white flex items-center gap-0.5 flex-shrink-0"
            >
              {t('dashboard.viewResults')}
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* LONE-03: Regulatory deadline countdown — user-customisable */}
      {(() => {
        const today = new Date();
        const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - today.getTime()) / 86_400_000));
        const activeDeadlines = deadlines.filter(d => daysUntil(d.date) > 0);
        const getColor = (days: number) => days === 0 ? 'text-adv-red' : days < 180 ? 'text-adv-gold' : 'text-adv-teal';

        function handleSaveDeadline() {
          if (!dlForm.label.trim() || !dlForm.date) return;
          const updated = editingDeadlineId
            ? deadlines.map(d => d.id === editingDeadlineId ? { ...d, label: dlForm.label.trim(), date: dlForm.date, link: dlForm.link.trim() || '/module/gap-analysis' } : d)
            : [...deadlines, { id: `custom-${Date.now()}`, label: dlForm.label.trim(), date: dlForm.date, link: dlForm.link.trim() || '/module/gap-analysis' }];
          setDeadlines(updated);
          saveDeadlines(updated);
          setAddingDeadline(false);
          setEditingDeadlineId(null);
          setDlForm({ label: '', date: '', link: '' });
        }

        function handleDeleteDeadline(id: string) {
          const updated = deadlines.filter(d => d.id !== id);
          setDeadlines(updated);
          saveDeadlines(updated);
        }

        function handleEditDeadline(d: RegulatoryDeadline) {
          setEditingDeadlineId(d.id);
          setDlForm({ label: d.label, date: d.date, link: d.link });
          setAddingDeadline(true);
        }

        function handleResetDefaults() {
          setDeadlines(DEFAULT_DEADLINES);
          saveDeadlines(DEFAULT_DEADLINES);
        }

        return (
          <div className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              {activeDeadlines.map(d => {
                const days = daysUntil(d.date);
                return (
                  <div key={d.id} className="group relative flex items-center gap-2 rounded-lg border border-adv-card bg-adv-card px-3 py-1.5 text-xs transition-colors hover:border-adv-teal/40">
                    <Link to={d.link} className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-adv-gray" />
                      <span className="text-adv-gray">{d.label}:</span>
                      <span className={`font-semibold ${getColor(days)}`}>{days.toLocaleString()} days</span>
                    </Link>
                    <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                      <button onClick={() => handleEditDeadline(d)} className="rounded p-0.5 text-adv-gray hover:text-adv-teal transition-colors" title="Edit">
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button onClick={() => handleDeleteDeadline(d.id)} className="rounded p-0.5 text-adv-gray hover:text-adv-red transition-colors" title="Remove">
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Add your own button */}
              {!addingDeadline && (
                <button
                  onClick={() => { setAddingDeadline(true); setEditingDeadlineId(null); setDlForm({ label: '', date: '', link: '' }); }}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-adv-gray/30 bg-transparent px-3 py-1.5 text-xs text-adv-gray transition-colors hover:border-adv-teal/50 hover:text-adv-teal"
                >
                  <Plus className="h-3 w-3" />
                  Add deadline
                </button>
              )}

              {/* Reset to defaults (only show if custom deadlines differ) */}
              {JSON.stringify(deadlines.map(d => d.id)) !== JSON.stringify(DEFAULT_DEADLINES.map(d => d.id)) && !addingDeadline && (
                <button
                  onClick={handleResetDefaults}
                  className="text-[10px] text-adv-gray/50 hover:text-adv-gray transition-colors"
                  title="Reset to default FCP deadlines"
                >
                  reset
                </button>
              )}
            </div>

            {/* Inline add/edit form */}
            {addingDeadline && (
              <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-adv-teal/30 bg-adv-card p-3">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-adv-gray">Name</label>
                  <input
                    type="text"
                    value={dlForm.label}
                    onChange={e => setDlForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="e.g. MiCA applies"
                    className="h-8 w-44 rounded border border-border bg-adv-dark px-2 text-xs text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-adv-gray">Date</label>
                  <input
                    type="date"
                    value={dlForm.date}
                    onChange={e => setDlForm(f => ({ ...f, date: e.target.value }))}
                    className="h-8 w-36 rounded border border-border bg-adv-dark px-2 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-adv-gray">Link (optional)</label>
                  <input
                    type="text"
                    value={dlForm.link}
                    onChange={e => setDlForm(f => ({ ...f, link: e.target.value }))}
                    placeholder="/module/gap-analysis"
                    className="h-8 w-44 rounded border border-border bg-adv-dark px-2 text-xs text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-teal focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveDeadline}
                    disabled={!dlForm.label.trim() || !dlForm.date}
                    className="flex h-8 items-center gap-1 rounded bg-adv-teal px-3 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-40"
                  >
                    <Check className="h-3 w-3" />
                    {editingDeadlineId ? 'Save' : 'Add'}
                  </button>
                  <button
                    onClick={() => { setAddingDeadline(false); setEditingDeadlineId(null); }}
                    className="flex h-8 items-center rounded px-2 text-xs text-adv-gray hover:text-adv-off-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Stat Cards */}
      {stats !== null && (
        <>
          {/* LONE-04: stat cards are drill-down links to relevant pages */}
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <Link to="/my-work" className="flex items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 transition-colors hover:border-adv-teal/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-semibold text-adv-white">{stats.totalSessions}</p>
                <p className="text-xs text-adv-gray">{t('dashboard.sessions')}</p>
              </div>
            </Link>
            <Link to="/my-work" className="flex items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 transition-colors hover:border-adv-teal/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-semibold text-adv-white">{stats.totalMessages}</p>
                <p className="text-xs text-adv-gray">{t('dashboard.aiResponses')}</p>
              </div>
            </Link>
            <Link to="/audit" className="flex items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 transition-colors hover:border-adv-teal/40">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-semibold text-adv-white">{(stats.totalOutputTokens ?? 0).toLocaleString()}</p>
                <p className="text-xs text-adv-gray">{t('dashboard.outputTokens')}</p>
              </div>
            </Link>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-semibold text-adv-white">{stats.thisWeekSessions ?? 0}</p>
                <p className="text-xs text-adv-gray">{t('dashboard.thisWeek')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-semibold text-adv-white">{stats.thisMonthSessions ?? 0}</p>
                <p className="text-xs text-adv-gray">{t('dashboard.thisMonth')}</p>
              </div>
            </div>
          </div>

          {/* ROI Summary */}
          {(() => {
            const avgTimeSavedPerSession = 2.5; // hours
            const timeSaved = (stats.thisMonthSessions ?? 0) * avgTimeSavedPerSession;
            const estValue = timeSaved * hourlyRate;
            const apiCostEst = (stats.totalOutputTokens ?? 0) * 0.000075;
            const roiRatio = apiCostEst > 0 ? (timeSaved / apiCostEst).toFixed(1) : null;
            if ((stats.thisMonthSessions ?? 0) === 0) return null;
            return (
              <div className="mb-6 rounded-xl border border-adv-teal/20 bg-adv-teal-soft px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-adv-teal">{t('dashboard.roiThisMonth')}</p>
                    <p className="mt-1 text-sm text-adv-off-white">
                      openEXPERT has saved you an estimated{' '}
                      <span className="font-semibold text-adv-teal">{timeSaved.toFixed(1)} hours</span>{' '}
                      this month (est. value:{' '}
                      <span className="font-semibold text-adv-teal">
                        €{estValue.toLocaleString('en-EU', { maximumFractionDigits: 0 })}
                      </span>{' '}
                      at €{hourlyRate}/hr).{' '}
                      API cost: <span className="font-medium">~€{apiCostEst.toFixed(2)}</span>.
                      {roiRatio && (
                        <>{' '}ROI: <span className="font-semibold text-adv-teal">{roiRatio}h saved per €1 spent</span>.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {/* UX-02: Quick Start card — most recent session + 3 recommended modules */}
      {continueWorkSessions.length === 0 && (
        <div className="mb-6 rounded-xl border border-adv-teal/20 bg-adv-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Rocket className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-white">Quick Start</h2>
          </div>
          <p className="mb-4 text-xs text-adv-gray">Start with one of these recommended workflows for FCP consultants:</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { to: '/module/gap-analysis', label: 'AMLR Gap Analysis', desc: 'Analyse your policies against AMLR 2024/1624', color: 'text-adv-teal', bg: 'bg-adv-teal/10' },
              { to: '/module/sanctions-advisory', label: 'Sanctions Advisory', desc: 'Screen entities and review sanctions exposure', color: 'text-adv-gold', bg: 'bg-adv-gold/10' },
              { to: '/module/risk-assessment', label: 'Risk Assessment', desc: 'Build or review your BWRA with AI assistance', color: 'text-adv-blue', bg: 'bg-adv-blue/10' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex items-start gap-3 rounded-lg border border-border bg-adv-dark-2 p-3 transition-colors hover:border-adv-teal/40 hover:bg-adv-teal-soft"
              >
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${item.bg} ${item.color}`}>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className={`text-xs font-semibold ${item.color}`}>{item.label}</p>
                  <p className="mt-0.5 text-xs text-adv-gray">{item.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Continue Your Work — recent sessions with output */}
      {continueWorkSessions.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-adv-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold text-adv-white">{t('dashboard.continueWork', 'Continue Your Work')}</h2>
            </div>
            <Link
              to="/my-work"
              className="flex items-center gap-1 text-xs text-adv-teal hover:underline"
            >
              {t('dashboard.viewAll', 'View All')} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {continueWorkSessions.map((session) => {
              const mod = MODULES.find((m) => m.id === session.module_id);
              const Icon = mod ? (iconMap[mod.icon] || Clock) : Clock;
              return (
                <Link
                  key={session.id}
                  to={`/module/${session.module_id}?session=${session.id}`}
                  className="group flex flex-col rounded-lg border border-border bg-adv-dark-2 p-3 transition-all hover:border-adv-teal/30 hover:shadow-md"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-adv-teal-dim text-adv-teal">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="truncate text-xs font-medium text-adv-off-white group-hover:text-adv-teal transition-colors">
                      {mod?.shortLabel || session.module_id}
                    </span>
                  </div>
                  <p className="mb-1.5 truncate text-xs text-adv-off-white">{session.title}</p>
                  {session.note && (
                    <p className="mb-1 truncate text-[11px] text-adv-gold/60 italic">&ldquo;{session.note}&rdquo;</p>
                  )}
                  <div className="mt-auto text-[11px] text-adv-gray">
                    {formatRelativeTime(session.updated_at || session.created_at)}
                    {formatSessionCost(session) && (
                      <span className="ml-1">{' · '}{formatSessionCost(session)?.split(' · ')[0]}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Morning Brief — Time Intelligence */}
      <MorningBrief />

      {/* Horizon Radar Widget */}
      <div className="mb-8">
        <RadarWidget />
      </div>

      {/* Pathfinder — Homepage Search Bar */}
      <PathfinderBar />

      {/* My Workflow Tasks */}
      <details className="mb-8 rounded-xl border border-border bg-adv-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-adv-white hover:text-adv-teal transition-colors">
          <span className="inline-flex items-center gap-2">
            <Users className="h-4 w-4 text-adv-teal" />
            {t('dashboard.myWorkflowTasks')}
          </span>
        </summary>
        <div className="border-t border-border px-5 pb-5 pt-4">
          <TeamWorkloadView />
        </div>
      </details>

      {/* My Custom Modules showcase */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Puzzle className="h-4 w-4 text-adv-teal" />
            <h2 className="text-sm font-semibold text-adv-teal uppercase tracking-wider">My Custom Modules</h2>
            {myCustomModules.length > 0 && (
              <span className="text-xs text-adv-gray">{myCustomModules.length}</span>
            )}
          </div>
          <Link to="/build-module" className="text-xs text-adv-teal hover:underline flex items-center gap-1">
            Build new <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {myCustomModules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-adv-teal/20 bg-adv-teal/5 px-5 py-5 text-center">
            <Puzzle className="h-8 w-8 text-adv-teal/30 mx-auto mb-2" />
            <p className="text-sm text-adv-gray">No custom modules yet.</p>
            <Link to="/build-module" className="mt-2 inline-flex items-center gap-1 text-xs text-adv-teal hover:underline">
              Build your first module <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-adv-card">
            {myCustomModules.map((mod) => (
              <Link
                key={mod.id}
                to={`/module/${mod.id}`}
                className="group shrink-0 w-52 rounded-xl border border-adv-teal/20 bg-adv-card p-4 transition-all hover:border-adv-teal/50 hover:shadow-lg hover:shadow-adv-teal/5"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border bg-adv-teal/10 text-adv-teal border-adv-teal/20">
                  <Puzzle className="h-4.5 w-4.5" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-adv-white group-hover:text-adv-teal transition-colors line-clamp-1">
                  {mod.name}
                </h3>
                <p className="text-xs text-adv-gray leading-relaxed line-clamp-2">{mod.description || 'Custom module'}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-adv-teal opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* AI-powered module finder — replaces static Starter Packs */}
      <SmartModuleSearch />

      {/* Favourites row — only shown when at least one module is starred */}
      {favoriteModules.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Star className="h-4 w-4 fill-adv-gold text-adv-gold" />
            <span className="text-xs font-semibold uppercase tracking-wider text-adv-gold">{t('dashboard.favourites')}</span>
            <span className="text-xs text-adv-gray">{favoriteModules.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favoriteModules.map((mod) => {
              const Icon = iconMap[mod.icon] || Search;
              const colorClass = colorMap[mod.color] || colorMap['adv-teal'];
              const area = AREAS.find((a) => a.moduleIds.includes(mod.id as never));
              return (
                <ModuleCard
                  key={mod.id}
                  mod={mod}
                  Icon={Icon}
                  colorClass={colorClass}
                  areaBadge={area?.shortLabel}
                  areaBadgeColor={area ? areaHeaderColor[area.id] : undefined}
                  isFavorite
                  onToggleFavorite={toggleFavorite}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Module Search */}
      <div className="mb-6 relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray pointer-events-none" />
        <input
          type="text"
          value={moduleSearch}
          onChange={(e) => setModuleSearch(e.target.value)}
          placeholder={t('dashboard.searchPlaceholder')}
          className="w-full rounded-xl border border-border bg-adv-card py-2.5 pl-9 pr-9 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-1 focus:ring-adv-teal"
        />
        {moduleSearch && (
          <button
            onClick={() => setModuleSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Module Grid — grouped by area (no search) or flat filtered list (searching) */}
      {filteredModules !== null ? (
        /* Search results — flat grid with area badge */
        filteredModules.length === 0 ? (
          <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
            <p className="text-sm text-adv-gray">{t('dashboard.noModulesMatch')} &ldquo;{moduleSearch}&rdquo;</p>
            <button onClick={() => setModuleSearch('')} className="mt-2 text-xs text-adv-teal hover:underline">{t('dashboard.clearSearch')}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredModules.map((mod) => {
              const Icon = iconMap[mod.icon] || Search;
              const colorClass = colorMap[mod.color] || colorMap['adv-teal'];
              const area = AREAS.find((a) => a.moduleIds.includes(mod.id as never));
              return (
                <ModuleCard
                  key={mod.id}
                  mod={mod}
                  Icon={Icon}
                  colorClass={colorClass}
                  areaBadge={area?.shortLabel}
                  areaBadgeColor={area ? areaHeaderColor[area.id] : undefined}
                  isFavorite={favorites.has(mod.id)}
                  onToggleFavorite={toggleFavorite}
                />
              );
            })}
          </div>
        )
      ) : (
        /* Grouped by area */
        <div className="space-y-8">
          {AREAS.map((area) => {
            const areaModules = area.moduleIds
              .map((id) => MODULES.find((m) => m.id === id))
              .filter(Boolean) as typeof MODULES;
            if (areaModules.length === 0) return null;
            return (
              <div key={area.id}>
                <div className={`mb-3 flex items-center gap-2 ${areaHeaderColor[area.id] ?? 'text-adv-gray'}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider">{area.label}</span>
                  <span className="text-xs opacity-60">{areaModules.length} {t('dashboard.modules')}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {areaModules.map((mod) => {
                    const Icon = iconMap[mod.icon] || Search;
                    const colorClass = colorMap[mod.color] || colorMap['adv-teal'];
                    return (
                      <ModuleCard
                        key={mod.id}
                        mod={mod}
                        Icon={Icon}
                        colorClass={colorClass}
                        isFavorite={favorites.has(mod.id)}
                        onToggleFavorite={toggleFavorite}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Community Modules */}
      {communityModules.length > 0 && (
        <div className="mt-10">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-adv-gold" />
            <h2 className="text-sm font-semibold text-adv-gold uppercase tracking-wider">{t('dashboard.communityModules')}</h2>
            <span className="text-xs text-adv-gray">{communityModules.length}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {communityModules.map((mod) => (
              <Link
                key={mod.id}
                to={`/module/${mod.id}`}
                className="group rounded-xl border border-border bg-adv-card p-5 transition-all hover:border-adv-gold/30 hover:shadow-lg hover:shadow-adv-gold/5"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-adv-gold/10 text-adv-gold border-adv-gold/20">
                    <Puzzle className="h-5 w-5" />
                  </div>
                  <span className="rounded-full bg-adv-gold/10 border border-adv-gold/30 px-2 py-0.5 text-xs font-medium text-adv-gold">
                    {t('dashboard.community')}
                  </span>
                </div>
                <h3 className="mb-2 text-sm font-semibold text-adv-white group-hover:text-adv-gold transition-colors">
                  {mod.name}
                </h3>
                <p className="mb-4 text-xs leading-relaxed text-adv-gray">{mod.description || t('dashboard.noDescription')}</p>
                <div className="flex items-center gap-1 text-xs text-adv-gold opacity-0 transition-opacity group-hover:opacity-100">
                  {t('dashboard.openModule')} <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* My Work link — fallback if no "Continue Your Work" card */}
      {continueWorkSessions.length === 0 && recentSessions.length > 0 && (
        <div className="mt-10 text-center">
          <Link to="/my-work" className="inline-flex items-center gap-2 text-sm text-adv-teal hover:underline">
            {t('dashboard.viewAllSessions', 'View all sessions')} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Module Card ───────────────────────────────────────────────

function ModuleCard({
  mod,
  Icon,
  colorClass,
  areaBadge,
  areaBadgeColor,
  isFavorite,
  onToggleFavorite,
}: {
  mod: (typeof MODULES)[number];
  Icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  areaBadge?: string;
  areaBadgeColor?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (id: string) => void;
}) {
  const { t } = useTranslation();

  function handleStar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onToggleFavorite?.(mod.id);
  }

  return (
    <Link
      to={`/module/${mod.id}`}
      className="group relative rounded-xl border border-border bg-adv-card p-5 transition-all hover:border-adv-teal/30 hover:shadow-lg hover:shadow-adv-teal/5"
    >
      {/* Star button — visible on hover, always visible if favourited */}
      {onToggleFavorite && (
        <button
          onClick={handleStar}
          title={isFavorite ? t('dashboard.removeFromFavourites') : t('dashboard.addToFavourites')}
          className={`absolute right-3 top-3 rounded p-1 transition-all ${
            isFavorite
              ? 'text-adv-gold opacity-100'
              : 'text-adv-gray opacity-0 group-hover:opacity-100 hover:text-adv-gold'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-adv-gold' : ''}`} />
        </button>
      )}

      <div className="mb-4 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        {areaBadge && (
          <span className={`pr-6 text-xs font-medium uppercase tracking-wider ${areaBadgeColor}`}>
            {areaBadge}
          </span>
        )}
      </div>
      <h3 className="mb-2 text-sm font-semibold text-adv-white group-hover:text-adv-teal transition-colors">
        {mod.label}
      </h3>
      <p className="mb-4 text-xs leading-relaxed text-adv-gray">{mod.description}</p>
      <div className="flex items-center gap-1 text-xs text-adv-teal opacity-0 transition-opacity group-hover:opacity-100">
        {t('dashboard.openModule')} <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}
