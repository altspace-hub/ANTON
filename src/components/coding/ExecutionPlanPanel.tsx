import { CheckCircle2, AlertTriangle, FileCode, TestTube, Lightbulb, HelpCircle } from 'lucide-react';
import type { ExecutionPlan } from '@/lib/coding-types';

interface ExecutionPlanPanelProps {
  plan: ExecutionPlan;
  onApprove?: () => void;
  onModify?: () => void;
  onQuestion?: (question: string) => void;
  readonly?: boolean;
  className?: string;
}

export default function ExecutionPlanPanel({
  plan,
  onApprove,
  onModify,
  onQuestion,
  readonly = false,
  className = '',
}: ExecutionPlanPanelProps) {
  return (
    <div className={`rounded-lg border border-border bg-adv-card ${className}`}>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-adv-white">Execution Plan</h3>
        <p className="mt-0.5 text-xs text-adv-gray">Review and approve before implementation begins</p>
      </div>

      <div className="space-y-4 p-4">
        {/* What & Why */}
        <div className="space-y-2">
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-adv-teal">What</h4>
            <p className="mt-1 text-sm text-adv-off-white">{plan.what}</p>
          </div>
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-adv-teal">Why</h4>
            <p className="mt-1 text-sm text-adv-off-white">{plan.why}</p>
          </div>
        </div>

        {/* Expertise */}
        {plan.expertise_needed.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">
              <Lightbulb className="mr-1 inline h-3 w-3" />Expertise Required
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {plan.expertise_needed.map((e) => (
                <span key={e} className="rounded-full bg-adv-teal-dim px-2.5 py-0.5 text-xs text-adv-teal">{e}</span>
              ))}
            </div>
          </div>
        )}

        {/* Files */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FileList icon={<FileCode className="h-3.5 w-3.5 text-adv-green" />} label="Create" items={plan.files_to_create} color="text-adv-green" />
          <FileList icon={<FileCode className="h-3.5 w-3.5 text-adv-gold" />} label="Modify" items={plan.files_to_modify} color="text-adv-gold" />
          <FileList icon={<FileCode className="h-3.5 w-3.5 text-adv-red" />} label="Delete" items={plan.files_to_delete} color="text-adv-red" />
        </div>

        {/* Tests */}
        {plan.tests_to_write.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray">
              <TestTube className="mr-1 inline h-3 w-3" />Tests
            </h4>
            <ul className="space-y-0.5">
              {plan.tests_to_write.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-adv-off-white">
                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-adv-gray" />
                  <span className="font-mono">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Risks */}
        {plan.risks.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wider text-adv-gold">
              <AlertTriangle className="mr-1 inline h-3 w-3" />Risks
            </h4>
            <ul className="space-y-0.5">
              {plan.risks.map((r, i) => (
                <li key={i} className="text-xs text-adv-off-white">• {r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Complexity */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-adv-gray">Estimated complexity:</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            plan.estimated_complexity === 'small' ? 'bg-adv-green/10 text-adv-green' :
            plan.estimated_complexity === 'medium' ? 'bg-adv-gold/10 text-adv-gold' :
            'bg-adv-red/10 text-adv-red'
          }`}>
            {plan.estimated_complexity}
          </span>
        </div>
      </div>

      {/* Actions */}
      {!readonly && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onApprove}
            className="rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
          >
            Approve & Execute
          </button>
          <button
            onClick={onModify}
            className="rounded-lg border border-border bg-adv-dark px-4 py-2 text-xs text-adv-off-white hover:bg-adv-card transition-colors"
          >
            Modify Plan
          </button>
          <button
            onClick={() => onQuestion?.('')}
            className="ml-auto flex items-center gap-1 rounded-lg px-3 py-2 text-xs text-adv-gray hover:text-adv-teal transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Ask Question
          </button>
        </div>
      )}
    </div>
  );
}

function FileList({ icon, label, items, color }: { icon: React.ReactNode; label: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className={`mb-1 flex items-center gap-1 text-xs font-medium ${color}`}>
        {icon}{label} ({items.length})
      </h4>
      <ul className="space-y-0.5">
        {items.map((f, i) => (
          <li key={i} className="truncate font-mono text-[11px] text-adv-off-white">{f}</li>
        ))}
      </ul>
    </div>
  );
}
