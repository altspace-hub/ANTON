/**
 * KvittoDetailScreen — full detail for a single past kvitto.
 *
 * Reached by tapping a row in ReceiptsHistoryScreen. Renders the
 * Skatteverket-compliant KvittoView (which already shows line items,
 * VAT breakdown, FTC total, and — Wave 10 — any customer-attached
 * remittance), plus the actions a merchant needs against a past sale:
 *
 *   • Share — hands a text summary to the OS share sheet.
 *   • Print / Save PDF — opens the WebView print dialog.
 *   • Void — only for a still-`pending` kvitto, PIN-gated when a
 *     merchant PIN is set (same gate as day-close / refund).
 *
 * A confirmed kvitto is an audit-defensible voucher — it is never
 * editable from here. Bokföringslagen 7-year retention means the row
 * stays; voiding only flips status, it never deletes.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KvittoView, kvittoToHtml } from '../components/KvittoView';
import PinPad from '../components/PinPad';
import { getReceipt, voidReceipt } from '../services/receipts';
import { loadConfig } from '../services/merchant';
import { shareKvitto, printKvitto } from '../services/kvitto-export';
import { isPinSet } from '../services/pin';
import {
  addContact,
  findSimilarContacts,
  getContactByAddress,
  renderAddressSegments,
  type Contact,
  type SimilarityWarning,
} from '../services/address-book';
import { formatKvittoNumber, type MerchantConfig, type Receipt } from '../services/types';
import { formatIsoEnvelope } from '../services/iso-envelope';

interface Props {
  kvittoNumber: number;
  onBack: () => void;
}

export default function KvittoDetailScreen({ kvittoNumber, onBack }: Props) {
  const { t } = useTranslation();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [merchant, setMerchant] = useState<MerchantConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  /** Which payment-detail field was just copied — drives a transient
   *  "Copied" badge on that row. */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** Raw ISO 20022 envelope expander (the canonical pacs.008 for this sale). */
  const [showRaw, setShowRaw] = useState(false);

  // ── Customer (debtor) address → address-book ──────────────────────
  /** The existing contact, if the customer's fc_ address is already
   *  saved. null = looked up and not found; undefined = not looked up
   *  yet (no customerAddress on the receipt). */
  const [matchedContact, setMatchedContact] = useState<Contact | null | undefined>(undefined);
  /** Add-customer inline form. */
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Look-alike contacts flagged by findSimilarContacts() — saving is
   *  gated behind an explicit confirm until acknowledged (same
   *  anti-poisoning gate as CustomersScreen). */
  const [saveWarnings, setSaveWarnings] = useState<SimilarityWarning[]>([]);
  const [saveWarningsAcked, setSaveWarningsAcked] = useState(false);

  async function refresh() {
    const [r, cfg] = await Promise.all([getReceipt(kvittoNumber), loadConfig()]);
    setReceipt(r);
    setMerchant(cfg);
    setLoading(false);
    // Resolve whether the customer address is already a saved contact.
    if (r?.customerAddress) {
      setMatchedContact(await getContactByAddress(r.customerAddress));
    } else {
      setMatchedContact(undefined);
    }
  }
  useEffect(() => { void refresh(); }, [kvittoNumber]);

  /** Copy a value to the clipboard and flash a transient "Copied" badge
   *  on the originating row. Falls back silently if clipboard is denied
   *  (it just won't flash). */
  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — no-op.
    }
  }

  /** Open the "Save as customer" form: pre-run the look-alike check so
   *  the anti-poisoning gate is ready the instant the form renders. */
  async function openSaveForm() {
    if (!receipt?.customerAddress) return;
    setSaveName('');
    setSaveError(null);
    setSaveWarningsAcked(false);
    setSaveWarnings(await findSimilarContacts(receipt.customerAddress));
    setSaveFormOpen(true);
  }

  async function saveCustomer() {
    if (!receipt?.customerAddress || saving) return;
    if (saveWarnings.length > 0 && !saveWarningsAcked) return; // gated
    setSaving(true);
    setSaveError(null);
    try {
      await addContact(saveName, receipt.customerAddress);
      setSaveFormOpen(false);
      setFlash(t('kvittoDetail.customerSaved', 'Customer saved.'));
      setMatchedContact(await getContactByAddress(receipt.customerAddress));
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    if (!receipt || !merchant) return;
    setBusy(true);
    try {
      await shareKvitto(receipt, merchant, kvittoToHtml(receipt, merchant));
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!receipt || !merchant) return;
    setBusy(true);
    try {
      await printKvitto(receipt, merchant, kvittoToHtml(receipt, merchant));
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Void — gate behind the merchant PIN when one is set. */
  async function attemptVoid() {
    if (await isPinSet()) {
      setShowPin(true);
    } else {
      await doVoid();
    }
  }

  async function doVoid() {
    if (!receipt) return;
    if (!confirm(t('kvittoDetail.confirmVoid',
      'Void this kvitto? It stays on record (Bokföringslagen) but is marked voided and excluded from the Z report.'))) {
      return;
    }
    setBusy(true);
    try {
      await voidReceipt(receipt.kvittoNumber);
      setFlash(t('kvittoDetail.voided', 'Kvitto voided.'));
      await refresh();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
            {formatKvittoNumber(kvittoNumber)}
          </h2>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('common.loading', 'Loading…')}
          </p>
        ) : !receipt || !merchant ? (
          <div className="rounded-xl p-6 text-center"
               style={{ backgroundColor: 'var(--color-surface)',
                        border: '1px solid var(--color-border)' }}>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {t('kvittoDetail.notFound', 'Kvitto not found.')}
            </p>
          </div>
        ) : (
          <>
            {/* Status badge */}
            <div className="mb-3">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor:
                        receipt.status === 'confirmed' ? 'rgba(45,212,168,0.14)'
                        : receipt.status === 'voided' ? 'rgba(192,57,43,0.12)'
                        : 'rgba(245,166,35,0.14)',
                      color:
                        receipt.status === 'confirmed' ? '#0D7D6C'
                        : receipt.status === 'voided' ? '#C0392B'
                        : '#B8860B',
                    }}>
                {receipt.status === 'confirmed' ? t('kvittoDetail.statusConfirmed', 'Confirmed')
                  : receipt.status === 'voided' ? t('kvittoDetail.statusVoided', 'Voided')
                  : t('kvittoDetail.statusPending', 'Pending')}
              </span>
              {receipt.confirmedAt && (
                <span className="text-xs ml-2" style={{ color: 'var(--color-text-faint)' }}>
                  {new Date(receipt.confirmedAt).toLocaleString('sv-SE', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
            </div>

            {/* The kvitto itself */}
            <KvittoView receipt={receipt} merchant={merchant} />

            {/* Payment details — the settlement facts behind this kvitto.
                Each value is copyable; the customer (debtor) address,
                when known, links into the address book. */}
            <div className="rounded-xl p-4 mt-3"
                 style={{ backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)' }}>
              <h3 className="text-xs font-bold uppercase tracking-wider mb-3"
                  style={{ color: 'var(--color-text-faint)' }}>
                {t('kvittoDetail.paymentDetails', 'Payment details')}
              </h3>

              <CopyRow label={t('kvittoDetail.orderId', 'Order ID')}
                       value={receipt.orderId}
                       copyKey="orderId" copiedKey={copiedKey}
                       onCopy={copyValue} t={t} />

              {receipt.ref && (
                <CopyRow label={t('kvittoDetail.ref', 'Reference (ADR-004)')}
                         value={receipt.ref} mono
                         copyKey="ref" copiedKey={copiedKey}
                         onCopy={copyValue} t={t} />
              )}

              {receipt.uetr && (
                <CopyRow label={t('kvittoDetail.uetr', 'UETR')}
                         value={receipt.uetr} mono
                         copyKey="uetr" copiedKey={copiedKey}
                         onCopy={copyValue} t={t} />
              )}

              {receipt.txHash && (
                <CopyRow label={t('kvittoDetail.txHash', 'Chain tx')}
                         value={receipt.txHash} mono
                         copyKey="txHash" copiedKey={copiedKey}
                         onCopy={copyValue} t={t} />
              )}

              {receipt.amountMicroFtc > 0n && (
                <CopyRow label={t('kvittoDetail.amountFtc', 'Amount FTC')}
                         value={(Number(receipt.amountMicroFtc) / 1_000_000).toFixed(4)}
                         copyKey="amountFtc" copiedKey={copiedKey}
                         onCopy={copyValue} t={t} />
              )}

              {receipt.ftcPerSek > 0 && (
                <CopyRow label={t('kvittoDetail.ftcPerSek', 'FTC per SEK')}
                         value={receipt.ftcPerSek.toString()}
                         copyKey="ftcPerSek" copiedKey={copiedKey}
                         onCopy={copyValue} t={t} />
              )}

              {receipt.receivingAddress && (
                <div className="py-2"
                     style={{ borderTop: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider"
                          style={{ color: 'var(--color-text-faint)' }}>
                      {t('kvittoDetail.receivingAddress', 'Received to')}
                    </span>
                    <button type="button"
                            onClick={() => void copyValue('receivingAddress', receipt.receivingAddress ?? '')}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ color: 'var(--color-accent)',
                                     border: '1px solid var(--color-border)' }}>
                      {copiedKey === 'receivingAddress'
                        ? t('kvittoDetail.copied', 'Copied')
                        : t('kvittoDetail.copy', 'Copy')}
                    </button>
                  </div>
                  <div className="mono text-[11px] break-all mt-1">
                    {renderAddressSegments(receipt.receivingAddress).map((seg, i) => (
                      <span key={i}
                            style={{ color: seg.secure ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                        {seg.text}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer (debtor) address → address book. Present only
                  once the inbound poller captured the debtor account. */}
              {receipt.customerAddress && (
                <div className="py-2 mt-1"
                     style={{ borderTop: '1px solid var(--color-border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wider"
                          style={{ color: 'var(--color-text-faint)' }}>
                      {t('kvittoDetail.customerAddress', 'Customer')}
                    </span>
                    <button type="button"
                            onClick={() => void copyValue('customerAddress', receipt.customerAddress ?? '')}
                            className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                            style={{ color: 'var(--color-accent)',
                                     border: '1px solid var(--color-border)' }}>
                      {copiedKey === 'customerAddress'
                        ? t('kvittoDetail.copied', 'Copied')
                        : t('kvittoDetail.copy', 'Copy')}
                    </button>
                  </div>
                  <div className="mono text-[11px] break-all mt-1">
                    {renderAddressSegments(receipt.customerAddress).map((seg, i) => (
                      <span key={i}
                            style={{ color: seg.secure ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                        {seg.text}
                      </span>
                    ))}
                  </div>

                  {/* Matched contact chip, or the save flow. */}
                  {matchedContact ? (
                    <div className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold"
                         style={{ backgroundColor: 'var(--color-accent-soft)',
                                  color: 'var(--color-accent)',
                                  border: '1px solid var(--color-accent-dim)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5"
                              strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {t('kvittoDetail.matchedCustomer', 'Saved customer: {{name}}', { name: matchedContact.label })}
                    </div>
                  ) : !saveFormOpen ? (
                    <button type="button" onClick={() => void openSaveForm()}
                            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                            style={{ backgroundColor: 'var(--color-accent-soft)',
                                     color: 'var(--color-accent)',
                                     border: '1px solid var(--color-accent-dim)' }}>
                      {t('kvittoDetail.saveAsCustomer', '+ Save as customer')}
                    </button>
                  ) : (
                    <div className="rounded-lg p-3 mt-2"
                         style={{ backgroundColor: 'var(--color-bg)',
                                  border: '1px solid var(--color-border)' }}>
                      <label className="text-xs uppercase tracking-wider"
                             style={{ color: 'var(--color-text-faint)' }}>
                        {t('kvittoDetail.customerName', 'Name')}
                      </label>
                      <input
                        type="text"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder={t('customers.namePlaceholder', 'e.g. Acme AB')}
                        autoFocus
                        className="w-full rounded-lg px-3 py-2 mt-1 mb-2 text-sm"
                        style={{ backgroundColor: 'var(--color-surface)',
                                 color: 'var(--color-text)',
                                 border: '1px solid var(--color-border)' }}
                      />

                      {/* Address-poisoning gate — look-alike contacts. */}
                      {saveWarnings.length > 0 && (
                        <div className="rounded-lg p-2.5 mb-2"
                             style={{ backgroundColor: 'var(--color-warning-bg)',
                                      border: '1px solid var(--color-warning)' }}>
                          <p className="text-xs font-semibold mb-2"
                             style={{ color: 'var(--color-warning)' }}>
                            {t('customers.similarWarning', 'This address looks similar to a customer you already have. Vanity-address scams rely on look-alikes — confirm this is a different customer before saving.')}
                          </p>
                          {saveWarnings.map((w) => (
                            <div key={w.contact.id} className="mb-1.5 last:mb-0">
                              <div className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                                {w.contact.label}
                                {w.matchesEnds && (
                                  <span className="ml-1 font-normal" style={{ color: 'var(--color-warning)' }}>
                                    {t('customers.matchesEnds', '(same start & end!)')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                          <label className="flex items-center gap-2 mt-1 text-xs"
                                 style={{ color: 'var(--color-text)' }}>
                            <input type="checkbox" checked={saveWarningsAcked}
                                   onChange={(e) => setSaveWarningsAcked(e.target.checked)} />
                            {t('customers.confirmDifferent', 'I confirm this is a different customer')}
                          </label>
                        </div>
                      )}

                      {saveError && (
                        <p className="text-xs mb-2" style={{ color: 'var(--color-error)' }}>
                          {saveError}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button type="button"
                                onClick={() => { setSaveFormOpen(false); setSaveError(null); }}
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ backgroundColor: 'var(--color-surface)',
                                         color: 'var(--color-text)',
                                         border: '1px solid var(--color-border)' }}>
                          {t('common.cancel', 'Cancel')}
                        </button>
                        <button type="button"
                                onClick={() => void saveCustomer()}
                                disabled={saving || (saveWarnings.length > 0 && !saveWarningsAcked)}
                                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ backgroundColor: 'var(--color-accent)',
                                         color: 'var(--color-accent-fg)',
                                         opacity: saving || (saveWarnings.length > 0 && !saveWarningsAcked) ? 0.5 : 1 }}>
                          {saving
                            ? t('common.working', 'Working…')
                            : saveWarnings.length > 0
                              ? t('customers.saveAnyway', 'Save anyway')
                              : t('common.save', 'Save')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Raw ISO 20022 envelope — the canonical pacs.008 message for
                  this received payment, assembled from the settlement facts.
                  Copyable for the merchant's accounting / audit trail. */}
              <div className="py-2 mt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button type="button" onClick={() => setShowRaw((v) => !v)}
                        className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                  {showRaw
                    ? t('kvittoDetail.hideRaw', '− Hide raw envelope')
                    : t('kvittoDetail.showRaw', '+ View raw ISO 20022 envelope')}
                </button>
                {showRaw && (
                  <div className="mt-2">
                    <pre className="p-3 rounded-lg whitespace-pre-wrap break-all mono text-[11px] leading-relaxed"
                         style={{ backgroundColor: 'var(--color-bg)',
                                  border: '1px solid var(--color-border)',
                                  color: 'var(--color-text-muted)' }}>
                      {formatIsoEnvelope(receipt, merchant, matchedContact?.label)}
                    </pre>
                    <button type="button"
                            onClick={() => void copyValue('rawEnvelope', formatIsoEnvelope(receipt, merchant, matchedContact?.label))}
                            className="mt-2 text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                      {copiedKey === 'rawEnvelope'
                        ? t('kvittoDetail.copied', 'Copied')
                        : t('kvittoDetail.copyEnvelope', 'Copy envelope')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {flash && (
              <p className="text-xs mt-3 text-center"
                 style={{ color: 'var(--color-text-muted)' }}>{flash}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={handleShare} disabled={busy}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-accent)',
                               color: 'var(--color-accent-fg)',
                               opacity: busy ? 0.6 : 1 }}>
                {t('kvittoDetail.share', 'Share')}
              </button>
              <button type="button" onClick={handlePrint} disabled={busy}
                      className="flex-1 py-3 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'var(--color-surface)',
                               border: '1px solid var(--color-border)',
                               color: 'var(--color-text)',
                               opacity: busy ? 0.6 : 1 }}>
                {t('kvittoDetail.print', 'Print / PDF')}
              </button>
            </div>

            {receipt.status === 'pending' && (
              <button type="button" onClick={attemptVoid} disabled={busy}
                      className="w-full py-3 mt-2 rounded-xl text-sm font-semibold"
                      style={{ backgroundColor: 'transparent', color: '#C0392B' }}>
                {t('kvittoDetail.void', 'Void this kvitto')}
              </button>
            )}
          </>
        )}
      </div>

      <PinPad open={showPin} mode="verify"
              title={t('kvittoDetail.pinTitle', 'Confirm with merchant PIN')}
              onCancel={() => setShowPin(false)}
              onConfirm={async () => {
                setShowPin(false);
                await doVoid();
              }} />
    </div>
  );
}

/** A single label/value row in the Payment-details card with a copy
 *  affordance. The button flips to a transient "Copied" badge (driven
 *  by the parent's `copiedKey`). */
function CopyRow({
  label, value, mono, copyKey, copiedKey, onCopy, t,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyKey: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => void | Promise<void>;
  t: (key: string, defaultValue: string) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-xs uppercase tracking-wider flex-shrink-0"
            style={{ color: 'var(--color-text-faint)' }}>
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-xs truncate ${mono ? 'mono' : ''}`}
              style={{ color: 'var(--color-text)' }} title={value}>
          {value}
        </span>
        <button type="button"
                onClick={() => void onCopy(copyKey, value)}
                aria-label={t('kvittoDetail.copy', 'Copy')}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0"
                style={{ color: 'var(--color-accent)',
                         border: '1px solid var(--color-border)' }}>
          {copiedKey === copyKey
            ? t('kvittoDetail.copied', 'Copied')
            : t('kvittoDetail.copy', 'Copy')}
        </button>
      </div>
    </div>
  );
}
