import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

type MarketChannel =
  | 'market_atom_created'
  | 'market_prediction_validated'
  | 'market_rebalance_executed'
  | 'market_pattern_detected'
  | 'market_regime_changed';

const MARKET_CHANNELS: MarketChannel[] = [
  'market_atom_created',
  'market_prediction_validated',
  'market_rebalance_executed',
  'market_pattern_detected',
  'market_regime_changed',
];

export interface PgNotifyService {
  notify(channel: MarketChannel, payload: Record<string, unknown>): Promise<void>;
  shutdown(): Promise<void>;
}

// ── No-op for SQLite ─────────────────────────────────────────────────────────

const noopService: PgNotifyService = {
  async notify() {},
  async shutdown() {},
};

// ── Factory ──────────────────────────────────────────────────────────────────

export async function createPgNotifyService(db: DatabaseAdapter): Promise<PgNotifyService> {
  if (db.dialect !== 'postgresql') {
    return noopService;
  }

  // Dynamic import for pg types — only loaded in PG mode
  const pgAdapter = db as DatabaseAdapter & { getPool?: () => unknown };
  if (typeof pgAdapter.getPool !== 'function') {
    console.warn('[pg-notify] PostgresAdapter does not expose getPool() — NOTIFY/LISTEN disabled');
    return noopService;
  }

  const pool = pgAdapter.getPool() as import('pg').Pool;
  let listenClient: import('pg').PoolClient | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;
  let shuttingDown = false;

  // Import the internal event emitter to route notifications
  const { emitInternalEvent } = await import('./event-emitter.js');

  async function startListening(): Promise<void> {
    try {
      listenClient = await pool.connect();
      reconnectAttempts = 0;

      for (const channel of MARKET_CHANNELS) {
        await listenClient.query(`LISTEN ${channel}`);
      }

      console.log(`[pg-notify] Listening on ${MARKET_CHANNELS.length} channels`);

      listenClient.on('notification', (msg) => {
        try {
          const payload = msg.payload ? JSON.parse(msg.payload) : {};
          emitInternalEvent('market_signal', {
            channel: msg.channel,
            ...payload,
          });
        } catch (err) {
          console.warn('[pg-notify] Failed to parse notification payload:', err);
        }
      });

      listenClient.on('error', (err) => {
        console.error('[pg-notify] Listen client error:', err);
        listenClient?.release(true);
        listenClient = null;
        scheduleReconnect();
      });

      listenClient.on('end', () => {
        if (!shuttingDown) {
          console.warn('[pg-notify] Listen client disconnected — scheduling reconnect');
          listenClient = null;
          scheduleReconnect();
        }
      });
    } catch (err) {
      console.error('[pg-notify] Failed to start listening:', err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect(): void {
    if (shuttingDown || reconnectTimer) return;

    reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
    console.log(`[pg-notify] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      await startListening();
    }, delay);
  }

  async function notify(channel: MarketChannel, payload: Record<string, unknown>): Promise<void> {
    try {
      const payloadStr = JSON.stringify(payload);
      await db.run('SELECT pg_notify($1, $2)', channel, payloadStr);
    } catch (err) {
      console.warn(`[pg-notify] Failed to send notification on ${channel}:`, err);
    }
  }

  async function shutdown(): Promise<void> {
    shuttingDown = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (listenClient) {
      try {
        for (const channel of MARKET_CHANNELS) {
          await listenClient.query(`UNLISTEN ${channel}`);
        }
      } catch { /* ignore during shutdown */ }
      listenClient.release(true);
      listenClient = null;
    }
    console.log('[pg-notify] Shut down');
  }

  // Start listening immediately
  await startListening();

  return { notify, shutdown };
}
