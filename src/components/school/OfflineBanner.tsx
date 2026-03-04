import { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

interface OfflineBannerProps {
  /** Number of pending actions queued for sync */
  pendingCount?: number;
}

export default function OfflineBanner({ pendingCount = 0 }: OfflineBannerProps) {
  const [online, setOnline] = useState(navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 3000);
    }
    function handleOffline() {
      setOnline(false);
      setJustReconnected(false);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online && !justReconnected) return null;

  if (justReconnected) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20 text-green-400 text-xs">
        <Wifi className="w-3.5 h-3.5 shrink-0" />
        <span>Back online! {pendingCount > 0 ? `Syncing ${pendingCount} queued actions…` : 'You\'re connected.'}</span>
        {pendingCount > 0 && <RefreshCw className="w-3.5 h-3.5 animate-spin ml-1" />}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-adv-gold/10 border-b border-adv-gold/20 text-adv-gold text-xs">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>
        You're offline. Chat and review require a connection.
        {pendingCount > 0 ? ` ${pendingCount} action${pendingCount === 1 ? '' : 's'} will sync when you reconnect.` : ' Cached content is still available.'}
      </span>
    </div>
  );
}
