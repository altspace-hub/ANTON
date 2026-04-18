/**
 * WorkModulesScreen — companion-app Work tab (Evolution design).
 *
 * Per design/screens-modules.jsx WorkModulesScreen:
 *   • Top bar — "Work"
 *   • Find-the-right-module hero — accent-coloured card with NL input
 *     (search + voice icons) + intent chips. Submitting routes the query
 *     to the chat tab.
 *   • Pinned grid — 4 cards (2x2): coloured square + name + description
 *     + "N running" status when busy
 *   • Browse all list — 8-12 modules with mono initials + chevron
 */

import { useEffect, useState } from 'react';
import { Pill, SectionLabel, StatusDot, Ico } from '../components/ui';
import { listModules, type PinnedModule, type BrowseModule } from '../services/modules';

interface Props {
  orgId: string;
  onNavigate: (tab: string) => void;
  onAskWith?: (prompt: string) => void;
}

const COLOR_VAR: Record<PinnedModule['color'], string> = {
  red:   'var(--color-red)',
  blue:  'var(--color-blue)',
  teal:  'var(--color-accent)',
  gold:  'var(--color-gold)',
  green: 'var(--color-green)',
};

const INTENT_CHIPS = [
  'Draft something',
  'Review a contract',
  'Explain a regulation',
  'Run a scan',
];

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function WorkModulesScreen({ orgId, onNavigate, onAskWith }: Props): JSX.Element {
  const [pinned,  setPinned]  = useState<PinnedModule[]>([]);
  const [browse,  setBrowse]  = useState<BrowseModule[]>([]);
  const [draft,   setDraft]   = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listModules(orgId);
        if (!cancelled) {
          setPinned(list.pinned);
          setBrowse(list.browse);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  function handleAsk(prompt: string) {
    if (!prompt.trim()) return;
    if (onAskWith) onAskWith(prompt);
    onNavigate('chat');
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--color-surface-alt)', minHeight: 44 }}
      >
        <div
          className="text-[var(--color-text)]"
          style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px' }}
        >
          Work
        </div>
        <div className="flex items-center gap-2.5">
          <Ico name="search" color="var(--color-text-muted)" size={18} />
          <Ico name="grid"   color="var(--color-text)"       size={18} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Find-the-right-module hero ──────────────────── */}
        <div
          className="mx-3.5 mt-2 mb-2.5 rounded-[var(--radius-r3)] p-3.5 text-white"
          style={{ background: 'var(--color-accent)' }}
        >
          <div className="mb-1 flex items-center gap-1.5 opacity-90">
            <Ico name="sparkles" color="#fff" size={13} />
            <span
              className="font-mono font-bold uppercase"
              style={{ fontSize: 10, letterSpacing: '0.5px' }}
            >
              Find the right module
            </span>
          </div>
          <div
            style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', lineHeight: 1.3, marginBottom: 10 }}
          >
            What are you trying to do?
          </div>
          <div
            className="mb-2 flex items-center gap-2 rounded-full px-3.5 py-2"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            <Ico name="search" color="#fff" size={14} />
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAsk(draft);
                  setDraft('');
                }
              }}
              placeholder="Review a vendor I've never seen before"
              className="flex-1 bg-transparent text-[12px] text-white placeholder:text-white/70 focus:outline-none"
              style={{ minWidth: 0 }}
            />
            <button
              onClick={() => onNavigate('voice')}
              aria-label="Voice"
              className="flex items-center justify-center"
            >
              <Ico name="mic" color="#fff" size={14} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {INTENT_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => handleAsk(chip)}
                className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <span
              className="block h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
            />
          </div>
        ) : (
          <>
            {/* Pinned grid */}
            <SectionLabel className="px-4 pb-2 pt-1">Pinned · {pinned.length}</SectionLabel>
            <div className="mx-3.5 mb-4 grid grid-cols-2 gap-2">
              {pinned.map(m => (
                <button
                  key={m.id}
                  onClick={() => onNavigate('chat')}
                  className="rounded-[var(--radius-r2)] p-3 text-left"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="mb-2 flex items-center gap-1.5">
                    <span
                      className="block rounded-sm"
                      style={{ width: 8, height: 8, background: COLOR_VAR[m.color] }}
                    />
                    {m.busy && <StatusDot tone="green" pulse size={6} />}
                  </div>
                  <div
                    className="text-[var(--color-text)]"
                    style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}
                  >
                    {m.name}
                  </div>
                  <div
                    className="mt-0.5 font-mono uppercase text-[var(--color-text-muted)]"
                    style={{ fontSize: 10, letterSpacing: '0.3px' }}
                  >
                    {m.description}
                  </div>
                  {m.busy && m.message && (
                    <div
                      className="mt-2 font-mono font-bold"
                      style={{ fontSize: 10, color: COLOR_VAR[m.color] }}
                    >
                      {m.message}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Browse list */}
            <SectionLabel className="px-4 pb-2">Browse all · {browse.length}+</SectionLabel>
            <div className="mx-3.5 mb-4 flex flex-col">
              {browse.map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => onNavigate('chat')}
                  className="flex items-center gap-3 px-2 py-2.5 text-left"
                  style={{
                    borderBottom: i < browse.length - 1 ? '1px solid var(--color-border-soft)' : 'none',
                  }}
                >
                  <div
                    className="flex flex-shrink-0 items-center justify-center rounded-[var(--radius-r1)] font-mono font-bold text-[var(--color-text)]"
                    style={{
                      width: 32, height: 32,
                      background: 'var(--color-surface-alt)',
                      fontSize: 12,
                    }}
                  >
                    {initials(m.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[var(--color-text)]">
                      {m.name}
                    </div>
                    <div className="text-[11px] text-[var(--color-text-muted)]">
                      {m.description}
                    </div>
                  </div>
                  <Ico name="chevronRight" color="var(--color-text-faint)" size={16} />
                </button>
              ))}
            </div>

            {/* Hint pill */}
            <div className="mx-4 mb-6 text-center">
              <Pill tone="neutral" mono>
                Tap any module to open it on your ANTON instance
              </Pill>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
