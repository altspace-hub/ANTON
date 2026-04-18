/**
 * clang-tidy-adapter.ts — real Clang-tidy invocation.
 *
 * Detects `clang-tidy` on PATH; runs against the project's source tree with
 * a sensible default check set (cert-*, bugprone-*, cppcoreguidelines-*,
 * misc-*). Counts findings + critical (cert-* + sec-* + clang-analyzer-*)
 * findings; the latter trip a fail.
 *
 * Skips with install hint if clang-tidy is missing.
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { QualityAdapter } from '../quality-pipeline-service.js';
import { execFileP, detectToolVersion, workspacePathFor, pathExists } from './_shared.js';

const INSTALL_HINT = 'Install Clang-tidy via the LLVM toolchain. macOS: `brew install llvm`. Ubuntu: `apt install clang-tidy`. Windows: install LLVM from llvm.org/builds and add to PATH.';
const DEFAULT_CHECKS = '-*,cert-*,bugprone-*,cppcoreguidelines-*,misc-*,clang-analyzer-*';
const CRITICAL_PATTERNS = [/^cert-err/, /^cert-msc/, /^cert-fio/, /^clang-analyzer-security/, /^clang-analyzer-core/];

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string }> {
  const version = await detectToolVersion('clang-tidy');
  return { installed: version !== null, version, install_hint: INSTALL_HINT };
}

async function findSourceFiles(workspace: string): Promise<string[]> {
  const candidates = ['src', 'main'];
  const found: string[] = [];
  for (const sub of candidates) {
    const dir = path.join(workspace, sub);
    if (!(await pathExists(dir))) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && /\.(c|cc|cpp|cxx|h|hpp)$/i.test(e.name)) {
        found.push(path.join(dir, e.name));
      }
    }
  }
  return found;
}

const clangTidyAdapter: QualityAdapter = {
  gateKey: 'clang-tidy',
  displayLabel: 'Static Analysis (Clang-tidy)',
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
        summary: 'Clang-tidy not installed on this host — gate skipped.',
        details: { detect: det, install_hint: det.install_hint },
        durationMs: Date.now() - start,
      };
    }

    const workspace = workspacePathFor(project);
    const sources = await findSourceFiles(workspace);
    if (sources.length === 0) {
      return {
        outcome: 'skip', score: null,
        summary: `No C/C++ source files found under ${workspace}/{src,main} — nothing to analyse.`,
        details: { workspace, install_hint: 'Place source files under src/ or main/ and re-run.' },
        durationMs: Date.now() - start,
      };
    }

    try {
      const { stdout, stderr } = await execFileP('clang-tidy', [
        '--quiet',
        `--checks=${DEFAULT_CHECKS}`,
        ...sources,
      ], {
        timeout: 300_000,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
      const output = stdout + '\n' + stderr;

      // Findings format: <file>:<line>:<col>: warning: <text> [<check-name>]
      const findingRe = /:\d+:\d+:\s+(warning|error):\s+.*\[([a-z0-9.\-]+)\]/g;
      const findings: Array<{ severity: string; check: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = findingRe.exec(output)) !== null) {
        findings.push({ severity: m[1], check: m[2] });
      }
      const critical = findings.filter(f => CRITICAL_PATTERNS.some(p => p.test(f.check))).length;
      const totalCount = findings.length;

      const outcome: 'pass' | 'warn' | 'fail' =
        critical > 0 ? 'fail' :
        totalCount > 5 ? 'warn' :
        'pass';
      const score = Math.max(0, 100 - totalCount * 5 - critical * 25);

      return {
        outcome, score,
        summary: outcome === 'pass'
          ? `Clean: ${totalCount} non-critical finding${totalCount === 1 ? '' : 's'}.`
          : outcome === 'warn'
          ? `${totalCount} findings (none critical) — review before shipping.`
          : `${critical} critical finding${critical === 1 ? '' : 's'} blocking ship.`,
        details: {
          tool_version: det.version,
          workspace,
          analyzed_file_count: sources.length,
          findings_count: totalCount,
          critical_count: critical,
          findings_by_check: Object.fromEntries(
            findings.reduce((map, f) => map.set(f.check, (map.get(f.check) ?? 0) + 1), new Map<string, number>()),
          ),
          stdout_tail: output.split('\n').slice(-25).join('\n'),
        },
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        outcome: 'error', score: 0,
        summary: `Clang-tidy invocation failed: ${message.slice(0, 200)}`,
        details: { tool_version: det.version, error: message },
        durationMs: Date.now() - start,
      };
    }
  },
};

export default clangTidyAdapter;
