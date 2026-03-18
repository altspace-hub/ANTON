import React from 'react';

interface ConfidenceMeterProps {
  value: number; // 0-1
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

function getColor(v: number): string {
  if (v < 0.3) return 'bg-adv-red';
  if (v < 0.6) return 'bg-adv-gold';
  return 'bg-adv-green';
}

function getTextColor(v: number): string {
  if (v < 0.3) return 'text-adv-red';
  if (v < 0.6) return 'text-adv-gold';
  return 'text-adv-green';
}

export default function ConfidenceMeter({ value, size = 'sm', showLabel = true }: ConfidenceMeterProps) {
  const pct = Math.round(value * 100);
  const barHeight = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 ${barHeight} rounded-full bg-adv-dark-2 overflow-hidden min-w-[40px]`}>
        <div
          className={`${barHeight} rounded-full transition-all ${getColor(value)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className={`text-xs font-medium ${getTextColor(value)}`}>
          {pct}%
        </span>
      )}
    </div>
  );
}
