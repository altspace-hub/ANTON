import { useEffect, useState } from 'react';
import { getIdentity, updateDisplayName, clearIdentity, type CommIdentity } from '../services/identity';
import { getReadReceiptsEnabled, setReadReceiptsEnabled, getTypingIndicatorEnabled, setTypingIndicatorEnabled } from '../services/settings';

interface Props {
  onBack: () => void;
  onSignedOut: () => void;
}

export default function ProfileScreen({ onBack, onSignedOut }: Props) {
  const [identity, setIdentity] = useState<CommIdentity | null>(getIdentity());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(identity?.displayName ?? '');
  const [copied, setCopied] = useState(false);
  const [readReceipts, setReadReceipts] = useState(getReadReceiptsEnabled());
  const [typingIndicator, setTypingIndicator] = useState(getTypingIndicatorEnabled());

  useEffect(() => {
    if (!identity) return;
    let cancelled = false;
    const sharePayload = JSON.stringify({
      v: 1,
      t: 'anton-comm-contact',
      hash: identity.contactHash,
      name: identity.displayName,
      pub: identity.publicKeyHex,
    });
    // P4-2: qrcode is only used here. Dynamic import keeps it out of the
    // main bundle for users who never visit the share QR surface.
    void (async () => {
      try {
        const { default: QRCode } = await import('qrcode');
        if (cancelled) return;
        const url = await QRCode.toDataURL(sharePayload, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 280,
          color: { dark: '#1A1B2E', light: '#FFFFFF' },
        });
        if (!cancelled) setQrDataUrl(url);
      } catch {
        if (!cancelled) setQrDataUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, [identity]);

  if (!identity) {
    return (
      <section className="px-5 pt-6 pb-4">
        <p className="text-sm text-[var(--color-text-muted)]">No identity.</p>
      </section>
    );
  }

  async function handleCopy() {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.contactHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  }

  function handleSaveName() {
    const trimmed = draftName.trim();
    if (trimmed.length === 0) return;
    const next = updateDisplayName(trimmed);
    if (next) setIdentity(next);
    setEditing(false);
  }

  async function handleSignOut() {
    if (!confirm('Sign out? This will permanently delete your identity and all messages on this device. This cannot be undone.')) {
      return;
    }
    await clearIdentity();
    onSignedOut();
  }

  return (
    <section className="px-5 pt-6 pb-12">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-[var(--color-text-muted)]">
          ← Back
        </button>
        <h1 className="text-base font-semibold text-[var(--color-text)]">Profile</h1>
        <span className="w-10" />
      </div>

      <div className="mt-8 flex flex-col items-center">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-semibold"
          style={{ backgroundColor: 'var(--color-accent-dim)', color: 'var(--color-accent-dark)' }}
        >
          {identity.displayName.slice(0, 1).toUpperCase()}
        </div>

        {editing ? (
          <div className="mt-4 w-full max-w-xs">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={64}
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-center text-base text-[var(--color-text)]"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
            />
            <div className="mt-2 flex gap-2 justify-center">
              <button
                onClick={() => { setEditing(false); setDraftName(identity.displayName); }}
                className="px-3 py-1.5 text-xs text-[var(--color-text-muted)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveName}
                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="mt-4 text-xl font-semibold text-[var(--color-text)]"
          >
            {identity.displayName}
          </button>
        )}
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          Your contact code
        </p>
        <button
          onClick={() => void handleCopy()}
          className="mt-2 text-lg font-mono text-[var(--color-text)] tracking-wider block w-full text-left"
        >
          {identity.contactHash}
        </button>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {copied ? 'Copied to clipboard' : 'Tap to copy'}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
          Share your code
        </p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Let a friend scan this to add you.
        </p>
        <div className="mt-4 flex justify-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Your contact QR code"
              className="w-64 h-64 rounded-xl"
            />
          ) : (
            <div className="w-64 h-64 rounded-xl bg-[var(--color-surface-muted)] flex items-center justify-center text-xs text-[var(--color-text-faint)]">
              Generating QR…
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)] px-1">Privacy</p>
        <div className="mt-2 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface)] overflow-hidden">
          <PrivacyToggle
            label="Send read receipts"
            description="When off, your peers can't tell when you read their messages. Both sides need this on for either to see receipts."
            value={readReceipts}
            onChange={(v) => { setReadReceipts(v); setReadReceiptsEnabled(v); }}
          />
          <div className="border-t border-[var(--color-border-soft)]" />
          <PrivacyToggle
            label="Typing indicator"
            description="Symmetric — when on, you send typing pings AND see peers'. When off, neither side does."
            value={typingIndicator}
            onChange={(v) => { setTypingIndicator(v); setTypingIndicatorEnabled(v); }}
          />
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-surface-alt)] p-5 text-xs text-[var(--color-text-muted)]">
        <p>
          Identity created {new Date(identity.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}.
          Your private key never leaves this device.
        </p>
      </div>

      <button
        onClick={() => void handleSignOut()}
        className="mt-8 w-full py-3 rounded-2xl text-sm font-medium border border-[var(--color-red-dim)] text-[var(--color-red)]"
      >
        Delete identity & sign out
      </button>
    </section>
  );
}

function PrivacyToggle({ label, description, value, onChange }: {
  label: string; description: string; value: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      aria-pressed={value}
      className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[var(--color-surface-muted)]"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[var(--color-text)]">{label}</div>
        <div className="text-[11px] text-[var(--color-text-muted)] leading-snug mt-0.5">{description}</div>
      </div>
      <span
        className="w-10 h-6 rounded-full p-0.5 flex-shrink-0 transition-colors"
        style={{ backgroundColor: value ? 'var(--color-accent)' : 'var(--color-border)' }}
      >
        <span
          className="block w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(16px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  );
}
