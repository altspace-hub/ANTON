/**
 * PersonalizePage — accent-picker step in onboarding (Evolution design).
 *
 * Per design/screens-personalize.jsx AccentPickerScreen: STEP 4/4 chip,
 * "Pick your ANTON colour" heading, live preview chip showing the user's
 * name + accent badge + LIVE pulse, 4x2 grid of accent swatches with
 * shadow + checkmark on active, sub-line under selection. "Continue" +
 * "Use organisation default" buttons.
 *
 * Persists via setAccent (PersonalizationContext) — applies live across
 * the app while the user is choosing.
 */

import { useState } from 'react';
import { Btn, Pill, SectionLabel, StatusDot, Ico } from '../components/ui';
import { usePersonalization } from '../components/ui/PersonalizationContext';
import { ACCENTS, type AccentKey } from '../services/personalization';
import { getIdentity } from '../services/identity';
import { getActiveInstance } from '../services/instances';

interface Props {
  onContinue: () => void;
  onBack?: () => void;
}

export default function PersonalizePage({ onContinue, onBack }: Props): JSX.Element {
  const { accent, setAccent } = usePersonalization();
  const [selected, setSelected] = useState<AccentKey>(accent);
  const identity = getIdentity();
  const inst = getActiveInstance();
  const name = identity?.displayName || 'You';
  const orgName = inst?.org?.name || inst?.display_name || 'this instance';
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const current = ACCENTS.find(a => a.id === selected) ?? ACCENTS[0];

  function pick(k: AccentKey) {
    setSelected(k);
    setAccent(k);   // apply live so the preview re-colours immediately
  }

  function useOrgDefault() {
    pick('emerald');
    onContinue();
  }

  return (
    <div
      className="safe-top safe-bottom flex min-h-dvh flex-col"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', borderBottom: '1px solid var(--color-border-soft)', minHeight: 44 }}
      >
        <button onClick={onBack} className="flex items-center gap-1.5">
          {onBack && <Ico name="chevronLeft" color="var(--color-text-muted)" size={20} />}
          <span className="text-sm font-semibold text-[var(--color-text)]">Personalise</span>
        </button>
        <Pill tone="neutral" mono>STEP 4 / 4</Pill>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
        <div
          className="text-[var(--color-text)]"
          style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.6px', lineHeight: 1.15 }}
        >
          Pick your ANTON colour
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
          Your companion shows this colour on approvals, live states, and accents.
          Change it any time in Settings — it only affects your device.
        </p>

        {/* Live preview chip — re-colours as the user picks */}
        <div
          className="mt-4 rounded-[var(--radius-r3)] p-4"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex flex-shrink-0 items-center justify-center rounded-[12px] font-mono font-bold text-white"
              style={{
                width: 44, height: 44,
                background: 'var(--color-accent)',
                fontSize: 15,
                boxShadow: `0 4px 14px color-mix(in srgb, var(--color-accent) 35%, transparent)`,
              }}
            >
              {initials}
            </div>
            <div className="flex-1">
              <div className="text-[14px] font-semibold text-[var(--color-text)]">{name}</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                {orgName} · {current.label}
              </div>
            </div>
            <Pill tone="teal">
              <StatusDot tone="green" pulse size={6} /> LIVE
            </Pill>
          </div>
          <div className="mt-3 flex gap-2">
            <Btn size="sm" variant="primary">Approve</Btn>
            <Btn size="sm" variant="secondary">Details</Btn>
          </div>
        </div>

        {/* Swatch grid — 4 columns */}
        <SectionLabel className="mb-2.5 mt-5">Your colour</SectionLabel>
        <div className="grid grid-cols-4 gap-2.5">
          {ACCENTS.map(a => {
            const active = a.id === selected;
            return (
              <button
                key={a.id}
                onClick={() => pick(a.id as AccentKey)}
                className="relative aspect-square rounded-[16px] p-0"
                style={{
                  background: a.hex,
                  border: active ? '3px solid var(--color-text)' : '3px solid transparent',
                  boxShadow: active
                    ? `0 6px 18px color-mix(in srgb, ${a.hex} 50%, transparent)`
                    : '0 2px 6px rgba(0,0,0,0.08)',
                }}
                aria-label={a.label}
              >
                {active && (
                  <span
                    className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full font-bold"
                    style={{ background: '#fff', color: a.hex, fontSize: 12 }}
                  >
                    ✓
                  </span>
                )}
                <span
                  className="absolute bottom-1.5 left-2 right-2 text-left font-semibold text-white"
                  style={{ fontSize: 11, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                >
                  {a.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-line under selection */}
        <p className="mt-3.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          <b className="text-[var(--color-text)]">{current.label}</b> — {current.sub}
        </p>

        <Btn variant="primary" block className="mt-5" onClick={onContinue}>
          Continue
        </Btn>

        <Btn
          variant="ghost"
          size="sm"
          block
          onClick={useOrgDefault}
          className="mt-2.5"
        >
          Use organisation default
        </Btn>
      </div>
    </div>
  );
}
