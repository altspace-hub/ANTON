/**
 * CredentialVaultPage — manage encrypted credentials for missions (Phase 2).
 * Secrets are NEVER displayed. Create / list / rotate / revoke / view audit log.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Plus, Trash2, RefreshCcw, AlertCircle, ChevronLeft, KeyRound } from 'lucide-react';
import { fetchWithAuth, getAuthHeader } from '../../lib/api';

type CredentialType = 'api_key' | 'oauth2' | 'username_password' | 'client_certificate' | 'cookie_jar' | 'bearer_token';

interface StoredCredential {
  id: string;
  name: string;
  credential_type: CredentialType;
  service_name: string | null;
  oauth_expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

const TYPE_LABEL: Record<CredentialType, string> = {
  api_key: 'API key',
  oauth2: 'OAuth 2.0',
  username_password: 'Username + password',
  client_certificate: 'Client certificate',
  cookie_jar: 'Cookie jar',
  bearer_token: 'Bearer token',
};

export default function CredentialVaultPage() {
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/credentials', { headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setCredentials(data.credentials ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke credential "${name}"? Missions using it will fail until rotated.`)) return;
    try {
      const res = await fetchWithAuth(`/api/credentials/${id}`, { method: 'DELETE', headers: getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      void load();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-5">
      <Link to="/missions" className="inline-flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Missions
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3">
            <Lock className="h-7 w-7 text-adv-teal" />
            <h1 className="text-2xl font-semibold text-adv-off-white">Credential Vault</h1>
          </div>
          <p className="mt-1 text-sm text-adv-gray max-w-2xl">
            Encrypted storage for API keys, OAuth tokens, and other secrets that missions need to act on
            external systems. Secrets <strong>never</strong> reach the LLM — only execution-layer code can decrypt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            New credential
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-adv-red/30 bg-adv-red/10 px-4 py-3 text-sm text-adv-red flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {credentials.length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-border bg-adv-card/50 p-8 text-center">
          <KeyRound className="h-10 w-10 text-adv-teal/40 mx-auto" />
          <p className="mt-3 text-sm text-adv-off-white font-medium">No credentials stored</p>
          <p className="mt-1 text-xs text-adv-gray max-w-md mx-auto">
            Add an API key, OAuth token, or login credential. Missions can then act on the corresponding
            external service without ever seeing the secret.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {credentials.map(c => (
            <li key={c.id} className="rounded-xl border border-border bg-adv-card px-4 py-3 flex items-center gap-3">
              <KeyRound className="h-4 w-4 text-adv-teal shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-adv-off-white truncate">{c.name}</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-adv-gray">{TYPE_LABEL[c.credential_type]}</span>
                  {c.service_name && <span className="text-[10px] text-adv-gray">· {c.service_name}</span>}
                  {!c.is_active && <span className="text-[10px] text-adv-red uppercase">Revoked</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-adv-gray">
                  Created {new Date(c.created_at).toLocaleDateString()}
                  {c.last_used_at && ` · last used ${new Date(c.last_used_at).toLocaleDateString()}`}
                  {c.oauth_expires_at && ` · expires ${new Date(c.oauth_expires_at).toLocaleDateString()}`}
                </div>
              </div>
              <button
                onClick={() => revoke(c.id, c.name)}
                disabled={!c.is_active}
                className="rounded p-1.5 text-adv-gray hover:text-adv-red hover:bg-adv-red/10 transition-colors disabled:opacity-30"
                title="Revoke"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCreate && <CredentialCreator onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
    </div>
  );
}

function CredentialCreator({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [credType, setCredType] = useState<CredentialType>('api_key');
  const [serviceName, setServiceName] = useState('');
  const [secret, setSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !secret.trim()) {
      setError('Name and secret are required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          name: name.trim(),
          credential_type: credType,
          service_name: serviceName.trim() || undefined,
          secret,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
         onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}
         role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-border bg-adv-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-semibold text-adv-off-white">New credential</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
                   placeholder="e.g. LinkedIn API key (Bot account)"
                   className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">Type</label>
              <select value={credType} onChange={e => setCredType(e.target.value as CredentialType)}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none">
                {(Object.keys(TYPE_LABEL) as CredentialType[]).map(t => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">Service (optional)</label>
              <input value={serviceName} onChange={e => setServiceName(e.target.value)}
                     placeholder="e.g. linkedin"
                     className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-adv-gray mb-1">Secret</label>
            <textarea value={secret} onChange={e => setSecret(e.target.value)}
                      placeholder="Paste the secret. It will be encrypted at rest with AES-256-GCM."
                      rows={3}
                      className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-off-white focus:border-adv-teal focus:outline-none font-mono" />
            <p className="mt-1 text-[10px] text-adv-gray">Secrets are never returned in API responses or shown again.</p>
          </div>
          {error && (
            <div className="rounded border border-adv-red/30 bg-adv-red/10 px-2 py-1.5 text-[11px] text-adv-red">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button type="button" onClick={onClose} disabled={submitting}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm text-adv-gray hover:text-adv-off-white">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !name.trim() || !secret.trim()}
                    className="rounded-lg bg-adv-teal px-4 py-1.5 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
