import React from 'react';

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: 'text-adv-green bg-adv-green/10',
  bearish: 'text-adv-red bg-adv-red/10',
  neutral: 'text-adv-gray bg-adv-gray/10',
  mixed: 'text-adv-gold bg-adv-gold/10',
};

interface SentimentBadgeProps {
  sentiment: string;
}

export default function SentimentBadge({ sentiment }: SentimentBadgeProps) {
  const color = SENTIMENT_COLORS[sentiment] ?? 'text-adv-gray bg-adv-gray/10';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {sentiment}
    </span>
  );
}
