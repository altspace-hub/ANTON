#!/usr/bin/env bash
# drift-report.sh — Pattern G.1
# Detects divergence between code reality and documented claims.
# Compares canonical counts (areas, modules, services, routes, pages, tables,
# bundle types) against numbers cited in CLAUDE.md, _audit-notes.md, and the
# architecture diagrams.
#
# Severity: high (>50% drift or pillar/architecture change), medium (20–50%),
# low (10–20%).

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

# Live counts
AREAS_NOW=$(ls -d server/areas/*/ 2>/dev/null | wc -l | tr -d ' ')
SERVICES_NOW=$(find server/services -name "*.ts" -not -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
ROUTES_NOW=$(ls server/routes/*.ts 2>/dev/null | wc -l | tr -d ' ')
PAGES_NOW=$(find src/pages -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
MIGRATIONS_NOW=$(ls server/db/migrations-pg/*.sql 2>/dev/null | wc -l | tr -d ' ')
MODULES_NOW=$(grep -c "id: '" src/lib/constants.ts 2>/dev/null || echo 0)
BUNDLE_TYPES_NOW=$(grep -cE "^\s*\| '" server/services/anton-bundler.ts 2>/dev/null || echo 0)
TABLES_NOW=$(grep -h "CREATE TABLE" server/db/migrations-pg/*.sql server/db/schema.sql 2>/dev/null | sed -E "s/CREATE TABLE( IF NOT EXISTS)?[[:space:]]+([a-z_0-9]+).*/\2/i" | sort -u | wc -l | tr -d ' ')

cat <<EOF
# Drift Report

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** G.1 (drift detection)

This report compares live code counts against figures claimed in CLAUDE.md,
\`/docs/architecture/_audit-notes.md\`, and the architecture diagrams. Drift
above 10% surfaces here; severity escalates with magnitude.

## Live counts

| Metric | Live value |
|---|---|
| Areas | ${AREAS_NOW} |
| Services (recursive) | ${SERVICES_NOW} |
| Routes | ${ROUTES_NOW} |
| Frontend pages | ${PAGES_NOW} |
| PG migrations | ${MIGRATIONS_NOW} |
| Modules in \`constants.ts\` | ${MODULES_NOW} |
| Bundle types in \`anton-bundler.ts\` | ${BUNDLE_TYPES_NOW} |
| Unique tables (schema + migrations) | ${TABLES_NOW} |

## Comparison vs. documented claims

| Claim source | Metric | Claim | Live | Δ% | Severity |
|---|---|---|---|---|---|
EOF

compare() {
  local source="$1" metric="$2" claim="$3" live="$4"
  if [[ "$claim" -eq 0 ]]; then echo "| ${source} | ${metric} | ${claim} | ${live} | — | (no claim) |"; return; fi
  local delta=$(( ((live - claim) * 100) / claim ))
  local abs_delta=${delta#-}
  local sev="ok"
  if [[ $abs_delta -gt 50 ]]; then sev="🔴 high"
  elif [[ $abs_delta -gt 20 ]]; then sev="🟡 medium"
  elif [[ $abs_delta -gt 10 ]]; then sev="🟢 low"
  else sev="✅ within 10%"; fi
  echo "| ${source} | ${metric} | ${claim} | ${live} | ${delta}% | ${sev} |"
}

# CLAUDE.md claims
compare "CLAUDE.md" "Areas (Work pillar)" 59 "$AREAS_NOW"
compare "CLAUDE.md" "Modules" 263 "$MODULES_NOW"
compare "_audit-notes.md (original)" "Services" 221 "$SERVICES_NOW"
compare "_audit-notes.md" "Routes" 151 "$ROUTES_NOW"
compare "_audit-notes.md" "Pages" 251 "$PAGES_NOW"
compare "_audit-notes.md" "Migrations" 121 "$MIGRATIONS_NOW"
compare "32-anton-bundle-format.md" "Bundle types" 45 "$BUNDLE_TYPES_NOW"
compare "20-database-schema.md" "Unique tables" 289 "$TABLES_NOW"

# v3 whitepaper claims (from brief)
compare "Improvement Brief §0" "Pillars (whitepaper claim)" 3 12
compare "Improvement Brief §0" "Bundle types (whitepaper)" 17 "$BUNDLE_TYPES_NOW"

cat <<EOF

## What to do with this

- **🔴 High** — re-baseline the documentation, surface to Daniel immediately, may require a re-architecture review.
- **🟡 Medium** — schedule a documentation update in the next sprint.
- **🟢 Low** — log; bundle into the next routine doc refresh.

## Cadence

Run weekly via \`pnpm run anton:investigate -- --pattern drift\`.

EOF
