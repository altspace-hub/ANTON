import { useState, useCallback, useEffect } from 'react';
import { Package, Upload, Download, AlertTriangle, CheckCircle, XCircle, Info, Loader2, ShieldCheck, ShieldAlert, Shield } from 'lucide-react';
import { MODULES, AREAS } from '@/lib/constants';
import { fetchCustomModules, getAuthHeader, type CustomModuleData } from '@/lib/api';

const API_BASE = '/api';

const LICENSE_OPTIONS = [
  { value: 'CC-BY-4.0', label: 'CC-BY-4.0 (Creative Commons)' },
  { value: 'MIT', label: 'MIT' },
  { value: 'Apache-2.0', label: 'Apache 2.0' },
  { value: 'Proprietary', label: 'Proprietary' },
];

interface GovernanceMetadata {
  effective_date?: string;
  source_url?: string;
  validated_by?: string;
  content_confirmed?: boolean;
}

interface BundleProvenance {
  signed: boolean;
  valid: boolean;
  signer_pubkey?: string;
  signer_name?: string;
  signed_at?: string;
  known: boolean;
  first_seen_name?: string;
  /** F1: true only when the signed manifest's content checksum was verified over the payload files. */
  payload_attested?: boolean;
}

interface SigningIdentity {
  available: boolean;
  signer_pubkey?: string;
  signer_name?: string;
}

interface ImportResult {
  success: boolean;
  moduleId?: string;
  keptOriginalId?: boolean;
  bundle_type?: string;
  validated_depth?: 'full' | 'structural';
  governance?: GovernanceMetadata;
  provenance?: BundleProvenance;
  notes?: string[];
  warnings: string[];
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
  const [isCustom, setIsCustom] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [authorOrg, setAuthorOrg] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [license, setLicense] = useState('CC-BY-4.0');
  const [sourceUrl, setSourceUrl] = useState('');
  const [validatedBy, setValidatedBy] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [customModules, setCustomModules] = useState<CustomModuleData[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(true);
  // Ed25519 provenance (Wave 2.4): default ON when the instance can sign
  const [signingIdentity, setSigningIdentity] = useState<SigningIdentity | null>(null);
  const [signBundle, setSignBundle] = useState(true);

  // Load custom modules on mount and keep list fresh
  useEffect(() => {
    let cancelled = false;
    setLoadingCustom(true);
    fetchCustomModules()
      .then((mods) => { if (!cancelled) setCustomModules(mods); })
      .finally(() => { if (!cancelled) setLoadingCustom(false); });
    return () => { cancelled = true; };
  }, []);

  // Probe the instance signing identity (drives the "Sign this bundle" toggle)
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/exchange/signing-identity`, { headers: getAuthHeader() })
      .then((res) => (res.ok ? res.json() : { available: false }))
      .then((data: SigningIdentity) => { if (!cancelled) setSigningIdentity(data); })
      .catch(() => { if (!cancelled) setSigningIdentity({ available: false }); });
    return () => { cancelled = true; };
  }, []);

  // Build built-in module options grouped by area
  const builtinOptions = AREAS.map((area) => ({
    area,
    modules: area.moduleIds
      .map((id) => MODULES.find((m) => m.id === id))
      .filter(Boolean) as typeof MODULES,
  })).filter((g) => g.modules.length > 0);

  function handleSelect(value: string) {
    if (!value) {
      setModuleId('');
      setIsCustom(false);
      return;
    }
    // Custom module IDs are prefixed with "custom:" in the <option> value
    if (value.startsWith('custom:')) {
      setModuleId(value.slice(7));
      setIsCustom(true);
    } else {
      setModuleId(value);
      setIsCustom(false);
    }
  }

  async function handleExport() {
    if (!moduleId) {
      setError('Please select a module');
      return;
    }
    setExporting(true);
    setError('');
    try {
      const url = `${API_BASE}/exchange/export/${moduleId}${isCustom ? '?type=custom' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorName: authorName.trim() || 'Anonymous',
          authorOrg: authorOrg.trim(),
          description: description.trim(),
          tags: tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          license,
          // Optional KP-03 governance metadata — only sent when filled in
          ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
          ...(validatedBy.trim() ? { validatedBy: validatedBy.trim() } : {}),
          // Ed25519 provenance: opt-out — server signs unless told not to
          // (when no signing identity exists the server degrades to unsigned)
          sign: signBundle,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }

      // Trigger browser download
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${moduleId}.anton`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  // Compute the current <select> value from state
  const selectValue = moduleId ? (isCustom ? `custom:${moduleId}` : moduleId) : '';

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-adv-card p-5 space-y-4">
        {/* Module selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Module</label>
          <div className="relative">
            <select
              value={selectValue}
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            >
              <option value="">Select a module...</option>

              {/* My Modules — from database */}
              {!loadingCustom && customModules.length > 0 && (
                <optgroup label="My Modules">
                  {customModules.map((mod) => (
                    <option key={mod.id} value={`custom:${mod.id}`}>
                      {mod.name}
                    </option>
                  ))}
                </optgroup>
              )}

              {/* Built-in modules — grouped by area */}
              {builtinOptions.map((group) => (
                <optgroup key={group.area.id} label={group.area.label}>
                  {group.modules.map((mod) => (
                    <option key={mod.id} value={mod.id}>
                      {mod.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {loadingCustom && (
              <Loader2 className="pointer-events-none absolute right-8 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-adv-gray" />
            )}
          </div>
          {!loadingCustom && customModules.length > 0 && (
            <p className="mt-1 text-[11px] text-adv-gray">
              {customModules.length} custom module{customModules.length !== 1 ? 's' : ''} in My Modules
            </p>
          )}
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
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">Organisation</label>
            <input
              type="text"
              value={authorOrg}
              onChange={(e) => setAuthorOrg(e.target.value)}
              placeholder="Your organisation"
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
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
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 resize-none"
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
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          />
        </div>

        {/* Governance (optional trust metadata, Wave 2.6) */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Source URL <span className="text-adv-gray font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://eur-lex.europa.eu/..."
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-[11px] text-adv-gray">Canonical source of the module's reference material</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-adv-off-white">
              Validated by <span className="text-adv-gray font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={validatedBy}
              onChange={(e) => setValidatedBy(e.target.value)}
              placeholder="Name or email of the reviewer"
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            <p className="mt-1 text-[11px] text-adv-gray">Who verified this module's content</p>
          </div>
        </div>

        {/* License */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-adv-off-white">License</label>
          <select
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
          >
            {LICENSE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ed25519 provenance (Wave 2.4) — only shown when this instance can sign */}
        {signingIdentity?.available && (
          <label className="flex items-start gap-3 rounded-lg border border-border bg-adv-dark-2 px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={signBundle}
              onChange={(e) => setSignBundle(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2DD4A8]"
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-adv-off-white">
                <ShieldCheck className="h-4 w-4 text-adv-teal" />
                Sign this bundle
                {signingIdentity.signer_name && (
                  <span className="font-normal text-adv-gray">as {signingIdentity.signer_name}</span>
                )}
              </span>
              <span className="mt-0.5 block text-[11px] text-adv-gray">
                Embeds an Ed25519 signature proving the bundle's manifest — including the payload
                checksum it carries — is untouched since this instance signed it. It does not vouch
                for content quality or your real-world identity.
              </span>
            </span>
          </label>
        )}

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
      const data = (await res.json()) as Partial<ImportResult> & { error?: string };
      setResult({
        success: data.success === true,
        moduleId: data.moduleId,
        keptOriginalId: data.keptOriginalId,
        bundle_type: data.bundle_type,
        validated_depth: data.validated_depth,
        governance: data.governance,
        provenance: data.provenance,
        notes: data.notes,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        errors: Array.isArray(data.errors) ? data.errors : data.error ? [data.error] : [],
      });
    } catch {
      setResult({ success: false, warnings: [], errors: ['Network error during import'] });
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
        <Upload className={`h-8 w-8 ${dragging ? 'text-adv-teal' : 'text-adv-gray'}`} />
        <div className="text-center">
          <p className="text-sm text-adv-off-white">
            {importing ? 'Importing...' : 'Drag and drop a .anton file here'}
          </p>
          <p className="mt-1 text-xs text-adv-gray">or</p>
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
            <p className="text-adv-off-white">{fileName}</p>
          </div>

          {/* Success */}
          {result.success && (
            <div className="flex items-center gap-2 rounded-lg bg-adv-green/10 px-3 py-2 text-sm text-adv-green">
              <CheckCircle className="h-4 w-4 shrink-0" />
              Module installed successfully: <strong>{result.moduleId}</strong>
              {result.keptOriginalId && <span className="text-xs">(original id kept)</span>}
            </div>
          )}

          {/* Provenance (Ed25519 signature, Wave 2.4) */}
          {result.provenance && <ProvenanceBadge provenance={result.provenance} />}

          {/* Governance (KP-03 trust metadata, Wave 2.6) */}
          {result.governance && (
            <div className="rounded-lg bg-adv-dark-2 px-3 py-2 text-sm text-adv-gray">
              <span className="font-medium text-adv-off-white">Governance: </span>
              {[
                result.governance.validated_by && `Validated by ${result.governance.validated_by}`,
                result.governance.source_url && `Source: ${result.governance.source_url}`,
                result.governance.effective_date && `Effective: ${result.governance.effective_date}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              <p className="mt-0.5 text-[11px]">Declared by the bundle author — not independently verified.</p>
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

/**
 * Provenance badge (Wave 2.4). Honest claims only: a valid signature proves
 * the manifest is untouched since signing by that key — nothing more.
 */
function ProvenanceBadge({ provenance }: { provenance: BundleProvenance }) {
  if (!provenance.signed) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-adv-dark-2 px-3 py-2 text-sm text-adv-gray">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Unsigned (no provenance) — this bundle carries no signature; that is normal for older exports.</span>
      </div>
    );
  }

  if (!provenance.valid) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-adv-red/10 px-3 py-2 text-sm text-adv-red">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Signature INVALID</strong> — the bundle may have been modified after signing
          {provenance.signer_name ? ` (claimed signer: ${provenance.signer_name})` : ''}. Import is blocked.
        </span>
      </div>
    );
  }

  const signer = provenance.signer_name || 'unnamed signer';
  return (
    <div className="rounded-lg bg-adv-green/10 px-3 py-2 text-sm text-adv-green">
      <span className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>
          Signed by <strong>{signer}</strong> (✓ verified
          {provenance.known ? ', known signer' : ', first time seeing this signer'})
        </span>
      </span>
      {provenance.first_seen_name && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-adv-gold">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This key was first seen as "{provenance.first_seen_name}".
        </p>
      )}
      {provenance.payload_attested === false && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-adv-gold">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Signature covers the manifest only; payload integrity is NOT attested (no verifiable
          content checksum in this bundle).
        </p>
      )}
      <p className="mt-1 text-[11px] text-adv-gray">
        {provenance.payload_attested
          ? 'A valid signature proves the manifest — and, via its verified content checksum, the payload files — are untouched since signing by this key. It does not vouch for content quality or real-world identity.'
          : 'A valid signature proves the manifest is untouched since signing by this key. It does not vouch for content quality or real-world identity.'}
        {provenance.signer_pubkey ? ` Key: ${provenance.signer_pubkey.slice(0, 16)}…` : ''}
      </p>
    </div>
  );
}
