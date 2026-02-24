import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Save } from 'lucide-react';
import VersionHistory from './VersionHistory';

interface PromptEditorProps {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
  /** Optional: entity ID used to scope version history. When provided, Save Version and History buttons appear. */
  entityId?: string;
  /** Entity type for version history. Defaults to 'prompt'. */
  entityType?: string;
}

export default function PromptEditor({
  value,
  defaultValue,
  onChange,
  entityId,
  entityType = 'prompt',
}: PromptEditorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  const isModified = value !== defaultValue;

  async function handleSaveVersion() {
    if (!entityId || !value.trim()) return;
    setSaving(true);
    try {
      await fetch(`/api/versions/${entityType}/${entityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: value,
          label: `Saved ${new Date().toLocaleDateString()}`,
        }),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-adv-gray" />
          ) : (
            <ChevronRight className="h-4 w-4 text-adv-gray" />
          )}
          <span className="text-sm font-medium text-adv-off-white">System Prompt</span>
          {isModified && (
            <span className="rounded bg-adv-gold/10 px-1.5 py-0.5 text-[10px] text-adv-gold">
              Modified
            </span>
          )}
        </div>
        <span className="text-[11px] text-adv-gray-med">{wordCount} words</span>
      </button>

      {isOpen && (
        <div className="border-t border-border p-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark p-3 font-mono text-xs text-adv-off-white placeholder:text-adv-gray-med focus:border-adv-teal focus:outline-none focus:ring-1 focus:ring-adv-teal"
            rows={12}
            placeholder="System prompt..."
          />
          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] text-adv-gray-med">
              This prompt shapes Claude's behavior for this module.
            </span>
            <div className="flex items-center gap-3">
              {entityId && (
                <VersionHistory
                  entityType={entityType}
                  entityId={entityId}
                  onRestore={onChange}
                />
              )}
              {entityId && (
                <button
                  onClick={() => void handleSaveVersion()}
                  disabled={saving || !value.trim()}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors disabled:opacity-50 text-adv-teal hover:text-adv-teal-dark"
                  title="Save a version snapshot"
                >
                  <Save className="h-3 w-3" />
                  {savedFlash ? 'Saved!' : saving ? 'Saving...' : 'Save Version'}
                </button>
              )}
              {isModified && (
                <button
                  onClick={() => onChange(defaultValue)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-adv-gray hover:text-adv-off-white transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset to default
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
