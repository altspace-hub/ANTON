/**
 * ConnectionStatus — Shows offline banner when connection is lost.
 */

import { useState, useEffect } from 'react';
import { isOnline, onConnectionChange } from '../services/offline';

export default function ConnectionStatus() {
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    return onConnectionChange(setOnline);
  }, []);

  if (online) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-adv-gold/90 px-4 py-2 text-center text-xs font-medium text-adv-dark safe-top">
      You're offline — cached conversations available
    </div>
  );
}
