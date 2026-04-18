/**
 * cyclonedx-sbom-adapter.ts — real CycloneDX SBOM generation.
 *
 * Tries `cyclonedx-cli` first (preferred — broader scanner support); falls
 * back to `cyclonedx-bom` (the original Python CLI). Either tool produces a
 * CycloneDX 1.5 JSON SBOM that we count components from.
 *
 * Skips with install hint if neither tool is present.
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { QualityAdapter } from '../quality-pipeline-service.js';
import { execFileP, detectToolVersion, workspacePathFor, pathExists } from './_shared.js';

const INSTALL_HINT = 'Install one of: `cyclonedx-cli` (https://github.com/CycloneDX/cyclonedx-cli/releases), `cyclonedx-py` (`pip install cyclonedx-bom`), or `@cyclonedx/cyclonedx-npm` (`npm i -g @cyclonedx/cyclonedx-npm`). Re-run once on PATH.';

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string; tool_used?: 'cli' | 'py' | 'npm' }> {
  const cli = await detectToolVersion('cyclonedx-cli');
  if (cli) return { installed: true, version: cli, install_hint: INSTALL_HINT, tool_used: 'cli' };
  const py = await detectToolVersion('cyclonedx-py');
  if (py) return { installed: true, version: py, install_hint: INSTALL_HINT, tool_used: 'py' };
  const npm = await detectToolVersion('cyclonedx-npm');
  if (npm) return { installed: true, version: npm, install_hint: INSTALL_HINT, tool_used: 'npm' };
  return { installed: false, version: null, install_hint: INSTALL_HINT };
}

const cyclonedxSbomAdapter: QualityAdapter = {
  gateKey: 'cyclonedx-sbom',
  displayLabel: 'Software Bill of Materials (CycloneDX)',
  isMandatory: true,
  kind: 'real',
  version: '0.2.0',
  appliesTo: () => true,
  run: async ({ project }) => {
    const start = Date.now();
    const det = await detect();
    if (!det.installed) {
      return {
        outcome: 'skip', score: null,
        summary: 'No CycloneDX SBOM tool found on this host — gate skipped.',
        details: { detect: det, install_hint: det.install_hint },
        durationMs: Date.now() - start,
      };
    }

    const workspace = workspacePathFor(project);
    if (!(await pathExists(workspace))) {
      return {
        outcome: 'skip', score: null,
        summary: `Workspace directory ${workspace} does not exist yet.`,
        details: { workspace },
        durationMs: Date.now() - start,
      };
    }

    const outFile = path.join(workspace, '.anton-sbom.json');
    let cmd: string; let args: string[];
    switch (det.tool_used) {
      case 'cli':
        cmd = 'cyclonedx-cli';
        args = ['add', 'files', '--input-files', `${workspace}/**`, '--output-file', outFile, '--output-format', 'json'];
        break;
      case 'py':
        cmd = 'cyclonedx-py';
        args = ['environment', '--output-format', 'json', '--output-file', outFile];
        break;
      case 'npm':
        cmd = 'cyclonedx-npm';
        args = ['--output-file', outFile, '--output-format', 'JSON'];
        break;
      default:
        cmd = 'cyclonedx-cli';
        args = ['--help'];
    }

    try {
      await execFileP(cmd, args, {
        timeout: 180_000,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        cwd: workspace,
      });
      const sbomBytes = await fs.readFile(outFile, 'utf-8').catch(() => '{}');
      const sbom = (() => { try { return JSON.parse(sbomBytes); } catch { return {}; } })() as { components?: Array<{ type?: string; name?: string; version?: string }>; specVersion?: string };
      const componentCount = sbom.components?.length ?? 0;
      const sample = (sbom.components ?? []).slice(0, 5).map(c => ({ type: c.type, name: c.name, version: c.version }));

      return {
        outcome: 'pass', score: 100,
        summary: `SBOM generated. ${componentCount} component${componentCount === 1 ? '' : 's'} catalogued (CycloneDX ${sbom.specVersion ?? '1.5'}).`,
        details: {
          tool: det.tool_used,
          tool_version: det.version,
          workspace,
          sbom_path: outFile,
          spec_version: sbom.specVersion ?? '1.5',
          component_count: componentCount,
          sample_components: sample,
        },
        durationMs: Date.now() - start,
        evidenceRef: outFile,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        outcome: 'error', score: 0,
        summary: `CycloneDX (${det.tool_used}) failed: ${message.slice(0, 200)}`,
        details: { tool: det.tool_used, tool_version: det.version, error: message },
        durationMs: Date.now() - start,
      };
    }
  },
};

export default cyclonedxSbomAdapter;
