import { useState } from 'react';
import { Package, Loader2, Check } from 'lucide-react';

interface ExportAntonButtonProps {
  type: 'review-profile' | 'script-lite' | 'script-medium' | 'blueprint';
  id: string;
  label?: string;
  className?: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ExportAntonButton({
  type,
  id,
  label = 'Export .anton',
  className = '',
}: ExportAntonButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  const handleExport = async () => {
    if (state !== 'idle' || !id) return;
    setState('loading');

    try {
      const res = await fetch(`/api/coding/export/${type}/${id}`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
      });

      if (!res.ok) {
        console.error('[ExportAntonButton] Export failed:', res.status);
        setState('idle');
        return;
      }

      // Download the returned blob as a .anton file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Build filename from content-disposition header or defaults
      const disposition = res.headers.get('content-disposition');
      let filename = `${type}-${id}.anton`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setState('done');
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      console.error('[ExportAntonButton] Export error:', err);
      setState('idle');
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={state === 'loading' || !id}
      className={`flex items-center gap-1.5 rounded-md border border-border bg-adv-dark px-2.5 py-1.5 text-xs text-adv-teal hover:border-adv-teal hover:bg-adv-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      title="Export as .anton bundle"
    >
      {state === 'loading' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Exporting...
        </>
      ) : state === 'done' ? (
        <>
          <Check className="h-3 w-3" />
          Downloaded
        </>
      ) : (
        <>
          <Package className="h-3 w-3" />
          {label}
        </>
      )}
    </button>
  );
}
