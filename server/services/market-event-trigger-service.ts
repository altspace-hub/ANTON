import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface MarketEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  symbol: string | null;
  entity_id: string | null;
  scheduled_at: string;
  importance: string;
  pre_event_hours: number;
  status: string;
  actual_outcome: string | null;
  metadata: string;
  created_at: string;
  updated_at: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createMarketEventTriggerService(db: DatabaseAdapter) {

  function newId(): string {
    return `mevt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async function addEvent(params: {
    eventType: string;
    title: string;
    description?: string;
    symbol?: string;
    entityId?: string;
    scheduledAt: string;
    importance?: string;
    preEventHours?: number;
    metadata?: Record<string, unknown>;
  }): Promise<MarketEvent> {
    const id = newId();

    await db.run(`
      INSERT INTO market_event_calendar (id, event_type, title, description, symbol, entity_id,
        scheduled_at, importance, pre_event_hours, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, id, params.eventType, params.title, params.description ?? null,
       params.symbol ?? null, params.entityId ?? null,
       params.scheduledAt, params.importance ?? 'medium',
       params.preEventHours ?? 24, JSON.stringify(params.metadata ?? {}));

    const event = await db.get<MarketEvent>('SELECT * FROM market_event_calendar WHERE id = ?', id);
    return event!;
  }

  async function updateEvent(id: string, updates: Partial<{
    title: string;
    description: string;
    scheduledAt: string;
    importance: string;
    preEventHours: number;
    status: string;
    metadata: Record<string, unknown>;
  }>): Promise<MarketEvent | undefined> {
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (updates.title !== undefined) { sets.push('title = ?'); vals.push(updates.title); }
    if (updates.description !== undefined) { sets.push('description = ?'); vals.push(updates.description); }
    if (updates.scheduledAt !== undefined) { sets.push('scheduled_at = ?'); vals.push(updates.scheduledAt); }
    if (updates.importance !== undefined) { sets.push('importance = ?'); vals.push(updates.importance); }
    if (updates.preEventHours !== undefined) { sets.push('pre_event_hours = ?'); vals.push(updates.preEventHours); }
    if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
    if (updates.metadata !== undefined) { sets.push('metadata = ?'); vals.push(JSON.stringify(updates.metadata)); }

    if (sets.length === 0) return await db.get<MarketEvent>('SELECT * FROM market_event_calendar WHERE id = ?', id);

    sets.push("updated_at = NOW()");
    vals.push(id);

    await db.run(`UPDATE market_event_calendar SET ${sets.join(', ')} WHERE id = ?`, ...vals);
    return await db.get<MarketEvent>('SELECT * FROM market_event_calendar WHERE id = ?', id);
  }

  async function deleteEvent(id: string): Promise<void> {
    await db.run('DELETE FROM market_event_calendar WHERE id = ?', id);
  }

  async function listUpcomingEvents(horizonHours = 168): Promise<MarketEvent[]> {
    return await db.all<MarketEvent>(`
      SELECT * FROM market_event_calendar
      WHERE status IN ('pending', 'pre_event')
        AND scheduled_at <= NOW() + (? || ' hours')::INTERVAL
      ORDER BY scheduled_at ASC
    `, horizonHours);
  }

  async function checkAndFireTriggers(): Promise<{ fired: number; errors: number }> {
    let fired = 0;
    let errors = 0;

    // 1. Find events entering pre-event window
    const preEvents = await db.all<MarketEvent>(`
      SELECT * FROM market_event_calendar
      WHERE status = 'pending'
        AND scheduled_at - (pre_event_hours || ' hours')::INTERVAL <= NOW()
    `);

    for (const evt of preEvents) {
      try {
        await db.run(
          "UPDATE market_event_calendar SET status = 'pre_event', updated_at = NOW() WHERE id = ?",
          evt.id
        );

        // Fire pre-event trigger through internal event system
        const { emitInternalEvent } = await import('./event-emitter.js');
        emitInternalEvent('market_event', {
          phase: 'pre_event',
          eventId: evt.id,
          eventType: evt.event_type,
          title: evt.title,
          symbol: evt.symbol,
          scheduledAt: evt.scheduled_at,
          importance: evt.importance,
        });
        fired++;
      } catch (err) {
        console.error(`[market-events] Failed to fire pre-event trigger for ${evt.id}:`, err);
        errors++;
      }
    }

    // 2. Find events that are now due
    const dueEvents = await db.all<MarketEvent>(`
      SELECT * FROM market_event_calendar
      WHERE status IN ('pending', 'pre_event')
        AND scheduled_at <= NOW()
    `);

    for (const evt of dueEvents) {
      try {
        await db.run(
          "UPDATE market_event_calendar SET status = 'due', updated_at = NOW() WHERE id = ?",
          evt.id
        );

        const { emitInternalEvent } = await import('./event-emitter.js');
        emitInternalEvent('market_event', {
          phase: 'due',
          eventId: evt.id,
          eventType: evt.event_type,
          title: evt.title,
          symbol: evt.symbol,
          scheduledAt: evt.scheduled_at,
          importance: evt.importance,
        });
        fired++;
      } catch (err) {
        console.error(`[market-events] Failed to fire due trigger for ${evt.id}:`, err);
        errors++;
      }
    }

    return { fired, errors };
  }

  async function completeEvent(id: string, actualOutcome: string): Promise<MarketEvent | undefined> {
    await db.run(`
      UPDATE market_event_calendar
      SET status = 'completed', actual_outcome = ?, updated_at = NOW()
      WHERE id = ?
    `, actualOutcome, id);

    const event = await db.get<MarketEvent>('SELECT * FROM market_event_calendar WHERE id = ?', id);

    if (event) {
      const { emitInternalEvent } = await import('./event-emitter.js');
      emitInternalEvent('market_event', {
        phase: 'completed',
        eventId: id,
        eventType: event.event_type,
        title: event.title,
        symbol: event.symbol,
        actualOutcome,
      });
    }

    return event;
  }

  return {
    addEvent,
    updateEvent,
    deleteEvent,
    listUpcomingEvents,
    checkAndFireTriggers,
    completeEvent,
  };
}

export type MarketEventTriggerService = Awaited<ReturnType<typeof createMarketEventTriggerService>>;
