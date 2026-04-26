#!/usr/bin/env bash
# deep-llm-parity.sh — Pattern G.13 (STUB)
# LLM provider parity audit across 6 providers.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# G.13 — LLM Provider Parity

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.13 (STUB — TODO)
**Status:** Skeleton only. Real implementation deferred.

## What this audit will do (when implemented)

For each adapter (Anthropic, Azure OpenAI, OpenAI, Mistral, Gemini, Ollama):

| Feature | Check |
|---|---|
| Streaming | adapter handles SSE / chunked response |
| Tool use | adapter sends tools + parses tool_calls |
| Prompt caching | adapter passes cache_control headers |
| Structured outputs | adapter handles JSON schema mode |
| Vision | adapter accepts image content blocks |
| Long context | adapter handles ≥1M tokens (Opus 4.7 / Sonnet 4.6) |
| Cost tracking | adapter records usage to cost-tracking-service |
| Error shape | uniform error contract surfaced |
| Retry policy | consistent backoff |
| Beta flags | compact-2026-01-12 header, sonnet-4.5-long-context flag |

Plus model-version drift: ensure default-fallback model strings match current catalog.

See addendum §G.13 for full spec.

## Why this matters

When adapters drift, users on different providers get subtly different behaviour.
A user who tests on Opus and deploys on Mistral may discover six months later
that tool calls were silently dropped in Mistral.

## Manual quick-check today

\`\`\`bash
# Adapter inventory
ls server/services/adapters/ 2>/dev/null

# Model-version references (drift candidates)
grep -rn "claude-opus-4-6\\|claude-sonnet-4-5\\|gpt-4o-2024" server/services/ --include="*.ts" | head -10

# Cost-tracking integration per adapter
grep -ln "costTracker\\|recordCost" server/services/adapters/ 2>/dev/null
\`\`\`
EOF
