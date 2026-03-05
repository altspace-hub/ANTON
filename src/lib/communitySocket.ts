/**
 * communitySocket.ts
 *
 * Singleton Socket.IO client for the /community namespace.
 * Uses the same /school-ws transport path as study rooms.
 * Connect lazily — only when a community page is visited.
 */

import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectCommunitySocket(contactHash: string): Socket {
  if (socket?.connected) return socket;

  socket = io('/community', {
    path: '/school-ws',
    query: { contactHash },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  return socket;
}

export function getCommunitySocket(): Socket | null {
  return socket;
}

export function disconnectCommunitySocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
