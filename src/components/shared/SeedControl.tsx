import React, { useState } from 'react';
import { Hash, Info, RefreshCw } from 'lucide-react';

interface SeedControlProps {
  seed: number | undefined;
  onChange: (seed: number | undefined) => void;
  modelSupportsSeed: boolean;
}

export function SeedControl({ seed, onChange, modelSupportsSeed }: SeedControlProps) {
  const [expanded, setExpanded] = useState(false);

  if (!modelSupportsSeed) return null;

  const generateRandomSeed = () => {
    onChange(Math.floor(Math.random() * 1_000_000));
  };

  const clearSeed = () => {
    onChange(undefined);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-adv-gray hover:text-adv-off-white transition-colors"
      >
        <Hash className="h-4 w-4" />
        <span>Reproducibility Seed</span>
        <span className="text-xs text-adv-gray-med ml-auto">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {expanded && (
        <div className="ml-6 space-y-3 p-3 bg-adv-dark-2 rounded border border-adv-card">
          <div className="flex items-start gap-2 text-xs text-adv-gray">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p>
              Sets a seed for reproducible outputs. Same seed + prompt + settings = same output.
              Useful for audit trails and A/B testing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={seed ?? ''}
              onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Enter seed (0-999999)"
              min={0}
              max={999999}
              className="flex-1 px-3 py-2 bg-adv-dark border border-adv-gray-med rounded text-sm text-adv-off-white focus:border-adv-teal focus:outline-none"
            />
            <button
              type="button"
              onClick={generateRandomSeed}
              className="p-2 bg-adv-card border border-adv-gray-med rounded hover:border-adv-teal transition-colors"
              title="Generate random seed"
            >
              <RefreshCw className="h-4 w-4 text-adv-gray" />
            </button>
          </div>

          {seed !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-adv-teal font-mono">Seed: {seed}</span>
              <button
                type="button"
                onClick={clearSeed}
                className="text-adv-gray hover:text-adv-off-white transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
