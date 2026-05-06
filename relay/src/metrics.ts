/**
 * metrics.ts — operational counters for the relay.
 *
 * Exposed at GET /metrics in Prometheus text-exposition format
 * (https://prometheus.io/docs/instrumenting/exposition_formats/) so any
 * standard Prometheus scrape agent works out of the box.
 *
 * The counters track aggregate behaviour only; they NEVER include payload
 * bytes, instance_ids, source IPs, or session_ids — those would defeat
 * the §1.4 audit-log-no-payload contract. Per-instance / per-IP slicing
 * lives in the audit log (the only place such data exists, sanitized to
 * 8-char prefixes).
 */

export interface MetricsSnapshot {
  uptime_sec: number;
  active_sessions: number;
  active_instances: number;
  hello_accepted_total: number;
  hello_rejected_total: Record<string, number>;     // keyed by error code hex
  envelope_forwarded_total: number;
  envelope_rejected_total: number;
  sessions_opened_total: number;
  sessions_closed_total: number;
  rate_limited_total: number;
  ws_connections_opened_total: number;
  ws_connections_closed_total: number;
}

export class MetricsRegistry {
  private startTimeMs: number;
  private counters = {
    hello_accepted: 0,
    hello_rejected: new Map<string, number>(),
    envelope_forwarded: 0,
    envelope_rejected: 0,
    sessions_opened: 0,
    sessions_closed: 0,
    rate_limited: 0,
    ws_connections_opened: 0,
    ws_connections_closed: 0,
  };

  constructor() {
    this.startTimeMs = Date.now();
  }

  helloAccepted(): void { this.counters.hello_accepted++; }
  helloRejected(errorCode: number): void {
    const k = '0x' + errorCode.toString(16).padStart(4, '0');
    this.counters.hello_rejected.set(k, (this.counters.hello_rejected.get(k) ?? 0) + 1);
  }
  envelopeForwarded(): void { this.counters.envelope_forwarded++; }
  envelopeRejected(): void { this.counters.envelope_rejected++; }
  sessionOpened(): void { this.counters.sessions_opened++; }
  sessionClosed(): void { this.counters.sessions_closed++; }
  rateLimited(): void { this.counters.rate_limited++; }
  wsOpened(): void { this.counters.ws_connections_opened++; }
  wsClosed(): void { this.counters.ws_connections_closed++; }

  /** Build a typed snapshot. Called by /healthz + /metrics + tests. */
  snapshot(activeSessions: number, activeInstances: number): MetricsSnapshot {
    return {
      uptime_sec: Math.floor((Date.now() - this.startTimeMs) / 1000),
      active_sessions: activeSessions,
      active_instances: activeInstances,
      hello_accepted_total: this.counters.hello_accepted,
      hello_rejected_total: Object.fromEntries(this.counters.hello_rejected),
      envelope_forwarded_total: this.counters.envelope_forwarded,
      envelope_rejected_total: this.counters.envelope_rejected,
      sessions_opened_total: this.counters.sessions_opened,
      sessions_closed_total: this.counters.sessions_closed,
      rate_limited_total: this.counters.rate_limited,
      ws_connections_opened_total: this.counters.ws_connections_opened,
      ws_connections_closed_total: this.counters.ws_connections_closed,
    };
  }

  /** Render Prometheus text-exposition format. */
  renderProm(activeSessions: number, activeInstances: number): string {
    const s = this.snapshot(activeSessions, activeInstances);
    const lines: string[] = [];
    const v = '0.1.0';

    lines.push('# HELP anton_relay_uptime_seconds Time since this relay process started.');
    lines.push('# TYPE anton_relay_uptime_seconds gauge');
    lines.push(`anton_relay_uptime_seconds{version="${v}"} ${s.uptime_sec}`);

    lines.push('# HELP anton_relay_active_sessions Currently matched (phone, instance) sessions.');
    lines.push('# TYPE anton_relay_active_sessions gauge');
    lines.push(`anton_relay_active_sessions ${s.active_sessions}`);

    lines.push('# HELP anton_relay_active_instances Currently registered instance HELLOs awaiting or matched.');
    lines.push('# TYPE anton_relay_active_instances gauge');
    lines.push(`anton_relay_active_instances ${s.active_instances}`);

    lines.push('# HELP anton_relay_hello_accepted_total HELLO_INSTANCE / HELLO_PHONE messages accepted.');
    lines.push('# TYPE anton_relay_hello_accepted_total counter');
    lines.push(`anton_relay_hello_accepted_total ${s.hello_accepted_total}`);

    lines.push('# HELP anton_relay_hello_rejected_total HELLO rejections, labelled by error code.');
    lines.push('# TYPE anton_relay_hello_rejected_total counter');
    for (const [code, n] of Object.entries(s.hello_rejected_total)) {
      lines.push(`anton_relay_hello_rejected_total{code="${code}"} ${n}`);
    }

    lines.push('# HELP anton_relay_envelope_forwarded_total ENVELOPE frames forwarded between matched legs.');
    lines.push('# TYPE anton_relay_envelope_forwarded_total counter');
    lines.push(`anton_relay_envelope_forwarded_total ${s.envelope_forwarded_total}`);

    lines.push('# HELP anton_relay_envelope_rejected_total ENVELOPE frames dropped (no live session, wrong direction, etc).');
    lines.push('# TYPE anton_relay_envelope_rejected_total counter');
    lines.push(`anton_relay_envelope_rejected_total ${s.envelope_rejected_total}`);

    lines.push('# HELP anton_relay_sessions_opened_total Cumulative count of matched sessions opened.');
    lines.push('# TYPE anton_relay_sessions_opened_total counter');
    lines.push(`anton_relay_sessions_opened_total ${s.sessions_opened_total}`);

    lines.push('# HELP anton_relay_sessions_closed_total Cumulative count of matched sessions closed.');
    lines.push('# TYPE anton_relay_sessions_closed_total counter');
    lines.push(`anton_relay_sessions_closed_total ${s.sessions_closed_total}`);

    lines.push('# HELP anton_relay_rate_limited_total Requests rejected by the rate limiter (HELLO or ENVELOPE).');
    lines.push('# TYPE anton_relay_rate_limited_total counter');
    lines.push(`anton_relay_rate_limited_total ${s.rate_limited_total}`);

    lines.push('# HELP anton_relay_ws_connections_opened_total Total WS connections accepted since boot.');
    lines.push('# TYPE anton_relay_ws_connections_opened_total counter');
    lines.push(`anton_relay_ws_connections_opened_total ${s.ws_connections_opened_total}`);

    lines.push('# HELP anton_relay_ws_connections_closed_total Total WS connections closed since boot.');
    lines.push('# TYPE anton_relay_ws_connections_closed_total counter');
    lines.push(`anton_relay_ws_connections_closed_total ${s.ws_connections_closed_total}`);

    return lines.join('\n') + '\n';
  }
}
