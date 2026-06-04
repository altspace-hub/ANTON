/**
 * RecipientPickerScreen — "Send to someone" (#89).
 *
 * Lists the people you can pay, grouped ⭐ Starred · 🔥 Frequent · 🕘 Recent
 * · 👥 Friends, with a search box and a "Pay a new address" escape hatch.
 * Tapping a person opens the pre-filled compose screen; the trailing ⭐
 * favourites them (promoting a recent into a saved friend) and "+ Friend"
 * saves them without starring.
 *
 * Recents/Frequent are derived from your SENT payments only (services/
 * recipients.ts) — never from received transactions (address-poisoning
 * defense). Read-only otherwise: no signing happens here.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  buildRecipientSections, toggleStar, saveAsFriend,
  type Recipient, type RecipientSections,
} from '../services/recipients';

interface Props {
  onBack: () => void;
  onPick: (recipient: Recipient) => void;
  onPayNewAddress: () => void;
}

const EMPTY: RecipientSections = { starred: [], frequent: [], recent: [], friends: [], all: [] };

export default function RecipientPickerScreen({ onBack, onPick, onPayNewAddress }: Props) {
  const { t } = useTranslation();
  const [sections, setSections] = useState<RecipientSections>(EMPTY);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setSections(await buildRecipientSections());
  }
  useEffect(() => { void refresh(); }, []);

  async function star(r: Recipient) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await toggleStar(r);
      await refresh();
    } catch (e) {
      // addContact's look-alike / duplicate guard surfaces here.
      setNotice(e instanceof Error ? e.message : t('send.starError', 'Could not update favourite.'));
    } finally {
      setBusy(false);
    }
  }

  async function addFriend(r: Recipient) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await saveAsFriend(r);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t('send.saveError', 'Could not save friend.'));
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const results = q
    ? sections.all.filter((r) =>
        r.name.toLowerCase().includes(q) || r.address.toLowerCase().includes(q))
    : [];

  const isEmpty = sections.all.length === 0;

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
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('send.title', 'Send to someone')}
          </h2>
        </div>

        {/* Search */}
        {!isEmpty && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('send.searchPlaceholder', 'Search name or address')}
            autoCapitalize="none"
            className="w-full rounded-xl px-4 py-3 text-sm mb-3"
            style={{ backgroundColor: 'var(--color-surface)',
                     border: '1px solid var(--color-border)',
                     color: 'var(--color-text)' }}
          />
        )}

        {/* Pay a new address */}
        <button type="button" onClick={onPayNewAddress}
                className="w-full rounded-xl p-3.5 mb-5 flex items-center gap-3 active:opacity-90 transition-opacity"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {t('send.newAddress', 'Pay a new address')}
          </span>
        </button>

        {notice && (
          <div className="rounded-lg p-3 mb-4 text-xs leading-relaxed"
               style={{ backgroundColor: 'var(--color-error-bg)',
                        border: '1px solid var(--color-error)', color: 'var(--color-error)' }}>
            {notice}
          </div>
        )}

        {isEmpty ? (
          <div className="rounded-xl p-6 text-center mt-2"
               style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
              {t('send.empty', 'No one to pay yet')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
              {t('send.emptyBody', 'Pay a new address above, or scan a QR — people you pay show up here.')}
            </div>
          </div>
        ) : q ? (
          <Section label={t('send.results', 'Results')}>
            {results.length === 0 ? (
              <p className="text-sm px-1" style={{ color: 'var(--color-text-muted)' }}>
                {t('send.noResults', 'No matches')}
              </p>
            ) : results.map((r) => (
              <RecipientRow key={r.address} r={r}
                            onPick={() => onPick(r)} onStar={() => void star(r)}
                            onAddFriend={() => void addFriend(r)} busy={busy} />
            ))}
          </Section>
        ) : (
          <div className="flex flex-col gap-5">
            {sections.starred.length > 0 && (
              <Section label={`⭐ ${t('send.starred', 'Starred')}`}>
                {sections.starred.map((r) => (
                  <RecipientRow key={r.address} r={r} onPick={() => onPick(r)}
                                onStar={() => void star(r)} onAddFriend={() => void addFriend(r)} busy={busy} />
                ))}
              </Section>
            )}
            {sections.frequent.length > 0 && (
              <Section label={`🔥 ${t('send.frequent', 'Frequent')}`}>
                {sections.frequent.map((r) => (
                  <RecipientRow key={r.address} r={r} onPick={() => onPick(r)}
                                onStar={() => void star(r)} onAddFriend={() => void addFriend(r)} busy={busy} />
                ))}
              </Section>
            )}
            {sections.recent.length > 0 && (
              <Section label={`🕘 ${t('send.recent', 'Recent')}`}>
                {sections.recent.map((r) => (
                  <RecipientRow key={r.address} r={r} onPick={() => onPick(r)}
                                onStar={() => void star(r)} onAddFriend={() => void addFriend(r)} busy={busy} />
                ))}
              </Section>
            )}
            {sections.friends.length > 0 && (
              <Section label={`👥 ${t('send.friends', 'Friends')}`}>
                {sections.friends.map((r) => (
                  <RecipientRow key={r.address} r={r} onPick={() => onPick(r)}
                                onStar={() => void star(r)} onAddFriend={() => void addFriend(r)} busy={busy} />
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] uppercase tracking-wider font-semibold px-1"
          style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </h3>
      {children}
    </div>
  );
}

/** One recipient row — a tap-to-pay main area plus trailing favourite /
 *  save controls. The controls are siblings of the main button (never
 *  nested) so the row stays valid + each target is independently tappable. */
function RecipientRow({ r, onPick, onStar, onAddFriend, busy }: {
  r: Recipient;
  onPick: () => void;
  onStar: () => void;
  onAddFriend: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1 rounded-xl"
         style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <button type="button" onClick={onPick}
              className="flex items-center gap-3 p-3.5 text-left flex-1 min-w-0 active:opacity-90 transition-opacity">
        <span className="flex items-center justify-center w-9 h-9 rounded-full shrink-0 text-sm font-bold"
              style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
          {initialLetter(r.name)}
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate" style={{ color: 'var(--color-text)' }}>
            {r.name}
          </div>
          <div className="mono text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
            {abbreviate(r.address)}{metaSuffix(r, t)}
          </div>
        </div>
      </button>

      {/* + Friend — only for payment-history people not yet saved. */}
      {!r.isFriend && (
        <button type="button" onClick={onAddFriend} disabled={busy}
                className="shrink-0 px-2 py-1 mr-0.5 rounded-lg text-[11px] font-semibold"
                style={{ color: 'var(--color-accent)', opacity: busy ? 0.5 : 1 }}
                aria-label={t('send.saveFriend', 'Save as friend')}>
          + {t('send.friendShort', 'Friend')}
        </button>
      )}

      {/* ⭐ favourite toggle. */}
      <button type="button" onClick={onStar} disabled={busy}
              className="shrink-0 p-2.5 mr-1 rounded-lg text-lg leading-none"
              style={{ color: r.starred ? 'var(--color-accent)' : 'var(--color-text-faint)', opacity: busy ? 0.5 : 1 }}
              aria-label={r.starred ? t('send.unstar', 'Remove favourite') : t('send.star', 'Add favourite')}>
        {r.starred ? '★' : '☆'}
      </button>
    </div>
  );
}

function metaSuffix(r: Recipient, t: (k: string, d: string) => string): string {
  if (r.sendCount <= 0) return r.isFriend ? ` · ${t('send.friendMeta', 'Friend')}` : '';
  const times = r.sendCount === 1
    ? ` · ${t('send.sentOnce', 'paid once')}`
    : ` · ${r.sendCount}× ${t('send.sentTimes', 'paid')}`;
  return times;
}

function initialLetter(name: string): string {
  const ch = name.trim()[0];
  return ch ? ch.toUpperCase() : '?';
}

function abbreviate(addr: string): string {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`;
}
