import { useState, useEffect } from 'react';
import { History, X, RotateCcw, ChevronRight } from 'lucide-react';

interface Version {
  id: number;
  version_number: number;
  label: string | null;
  created_at: string;
  content_length: number;
}

interface Props {
  entityType: string;
  entityId: string;
  onRestore: (content: string) => void;
  className?: string;
}

export default function VersionHistory({ entityType, entityId, onRestore, className }: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewVersionNumber, setPreviewVersionNumber] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      void loadVersions();
    }
  }, [open, entityType, entityId]);

  async function loadVersions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/versions/${entityType}/${entityId}`);
      const data = (await res.json()) as Version[];
      setVersions(data);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePreview(versionNumber: number) {
    try {
      const res = await fetch(`/api/versions/${entityType}/${entityId}/${versionNumber}`);
      const data = (await res.json()) as { content: string };
      setPreviewContent(data.content);
      setPreviewVersionNumber(versionNumber);
    } catch {
      // silently fail
    }
  }

  function handleRestore() {
    if (previewContent) {
      onRestore(previewContent);
      setOpen(false);
      setPreviewContent(null);
      setPreviewVersionNumber(null);
    }
  }

  function handleClose() {
    setOpen(false);
    setPreviewContent(null);
    setPreviewVersionNumber(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors ${className ?? ''}`}
        title="Version history"
      >
        <History className="w-3.5 h-3.5" />
        History
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/50" onClick={handleClose} />

          {/* Slide-out Panel */}
          <div className="w-96 bg-adv-dark-2 border-l border-adv-card flex flex-col shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-adv-card">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-adv-teal" />
                <span className="text-sm font-semibold text-adv-off-white">Version History</span>
              </div>
              <button
                onClick={handleClose}
                className="text-adv-gray hover:text-adv-off-white transition-colors"
                aria-label="Close version history"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {previewContent !== null ? (
              /* Preview pane */
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-adv-teal-soft border-b border-adv-card flex items-center justify-between">
                  <span className="text-xs text-adv-teal">Previewing v{previewVersionNumber}</span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setPreviewContent(null);
                        setPreviewVersionNumber(null);
                      }}
                      className="text-xs text-adv-gray hover:text-adv-off-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRestore}
                      className="flex items-center gap-1 text-xs text-adv-teal hover:text-adv-teal-dark font-semibold transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore this version
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  <pre className="text-xs text-adv-gray whitespace-pre-wrap font-mono leading-relaxed">
                    {previewContent}
                  </pre>
                </div>
              </div>
            ) : (
              /* Version list */
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32 text-adv-gray text-sm">
                    Loading...
                  </div>
                ) : versions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-6">
                    <History className="w-8 h-8 text-adv-gray" />
                    <p className="text-sm text-adv-gray">No saved versions yet.</p>
                    <p className="text-xs text-adv-gray">
                      Save a version using the button next to the prompt editor.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-adv-card">
                    {versions.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => void handlePreview(v.version_number)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-adv-card transition-colors text-left"
                      >
                        <div>
                          <div className="text-sm text-adv-off-white">
                            v{v.version_number}
                            {v.label ? (
                              <span className="text-adv-gray"> — {v.label}</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-adv-gray mt-0.5">
                            {new Date(v.created_at).toLocaleString()} &middot;{' '}
                            {Math.round(v.content_length / 1000)}k chars
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-adv-gray flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
