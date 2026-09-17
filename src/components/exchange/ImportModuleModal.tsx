/**
 * ImportModuleModal.tsx
 *
 * Modal for importing .anton files
 * Shows validation results and preview before installing.
 *
 * Wave 6 (track G — a shared module arrives whole): before anything is
 * installed the modal shows the bundle's FINGERPRINT (checksum + who signed
 * it), the skills and personas that travel with it, any referenced ids with
 * no text, and the prompt-injection findings. Findings block the import
 * until the user ticks that they read them and want to proceed; the server
 * enforces the same rule (409 without acceptInjectionFindings). After a
 * noteworthy import (skills installed or renamed, findings accepted,
 * warnings) the result is shown before the modal closes.
 */

import { useState } from 'react';
import { Upload, Package, X, CheckCircle, AlertTriangle, XCircle, FileText, Fingerprint, ShieldAlert, Puzzle, UserRound } from 'lucide-react';
import {
  validateAntonBundle,
  importAntonModule,
  type BundleValidationResponse,
  type BundleInjectionFinding,
  type BundleFingerprint,
  type ModuleImportResponse,
  type InstalledBundleDependency,
} from '@/lib/api';

interface ImportModuleModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function shortChecksum(checksum: string | null | undefined): string {
  if (!checksum) return '';
  return checksum.replace(/^sha256:/i, '').slice(0, 12);
}

function signerLine(fp: BundleFingerprint): { text: string; tone: string } {
  if (fp.signed && fp.signatureValid) {
    const who = fp.signedBy ?? 'unknown signer';
    return {
      text: `Signed by ${who}${fp.known ? ' · signer seen before on this instance' : ' · first bundle from this signer'}`,
      tone: 'text-adv-teal',
    };
  }
  if (fp.signed) return { text: 'Signature INVALID — the manifest was modified after signing', tone: 'text-red-400' };
  return { text: 'Unsigned — nobody vouches for who exported this bundle', tone: 'text-adv-gold' };
}

const ACTION_LABEL: Record<InstalledBundleDependency['action'], string> = {
  reused: 'already here — reused',
  installed: 'installed',
  namespaced: 'installed under a new id',
  missing: 'not available — the module runs without it',
};

function FindingsList({ findings }: { findings: BundleInjectionFinding[] }) {
  return (
    <ul className="space-y-2">
      {findings.map((f, i) => (
        <li key={`${f.file}-${f.patternId}-${i}`} className="text-sm">
          <p className="text-red-300 font-medium">
            {f.label} <span className="text-red-400/70 font-normal">— {f.file}, line {f.line}</span>
          </p>
          <p className="mt-1 text-sm text-adv-off-white/80 bg-adv-dark rounded px-2 py-1 break-words">“{f.excerpt}”</p>
        </li>
      ))}
    </ul>
  );
}

function DependencyRows({ rows, kind }: { rows: InstalledBundleDependency[]; kind: 'Skill' | 'Persona' }) {
  if (rows.length === 0) return null;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={`${kind}-${r.bundleId}`} className={`text-sm ${r.action === 'missing' ? 'text-adv-gold' : 'text-adv-gray'}`}>
          <strong className="text-adv-off-white">{kind} {r.bundleId}</strong>: {ACTION_LABEL[r.action]}
          {r.action === 'namespaced' && <> as <code className="text-adv-teal">{r.installedId}</code></>}
        </li>
      ))}
    </ul>
  );
}

export function ImportModuleModal({ onClose, onSuccess }: ImportModuleModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validation, setValidation] = useState<BundleValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Findings the server reported (validation or a 409) — the source of truth for the gate. */
  const [findings, setFindings] = useState<BundleInjectionFinding[]>([]);
  const [acceptFindings, setAcceptFindings] = useState(false);
  const [result, setResult] = useState<ModuleImportResponse | null>(null);

  const reset = () => {
    setValidation(null);
    setError(null);
    setFindings([]);
    setAcceptFindings(false);
    setResult(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      reset();
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setIsValidating(true);
    setError(null);
    try {
      const response = await validateAntonBundle(file);
      setValidation(response);
      setFindings(response.injectionFindings ?? []);
      setAcceptFindings(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const finish = () => {
    // Close first, then notify parent — prevents state updates on unmounted component
    onClose();
    onSuccess();
  };

  const handleImport = async () => {
    if (!file || !validation?.valid) return;
    if (findings.length > 0 && !acceptFindings) return;

    setIsImporting(true);
    setError(null);
    try {
      const { status, body } = await importAntonModule(file, { acceptInjectionFindings: findings.length > 0 && acceptFindings });
      if (status === 409) {
        // The server found patterns this screen had not shown (or the bundle changed) — show them, require the tick again.
        setFindings(body.injectionFindings ?? []);
        setAcceptFindings(false);
        setError(body.error ?? 'Import blocked by the prompt-injection scan.');
        return;
      }
      if (!body.success) {
        const firstError = Array.isArray(body.errors) && body.errors.length > 0 ? body.errors[0] : undefined;
        throw new Error(body.error || firstError || 'Import failed');
      }
      const noteworthy =
        (body.importWarnings?.length ?? 0) > 0 ||
        (body.acceptedInjectionFindings?.length ?? 0) > 0 ||
        [...(body.installedSkills ?? []), ...(body.installedPersonas ?? [])].some((r) => r.action !== 'reused');
      if (noteworthy) {
        setResult(body);
        return;
      }
      finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const fp = validation?.fingerprint;
  const embeddedSkills = validation?.embedded?.skills ?? [];
  const embeddedPersonas = validation?.embedded?.personas ?? [];
  const unresolvedSkills = validation?.unresolved?.skills ?? [];
  const unresolvedPersonas = validation?.unresolved?.personas ?? [];
  const isModuleBundle = !!validation && (validation.bundle_type === undefined || validation.bundle_type === 'module');
  const importBlockedByFindings = findings.length > 0 && !acceptFindings;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-adv-card border border-adv-teal/20 rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-module-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-adv-teal/20 sticky top-0 bg-adv-card z-10">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-adv-teal" />
            <h2 id="import-module-title" className="text-lg font-semibold text-adv-white">Import Module</h2>
          </div>
          <button
            onClick={onClose}
            className="text-adv-gray hover:text-adv-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Import result (noteworthy imports only) */}
          {result && (
            <div className="space-y-4">
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <p className="text-sm text-green-300">Module imported{result.moduleId ? ` as ${result.moduleId}` : ''}.</p>
                </div>
              </div>
              {((result.installedSkills?.length ?? 0) > 0 || (result.installedPersonas?.length ?? 0) > 0) && (
                <div className="bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3 space-y-2">
                  <h3 className="text-sm font-semibold text-adv-teal">Skills and personas</h3>
                  <DependencyRows rows={result.installedSkills ?? []} kind="Skill" />
                  <DependencyRows rows={result.installedPersonas ?? []} kind="Persona" />
                </div>
              )}
              {(result.acceptedInjectionFindings?.length ?? 0) > 0 && (
                <div className="bg-adv-dark-2 border border-adv-gold/30 rounded-lg px-4 py-3">
                  <p className="text-sm text-adv-gold">
                    {result.acceptedInjectionFindings?.length} injection finding{result.acceptedInjectionFindings?.length === 1 ? '' : 's'} accepted — recorded with the module and shown in its fingerprint.
                  </p>
                </div>
              )}
              {(result.importWarnings?.length ?? 0) > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-4 py-3 space-y-1">
                  {result.importWarnings?.map((w, i) => (
                    <p key={i} className="text-sm text-yellow-300">{w}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* File Upload */}
          {!result && !file && (
            <div
              className="border-2 border-dashed border-adv-teal/30 rounded-lg px-6 py-8 text-center hover:border-adv-teal/50 transition-colors cursor-pointer"
              onClick={() => document.getElementById('anton-file-input')?.click()}
            >
              <Package className="w-12 h-12 text-adv-teal mx-auto mb-3" />
              <p className="text-adv-off-white font-medium mb-1">Drop .anton file here or click to browse</p>
              <p className="text-sm text-adv-gray">Maximum file size: 15 MB</p>
              <input
                id="anton-file-input"
                type="file"
                accept=".anton"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* File Selected */}
          {!result && file && !validation && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3">
                <FileText className="w-5 h-5 text-adv-teal" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-adv-white">{file.name}</p>
                  <p className="text-sm text-adv-gray">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={() => { setFile(null); reset(); }}
                  className="text-adv-gray hover:text-adv-white transition-colors"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-lg px-4 py-3">
                <p className="text-sm text-adv-off-white mb-2">
                  <strong className="text-adv-teal">Security checks before anything is installed:</strong>
                </p>
                <ul className="text-sm text-adv-gray space-y-1 list-disc list-inside">
                  <li>ZIP integrity check (no executables)</li>
                  <li>Schema, checksum and signature verification</li>
                  <li>Content sanitization (strip dangerous patterns)</li>
                  <li>Prompt injection scan — findings block the import until you accept them</li>
                  <li>Skills and personas that travel with the module, each checked against its hash</li>
                </ul>
              </div>

              <button
                onClick={handleValidate}
                disabled={isValidating}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-adv-teal hover:bg-adv-teal-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-4 h-4" />
                {isValidating ? 'Validating...' : 'Validate File'}
              </button>
            </div>
          )}

          {/* Validation Results */}
          {!result && validation && (
            <div className="space-y-4">
              {/* Bundle type + validation depth */}
              {validation.bundle_type && (
                <div className="flex items-center gap-2 text-sm text-adv-gray">
                  <span className="px-2 py-1 bg-adv-teal/20 text-adv-teal rounded-full">{validation.bundle_type}</span>
                  {validation.validated_depth && (
                    <span>
                      {validation.validated_depth === 'full' ? 'Full deep validation' : 'Structural validation'}
                    </span>
                  )}
                </div>
              )}

              {/* Module Preview */}
              {validation.manifest?.meta && (
                <div className="bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3">
                  <h3 className="text-sm font-semibold text-adv-teal mb-2">Module Details</h3>
                  <div className="space-y-1 text-sm">
                    <p className="text-adv-white">
                      <strong>Name:</strong> {validation.manifest.meta.name}
                    </p>
                    <p className="text-adv-gray">
                      <strong>Version:</strong> {validation.manifest.meta.version} | <strong>Author:</strong>{' '}
                      {validation.manifest.meta.author}
                    </p>
                    <p className="text-adv-gray">{validation.manifest.meta.description}</p>
                    {(validation.manifest.meta.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {validation.manifest.meta.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-adv-teal/20 text-adv-teal text-sm rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fingerprint: checksum + signer (Wave 6) */}
              {fp && (
                <div className="bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3 text-sm" data-testid="bundle-fingerprint">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-teal mb-1">
                    <Fingerprint className="w-4 h-4" aria-hidden="true" /> Fingerprint
                  </h3>
                  {fp.checksum ? (
                    <p className="text-adv-gray">
                      <strong>Checksum:</strong>{' '}
                      <code className="font-mono text-adv-off-white" title={fp.checksum}>{shortChecksum(fp.checksum)}</code>
                      <span className="block font-mono text-sm text-adv-gray/80 break-all mt-0.5">{fp.checksum}</span>
                    </p>
                  ) : (
                    <p className="text-adv-gold">No checksum — this bundle comes from an older ANTON and its files cannot be verified.</p>
                  )}
                  <p className={`mt-1 ${signerLine(fp).tone}`}>{signerLine(fp).text}</p>
                  {fp.signerPubkey && (
                    <p className="mt-0.5 font-mono text-sm text-adv-gray/80 break-all" title="Signer public key">{fp.signerPubkey.slice(0, 32)}…</p>
                  )}
                </div>
              )}

              {/* What travels with the module (Wave 6) */}
              {isModuleBundle && (embeddedSkills.length > 0 || embeddedPersonas.length > 0 || unresolvedSkills.length > 0 || unresolvedPersonas.length > 0) && (
                <div className="bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3 text-sm space-y-1">
                  <h3 className="text-sm font-semibold text-adv-teal mb-1">Travels with this module</h3>
                  {embeddedSkills.length > 0 && (
                    <p className="flex items-start gap-2 text-adv-gray">
                      <Puzzle className="w-4 h-4 mt-0.5 text-adv-teal shrink-0" aria-hidden="true" />
                      <span><strong>Skills:</strong> {embeddedSkills.map((s) => s.name).join(', ')}</span>
                    </p>
                  )}
                  {embeddedPersonas.length > 0 && (
                    <p className="flex items-start gap-2 text-adv-gray">
                      <UserRound className="w-4 h-4 mt-0.5 text-adv-teal shrink-0" aria-hidden="true" />
                      <span><strong>Personas:</strong> {embeddedPersonas.map((p) => p.name).join(', ')}</span>
                    </p>
                  )}
                  {(unresolvedSkills.length > 0 || unresolvedPersonas.length > 0) && (
                    <p className="text-adv-gold">
                      Referenced but not included by the exporter: {[...unresolvedSkills.map((s) => `skill ${s}`), ...unresolvedPersonas.map((p) => `persona ${p}`)].join(', ')}.
                    </p>
                  )}
                </div>
              )}

              {/* Governance (KP-03 trust metadata) */}
              {validation.governance && (
                <div className="bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3 text-sm">
                  <h3 className="text-sm font-semibold text-adv-teal mb-1">Governance</h3>
                  {validation.governance.validated_by && (
                    <p className="text-adv-gray"><strong>Validated by:</strong> {validation.governance.validated_by}</p>
                  )}
                  {validation.governance.source_url && (
                    <p className="text-adv-gray break-all"><strong>Source:</strong> {validation.governance.source_url}</p>
                  )}
                  {validation.governance.effective_date && (
                    <p className="text-adv-gray"><strong>Effective:</strong> {validation.governance.effective_date}</p>
                  )}
                  {validation.governance.content_confirmed !== undefined && (
                    <p className="text-adv-gray">
                      <strong>Content confirmed:</strong> {validation.governance.content_confirmed ? 'yes' : 'no'}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-adv-gray">Declared by the bundle author — not independently verified.</p>
                </div>
              )}

              {/* Notes (e.g. where deep validation for this type happens) */}
              {validation.notes && validation.notes.length > 0 && (
                <div className="bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3 space-y-1">
                  {validation.notes.map((note, i) => (
                    <p key={i} className="text-sm text-adv-gray">{note}</p>
                  ))}
                </div>
              )}

              {/* Errors */}
              {validation.errors.length > 0 && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm font-semibold text-red-400">
                      {validation.errors.length} Error{validation.errors.length > 1 ? 's' : ''} Found
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {validation.errors.map((err, i) => (
                      <div key={i} className="text-sm">
                        <p className="text-red-300 font-medium">Step {err.step}: {err.message}</p>
                        {err.details && <p className="text-red-400/70 text-sm mt-1">{err.details}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Injection findings — block until accepted (Wave 6) */}
              {findings.length > 0 && (
                <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3" data-testid="injection-findings">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm font-semibold text-red-400">
                      {findings.length} possible prompt-injection pattern{findings.length > 1 ? 's' : ''}
                    </h3>
                  </div>
                  <p className="text-sm text-adv-gray mb-2">
                    These sentences try to change how the AI behaves beyond the module's purpose. Some legitimate prompts
                    trip the scan — read each one before deciding.
                  </p>
                  <FindingsList findings={findings} />
                  <label className="mt-3 flex items-start gap-2 text-sm text-adv-off-white cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={acceptFindings}
                      onChange={(e) => setAcceptFindings(e.target.checked)}
                    />
                    <span>I have read these findings and want to import this module anyway. The findings are recorded with the module.</span>
                  </label>
                </div>
              )}

              {/* Warnings */}
              {validation.warnings.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <h3 className="text-sm font-semibold text-yellow-400">
                      {validation.warnings.length} Warning{validation.warnings.length > 1 ? 's' : ''}
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {validation.warnings.map((warn, i) => (
                      <div key={i} className="text-sm">
                        <p className="text-yellow-300">Step {warn.step}: {warn.message}</p>
                        {warn.details && <p className="text-yellow-400/70 text-sm mt-1">{warn.details}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success */}
              {validation.valid && findings.length === 0 && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-sm text-green-300">
                      Validation passed. No prompt-injection patterns found.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-4 bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3" role="alert">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-adv-teal/20 sticky bottom-0 bg-adv-card">
          {result ? (
            <button
              onClick={finish}
              className="flex items-center gap-2 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Done
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-adv-gray hover:text-adv-white transition-colors"
                disabled={isImporting}
              >
                Cancel
              </button>
              {validation && validation.valid && isModuleBundle && (
                <button
                  onClick={handleImport}
                  disabled={isImporting || importBlockedByFindings}
                  title={importBlockedByFindings ? 'Read and accept the injection findings first' : undefined}
                  className="flex items-center gap-2 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Package className="w-4 h-4" />
                  {isImporting ? 'Importing...' : findings.length > 0 ? 'Import Anyway' : 'Import Module'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
