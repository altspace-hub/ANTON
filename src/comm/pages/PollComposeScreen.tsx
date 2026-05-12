/**
 * PollComposeScreen — create a poll to send to a peer.
 *
 * Question (1-140 chars), 2-6 options (1-80 chars each), multi-select
 * toggle. Cancel / Create header buttons. On Create, calls sendPoll and
 * returns to the chat thread.
 */
import { useState } from 'react';
import { sendPoll, ChatError } from '../services/chat';
import { Ico } from '../components/Ico';

const MAX_QUESTION = 140;
const MAX_OPTION = 80;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

interface Props {
  peerContactHash: string;
  peerName: string;
  onCancel: () => void;
  onCreated: () => void;
}

export default function PollComposeScreen({ peerContactHash, peerName, onCancel, onCreated }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiSelect, setMultiSelect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedOptions = options.map((o) => o.trim());
  const filledCount = trimmedOptions.filter((o) => o.length > 0).length;
  const canCreate = question.trim().length > 0 && filledCount >= MIN_OPTIONS && !busy;

  function setOption(i: number, value: string) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value.slice(0, MAX_OPTION) : o)));
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  }

  function removeOption(i: number) {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleCreate() {
    setError(null);
    setBusy(true);
    try {
      const finalOptions = trimmedOptions.filter((o) => o.length > 0);
      const seen = new Set<string>();
      for (const o of finalOptions) {
        if (seen.has(o)) throw new Error('Options must be unique.');
        seen.add(o);
      }
      await sendPoll(peerContactHash, {
        question: question.trim().slice(0, MAX_QUESTION),
        options: finalOptions,
        multiSelect,
      });
      onCreated();
    } catch (e) {
      setError(e instanceof ChatError ? e.message : (e instanceof Error ? e.message : 'Failed to create poll'));
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col min-h-dvh max-h-dvh safe-top safe-bottom bg-[var(--color-bg)]">
      <header className="flex items-center justify-between h-12 px-4 border-b border-[var(--color-border-soft)] bg-[var(--color-surface)]">
        <button onClick={onCancel} className="text-sm text-[var(--color-text-muted)]" disabled={busy}>Cancel</button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">New poll</h1>
        <button
          onClick={() => void handleCreate()}
          disabled={!canCreate}
          className="text-sm font-semibold disabled:opacity-40"
          style={{ color: 'var(--color-accent)' }}
        >
          {busy ? 'Sending…' : 'Create'}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <p className="text-xs text-[var(--color-text-faint)]">To {peerName}</p>

        <section>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Question
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_QUESTION))}
            placeholder="Ask something…"
            rows={2}
            disabled={busy}
            className="w-full px-3 py-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] resize-none focus:outline-none focus:ring-2"
            style={{ outlineColor: 'var(--color-accent)' }}
          />
          <p className="mt-1 text-[10px] text-[var(--color-text-faint)] text-right">{question.length}/{MAX_QUESTION}</p>
        </section>

        <section>
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)] mb-1.5">
            Options
          </label>
          <ul className="space-y-2">
            {options.map((opt, i) => (
              <li key={i} className="flex items-center gap-2">
                <span
                  className="w-7 text-center text-xs text-[var(--color-text-faint)] font-mono select-none"
                  aria-hidden="true"
                >
                  {i + 1}.
                </span>
                <input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  disabled={busy}
                  maxLength={MAX_OPTION}
                  className="flex-1 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[15px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] focus:outline-none focus:ring-2"
                  style={{ outlineColor: 'var(--color-accent)' }}
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    onClick={() => removeOption(i)}
                    disabled={busy}
                    aria-label={`Remove option ${i + 1}`}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
                  >
                    <Ico name="x" size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {options.length < MAX_OPTIONS && (
            <button
              onClick={addOption}
              disabled={busy}
              className="mt-2 ml-9 text-sm font-medium disabled:opacity-40"
              style={{ color: 'var(--color-accent)' }}
            >
              + Add option
            </button>
          )}
        </section>

        <section>
          <button
            onClick={() => setMultiSelect((v) => !v)}
            aria-pressed={multiSelect}
            disabled={busy}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border"
            style={{
              borderColor: multiSelect ? 'var(--color-accent)' : 'var(--color-border-soft)',
              backgroundColor: multiSelect ? 'var(--color-accent-dim)' : 'var(--color-surface)',
            }}
          >
            <div className="flex-1 text-left">
              <div className="text-[14px] font-medium text-[var(--color-text)]">Allow multiple answers</div>
              <div className="text-[11px] text-[var(--color-text-muted)]">
                {multiSelect ? 'Each person can pick more than one option.' : 'Each person picks exactly one option.'}
              </div>
            </div>
            <span
              className="w-10 h-6 rounded-full p-0.5 flex-shrink-0"
              style={{ backgroundColor: multiSelect ? 'var(--color-accent)' : 'var(--color-border)' }}
            >
              <span
                className="block w-5 h-5 rounded-full bg-white transition-transform"
                style={{ transform: multiSelect ? 'translateX(16px)' : 'translateX(0)' }}
              />
            </span>
          </button>
        </section>

        {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
      </div>
    </section>
  );
}
