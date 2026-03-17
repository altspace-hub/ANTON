/**
 * DatasetsPage.tsx
 * Browse and manage saved datasets for workflow reuse.
 */

import { useState, useEffect } from 'react';
import {
  Database,
  Calendar,
  Users,
  Trash2,
  Download,
  Clock,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react';

const getToken = () => localStorage.getItem('openexpert-token') ?? '';

interface Dataset {
  id: string;
  name: string;
  description?: string;
  row_count: number;
  size_bytes: number;
  created_by: string;
  session_id?: string;
  source_type: string;
  created_at: string;
  expires_at?: string;
  last_accessed_at?: string;
  access_count: number;
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadDatasets();
  }, []);

  async function loadDatasets() {
    setLoading(true);
    try {
      const res = await fetch('/api/datasets', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDatasets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load datasets:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this dataset? This cannot be undone.')) return;

    setDeleteId(id);
    try {
      const res = await fetch(`/api/datasets/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (res.ok) {
        setDatasets((prev) => prev.filter((d) => d.id !== id));
      } else {
        alert('Failed to delete dataset');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setDeleteId(null);
    }
  }

  async function handleDownload(id: string, name: string) {
    try {
      // Load dataset into cache
      const res = await fetch(`/api/datasets/${id}/load`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (res.ok) {
        const data = await res.json();
        // Export as JSON
        const exportRes = await fetch('/api/data/export', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            datasetId: data.cacheId,
            destination: 'file',
            fileType: 'json',
            filePath: `./exports/${name}.json`,
          }),
        });

        if (exportRes.ok) {
          alert(`Dataset exported to exports/${name}.json`);
        }
      }
    } catch (err) {
      alert('Export failed');
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getDaysUntilExpiry(expiresAt?: string): number | null {
    if (!expiresAt) return null;
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  const scopeColors = {
    global: 'bg-adv-teal/20 text-adv-teal border-adv-teal/30',
    session: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/10">
          <Database className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-adv-white">Saved Datasets</h1>
          <p className="text-sm text-adv-gray">Reusable data collections from workflows</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      ) : datasets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Database className="mx-auto mb-3 h-8 w-8 text-adv-gray" />
          <p className="text-sm text-adv-gray">No saved datasets yet.</p>
          <p className="mt-1 text-xs text-adv-gray">
            Use the "Save dataset for reuse" option in workflow data import steps.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {datasets.map((dataset) => {
            const daysLeft = getDaysUntilExpiry(dataset.expires_at);
            const isExpiringSoon = daysLeft !== null && daysLeft <= 7;

            return (
              <div
                key={dataset.id}
                className="rounded-lg border border-border bg-adv-card p-4 transition-all hover:border-adv-gray-med"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-adv-white">{dataset.name}</h3>
                    {dataset.description && (
                      <p className="mt-0.5 text-xs text-adv-gray line-clamp-2">{dataset.description}</p>
                    )}
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                      dataset.session_id ? scopeColors.session : scopeColors.global
                    }`}
                  >
                    {dataset.session_id ? 'Session' : 'Global'}
                  </span>
                </div>

                {/* Stats */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-adv-gray">
                    <FileText className="h-3.5 w-3.5" />
                    <span>
                      {dataset.row_count.toLocaleString()} rows · {formatBytes(dataset.size_bytes)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-adv-gray">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Created {formatDate(dataset.created_at)}</span>
                  </div>

                  {dataset.last_accessed_at && (
                    <div className="flex items-center gap-2 text-adv-gray">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        Last used {formatDate(dataset.last_accessed_at)} ({dataset.access_count} times)
                      </span>
                    </div>
                  )}

                  {daysLeft !== null && (
                    <div
                      className={`flex items-center gap-2 ${
                        isExpiringSoon ? 'text-adv-gold' : 'text-adv-gray'
                      }`}
                    >
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>
                        {daysLeft > 0 ? `Expires in ${daysLeft} days` : 'Expired'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                  <button
                    onClick={() => handleDownload(dataset.id, dataset.name)}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-adv-dark px-3 py-1.5 text-xs text-adv-off-white hover:bg-adv-dark-2 transition-colors"
                    title="Export as JSON"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export
                  </button>

                  <button
                    onClick={() => handleDelete(dataset.id)}
                    disabled={deleteId === dataset.id}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-adv-red/10 px-3 py-1.5 text-xs text-adv-red hover:bg-adv-red/20 disabled:opacity-50 transition-colors"
                    title="Delete dataset"
                  >
                    {deleteId === dataset.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
