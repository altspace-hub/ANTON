import { useState, useCallback } from 'react';
import { Package, Upload, Download, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { MODULES, AREAS } from '@/lib/constants';

const API_BASE = '/api';

const LICENSE_OPTIONS = [
  { value: 'CC-BY-4.0', label: 'CC-BY-4.0 (Creative Commons)' },
  { value: 'MIT', label: 'MIT' },
  { value: 'Apache-2.0', label: 'Apache 2.0' },
  { value: 'Proprietary', label: 'Proprietary' },
];

interface ImportResult {
  success: boolean;
  moduleId?: string;
  warnings: string[];
  missingDeps: string[];
  errors: string[];
}

export default function ExchangePage() {
  const [tab, setTab] = useState<'export' | 'import'>('export');

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/10">
          <Package className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-adv-white">Exchange</h1>
          <p className="text-sm text-adv-gray">Export and import .anton module packages</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-adv-dark-2 p-1">
        <button
          onClick={() => setTab('export')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'export' ? 'bg-adv-card text-adv-teal shadow' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <Download className="h-4 w-4" />
          Export
        </button>
        <button
          onClick={() => setTab('import')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'import' ? 'bg-adv-card text-adv-teal shadow' : 'text-adv-gray hover:text-adv-off-white'
          }`}
        >
          <Upload className="h-4 w-4" />
          Import
        </button>
      </div>

      {tab === 'export' ? <ExportTab /> : <ImportTab />}
    </div>
  );
}

function ExportTab() {
  const [moduleId, setModuleId] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorOrg, setAuthorOrg] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [license, setLicense] = useState('CC-BY-4.0');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  // Build module options grouped by area
  const moduleOptions = AREAS.map((area) => ({
    area,
    modules: area.moduleIds
      .map((id) => MODULES.find((m) => m.id === id))
      .filter(Boolean) as typeof MODULES,
  })).filter((g) => g.modules.length > 0);

  async function handleExport() {
    if (!moduleId) {
      setError('Please select a module');
      return;
    }
    setExporting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/exchange/export/${moduleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: authorName.trim() || 'Anonymous',
          authorOrg: authorOrg.trim(),
          description: description.trim(),
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          license,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${moduleId}.anton`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-adv-card p-5 space-y-4">
        {/* Module selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Module</label>
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
          >
            <option value="">Select a module...</option>
            {moduleOptions.map((group) => (
              <optgroup key={group.area.id} label={group.area.label}>
                {group.modules.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Author fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Author Name</label>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Organisation</label>
            <input
              type="text"
              value={authorOrg}
              onChange={(e) => setAuthorOrg(e.target.value)}
              placeholder="Your organisation"
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this module do? Who is it for?"
            rows={3}
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none resize-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Tags</label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="compliance, aml, gap-analysis (comma-separated)"
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none"
          />
        </div>

        {/* License */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">License</label>
          <select
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
          >
            {LICENSE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-adv-red/10 px-3 py-2 text-sm text-adv-red">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting || !moduleId}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-4 py-2.5 text-sm font-semibold text-adv-dark transition-colors hover:bg-adv-teal-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Exporting...' : 'Export .anton'}
        </button>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 rounded-lg border border-adv-teal/20 bg-adv-teal-soft px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-adv-teal" />
        <p className="text-sm text-adv-gray">
          The .anton file contains your module's system prompt and configuration. Share it via email, Teams, or your shared drive. Recipients can import it into their own Anton instance.
        </p>
      </div>
    </div>
  );
}

function ImportTab() {
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setImporting(true);
    setResult(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/exchange/import`, {
        method: 'POST',
        body: formData,
      });
      const data: ImportResult = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, warnings: [], missingDeps: [], errors: ['Network error during import'] });
    } finally {
      setImporting(false);
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-5">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 transition-colors ${
          dragging
            ? 'border-adv-teal bg-adv-teal/5'
            : 'border-border bg-adv-card hover:border-adv-gray-med'
        }`}
      >
        <Upload className={`h-8 w-8 ${dragging ? 'text-adv-teal' : 'text-adv-gray-med'}`} />
        <div className="text-center">
          <p className="text-sm text-adv-off-white">
            {importing ? 'Importing...' : 'Drag and drop a .anton file here'}
          </p>
          <p className="mt-1 text-xs text-adv-gray-med">or</p>
        </div>
        <label className="cursor-pointer rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white transition-colors hover:border-adv-teal hover:text-adv-teal">
          Browse files
          <input
            type="file"
            accept=".anton"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-border bg-adv-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            {result.success ? (
              <p className="text-adv-off-white">{fileName}</p>
            ) : (
              <p className="text-adv-off-white">{fileName}</p>
            )}
          </div>

          {/* Success */}
          {result.success && (
            <div className="flex items-center gap-2 rounded-lg bg-adv-green/10 px-3 py-2 text-sm text-adv-green">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Module installed successfully: <strong>{result.moduleId}</strong>
            </div>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="space-y-1">
              {result.errors.map((err, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-adv-red/10 px-3 py-2 text-sm text-adv-red">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {err}
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="space-y-1">
              {result.warnings.map((warn, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-adv-gold/10 px-3 py-2 text-sm text-adv-gold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {warn}
                </div>
              ))}
            </div>
          )}

          {/* View module link */}
          {result.success && result.moduleId && (
            <a
              href={`/module/${result.moduleId}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-adv-teal hover:text-adv-teal-dark transition-colors"
            >
              View Module
            </a>
          )}
        </div>
      )}
    </div>
  );
}
