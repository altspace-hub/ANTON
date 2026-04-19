/**
 * hardware-status.ts — shared status / verdict / path / risk colour vocabulary
 * for the Hardware Build pillar UI.
 *
 * All Hardware* pages should import from here instead of redefining their
 * own STATUS_STYLES / VERDICT_STYLES / PATH_BADGES dicts. Keeps colour usage
 * consistent and makes a future theme change one-edit.
 */

export type HardwarePath = 'diagnose' | 'maintain' | 'develop';
export type HardwareTier = 1 | 2 | 3;
export type ShipVerdict = 'green' | 'amber' | 'block';
export type GateOutcome = 'pass' | 'warn' | 'fail' | 'skip' | 'error';
export type CounterfeitRisk = 'low' | 'moderate' | 'high' | 'critical';

/** Path → badge tailwind classes. Used on every workspace page header. */
export const PATH_BADGES: Record<HardwarePath, string> = {
  diagnose: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  maintain: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  develop:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

/** Tier → badge tailwind classes. */
export const TIER_BADGES: Record<HardwareTier, string> = {
  1: 'bg-adv-card text-adv-gray border-adv-gray/30',
  2: 'bg-adv-blue/10 text-adv-blue border-adv-blue/30',
  3: 'bg-red-500/10 text-red-400 border-red-500/30',
};

/** Quality-pipeline ship verdict styles. */
export const VERDICT_STYLES: Record<ShipVerdict, string> = {
  green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  block: 'bg-red-500/10 text-red-400 border-red-500/30',
};

/** Per-gate outcome styles (used in run-detail panels). */
export const OUTCOME_STYLES: Record<GateOutcome, string> = {
  pass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  fail: 'bg-red-500/10 text-red-400 border-red-500/30',
  skip: 'bg-adv-card text-adv-gray border-adv-gray/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
};

/** Counterfeit-risk styles (HKP regional sourcing + photo-id). */
export const RISK_STYLES: Record<CounterfeitRisk, string> = {
  low:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  moderate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/10 text-red-400 border-red-500/30',
};

/**
 * General severity → style map (for diagnostic case severity, lifecycle
 * event severity, risk-delta severity).
 */
export function severityClass(sev: string | null | undefined): string {
  if (!sev) return 'bg-adv-card text-adv-gray border-adv-gray/30';
  const s = sev.toLowerCase();
  if (s === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'high')     return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (s === 'moderate' || s === 'medium') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
}

/**
 * Format an ISO timestamp as a relative-time string ("2h ago", "5d ago").
 * Used in reasoning trails + audit logs to keep them scannable.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return iso;
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
