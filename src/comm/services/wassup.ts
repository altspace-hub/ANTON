/**
 * wassup.ts — Wassup tab (R3 in COMM_APP_ROADMAP.md).
 *
 * Social-feed: short status posts that fan out to a chosen audience
 * over the existing E2E chat layer. Closed-graph (no public discovery).
 * Per-post 24h ephemerality by default. Local-only storage; each device
 * keeps its own copy of posts it received.
 *
 * v1 scope (this file):
 *   - Text + optional 1 image
 *   - Audience = all contacts (circles deferred)
 *   - Like (1 per user per post) + flat comments
 *   - Default 24h expiry, expired posts swept on app open
 *
 * Wire payloads live in chat.ts (kind: 'wassup_post' / 'wassup_like' /
 * 'wassup_comment' / 'wassup_delete'). The distribution mechanism is
 * client-fanout: when posting, iterate contacts and send one SEND_COMM
 * per recipient. Acceptable for ≤256 contacts (v1 cap).
 */

import {
  openDb,
  STORE_WASSUP_POSTS,
  STORE_WASSUP_INTERACTIONS,
  INDEX_POST_BY_CREATED,
  INDEX_INT_BY_POST,
} from './db';

// ── Types ───────────────────────────────────────────────────────────────

export interface WassupPost {
  id: string;
  authorHash: string;
  /** Display name cached at post time (so we don't need to look up author later) */
  authorName: string;
  text: string;
  image?: WassupMedia;
  createdAt: string;   // ISO
  /** When the post should be hidden locally. null = no expiry. */
  expiresAt: string | null;
  /** Outbound: list of recipient contact hashes the fanout targeted */
  audience?: string[];
  /** Inbound: did we already render this post once in the feed? */
  seen?: boolean;
  /** Mirror of like count from interactions store (denormalized for feed display) */
  likeCount: number;
  /** Mirror of comment count */
  commentCount: number;
}

export interface WassupMedia {
  /** Base64 (no data-URL prefix) */
  data: string;
  mimeType: string;
  width?: number;
  height?: number;
}

export type InteractionKind = 'like' | 'comment';

export interface WassupInteraction {
  id: string;            // ULID-ish
  postId: string;
  kind: InteractionKind;
  fromHash: string;
  fromName: string;
  /** Only for comments */
  text?: string;
  ts: string;            // ISO
}

// ── ID generation ──────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generatePostId(): string {
  const ts = Date.now();
  let prefix = '';
  let n = ts;
  for (let i = 0; i < 10; i++) { prefix = CHARS[n & 31] + prefix; n = Math.floor(n / 32); }
  const rnd = crypto.getRandomValues(new Uint8Array(10));
  let suffix = '';
  for (let i = 0; i < 10; i++) suffix += CHARS[rnd[i] & 31];
  return prefix + suffix;
}

export function generateInteractionId(): string {
  return generatePostId();
}

// ── Post CRUD ──────────────────────────────────────────────────────────

export async function listPosts(includeExpired = false): Promise<WassupPost[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WASSUP_POSTS, 'readonly');
    const index = tx.objectStore(STORE_WASSUP_POSTS).index(INDEX_POST_BY_CREATED);
    const req = index.getAll();
    req.onsuccess = () => {
      const now = new Date().toISOString();
      const rows = (req.result as WassupPost[]) ?? [];
      const filtered = includeExpired ? rows : rows.filter(p => !p.expiresAt || p.expiresAt > now);
      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPost(id: string): Promise<WassupPost | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WASSUP_POSTS, 'readonly');
    const req = tx.objectStore(STORE_WASSUP_POSTS).get(id);
    req.onsuccess = () => resolve((req.result as WassupPost | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putPost(post: WassupPost): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_WASSUP_POSTS, 'readwrite');
    tx.objectStore(STORE_WASSUP_POSTS).put(post);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deletePost(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_WASSUP_POSTS, STORE_WASSUP_INTERACTIONS], 'readwrite');
    tx.objectStore(STORE_WASSUP_POSTS).delete(id);
    // Cascade: delete interactions on this post
    const intStore = tx.objectStore(STORE_WASSUP_INTERACTIONS);
    const intIndex = intStore.index(INDEX_INT_BY_POST);
    const req = intIndex.openCursor(IDBKeyRange.only(id));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove all posts whose expiresAt is in the past. Run on app start + tab open. */
export async function sweepExpired(): Promise<number> {
  const posts = await listPosts(true);
  const now = new Date().toISOString();
  const expired = posts.filter(p => p.expiresAt && p.expiresAt < now);
  for (const p of expired) await deletePost(p.id);
  return expired.length;
}

// ── Interactions ──────────────────────────────────────────────────────

export async function listInteractions(postId: string): Promise<WassupInteraction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_WASSUP_INTERACTIONS, 'readonly');
    const index = tx.objectStore(STORE_WASSUP_INTERACTIONS).index(INDEX_INT_BY_POST);
    const req = index.getAll(IDBKeyRange.only(postId));
    req.onsuccess = () => {
      const rows = (req.result as WassupInteraction[]) ?? [];
      rows.sort((a, b) => a.ts.localeCompare(b.ts));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function putInteraction(interaction: WassupInteraction): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_WASSUP_INTERACTIONS, 'readwrite');
    tx.objectStore(STORE_WASSUP_INTERACTIONS).put(interaction);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Remove a 'like' from a given reactor on a given post. */
export async function removeLike(postId: string, reactorHash: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_WASSUP_INTERACTIONS, 'readwrite');
    const index = tx.objectStore(STORE_WASSUP_INTERACTIONS).index(INDEX_INT_BY_POST);
    const req = index.openCursor(IDBKeyRange.only(postId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const row = cursor.value as WassupInteraction;
        if (row.kind === 'like' && row.fromHash === reactorHash) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Has this reactor already liked the post? */
export async function hasLiked(postId: string, reactorHash: string): Promise<boolean> {
  const ints = await listInteractions(postId);
  return ints.some(i => i.kind === 'like' && i.fromHash === reactorHash);
}

/** Recompute denormalized like/comment counts on the post record after an interaction change. */
export async function refreshPostCounters(postId: string): Promise<void> {
  const post = await getPost(postId);
  if (!post) return;
  const ints = await listInteractions(postId);
  post.likeCount = ints.filter(i => i.kind === 'like').length;
  post.commentCount = ints.filter(i => i.kind === 'comment').length;
  await putPost(post);
}

// ── Wire payloads (consumed by chat.ts) ────────────────────────────────

export interface WassupPostWire {
  postId: string;
  authorHash: string;
  authorName: string;
  text: string;
  image?: WassupMedia;
  createdAt: string;
  expiresAt: string | null;
}

export interface WassupLikeWire {
  postId: string;
  reactorHash: string;
  reactorName: string;
  op: 'add' | 'remove';
}

export interface WassupCommentWire {
  postId: string;
  commenterHash: string;
  commenterName: string;
  text: string;
  ts: string;
}

export interface WassupDeleteWire {
  postId: string;
  authorHash: string;
}

// ── Apply inbound payloads (called by chat.ts on receive) ──────────────

export async function applyInboundPost(payload: WassupPostWire): Promise<void> {
  // De-dupe: if we already have this post, skip
  const existing = await getPost(payload.postId);
  if (existing) return;
  const post: WassupPost = {
    id: payload.postId,
    authorHash: payload.authorHash,
    authorName: payload.authorName,
    text: payload.text,
    image: payload.image,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
    seen: false,
    likeCount: 0,
    commentCount: 0,
  };
  await putPost(post);
}

export async function applyInboundLike(payload: WassupLikeWire): Promise<void> {
  if (payload.op === 'remove') {
    await removeLike(payload.postId, payload.reactorHash);
  } else {
    const already = await hasLiked(payload.postId, payload.reactorHash);
    if (already) return;
    await putInteraction({
      id: generateInteractionId(),
      postId: payload.postId,
      kind: 'like',
      fromHash: payload.reactorHash,
      fromName: payload.reactorName,
      ts: new Date().toISOString(),
    });
  }
  await refreshPostCounters(payload.postId);
}

export async function applyInboundComment(payload: WassupCommentWire): Promise<void> {
  await putInteraction({
    id: generateInteractionId(),
    postId: payload.postId,
    kind: 'comment',
    fromHash: payload.commenterHash,
    fromName: payload.commenterName,
    text: payload.text,
    ts: payload.ts,
  });
  await refreshPostCounters(payload.postId);
}

export async function applyInboundDelete(payload: WassupDeleteWire): Promise<void> {
  const post = await getPost(payload.postId);
  if (!post) return;
  // Only the author can delete their own post
  if (post.authorHash !== payload.authorHash) return;
  await deletePost(payload.postId);
}

// ── Defaults ───────────────────────────────────────────────────────────

export function defaultExpiryFromNow(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
