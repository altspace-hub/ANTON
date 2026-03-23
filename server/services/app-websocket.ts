/**
 * app-websocket.ts
 * Socket.IO /companion namespace handler for companion app real-time queries.
 * Follows /study-rooms and /community namespace patterns.
 *
 * SEC: Auth via session token, per-socket rate limiting, no PII in logs.
 */

import type { Namespace } from 'socket.io';
import type { DatabaseAdapter } from '../db/database.js';
import type { createAppGatewayService } from './app-gateway.js';
import { hashSessionToken } from './identity.js';

export function setupCompanionNamespace(
  ns: Namespace,
  db: DatabaseAdapter,
  gatewaySvc: Awaited<ReturnType<typeof createAppGatewayService>>
) {
  // ── Auth middleware — validate session token ─────────────────────────────
  ns.use(async (socket, next) => {
    const sessionToken = (socket.handshake.auth as Record<string, string>)?.sessionToken;
    if (!sessionToken) {
      return next(new Error('Missing sessionToken in auth'));
    }

    try {
      // SEC: Hash the token for lookup — matches hashed storage pattern
      const tokenHash = hashSessionToken(sessionToken);
      const tokenRow = await db.get<{ connected_user_id: string; expires_at: string }>(
        'SELECT connected_user_id, expires_at FROM app_session_tokens WHERE token = $1',
        tokenHash
      );

      if (!tokenRow) return next(new Error('Invalid session'));
      if (new Date(tokenRow.expires_at) < new Date()) return next(new Error('Session expired'));

      const user = await db.get<{
        id: string;
        contact_hash: string;
        display_name: string | null;
        status: string;
      }>(
        'SELECT id, contact_hash, display_name, status FROM connected_users WHERE id = $1',
        tokenRow.connected_user_id
      );

      if (!user || user.status !== 'active') return next(new Error('Account inactive'));

      // Attach user to socket data
      (socket.data as Record<string, unknown>).appUser = {
        id: user.id,
        contactHash: user.contact_hash,
        displayName: user.display_name,
      };

      next();
    } catch (err) {
      console.error('[companion-ws] Auth error');
      next(new Error('Authentication failed'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────
  ns.on('connection', (socket) => {
    const user = (socket.data as Record<string, unknown>).appUser as {
      id: string;
      contactHash: string;
      displayName: string | null;
    };

    // SEC: Log user ID only — no contact hash or display name (PII)
    console.log(`[companion-ws] Connected: ${user.id}`);

    // SEC: Per-socket rate limiter — 10 queries/min
    let queryTimestamps: number[] = [];
    const WS_RATE_LIMIT = 10;
    const WS_RATE_WINDOW_MS = 60000;

    function checkWsRateLimit(): boolean {
      const now = Date.now();
      queryTimestamps = queryTimestamps.filter(t => now - t < WS_RATE_WINDOW_MS);
      if (queryTimestamps.length >= WS_RATE_LIMIT) return false;
      queryTimestamps.push(now);
      return true;
    }

    // ── Query event — streams AI response back ───────────────────────────
    socket.on('query', async (payload: {
      requestId: string;
      orgId: string;
      message: string;
      sessionId?: string;
      intentCategoryId?: string;
      voiceInput?: boolean;
      outputLanguage?: string;
    }) => {
      const { requestId, orgId, message, sessionId, intentCategoryId, voiceInput, outputLanguage } = payload;

      console.log(`[companion-ws] Query from ${user.id}: orgId=${orgId} msg="${message?.slice(0, 50)}"`);

      if (!requestId || !orgId || !message) {
        console.log(`[companion-ws] Missing fields: requestId=${!!requestId} orgId=${!!orgId} message=${!!message}`);
        socket.emit('error', { requestId, error: 'Missing required fields: requestId, orgId, message' });
        return;
      }

      // H1: SEC: Validate message length early (fail-fast before hitting service)
      if (typeof message !== 'string' || message.length > 2000) {
        socket.emit('stream_error', { requestId, error: 'Message too long (max 2000 characters)' });
        return;
      }

      // SEC: Rate limit per socket
      if (!checkWsRateLimit()) {
        socket.emit('stream_error', { requestId, error: 'Rate limit exceeded — max 10 queries/min' });
        return;
      }

      try {
        // L8: stream_start emitted before LLM call — session/intent info added in stream_end
        socket.emit('stream_start', { requestId, orgId });

        await gatewaySvc.processQuery(
          {
            orgId,
            userId: user.id,
            message,
            sessionId,
            intentCategoryId,
            voiceInput,
            outputLanguage,
          },
          // onEvent — stream SSE-style events to the client
          (event: object) => {
            const evt = event as Record<string, unknown>;
            if (evt.type === 'content_block_delta') {
              const delta = evt.delta as Record<string, unknown>;
              if (delta?.type === 'text_delta') {
                socket.emit('stream_chunk', { requestId, text: delta.text });
              }
            } else if (evt.type === 'thinking') {
              socket.emit('stream_thinking', { requestId, text: (evt as Record<string, unknown>).text });
            }
          },
          // onComplete
          (result) => {
            socket.emit('stream_end', {
              requestId,
              sessionId: result.sessionId,
              messageId: result.messageId,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              resolvedArea: result.resolvedArea,
              resolvedModule: result.resolvedModule,
            });
          }
        );
      } catch (err) {
        console.error(`[companion-ws] Query error for user ${user.id}:`, err instanceof Error ? err.message : err);
        socket.emit('stream_error', {
          requestId,
          error: err instanceof Error ? err.message : 'Query processing failed',
        });
      }
    });

    // ── M8: Typing indicator relay ──────────────────────────────────────
    socket.on('typing', (payload: { orgId: string; isTyping: boolean }) => {
      // Broadcast typing state to other sockets connected to the same org
      // (useful for admin dashboard showing real-time activity)
      socket.broadcast.emit('user_typing', {
        userId: user.id,
        displayName: user.displayName,
        orgId: payload.orgId,
        isTyping: payload.isTyping,
        timestamp: Date.now(),
      });
    });

    // ── M8: Session resume — load previous context on reconnect ──────────
    socket.on('session_resume', async (payload: {
      requestId: string;
      sessionId: string;
      orgId: string;
    }) => {
      const { requestId, sessionId, orgId } = payload;
      if (!requestId || !sessionId || !orgId) {
        socket.emit('error', { requestId, error: 'Missing required fields' });
        return;
      }
      try {
        const detail = await gatewaySvc.getSessionDetail(sessionId, user.id);
        if (!detail) {
          socket.emit('session_resumed', { requestId, error: 'Session not found' });
          return;
        }
        socket.emit('session_resumed', {
          requestId,
          sessionId,
          messages: (detail.messages as unknown as Array<{ id: string; role: string; content: string; created_at: string }>).map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          })),
        });
      } catch {
        socket.emit('session_resumed', { requestId, error: 'Failed to resume session' });
      }
    });

    // ── Heartbeat ────────────────────────────────────────────────────────
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[companion-ws] Disconnected: ${user.id} (${reason})`);
    });
  });
}
