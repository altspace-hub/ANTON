import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

/**
 * Enhanced Audit Logger Service
 *
 * Provides comprehensive audit logging for:
 * - AI model usage (audit_log table)
 * - Security events (security_events table)
 * - Login attempts (login_attempts table)
 * - General audit trail (audit_log table in schema_enhanced.sql)
 */

export interface AuditEntry {
  sessionId?: string;
  moduleId?: string;
  areaId?: string;
  model: string;
  provider?: string;
  thinkingLevel?: string;
  creativity?: string;
  writingTone?: string;
  emojiEnabled?: boolean;
  structuredReasoning?: boolean;
  transparencyLevel?: number;
  knowledgeSourcesUsed?: string[];
  inputTokenCount?: number;
  outputTokenCount?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  estimatedCostUsd?: number;
  responseStatus?: string;
  seed?: number;
  userId?: string;
  ragChunks?: string; // JSON array of {citation, relevance}
  systemPromptVersionId?: string; // GOV-02: versioned prompt ID from system_prompts table
}

export interface SecurityEvent {
  event_type: string;
  user_id?: string;
  ip_address?: string;
  details?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

export interface LoginAttempt {
  username: string;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  failure_reason?: string;
}

export interface GeneralAuditEvent {
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
  user_agent?: string;
  success?: boolean;
  error_message?: string;
}

/**
 * Write AI model usage audit entry
 */
export function writeAuditEntry(db: Database.Database, entry: AuditEntry): string {
  const id = randomUUID();
  try {
    db.prepare(`INSERT INTO audit_log (
      id, session_id, module_id, area_id, model, provider,
      thinking_level, creativity, writing_tone, emoji_enabled, structured_reasoning,
      transparency_level, knowledge_sources_used,
      input_token_count, output_token_count, cached_tokens, cache_creation_tokens,
      estimated_cost_usd, response_status, seed, user_id, rag_chunks,
      system_prompt_version_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id,
      entry.sessionId || null,
      entry.moduleId || null,
      entry.areaId || null,
      entry.model,
      entry.provider || 'anthropic',
      entry.thinkingLevel || null,
      entry.creativity || null,
      entry.writingTone || 'professional',
      entry.emojiEnabled ? 1 : 0,
      entry.structuredReasoning ? 1 : 0,
      entry.transparencyLevel || 0,
      entry.knowledgeSourcesUsed ? JSON.stringify(entry.knowledgeSourcesUsed) : null,
      entry.inputTokenCount || 0,
      entry.outputTokenCount || 0,
      entry.cachedTokens || 0,
      entry.cacheCreationTokens || 0,
      entry.estimatedCostUsd || 0,
      entry.responseStatus || 'completed',
      entry.seed !== undefined ? entry.seed : null,
      entry.userId || null,
      entry.ragChunks || null,
      entry.systemPromptVersionId || null
    );
    console.log(`[AuditLogger] Logged AI usage: ${entry.model} (session: ${entry.sessionId || 'none'})`);
  } catch (e) {
    console.error('[AuditLogger] Failed to write audit entry:', e);
  }
  return id;
}

/**
 * Log security event
 */
export function logSecurityEvent(db: Database.Database, event: SecurityEvent): number | null {
  try {
    const result = db.prepare(`
      INSERT INTO security_events (event_type, user_id, ip_address, details, severity)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      event.event_type,
      event.user_id || null,
      event.ip_address || null,
      event.details || null,
      event.severity || 'medium'
    );
    console.log(`[AuditLogger] Security event: ${event.event_type} (severity: ${event.severity})`);
    return result.lastInsertRowid as number;
  } catch (e) {
    console.error('[AuditLogger] Failed to log security event:', e);
    return null;
  }
}

/**
 * Log login attempt
 */
export function logLoginAttempt(db: Database.Database, attempt: LoginAttempt): number | null {
  try {
    const result = db.prepare(`
      INSERT INTO login_attempts (username, user_id, ip_address, user_agent, success, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      attempt.username,
      attempt.user_id || null,
      attempt.ip_address || null,
      attempt.user_agent || null,
      attempt.success ? 1 : 0,
      attempt.failure_reason || null
    );
    console.log(`[AuditLogger] Login attempt: ${attempt.username} - ${attempt.success ? 'SUCCESS' : 'FAILED'}`);
    return result.lastInsertRowid as number;
  } catch (e) {
    console.error('[AuditLogger] Failed to log login attempt:', e);
    return null;
  }
}

/**
 * Log general audit event (session creation, deletion, exports, etc.)
 * Note: This uses the audit_log table from schema_enhanced.sql, not the AI usage table
 */
export function logAuditEvent(db: Database.Database, event: GeneralAuditEvent): void {
  try {
    // Check if the enhanced audit_log table exists (from schema_enhanced.sql)
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'")
      .get();

    if (!tableExists) {
      console.warn('[AuditLogger] audit_log table does not exist, skipping general audit');
      return;
    }

    // Try to insert into the enhanced audit_log table
    // Note: This is different from the AI usage audit_log table
    try {
      db.prepare(`
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        event.user_id || null,
        event.action,
        event.resource_type,
        event.resource_id || null,
        event.old_value || null,
        event.new_value || null,
        event.ip_address || null,
        event.user_agent || null,
        event.success !== false ? 1 : 0,
        event.error_message || null
      );
      console.log(`[AuditLogger] General audit: ${event.action} on ${event.resource_type}`);
    } catch (e) {
      // Table might have different schema - that's OK, just skip
      console.debug('[AuditLogger] Could not log to general audit table:', e);
    }
  } catch (e) {
    console.error('[AuditLogger] Failed to log general audit event:', e);
  }
}

/**
 * Get audit log entries with filtering
 */
export function getAuditLog(
  db: Database.Database,
  filters: {
    sessionId?: string;
    moduleId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  let query = 'SELECT * FROM audit_log WHERE 1=1';
  const params: unknown[] = [];

  if (filters.sessionId) {
    query += ' AND session_id = ?';
    params.push(filters.sessionId);
  }
  if (filters.moduleId) {
    query += ' AND module_id = ?';
    params.push(filters.moduleId);
  }
  if (filters.startDate) {
    query += ' AND timestamp >= ?';
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    query += ' AND timestamp <= ?';
    params.push(filters.endDate);
  }

  query += ' ORDER BY timestamp DESC';
  query += ' LIMIT ?';
  params.push(filters.limit || 50);

  if (filters.offset) {
    query += ' OFFSET ?';
    params.push(filters.offset);
  }

  return db.prepare(query).all(...params);
}

/**
 * Get comprehensive audit statistics
 */
export function getAuditStats(db: Database.Database) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  return {
    totalCalls: (db.prepare('SELECT COUNT(*) as c FROM audit_log').get() as { c: number }).c,
    callsToday: (
      db
        .prepare('SELECT COUNT(*) as c FROM audit_log WHERE timestamp >= ?')
        .get(today + 'T00:00:00') as { c: number }
    ).c,
    costThisMonth: (
      db
        .prepare('SELECT COALESCE(SUM(estimated_cost_usd),0) as c FROM audit_log WHERE timestamp >= ?')
        .get(thisMonth + '-01') as { c: number }
    ).c,
    byModel: db
      .prepare(
        'SELECT model, COUNT(*) as calls, SUM(estimated_cost_usd) as total_cost FROM audit_log GROUP BY model ORDER BY calls DESC'
      )
      .all(),
    byModule: db
      .prepare(
        'SELECT module_id, COUNT(*) as calls FROM audit_log WHERE module_id IS NOT NULL GROUP BY module_id ORDER BY calls DESC LIMIT 10'
      )
      .all(),
  };
}

console.log('[AuditLogger Service] Enhanced audit logging initialized');

