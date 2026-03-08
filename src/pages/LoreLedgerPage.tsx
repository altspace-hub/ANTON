/**
 * LONE-09: World-building Lore Ledger
 *
 * Per-project JSON ledger for fiction / creative writing.
 * Stores characters, locations, factions, events, items, and world rules.
 * Includes a Claude-powered consistency checker.
 */

import { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Upload,
  Wand2,
  Search,
  Filter,
  User,
  MapPin,
  Shield,
  Zap,
  Package,
  Globe,
} from 'lucide-react';
import { fetchWithAuth, API_BASE } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ── Types ────────────────────────────────────────────────────────────────────

type EntryType = 'character' | 'location' | 'faction' | 'event' | 'item' | 'world_rule';

interface LoreEntry {
  id: string;
  entry_type: EntryType;
  name: string;
  summary: string;
  properties: Record<string, string>;
  tags: string[];
  project_id: string | null;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTRY_TYPES: { value: EntryType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'character',  label: 'Character',   icon: <User className="h-3.5 w-3.5" />,     color: 'text-blue-400 bg-blue-900/30' },
  { value: 'location',   label: 'Location',    icon: <MapPin className="h-3.5 w-3.5" />,    color: 'text-green-400 bg-green-900/30' },
  { value: 'faction',    label: 'Faction',     icon: <Shield className="h-3.5 w-3.5" />,    color: 'text-purple-400 bg-purple-900/30' },
  { value: 'event',      label: 'Event',       icon: <Zap className="h-3.5 w-3.5" />,       color: 'text-yellow-400 bg-yellow-900/30' },
  { value: 'item',       label: 'Item',        icon: <Package className="h-3.5 w-3.5" />,   color: 'text-orange-400 bg-orange-900/30' },
  { value: 'world_rule', label: 'World Rule',  icon: <Globe className="h-3.5 w-3.5" />,     color: 'text-red-400 bg-red-900/30' },
];

function typeConfig(t: EntryType) {
  return ENTRY_TYPES.find(x => x.value === t) ?? ENTRY_TYPES[0];
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function EntryModal({
  entry,
  projectId,
  onSave,
  onClose,
}: {
  entry: Partial<LoreEntry> | null;
  projectId: string;
  onSave: (data: Partial<LoreEntry>) => Promise<void>;
  onClose: () => void;
}) {
  const isNew = !entry?.id;
  const [form, setForm] = useState<Partial<LoreEntry>>({
    entry_type: 'character',
    name: '',
    summary: '',
    properties: {},
    tags: [],
    ...entry,
  });
  const [propKey, setPropKey] = useState('');
  const [propVal, setPropVal] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.name?.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  }

  function addProperty() {
    if (!propKey.trim()) return;
    setForm(f => ({ ...f, properties: { ...f.properties, [propKey.trim()]: propVal } }));
    setPropKey('');
    setPropVal('');
  }

  function removeProperty(key: string) {
    setForm(f => {
      const p = { ...f.properties };
      delete p[key];
      return { ...f, properties: p };
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#152238] rounded-xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="font-semibold text-white">{isNew ? 'New Entry' : 'Edit Entry'}</h2>
          <button onClick={onClose} className="text-[#707070] hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-[#B0B0B0] mb-1.5">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {ENTRY_TYPES.map(et => (
                <button
                  key={et.value}
                  onClick={() => setForm(f => ({ ...f, entry_type: et.value }))}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                    form.entry_type === et.value
                      ? 'border-[#2DD4A8] bg-[#2DD4A8]/20 text-[#2DD4A8]'
                      : 'border-white/10 text-[#B0B0B0] hover:text-white'
                  }`}
                >
                  {et.icon}{et.label}
                </button>
              ))}
            </div>
          </div>
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-[#B0B0B0] mb-1.5">Name *</label>
            <input
              value={form.name ?? ''}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Erevan Duskwood"
              className="w-full bg-[#0F1B2D] border border-white/10 text-white placeholder-[#707070] rounded-lg px-3 py-2 text-sm"
            />
          </div>
          {/* Summary */}
          <div>
            <label className="block text-xs font-medium text-[#B0B0B0] mb-1.5">Summary</label>
            <textarea
              value={form.summary ?? ''}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="Brief description (1-3 sentences)…"
              rows={3}
              className="w-full bg-[#0F1B2D] border border-white/10 text-white placeholder-[#707070] rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>
          {/* Properties */}
          <div>
            <label className="block text-xs font-medium text-[#B0B0B0] mb-1.5">Properties</label>
            {Object.entries(form.properties ?? {}).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-[#2DD4A8] font-mono w-28 shrink-0">{k}</span>
                <span className="text-xs text-white flex-1">{v as string}</span>
                <button onClick={() => removeProperty(k)} className="text-[#707070] hover:text-red-400 transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input
                value={propKey}
                onChange={e => setPropKey(e.target.value)}
                placeholder="Key"
                className="w-28 bg-[#0F1B2D] border border-white/10 text-white placeholder-[#707070] rounded px-2 py-1 text-xs"
              />
              <input
                value={propVal}
                onChange={e => setPropVal(e.target.value)}
                placeholder="Value"
                className="flex-1 bg-[#0F1B2D] border border-white/10 text-white placeholder-[#707070] rounded px-2 py-1 text-xs"
                onKeyDown={e => e.key === 'Enter' && addProperty()}
              />
              <button
                onClick={addProperty}
                className="px-2 py-1 bg-[#2DD4A8]/20 hover:bg-[#2DD4A8]/30 text-[#2DD4A8] rounded text-xs transition-colors"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-[#B0B0B0] mb-1.5">Tags (comma-separated)</label>
            <input
              value={(form.tags ?? []).join(', ')}
              onChange={e => setForm(f => ({ ...f, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
              placeholder="e.g. protagonist, mage, guild-member"
              className="w-full bg-[#0F1B2D] border border-white/10 text-white placeholder-[#707070] rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[#B0B0B0] hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.name?.trim() || saving}
            className="px-4 py-2 bg-[#2DD4A8] hover:bg-[#1BA882] text-[#0B1426] rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : isNew ? 'Add Entry' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LoreLedgerPage() {
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [projectId, setProjectId] = useState('default');
  const [projectInput, setProjectInput] = useState('default');
  const [activeTab, setActiveTab] = useState<'ledger' | 'check'>('ledger');
  const [typeFilter, setTypeFilter] = useState<EntryType | 'all'>('all');
  const [searchQ, setSearchQ] = useState('');
  const [modal, setModal] = useState<{ open: boolean; entry: Partial<LoreEntry> | null }>({ open: false, entry: null });
  const [checkText, setCheckText] = useState('');
  const [checkResult, setCheckResult] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadEntries(); }, [projectId, typeFilter, searchQ]);

  async function loadEntries() {
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (typeFilter !== 'all') params.append('entry_type', typeFilter);
      if (searchQ.trim()) params.append('q', searchQ.trim());
      const res = await fetchWithAuth(`${API_BASE}/lore-ledger/entries?${params}`);
      if (res.ok) setEntries(await res.json());
    } catch {}
  }

  async function saveEntry(data: Partial<LoreEntry>) {
    try {
      const payload = { ...data, project_id: projectId };
      let res: Response;
      if (data.id) {
        res = await fetchWithAuth(`${API_BASE}/lore-ledger/entries/${data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetchWithAuth(`${API_BASE}/lore-ledger/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok) { await loadEntries(); setModal({ open: false, entry: null }); }
      else setError('Failed to save entry');
    } catch { setError('Failed to save entry'); }
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this entry?')) return;
    const res = await fetchWithAuth(`${API_BASE}/lore-ledger/entries/${id}`, { method: 'DELETE' });
    if (res.ok) await loadEntries();
  }

  async function runConsistencyCheck() {
    if (!checkText.trim()) return;
    setIsChecking(true);
    setCheckResult('');
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchWithAuth(`${API_BASE}/lore-ledger/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: checkText, project_id: projectId }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Check failed');
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No stream');
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const msg = JSON.parse(raw) as { type: string; content?: string };
            if (msg.type === 'text' && msg.content) setCheckResult(prev => prev + msg.content);
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Check failed');
    } finally { setIsChecking(false); }
  }

  async function exportLedger() {
    const res = await fetchWithAuth(`${API_BASE}/lore-ledger/export?project_id=${encodeURIComponent(projectId)}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `lore-${projectId}-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function importLedger(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { entries?: unknown[] };
      const res = await fetchWithAuth(`${API_BASE}/lore-ledger/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: data.entries ?? [], project_id: projectId }),
      });
      if (res.ok) { await loadEntries(); }
      else setError('Import failed');
    } catch { setError('Invalid JSON file'); }
  }

  const grouped = ENTRY_TYPES.reduce<Record<EntryType, LoreEntry[]>>((acc, et) => {
    acc[et.value] = entries.filter(e => e.entry_type === et.value);
    return acc;
  }, {} as Record<EntryType, LoreEntry[]>);

  return (
    <div className="min-h-screen bg-[#0B1426] text-white p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Lore Ledger</h1>
              <p className="text-sm text-[#B0B0B0]">World-building database · Consistency checker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportLedger} className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm text-[#B0B0B0] hover:text-white transition-colors">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-sm text-[#B0B0B0] hover:text-white transition-colors">
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) importLedger(e.target.files[0]); }} />
            <button
              onClick={() => setModal({ open: true, entry: null })}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#2DD4A8] hover:bg-[#1BA882] text-[#0B1426] rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Entry
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Project bar */}
        <div className="flex items-center gap-3 mb-4 p-3 bg-[#152238] border border-white/10 rounded-lg">
          <span className="text-xs text-[#B0B0B0] shrink-0">Project:</span>
          <input
            value={projectInput}
            onChange={e => setProjectInput(e.target.value)}
            onBlur={() => setProjectId(projectInput.trim() || 'default')}
            onKeyDown={e => e.key === 'Enter' && setProjectId(projectInput.trim() || 'default')}
            placeholder="default"
            className="bg-[#0F1B2D] border border-white/10 text-white text-sm rounded px-2 py-1 w-40"
          />
          <span className="text-xs text-[#707070]">· {entries.length} entries</span>
          <div className="ml-auto flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-[#707070]" />
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search entries…"
              className="bg-[#0F1B2D] border border-white/10 text-white text-xs rounded px-2 py-1 w-44"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#152238] p-1 rounded-lg w-fit">
          {(['ledger', 'check'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? 'bg-[#2DD4A8] text-[#0B1426]' : 'text-[#B0B0B0] hover:text-white'
              }`}
            >
              {tab === 'ledger' ? 'Ledger' : 'Consistency Check'}
            </button>
          ))}
        </div>

        {/* Ledger Tab */}
        {activeTab === 'ledger' && (
          <div>
            {/* Type filter */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-[#707070]" />
              <button
                onClick={() => setTypeFilter('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  typeFilter === 'all' ? 'bg-[#2DD4A8] text-[#0B1426]' : 'bg-white/10 text-[#B0B0B0] hover:text-white'
                }`}
              >
                All ({entries.length})
              </button>
              {ENTRY_TYPES.map(et => (
                <button
                  key={et.value}
                  onClick={() => setTypeFilter(et.value)}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    typeFilter === et.value ? 'bg-[#2DD4A8] text-[#0B1426]' : 'bg-white/10 text-[#B0B0B0] hover:text-white'
                  }`}
                >
                  {et.icon}{et.label} ({grouped[et.value].length})
                </button>
              ))}
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-16 text-[#707070]">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="font-medium text-white mb-1">Your ledger is empty</p>
                <p className="text-sm">Add characters, locations, factions, and world rules to get started.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {(typeFilter === 'all' ? ENTRY_TYPES : ENTRY_TYPES.filter(et => et.value === typeFilter)).map(et => {
                  const group = grouped[et.value];
                  if (group.length === 0) return null;
                  return (
                    <div key={et.value}>
                      <h2 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 px-1 ${et.color.split(' ')[0]}`}>
                        {et.icon}{et.label}s
                      </h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {group.map(entry => (
                          <div key={entry.id} className="p-4 bg-[#152238] border border-white/10 hover:border-white/20 rounded-xl transition-colors group">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${typeConfig(entry.entry_type).color}`}>
                                  {typeConfig(entry.entry_type).icon}
                                </span>
                                <span className="font-semibold text-white text-sm">{entry.name}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setModal({ open: true, entry })} className="p-1 text-[#707070] hover:text-white transition-colors">
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => deleteEntry(entry.id)} className="p-1 text-[#707070] hover:text-red-400 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            {entry.summary && <p className="text-xs text-[#B0B0B0] leading-relaxed mb-2">{entry.summary}</p>}
                            {Object.keys(entry.properties).length > 0 && (
                              <div className="space-y-0.5">
                                {Object.entries(entry.properties).slice(0, 4).map(([k, v]) => (
                                  <div key={k} className="flex gap-2 text-xs">
                                    <span className="text-[#2DD4A8] font-mono w-20 shrink-0 truncate">{k}</span>
                                    <span className="text-[#B0B0B0] truncate">{v as string}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {entry.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {entry.tags.map(tag => (
                                  <span key={tag} className="px-1.5 py-0.5 bg-white/5 text-[#707070] text-xs rounded">{tag}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Consistency Check Tab */}
        {activeTab === 'check' && (
          <div className="space-y-4">
            <div className="p-4 bg-[#0D2E3A] border border-[#2DD4A8]/20 rounded-xl text-sm text-[#B0B0B0]">
              <strong className="text-[#2DD4A8]">How it works:</strong> Paste a passage of your writing. Claude will compare it against your ledger and flag any contradictions, continuity errors, or undefined entities.
              {entries.length === 0 && (
                <span className="block mt-1 text-yellow-400"> Add entries to your ledger first.</span>
              )}
            </div>
            <textarea
              value={checkText}
              onChange={e => setCheckText(e.target.value)}
              placeholder="Paste your text here (up to 10,000 characters)…"
              rows={8}
              className="w-full bg-[#152238] border border-white/10 text-white placeholder-[#707070] rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-[#2DD4A8]/50"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#707070]">{checkText.length.toLocaleString()} / 10,000 characters</span>
              {isChecking ? (
                <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors">
                  <AlertCircle className="h-4 w-4" /> Stop
                </button>
              ) : (
                <button
                  onClick={runConsistencyCheck}
                  disabled={!checkText.trim() || entries.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2DD4A8] hover:bg-[#1BA882] text-[#0B1426] rounded-lg text-sm font-semibold transition-colors disabled:opacity-40"
                >
                  <Wand2 className="h-4 w-4" /> Check Consistency
                </button>
              )}
            </div>
            {(checkResult || isChecking) && (
              <div className="p-6 bg-[#152238] border border-white/10 rounded-xl">
                {isChecking && !checkResult && (
                  <div className="flex items-center gap-2 text-[#2DD4A8] text-sm animate-pulse">
                    <CheckCircle2 className="h-4 w-4" /> Checking against {entries.length} ledger entries…
                  </div>
                )}
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{checkResult}</ReactMarkdown>
                  {isChecking && <span className="inline-block w-2 h-4 bg-[#2DD4A8] animate-pulse ml-0.5" />}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {modal.open && (
        <EntryModal
          entry={modal.entry}
          projectId={projectId}
          onSave={saveEntry}
          onClose={() => setModal({ open: false, entry: null })}
        />
      )}
    </div>
  );
}
