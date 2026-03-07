import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { EntityIntelligencePanel } from '../components/data/EntityIntelligencePanel';

export default function EntityIntelligencePage() {
  const [params] = useSearchParams();
  const initialQuery = params.get('q') ?? '';

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal/10 border border-adv-teal/20">
            <Zap className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Entity Intelligence</h1>
            <p className="text-xs text-adv-gray">Roaring (Nordic registry) + Dow Jones (global screening) — combined risk view</p>
          </div>
        </div>

        <div className="rounded-xl border border-adv-dark/50 bg-adv-card p-5">
          <EntityIntelligencePanel
            initialQuery={initialQuery}
            onContextInjected={(text) => {
              navigator.clipboard.writeText(text).then(() => {
                alert('Entity context copied to clipboard. Paste into any ANTON session.');
              }).catch(() => {
                console.log(text);
              });
            }}
          />
        </div>

        <div className="rounded-lg border border-adv-dark/30 bg-adv-dark/20 px-4 py-3 text-xs text-adv-gray">
          This panel combines <span className="text-adv-teal">Roaring</span> (Swedish company registry, UBO chains, sanctions) and{' '}
          <span className="text-adv-blue">Dow Jones R&C</span> (global sanctions, 1.4M+ PEPs, adverse media) into a single risk view.
          Use the "Inject into session" button to push entity intelligence into any active ANTON session.
        </div>
      </div>
    </div>
  );
}
