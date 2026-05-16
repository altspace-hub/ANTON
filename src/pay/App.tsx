/**
 * App shell — state-machine routing, no react-router.
 *
 * Onboarding is a single step: Welcome (which creates the wallet) →
 * Done. A payments app is useless without a wallet, so — unlike the
 * Business app, which defers the wallet — Pay creates it up front.
 *
 * On mount, hasProfile() decides between resuming Home or starting
 * onboarding.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import WelcomeScreen from './pages/onboarding/WelcomeScreen';
import DoneScreen from './pages/onboarding/DoneScreen';
import HomeScreen from './pages/HomeScreen';
import ScanScreen from './pages/ScanScreen';
import ReviewScreen from './pages/ReviewScreen';
import PaymentDoneScreen from './pages/PaymentDoneScreen';
import HistoryScreen from './pages/HistoryScreen';
import SettingsScreen from './pages/settings/SettingsScreen';
import WalletScreen from './pages/settings/WalletScreen';
import { hasProfile } from './services/profile';
import type { DecodedPayment, PaymentRecord } from './services/types';

type Screen =
  | 'loading'
  | 'onboarding-welcome'
  | 'onboarding-done'
  | 'home'
  | 'scan'
  | 'review'
  | 'payment-done'
  | 'history'
  | 'settings'
  | 'settings-wallet';

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>('loading');
  const [pendingPayment, setPendingPayment] = useState<DecodedPayment | null>(null);
  const [lastRecord, setLastRecord] = useState<PaymentRecord | null>(null);
  const [newAddress, setNewAddress] = useState<string>('');

  useEffect(() => {
    (async () => {
      setScreen((await hasProfile()) ? 'home' : 'onboarding-welcome');
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
    return (
      <WelcomeScreen
        onWalletReady={(address) => {
          setNewAddress(address);
          setScreen('onboarding-done');
        }}
      />
    );
  }
  if (screen === 'onboarding-done') {
    return <DoneScreen address={newAddress} onContinue={() => setScreen('home')} />;
  }
  if (screen === 'home') {
    return (
      <HomeScreen
        onScan={() => setScreen('scan')}
        onHistory={() => setScreen('history')}
        onSettings={() => setScreen('settings')}
      />
    );
  }
  if (screen === 'scan') {
    return (
      <ScanScreen
        onBack={() => setScreen('home')}
        onDecoded={(payment) => {
          setPendingPayment(payment);
          setScreen('review');
        }}
      />
    );
  }
  if (screen === 'review') {
    if (!pendingPayment) {
      // Defensive — should never happen; bounce home.
      setScreen('home');
      return null;
    }
    return (
      <ReviewScreen
        payment={pendingPayment}
        onCancel={() => setScreen('home')}
        onConfirmed={(record) => {
          setLastRecord(record);
          setScreen('payment-done');
        }}
      />
    );
  }
  if (screen === 'payment-done') {
    if (!lastRecord) {
      setScreen('home');
      return null;
    }
    return (
      <PaymentDoneScreen
        record={lastRecord}
        onHome={() => setScreen('home')}
        onHistory={() => setScreen('history')}
      />
    );
  }
  if (screen === 'history') {
    return <HistoryScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setScreen('home')}
        onWallet={() => setScreen('settings-wallet')}
        onReset={() => setScreen('onboarding-welcome')}
      />
    );
  }
  if (screen === 'settings-wallet') {
    return <WalletScreen onBack={() => setScreen('settings')} />;
  }

  // Should never reach — all states above covered.
  return null;
}
