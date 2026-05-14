/**
 * HomeScreen — main hub.
 *
 * v0 placeholder: shows the configured business name + the two mode
 * buttons (Simple / Extended). The actual sale flows land in tasks
 * #5 and #6; for now tapping them sets state which gets reflected
 * back in a not-yet-built screen.
 */
import { useEffect, useState } from 'react';
import { loadConfig } from '../services/merchant';
import type { MerchantConfig } from '../services/types';

interface Props {
  onSimple: () => void;
  onExtended: () => void;
  onSettings: () => void;
}

export default function HomeScreen({ onSimple, onExtended, onSettings }: Props) {
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {config?.legalName ?? 'ANTON Business'}
          </h2>
          {config && (
            <p className="mono text-xs mt-1" style={{ color: 'var(--color-text-faint)' }}>
              {config.orgNr}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onSettings}
          className="p-2 -mr-2 rounded-lg"
          aria-label="Settings"
        >
          <span style={{ color: 'var(--color-text-muted)' }} className="text-2xl">⚙</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 mt-8">
        <button
          type="button"
          onClick={onSimple}
          className="text-left p-5 rounded-xl"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <div className="text-xl font-semibold" style={{ color: 'var(--color-accent)' }}>
            Simple sale
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Enter an amount → show QR → kvitto.
          </div>
        </button>

        <button
          type="button"
          onClick={onExtended}
          className="text-left p-5 rounded-xl"
          style={{ backgroundColor: 'var(--color-surface)' }}
        >
          <div className="text-xl font-semibold" style={{ color: 'var(--color-accent)' }}>
            Extended sale
          </div>
          <div className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Cart + line items + VAT breakdown.
          </div>
        </button>
      </div>

      <div className="mt-auto text-center text-xs" style={{ color: 'var(--color-text-faint)' }}>
        ANTON Business v0.0.1 · phone-only
      </div>
    </div>
  );
}
