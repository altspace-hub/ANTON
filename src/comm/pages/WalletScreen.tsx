/**
 * WalletScreen — wallet tab root.
 *
 * State-machine router (no react-router; same pattern as the
 * App-level shell). On mount we read `hasWallet()`; if no wallet
 * exists yet we land on the Connect screen, otherwise on Balance.
 *
 * Sub-screens live under ./wallet/ and are eagerly imported here.
 * The bundle hit is moderate (qrcode + secp256k1 + sdk wallet),
 * acceptable because the wallet tab is rarely the cold-start entry
 * point and the imports are tree-shaken into the existing wallet
 * chunk if Vite splits.
 */
import { useEffect, useState } from 'react';
import { hasWallet, loadWallet } from '../services/wallet';
import { needsResidencyPrompt } from '../services/tax-residency';
import WalletConnectScreen from './wallet/WalletConnectScreen';
import WalletBalanceScreen from './wallet/WalletBalanceScreen';
import WalletReceiveScreen from './wallet/WalletReceiveScreen';
import WalletSendScreen, { type ParsedPayUri } from './wallet/WalletSendScreen';
import WalletReviewScreen from './wallet/WalletReviewScreen';
import WalletHistoryScreen from './wallet/WalletHistoryScreen';
import WalletsListScreen from './wallet/WalletsListScreen';
import WalletDetailScreen from './wallet/WalletDetailScreen';
import AddWalletScreen from './wallet/AddWalletScreen';
import RpcEndpointScreen from './wallet/RpcEndpointScreen';
import WalletSecurityScreen from './wallet/WalletSecurityScreen';
import TaxResidencyScreen from './wallet/TaxResidencyScreen';
import TaxPositionScreen from './wallet/TaxPositionScreen';
import TaxReportScreen from './wallet/TaxReportScreen';

type View =
  | 'loading'
  | 'connect'
  | 'balance'
  | 'receive'
  | 'send'
  | 'send-review'
  | 'history'
  | 'wallets-list'
  | 'wallet-detail'
  | 'wallet-add'
  | 'wallet-security'
  | 'rpc-endpoint'
  | 'tax-residency'
  | 'tax-position'
  | 'tax-report';

export default function WalletScreen() {
  const [view, setView] = useState<View>('loading');
  const [address, setAddress] = useState<string | null>(null);
  /** Wallet id whose detail screen is being viewed. */
  const [detailWalletId, setDetailWalletId] = useState<string>('');
  /** Parsed pay URI carried from the send (compose) step into the review step. */
  const [pendingSend, setPendingSend] = useState<ParsedPayUri | null>(null);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    if (await hasWallet()) {
      const w = await loadWallet();
      setAddress(w?.address ?? null);
      setView('balance');
    } else {
      setView('connect');
    }
  }

  if (view === 'loading') {
    return (
      <section className="flex flex-col items-center justify-center h-full">
        <span className="text-sm text-[var(--color-text-faint)]">Loading…</span>
      </section>
    );
  }

  if (view === 'connect') {
    return (
      <WalletConnectScreen
        onConnected={(addr) => {
          setAddress(addr);
          setView('balance');
        }}
      />
    );
  }

  if (!address) {
    // Defensive: hasWallet() returned true but loadWallet() failed.
    // Route back to connect to re-create.
    return <WalletConnectScreen onConnected={(addr) => { setAddress(addr); setView('balance'); }} />;
  }

  if (view === 'receive') {
    return <WalletReceiveScreen address={address} onBack={() => setView('balance')} />;
  }
  if (view === 'send') {
    return (
      <WalletSendScreen
        onBack={() => setView('balance')}
        onReview={(parsed) => { setPendingSend(parsed); setView('send-review'); }}
      />
    );
  }
  if (view === 'send-review' && pendingSend) {
    return (
      <WalletReviewScreen
        parsed={pendingSend}
        onBack={() => setView('send')}
        onConfirmed={() => { setPendingSend(null); setView('history'); }}
      />
    );
  }
  if (view === 'history') {
    return <WalletHistoryScreen onBack={() => setView('balance')} />;
  }
  if (view === 'wallets-list') {
    return (
      <WalletsListScreen
        onBack={() => { void refresh(); }}
        onAddWallet={() => setView('wallet-add')}
        onOpenWallet={(id) => { setDetailWalletId(id); setView('wallet-detail'); }}
      />
    );
  }
  if (view === 'wallet-detail') {
    return (
      <WalletDetailScreen
        walletId={detailWalletId}
        onBack={() => setView('wallets-list')}
        onDeleted={() => setView('wallets-list')}
      />
    );
  }
  if (view === 'wallet-add') {
    return (
      <AddWalletScreen
        onBack={() => setView('wallets-list')}
        onDone={() => setView('wallets-list')}
      />
    );
  }
  if (view === 'rpc-endpoint') {
    return <RpcEndpointScreen onBack={() => setView('balance')} />;
  }
  if (view === 'wallet-security') {
    return <WalletSecurityScreen onBack={() => setView('balance')} />;
  }
  if (view === 'tax-residency') {
    return (
      <TaxResidencyScreen
        onBack={() => setView('balance')}
        onDeclared={() => setView('tax-position')}
      />
    );
  }
  if (view === 'tax-position') {
    return (
      <TaxPositionScreen
        onBack={() => setView('balance')}
        onChangeResidency={() => setView('tax-residency')}
        onExportReport={() => setView('tax-report')}
      />
    );
  }
  if (view === 'tax-report') {
    return <TaxReportScreen onBack={() => setView('tax-position')} />;
  }

  // balance
  return (
    <WalletBalanceScreen
      address={address}
      onReceive={() => setView('receive')}
      onSend={() => setView('send')}
      onHistory={() => setView('history')}
      onManage={() => setView('wallets-list')}
      onRpcEndpoint={() => setView('rpc-endpoint')}
      onSecurity={() => setView('wallet-security')}
      onTax={async () => {
        // First tap routes to residency capture; subsequent taps land
        // straight on the computed position screen.
        if (await needsResidencyPrompt()) {
          setView('tax-residency');
        } else {
          setView('tax-position');
        }
      }}
    />
  );
}
