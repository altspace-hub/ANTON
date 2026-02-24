/**
 * ExportModuleModal.tsx
 *
 * Modal for exporting custom modules to .anton files
 * Shows module details and triggers download
 */

import { useState } from 'react';
import { Download, Package, X } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

interface ExportModuleModalProps {
  moduleId: string;
  moduleName: string;
  onClose: () => void;
}

export function ExportModuleModal({ moduleId, moduleName, onClose }: ExportModuleModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/exchange/export/${moduleId}?type=custom`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Export failed');
      }

      // Download the .anton file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${moduleId}.anton`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Close modal after successful export
      setTimeout(onClose, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-adv-card border border-adv-teal/20 rounded-lg shadow-lg max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-adv-teal/20">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-adv-teal" />
            <h2 className="text-lg font-semibold text-adv-white">Export Module</h2>
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
          <p className="text-adv-off-white mb-4">
            Export <span className="font-semibold text-adv-teal">{moduleName}</span> as a shareable .anton file.
          </p>

          <div className="bg-adv-teal-soft border border-adv-teal/20 rounded-lg px-4 py-3 mb-4">
            <p className="text-sm text-adv-off-white mb-2">
              <strong className="text-adv-teal">What's included:</strong>
            </p>
            <ul className="text-sm text-adv-gray space-y-1 list-disc list-inside">
              <li>System prompt and configuration</li>
              <li>Guided input fields</li>
              <li>Default settings</li>
              <li>SHA-256 integrity checksum</li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 mb-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="bg-adv-dark-2 border border-adv-teal/10 rounded-lg px-4 py-3">
            <p className="text-xs text-adv-gray">
              <strong className="text-adv-off-white">Security:</strong> Exported files contain only JSON and Markdown.
              No executable code. Validated on import with 5-step security scan.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-adv-teal/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-adv-gray hover:text-adv-white transition-colors"
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-adv-teal hover:bg-adv-teal-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : 'Export .anton'}
          </button>
        </div>
      </div>
    </div>
  );
}
