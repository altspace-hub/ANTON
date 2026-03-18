/**
 * event-emitter.ts
 * Singleton bridge for internal event emission to the webhook listener.
 * Other services (regulatory-radar, compliance-rules, file-watcher) call
 * emitInternalEvent() to trigger event-driven workflows without importing
 * the full webhook-listener (which requires a DB reference).
 *
 * Usage: import { setEventEmitter, emitInternalEvent } from './event-emitter.js'
 * Initialize in server/index.ts: setEventEmitter(createWebhookListener(db))
 */

type InternalEventPayload = Record<string, unknown>;
type InternalSource = 'regulatory_radar' | 'compliance_rules' | 'file_watcher' | 'market_signal' | 'market_event';

type EmitFunction = (source: InternalSource, payload: InternalEventPayload) => Promise<unknown>;

let _emitFn: EmitFunction | null = null;

/**
 * Called once at server startup to wire the webhook listener.
 */
export function setEventEmitter(listener: { processInternalEvent: EmitFunction }): void {
  _emitFn = listener.processInternalEvent.bind(listener);
}

/**
 * Emit an internal event. Non-fatal if no listener is configured.
 */
export async function emitInternalEvent(source: InternalSource, payload: InternalEventPayload): Promise<void> {
  if (!_emitFn) return;
  try {
    await _emitFn(source, payload);
  } catch (err) {
    // Non-fatal — internal events should never crash the calling service
    console.warn('[event-emitter] Failed to emit internal event:', err);
  }
}
