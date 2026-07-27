import { useState, useCallback } from 'react';
import { exportDocument } from '@/lib/api';

export interface ExportMetadata {
  filename?: string;
  title?: string;
  author?: string;
  model?: string;
  thinking?: string;
  moduleId?: string;
  sessionId?: string;
  creativity?: string;
  /** ATTR-02: names of documents/sources loaded during this analysis */
  documentsLoaded?: string[];
}

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  /**
   * Last export failure, for the caller to render.
   *
   * Previously a failed export was caught and sent to console.error only, so the user
   * saw the button spin and then nothing at all — indistinguishable from a no-op. That
   * hid a real, reproducible server error (duplicate XLSX worksheet names) for as long
   * as it existed: people reported "the Excel button does nothing", which is exactly
   * what a swallowed 500 looks like. A failure the user cannot see is a failure nobody
   * reports accurately.
   */
  const [exportError, setExportError] = useState<string | null>(null);

  const doExport = useCallback(async (format: string, content: string, metadata?: ExportMetadata | string) => {
    setIsExporting(true);
    // Accept plain string as filename shorthand (legacy call sites pass e.g. 'open-chat-output')
    const resolvedMeta: ExportMetadata | undefined =
      typeof metadata === 'string' ? { filename: metadata } : metadata;
    const filename = resolvedMeta?.filename || 'output';
    try {
      const blob = await exportDocument(format, content, resolvedMeta as Record<string, unknown>);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportError(null);
    } catch (error) {
      console.error('Export failed:', error);
      setExportError(
        error instanceof Error && error.message
          ? `Export failed: ${error.message}`
          : `Export to ${format.toUpperCase()} failed. Please try again or choose another format.`,
      );
    } finally {
      setIsExporting(false);
    }
  }, []);

  const clearExportError = useCallback(() => setExportError(null), []);

  return { doExport, isExporting, exportError, clearExportError };
}
