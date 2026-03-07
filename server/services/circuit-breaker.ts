/**
 * RATE-02: Simple circuit breaker for Claude API calls.
 * Trips after 3 consecutive 5xx errors in a 60-second window.
 * While open, all new Claude API requests are immediately rejected with 503.
 */

import { childLogger } from '../lib/logger.js';

const log = childLogger('circuit-breaker');

const FAILURE_THRESHOLD = Number(process.env.CB_FAILURE_THRESHOLD) || 3;
const RESET_TIMEOUT_MS  = Number(process.env.CB_RESET_TIMEOUT_MS)  || 60_000;

type State = 'closed' | 'open' | 'half-open';

let state: State = 'closed';
let consecutiveFailures = 0;
let openedAt: number | null = null;

export function isCircuitOpen(): boolean {
  if (state === 'open') {
    // Auto-transition to half-open after timeout
    if (openedAt !== null && Date.now() - openedAt >= RESET_TIMEOUT_MS) {
      state = 'half-open';
      log.info({ state }, 'Circuit moved to half-open — probing Claude API');
      return false;
    }
    return true;
  }
  return false;
}

export function recordSuccess(): void {
  if (state === 'half-open') {
    state = 'closed';
    log.info({ state }, 'Circuit closed — Claude API healthy');
  }
  consecutiveFailures = 0;
}

export function recordFailure(status?: number): void {
  // Only count 5xx as circuit-breaking errors
  if (typeof status === 'number' && status < 500) return;

  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    if (state !== 'open') {
      state = 'open';
      openedAt = Date.now();
      log.warn({ state, consecutiveFailures, resetAfterMs: RESET_TIMEOUT_MS },
        'Circuit OPENED — too many consecutive Claude API errors');
    }
  }
}

export function getCircuitState(): { state: State; consecutiveFailures: number; openedAt: number | null } {
  return { state, consecutiveFailures, openedAt };
}
