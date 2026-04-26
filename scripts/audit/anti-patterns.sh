#!/usr/bin/env bash
# anti-patterns.sh — Pattern G.5
# Detects services bypassing established paths, schema duplication, god-services.

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Architecture Anti-Patterns

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.5

EOF

echo "## 1. Services bypassing \`unified-llm-client\` / \`claude-client\`"
echo ""
echo "Services that call provider SDKs directly instead of routing through the unified entry. Suspicious — should use \`unified-llm-client\` for adapter dispatch + caching."
echo ""
echo '```'
grep -rln "anthropic\.messages\.create\|openai\.chat\.completions" server/services/ --include="*.ts" 2>/dev/null \
  | grep -v node_modules \
  | grep -vE "(claude-client|adapters/|unified-llm-client|model-adapter|iterative-reasoning)" \
  | head -15 || echo "(none — clean!)"
echo '```'

echo ""
echo "## 2. Services bypassing \`prompt-builder\`"
echo ""
echo "Files that assemble system prompts inline instead of going through \`prompt-builder.ts\`. Some are legitimate (school-prompt-builder, market-specific assemblers), others may be drift."
echo ""
echo '```'
grep -rln "buildSystemPrompt\b" server/services/ --include="*.ts" 2>/dev/null \
  | grep -v "prompt-builder" | head -15 || echo "(none — clean!)"
echo '```'

echo ""
echo "## 3. Most-imported services (god-service candidates)"
echo ""
echo "Top 15 services by import count. Heavy import counts may justify a split."
echo ""
echo '```'
grep -rh "from.*services/" server/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v node_modules \
  | sed -E "s|.*services/([^'\"]+)['\"].*|\1|" \
  | sort | uniq -c | sort -rn | head -15
echo '```'

echo ""
echo "## 4. Duplicated table-name candidates"
echo ""
echo "CREATE TABLE statements where the same name appears in multiple migrations (potential schema confusion or unintentional re-creation)."
echo ""
echo '```'
grep -h "CREATE TABLE" server/db/migrations-pg/*.sql 2>/dev/null \
  | sed -E "s/CREATE TABLE( IF NOT EXISTS)?[[:space:]]+([a-z_0-9]+).*/\2/i" \
  | sort | uniq -c | awk '$1 > 1' | head -20 || echo "(none — clean!)"
echo '```'

echo ""
echo "## 5. Routes without obvious auth / rate-limit"
echo ""
echo "Route files that don't reference auth or rate-limit middleware. Some are intentionally public (visitor surfaces); audit each before assuming a bug."
echo ""
echo '```'
for r in server/routes/*.ts; do
  name=$(basename "$r")
  if ! grep -qE "requireAuth|ensureAuth|rateLimit|rate-limit|auth-middleware|getAuthHeader" "$r" 2>/dev/null; then
    echo "$name"
  fi
done | head -20
echo '```'

echo ""
echo "## Cadence"
echo ""
echo "Quarterly via \`pnpm run anton:investigate -- --pattern anti\`."
