/**
 * socket.ts
 *
 * Socket.IO client for School Mode Study Rooms.
 * Uses the /study-rooms namespace on the /school-ws path.
 */

import { io, type Socket } from 'socket.io-client';

let _socket: Socket | null = null;
let _currentRoom: string | null = null;

export interface StudyRoomMessage {
  socketId: string;
  displayName: string;
  text: string;
  timestamp: number;
}

export interface StudyRoomPresence {
  socketId: string;
  displayName: string;
  timestamp: number;
}

export interface FocusUpdate {
  socketId: string;
  displayName: string;
  subject: string;
  topic: string;
  timestamp: number;
}

/** Connect to a study room and return the socket. */
export function joinStudyRoom(
  roomId: string,
  displayName: string,
): Socket {
  // Disconnect from previous room if any
  if (_socket && _currentRoom !== roomId) {
    _socket.disconnect();
    _socket = null;
  }

  if (!_socket) {
    _socket = io('/study-rooms', {
      path: '/school-ws',
      query: { roomId, displayName },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    _currentRoom = roomId;
  }

  return _socket;
}

/** Disconnect from the current study room. */
export function leaveStudyRoom() {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
    _currentRoom = null;
  }
}

/** Send a chat message to the current room. */
export function sendRoomMessage(text: string, displayName: string) {
  _socket?.emit('message', { text, displayName });
}

/** Broadcast what you're currently studying. */
export function broadcastFocus(subject: string, topic: string, displayName: string) {
  _socket?.emit('focus:update', { subject, topic, displayName });
}

export function getSocket() {
  return _socket;
}
