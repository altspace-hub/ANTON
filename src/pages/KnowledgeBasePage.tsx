import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Trash2, FileText, Database as DatabaseIcon, AlertCircle, RefreshCw,
  Package, Upload, CheckCircle, XCircle, Globe, ToggleLeft, ToggleRight, Eye,
  ChevronDown, ChevronUp, Download, ArrowRight, BookOpen, Link2, X,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { CreateCollectionModal } from '../components/knowledge/CreateCollectionModal';
import { DocumentUploader } from '../components/knowledge/DocumentUploader';

// ── Shared types ─────────────────────────────────────────────────────────────

interface Collection {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  documentCount: number;
  chunkCount: number;
}

interface Document {
  id: string;
  filename: string;
  file_size: number;
  chunk_count: number;
  uploaded_at: string;
  index_status: 'pending' | 'indexing' | 'indexed' | 'failed';
}

interface KnowledgePack {
  id: string;
  name: string;
  display_name: string;
  version: string;
  description: string | null;
  jurisdiction: string | null;
  regulatory_area: string | null;
  regulation_ids: string[];
  author: string | null;
  publisher: string | null;
  tier: number;
  entity_count: number;
  relationship_count: number;
  alias_count: number;
  status: 'installed' | 'active' | 'deactivated' | 'error';
  imported_at: string;
}

interface BundledPackInfo {
  slug: string;
  display_name: string;
  version: string;
  description: string | null;
  regulatory_area: string | null;
  regulation_ids: string[];
  entity_count: number;
  relationship_count: number;
  alias_count: number;
  tier: number;
  installed_pack_id: string | null;
  status: 'available' | 'installed' | 'active' | 'deactivated';
}

interface PackEntity {
  entity_type: string;
  entity_id: string;
  canonical_name: string;
  metadata: string | null;
}

interface PackRelationship {
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relationship_type: string;
  strength: number;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` });

// ── Collections Tab ───────────────────────────────────────────────────────────

function CollectionsTab() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { loadCollections(); }, []);
  useEffect(() => { if (selectedCollection) loadDocuments(selectedCollection); }, [selectedCollection]);

  const loadCollections = async () => {
    try {
      const res = await fetch('/api/collections', { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setCollections(data.collections || []);
      if (data.collections?.length && !selectedCollection) {
        setSelectedCollection(data.collections[0].id);
      }
    } catch (e) { console.error('Failed to load collections:', e); }
  };

  const loadDocuments = async (collectionId: string) => {
    try {
      const res = await fetch(`/api/documents/collection/${collectionId}`, { headers: authHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (e) { console.error('Failed to load documents:', e); }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm('Delete this document? This will remove all indexed chunks.')) return;
    try {
      await fetch(`/api/documents/${documentId}`, { method: 'DELETE', headers: authHeader() });
      if (selectedCollection) loadDocuments(selectedCollection);
    } catch (e) { console.error('Failed to delete document:', e); }
  };

  const selectedCollectionData = collections.find((c) => c.id === selectedCollection);
  const IconComponent = selectedCollectionData
    ? (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[selectedCollectionData.icon]
    : null;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Collections Sidebar */}
      <div className="w-80 bg-adv-card border-r border-adv-gray-med p-4 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-adv-off-white">Collections</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 text-adv-teal hover:bg-adv-teal/10 rounded transition-colors"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2">
          {collections.map((collection) => {
            const Icon = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[collection.icon];
            return (
              <button
                key={collection.id}
                onClick={() => setSelectedCollection(collection.id)}
                className={`w-full flex items-center gap-3 p-3 rounded transition-colors ${
                  selectedCollection === collection.id
                    ? 'bg-adv-teal/10 border border-adv-teal'
                    : 'hover:bg-adv-dark border border-transparent'
                }`}
              >
                {Icon && (
                  <div className="p-2 rounded" style={{ backgroundColor: `${collection.color}20` }}>
                    <Icon className="h-5 w-5" style={{ color: collection.color }} />
                  </div>
                )}
                <div className="flex-1 text-left">
                  <div className="text-sm font-medium text-adv-off-white">{collection.display_name}</div>
                  <div className="text-xs text-adv-gray">
                    {collection.documentCount} docs · {collection.chunkCount} chunks
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Documents Area */}
      <div className="flex-1 overflow-auto p-6">
        {selectedCollectionData ? (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                {IconComponent && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: `${selectedCollectionData.color}20` }}>
                    <IconComponent className="h-6 w-6" style={{ color: selectedCollectionData.color }} />
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold text-adv-off-white">{selectedCollectionData.display_name}</h1>
                  <p className="text-sm text-adv-gray">{selectedCollectionData.description}</p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <DocumentUploader
                collectionId={selectedCollection!}
                onUploadComplete={() => {
                  loadDocuments(selectedCollection!);
                  loadCollections();
                }}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-adv-off-white mb-4">Documents ({documents.length})</h3>
              <div className="grid gap-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-4 bg-adv-card rounded border transition-colors ${
                      doc.index_status === 'failed'
                        ? 'border-adv-red/40'
                        : doc.index_status === 'indexing'
                        ? 'border-adv-gold/40'
                        : 'border-adv-gray-med hover:border-adv-teal'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {doc.index_status === 'failed' ? (
                        <AlertCircle className="h-5 w-5 text-adv-red flex-shrink-0" />
                      ) : doc.index_status === 'indexing' ? (
                        <RefreshCw className="h-5 w-5 text-adv-gold animate-spin flex-shrink-0" />
                      ) : (
                        <FileText className="h-5 w-5 text-adv-gray flex-shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-medium text-adv-off-white">{doc.filename}</div>
                        <div className="text-xs text-adv-gray">
                          {doc.index_status === 'failed' ? (
                            <span className="text-adv-red">Indexing failed — delete and re-upload</span>
                          ) : doc.index_status === 'indexing' ? (
                            <span className="text-adv-gold">Indexing in progress...</span>
                          ) : (
                            <>
                              {doc.chunk_count} chunks · {(doc.file_size / 1024).toFixed(1)} KB · Uploaded{' '}
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="p-2 text-adv-gray hover:text-adv-red transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <DatabaseIcon className="h-16 w-16 text-adv-gray-med mb-4" />
            <h2 className="text-xl font-semibold text-adv-off-white mb-2">No Collection Selected</h2>
            <p className="text-sm text-adv-gray mb-6">Create a collection to get started</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-adv-teal text-white rounded hover:bg-adv-teal-dark transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Collection
            </button>
          </div>
        )}
      </div>

      <CreateCollectionModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => { loadCollections(); setShowCreateModal(false); }}
      />
    </div>
  );
}

// ── Pack status badge ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: KnowledgePack['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    active:      { label: 'Active',      cls: 'bg-adv-green/15 text-adv-green border border-adv-green/30' },
    installed:   { label: 'Installed',   cls: 'bg-adv-blue/15 text-adv-blue border border-adv-blue/30' },
    deactivated: { label: 'Deactivated', cls: 'bg-adv-gray-med/20 text-adv-gray border border-adv-gray-med/30' },
    error:       { label: 'Error',       cls: 'bg-adv-red/15 text-adv-red border border-adv-red/30' },
  };
  const s = map[status] ?? map.installed;
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

// ── Pack tier badge ───────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: number }) {
  const label = tier === 1 ? 'Tier 1 — Core' : tier === 2 ? 'Tier 2 — Standard' : 'Tier 3 — Extended';
  const cls = tier === 1 ? 'text-adv-gold' : tier === 2 ? 'text-adv-teal' : 'text-adv-gray';
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

// ── Activation Confirmation Modal ─────────────────────────────────────────────

interface ActivateConfirmProps {
  pack: KnowledgePack;
  onConfirm: () => void;
  onCancel: () => void;
}

function ActivateConfirmModal({ pack, onConfirm, onCancel }: ActivateConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-adv-card border border-adv-gray-med rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-adv-teal/15">
            <Package className="h-5 w-5 text-adv-teal" />
          </div>
          <h2 className="text-lg font-semibold text-adv-off-white">Activate Knowledge Pack</h2>
        </div>
        <p className="text-sm text-adv-gray mb-4">
          This will make <span className="text-adv-off-white font-medium">{pack.display_name}</span>'s structured
          regulatory data available to Claude across all sessions.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-5 p-3 bg-adv-dark rounded-lg text-center">
          <div>
            <div className="text-xl font-bold text-adv-off-white">{pack.entity_count.toLocaleString()}</div>
            <div className="text-xs text-adv-gray">Entities</div>
          </div>
          <div>
            <div className="text-xl font-bold text-adv-off-white">{pack.relationship_count.toLocaleString()}</div>
            <div className="text-xs text-adv-gray">Relationships</div>
          </div>
          <div>
            <div className="text-xl font-bold text-adv-off-white">{pack.alias_count.toLocaleString()}</div>
            <div className="text-xs text-adv-gray">Aliases</div>
          </div>
        </div>
        <p className="text-xs text-adv-gray mb-5">
          Existing entities with matching names will be linked, not duplicated.
          You can deactivate the pack at any time — entities remain installed for instant re-activation.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-adv-gray-med text-adv-gray hover:text-adv-off-white rounded transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white rounded transition-colors text-sm font-medium flex items-center justify-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            Activate Pack
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  pack: KnowledgePack;
  onClose: () => void;
  onActivate: (pack: KnowledgePack) => void;
}

function PreviewModal({ pack, onClose, onActivate }: PreviewModalProps) {
  const [tab, setTab] = useState<'entities' | 'relationships'>('entities');
  const [entities, setEntities] = useState<PackEntity[]>([]);
  const [relationships, setRelationships] = useState<PackRelationship[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(true);
  const [loadingRels, setLoadingRels] = useState(false);

  useEffect(() => {
    setLoadingEntities(true);
    fetch(`/api/knowledge-packs/${pack.id}/entities?limit=50`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d) => { setEntities(d.entities || []); setLoadingEntities(false); })
      .catch(() => setLoadingEntities(false));
  }, [pack.id]);

  const loadRelationships = useCallback(() => {
    if (relationships.length > 0) return;
    setLoadingRels(true);
    fetch(`/api/knowledge-packs/${pack.id}/relationships?limit=50`, { headers: authHeader() })
      .then((r) => r.json())
      .then((d) => { setRelationships(d.relationships || []); setLoadingRels(false); })
      .catch(() => setLoadingRels(false));
  }, [pack.id, relationships.length]);

  useEffect(() => {
    if (tab === 'relationships') loadRelationships();
  }, [tab, loadRelationships]);

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div className="bg-adv-card border border-adv-gray-med rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[80vh]">
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-adv-gray-med">
          <div>
            <h2 className="text-lg font-semibold text-adv-off-white">{pack.display_name}</h2>
            <p className="text-xs text-adv-gray mt-0.5">v{pack.version} · {pack.regulatory_area ?? 'Regulatory'}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="p-2 text-adv-gray hover:text-adv-off-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-6 px-5 py-3 border-b border-adv-gray-med bg-adv-dark/40">
          <div className="flex items-center gap-1.5 text-sm">
            <BookOpen className="h-4 w-4 text-adv-teal" />
            <span className="text-adv-off-white font-medium">{pack.entity_count.toLocaleString()}</span>
            <span className="text-adv-gray">entities</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Link2 className="h-4 w-4 text-adv-blue" />
            <span className="text-adv-off-white font-medium">{pack.relationship_count.toLocaleString()}</span>
            <span className="text-adv-gray">relationships</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-adv-gray-med px-5">
          {(['entities', 'relationships'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-adv-teal text-adv-teal'
                  : 'border-transparent text-adv-gray hover:text-adv-off-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'entities' && (
            loadingEntities ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 text-adv-teal animate-spin" /></div>
            ) : (
              <div className="space-y-1.5">
                {entities.map((e, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2.5 bg-adv-dark rounded-lg">
                    <span className="px-2 py-0.5 bg-adv-teal/10 text-adv-teal rounded font-mono flex-shrink-0">
                      {e.entity_type}
                    </span>
                    <span className="text-adv-off-white font-medium">{e.canonical_name}</span>
                    <span className="text-adv-gray ml-auto font-mono truncate max-w-32">{e.entity_id}</span>
                  </div>
                ))}
                {entities.length === 50 && (
                  <p className="text-center text-xs text-adv-gray pt-2">Showing first 50 of {pack.entity_count} entities</p>
                )}
              </div>
            )
          )}
          {tab === 'relationships' && (
            loadingRels ? (
              <div className="flex justify-center py-8"><RefreshCw className="h-6 w-6 text-adv-teal animate-spin" /></div>
            ) : (
              <div className="space-y-1.5">
                {relationships.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2.5 bg-adv-dark rounded-lg">
                    <span className="text-adv-off-white font-mono truncate max-w-28">{r.source_id}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-adv-gray flex-shrink-0" />
                    <span className="px-2 py-0.5 bg-adv-blue/10 text-adv-blue rounded font-medium flex-shrink-0">
                      {r.relationship_type}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-adv-gray flex-shrink-0" />
                    <span className="text-adv-off-white font-mono truncate max-w-28">{r.target_id}</span>
                    <span className="ml-auto text-adv-gray-med">{(r.strength * 100).toFixed(0)}%</span>
                  </div>
                ))}
                {relationships.length === 50 && (
                  <p className="text-center text-xs text-adv-gray pt-2">Showing first 50 of {pack.relationship_count} relationships</p>
                )}
              </div>
            )
          )}
        </div>

        {/* Modal footer */}
        {pack.status !== 'active' && (
          <div className="p-4 border-t border-adv-gray-med flex justify-end">
            <button
              onClick={() => { onClose(); onActivate(pack); }}
              className="px-5 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white rounded transition-colors text-sm font-medium flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Activate This Pack
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Regulatory Packs Tab ──────────────────────────────────────────────────────

function RegulatoryPacksTab() {
  const [packs, setPacks] = useState<KnowledgePack[]>([]);
  const [bundledPacks, setBundledPacks] = useState<BundledPackInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<KnowledgePack | null>(null);
  const [previewPack, setPreviewPack] = useState<KnowledgePack | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [packsRes, bundledRes] = await Promise.all([
        fetch('/api/knowledge-packs', { headers: authHeader() }),
        fetch('/api/knowledge-packs/bundled/list', { headers: authHeader() }),
      ]);
      if (packsRes.ok) {
        const d = await packsRes.json();
        setPacks(d.packs || []);
      }
      if (bundledRes.ok) {
        const d = await bundledRes.json();
        setBundledPacks(d.packs || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load packs');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('bundle', file);
      const res = await fetch('/api/knowledge-packs/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('openexpert-token')}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInstallBundled = async (slug: string) => {
    setInstallingSlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge-packs/bundled/${slug}/install`, {
        method: 'POST',
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Install failed');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed');
    } finally {
      setInstallingSlug(null);
    }
  };

  const confirmAndActivate = (pack: KnowledgePack) => setConfirmActivate(pack);

  const handleActivate = async (pack: KnowledgePack) => {
    setConfirmActivate(null);
    try {
      const res = await fetch(`/api/knowledge-packs/${pack.id}/activate`, { method: 'PATCH', headers: authHeader() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Activate failed'); }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activate failed');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge-packs/${id}/deactivate`, { method: 'PATCH', headers: authHeader() });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Deactivate failed'); }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete pack "${name}"?\n\nEntities that were only in this pack will be removed from the knowledge graph. Entities shared with workflow extractions will be retained.`)) return;
    try {
      const res = await fetch(`/api/knowledge-packs/${id}`, { method: 'DELETE', headers: authHeader() });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Delete failed');
      }
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <RefreshCw className="h-8 w-8 text-adv-teal animate-spin" />
      </div>
    );
  }

  // Bundled packs that haven't been installed yet
  const availableBundled = bundledPacks.filter((b) => b.status === 'available');

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white">Regulatory Knowledge Packs</h1>
          <p className="text-sm text-adv-gray mt-1">
            Pre-structured regulatory entity graphs that enrich Claude's context with structured knowledge about regulations, obligations, and authorities.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".anton"
            className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) handleImport(e.target.files[0]); }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white rounded transition-colors disabled:opacity-50"
          >
            {importing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? 'Importing…' : 'Import .anton Pack'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-adv-red/10 border border-adv-red/30 rounded text-adv-red text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-adv-gray hover:text-adv-off-white" aria-label="Dismiss error">×</button>
        </div>
      )}

      {/* Bundled / available packs */}
      {availableBundled.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-adv-gray uppercase tracking-wide mb-3">Available — Ships with ANTON</h2>
          <div className="grid gap-3">
            {availableBundled.map((b) => (
              <div key={b.slug} className="flex items-center justify-between p-4 bg-adv-card border border-adv-gray-med/50 rounded-lg hover:border-adv-teal/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-adv-teal-dim">
                    <Download className="h-4 w-4 text-adv-teal" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-adv-off-white">{b.display_name}</span>
                      <span className="text-xs px-2 py-0.5 bg-adv-teal-dim text-adv-teal rounded-full border border-adv-teal/20">Bundled</span>
                      {b.tier === 1 && <span className="text-xs text-adv-gold">Tier 1 — Core</span>}
                    </div>
                    <div className="text-xs text-adv-gray mt-0.5">
                      {b.regulatory_area && <span className="mr-2">{b.regulatory_area}</span>}
                      {b.entity_count} entities · {b.relationship_count} relationships · v{b.version}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleInstallBundled(b.slug)}
                  disabled={installingSlug === b.slug}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs bg-adv-teal/10 hover:bg-adv-teal/20 text-adv-teal border border-adv-teal/30 rounded transition-colors disabled:opacity-50"
                >
                  {installingSlug === b.slug ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {installingSlug === b.slug ? 'Installing…' : 'Install'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Installed / active packs */}
      {packs.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-adv-gray uppercase tracking-wide mb-3">Installed</h2>
          <div className="space-y-4">
            {packs.map((pack) => {
              const isExpanded = expandedId === pack.id;
              return (
                <div
                  key={pack.id}
                  className={`bg-adv-card border rounded-lg overflow-hidden transition-colors ${
                    pack.status === 'active' ? 'border-adv-teal/40' : 'border-adv-gray-med'
                  }`}
                >
                  {/* Pack header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-lg mt-0.5 ${pack.status === 'active' ? 'bg-adv-teal/15' : 'bg-adv-card'}`}>
                          <Package className={`h-5 w-5 ${pack.status === 'active' ? 'text-adv-teal' : 'text-adv-gray'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-base font-semibold text-adv-off-white">{pack.display_name}</span>
                            <StatusBadge status={pack.status} />
                            <TierBadge tier={pack.tier} />
                          </div>
                          <div className="text-xs text-adv-gray mt-0.5">v{pack.version}</div>
                          {pack.description && (
                            <p className="text-sm text-adv-gray mt-1 max-w-xl">{pack.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 flex-wrap">
                            {pack.jurisdiction && (
                              <span className="flex items-center gap-1 text-xs text-adv-gray">
                                <Globe className="h-3 w-3" />{pack.jurisdiction}
                              </span>
                            )}
                            {pack.regulatory_area && (
                              <span className="text-xs text-adv-gray">{pack.regulatory_area}</span>
                            )}
                            {pack.regulation_ids.length > 0 && (
                              <span className="text-xs text-adv-blue">{pack.regulation_ids.join(' · ')}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => setPreviewPack(pack)}
                          title="Preview entities & relationships"
                          aria-label={`Preview ${pack.display_name}`}
                          className="p-2 text-adv-gray hover:text-adv-teal transition-colors rounded hover:bg-adv-teal/10"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {pack.status === 'active' ? (
                          <button
                            onClick={() => handleDeactivate(pack.id)}
                            aria-label={`Deactivate ${pack.display_name}`}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-adv-teal/10 hover:bg-adv-teal/20 text-adv-teal border border-adv-teal/30 rounded transition-colors"
                          >
                            <ToggleRight className="h-3.5 w-3.5" aria-hidden="true" />
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => confirmAndActivate(pack)}
                            aria-label={`Activate ${pack.display_name}`}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-adv-gray-med/10 hover:bg-adv-teal/10 text-adv-gray hover:text-adv-teal border border-adv-gray-med/30 hover:border-adv-teal/30 rounded transition-colors"
                          >
                            <ToggleLeft className="h-3.5 w-3.5" aria-hidden="true" />
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(pack.id, pack.display_name)}
                          aria-label={`Delete ${pack.display_name}`}
                          className="p-2 text-adv-gray hover:text-adv-red transition-colors"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : pack.id)}
                          aria-label={isExpanded ? 'Collapse pack details' : 'Expand pack details'}
                          aria-expanded={isExpanded}
                          className="p-2 text-adv-gray hover:text-adv-off-white transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-6 mt-3 pt-3 border-t border-adv-gray-med/30">
                      <div className="text-center">
                        <div className="text-lg font-bold text-adv-off-white">{pack.entity_count.toLocaleString()}</div>
                        <div className="text-xs text-adv-gray">Entities</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-adv-off-white">{pack.relationship_count.toLocaleString()}</div>
                        <div className="text-xs text-adv-gray">Relationships</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-adv-off-white">{pack.alias_count.toLocaleString()}</div>
                        <div className="text-xs text-adv-gray">Aliases</div>
                      </div>
                      <div className="ml-auto text-xs text-adv-gray">
                        Imported {new Date(pack.imported_at).toLocaleDateString()}
                        {pack.author && ` · By ${pack.author}`}
                      </div>
                    </div>
                  </div>

                  {/* Expanded: metadata */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-adv-gray-med/30 pt-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {pack.publisher && (
                          <div><span className="text-adv-gray">Publisher:</span> <span className="text-adv-off-white">{pack.publisher}</span></div>
                        )}
                        {pack.author && (
                          <div><span className="text-adv-gray">Author:</span> <span className="text-adv-off-white">{pack.author}</span></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* True empty state — no bundled, no installed */}
      {packs.length === 0 && availableBundled.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Package className="h-16 w-16 text-adv-gray-med mb-4" />
          <h2 className="text-xl font-semibold text-adv-off-white mb-2">No Knowledge Packs</h2>
          <p className="text-sm text-adv-gray mb-6 max-w-md">
            Import a Regulatory Knowledge Pack (.anton file) to provide Claude with structured knowledge about regulations, articles, and compliance obligations.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-adv-teal text-white rounded hover:bg-adv-teal-dark transition-colors flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import First Pack
          </button>
        </div>
      )}

      {/* Info footer */}
      {packs.length > 0 && (
        <div className="mt-6 p-4 bg-adv-teal-soft border border-adv-teal/20 rounded-lg">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-adv-teal flex-shrink-0 mt-0.5" />
            <div className="text-sm text-adv-gray">
              <span className="text-adv-teal font-medium">Active packs</span> inject structured regulatory entity context into every prompt.
              Deactivated packs remain installed but don't affect AI responses.
              Active packs must be deactivated before deletion.
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {confirmActivate && (
        <ActivateConfirmModal
          pack={confirmActivate}
          onConfirm={() => handleActivate(confirmActivate)}
          onCancel={() => setConfirmActivate(null)}
        />
      )}
      {previewPack && (
        <PreviewModal
          pack={previewPack}
          onClose={() => setPreviewPack(null)}
          onActivate={(p) => { setPreviewPack(null); confirmAndActivate(p); }}
        />
      )}
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

type Tab = 'collections' | 'regulatory-packs';

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<Tab>('collections');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'collections', label: 'Collections', icon: <DatabaseIcon className="h-4 w-4" /> },
    { id: 'regulatory-packs', label: 'Regulatory Packs', icon: <Package className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col h-screen bg-adv-dark">
      {/* Tab bar */}
      <div className="flex items-center border-b border-adv-gray-med bg-adv-dark-2 px-6 pt-4">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-adv-teal text-adv-teal bg-adv-card'
                  : 'border-transparent text-adv-gray hover:text-adv-off-white hover:border-adv-gray-med'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex flex-1 overflow-hidden">
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'regulatory-packs' && <RegulatoryPacksTab />}
      </div>
    </div>
  );
}
