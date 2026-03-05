/**
 * CommunityIdentityPage.tsx
 *
 * Shows the user's community identity details:
 * contact hash, display name, public key (collapsible),
 * and security notes about local key storage.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Fingerprint, Copy, Check, ChevronLeft, Lock, Shield,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CommunityIdentity {
  contact_hash: string;
  display_name: string;
  activated_at: string;
  public_key?: string;
}

interface CommunityStatus {
  activated: boolean;
  identity: CommunityIdentity | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function truncateKey(key: string, chars = 32): string {
  if (key.length <= chars * 2 + 3) return key;
  return `${key.slice(0, chars)}…${key.slice(-chars)}`;
}

// ── Main component ───────────────────────────────────────────────────

export default function CommunityIdentityPage() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<CommunityIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [keyExpanded, setKeyExpanded] = useState(false);

  // Retrieve public key from server status; private key note from localStorage
  const localPrivateKey = localStorage.getItem('community-private-key');
  const hasLocalKey = Boolean(localPrivateKey);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/community/status', { headers: getAuthHeader() });
        if (!res.ok) throw new Error('Failed to load identity');
        const data: CommunityStatus = await res.json();
        if (!data.activated || !data.identity) {
          navigate('/community');
          return;
        }
        setIdentity(data.identity);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load identity');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  function copyHash() {
    if (!identity) return;
    navigator.clipboard.writeText(identity.contact_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  }

  function copyPublicKey() {
    if (!identity?.public_key) return;
    navigator.clipboard.writeText(identity.public_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-adv-red">{error}</p>
      </div>
    );
  }

  if (!identity) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Back */}
      <button
        onClick={() => navigate('/community')}
        className="mb-6 flex items-center gap-1.5 text-sm text-adv-gray transition hover:text-adv-teal"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Community
      </button>

      {/* Page header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal-dim">
          <Fingerprint className="h-5 w-5 text-adv-teal" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-adv-white">Identity Settings</h1>
          <p className="text-sm text-adv-gray">
            Activated {formatDate(identity.activated_at)}
          </p>
        </div>
      </div>

      {/* Contact card */}
      <section className="mb-5 rounded-xl border border-adv-teal/30 bg-adv-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-adv-white">
          <Fingerprint className="h-4 w-4 text-adv-teal" />
          Your Contact Card
        </h2>

        {/* Display name */}
        <p className="mb-1 text-xs uppercase tracking-wider text-adv-gray">Display name</p>
        <p className="mb-4 text-lg font-semibold text-adv-white">{identity.display_name}</p>

        {/* Contact hash — prominent */}
        <p className="mb-1 text-xs uppercase tracking-wider text-adv-gray">Contact hash</p>
        <p className="mb-3 break-all font-mono text-2xl font-bold tracking-widest text-adv-teal">
          {identity.contact_hash}
        </p>

        <button
          onClick={copyHash}
          className="mb-5 flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
        >
          {copiedHash ? <Check className="h-4 w-4 text-adv-green" /> : <Copy className="h-4 w-4" />}
          {copiedHash ? 'Copied!' : 'Copy contact hash'}
        </button>

        {/* QR code placeholder */}
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-adv-dark-2 px-6 py-8">
          <div className="mb-3 grid h-20 w-20 grid-cols-4 grid-rows-4 gap-1 opacity-30">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className={`rounded-sm ${Math.random() > 0.4 ? 'bg-adv-teal' : 'bg-adv-gray'}`}
              />
            ))}
          </div>
          <p className="text-sm font-medium text-adv-gray">QR Code</p>
          <p className="mt-1 text-center text-xs text-adv-gray">
            Show this to share your contact hash in person
          </p>
          <p className="mt-2 text-center text-xs italic text-adv-gray">
            Full QR generation coming soon
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-adv-gray">
          Share your contact hash with people you want to connect with.
          <br />
          They will add it to their contacts to message you.
        </p>
      </section>

      {/* Public key section */}
      {identity.public_key && (
        <section className="mb-5 rounded-xl border border-border bg-adv-card">
          <button
            onClick={() => setKeyExpanded(v => !v)}
            className="flex w-full items-center justify-between px-5 py-4"
          >
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-adv-gray" />
              <span className="text-sm font-medium text-adv-off-white">My Public Key</span>
            </div>
            {keyExpanded
              ? <ChevronUp className="h-4 w-4 text-adv-gray" />
              : <ChevronDown className="h-4 w-4 text-adv-gray" />}
          </button>

          {keyExpanded && (
            <div className="border-t border-border px-5 pb-5 pt-4">
              <p className="mb-3 break-all rounded-lg bg-adv-dark-2 px-3 py-2 font-mono text-xs text-adv-gray">
                {truncateKey(identity.public_key)}
              </p>
              <button
                onClick={copyPublicKey}
                className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-off-white transition hover:text-adv-teal"
              >
                {copiedKey ? <Check className="h-3.5 w-3.5 text-adv-green" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey ? 'Copied!' : 'Copy full key'}
              </button>
              <p className="mt-3 text-xs text-adv-gray">
                Your public key is used by contacts to encrypt messages only you can read.
                It is safe to share.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Security notes */}
      <section className="rounded-xl border border-adv-gold/20 bg-adv-gold/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-adv-gold" />
          <h2 className="text-sm font-semibold text-adv-gold">Security Notes</h2>
        </div>
        <ul className="space-y-2 text-sm text-adv-off-white">
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">•</span>
            Your private key is stored locally on this device only. It cannot be recovered if lost.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">•</span>
            {hasLocalKey
              ? 'Private key found in browser storage on this device.'
              : 'No private key detected in this browser. You may have activated on a different device.'}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">•</span>
            Clearing browser storage or using a different device will require re-activation.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">•</span>
            ANTON servers only hold your public key and encrypted message payloads.
          </li>
        </ul>
      </section>
    </div>
  );
}
