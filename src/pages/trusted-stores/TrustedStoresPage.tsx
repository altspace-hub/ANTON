// TrustedStoresPage.tsx — Trusted Stores P0 list. Pinned favourite sellers with
// their verification status + a key-rotation alert. No money/budgets (P0).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Fingerprint, RefreshCw, Trash2, Plus } from 'lucide-react';
import { useTrustedStoresStore, type TrustedSeller, type TrustStatus } from '../../stores/useTrustedStoresStore';

function StatusPill({ status }: { status: TrustStatus }) {
  const map: Record<TrustStatus, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
    trusted: { label: 'Verified', cls: 'bg-adv-green/15 text-adv-green', Icon: ShieldCheck },
    pinned: { label: 'Unverified', cls: 'bg-adv-gray/15 text-adv-gray', Icon: ShieldQuestion },
    pending: { label: 'Verifying…', cls: 'bg-adv-gold/15 text-adv-gold', Icon: ShieldQuestion },
    key_changed: { label: 'Key changed — re-verify', cls: 'bg-adv-red/15 text-adv-red', Icon: ShieldAlert },
    revoked: { label: 'Removed', cls: 'bg-adv-gray/15 text-adv-gray', Icon: ShieldQuestion },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      <Icon size={13} /> {label}
    </span>
  );
}

function SellerCard({ seller }: { seller: TrustedSeller }) {
  const { recheckKey, remove } = useTrustedStoresStore();
  const [busy, setBusy] = useState<null | 'check' | 'remove'>(null);
  const [note, setNote] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-adv-card bg-adv-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-adv-off-white">
            {seller.displayTitle || seller.portalAddress}
          </div>
          <div className="truncate text-sm text-adv-gray">{seller.portalAddress}</div>
        </div>
        <StatusPill status={seller.status} />
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-adv-gray">
        <Fingerprint size={13} className="shrink-0" />
        <span className="font-mono truncate" title={seller.signingKeyFingerprint}>
          {seller.signingKeyFingerprint.slice(0, 24)}…
        </span>
      </div>
      {seller.logVerified
        ? <p className="mt-1 text-xs text-adv-green">🛡 Transparency-log verified — the registry proved this key; the relay can't equivocate.{seller.registryKeyMismatch ? <span className="text-adv-gold"> · cached descriptor's key differed — proven key pinned; re-visit to refresh</span> : null}</p>
        : seller.registryVerified
          ? <p className="mt-1 text-xs text-adv-green">✓ Registry-verified key{seller.registryKeyMismatch ? <span className="text-adv-red"> · cache mismatch flagged</span> : null}</p>
          : null}
      {seller.status === 'trusted' && seller.verificationMethod === 'mutual-handshake' && (
        <p className="mt-1 text-xs text-adv-green">Live-verified: the seller signed your challenge with this key.</p>
      )}
      {seller.status === 'key_changed' && (
        <p className="mt-1 text-xs text-adv-red">
          The signing key changed since you pinned this store — a different party may have taken the name. Re-pin only if you trust it.
        </p>
      )}
      {note && <p className="mt-1 text-xs text-adv-gray">{note}</p>}

      <div className="mt-4 flex gap-2">
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal disabled:opacity-50"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('check'); setNote(null);
            try {
              const r = await recheckKey(seller.portalAddress);
              setNote(!r.resolvable
                ? 'Could not re-check — re-visit/discover the store so its descriptor is cached again.'
                : r.rotated ? 'Key ROTATED — flagged for re-verification.' : 'Key unchanged — still the same store.');
            } catch (e) { setNote(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(null); }
          }}
        >
          <RefreshCw size={13} className={busy === 'check' ? 'animate-spin' : ''} /> Re-check key
        </button>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-red hover:border-adv-red disabled:opacity-50"
          disabled={busy !== null}
          onClick={async () => {
            if (!confirm(`Remove "${seller.displayTitle || seller.portalAddress}" from trusted stores?`)) return;
            setBusy('remove');
            try { await remove(seller.portalAddress); } catch (e) { setNote(e instanceof Error ? e.message : String(e)); setBusy(null); }
          }}
        >
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </div>
  );
}

export default function TrustedStoresPage() {
  const navigate = useNavigate();
  const { sellers, loading, error, load } = useTrustedStoresStore();
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-adv-off-white">
            <ShieldCheck className="text-adv-teal" /> Trusted Stores
          </h1>
          <p className="mt-1 text-sm text-adv-gray">
            Pin the sellers you buy from. ANTON anchors each store's signing key so it can warn you if a different
            party ever takes the name. Verify a store live by asking it to sign your challenge.
          </p>
        </div>
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-adv-teal px-3.5 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark"
          onClick={() => navigate('/trusted-stores/pin')}
        >
          <Plus size={16} /> Pin a seller
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg bg-adv-red/10 px-3 py-2 text-sm text-adv-red">{error}</div>}
      {loading && sellers.length === 0 && <p className="text-sm text-adv-gray">Loading…</p>}
      {!loading && sellers.length === 0 && (
        <div className="rounded-xl border border-dashed border-adv-card p-8 text-center text-adv-gray">
          No trusted stores yet. Pin a seller you already buy from to get started.
        </div>
      )}

      <div className="grid gap-3">
        {sellers.map((s) => <SellerCard key={s.id} seller={s} />)}
      </div>
    </div>
  );
}
