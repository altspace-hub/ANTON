/**
 * ModeChoiceScreen — onboarding step 2 of 4 (pick Simple or Extended).
 *
 * Runs BEFORE the business-details form so the rest of onboarding
 * can adapt: Extended adds an items-setup step, Simple skips it.
 * The choice is stored on the merchant config as defaultMode; it
 * can still be changed per-sale from Home.
 */
import type { SaleMode } from '../../services/types';
import PrimaryButton from '../../components/PrimaryButton';
import { useState } from 'react';

interface Props {
  onContinue: (mode: SaleMode) => void;
  initial?: SaleMode;
}

export default function ModeChoiceScreen({ onContinue, initial = 'simple' }: Props) {
  const [mode, setMode] = useState<SaleMode>(initial);

  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <h2 className="text-2xl font-bold mt-4 mb-2"
          style={{ color: 'var(--color-text)' }}>
        How do you sell?
      </h2>
      <p className="text-sm mb-6"
         style={{ color: 'var(--color-text-muted)' }}>
        You can change this later. We use it to set up your default
        sale screen.
      </p>

      <div className="flex flex-col gap-3 mb-auto">
        <ModeCard
          title="Simple"
          subtitle="One amount per sale."
          body="Tap a price on the keypad, show a kvitto, done. Best for street stalls, kiosks, or one-product sales."
          active={mode === 'simple'}
          onClick={() => setMode('simple')}
        />
        <ModeCard
          title="Extended"
          subtitle="Cart with line items."
          body="Add items from a catalogue, automatic VAT breakdown across rates, optional discount. Best for cafés, restaurants, retail."
          active={mode === 'extended'}
          onClick={() => setMode('extended')}
        />
      </div>

      <PrimaryButton onClick={() => onContinue(mode)}>Continue</PrimaryButton>
    </div>
  );
}

function ModeCard({
  title, subtitle, body, active, onClick,
}: { title: string; subtitle: string; body: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-5 rounded-xl transition-colors"
      style={{
        backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-surface)',
        border: `2px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
      }}
    >
      <div className="flex justify-between items-start">
        <div className="text-xl font-bold"
             style={{ color: active ? 'var(--color-accent)' : 'var(--color-text)' }}>
          {title}
        </div>
        <div className="text-xs uppercase tracking-wider"
             style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-faint)' }}>
          {active ? '● Selected' : 'Tap to pick'}
        </div>
      </div>
      <div className="text-sm mt-1 mb-2 font-medium"
           style={{ color: 'var(--color-text-body)' }}>
        {subtitle}
      </div>
      <div className="text-sm leading-snug"
           style={{ color: 'var(--color-text-muted)' }}>
        {body}
      </div>
    </button>
  );
}
