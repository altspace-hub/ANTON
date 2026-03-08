import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '@/lib/api';
import { Radio, Plus, Search, Filter, ExternalLink, Check, X, AlertCircle, FileText, Gavel, BookOpen, MessageSquare, FileCheck, RefreshCw, Square, Settings, ChevronDown, ChevronUp, Shield, Users, Cpu, Landmark, AlertTriangle, TrendingUp, Layers, Pencil, Trash2, Database } from 'lucide-react';

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
  source_type: string;
  title: string;
  summary: string | null;
  ai_summary: string | null;
  url: string | null;
  published_at: string | null;
  item_type: string;
  status: string;
  relevance_score: number;
  urgency_score: number;
  impact_areas: string;
  tags: string;
  category: string;
  subcategory: string | null;
}

interface CategoryCount {
  category: string;
  count: number;
}

interface RadarSummary {
  newItems: number;
  highRelevance: number;
  consultationsOpen: number;
  recentHighRelevance: RadarItem[];
  categoryCounts: CategoryCount[];
}

const RADAR_CATEGORIES: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  regulatory: { label: 'Regulatory', icon: Shield, color: '#3498DB' },
  competitors: { label: 'Competitors', icon: Users, color: '#E74C3C' },
  products: { label: 'Products', icon: Cpu, color: '#27AE60' },
  government: { label: 'Government', icon: Landmark, color: '#F5A623' },
  threats: { label: 'Threats', icon: AlertTriangle, color: '#E74C3C' },
  trends: { label: 'Trends', icon: TrendingUp, color: '#2DD4A8' },
  misc: { label: 'Other', icon: Layers, color: '#B0B0B0' },
};

interface ScanResult {
  sourcesScanned: number;
  newItemsFound: number;
  itemsScored: number;
  errors: Array<{ sourceId: string; error: string }>;
  startedAt: string;
  completedAt: string;
}

interface ScanStatus {
  scanInProgress: boolean;
  lastScanTime: string | null;
  lastScanResult: ScanResult | null;
  currentSource: { id: string; name: string } | null;
  sourcesCompleted: number;
  sourcesTotal: number;
}

interface RadarSettings {
  autoScanEnabled: boolean;
  autoScanIntervalHours: number;
  auto_scan_cron?: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const ITEM_TYPE_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertCircle }> = {
  consultation: { label: 'Consultation', color: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30', icon: MessageSquare },
  regulation: { label: 'Regulation', color: 'bg-adv-red/20 text-adv-red border-adv-red/30', icon: Gavel },
  guideline: { label: 'Guideline', color: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30', icon: BookOpen },
  enforcement: { label: 'Enforcement', color: 'bg-adv-red/20 text-adv-red border-adv-red/30', icon: AlertCircle },
  report: { label: 'Report', color: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30', icon: FileCheck },
  publication: { label: 'Publication', color: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30', icon: FileText },
  speech: { label: 'Speech', color: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30', icon: MessageSquare },
};

const SOURCE_TYPE_COLORS: Record<string, string> = {
  rss: 'bg-adv-teal/20 text-adv-teal',
  web_page: 'bg-adv-blue/20 text-adv-blue',
  eur_lex: 'bg-adv-gold/20 text-adv-gold',
  api: 'bg-adv-green/20 text-adv-green',
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const MODULE_SUGGESTIONS: Record<string, { moduleId: string; label: string }> = {
  regulation: { moduleId: 'gap-analysis', label: 'Gap Analysis' },
  guideline: { moduleId: 'gap-analysis', label: 'Gap Analysis' },
  consultation: { moduleId: 'regulatory-monitor', label: 'Regulatory Monitor' },
  enforcement: { moduleId: 'investigation-support', label: 'Investigation Support' },
  report: { moduleId: 'regulatory-monitor', label: 'Regulatory Monitor' },
  publication: { moduleId: 'regulatory-monitor', label: 'Regulatory Monitor' },
  speech: { moduleId: 'regulatory-monitor', label: 'Regulatory Monitor' },
};

export default function RadarPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<RadarSummary | null>(null);
  const [items, setItems] = useState<RadarItem[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'high' | 'consultations' | 'enforcement'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSource, setShowAddSource] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);
  const [showScanBanner, setShowScanBanner] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ currentSource: string | null; completed: number; total: number }>({ currentSource: null, completed: 0, total: 0 });
  const [mainTab, setMainTab] = useState<'items' | 'sources'>('items');
  const [editingSource, setEditingSource] = useState<RadarSource | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [radarSettings, setRadarSettings] = useState<RadarSettings>({ autoScanEnabled: false, autoScanIntervalHours: 24 });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [scanScheduleType, setScanScheduleType] = useState<'interval' | 'cron'>('interval');
  const [cronExpression, setCronExpression] = useState('');
  const [cronError, setCronError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchData() {
    try {
      const catParam = categoryFilter !== 'all' ? `?category=${categoryFilter}` : '';
      const itemCatParam = categoryFilter !== 'all' ? `&category=${categoryFilter}` : '';
      const [summaryRes, itemsRes, sourcesRes] = await Promise.all([
        fetch('/api/radar/summary', { headers: getAuthHeader() }),
        fetch(`/api/radar/items?limit=100${itemCatParam}`, { headers: getAuthHeader() }),
        fetch(`/api/radar/sources?active=false`, { headers: getAuthHeader() }),
      ]);
      setSummary(await summaryRes.json() as RadarSummary);
      setItems(await itemsRes.json() as RadarItem[]);
      setSources(await sourcesRes.json() as RadarSource[]);
    } catch (err) {
      console.error('[radar] fetch error:', err);
    }
  }

  // Re-fetch when category filter changes
  useEffect(() => { fetchData(); }, [categoryFilter]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/radar/scan-status', { headers: getAuthHeader() });
        const status = (await res.json()) as ScanStatus;
        if (status.scanInProgress) {
          setIsScanning(true);
          setScanProgress({
            currentSource: status.currentSource?.name ?? null,
            completed: status.sourcesCompleted,
            total: status.sourcesTotal,
          });
        } else {
          setIsScanning(false);
          setScanProgress({ currentSource: null, completed: 0, total: 0 });
          setLastScanTime(status.lastScanTime);
          if (status.lastScanResult) {
            setLastScanResult(status.lastScanResult);
            setShowScanBanner(true);
            setTimeout(() => setShowScanBanner(false), 10000);
          }
          stopPolling();
          fetchData();
        }
      } catch {
        // ignore
      }
    }, 2000);
  }, [stopPolling]);

  async function fetchScanStatus() {
    try {
      const res = await fetch('/api/radar/scan-status', { headers: getAuthHeader() });
      const status = (await res.json()) as ScanStatus;
      setLastScanTime(status.lastScanTime);
      if (status.scanInProgress) {
        setIsScanning(true);
        setScanProgress({
          currentSource: status.currentSource?.name ?? null,
          completed: status.sourcesCompleted,
          total: status.sourcesTotal,
        });
        startPolling();
      }
    } catch {
      // ignore
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch('/api/radar/settings', { headers: getAuthHeader() });
      const data = (await res.json()) as RadarSettings;
      setRadarSettings(data);
      if (data.auto_scan_cron) {
        setScanScheduleType('cron');
        setCronExpression(data.auto_scan_cron);
      }
    } catch {
      // ignore
    }
  }

  async function saveSettings(updated: Partial<RadarSettings>) {
    if (scanScheduleType === 'cron' && cronExpression) {
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) {
        setCronError('Cron expression must have 5 parts: minute hour day month weekday');
        return;
      }
    }
    setSettingsLoading(true);
    const merged = {
      ...radarSettings,
      ...updated,
      auto_scan_cron: scanScheduleType === 'cron' ? cronExpression : '',
    };
    setRadarSettings(merged);
    try {
      await fetchWithAuth('/api/radar/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    } catch (err) {
      console.error('[radar] settings save error:', err);
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleScan() {
    setIsScanning(true);
    setShowScanBanner(false);
    setScanProgress({ currentSource: null, completed: 0, total: 0 });
    try {
      await fetchWithAuth('/api/radar/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      // Scan runs in background — start polling for progress
      startPolling();
    } catch (err) {
      console.error('[radar] scan error:', err);
      setIsScanning(false);
    }
  }

  async function handleStopScan() {
    try {
      await fetchWithAuth('/api/radar/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('[radar] stop error:', err);
    }
  }

  useEffect(() => {
    fetchData();
    fetchScanStatus();
    fetchSettings();
    return () => stopPolling();
  }, []);

  async function updateStatus(itemId: string, status: string) {
    try {
      await fetchWithAuth(`/api/radar/items/${itemId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch (err) {
      console.error('[radar] status update error:', err);
    }
  }

  const filteredItems = items.filter((item) => {
    // Tab filter
    if (filterTab === 'new' && item.status !== 'new') return false;
    if (filterTab === 'high' && item.relevance_score < 0.7) return false;
    if (filterTab === 'consultations' && item.item_type !== 'consultation') return false;
    if (filterTab === 'enforcement' && item.item_type !== 'enforcement') return false;
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        (item.summary ?? '').toLowerCase().includes(q) ||
        (item.ai_summary ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleDeleteSource(id: string, name: string) {
    if (!confirm(`Delete source "${name}"? This cannot be undone.`)) return;
    try {
      await fetchWithAuth(`/api/radar/sources/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('[radar] source delete error:', err);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-adv-teal" />
          <h1 className="text-2xl font-bold text-adv-white">Horizon Radar</h1>
          {/* Main tab switcher */}
          <div className="ml-4 flex rounded-lg overflow-hidden border border-border">
            <button
              onClick={() => setMainTab('items')}
              className={`px-3 py-1.5 text-sm transition-colors ${mainTab === 'items' ? 'bg-adv-teal text-adv-dark font-medium' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
            >
              Items
            </button>
            <button
              onClick={() => setMainTab('sources')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${mainTab === 'sources' ? 'bg-adv-teal text-adv-dark font-medium' : 'bg-adv-card text-adv-gray hover:text-adv-off-white'}`}
            >
              <Database className="h-3.5 w-3.5" />
              Sources ({sources.length})
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-gray transition-colors hover:bg-adv-dark-2 hover:text-adv-off-white"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-3 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Now'}
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
          <button
            onClick={() => setShowAddItem(true)}
            className="flex items-center gap-2 rounded-lg border border-border bg-adv-card px-3 py-2 text-sm text-adv-off-white transition-colors hover:bg-adv-dark-2"
          >
            <Plus className="h-4 w-4" />
            Add Manual Item
          </button>
          <button
            onClick={() => setShowAddSource(true)}
            className="flex items-center gap-2 rounded-lg border border-adv-teal bg-adv-teal-dim px-3 py-2 text-sm font-medium text-adv-teal transition-colors hover:bg-adv-teal-dim/80"
          >
            <Plus className="h-4 w-4" />
            Add Source
          </button>
        </div>
      </div>

      {/* Scan Settings Panel */}
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
          <div className="flex items-center gap-6">
            {/* Auto-scan toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm text-adv-gray">Auto-scan</span>
              <button
                onClick={() => saveSettings({ autoScanEnabled: !radarSettings.autoScanEnabled })}
                disabled={settingsLoading}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  radarSettings.autoScanEnabled ? 'bg-adv-teal' : 'bg-adv-gray-med/40'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    radarSettings.autoScanEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>

            {/* Interval selector */}
            {radarSettings.autoScanEnabled && scanScheduleType === 'interval' && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-adv-gray">Scan every:</span>
                {[6, 12, 24, 48, 168].map((h) => (
                  <button
                    key={h}
                    onClick={() => saveSettings({ autoScanIntervalHours: h })}
                    disabled={settingsLoading}
                    className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                      radarSettings.autoScanIntervalHours === h
                        ? 'bg-adv-teal text-adv-dark'
                        : 'border border-border bg-adv-dark text-adv-gray hover:text-adv-off-white'
                    }`}
                  >
                    {h < 168 ? `${h}h` : 'Weekly'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Schedule type toggle */}
          {radarSettings.autoScanEnabled && (
            <div className="mt-4 space-y-3">
              <label className="text-sm font-medium text-adv-gray">
                Auto-scan schedule
              </label>
              <div className="flex rounded-lg overflow-hidden border border-border">
                <button
                  onClick={() => { setScanScheduleType('interval'); setCronError(''); }}
                  className={`flex-1 px-3 py-2 text-sm transition-colors ${scanScheduleType === 'interval'
                    ? 'bg-adv-teal text-adv-dark'
                    : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}
                >
                  Every N hours
                </button>
                <button
                  onClick={() => setScanScheduleType('cron')}
                  className={`flex-1 px-3 py-2 text-sm transition-colors ${scanScheduleType === 'cron'
                    ? 'bg-adv-teal text-adv-dark'
                    : 'bg-adv-dark text-adv-gray hover:text-adv-off-white'}`}
                >
                  Specific time
                </button>
              </div>

              {scanScheduleType === 'cron' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Daily 6am', value: '0 6 * * *' },
                      { label: 'Weekdays 8am', value: '0 8 * * 1-5' },
                      { label: 'Mon 7am', value: '0 7 * * 1' },
                    ].map(preset => (
                      <button
                        key={preset.value}
                        onClick={() => { setCronExpression(preset.value); setCronError(''); }}
                        className={`px-2 py-1.5 text-xs rounded-md border transition-colors ${
                          cronExpression === preset.value
                            ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                            : 'border-border hover:border-adv-gray-med text-adv-gray'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={cronExpression}
                      onChange={e => {
                        setCronExpression(e.target.value);
                        setCronError('');
                      }}
                      placeholder="0 6 * * * (min hour day month weekday)"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-adv-dark text-adv-off-white font-mono placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
                    />
                    {cronError && <p className="text-xs text-adv-red mt-1">{cronError}</p>}
                    {cronExpression && !cronError && (
                      <p className="text-xs text-adv-gray mt-1">
                        Cron: {cronExpression}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => saveSettings({})}
                    disabled={settingsLoading || !cronExpression}
                    className="rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
                  >
                    {settingsLoading ? 'Saving...' : 'Save cron schedule'}
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-xs text-adv-gray">
            {radarSettings.autoScanEnabled
              ? scanScheduleType === 'cron' && cronExpression
                ? `Scheduled scan with cron: ${cronExpression}`
                : `Automatically scans all active sources every ${radarSettings.autoScanIntervalHours < 168 ? `${radarSettings.autoScanIntervalHours} hours` : 'week'}.`
              : 'Auto-scan is disabled. Use "Scan Now" to scan manually.'}
          </p>
        </div>
      )}

      {/* Scan status line */}
      <div className="mb-4 flex items-center gap-2 text-xs text-adv-gray">
        <span>
          {lastScanTime
            ? `Last scanned: ${formatRelativeTime(lastScanTime)}`
            : 'Never scanned'}
        </span>
        <span>&middot;</span>
        <span>{sources.filter((s) => s.is_active === 1).length} sources active</span>
        {radarSettings.autoScanEnabled && (
          <>
            <span>&middot;</span>
            <span className="text-adv-teal">Auto-scan: every {radarSettings.autoScanIntervalHours < 168 ? `${radarSettings.autoScanIntervalHours}h` : 'week'}</span>
          </>
        )}
      </div>

      {/* Live scan progress banner */}
      {isScanning && (
        <div className="mb-4 rounded-lg border border-adv-blue/30 bg-adv-blue/10 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-adv-blue">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>
                {scanProgress.currentSource
                  ? `Scanning: ${scanProgress.currentSource}`
                  : 'Starting scan...'}
                {scanProgress.total > 0 && ` (${scanProgress.completed}/${scanProgress.total} sources)`}
              </span>
            </div>
            <button
              onClick={handleStopScan}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-adv-red hover:bg-adv-red/10 transition-colors"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          </div>
          {scanProgress.total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-adv-dark">
              <div
                className="h-full rounded-full bg-adv-blue transition-all duration-500"
                style={{ width: `${Math.round((scanProgress.completed / scanProgress.total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Scan result banner */}
      {showScanBanner && !isScanning && lastScanResult && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-adv-teal/30 bg-adv-teal-dim px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-adv-teal">
            <Check className="h-4 w-4" />
            <span>
              Scan complete: {lastScanResult.newItemsFound} new item{lastScanResult.newItemsFound !== 1 ? 's' : ''} found
              from {lastScanResult.sourcesScanned} source{lastScanResult.sourcesScanned !== 1 ? 's' : ''}
              {lastScanResult.itemsScored > 0 && ` · ${lastScanResult.itemsScored} scored`}
            </span>
          </div>
          <button
            onClick={() => setShowScanBanner(false)}
            className="text-adv-gray hover:text-adv-off-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Category Tabs */}
      {mainTab === 'items' && <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setCategoryFilter('all')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            categoryFilter === 'all'
              ? 'bg-adv-teal text-adv-dark'
              : 'bg-adv-card text-adv-gray hover:text-adv-off-white border border-border'
          }`}
        >
          All Categories
          {summary && <span className="opacity-70">({summary.newItems})</span>}
        </button>
        {Object.entries(RADAR_CATEGORIES).map(([key, cat]) => {
          const Icon = cat.icon;
          const count = summary?.categoryCounts?.find((c: CategoryCount) => c.category === key)?.count ?? 0;
          return (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                categoryFilter === key
                  ? 'text-adv-dark'
                  : 'bg-adv-card text-adv-gray hover:text-adv-off-white border border-border'
              }`}
              style={categoryFilter === key ? { backgroundColor: cat.color } : {}}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              {count > 0 && <span className="opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>}

      {/* Filter Tabs */}
      {mainTab === 'items' && <div className="mb-4 flex items-center gap-4 border-b border-border pb-2">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            filterTab === 'all' ? 'text-adv-teal border-b-2 border-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilterTab('new')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            filterTab === 'new' ? 'text-adv-teal border-b-2 border-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          New {summary && summary.newItems > 0 && `(${summary.newItems})`}
        </button>
        <button
          onClick={() => setFilterTab('high')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            filterTab === 'high' ? 'text-adv-teal border-b-2 border-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          High Relevance {summary && summary.highRelevance > 0 && `(${summary.highRelevance})`}
        </button>
        <button
          onClick={() => setFilterTab('consultations')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            filterTab === 'consultations' ? 'text-adv-teal border-b-2 border-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          Consultations {summary && summary.consultationsOpen > 0 && `(${summary.consultationsOpen})`}
        </button>
        <button
          onClick={() => setFilterTab('enforcement')}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            filterTab === 'enforcement' ? 'text-adv-teal border-b-2 border-adv-teal' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          Enforcement
        </button>

        {/* Search */}
        <div className="ml-auto relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-adv-gray pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="w-64 rounded-lg border border-border bg-adv-card py-1.5 pl-9 pr-3 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>
      </div>}

      {/* Stats Row */}
      {mainTab === 'items' && summary && (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <p className="text-2xl font-semibold text-adv-white">{summary.newItems}</p>
            <p className="text-xs text-adv-gray">New Items</p>
          </div>
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <p className="text-2xl font-semibold text-adv-white">{summary.highRelevance}</p>
            <p className="text-xs text-adv-gray">High Relevance</p>
          </div>
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <p className="text-2xl font-semibold text-adv-white">{summary.consultationsOpen}</p>
            <p className="text-xs text-adv-gray">Open Consultations</p>
          </div>
          <div className="rounded-xl border border-border bg-adv-card p-4">
            <p className="text-2xl font-semibold text-adv-white">{sources.filter((s) => s.is_active === 1).length}</p>
            <p className="text-xs text-adv-gray">Sources Active</p>
          </div>
        </div>
      )}

      {/* ── Sources Management Tab ─────────────────────────── */}
      {mainTab === 'sources' && (
        <div className="rounded-xl border border-border bg-adv-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-adv-off-white">Monitored Sources ({sources.length})</h3>
            <button
              onClick={() => setShowAddSource(true)}
              className="flex items-center gap-1.5 rounded-lg border border-adv-teal bg-adv-teal-dim px-3 py-1.5 text-sm font-medium text-adv-teal transition-colors hover:bg-adv-teal-dim/80"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Source
            </button>
          </div>
          {sources.length === 0 ? (
            <div className="p-8 text-center text-sm text-adv-gray">No sources yet. Add a source to start monitoring.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-adv-gray uppercase tracking-wider">
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">URL</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Category</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-adv-dark/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-adv-off-white">{s.display_name}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="truncate block text-adv-teal hover:underline text-xs" title={s.url}>
                        {s.url}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-adv-gray text-xs">{s.source_type}</td>
                    <td className="px-4 py-3 text-adv-gray text-xs capitalize">{s.category}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.is_active === 1 ? 'bg-adv-green/20 text-adv-green' : 'bg-adv-gray-med/20 text-adv-gray'}`}>
                        {s.is_active === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingSource(s)}
                          className="rounded p-1.5 text-adv-gray hover:bg-adv-card hover:text-adv-teal transition-colors"
                          title="Edit source"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSource(s.id, s.display_name)}
                          className="rounded p-1.5 text-adv-gray hover:bg-adv-red/10 hover:text-adv-red transition-colors"
                          title="Delete source"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Item Cards */}
      {mainTab === 'items' && (filteredItems.length === 0 ? (
        <div className="rounded-xl border border-border bg-adv-card p-8 text-center">
          <p className="text-sm text-adv-gray">
            {searchQuery
              ? `No items match "${searchQuery}"`
              : 'No items yet. Add sources and run a scan, or add manual items.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            const typeConfig = ITEM_TYPE_CONFIG[item.item_type] ?? ITEM_TYPE_CONFIG.publication;
            const TypeIcon = typeConfig.icon;
            const relevanceColor =
              item.relevance_score >= 0.7
                ? 'bg-adv-green'
                : item.relevance_score >= 0.4
                ? 'bg-adv-gold'
                : 'bg-adv-gray';

            return (
              <div
                key={item.id}
                className="group rounded-xl border border-border bg-adv-card p-4 transition-all hover:border-adv-teal/30 hover:shadow-lg"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.category && RADAR_CATEGORIES[item.category] && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: RADAR_CATEGORIES[item.category].color }}
                        title={RADAR_CATEGORIES[item.category].label}
                      />
                    )}
                    <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${SOURCE_TYPE_COLORS[item.source_type] ?? 'bg-adv-gray/20 text-adv-gray'}`}>
                      {item.source_name}
                    </span>
                    <span className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${typeConfig.color}`}>
                      <TypeIcon className="h-3 w-3" />
                      {typeConfig.label}
                    </span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="mb-2 text-sm font-semibold text-adv-white">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-adv-teal transition-colors"
                    >
                      {item.title}
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </a>
                  ) : (
                    item.title
                  )}
                </h3>

                {/* Summary */}
                <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-adv-gray">
                  {item.ai_summary || item.summary || 'No summary available.'}
                </p>

                {/* Relevance Bar */}
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-adv-gray">
                    <span>Relevance</span>
                    <span>{Math.round(item.relevance_score * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-adv-dark">
                    <div
                      className={`h-full rounded-full ${relevanceColor}`}
                      style={{ width: `${item.relevance_score * 100}%` }}
                    />
                  </div>
                </div>

                {/* Published Date */}
                <p className="mb-3 text-xs text-adv-gray">
                  Published {formatRelativeTime(item.published_at)}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {item.status === 'new' && (
                    <>
                      <button
                        onClick={() => updateStatus(item.id, 'reviewed')}
                        className="flex items-center gap-1 rounded-lg border border-adv-teal/30 bg-adv-teal-dim px-2 py-1 text-xs text-adv-teal transition-colors hover:bg-adv-teal-dim/80"
                      >
                        <Check className="h-3 w-3" />
                        Mark Reviewed
                      </button>
                      <button
                        onClick={() => updateStatus(item.id, 'actioned')}
                        className="flex items-center gap-1 rounded-lg border border-adv-green/30 bg-adv-green/10 px-2 py-1 text-xs text-adv-green transition-colors hover:bg-adv-green/20"
                      >
                        <Check className="h-3 w-3" />
                        Action Required
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => updateStatus(item.id, 'dismissed')}
                    className="flex items-center gap-1 rounded-lg border border-adv-red/30 bg-adv-red/10 px-2 py-1 text-xs text-adv-red transition-colors hover:bg-adv-red/20"
                  >
                    <X className="h-3 w-3" />
                    Dismiss
                  </button>
                  {(() => {
                    const suggestion = MODULE_SUGGESTIONS[item.item_type];
                    return suggestion ? (
                      <button
                        onClick={() => navigate(`/module/${suggestion.moduleId}?prefill=${encodeURIComponent(item.title)}`)}
                        className="px-2 py-1 text-xs bg-adv-teal/20 text-adv-teal border border-adv-teal/30 rounded hover:bg-adv-teal/30 transition-colors"
                      >
                        Analyse in {suggestion.label} →
                      </button>
                    ) : null;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modals */}
      {showAddSource && <AddSourceModal onClose={() => setShowAddSource(false)} onSuccess={fetchData} />}
      {editingSource && <EditSourceModal source={editingSource} onClose={() => setEditingSource(null)} onSuccess={fetchData} />}
      {showAddItem && <AddItemModal sources={sources.filter(s => s.is_active === 1)} onClose={() => setShowAddItem(false)} onSuccess={fetchData} />}
    </div>
  );
}

// ── Add Source Modal ─────────────────────────────────────────────

function AddSourceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [url, setUrl] = useState('');
  const [sourceType, setSourceType] = useState('web_page');
  const [category, setCategory] = useState('regulatory');
  const [keywords, setKeywords] = useState('');
  const [areas, setAreas] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const keywordList = keywords.split(',').map((k) => k.trim()).filter(Boolean);
      const areaList = areas.split(',').map((a) => a.trim()).filter(Boolean);
      await fetchWithAuth('/api/radar/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          url,
          sourceType,
          category,
          keywords: keywordList,
          areas: areaList,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('[radar] source creation error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-adv-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-adv-white">Add Source</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Finansinspektionen"
              required
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.fi.se/sv/publicerat/"
              required
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-xs text-adv-gray">
              {sourceType === 'rss'
                ? 'Direct link to the RSS/Atom feed XML'
                : 'Main page or section — Claude searches around this URL for recent publications'}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Source Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="web_page">Web Page (Claude searches for publications)</option>
              <option value="rss">RSS Feed (direct feed parsing)</option>
              <option value="eur_lex">EUR-Lex</option>
              <option value="api">API</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              {Object.entries(RADAR_CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>{cat.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Keywords</label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="AML, sanctions, enforcement, penningtvätt"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-xs text-adv-gray">
              Comma-separated. Guides what Claude looks for from this source.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Focus Areas</label>
            <input
              type="text"
              value={areas}
              onChange={(e) => setAreas(e.target.value)}
              placeholder="fcp, banking, legal"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-xs text-adv-gray">
              Comma-separated. Used for relevance scoring (e.g. fcp, banking, legal, investment).
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:bg-adv-dark-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Source Modal ────────────────────────────────────────────

function EditSourceModal({ source, onClose, onSuccess }: { source: RadarSource; onClose: () => void; onSuccess: () => void }) {
  const [displayName, setDisplayName] = useState(source.display_name);
  const [url, setUrl] = useState(source.url);
  const [sourceType, setSourceType] = useState(source.source_type);
  const [category, setCategory] = useState(source.category);
  const [keywords, setKeywords] = useState(() => {
    try { return (JSON.parse(source.keywords) as string[]).join(', '); } catch { return source.keywords; }
  });
  const [areas, setAreas] = useState(() => {
    try { return (JSON.parse(source.areas) as string[]).join(', '); } catch { return source.areas; }
  });
  const [isActive, setIsActive] = useState(source.is_active === 1);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetchWithAuth(`/api/radar/sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          url,
          sourceType,
          category,
          keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
          areas: areas.split(',').map((a) => a.trim()).filter(Boolean),
          isActive,
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('[radar] source update error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-adv-card p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-adv-white">Edit Source</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Display Name</label>
            <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} required
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm text-adv-gray">Source Type</label>
              <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1">
                <option value="web_page">Web Page</option>
                <option value="rss">RSS Feed</option>
                <option value="eur_lex">EUR-Lex</option>
                <option value="api">API</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-adv-gray">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1">
                {Object.entries(RADAR_CATEGORIES).map(([key, cat]) => (
                  <option key={key} value={key}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Keywords (comma-separated)</label>
            <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="AML, sanctions, DORA"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Areas (comma-separated)</label>
            <input type="text" value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="fcp, compliance"
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-adv-teal' : 'bg-adv-gray-med/40'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-adv-gray">{isActive ? 'Active' : 'Inactive'}</span>
          </label>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:bg-adv-dark-2">Cancel</button>
            <button type="submit" disabled={loading}
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Manual Item Modal ────────────────────────────────────────

function AddItemModal({
  sources,
  onClose,
  onSuccess,
}: {
  sources: RadarSource[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [url, setUrl] = useState('');
  const [itemType, setItemType] = useState('publication');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetchWithAuth('/api/radar/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, title, summary, url, itemType }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      console.error('[radar] item creation error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-adv-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-adv-white">Add Manual Item</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Source</label>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="">Select source...</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Summary</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">URL (optional)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-adv-gray">Item Type</label>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="publication">Publication</option>
              <option value="consultation">Consultation</option>
              <option value="regulation">Regulation</option>
              <option value="guideline">Guideline</option>
              <option value="enforcement">Enforcement</option>
              <option value="report">Report</option>
              <option value="speech">Speech</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:bg-adv-dark-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
