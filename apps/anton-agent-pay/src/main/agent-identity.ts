/**
 * agent-identity.ts — the pseudonymous agent debtor identity + the human
 * Ultimate Beneficial Owner (UBO) this Agent Pay install pays on behalf of.
 *
 * Kept SDK-free (pure functions + env read) so BOTH the chain layer
 * (chain.ts, which builds the PACS.008 UltmtDbtr) and the JSON-RPC/MCP
 * server (server.ts, which surfaces "paying as …" in the approval modal)
 * can import it without pulling @futurechain/sdk into the server's module
 * graph — preserving the deps-injection decoupling between them.
 *
 * Agent Pay IS an agent wallet, so every payment goes out under a
 * pseudonymous "ANTON <addr6>" debtor while the human owner is disclosed
 * separately as the Ultimate Debtor (UltmtDbtr / UBO). Same scheme as the
 * Pay app's #88 agent wallets, so the identity is byte-identical across them.
 */

/** The pseudonymous debtor name an agent wallet presents on the wire:
 *  "ANTON " + the first 6 Base58 chars after the `fc_` prefix. Ported
 *  verbatim from src/pay/services/wallets.ts. */
export function agentDebtorName(address: string): string {
  const body = address.startsWith('fc_') ? address.slice(3) : address;
  return `ANTON ${body.slice(0, 6)}`;
}

/** The human Ultimate Beneficial Owner this agent pays on behalf of. */
export interface AgentUbo {
  /** Owner's legal name, e.g. "Daniel Bardun". */
  name: string;
  /** ISO 3166 alpha-2 country of residence (e.g. "SE"). Optional. */
  countryOfResidence?: string;
}

/** Resolve the configured UBO: an explicit override (tests / callers)
 *  first, else AGENT_PAY_UBO_NAME / AGENT_PAY_UBO_COUNTRY from the
 *  environment. Returns null when no owner is configured — the payment
 *  still goes out under the "ANTON <addr6>" identity, just without an
 *  UltmtDbtr disclosure (so an un-configured install never silently
 *  attributes the payment to the wrong human).
 *
 *  NOTE: the on-wire `CtryOfRes` is defaulted to "SE" by the SDK's
 *  `isoParty` for ANY party without a country (the agent Dbtr too). A
 *  non-Swedish owner MUST set AGENT_PAY_UBO_COUNTRY, or they'll be
 *  stamped SE-resident on the wire. */
export function resolveUbo(override?: AgentUbo): AgentUbo | null {
  const name = (override?.name ?? process.env.AGENT_PAY_UBO_NAME ?? '').trim();
  if (!name) return null;
  const country = (override?.countryOfResidence ?? process.env.AGENT_PAY_UBO_COUNTRY ?? '').trim();
  return { name, ...(country ? { countryOfResidence: country } : {}) };
}
