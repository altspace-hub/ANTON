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
import { useTranslation } from 'react-i18next';
import HomeScreen from './pages/HomeScreen';
import SimpleScreen from './pages/SimpleScreen';
import ExtendedScreen from './pages/ExtendedScreen';
import WelcomeScreen from './pages/onboarding/WelcomeScreen';
import ModeChoiceScreen from './pages/onboarding/ModeChoiceScreen';
import RegisterScreen from './pages/onboarding/RegisterScreen';
import ItemsSetupScreen from './pages/onboarding/ItemsSetupScreen';
import DoneScreen from './pages/onboarding/DoneScreen';
import SettingsScreen from './pages/settings/SettingsScreen';
import ConnectWalletScreen from './pages/settings/ConnectWalletScreen';
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
  | 'simple'
  | 'extended'
  | 'settings'
  | 'settings-wallet';

export default function App() {
  const { t } = useTranslation();
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
        <div className="text-sm" style={{ color: 'var(--color-text-faint)' }}>{t('common.loading')}</div>
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
  if (screen === 'simple') {
    return <SimpleScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'extended') {
    return <ExtendedScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setScreen('home')}
        onConnectWallet={() => setScreen('settings-wallet')}
        onReset={() => {
          setPendingMode('simple');
          setScreen('onboarding-welcome');
        }}
      />
    );
  }
  if (screen === 'settings-wallet') {
    return <ConnectWalletScreen onBack={() => setScreen('settings')} />;
  }

  // Should never reach — all states above covered.
  return null;
}
