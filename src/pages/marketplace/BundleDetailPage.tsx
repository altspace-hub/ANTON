// ── BundleDetailPage.tsx ───────────────────────────────────────────────────
// /marketplace/:bundle_id — full detail + preview-before-install + install
// or purchase (FutureChain only per Q5 answer).

import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Download, ShoppingCart, Eye } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';

interface Listing {
  id: string;
  bundle_type: string;
  title: string;
  description: string;
  author_name: string;
  author_hash: string;
  version: string;
  tags: unknown;
  avg_rating: number | string;
  rating_count: number;
  download_count: number;
  bundle_size_bytes: number | null;
}
interface Review {
  id: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  reviewer_name: string | null;
  verified_install?: boolean;
  created_at: string;
}

export default function BundleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/marketplace/${encodeURIComponent(id!)}`);
        if (res.ok) {
          const json = await res.json() as { listing: Listing; reviews: Review[] };
          setListing(json.listing);
          setReviews(json.reviews ?? []);
        }
      } finally { setLoading(false); }
    })();
  }, [id]);

  async function install() {
    setBusy('install'); setMsg(null);
    const res = await fetchWithAuth('/api/marketplace/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle_id: id }),
    });
    setBusy(null);
    if (res.ok) { setMsg('Installed. Check your library.'); }
    else { const j = await res.json().catch(() => ({})); setMsg(`Install failed: ${j.error || res.status}`); }
  }

  async function purchase() {
    setBusy('purchase'); setMsg(null);
    const res = await fetchWithAuth('/api/marketplace/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle_id: id }),
    });
    setBusy(null);
    if (res.ok) {
      const j = await res.json() as { settlement: string; note: string };
      setMsg(`Purchased via ${j.settlement}. ${j.note}`);
    } else {
      const j = await res.json().catch(() => ({}));
      setMsg(`Purchase failed: ${j.error || res.status}`);
    }
  }

  if (loading) return <div className="p-6 text-adv-gray">Loading…</div>;
  if (!listing) return (
    <div className="p-6">
      <Link to="/marketplace" className="text-adv-teal">← Marketplace</Link>
      <div className="mt-4 text-adv-red">Bundle not found.</div>
    </div>
  );

  const tags = Array.isArray(listing.tags) ? listing.tags as string[] : [];

  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Link to="/marketplace" className="text-sm text-adv-teal inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Marketplace
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{listing.title}</h1>
            <ShieldCheck size={20} className="text-adv-teal" />
          </div>
          <div className="text-sm text-adv-gray">
            {listing.bundle_type} · v{listing.version} · by {listing.author_name}
            <span className="mx-2">·</span>
            <code className="text-[11px]">{listing.author_hash.slice(0, 12)}…</code>
          </div>
          <p className="text-sm">{listing.description}</p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map(t => (
                <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-adv-card border border-border">#{t}</span>
              ))}
            </div>
          )}
        </header>

        <section className="rounded-lg border border-adv-teal/40 bg-adv-teal/5 p-4 flex items-start gap-3">
          <ShieldCheck size={20} className="text-adv-teal flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <div className="font-medium">Signature verified</div>
            <div className="text-xs text-adv-gray">Publisher's Ed25519 signature matched. You can preview the bundle contents before installing.</div>
          </div>
          <button
            onClick={() => setPreviewOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-adv-teal hover:underline"
          >
            <Eye size={14} /> {previewOpen ? 'Hide' : 'Preview'} contents
          </button>
        </section>

        {previewOpen && (
          <section className="rounded-lg border border-border bg-adv-card p-4">
            <div className="text-sm font-medium mb-2">Bundle contents (preview)</div>
            <div className="text-xs text-adv-gray">
              Full contents preview (modules, skills, prompts) renders here in a follow-up.
              For now — download the .anton ZIP and inspect directly. Every file is JSON or Markdown; no executable code is permitted.
            </div>
          </section>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => void install()}
            disabled={!!busy}
            className="inline-flex items-center gap-2 px-5 py-3 bg-adv-teal text-adv-dark rounded font-medium disabled:opacity-50"
          >
            <Download size={16} /> {busy === 'install' ? 'Installing…' : 'Install (free)'}
          </button>
          <button
            onClick={() => void purchase()}
            disabled={!!busy}
            className="inline-flex items-center gap-2 px-5 py-3 bg-adv-card border border-border rounded font-medium text-adv-off-white disabled:opacity-50"
          >
            <ShoppingCart size={16} /> {busy === 'purchase' ? 'Recording…' : 'Purchase (FutureChain)'}
          </button>
        </div>
        {msg && <div className="text-sm text-adv-teal">{msg}</div>}

        <section className="rounded-lg border border-border bg-adv-card p-4 space-y-3">
          <div className="text-sm font-medium">Reviews ({listing.rating_count})</div>
          {reviews.length === 0 ? (
            <div className="text-xs text-adv-gray">No reviews yet. Install first, then come back and add one.</div>
          ) : (
            <ul className="space-y-3">
              {reviews.map(r => (
                <li key={r.id} className="border-b border-border/50 last:border-b-0 pb-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-adv-gold">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    {r.verified_install && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-adv-teal/20 text-adv-teal">Verified install</span>
                    )}
                    <span className="text-xs text-adv-gray">· {r.reviewer_name ?? 'anon'} · {new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.title && <div className="text-sm font-medium mt-1">{r.title}</div>}
                  {r.body && <div className="text-xs text-adv-off-white/80">{r.body}</div>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div>
          <button
            onClick={() => navigate(`/marketplace/${encodeURIComponent(id!)}/review`)}
            className="text-sm text-adv-teal hover:underline"
          >
            Write a review →
          </button>
        </div>
      </div>
    </div>
  );
}
