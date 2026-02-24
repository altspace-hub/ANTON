/**
 * ImportModuleModal.tsx
 *
 * Modal for importing .anton files
 * Shows validation results and preview before installing
 */

import { useState } from 'react';
import { Upload, Package, X, CheckCircle, AlertTriangle, XCircle, FileText } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

interface ValidationError {
  step: number;
  severity: 'critical' | 'high';
  message: string;
  details?: string;
}

interface ValidationWarning {
  step: number;
  severity: 'high' | 'medium' | 'low';
  message: string;
  details?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  manifest?: {
    meta: {
      id: string;
      name: string;
      version: string;
      author: string;
      description: string;
      tags: string[];
      category: string;
    };
  };
}

interface ImportModuleModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportModuleModal({ onClose, onSuccess }: ImportModuleModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setValidation(null);
      setError(null);
    }
  };

  const handleValidate = async () => {
    if (!file) return;

    setIsValidating(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/exchange/validate', {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Validation failed');
      }

      const result: ValidationResult = await response.json();
      setValidation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!file || !validation?.valid) return;

    setIsImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/exchange/import', {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Import failed');
      }

      // Close first, then notify parent — prevents state updates on unmounted component
      onClose();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-adv-card border border-adv-teal/20 rounded-lg shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-adv-teal/20 sticky top-0 bg-adv-card z-10">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-adv-teal" />
            <h2 className="text-lg font-semibold text-adv-white">Import Module</h2>
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
          {/* File Upload */}
          {!file && (
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
          {file && !validation && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-adv-dark-2 border border-adv-teal/20 rounded-lg px-4 py-3">
                <FileText className="w-5 h-5 text-adv-teal" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-adv-white">{file.name}</p>
                  <p className="text-xs text-adv-gray">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="text-adv-gray hover:text-adv-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-lg px-4 py-3">
                <p className="text-sm text-adv-off-white mb-2">
                  <strong className="text-adv-teal">5-Step Security Validation:</strong>
                </p>
                <ul className="text-sm text-adv-gray space-y-1 list-disc list-inside">
                  <li>ZIP integrity check (no executables)</li>
                  <li>Schema validation (manifest v1.0)</li>
                  <li>Content sanitization (strip dangerous patterns)</li>
                  <li>Prompt injection scan</li>
                  <li>Dependency resolution</li>
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
          {validation && (
            <div className="space-y-4">
              {/* Module Preview */}
              {validation.manifest && (
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
                    {validation.manifest.meta.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {validation.manifest.meta.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-adv-teal/20 text-adv-teal text-xs rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
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
                        {err.details && <p className="text-red-400/70 text-xs mt-1">{err.details}</p>}
                      </div>
                    ))}
                  </div>
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
                        {warn.details && <p className="text-yellow-400/70 text-xs mt-1">{warn.details}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Success */}
              {validation.valid && (
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <p className="text-sm text-green-300">
                      Validation passed! Module is safe to import.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-adv-teal/20 sticky bottom-0 bg-adv-card">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-adv-gray hover:text-adv-white transition-colors"
            disabled={isImporting}
          >
            Cancel
          </button>
          {validation && validation.valid && (
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Package className="w-4 h-4" />
              {isImporting ? 'Importing...' : 'Import Module'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
