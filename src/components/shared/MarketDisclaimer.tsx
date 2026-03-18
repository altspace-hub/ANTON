import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface MarketDisclaimerProps {
  compact?: boolean;
}

export default function MarketDisclaimer({ compact = false }: MarketDisclaimerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed && compact) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-adv-gold/30 bg-adv-gold/5 px-3 py-2 text-xs text-adv-gold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>Research tool only — not financial advice. No real trades executed.</span>
        <button
          onClick={() => setDismissed(true)}
          className="ml-auto text-adv-gray hover:text-adv-off-white transition-colors"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-adv-gold mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-adv-gold">Important Disclaimer</h4>
          <p className="mt-1 text-xs text-adv-gray leading-relaxed">
            ANTON Markets is a <strong className="text-adv-off-white">research and intelligence tool</strong> — it does not provide financial advice,
            execute real trades, or manage real money. All indexes are paper-traded. All predictions are for research purposes only.
            Past performance does not indicate future results. Always consult qualified financial professionals before making investment decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
