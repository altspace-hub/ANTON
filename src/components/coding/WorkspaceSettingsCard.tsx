/**
 * WorkspaceSettingsCard — Wave 5.2 workspace binding + test command config.
 *
 * Binding is security-gated: the server validates the directory against
 * ALLOWED_FOLDER_PATHS at bind time and again on every use. The test command
 * is stored as an argv ARRAY (command + args) and always runs via execFile —
 * never a shell — after an explicit per-run approval.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  FolderOpen, CheckCircle2, XCircle, Loader2, TestTube, ShieldCheck, Save, Database, Sparkles,
} from 'lucide-react';
import type { WorkspaceStatus } from '@/lib/coding-types';

function getAuthHeader(): Record<string, string> {
  const t = localStorage.getItem('openexpert-token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Metadata returned by /workspace/provision and /commands (no secrets). */
interface ProvisionedDatabase {
  db_name: string;
  role_name: string;
  scope?: string;
  provisioned_at?: string | null;
}

/** Split a command line on spaces into argv. No shell quoting — spaces always split. */
function splitArgv(input: string): string[] {
  return input.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

interface WorkspaceSettingsCardProps {
  projectId: string;
  onChanged?: () => void;
}

export default function WorkspaceSettingsCard({ projectId, onChanged }: WorkspaceSettingsCardProps) {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [commandInput, setCommandInput] = useState('');
  const [savingPath, setSavingPath] = useState(false);
  const [savingCommand, setSavingCommand] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathAllowedBases, setPathAllowedBases] = useState<string[]>([]);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandSaved, setCommandSaved] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [database, setDatabase] = useState<ProvisionedDatabase | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/workspace`, { headers: getAuthHeader() });
      if (!res.ok) return;
      const data = await res.json() as WorkspaceStatus;
      setStatus(data);
      setPathInput(data.directory_path || '');
      setCommandInput((data.test_command || []).join(' '));
    } catch { /* silently handle */ }
    // The provisioned DB scope (metadata only — never a DSN/password).
    try {
      const cmdRes = await fetch(`/api/coding/projects/${projectId}/commands`, { headers: getAuthHeader() });
      if (cmdRes.ok) {
        const cmd = await cmdRes.json() as { database: ProvisionedDatabase | null };
        setDatabase(cmd.database ?? null);
      }
    } catch { /* silently handle */ }
  }, [projectId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Activation: create coding-studio/<project>/ + a private Postgres database.
  const handleProvision = useCallback(async () => {
    setProvisioning(true);
    setProvisionError(null);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/workspace/provision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setProvisionError(data.error || 'Failed to create studio workspace');
        return;
      }
      await fetchStatus();
      onChanged?.();
    } catch {
      setProvisionError('Could not reach the server.');
    } finally {
      setProvisioning(false);
    }
  }, [projectId, fetchStatus, onChanged]);

  const handleBind = useCallback(async () => {
    setSavingPath(true);
    setPathError(null);
    setPathAllowedBases([]);
    try {
      const res = await fetch(`/api/coding/projects/${projectId}/workspace`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ directory_path: pathInput.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPathError(data.error || 'Failed to bind workspace');
        if (data.validation?.allowedBases) setPathAllowedBases(data.validation.allowedBases);
        return;
      }
      await fetchStatus();
      onChanged?.();
    } catch {
      setPathError('Could not reach the server.');
    } finally {
      setSavingPath(false);
    }
  }, [projectId, pathInput, fetchStatus, onChanged]);

  const handleSaveCommand = useCallback(async () => {
    setSavingCommand(true);
    setCommandError(null);
    setCommandSaved(false);
    try {
      const argv = splitArgv(commandInput);
      const res = await fetch(`/api/coding/projects/${projectId}/test-command`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ argv: argv.length === 0 ? null : argv }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommandError(data.error || 'Failed to save test command');
        return;
      }
      setCommandSaved(true);
      await fetchStatus();
      onChanged?.();
    } catch {
      setCommandError('Could not reach the server.');
    } finally {
      setSavingCommand(false);
    }
  }, [projectId, commandInput, fetchStatus, onChanged]);

  const argvPreview = splitArgv(commandInput);
  const bound = !!status?.bound && !!status?.validation?.ok;

  return (
    <div className="rounded-lg border border-border bg-adv-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-adv-white">
          <FolderOpen className="h-4 w-4 text-adv-teal" /> Workspace
        </h2>
        {status && (
          bound ? (
            <span className="flex items-center gap-1 rounded-full bg-adv-green/10 px-2.5 py-0.5 text-xs font-medium text-adv-green">
              <CheckCircle2 className="h-3 w-3" /> bound
            </span>
          ) : (
            <span className="rounded-full bg-adv-dark px-2.5 py-0.5 text-xs font-medium text-adv-gray">not bound</span>
          )
        )}
      </div>
      <p className="mt-1 text-xs text-adv-gray">
        Bind a local directory so approved task output is written to real files (with backups) and tests run for real.
        The directory must be inside <span className="font-mono">ALLOWED_FOLDER_PATHS</span>.
      </p>

      {/* ANTON Studio activation — one click creates the scoped folder + private DB */}
      <div className="mt-3 rounded-lg border border-adv-teal/30 bg-adv-teal/5 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-adv-teal">
          <Sparkles className="h-3.5 w-3.5" /> ANTON Studio workspace
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-adv-gray">
          Create a managed workspace: ANTON Studio gets its own folder under{' '}
          <span className="font-mono">coding-studio/&lt;project&gt;/</span> and a{' '}
          <span className="font-medium text-adv-off-white">private Postgres database</span>. It can read/write files in
          that folder and use that database — <span className="font-medium text-adv-off-white">it cannot touch the rest of
          ANTON or your home folder.</span>
        </p>
        {database ? (
          <div className="mt-2 space-y-1 rounded-lg border border-border bg-adv-dark px-3 py-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-adv-green">
              <CheckCircle2 className="h-3.5 w-3.5" /> Studio workspace active
            </div>
            {status?.validation?.resolved && (
              <div className="text-adv-gray">
                Folder: <span className="font-mono text-adv-off-white">{status.validation.resolved}</span> <span className="text-adv-gray">(read-only — granted)</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-adv-gray">
              <Database className="h-3 w-3" /> Private DB:{' '}
              <span className="font-mono text-adv-off-white">{database.db_name}</span>{' '}
              <span className="text-adv-gray">(role <span className="font-mono">{database.role_name}</span>)</span>
            </div>
          </div>
        ) : (
          <button
            onClick={handleProvision}
            disabled={provisioning}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Create studio workspace
          </button>
        )}
        {provisionError && (
          <div className="mt-2 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-[11px] text-adv-red">
            {provisionError}
          </div>
        )}
      </div>

      {/* Bind status problem (e.g. allowlist changed since binding) */}
      {status?.bound && !status.validation.ok && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{status.validation.error}</span>
        </div>
      )}

      {/* Directory binding */}
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-adv-gray">Workspace directory (absolute path)</label>
        <div className="flex gap-2">
          <input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="C:\\projects\\my-app"
            className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 font-mono text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
          />
          <button
            onClick={handleBind}
            disabled={savingPath}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-2 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
          >
            {savingPath ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {pathInput.trim() ? 'Bind' : 'Unbind'}
          </button>
        </div>
        {pathError && (
          <div className="mt-1.5 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">
            {pathError}
            {pathAllowedBases.length > 0 && (
              <div className="mt-1 text-adv-gray">
                Allowed base directories:
                <ul className="mt-0.5">
                  {pathAllowedBases.map((b) => <li key={b} className="font-mono">{b}</li>)}
                </ul>
              </div>
            )}
            {pathAllowedBases.length === 0 && pathError.includes('ALLOWED_FOLDER_PATHS') && (
              <div className="mt-1 text-adv-gray">
                Add the directory (or a parent) to <span className="font-mono">ALLOWED_FOLDER_PATHS</span> in your .env, then restart the server.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Test command */}
      <div className="mt-4 border-t border-border pt-4">
        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-adv-gray">
          <TestTube className="h-3.5 w-3.5" /> Test command (runs via execFile — no shell)
        </label>
        <div className="flex gap-2">
          <input
            value={commandInput}
            onChange={(e) => { setCommandInput(e.target.value); setCommandSaved(false); }}
            placeholder="node --run test"
            className="flex-1 rounded-lg border border-border bg-adv-dark px-3 py-2 font-mono text-xs text-adv-off-white placeholder:text-adv-gray focus:border-adv-teal focus:outline-none"
          />
          <button
            onClick={handleSaveCommand}
            disabled={savingCommand}
            className="flex items-center gap-1.5 rounded-lg border border-adv-teal px-4 py-2 text-xs font-medium text-adv-teal hover:bg-adv-teal/10 transition-colors disabled:opacity-50"
          >
            {savingCommand ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
        {argvPreview.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-adv-gray">argv:</span>
            {argvPreview.map((a, i) => (
              <span key={i} className="rounded bg-adv-dark px-1.5 py-0.5 font-mono text-[11px] text-adv-off-white">{a}</span>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-adv-gray">
          Split on spaces into command + arguments — no shell quoting, pipes, or &amp;&amp;. On Windows, npm/pnpm shims cannot
          be spawned without a shell: use <span className="font-mono">node --run test</span> (Node 22+) or the runner binary,
          e.g. <span className="font-mono">node node_modules/vitest/vitest.mjs run</span>. Every run requires your explicit
          approval — it executes this command in the workspace.
        </p>
        {commandError && (
          <div className="mt-1.5 rounded-lg border border-adv-red/30 bg-adv-red/5 px-3 py-2 text-xs text-adv-red">{commandError}</div>
        )}
        {commandSaved && (
          <div className="mt-1.5 flex items-center gap-1 text-xs text-adv-green">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </div>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 border-t border-border pt-3 text-[11px] text-adv-gray">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-adv-teal" />
        Every write is preceded by a reviewable diff and your approval; originals are backed up to
        <span className="ml-1 font-mono">.anton-coding-backup/</span> inside the workspace. Test runs use a minimal
        environment (no API keys or server secrets) and a 5-minute timeout.
      </p>
    </div>
  );
}
