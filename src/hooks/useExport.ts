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

  const doExport = useCallback(async (format: string, content: string, metadata?: ExportMetadata) => {
    setIsExporting(true);
    const filename = metadata?.filename || 'output';
    try {
      const blob = await exportDocument(format, content, metadata);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, []);

  return { doExport, isExporting };
}
