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
import { hasWallet, getActiveWalletMeta } from '../services/wallet';
import { needsResidencyPrompt } from '../services/tax-residency';
import { listContacts, buildContactNameMap } from '../services/address-book';
import type { WalletTx } from '../services/transactions';
import WalletConnectScreen from './wallet/WalletConnectScreen';
import WalletBalanceScreen from './wallet/WalletBalanceScreen';
import WalletReceiveScreen from './wallet/WalletReceiveScreen';
import WalletSendScreen, { parsePayUri, type ParsedPayUri } from './wallet/WalletSendScreen';
import WalletReviewScreen from './wallet/WalletReviewScreen';
import WalletSendDoneScreen from './wallet/WalletSendDoneScreen';
import WalletTxDetailScreen from './wallet/WalletTxDetailScreen';
import WalletFriendsScreen from './wallet/WalletFriendsScreen';
import WalletScanScreen from './wallet/WalletScanScreen';
import ScheduledPaymentsScreen from './wallet/ScheduledPaymentsScreen';
import AddScheduleScreen from './wallet/AddScheduleScreen';
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
  | 'send-scan'
  | 'send-review'
  | 'send-done'
  | 'tx-detail'
  | 'wallet-friends'
  | 'history'
  | 'schedules'
  | 'schedule-add'
  | 'wallets-list'
  | 'wallet-detail'
  | 'wallet-add'
  | 'wallet-security'
  | 'rpc-endpoint'
  | 'tax-residency'
  | 'tax-position'
  | 'tax-report';

interface WalletScreenProps {
  /** A `futurechain:pay` URI to open straight into the review step —
   *  set when a scheduled-payment notification was tapped. Consumed
   *  once on mount, then cleared via onDeepLinkConsumed. */
  deepLinkUri?: string | null;
  onDeepLinkConsumed?: () => void;
}

export default function WalletScreen({ deepLinkUri, onDeepLinkConsumed }: WalletScreenProps = {}) {
  const [view, setView] = useState<View>('loading');
  const [address, setAddress] = useState<string | null>(null);
  /** Wallet id whose detail screen is being viewed. */
  const [detailWalletId, setDetailWalletId] = useState<string>('');
  /** Parsed pay URI carried from the send (compose) step into the review step. */
  const [pendingSend, setPendingSend] = useState<ParsedPayUri | null>(null);
  /** WalletTx id of the just-sent payment, shown on the done screen. */
  const [doneTxId, setDoneTxId] = useState<string>('');
  /** The tx whose full-screen detail is open (#86). */
  const [detailTx, setDetailTx] = useState<WalletTx | null>(null);
  /** address → friend-label map, for the detail screen counterparty. */
  const [contactNames, setContactNames] = useState<Record<string, string>>({});

  useEffect(() => {
    void refresh();
    void listContacts().then((cs) => setContactNames(buildContactNameMap(cs)));
  }, []);

  // Notification-tap deep link — a scheduled-payment reminder hands us a
  // `futurechain:pay` URI; parse it and jump straight to review (only
  // once the wallet has loaded so `address` is available).
  useEffect(() => {
    if (!deepLinkUri || view === 'loading' || view === 'connect') return;
    const parsed = parsePayUri(deepLinkUri);
    if (parsed.ok) { setPendingSend(parsed); setView('send-review'); }
    onDeepLinkConsumed?.();
  }, [deepLinkUri, view]);

  async function refresh() {
    if (await hasWallet()) {
      // Display address comes from the wallet META, not loadWallet(): after the
      // Wave-7 native-signer migration (triggered by the first send) the raw
      // private key is moved into the Keystore-bound signer and erased from
      // secure-store, so loadWallet() returns null for a perfectly good wallet
      // — which used to strand the user on the "configure wallet" screen with no
      // way back in. The meta always carries the address; signing still works
      // via the native signer.
      const meta = await getActiveWalletMeta();
      setAddress(meta?.address ?? null);
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
        onScan={() => setView('send-scan')}
      />
    );
  }
  if (view === 'send-scan') {
    return (
      <WalletScanScreen
        onBack={() => setView('send')}
        onScanned={(parsed) => { setPendingSend(parsed); setView('send-review'); }}
      />
    );
  }
  if (view === 'send-review' && pendingSend) {
    return (
      <WalletReviewScreen
        parsed={pendingSend}
        onBack={() => setView('send')}
        onConfirmed={(id) => { setPendingSend(null); setDoneTxId(id); setView('send-done'); }}
      />
    );
  }
  if (view === 'send-done' && doneTxId) {
    return (
      <WalletSendDoneScreen
        txId={doneTxId}
        onHome={() => { setDoneTxId(''); setView('balance'); }}
        onHistory={() => { setDoneTxId(''); setView('history'); }}
      />
    );
  }
  if (view === 'history') {
    return (
      <WalletHistoryScreen
        onBack={() => setView('balance')}
        onOpen={(tx) => { setDetailTx(tx); setView('tx-detail'); }}
      />
    );
  }
  if (view === 'tx-detail' && detailTx) {
    return (
      <WalletTxDetailScreen
        tx={detailTx}
        contactNames={contactNames}
        onBack={() => { setDetailTx(null); setView('history'); }}
      />
    );
  }
  if (view === 'wallet-friends') {
    return <WalletFriendsScreen onBack={() => setView('balance')} />;
  }
  if (view === 'schedules') {
    return (
      <ScheduledPaymentsScreen
        onBack={() => setView('balance')}
        onAdd={() => setView('schedule-add')}
        onPayNow={(uri) => {
          const parsed = parsePayUri(uri);
          if (parsed.ok) { setPendingSend(parsed); setView('send-review'); }
        }}
      />
    );
  }
  if (view === 'schedule-add') {
    return (
      <AddScheduleScreen
        onBack={() => setView('schedules')}
        onCreated={() => setView('schedules')}
      />
    );
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
      onSchedules={() => setView('schedules')}
      onManage={() => setView('wallets-list')}
      onRpcEndpoint={() => setView('rpc-endpoint')}
      onSecurity={() => setView('wallet-security')}
      onFriends={() => setView('wallet-friends')}
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
