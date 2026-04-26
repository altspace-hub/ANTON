# Code Density Report

**Generated:** 2026-04-26 UTC
**Commit:** `0fabf7f`
**Pattern:** F.4

## 1. Largest files (services + pages, >500 lines, top 30)

```
awk: cmd. line:1: \$1 > 500
awk: cmd. line:1: ^ backslash not last character on line
```

## 2. Most-imported services (god-service candidates)

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
      3 skills-manager.js
      3 roaring-connector.js
      3 rag/indexer.js
      3 radar-fetcher.js
      3 quality-ratchet.js
```

## What to do

- A service that's both **>500 lines** AND **>20 imports** is a strong split candidate.
- An import that's lower-frequency (≤5) is fine even if the file is large.
- A small file (<200 lines) with high import count usually doesn't need splitting.

## Cadence

Quarterly.
