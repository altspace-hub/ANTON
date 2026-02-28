import React, { useState, useRef, useEffect } from 'react';
import {
  Store,
  ExternalLink,
  Upload,
  Download,
  FileJson,
  Package,
  User,
  Layers,
  Workflow,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  X,
} from 'lucide-react';
import { getAuthHeader, fetchCustomModules, type CustomModuleData } from '../lib/api';

interface AntonManifest {
  name?: string;
  author?: string;
  version?: string;
  description?: string;
  modules?: unknown[];
  skills?: unknown[];
  workflows?: unknown[];
  [key: string]: unknown;
}

interface PackagePreview {
  manifest: AntonManifest;
  fileName: string;
  fileBuffer: ArrayBuffer;
  file: File;
}

const RECENTLY_IMPORTED = [
  {
    id: '1',
    name: 'AMLR Gap Analysis Pack',
    author: 'openEXPERT Team',
    importedAt: '2026-02-20',
    modules: 2,
    skills: 5,
    workflows: 1,
  },
  {
    id: '2',
    name: 'Sanctions Screening Toolkit',
    author: 'Nordic Compliance Hub',
    importedAt: '2026-02-15',
    modules: 1,
    skills: 8,
    workflows: 3,
  },
  {
    id: '3',
    name: 'AML Policy Templates v2',
    author: 'futurechain.solutions',
    importedAt: '2026-02-10',
    modules: 4,
    skills: 2,
    workflows: 0,
  },
];

export default function MarketplacePage() {
  const [preview, setPreview] = useState<PackagePreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [exportModal, setExportModal] = useState<string | null>(null);
  const [exportableModules, setExportableModules] = useState<CustomModuleData[]>([]);
  const [loadingExportList, setLoadingExportList] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (exportModal === 'module') {
      setLoadingExportList(true);
      fetchCustomModules()
        .then(setExportableModules)
        .catch(() => setExportableModules([]))
        .finally(() => setLoadingExportList(false));
    }
  }, [exportModal]);

  async function handleFile(file: File) {
    if (!file.name.endsWith('.anton')) {
      setImportResult({ success: false, message: 'Only .anton files are supported.' });
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder().decode(buffer);
      let manifest: AntonManifest = {};
      try {
        manifest = JSON.parse(text) as AntonManifest;
      } catch {
        // binary zip — parse metadata from outer JSON wrapper if present
        manifest = { name: file.name.replace('.anton', ''), author: 'Unknown' };
      }
      setPreview({ manifest, fileName: file.name, fileBuffer: buffer, file });
      setImportResult(null);
    } catch {
      setImportResult({ success: false, message: 'Failed to read file.' });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  async function handleImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', preview.file);
      const res = await fetch('/api/exchange/import', {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData,
      });
      if (res.ok) {
        setImportResult({ success: true, message: `"${preview.manifest.name || preview.fileName}" imported successfully.` });
        setPreview(null);
      } else {
        const data = await res.json().catch(() => ({ error: 'Import failed' }));
        setImportResult({ success: false, message: (data as { error?: string }).error || 'Import failed.' });
      }
    } catch {
      setImportResult({ success: false, message: 'Network error during import.' });
    } finally {
      setImporting(false);
    }
  }

  const moduleCount = Array.isArray(preview?.manifest.modules) ? preview!.manifest.modules.length : 0;
  const skillCount = Array.isArray(preview?.manifest.skills) ? preview!.manifest.skills.length : 0;
  const workflowCount = Array.isArray(preview?.manifest.workflows) ? preview!.manifest.workflows.length : 0;

  return (
    <div className="min-h-screen bg-adv-dark p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-adv-teal-dim">
          <Store className="w-6 h-6 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-adv-off-white">ANTON Community Marketplace</h1>
          <p className="text-sm text-adv-gray mt-0.5">Browse and share modules, skills, and workflows</p>
        </div>
      </div>

      {/* Visit Marketplace Card */}
      <div className="bg-adv-card border border-border rounded-xl p-5 flex items-start gap-4">
        <div className="p-2 rounded-lg bg-adv-teal-dim shrink-0">
          <ExternalLink className="w-5 h-5 text-adv-teal" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-adv-off-white mb-1">Visit the Marketplace</h2>
          <p className="text-sm text-adv-gray mb-3">
            Browse the full ANTON Community Marketplace to find modules, skill packs, and workflows
            created by compliance professionals. Download <code className="text-adv-teal bg-adv-dark px-1 rounded">.anton</code> files,
            then import them below.
          </p>
          <a
            href="https://www.futurechain.solutions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-adv-teal text-adv-dark font-medium text-sm hover:bg-adv-teal-dark transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Open futurechain.solutions
          </a>
        </div>
      </div>

      {/* Import Section */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-adv-teal" />
          <h2 className="text-base font-semibold text-adv-off-white">Import .anton Package</h2>
        </div>
        <p className="text-sm text-adv-gray -mt-2">
          Select or drag a <code className="text-adv-teal bg-adv-dark px-1 rounded">.anton</code> file
          downloaded from the marketplace to import it into your workbench.
        </p>

        {/* Drop zone */}
        {!preview && (
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
              dragOver
                ? 'border-adv-teal bg-adv-teal-soft'
                : 'border-border hover:border-adv-teal hover:bg-adv-teal-soft'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileJson className="w-10 h-10 text-adv-gray mx-auto mb-3" />
            <p className="text-adv-off-white font-medium mb-1">Drop a .anton file here, or click to browse</p>
            <p className="text-sm text-adv-gray-med">Supports .anton packages from the ANTON Marketplace</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".anton"
              className="hidden"
              onChange={handleInputChange}
            />
          </div>
        )}

        {/* Package Preview */}
        {preview && (
          <div className="border border-adv-teal rounded-xl p-5 bg-adv-teal-soft space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-adv-teal" />
                <h3 className="font-semibold text-adv-off-white">Package Preview</h3>
              </div>
              <button
                onClick={() => setPreview(null)}
                className="p-1 rounded hover:bg-adv-dark text-adv-gray hover:text-adv-off-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-adv-gray-med uppercase tracking-wide mb-1">Package Name</p>
                <p className="text-adv-off-white font-medium">
                  {preview.manifest.name || preview.fileName.replace('.anton', '')}
                </p>
              </div>
              <div>
                <p className="text-xs text-adv-gray-med uppercase tracking-wide mb-1">Author</p>
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-adv-gray" />
                  <p className="text-adv-off-white">{preview.manifest.author || 'Unknown'}</p>
                </div>
              </div>
              {preview.manifest.description && (
                <div className="col-span-2">
                  <p className="text-xs text-adv-gray-med uppercase tracking-wide mb-1">Description</p>
                  <p className="text-adv-gray text-sm">{preview.manifest.description}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-adv-gray-med uppercase tracking-wide mb-2">Contents</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adv-dark text-sm">
                  <Layers className="w-3.5 h-3.5 text-adv-teal" />
                  <span className="text-adv-off-white font-medium">{moduleCount}</span>
                  <span className="text-adv-gray">Module{moduleCount !== 1 ? 's' : ''}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adv-dark text-sm">
                  <Zap className="w-3.5 h-3.5 text-adv-gold" />
                  <span className="text-adv-off-white font-medium">{skillCount}</span>
                  <span className="text-adv-gray">Skill{skillCount !== 1 ? 's' : ''}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-adv-dark text-sm">
                  <Workflow className="w-3.5 h-3.5 text-adv-blue" />
                  <span className="text-adv-off-white font-medium">{workflowCount}</span>
                  <span className="text-adv-gray">Workflow{workflowCount !== 1 ? 's' : ''}</span>
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => void handleImport()}
                disabled={importing}
                className="flex-1 py-2.5 px-4 rounded-lg bg-adv-teal text-adv-dark font-semibold text-sm hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {importing ? 'Importing...' : 'Import Package'}
              </button>
              <button
                onClick={() => { setPreview(null); setImportResult(null); }}
                disabled={importing}
                className="px-4 py-2.5 rounded-lg border border-border text-adv-gray hover:text-adv-off-white hover:border-adv-gray text-sm font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className={`flex items-start gap-3 p-4 rounded-lg border ${
            importResult.success
              ? 'bg-green-900/20 border-green-700 text-green-400'
              : 'bg-red-900/20 border-red-700 text-red-400'
          }`}>
            {importResult.success
              ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            }
            <p className="text-sm">{importResult.message}</p>
            <button
              onClick={() => setImportResult(null)}
              className="ml-auto shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-adv-teal" />
          <h2 className="text-base font-semibold text-adv-off-white">Export to Marketplace</h2>
        </div>
        <p className="text-sm text-adv-gray -mt-2">
          Package your modules, skills, and workflows as <code className="text-adv-teal bg-adv-dark px-1 rounded">.anton</code> files
          to share with the community on futurechain.solutions.
        </p>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Export Module', icon: Layers, type: 'module' },
            { label: 'Export Skill Pack', icon: Zap, type: 'skill-pack' },
            { label: 'Export Workflow', icon: Workflow, type: 'workflow' },
            { label: 'Export Skill', icon: Zap, type: 'skill' },
          ].map(({ label, icon: Icon, type }) => (
            <button
              key={type}
              onClick={() => setExportModal(type)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-adv-off-white hover:border-adv-teal hover:text-adv-teal text-sm font-medium transition-colors"
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Recently Imported */}
      <div className="bg-adv-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-adv-teal" />
          <h2 className="text-base font-semibold text-adv-off-white">Recently Imported</h2>
        </div>
        <div className="space-y-3">
          {RECENTLY_IMPORTED.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-4 p-4 rounded-lg bg-adv-dark-2 border border-border hover:border-adv-teal/30 transition-colors"
            >
              <div className="p-2 rounded-lg bg-adv-teal-dim shrink-0">
                <Package className="w-4 h-4 text-adv-teal" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-adv-off-white truncate">{item.name}</p>
                <p className="text-xs text-adv-gray-med mt-0.5">
                  by {item.author} · imported {item.importedAt}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {item.modules > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-adv-teal-dim text-xs text-adv-teal">
                    <Layers className="w-3 h-3" />
                    {item.modules}
                  </span>
                )}
                {item.skills > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-adv-dark text-xs text-adv-gold">
                    <Zap className="w-3 h-3" />
                    {item.skills}
                  </span>
                )}
                {item.workflows > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-adv-dark text-xs text-adv-blue">
                    <Workflow className="w-3 h-3" />
                    {item.workflows}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export Modal */}
      {exportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-adv-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-adv-off-white capitalize">
                Select item to export
              </h3>
              <button
                onClick={() => setExportModal(null)}
                className="p-1 rounded hover:bg-adv-dark text-adv-gray hover:text-adv-off-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-adv-gray mb-6">
              Export your{' '}
              <span className="text-adv-teal">
                {exportModal === 'skill-pack' ? 'skill pack' : exportModal}
              </span>{' '}
              as an <code className="text-adv-teal bg-adv-dark px-1 rounded">.anton</code> package
              to share with the community. Select an item from the list below.
            </p>
            {exportModal === 'module' ? (
              loadingExportList ? (
                <div className="py-8 text-center">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
                  <p className="mt-2 text-xs text-adv-gray-med">Loading your modules...</p>
                </div>
              ) : exportableModules.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-border rounded-lg">
                  <p className="text-adv-gray-med text-sm">No custom modules yet.</p>
                  <p className="text-xs text-adv-gray-med mt-1">
                    <a href="/build-module" className="text-adv-teal hover:underline">Build one →</a>{' '}then return here to export it.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {exportableModules.map((mod) => (
                    <div key={mod.id} className="flex items-center gap-3 rounded-lg border border-border bg-adv-dark px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-adv-off-white truncate">{mod.name}</div>
                        {mod.description && (
                          <div className="text-xs text-adv-gray-med truncate">{mod.description}</div>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/exchange/export/${mod.id}?type=custom`, {
                              headers: { ...getAuthHeader() },
                            });
                            if (!res.ok) throw new Error('Export failed');
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${mod.name.replace(/\s+/g, '-').toLowerCase()}.anton`;
                            a.click();
                            URL.revokeObjectURL(url);
                          } catch {
                            alert('Export failed. Please try again.');
                          }
                        }}
                        className="shrink-0 flex items-center gap-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/20 px-2.5 py-1 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors"
                      >
                        <Download className="h-3 w-3" />
                        Export .anton
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="py-8 text-center border border-dashed border-border rounded-lg">
                <p className="text-adv-gray-med text-sm">
                  No {exportModal === 'skill-pack' ? 'skill packs' : exportModal + 's'} available to export.
                </p>
                <p className="text-xs text-adv-gray-med mt-1">
                  Create one first, then return here to export it.
                </p>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setExportModal(null)}
                className="px-4 py-2 rounded-lg border border-border text-adv-gray hover:text-adv-off-white text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
