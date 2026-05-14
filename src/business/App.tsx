/**
 * App shell — state-machine routing, no react-router.
 *
 * On mount we check whether a merchant config exists. If yes → home;
 * if no → onboarding/welcome. Inside onboarding, each step calls
 * onContinue() to advance. The Simple/Extended sale flows + Settings
 * arrive as new states in the follow-on tasks.
 */
import { useEffect, useState } from 'react';
import HomeScreen from './pages/HomeScreen';
import WelcomeScreen from './pages/onboarding/WelcomeScreen';
import GenerateScreen from './pages/onboarding/GenerateScreen';
import RegisterScreen from './pages/onboarding/RegisterScreen';
import DoneScreen from './pages/onboarding/DoneScreen';
import { hasConfig } from './services/merchant';

type Screen =
  | 'loading'
  | 'onboarding-welcome'
  | 'onboarding-generate'
  | 'onboarding-register'
  | 'onboarding-done'
  | 'home'
  | 'simple'      // task #5
  | 'extended'    // task #6
  | 'settings';   // task #7

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');

  useEffect(() => {
    // Configured merchant → straight to home. Otherwise start onboarding.
    // hasConfig() probes secure-store; in dev the tier resolution adds
    // ~50ms before it answers.
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
    return <WelcomeScreen onContinue={() => setScreen('onboarding-generate')} />;
  }
  if (screen === 'onboarding-generate') {
    return <GenerateScreen onContinue={() => setScreen('onboarding-register')} />;
  }
  if (screen === 'onboarding-register') {
    return <RegisterScreen onContinue={() => setScreen('onboarding-done')} />;
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

  // Sale + Settings screens land in tasks #5–#7. Until then, fall back
  // to a "Coming soon" stub so the navigation still feels alive.
  return (
    <div className="flex flex-col h-full p-6 safe-top safe-bottom"
         style={{ backgroundColor: 'var(--color-bg)' }}>
      <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text)' }}>Coming soon</h2>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        The <strong>{screen}</strong> screen is not built yet. The
        underlying services are wired — it&apos;s just the UI that
        comes in the next port phase.
      </p>
      <button
        type="button"
        onClick={() => setScreen('home')}
        className="self-start px-4 py-2 rounded-lg"
        style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)' }}
      >
        ← Back home
      </button>
    </div>
  );
}
