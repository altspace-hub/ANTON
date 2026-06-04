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
import { useEffect, useRef, useState } from 'react';
import { syncRegisteredAddresses } from './services/wallets';
import { useTranslation } from 'react-i18next';
import WelcomeScreen from './pages/onboarding/WelcomeScreen';
import BackupShowScreen from './pages/onboarding/BackupShowScreen';
import BackupVerifyScreen from './pages/onboarding/BackupVerifyScreen';
import OnboardingContextScreen from './pages/onboarding/OnboardingContextScreen';
import DoneScreen from './pages/onboarding/DoneScreen';
import HomeScreen from './pages/HomeScreen';
import ScanScreen from './pages/ScanScreen';
import RecipientPickerScreen from './pages/RecipientPickerScreen';
import SendComposeScreen from './pages/SendComposeScreen';
import ReviewScreen from './pages/ReviewScreen';
import PaymentDoneScreen from './pages/PaymentDoneScreen';
import HistoryScreen from './pages/HistoryScreen';
import PaymentDetailScreen from './pages/PaymentDetailScreen';
import AgentActivityScreen from './pages/AgentActivityScreen';
import ReceiveScreen from './pages/ReceiveScreen';
import SettingsScreen from './pages/settings/SettingsScreen';
import WalletScreen from './pages/settings/WalletScreen';
import WalletsListScreen from './pages/settings/WalletsListScreen';
import WalletDetailScreen from './pages/settings/WalletDetailScreen';
import AddWalletScreen from './pages/settings/AddWalletScreen';
import PaymentDetailsScreen from './pages/settings/PaymentDetailsScreen';
import TaxResidencyScreen from './pages/settings/TaxResidencyScreen';
import TaxPositionScreen from './pages/settings/TaxPositionScreen';
import TaxReportScreen from './pages/settings/TaxReportScreen';
import FriendsScreen from './pages/settings/FriendsScreen';
import MoneyProfileScreen from './pages/settings/MoneyProfileScreen';
import ActivityReviewScreen from './pages/settings/ActivityReviewScreen';
import RecoveryPhraseScreen from './pages/settings/RecoveryPhraseScreen';
import RestoreScreen from './pages/settings/RestoreScreen';
import RpcEndpointScreen from './pages/settings/RpcEndpointScreen';
import WalletPassphraseScreen from './pages/settings/WalletPassphraseScreen';
import ScheduledPaymentsScreen from './pages/settings/ScheduledPaymentsScreen';
import AddScheduleScreen from './pages/settings/AddScheduleScreen';
import LockScreen from './components/LockScreen';
import { isAppLockEnabled, APP_LOCK_GRACE_MS } from './services/app-lock';
import { useAndroidBackButton, type AppBackResult } from './hooks/useAndroidBackButton';
import { hasProfile } from './services/profile';
import { maybeRunIdlePoll, runOneShotPoll } from './services/idle-poller';
import { reconcileScheduleNotifications, getSchedule, recordFire } from './services/schedules';
import { scheduleToDecodedPayment } from './services/schedule-to-payment';
import { listReceived } from './services/received';
import { notifyIncoming, ensureNotificationPermission } from './services/notifications';
import { ensureBackgroundPollingEnabled, bgSyncSeen } from './services/background-setup';
import { listPayments } from './services/payment';
import { listContacts, buildContactNameMap } from './services/address-book';
import type { Recipient } from './services/recipients';
import type { Activity, DecodedPayment, PaymentRecord } from './services/types';

type Screen =
  | 'loading'
  | 'onboarding-welcome'
  | 'onboarding-backup-show'
  | 'onboarding-backup-verify'
  | 'onboarding-context'
  | 'onboarding-done'
  | 'home'
  | 'scan'
  | 'send'
  | 'send-compose'
  | 'receive'
  | 'review'
  | 'payment-done'
  | 'history'
  | 'agent-activity'
  | 'payment-detail'
  | 'settings'
  | 'settings-wallet'
  | 'settings-wallets-list'
  | 'settings-wallet-detail'
  | 'settings-wallet-add'
  | 'settings-wallet-add-backup-show'
  | 'settings-wallet-add-backup-verify'
  | 'settings-payment'
  | 'settings-tax'
  | 'settings-tax-position'
  | 'settings-tax-report'
  | 'settings-friends'
  | 'settings-money'
  | 'settings-activity'
  | 'settings-recovery'
  | 'settings-restore'
  | 'settings-rpc'
  | 'settings-schedules'
  | 'settings-schedules-add'
  | 'settings-passphrase';

/** Where the Android hardware back button steps to from each screen.
 *  A screen absent from this map (home, the onboarding entry, the
 *  done celebration) has no parent — back there exits the app.
 *  `review` is handled separately so it can also clear the in-flight
 *  scheduled-payment id. */
const BACK_PARENT: Partial<Record<Screen, Screen>> = {
  'onboarding-backup-show': 'onboarding-welcome',
  'onboarding-backup-verify': 'onboarding-backup-show',
  'onboarding-context': 'onboarding-backup-verify',
  'scan': 'home',
  'send': 'home',
  'send-compose': 'send',
  'receive': 'home',
  'payment-done': 'home',
  'history': 'home',
  'agent-activity': 'home',
  'payment-detail': 'history',
  'settings': 'home',
  'settings-wallet': 'settings',
  'settings-wallets-list': 'settings',
  'settings-wallet-detail': 'settings-wallets-list',
  'settings-wallet-add': 'settings-wallets-list',
  'settings-wallet-add-backup-show': 'settings-wallet-add',
  'settings-wallet-add-backup-verify': 'settings-wallet-add-backup-show',
  'settings-payment': 'settings',
  'settings-tax': 'settings',
  'settings-tax-position': 'settings',
  'settings-tax-report': 'settings-tax-position',
  'settings-friends': 'settings',
  'settings-money': 'settings',
  'settings-activity': 'settings',
  'settings-recovery': 'settings',
  'settings-restore': 'settings',
  'settings-rpc': 'settings',
  'settings-schedules': 'settings',
  'settings-schedules-add': 'settings-schedules',
  'settings-passphrase': 'settings',
};

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>('loading');
  const [pendingPayment, setPendingPayment] = useState<DecodedPayment | null>(null);
  const [lastRecord, setLastRecord] = useState<PaymentRecord | null>(null);
  const [newAddress, setNewAddress] = useState<string>('');
  /** Wallet id whose detail screen is being viewed (Settings → Wallets → row). */
  const [detailWalletId, setDetailWalletId] = useState<string>('');
  /** Activity row whose full-screen detail is being viewed (History → row). */
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  /** #89 — recipient chosen in the Send picker (null = pay a new address). */
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  /** address → friend-label map, rebuilt each time a detail row opens so
   *  the detail screen resolves the latest contact names. */
  const [detailContactNames, setDetailContactNames] = useState<Record<string, string>>({});
  /** When a scheduled-payment notification tap routes the user to
   *  Review, this carries the originating schedule id so onConfirmed
   *  can call recordFire() to roll the schedule forward. null
   *  outside the scheduled-payment flow (regular QR scans). */
  const [firingScheduleId, setFiringScheduleId] = useState<string | null>(null);
  /** App-open biometric lock — starts locked when the user enabled it. */
  const [locked, setLocked] = useState<boolean>(() => isAppLockEnabled());
  const hiddenAtRef = useRef<number>(0);

  useEffect(() => {
    (async () => {
      setScreen((await hasProfile()) ? 'home' : 'onboarding-welcome');
    })();
  }, []);

  // Best-effort retry of any wallet registrations that didn't go
  // through earlier (e.g. Bahnhof unreachable at create-time). The
  // server endpoint is idempotent on (install_id × fc_address);
  // syncRegisteredAddresses skips wallets that already have
  // `registeredAt` set, so this is a cheap no-op when everything is
  // in sync.
  useEffect(() => {
    void syncRegisteredAddresses();
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
    // Phase 2 — schedule the on-device WorkManager background payment poll for
    // this wallet (notifies on incoming payments while backgrounded/killed).
    // No-op on web. Idempotent.
    void ensureBackgroundPollingEnabled();

    // One-shot poll on app open. Idle floor: if >20h since last run,
    // ALSO bump last-run timestamp so the daily counter resets.
    const onForeground = async () => {
      const fresh = await maybeRunIdlePoll() ?? 0;
      // Keep the background worker's "seen" set current with everything the
      // foreground knows (sends + receives) so it never notifies for our own
      // change outputs nor double-notifies a payment we already surfaced.
      void (async () => {
        try {
          const [recv, sent] = await Promise.all([listReceived(), listPayments().catch(() => [])]);
          const ids = [
            ...recv.map((r) => r.txId),
            ...sent.map((p) => p.txId),
          ].filter((x): x is string => typeof x === 'string' && x.length > 0);
          await bgSyncSeen(ids);
        } catch { /* best-effort */ }
      })();
      if (cancelled || fresh === 0) return;
      // Notify the user for each fresh inbound row we just observed.
      // The records themselves live in IDB; pull them out.
      const all = await listReceived();
      // Best-effort: take the freshest N records up to the count we
      // know is fresh — receivedAt ordering matches IDB key order.
      for (const r of all.slice(0, fresh)) void notifyIncoming(r);
    };

    void onForeground();
    // Re-arm scheduled-payment notifications on every foreground so a
    // fresh install or OS-cleared notification state recovers itself.
    void reconcileScheduleNotifications();

    // Scheduled-payment tap handler. When the user taps a recurring-
    // payment reminder, the OS launches/foregrounds the app and fires
    // 'localNotificationActionPerformed' with our `extra.scheduleId`.
    // Synthesize a DecodedPayment from the schedule + push to Review.
    let unlistenSchedule: (() => void) | null = null;
    void (async () => {
      try {
        const mod = await import('@capacitor/local-notifications');
        const handle = await mod.LocalNotifications.addListener(
          'localNotificationActionPerformed',
          async (action) => {
            const scheduleId =
              (action.notification?.extra as { scheduleId?: string } | undefined)?.scheduleId;
            if (!scheduleId) return;
            const schedule = await getSchedule(scheduleId);
            if (!schedule || !schedule.active) return;
            const decoded = scheduleToDecodedPayment(schedule);
            setPendingPayment(decoded);
            setFiringScheduleId(scheduleId);
            setScreen('review');
          },
        );
        unlistenSchedule = () => { void handle.remove(); };
      } catch { /* plugin unavailable on web — silent */ }
    })();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void onForeground();
        if (isAppLockEnabled() && hiddenAtRef.current > 0
            && Date.now() - hiddenAtRef.current > APP_LOCK_GRACE_MS) {
          setLocked(true);
        }
        hiddenAtRef.current = 0;
      } else {
        hiddenAtRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      unlistenSchedule?.();
    };
  }, []);

  // Android hardware back button — step to the current screen's parent,
  // or fall through to the double-press-to-exit prompt at a root screen.
  useAndroidBackButton({
    onBack(): AppBackResult {
      // Behind the lock gate there is nothing to navigate — exit.
      if (locked) return 'exit';
      // Review carries an in-flight scheduled-payment id; clear it so a
      // back-out doesn't leave the next manual scan rolling a schedule.
      if (screen === 'review') {
        setFiringScheduleId(null);
        setScreen('home');
        return 'handled';
      }
      const parent = BACK_PARENT[screen];
      if (parent) { setScreen(parent); return 'handled'; }
      return 'exit';
    },
  });

  // App-open lock — biometric gate over the whole UI when enabled.
  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} />;
  }

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
        onVerified={() => setScreen('onboarding-context')}
      />
    );
  }
  if (screen === 'onboarding-context') {
    return (
      <OnboardingContextScreen
        onContinue={() => setScreen('onboarding-done')}
        onSkip={() => setScreen('onboarding-done')}
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
        onSend={() => setScreen('send')}
        onReceive={() => setScreen('receive')}
        onHistory={() => setScreen('history')}
        onSettings={() => setScreen('settings')}
        onAgentActivity={() => setScreen('agent-activity')}
      />
    );
  }
  if (screen === 'agent-activity') {
    return <AgentActivityScreen onBack={() => setScreen('home')} />;
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
  if (screen === 'send') {
    return (
      <RecipientPickerScreen
        onBack={() => setScreen('home')}
        onPick={(recipient) => { setSelectedRecipient(recipient); setScreen('send-compose'); }}
        onPayNewAddress={() => { setSelectedRecipient(null); setScreen('send-compose'); }}
      />
    );
  }
  if (screen === 'send-compose') {
    return (
      <SendComposeScreen
        recipient={selectedRecipient}
        onBack={() => setScreen('send')}
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
        onCancel={() => {
          setFiringScheduleId(null);
          setScreen('home');
        }}
        onConfirmed={(record) => {
          // If we got here from a scheduled-payment reminder, roll the
          // schedule forward + re-arm the next notification.
          if (firingScheduleId) {
            void recordFire(firingScheduleId);
            setFiringScheduleId(null);
          }
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
    return (
      <HistoryScreen
        onBack={() => setScreen('home')}
        onOpen={(activity) => {
          setSelectedActivity(activity);
          // Rebuild the friend-label map so the detail screen shows the
          // latest saved contact names without re-querying per row.
          void (async () => {
            setDetailContactNames(buildContactNameMap(await listContacts()));
          })();
          setScreen('payment-detail');
        }}
      />
    );
  }
  if (screen === 'payment-detail') {
    if (!selectedActivity) {
      setScreen('history');
      return null;
    }
    return (
      <PaymentDetailScreen
        activity={selectedActivity}
        contactNames={detailContactNames}
        onBack={() => setScreen('history')}
      />
    );
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setScreen('home')}
        onWallet={() => setScreen('settings-wallet')}
        onWalletsList={() => setScreen('settings-wallets-list')}
        onPaymentDetails={() => setScreen('settings-payment')}
        onTaxPosition={() => setScreen('settings-tax-position')}
        onTaxResidency={() => setScreen('settings-tax')}
        onFriends={() => setScreen('settings-friends')}
        onMoneyProfile={() => setScreen('settings-money')}
        onActivityReview={() => setScreen('settings-activity')}
        onRecoveryPhrase={() => setScreen('settings-recovery')}
        onRestore={() => setScreen('settings-restore')}
        onRpcEndpoint={() => setScreen('settings-rpc')}
        onSchedules={() => setScreen('settings-schedules')}
        onPassphrase={() => setScreen('settings-passphrase')}
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
        onWatchAdded={() => setScreen('settings-wallets-list')}
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
  if (screen === 'settings-tax') {
    // Settings path is pure residency — no identity/language mutation
    // (seeding the ISO debtor country happens only at sign-up).
    return (
      <TaxResidencyScreen
        onBack={() => setScreen('settings')}
        onDeclared={() => setScreen('settings')}
      />
    );
  }
  if (screen === 'settings-tax-position') {
    return (
      <TaxPositionScreen
        onBack={() => setScreen('settings')}
        onChangeResidency={() => setScreen('settings-tax')}
        onExportReport={() => setScreen('settings-tax-report')}
      />
    );
  }
  if (screen === 'settings-tax-report') {
    return <TaxReportScreen onBack={() => setScreen('settings-tax-position')} />;
  }
  if (screen === 'settings-friends') {
    return <FriendsScreen onBack={() => setScreen('settings')} />;
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
  if (screen === 'settings-schedules') {
    return (
      <ScheduledPaymentsScreen
        onBack={() => setScreen('settings')}
        onAdd={() => setScreen('settings-schedules-add')}
      />
    );
  }
  if (screen === 'settings-schedules-add') {
    return (
      <AddScheduleScreen
        onBack={() => setScreen('settings-schedules')}
        onCreated={() => setScreen('settings-schedules')}
      />
    );
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
  if (screen === 'settings-passphrase') {
    return <WalletPassphraseScreen onBack={() => setScreen('settings')} />;
  }

  // Should never reach — all states above covered.
  return null;
}
