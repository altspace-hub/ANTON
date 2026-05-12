/**
 * offline.ts — Offline resilience for the companion app.
 * - Caches sessions and messages locally in localStorage
 * - Queues messages when offline, sends when reconnected
 * - Tracks connection status
 */

const CACHE_PREFIX = 'anton-cache-';
const QUEUE_KEY = 'anton-offline-queue';

// ── Connection status ────────────────────────────────────────────────────────

type ConnectionListener = (online: boolean) => void;
const listeners: ConnectionListener[] = [];

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onConnectionChange(fn: ConnectionListener): () => void {
  listeners.push(fn);
  const handleOnline = () => listeners.forEach(l => l(true));
  const handleOffline = () => listeners.forEach(l => l(false));
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// ── Session cache ────────────────────────────────────────────────────────────

interface CachedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface CachedSession {
  id: string;
  orgId: string;
  title: string;
  messages: CachedMessage[];
  updatedAt: number;
}

export function cacheSession(session: CachedSession): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}session-${session.id}`, JSON.stringify(session));
    // Update session index
    const index = getCachedSessionIndex(session.orgId);
    const existing = index.findIndex(s => s.id === session.id);
    if (existing >= 0) index[existing] = { id: session.id, title: session.title, updatedAt: session.updatedAt };
    else index.unshift({ id: session.id, title: session.title, updatedAt: session.updatedAt });
    localStorage.setItem(`${CACHE_PREFIX}sessions-${session.orgId}`, JSON.stringify(index.slice(0, 50)));
  } catch {} // localStorage full — silent fail
}

export function getCachedSession(sessionId: string): CachedSession | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}session-${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getCachedSessionIndex(orgId: string): Array<{ id: string; title: string; updatedAt: number }> {
  try {
    return JSON.parse(localStorage.getItem(`${CACHE_PREFIX}sessions-${orgId}`) || '[]');
  } catch {
    return [];
  }
}

// ── Offline message queue ────────────────────────────────────────────────────

export interface QueuedMessage {
  id: string;
  orgId: string;
  sessionId: string | null;
  message: string;
  timestamp: number;
}

export function queueMessage(msg: QueuedMessage): void {
  try {
    const queue = getQueue();
    queue.push(msg);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export function getQueue(): QueuedMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearQueue(): void {
  localStorage.setItem(QUEUE_KEY, '[]');
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter(m => m.id !== id);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
