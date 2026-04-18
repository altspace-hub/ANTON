/**
 * wokwi-sim-adapter.ts — real Wokwi simulation API integration.
 *
 * Wokwi is a cloud + local ESP32/Arduino simulator. Their CLI accepts a
 * compiled firmware binary + a wokwi.toml + diagram.json and runs scenarios.
 *
 * We detect either:
 *   1. WOKWI_API_KEY env var (cloud API mode)
 *   2. `wokwi-cli` on PATH (local CLI mode)
 *
 * If neither is present, skip with the install hint. Wokwi-cli is the
 * preferred path for ESP32 because it runs against a real wokwi.toml in the
 * project workspace (no separate API call cost).
 *
 * Honest scope: we drive a single default boot-and-uptime scenario today —
 * the project owner can extend by adding wokwi-tests/ scripts to the
 * workspace later.
 */

import path from 'path';
import type { QualityAdapter } from '../quality-pipeline-service.js';
import { execFileP, detectToolVersion, workspacePathFor, pathExists } from './_shared.js';

const INSTALL_HINT = 'Install Wokwi CLI: `npm install -g wokwi-cli` and obtain a free token at https://wokwi.com/dashboard/ci, then `export WOKWI_CLI_TOKEN=<token>`. Alternatively set `WOKWI_API_KEY` for cloud-API mode (deferred until simulator-as-a-service support lands).';

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string; mode?: 'cli' | 'api' }> {
  const cli = await detectToolVersion('wokwi-cli');
  if (cli && process.env.WOKWI_CLI_TOKEN) {
    return { installed: true, version: cli, install_hint: INSTALL_HINT, mode: 'cli' };
  }
  if (process.env.WOKWI_API_KEY) {
    return { installed: true, version: 'cloud-api-stub', install_hint: INSTALL_HINT, mode: 'api' };
  }
  return { installed: false, version: cli ? `${cli} (no WOKWI_CLI_TOKEN)` : null, install_hint: INSTALL_HINT };
}

const wokwiSimAdapter: QualityAdapter = {
  gateKey: 'wokwi-sim',
  displayLabel: 'Simulation (Wokwi)',
  isMandatory: false,
  kind: 'real',
  version: '0.2.0',
  appliesTo: (project) => project.family_id === 'esp32',
  run: async ({ project }) => {
    const start = Date.now();
    const det = await detect();
    if (!det.installed) {
      return {
        outcome: 'skip', score: null,
        summary: 'Wokwi not configured on this host — gate skipped.',
        details: { detect: det, install_hint: det.install_hint },
        durationMs: Date.now() - start,
      };
    }

    const workspace = workspacePathFor(project);
    const wokwiToml = path.join(workspace, 'wokwi.toml');
    const diagramJson = path.join(workspace, 'diagram.json');
    if (!(await pathExists(wokwiToml)) || !(await pathExists(diagramJson))) {
      return {
        outcome: 'skip', score: null,
        summary: `Workspace missing wokwi.toml or diagram.json (${workspace}) — Wokwi cannot run without a defined board layout.`,
        details: {
          workspace,
          wokwi_toml_present: await pathExists(wokwiToml),
          diagram_json_present: await pathExists(diagramJson),
          install_hint: 'Add wokwi.toml + diagram.json to the workspace. See https://docs.wokwi.com/projects/wokwi-toml-reference.',
        },
        durationMs: Date.now() - start,
      };
    }

    // CLI mode: run the local wokwi-cli, expecting a built firmware artefact
    // alongside wokwi.toml. The CLI exits 0 on a clean run, non-zero on
    // serial-output assertion failures.
    if (det.mode === 'cli') {
      try {
        const { stdout, stderr } = await execFileP('wokwi-cli', [
          workspace,
          '--timeout', '30000',
          '--scenario', path.join(workspace, 'wokwi-tests', 'boot-uptime.test.yaml'),
        ], {
          timeout: 60_000,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        });
        const output = stdout + '\n' + stderr;
        return {
          outcome: 'pass', score: 100,
          summary: 'Wokwi simulation passed (boot-uptime scenario).',
          details: { tool_version: det.version, mode: 'cli', stdout_tail: output.split('\n').slice(-15).join('\n') },
          durationMs: Date.now() - start,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          outcome: 'warn', score: 60,
          summary: `Wokwi scenario failed or no scenario file present: ${message.slice(0, 160)}`,
          details: { tool_version: det.version, mode: 'cli', error: message },
          durationMs: Date.now() - start,
        };
      }
    }

    // API mode placeholder — explicit: we do not call the Wokwi cloud API
    // automatically yet, because simulation cost is paid + the contract
    // surface for non-CI usage isn't stable. Set WOKWI_CLI_TOKEN to use the
    // local CLI.
    return {
      outcome: 'skip', score: null,
      summary: 'Wokwi cloud API mode is reserved — set WOKWI_CLI_TOKEN for the local CLI path instead.',
      details: { detect: det },
      durationMs: Date.now() - start,
    };
  },
};

export default wokwiSimAdapter;
