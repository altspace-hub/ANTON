# Architecture Anti-Patterns

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** G.5

## 1. Services bypassing `unified-llm-client` / `claude-client`

Services that call provider SDKs directly instead of routing through the unified entry. Suspicious — should use `unified-llm-client` for adapter dispatch + caching.

```
server/services/extend-device-service.ts
server/services/humanitarian-service.ts
server/services/pathfinder-engine.ts
server/services/photo-id-service.ts
server/services/radar-fetcher.ts
```

## 2. Services bypassing `prompt-builder`

Files that assemble system prompts inline instead of going through `prompt-builder.ts`. Some are legitimate (school-prompt-builder, market-specific assemblers), others may be drift.

```
server/services/structured-extractor.ts
```

## 3. Most-imported services (god-service candidates)

Top 15 services by import count. Heavy import counts may justify a split.

```
     18 provider-router.js
     16 api
     15 claude-client.js
     12 identity
     11 instances
      9 connection-manager.js
      8 missions/mission-identity.js
      7 haptics
      5 text-extractor.js
      5 mail
      5 credential-vault.js
      4 workspace.js
      4 checkpoints
      3 webhook-listener.js
      3 tts
```

## 4. Duplicated table-name candidates

CREATE TABLE statements where the same name appears in multiple migrations (potential schema confusion or unintentional re-creation).

```
     28 missions
```

## 5. Routes without obvious auth / rate-limit

Route files that don't reference auth or rate-limit middleware. Some are intentionally public (visitor surfaces); audit each before assuming a bug.

```
admin.ts
agents.ts
ai-assist.ts
alignment-reviewer.ts
analytics.ts
app-gateway.ts
apprentice.ts
atlas.ts
audit-trail.ts
audit.ts
auth.ts
azure-openai.ts
batch.ts
canvas.ts
civic.ts
claude.ts
coding-large.ts
coding-review.ts
coding-scripts.ts
coding.ts
```

## Cadence

Quarterly via `pnpm run anton:investigate -- --pattern anti`.
