import { useState, useCallback } from 'react';
import { exportDocument } from '@/lib/api';

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);

  const doExport = useCallback(async (format: string, content: string, filename?: string) => {
    setIsExporting(true);
    try {
      const blob = await exportDocument(format, content);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename || 'output'}.${format}`;
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
