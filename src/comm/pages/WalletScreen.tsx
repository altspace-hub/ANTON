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
import WalletConnectScreen from './wallet/WalletConnectScreen';
import WalletBalanceScreen from './wallet/WalletBalanceScreen';
import WalletReceiveScreen from './wallet/WalletReceiveScreen';
import WalletSendScreen from './wallet/WalletSendScreen';
import WalletHistoryScreen from './wallet/WalletHistoryScreen';

type View = 'loading' | 'connect' | 'balance' | 'receive' | 'send' | 'history';

export default function WalletScreen() {
  const [view, setView] = useState<View>('loading');
  const [address, setAddress] = useState<string | null>(null);

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
        onSent={() => setView('history')}
      />
    );
  }
  if (view === 'history') {
    return <WalletHistoryScreen onBack={() => setView('balance')} />;
  }

  // balance
  return (
    <WalletBalanceScreen
      address={address}
      onReceive={() => setView('receive')}
      onSend={() => setView('send')}
      onHistory={() => setView('history')}
    />
  );
}
