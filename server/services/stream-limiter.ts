/**
 * STREAM-05: Per-user concurrent stream limiter.
 * Tracks active SSE streams per user and rejects new ones when the limit is exceeded.
 * Default limit: 3 concurrent streams per user (configurable via env STREAM_CONCURRENCY_LIMIT).
 */

const MAX_CONCURRENT = Number(process.env.STREAM_CONCURRENCY_LIMIT) || 3;

// userId → count of active streams
const activeStreams = new Map<string, number>();

export function acquireStream(userId: string): boolean {
  const current = activeStreams.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT) return false;
  activeStreams.set(userId, current + 1);
  return true;
}

export function releaseStream(userId: string): void {
  const current = activeStreams.get(userId) ?? 0;
  if (current <= 1) {
    activeStreams.delete(userId);
  } else {
    activeStreams.set(userId, current - 1);
  }
}

export function getActiveStreamCount(userId: string): number {
  return activeStreams.get(userId) ?? 0;
}

export function getTotalActiveStreams(): number {
  let total = 0;
  for (const count of activeStreams.values()) total += count;
  return total;
}
