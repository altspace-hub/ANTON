/**
 * ResumePanel.tsx
 * Session Resume panel — shows the latest snapshot and injects resume context
 * into the system prompt when continuing a paused session.
 */

import React, { useState, useEffect } from 'react';
import { Clock, ChevronDown, ChevronUp, Bookmark, RefreshCw, CheckSquare, HelpCircle, ArrowRight } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Snapshot {
  id: string;
  session_id: string;
  snapshot_type: string;
  title: string | null;
  summary: string;
  key_decisions: string[];
  open_questions: string[];
  next_steps: string[];
  created_at: string;
}

interface ResumePanelProps {
  sessionId: string;
  onResumeContextReady?: (context: string) => void;
  onSaveSnapshot?: () => Promise<void>;
}

export function ResumePanel({ sessionId, onResumeContextReady, onSaveSnapshot }: ResumePanelProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadLatestSnapshot();
  }, [sessionId]);

  async function loadLatestSnapshot() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/snapshots/latest`);
      if (res.ok) {
        const data = await res.json() as { snapshot: Snapshot };
        setSnapshot(data.snapshot);

        // Notify parent of resume context
        if (onResumeContextReady) {
          const ctxRes = await fetch(`/api/sessions/${sessionId}/resume-context`);
          if (ctxRes.ok) {
            const ctxData = await ctxRes.json() as { context: string };
            onResumeContextReady(ctxData.context);
          }
        }
      }
    } catch {
      // No snapshot available
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoGenerate() {
    setGenerating(true);
    try {
      const res = await fetchWithAuth(`/api/sessions/${sessionId}/snapshots/auto`, { method: 'POST' });
      if (res.ok) {
        await loadLatestSnapshot();
      }
    } finally {
      setGenerating(false);
    }
  }

  async function handleManualSave() {
    if (onSaveSnapshot) {
      setSaving(true);
      try {
        await onSaveSnapshot();
        await loadLatestSnapshot();
      } finally {
        setSaving(false);
      }
    }
  }

  if (loading) {
    return (
      <div className="bg-adv-card border border-white/10 rounded-lg p-3 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-32" />
      </div>
    );
  }

  const timeLabel = snapshot
    ? new Date(snapshot.created_at).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-adv-card border border-white/10 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">Session Resume</span>
          {snapshot && (
            <span className="text-xs text-adv-gray flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeLabel}
            </span>
          )}
          {!snapshot && (
            <span className="text-xs text-adv-gray">No snapshot saved</span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-adv-gray" /> : <ChevronDown className="w-4 h-4 text-adv-gray" />}
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-white/10 p-3 space-y-3">
          {snapshot ? (
            <>
              {/* Summary */}
              <div>
                <p className="text-xs text-adv-gray mb-1">Summary</p>
                <p className="text-sm text-adv-off-white">{snapshot.summary}</p>
              </div>

              {/* Key Decisions */}
              {snapshot.key_decisions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <CheckSquare className="w-3 h-3 text-adv-teal" />
                    <p className="text-xs text-adv-gray font-medium">Key Decisions</p>
                  </div>
                  <ul className="space-y-0.5">
                    {snapshot.key_decisions.map((d, i) => (
                      <li key={i} className="text-xs text-adv-off-white flex gap-1.5">
                        <span className="text-adv-teal mt-0.5">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Open Questions */}
              {snapshot.open_questions.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <HelpCircle className="w-3 h-3 text-adv-gold" />
                    <p className="text-xs text-adv-gray font-medium">Open Questions</p>
                  </div>
                  <ul className="space-y-0.5">
                    {snapshot.open_questions.map((q, i) => (
                      <li key={i} className="text-xs text-adv-off-white flex gap-1.5">
                        <span className="text-adv-gold mt-0.5">?</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next Steps */}
              {snapshot.next_steps.length > 0 && (
                <div>
                  <div className="flex items-center gap-1 mb-1">
                    <ArrowRight className="w-3 h-3 text-adv-blue" />
                    <p className="text-xs text-adv-gray font-medium">Next Steps</p>
                  </div>
                  <ul className="space-y-0.5">
                    {snapshot.next_steps.map((s, i) => (
                      <li key={i} className="text-xs text-adv-off-white flex gap-1.5">
                        <span className="text-adv-blue mt-0.5">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-adv-gray">
              Save a snapshot to enable rich session resume. Claude will use the snapshot to restore full context when you return.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAutoGenerate}
              disabled={generating}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-adv-teal/15 text-adv-teal hover:bg-adv-teal/25 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
              Auto-generate
            </button>
            {onSaveSnapshot && (
              <button
                onClick={handleManualSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-white/5 text-adv-off-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <Bookmark className="w-3 h-3" />
                {saving ? 'Saving…' : 'Save now'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
