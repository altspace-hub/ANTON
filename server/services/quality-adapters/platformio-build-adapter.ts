/**
 * platformio-build-adapter.ts — real PlatformIO build invocation.
 *
 * Detects `pio` (PlatformIO Core CLI) on PATH; runs `pio run` against the
 * project's workspace; parses output for build success + flash/RAM usage +
 * warning count.
 *
 * Skips with a clear install hint if PlatformIO is not installed, so the
 * pipeline still produces a coherent report even on a fresh box.
 */

import type { QualityAdapter } from '../quality-pipeline-service.js';
import { execFileP, detectToolVersion, workspacePathFor, pathExists } from './_shared.js';

const INSTALL_HINT = 'Install PlatformIO Core: `pip install -U platformio` (or via the PlatformIO IDE installer at platformio.org). Re-run the pipeline once `pio --version` succeeds.';

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string }> {
  const version = await detectToolVersion('pio');
  return {
    installed: version !== null,
    version,
    install_hint: INSTALL_HINT,
  };
}

const platformioBuildAdapter: QualityAdapter = {
  gateKey: 'platformio-build',
  displayLabel: 'PlatformIO Build',
  isMandatory: true,
  kind: 'real',
  version: '0.2.0',
  appliesTo: () => true,
  run: async ({ project }) => {
    const start = Date.now();
    const det = await detect();
    if (!det.installed) {
      return {
        outcome: 'skip',
        score: null,
        summary: 'PlatformIO not installed on this host — gate skipped.',
        details: { detect: det, install_hint: det.install_hint },
        durationMs: Date.now() - start,
      };
    }

    const workspace = workspacePathFor(project);
    const platformioIni = `${workspace}/platformio.ini`;
    if (!(await pathExists(platformioIni))) {
      return {
        outcome: 'skip',
        score: null,
        summary: `No platformio.ini at ${workspace} — workspace not initialised yet.`,
        details: {
          workspace,
          install_hint: 'Run `pio project init --board esp32dev --project-dir <workspace>` to create the workspace, then re-run.',
        },
        durationMs: Date.now() - start,
      };
    }

    try {
      const { stdout, stderr } = await execFileP('pio', ['run', '--project-dir', workspace], {
        timeout: 600_000,        // 10 minutes — first build can be slow
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
      const output = stdout + '\n' + stderr;

      // Parse common PlatformIO build summary patterns
      const flashMatch = output.match(/Flash:\s+\[\s*=*\s*\]\s+(\d+(?:\.\d+)?)%/);
      const ramMatch   = output.match(/RAM:\s+\[\s*=*\s*\]\s+(\d+(?:\.\d+)?)%/);
      const warningCount = (output.match(/warning:/gi) ?? []).length;
      const errorCount = (output.match(/error:/gi) ?? []).length;

      const flashUsed = flashMatch ? Number(flashMatch[1]) : null;
      const ramUsed = ramMatch ? Number(ramMatch[1]) : null;

      const outcome: 'pass' | 'warn' | 'fail' =
        errorCount > 0 ? 'fail' :
        (flashUsed !== null && flashUsed > 90) || warningCount > 5 ? 'warn' :
        'pass';

      return {
        outcome,
        score: flashUsed !== null ? Math.max(0, Math.round(100 - flashUsed)) : (outcome === 'pass' ? 90 : null),
        summary: outcome === 'pass'
          ? `Build OK${flashUsed !== null ? ` — Flash ${flashUsed}%, RAM ${ramUsed ?? '?'}%` : ''}, ${warningCount} warnings.`
          : outcome === 'warn'
          ? `Build OK with ${warningCount} warnings${flashUsed !== null && flashUsed > 90 ? ` and tight flash usage (${flashUsed}%)` : ''}.`
          : `Build FAILED — ${errorCount} error(s), ${warningCount} warning(s). See evidence_ref for full output.`,
        details: {
          tool_version: det.version,
          workspace,
          flash_used_percent: flashUsed,
          ram_used_percent: ramUsed,
          warnings_count: warningCount,
          errors_count: errorCount,
          stdout_tail: output.split('\n').slice(-20).join('\n'),
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        outcome: 'error',
        score: 0,
        summary: `PlatformIO invocation failed: ${message.slice(0, 200)}`,
        details: { tool_version: det.version, error: message },
        durationMs: Date.now() - start,
      };
    }
  },
};

export default platformioBuildAdapter;
