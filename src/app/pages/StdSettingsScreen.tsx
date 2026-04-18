/**
 * StdSettingsScreen — Standard mode "You" tab (Evolution design).
 *
 * Per design/screens-standard.jsx StdSettingsScreen:
 *   • "You · Daniel Berg · FutureChain" header
 *   • App mode toggle hero — two cards side-by-side; the active mode
 *     shows "✓ In use", the other says "Switch"
 *   • Plain settings list — accent colour (with swatch), text size,
 *     connected accounts, Face ID, privacy, help
 *
 * Critical responsibility: this is where users switch BACK to Pro
 * mode (Standard hides everything else technical) and where they
 * pick their personal accent.
 */

import { useState } from 'react';
import { Ico } from '../components/ui';
import { usePersonalization } from '../components/ui/PersonalizationContext';
import { ACCENTS, type AccentKey } from '../services/personalization';
import { getIdentity } from '../services/identity';
import { getActiveInstance } from '../services/instances';

interface Props {
  onBack: () => void;
}

const SETTINGS_ROWS = [
  { id: 'accent',  title: 'Your accent colour',  expandable: true },
  { id: 'text',    title: 'Text size',           sub: 'Large' },
  { id: 'mail',    title: 'Connected accounts',  sub: 'Connect mail and calendar from the Mail tab' },
  { id: 'biometric', title: 'Face ID / fingerprint', sub: 'On · required for money' },
  { id: 'privacy', title: 'Privacy',             sub: 'Your data stays on your ANTON' },
  { id: 'help',    title: 'Help & support',      sub: 'Chat, video call, or a person' },
] as const;

export default function StdSettingsScreen({ onBack: _onBack }: Props): JSX.Element {
  const { accent, mode, setAccent, setMode } = usePersonalization();
  const [expandAccent, setExpandAccent] = useState(false);
  const identity = getIdentity();
  const inst = getActiveInstance();
  const name = identity?.displayName || 'You';
  const orgLabel = inst?.org?.name || inst?.display_name || 'this instance';
  const currentAccent = ACCENTS.find(a => a.id === accent);

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar — large title */}
      <div className="px-[18px] py-3" style={{ background: 'var(--color-bg)' }}>
        <div
          className="text-[var(--color-text)]"
          style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', lineHeight: 1.1 }}
        >
          You
        </div>
        <div className="mt-1 text-sm text-[var(--color-text-muted)]">
          {name} · {orgLabel}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
        {/* App mode hero */}
        <div
          className="mb-5 rounded-[var(--radius-r3)] p-4"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div
            className="mb-2.5 font-bold uppercase text-[var(--color-text-muted)]"
            style={{ fontSize: 15, letterSpacing: '0.3px' }}
          >
            App mode
          </div>
          <div className="flex gap-2.5">
            {/* Standard card */}
            <button
              onClick={() => setMode('standard')}
              className="flex-1 rounded-[var(--radius-r2)] p-3.5 text-left"
              style={{
                background: mode === 'standard' ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                border: `2px solid ${mode === 'standard' ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              <div
                style={{
                  fontSize: 18, fontWeight: 700, letterSpacing: '-0.2px',
                  color: mode === 'standard' ? 'var(--color-accent)' : 'var(--color-text)',
                }}
              >
                Standard
              </div>
              <div className="mt-1 text-[13px] leading-snug text-[var(--color-text-body)]">
                Simple. One thing at a time. For daily life.
              </div>
              <div
                className="mt-2.5 font-bold"
                style={{
                  fontSize: 13,
                  color: mode === 'standard' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                }}
              >
                {mode === 'standard' ? '✓ In use' : 'Switch'}
              </div>
            </button>
            {/* Pro card */}
            <button
              onClick={() => setMode('pro')}
              className="flex-1 rounded-[var(--radius-r2)] p-3.5 text-left"
              style={{
                background: mode === 'pro' ? 'var(--color-accent-soft)' : 'var(--color-surface)',
                border: `2px solid ${mode === 'pro' ? 'var(--color-accent)' : 'var(--color-border)'}`,
              }}
            >
              <div
                style={{
                  fontSize: 18, fontWeight: 700, letterSpacing: '-0.2px',
                  color: mode === 'pro' ? 'var(--color-accent)' : 'var(--color-text)',
                }}
              >
                Pro
              </div>
              <div className="mt-1 text-[13px] leading-snug text-[var(--color-text-muted)]">
                All modules, more detail, advanced tools.
              </div>
              <div
                className="mt-2.5 font-bold"
                style={{
                  fontSize: 13,
                  color: mode === 'pro' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                }}
              >
                {mode === 'pro' ? '✓ In use' : 'Switch'}
              </div>
            </button>
          </div>
          <div className="mt-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
            You can switch any time. Your data and connections stay the same.
          </div>
        </div>

        {/* Settings list */}
        {SETTINGS_ROWS.map((r, i, arr) => {
          if (r.id === 'accent') {
            return (
              <div key={r.id}>
                <button
                  onClick={() => setExpandAccent(v => !v)}
                  className="flex w-full items-center gap-3.5 px-1 py-4 text-left"
                  style={{ borderBottom: !expandAccent && i < arr.length - 1 ? '1px solid var(--color-border-soft)' : 'none' }}
                >
                  <span
                    className="flex-shrink-0 rounded-full"
                    style={{ width: 24, height: 24, background: currentAccent?.hex || 'var(--color-accent)' }}
                  />
                  <div className="flex-1">
                    <div className="text-[16px] font-semibold text-[var(--color-text)]">{r.title}</div>
                    <div className="mt-0.5 text-[14px] text-[var(--color-text-muted)]">
                      {currentAccent?.label}
                    </div>
                  </div>
                  <Ico
                    name={expandAccent ? 'chevronDown' : 'chevronRight'}
                    color="var(--color-text-faint)"
                    size={20}
                  />
                </button>
                {/* Expanded picker */}
                {expandAccent && (
                  <div
                    className="mb-3 rounded-[var(--radius-r2)] p-3"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="grid grid-cols-4 gap-2.5">
                      {ACCENTS.map(a => {
                        const active = a.id === accent;
                        return (
                          <button
                            key={a.id}
                            onClick={() => setAccent(a.id as AccentKey)}
                            className="relative aspect-square rounded-[16px]"
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
                    {currentAccent?.sub && (
                      <div className="mt-3 text-[12px] leading-relaxed text-[var(--color-text-muted)]">
                        <b className="text-[var(--color-text)]">{currentAccent.label}</b> — {currentAccent.sub}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div
              key={r.id}
              className="flex items-center gap-3.5 px-1 py-4"
              style={{
                borderBottom: i < arr.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
              }}
            >
              <div className="flex-1">
                <div className="text-[16px] font-semibold text-[var(--color-text)]">{r.title}</div>
                {'sub' in r && r.sub && (
                  <div className="mt-0.5 text-[14px] text-[var(--color-text-muted)]">{r.sub}</div>
                )}
              </div>
              <Ico name="chevronRight" color="var(--color-text-faint)" size={20} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
