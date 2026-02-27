/**
 * EngagementResourceCollection.tsx
 * Phase 3: Resource Collection
 * Upload and manage resources across 6 categories with status toggles.
 */

import { useState, useRef } from 'react';
import {
  FileText, Mic, BookOpen, BarChart2, Code2, Upload,
  ChevronRight, Loader2, CheckCircle, Clock, AlertCircle,
  ChevronDown, ChevronUp, Trash2, Star, Link, Plus,
  FolderSearch, X, RefreshCw, Info
} from 'lucide-react';
import { getAuthHeader } from '@/lib/api';
import type { EngagementData, Resource } from '@/pages/EngagementWorkspacePage';
import EngagementPeerBenchmarks from './EngagementPeerBenchmarks';

interface Props {
  engagement: EngagementData;
  onUpdate: (updates: Partial<EngagementData>) => void;
  onNext: () => void;
  onReload: () => void;
}

type CategoryStatus = 'available' | 'coming_later' | 'not_available';

interface CategoryDef {
  id: Resource['category'];
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  examples: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: 'documents',    label: 'Documents & Policies',     icon: FileText,  description: 'AML policies, procedures, risk assessments, board reports', examples: 'AML Policy, CDD Procedures, BWRA, Previous audit findings' },
  { id: 'meetings',     label: 'Meeting Notes & Transcripts', icon: Mic,    description: 'Kick-off notes, interview transcripts, workshop outputs', examples: 'Kick-off meeting notes, MLRO interview transcript' },
  { id: 'regulations',  label: 'Laws, Regulations & Standards', icon: BookOpen, description: 'Regulatory texts, EBA guidelines, national laws', examples: 'AMLR text, EBA GL/2022/05, National transposition acts' },
  { id: 'data',         label: 'Data & Testing Results',    icon: BarChart2, description: 'TM hit rates, false positive analysis, system exports', examples: 'TM hit rate report, CDD data quality report' },
  { id: 'code',         label: 'Code & Technical Artefacts', icon: Code2,   description: 'TM rule libraries, API docs, system architecture', examples: 'TM rule configuration, API documentation' },
];

const STATUS_CONFIG: Record<CategoryStatus, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  available:     { label: 'Available',           icon: CheckCircle, color: 'text-adv-green border-adv-green/30 bg-adv-green/10' },
  coming_later:  { label: 'Coming Later',        icon: Clock,       color: 'text-adv-gold border-adv-gold/30 bg-adv-gold/10' },
  not_available: { label: 'Not Available',       icon: AlertCircle, color: 'text-adv-red border-adv-red/30 bg-adv-red/10' },
};

export default function EngagementResourceCollection({ engagement, onUpdate, onNext, onReload }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['documents']));
  const [uploading, setUploading] = useState<string | null>(null);
  const [addingUrl, setAddingUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [addingUrlLoading, setAddingUrlLoading] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // RAG directory state
  const [ragFolderInput, setRagFolderInput] = useState('');
  const [ragIndexing, setRagIndexing] = useState(false);
  const [ragIndexResult, setRagIndexResult] = useState<{ chunkCount?: number; fileCount?: number } | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);

  const categoryStatuses: Record<string, CategoryStatus> = {};
  for (const cat of CATEGORIES) {
    const resources = engagement.resources.filter(r => r.category === cat.id);
    categoryStatuses[cat.id] = resources.length > 0 ? 'available' : 'not_available';
  }

  async function uploadResource(category: Resource['category'], file: File) {
    setUploading(category);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', category);
      fd.append('title', file.name);
      await fetch(`/api/engagements/${engagement.id}/resources`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: fd,
      });
      onReload();
    } finally {
      setUploading(null);
    }
  }

  async function addUrlResource(category: Resource['category']) {
    if (!urlInput.trim()) return;
    setAddingUrlLoading(true);
    try {
      await fetch(`/api/engagements/${engagement.id}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ category, url: urlInput.trim(), title: urlTitle.trim() || urlInput.trim() }),
      });
      setUrlInput(''); setUrlTitle(''); setAddingUrl(null);
      onReload();
    } finally {
      setAddingUrlLoading(false);
    }
  }

  async function setCategoryStatus(category: string, status: CategoryStatus) {
    await fetch(`/api/engagements/${engagement.id}/resource-categories`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ category, status }),
    });
    onReload();
  }

  async function setRagDirectory() {
    if (!ragFolderInput.trim()) return;
    setRagIndexing(true); setRagError(null); setRagIndexResult(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/rag-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ folderPath: ragFolderInput.trim() }),
      });
      const data = await res.json() as { ok?: boolean; chunkCount?: number; fileCount?: number; error?: string };
      if (!res.ok) { setRagError(data.error || 'Failed to index folder'); return; }
      setRagIndexResult({ chunkCount: data.chunkCount, fileCount: data.fileCount });
      onReload();
    } catch (e) {
      setRagError(String(e));
    } finally {
      setRagIndexing(false);
    }
  }

  async function removeRagDirectory() {
    await fetch(`/api/engagements/${engagement.id}/rag-directory`, {
      method: 'DELETE', headers: getAuthHeader(),
    });
    setRagIndexResult(null); setRagFolderInput(''); setRagError(null);
    onReload();
  }

  async function reindexRagDirectory() {
    setRagIndexing(true); setRagError(null);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}/rag-directory/reindex`, {
        method: 'POST', headers: getAuthHeader(),
      });
      const data = await res.json() as { ok?: boolean; chunkCount?: number; fileCount?: number; error?: string };
      if (!res.ok) { setRagError(data.error || 'Reindex failed'); return; }
      setRagIndexResult({ chunkCount: data.chunkCount, fileCount: data.fileCount });
    } catch (e) {
      setRagError(String(e));
    } finally {
      setRagIndexing(false);
    }
  }

  const totalResources = engagement.resources.length;
  const goodExamples = engagement.documents.filter(d => d.document_type === 'good_example');

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">
      {/* Header */}
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-1">Phase 3</p>
        <h2 className="text-xl font-bold text-adv-white">Resource Collection</h2>
        <p className="mt-1 text-sm text-adv-gray">
          Gather all materials needed to execute the engagement. Set a status for each category — ANTON uses this to calibrate what it can and can't assess.
        </p>
      </div>

      {/* Progress summary */}
      <div className="bg-adv-card border border-border rounded-xl px-5 py-4 flex items-center gap-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-adv-teal">{totalResources}</p>
          <p className="text-xs text-adv-gray-med">resources</p>
        </div>
        <div className="flex-1 flex gap-3 flex-wrap">
          {CATEGORIES.map(cat => {
            const catResources = engagement.resources.filter(r => r.category === cat.id);
            const Icon = cat.icon;
            return (
              <div key={cat.id} className="flex items-center gap-1.5 text-xs text-adv-gray">
                <Icon className="h-3.5 w-3.5 text-adv-teal" />
                <span>{cat.label.split(' ')[0]}: <span className="text-adv-off-white">{catResources.length}</span></span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category panels */}
      {CATEGORIES.map(cat => {
        const catResources = engagement.resources.filter(r => r.category === cat.id);
        const isExpanded = expanded.has(cat.id);
        const Icon = cat.icon;
        const catStatus = (categoryStatuses[cat.id] as CategoryStatus) || (catResources.length > 0 ? 'available' : 'not_available');

        return (
          <div key={cat.id} className="bg-adv-card border border-border rounded-xl overflow-hidden">
            {/* Category header */}
            <div
              className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-adv-dark-2/30 transition-colors"
              onClick={() => setExpanded(prev => {
                const next = new Set(prev);
                if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                return next;
              })}
            >
              <Icon className="h-4 w-4 text-adv-teal shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-adv-off-white">{cat.label}</p>
                <p className="text-xs text-adv-gray-med">{catResources.length} item{catResources.length !== 1 ? 's' : ''}</p>
              </div>
              {/* Status toggle */}
              <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                {(['available', 'coming_later', 'not_available'] as CategoryStatus[]).map(s => {
                  const sc = STATUS_CONFIG[s];
                  const SIcon = sc.icon;
                  return (
                    <button
                      key={s}
                      onClick={() => setCategoryStatus(cat.id, s)}
                      className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border transition-all ${
                        catStatus === s ? sc.color : 'text-adv-gray-med border-border bg-transparent hover:border-adv-gray-med'
                      }`}
                    >
                      <SIcon className="h-2.5 w-2.5" />
                      {s === 'not_available' ? 'N/A' : s === 'coming_later' ? 'Later' : 'Have it'}
                    </button>
                  );
                })}
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-adv-gray-med" /> : <ChevronDown className="h-4 w-4 text-adv-gray-med" />}
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-border p-4 space-y-3">
                <p className="text-xs text-adv-gray">{cat.description}</p>
                <p className="text-xs text-adv-gray-med italic">Examples: {cat.examples}</p>

                {/* Resource list */}
                {catResources.length > 0 && (
                  <div className="space-y-1">
                    {catResources.map(r => (
                      <ResourceRow key={r.id} resource={r} engagementId={engagement.id} onReload={onReload} />
                    ))}
                  </div>
                )}

                {/* Upload zone */}
                <div className="flex gap-2">
                  <div
                    onClick={() => inputRefs.current[cat.id]?.click()}
                    className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-adv-teal/50 rounded-lg py-3 cursor-pointer text-sm text-adv-gray hover:text-adv-teal transition-colors"
                  >
                    {uploading === cat.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Upload file
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => { setAddingUrl(addingUrl === cat.id ? null : cat.id); setUrlInput(''); setUrlTitle(''); }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm transition-colors ${
                      addingUrl === cat.id
                        ? 'border-adv-teal text-adv-teal bg-adv-teal-dim'
                        : 'border-dashed border-border text-adv-gray hover:border-adv-teal/50 hover:text-adv-teal'
                    }`}
                  >
                    <Link className="h-4 w-4" />
                    Add URL
                  </button>
                </div>

                {/* URL input */}
                {addingUrl === cat.id && (
                  <div className="bg-adv-dark-2 rounded-lg p-3 space-y-2 border border-adv-teal/20">
                    <input
                      autoFocus
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      placeholder="https://eur-lex.europa.eu/... or any web URL"
                      className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
                    />
                    <input
                      value={urlTitle}
                      onChange={e => setUrlTitle(e.target.value)}
                      placeholder="Label (optional — defaults to URL)"
                      className="w-full bg-adv-card border border-border rounded-lg px-3 py-2 text-sm text-adv-off-white placeholder-adv-gray-med focus:outline-none focus:border-adv-teal"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setAddingUrl(null)} className="text-xs text-adv-gray hover:text-adv-off-white px-2 py-1">Cancel</button>
                      <button
                        onClick={() => addUrlResource(cat.id)}
                        disabled={!urlInput.trim() || addingUrlLoading}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-adv-teal text-adv-dark text-xs font-medium hover:bg-adv-teal-dark disabled:opacity-50 transition-colors"
                      >
                        {addingUrlLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Add
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={el => { inputRefs.current[cat.id] = el; }}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.doc,.txt,.md,.xlsx,.csv,.py,.js,.ts"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) uploadResource(cat.id, f);
                    e.target.value = '';
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* RAG Knowledge Directory */}
      <div className="bg-adv-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          <FolderSearch className="h-4 w-4 text-adv-teal shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-adv-off-white">RAG Knowledge Directory</p>
            <p className="text-xs text-adv-gray-med">
              {engagement.rag_directory_path
                ? `Indexed: ${engagement.rag_directory_path}`
                : 'Optional — for large document sets (20+ files)'}
            </p>
          </div>
          {engagement.rag_directory_path && (
            <span className="text-[10px] border border-adv-teal/30 text-adv-teal bg-adv-teal-dim rounded-full px-2 py-0.5">Active</span>
          )}
        </div>

        <div className="border-t border-border p-4 space-y-3">
          {/* Explanation */}
          <div className="flex gap-2 bg-adv-teal-soft rounded-lg px-3 py-2">
            <Info className="h-3.5 w-3.5 text-adv-teal shrink-0 mt-0.5" />
            <p className="text-xs text-adv-gray leading-relaxed">
              <span className="text-adv-off-white font-medium">When to use RAG:</span> Upload the most important documents
              above (policies, letters, key reports). For a large library of 20+ reference files, point to a local
              folder here — ANTON will retrieve only the most relevant passages at execution time, avoiding context
              window limits.
            </p>
          </div>

          {engagement.rag_directory_path ? (
            /* Configured state */
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-adv-dark-2 rounded-lg px-3 py-2">
                <FolderSearch className="h-3.5 w-3.5 text-adv-teal shrink-0" />
                <span className="text-xs text-adv-off-white flex-1 truncate font-mono">{engagement.rag_directory_path}</span>
                <button
                  onClick={removeRagDirectory}
                  className="text-adv-gray-med hover:text-adv-red transition-colors shrink-0"
                  title="Remove RAG directory"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {ragIndexResult && (
                <p className="text-xs text-adv-teal">
                  ✓ Indexed {ragIndexResult.fileCount} files → {ragIndexResult.chunkCount} searchable passages
                </p>
              )}
              <button
                onClick={reindexRagDirectory}
                disabled={ragIndexing}
                className="flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${ragIndexing ? 'animate-spin' : ''}`} />
                {ragIndexing ? 'Re-indexing…' : 'Re-index (pick up new files)'}
              </button>
            </div>
          ) : (
            /* Not configured state */
            <div className="space-y-2">
              <input
                value={ragFolderInput}
                onChange={e => setRagFolderInput(e.target.value)}
                placeholder="/Users/daniel/Clients/Nordea/RegLibrary"
                className="w-full bg-adv-dark-2 border border-border rounded-lg px-3 py-2 text-xs text-adv-off-white placeholder-adv-gray-med font-mono focus:outline-none focus:border-adv-teal"
              />
              <button
                onClick={setRagDirectory}
                disabled={ragIndexing || !ragFolderInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/30 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
              >
                {ragIndexing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderSearch className="h-3 w-3" />}
                {ragIndexing ? 'Indexing folder…' : 'Index This Folder'}
              </button>
            </div>
          )}

          {ragError && (
            <p className="text-xs text-adv-red flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {ragError}
            </p>
          )}
        </div>
      </div>

      {/* Peer Benchmarks */}
      <EngagementPeerBenchmarks engagement={engagement} onReload={onReload} />

      {/* Good Example summary */}
      <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-xl p-4 flex items-start gap-3">
        <Star className="h-4 w-4 text-adv-teal shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-adv-teal">Good Example / Quality Blueprint</p>
          <p className="text-xs text-adv-gray mt-0.5">
            {goodExamples.length > 0
              ? `${goodExamples.length} good example file${goodExamples.length > 1 ? 's' : ''} uploaded — Quality Blueprint will be extracted in the next step.`
              : 'Upload a good example deliverable from a previous engagement in the next step (optional but recommended).'}
          </p>
        </div>
      </div>

      {/* Next */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-adv-teal text-adv-dark text-sm font-medium hover:bg-adv-teal-dark transition-colors"
        >
          Continue to Quality Blueprint
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ResourceRow({ resource, engagementId, onReload }: { resource: Resource; engagementId: string; onReload: () => void }) {
  async function remove() {
    await fetch(`/api/engagements/${engagementId}/resources/${resource.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ status: 'not_available' }),
    });
    onReload();
  }

  const isUrl = !!resource.url && !resource.file_path;

  return (
    <div className="flex items-center gap-3 bg-adv-dark-2 rounded-lg px-3 py-2">
      {isUrl
        ? <Link className="h-3.5 w-3.5 text-adv-blue shrink-0" />
        : <FileText className="h-3.5 w-3.5 text-adv-teal shrink-0" />
      }
      <span className="flex-1 text-xs text-adv-off-white truncate">{resource.title}</span>
      {isUrl && resource.url && (
        <a
          href={resource.url} target="_blank" rel="noopener noreferrer"
          className="text-[10px] text-adv-blue hover:text-adv-teal transition-colors shrink-0 truncate max-w-[120px]"
          title={resource.url}
        >
          {new URL(resource.url).hostname}
        </a>
      )}
      {resource.status === 'reviewed' && <CheckCircle className="h-3 w-3 text-adv-green shrink-0" />}
      {resource.status === 'processing' && <Loader2 className="h-3 w-3 text-adv-gold animate-spin shrink-0" />}
    </div>
  );
}
