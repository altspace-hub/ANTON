import React, { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TemporalDataPoint } from './types';

interface TemporalChartProps {
  title: string;
  data: TemporalDataPoint[];
  color?: string;
  valueKey?: keyof TemporalDataPoint;
}

export function TemporalChart({ title, data, color = '#2DD4A8', valueKey = 'count' }: TemporalChartProps) {
  const { values, max, min, trend } = useMemo(() => {
    const values = data.map(d => {
      const val = d[valueKey];
      return typeof val === 'number' ? val : 0;
    });
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);

    // Calculate trend (compare last 3 vs first 3 values)
    const firstHalf = values.slice(0, Math.ceil(values.length / 3));
    const lastHalf = values.slice(-Math.ceil(values.length / 3));
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgLast = lastHalf.reduce((a, b) => a + b, 0) / lastHalf.length;
    const trend = avgLast > avgFirst * 1.1 ? 'up' : avgLast < avgFirst * 0.9 ? 'down' : 'stable';

    return { values, max, min, trend };
  }, [data, valueKey]);

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-adv-gray';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-adv-off-white">{title}</h3>
        <div className={`flex items-center gap-1 ${trendColor}`}>
          <TrendIcon className="w-4 h-4" />
          <span className="text-xs font-medium capitalize">{trend}</span>
        </div>
      </div>

      <div className="relative h-32">
        <svg width="100%" height="100%" className="overflow-visible">
          {/* Grid lines */}
          <line
            x1="0"
            y1="0"
            x2="100%"
            y2="0"
            stroke="#707070"
            strokeWidth="1"
            strokeDasharray="4 2"
            opacity="0.2"
          />
          <line
            x1="0"
            y1="50%"
            x2="100%"
            y2="50%"
            stroke="#707070"
            strokeWidth="1"
            strokeDasharray="4 2"
            opacity="0.2"
          />
          <line
            x1="0"
            y1="100%"
            x2="100%"
            y2="100%"
            stroke="#707070"
            strokeWidth="1"
            strokeDasharray="4 2"
            opacity="0.2"
          />

          {/* Line chart */}
          {values.length > 1 && (
            <>
              {/* Area fill */}
              <path
                d={`
                  M 0,128
                  ${values.map((val, i) => {
                    const x = (i / (values.length - 1)) * 100;
                    const y = 128 - ((val - min) / (max - min || 1)) * 128;
                    return `L ${x}%,${y}`;
                  }).join(' ')}
                  L 100%,128
                  Z
                `}
                fill={color}
                fillOpacity="0.1"
              />

              {/* Line */}
              <path
                d={values.map((val, i) => {
                  const x = (i / (values.length - 1)) * 100;
                  const y = 128 - ((val - min) / (max - min || 1)) * 128;
                  return `${i === 0 ? 'M' : 'L'} ${x}%,${y}`;
                }).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {values.map((val, i) => {
                const x = (i / (values.length - 1)) * 100;
                const y = 128 - ((val - min) / (max - min || 1)) * 128;
                return (
                  <circle
                    key={i}
                    cx={`${x}%`}
                    cy={y}
                    r="3"
                    fill={color}
                  />
                );
              })}
            </>
          )}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-adv-gray">
        <span>{data[0]?.date || data[0]?.week || 'Start'}</span>
        <span>{data[data.length - 1]?.date || data[data.length - 1]?.week || 'Now'}</span>
      </div>
    </div>
  );
}
