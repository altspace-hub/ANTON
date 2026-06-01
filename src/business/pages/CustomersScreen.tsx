/**
 * CustomersScreen — saved FC payment contacts (the address book).
 *
 * Surfaces the previously-unused address-book service: a newest-first
 * list of explicitly-added customers, an inline "Add customer" form,
 * and per-row rename / delete.
 *
 * The anti-poisoning angle matters here. Contacts are added ONLY by the
 * merchant (never auto-populated from received payments), and the add
 * form runs findSimilarContacts() before saving: if the typed address is
 * close-but-not-equal to a known contact (the vanity-grinding danger
 * zone), saving is gated behind an explicit "I confirm this is a
 * different customer" tap. See services/address-book.ts for the full
 * rationale.
 *
 * Presentation only — no schema or service-logic changes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addContact,
  deleteContact,
  findSimilarContacts,
  listContacts,
  renameContact,
  renderAddressSegments,
  type Contact,
  type SimilarityWarning,
} from '../services/address-book';

interface Props {
  onBack: () => void;
}

/** Same FC address shape the wallet registry validates against. */
const FC_ADDRESS_RE = /^fc_[1-9A-HJ-NP-Za-km-z]{20,64}$/;

export default function CustomersScreen({ onBack }: Props) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add form state ────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Non-empty once findSimilarContacts() flags look-alikes — saving is
   *  gated behind an explicit confirm until the merchant clears this. */
  const [warnings, setWarnings] = useState<SimilarityWarning[]>([]);
  const [warningsAcked, setWarningsAcked] = useState(false);

  // ── Per-row editing ───────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const all = await listContacts();
    setContacts(all);
    setLoading(false);
  }

  const trimmedAddress = address.trim();
  const addressValid = FC_ADDRESS_RE.test(trimmedAddress);

  function resetForm() {
    setName('');
    setAddress('');
    setFormError(null);
    setWarnings([]);
    setWarningsAcked(false);
    setSaving(false);
  }

  /**
   * Two-stage save:
   *   1. First tap — validate the address shape, then run the
   *      look-alike check. If warnings come back, render them and stop;
   *      the button flips to a confirm action.
   *   2. Confirm tap (warnings acknowledged) — actually persist.
   * A clean address with no look-alikes saves on the first tap.
   */
  async function attemptSave() {
    if (saving) return;
    setFormError(null);

    if (!addressValid) {
      setFormError(t('customers.errInvalidAddress', 'Enter a valid FutureChain address (starts with fc_).'));
      return;
    }

    // Run the look-alike check up-front, unless the merchant already
    // acknowledged the warnings on a previous tap.
    if (!warningsAcked) {
      const similar = await findSimilarContacts(trimmedAddress);
      if (similar.length > 0) {
        setWarnings(similar);
        setWarningsAcked(false);
        return; // gate — require an explicit confirm tap
      }
    }

    setSaving(true);
    try {
      await addContact(name, trimmedAddress);
      resetForm();
      setFormOpen(false);
      await refresh();
    } catch (err) {
      setFormError((err as Error).message);
      setSaving(false);
    }
  }

  async function submitRename(id: string) {
    const next = renameValue.trim();
    setRenamingId(null);
    if (!next) return;
    await renameContact(id, next);
    await refresh();
  }

  async function removeContact(c: Contact) {
    if (!confirm(t('customers.confirmDelete', 'Remove {{name}} from your customers?', { name: c.label }))) {
      return;
    }
    await deleteContact(c.id);
    await refresh();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex flex-col flex-1 px-6 pb-6">
        <div className="flex items-center gap-3 -ml-2 mb-5">
          <button type="button" onClick={onBack} className="p-2 rounded-lg"
                  aria-label={t('common.back', 'Back')}
                  style={{ color: 'var(--color-text-muted)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text)' }}>
            {t('customers.title', 'Customers')}
          </h2>
        </div>

        {/* Add customer — toggles an inline form. */}
        {!formOpen ? (
          <button type="button" onClick={() => { resetForm(); setFormOpen(true); }}
                  className="rounded-xl p-3.5 mb-4 text-sm font-semibold text-left"
                  style={{
                    backgroundColor: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    border: '1px solid var(--color-accent-dim)',
                  }}>
            {t('customers.add', '+ Add customer')}
          </button>
        ) : (
          <div className="rounded-xl p-4 mb-4"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <h3 className="font-bold mb-1" style={{ color: 'var(--color-text)' }}>
              {t('customers.addTitle', 'New customer')}
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
              {t('customers.addHelp', 'Save a customer you pay or refund often. Contacts are added by you — never picked up automatically from incoming payments.')}
            </p>

            <label className="text-xs uppercase tracking-wider"
                   style={{ color: 'var(--color-text-faint)' }}>
              {t('customers.name', 'Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('customers.namePlaceholder', 'e.g. Acme AB')}
              className="w-full rounded-lg px-3 py-2 mt-1 mb-3 text-sm"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            />

            <label className="text-xs uppercase tracking-wider"
                   style={{ color: 'var(--color-text-faint)' }}>
              {t('customers.address', 'FutureChain address')}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                // Editing the address invalidates a prior acknowledgement
                // and clears stale warnings so the gate re-runs.
                setWarnings([]);
                setWarningsAcked(false);
                setFormError(null);
              }}
              placeholder="fc_…"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-lg px-3 py-2 mt-1 mb-1 text-sm mono break-all"
              style={{
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text)',
                border: `1px solid ${trimmedAddress && !addressValid ? 'var(--color-error)' : 'var(--color-border)'}`,
              }}
            />
            {trimmedAddress.length > 0 && !addressValid && (
              <p className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>
                {t('customers.errInvalidAddress', 'Enter a valid FutureChain address (starts with fc_).')}
              </p>
            )}

            {/* Address-poisoning gate — render look-alike contacts. */}
            {warnings.length > 0 && (
              <div className="rounded-lg p-3 my-2"
                   style={{ backgroundColor: 'var(--color-warning-bg)',
                            border: '1px solid var(--color-warning)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-warning)' }}>
                  {t('customers.similarWarning', 'This address looks similar to a customer you already have. Vanity-address scams rely on look-alikes — confirm this is a different customer before saving.')}
                </p>
                {warnings.map((w) => (
                  <div key={w.contact.id} className="mb-2 last:mb-0">
                    <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                      {w.contact.label}
                      {w.matchesEnds && (
                        <span className="ml-1 font-normal" style={{ color: 'var(--color-warning)' }}>
                          {t('customers.matchesEnds', '(same start & end!)')}
                        </span>
                      )}
                    </div>
                    <div className="mono text-[11px] break-all">
                      {renderAddressSegments(w.contact.address).map((seg, i) => (
                        <span key={i}
                              style={{ color: seg.secure ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                          {seg.text}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <label className="flex items-center gap-2 mt-2 text-xs"
                       style={{ color: 'var(--color-text)' }}>
                  <input type="checkbox" checked={warningsAcked}
                         onChange={(e) => setWarningsAcked(e.target.checked)} />
                  {t('customers.confirmDifferent', 'I confirm this is a different customer')}
                </label>
              </div>
            )}

            {formError && (
              <p className="text-xs mt-1 mb-2" style={{ color: 'var(--color-error)' }}>
                {formError}
              </p>
            )}

            <div className="flex gap-2 mt-3">
              <button type="button"
                      onClick={() => { resetForm(); setFormOpen(false); }}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button type="button"
                      onClick={() => void attemptSave()}
                      disabled={saving || !addressValid || (warnings.length > 0 && !warningsAcked)}
                      className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        color: 'var(--color-accent-fg)',
                        opacity: saving || !addressValid || (warnings.length > 0 && !warningsAcked) ? 0.5 : 1,
                      }}>
                {saving
                  ? t('common.working', 'Working…')
                  : warnings.length > 0
                    ? t('customers.saveAnyway', 'Save anyway')
                    : t('common.save', 'Save')}
              </button>
            </div>
          </div>
        )}

        {/* Contact list — newest-first (listContacts sorts by addedAt). */}
        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('common.loading', 'Loading…')}
          </p>
        ) : contacts.length === 0 ? (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('customers.empty', 'No saved customers yet. Add one above to pay or refund them quickly later.')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {contacts.map((c) => (
              <div key={c.id}
                   className="rounded-xl p-3"
                   style={{ backgroundColor: 'var(--color-surface)',
                            border: '1px solid var(--color-border)' }}>
                {renamingId === c.id ? (
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{
                        backgroundColor: 'var(--color-bg)',
                        color: 'var(--color-text)',
                        border: '1px solid var(--color-border)',
                      }}
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setRenamingId(null)}
                              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{
                                backgroundColor: 'var(--color-surface)',
                                color: 'var(--color-text)',
                                border: '1px solid var(--color-border)',
                              }}>
                        {t('common.cancel', 'Cancel')}
                      </button>
                      <button type="button" onClick={() => void submitRename(c.id)}
                              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                              style={{
                                backgroundColor: 'var(--color-accent)',
                                color: 'var(--color-accent-fg)',
                              }}>
                        {t('common.save', 'Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-sm flex-1 min-w-0"
                           style={{ color: 'var(--color-text)' }}>
                        {c.label}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button type="button"
                                onClick={() => { setRenameValue(c.label); setRenamingId(c.id); }}
                                aria-label={t('customers.rename', 'Rename')}
                                className="px-2 py-1 rounded-lg text-xs font-semibold"
                                style={{
                                  backgroundColor: 'transparent',
                                  color: 'var(--color-accent)',
                                  border: '1px solid var(--color-border)',
                                }}>
                          {t('customers.rename', 'Rename')}
                        </button>
                        <button type="button"
                                onClick={() => void removeContact(c)}
                                aria-label={t('customers.delete', 'Delete')}
                                className="px-2 py-1 rounded-lg text-xs font-semibold"
                                style={{
                                  backgroundColor: 'transparent',
                                  color: 'var(--color-error)',
                                  border: '1px solid var(--color-border)',
                                }}>
                          {t('customers.delete', 'Delete')}
                        </button>
                      </div>
                    </div>
                    {/* Address with the secure middle highlighted (Rabby pattern). */}
                    <div className="mono text-[11px] break-all mt-1">
                      {renderAddressSegments(c.address).map((seg, i) => (
                        <span key={i}
                              style={{ color: seg.secure ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                          {seg.text}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && contacts.length > 0 && (
          <p className="text-xs mt-3 text-center"
             style={{ color: 'var(--color-text-faint)' }}>
            {t('customers.totalCount', '{{count}} customers', { count: contacts.length })}
          </p>
        )}
      </div>
    </div>
  );
}
