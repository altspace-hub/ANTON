#!/usr/bin/env bash
# performance-hotpaths.sh — Pattern F.3
# Surfaces SELECT * patterns, await-in-loop candidates, and token-budget
# enforcement coverage.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Performance Hot-Paths

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** F.3 (candidate list — measure before optimising)

## 1. \`SELECT *\` patterns

Each one is a candidate for explicit column projection (smaller payload, less network).
EOF
echo ""
echo '```'
grep -rnE "SELECT \*" server/services/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | head -25 || echo "(none — clean!)"
echo '```'

cat <<EOF

## 2. \`await\` inside \`for\` / \`forEach\` (sequential where parallel might do)

A loop with \`await\` per iteration is sequential. If iterations are
independent, \`Promise.all(...)\` is faster.
EOF
echo ""
echo '```'
grep -rnE "for.*\(.*\).*\{|forEach\(.*async" server/services/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | grep -B0 -A0 "await" | head -25 || echo "(none flagged)"
echo '```'

cat <<EOF

## 3. Token-budget enforcement points

Every prompt path should respect a token ceiling — count where \`MAX_CONTEXT_TOKENS\`
or \`tokenBudget\` is consulted vs. where \`messages.create\` is called.
EOF
echo ""
echo '```'
echo "Token-budget references:"
grep -rnE "MAX_CONTEXT_TOKENS|tokenBudget|applyTokenBudget|estimateTokens" server/services/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | wc -l | xargs echo "  count:"
echo ""
echo "messages.create calls in services (vs. claude-client / adapters):"
grep -rln "messages\.create\|chat\.completions\.create" server/services/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules | grep -v "claude-client\|adapter\|unified-llm-client" \
  | head -10
echo '```'

cat <<EOF

## 4. Largest source files (>500 lines, top 15)

Big files often hide hot paths.
EOF
echo ""
echo '```'
find server/services -name "*.ts" 2>/dev/null \
  | xargs wc -l 2>/dev/null | sort -rn | awk '$1 > 500' | head -15
echo '```'

cat <<EOF

## What to do

- 🔴 **\`SELECT *\`** in hot paths → explicit columns.
- 🟡 **Sequential await** in independent iterations → \`Promise.all\`.
- 🟡 **Token-budget gaps** → ensure every LLM call goes through unified-llm-client (which honours the budget).
- 🟢 **Big files** → split candidates; cross-reference with \`anti-patterns.md\`.

## Cadence

Quarterly via \`pnpm run anton:investigate -- --pattern performance\`.
EOF
