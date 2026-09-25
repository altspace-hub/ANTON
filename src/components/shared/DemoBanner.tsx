/**
 * DemoBanner — the standing notice on a public demo server (DEMO_MODE=true):
 * do not enter personal or client data, and everything is deleted after the
 * retention period. Renders nothing on an ordinary server.
 */
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDemoStore } from '@/stores/useDemoStore';

interface DemoBannerProps {
  /** 'light' on the white login page, 'app' inside the themed layout. */
  variant?: 'app' | 'light';
}

export default function DemoBanner({ variant = 'app' }: DemoBannerProps) {
  const { config, load } = useDemoStore();
  useEffect(() => { void load(); }, [load]);
  if (!config.demoMode) return null;

  const tone = variant === 'light'
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : 'border-adv-gold/40 bg-adv-gold/15 text-adv-off-white';
  const link = variant === 'light' ? 'text-amber-900 underline hover:text-amber-700' : 'text-adv-gold underline hover:text-adv-off-white';

  return (
    <div role="note" aria-label="Demo notice" className={`flex items-start gap-2 border-b px-4 py-2 text-sm leading-snug ${tone}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>Demo — do not enter personal or client data.</strong>{' '}
        Answers come from an AI model reached through a third-party service. Demo accounts and everything in them
        are deleted after {config.retentionDays} days.{' '}
        <a href={config.privacyPath} className={link}>Privacy notice</a>
      </p>
    </div>
  );
}
