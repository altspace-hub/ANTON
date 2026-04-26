#!/usr/bin/env bash
# deep-prompt-assembly.sh — Pattern G.12 (STUB)
# 12-layer prompt assembly correctness audit.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# G.12 — Prompt Assembly Correctness

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.12 (STUB — TODO)
**Status:** Skeleton only. Real implementation deferred.

## What this audit will do (when implemented)

For every (area, module) combination:

1. Simulate prompt assembly with a synthetic input (no LLM call)
2. Verify required layers present:
   - Layer 1: System foundation
   - Layer 2a: Org context
   - Layer 2b: Knowledge pack
   - Layer 2c: Sub-layers (Roaring — FCP only)
   - Layer 2d: Sub-layers (Dow Jones — sanctions only)
   - Layer 3: Area context
   - Layer 4: Module expertise
   - Layer 5: Persona / skill
   - Layer 6: Knowledge sources (user-attached)
   - Layer 7: Transparency / reasoning trail config
3. Verify layer order
4. Verify token budget (no overflow without compaction)
5. Verify sub-layer gating (Roaring NOT in non-FCP areas — leakage)
6. Verify cache key includes all variant inputs

See addendum §G.12 for full spec.

## Why this matters

This protects ANTON's signature differentiator. A subtle bug in prompt assembly
produces correct-looking but wrong outputs — the worst kind of bug because users
don't notice for months.

## Manual quick-check today

\`\`\`bash
# Find areas using Roaring (should be FCP-scope only)
grep -rln "createRoaringInjector\\|roaring-injector" server/areas/ --include="*.ts" | head -10

# Modules that override system foundation (Layer 1)
grep -rln "system.foundation\\|systemFoundation.*override" server/areas/ --include="*.ts" | head -10
\`\`\`
EOF
