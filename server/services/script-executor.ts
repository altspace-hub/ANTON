import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ScriptExecutionResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  outputFilePath?: string;
  durationMs: number;
}

export interface ScriptExecutionConfig {
  language: 'node' | 'python' | 'bash';
  scriptContent: string;
  outputDir: string;
  timeoutMs?: number;       // default 60000
  memoryLimitMb?: number;   // default 512
  env?: Record<string, string>;
}

export async function executeScript(config: ScriptExecutionConfig): Promise<ScriptExecutionResult> {
  const {
    language,
    scriptContent,
    outputDir,
    timeoutMs = 60000,
    env = {},
  } = config;

  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  // Write script to temp file
  // Use .cjs for Node scripts because package.json has "type": "module",
  // which would treat .js files as ES modules (incompatible with require() scripts)
  const ext = language === 'node' ? '.cjs' : language === 'python' ? '.py' : '.sh';
  const scriptId = randomUUID();
  const scriptPath = path.join(outputDir, `_temp_script_${scriptId}${ext}`);
  await writeFile(scriptPath, scriptContent, 'utf-8');

  // On Windows, Python is 'python' not 'python3'. Try 'python3' first, fall back to 'python'.
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const command = language === 'node' ? 'node' : language === 'python' ? pythonCmd : 'bash';
  const startTime = Date.now();

  return new Promise<ScriptExecutionResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn(command, [scriptPath], {
      cwd: outputDir,
      env: { ...process.env, ...env },
      timeout: timeoutMs,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', async (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      // Clean up temp script file
      try { await unlink(scriptPath); } catch { /* ignore */ }

      // Extract output file path from stdout (convention: PPTX_OUTPUT_PATH:<path>)
      // Validate that the claimed path stays within the expected output directory
      // to prevent a compromised script from redirecting to arbitrary filesystem paths.
      let outputFilePath: string | undefined;
      const pathMatch = stdout.match(/PPTX_OUTPUT_PATH:(.+)/);
      if (pathMatch) {
        const candidate = pathMatch[1].trim();
        const resolvedCandidate = path.resolve(candidate);
        const resolvedOutputDir = path.resolve(config.outputDir);
        if (
          resolvedCandidate.startsWith(resolvedOutputDir + path.sep) ||
          resolvedCandidate === resolvedOutputDir
        ) {
          outputFilePath = resolvedCandidate;
        } else {
          console.warn(
            `[script-executor] Output path "${candidate}" is outside outputDir "${config.outputDir}" — ignoring`
          );
        }
      }

      resolve({
        success: code === 0 && !killed,
        exitCode: code ?? -1,
        stdout,
        stderr,
        outputFilePath,
        durationMs,
      });
    });

    proc.on('error', async (err) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      try { await unlink(scriptPath); } catch { /* ignore */ }
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: stderr + '\n' + err.message,
        durationMs,
      });
    });
  });
}
