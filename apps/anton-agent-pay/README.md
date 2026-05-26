# Anton Agent Pay

> **Status:** Phase 1 scaffold (2026-05-24). JSON-RPC + pairing + proposal + modal-contract + MCP wrapper shipped + tested. Electron shell, real chain wiring, and code-signing are pending — first run on Windows.

Anton Agent Pay is a small **desktop** wallet that exposes a local JSON-RPC + MCP server so third-party AI agents (Claude Desktop, OpenCLAW, custom LangGraph bots) can drive FTC payments under **non-negotiable human-in-the-loop confirmation**.

Spec: [`docs/ANTON_AGENT_PAY_SPEC.md`](../../docs/ANTON_AGENT_PAY_SPEC.md) in this repo's monorepo root.

## What's in Phase 1 (this scaffold)

- **JSON-RPC 2.0 server** (Fastify, bound 127.0.0.1 only). Methods:
  `getStatus`, `getBalance`, `listTransactions`, `proposePayment`,
  `getProposal`, `cancelProposal`.
- **Pairing flow**: 6-digit code shown in UI → agent POSTs `/pair` →
  session bearer (256-bit, SHA-256-only storage).
- **Proposal store**: in-memory, TTL'd (10 s ≤ ttl ≤ 5 min, default 60 s),
  state machine `pending → approved → sent` / `rejected` / `expired` / `cancelled`.
- **Modal contract**: `ModalDriver` interface with a `StubModalDriver`
  test double; the Electron `BrowserWindow` impl slots in for production.
- **MCP wrapper**: 6 tools exposed via `@modelcontextprotocol/sdk`; same
  business logic as the JSON-RPC layer.
- **Tests**: 33 unit + integration tests covering proposals, pairing,
  the full pair → propose → modal-decide → submit pipeline (with stubs).

## What's NOT in Phase 1

- The Electron main.ts that actually opens windows + binds the HTTP
  port + wires the MCP stdio transport.
- Wallet UI (create / import / show recovery phrase).
- Real chain integration (`@futurechain/sdk` calls). The integration
  tests use a record-and-replay stub; production main.ts will inject
  the real `RpcClient`.
- Code signing (macOS notarization / Windows Authenticode / Linux Flatpak).
- Desktop attestation primitive (see spec §9 — Phase 2 follow-up).

These are the explicit Phase 2 items captured in the spec §14.

## Running the tests

```bash
# from this directory
pnpm install
pnpm test
```

All tests run under vitest with no native deps — no Electron, no chain,
no Capacitor. The full suite finishes in under 2 s.

## Trying it out locally (Phase 2 onwards)

Once the Electron shell lands:

```bash
pnpm install
pnpm start:electron
```

Then in your AI-agent runtime:

1. Pair the agent (Settings → Pair an agent → read off the 6-digit code,
   POST it to `/pair`).
2. Propose a payment: `POST /rpc` with method `proposePayment`.
3. Watch the modal open on the desktop.
4. Click Approve or Reject.
5. Poll `getProposal` for the outcome.

## File layout

```
apps/anton-agent-pay/
├── package.json              # Electron + Fastify + MCP SDK + Vitest
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── shared/
│   │   └── ipc-types.ts      # Types shared main↔renderer↔server
│   ├── main/
│   │   ├── proposals.ts      # In-memory proposal store with TTLs
│   │   ├── pairing.ts        # 6-digit code → session bearer
│   │   ├── modal.ts          # ModalDriver interface + StubModalDriver
│   │   ├── server.ts         # Fastify JSON-RPC server
│   │   └── mcp.ts            # MCP wrapper (same surface, different transport)
│   └── renderer/             # (placeholder for Phase 2 modal + settings HTML)
└── tests/
    ├── unit/
    │   ├── proposals.test.ts
    │   └── pairing.test.ts
    └── integration/
        └── server.test.ts    # End-to-end JSON-RPC with stubs
```

## The safety boundary

Every successful `proposePayment` ends with an OS-native modal the agent
**cannot spoof**. There is no JSON-RPC method that bypasses it. There is
no production-build CLI flag that bypasses it. The MCP transport routes
through the same modal driver. This is by design (see spec §2 + §7).

Even if the calling agent is compromised, even if the user's API key
leaks, even if a prompt-injection convinces the agent to drain the
wallet — the modal stands between the proposal and the chain. The
worst an attacker can do is generate noise (proposals that the user
rejects).

## Related

- [`docs/ANTON_AGENT_PAY_SPEC.md`](../../docs/ANTON_AGENT_PAY_SPEC.md) — full spec
- [`docs/PAY_WALLET_PASSPHRASE_SPEC.md`](../../docs/PAY_WALLET_PASSPHRASE_SPEC.md) — envelope v3 (reused)
- [`docs/PAY_DEVICE_ATTESTATION_SPEC.md`](../../docs/PAY_DEVICE_ATTESTATION_SPEC.md) — attestation (with desktop caveat)
