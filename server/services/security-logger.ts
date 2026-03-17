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
export async function logSecurityEvent(db: Database, event: SecurityEvent): void {
  try {
    await db.run(`
      INSERT INTO security_events (event_type, user_id, ip_address, details, severity, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
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
 * Query recent security events for monitoring dashboard
 */
export function getRecentSecurityEvents(db: Database, limit = 100): SecurityEvent[] {
  try {

    return events as SecurityEvent[];
  } catch (error) {
    console.error('[security-logger] Failed to query security events:', error);
    return [];
  }
}

/**
 * Get security event statistics by type
 */
export async function getSecurityEventStats(db: Database, hoursBack = 24): Record<string, number> {
  try {
    const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
    const stats = await db.all(`
      SELECT event_type, COUNT(*) as count
      FROM security_events
      WHERE created_at > ?
      GROUP BY event_type
    `, since);

    return Object.fromEntries(
      stats.map((s: any) => [s.event_type, s.count])
    );
  } catch (error) {
    console.error('[security-logger] Failed to get security stats:', error);
    return {};
  }
}
