/**
 * WorkspaceTestPanel — Wave 5.2 approval-gated REAL test execution.
 *
 * Two-step by design: the button expands into a confirmation that shows the
 * exact command + working directory and says plainly that this executes the
 * user-configured command (arbitrary code execution by design). Results are
 * real: exit code, duration, output tail — never LLM-claimed numbers.
 */
import { useCallback, useState } from 'react';
import {
  TestTube, CheckCircle2, XCircle, Loader2, ShieldAlert, Clock, Wrench,
} from 'lucide-react';
import type { WorkspaceTestRunResult } from '@/lib/coding-types';

function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface WorkspaceTestPanelProps {
  projectId: string;
  taskId?: string;
  releaseId?: string;
  testCommand: string[] | null;
  workspacePath: string | null;
  /** Called with the real result; the parent offers the revise round on failure. */
  onResult?: (result: WorkspaceTestRunResult) => void;
}

export default function WorkspaceTestPanel({
  projectId, taskId, releaseId, testCommand, workspacePath, onResult,
}: WorkspaceTestPanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkspaceTestRunResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/tests/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          approved: true, // set by THIS explicit confirmation click
          coding_task_id: taskId || null,
          coding_release_id: releaseId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test run failed to start');
      setResult(data as WorkspaceTestRunResult);
      setConfirming(false);
      onResult?.(data as WorkspaceTestRunResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test run failed to start');
    } finally {
      setRunning(false);
    }
  }, [projectId, taskId, releaseId, onResult]);

  if (!testCommand || testCommand.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-adv-dark px-3 py-2 text-xs text-adv-gray">
        <Wrench className="mr-1 inline h-3 w-3" />
        Tests: not configured. Set a test command (argv array) in the project's Workspace settings to verify changes with a real run.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-adv-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
          <TestTube className="h-4 w-4 text-adv-teal" /> Run project tests
        </h3>
        <p className="mt-0.5 font-mono text-[11px] text-adv-gray">
          {testCommand.join(' ')} <span className="font-sans">in</span> {workspacePath || 'workspace'}
        </p>
      </div>

      <div className="space-y-3 p-4">
        {result && (
          <div className={`rounded-lg border p-3 ${result.passed ? 'border-adv-green/30 bg-adv-green/5' : 'border-adv-red/30 bg-adv-red/5'}`}>
            <div className={`flex items-center gap-1.5 text-xs font-medium ${result.passed ? 'text-adv-green' : 'text-adv-red'}`}>
              {result.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {result.verification}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-adv-gray">
              <span>exit {result.exit_code ?? '?'}</span>
              <span><Clock className="mr-0.5 inline h-3 w-3" />{Math.round(result.duration_ms / 100) / 10}s</span>
              {result.summary_recognized && (
                <span>{result.pass_count} passed · {result.fail_count} failed{result.skip_count ? ` · ${result.skip_count} skipped` : ''}</span>
              )}
            </div>
            {result.hint && <p className="mt-1.5 text-xs text-adv-gold">{result.hint}</p>}
            {result.output_tail && (
              <div className="mt-2">
                <button onClick={() => setShowOutput((v) => !v)} className="text-[11px] text-adv-teal hover:underline">
                  {showOutput ? 'Hide output' : 'Show output'}
                </button>
                {showOutput && (
                  <pre className="mt-1 max-h-[280px] overflow-auto rounded-lg border border-border bg-adv-dark p-2 font-mono text-[11px] leading-snug text-adv-off-white whitespace-pre-wrap">
                    {result.output_tail}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-1.5 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">
            <XCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={running}
            className="flex items-center gap-1.5 rounded-lg border border-adv-teal px-4 py-2 text-xs font-medium text-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-50"
          >
            <TestTube className="h-3.5 w-3.5" /> {result ? 'Run tests again…' : 'Run tests…'}
          </button>
        ) : (
          <div className="rounded-lg border border-adv-gold/30 bg-adv-gold/5 p-3 space-y-2">
            <div className="flex items-start gap-1.5 text-xs text-adv-off-white">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-gold" />
              <span>
                This executes <span className="font-mono">{testCommand.join(' ')}</span> in{' '}
                <span className="font-mono">{workspacePath || 'the workspace'}</span> — the command you configured,
                which can do anything code can do (arbitrary code execution by design).
                It runs without a shell, with a minimal environment, and is killed after 5 minutes.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRun}
                disabled={running}
                className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
              >
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {running ? 'Running…' : 'Approve & run'}
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={running}
                className="rounded-lg border border-border px-4 py-2 text-xs text-adv-gray hover:text-adv-off-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
