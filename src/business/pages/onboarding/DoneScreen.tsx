/**
 * DoneScreen — onboarding step 4 (confirmation).
 * Shows the saved merchant identity. Tapping "Go home" lands on the
 * main hub.
 */
import { useEffect, useState } from 'react';
import PrimaryButton from '../../components/PrimaryButton';
import { loadConfig } from '../../services/merchant';
import type { MerchantConfig } from '../../services/types';

export default function DoneScreen({ onContinue }: { onContinue: () => void }) {
  const [config, setConfig] = useState<MerchantConfig | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  return (
    <div className="flex flex-col h-full p-6 items-center safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="text-[80px] leading-none mt-8 mb-2"
           style={{ color: 'var(--color-accent)' }}>✓</div>
      <h2 className="text-[26px] font-bold mb-6" style={{ color: 'var(--color-text)' }}>
        You&apos;re set up
      </h2>

      {config && (
        <div className="w-full p-4 rounded-lg mb-6"
             style={{ backgroundColor: 'var(--color-surface)' }}>
          <div className="uppercase tracking-wider text-xs mb-1.5"
               style={{ color: 'var(--color-text-faint)' }}>
            Business
          </div>
          <div className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
            {config.legalName}
          </div>
          <div className="mono text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            {config.orgNr}
          </div>
        </div>
      )}

      <p className="text-[15px] leading-snug self-start whitespace-pre-line"
         style={{ color: 'var(--color-text-muted)' }}>
        {`Coming next:
• Simple-mode keypad → QR
• Extended-mode item catalogue
• Receipt rendering + share
• Refunds`}
      </p>

      <div className="w-full mt-auto">
        <PrimaryButton onClick={onContinue}>Go home</PrimaryButton>
      </div>
    </div>
  );
}
