import { CheckCircle2, Circle, Loader2, XCircle, Clock } from 'lucide-react';
import type { ProgressEntry } from '@/lib/coding-types';

interface ProgressViewProps {
  entries: ProgressEntry[];
  currentStep?: string;
  className?: string;
}

const STATUS_CONFIG = {
  started: { icon: Loader2, color: 'text-adv-teal', animate: true, label: 'In progress' },
  completed: { icon: CheckCircle2, color: 'text-adv-green', animate: false, label: 'Done' },
  failed: { icon: XCircle, color: 'text-adv-red', animate: false, label: 'Failed' },
  skipped: { icon: Circle, color: 'text-adv-gray', animate: false, label: 'Skipped' },
};

export default function ProgressView({ entries, currentStep, className = '' }: ProgressViewProps) {
  return (
    <div className={`rounded-lg border border-border bg-adv-card ${className}`}>
      <div className="border-b border-border px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-adv-gray">Progress</h3>
      </div>
      <div className="max-h-[300px] overflow-auto p-3">
        <div className="space-y-1">
          {entries.map((entry, i) => {
            const config = STATUS_CONFIG[entry.status];
            const Icon = config.icon;
            const isLast = i === entries.length - 1;

            return (
              <div key={i} className="flex items-start gap-2">
                <div className="relative flex flex-col items-center">
                  <Icon className={`h-4 w-4 shrink-0 ${config.color} ${config.animate ? 'animate-spin' : ''}`} />
                  {!isLast && <div className="mt-0.5 h-4 w-px bg-border" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${entry.status === 'started' ? 'text-adv-teal' : 'text-adv-off-white'}`}>
                      {entry.step}
                    </span>
                    <span className="text-[10px] text-adv-gray">
                      <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  {entry.detail && (
                    <p className="mt-0.5 text-[11px] text-adv-gray">{entry.detail}</p>
                  )}
                </div>
              </div>
            );
          })}
          {currentStep && entries.every((e) => e.step !== currentStep) && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-adv-teal" />
              <span className="text-xs font-medium text-adv-teal">{currentStep}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
