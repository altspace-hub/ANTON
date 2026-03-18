import React from 'react';
import ConfidenceMeter from './ConfidenceMeter.js';
import AtomTypeTag from './AtomTypeTag.js';
import SentimentBadge from './SentimentBadge.js';

interface AtomCardProps {
  atom: {
    id: string;
    atom_type: string;
    content: string;
    confidence: number;
    sentiment: string;
    source?: string;
    created_at?: string;
  };
  compact?: boolean;
  onClick?: (id: string) => void;
}

export default function AtomCard({ atom, compact = false, onClick }: AtomCardProps) {
  return (
    <div
      className={`rounded-lg border border-adv-card bg-adv-card p-3 ${onClick ? 'cursor-pointer hover:border-adv-teal/30' : ''}`}
      onClick={() => onClick?.(atom.id)}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <AtomTypeTag type={atom.atom_type} />
        <SentimentBadge sentiment={atom.sentiment} />
        {atom.source && (
          <span className="ml-auto text-xs text-adv-gray truncate max-w-[120px]">{atom.source}</span>
        )}
      </div>
      <p className={`text-sm text-adv-off-white ${compact ? 'line-clamp-2' : 'line-clamp-4'}`}>
        {atom.content}
      </p>
      <div className="mt-2">
        <ConfidenceMeter value={atom.confidence} size="sm" />
      </div>
    </div>
  );
}
