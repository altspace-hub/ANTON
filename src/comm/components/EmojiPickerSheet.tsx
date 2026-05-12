/**
 * EmojiPickerSheet — curated, categorised emoji picker for reactions.
 *
 * Not a full Unicode picker (those run ~3000 chars and are a tab-and-paste
 * nightmare on phones). Instead, six categories of common reactions
 * (Smileys / Hearts / Hands / Animals / Food / Activity) and a search box
 * that does case-insensitive substring match on the keyword strings.
 *
 * Selecting an emoji closes the sheet and calls onPick(e) so the caller
 * can persist a recents list, fire the reaction, etc.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Ico } from './Ico';
import { registerBackHandler } from '../services/back-stack';

interface EmojiEntry {
  e: string;
  /** Whitespace-separated search keywords, all lowercase. */
  k: string;
}

const CATEGORIES: { id: string; label: string; emojis: EmojiEntry[] }[] = [
  {
    id: 'smileys', label: 'Smileys',
    emojis: [
      { e: '😀', k: 'grin smile happy' }, { e: '😁', k: 'grin beam smile' },
      { e: '😂', k: 'laugh tears joy' }, { e: '🤣', k: 'rofl laugh' },
      { e: '😊', k: 'blush happy' }, { e: '😇', k: 'angel innocent' },
      { e: '🙂', k: 'smile slight' }, { e: '😍', k: 'love heart eyes' },
      { e: '😘', k: 'kiss' }, { e: '😋', k: 'yum tasty' },
      { e: '😎', k: 'cool sunglasses' }, { e: '🤩', k: 'star struck excited' },
      { e: '🥳', k: 'party celebrate' }, { e: '😏', k: 'smirk' },
      { e: '😒', k: 'unamused' }, { e: '🙄', k: 'eye roll' },
      { e: '😔', k: 'sad pensive' }, { e: '😢', k: 'cry sad' },
      { e: '😭', k: 'sob cry' }, { e: '😡', k: 'angry' },
      { e: '🤬', k: 'curse swear angry' }, { e: '😱', k: 'shock scream' },
      { e: '😨', k: 'fear afraid' }, { e: '😳', k: 'flushed embarrassed' },
      { e: '🤔', k: 'think hmm' }, { e: '🤯', k: 'mind blown shock' },
      { e: '😴', k: 'sleep tired' }, { e: '🥱', k: 'yawn tired' },
      { e: '🤗', k: 'hug' }, { e: '🤤', k: 'drool want' },
    ],
  },
  {
    id: 'hearts', label: 'Hearts',
    emojis: [
      { e: '❤️', k: 'heart love red' }, { e: '🧡', k: 'heart orange' },
      { e: '💛', k: 'heart yellow' }, { e: '💚', k: 'heart green' },
      { e: '💙', k: 'heart blue' }, { e: '💜', k: 'heart purple' },
      { e: '🖤', k: 'heart black' }, { e: '🤍', k: 'heart white' },
      { e: '🤎', k: 'heart brown' }, { e: '💖', k: 'sparkle heart' },
      { e: '💕', k: 'two hearts love' }, { e: '💓', k: 'beat heart' },
      { e: '💗', k: 'grow heart' }, { e: '💘', k: 'arrow cupid heart' },
      { e: '💝', k: 'gift heart ribbon' }, { e: '💞', k: 'revolve hearts' },
      { e: '💟', k: 'decoration heart' }, { e: '💔', k: 'broken heart' },
      { e: '❣️', k: 'exclamation heart' },
    ],
  },
  {
    id: 'hands', label: 'Hands',
    emojis: [
      { e: '👍', k: 'thumbs up ok' }, { e: '👎', k: 'thumbs down' },
      { e: '👏', k: 'clap applause' }, { e: '🙌', k: 'praise raise hands' },
      { e: '🙏', k: 'pray thanks please' }, { e: '🤝', k: 'handshake deal' },
      { e: '✊', k: 'fist solidarity' }, { e: '👊', k: 'punch fist bump' },
      { e: '🤛', k: 'left fist bump' }, { e: '🤜', k: 'right fist bump' },
      { e: '🫶', k: 'heart hands love' }, { e: '🫰', k: 'finger heart' },
      { e: '🤞', k: 'crossed fingers luck' }, { e: '✌️', k: 'peace victory' },
      { e: '🤟', k: 'love you sign' }, { e: '🤘', k: 'rock metal' },
      { e: '👌', k: 'ok perfect' }, { e: '🤌', k: 'pinched fingers italian' },
      { e: '🤏', k: 'pinch small' }, { e: '👈', k: 'point left' },
      { e: '👉', k: 'point right' }, { e: '👆', k: 'point up' },
      { e: '👇', k: 'point down' }, { e: '☝️', k: 'point up one' },
      { e: '👋', k: 'wave hello hi' },
    ],
  },
  {
    id: 'animals', label: 'Animals',
    emojis: [
      { e: '🐶', k: 'dog puppy' }, { e: '🐱', k: 'cat kitty' },
      { e: '🐭', k: 'mouse' }, { e: '🐹', k: 'hamster' },
      { e: '🐰', k: 'rabbit bunny' }, { e: '🦊', k: 'fox' },
      { e: '🐻', k: 'bear' }, { e: '🐼', k: 'panda' },
      { e: '🐨', k: 'koala' }, { e: '🐯', k: 'tiger' },
      { e: '🦁', k: 'lion' }, { e: '🐮', k: 'cow' },
      { e: '🐷', k: 'pig' }, { e: '🐸', k: 'frog' },
      { e: '🐵', k: 'monkey' }, { e: '🙈', k: 'see no evil monkey' },
      { e: '🐔', k: 'chicken' }, { e: '🐧', k: 'penguin' },
      { e: '🐦', k: 'bird' }, { e: '🦆', k: 'duck' },
      { e: '🐴', k: 'horse' }, { e: '🦄', k: 'unicorn' },
      { e: '🐝', k: 'bee' }, { e: '🦋', k: 'butterfly' },
      { e: '🐢', k: 'turtle' }, { e: '🐬', k: 'dolphin' },
      { e: '🐳', k: 'whale' }, { e: '🦈', k: 'shark' },
      { e: '🐙', k: 'octopus' }, { e: '🦀', k: 'crab' },
    ],
  },
  {
    id: 'food', label: 'Food',
    emojis: [
      { e: '🍎', k: 'apple red' }, { e: '🍊', k: 'orange' },
      { e: '🍌', k: 'banana' }, { e: '🍉', k: 'watermelon' },
      { e: '🍇', k: 'grapes' }, { e: '🍓', k: 'strawberry' },
      { e: '🥑', k: 'avocado' }, { e: '🍕', k: 'pizza' },
      { e: '🍔', k: 'burger' }, { e: '🍟', k: 'fries' },
      { e: '🌭', k: 'hot dog' }, { e: '🌮', k: 'taco' },
      { e: '🌯', k: 'burrito' }, { e: '🍣', k: 'sushi' },
      { e: '🍜', k: 'ramen noodle' }, { e: '🍝', k: 'pasta' },
      { e: '🍰', k: 'cake' }, { e: '🎂', k: 'birthday cake' },
      { e: '🍩', k: 'donut' }, { e: '🍪', k: 'cookie' },
      { e: '🍫', k: 'chocolate' }, { e: '🍿', k: 'popcorn' },
      { e: '☕', k: 'coffee' }, { e: '🍵', k: 'tea' },
      { e: '🍺', k: 'beer' }, { e: '🍷', k: 'wine' },
      { e: '🥂', k: 'cheers toast' }, { e: '🍾', k: 'champagne' },
    ],
  },
  {
    id: 'activity', label: 'Activity',
    emojis: [
      { e: '🎉', k: 'party celebrate' }, { e: '🎊', k: 'confetti' },
      { e: '✨', k: 'sparkles magic' }, { e: '⭐', k: 'star' },
      { e: '🌟', k: 'glowing star' }, { e: '💫', k: 'dizzy star' },
      { e: '🔥', k: 'fire lit' }, { e: '💯', k: 'hundred perfect' },
      { e: '🎯', k: 'bullseye target' }, { e: '🏆', k: 'trophy win' },
      { e: '🎁', k: 'gift present' }, { e: '🚀', k: 'rocket' },
      { e: '✅', k: 'check tick yes' }, { e: '❌', k: 'cross x no' },
      { e: '⚠️', k: 'warning' }, { e: '❓', k: 'question mark' },
      { e: '❗', k: 'exclamation' }, { e: '💡', k: 'idea bulb' },
      { e: '📌', k: 'pin' }, { e: '📍', k: 'pin location' },
      { e: '🔒', k: 'lock secure' }, { e: '🔑', k: 'key' },
      { e: '⏰', k: 'alarm clock' }, { e: '⌛', k: 'hourglass' },
      { e: '👀', k: 'eyes watching' }, { e: '💤', k: 'sleep zzz' },
    ],
  },
];

const RECENTS_KEY = 'anton-comm-emoji-recents';
const MAX_RECENTS = 16;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr.filter((e) => typeof e === 'string') as string[]).slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

function bumpRecent(emoji: string): void {
  try {
    const cur = loadRecents();
    const next = [emoji, ...cur.filter((e) => e !== emoji)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
}

export default function EmojiPickerSheet({ open, onClose, onPick }: Props) {
  const [tab, setTab] = useState<string>('recents');
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const r = loadRecents();
    setRecents(r);
    setTab(r.length > 0 ? 'recents' : CATEGORIES[0].id);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    return registerBackHandler(onClose);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const all = CATEGORIES.flatMap((c) => c.emojis);
    return all.filter((entry) => entry.k.includes(q));
  }, [query]);

  if (!open) return null;

  function pick(e: string): void {
    bumpRecent(e);
    onPick(e);
    onClose();
  }

  const activeCategory = CATEGORIES.find((c) => c.id === tab);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick an emoji"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(28, 26, 20, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--color-surface)] rounded-t-3xl pt-3 pb-4 safe-bottom max-h-[78dvh] flex flex-col"
      >
        <div className="w-10 h-1 rounded-full bg-[var(--color-border)] mx-auto mb-3" />

        <div className="px-4 pb-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2"
            style={{ outlineColor: 'var(--color-accent)' }}
          />
        </div>

        {filtered === null && (
          <div className="px-2 pb-2 flex gap-1 overflow-x-auto">
            {recents.length > 0 && (
              <TabButton id="recents" label="Recent" active={tab === 'recents'} onSelect={setTab} />
            )}
            {CATEGORIES.map((c) => (
              <TabButton key={c.id} id={c.id} label={c.label} active={tab === c.id} onSelect={setTab} />
            ))}
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-2">
          <div className="grid grid-cols-8 gap-1 pt-1">
            {filtered !== null
              ? filtered.map((entry) => (
                <EmojiButton key={entry.e} emoji={entry.e} onPick={pick} />
              ))
              : tab === 'recents'
                ? recents.map((e) => <EmojiButton key={e} emoji={e} onPick={pick} />)
                : (activeCategory?.emojis ?? []).map((entry) => (
                  <EmojiButton key={entry.e} emoji={entry.e} onPick={pick} />
                ))}
          </div>
          {filtered !== null && filtered.length === 0 && (
            <div className="py-6 text-center text-xs text-[var(--color-text-faint)]">
              No emojis match "{query}".
            </div>
          )}
        </div>

        <div className="px-4 pt-2">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl text-sm font-medium text-[var(--color-text-muted)]"
            style={{ backgroundColor: 'var(--color-surface-alt)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ id, label, active, onSelect }: { id: string; label: string; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      onClick={() => onSelect(id)}
      className="px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap"
      style={{
        backgroundColor: active ? 'var(--color-accent-dim)' : 'transparent',
        color: active ? 'var(--color-accent-dark)' : 'var(--color-text-muted)',
      }}
    >
      {label}
    </button>
  );
}

function EmojiButton({ emoji, onPick }: { emoji: string; onPick: (e: string) => void }) {
  return (
    <button
      onClick={() => onPick(emoji)}
      className="aspect-square rounded-xl flex items-center justify-center text-2xl active:bg-[var(--color-surface-muted)]"
      aria-label={`React with ${emoji}`}
    >
      {emoji}
    </button>
  );
}

// Export the icon-less plus-button style used by the consumer so the
// "open picker" affordance stays visually consistent with the quick row.
export const EMOJI_PICKER_PLUS_LABEL = 'More emoji';
