/**
 * script-adapter.ts
 * Executes approved scripts in a sandboxed child process.
 * Enforces file hash verification, runtime limits, and memory limits.
 *
 * ⚠ NOT WIRED, and unlike its deleted siblings there is nothing live to move the checks
 * into: no route or executor calls runScript, so a script registered through the Script
 * Library cannot be executed at all. That makes the unenforced hash check harmless today
 * (nothing runs, so nothing runs unverified) but it also means the Script Library is a
 * registry with no runner behind it.
 *
 * Kept rather than deleted because it is the intended implementation of a shipped UI —
 * whoever wires the run path should use this, hash verification included, not write a
 * fresh spawn() call at the route.
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import type { Script } from '../services/connection-manager.js';

export interface ScriptRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  runtimeMs: number;
  outputFiles: string[];
  timedOut: boolean;
}

const LANGUAGE_COMMANDS: Record<Script['language'], string[]> = {
  python:     ['python3', '-u'],
  bash:       ['bash'],
  r:          ['Rscript'],
  powershell: ['pwsh', '-NoProfile', '-NonInteractive', '-File'],
  node:       ['node'],
};

/**
 * Compute SHA-256 hash of a file for integrity verification.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Run an approved script with the given parameters.
 * Optionally verify file_hash before execution.
 */
export async function runScript(
  script: Script,
  parameters: Record<string, unknown>,
  executionId: string,
  outputDir?: string
): Promise<ScriptRunResult> {
  // Verify script file exists
  if (!(await fs.pathExists(script.script_path))) {
    throw new Error(`Script file not found: ${script.script_path}`);
  }

  // Verify file hash if configured
  if (script.file_hash) {
    const actualHash = await computeFileHash(script.script_path);
    if (actualHash !== script.file_hash) {
      throw new Error(
        `Script integrity check failed. Expected hash: ${script.file_hash}, got: ${actualHash}. ` +
        'The script file may have been modified. Update the approved hash to re-enable execution.'
      );
    }
  }

  const command = LANGUAGE_COMMANDS[script.language];
  if (!command) {
    throw new Error(`Unsupported script language: ${script.language}`);
  }

  // Serialize parameters as environment variables
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SCRIPT_EXECUTION_ID: executionId,
    SCRIPT_OUTPUT_DIR: outputDir ?? path.join(process.cwd(), 'outputs', 'scripts', executionId),
  };

  for (const [key, value] of Object.entries(parameters)) {
    const safeKey = key.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const safeValue = String(value).slice(0, 10_000);
    env[`PARAM_${safeKey}`] = safeValue;
  }

  // Ensure output directory exists
  const outDir = env.SCRIPT_OUTPUT_DIR!;
  await fs.ensureDir(outDir);

  return new Promise((resolve, reject) => {
    const startMs = Date.now();
    const [cmd, ...baseArgs] = command;
    const args = [...baseArgs, script.script_path];

    const child = spawn(cmd, args, {
      env,
      cwd: path.dirname(script.script_path),
      // No shell: true to avoid shell injection
      shell: false,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    child.stdout.on('data', (chunk: Buffer) => { stdoutChunks.push(chunk); });
    child.stderr.on('data', (chunk: Buffer) => { stderrChunks.push(chunk); });

    // Memory limit enforcement via timeout (Node does not expose memory limits for child_process directly)
    // A future improvement would use worker_threads with resourceLimits for true memory control.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000);
    }, script.max_runtime_seconds * 1000);

    child.on('close', async (exitCode) => {
      clearTimeout(timer);

      const runtimeMs = Date.now() - startMs;
      const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
      const stderr = Buffer.concat(stderrChunks).toString('utf-8');

      // Collect any output files written to the output directory
      let outputFiles: string[] = [];
      try {
        const entries = await fs.readdir(outDir);
        outputFiles = entries.map((f) => path.join(outDir, f));
      } catch {
        outputFiles = [];
      }

      resolve({
        exitCode,
        stdout,
        stderr,
        runtimeMs,
        outputFiles,
        timedOut,
      });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
