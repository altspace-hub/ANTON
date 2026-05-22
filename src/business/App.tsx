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
import { useEffect, useRef, useState } from 'react';
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
import RecoveryPhraseScreen from './pages/settings/RecoveryPhraseScreen';
import BackupShowScreen from './pages/onboarding/BackupShowScreen';
import BackupVerifyScreen from './pages/onboarding/BackupVerifyScreen';
import WalletsListScreen from './pages/settings/WalletsListScreen';
import WalletDetailScreen from './pages/settings/WalletDetailScreen';
import AddWalletScreen from './pages/settings/AddWalletScreen';
import RpcEndpointScreen from './pages/settings/RpcEndpointScreen';
import DayCloseScreen from './pages/settings/DayCloseScreen';
import PinSetupScreen from './pages/settings/PinSetupScreen';
import ItemsManageScreen from './pages/settings/ItemsManageScreen';
import TemplatesPickerScreen from './pages/settings/TemplatesPickerScreen';
import ReceiptsHistoryScreen from './pages/ReceiptsHistoryScreen';
import KvittoDetailScreen from './pages/KvittoDetailScreen';
import StatisticsScreen from './pages/StatisticsScreen';
import InventoryScreen from './pages/InventoryScreen';
import { hasConfig, loadConfig } from './services/merchant';
import { maybeRunIdlePoll } from './services/idle-poller';
import { notifyReceiptConfirmed, ensureNotificationPermission } from './services/notifications';
import { useViewport } from './hooks/useViewport';
import NavRail, { type NavSection } from './components/NavRail';
import LockScreen from './components/LockScreen';
import { isAppLockEnabled, APP_LOCK_GRACE_MS } from './services/app-lock';
import { useAndroidBackButton, type AppBackResult } from './hooks/useAndroidBackButton';
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
  | 'receipts'
  | 'receipt-detail'
  | 'statistics'
  | 'inventory'
  | 'settings'
  | 'settings-wallet'
  | 'settings-wallets-list'
  | 'settings-wallet-detail'
  | 'settings-wallet-add'
  | 'settings-rpc'
  | 'settings-day-close'
  | 'settings-pin'
  | 'settings-items'
  | 'settings-templates'
  | 'settings-recovery'
  | 'backup-show'
  | 'backup-verify';

/** Where the Android hardware back button steps to from each screen.
 *  A screen absent from this map (home, the onboarding entry, the
 *  done celebration) has no parent — back there exits the app. */
const BACK_PARENT: Partial<Record<Screen, Screen>> = {
  'onboarding-mode': 'onboarding-welcome',
  'onboarding-register': 'onboarding-mode',
  'onboarding-items': 'onboarding-register',
  'simple': 'home',
  'extended': 'home',
  'receipts': 'home',
  'receipt-detail': 'receipts',
  'statistics': 'home',
  'inventory': 'home',
  'settings': 'home',
  'settings-wallet': 'settings',
  'settings-wallets-list': 'settings',
  'settings-wallet-detail': 'settings-wallets-list',
  'settings-wallet-add': 'settings-wallets-list',
  'settings-rpc': 'settings',
  'settings-day-close': 'settings',
  'settings-pin': 'settings',
  'settings-items': 'settings',
  'settings-templates': 'settings-items',
  'settings-recovery': 'settings',
  'backup-show': 'settings',
  'backup-verify': 'backup-show',
};

export default function App() {
  const { t } = useTranslation();
  const viewport = useViewport();
  const [screen, setScreen] = useState<Screen>('loading');
  const [pendingMode, setPendingMode] = useState<SaleMode>('simple');
  /** Wallet id whose detail screen is being viewed. */
  const [detailWalletId, setDetailWalletId] = useState<string>('');
  /** Kvitto number whose detail screen is being viewed. */
  const [detailKvittoNumber, setDetailKvittoNumber] = useState<number>(0);
  /** Merchant's default sale mode — drives the nav rail's "Sell"
   *  destination on tablet. Defaults to 'simple' until config loads. */
  const [defaultMode, setDefaultMode] = useState<SaleMode>('simple');
  /** App-open lock. Starts locked when the merchant enabled it; the
   *  LockScreen clears it. `hiddenAtRef` timestamps the last
   *  background so the resume handler can apply the grace window. */
  const [locked, setLocked] = useState<boolean>(() => isAppLockEnabled());
  const hiddenAtRef = useRef<number>(0);

  useEffect(() => {
    (async () => {
      setScreen((await hasConfig()) ? 'home' : 'onboarding-welcome');
      const cfg = await loadConfig();
      if (cfg?.defaultMode) setDefaultMode(cfg.defaultMode);
    })();
  }, []);

  /**
   * Polling strategy (redesigned 2026-05-21):
   *
   *   - Idle floor: once-per-day opportunistic poll on app foreground
   *     (services/idle-poller.ts). Bulk-confirms any pending receipts
   *     that landed while the merchant was offline. Replaces the
   *     previous always-on 30 s timer (Coinbase anti-pattern).
   *   - Hot polling: SimpleScreen / ExtendedScreen auto-arm a 10-min
   *     active-sync the moment the QR is rendered. The merchant
   *     watches "Waiting for payment 0:42…" change to "Payment
   *     received ✓" without any extra taps (Galoy POS pattern).
   *   - Permission prompt fires on mount, cached.
   */
  useEffect(() => {
    let cancelled = false;
    void ensureNotificationPermission();

    const onForeground = async () => {
      const confirmed = await maybeRunIdlePoll();
      if (cancelled || !confirmed) return;
      for (const receipt of confirmed) {
        void notifyReceiptConfirmed(receipt);
      }
    };
    void onForeground();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void onForeground();
        // App-open lock — re-lock if backgrounded past the grace window.
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
    };
  }, []);

  // Android hardware back button — step to the current screen's parent,
  // or fall through to the double-press-to-exit prompt at a root screen.
  useAndroidBackButton({
    onBack(): AppBackResult {
      // Behind the lock gate there is nothing to navigate — exit.
      if (locked) return 'exit';
      const parent = BACK_PARENT[screen];
      if (parent) { setScreen(parent); return 'handled'; }
      return 'exit';
    },
  });

  // App-open lock — block the whole UI behind a biometric gate when
  // the merchant enabled it. Cold start begins locked; the grace-aware
  // re-lock above handles return-from-background.
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
  // ── Post-onboarding screens ───────────────────────────────────────
  // Rendered into `content`, then wrapped by the adaptive shell below:
  // a phone gets the bare full-screen stack; a tablet gets a persistent
  // NavRail + a centred content column.
  const content: React.ReactNode = (() => {
  if (screen === 'home') {
    return (
      <HomeScreen
        onSimple={() => setScreen('simple')}
        onExtended={() => setScreen('extended')}
        onReceipts={() => setScreen('receipts')}
        onStatistics={() => setScreen('statistics')}
        onInventory={() => setScreen('inventory')}
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
  if (screen === 'receipts') {
    return (
      <ReceiptsHistoryScreen
        onBack={() => setScreen('home')}
        onOpenReceipt={(n) => { setDetailKvittoNumber(n); setScreen('receipt-detail'); }}
      />
    );
  }
  if (screen === 'receipt-detail') {
    return (
      <KvittoDetailScreen
        kvittoNumber={detailKvittoNumber}
        onBack={() => setScreen('receipts')}
      />
    );
  }
  if (screen === 'statistics') {
    return <StatisticsScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'inventory') {
    return <InventoryScreen onBack={() => setScreen('home')} />;
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        onBack={() => setScreen('home')}
        onConnectWallet={() => setScreen('settings-wallet')}
        onShowRecovery={() => setScreen('settings-recovery')}
        onBackupPhrase={() => setScreen('backup-show')}
        onWalletsList={() => setScreen('settings-wallets-list')}
        onRpcEndpoint={() => setScreen('settings-rpc')}
        onDayClose={() => setScreen('settings-day-close')}
        onPin={() => setScreen('settings-pin')}
        onItems={() => setScreen('settings-items')}
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
        onDone={() => setScreen('settings-wallets-list')}
      />
    );
  }
  if (screen === 'settings-rpc') {
    return <RpcEndpointScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-day-close') {
    return <DayCloseScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-pin') {
    return <PinSetupScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'settings-items') {
    return (
      <ItemsManageScreen
        onBack={() => setScreen('settings')}
        onOpenTemplates={() => setScreen('settings-templates')}
      />
    );
  }
  if (screen === 'settings-templates') {
    return (
      <TemplatesPickerScreen
        onBack={() => setScreen('settings-items')}
        onLoaded={() => setScreen('settings-items')}
      />
    );
  }
  if (screen === 'settings-recovery') {
    return <RecoveryPhraseScreen onBack={() => setScreen('settings')} />;
  }
  if (screen === 'backup-show') {
    return <BackupShowScreen onContinue={() => setScreen('backup-verify')} />;
  }
  if (screen === 'backup-verify') {
    return (
      <BackupVerifyScreen
        onVerified={() => setScreen('settings')}
        onBack={() => setScreen('backup-show')}
      />
    );
  }

    return null;
  })();

  // ── Adaptive shell ────────────────────────────────────────────────
  // Phone: the bare screen, full-bleed (the legacy stack).
  if (viewport === 'phone') return content;

  // Tablet: persistent NavRail + the screen in a centred content
  // column. The rail's active section is derived from the screen, and
  // each rail destination is a top-level setScreen.
  return (
    <div className="flex flex-row" style={{ height: '100%' }}>
      <NavRail
        active={navSectionFor(screen)}
        onNavigate={(section) => {
          switch (section) {
            case 'home':       setScreen('home'); break;
            case 'sell':       setScreen(defaultMode === 'extended' ? 'extended' : 'simple'); break;
            case 'receipts':   setScreen('receipts'); break;
            case 'statistics': setScreen('statistics'); break;
            case 'inventory':  setScreen('inventory'); break;
            case 'settings':   setScreen('settings'); break;
          }
        }} />
      <div className="flex-1 min-w-0 overflow-hidden flex justify-center"
           style={{ backgroundColor: 'var(--color-bg)' }}>
        {/* Centred column — caps the reading width so forms and lists
            don't stretch across a 1280px landscape tablet, while still
            giving the dashboards and item grids room to breathe. */}
        <div className="w-full" style={{ maxWidth: 860, height: '100%' }}>
          {content}
        </div>
      </div>
    </div>
  );
}

/** Map a screen state onto the nav-rail section it belongs to, so the
 *  rail highlights the right item even on a sub-screen (a settings
 *  detail page still lights up "Settings"). */
function navSectionFor(screen: Screen): NavSection {
  if (screen === 'simple' || screen === 'extended') return 'sell';
  if (screen === 'receipts' || screen === 'receipt-detail') return 'receipts';
  if (screen === 'statistics') return 'statistics';
  if (screen === 'inventory') return 'inventory';
  if (screen.startsWith('settings') || screen.startsWith('backup')) return 'settings';
  return 'home';
}
