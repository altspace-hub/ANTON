// ── PublishPage.tsx ────────────────────────────────────────────────────────
// /marketplace/publish — publish a .anton bundle to the marketplace. v1
// reuses the existing MarketplacePage upload flow: the user uploads a
// .anton ZIP, we read the manifest, and the existing publishBundle
// endpoint handles persistence. This page is a thin navigator rather
// than a rebuild.

import { Link } from 'react-router-dom';
import { ExternalLink, Package, KeyRound, Gavel } from 'lucide-react';

export default function PublishPage() {
  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header className="flex items-center gap-3">
          <Package size={22} className="text-adv-teal" />
          <div>
            <h1 className="text-2xl font-semibold">Publish a bundle</h1>
            <p className="text-xs text-adv-gray">Your Ed25519 signature proves authorship. No third-party gatekeepers.</p>
          </div>
        </header>

        <ol className="space-y-4">
          <li className="rounded-lg border border-border bg-adv-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound size={16} className="text-adv-teal" /> 1. Create a publisher identity
            </div>
            <div className="text-xs text-adv-gray mt-2">
              Reuse your portal's Ed25519 keys, or generate a new signing key from Settings → Identity. The marketplace trusts signatures that match any key in the network's trust registry.
            </div>
          </li>

          <li className="rounded-lg border border-border bg-adv-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Package size={16} className="text-adv-teal" /> 2. Build the .anton bundle
            </div>
            <div className="text-xs text-adv-gray mt-2">
              Use the existing <Link to="/marketplace" className="text-adv-teal hover:underline">Marketplace upload</Link> flow — drag a .anton ZIP or use the <code>/api/anton/bundle</code> export endpoint. The bundle must declare its <code>bundle_type</code> and pass validation.
            </div>
          </li>

          <li className="rounded-lg border border-border bg-adv-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Gavel size={16} className="text-adv-teal" /> 3. Licence + pricing
            </div>
            <div className="text-xs text-adv-gray mt-2">
              Pick a licence (Apache 2.0 / MIT / CC-BY / proprietary). Set a price in FutureChain units, or leave at 0 for free. No fiat surface; no Stripe, no PayPal, no card entry.
            </div>
          </li>

          <li className="rounded-lg border border-adv-teal/40 bg-adv-teal/5 p-4">
            <div className="text-sm font-medium text-adv-teal">Ready to upload?</div>
            <div className="text-xs text-adv-gray mt-2">
              Head to the existing marketplace upload surface. The full publish-with-FutureChain-pricing flow wires into that page as a follow-up.
            </div>
            <Link
              to="/marketplace"
              className="inline-flex items-center gap-1 mt-3 px-4 py-2 bg-adv-teal text-adv-dark rounded text-sm font-medium"
            >
              Go to upload <ExternalLink size={14} />
            </Link>
          </li>
        </ol>
      </div>
    </div>
  );
}
