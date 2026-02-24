import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if user already dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
    setDeferredPrompt(null);
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install openEXPERT app"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-adv-teal/30 bg-adv-card px-4 py-3 shadow-lg text-sm text-adv-off-white"
    >
      <Download className="h-4 w-4 text-adv-teal shrink-0" />
      <span className="whitespace-nowrap">
        Install <strong className="text-adv-teal">openEXPERT</strong> as a desktop app for faster access
      </span>
      <button
        onClick={handleInstall}
        className="ml-2 rounded-lg bg-adv-teal px-3 py-1.5 text-xs font-semibold text-adv-dark hover:bg-adv-teal-dark transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal focus:ring-offset-2 focus:ring-offset-adv-card"
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
        className="ml-1 rounded-lg p-1 text-adv-gray hover:text-adv-off-white hover:bg-adv-dark-2 transition-colors focus:outline-none focus:ring-2 focus:ring-adv-teal focus:ring-offset-2 focus:ring-offset-adv-card"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
