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
import { Pill, SectionLabel, StatusDot, Ico, MonogramTile, getModuleGlyph, Spinner } from '../components/ui';
import { listModules, type PinnedModule, type BrowseModule } from '../services/modules';
import type { MonogramTone } from '../components/ui';

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

function browseModuleGlyph(m: BrowseModule): { letters: string; tone: MonogramTone } {
  // Look up by stable id first; if unknown, derive 2-letter initials from
  // the name and tone by domain heuristic on the description text.
  const fromMap = getModuleGlyph(m.id, m.name);
  if (fromMap.letters !== initials(m.name) || MODULE_GLYPH_HAS(m.id)) return fromMap;
  const desc = (m.description || '').toLowerCase();
  let tone: MonogramTone = 'slate';
  if (/sanc|risk|threat|alert/.test(desc))                tone = 'red';
  else if (/legal|compliance|finance|review|counsel/.test(desc)) tone = 'blue';
  else if (/auto|invest|market|payment/.test(desc))       tone = 'gold';
  else if (/research|knowledge|learn/.test(desc))         tone = 'teal';
  else if (/draft|create|present/.test(desc))             tone = 'plum';
  return { letters: initials(m.name), tone };
}

function MODULE_GLYPH_HAS(id: string): boolean {
  // Lightweight check; importing the full record just for `in` would be ugly.
  // The map is exported, but we keep this helper inline to avoid a re-export.
  return getModuleGlyph(id).letters !== '??' && getModuleGlyph(id).letters !== id.slice(0, 2).toUpperCase();
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
        <div className="-mr-2.5 flex items-center">
          <button
            aria-label="Search modules"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Ico name="search" color="var(--color-text-muted)" size={18} />
          </button>
          <button
            aria-label="Grid view"
            className="flex h-11 w-11 items-center justify-center"
          >
            <Ico name="grid" color="var(--color-text)" size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Find-the-right-module hero ──────────────────── */}
        <div
          className="mt-2 mb-3 rounded-[var(--radius-r3)] text-white"
          style={{
            background: 'var(--color-accent)',
            marginLeft: 16,
            marginRight: 16,
            padding: 16,
          }}
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
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {/* Pinned grid */}
            <SectionLabel className="px-4 pb-2 pt-1">Pinned · {pinned.length}</SectionLabel>
            <div className="mb-4 grid grid-cols-2 gap-2.5" style={{ marginLeft: 16, marginRight: 16 }}>
              {pinned.map(m => (
                <button
                  key={m.id}
                  onClick={() => onNavigate('chat')}
                  className="rounded-[var(--radius-r2)] text-left"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    padding: 14,
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

            {/* Browse list — Claude-Design rows: colored monogram + title + meta + chevron */}
            <SectionLabel className="px-4 pb-2">Browse all · {browse.length}+</SectionLabel>
            <div
              className="mb-4 overflow-hidden rounded-[var(--radius-r2)]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                marginLeft: 16,
                marginRight: 16,
              }}
            >
              {browse.map((m, i) => {
                const glyph = browseModuleGlyph(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => onNavigate('chat')}
                    className="flex w-full items-center text-left transition active:bg-[var(--color-surface-alt)]"
                    style={{
                      gap: 12,
                      paddingLeft: 14,
                      paddingRight: 14,
                      paddingTop: 12,
                      paddingBottom: 12,
                      borderTop: i > 0 ? '1px solid var(--color-border-soft)' : 'none',
                    }}
                  >
                    <MonogramTile letters={glyph.letters} tone={glyph.tone} size={32} />
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          letterSpacing: '-0.1px',
                          lineHeight: 1.25,
                        }}
                      >
                        {m.name}
                      </div>
                      <div
                        className="mt-0.5 truncate"
                        style={{ fontSize: 11, color: 'var(--color-text-muted)' }}
                      >
                        {m.description}
                      </div>
                    </div>
                    <Ico name="chevronRight" color="var(--color-text-faint)" size={16} />
                  </button>
                );
              })}
            </div>

            {/* Hint */}
            <div className="mx-4 mb-6 text-center">
              <p
                className="font-mono uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: '0.5px',
                  color: 'var(--color-text-faint)',
                }}
              >
                Tap any module to open it on your ANTON instance
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
