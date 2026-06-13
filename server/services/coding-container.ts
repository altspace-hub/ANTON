/**
 * coding-container.ts — ANTON Studio Phase 6: CONTAINER ISOLATION (Docker).
 *
 * THE HONEST CEILING, made real (opt-in). The default Studio command path
 * (coding-workspace.ts runProjectTests) is execFile-in-a-local-process: the
 * sandbox network is NOT blocked and a hostile build.rs/setup.py/npm
 * postinstall runs arbitrary code ON THE HOST. This module provides the one
 * true host-isolation option: run the inner command inside `docker run` with
 * the workspace bind-mounted, network OFF by default, so hostile code runs in a
 * throwaway container rather than on the host.
 *
 * HONESTY RULES (load-bearing — do not soften):
 *   • This gives REAL host isolation ONLY when resolveExecution() returns
 *     mode:'docker'. That happens iff ALL THREE are true:
 *       1. the project opted in (environment_mode === 'docker'),
 *       2. the operator opted in (env CODING_STUDIO_DOCKER is on — default OFF),
 *       3. Docker is actually present + its daemon answers.
 *   • In EVERY other case mode:'local' is returned WITH A REASON, and the
 *     caller MUST run the existing unsandboxed execFile path and report
 *     "local — NOT isolated". We never silently claim isolation we don't have.
 *
 * SECURITY DISCIPLINE (matches coding-workspace.ts):
 *   • docker is invoked via execFile as an argv ARRAY — NEVER a shell string.
 *     No value is interpolated into a shell; nothing is shell-escaped because
 *     nothing reaches a shell.
 *   • The workspace mount source is re-validated against ALLOWED_FOLDER_PATHS
 *     (+ the studio root) before it is ever passed to `-v` — a path outside the
 *     allowlist is refused, never mounted.
 *   • The scoped PROJECT_DATABASE_URL is the ONLY secret passed in (via `-e`),
 *     and ONLY when provided. The host DATABASE_URL is never passed. The DSN is
 *     NEVER logged.
 */

import { execFile as nodeExecFile } from 'node:child_process';
import {
  getAllowedBases,
  PROJECT_DATABASE_URL_KEY,
  type ExecFileImpl,
  type ToolchainLanguage,
} from './coding-workspace.js';
import path from 'node:path';

// ── Env gate (operator opt-in) ──────────────────────────────────────────────

/** The env flag the operator sets to allow docker mode at all. Default OFF. */
export const CONTAINER_ENABLE_ENV = 'CODING_STUDIO_DOCKER';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/**
 * Whether the operator has opted into docker isolation. Default OFF: docker is
 * never used unless CODING_STUDIO_DOCKER is explicitly truthy. Honest gate — a
 * project may request docker mode, but without this flag the run falls back to
 * local (and says so).
 */
export function containerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[CONTAINER_ENABLE_ENV] ?? '').trim().toLowerCase();
  return TRUTHY.has(raw);
}

// ── Default images (per-language; small official slim bases) ────────────────

/**
 * Per-language default images. These are conservative official slim tags — the
 * operator/UI can override per project. A language we don't recognise falls
 * back to a node image (the most common Studio target). NEVER pulled here; the
 * `docker run` will pull on first use (network for the pull is the operator's
 * call — the test/run step itself still defaults to --network none).
 */
export const DEFAULT_IMAGES: Record<ToolchainLanguage, string> = {
  node: 'node:22-slim',
  typescript: 'node:22-slim',
  python: 'python:3.12-slim',
  rust: 'rust:1-slim',
};

export const FALLBACK_IMAGE = 'node:22-slim';

/** Resolve the image for a language, honouring an explicit override. */
export function imageForLanguage(
  language: ToolchainLanguage | string | null | undefined,
  override?: string | null,
): string {
  if (override && override.trim()) return override.trim();
  if (language && (language as ToolchainLanguage) in DEFAULT_IMAGES) {
    return DEFAULT_IMAGES[language as ToolchainLanguage];
  }
  return FALLBACK_IMAGE;
}

// ── Docker detection (tolerant, cache-free) ─────────────────────────────────

export interface DockerDetection {
  available: boolean;
  version?: string;
  /** A clear, honest reason when unavailable (not installed / daemon down / …). */
  error?: string;
}

const DETECT_TIMEOUT_MS = 5_000;

/**
 * Detect Docker by asking for the SERVER version (`docker version --format
 * '{{.Server.Version}}'`). This is the honest probe: the daemon must answer, so
 * a present client with a dead daemon correctly reports available:false. Cheap
 * and cache-free — callers run it at decision time.
 *
 * Tolerant: ENOENT (docker not installed), a non-zero exit (daemon down /
 * permission), or a timeout all resolve to available:false with a reason — this
 * NEVER throws.
 */
export async function detectDocker(execFileImpl: ExecFileImpl = nodeExecFile): Promise<DockerDetection> {
  return new Promise<DockerDetection>((resolve) => {
    try {
      execFileImpl(
        'docker',
        ['version', '--format', '{{.Server.Version}}'],
        { timeout: DETECT_TIMEOUT_MS, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
              resolve({ available: false, error: 'Docker is not installed (the `docker` command was not found on PATH).' });
              return;
            }
            const detail = String(stderr || '').trim().split('\n')[0] || String((err as Error).message || '').split('\n')[0];
            resolve({
              available: false,
              error: `Docker is installed but not usable (is the daemon running?). ${detail}`.trim(),
            });
            return;
          }
          const version = String(stdout || '').trim().split('\n')[0] || undefined;
          if (!version) {
            resolve({ available: false, error: 'Docker responded but reported no server version (daemon may be starting).' });
            return;
          }
          resolve({ available: true, version });
        },
      );
    } catch {
      resolve({ available: false, error: 'Docker could not be invoked.' });
    }
  });
}

// ── docker run argv builder (pure, NEVER a shell string) ────────────────────

export type DockerNetworkMode = 'none' | 'bridge';

export interface DockerRunParams {
  /** Absolute workspace path on the host — re-validated against the allowlist. */
  workspaceAbs: string;
  /** The inner command to run INSIDE the container (argv, as for execFile). */
  innerArgv: string[];
  /** Image to run. Defaults via imageForLanguage when omitted. */
  image?: string;
  /** Language hint used to pick a default image when `image` is omitted. */
  language?: ToolchainLanguage | string | null;
  /** Scoped DSN — passed as -e PROJECT_DATABASE_URL ONLY when provided. */
  projectDatabaseUrl?: string | null;
  /**
   * Container network. Default 'none' = maximum isolation (the honest win) for
   * test/run. Use 'bridge' ONLY for a setup/install step that genuinely needs
   * the network — a deliberate, surfaced choice.
   */
  networkMode?: DockerNetworkMode;
  /** Allow overriding allowed bases (tests); defaults to process.env-derived. */
  env?: NodeJS.ProcessEnv;
}

export class ContainerMountError extends Error {}

/**
 * The fixed mount point inside the container. The host workspace is bind-mounted
 * read-WRITE here, and the inner command runs with this as its working dir.
 */
export const CONTAINER_WORKDIR = '/work';

/**
 * Build the full `docker` argv to run innerArgv inside a container with the
 * workspace bind-mounted at /work. PURE — no spawn, no shell, no interpolation
 * into any string. Every dynamic value is its own argv element.
 *
 * Shape:
 *   docker run --rm --network <mode> -v <workspaceAbs>:/work -w /work
 *              [-e PROJECT_DATABASE_URL=<dsn>] <image> <innerArgv...>
 *
 * @throws ContainerMountError if workspaceAbs is not absolute or resolves
 *         outside ALLOWED_FOLDER_PATHS (+ studio root) — we refuse to mount it.
 */
export function buildDockerRunArgv(params: DockerRunParams): string[] {
  const {
    workspaceAbs,
    innerArgv,
    image,
    language,
    projectDatabaseUrl,
    networkMode = 'none',
  } = params;

  if (!Array.isArray(innerArgv) || innerArgv.length === 0) {
    throw new ContainerMountError('innerArgv must be a non-empty argv array.');
  }
  if (!path.isAbsolute(workspaceAbs)) {
    throw new ContainerMountError('workspace path must be absolute to bind-mount it.');
  }

  // Re-validate the mount source against the allowlist (defense in depth — the
  // route validated already, but the builder must never mount an unallowed dir).
  const resolved = path.resolve(workspaceAbs);
  const allowedBases = getAllowedBases(params.env ?? process.env);
  const inside = allowedBases.some((base) => resolved === base || resolved.startsWith(base + path.sep));
  if (!inside) {
    throw new ContainerMountError('workspace is outside ALLOWED_FOLDER_PATHS — refusing to mount it into a container.');
  }

  const net: DockerNetworkMode = networkMode === 'bridge' ? 'bridge' : 'none';
  const resolvedImage = imageForLanguage(language ?? null, image ?? null);

  const argv: string[] = [
    'run', '--rm',
    '--network', net,
    // Bind the host workspace read-write at /work. The `<host>:<container>`
    // value is a SINGLE argv element — not a shell-parsed string.
    '-v', `${resolved}:${CONTAINER_WORKDIR}`,
    '-w', CONTAINER_WORKDIR,
  ];

  // The ONLY secret injected, and only when present. `KEY=value` is one argv
  // element; docker reads it directly (no shell). The DSN is never logged.
  if (projectDatabaseUrl) {
    argv.push('-e', `${PROJECT_DATABASE_URL_KEY}=${projectDatabaseUrl}`);
  }

  argv.push(resolvedImage, ...innerArgv);
  return argv;
}

// ── Single decision point ───────────────────────────────────────────────────

export type ExecutionMode = 'docker' | 'local';

export interface ExecutionDecision {
  /** The REAL mode the run will use — callers report this verbatim. */
  mode: ExecutionMode;
  /**
   * Why local was chosen (only set for mode:'local'). Honest, user-facing:
   * "project did not request docker", "operator flag off", "docker unavailable: …".
   */
  reason?: string;
  /** The image that WOULD/WILL be used in docker mode (display + override echo). */
  image?: string;
  /**
   * Wrap an inner argv into the argv to actually spawn. For docker, returns the
   * full `docker run …` argv; for local, returns the inner argv unchanged.
   */
  wrap: (innerArgv: string[]) => string[];
}

export interface ResolveExecutionParams {
  environmentMode: string | null | undefined;
  language?: ToolchainLanguage | string | null;
  workspaceAbs: string;
  projectDatabaseUrl?: string | null;
  image?: string | null;
  networkMode?: DockerNetworkMode;
  execFileImpl?: ExecFileImpl;
  env?: NodeJS.ProcessEnv;
}

/**
 * THE single decision point for "docker or local?". Returns the REAL mode so
 * every caller reports honestly. docker is chosen ONLY when all three gates
 * pass; otherwise local with a clear reason. NEVER throws on the decision —
 * a mount problem surfaces when wrap() is called (and is caught by the caller).
 */
export async function resolveExecution(params: ResolveExecutionParams): Promise<ExecutionDecision> {
  const {
    environmentMode,
    language,
    workspaceAbs,
    projectDatabaseUrl,
    image,
    networkMode,
    execFileImpl = nodeExecFile,
    env = process.env,
  } = params;

  const localWrap = (innerArgv: string[]): string[] => innerArgv;

  if (environmentMode !== 'docker') {
    return { mode: 'local', reason: 'Project is not in docker mode — runs locally (NOT isolated).', wrap: localWrap };
  }
  if (!containerEnabled(env)) {
    return {
      mode: 'local',
      reason: `Docker mode requested but the operator has not enabled it (set ${CONTAINER_ENABLE_ENV}=1) — runs locally (NOT isolated).`,
      wrap: localWrap,
    };
  }
  const detection = await detectDocker(execFileImpl);
  if (!detection.available) {
    return {
      mode: 'local',
      reason: `Docker mode requested but Docker is unavailable: ${detection.error ?? 'unknown'} — runs locally (NOT isolated).`,
      wrap: localWrap,
    };
  }

  const resolvedImage = imageForLanguage(language ?? null, image ?? null);
  return {
    mode: 'docker',
    image: resolvedImage,
    wrap: (innerArgv: string[]): string[] =>
      buildDockerRunArgv({
        workspaceAbs,
        innerArgv,
        image: resolvedImage,
        language: language ?? null,
        projectDatabaseUrl: projectDatabaseUrl ?? null,
        networkMode,
        env,
      }),
  };
}
