/**
 * relay/wallet-router.ts — the wallet.* wire router: lets the paired phone READ
 * the agent's wallet (status + recent transactions) over the relay channel. It
 * proxies the separate Agent Pay gateway through an AgentPayReader (read-only).
 *
 * There is deliberately NO spend wire here — proposePayment stays gated inside
 * Agent Pay's own human-approval flow. The phone can VIEW the wallet; it can
 * never move money over this channel.
 *
 * Composed AFTER task-router (see compose-router.ts). Both routers no-op on
 * foreign kinds and only the matching one replies (the request `id` is echoed so
 * the phone correlates the async reply).
 */
import type { WireRouter, RelayWire } from './peer.js';
import { AgentPayUnreachableError, AgentPayRpcError, type AgentPayReader } from './agent-pay-client.js';

const AUTH_EXPIRED = -32002;

export function walletRouter(getReader: () => AgentPayReader | undefined): WireRouter {
  return async ({ wire, reply }) => {
    if (wire.kind !== 'wallet.status' && wire.kind !== 'wallet.transactions') return; // not ours
    const id = typeof wire.id === 'string' ? wire.id : undefined;
    const respond = (w: RelayWire) => reply(id ? { ...w, id } : w);

    const reader = getReader();
    if (!reader) return respond({ kind: 'wallet.unconfigured' });

    try {
      if (wire.kind === 'wallet.status') {
        const s = await reader.getStatus();
        return respond({
          kind: 'wallet.status', reachable: true,
          address: s.walletAddress, balanceFtc: s.balanceFtc, lastSeenBlock: s.lastSeenBlock,
        });
      }
      const limit = typeof wire.limit === 'number' ? Math.min(Math.max(1, Math.floor(wire.limit)), 200) : 30;
      const transactions = await reader.listTransactions(limit);
      return respond({ kind: 'wallet.transactions', reachable: true, transactions });
    } catch (e) {
      const error = e instanceof AgentPayRpcError && e.code === AUTH_EXPIRED ? 'Agent wallet needs re-pairing'
        : e instanceof AgentPayUnreachableError ? 'Agent wallet offline'
        : 'wallet read failed';
      return respond({ kind: wire.kind, reachable: false, error });
    }
  };
}
