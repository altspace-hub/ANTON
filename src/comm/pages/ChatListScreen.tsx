import { useEffect, useState } from 'react';
import { listContacts, type Contact } from '../services/contacts';

interface Props {
  onAddContact: () => void;
  onOpenChat: (contactHash: string) => void;
  refreshKey?: number;
}

export default function ChatListScreen({ onAddContact, onOpenChat, refreshKey }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listContacts()
      .then((rows) => { if (!cancelled) { setContacts(rows); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Chat</h1>
        <button
          onClick={onAddContact}
          aria-label="Add contact"
          className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-medium"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
        >
          +
        </button>
      </div>

      {!loaded ? (
        <div className="px-5 py-10 text-center text-sm text-[var(--color-text-faint)]">
          Loading…
        </div>
      ) : contacts.length === 0 ? (
        <div className="px-5 mt-4">
          <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt)] p-6 text-center">
            <p className="text-sm text-[var(--color-text-body)]">
              No contacts yet.
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-faint)]">
              Tap + to add a friend by scanning their QR or pasting their contact code.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--color-border-soft)]">
          {contacts.map((c) => (
            <li key={c.contactHash}>
              <button
                onClick={() => onOpenChat(c.contactHash)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left active:bg-[var(--color-surface-muted)]"
              >
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-base font-semibold flex-shrink-0"
                  style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
                >
                  {c.displayName.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-medium text-[var(--color-text)] truncate">
                    {c.displayName}
                  </div>
                  <div className="text-xs font-mono text-[var(--color-text-faint)] truncate">
                    {c.contactHash}
                  </div>
                </div>
                {!c.publicKeyHex && (
                  <span
                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--color-gold-dim)', color: 'var(--color-gold)' }}
                  >
                    Key pending
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
