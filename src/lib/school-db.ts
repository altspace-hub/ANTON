/**
 * school-db.ts
 *
 * Client-side IndexedDB cache for School Mode offline support.
 * Uses Dexie.js as a typed IndexedDB wrapper.
 *
 * Stores:
 *  - dashboard: Cached dashboard data (classes, stats, growth)
 *  - chatHistory: Per-class chat message history for offline browsing
 *  - reviewCards: Offline-available review cards
 *  - subjects: Subject catalogue for offline browsing
 *  - pendingActions: Queue of actions to sync when back online
 */

import Dexie, { type Table } from 'dexie';

// ── Type definitions ───────────────────────────────────────────────────────

export interface CachedDashboard {
  id: string;        // always 'current' — single record
  data: unknown;
  cachedAt: number;  // Date.now() timestamp
}

export interface CachedChatMessage {
  id: string;
  classId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface CachedReviewCard {
  id: string;
  subjectId: string;
  front: string;
  back: string;
  dueDate?: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
}

export interface CachedSubject {
  id: string;
  name: string;
  tier: string;
  description?: string;
}

export interface PendingAction {
  id?: number;       // auto-incremented
  type: string;      // 'review_card_answer' | 'chat_message' | etc.
  payload: unknown;
  createdAt: number;
  retries: number;
}

// ── Dexie database class ───────────────────────────────────────────────────

class SchoolDatabase extends Dexie {
  dashboard!: Table<CachedDashboard, string>;
  chatHistory!: Table<CachedChatMessage, string>;
  reviewCards!: Table<CachedReviewCard, string>;
  subjects!: Table<CachedSubject, string>;
  pendingActions!: Table<PendingAction, number>;

  constructor() {
    super('AntonSchoolDB');
    this.version(1).stores({
      dashboard:      'id, cachedAt',
      chatHistory:    'id, classId, timestamp',
      reviewCards:    'id, subjectId, dueDate',
      subjects:       'id, tier',
      pendingActions: '++id, type, createdAt',
    });
  }
}

export const schoolDB = new SchoolDatabase();

// ── Cache helpers ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function cacheDashboard(data: unknown): Promise<void> {
  try {
    await schoolDB.dashboard.put({ id: 'current', data, cachedAt: Date.now() });
  } catch { /* non-fatal */ }
}

export async function getCachedDashboard(): Promise<unknown | null> {
  try {
    const record = await schoolDB.dashboard.get('current');
    if (!record) return null;
    if (Date.now() - record.cachedAt > CACHE_TTL_MS) return null; // stale
    return record.data;
  } catch {
    return null;
  }
}

export async function cacheChatMessages(classId: string, messages: CachedChatMessage[]): Promise<void> {
  try {
    // Keep only last 50 messages per class
    await schoolDB.chatHistory.where('classId').equals(classId).delete();
    await schoolDB.chatHistory.bulkPut(messages.slice(-50));
  } catch { /* non-fatal */ }
}

export async function getCachedChatHistory(classId: string): Promise<CachedChatMessage[]> {
  try {
    return await schoolDB.chatHistory.where('classId').equals(classId).sortBy('timestamp');
  } catch {
    return [];
  }
}

export async function cacheReviewCards(cards: CachedReviewCard[]): Promise<void> {
  try {
    await schoolDB.reviewCards.bulkPut(cards);
  } catch { /* non-fatal */ }
}

export async function getDueReviewCards(today: string): Promise<CachedReviewCard[]> {
  try {
    return await schoolDB.reviewCards
      .where('dueDate')
      .belowOrEqual(today)
      .toArray();
  } catch {
    return [];
  }
}

export async function queuePendingAction(type: string, payload: unknown): Promise<void> {
  try {
    await schoolDB.pendingActions.add({ type, payload, createdAt: Date.now(), retries: 0 });
  } catch { /* non-fatal */ }
}

export async function getPendingActions(): Promise<PendingAction[]> {
  try {
    return await schoolDB.pendingActions.orderBy('createdAt').toArray();
  } catch {
    return [];
  }
}

export async function removePendingAction(id: number): Promise<void> {
  try {
    await schoolDB.pendingActions.delete(id);
  } catch { /* non-fatal */ }
}

/** True if we appear to have a working connection to our own server */
export function isOnline(): boolean {
  return navigator.onLine;
}
