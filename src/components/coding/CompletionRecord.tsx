import { FileCode, TestTube, GitCommit, Clock, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import type { CompletionRecord as CompletionRecordType } from '@/lib/coding-types';

interface CompletionRecordProps {
  record: CompletionRecordType;
  className?: string;
}

export default function CompletionRecord({ record, className = '' }: CompletionRecordProps) {
  const totalTests = record.tests_passed + record.tests_failed;

  return (
    <div className={`rounded-lg border border-border bg-adv-card ${className}`}>
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-adv-white">Completion Record</h3>
        <p className="mt-0.5 text-xs text-adv-gray">Audit trail for this task</p>
      </div>

      <div className="space-y-4 p-4">
        {/* Files Summary */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={<FileCode className="h-4 w-4 text-adv-green" />}
            label="Created"
            value={record.files_created.length}
            color="text-adv-green"
          />
          <StatCard
            icon={<FileCode className="h-4 w-4 text-adv-gold" />}
            label="Modified"
            value={record.files_modified.length}
            color="text-adv-gold"
          />
          <StatCard
            icon={<FileCode className="h-4 w-4 text-adv-red" />}
            label="Deleted"
            value={record.files_deleted.length}
            color="text-adv-red"
          />
        </div>

        {/* Test Results */}
        {totalTests > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-adv-gray">
              <TestTube className="h-3 w-3" />Tests
            </h4>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-sm">
                <CheckCircle2 className="h-4 w-4 text-adv-green" />
                <span className="font-medium text-adv-green">{record.tests_passed}</span>
                <span className="text-xs text-adv-gray">passed</span>
              </div>
              {record.tests_failed > 0 && (
                <div className="flex items-center gap-1 text-sm">
                  <XCircle className="h-4 w-4 text-adv-red" />
                  <span className="font-medium text-adv-red">{record.tests_failed}</span>
                  <span className="text-xs text-adv-gray">failed</span>
                </div>
              )}
              {/* Progress bar */}
              <div className="ml-auto flex h-2 w-24 overflow-hidden rounded-full bg-adv-dark">
                <div className="bg-adv-green" style={{ width: `${(record.tests_passed / totalTests) * 100}%` }} />
                <div className="bg-adv-red" style={{ width: `${(record.tests_failed / totalTests) * 100}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Git Info */}
        {record.git_commit_hash && (
          <div className="flex items-center gap-2">
            <GitCommit className="h-3.5 w-3.5 text-adv-gray" />
            <span className="font-mono text-xs text-adv-off-white">{record.git_commit_hash.slice(0, 8)}</span>
          </div>
        )}

        {/* Decisions */}
        {record.decisions_made.length > 0 && (
          <div>
            <h4 className="mb-2 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-adv-gray">
              <MessageSquare className="h-3 w-3" />Decisions ({record.decisions_made.length})
            </h4>
            <div className="space-y-2">
              {record.decisions_made.map((d, i) => (
                <div key={i} className="rounded border border-border bg-adv-dark p-2.5">
                  <p className="text-xs font-medium text-adv-off-white">{d.question}</p>
                  <p className="mt-1 text-xs text-adv-teal">{d.decision}</p>
                  <p className="mt-0.5 text-[11px] text-adv-gray">{d.rationale}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Duration */}
        {record.duration_ms && (
          <div className="flex items-center gap-1 text-xs text-adv-gray">
            <Clock className="h-3 w-3" />
            Completed in {Math.round(record.duration_ms / 1000)}s
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded border border-border bg-adv-dark px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1">{icon}<span className={`text-lg font-bold ${color}`}>{value}</span></div>
      <span className="text-[10px] text-adv-gray">{label}</span>
    </div>
  );
}
