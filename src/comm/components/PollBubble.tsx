/**
 * PollBubble — interactive poll widget rendered inline in a chat thread.
 *
 * Reads the stored poll plaintext (PollPayload + votes map) and renders
 * one row per option with a vote-count badge and a horizontal bar that
 * fills proportionally. Tapping an option votes (or toggles for
 * multi-select); the bubble re-renders off the local store immediately.
 */
import { useTranslation } from 'react-i18next';
import { Ico } from './Ico';
import type { PollPayload } from '../services/chat';
import type { ChatMessage } from '../services/messages';

interface Props {
  message: ChatMessage;
  isMine: boolean;
  myHash?: string;
  time: string;
  onVote: (pollId: string, optionIdx: number[]) => void;
}

interface StoredPoll extends PollPayload {
  votes?: Record<string, number[]>;
}

export default function PollBubble({ message, isMine, myHash, time, onVote }: Props) {
  const { t } = useTranslation();
  let poll: StoredPoll | null = null;
  try { poll = JSON.parse(message.plaintext) as StoredPoll; } catch { /* ignore */ }
  if (!poll) return null;

  const votes = poll.votes ?? {};
  const myVote: number[] = (myHash && votes[myHash]) || [];
  const counts = countVotes(votes, poll.options.length);
  const total = Math.max(1, sum(counts));
  const expired = !!poll.expiresAt && poll.expiresAt <= new Date().toISOString();
  const hasVoted = myVote.length > 0;
  const showResults = hasVoted || expired || isMine;

  function handleTap(idx: number) {
    if (expired) return;
    let next: number[];
    if (poll!.multiSelect) {
      next = myVote.includes(idx) ? myVote.filter((v) => v !== idx) : [...myVote, idx];
    } else {
      next = myVote[0] === idx ? [] : [idx];
    }
    onVote(poll!.pollId, next);
  }

  return (
    <div
      className={`max-w-[85%] rounded-2xl ${isMine ? 'rounded-br-md' : 'rounded-bl-md'} overflow-hidden`}
      style={{
        backgroundColor: isMine ? 'var(--color-accent)' : 'var(--color-surface)',
        color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text)',
        border: isMine ? 'none' : '1px solid var(--color-border-soft)',
        minWidth: 260,
      }}
    >
      <div className="px-4 pt-3 pb-1">
        <div className="text-[11px] uppercase tracking-wide opacity-70 flex items-center gap-1.5">
          <Ico name="grid" size={12} color={isMine ? 'rgba(255,255,255,0.8)' : 'var(--color-text-muted)'} />
          {t('poll.label', 'Poll')} · {poll.multiSelect ? t('poll.multipleAnswers', 'multiple answers') : t('poll.singleAnswer', 'single answer')}
        </div>
        <div className="mt-0.5 text-[15px] font-semibold leading-snug">{poll.question}</div>
      </div>

      <ul className="px-3 py-2 space-y-1.5">
        {poll.options.map((label, i) => {
          const count = counts[i];
          const pct = showResults ? Math.round((count / total) * 100) : 0;
          const mineHere = myVote.includes(i);
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => handleTap(i)}
                disabled={expired}
                className="w-full text-left rounded-xl overflow-hidden relative disabled:opacity-60"
                style={{
                  border: `1px solid ${isMine ? 'rgba(255,255,255,0.25)' : 'var(--color-border-soft)'}`,
                  backgroundColor: isMine ? 'rgba(255,255,255,0.08)' : 'var(--color-surface-alt)',
                }}
              >
                {showResults && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : 'var(--color-accent-dim)',
                    }}
                  />
                )}
                <div className="relative flex items-center gap-2 px-3 py-2">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      border: `2px solid ${mineHere ? (isMine ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)') : (isMine ? 'rgba(255,255,255,0.55)' : 'var(--color-border)')}`,
                      borderRadius: poll!.multiSelect ? 4 : 9999,
                    }}
                  >
                    {mineHere && (
                      <span
                        className="w-2.5 h-2.5"
                        style={{
                          backgroundColor: isMine ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)',
                          borderRadius: poll!.multiSelect ? 2 : 9999,
                        }}
                      />
                    )}
                  </span>
                  <span className="flex-1 text-[14px]">{label}</span>
                  {showResults && (
                    <span className="text-[12px] font-medium tabular-nums" style={{ opacity: 0.85 }}>
                      {count} · {pct}%
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div
        className="px-4 pb-2 pt-1 text-[10px] font-medium opacity-80 flex items-center justify-between"
        style={{ color: isMine ? 'var(--color-accent-fg)' : 'var(--color-text-muted)' }}
      >
        <span>
          {t('poll.voteCount', '{{count}} votes', { count: sum(counts) })}
          {expired && <> · {t('poll.closed', 'closed')}</>}
        </span>
        <time>{time}</time>
      </div>
    </div>
  );
}

function countVotes(votes: Record<string, number[]>, optionCount: number): number[] {
  const counts = new Array(optionCount).fill(0);
  for (const picks of Object.values(votes)) {
    for (const idx of picks) {
      if (idx >= 0 && idx < optionCount) counts[idx]++;
    }
  }
  return counts;
}

function sum(arr: number[]): number {
  let s = 0;
  for (const n of arr) s += n;
  return s;
}
