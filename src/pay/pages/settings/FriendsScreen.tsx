/**
 * FriendsScreen — manage saved payment contacts ("friends").
 *
 * Contacts are added EXPLICITLY here (never auto-populated from
 * received transactions) — the address-poisoning defense documented in
 * services/address-book.ts. addContact() rejects exact duplicates and
 * runs the look-alike (Levenshtein) check; we surface whatever it
 * throws verbatim so the user sees the "looks similar to <name>"
 * warning before a near-miss address ever lands in the book.
 *
 * Per-row Rename / Delete. Presentation-only otherwise — no signing,
 * no chain calls.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Field from '../../components/Field';
import {
  listContacts, addContact, renameContact, deleteContact,
  renderAddressSegments, type Contact,
} from '../../services/address-book';

interface Props {
  onBack: () => void;
}

/** Same shape the QR decoder accepts — fc_ + 20-64 Base58 chars. */
const FC_ADDRESS = /^fc_[1-9A-HJ-NP-Za-km-z]{20,64}$/;

export default function FriendsScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setContacts(await listContacts());
  }

  useEffect(() => { void refresh(); }, []);

  async function add() {
    if (busy) return;
    setError(null);
    const trimmedName = name.trim();
    const trimmedAddr = address.trim();
    if (!trimmedName) {
      setError(t('friends.errorNoName', 'Give this friend a name.'));
      return;
    }
    if (!FC_ADDRESS.test(trimmedAddr)) {
      setError(t('friends.errorBadAddress', 'That is not a valid fc_ address.'));
      return;
    }
    setBusy(true);
    try {
      // addContact rejects exact duplicates AND surfaces the
      // address-poisoning look-alike warning — show the thrown message.
      await addContact(trimmedName, trimmedAddr);
      setName('');
      setAddress('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('friends.errorGeneric', 'Could not add this friend.'));
    } finally {
      setBusy(false);
    }
  }

  async function rename(c: Contact) {
    const next = window.prompt(t('friends.renamePrompt', 'New name for this friend'), c.label);
    if (next === null) return; // cancelled
    const trimmed = next.trim();
    if (!trimmed || trimmed === c.label) return;
    await renameContact(c.id, trimmed);
    await refresh();
  }

  async function remove(c: Contact) {
    if (!window.confirm(t('friends.deleteConfirm', 'Remove {{name}} from your friends?', { name: c.label }))) {
      return;
    }
    await deleteContact(c.id);
    await refresh();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        {/* Header */}
        <div className="flex items-center gap-3 -ml-2 mb-4">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back')} style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('friends.title', 'Friends')}
          </h2>
        </div>

        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--color-text-muted)' }}>
          {t('friends.subtitle',
            'Save the people and merchants you pay so their name shows up instead of a long address. Only addresses you add here are ever shown as a friend.')}
        </p>

        <div className="flex flex-col gap-6">
          {/* ── Add a friend ──────────────────────────────────────────── */}
          <Section title={t('friends.addTitle', 'Add a friend')}>
            <div className="rounded-xl p-4"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <Field label={t('friends.name', 'Name')} value={name}
                     onChange={setName} placeholder="Anna" />
              <Field label={t('friends.address', 'FutureChain address')} value={address}
                     onChange={setAddress} placeholder="fc_…" autoCapitalize="none" />
              {error && (
                <div className="rounded-lg p-3 mt-1 mb-2 text-xs leading-relaxed"
                     style={{ backgroundColor: 'var(--color-error-bg)',
                              border: '1px solid var(--color-error)',
                              color: 'var(--color-error)' }}>
                  {error}
                </div>
              )}
              <button type="button" onClick={() => void add()} disabled={busy}
                      className="w-full py-3 rounded-xl text-sm font-semibold mt-1"
                      style={{ backgroundColor: 'var(--color-accent)',
                               color: 'var(--color-accent-fg)',
                               opacity: busy ? 0.6 : 1 }}>
                {busy ? t('common.working', 'Working…') : t('friends.add', 'Add friend')}
              </button>
            </div>
          </Section>

          {/* ── Saved friends ─────────────────────────────────────────── */}
          <Section title={t('friends.savedTitle', 'Saved friends')}>
            {contacts.length === 0 ? (
              <div className="rounded-xl p-6 text-center"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  {t('friends.empty', 'No friends yet')}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                  {t('friends.emptyBody', 'Add someone above and their name will appear on your payments.')}
                </div>
              </div>
            ) : (
              contacts.map((c) => (
                <FriendRow key={c.id} contact={c}
                           onRename={() => void rename(c)}
                           onDelete={() => void remove(c)} />
              ))
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

/** One saved contact — resolved label, segmented address, row actions. */
function FriendRow({ contact, onRename, onDelete }: {
  contact: Contact;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const label = contact.label.trim() || t('friends.unnamed', 'Unnamed');
  const segments = renderAddressSegments(contact.address);
  return (
    <div className="rounded-xl p-4"
         style={{ backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)' }}>
      <div className="font-bold" style={{ color: 'var(--color-text)' }}>{label}</div>
      {/* Segmented address — middle 8 chars highlighted (the part an
          attacker can't grind for vanity collisions). */}
      <div className="mono text-xs mt-1 break-all">
        {segments.map((seg, i) => (
          <span key={i}
                style={{ color: seg.secure ? 'var(--color-text-body)' : 'var(--color-text-faint)' }}>
            {seg.text}{i < segments.length - 1 ? ' ' : ''}
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={onRename}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'var(--color-surface-muted)',
                         border: '1px solid var(--color-border)',
                         color: 'var(--color-text)' }}>
          {t('friends.rename', 'Rename')}
        </button>
        <button type="button" onClick={onDelete}
                className="flex-1 py-2 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: 'transparent',
                         border: '1px solid var(--color-error)',
                         color: 'var(--color-error)' }}>
          {t('common.delete', 'Delete')}
        </button>
      </div>
    </div>
  );
}

/** Section wrapper — uppercase header above a stack of cards. Mirrors
 *  SettingsScreen's Section so the two screens read identically. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[11px] uppercase tracking-wider font-semibold px-1"
          style={{ color: 'var(--color-text-faint)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
