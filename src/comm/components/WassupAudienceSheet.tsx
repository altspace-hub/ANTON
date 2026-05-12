/**
 * WassupAudienceSheet — choose who can see a Wassup post.
 *
 * Two modes:
 *   - Everyone (default): fan out to every contact with a known publicKey.
 *   - Specific people: multi-select a subset of contacts.
 *
 * The selection is returned to the composer so it can be displayed as a
 * chip and forwarded to publishWassupPost(). The composer holds the
 * authoritative state; this sheet is stateless across opens.
 */
import { useEffect, useMemo, useState } from 'react';
import { Ico } from './Ico';
import BottomSheet from './BottomSheet';
import { listContacts, type Contact } from '../services/contacts';

export type WassupAudience =
  | { mode: 'everyone' }
  | { mode: 'specific'; contactHashes: string[] };

interface Props {
  open: boolean;
  onClose: () => void;
  initial: WassupAudience;
  onChoose: (audience: WassupAudience) => void;
}

export default function WassupAudienceSheet({ open, onClose, initial, onChoose }: Props) {
  const [mode, setMode] = useState<WassupAudience['mode']>(initial.mode);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initial.mode === 'specific' ? initial.contactHashes : [])
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode(initial.mode);
    setSelected(new Set(initial.mode === 'specific' ? initial.contactHashes : []));
    void listContacts().then((rows) => {
      setContacts(rows.filter((c) => !!c.publicKeyHex));
    });
  }, [open, initial]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.displayName.toLowerCase().includes(q) || c.contactHash.toLowerCase().includes(q),
    );
  }, [contacts, filter]);

  function toggle(hash: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  }

  function confirm(): void {
    if (mode === 'everyone') {
      onChoose({ mode: 'everyone' });
    } else {
      onChoose({ mode: 'specific', contactHashes: Array.from(selected) });
    }
    onClose();
  }

  const specificValid = mode === 'everyone' || selected.size > 0;

  return (
    <BottomSheet open={open} onClose={onClose} title="Who can see this?" icon="users" maxHeight="85dvh">
      <div className="px-3 pt-2 flex gap-2 flex-shrink-0">
        <button
          onClick={() => setMode('everyone')}
          className="flex-1 px-3 py-2 rounded-2xl text-[13px] font-medium border"
          style={{
            borderColor: mode === 'everyone' ? 'var(--color-accent)' : 'var(--color-border-soft)',
            backgroundColor: mode === 'everyone' ? 'var(--color-accent-dim)' : 'var(--color-surface-alt)',
            color: mode === 'everyone' ? 'var(--color-accent-dark)' : 'var(--color-text)',
          }}
        >
          All contacts
        </button>
        <button
          onClick={() => setMode('specific')}
          className="flex-1 px-3 py-2 rounded-2xl text-[13px] font-medium border"
          style={{
            borderColor: mode === 'specific' ? 'var(--color-accent)' : 'var(--color-border-soft)',
            backgroundColor: mode === 'specific' ? 'var(--color-accent-dim)' : 'var(--color-surface-alt)',
            color: mode === 'specific' ? 'var(--color-accent-dark)' : 'var(--color-text)',
          }}
        >
          Pick people
        </button>
      </div>

      {mode === 'specific' && (
        <>
          <div className="px-5 pt-3 flex-shrink-0">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search contacts"
              className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2"
              style={{ outlineColor: 'var(--color-accent)' }}
            />
          </div>
          <ul className="flex-1 overflow-y-auto px-3 pt-2 pb-2">
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-xs text-[var(--color-text-faint)] text-center">
                {contacts.length === 0
                  ? 'No reachable contacts yet — add one from the Chat tab.'
                  : 'No matches.'}
              </li>
            )}
            {filtered.map((c) => {
              const on = selected.has(c.contactHash);
              return (
                <li key={c.contactHash}>
                  <button
                    onClick={() => toggle(c.contactHash)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left active:bg-[var(--color-surface-muted)]"
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                      style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
                    >
                      {c.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text)] truncate">
                        {c.displayName}
                      </div>
                      <div className="text-[11px] text-[var(--color-text-faint)] truncate">
                        {c.contactHash}
                      </div>
                    </div>
                    <div
                      className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
                      style={{
                        borderColor: on ? 'var(--color-accent)' : 'var(--color-border)',
                        backgroundColor: on ? 'var(--color-accent)' : 'transparent',
                      }}
                    >
                      {on && <Ico name="check" size={14} color="var(--color-accent-fg)" />}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="px-5 pt-3 flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex-1 py-2.5 rounded-2xl text-sm font-medium text-[var(--color-text-muted)]"
          style={{ backgroundColor: 'var(--color-surface-alt)' }}
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={!specificValid}
          className="flex-1 py-2.5 rounded-2xl text-sm font-medium disabled:opacity-40"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          {mode === 'specific'
            ? `Choose ${selected.size}${selected.size === 1 ? ' contact' : ' contacts'}`
            : 'Done'}
        </button>
      </div>
    </BottomSheet>
  );
}
