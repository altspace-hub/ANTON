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
import BackupShowScreen from './pages/onboarding/BackupShowScreen';
import BackupVerifyScreen from './pages/onboarding/BackupVerifyScreen';
import DoneScreen from './pages/onboarding/DoneScreen';
import HomeScreen from './pages/HomeScreen';
import ScanScreen from './pages/ScanScreen';
import ReviewScreen from './pages/ReviewScreen';
import PaymentDoneScreen from './pages/PaymentDoneScreen';
import HistoryScreen from './pages/HistoryScreen';
import SettingsScreen from './pages/settings/SettingsScreen';
import WalletScreen from './pages/settings/WalletScreen';
import PaymentDetailsScreen from './pages/settings/PaymentDetailsScreen';
import MoneyProfileScreen from './pages/settings/MoneyProfileScreen';
import ActivityReviewScreen from './pages/settings/ActivityReviewScreen';
import RecoveryPhraseScreen from './pages/settings/RecoveryPhraseScreen';
import RestoreScreen from './pages/settings/RestoreScreen';
import { hasProfile } from './services/profile';
import type { DecodedPayment, PaymentRecord } from './services/types';

type Screen =
  | 'loading'
  | 'onboarding-welcome'
  | 'onboarding-backup-show'
  | 'onboarding-backup-verify'
  | 'onboarding-done'
  | 'home'
  | 'scan'
  | 'review'
  | 'payment-done'
  | 'history'
  | 'settings'
  | 'settings-wallet'
  | 'settings-payment'
  | 'settings-money'
  | 'settings-activity'
  | 'settings-recovery'
  | 'settings-restore';

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
          setScreen('onboarding-backup-show');
        }}
      />
    );
  }
  if (screen === 'onboarding-backup-show') {
    return <BackupShowScreen onContinue={() => setScreen('onboarding-backup-verify')} />;
  }
  if (screen === 'onboarding-backup-verify') {
    return (
      <BackupVerifyScreen
        onBack={() => setScreen('onboarding-backup-show')}
        onVerified={() => setScreen('onboarding-done')}
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
        onPaymentDetails={() => setScreen('settings-payment')}
        onMoneyProfile={() => setScreen('settings-money')}
        onActivityReview={() => setScreen('settings-activity')}
        onRecoveryPhrase={() => setScreen('settings-recovery')}
        onRestore={() => setScreen('settings-restore')}
        onReset={() => setScreen('onboarding-welcome')}
      />
    );
  }
  if (screen === 'settings-wallet') {
    return <WalletScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-payment') {
    return <PaymentDetailsScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-money') {
    return <MoneyProfileScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-activity') {
    return <ActivityReviewScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-recovery') {
    return <RecoveryPhraseScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-restore') {
    return (
      <RestoreScreen
        onBack={() => setScreen('settings')}
        onRestored={(address) => {
          setNewAddress(address);
          setScreen('onboarding-done');
        }}
      />
    );
  }

  // Should never reach — all states above covered.
  return null;
}
