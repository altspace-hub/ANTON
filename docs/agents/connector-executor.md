# Agent Connector Executor

> How an agent reaches external systems. `agent-connector-executor.ts` is the bridge between an agent's capability descriptor and the actual connector implementation.

---

## What's a connector?

A connector is a binding between an agent and an external system the agent may call. Examples:

| Connector | Backed by | Verbs |
|---|---|---|
| `roaring-entity` | `roaring-connector.ts` | `get`, `search` |
| `dowjones-screening` | `dowjones-connector.ts` | `verify`, `search` |
| `salesforce-crm` | `connectors/salesforce-adapter.ts` | `list`, `get`, `search` |
| `hubspot-crm` | `connectors/hubspot-adapter.ts` | `list`, `get`, `search` |
| `external-rest-api` | generic REST connector | `get`, `list`, `submit`, `invoke` |
| `external-database` | `db-drivers/*` | `search`, `list`, `get` |
| `mcp-tool` | MCP client (`server/mcp/`) | varies per tool |

Each connector declares which 12-verb capabilities it supports + the schema for each verb's input/output.

---

## How a call flows

```
agent invocation (verb=search, args={...})
    │
    ▼
agent-processor.ts ─── routes via verb taxonomy
    │
    ▼
agent-connector-executor.ts ─── selects bound connector
    │
    ▼
ConnectorConfig: { id, type, credential_ref, config }
    │
    ▼
mission-credential.ts (fetch credential at call time, scrubbed after)
    │
    ▼
connector-specific call (HTTP / DB / MCP)
    │
    ▼
ConnectorCallResult: { success, data, error?, durationMs }
    │
    ▼
agent-processor.ts ─── feeds result back into the LLM turn
    │
    ▼
agent_invocations log entry (success/fail, tokens, duration)
```

`ConnectorConfig` and `ConnectorCallResult` are the canonical shapes — defined in `server/services/agent-connector-executor.ts:18` and `:28` respectively.

---

## Credential binding

An agent's connector references a credential **by id**, not by value. The credential lives in the per-instance Credential Vault ([`/docs/missions/credential-vault.md`](../missions/credential-vault.md)) — never inline in the agent profile. So:

- Sharing an agent (e.g. exporting as `.anton skill-pack`) shares the connector binding (the *id*) but not the credential value.
- A receiving instance must provide its own credential for the same logical service.
- Rotation in the vault is transparent to the agent — no edit needed.

This separation is what makes agents portable AND credential-safe.

---

## Capability gating

Even if an agent declares `connectors: ['salesforce-crm']`, the agent processor will refuse a call unless the requested verb appears in the connector's supported verb list AND the agent's capability list.

Example: an agent with `capabilities: ['get', 'list']` cannot perform a `submit` against `salesforce-crm`, even if the connector itself supports `submit`. The cap intersection is the agent's true reach.

---

## Adding a new connector type

1. **Implement** the connector under `server/services/connectors/<name>-adapter.ts` or under the appropriate `db-drivers/` / `integrations/` directory if it fits there.
2. **Register** it in `agent-connector-executor.ts` `CONNECTOR_REGISTRY` with: id, label, supported verbs, config schema (Zod or JSON Schema).
3. **Document** the connector in this file (table at top).
4. **Add tests** under `tests/services/connectors/<name>.test.ts`.

The pattern matches the workflow-step-registry approach (`server/services/workflow-step-registry.ts`) — single source of truth, declarative config, validate-at-registration.

---

## Where to look

- **Code:** `server/services/agent-connector-executor.ts`, `server/services/connectors/`, `server/services/db-drivers/`
- **Architecture:** [`/docs/architecture/27-specialized-agents.md`](../architecture/27-specialized-agents.md)
- **Vault:** [`/docs/missions/credential-vault.md`](../missions/credential-vault.md)
