import type { Database } from 'better-sqlite3';

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
export function logSecurityEvent(db: Database, event: SecurityEvent): void {
  try {
    db.prepare(`
      INSERT INTO security_events (event_type, user_id, ip_address, details, severity, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(
      event.eventType,
      event.userId || null,
      event.ipAddress || null,
      event.details,
      event.severity || 'medium'
    );
  } catch (error) {
    // Security logging should never break the app
    console.error('[security-logger] Failed to log security event:', error);
  }
}

/**
 * Query recent security events for monitoring dashboard
 */
export function getRecentSecurityEvents(db: Database, limit = 100): SecurityEvent[] {
  try {
    const events = db.prepare(`
      SELECT event_type as eventType, user_id as userId, ip_address as ipAddress,
             details, severity, created_at as createdAt
      FROM security_events
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
    return events as SecurityEvent[];
  } catch (error) {
    console.error('[security-logger] Failed to query security events:', error);
    return [];
  }
}

/**
 * Get security event statistics by type
 */
export function getSecurityEventStats(db: Database, hoursBack = 24): Record<string, number> {
  try {
    const stats = db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM security_events
      WHERE created_at > datetime('now', '-' || ? || ' hours')
      GROUP BY event_type
    `).all(hoursBack);

    return Object.fromEntries(
      stats.map((s: any) => [s.event_type, s.count])
    );
  } catch (error) {
    console.error('[security-logger] Failed to get security stats:', error);
    return {};
  }
}
