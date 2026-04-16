/**
 * ConsensusGauge — visual indicator for hive consensus temperature.
 *
 * Range: 0 (irreconcilable disagreement) → 1 (full agreement).
 * Gradient bar with a marker at the current value + threshold tick.
 */

interface ConsensusGaugeProps {
  value: number;                       // 0..1
  threshold?: number;                  // 0..1 (convergence threshold)
  rationale?: string | null;
  size?: 'sm' | 'md';
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function ConsensusGauge({ value, threshold, rationale, size = 'md', onRefresh, refreshing }: ConsensusGaugeProps) {
  const v = Math.max(0, Math.min(1, value));
  const pct = (v * 100).toFixed(0);
  const tickPct = threshold != null ? (Math.max(0, Math.min(1, threshold)) * 100).toFixed(1) : null;

  return (
    <div className={size === 'sm' ? 'space-y-1' : 'space-y-2'}>
      <div className="flex items-baseline justify-between">
        <span className={`${size === 'sm' ? 'text-[10px]' : 'text-xs'} uppercase tracking-wider text-adv-gray font-semibold`}>
          Consensus
        </span>
        <span className={`${size === 'sm' ? 'text-xs' : 'text-sm'} font-medium text-adv-off-white`}>
          {pct}%
        </span>
      </div>
      <div className={`relative ${size === 'sm' ? 'h-1.5' : 'h-2'} rounded-full bg-adv-dark border border-border overflow-hidden`}>
        <div
          className="absolute inset-y-0 left-0 transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: v >= 0.7
              ? 'linear-gradient(90deg, rgba(45,212,168,0.5), rgba(45,212,168,1))'
              : v >= 0.4
              ? 'linear-gradient(90deg, rgba(245,166,35,0.5), rgba(245,166,35,1))'
              : 'linear-gradient(90deg, rgba(231,76,60,0.5), rgba(231,76,60,1))',
          }}
        />
        {tickPct && (
          <div
            className="absolute inset-y-0 w-0.5 bg-adv-off-white/70"
            style={{ left: `${tickPct}%` }}
            title={`Convergence threshold: ${tickPct}%`}
          />
        )}
      </div>
      {(rationale || onRefresh) && (
        <div className="flex items-start justify-between gap-2">
          {rationale && <p className="text-[11px] text-adv-gray italic flex-1">{rationale}</p>}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="text-[11px] text-adv-gray hover:text-adv-teal transition-colors disabled:opacity-50 shrink-0"
            >
              {refreshing ? 'Measuring…' : 'Re-measure'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
