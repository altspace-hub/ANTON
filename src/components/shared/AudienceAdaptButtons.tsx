/**
 * AudienceAdaptButtons.tsx
 *
 * Wave 2.6 — Audience Adaptation
 *
 * A row of quick-action buttons: [Board] [Regulator] [Project Team] [Client]
 * Clicking a button sends the content to POST /api/audience-adapter/adapt and
 * fires onAdapted with the rewritten text when complete.
 *
 * Shows per-button loading state while the request is in flight, and a brief
 * success state after adaptation is returned.
 */

import { useState } from 'react';
import { CheckCircle, Loader } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

interface AudienceButton {
  id: string;
  label: string;
}

// The four primary Wave 2.6 audiences
const AUDIENCE_BUTTONS: AudienceButton[] = [
  { id: 'board', label: 'Board' },
  { id: 'regulator', label: 'Regulator' },
  { id: 'team', label: 'Project Team' },
  { id: 'client', label: 'Client' },
];

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

interface AudienceAdaptButtonsProps {
  content: string;
  model?: string;
  sessionId?: string;
  onAdapted?: (audienceId: string, adaptedContent: string) => void;
}

// ── Helper ─────────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Component ──────────────────────────────────────────────────

export default function AudienceAdaptButtons({
  content,
  model,
  onAdapted,
}: AudienceAdaptButtonsProps) {
  // Track per-button state
  const [buttonStates, setButtonStates] = useState<Record<string, ButtonState>>({});

  const setButtonState = (id: string, state: ButtonState) => {
    setButtonStates((prev) => ({ ...prev, [id]: state }));
  };

  const handleAdapt = async (audienceId: string) => {
    const currentState = buttonStates[audienceId] ?? 'idle';
    if (currentState === 'loading') return; // prevent double-click

    if (!content || content.trim().length === 0) return;

    setButtonState(audienceId, 'loading');

    try {
      const res = await fetch('/api/audience-adapter/adapt', {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          audienceId,
          ...(model ? { model } : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { adapted: string };

      setButtonState(audienceId, 'success');
      onAdapted?.(audienceId, data.adapted);

      // Reset to idle after a short success flash
      setTimeout(() => setButtonState(audienceId, 'idle'), 2500);
    } catch (err) {
      console.error('[AudienceAdaptButtons] Adapt error:', err);
      setButtonState(audienceId, 'error');
      // Reset error state after a moment
      setTimeout(() => setButtonState(audienceId, 'idle'), 3000);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-adv-gray shrink-0">Adapt for:</span>
      {AUDIENCE_BUTTONS.map((btn) => {
        const state: ButtonState = buttonStates[btn.id] ?? 'idle';

        let buttonClass =
          'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed ';

        if (state === 'loading') {
          buttonClass +=
            'border-adv-teal/40 bg-adv-teal-dim text-adv-teal cursor-wait';
        } else if (state === 'success') {
          buttonClass +=
            'border-adv-green/40 bg-adv-green/10 text-adv-green';
        } else if (state === 'error') {
          buttonClass +=
            'border-adv-red/40 bg-adv-red/10 text-adv-red';
        } else {
          buttonClass +=
            'border-border bg-adv-dark text-adv-gray hover:border-adv-teal/60 hover:bg-adv-teal-dim hover:text-adv-teal';
        }

        return (
          <button
            key={btn.id}
            onClick={() => handleAdapt(btn.id)}
            disabled={state === 'loading'}
            className={buttonClass}
            title={
              state === 'success'
                ? `Adapted for ${btn.label} — check the output`
                : state === 'error'
                ? `Failed to adapt for ${btn.label} — try again`
                : `Rewrite for ${btn.label} audience`
            }
          >
            {state === 'loading' && (
              <Loader className="h-3 w-3 animate-spin" />
            )}
            {state === 'success' && (
              <CheckCircle className="h-3 w-3" />
            )}
            {btn.label}
            {state === 'success' && (
              <span className="text-xs font-normal opacity-80">done</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
