/**
 * relay/compose-router.ts — run several WireRouters in sequence as one. Each
 * router handles only its own wire namespace (and no-ops on others), and the
 * id-echo means only the matching one replies. Order matters only for shared
 * kinds: keep taskRouter first (it answers `ping`; walletRouter ignores it).
 */
import type { WireRouter } from './peer.js';

export function composeRouters(...routers: WireRouter[]): WireRouter {
  return async (ctx) => { for (const r of routers) await r(ctx); };
}
