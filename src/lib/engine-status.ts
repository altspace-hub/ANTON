import type { HealthStatus } from '@/lib/types';

/**
 * What the header's status dot says. Four states, not two: the old header
 * showed a red "API Not Configured" whenever health had not been fetched (it
 * was fetched only on the Dashboard and Settings) or had failed, and it
 * ignored the subscription engine — so a working subscription-only instance
 * always looked broken.
 */
export type EngineStatusTone = 'pending' | 'ok' | 'unreachable' | 'none';

export interface EngineStatusView {
  tone: EngineStatusTone;
  /** i18n key and English fallback. */
  key: string;
  fallback: string;
}

export function headerEngineStatus(health: HealthStatus | null): EngineStatusView {
  if (!health) return { tone: 'pending', key: 'header.engineChecking', fallback: 'Checking…' };
  if (health.status === 'error') return { tone: 'unreachable', key: 'header.serverUnreachable', fallback: 'Server not responding' };
  const engines = health.engines;
  const ready = engines ? engines.ready : health.apiKeyConfigured;
  if (!ready) return { tone: 'none', key: 'header.apiNotConfigured', fallback: 'No AI engine configured' };
  if (engines && (engines.sdk || engines.codex)) {
    return engines.anthropicApi
      ? { tone: 'ok', key: 'header.subscriptionAndApi', fallback: 'Subscription + API key' }
      : { tone: 'ok', key: 'header.subscriptionConnected', fallback: 'Subscription engine' };
  }
  return { tone: 'ok', key: 'header.apiConnected', fallback: 'API Connected' };
}
