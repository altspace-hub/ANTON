/**
 * Side-effect-free identity constants.
 *
 * Kept separate from auth.ts so modules that only need the canonical owner id
 * (the companion-app gateway, the task-agent webhook intake) don't transitively
 * load auth.ts — which throws at module-load when JWT_SECRET is unset.
 */

/**
 * The canonical owner id in solo (single-operator) mode — the value authMiddleware
 * stamps on req.user.id. Anything that writes owner-scoped data outside a request
 * (webhook intake, companion-app gateway) MUST use this, not a literal 'default',
 * or the rows become invisible to the desktop owner.
 */
export const SOLO_USER_ID = 'solo';
