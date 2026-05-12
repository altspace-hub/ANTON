/**
 * Socket.IO client for the /companion namespace.
 * Handles real-time query streaming.
 */

import { io, Socket } from 'socket.io-client';
import { getSessionToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = getSessionToken();
  if (!token) throw new Error('No session token');

  // In dev, connect directly to ANTON server (bypasses Vite proxy for WebSocket)
  // In production, use same origin (companion app served from ANTON server)
  const serverUrl = window.location.port === '5184'
    ? `http://${window.location.hostname}:3011`  // Dev: connect directly to ANTON
    : '';  // Production: same origin

  socket = io(`${serverUrl}/companion`, {
    path: '/school-ws',
    auth: { sessionToken: token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => console.log('[companion] Connected'));
  socket.on('disconnect', (reason) => console.log('[companion] Disconnected:', reason));
  socket.on('connect_error', (err) => console.error('[companion] Connection error:', err.message));

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export interface StreamCallbacks {
  onStart?: () => void;
  onChunk?: (text: string) => void;
  onThinking?: (text: string) => void;
  onEnd?: (data: { sessionId: string; messageId: string; resolvedArea?: string; resolvedModule?: string }) => void;
  onError?: (error: string) => void;
}

export function sendQuery(
  orgId: string,
  message: string,
  callbacks: StreamCallbacks,
  options?: { sessionId?: string; outputLanguage?: string }
): string {
  const sock = connectSocket();
  const requestId = crypto.randomUUID();

  const cleanup = () => {
    sock.off(`stream_start`);
    sock.off(`stream_chunk`);
    sock.off(`stream_thinking`);
    sock.off(`stream_end`);
    sock.off(`stream_error`);
  };

  sock.on('stream_start', (data: { requestId: string }) => {
    if (data.requestId === requestId) callbacks.onStart?.();
  });

  sock.on('stream_chunk', (data: { requestId: string; text: string }) => {
    if (data.requestId === requestId) callbacks.onChunk?.(data.text);
  });

  sock.on('stream_thinking', (data: { requestId: string; text: string }) => {
    if (data.requestId === requestId) callbacks.onThinking?.(data.text);
  });

  sock.on('stream_end', (data: { requestId: string; sessionId: string; messageId: string; resolvedArea?: string; resolvedModule?: string }) => {
    if (data.requestId === requestId) {
      callbacks.onEnd?.(data);
      cleanup();
    }
  });

  sock.on('stream_error', (data: { requestId: string; error: string }) => {
    if (data.requestId === requestId) {
      callbacks.onError?.(data.error);
      cleanup();
    }
  });

  sock.emit('query', {
    requestId,
    orgId,
    message,
    sessionId: options?.sessionId,
    outputLanguage: options?.outputLanguage,
  });

  return requestId;
}
