import { useState, useEffect, useCallback, memo } from 'react';
import { Brain, Link, FolderOpen, Combine, ChevronDown, ChevronRight, Globe, Plus, X, Search, RefreshCw, Loader2, Database, CheckCircle2, Package, ArrowRight, Zap } from 'lucide-react';
import type { KnowledgeSourceConfig, RagIndexedFolder, RagCollection, KnowledgeLibraryEntry } from '@/lib/types';
import { fetchRagFolders, indexRagFolder, fetchRagCollections } from '@/lib/api';
import HelpTooltip from './HelpTooltip';
import { RAGSearchPanel } from './RAGSearchPanel';

interface KnowledgeSourcePanelProps {
  config: KnowledgeSourceConfig;
  onChange: (config: KnowledgeSourceConfig) => void;
}

function KnowledgeSourcePanel({ config, onChange }: KnowledgeSourcePanelProps) {
  const [urlInput, setUrlInput] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [libraryEntries, setLibraryEntries] = useState<KnowledgeLibraryEntry[]>([]);
  const [libraryMode, setLibraryMode] = useState<'manual' | 'library'>('manual');

  const update = (path: string, value: unknown) => {
    const newConfig = JSON.parse(JSON.stringify(config)) as KnowledgeSourceConfig;
    const parts = path.split('.');
    let obj: Record<string, unknown> = newConfig as unknown as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = value;
    onChange(newConfig);
  };

  const { claudeKnowledge, onlineReference, localFolder, combinedMode } = config.modes;

  useEffect(() => {
    if (localFolder.enabled) {
      fetch('/api/knowledge-library')
        .then(r => r.ok ? r.json() : [])
        .then((data: KnowledgeLibraryEntry[]) => setLibraryEntries(data))
        .catch(() => {});
    }
  }, [localFolder.enabled]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-adv-off-white">Knowledge Sources</span>
        <HelpTooltip text="Where should Claude find regulatory text and reference material?" />
      </div>

      {/* Mode 1: Claude Knowledge */}
      <SourceCard
        icon={<Brain className="h-4 w-4" />}
        title="Claude's Own Knowledge"
        description="Claude uses its built-in knowledge of regulations, guidelines, and legal frameworks."
        enabled={claudeKnowledge.enabled}
        onToggle={(v) => update('modes.claudeKnowledge.enabled', v)}
      >
        <label className="flex items-center gap-2 text-xs text-adv-gray">
          <input
            type="checkbox"
            checked={claudeKnowledge.webSearchEnabled}
            onChange={(e) => update('modes.claudeKnowledge.webSearchEnabled', e.target.checked)}
            className="rounded border-adv-gray-med accent-adv-teal"
          />
          <Globe className="h-3 w-3" />
          Enable web search (Claude searches the internet for latest publications)
        </label>
        <div className="mt-2">
          <label className="text-[11px] text-adv-gray">Focus area (optional):</label>
          <input
            type="text"
            value={claudeKnowledge.description}
            onChange={(e) => update('modes.claudeKnowledge.description', e.target.value)}
            placeholder="e.g., AMLR Regulation 2024/1624, AMLA RTS consultations"
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>
      </SourceCard>

      {/* Mode 2: Online Reference */}
      <SourceCard
        icon={<Link className="h-4 w-4" />}
        title="Online Regulation / Document Links"
        description="Paste URLs to specific regulatory texts, guidelines, or online documents."
        enabled={onlineReference.enabled}
        onToggle={(v) => update('modes.onlineReference.enabled', v)}
      >
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://eur-lex.europa.eu/..."
            className="flex-1 rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
          <button
            onClick={() => {
              if (urlInput.trim()) {
                update('modes.onlineReference.urls', [...onlineReference.urls, urlInput.trim()]);
                setUrlInput('');
              }
            }}
            className="rounded bg-adv-teal-dim px-2 py-1 text-xs text-adv-teal hover:bg-adv-teal/20"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        {onlineReference.urls.length > 0 && (
          <div className="mt-2 space-y-1">
            {onlineReference.urls.map((url, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-adv-dark px-2 py-1 text-xs">
                <span className="flex-1 truncate text-adv-gray">{url}</span>
                <button
                  onClick={() => {
                    const urls = [...onlineReference.urls];
                    urls.splice(i, 1);
                    update('modes.onlineReference.urls', urls);
                  }}
                  className="text-adv-gray hover:text-adv-red"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-3">
          <label className="flex items-center gap-1.5 text-xs text-adv-gray">
            <input
              type="radio"
              checked={onlineReference.fetchDepth === 'full'}
              onChange={() => update('modes.onlineReference.fetchDepth', 'full')}
              className="accent-adv-teal"
            />
            Full text
          </label>
          <label className="flex items-center gap-1.5 text-xs text-adv-gray">
            <input
              type="radio"
              checked={onlineReference.fetchDepth === 'summary'}
              onChange={() => update('modes.onlineReference.fetchDepth', 'summary')}
              className="accent-adv-teal"
            />
            Summary only
          </label>
        </div>

        {/* EUR-Lex Quick Load */}
        <div className="mt-3">
          <p className="text-[11px] text-adv-gray mb-1.5">Quick-load from EUR-Lex:</p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'AMLR', celex: '32024R1624' },
              { label: 'DORA', celex: '32022R2554' },
              { label: 'MiCA', celex: '32023R1114' },
              { label: 'GDPR', celex: '32016R0679' },
              { label: '6AMLD', celex: '32018L1673' },
              { label: 'NIS2', celex: '32022L2555' },
            ].map(({ label, celex }) => (
              <button
                key={celex}
                onClick={() => {
                  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}`;
                  // Add to urls list in onlineReference mode, deduplicate
                  onChange({
                    ...config,
                    modes: {
                      ...config.modes,
                      onlineReference: {
                        ...config.modes.onlineReference,
                        enabled: true,
                        urls: [...(config.modes.onlineReference.urls || []), url].filter(
                          (u, i, a) => a.indexOf(u) === i
                        ),
                      },
                    },
                  });
                }}
                className="rounded px-2 py-0.5 text-[11px] font-medium bg-adv-dark-2 border border-border text-adv-gray hover:border-adv-teal/40 hover:text-adv-teal transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </SourceCard>

      {/* Mode 3: Local Folders */}
      <SourceCard
        icon={<FolderOpen className="h-4 w-4" />}
        title="Local Folders"
        description="Point to folders on your computer containing regulation texts, client documents, or reference materials."
        enabled={localFolder.enabled}
        onToggle={(v) => update('modes.localFolder.enabled', v)}
      >
        {/* Library vs Manual toggle */}
        <div className="flex gap-4 mb-3">
          <label className="flex items-center gap-1.5 text-xs text-adv-gray cursor-pointer">
            <input
              type="radio"
              checked={libraryMode === 'manual'}
              onChange={() => setLibraryMode('manual')}
              className="accent-adv-teal"
            />
            Browse folders manually
          </label>
          <label className="flex items-center gap-1.5 text-xs text-adv-gray cursor-pointer">
            <input
              type="radio"
              checked={libraryMode === 'library'}
              onChange={() => setLibraryMode('library')}
              className="accent-adv-teal"
            />
            Pick from Knowledge Library
          </label>
        </div>

        {libraryMode === 'manual' && (
          <>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="C:\Users\...\Documents\Regulations"
                className="flex-1 rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
              />
              <button
                onClick={() => {
                  if (folderInput.trim()) {
                    update('modes.localFolder.folderPaths', [...localFolder.folderPaths, folderInput.trim()]);
                    setFolderInput('');
                  }
                }}
                className="rounded bg-adv-teal-dim px-2 py-1 text-xs text-adv-teal hover:bg-adv-teal/20"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            {localFolder.folderPaths.length > 0 && (
              <div className="mt-2 space-y-1">
                {localFolder.folderPaths.map((fp, i) => (
                  <div key={i} className="flex items-center gap-2 rounded bg-adv-dark px-2 py-1 text-xs">
                    <FolderOpen className="h-3 w-3 text-adv-teal shrink-0" />
                    <span className="flex-1 truncate text-adv-gray">{fp}</span>
                    <button
                      onClick={() => {
                        const paths = [...localFolder.folderPaths];
                        paths.splice(i, 1);
                        update('modes.localFolder.folderPaths', paths);
                      }}
                      className="text-adv-gray hover:text-adv-red"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="mt-2 flex items-center gap-2 text-xs text-adv-gray">
              <input
                type="checkbox"
                checked={localFolder.recursive}
                onChange={(e) => update('modes.localFolder.recursive', e.target.checked)}
                className="rounded border-adv-gray-med accent-adv-teal"
              />
              Include subfolders
            </label>
          </>
        )}

        {libraryMode === 'library' && (
          <div className="space-y-1.5">
            {libraryEntries.length === 0 ? (
              <p className="text-xs text-adv-gray italic">No corpora in library. Add them in Settings &rarr; Knowledge Library.</p>
            ) : (
              libraryEntries.map(entry => {
                const selected = localFolder.folderPaths.includes(entry.path);
                return (
                  <label
                    key={entry.id}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                      selected ? 'border-adv-teal bg-adv-teal-dim' : 'border-border hover:border-adv-gray-med'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const paths = selected
                          ? localFolder.folderPaths.filter(p => p !== entry.path)
                          : [...localFolder.folderPaths, entry.path];
                        update('modes.localFolder.folderPaths', paths);
                        if (!selected) {
                          update('modes.localFolder.recursive', entry.recursive);
                        }
                      }}
                      className="mt-0.5 accent-adv-teal shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-adv-off-white">{entry.label}</span>
                        <span className={`text-xs px-1 py-0.5 rounded border ${
                          entry.category === 'regulation' ? 'border-adv-blue/30 text-adv-blue' :
                          entry.category === 'client' ? 'border-adv-teal/30 text-adv-teal' :
                          entry.category === 'case_law' ? 'border-adv-gold/30 text-adv-gold' :
                          'border-border text-adv-gray'
                        }`}>
                          {entry.category.replace('_', ' ')}
                        </span>
                        {entry.indexed_at && (
                          <span className="text-xs text-adv-gray">{entry.file_count} files</span>
                        )}
                      </div>
                      <p className="text-xs text-adv-gray mt-0.5 truncate font-mono">{entry.path}</p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
        )}
      </SourceCard>

      {/* Mode 4: Combined */}
      <SourceCard
        icon={<Combine className="h-4 w-4" />}
        title="Combined: Search + Local Documents"
        description="Claude uses its knowledge AND your local documents. Best for comparing client docs against regulations."
        enabled={combinedMode.enabled}
        onToggle={(v) => update('modes.combinedMode.enabled', v)}
      >
        <div className="flex gap-3">
          {(['local_first', 'merged', 'claude_first'] as const).map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-xs text-adv-gray">
              <input
                type="radio"
                checked={combinedMode.priority === p}
                onChange={() => update('modes.combinedMode.priority', p)}
                className="accent-adv-teal"
              />
              {p === 'local_first' ? 'Local docs first' : p === 'merged' ? 'Merged' : 'Claude first'}
            </label>
          ))}
        </div>
        <div className="mt-2">
          <label className="text-[11px] text-adv-gray">Special instructions (optional):</label>
          <textarea
            value={combinedMode.instructions || ''}
            onChange={(e) => update('modes.combinedMode.instructions', e.target.value)}
            placeholder="e.g., Compare the client's policy against the regulation. Where the client doc is silent, use the regulation text to identify the gap."
            className="mt-1 w-full rounded border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            rows={3}
          />
        </div>
      </SourceCard>

      {/* Mode 5: Indexed Knowledge Base (RAG) - Folder-based */}
      <SourceCard
        icon={<Search className="h-4 w-4" />}
        title="Indexed Knowledge Base (Folders)"
        description="Semantic search across your indexed document library. Retrieves the most relevant passages — not whole documents."
        enabled={config.ragMode?.enabled ?? false}
        onToggle={(v) =>
          onChange({
            ...config,
            ragMode: {
              enabled: v,
              folderPaths: config.ragMode?.folderPaths ?? [],
              topK: config.ragMode?.topK ?? 10,
              minScore: config.ragMode?.minScore ?? 0.1,
            },
          })
        }
        badge="Mode 5a"
      >
        <IndexedFoldersList
          selectedPaths={config.ragMode?.folderPaths ?? []}
          localFolderPaths={localFolder.folderPaths}
          onSelectionChange={(paths) =>
            onChange({
              ...config,
              ragMode: { ...config.ragMode!, folderPaths: paths },
            })
          }
        />

        {/* Top-K slider */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-adv-gray">Retrieve</span>
            <span className="text-xs font-medium text-adv-off-white">
              {config.ragMode?.topK ?? 10} passages
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={30}
            step={5}
            value={config.ragMode?.topK ?? 10}
            onChange={(e) =>
              onChange({
                ...config,
                ragMode: { ...config.ragMode!, topK: Number(e.target.value) },
              })
            }
            className="w-full accent-[#2DD4A8]"
          />
          <div className="flex justify-between text-xs text-adv-gray mt-0.5">
            <span>5 (focused)</span>
            <span>30 (broad)</span>
          </div>
        </div>
      </SourceCard>

      {/* Mode 5b: Collection-based RAG Search (NEW) */}
      <SourceCard
        icon={<Database className="h-4 w-4" />}
        title="Knowledge Collections (RAG)"
        description="Semantic search across organized knowledge collections with automatic retrieval during module execution."
        enabled={config.ragSearch?.enabled ?? false}
        onToggle={(v) =>
          onChange({
            ...config,
            ragSearch: {
              enabled: v,
              collections: config.ragSearch?.collections ?? [],
              topK: config.ragSearch?.topK ?? 10,
              rerank: config.ragSearch?.rerank ?? true,
              showRelevance: config.ragSearch?.showRelevance ?? true,
            },
          })
        }
        badge="Mode 5b"
      >
        <RAGSearchPanel
          enabled={config.ragSearch?.enabled ?? false}
          onEnabledChange={(v) =>
            onChange({
              ...config,
              ragSearch: { ...config.ragSearch!, enabled: v },
            })
          }
          selectedCollections={config.ragSearch?.collections ?? []}
          onCollectionsChange={(collections) =>
            onChange({
              ...config,
              ragSearch: { ...config.ragSearch!, collections },
            })
          }
          topK={config.ragSearch?.topK ?? 10}
          onTopKChange={(topK) =>
            onChange({
              ...config,
              ragSearch: { ...config.ragSearch!, topK },
            })
          }
          rerank={config.ragSearch?.rerank ?? true}
          onRerankChange={(rerank) =>
            onChange({
              ...config,
              ragSearch: { ...config.ragSearch!, rerank },
            })
          }
        />
      </SourceCard>

      {/* Mode 6: Regulatory Knowledge Packs */}
      <RegulatoryPacksCard />
    </div>
  );
}

export default memo(KnowledgeSourcePanel);

// ── RegulatoryPacksCard sub-component ─────────────────────────

interface PackSummary {
  id: string;
  display_name: string;
  version: string;
  jurisdiction: string | null;
  entity_count: number;
  relationship_count: number;
  status: 'installed' | 'active' | 'deactivated' | 'error';
}

function RegulatoryPacksCard() {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` });

  const loadPacks = useCallback(async () => {
    try {
      const res = await fetch('/api/knowledge-packs', { headers: authHdr() });
      if (res.ok) {
        const data = await res.json();
        setPacks(data.packs || []);
      }
    } catch {
      // API not available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPacks(); }, [loadPacks]);

  const activePacks = packs.filter((p) => p.status === 'active');
  const isEnabled = activePacks.length > 0;

  const togglePack = async (pack: PackSummary) => {
    setToggling(pack.id);
    try {
      const action = pack.status === 'active' ? 'deactivate' : 'activate';
      const res = await fetch(`/api/knowledge-packs/${pack.id}/${action}`, {
        method: 'PATCH',
        headers: authHdr(),
      });
      if (res.ok) await loadPacks();
    } catch {
      // toggle failed
    } finally {
      setToggling(null);
    }
  };

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isEnabled ? 'border-adv-teal/30 bg-adv-teal-soft/30' : 'border-border bg-adv-card'
      }`}
    >
      <button
        onClick={() => { if (packs.length > 0) setExpanded((e) => !e); }}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className={isEnabled ? 'text-adv-teal' : 'text-adv-gray'}>
          <Package className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className={`text-xs font-medium ${isEnabled ? 'text-adv-white' : 'text-adv-gray'}`}>
            Regulatory Knowledge Packs
            <span className="ml-2 inline-block rounded bg-adv-teal-dim px-1.5 py-0.5 text-xs font-normal text-adv-teal">
              Mode 6
            </span>
          </div>
          <div className="text-[11px] text-adv-gray">
            {loading
              ? 'Loading packs…'
              : activePacks.length > 0
              ? `${activePacks.length} pack${activePacks.length > 1 ? 's' : ''} active — curated regulatory entities injected into every prompt`
              : packs.length > 0
              ? `${packs.length} pack${packs.length > 1 ? 's' : ''} installed — activate to inject into analysis`
              : 'Pre-built regulatory intelligence. Install packs in Knowledge Base → Regulatory Packs.'}
          </div>
        </div>
        {packs.length > 0 &&
          (expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-adv-gray" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />
          ))}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2 space-y-2">
          {packs.map((pack) => {
            const isActive = pack.status === 'active';
            const isLoading = toggling === pack.id;
            return (
              <div
                key={pack.id}
                className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${
                  isActive
                    ? 'border-adv-teal/30 bg-adv-teal-dim/40'
                    : 'border-border bg-adv-dark'
                }`}
              >
                {isActive && <Zap className="h-3.5 w-3.5 text-adv-teal shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-adv-off-white">{pack.display_name}</span>
                    <span className="text-xs text-adv-gray">v{pack.version}</span>
                    {pack.jurisdiction && (
                      <span className="text-xs px-1 py-0.5 rounded bg-adv-dark-2 border border-border text-adv-gray">
                        {pack.jurisdiction}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-adv-gray mt-0.5">
                    {pack.entity_count} entities · {pack.relationship_count} relationships
                    {isActive && <span className="ml-2 text-adv-teal font-medium">Active</span>}
                  </div>
                </div>
                <button
                  onClick={() => togglePack(pack)}
                  disabled={isLoading}
                  className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium border transition-colors ${
                    isLoading
                      ? 'opacity-50 cursor-not-allowed border-border text-adv-gray'
                      : isActive
                      ? 'border-adv-teal/30 bg-adv-teal-dim text-adv-teal hover:border-adv-red/30 hover:bg-red-900/20 hover:text-adv-red'
                      : 'border-border bg-adv-dark-2 text-adv-gray hover:border-adv-teal/30 hover:bg-adv-teal-dim hover:text-adv-teal'
                  }`}
                >
                  {isLoading ? '…' : isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            );
          })}

          <button
            onClick={() => { window.location.href = '/knowledge-base?tab=regulatory-packs'; }}
            className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors mt-1"
          >
            <ArrowRight className="h-3 w-3" />
            Manage packs in Knowledge Base
          </button>
        </div>
      )}
    </div>
  );
}

// ── IndexedFoldersList sub-component ──────────────────────────

function IndexedFoldersList({
  selectedPaths,
  localFolderPaths,
  onSelectionChange,
}: {
  selectedPaths: string[];
  localFolderPaths: string[];
  onSelectionChange: (paths: string[]) => void;
}) {
  const [indexedFolders, setIndexedFolders] = useState<RagIndexedFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexingPaths, setIndexingPaths] = useState<Set<string>>(new Set());

  const loadFolders = useCallback(async () => {
    try {
      setLoading(true);
      const folders = await fetchRagFolders();
      setIndexedFolders(folders);
    } catch {
      // API not available yet — leave empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleIndex = async (folderPath: string) => {
    setIndexingPaths((prev) => new Set(prev).add(folderPath));
    try {
      await indexRagFolder(folderPath);
      await loadFolders();
    } catch {
      // indexing failed — will show as not indexed
    } finally {
      setIndexingPaths((prev) => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
    }
  };

  const toggleFolder = (folderPath: string) => {
    if (selectedPaths.includes(folderPath)) {
      onSelectionChange(selectedPaths.filter((p) => p !== folderPath));
    } else {
      onSelectionChange([...selectedPaths, folderPath]);
    }
  };

  const indexedPathSet = new Set(indexedFolders.map((f) => f.folder_path));
  const unindexedLocal = localFolderPaths.filter((p) => !indexedPathSet.has(p));

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-adv-gray py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading indexed folders...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Already indexed folders */}
      {indexedFolders.length > 0 && (
        <div className="space-y-1">
          {indexedFolders.map((folder) => {
            const isSelected = selectedPaths.includes(folder.folder_path);
            const isReindexing = indexingPaths.has(folder.folder_path);
            return (
              <div
                key={folder.folder_path}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors ${
                  isSelected ? 'bg-adv-teal-dim/40 border border-adv-teal/20' : 'bg-adv-dark'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleFolder(folder.folder_path)}
                  className="rounded border-adv-gray-med accent-adv-teal shrink-0"
                />
                <Database className="h-3 w-3 text-adv-teal shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-adv-gray">{folder.folder_path}</div>
                  <div className="text-xs text-adv-gray">
                    {folder.document_count} docs · {folder.chunk_count} chunks · indexed{' '}
                    {formatRelativeTime(folder.last_indexed)}
                  </div>
                </div>
                {folder.status === 'indexing' || isReindexing ? (
                  <Loader2 className="h-3 w-3 animate-spin text-adv-teal shrink-0" />
                ) : (
                  <button
                    onClick={() => handleIndex(folder.folder_path)}
                    className="text-adv-gray hover:text-adv-teal shrink-0"
                    title="Reindex"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unindexed local folders (from Mode 3) */}
      {unindexedLocal.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-adv-gray font-medium uppercase tracking-wider mt-1">
            Not yet indexed
          </div>
          {unindexedLocal.map((folderPath) => {
            const isIndexing = indexingPaths.has(folderPath);
            return (
              <div
                key={folderPath}
                className="flex items-center gap-2 rounded bg-adv-dark px-2 py-1.5 text-xs"
              >
                <FolderOpen className="h-3 w-3 text-adv-gray shrink-0" />
                <span className="flex-1 truncate text-adv-gray">{folderPath}</span>
                {isIndexing ? (
                  <Loader2 className="h-3 w-3 animate-spin text-adv-teal shrink-0" />
                ) : (
                  <button
                    onClick={() => handleIndex(folderPath)}
                    className="rounded bg-adv-teal-dim px-2 py-0.5 text-xs text-adv-teal hover:bg-adv-teal/20 shrink-0"
                  >
                    Index Now
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {indexedFolders.length === 0 && unindexedLocal.length === 0 && (
        <div className="rounded bg-adv-dark px-3 py-2 text-xs text-adv-gray">
          No indexed folders yet. Add folders in Mode 3 (Local Folders) first, then index them here for semantic search.
        </div>
      )}

      {/* Selection summary */}
      {selectedPaths.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-adv-teal mt-1">
          <CheckCircle2 className="h-3 w-3" />
          {selectedPaths.length} folder{selectedPaths.length > 1 ? 's' : ''} selected for search
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return isoString;
  }
}

// ── SourceCard sub-component ───────────────────────────────

function SourceCard({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  badge?: string;
}) {
  const [expanded, setExpanded] = useState(enabled);

  return (
    <div
      className={`rounded-lg border transition-colors ${
        enabled ? 'border-adv-teal/30 bg-adv-teal-soft/30' : 'border-border bg-adv-card'
      }`}
    >
      <button
        onClick={() => {
          if (!enabled) {
            onToggle(true);
            setExpanded(true);
          } else {
            setExpanded(!expanded);
          }
        }}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(e.target.checked);
            if (e.target.checked) setExpanded(true);
          }}
          className="rounded border-adv-gray-med accent-adv-teal"
          onClick={(e) => e.stopPropagation()}
        />
        <div className={enabled ? 'text-adv-teal' : 'text-adv-gray'}>{icon}</div>
        <div className="flex-1">
          <div className={`text-xs font-medium ${enabled ? 'text-adv-white' : 'text-adv-gray'}`}>
            {title}
            {badge && (
              <span className="ml-2 inline-block rounded bg-adv-teal-dim px-1.5 py-0.5 text-xs font-normal text-adv-teal">
                {badge}
              </span>
            )}
          </div>
          <div className="text-[11px] text-adv-gray">{description}</div>
        </div>
        {enabled &&
          (expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-adv-gray" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-adv-gray" />
          ))}
      </button>
      {enabled && expanded && <div className="border-t border-border/50 px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}
