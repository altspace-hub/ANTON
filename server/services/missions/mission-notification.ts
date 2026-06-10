// ── Missions — Notification / Delivery Resolution (Wave-2 2A.2) ────────────
// Pure helpers shared by the executor's 'notification' task branch and the
// controller's mission-completed auto-delivery. Kept side-effect free so the
// channel-resolution and bundle-composition logic is unit-testable without a
// DB. The actual dispatch lives in mission-delivery.ts.

import type { DeliveryChannel } from './mission-delivery.js';
import type { MissionTask, NotificationPreferences } from './types.js';

/** Channels mission-delivery can actually dispatch (post 2026-06-10 trim). */
const IMPLEMENTED_CHANNELS: ReadonlySet<string> = new Set<DeliveryChannel>(['in_app', 'webhook', 'filesystem']);

export interface ResolvedDeliveryTarget {
  channel: DeliveryChannel;
  destination: Record<string, unknown>;
  /** Non-null when the user's preference could not be honoured. */
  note: string | null;
}

/**
 * Resolve where a notification task should deliver.
 *
 * Priority:
 *   1. module_config.channel when it names an implemented channel
 *      (destination comes from module_config.destination).
 *   2. The mission's notification_preferences review/fyi channel — only
 *      'in_app' maps onto an implemented channel; email/push/sms were
 *      trimmed (throw-stubs) so they degrade to in_app with a note.
 *   3. Default: in_app.
 */
export function resolveNotificationChannel(
  moduleConfig: Record<string, unknown> | null | undefined,
  prefs: NotificationPreferences | null | undefined,
): ResolvedDeliveryTarget {
  const cfg = moduleConfig ?? {};
  const explicit = typeof cfg.channel === 'string' ? cfg.channel : null;
  if (explicit && IMPLEMENTED_CHANNELS.has(explicit)) {
    const destination = (cfg.destination && typeof cfg.destination === 'object' && !Array.isArray(cfg.destination))
      ? cfg.destination as Record<string, unknown>
      : {};
    return { channel: explicit as DeliveryChannel, destination, note: null };
  }
  if (explicit) {
    return {
      channel: 'in_app',
      destination: {},
      note: `Requested channel '${explicit}' is not implemented — delivered in-app instead.`,
    };
  }

  const preferred = prefs?.review_channel ?? prefs?.fyi_channel ?? 'in_app';
  if (preferred === 'in_app') {
    return { channel: 'in_app', destination: {}, note: null };
  }
  return {
    channel: 'in_app',
    destination: {},
    note: `Preferred channel '${preferred}' is not implemented — delivered in-app instead.`,
  };
}

// Task types whose output is plumbing, not deliverable content.
const NON_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'checkpoint', 'notification', 'parallel_group', 'conditional',
]);

const DEFAULT_BUNDLE_CAP_CHARS = 100_000;
const PER_TASK_CAP_CHARS = 30_000;

/**
 * Compose the deliverable bundle from completed task outputs: one Markdown
 * section per content-producing task, in graph order, with per-task and
 * overall size caps so an in_app/webhook payload can't balloon.
 */
export function composeDeliveryBundle(
  tasks: MissionTask[],
  capChars = DEFAULT_BUNDLE_CAP_CHARS,
): string {
  const sections: string[] = [];
  let used = 0;
  for (const t of tasks) {
    if (t.status !== 'completed') continue;
    if (NON_CONTENT_TYPES.has(t.task_type)) continue;
    const body = (t.output_full ?? '').trim();
    if (!body) continue;
    const clipped = body.length > PER_TASK_CAP_CHARS
      ? body.slice(0, PER_TASK_CAP_CHARS).trim() + '\n\n… [truncated]'
      : body;
    const section = `## ${t.title}\n\n${clipped}`;
    if (used + section.length > capChars) {
      sections.push('… [bundle truncated — see the mission task graph for full outputs]');
      break;
    }
    sections.push(section);
    used += section.length;
  }
  return sections.join('\n\n---\n\n');
}

/**
 * Pick the mission's "final synthesis" — the last completed content task
 * with a non-empty output. Used by the auto-delivery on mission completion.
 */
export function pickFinalSynthesis(tasks: MissionTask[]): MissionTask | null {
  const candidates = tasks
    .filter(t => t.status === 'completed'
      && !NON_CONTENT_TYPES.has(t.task_type)
      && Boolean((t.output_full ?? '').trim()))
    .sort((a, b) => a.sort_order - b.sort_order);
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

/**
 * True when the mission graph already delivered via a completed notification
 * task — the completion auto-delivery skips in that case to avoid duplicate
 * inbox entries.
 */
export function hasCompletedNotificationTask(tasks: MissionTask[]): boolean {
  return tasks.some(t => t.task_type === 'notification' && t.status === 'completed');
}
