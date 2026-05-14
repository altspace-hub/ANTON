/**
 * WelcomeScreen — onboarding step 1.
 * Same content as the original Expo welcome.tsx; HTML + Tailwind.
 */
import PrimaryButton from '../../components/PrimaryButton';

const BULLETS = [
  'Generate a merchant wallet on this device',
  'Register with FutureChain after KYB',
  'Take FTC payments via QR',
  'Auto-convert to SEK via Safello',
];

export default function WelcomeScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <h1 className="text-3xl font-bold mt-6" style={{ color: 'var(--color-accent)' }}>
        ANTON Business
      </h1>
      <p className="mt-2 mb-8 text-base" style={{ color: 'var(--color-text-muted)' }}>
        Accept FTC payments. Settle to your bank.
      </p>

      <ul className="flex flex-col gap-3.5 mb-auto">
        {BULLETS.map((b) => (
          <li key={b} className="flex gap-3">
            <span style={{ color: 'var(--color-accent)' }} className="text-lg leading-snug">•</span>
            <span style={{ color: 'var(--color-text)' }} className="text-base leading-snug flex-1">{b}</span>
          </li>
        ))}
      </ul>

      <PrimaryButton onClick={onContinue}>Get started</PrimaryButton>

      <p className="text-center text-xs mt-4" style={{ color: 'var(--color-text-faint)' }}>
        Already onboarded? Tap Get started to recover from your seed.
      </p>
    </div>
  );
}
