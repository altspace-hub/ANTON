import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Satellite, Plus, Search, RefreshCw, X, ExternalLink, AlertCircle,
  TrendingUp, Filter, Cpu, DollarSign, Globe, Zap, Layers, Settings,
  ChevronDown, ChevronUp, FileText, Trash2, Pencil, Database, CheckCircle,
  Square, Star, Radio,
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────

interface RadarSource {
  id: string;
  display_name: string;
  url: string;
  source_type: string;
  is_active: number;
  areas: string;
  keywords: string;
  category: string;
}

interface RadarItem {
  id: string;
  source_id: string;
  source_name: string;
  title: string;
  summary: string | null;
  ai_summary: string | null;
  url: string | null;
  published_at: string | null;
  item_type: string;
  status: string;
  relevance_score: number;
  urgency_score: number;
  tags: string;
  category: string;
  subcategory: string | null;
}

interface ScanResult {
  sourcesScanned: number;
  newItemsFound: number;
  itemsScored: number;
  errors: Array<{ sourceId: string; error: string }>;
}

interface ScanStatus {
  scanInProgress: boolean;
  currentSource?: { name: string } | null;
  sourcesCompleted?: number;
  sourcesTotal?: number;
  lastScanTime?: string | null;
  lastScanResult?: ScanResult | null;
}

// ── Item type configuration ────────────────────────────────────────────────

const ITEM_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertCircle }> = {
  technology:    { label: 'Technology',     color: 'bg-adv-teal/20 text-adv-teal border-adv-teal/30',    icon: Cpu },
  sector:        { label: 'Sector',         color: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',    icon: Layers },
  company_signal:{ label: 'Company Signal', color: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',    icon: TrendingUp },
  funding_round: { label: 'Funding Round',  color: 'bg-adv-green/20 text-adv-green border-adv-green/30', icon: DollarSign },
  exit_event:    { label: 'Exit Event',     color: 'bg-adv-red/20 text-adv-red border-adv-red/30',       icon: CheckCircle },
  macro_trend:   { label: 'Macro Trend',    color: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30',    icon: Globe },
  patent:        { label: 'Patent',         color: 'bg-adv-teal/20 text-adv-teal border-adv-teal/30',    icon: FileText },
  research_paper:{ label: 'Research',       color: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',    icon: FileText },
  // Fallback types for items classified by the regulatory classifier
  publication:   { label: 'General Signal', color: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30',    icon: Zap },
  report:        { label: 'Report / Study', color: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',    icon: FileText },
  regulation:    { label: 'Regulation',     color: 'bg-adv-red/20 text-adv-red border-adv-red/30',       icon: FileText },
  guideline:     { label: 'Guideline',      color: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',    icon: FileText },
};

const DEFAULT_TYPE_CONFIG = { label: 'Signal', color: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30', icon: Zap };

function getAuthHdr() { return getAuthHeader(); }

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function InnovationRadarPage() {
  const navigate = useNavigate();

  // Data
  const [items, setItems] = useState<RadarItem[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);

  // UI state
  const [mainTab, setMainTab] = useState<'items' | 'sources'>('items');
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'high' | 'funded'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ currentSource: string; completed: number; total: number } | null>(null);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [showScanBanner, setShowScanBanner] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [radarSettings, setRadarSettings] = useState({ autoScanEnabled: false, autoScanIntervalHours: 24 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [scanScheduleType, setScanScheduleType] = useState<'interval' | 'cron'>('interval');
  const [cronExpression, setCronExpression] = useState('');
  const [cronError, setCronError] = useState('');
  const [scoringCriteria, setScoringCriteria] = useState('');
  const [scoringCriteriaEdit, setScoringCriteriaEdit] = useState('');
  const [savingCriteria, setSavingCriteria] = useState(false);

  const DEFAULT_CRITERIA_PLACEHOLDER = 'Score this item for relevance to a private equity or venture capital investor. High relevance: funding rounds in target sectors, technology breakthroughs enabling new business models, exit events (IPOs/acquisitions) signalling market maturity, macro trends shifting sector valuations. Low relevance: unrelated regulatory filings, routine press releases, or items with no investment signal.';

  // Source form
  const [showAddSource, setShowAddSource] = useState(false);
  const [editingSource, setEditingSource] = useState<RadarSource | null>(null);
  const [sourceForm, setSourceForm] = useState({
    display_name: '', url: '', source_type: 'rss', keywords: '', is_active: true,
  });

  // ── Data fetching ────────────────────────────────────────────────────────

  async function fetchData() {
    try {
      const [itemsRes, sourcesRes] = await Promise.all([
        fetch('/api/radar/items?limit=150&category=pe-vc', { headers: getAuthHdr() }),
        fetch('/api/radar/sources?active=false', { headers: getAuthHdr() }),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json() as RadarItem[]);
      if (sourcesRes.ok) {
        const all = await sourcesRes.json() as RadarSource[];
        setSources(all.filter(s => s.category === 'pe-vc' || s.category === 'pe_vc'));
      }
    } catch (err) {
      console.error('[innovation-radar] fetch error:', err);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/radar/settings', { headers: getAuthHdr() });
      if (res.ok) {
        const data = await res.json() as { autoScanEnabled?: boolean; autoScanIntervalHours?: number; cronExpression?: string; pevcScoringCriteria?: string };
        setRadarSettings({
          autoScanEnabled: !!data.autoScanEnabled,
          autoScanIntervalHours: data.autoScanIntervalHours ?? 24,
        });
        if (data.cronExpression) {
          setCronExpression(data.cronExpression);
          setScanScheduleType('cron');
        }
        const criteria = data.pevcScoringCriteria ?? '';
        setScoringCriteria(criteria);
        setScoringCriteriaEdit(criteria);
      }
    } catch { /* non-fatal */ }
  }

  async function saveScoringCriteria(value: string) {
    setSavingCriteria(true);
    try {
      await fetch('/api/radar/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHdr() },
        body: JSON.stringify({ pevcScoringCriteria: value }),
      });
      setScoringCriteria(value);
    } catch { /* non-fatal */ } finally {
      setSavingCriteria(false);
    }
  }

  async function saveSettings(partial: Partial<{ autoScanEnabled: boolean; autoScanIntervalHours: number; cronExpression: string }>) {
    if (partial.cronExpression !== undefined) {
      const parts = partial.cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) { setCronError('Cron expression must have 5 parts: min hour day month weekday'); return; }
      setCronError('');
    }
    setSettingsLoading(true);
    try {
      const next = { ...radarSettings, ...partial };
      if (scanScheduleType === 'cron' && cronExpression) {
        (next as Record<string, unknown>).cronExpression = cronExpression;
      }
      await fetch('/api/radar/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHdr() },
        body: JSON.stringify(next),
      });
      setRadarSettings(prev => ({ ...prev, ...partial }));
    } catch { /* non-fatal */ } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => { fetchData(); fetchSettings(); }, []);

  // ── Scanning ─────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/radar/scan-status', { headers: getAuthHdr() });
        if (!res.ok) return;
        const status = await res.json() as ScanStatus;

        if (status.scanInProgress) {
          setScanProgress({
            currentSource: status.currentSource?.name ?? 'Scanning…',
            completed: status.sourcesCompleted ?? 0,
            total: status.sourcesTotal ?? 0,
          });
        } else {
          setIsScanning(false);
          setScanProgress(null);
          if (status.lastScanTime) setLastScanTime(status.lastScanTime);
          if (status.lastScanResult) {
            setLastScanResult(status.lastScanResult);
            setShowScanBanner(true);
            fetchData();
            // Auto-dismiss after 10s
            setTimeout(() => setShowScanBanner(false), 10000);
          }
          stopPolling();
        }
      } catch { /* non-fatal */ }
    }, 2000);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function handleScan() {
    setIsScanning(true);
    setShowScanBanner(false);
    setScanProgress(null);
    try {
      await fetch('/api/radar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHdr() },
        body: JSON.stringify({ category: 'pe-vc' }),
      });
      startPolling();
    } catch {
      setIsScanning(false);
    }
  }

  async function handleStopScan() {
    try {
      await fetch('/api/radar/stop', { method: 'POST', headers: getAuthHdr() });
      setIsScanning(false);
      setScanProgress(null);
      stopPolling();
    } catch { /* non-fatal */ }
  }

  // ── Item actions ─────────────────────────────────────────────────────────

  async function dismissItem(itemId: string) {
    await fetch(`/api/radar/items/${itemId}/dismiss`, { method: 'POST', headers: getAuthHdr() });
    setItems(prev => prev.filter(i => i.id !== itemId));
  }

  async function markReviewed(itemId: string) {
    await fetch(`/api/radar/items/${itemId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHdr() },
      body: JSON.stringify({ status: 'reviewed' }),
    });
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'reviewed' } : i));
  }

  function toggleExpand(id: string) {
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Source management ─────────────────────────────────────────────────────

  function openAddSource() {
    setEditingSource(null);
    setSourceForm({ display_name: '', url: '', source_type: 'rss', keywords: '', is_active: true });
    setShowAddSource(true);
  }

  function openEditSource(src: RadarSource) {
    setEditingSource(src);
    let kw = '';
    try { kw = JSON.parse(src.keywords).join(', '); } catch { kw = src.keywords; }
    setSourceForm({ display_name: src.display_name, url: src.url, source_type: src.source_type, keywords: kw, is_active: !!src.is_active });
    setShowAddSource(true);
  }

  async function handleSaveSource() {
    const payload = {
      display_name: sourceForm.display_name,
      url: sourceForm.url,
      source_type: sourceForm.source_type,
      keywords: JSON.stringify(sourceForm.keywords.split(',').map(k => k.trim()).filter(Boolean)),
      areas: JSON.stringify(['pe-vc']),
      category: 'pe-vc',
      is_active: sourceForm.is_active ? 1 : 0,
    };
    const url = editingSource ? `/api/radar/sources/${editingSource.id}` : '/api/radar/sources';
    const method = editingSource ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...getAuthHdr() }, body: JSON.stringify(payload) });
    setShowAddSource(false);
    setEditingSource(null);
    fetchData();
  }

  async function deleteSource(sourceId: string) {
    if (!confirm('Delete this source?')) return;
    await fetch(`/api/radar/sources/${sourceId}`, { method: 'DELETE', headers: getAuthHdr() });
    fetchData();
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const nonDismissed = items.filter(i => i.status !== 'dismissed');

  const filteredItems = nonDismissed.filter(item => {
    // Filter tab
    if (filterTab === 'new' && item.status !== 'new') return false;
    if (filterTab === 'high' && item.relevance_score < 0.65) return false;
    if (filterTab === 'funded' && item.item_type !== 'funding_round') return false;
    // Type dropdown
    if (typeFilter !== 'all' && item.item_type !== typeFilter) return false;
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const text = `${item.title} ${item.ai_summary ?? ''} ${item.summary ?? ''}`.toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  // Stats
  const newCount = nonDismissed.filter(i => i.status === 'new').length;
  const highCount = nonDismissed.filter(i => i.relevance_score >= 0.65).length;
  const fundingCount = nonDismissed.filter(i => i.item_type === 'funding_round').length;
  const activeSources = sources.filter(s => s.is_active).length;

  const FILTER_TABS = [
    { id: 'all' as const,    label: 'All Signals',    count: nonDismissed.length },
    { id: 'new' as const,    label: 'New',            count: newCount },
    { id: 'high' as const,   label: 'High Signal',    count: highCount },
    { id: 'funded' as const, label: 'Funding Rounds', count: fundingCount },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-adv-blue/20 p-3 border border-adv-blue/30">
            <Satellite className="h-6 w-6 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-adv-white">Innovation & Market Radar</h1>
            <p className="text-sm text-adv-gray mt-0.5">
              Track funding rounds, technology signals, sector developments, and exit activity
              {lastScanTime && (
                <span className="ml-2 text-adv-gray/60">· Last scanned {formatRelativeTime(lastScanTime)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowSettings(s => !s)}
            className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-gray transition-colors hover:bg-adv-dark hover:text-adv-off-white"
            title="Schedule & settings"
          >
            <Settings className="h-4 w-4" />
            Schedule
          </button>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 rounded-lg bg-adv-blue px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-adv-blue/80 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning…' : 'Scan Now'}
          </button>
          {isScanning && (
            <button
              onClick={handleStopScan}
              className="flex items-center gap-2 rounded-lg border border-adv-red/50 bg-adv-red/10 px-3 py-2 text-sm font-medium text-adv-red transition-colors hover:bg-adv-red/20"
            >
              <Square className="h-3.5 w-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Settings / Schedule panel */}
      {showSettings && (
        <div className="mb-4 rounded-xl border border-border bg-adv-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-adv-off-white flex items-center gap-2">
              <Settings className="h-4 w-4 text-adv-gray" />
              Scan Settings
            </h3>
            <button onClick={() => setShowSettings(false)} className="text-adv-gray hover:text-adv-off-white">
              <ChevronUp className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-6 flex-wrap">
            {/* Auto-scan toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm text-adv-gray">Auto-scan</span>
              <button
                onClick={() => saveSettings({ autoScanEnabled: !radarSettings.autoScanEnabled })}
                disabled={settingsLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${radarSettings.autoScanEnabled ? 'bg-adv-blue' : 'bg-adv-gray-med/40'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${radarSettings.autoScanEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>

            {/* Interval buttons */}
            {radarSettings.autoScanEnabled && scanScheduleType === 'interval' && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-adv-gray">Scan every:</span>
                {[6, 12, 24, 48, 168].map(h => (
                  <button
                    key={h}
                    onClick={() => saveSettings({ autoScanIntervalHours: h })}
                    disabled={settingsLoading}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      radarSettings.autoScanIntervalHours === h
                        ? 'bg-adv-blue text-white'
                        : 'border border-border bg-adv-dark text-adv-gray hover:text-adv-off-white'
                    }`}
                  >
                    {h < 168 ? `${h}h` : 'Weekly'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Schedule type toggle + cron */}
          {radarSettings.autoScanEnabled && (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-medium text-adv-gray">Schedule type</p>
              <div className="flex rounded-lg overflow-hidden border border-border w-fit">
                <button
                  onClick={() => { setScanScheduleType('interval'); setCronError(''); }}
                  className={`px-4 py-2 text-sm transition-colors ${scanScheduleType === 'interval' ? 'bg-adv-blue text-white' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}
                >
                  Every N hours
                </button>
                <button
                  onClick={() => setScanScheduleType('cron')}
                  className={`px-4 py-2 text-sm transition-colors ${scanScheduleType === 'cron' ? 'bg-adv-blue text-white' : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}
                >
                  Specific time
                </button>
              </div>

              {scanScheduleType === 'cron' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Daily 6am',    value: '0 6 * * *' },
                      { label: 'Weekdays 8am', value: '0 8 * * 1-5' },
                      { label: 'Mon 7am',      value: '0 7 * * 1' },
                    ].map(preset => (
                      <button
                        key={preset.value}
                        onClick={() => { setCronExpression(preset.value); setCronError(''); }}
                        className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                          cronExpression === preset.value
                            ? 'border-adv-blue bg-adv-blue/10 text-adv-blue'
                            : 'border-border text-adv-gray hover:border-adv-gray-med'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={cronExpression}
                    onChange={e => { setCronExpression(e.target.value); setCronError(''); }}
                    placeholder="0 6 * * *  (min hour day month weekday)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-adv-dark text-adv-off-white font-mono placeholder:text-adv-gray focus:border-adv-blue focus:outline-none"
                  />
                  {cronError && <p className="text-xs text-adv-red">{cronError}</p>}
                  <button
                    onClick={() => saveSettings({ cronExpression })}
                    disabled={settingsLoading || !cronExpression}
                    className="rounded-lg bg-adv-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-adv-blue/80 disabled:opacity-50"
                  >
                    {settingsLoading ? 'Saving…' : 'Save schedule'}
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-adv-gray">
            {radarSettings.autoScanEnabled
              ? scanScheduleType === 'cron' && cronExpression
                ? `Scheduled cron: ${cronExpression}`
                : `Automatically scans all active PE/VC sources every ${radarSettings.autoScanIntervalHours < 168 ? `${radarSettings.autoScanIntervalHours} hours` : 'week'}.`
              : 'Auto-scan is disabled. Click "Scan Now" to scan manually.'}
          </p>

          {/* AI Scoring Criteria */}
          <div className="mt-5 pt-4 border-t border-border">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <p className="text-sm font-medium text-adv-off-white">AI Scoring Criteria</p>
                <p className="text-xs text-adv-gray mt-0.5">
                  Claude Haiku uses this brief to score and prioritise signals.
                  Customise it to match your fund thesis — sector focus, geography, stage, ticket size.
                </p>
              </div>
              {scoringCriteria && (
                <button
                  onClick={() => { setScoringCriteriaEdit(''); saveScoringCriteria(''); }}
                  className="ml-4 shrink-0 text-xs text-adv-gray hover:text-adv-off-white underline underline-offset-2"
                >
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              rows={4}
              value={scoringCriteriaEdit}
              onChange={e => setScoringCriteriaEdit(e.target.value)}
              placeholder={DEFAULT_CRITERIA_PLACEHOLDER}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-adv-dark text-adv-off-white placeholder:text-adv-gray/50 focus:border-adv-blue focus:outline-none resize-none mt-2"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-adv-gray">
                {scoringCriteria ? 'Custom criteria active — overrides built-in default.' : 'Using built-in default (fund-agnostic PE/VC scoring).'}
              </p>
              <button
                onClick={() => saveScoringCriteria(scoringCriteriaEdit)}
                disabled={savingCriteria || scoringCriteriaEdit === scoringCriteria}
                className="rounded-lg bg-adv-blue px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-adv-blue/80 disabled:opacity-50"
              >
                {savingCriteria ? 'Saving…' : 'Save criteria'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live scan progress banner */}
      {isScanning && scanProgress && (
        <div className="mb-4 rounded-xl border border-adv-blue/30 bg-adv-blue/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-adv-blue animate-spin" />
              <span className="text-sm font-medium text-adv-white">Scanning…</span>
              <span className="text-xs text-adv-gray">{scanProgress.currentSource}</span>
            </div>
            {scanProgress.total > 0 && (
              <span className="text-xs text-adv-blue font-medium">
                {scanProgress.completed} / {scanProgress.total}
              </span>
            )}
          </div>
          {scanProgress.total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-adv-dark overflow-hidden">
              <div
                className="h-full rounded-full bg-adv-blue transition-all duration-500"
                style={{ width: `${Math.round((scanProgress.completed / scanProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Scanning without progress yet */}
      {isScanning && !scanProgress && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-adv-blue/30 bg-adv-blue/10 px-4 py-3 text-sm">
          <RefreshCw className="h-4 w-4 text-adv-blue animate-spin" />
          <span className="text-adv-blue">Connecting to sources…</span>
        </div>
      )}

      {/* Scan result banner */}
      {showScanBanner && lastScanResult && !isScanning && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-adv-teal/30 bg-adv-teal/10 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-adv-teal" />
            <span className="text-adv-teal font-medium">Scan complete</span>
            <span className="text-adv-gray">
              — {lastScanResult.newItemsFound} new signal{lastScanResult.newItemsFound !== 1 ? 's' : ''} across {lastScanResult.sourcesScanned} source{lastScanResult.sourcesScanned !== 1 ? 's' : ''}
              {lastScanResult.itemsScored > 0 && `, ${lastScanResult.itemsScored} scored`}
            </span>
          </div>
          <button onClick={() => setShowScanBanner(false)} className="text-adv-gray hover:text-adv-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'New Signals',      value: newCount,      icon: Star,     color: 'text-adv-gold' },
          { label: 'High Priority',    value: highCount,     icon: AlertCircle, color: 'text-adv-red' },
          { label: 'Funding Rounds',   value: fundingCount,  icon: DollarSign, color: 'text-adv-green' },
          { label: 'Active Sources',   value: activeSources, icon: Database, color: 'text-adv-blue' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-adv-card bg-adv-card/50 px-4 py-3 flex items-center gap-3">
            <Icon className={`h-5 w-5 shrink-0 ${color}`} />
            <div>
              <p className="text-xl font-bold text-adv-white leading-none">{value}</p>
              <p className="text-xs text-adv-gray mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-adv-card p-1 w-fit">
        <button
          onClick={() => setMainTab('items')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === 'items' ? 'bg-adv-blue text-white' : 'text-adv-gray hover:text-adv-white'}`}
        >
          Signals ({nonDismissed.length})
        </button>
        <button
          onClick={() => setMainTab('sources')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === 'sources' ? 'bg-adv-blue text-white' : 'text-adv-gray hover:text-adv-white'}`}
        >
          Sources ({sources.length})
        </button>
      </div>

      {/* ── Items tab ─────────────────────────────────────────────────────────── */}
      {mainTab === 'items' && (
        <div className="space-y-4">

          {/* Filter tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 flex-wrap">
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterTab === tab.id
                      ? 'bg-adv-blue text-white'
                      : 'bg-adv-card text-adv-gray hover:text-adv-white'
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    filterTab === tab.id ? 'bg-white/20 text-white' : 'bg-adv-dark text-adv-gray'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search + type filter */}
            <div className="flex gap-2 ml-auto flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-adv-gray" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search signals…"
                  className="rounded-lg bg-adv-card border border-adv-card pl-8 pr-3 py-1.5 text-xs text-adv-off-white placeholder-adv-gray focus:border-adv-blue focus:outline-none w-48"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-adv-gray hover:text-adv-white">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="rounded-lg bg-adv-card border border-adv-card px-3 py-1.5 text-xs text-adv-off-white focus:border-adv-blue focus:outline-none"
              >
                <option value="all">All types</option>
                {Object.entries(ITEM_TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Items list */}
          {filteredItems.length === 0 ? (
            <div className="rounded-xl border border-adv-card bg-adv-card/50 p-12 text-center">
              <Satellite className="mx-auto h-12 w-12 text-adv-gray/40 mb-3" />
              {nonDismissed.length === 0 ? (
                <p className="text-adv-gray text-sm">No signals yet. Click "Scan Now" to fetch the latest investment intelligence.</p>
              ) : (
                <p className="text-adv-gray text-sm">
                  No signals match{searchQuery ? ` "${searchQuery}"` : ''} in this filter.{' '}
                  <button onClick={() => { setFilterTab('all'); setTypeFilter('all'); setSearchQuery(''); }} className="text-adv-blue hover:underline">
                    Clear filters
                  </button>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map(item => {
                const typeCfg = ITEM_TYPE_CONFIG[item.item_type] ?? DEFAULT_TYPE_CONFIG;
                const TypeIcon = typeCfg.icon;
                const isExpanded = expandedItems.has(item.id);
                const summary = item.ai_summary || item.summary;
                const isNew = item.status === 'new';

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border bg-adv-card/60 p-4 transition-colors hover:border-adv-blue/30 ${isNew ? 'border-adv-blue/20' : 'border-adv-card'}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Relevance bar (left edge) */}
                      <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                        <div className="h-10 w-1.5 rounded-full bg-adv-dark overflow-hidden">
                          <div
                            className={`w-full rounded-full transition-all ${item.relevance_score >= 75 ? 'bg-adv-red' : item.relevance_score >= 50 ? 'bg-adv-gold' : 'bg-adv-gray/40'}`}
                            style={{ height: `${Math.round(item.relevance_score)}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-adv-gray/60">{Math.round(item.relevance_score)}%</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Meta row */}
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {isNew && (
                            <span className="rounded-full bg-adv-blue/20 border border-adv-blue/30 px-1.5 py-0.5 text-[10px] font-semibold text-adv-blue uppercase tracking-wide">
                              New
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${typeCfg.color}`}>
                            <TypeIcon className="h-3 w-3" />
                            {typeCfg.label}
                          </span>
                          <span className="text-xs text-adv-gray">
                            {item.source_name}
                            {item.published_at && <> · {formatRelativeTime(item.published_at)}</>}
                          </span>
                        </div>

                        {/* Title */}
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-adv-white hover:text-adv-blue leading-snug block"
                          >
                            {item.title}
                          </a>
                        ) : (
                          <h3 className="text-sm font-semibold text-adv-white leading-snug">{item.title}</h3>
                        )}

                        {/* Summary */}
                        {summary && (
                          <div className="mt-1">
                            <p className={`text-xs text-adv-gray leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                              {summary}
                            </p>
                            {summary.length > 180 && (
                              <button
                                onClick={() => toggleExpand(item.id)}
                                className="mt-0.5 text-xs text-adv-blue hover:underline flex items-center gap-0.5"
                              >
                                {isExpanded
                                  ? <><ChevronUp className="h-3 w-3" /> Less</>
                                  : <><ChevronDown className="h-3 w-3" /> More</>}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => navigate('/module/deal-screening', { state: { prefill: item.title } })}
                            className="flex items-center gap-1 rounded-md bg-adv-blue/20 hover:bg-adv-blue/30 border border-adv-blue/30 px-2.5 py-1 text-xs text-adv-blue transition-colors"
                          >
                            <Filter className="h-3 w-3" />
                            Screen Deal
                          </button>
                          <button
                            onClick={() => navigate('/module/due-diligence', { state: { prefill: item.title } })}
                            className="flex items-center gap-1 rounded-md bg-adv-teal/10 hover:bg-adv-teal/20 border border-adv-teal/20 px-2.5 py-1 text-xs text-adv-teal transition-colors"
                          >
                            <Database className="h-3 w-3" />
                            Start Diligence
                          </button>
                          {item.url && (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-md bg-adv-card hover:bg-adv-card/80 border border-adv-card/50 px-2.5 py-1 text-xs text-adv-gray hover:text-adv-white transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Source
                            </a>
                          )}
                          {isNew && (
                            <button
                              onClick={() => markReviewed(item.id)}
                              className="flex items-center gap-1 rounded-md bg-adv-card hover:bg-adv-card/80 border border-adv-card/50 px-2.5 py-1 text-xs text-adv-gray hover:text-adv-white transition-colors"
                            >
                              <CheckCircle className="h-3 w-3" />
                              Mark Reviewed
                            </button>
                          )}
                          <button
                            onClick={() => dismissItem(item.id)}
                            className="flex items-center gap-1 rounded-md bg-transparent hover:bg-adv-red/10 border border-transparent hover:border-adv-red/20 px-2.5 py-1 text-xs text-adv-gray hover:text-adv-red transition-colors ml-auto"
                          >
                            <X className="h-3 w-3" />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Sources tab ───────────────────────────────────────────────────────── */}
      {mainTab === 'sources' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-adv-gray">Investment intelligence sources tracked by this radar</p>
            <button
              onClick={openAddSource}
              className="flex items-center gap-1.5 rounded-lg bg-adv-blue hover:bg-adv-blue/80 px-3 py-1.5 text-sm font-medium text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Source
            </button>
          </div>

          {/* Source form (inline) */}
          {showAddSource && (
            <div className="rounded-xl border border-adv-blue/30 bg-adv-card p-4 space-y-3">
              <h3 className="text-sm font-semibold text-adv-white">
                {editingSource ? 'Edit Source' : 'Add Intelligence Source'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-adv-gray mb-1 block">Source name *</label>
                  <input
                    value={sourceForm.display_name}
                    onChange={e => setSourceForm(p => ({ ...p, display_name: e.target.value }))}
                    placeholder="e.g., Nordic VC News"
                    className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-blue focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-adv-gray mb-1 block">Type</label>
                  <select
                    value={sourceForm.source_type}
                    onChange={e => setSourceForm(p => ({ ...p, source_type: e.target.value }))}
                    className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-blue focus:outline-none"
                  >
                    <option value="rss">RSS Feed</option>
                    <option value="web_page">Web Page</option>
                    <option value="api">API</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-adv-gray mb-1 block">URL *</label>
                <input
                  value={sourceForm.url}
                  onChange={e => setSourceForm(p => ({ ...p, url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-blue focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-adv-gray mb-1 block">Keywords (comma-separated)</label>
                <input
                  value={sourceForm.keywords}
                  onChange={e => setSourceForm(p => ({ ...p, keywords: e.target.value }))}
                  placeholder="funding, Series A, startup, acquisition, PE, buyout"
                  className="w-full rounded-lg bg-adv-dark border border-adv-card px-3 py-2 text-sm text-adv-off-white focus:border-adv-blue focus:outline-none"
                />
              </div>
              {editingSource && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <div
                    onClick={() => setSourceForm(p => ({ ...p, is_active: !p.is_active }))}
                    className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${sourceForm.is_active ? 'bg-adv-green' : 'bg-adv-gray/30'}`}
                  >
                    <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${sourceForm.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm text-adv-off-white">{sourceForm.is_active ? 'Active' : 'Inactive'}</span>
                </label>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAddSource(false); setEditingSource(null); }}
                  className="px-3 py-1.5 rounded-lg bg-adv-card text-sm text-adv-gray hover:text-adv-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSource}
                  disabled={!sourceForm.display_name || !sourceForm.url}
                  className="px-4 py-1.5 rounded-lg bg-adv-blue hover:bg-adv-blue/80 disabled:opacity-50 text-sm text-white"
                >
                  Save Source
                </button>
              </div>
            </div>
          )}

          {/* Sources table */}
          {sources.length === 0 ? (
            <div className="rounded-xl border border-adv-card bg-adv-card/50 p-8 text-center">
              <p className="text-adv-gray text-sm">No PE/VC sources configured yet. Add sources to start tracking investment signals.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-adv-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-adv-card bg-adv-card/80 text-left">
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-adv-gray">Source</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-adv-gray hidden sm:table-cell">Type</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-adv-gray hidden md:table-cell">URL</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-adv-gray">Status</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-adv-gray text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-adv-card">
                  {sources.map(src => (
                    <tr key={src.id} className="hover:bg-adv-card/40 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-adv-white">{src.display_name}</span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className="rounded bg-adv-dark border border-adv-card px-2 py-0.5 text-xs text-adv-gray">{src.source_type}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-adv-gray/70 hover:text-adv-blue truncate max-w-xs block"
                        >
                          {src.url}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${src.is_active ? 'bg-adv-green/10 text-adv-green' : 'bg-adv-gray/10 text-adv-gray'}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${src.is_active ? 'bg-adv-green' : 'bg-adv-gray'}`} />
                          {src.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => openEditSource(src)}
                            className="p-1.5 rounded text-adv-gray hover:text-adv-white hover:bg-adv-dark transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteSource(src.id)}
                            className="p-1.5 rounded text-adv-gray hover:text-adv-red hover:bg-adv-red/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
