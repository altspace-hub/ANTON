/**
 * CommunityContactsPage.tsx
 *
 * Manage encrypted contacts. Validates ANTON-XXXX contact hash format,
 * stores public keys for E2E encryption, and links through to messaging.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserPlus, ChevronLeft, MessageCircle, Plus, Check, X,
  Clock, CheckCircle, XCircle, Wifi, WifiOff, Loader2, Shield,
} from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────

interface Connection {
  id: number;
  contact_hash: string;
  display_name: string;
  public_key?: string;
  x25519_public_key?: string;
  endpoint?: string;
  delegation_trust_level?: string;
  import_policy?: string;
  status: 'active' | 'pending' | 'blocked';
  connected_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

const HASH_REGEX = /^ANTON-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function truncateHash(hash: string): string {
  // Show ANTON-XXXX-…-XXXX
  const parts = hash.split('-');
  if (parts.length === 5) return `${parts[0]}-${parts[1]}-…-${parts[4]}`;
  return hash;
}

function StatusBadge({ status }: { status: Connection['status'] }) {
  const map: Record<Connection['status'], { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-adv-green/15 text-adv-green border-adv-green/20' },
    pending: { label: 'Pending', cls: 'bg-adv-gold/15 text-adv-gold border-adv-gold/20' },
    blocked: { label: 'Blocked', cls: 'bg-adv-red/15 text-adv-red border-adv-red/20' },
  };
  const { label, cls } = map[status] ?? map.active;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Add Contact Form ─────────────────────────────────────────────────

function AddContactForm({
  onAdded,
  onCancel,
}: {
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [hash, setHash] = useState('');
  const [name, setName] = useState('');
  const [pubKey, setPubKey] = useState('');
  const [x25519Key, setX25519Key] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hashError, setHashError] = useState<string | null>(null);

  function validateHash(value: string) {
    if (!value) { setHashError(null); return; }
    if (!HASH_REGEX.test(value.toUpperCase())) {
      setHashError('Must be in format ANTON-XXXX-XXXX-XXXX-XXXX');
    } else {
      setHashError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!HASH_REGEX.test(hash.toUpperCase())) {
      setHashError('Must be in format ANTON-XXXX-XXXX-XXXX-XXXX');
      return;
    }
    if (!name.trim()) { setError('Display name is required.'); return; }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          contact_hash: hash.toUpperCase(),
          display_name: name.trim(),
          public_key: pubKey.trim() || undefined,
          x25519_public_key: x25519Key.trim() || undefined,
          endpoint: endpoint.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to add contact');
      }
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-adv-teal/30 bg-adv-card p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-adv-white">
          <UserPlus className="h-4 w-4 text-adv-teal" />
          Add Contact
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-adv-gray transition hover:text-adv-off-white"
          aria-label="Cancel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Contact hash */}
      <div className="mb-3">
        <label className="mb-1 block text-sm text-adv-gray" htmlFor="contact-hash">
          Contact hash <span className="text-adv-red">*</span>
        </label>
        <input
          id="contact-hash"
          type="text"
          value={hash}
          onChange={e => { setHash(e.target.value); validateHash(e.target.value); }}
          placeholder="ANTON-XXXX-XXXX-XXXX-XXXX"
          className={`w-full rounded-lg border bg-adv-dark-2 px-3 py-2 font-mono text-sm text-adv-white placeholder-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 ${hashError ? 'border-adv-red focus:border-adv-red' : 'border-border focus:border-adv-teal'}`}
        />
        {hashError && <p className="mt-1 text-xs text-adv-red">{hashError}</p>}
      </div>

      {/* Display name */}
      <div className="mb-3">
        <label className="mb-1 block text-sm text-adv-gray" htmlFor="contact-name">
          Display name <span className="text-adv-red">*</span>
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Jonas K."
          maxLength={60}
          className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      {/* Public key */}
      <div className="mb-3">
        <label className="mb-1 block text-sm text-adv-gray" htmlFor="contact-pubkey">
          Public key <span className="text-xs text-adv-gray">(Ed25519 — for signature verification)</span>
        </label>
        <textarea
          id="contact-pubkey"
          value={pubKey}
          onChange={e => setPubKey(e.target.value)}
          placeholder="Hex-encoded Ed25519 public key"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-3 py-2 font-mono text-xs text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      {/* X25519 encryption key */}
      <div className="mb-3">
        <label className="mb-1 block text-sm text-adv-gray" htmlFor="contact-x25519">
          Encryption key <span className="text-xs text-adv-gray">(X25519 — for E2E encrypted messaging)</span>
        </label>
        <textarea
          id="contact-x25519"
          value={x25519Key}
          onChange={e => setX25519Key(e.target.value)}
          placeholder="Hex-encoded X25519 public key (from peer's identity page)"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-adv-dark-2 px-3 py-2 font-mono text-xs text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
      </div>

      {/* P2P Endpoint */}
      <div className="mb-4">
        <label className="mb-1 block text-sm text-adv-gray" htmlFor="contact-endpoint">
          P2P Endpoint <span className="text-xs text-adv-gray">(for direct message delivery)</span>
        </label>
        <input
          id="contact-endpoint"
          type="text"
          value={endpoint}
          onChange={e => setEndpoint(e.target.value)}
          placeholder="http://192.168.1.50:3011"
          className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-2 text-sm text-adv-white placeholder-adv-gray focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
        />
        <p className="mt-1 text-xs text-adv-gray">The other ANTON's address on your network. Messages are encrypted end-to-end.</p>
      </div>

      {error && <p className="mb-3 text-sm text-adv-red">{error}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={loading || !!hashError}
          className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {loading ? 'Adding…' : 'Add Contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition hover:text-adv-off-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Connection Test Button ────────────────────────────────────────────

interface TestResult {
  check: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

function TestConnectionButton({ contactId }: { contactId: number }) {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [allPassed, setAllPassed] = useState(false);

  async function runTest() {
    setTesting(true);
    setResults(null);
    setSummary(null);
    try {
      const res = await fetchWithAuth(`/api/community/connections/${contactId}/test`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
        setSummary(data.summary ?? null);
        setAllPassed(data.ok === true);
      } else {
        setSummary('Test failed — server error');
      }
    } catch {
      setSummary('Test failed — could not reach server');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <button
        onClick={runTest}
        disabled={testing}
        className="flex items-center gap-1.5 rounded-lg border border-adv-blue/30 bg-adv-blue/10 px-3 py-1.5 text-xs font-medium text-adv-blue hover:bg-adv-blue/20 disabled:opacity-50"
      >
        {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
        {testing ? 'Testing...' : 'Test Connection'}
      </button>

      {results && (
        <div className="mt-3 rounded-lg border border-border bg-adv-dark-2 p-3 space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {r.status === 'pass' ? (
                <CheckCircle className="h-3.5 w-3.5 text-adv-green shrink-0 mt-0.5" />
              ) : r.status === 'fail' ? (
                <XCircle className="h-3.5 w-3.5 text-adv-red shrink-0 mt-0.5" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-adv-gray shrink-0 mt-0.5" />
              )}
              <div>
                <span className="font-medium text-adv-off-white">{r.check}: </span>
                <span className={r.status === 'pass' ? 'text-adv-green' : r.status === 'fail' ? 'text-adv-red' : 'text-adv-gray'}>
                  {r.detail}
                </span>
              </div>
            </div>
          ))}
          {summary && (
            <div className={`mt-2 pt-2 border-t border-border text-xs font-medium ${allPassed ? 'text-adv-green' : 'text-adv-gold'}`}>
              {allPassed ? <CheckCircle className="inline h-3.5 w-3.5 mr-1" /> : <WifiOff className="inline h-3.5 w-3.5 mr-1" />}
              {summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Contact row ──────────────────────────────────────────────────────

function ContactRow({
  contact,
  onMessage,
  onUpdated,
}: {
  contact: Connection;
  onMessage: (hash: string) => void;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editName, setEditName] = useState(contact.display_name);
  const [editEndpoint, setEditEndpoint] = useState(contact.endpoint ?? '');
  const [editX25519, setEditX25519] = useState(contact.x25519_public_key ?? '');
  const [editTrustLevel, setEditTrustLevel] = useState(contact.delegation_trust_level ?? 'manual');
  const [editImportPolicy, setEditImportPolicy] = useState(contact.import_policy ?? 'auto_accept');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      // Use PATCH endpoint for connection updates
      const updates: Record<string, unknown> = {};
      if (editName !== contact.display_name) updates.display_name = editName;
      if (editEndpoint !== (contact.endpoint ?? '')) updates.endpoint = editEndpoint || null;
      if (editX25519 !== (contact.x25519_public_key ?? '')) updates.x25519_public_key = editX25519 || null;

      // Trust & policy updates go through delegation endpoint
      if (editTrustLevel !== (contact.delegation_trust_level ?? 'manual') ||
          editImportPolicy !== (contact.import_policy ?? 'auto_accept')) {
        await fetch(`/api/community/connections/${contact.id}/delegation`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify({
            delegation_trust_level: editTrustLevel,
            import_policy: editImportPolicy,
          }),
        });
      }

      if (Object.keys(updates).length > 0) {
        await fetch(`/api/community/connections/${contact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          body: JSON.stringify(updates),
        });
      }
      onUpdated();
      setExpanded(false);
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-border bg-adv-card transition hover:border-adv-teal/30">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-3 text-left flex-1 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-adv-teal-dim text-sm font-bold text-adv-teal">
            {contact.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-adv-white truncate">{contact.display_name}</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-adv-gray">{truncateHash(contact.contact_hash)}</p>
              {contact.endpoint && <span className="text-xs text-adv-teal">P2P</span>}
              {contact.x25519_public_key && <span className="text-xs text-adv-green">E2E</span>}
            </div>
          </div>
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={contact.status} />
          <button
            onClick={() => onMessage(contact.contact_hash)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-adv-off-white transition hover:border-adv-teal/40 hover:text-adv-teal"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Message
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Display Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 text-sm text-adv-white focus:border-adv-teal focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">P2P Endpoint</label>
            <input value={editEndpoint} onChange={e => setEditEndpoint(e.target.value)}
              placeholder="http://192.168.1.50:3011"
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 text-sm text-adv-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-adv-gray">Encryption Key (X25519)</label>
            <input value={editX25519} onChange={e => setEditX25519(e.target.value)}
              placeholder="Hex-encoded X25519 public key"
              className="w-full rounded-lg border border-border bg-adv-dark-2 px-3 py-1.5 font-mono text-xs text-adv-white placeholder-adv-gray/50 focus:border-adv-teal focus:outline-none" />
          </div>

          {/* ── Trust & Autonomy Settings ─────────────────────────── */}
          <div className="border-t border-border pt-3 mt-1">
            <p className="text-xs font-medium text-adv-off-white mb-2">Autonomy & Trust</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Task Delegation Trust</label>
                <select value={editTrustLevel} onChange={e => setEditTrustLevel(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-2 py-1.5 text-xs text-adv-white focus:border-adv-teal focus:outline-none">
                  <option value="manual">Manual — review before processing</option>
                  <option value="trusted">Trusted — auto-process tasks</option>
                  <option value="auto">Full Auto — process + return results</option>
                </select>
                <p className="mt-0.5 text-xs text-adv-gray">
                  {editTrustLevel === 'manual' ? 'Inbound tasks require your approval before ANTON processes them.' :
                   editTrustLevel === 'trusted' ? 'ANTON will automatically accept and process tasks from this contact.' :
                   'Full autonomy — ANTON processes tasks and returns results without any human review.'}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs text-adv-gray">Knowledge Import Policy</label>
                <select value={editImportPolicy} onChange={e => setEditImportPolicy(e.target.value)}
                  className="w-full rounded-lg border border-border bg-adv-dark-2 px-2 py-1.5 text-xs text-adv-white focus:border-adv-teal focus:outline-none">
                  <option value="auto_accept">Auto-accept</option>
                  <option value="ask_first">Ask first</option>
                  <option value="block">Block all</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              <Check className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setExpanded(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-white">Cancel</button>
            <TestConnectionButton contactId={contact.id} />
            <span className="ml-auto text-xs text-adv-gray">{formatDate(contact.connected_at)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pending Connections ──────────────────────────────────────────────

function PendingConnections({ onChanged }: { onChanged: () => void }) {
  const [pending, setPending] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    loadPending();
  }, []);

  async function loadPending() {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/community/connections/pending');
      if (res.ok) {
        const data = await res.json();
        setPending(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function accept(id: string) {
    setActionId(id);
    try {
      const res = await fetchWithAuth(`/api/community/connections/${id}/accept`, { method: 'POST' });
      if (res.ok) {
        setPending(prev => prev.filter(c => c.id !== Number(id) && String(c.id) !== id));
        onChanged();
      }
    } catch { /* ignore */ }
    finally { setActionId(null); }
  }

  async function decline(id: string) {
    setActionId(id);
    try {
      const res = await fetchWithAuth(`/api/community/connections/${id}/decline`, { method: 'POST' });
      if (res.ok) {
        setPending(prev => prev.filter(c => c.id !== Number(id) && String(c.id) !== id));
        onChanged();
      }
    } catch { /* ignore */ }
    finally { setActionId(null); }
  }

  if (loading) return null;
  if (pending.length === 0) return null;

  return (
    <section className="mb-5">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-adv-gold" />
        <h2 className="text-sm font-semibold text-adv-gold">
          Pending Connections
          <span className="ml-2 rounded-full bg-adv-gold/15 px-2 py-0.5 text-xs font-medium text-adv-gold">
            {pending.length}
          </span>
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {pending.map(c => {
          const id = String(c.id);
          const isActing = actionId === id;
          return (
            <div
              key={id}
              className="flex items-center justify-between gap-3 rounded-xl border border-adv-gold/20 bg-adv-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-adv-gold/10 text-sm font-bold text-adv-gold">
                  {(c.display_name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-adv-white">{c.display_name ?? 'Unknown'}</p>
                  <p className="font-mono text-xs text-adv-gray">{truncateHash(c.contact_hash)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => accept(id)}
                  disabled={isActing}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-green/15 border border-adv-green/20 px-3 py-1.5 text-xs font-medium text-adv-green transition hover:bg-adv-green/25 disabled:opacity-50"
                  title="Accept connection"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Accept
                </button>
                <button
                  onClick={() => decline(id)}
                  disabled={isActing}
                  className="flex items-center gap-1.5 rounded-lg bg-adv-red/15 border border-adv-red/20 px-3 py-1.5 text-xs font-medium text-adv-red transition hover:bg-adv-red/25 disabled:opacity-50"
                  title="Decline connection"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function CommunityContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function loadContacts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/community/connections', { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to load contacts');
      const data = await res.json();
      setContacts(data.connections ?? data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load contacts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadContacts(); }, []);

  function handleMessage(hash: string) {
    navigate(`/community/messages?contact=${encodeURIComponent(hash)}`);
  }

  function handleAdded() {
    setShowForm(false);
    loadContacts();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/community')}
            className="flex items-center gap-1 text-sm text-adv-gray transition hover:text-adv-teal"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-adv-teal" />
            <h1 className="text-xl font-bold text-adv-white">Contacts</h1>
            {contacts.length > 0 && (
              <span className="rounded-full bg-adv-teal-dim px-2 py-0.5 text-xs text-adv-teal">
                {contacts.length}
              </span>
            )}
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark transition hover:bg-adv-teal-dark"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="mb-5">
          <AddContactForm onAdded={handleAdded} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Pending connections */}
      <PendingConnections onChanged={loadContacts} />

      {/* Loading */}
      {loading && (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-adv-teal border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-adv-red/20 bg-adv-red/5 px-4 py-3 text-sm text-adv-red">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-adv-card py-16 text-center">
          <Users className="mb-3 h-10 w-10 text-adv-gray/40" />
          <p className="mb-1 font-medium text-adv-off-white">No contacts yet</p>
          <p className="max-w-xs text-sm text-adv-gray">
            Share your contact hash and add others to get started.
          </p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-semibold text-adv-dark hover:bg-adv-teal-dark"
            >
              <UserPlus className="h-4 w-4" />
              Add your first contact
            </button>
          )}
        </div>
      )}

      {/* Contact list */}
      {!loading && !error && contacts.length > 0 && (
        <div className="flex flex-col gap-2">
          {contacts.map(c => (
            <ContactRow key={c.id ?? c.contact_hash} contact={c} onMessage={handleMessage} onUpdated={loadContacts} />
          ))}
        </div>
      )}
    </div>
  );
}
