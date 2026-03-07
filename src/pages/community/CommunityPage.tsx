/**
 * CommunityPage.tsx
 *
 * Main entry point for the Community tab.
 * Checks activation status and shows either the onboarding screen
 * or the activated hub with navigation cards.
 *
 * Encryption: Ed25519 keypair generated in-browser via Web Crypto API.
 * Private key stored in localStorage only — never sent to server.
 * Server receives only public key + ciphertext.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Lock, Shield, Zap, Globe, Copy, Check,
  MessageCircle, Fingerprint, MessageSquare, ArrowRight, ChevronRight,
  Users2, Mail, CalendarDays,
} from 'lucide-react';
import { getAuthHeader } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CommunityStatus {
  activated: boolean;
  identity: {
    contact_hash: string;
    display_name: string;
    activated_at: string;
  } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateContactHash(): string {
  const arr = new Uint8Array(8);
  window.crypto.getRandomValues(arr);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `ANTON-${hex.slice(0, 4).toUpperCase()}-${hex.slice(4, 8).toUpperCase()}-${hex.slice(8, 12).toUpperCase()}-${hex.slice(12, 16).toUpperCase()}`;
}

async function generateKeyPair(): Promise<{ publicKeyHex: string; privateKeyHex: string }> {
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: 'Ed25519' } as AlgorithmIdentifier,
      true,
      ['sign', 'verify'],
    );
    const pubRaw = await window.crypto.subtle.exportKey('raw', (keyPair as CryptoKeyPair).publicKey);
    const privRaw = await window.crypto.subtle.exportKey('pkcs8', (keyPair as CryptoKeyPair).privateKey);
    const toHex = (buf: ArrayBuffer) =>
      Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return { publicKeyHex: toHex(pubRaw), privateKeyHex: toHex(privRaw) };
  } catch {
    // Ed25519 is not supported in this browser — refuse to generate insecure keys
    throw new Error(
      'Your browser does not support Ed25519 encryption. Community features require a modern browser (Chrome 117+, Firefox 120+, Safari 17+).'
    );
  }
}

// ── Sub-components ───────────────────────────────────────────────────

function InfoCard({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-adv-card px-4 py-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-sm text-adv-off-white">{text}</p>
    </div>
  );
}

function HubNavCard({
  icon,
  label,
  description,
  to,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  to: string;
  onClick: (path: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(to)}
      className="group flex w-full items-center gap-4 rounded-xl border border-border bg-adv-card px-5 py-4 text-left transition hover:border-adv-teal/40 hover:bg-adv-teal-soft"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-adv-teal-dim text-adv-teal">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-adv-white">{label}</p>
        <p className="text-sm text-adv-gray">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-adv-gray transition group-hover:text-adv-teal" />
    </button>
  );
}

// ── Onboarding screen ────────────────────────────────────────────────

function OnboardingScreen({ onActivated }: { onActivated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    if (!displayName.trim()) {
      setError('Please enter a display name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const contactHash = generateContactHash();
      const { publicKeyHex, privateKeyHex } = await generateKeyPair();

      const res = await fetch('/api/community/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          display_name: displayName.trim(),
          contact_hash: contactHash,
          public_key: publicKeyHex,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Activation failed');
      }

      // Store private key client-side only — never sent to server
      localStorage.setItem('community-private-key', privateKeyHex);
      localStorage.setItem('community-contact-hash', contactHash);

      onActivated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Activation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {/* Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal-dim">
          <Users className="h-8 w-8 text-adv-teal" />
        </div>
        <h1 className="text-3xl font-bold text-adv-white">Community</h1>
        <p className="max-w-md text-adv-gray">
          Encrypted peer-to-peer communication. Your keys, your messages.
        </p>
      </div>

      {/* Info cards */}
      <div className="mb-8 flex flex-col gap-3">
        <InfoCard
          icon={<Lock className="h-4 w-4 text-adv-teal" />}
          text="End-to-end encrypted — ANTON cannot read your messages. Only you and your contacts hold the keys."
        />
        <InfoCard
          icon={<Fingerprint className="h-4 w-4 text-adv-teal" />}
          text="Your identity is your ANTON-XXXX contact hash — a unique address you share with contacts you trust."
        />
        <InfoCard
          icon={<Globe className="h-4 w-4 text-adv-teal" />}
          text="Relay-only — the server sees only encrypted ciphertext and public keys. Plaintext never leaves your device."
        />
        <InfoCard
          icon={<Zap className="h-4 w-4 text-adv-gold" />}
          text="Opt-in feature — completely disabled until you choose to activate it. No data is collected without your consent."
        />
      </div>

      {/* Activation form */}
      <div className="rounded-xl border border-adv-teal/30 bg-adv-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-adv-white">Activate Community</h2>
        <label className="mb-1 block text-sm text-adv-gray" htmlFor="display-name">
          Choose a display name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleActivate()}
          placeholder="e.g. Daniel B."
          maxLength={60}
          className="mb-4 w-full rounded-lg border border-border bg-adv-dark-2 px-4 py-2.5 text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
        {error && (
          <p className="mb-3 text-sm text-adv-red">{error}</p>
        )}
        <button
          onClick={handleActivate}
          disabled={loading || !displayName.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-adv-teal px-5 py-2.5 font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Shield className="h-4 w-4" />
          {loading ? 'Generating keys…' : 'Activate Community'}
        </button>
        <p className="mt-3 text-center text-xs text-adv-gray">
          A cryptographic keypair will be generated in your browser. Your private key is stored only on this device.
        </p>
      </div>
    </div>
  );
}

// ── Activated hub ────────────────────────────────────────────────────

function ActivatedHub({ identity }: { identity: NonNullable<CommunityStatus['identity']> }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  function copyHash() {
    navigator.clipboard.writeText(identity.contact_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Fetch unread mail count for badge
  useEffect(() => {
    fetch('/api/community/mail/folders/counts', { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : null)
      .then((d: { inbox: number } | null) => { if (d) setUnreadCount(d.inbox); })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Identity card */}
      <div className="mb-8 rounded-xl border border-adv-teal/30 bg-adv-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-teal">Your Identity</span>
        </div>
        <p className="mb-1 text-xl font-bold tracking-wider text-adv-white">
          {identity.contact_hash}
        </p>
        <p className="mb-4 text-sm text-adv-gray">{identity.display_name}</p>
        <button
          onClick={copyHash}
          className="flex items-center gap-2 rounded-lg border border-border bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
        >
          {copied ? <Check className="h-4 w-4 text-adv-green" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy contact hash'}
        </button>
      </div>

      {/* Nav cards */}
      <div className="flex flex-col gap-3">
        <HubNavCard
          icon={<Users2 className="h-5 w-5" />}
          label="Groups"
          description="Private invite-only group spaces"
          to="/community/groups"
          onClick={navigate}
        />
        <HubNavCard
          icon={<Mail className="h-5 w-5" />}
          label={unreadCount > 0 ? `Mail (${unreadCount} unread)` : 'Mail'}
          description="Async threaded internal mail — no SMTP"
          to="/community/mail"
          onClick={navigate}
        />
        <HubNavCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Calendar"
          description="Shared events with RSVP and .ics export"
          to="/community/calendar"
          onClick={navigate}
        />
        <HubNavCard
          icon={<Users className="h-5 w-5" />}
          label="Contacts"
          description="Manage your encrypted contact list"
          to="/community/contacts"
          onClick={navigate}
        />
        <HubNavCard
          icon={<MessageCircle className="h-5 w-5" />}
          label="Messages"
          description="End-to-end encrypted direct messages"
          to="/community/messages"
          onClick={navigate}
        />
        <HubNavCard
          icon={<MessageSquare className="h-5 w-5" />}
          label="Forum"
          description="Chronological community discussion — no algorithms"
          to="/community/forum"
          onClick={navigate}
        />
      </div>

      {/* Identity settings link */}
      <button
        onClick={() => navigate('/community/identity')}
        className="mt-6 flex items-center gap-2 text-sm text-adv-gray transition hover:text-adv-teal"
      >
        <ArrowRight className="h-4 w-4" />
        Identity Settings
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function CommunityPage() {
  const [status, setStatus] = useState<CommunityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  async function loadStatus() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/community/status', { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load community status');
      const data: CommunityStatus = await res.json();
      setStatus(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Could not reach server');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="mb-4 text-adv-red">{fetchError}</p>
        <button
          onClick={loadStatus}
          className="rounded-lg bg-adv-teal px-5 py-2 font-semibold text-adv-dark hover:bg-adv-teal-dark"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status?.activated) {
    return <OnboardingScreen onActivated={loadStatus} />;
  }

  return <ActivatedHub identity={status.identity!} />;
}
