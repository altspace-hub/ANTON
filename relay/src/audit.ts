/**
 * audit.ts — Structured event log for the relay.
 *
 * Spec §1.4 contract: **never include any byte from an ENVELOPE payload**
 * or any private key material in a log line. The audit log records:
 *
 *   - Connection lifecycle (open / close / disconnect reason)
 *   - HELLO_INSTANCE / HELLO_PHONE acceptance + rejection (with error code)
 *   - Match events (instance_id_prefix only, never the full id)
 *   - ENVELOPE *counts* (never bytes)
 *   - Rate-limit hits
 *
 * Operators may parse this log to monitor abuse + debug pairing failures.
 * It is the relay's only persistent record of activity — implementation
 * MUST NOT expand it to include payloads under any debug flag, since
 * "verbose mode" is exactly when a misconfigured relay leaks ciphertext
 * to its own disk.
 *
 * Format: JSONL (one event per line), single field per fact. Pino is the
 * underlying writer.
 */

import pino from 'pino';

export interface AuditEvent {
  /** What happened. Closed enum so log consumers can filter reliably. */
  type:
    | 'connect'           // a new WS connection arrived
    | 'disconnect'        // a WS connection closed (reason captured)
    | 'hello_instance'    // a HELLO_INSTANCE was accepted
    | 'hello_instance_rejected'
    | 'hello_phone'       // a HELLO_PHONE was accepted (queued or matched)
    | 'hello_phone_rejected'
    | 'dial_instance'     // §3.11 — instance dialed a peer instance
    | 'dial_instance_rejected'
    | 'match'             // a session was created
    | 'session_end'       // a session ended (peer gone, replaced, no_match, draining)
    | 'envelope'          // an ENVELOPE was forwarded — counted, not logged with payload
    | 'rate_limited'      // a rate limit fired
    | 'protocol_error'    // a protocol-layer error, e.g. BAD_HELLO
    ;
  /** Stable per-WS-connection id (assigned at accept time). */
  conn_id?: string;
  /** Source bucket (the rate-limiter key, e.g. "192.0.2.1" or "2001:db8::/64"). */
  source?: string;
  /** First 8 hex chars of instance_id — enough to debug, not enough to identify. */
  instance_id_prefix?: string;
  /** First 8 hex chars of session_id. */
  session_id_prefix?: string;
  /** Numeric error code (from §6 if applicable). */
  error_code?: number;
  /** Free-form short reason. MUST NOT include payload bytes or keys. */
  reason?: string;
  /** Number of envelopes batched into this event (for 'envelope' type). */
  count?: number;
}

export interface AuditLogger {
  emit(event: AuditEvent): void;
  flush(): Promise<void>;
}

/**
 * Construct an audit logger. By default writes JSONL to stdout via pino;
 * pass `dest` (a path or pino-compatible WritableStream) to redirect.
 */
export function createAuditLogger(dest?: string | NodeJS.WritableStream): AuditLogger {
  const opts: pino.LoggerOptions = {
    level: 'info',
    base: { component: 'anton-mesh-relay', v: '0.1.0' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  // If `dest` is a string we treat it as a path; pino transports handle it.
  // For simplicity (and to avoid worker threads), use pino.destination() for files.
  const stream = typeof dest === 'string'
    ? pino.destination({ dest, sync: false })
    : dest;
  const log = stream ? pino(opts, stream) : pino(opts);
  return {
    emit(event: AuditEvent): void {
      // Defensive sanitization: strip anything that smells like a key field.
      // (Belt-and-braces — the AuditEvent type already constrains shape.)
      const sanitized = sanitize(event);
      log.info(sanitized, sanitized.type);
    },
    flush(): Promise<void> {
      return new Promise((resolve) => {
        log.flush?.(() => resolve());
        // pino.flush is callback-based; if not present, resolve eagerly.
        if (!log.flush) resolve();
      });
    },
  };
}

/**
 * Belt-and-braces sanitizer — explicitly reject any key that looks like a
 * payload, plaintext, or key material. Future-proofs against a typo at a
 * call site that would otherwise leak ciphertext into the log.
 */
const FORBIDDEN_KEY_FRAGMENTS = [
  'payload', 'plaintext', 'cleartext', 'body',
  'priv', 'secret', 'key', 'cert', 'pubkey',
  'noise', 'sig', 'nonce',
];

function sanitize(event: AuditEvent): AuditEvent {
  // The type constrains keys; this guard ensures no extra keys slip through
  // a TypeScript any-cast.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event)) {
    const lk = k.toLowerCase();
    if (FORBIDDEN_KEY_FRAGMENTS.some(frag => lk.includes(frag))) {
      // Skip silently — caller bug; surface via dropped data, not exception
      // (we don't want logging-induced crashes).
      continue;
    }
    if (v instanceof Uint8Array || v instanceof Buffer) {
      // Never log raw bytes — could be ciphertext. Replace with a marker.
      out[k] = `<bytes:${v.length}>`;
      continue;
    }
    out[k] = v;
  }
  return out as unknown as AuditEvent;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** First 8 hex chars of a 16-byte hex string (or first 8 chars of any hex). */
export function shortId(hex: string): string {
  return hex.slice(0, 8);
}
