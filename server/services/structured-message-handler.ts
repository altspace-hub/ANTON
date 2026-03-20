import type { DatabaseAdapter } from '../db/database.js';

interface StructuredMessage {
  messageType: 'text' | 'knowledge_share' | 'bundle_push' | 'bundle_request' | 'capability_exchange' | 'task_request' | 'task_response';
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

const VALID_TYPES = new Set(['text', 'knowledge_share', 'bundle_push', 'bundle_request', 'capability_exchange', 'task_request', 'task_response']);

export async function createStructuredMessageHandler(db: DatabaseAdapter) {

  function validateMessage(msg: StructuredMessage): { valid: boolean; error?: string } {
    if (!VALID_TYPES.has(msg.messageType)) {
      return { valid: false, error: `Invalid message type: ${msg.messageType}` };
    }
    if (msg.messageType !== 'text' && !msg.payload) {
      return { valid: false, error: 'Structured messages require a payload' };
    }

    switch (msg.messageType) {
      case 'knowledge_share':
        if (!msg.payload.content) return { valid: false, error: 'knowledge_share requires content' };
        break;
      case 'bundle_push':
        if (!msg.payload.bundleType || !msg.payload.bundleName)
          return { valid: false, error: 'bundle_push requires bundleType and bundleName' };
        break;
      case 'bundle_request':
        if (!msg.payload.requestedBundleType)
          return { valid: false, error: 'bundle_request requires requestedBundleType' };
        break;
      case 'capability_exchange':
        if (!msg.payload.capabilityCard)
          return { valid: false, error: 'capability_exchange requires capabilityCard' };
        break;
      case 'task_request':
        if (!msg.payload.title || !msg.payload.description)
          return { valid: false, error: 'task_request requires title and description' };
        break;
      case 'task_response':
        if (!msg.payload.taskId || !msg.payload.status)
          return { valid: false, error: 'task_response requires taskId and status' };
        break;
    }
    return { valid: true };
  }

  async function shouldAutoProcess(senderHash: string, messageType: string): Promise<'accept' | 'ask' | 'block'> {
    const conn = await db.get<{ import_policy: string; auto_accept_types: string }>(
      "SELECT import_policy, auto_accept_types FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
      senderHash
    );
    if (!conn) return 'block';
    if (conn.import_policy === 'block') return 'block';
    if (conn.import_policy === 'auto_accept') {
      const types: string[] = typeof conn.auto_accept_types === 'string'
        ? JSON.parse(conn.auto_accept_types)
        : (conn.auto_accept_types ?? []);
      if (types.length === 0 || types.includes(messageType)) return 'accept';
    }
    return 'ask';
  }

  return { validateMessage, shouldAutoProcess };
}

export type StructuredMessageHandler = Awaited<ReturnType<typeof createStructuredMessageHandler>>;
