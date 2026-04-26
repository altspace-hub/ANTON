#!/usr/bin/env bash
# test-coverage.sh — Pattern F.1
# Lists services with no corresponding test file, weighted by import count
# (services others depend on most are highest priority to test).

set -uo pipefail
cd "$(dirname "$0")/../.."

DATE="$(date -u +%Y-%m-%d)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat <<EOF
# Test Coverage Gaps

**Generated:** ${DATE} UTC
**Commit:** \`${SHA}\`
**Pattern:** F.1

Services with no \`<basename>.test.ts\` anywhere under \`tests/\`. Weighted by
how many other server/src files import them — the more imports, the higher
the priority to add tests.

## Top 20 untested services (by import count — highest priority first)

| Service | Imports | Suggested test |
|---|---|---|
EOF

for svc in $(find server/services -name "*.ts" -not -name "*.test.ts" 2>/dev/null); do
  base=$(basename "$svc" .ts)
  if grep -rln "${base}.test.ts" tests/ >/dev/null 2>&1; then continue; fi
  imports=$(grep -rln --include="*.ts" --include="*.tsx" "/${base}\b" server/ src/ 2>/dev/null | wc -l | tr -d ' ')
  echo "${imports}|${base}|${svc}"
done | sort -t'|' -k1 -rn | head -20 | awk -F'|' '{
  printf "| `%s` | %d | tests/services/%s.test.ts |\n", $2, $1, $2
}'

cat <<EOF

## What to do

- The top entries are the highest-leverage tests — they're the services everything else depends on.
- Aim for coverage of public-API (\`export\`) surfaces; private helpers can wait.
- A single contract test per service often beats five edge-case tests per service.

## Cadence

Monthly via \`pnpm run anton:investigate -- --pattern test-coverage\`.
EOF
