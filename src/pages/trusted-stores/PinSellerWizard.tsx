// PinSellerWizard.tsx — Trusted Stores P0: resolve → review identity → mutual
// handshake (live key proof) → confirm pin.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck, AlertTriangle, Fingerprint, Loader2, CheckCircle2 } from 'lucide-react';
import { useTrustedStoresStore, type ResolvePreview } from '../../stores/useTrustedStoresStore';

const STEPS = ['Enter link', 'Review identity', 'Verify ownership', 'Confirm'] as const;

export default function PinSellerWizard() {
  const navigate = useNavigate();
  const store = useTrustedStoresStore();
  const [step, setStep] = useState(0);
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ResolvePreview | null>(null);

  // handshake state
  const [responseId, setResponseId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const doResolve = async () => {
    setBusy(true); setError(null);
    try {
      const p = await store.resolve(address.trim());
      setPreview(p);
      if (!p.resolved) setError('Could not resolve this store — visit/discover it first so its signed descriptor is cached on this instance.');
      else setStep(1);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const startHandshake = async () => {
    setBusy(true); setError(null); setVerified(false); setReasons([]);
    try {
      const r = await store.requestHandshake(address.trim());
      setResponseId(r.responseId);
      setPolling(true);
      pollRef.current = setInterval(async () => {
        try {
          const v = await store.verifyHandshake(address.trim(), r.responseId);
          if (v.verified) { setVerified(true); setPolling(false); if (pollRef.current) clearInterval(pollRef.current); }
          else if (!v.pending && v.reasons.length) { setReasons(v.reasons); }
        } catch { /* keep polling */ }
      }, 2500);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const agreeAsSeller = async () => {
    if (!responseId) return;
    setBusy(true); setError(null);
    try { await store.agree(responseId); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const confirmPin = async () => {
    setBusy(true); setError(null);
    try { await store.pin(address.trim()); navigate('/trusted-stores'); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <button className="mb-4 inline-flex items-center gap-1.5 text-sm text-adv-gray hover:text-adv-off-white" onClick={() => navigate('/trusted-stores')}>
        <ArrowLeft size={15} /> Trusted Stores
      </button>
      <h1 className="flex items-center gap-2 text-xl font-bold text-adv-off-white"><ShieldCheck className="text-adv-teal" /> Pin a seller</h1>

      <div className="my-4 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className={`flex-1 rounded-full py-1 text-center text-xs ${i === step ? 'bg-adv-teal/20 text-adv-teal' : i < step ? 'bg-adv-green/15 text-adv-green' : 'bg-adv-card text-adv-gray'}`}>{s}</div>
        ))}
      </div>

      {error && <div className="mb-4 flex items-start gap-2 rounded-lg bg-adv-red/10 px-3 py-2 text-sm text-adv-red"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</div>}

      {/* Step 0 — enter link */}
      {step === 0 && (
        <div className="space-y-3">
          <label className="block text-sm text-adv-gray">The store's open link (portal address)</label>
          <input
            className="w-full rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-2 text-adv-off-white placeholder-adv-gray/60 outline-none focus:border-adv-teal"
            placeholder="mybakery.futurechain.portal"
            value={address} onChange={(e) => setAddress(e.target.value)} spellCheck={false}
          />
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50" disabled={busy || address.trim().length < 3} onClick={doResolve}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />} Resolve
          </button>
        </div>
      )}

      {/* Step 1 — review identity */}
      {step === 1 && preview?.resolved && (
        <div className="space-y-3">
          <div className="rounded-xl border border-adv-card bg-adv-card p-4">
            <div className="font-semibold text-adv-off-white">{preview.resolved.displayTitle || preview.resolved.portalAddress}</div>
            <div className="text-sm text-adv-gray">{preview.resolved.portalAddress}</div>
            <div className="mt-3 flex items-center gap-2 text-xs text-adv-gray">
              <Fingerprint size={14} /><span className="font-mono break-all">{preview.resolved.signingKeyFingerprint}</span>
            </div>
            <div className="mt-2 text-xs">
              {preview.integrity?.valid
                ? <span className="text-adv-gray">Descriptor is self-consistently signed — this alone does <strong>not</strong> prove identity. Verify the store live below.</span>
                : <span className="text-adv-gold">⚠ Descriptor signature {preview.integrity?.reasons.includes('no-signature-cached') ? 'unavailable (relay-only) — verify live below.' : `not verified: ${preview.integrity?.reasons.join(', ')}`}</span>}
            </div>
          </div>

          {preview.lookAlikeWarnings.length > 0 && (
            <div className="rounded-xl border border-adv-gold/40 bg-adv-gold/10 p-3 text-sm text-adv-gold">
              <div className="flex items-center gap-1.5 font-medium"><AlertTriangle size={15} /> Possible look-alike</div>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {preview.lookAlikeWarnings.map((w, i) => <li key={i}>{w.reason}</li>)}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <button className="rounded-lg border border-adv-card bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white" onClick={() => setStep(0)}>Back</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark" onClick={() => setStep(2)}>Verify ownership <ArrowRight size={16} /></button>
          </div>
        </div>
      )}

      {/* Step 2 — mutual handshake */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-adv-gray">
            Ask the store to prove it controls this signing key right now: ANTON sends a fresh challenge to its inbox; the
            store owner agrees and signs it; we verify the signature against the pinned key. This is stronger than trusting
            the directory alone.
          </p>
          {!responseId ? (
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50" disabled={busy} onClick={startHandshake}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Send trust request
            </button>
          ) : verified ? (
            <div className="flex items-center gap-2 rounded-lg bg-adv-green/10 px-3 py-2 text-sm text-adv-green">
              <CheckCircle2 size={16} /> Verified — the seller signed your challenge with the pinned key.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-adv-gold/10 px-3 py-2 text-sm text-adv-gold">
                {polling && <Loader2 size={15} className="animate-spin" />} Waiting for the store to agree…
              </div>
              {reasons.length > 0 && <div className="rounded-lg bg-adv-red/10 px-3 py-2 text-xs text-adv-red">Verification failed: {reasons.join(', ')}</div>}
              <p className="text-xs text-adv-gray">If you own this store on this instance, you can agree as the seller to complete the demo:</p>
              <button className="rounded-lg border border-adv-card bg-adv-dark-2 px-3 py-1.5 text-xs text-adv-off-white hover:border-adv-teal disabled:opacity-50" disabled={busy} onClick={agreeAsSeller}>Agree as the store owner</button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button className="rounded-lg border border-adv-card bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white" onClick={() => setStep(1)}>Back</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark" onClick={() => setStep(3)}>
              {verified ? 'Continue' : 'Skip — pin unverified'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — confirm */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="rounded-xl border border-adv-card bg-adv-card p-4 text-sm">
            <div className="font-semibold text-adv-off-white">{preview?.resolved?.displayTitle || address}</div>
            <div className="text-adv-gray">{address}</div>
            <div className="mt-2">
              {verified
                ? <span className="text-adv-green">This store is live-verified — it will be pinned as Verified.</span>
                : <span className="text-adv-gold">Not live-verified — it will be pinned as Unverified (you can verify later).</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border border-adv-card bg-adv-dark-2 px-4 py-2 text-sm text-adv-off-white" onClick={() => setStep(2)}>Back</button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50" disabled={busy} onClick={confirmPin}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Pin this store
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
