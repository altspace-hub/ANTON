/**
 * audit-writer.ts — Records every registry operation in the local audit log.
 *
 * Per Registry Protocol Reference §9.3: operation type, target portal,
 * timestamp, response status, returned log ID. Reuses the existing
 * `logAuditEvent()` from `auditLogger.ts` (the general audit_log table,
 * not the AI-usage table).
 */

import type { DatabaseAdapter } from '../../db/database.js';
import { logAuditEvent } from '../auditLogger.js';
import type { OperationType } from '../registry-protocol/envelope.js';

export interface PortalAuditEntry {
  operation: OperationType;
  portalId?: string;
  portalName?: string;
  namespace?: string;
  actorContactHash: string;
  responseStatus: 'success' | 'error';
  errorCode?: string;
  errorMessage?: string;
  /** Returned log_id from the registry on success. */
  registryLogId?: number;
}

export interface AuditWriter {
  write(entry: PortalAuditEntry): Promise<void>;
}

export function createAuditWriter(db: DatabaseAdapter): AuditWriter {
  return {
    async write(entry) {
      const newValue = JSON.stringify({
        operation: entry.operation,
        responseStatus: entry.responseStatus,
        errorCode: entry.errorCode,
        registryLogId: entry.registryLogId,
        portalName: entry.portalName,
        namespace: entry.namespace,
      });

      await logAuditEvent(db, {
        action: `registry.${entry.operation}`,
        resource_type: 'portal',
        resource_id: entry.portalId,
        new_value: newValue,
        success: entry.responseStatus === 'success',
        error_message: entry.errorMessage,
        // user_id intentionally omitted — actor identity is in newValue.actorContactHash
        // (the audit table's user_id refers to ANTON's internal user, not the portal owner).
      });
    },
  };
}
