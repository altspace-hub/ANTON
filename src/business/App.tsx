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
import RecoveryPhraseScreen from './pages/settings/RecoveryPhraseScreen';
import BackupShowScreen from './pages/onboarding/BackupShowScreen';
import BackupVerifyScreen from './pages/onboarding/BackupVerifyScreen';
import WalletsListScreen from './pages/settings/WalletsListScreen';
import WalletDetailScreen from './pages/settings/WalletDetailScreen';
import AddWalletScreen from './pages/settings/AddWalletScreen';
import RpcEndpointScreen from './pages/settings/RpcEndpointScreen';
import DayCloseScreen from './pages/settings/DayCloseScreen';
import PinSetupScreen from './pages/settings/PinSetupScreen';
import { hasConfig } from './services/merchant';
import { maybeRunIdlePoll } from './services/idle-poller';
import { notifyReceiptConfirmed, ensureNotificationPermission } from './services/notifications';
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
  | 'settings-wallet'
  | 'settings-wallets-list'
  | 'settings-wallet-detail'
  | 'settings-wallet-add'
  | 'settings-rpc'
  | 'settings-day-close'
  | 'settings-pin'
  | 'settings-recovery'
  | 'backup-show'
  | 'backup-verify';

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<Screen>('loading');
  const [pendingMode, setPendingMode] = useState<SaleMode>('simple');
  /** Wallet id whose detail screen is being viewed. */
  const [detailWalletId, setDetailWalletId] = useState<string>('');

  useEffect(() => {
    (async () => {
      setScreen((await hasConfig()) ? 'home' : 'onboarding-welcome');
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
        onShowRecovery={() => setScreen('settings-recovery')}
        onBackupPhrase={() => setScreen('backup-show')}
        onWalletsList={() => setScreen('settings-wallets-list')}
        onRpcEndpoint={() => setScreen('settings-rpc')}
        onDayClose={() => setScreen('settings-day-close')}
        onPin={() => setScreen('settings-pin')}
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

  // Should never reach — all states above covered.
  return null;
}
