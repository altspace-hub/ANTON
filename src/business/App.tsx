/**
 * App shell — state-machine routing, no react-router.
 *
 * Onboarding order: Welcome → Mode choice → Business details →
 * (if Extended) Items → Done. Wallet generation is intentionally
 * NOT here; it lives in Settings → Connect wallet, post-onboarding.
 * This lets the merchant configure the app and try the sale flow
 * before committing to crypto.
 *
 * On mount, hasConfig() decides between resuming Home or starting
 * onboarding-welcome.
 */
import { useEffect, useState } from 'react';
import HomeScreen from './pages/HomeScreen';
import WelcomeScreen from './pages/onboarding/WelcomeScreen';
import ModeChoiceScreen from './pages/onboarding/ModeChoiceScreen';
import RegisterScreen from './pages/onboarding/RegisterScreen';
import ItemsSetupScreen from './pages/onboarding/ItemsSetupScreen';
import DoneScreen from './pages/onboarding/DoneScreen';
import { hasConfig } from './services/merchant';
import type { SaleMode } from './services/types';

type Screen =
  | 'loading'
  | 'onboarding-welcome'
  | 'onboarding-mode'
  | 'onboarding-register'
  | 'onboarding-items'
  | 'onboarding-done'
  | 'home'
  | 'simple'      // task #5
  | 'extended'    // task #6
  | 'settings';   // task #7

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [pendingMode, setPendingMode] = useState<SaleMode>('simple');

  useEffect(() => {
    (async () => {
      setScreen((await hasConfig()) ? 'home' : 'onboarding-welcome');
    })();
  }, []);

  if (screen === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        <div className="text-sm" style={{ color: 'var(--color-text-faint)' }}>Loading…</div>
      </div>
    );
  }

  if (screen === 'onboarding-welcome') {
    return <WelcomeScreen onContinue={() => setScreen('onboarding-mode')} />;
  }
  if (screen === 'onboarding-mode') {
    return (
      <ModeChoiceScreen
        initial={pendingMode}
        onContinue={(mode) => {
          setPendingMode(mode);
          setScreen('onboarding-register');
        }}
      />
    );
  }
  if (screen === 'onboarding-register') {
    return (
      <RegisterScreen
        pendingMode={pendingMode}
        onContinue={() =>
          setScreen(pendingMode === 'extended' ? 'onboarding-items' : 'onboarding-done')
        }
      />
    );
  }
  if (screen === 'onboarding-items') {
    return <ItemsSetupScreen onContinue={() => setScreen('onboarding-done')} />;
  }
  if (screen === 'onboarding-done') {
    return <DoneScreen onContinue={() => setScreen('home')} />;
  }
  if (screen === 'home') {
    return (
      <HomeScreen
        onSimple={() => setScreen('simple')}
        onExtended={() => setScreen('extended')}
        onSettings={() => setScreen('settings')}
      />
    );
  }

  // Sale + Settings screens land in tasks #5–#7.
  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>
        Coming soon
      </h2>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        The <strong>{screen}</strong> screen is not built yet. The
        services are wired — only the UI is pending.
      </p>
      <button
        type="button"
        onClick={() => setScreen('home')}
        className="self-start px-4 py-2 rounded-lg"
        style={{
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      >
        ← Back home
      </button>
    </div>
  );
}
