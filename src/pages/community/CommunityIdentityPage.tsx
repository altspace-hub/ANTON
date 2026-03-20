/**
 * CommunityIdentityPage.tsx
 *
 * Full identity management: editable display name, real QR codes,
 * payment info, profile visibility, contact hash, and public key.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Fingerprint, Copy, Check, ChevronLeft, Lock, Shield,
  ChevronDown, ChevronUp, Pencil, Save, Eye, EyeOff, Globe,
  Wallet, QrCode,
} from 'lucide-react';
import { fetchWithAuth } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface CommunityIdentity {
  contact_hash: string;
  display_name: string;
  activated_at: string;
  public_key?: string;
  payment_address?: string;
  payment_name?: string;
  payment_country?: string;
  agent_wallet_address?: string;
  agent_wallet_name?: string;
  auto_accept_connections?: number;
  profile_visibility?: string;
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

// ── Payment Info Section (pulls from KYC + Wallets) ─────────────────

function PaymentInfoSection({ identity, paymentQrUrl }: { identity: CommunityIdentity | null; paymentQrUrl: string }) {
  const [kyc, setKyc] = useState<Record<string, unknown> | null>(null);
  const [wallets, setWallets] = useState<Array<Record<string, unknown>>>([]);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [kycRes, walletsRes] = await Promise.all([
          fetchWithAuth('/api/futurechain/kyc'),
          fetchWithAuth('/api/futurechain/wallets'),
        ]);
        if (kycRes.ok) setKyc(await kycRes.json());
        if (walletsRes.ok) setWallets(await walletsRes.json());
      } catch {}
    }
    load();
  }, []);

  const handleSyncToIdentity = async () => {
    if (!kyc) return;
    setSyncing(true);
    const humanWallet = wallets.find(w => w.wallet_type === 'human');
    const agentWallet = wallets.find(w => w.wallet_type === 'agent');
    await fetchWithAuth('/api/community/identity', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment_address: String(humanWallet?.address ?? ''),
        payment_name: String(kyc.full_legal_name_enc ?? kyc.fullLegalName ?? ''),
        payment_country: String(kyc.country ?? ''),
        agent_wallet_address: String(agentWallet?.address ?? ''),
        agent_wallet_name: String(agentWallet?.name ?? ''),
      }),
    });
    setSyncing(false);
    setSynced(true);
    setTimeout(() => setSynced(false), 3000);
  };

  const humanWallet = wallets.find(w => w.wallet_type === 'human');
  const agentWallet = wallets.find(w => w.wallet_type === 'agent');
  const hasKyc = kyc && (kyc.full_legal_name_enc || kyc.country);
  const hasWallets = wallets.length > 0;

  return (
    <section className="mb-5 rounded-xl border border-border bg-adv-card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-adv-white">
        <Wallet className="h-4 w-4 text-adv-gold" />
        Payment Info (ISO 20022)
      </h2>

      {!hasKyc && !hasWallets ? (
        <div className="text-center py-6">
          <Wallet className="h-8 w-8 text-adv-gray mx-auto mb-2" />
          <p className="text-sm text-adv-gray mb-3">No payment info configured yet.</p>
          <a href="/futurechain/kyc" className="text-sm text-adv-teal hover:text-adv-teal-dark">
            Set up KYC Profile →
          </a>
          <span className="text-adv-gray mx-2">·</span>
          <a href="/futurechain/wallets" className="text-sm text-adv-teal hover:text-adv-teal-dark">
            Create Wallet →
          </a>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-adv-blue/20 bg-adv-blue/5 px-4 py-3 text-xs text-adv-gray mb-4">
            Payment information is pulled from your <a href="/futurechain/kyc" className="text-adv-teal hover:underline">KYC Profile</a> and <a href="/futurechain/wallets" className="text-adv-teal hover:underline">Wallets</a>. These fields are included in ISO 20022 PACS.008 payment messages sent to contacts.
          </div>

          <div className="space-y-4">
            {/* KYC Info */}
            {hasKyc && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-adv-gray mb-2">ISO 20022 Debtor Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-adv-gray">Name:</span> <span className="text-adv-off-white ml-2">{String(kyc.full_legal_name_enc ?? '—')}</span></div>
                  <div><span className="text-adv-gray">Country:</span> <span className="text-adv-off-white ml-2">{String(kyc.country ?? '—')}</span></div>
                  <div><span className="text-adv-gray">City:</span> <span className="text-adv-off-white ml-2">{String(kyc.city_enc ?? '—')}</span></div>
                  <div><span className="text-adv-gray">Address:</span> <span className="text-adv-off-white ml-2">{String(kyc.street_address_enc ?? '—')}</span></div>
                </div>
              </div>
            )}

            {/* Human Wallet */}
            {humanWallet && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-adv-gray mb-2">Personal Wallet</h3>
                <div className="rounded-lg bg-adv-dark-2 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-adv-off-white">{String(humanWallet.name)}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-adv-blue/10 text-adv-blue">personal</span>
                    </div>
                    <span className="text-sm font-bold text-adv-teal">{Number(humanWallet.balance_ftc || 0).toFixed(2)} FTC</span>
                  </div>
                  <div className="text-xs text-adv-gray font-mono mt-1">{String(humanWallet.address)}</div>
                </div>
              </div>
            )}

            {/* Agent Wallet */}
            {agentWallet && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-adv-gray mb-2">ANTON Agent Wallet (UBO: {String(kyc?.full_legal_name_enc ?? identity?.display_name ?? 'Owner')})</h3>
                <div className="rounded-lg bg-adv-dark-2 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-adv-off-white">{String(agentWallet.name)}</span>
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-adv-teal/10 text-adv-teal">agent</span>
                    </div>
                    <span className="text-sm font-bold text-adv-teal">{Number(agentWallet.balance_ftc || 0).toFixed(2)} FTC</span>
                  </div>
                  <div className="text-xs text-adv-gray font-mono mt-1">{String(agentWallet.address)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Sync + QR */}
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleSyncToIdentity} disabled={syncing}
              className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              <Save className="h-4 w-4" />
              {syncing ? 'Syncing...' : 'Sync to Contact Card'}
            </button>
            {synced && <span className="flex items-center gap-1 text-sm text-adv-green"><Check className="h-4 w-4" /> Synced</span>}
            <span className="text-xs text-adv-gray">Updates what contacts see when they receive your payment info</span>
          </div>

          {paymentQrUrl && (
            <div className="mt-5 flex flex-col items-center rounded-lg border border-adv-gold/20 bg-adv-dark-2 p-4">
              <p className="mb-2 text-xs uppercase tracking-wider text-adv-gold">Payment QR</p>
              <img src={paymentQrUrl} alt="Payment QR code" className="h-[180px] w-[180px] rounded-lg" />
              <p className="mt-2 text-xs text-adv-gray">Scan to send payment — includes wallet address + ISO 20022 fields</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function truncateKey(key: string, chars = 32): string {
  if (key.length <= chars * 2 + 3) return key;
  return `${key.slice(0, chars)}...${key.slice(-chars)}`;
}

// ── Main component ───────────────────────────────────────────────────

export default function CommunityIdentityPage() {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState<CommunityIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Copy states
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Edit states
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  // QR states
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  // Payment fields
  const [paymentAddress, setPaymentAddress] = useState('');
  const [paymentName, setPaymentName] = useState('');
  const [paymentCountry, setPaymentCountry] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);

  // Visibility
  const [visibility, setVisibility] = useState<string>('private');
  const [autoAccept, setAutoAccept] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);

  // Public key
  const [keyExpanded, setKeyExpanded] = useState(false);

  const localPrivateKey = localStorage.getItem('community-private-key');
  const hasLocalKey = Boolean(localPrivateKey);

  const loadQr = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/community/identity/qr');
      if (res.ok) {
        const data = await res.json();
        setQrDataUrl(data.qrDataUrl);
      }
    } catch { /* QR optional */ }
  }, []);

  const loadPaymentQr = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/community/identity/payment-qr');
      if (res.ok) {
        const data = await res.json();
        setPaymentQrUrl(data.qrDataUrl);
      } else {
        setPaymentQrUrl(null);
      }
    } catch { setPaymentQrUrl(null); }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchWithAuth('/api/community/status');
        if (!res.ok) throw new Error('Failed to load identity');
        const data: CommunityStatus = await res.json();
        if (!data.activated || !data.identity) {
          navigate('/community');
          return;
        }
        setIdentity(data.identity);
        setNameInput(data.identity.display_name);
        setPaymentAddress(data.identity.payment_address ?? '');
        setPaymentName(data.identity.payment_name ?? '');
        setPaymentCountry(data.identity.payment_country ?? '');
        setVisibility(data.identity.profile_visibility ?? 'private');
        setAutoAccept(Boolean(data.identity.auto_accept_connections));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load identity');
      } finally {
        setLoading(false);
      }
    }
    load();
    loadQr();
    loadPaymentQr();
  }, [navigate, loadQr, loadPaymentQr]);

  // ── Actions ──────────────────────────────────────────────────────

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

  async function saveName() {
    if (!nameInput.trim()) return;
    setSavingName(true);
    try {
      const res = await fetchWithAuth('/api/community/identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: nameInput.trim() }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIdentity(prev => prev ? { ...prev, display_name: updated.display_name } : prev);
        setEditingName(false);
      }
    } catch { /* ignore */ }
    finally { setSavingName(false); }
  }

  async function savePayment() {
    setSavingPayment(true);
    setPaymentSaved(false);
    try {
      const res = await fetchWithAuth('/api/community/identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_address: paymentAddress.trim(),
          payment_name: paymentName.trim(),
          payment_country: paymentCountry.trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIdentity(prev => prev ? { ...prev, ...updated } : prev);
        setPaymentSaved(true);
        setTimeout(() => setPaymentSaved(false), 2500);
        loadPaymentQr();
      }
    } catch { /* ignore */ }
    finally { setSavingPayment(false); }
  }

  async function saveVisibility(newVisibility: string, newAutoAccept: boolean) {
    setSavingVisibility(true);
    try {
      const res = await fetchWithAuth('/api/community/identity', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_visibility: newVisibility,
          auto_accept_connections: newAutoAccept ? 1 : 0,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setIdentity(prev => prev ? { ...prev, ...updated } : prev);
      }
    } catch { /* ignore */ }
    finally { setSavingVisibility(false); }
  }

  // ── Render ───────────────────────────────────────────────────────

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
        <h1 className="text-xl font-bold text-adv-white">My Identity</h1>
      </div>

      {/* ── QR Code Card ────────────────────────────────────────── */}
      <section className="mb-5 rounded-xl border border-adv-teal/30 bg-adv-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-adv-white">
          <QrCode className="h-4 w-4 text-adv-teal" />
          Contact QR
        </h2>

        <div className="flex flex-col items-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Contact QR code"
              className="mb-3 h-[200px] w-[200px] rounded-lg"
            />
          ) : (
            <div className="mb-3 flex h-[200px] w-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-adv-dark-2">
              <QrCode className="h-12 w-12 text-adv-gray/30" />
            </div>
          )}
          <p className="mb-3 text-sm text-adv-gray">Scan to connect with me</p>
        </div>

        {/* Contact hash */}
        <p className="mb-1 text-xs uppercase tracking-wider text-adv-gray">Contact hash</p>
        <div className="mb-3 flex items-center gap-2">
          <p className="break-all font-mono text-xl font-bold tracking-widest text-adv-teal">
            {identity.contact_hash}
          </p>
          <button
            onClick={copyHash}
            className="shrink-0 rounded-lg border border-border bg-adv-dark-2 p-2 text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
            title="Copy contact hash"
          >
            {copiedHash ? <Check className="h-4 w-4 text-adv-green" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        {copiedHash && <p className="mb-2 text-xs text-adv-green">Copied to clipboard</p>}

        <p className="text-center text-sm text-adv-gray">
          Share your contact hash with people you want to connect with.
        </p>
      </section>

      {/* ── Identity Card ───────────────────────────────────────── */}
      <section className="mb-5 rounded-xl border border-border bg-adv-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-adv-white">
          <Fingerprint className="h-4 w-4 text-adv-teal" />
          Identity
        </h2>

        {/* Display name — editable */}
        <p className="mb-1 text-xs uppercase tracking-wider text-adv-gray">Display name</p>
        {editingName ? (
          <div className="mb-4 flex items-center gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              maxLength={50}
              autoFocus
              className="flex-1 rounded-lg border border-adv-teal/40 bg-adv-dark-2 px-3 py-2 text-sm text-adv-white focus:outline-none focus-visible:ring-2 focus-visible:ring-adv-teal"
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
            />
            <button
              onClick={saveName}
              disabled={savingName || !nameInput.trim()}
              className="flex items-center gap-1 rounded-lg bg-adv-teal px-3 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {savingName ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setEditingName(false); setNameInput(identity.display_name); }}
              className="rounded-lg border border-border px-3 py-2 text-sm text-adv-gray hover:text-adv-off-white"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mb-4 flex items-center gap-2">
            <p className="text-lg font-semibold text-adv-white">{identity.display_name}</p>
            <button
              onClick={() => setEditingName(true)}
              className="rounded p-1 text-adv-gray transition hover:text-adv-teal"
              title="Edit display name"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Activated since */}
        <p className="mb-1 text-xs uppercase tracking-wider text-adv-gray">Activated since</p>
        <p className="mb-4 text-sm text-adv-off-white">{formatDate(identity.activated_at)}</p>

        {/* Public key (collapsible) */}
        {identity.public_key && (
          <div className="rounded-lg border border-border">
            <button
              onClick={() => setKeyExpanded(v => !v)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-adv-gray" />
                <span className="text-sm font-medium text-adv-off-white">Public Key</span>
              </div>
              {keyExpanded
                ? <ChevronUp className="h-4 w-4 text-adv-gray" />
                : <ChevronDown className="h-4 w-4 text-adv-gray" />}
            </button>

            {keyExpanded && (
              <div className="border-t border-border px-4 pb-4 pt-3">
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
                  Your public key is used by contacts to encrypt messages only you can read. It is safe to share.
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Payment Info Card (from KYC + Wallets) ───────────────── */}
      <PaymentInfoSection identity={identity} paymentQrUrl={paymentQrUrl} />

      {/* ── Profile Visibility Card ─────────────────────────────── */}
      <section className="mb-5 rounded-xl border border-border bg-adv-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-adv-white">
          <Eye className="h-4 w-4 text-adv-blue" />
          Profile Visibility
        </h2>

        <div className="space-y-3">
          {([
            { value: 'private', label: 'Private', icon: EyeOff, desc: 'Your profile is hidden from the directory. Only people who know your contact hash can find you.' },
            { value: 'business', label: 'Business', icon: Eye, desc: 'Your display name and contact hash are visible in the business directory. Payment info stays private.' },
            { value: 'public', label: 'Public', icon: Globe, desc: 'Full profile visible in the public directory, including payment address if configured.' },
          ] as const).map(opt => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                visibility === opt.value
                  ? 'border-adv-teal/50 bg-adv-teal/5'
                  : 'border-border hover:border-adv-teal/20'
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.value}
                checked={visibility === opt.value}
                onChange={() => {
                  setVisibility(opt.value);
                  saveVisibility(opt.value, autoAccept);
                }}
                disabled={savingVisibility}
                className="mt-1 accent-[#2DD4A8]"
              />
              <div>
                <div className="flex items-center gap-2">
                  <opt.icon className="h-4 w-4 text-adv-teal" />
                  <span className="text-sm font-medium text-adv-white">{opt.label}</span>
                </div>
                <p className="mt-0.5 text-xs text-adv-gray">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Auto-accept toggle */}
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium text-adv-white">Auto-accept connections</p>
            <p className="text-xs text-adv-gray">Automatically accept incoming connection requests</p>
          </div>
          <button
            onClick={() => {
              const next = !autoAccept;
              setAutoAccept(next);
              saveVisibility(visibility, next);
            }}
            disabled={savingVisibility}
            className={`relative h-6 w-11 rounded-full transition ${
              autoAccept ? 'bg-adv-teal' : 'bg-adv-dark-2 border border-border'
            }`}
            role="switch"
            aria-checked={autoAccept}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                autoAccept ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      {/* ── Security Notes ──────────────────────────────────────── */}
      <section className="rounded-xl border border-adv-gold/20 bg-adv-gold/5 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-adv-gold" />
          <h2 className="text-sm font-semibold text-adv-gold">Security Notes</h2>
        </div>
        <ul className="space-y-2 text-sm text-adv-off-white">
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">-</span>
            Your private key is stored locally on this device only. It cannot be recovered if lost.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">-</span>
            {hasLocalKey
              ? 'Private key found in browser storage on this device.'
              : 'No private key detected in this browser. You may have activated on a different device.'}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">-</span>
            Clearing browser storage or using a different device will require re-activation.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 text-adv-gold">-</span>
            ANTON servers only hold your public key and encrypted message payloads.
          </li>
        </ul>
      </section>
    </div>
  );
}
