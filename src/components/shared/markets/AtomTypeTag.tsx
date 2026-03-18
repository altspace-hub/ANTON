import React from 'react';

const ATOM_TYPE_COLORS: Record<string, string> = {
  fact: 'text-adv-blue bg-adv-blue/10',
  signal: 'text-adv-teal bg-adv-teal/10',
  insight: 'text-adv-gold bg-adv-gold/10',
  event: 'text-purple-400 bg-purple-400/10',
  prediction: 'text-orange-400 bg-orange-400/10',
  outcome: 'text-adv-green bg-adv-green/10',
};

interface AtomTypeTagProps {
  type: string;
}

export default function AtomTypeTag({ type }: AtomTypeTagProps) {
  const color = ATOM_TYPE_COLORS[type] ?? 'text-adv-gray bg-adv-gray/10';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {type}
    </span>
  );
}
