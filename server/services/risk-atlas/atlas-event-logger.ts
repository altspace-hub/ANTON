// ── Atlas Event Logger ───────────────────────────────────────────────────
//
// Append-only ledger of every state change in an Atlas. Routes through the
// dedicated `atlas_events` table — the existing public.audit_log is
// LLM-call-specific (session_id, model, thinking_level, …) and doesn't fit
// a generic resource_type/resource_id shape. Per spec §6.3, atlas_events
// is "truly needed" because no existing table has this shape.

import type { DatabaseAdapter } from '../../db/database.js';

export type AtlasEventType =
  | 'atlas_created' | 'atlas_status_changed' | 'atlas_archived'
  | 'pack_installed' | 'pack_applied' | 'pack_updated'
  | 'exposure_added' | 'exposure_updated' | 'exposure_removed'
  | 'path_added' | 'path_updated' | 'path_removed'
  | 'vulnerability_added' | 'vulnerability_updated' | 'vulnerability_removed'
  | 'control_added' | 'control_updated' | 'control_removed'
  | 'inherent_scored' | 'residual_recalculated'
  | 'appetite_changed' | 'appetite_approved'
  | 'trigger_added'
  | 'review_completed' | 'review_due'
  | 'regulator_change_linked' | 'incident_linked'
  | 'fcp_scope_changed';

export interface LogEventInput {
  atlasId: string;
  event: AtlasEventType;
  userId?: string | null;
  details?: Record<string, unknown>;
  /** Optional sub-resource id (threat path id, control id, …) for richer audit. */
  subResourceId?: string;
}

export interface AtlasEventRow {
  id: number;
  atlas_id: string;
  event_type: AtlasEventType;
  sub_resource_id: string | null;
  user_id: string | null;
  details: unknown;
  created_at: string;
}

export function createAtlasEventLogger(db: DatabaseAdapter) {
  /**
   * Append an event. Best-effort — never throws to the caller; logging
   * failure must not block Atlas operations.
   */
  async function logEvent(input: LogEventInput): Promise<void> {
    try {
      await db.run(
        `INSERT INTO atlas_events (atlas_id, event_type, sub_resource_id, user_id, details)
         VALUES (?, ?, ?, ?, ?)`,
        input.atlasId, input.event, input.subResourceId ?? null,
        input.userId ?? null, JSON.stringify(input.details ?? {}),
      );
    } catch (err) {
      console.warn('[atlas-event-logger] Failed to log event:', err instanceof Error ? err.message : err);
    }
  }

  /** List recent events for an atlas (descending by time). */
  async function listEvents(atlasId: string, limit = 200): Promise<AtlasEventRow[]> {
    return db.all<AtlasEventRow>(
      `SELECT id, atlas_id, event_type, sub_resource_id, user_id, details, created_at
       FROM atlas_events
       WHERE atlas_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      atlasId, limit,
    );
  }

  /** Filter events by type — for the Maintenance UI ("show me all reviews"). */
  async function listEventsByType(atlasId: string, types: AtlasEventType[], limit = 100): Promise<AtlasEventRow[]> {
    if (types.length === 0) return [];
    const placeholders = types.map(() => '?').join(',');
    return db.all<AtlasEventRow>(
      `SELECT id, atlas_id, event_type, sub_resource_id, user_id, details, created_at
       FROM atlas_events
       WHERE atlas_id = ? AND event_type IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`,
      atlasId, ...types, limit,
    );
  }

  return { logEvent, listEvents, listEventsByType };
}

export type AtlasEventLogger = ReturnType<typeof createAtlasEventLogger>;
