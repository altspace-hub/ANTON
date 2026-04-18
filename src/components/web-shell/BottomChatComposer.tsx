/**
 * BottomChatComposer — Web UX v2 iteration composer.
 *
 * Sits at the bottom of every run-page. Lets the user refine the
 * current output via a follow-up message (or re-run with new
 * config). Includes a version-history strip showing prior runs.
 *
 * Per design/web-v3-screens.jsx SanctionsComposer:
 *   • History strip — "History 3/6" + version pills (current = accent)
 *   • Composer card — placeholder + bottom toolbar
 *   • Toolbar: Attach · Prompt Lib · KB (subtle) · Re-run · Send (primary)
 *   • Token meter on the right ("0 / 8k · Haiku 4.5 · €0.004/msg")
 */

import { useState, type ReactNode } from 'react';
import { Plus, Sparkles, BookOpen, ChevronRight } from 'lucide-react';
import { Btn, Dot } from '../web-ui';

export interface ChatVersion {
  id: string;
  label: string;
  current?: boolean;
}

export interface BottomChatComposerProps {
  /** Versions to render in the history strip (left to right). */
  versions?: ChatVersion[];
  /** Composer placeholder text. */
  placeholder?: string;
  /** Token / cost meter shown on the right side of the toolbar. */
  meter?: ReactNode;
  /** Initial composer text. */
  value?: string;
  /** Called whenever the textarea value changes. */
  onChange?: (v: string) => void;
  /** Send handler (⌘/Ctrl+Enter and the Send button). Receives current text. */
  onSend?: (text: string) => void;
  /** Re-run handler (re-runs with current settings, no new prompt). */
  onRerun?: () => void;
  /** Attach handler (file picker etc.). */
  onAttach?: () => void;
  /** Prompt library handler. */
  onPromptLib?: () => void;
  /** Knowledge base picker handler. */
  onKb?: () => void;
  /** Optional version-pill click — switch to that version. */
  onVersionClick?: (id: string) => void;
  /** Disable Send button (e.g. while a run is in flight). */
  busy?: boolean;
}

export function BottomChatComposer({
  versions = [],
  placeholder = 'Ask a follow-up question or request changes…',
  meter,
  value,
  onChange,
  onSend,
  onRerun,
  onAttach,
  onPromptLib,
  onKb,
  onVersionClick,
  busy,
}: BottomChatComposerProps): JSX.Element {
  const [text, setText] = useState(value ?? '');
  const current = versions.findIndex(v => v.current);
  const total = versions.length;

  function handleChange(v: string) {
    setText(v);
    onChange?.(v);
  }
  function handleSend() {
    if (!text.trim() || busy) return;
    onSend?.(text);
  }

  return (
    <div
      className="px-7 pt-3 pb-3.5"
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border-soft)',
      }}
    >
      {/* History strip */}
      {versions.length > 0 && (
        <div className="mb-2.5 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
          <span className="font-mono">
            History {current >= 0 ? current + 1 : total}/{total}
          </span>
          <span className="h-px flex-1" style={{ background: 'var(--color-border-soft)' }} />
          {versions.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => onVersionClick?.(v.id)}
              className="inline-flex items-center gap-1.5 rounded px-2 py-[3px] text-[11px]"
              style={{
                background: v.current ? 'var(--color-accent-soft)' : 'transparent',
                color:      v.current ? 'var(--color-adv-teal)' : 'var(--color-text-muted)',
                border: `1px solid ${v.current ? 'var(--color-accent-dim)' : 'var(--color-border-soft)'}`,
              }}
            >
              {v.current && <Dot size={5} />}
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Composer card */}
      <div
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 10,
          padding: '10px 12px 8px',
        }}
      >
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          rows={2}
          className="w-full resize-none bg-transparent text-[13px] leading-snug text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          style={{ minHeight: 44 }}
          disabled={busy}
        />
        <div
          className="flex items-center gap-2 pt-1.5"
          style={{ borderTop: '1px solid var(--color-border-soft)' }}
        >
          <Btn
            type="button"
            variant="subtle"
            size="sm"
            icon={<Plus size={12} strokeWidth={1.5} />}
            onClick={onAttach}
          >
            Attach
          </Btn>
          <Btn
            type="button"
            variant="subtle"
            size="sm"
            icon={<Sparkles size={12} strokeWidth={1.5} />}
            onClick={onPromptLib}
          >
            Prompt Lib
          </Btn>
          <Btn
            type="button"
            variant="subtle"
            size="sm"
            icon={<BookOpen size={12} strokeWidth={1.5} />}
            onClick={onKb}
          >
            KB
          </Btn>
          <span className="flex-1" />
          {meter && (
            <span className="font-mono text-[10.5px] text-[var(--color-text-faint)]">
              {meter}
            </span>
          )}
          {onRerun && (
            <Btn type="button" variant="secondary" size="sm" onClick={onRerun} disabled={busy}>
              Re-run
            </Btn>
          )}
          <Btn
            type="button"
            variant="primary"
            size="sm"
            iconRight={<ChevronRight size={12} strokeWidth={1.5} />}
            onClick={handleSend}
            disabled={busy || !text.trim()}
          >
            {busy ? 'Sending…' : 'Send'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
