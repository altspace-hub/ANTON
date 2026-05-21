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
import ReceiveScreen from './pages/ReceiveScreen';
import SettingsScreen from './pages/settings/SettingsScreen';
import WalletScreen from './pages/settings/WalletScreen';
import WalletsListScreen from './pages/settings/WalletsListScreen';
import WalletDetailScreen from './pages/settings/WalletDetailScreen';
import AddWalletScreen from './pages/settings/AddWalletScreen';
import PaymentDetailsScreen from './pages/settings/PaymentDetailsScreen';
import MoneyProfileScreen from './pages/settings/MoneyProfileScreen';
import ActivityReviewScreen from './pages/settings/ActivityReviewScreen';
import RecoveryPhraseScreen from './pages/settings/RecoveryPhraseScreen';
import RestoreScreen from './pages/settings/RestoreScreen';
import RpcEndpointScreen from './pages/settings/RpcEndpointScreen';
import { hasProfile } from './services/profile';
import { maybeRunIdlePoll, runOneShotPoll } from './services/idle-poller';
import { listReceived } from './services/received';
import { notifyIncoming, ensureNotificationPermission } from './services/notifications';
import type { DecodedPayment, PaymentRecord } from './services/types';

type Screen =
  | 'loading'
  | 'onboarding-welcome'
  | 'onboarding-backup-show'
  | 'onboarding-backup-verify'
  | 'onboarding-done'
  | 'home'
  | 'scan'
  | 'receive'
  | 'review'
  | 'payment-done'
  | 'history'
  | 'settings'
  | 'settings-wallet'
  | 'settings-wallets-list'
  | 'settings-wallet-detail'
  | 'settings-wallet-add'
  | 'settings-wallet-add-backup-show'
  | 'settings-wallet-add-backup-verify'
  | 'settings-payment'
  | 'settings-money'
  | 'settings-activity'
  | 'settings-recovery'
  | 'settings-restore'
  | 'settings-rpc';

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>('loading');
  const [pendingPayment, setPendingPayment] = useState<DecodedPayment | null>(null);
  const [lastRecord, setLastRecord] = useState<PaymentRecord | null>(null);
  const [newAddress, setNewAddress] = useState<string>('');
  /** Wallet id whose detail screen is being viewed (Settings → Wallets → row). */
  const [detailWalletId, setDetailWalletId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setScreen((await hasProfile()) ? 'home' : 'onboarding-welcome');
    })();
  }, []);

  /**
   * Polling strategy (redesigned 2026-05-21 based on industry research):
   *
   * 1. The always-on 30 s timer is gone — Coinbase's engineering blog
   *    explicitly calls that an anti-pattern (perf review, 2024) and
   *    no production wallet (Phantom, MetaMask, BlueWallet, Muun)
   *    runs a foreground timer. They use WebSocket / SSE subscriptions
   *    or push notifications instead.
   *
   * 2. The new floor is the idle poller in services/idle-poller.ts:
   *    a once-per-day opportunistic poll fired when the app comes to
   *    the foreground IF more than 20 h have passed since the last
   *    successful poll. The chosen hour is per-install random so
   *    server-side load distributes naturally.
   *
   * 3. Each wallet/activity screen does a one-shot sync on mount and
   *    offers pull-to-refresh + a "Sync now" button (HomeScreen).
   *    Hot anticipation polling (the moment the user actually expects
   *    a payment) is the responsibility of services/active-sync.ts —
   *    bounded backoff over a 5 min budget (10 min for merchant QR).
   *
   * Permission prompt fires once on mount and is cached.
   */
  useEffect(() => {
    let cancelled = false;
    void ensureNotificationPermission();

    // One-shot poll on app open. Idle floor: if >20h since last run,
    // ALSO bump last-run timestamp so the daily counter resets.
    const onForeground = async () => {
      const fresh = await maybeRunIdlePoll() ?? 0;
      if (cancelled || fresh === 0) return;
      // Notify the user for each fresh inbound row we just observed.
      // The records themselves live in IDB; pull them out.
      const all = await listReceived();
      // Best-effort: take the freshest N records up to the count we
      // know is fresh — receivedAt ordering matches IDB key order.
      for (const r of all.slice(0, fresh)) void notifyIncoming(r);
    };

    void onForeground();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void onForeground();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
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
        onReceive={() => setScreen('receive')}
        onHistory={() => setScreen('history')}
        onSettings={() => setScreen('settings')}
      />
    );
  }
  if (screen === 'receive') {
    return <ReceiveScreen onBack={() => setScreen('home')} />;
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
        onWalletsList={() => setScreen('settings-wallets-list')}
        onPaymentDetails={() => setScreen('settings-payment')}
        onMoneyProfile={() => setScreen('settings-money')}
        onActivityReview={() => setScreen('settings-activity')}
        onRecoveryPhrase={() => setScreen('settings-recovery')}
        onRestore={() => setScreen('settings-restore')}
        onRpcEndpoint={() => setScreen('settings-rpc')}
        onReset={() => setScreen('onboarding-welcome')}
      />
    );
  }
  if (screen === 'settings-wallet') {
    return <WalletScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-wallets-list') {
    return (
      <WalletsListScreen
        onBack={() => setScreen('settings')}
        onAddWallet={() => setScreen('settings-wallet-add')}
        onOpenWallet={(id) => { setDetailWalletId(id); setScreen('settings-wallet-detail'); }}
      />
    );
  }
  if (screen === 'settings-wallet-detail') {
    return (
      <WalletDetailScreen
        walletId={detailWalletId}
        onBack={() => setScreen('settings-wallets-list')}
        onDeleted={() => setScreen('settings-wallets-list')}
      />
    );
  }
  if (screen === 'settings-wallet-add') {
    return (
      <AddWalletScreen
        onBack={() => setScreen('settings-wallets-list')}
        onCreated={() => setScreen('settings-wallet-add-backup-show')}
        onImported={() => setScreen('settings-wallets-list')}
      />
    );
  }
  if (screen === 'settings-wallet-add-backup-show') {
    return (
      <BackupShowScreen
        onContinue={() => setScreen('settings-wallet-add-backup-verify')}
      />
    );
  }
  if (screen === 'settings-wallet-add-backup-verify') {
    return (
      <BackupVerifyScreen
        onBack={() => setScreen('settings-wallet-add-backup-show')}
        onVerified={() => setScreen('settings-wallets-list')}
      />
    );
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
  if (screen === 'settings-rpc') {
    return <RpcEndpointScreen onBack={() => setScreen('settings')} />;
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
