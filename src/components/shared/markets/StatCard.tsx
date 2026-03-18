import React from 'react';

interface StatCardProps {
  label: string;
  value: number;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
}

export default function StatCard({ label, value, sublabel, icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl border border-adv-card bg-adv-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={color}>{icon}</span>
        <span className="text-xs text-adv-gray">{label}</span>
      </div>
      <div className="text-2xl font-bold text-adv-off-white">{value.toLocaleString()}</div>
      <div className="text-xs text-adv-gray mt-1">{sublabel}</div>
    </div>
  );
}
