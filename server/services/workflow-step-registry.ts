/**
 * workflow-step-registry.ts — single source of truth for the workflow step types
 * ANTON supports.
 *
 * Adding a new step type:
 *   1. Add an entry to STEP_REGISTRY below.
 *   2. Implement the handler in workflow-executor.ts (or a dedicated handler file).
 *   3. The diagram /docs/architecture/24-workflow-engine.md will pick up the new
 *      type on its next regeneration — derive the table from this file, do not
 *      paraphrase.
 *
 * Defined per ANTON_Improvement_and_Investigation_Brief.md §C.4.
 */

export type StepKind = 'headless' | 'interactive' | 'gate';

/**
 * 'available' (default) = fully implemented end-to-end.
 * 'stub' = the executor accepts the step but performs NO real side-effect
 * (logs + returns sent:false). Builders MUST surface stub steps as
 * "coming soon" / disabled so users cannot silently rely on them.
 */
export type StepStatus = 'available' | 'stub';

export interface StepRegistryEntry {
  /** Stable ID used in workflow definitions (`step.type`). */
  id: string;
  /** Human label shown in the workflow builder. */
  label: string;
  /** One-line description for the UI / docs. */
  description: string;
  /** Headless = runs without UI, Interactive = needs frontend, Gate = pauses for external action. */
  kind: StepKind;
  /** Implementation status — omit for 'available'. See StepStatus. */
  status?: StepStatus;
  /** Default per-step timeout in ms. Subject to override via step.config.timeoutMs. */
  defaultTimeoutMs: number;
  /** Default retry count on transient failure. 0 = no retry. */
  defaultRetries: number;
  /** Optional Zod-shaped schema reference (string id) for step.config validation. Wired in a follow-up. */
  configSchemaId?: string;
  /** Free-form notes — surfaced in /docs/architecture/24-workflow-engine.md. */
  notes?: string;
}

export const STEP_REGISTRY: ReadonlyArray<StepRegistryEntry> = [
  // ── Decision / control flow ─────────────────────────────────────────────
  {
    id: 'decision_gate',
    label: 'Decision gate',
    description: 'Branches on operator (==, !=, >, <, >=, <=, contains, exists).',
    kind: 'headless',
    defaultTimeoutMs: 1_000,
    defaultRetries: 0,
    configSchemaId: 'decisionGate',
    notes: 'Operators implemented in workflow-executor.ts:244–267.',
  },
  {
    id: 'conditional',
    label: 'Conditional',
    description: 'Conditional execution wrapper around a child step.',
    kind: 'headless',
    defaultTimeoutMs: 1_000,
    defaultRetries: 0,
  },
  {
    id: 'transform',
    label: 'Transform',
    description: 'Apply a transformation to step input (string, JSON, table).',
    kind: 'headless',
    defaultTimeoutMs: 5_000,
    defaultRetries: 0,
    configSchemaId: 'transform',
  },
  {
    id: 'wait',
    label: 'Wait',
    description: 'Sleep for N milliseconds.',
    kind: 'headless',
    defaultTimeoutMs: 600_000,
    defaultRetries: 0,
  },
  {
    id: 'parallel',
    label: 'Parallel',
    description: 'Run children concurrently. No max-concurrency cap today (see open question in 24-workflow-engine.md).',
    kind: 'headless',
    defaultTimeoutMs: 600_000,
    defaultRetries: 0,
  },

  // ── External integrations ───────────────────────────────────────────────
  {
    id: 'api_call',
    label: 'API call',
    description: 'HTTP call (GET/POST/PUT/DELETE) with timeout + structured response capture.',
    kind: 'headless',
    defaultTimeoutMs: 30_000,
    defaultRetries: 1,
    configSchemaId: 'apiCall',
  },
  {
    id: 'database_query',
    label: 'Database query',
    description: 'Parameterised query against PostgreSQL / MySQL / MSSQL via connection-manager.',
    kind: 'headless',
    defaultTimeoutMs: 30_000,
    defaultRetries: 0,
    configSchemaId: 'databaseQuery',
  },
  {
    id: 'file_read',
    label: 'File read',
    description: 'Read a file path (validated against ALLOWED_FOLDER_PATHS).',
    kind: 'headless',
    defaultTimeoutMs: 10_000,
    defaultRetries: 0,
  },

  // ── Data pipeline ───────────────────────────────────────────────────────
  {
    id: 'data_import',
    label: 'Data import',
    description: 'Import rows from CSV / JSON / external connector into a dataset.',
    kind: 'headless',
    defaultTimeoutMs: 120_000,
    defaultRetries: 1,
  },
  {
    id: 'data_export',
    label: 'Data export',
    description: 'Export a dataset to CSV / JSON / external connector.',
    kind: 'headless',
    defaultTimeoutMs: 120_000,
    defaultRetries: 1,
  },
  {
    id: 'data_transform',
    label: 'Data transform',
    description: 'Row-wise / column-wise transformation over a dataset.',
    kind: 'headless',
    defaultTimeoutMs: 120_000,
    defaultRetries: 0,
  },
  {
    id: 'data_merge',
    label: 'Data merge',
    description: 'Merge two datasets on a key (left / right / inner / outer).',
    kind: 'headless',
    defaultTimeoutMs: 60_000,
    defaultRetries: 0,
  },

  // ── Notifications ───────────────────────────────────────────────────────
  {
    id: 'notification',
    label: 'In-app notification',
    description: 'COMING SOON — webhook notification. Executor stub logs and returns sent:false.',
    kind: 'headless',
    status: 'stub',
    defaultTimeoutMs: 10_000,
    defaultRetries: 0,
    notes: 'Stub — no webhook is actually sent (workflow-executor.ts / routes/workflows.ts). Use messaging_notification (Slack/Teams via connection) for a real notification today.',
  },
  {
    id: 'email_send',
    label: 'Email',
    description: 'COMING SOON — email delivery. Executor stub logs and returns sent:false.',
    kind: 'headless',
    status: 'stub',
    defaultTimeoutMs: 30_000,
    defaultRetries: 0,
    notes: 'Stub — no email provider is wired yet (workflow-executor.ts / routes/workflows.ts).',
  },
  {
    id: 'messaging_notification',
    label: 'Messaging notification',
    description: 'Push notification via Companion App Gateway (APNs / FCM / web-push).',
    kind: 'headless',
    defaultTimeoutMs: 15_000,
    defaultRetries: 2,
  },

  // ── Compute ─────────────────────────────────────────────────────────────
  {
    id: 'script',
    label: 'Script',
    description: 'Execute a sandboxed script (Node-based, no shell).',
    kind: 'headless',
    defaultTimeoutMs: 60_000,
    defaultRetries: 0,
  },
  {
    id: 'llm',
    label: 'LLM prompt',
    description: 'Run a prompt through unified-llm-client (any configured provider).',
    kind: 'headless',
    defaultTimeoutMs: 300_000,
    defaultRetries: 1,
    configSchemaId: 'llmStep',
    notes: 'Honours the same thinking-level / model-selection contract as routes/claude.ts.',
  },

  // ── Gates / interactive ─────────────────────────────────────────────────
  {
    id: 'approval',
    label: 'Approval gate',
    description: 'Pause and wait for a user approval (resumed via API).',
    kind: 'gate',
    defaultTimeoutMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    defaultRetries: 0,
    notes: 'Pauses the run with status=awaiting_approval; resumed by approval webhook.',
  },
  {
    id: 'claude',
    label: 'Claude session step',
    description: 'Launches a frontend Claude session step — interactive.',
    kind: 'interactive',
    defaultTimeoutMs: 0,
    defaultRetries: 0,
  },
  {
    id: 'input',
    label: 'User input',
    description: 'Prompt the user for input via the workflow UI — interactive.',
    kind: 'interactive',
    defaultTimeoutMs: 0,
    defaultRetries: 0,
  },
  {
    id: 'export',
    label: 'Export action',
    description: 'Trigger a user-initiated export — interactive.',
    kind: 'interactive',
    defaultTimeoutMs: 0,
    defaultRetries: 0,
  },
  {
    id: 'checkpoint',
    label: 'Checkpoint',
    description: 'User checkpoint surface — interactive.',
    kind: 'interactive',
    defaultTimeoutMs: 0,
    defaultRetries: 0,
  },
];

const REGISTRY_BY_ID: Map<string, StepRegistryEntry> = new Map(
  STEP_REGISTRY.map(e => [e.id, e])
);

export function getStepEntry(id: string): StepRegistryEntry | undefined {
  return REGISTRY_BY_ID.get(id);
}

export function isHeadlessStep(id: string): boolean {
  return REGISTRY_BY_ID.get(id)?.kind === 'headless';
}

export function isInteractiveStep(id: string): boolean {
  return REGISTRY_BY_ID.get(id)?.kind === 'interactive';
}

export function isGateStep(id: string): boolean {
  return REGISTRY_BY_ID.get(id)?.kind === 'gate';
}

/** Returns true iff the step type is registered. Useful as a guard before dispatch. */
export function isRegisteredStepType(id: string): boolean {
  return REGISTRY_BY_ID.has(id);
}

/** Returns true iff the step type is registered but only stub-implemented (no real side-effect). */
export function isStubStep(id: string): boolean {
  return REGISTRY_BY_ID.get(id)?.status === 'stub';
}

// ── database_query driver resolution ──────────────────────────────────────
// The silent `?? 'sqlite'` default was a honesty bug (0.8): an external
// connection with no driver configured would be quietly treated as a local
// SQLite file. sqlite remains a legitimate EXPLICIT read-only connector, but
// the driver must always be stated on the connection config.

export const DB_QUERY_DRIVERS = ['postgresql', 'mysql', 'mssql', 'sqlite'] as const;
export type DbQueryDriver = (typeof DB_QUERY_DRIVERS)[number];

/**
 * Resolve the driver for a database_query step from the connection config.
 * Throws a clear configuration error when the driver is unset or unsupported —
 * never assumes a default.
 */
export function resolveExplicitDbDriver(cfg: Record<string, unknown> | null | undefined): DbQueryDriver {
  const raw = cfg?.driver;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error(
      'database_query step requires an explicit driver on the database connection: postgresql | mysql | mssql | sqlite. ' +
      'No driver is configured — edit the connection and set one (nothing is assumed by default).'
    );
  }
  const driver = String(raw).trim().toLowerCase();
  if (!(DB_QUERY_DRIVERS as readonly string[]).includes(driver)) {
    throw new Error(
      `Unsupported database_query driver: "${driver}". Valid drivers: postgresql | mysql | mssql | sqlite.`
    );
  }
  return driver as DbQueryDriver;
}

/** Convenience accessors used by workflow-executor.ts during the C.4 refactor. */
export const HEADLESS_STEP_IDS = new Set(
  STEP_REGISTRY.filter(e => e.kind === 'headless').map(e => e.id)
);
export const INTERACTIVE_STEP_IDS = new Set(
  STEP_REGISTRY.filter(e => e.kind === 'interactive').map(e => e.id)
);
export const GATE_STEP_IDS = new Set(
  STEP_REGISTRY.filter(e => e.kind === 'gate').map(e => e.id)
);
