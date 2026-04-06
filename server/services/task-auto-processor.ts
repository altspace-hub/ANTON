/**
 * task-auto-processor.ts
 *
 * Autonomous task processing for inbound P2P task requests.
 * When another ANTON sends a task, this service:
 * 1. Creates a local inbound task record
 * 2. Auto-accepts (if delegation policy allows)
 * 3. Processes the task using Claude (via provider-router)
 * 4. Sends the result back via encrypted P2P
 *
 * This is the core of ANTON-to-ANTON autonomous collaboration.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { callChat } from './provider-router.js';

export async function createTaskAutoProcessor(db: DatabaseAdapter) {

  /**
   * Process an inbound task request from a peer ANTON.
   * Called by the P2P receive handler when message_type === 'task_request'.
   */
  async function processInboundTask(fromHash: string, payload: {
    taskId: string;
    title: string;
    description: string;
    requiredModules?: string[];
    context?: string;
    urgency?: string;
    deadline?: string;
    requesterCard?: Record<string, unknown>;
  }): Promise<{ status: string; taskId: string; resultSent: boolean }> {

    const identity = await db.get<{ contact_hash: string; display_name: string }>(
      "SELECT contact_hash, display_name FROM community_identity WHERE user_id = 'default'"
    );
    if (!identity) throw new Error('Community identity not activated');

    // Check delegation policy for this contact
    const conn = await db.get<{ delegation_trust_level: string; delegation_policy: string; endpoint: string | null; x25519_public_key: string | null }>(
      "SELECT delegation_trust_level, delegation_policy, endpoint, x25519_public_key FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
      fromHash
    );
    if (!conn) throw new Error(`Unknown sender: ${fromHash}`);

    const trustLevel = conn.delegation_trust_level ?? 'manual';
    const autoProcess = trustLevel === 'auto' || trustLevel === 'trusted';

    // Create inbound task record
    const localTaskId = `task_in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.run(`
      INSERT INTO community_delegated_tasks (id, requester_hash, provider_hash, direction,
        title, description, required_modules, context, urgency, deadline, status)
      VALUES (?, ?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?)
    `, localTaskId, fromHash, identity.contact_hash,
       payload.title, payload.description,
       JSON.stringify(payload.requiredModules ?? []),
       payload.context ?? null,
       payload.urgency ?? 'normal',
       payload.deadline ?? null,
       autoProcess ? 'accepted' : 'submitted');

    console.log(`[task-processor] Inbound task "${payload.title}" from ${fromHash} → ${autoProcess ? 'auto-processing' : 'awaiting manual review'}`);

    if (!autoProcess) {
      return { status: 'submitted', taskId: localTaskId, resultSent: false };
    }

    // ── Auto-process with AI ────────────────────────────────────────

    // Update status to in_progress
    await db.run(
      "UPDATE community_delegated_tasks SET status = 'in_progress', accepted_at = NOW(), started_at = NOW(), updated_at = NOW() WHERE id = ?",
      localTaskId
    );

    try {
      // Build context from local knowledge — search for relevant atoms
      let localKnowledge = '';
      try {
        // Search knowledge atoms for content relevant to the task
        const keywords = `${payload.title} ${payload.description}`.slice(0, 200);
        const relevantAtoms = await db.all<{ content: string; atom_type: string; confidence: number }>(
          `SELECT content, atom_type, confidence FROM knowledge_atoms
           WHERE content ILIKE ? AND confidence >= 0.5
           ORDER BY confidence DESC LIMIT 10`,
          `%${keywords.split(' ').slice(0, 3).join('%')}%`
        );
        if (relevantAtoms.length > 0) {
          localKnowledge = `\n\nLOCAL KNOWLEDGE (from this ANTON's knowledge base):\n` +
            relevantAtoms.map(a => `[${a.atom_type}|${a.confidence}] ${a.content}`).join('\n');
        }

        // Also check market atoms if relevant
        const marketAtoms = await db.all<{ content: string; atom_type: string; confidence: number }>(
          `SELECT content, atom_type, confidence FROM market_atoms
           WHERE is_active = 1 AND content ILIKE ?
           ORDER BY importance_score DESC NULLS LAST LIMIT 5`,
          `%${keywords.split(' ').slice(0, 3).join('%')}%`
        );
        if (marketAtoms.length > 0) {
          localKnowledge += `\n\nMARKET INTELLIGENCE:\n` +
            marketAtoms.map(a => `[${a.atom_type}|${a.confidence}] ${a.content}`).join('\n');
        }
      } catch { /* knowledge lookup is best-effort */ }

      // Build system prompt based on required modules + local knowledge
      const moduleContext = (payload.requiredModules ?? []).length > 0
        ? `The requester specifically needs help with: ${payload.requiredModules!.join(', ')}.`
        : '';

      const systemPrompt = `You are ANTON, an AI expert assistant. Another ANTON instance has delegated a task to you.
Process this task thoroughly and provide a complete, actionable response.

${moduleContext}

You have access to this ANTON instance's accumulated knowledge and intelligence.
Use any relevant local knowledge provided below to enrich your response.

Your response should be structured, professional, and directly actionable.
If the task requires analysis, provide detailed findings.
If it requires content creation, produce the full content.
If it requires research, provide comprehensive results with sources.
Use markdown formatting for readability.

Respond with your complete output — this will be sent directly back to the requesting ANTON.`;

      const userMessage = `TASK: ${payload.title}

DESCRIPTION:
${payload.description}

${payload.context ? `ADDITIONAL CONTEXT:\n${payload.context}` : ''}
${localKnowledge}

${payload.urgency === 'critical' || payload.urgency === 'high' ? 'NOTE: This is marked as ' + payload.urgency + ' urgency.' : ''}

Process this task and provide your complete response.`;

      const result = await callChat({
        tier: 'medium',
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        maxTokens: 32768,
        db,
      });

      // Save result
      await db.run(`
        UPDATE community_delegated_tasks SET
          status = 'completed', result_content = ?, progress_percent = 100,
          completed_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, result.text, localTaskId);

      // Add task message
      await db.run(`
        INSERT INTO community_task_messages (id, task_id, sender_hash, message_type, content, metadata)
        VALUES (?, ?, ?, 'status_change', ?, '{}')
      `, `tmsg_${Date.now()}`, localTaskId, identity.contact_hash,
         `Task completed. Result length: ${result.text.length} chars`);

      console.log(`[task-processor] Task "${payload.title}" completed (${result.text.length} chars)`);

      // ── Send result back to requester via P2P ─────────────────────
      let resultSent = false;
      try {
        // Get requester's connection info for P2P delivery
        const requesterConn = await db.get<{ endpoint: string | null; x25519_public_key: string | null }>(
          "SELECT endpoint, x25519_public_key FROM community_connections WHERE contact_hash = ? AND status IN ('accepted', 'active')",
          fromHash
        );

        if (requesterConn?.endpoint) {
          const resultMailId = `cm_result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          // Create the result mail
          await db.run(`
            INSERT INTO community_mail (id, from_hash, to_hashes, subject, body, folder, message_type, payload)
            VALUES (?, ?, ?, ?, ?, 'sent', 'task_result', ?)
          `, resultMailId, identity.contact_hash, JSON.stringify([fromHash]),
             `[Result] ${payload.title}`, result.text,
             JSON.stringify({
               originalTaskId: payload.taskId,
               localTaskId,
               title: payload.title,
               resultLength: result.text.length,
               tokensUsed: { input: result.inputTokens, output: result.outputTokens },
             }));

          // Enqueue for encrypted P2P delivery
          const { createMessageQueueService } = await import('./message-queue-service.js');
          const queueService = await createMessageQueueService(db);

          let encryptedPayload: string | undefined;
          if (requesterConn.x25519_public_key) {
            try {
              const { getMyX25519Keys, deriveSharedSecret, encryptMessage } = await import('./community-e2e.js');
              const { randomUUID } = await import('crypto');
              const myKeys = await getMyX25519Keys(db);
              if (myKeys) {
                const sharedSecret = deriveSharedSecret(myKeys.privateKeyHex, requesterConn.x25519_public_key);
                const plaintext = JSON.stringify({
                  subject: `[Result] ${payload.title}`,
                  body: result.text,
                  messageType: 'task_result',
                  nonce: randomUUID(),
                  timestamp: Date.now(),
                  payload: { originalTaskId: payload.taskId, localTaskId, title: payload.title },
                });
                const aad = `${identity.contact_hash}:${fromHash}`;
                const encrypted = encryptMessage(plaintext, sharedSecret, aad);
                encryptedPayload = JSON.stringify(encrypted);
              }
            } catch (encErr) {
              console.error('[task-processor] Encryption failed:', encErr instanceof Error ? encErr.message : encErr);
            }
          }

          await queueService.enqueueMessage(resultMailId, fromHash, encryptedPayload);
          resultSent = true;
          console.log(`[task-processor] Result for "${payload.title}" enqueued for P2P delivery back to ${fromHash}`);
        }
      } catch (sendErr) {
        console.error('[task-processor] Failed to send result back:', sendErr instanceof Error ? sendErr.message : sendErr);
      }

      return { status: 'completed', taskId: localTaskId, resultSent };

    } catch (aiErr) {
      // AI processing failed
      await db.run(
        "UPDATE community_delegated_tasks SET status = 'failed', updated_at = NOW() WHERE id = ?",
        localTaskId
      );
      await db.run(`
        INSERT INTO community_task_messages (id, task_id, sender_hash, message_type, content, metadata)
        VALUES (?, ?, ?, 'status_change', ?, '{}')
      `, `tmsg_${Date.now()}`, localTaskId, identity.contact_hash,
         `Task processing failed: ${aiErr instanceof Error ? aiErr.message : String(aiErr)}`);

      console.error(`[task-processor] Task "${payload.title}" failed:`, aiErr instanceof Error ? aiErr.message : aiErr);
      return { status: 'failed', taskId: localTaskId, resultSent: false };
    }
  }

  /**
   * Process an inbound task result from a peer ANTON.
   * Called when we receive a task_result message — the other ANTON completed our task.
   */
  async function processInboundResult(fromHash: string, payload: {
    originalTaskId: string;
    localTaskId?: string;
    title: string;
  }, resultContent: string): Promise<void> {
    // Find the original outbound task
    const task = await db.get<{ id: string; status: string }>(
      "SELECT id, status FROM community_delegated_tasks WHERE id = ? AND requester_hash = (SELECT contact_hash FROM community_identity LIMIT 1) AND direction = 'outbound'",
      payload.originalTaskId
    );

    if (task) {
      await db.run(`
        UPDATE community_delegated_tasks SET
          status = 'completed', result_content = ?, progress_percent = 100,
          completed_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `, resultContent, task.id);

      await db.run(`
        INSERT INTO community_task_messages (id, task_id, sender_hash, message_type, content, metadata)
        VALUES (?, ?, ?, 'status_change', ?, '{}')
      `, `tmsg_${Date.now()}`, task.id, fromHash,
         `Result received from peer (${resultContent.length} chars)`);

      console.log(`[task-processor] Result received for task "${payload.title}" from ${fromHash}`);
    } else {
      console.warn(`[task-processor] Received result for unknown task ${payload.originalTaskId} from ${fromHash}`);
    }
  }

  return { processInboundTask, processInboundResult };
}
