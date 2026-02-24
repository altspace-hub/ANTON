/**
 * INTEGRATION EXAMPLE
 *
 * This file demonstrates how to integrate version history and diff viewing
 * into an existing module's output panel.
 *
 * DO NOT IMPORT THIS FILE — it's documentation only.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Save, GitCompare } from 'lucide-react';
import { VersionDiffViewer, saveVersion, listVersions } from '@/features/versions';

// Example: Adding version controls to a module output panel
export function ExampleModuleOutputPanel({ sessionId, currentOutput }: {
  sessionId: string;
  currentOutput: string;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [showQuickDiff, setShowQuickDiff] = useState(false);
  const [lastTwoVersions, setLastTwoVersions] = useState<number[] | null>(null);

  // Save current output as a new version
  async function handleSaveVersion() {
    const label = prompt('Version label (optional):');
    if (label === null) return; // User cancelled

    setSaving(true);
    try {
      await saveVersion('session', sessionId, currentOutput, label || undefined);
      alert('Version saved successfully');
    } catch (e) {
      alert(`Failed to save version: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  // Quick compare: open diff viewer for last 2 versions
  async function handleQuickCompare() {
    try {
      const versions = await listVersions('session', sessionId);
      if (versions.length < 2) {
        alert('Need at least 2 versions to compare');
        return;
      }
      setLastTwoVersions([versions[1].id, versions[0].id]); // older, newer
      setShowQuickDiff(true);
    } catch (e) {
      alert(`Failed to load versions: ${(e as Error).message}`);
    }
  }

  return (
    <div className="bg-adv-card rounded-lg p-4">
      {/* Output content */}
      <div className="prose prose-invert max-w-none mb-4">
        <div dangerouslySetInnerHTML={{ __html: currentOutput }} />
      </div>

      {/* Version controls */}
      <div className="flex items-center gap-2 pt-4 border-t border-[#1e2d45]">
        {/* Save version button */}
        <button
          onClick={handleSaveVersion}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-adv-teal text-adv-dark
                     hover:bg-adv-teal-dark transition-colors text-sm font-medium
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save Version'}
        </button>

        {/* Quick compare button */}
        <button
          onClick={handleQuickCompare}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-adv-teal/40
                     text-adv-teal hover:bg-adv-teal/10 text-sm transition-colors"
        >
          <GitCompare size={14} />
          Compare Last 2
        </button>

        {/* View all versions button */}
        <button
          onClick={() => navigate(`/versions?entityType=session&entityId=${sessionId}`)}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-[#1e2d45]
                     text-adv-gray hover:text-adv-white hover:border-adv-teal/40 text-sm transition-colors"
        >
          <Clock size={14} />
          Version History
        </button>
      </div>

      {/* Quick diff viewer modal */}
      {showQuickDiff && lastTwoVersions && (
        <VersionDiffViewer
          oldVersionId={lastTwoVersions[0]}
          newVersionId={lastTwoVersions[1]}
          onClose={() => {
            setShowQuickDiff(false);
            setLastTwoVersions(null);
          }}
        />
      )}
    </div>
  );
}

// Example: Auto-save version on every Claude response
export function useAutoSaveVersions(
  sessionId: string,
  entityType: string = 'session'
) {
  async function autoSave(content: string, triggerReason: string) {
    try {
      await saveVersion(
        entityType,
        sessionId,
        content,
        `Auto-save: ${triggerReason} at ${new Date().toLocaleTimeString()}`
      );
      console.log(`Version auto-saved: ${triggerReason}`);
    } catch (e) {
      console.error('Auto-save failed:', e);
    }
  }

  return { autoSave };
}

// Example usage in a module component:
/*
function MyModule() {
  const [output, setOutput] = useState('');
  const sessionId = 'abc-123';
  const { autoSave } = useAutoSaveVersions(sessionId);

  async function handleClaudeResponse(response: string) {
    setOutput(response);
    await autoSave(response, 'Claude response received');
  }

  return (
    <ExampleModuleOutputPanel sessionId={sessionId} currentOutput={output} />
  );
}
*/
