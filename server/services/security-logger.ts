import type { DatabaseAdapter } from '../db/database.js';

export interface SecurityEvent {
  eventType: 'failed_login' | 'unauthorized_access' | 'budget_exceeded' | 'rate_limit' | 'suspicious_activity' | 'invalid_input' | 'ssrf_attempt';
  userId?: string;
  ipAddress?: string;
  details: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Log security events to the database for monitoring and alerting.
 * Creates immutable audit trail of all security-relevant events.
 */
export async function logSecurityEvent(db: DatabaseAdapter, event: SecurityEvent): Promise<void> {
  try {
    await db.run(`
      INSERT INTO security_events (event_type, user_id, ip_address, details, severity, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, event.eventType,
      event.userId || null,
      event.ipAddress || null,
      event.details,
      event.severity || 'medium');
  } catch (error) {
    // Security logging should never break the app
    console.error('[security-logger] Failed to log security event:', error);
  }
}

/**
 * Query recent security events for the monitoring dashboard.
 */
export async function getRecentSecurityEvents(db: DatabaseAdapter, limit = 100): Promise<SecurityEvent[]> {
  try {
    const rows = await db.all<{
      event_type: SecurityEvent['eventType'];
      user_id: string | null;
      ip_address: string | null;
      details: string;
      severity: SecurityEvent['severity'];
    }>(`
      SELECT event_type, user_id, ip_address, details, severity
      FROM security_events
      ORDER BY created_at DESC
      LIMIT ?
    `, limit);
    return rows.map(r => ({
      eventType: r.event_type,
      userId: r.user_id ?? undefined,
      ipAddress: r.ip_address ?? undefined,
      details: r.details,
      severity: r.severity,
    }));
  } catch (error) {
    console.error('[security-logger] Failed to query security events:', error);
    return [];
  }
}

/**
 * Get security event statistics by type, over a rolling window.
 */
export async function getSecurityEventStats(db: DatabaseAdapter, hoursBack = 24): Promise<Record<string, number>> {
  try {
    const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
    const stats = await db.all<{ event_type: string; count: number | string }>(`
      SELECT event_type, COUNT(*) as count
      FROM security_events
      WHERE created_at > ?
      GROUP BY event_type
    `, since);

    return Object.fromEntries(
      stats.map(s => [s.event_type, typeof s.count === 'string' ? Number(s.count) : s.count]),
    );
  } catch (error) {
    console.error('[security-logger] Failed to get security stats:', error);
    return {};
  }
}
