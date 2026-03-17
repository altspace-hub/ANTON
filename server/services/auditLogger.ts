import type { DatabaseAdapter } from '../db/database.js';

import { randomUUID } from 'crypto';
import { childLogger } from '../lib/logger.js';

const log = childLogger('audit-logger');

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
export async function writeAuditEntry(db: DatabaseAdapter, entry: AuditEntry): string {
  const id = randomUUID();
  try {
    await db.run(`INSERT INTO audit_log (
      id, session_id, module_id, area_id, model, provider,
      thinking_level, creativity, writing_tone, emoji_enabled, structured_reasoning,
      transparency_level, knowledge_sources_used,
      input_token_count, output_token_count, cached_tokens, cache_creation_tokens,
      estimated_cost_usd, response_status, seed, user_id, rag_chunks,
      system_prompt_version_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id,
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
      entry.systemPromptVersionId || null);
    log.info({ model: entry.model, sessionId: entry.sessionId, cachedTokens: entry.cachedTokens }, 'AI usage logged');
  } catch (e) {
    log.error({ err: e }, 'Failed to write audit entry');
  }
  return id;
}

/**
 * Log security event
 */
export async function logSecurityEvent(db: DatabaseAdapter, event: SecurityEvent): number | null {
  try {
    const result = await db.run(`
      INSERT INTO security_events (event_type, user_id, ip_address, details, severity)
      VALUES (?, ?, ?, ?, ?)
    `, event.event_type,
      event.user_id || null,
      event.ip_address || null,
      event.details || null,
      event.severity || 'medium');
    log.info({ eventType: event.event_type, severity: event.severity }, 'Security event logged');
    return result.lastInsertRowid as number;
  } catch (e) {
    log.error({ err: e }, 'Failed to log security event');
    return null;
  }
}

/**
 * Log login attempt
 */
export async function logLoginAttempt(db: DatabaseAdapter, attempt: LoginAttempt): number | null {
  try {
    const result = await db.run(`
      INSERT INTO login_attempts (username, user_id, ip_address, user_agent, success, failure_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `, 
      attempt.username,
      attempt.user_id || null,
      attempt.ip_address || null,
      attempt.user_agent || null,
      attempt.success ? 1 : 0,
      attempt.failure_reason || null
    );
    log.info({ username: attempt.username, success: attempt.success }, 'Login attempt recorded');
    return result.lastInsertRowid as number;
  } catch (e) {
    log.error({ err: e }, 'Failed to log login attempt');
    return null;
  }
}

/**
 * Log general audit event (session creation, deletion, exports, etc.)
 * Note: This uses the audit_log table from schema_enhanced.sql, not the AI usage table
 */
export async function logAuditEvent(db: DatabaseAdapter, event: GeneralAuditEvent): Promise<void> {
  try {
    // Check if the enhanced audit_log table exists (from schema_enhanced.sql)
    const tableExists = await db.get("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log'");

    if (!tableExists) {
      log.warn('audit_log table does not exist, skipping general audit');
      return;
    }

    // Try to insert into the enhanced audit_log table
    // Note: This is different from the AI usage audit_log table
    try {
      await db.run(`
        INSERT INTO audit_log (user_id, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent, success, error_message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, 
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
      log.info({ action: event.action, resourceType: event.resource_type }, 'General audit event');
    } catch (e) {
      // Table might have different schema - that's OK, just skip
      log.debug({ err: e }, 'Could not log to general audit table');
    }
  } catch (e) {
    log.error({ err: e }, 'Failed to log general audit event');
  }
}

/**
 * Get audit log entries with filtering
 */
export async function getAuditLog(
  db: DatabaseAdapter,
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

  return await db.all(query, ...params);
}

/**
 * Get comprehensive audit statistics
 */
export async function getAuditStats(db: DatabaseAdapter) {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.substring(0, 7);

  return {
    totalCalls: ((await db.get('SELECT COUNT(*) as c FROM audit_log')) as { c: number } | undefined)?.c ?? 0,
    callsToday: (
      await db.get('SELECT COUNT(*) as c FROM audit_log WHERE timestamp >= ?', today + 'T00:00:00') as { c: number }
    ).c,
    costThisMonth: (
      await db.get('SELECT COALESCE(SUM(estimated_cost_usd),0) as c FROM audit_log WHERE timestamp >= ?', thisMonth + '-01') as { c: number }
    ).c,
    byModel: await db.all(
        'SELECT model, COUNT(*) as calls, SUM(estimated_cost_usd) as total_cost FROM audit_log GROUP BY model ORDER BY calls DESC'
      ),
    byModule: await db.all(
        'SELECT module_id, COUNT(*) as calls FROM audit_log WHERE module_id IS NOT NULL GROUP BY module_id ORDER BY calls DESC LIMIT 10'
      ),
  };
}

log.debug('Enhanced audit logging initialized');

